import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ChevronRight, NotebookText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { parseDay, todayISO } from '../lib/dates'
import { dfLocale, isEn, t } from '../lib/i18n'
import { METRICAS, parseResumo, resumoConsolePrompt, type Metricas, type Resumo } from '../lib/resumo'
import { useStore } from '../store'
import { Markdown } from './Markdown'
import { Button, cn, Empty, SectionTitle } from './ui'

function dayTitle(date: string) {
  const d = parseDay(date)
  if (!d) return date
  const s = format(d, isEn() ? 'EEEE, MMMM d' : "EEEE, d 'de' MMMM", { locale: dfLocale() })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** média dos dias anteriores, para dizer se o número do dia ficou acima ou abaixo */
function media(prev: Resumo[], key: keyof Metricas) {
  const vals = prev.map((r) => r.metricas[key]).filter((v): v is number => typeof v === 'number')
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
}

function Numeros({ r, prev }: { r: Resumo; prev: Resumo[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {METRICAS.map(({ key, label }) => {
        const v = r.metricas[key] ?? 0
        const m = media(prev, key)
        const diff = m === undefined ? undefined : Math.round((v - m) * 10) / 10
        return (
          <div key={key} className="rounded-[10px] border border-[var(--border)] px-3 py-2">
            <div className="text-[19px] font-semibold tabular-nums leading-tight">
              {v}
              {key === 'tarefas_feitas' && r.metricas.tarefas_total !== undefined && <span className="text-[13px] font-normal text-[var(--text-3)]"> {t('de', 'of')} {r.metricas.tarefas_total}</span>}
            </div>
            <div className="text-[11.5px] text-[var(--text-3)]">
              {label}
              {diff !== undefined && Math.abs(diff) >= 0.5 && (
                <span className={cn('ml-1', diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-3)]')} title={t(`média dos ${prev.length} dias anteriores: ${m!.toFixed(1)}`, `average of the previous ${prev.length} ${prev.length === 1 ? 'day' : 'days'}: ${m!.toFixed(1)}`)}>
                  {diff > 0 ? '+' : '−'}
                  {isEn() ? String(Math.abs(diff)) : String(Math.abs(diff)).replace('.', ',')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Corpo({ r }: { r: Resumo }) {
  return <Markdown className="text-[13.5px] [&_h2]:mt-5 [&_h2]:text-[15px] [&_h3]:text-[13.5px]">{r.body.replace(/^\*\*Em uma frase:\*\*.*\n?/m, '')}</Markdown>
}

export function ResumosView() {
  const [resumos, setResumos] = useState<Resumo[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const root = useStore((s) => s.env?.root ?? '~/planos')
  const sendToConsole = useStore((s) => s.sendToConsole)

  const reload = useCallback(async () => {
    try {
      const raw = await api.loadResumos()
      setResumos(raw.map(([f, c]) => parseResumo(f, c)).sort((a, b) => b.date.localeCompare(a.date)))
    } catch (e) {
      toast.error(t('Não consegui ler os resumos', "Couldn't read the summaries"), { description: String(e) })
    }
  }, [])

  useEffect(() => {
    reload()
    let off: (() => void) | undefined
    api.onChange(reload).then((u) => (off = u))
    return () => off?.()
  }, [reload])

  const [ultimo, ...antes] = resumos ?? []
  const hoje = todayISO()

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="flex items-end gap-3 pb-6 pt-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('Resumos', 'Summaries')}</h1>
          <p className="mt-1.5 text-[13.5px] text-[var(--text-2)]">
            {t(
              'O que foi feito no dia, nos planos, nas tarefas e no GitHub, com os números comparados aos dias anteriores.',
              'What got done each day across plans, tasks and GitHub, with the numbers compared to previous days.',
            )}
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-3)]">{t('A rotina escreve o resumo todos os dias às 19h e avisa no Mac.', 'The routine writes the summary every day at 7 PM and notifies you on the Mac.')}</p>
        </div>
        <Button size="sm" onClick={() => sendToConsole(resumoConsolePrompt(root, hoje))}>
          <RefreshCw size={13} /> {ultimo?.date === hoje ? t('Refazer o de hoje', "Redo today's") : t('Gerar o de hoje', "Generate today's")}
        </Button>
      </header>

      {resumos && !resumos.length && (
        <Empty icon={<NotebookText size={28} />} title={t('Nenhum resumo ainda', 'No summaries yet')}>
          {t('O primeiro sai hoje às 19h. Para ver agora, use "Gerar o de hoje".', 'The first one comes out today at 7 PM. To see it now, use "Generate today\'s".')}
        </Empty>
      )}

      {ultimo && (
        <section className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-5 py-4">
          <div className="text-[12px] font-medium text-[var(--text-3)]">{ultimo.date === hoje ? t('Hoje', 'Today') : t('Último resumo', 'Latest summary')}</div>
          <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.01em]">{dayTitle(ultimo.date)}</h2>
          {ultimo.frase && <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-2)]">{ultimo.frase}</p>}
          <div className="mt-4">
            <Numeros r={ultimo} prev={antes.slice(0, 7)} />
          </div>
          <div className="mt-2">
            <Corpo r={ultimo} />
          </div>
        </section>
      )}

      {antes.length > 0 && (
        <>
          <div className="mt-8">
            <SectionTitle>{t('Dias anteriores', 'Previous days')}</SectionTitle>
          </div>
          <div className="flex flex-col gap-1">
            {antes.map((r, i) => {
              const aberto = open === r.date
              return (
                <div key={r.date} className="rounded-[10px] border border-transparent hover:border-[var(--border)] data-[open=true]:border-[var(--border)]" data-open={aberto}>
                  <button onClick={() => setOpen(aberto ? null : r.date)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left">
                    <ChevronRight size={14} className={cn('mt-[3px] flex-none text-[var(--text-3)] transition-transform', aberto && 'rotate-90')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium">{dayTitle(r.date)}</div>
                      {r.frase && <div className="mt-0.5 text-[12.5px] text-[var(--text-2)]">{r.frase}</div>}
                    </div>
                    <div className="flex-none text-[12px] tabular-nums text-[var(--text-3)]">
                      {r.metricas.tarefas_feitas ?? 0} {r.metricas.tarefas_feitas === 1 ? t('tarefa', 'task') : t('tarefas', 'tasks')} · {r.metricas.prs_mergeados ?? 0} {r.metricas.prs_mergeados === 1 ? 'PR' : 'PRs'}
                    </div>
                  </button>
                  {aberto && (
                    <div className="px-3 pb-4 pl-8">
                      <Numeros r={r} prev={antes.slice(i + 1, i + 8)} />
                      <div className="mt-2">
                        <Corpo r={r} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
