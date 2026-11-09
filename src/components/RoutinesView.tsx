import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns'
import { AlertTriangle, Bot, CalendarClock, CircleAlert, CircleCheck, CircleSlash, CircleX, Clock, ExternalLink, FileText, Loader2, Pause, Play, Power, RefreshCw, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { dfLocale, isEn, t } from '../lib/i18n'
import { cronHuman, parseRoutines, slotState, SOURCE_LABEL, timesOn, type Routine, type RoutineSource, type RoutinesData, type SlotState } from '../lib/routines'
import { useNow } from '../hooks'
import { useStore } from '../store'
import { ROTINAS } from '../lib/rotinas'
import { Button, cn, Empty, IconButton, SectionTitle, Tooltip } from './ui'

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-1.5', className)}>{children}</section>
}

function when(iso?: string) {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const hm = isEn() ? format(d, 'h:mm a') : format(d, "H'h'mm").replace(/h00$/, 'h')
  if (isToday(d)) return t(`hoje ${hm}`, `today ${hm}`)
  if (isTomorrow(d)) return t(`amanhã ${hm}`, `tomorrow ${hm}`)
  return `${format(d, isEn() ? 'EEE, MMM d' : "EEE d 'de' MMM", { locale: dfLocale() })} ${hm}`
}

function ago(iso?: string) {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const x = formatDistanceToNowStrict(d, { locale: dfLocale() })
  return t(`há ${x}`, `${x} ago`)
}

const SOURCE_COLOR: Record<RoutineSource, string> = {
  planos: 'bg-accent',
  claude: 'bg-[#d97757]',
  hermes: 'bg-emerald-500',
  openbot: 'bg-sky-500',
}

function SourceDot({ source, dim }: { source: RoutineSource; dim?: boolean }) {
  return <span className={cn('inline-block h-2 w-2 flex-none rounded-full', SOURCE_COLOR[source], dim && 'opacity-30')} />
}

function RoutineRow({ r, onAction, busy }: { r: Routine; onAction: (r: Routine) => void; busy: boolean }) {
  const next = when(r.nextRun)
  const last = ago(r.lastRun)
  return (
    <div className={cn('group flex items-start gap-3 rounded-[8px] px-2 py-2.5 hover:bg-[var(--bg-hover)]', !r.enabled && 'opacity-60')}>
      <div className="pt-[5px]">
        <SourceDot source={r.source} dim={!r.enabled} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium">{r.name}</span>
          {!r.enabled && <span className="rounded-full bg-[var(--bg-active)] px-1.5 text-[11px] text-[var(--text-2)]">{r.source === 'planos' ? t('desligada', 'off') : t('pausada', 'paused')}</span>}
          {r.lastStatus === 'erro' && <span className="rounded-full bg-rose-500/12 px-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">{t('falhou', 'failed')}</span>}
        </div>
        <div className="mt-0.5 text-[12.5px] text-[var(--text-2)]">
          {r.cron ? cronHuman(r.cron) : t('sem agenda', 'no schedule')}
          {r.enabled && next && <span className="text-[var(--text-3)]"> · {t('próxima', 'next')} {next}</span>}
          {last && <span className="text-[var(--text-3)]"> · {t('última', 'last')} {last}</span>}
        </div>
        {r.what && <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--text-3)]">{r.what}</div>}
        {r.lastError && <div className="mt-1 line-clamp-2 font-mono text-[11.5px] text-rose-600 dark:text-rose-400">{r.lastError}</div>}
      </div>
      <div className="flex flex-none items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
        {r.output && (
          <IconButton label={t('Última saída', 'Last output')} onClick={() => api.openExternalPath(r.output!).catch((e) => toast.error(String(e)))}>
            <FileText size={14} />
          </IconButton>
        )}
        {r.file && (
          <IconButton label={t('Instruções (SKILL.md)', 'Instructions (SKILL.md)')} onClick={() => api.openExternalPath(r.file!).catch((e) => toast.error(String(e)))}>
            <ExternalLink size={14} />
          </IconButton>
        )}
        {r.source === 'hermes' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(r)}>
            {r.enabled ? <Pause size={13} /> : <Play size={13} />} {r.enabled ? t('Pausar', 'Pause') : t('Retomar', 'Resume')}
          </Button>
        )}
      </div>
    </div>
  )
}

interface Slot {
  min: number
  r: Routine
  state?: SlotState
}

const hm = (ms: number) => format(new Date(ms), 'HH:mm')

/** selo do que aconteceu no horário: rodou, precisa de você, falhou, pulou, não rodou */
function SlotBadge({ state }: { state: SlotState }) {
  const base = 'flex flex-none items-center gap-1 text-[11.5px]'
  if (state.kind === 'faltou')
    return (
      <span className={cn(base, 'text-rose-600 dark:text-rose-400')}>
        <CircleSlash size={12} /> {t('não rodou', "didn't run")}
      </span>
    )
  if (state.kind === 'esperando')
    return (
      <span className={cn(base, 'text-[var(--text-3)]')}>
        <Clock size={12} /> {t('aguardando', 'waiting')}
      </span>
    )
  if (state.kind === 'pulou')
    return (
      <span className={cn(base, state.blocker?.status === 'atencao' ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-3)]')}>
        <SkipForward size={12} /> {t('pulou', 'skipped')}
        {state.blocker ? t(` · ${hm(state.blocker.at)} ainda aberta`, ` · ${hm(state.blocker.at)} still open`) : ''}
      </span>
    )
  const { run } = state
  if (run.status === 'rodando')
    return (
      <span className={cn(base, 'text-accent')}>
        <Loader2 size={12} className="animate-spin" /> {t(`rodando desde ${hm(run.at)}`, `running since ${hm(run.at)}`)}
      </span>
    )
  if (run.status === 'erro')
    return (
      <span className={cn(base, 'text-rose-600 dark:text-rose-400')}>
        <CircleX size={12} /> {t(`falhou ${hm(run.at)}`, `failed ${hm(run.at)}`)}
      </span>
    )
  if (run.status === 'atencao')
    return (
      <span className={cn(base, 'text-amber-600 dark:text-amber-400')}>
        <CircleAlert size={12} /> {t(`começou ${hm(run.at)} · não terminou`, `started ${hm(run.at)} · didn't finish`)}
      </span>
    )
  return (
    <span className={cn(base, 'text-emerald-600 dark:text-emerald-400')}>
      <CircleCheck size={12} /> {t(`rodou ${hm(run.at)}`, `ran ${hm(run.at)}`)}
    </span>
  )
}

function slotHint(state: SlotState) {
  if (state.kind === 'faltou') return t('Nenhuma execução neste horário (o Mac estava dormindo ou o app do Claude fechado?)', 'No run at this time (was the Mac asleep or the Claude app closed?)')
  if (state.kind === 'esperando') return t('Ainda não começou; o Claude roda as tarefas atrasadas quando o Mac acorda.', "Hasn't started yet; Claude runs overdue tasks when the Mac wakes up.")
  if (state.kind === 'pulou') {
    const b = state.blocker
    if (!b) return t('O Claude pulou: a execução anterior ainda estava aberta.', 'Claude skipped it: the previous run was still open.')
    const day = isToday(new Date(b.at)) ? '' : `${format(new Date(b.at), isEn() ? 'EEE M/d' : 'EEE d/MM', { locale: dfLocale() })} `
    return t(
      `O Claude pulou porque a execução de ${day}${hm(b.at)} ainda está aberta${b.status === 'atencao' ? ' e parada' : ''}. Clique para abrir e terminar ou fechar.`,
      `Claude skipped it because the ${day}${hm(b.at)} run is still open${b.status === 'atencao' ? ' and stalled' : ''}. Click to open it and finish or close it.`,
    )
  }
  const open = state.run.session ? t(' · clique para abrir a sessão', ' · click to open the session') : ''
  return (state.run.detail ?? t('Rodou', 'Ran')) + open
}

function Timeline({ routines, now }: { routines: Routine[]; now: Date }) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const at = (min: number) => new Date(day.getTime() + min * 60e3)
  const slots: Slot[] = routines
    .filter((r) => r.enabled && r.cron)
    .flatMap((r) => {
      const mins = timesOn(r.cron!, now)
      return mins.map((min, i) => ({ min, r, state: slotState(r, at(min), mins[i + 1] !== undefined ? at(mins[i + 1]) : undefined, now) }))
    })
    .sort((a, b) => a.min - b.min)
  if (!slots.length) return <div className="px-2 py-3 text-[13px] text-[var(--text-3)]">{t('Nada agendado para hoje.', 'Nothing scheduled for today.')}</div>
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nextIdx = slots.findIndex((s) => s.min > nowMin)
  return (
    <div className="relative py-1">
      {slots.map((s, i) => {
        const past = s.min <= nowMin
        const session = s.state?.kind === 'rodou' ? s.state.run.session : s.state?.kind === 'pulou' ? s.state.blocker?.session : undefined
        const row = (
          <div
            onClick={session ? () => api.openClaudeSession(session).catch((e) => toast.error(String(e))) : undefined}
            className={cn('flex h-8 items-center gap-3 rounded-[7px] px-2', session && 'cursor-pointer hover:bg-[var(--bg-hover)]')}
          >
            <span className={cn('w-11 text-right text-[12.5px] tabular-nums', past ? 'text-[var(--text-3)]' : 'text-[var(--text-2)]')}>
              {String(Math.floor(s.min / 60)).padStart(2, '0')}:{String(s.min % 60).padStart(2, '0')}
            </span>
            <SourceDot source={s.r.source} dim={past} />
            <span className={cn('truncate text-[13px]', past && 'text-[var(--text-2)]')}>{s.r.name}</span>
            <span className="ml-auto flex flex-none items-center">
              {s.state ? <SlotBadge state={s.state} /> : <span className="text-[11.5px] text-[var(--text-3)]">{s.r.source === 'claude' ? 'Claude' : SOURCE_LABEL[s.r.source].split(' ')[0]}</span>}
            </span>
          </div>
        )
        return (
          <div key={`${s.r.source}-${s.r.id}-${s.min}`}>
            {i === nextIdx && (
              <div className="my-1 flex items-center gap-2 px-2">
                <span className="w-11 text-right text-[11px] font-semibold tabular-nums text-accent">{format(now, 'HH:mm')}</span>
                <span className="h-px flex-1 bg-accent/50" />
                <span className="text-[11px] font-medium text-accent">{t('agora', 'now')}</span>
              </div>
            )}
            {s.state ? (
              <Tooltip label={<span className="block max-w-[320px] whitespace-normal">{slotHint(s.state)}</span>} side="top">
                {row}
              </Tooltip>
            ) : (
              row
            )}
          </div>
        )
      })}
      {nextIdx === -1 && (
        <div className="mt-1 flex items-center gap-2 px-2">
          <span className="w-11" />
          <span className="text-[11.5px] text-[var(--text-3)]">{t('Nada mais hoje.', 'Nothing else today.')}</span>
        </div>
      )}
    </div>
  )
}

export function RoutinesView() {
  const now = useNow()
  const [data, setData] = useState<RoutinesData | null>(null)
  const [onlyPlanning, setOnlyPlanning] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setData(parseRoutines(await api.loadRoutines()))
    } catch (e) {
      toast.error(t('Não consegui ler as rotinas', "Couldn't read the routines"), { description: String(e) })
    }
  }, [])

  // relê a cada minuto: a linha do tempo mostra execuções que acabaram de rodar
  useEffect(() => {
    reload()
  }, [reload, now])

  const routines = useMemo(() => (data?.routines ?? []).filter((r) => !onlyPlanning || r.planning), [data, onlyPlanning])

  async function hermesToggle(r: Routine) {
    setBusy(true)
    try {
      await api.hermesCron(r.enabled ? 'pause' : 'resume', r.id)
      toast.success(r.enabled ? t(`${r.name} pausada no Hermes`, `${r.name} paused in Hermes`) : t(`${r.name} retomada no Hermes`, `${r.name} resumed in Hermes`))
      await reload()
    } catch (e) {
      toast.error(t('O Hermes recusou', 'Hermes refused'), { description: String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function pauseHermesPlanning() {
    setBusy(true)
    try {
      for (const r of hermesPlanning) await api.hermesCron('pause', r.id)
      toast.success(t('Rotinas do Hermes pausadas', 'Hermes routines paused'), { description: t('Dá para retomar aqui mesmo.', 'You can resume them right here.') })
      await reload()
    } catch (e) {
      toast.error(t('O Hermes recusou', 'Hermes refused'), { description: String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function planosToggle(on: boolean) {
    setBusy(true)
    try {
      await api.planosSchedule(on)
      toast.success(on ? t('Rotinas do Letco ligadas', 'Letco routines on') : t('Rotinas do Letco desligadas', 'Letco routines off'))
      await reload()
    } catch (e) {
      toast.error(t('Não consegui mudar as rotinas', "Couldn't change the routines"), { description: String(e) })
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="h-full" />

  const all = data.routines
  const hermesPlanning = all.filter((r) => r.source === 'hermes' && r.planning && r.enabled)
  const planosOn = all.some((r) => r.source === 'planos' && r.enabled)
  const bySource = (['planos', 'claude', 'hermes'] as RoutineSource[]).map((s) => ({ s, items: routines.filter((r) => r.source === s) }))
  const brief = data.openbotFiles.slice().sort((a, b) => b.mtime - a.mtime)
  const active = all.filter((r) => r.enabled).length

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="flex items-end gap-3 pb-6 pt-2">
        <div className="flex-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('Rotinas', 'Routines')}</h1>
          <p className="mt-1 text-[13.5px] text-[var(--text-2)]">
            {active === 1 ? t(`${active} agendamento ativo neste Mac`, `${active} active schedule on this Mac`) : t(`${active} agendamentos ativos neste Mac`, `${active} active schedules on this Mac`)}
            {data.hermesAlive ? t(' · Hermes rodando', ' · Hermes running') : ''}.{' '}
            {t('Só leitura: pausar e ligar usam o comando de cada ferramenta.', "Read-only: pausing and turning on use each tool's own command.")}
          </p>
        </div>
        <div className="flex rounded-[8px] bg-[var(--bg-hover)] p-0.5">
          {[
            [false, t('Todas', 'All')],
            [true, t('Só planos', 'Plans only')],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              onClick={() => setOnlyPlanning(v as boolean)}
              className={cn(
                'h-7 rounded-[6px] px-2.5 text-[12.5px]',
                onlyPlanning === v ? 'bg-[var(--bg)] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)]' : 'text-[var(--text-2)]',
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
        <Tooltip label={t('Ler de novo', 'Reload')}>
          <IconButton label={t('Ler de novo', 'Reload')} onClick={reload}>
            <RefreshCw size={14} />
          </IconButton>
        </Tooltip>
      </header>

      {hermesPlanning.length > 0 && (
        <Card className="mb-4 flex items-start gap-3 border-amber-500/40 bg-amber-500/8 px-3 py-3">
          <AlertTriangle size={16} className="mt-0.5 flex-none text-amber-600 dark:text-amber-400" />
          <div className="flex-1 text-[13px] leading-snug">
            <div className="font-medium">{t('O Hermes ainda revisa o Plane', 'Hermes still reviews Plane')}</div>
            <div className="mt-0.5 text-[var(--text-2)]">
              {hermesPlanning.map((r) => r.name).join(t(' e ', ' and '))}{' '}
              {hermesPlanning.length === 1
                ? t(
                    'roda nos dias úteis sobre o sistema antigo. Pelo plano, saem de cena depois da migração; o Letco já faz a lista do dia.',
                    'runs on weekdays against the old system. Per the plan, it goes away after the migration; Letco already makes the daily list.',
                  )
                : t(
                    'rodam nos dias úteis sobre o sistema antigo. Pelo plano, saem de cena depois da migração; o Letco já faz a lista do dia.',
                    'run on weekdays against the old system. Per the plan, they go away after the migration; Letco already makes the daily list.',
                  )}
            </div>
          </div>
          <Button size="sm" disabled={busy} onClick={pauseHermesPlanning}>
            <Pause size={13} /> {hermesPlanning.length === 1 ? t('Pausar a rotina', 'Pause the routine') : t(`Pausar as ${hermesPlanning.length}`, `Pause all ${hermesPlanning.length}`)}
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-5">
        <RotinasDoLetco instaladas={new Set(all.filter((r) => r.source === 'claude').map((r) => r.id))} />

        <div>
          <SectionTitle icon={<CalendarClock size={14} />}>{t('Hoje', 'Today')}, {format(now, 'EEEE', { locale: dfLocale() })}</SectionTitle>
          <Card>
            <Timeline routines={routines} now={now} />
          </Card>
        </div>

        {bySource.map(({ s, items }) =>
          !items.length && s !== 'planos' ? null : (
            <div key={s}>
              <SectionTitle
                icon={<SourceDot source={s} />}
                count={items.length}
                right={
                  s === 'planos' ? (
                    <Button size="sm" variant={planosOn ? 'ghost' : 'secondary'} disabled={busy} onClick={() => planosToggle(!planosOn)}>
                      <Power size={13} /> {planosOn ? t('Desligar', 'Turn off') : t('Ligar', 'Turn on')}
                    </Button>
                  ) : undefined
                }
              >
                {SOURCE_LABEL[s]}
              </SectionTitle>
              <Card>
                {s === 'planos' && !planosOn && (
                  <div className="px-2 pb-1 pt-2 text-[12.5px] text-[var(--text-3)]">
                    {t(
                      'Opcional: a tarefa "Planos: lista do dia" do Claude já gera o hoje.md. Ligue se quiser o arquivo atualizado mesmo com o app do Claude fechado.',
                      'Optional: Claude\'s "Planos: lista do dia" task already generates hoje.md. Turn this on if you want the file updated even with the Claude app closed.',
                    )}
                  </div>
                )}
                {items.map((r) => (
                  <RoutineRow key={r.id} r={r} busy={busy} onAction={hermesToggle} />
                ))}
              </Card>
            </div>
          ),
        )}

        {data.openbotInstalled && !onlyPlanning && (
          <div>
            <SectionTitle icon={<SourceDot source="openbot" />}>{SOURCE_LABEL.openbot}</SectionTitle>
            <Card className="flex items-start gap-3 px-3 py-3">
              <Bot size={16} className="mt-0.5 flex-none text-[var(--text-3)]" />
              <div className="flex-1 text-[13px] leading-snug text-[var(--text-2)]">
                {t(
                  'As rotinas do OpenBot ficam guardadas dentro do app dele. Pela regra do plano, o Letco não abre o banco interno de outros apps; aqui aparece só o que ele escreve em',
                  "OpenBot's routines are stored inside its own app. Per the plan's rule, Letco doesn't open other apps' internal databases; this only shows what it writes to",
                )}{' '}
                <code>~/OpenBot/Shared/Planos</code>.
                {brief.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => api.openExternalPath(f.path).catch((e) => toast.error(String(e)))}
                    className="mt-1.5 flex items-center gap-1.5 text-[var(--text)] hover:text-accent"
                  >
                    <FileText size={13} /> {f.path.split('/').pop()}
                    <span className="text-[var(--text-3)]">· {ago(new Date(f.mtime).toISOString())}</span>
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => api.openExternalPath('/Applications/OpenBot.app').catch((e) => toast.error(String(e)))}>
                {t('Abrir OpenBot', 'Open OpenBot')}
              </Button>
            </Card>
          </div>
        )}

        {!all.length && (
          <Empty icon={<CalendarClock size={28} />} title={t('Nenhuma rotina encontrada', 'No routines found')}>
            {t('Nem o Claude, nem o Hermes, nem o comando planos têm agendamentos neste Mac.', 'Neither Claude, Hermes nor the planos command has schedules on this Mac.')}
          </Empty>
        )}
      </div>
    </div>
  )
}

/** quais das rotinas do Letco já existem no app do Claude, com o botão para pedir as que faltam */
function RotinasDoLetco({ instaladas }: { instaladas: Set<string> }) {
  const instalarRotinas = useStore((s) => s.instalarRotinas)
  const faltam = ROTINAS.filter((r) => !instaladas.has(r.id))
  const n = ROTINAS.length - faltam.length
  // nenhuma ainda: só as principais (Discord e divulgação dependem de configuração)
  const pedir = n ? faltam : faltam.filter((r) => r.padrao)
  return (
    <Card className="flex items-start gap-3 px-4 py-3">
      <Bot size={16} className="mt-0.5 flex-none text-[var(--text-2)]" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <div className="font-medium">
          {t(`Rotinas do Letco: ${n} de ${ROTINAS.length} no Claude`, `Letco routines: ${n} of ${ROTINAS.length} in Claude`)}
        </div>
        <div className="mt-0.5 text-[var(--text-2)]">
          {faltam.length
            ? t(
                `Faltam: ${faltam.map((r) => r.titulo.replace('Letco: ', '')).join(', ')}. O Claude cria cada uma como tarefa agendada.`,
                `Missing: ${faltam.map((r) => r.titulo.replace('Letco: ', '')).join(', ')}. Claude creates each one as a scheduled task.`,
              )
            : t('Todas instaladas. O texto de cada uma sai de planos rotina <id>.', 'All installed. The text for each comes from planos rotina <id>.')}
        </div>
      </div>
      {faltam.length > 0 && (
        <Button size="sm" onClick={() => instalarRotinas(pedir.map((r) => r.id))}>
          {n ? t('Instalar as que faltam', 'Install the missing ones') : t(`Instalar as ${pedir.length} principais`, `Install the ${pedir.length} main ones`)}
        </Button>
      )}
    </Card>
  )
}
