import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, ArrowLeft, Bot, Calendar, ChevronDown, ExternalLink, FileText, FolderGit2, FolderOpen, MoreHorizontal,
  Pencil, Plus, Trash2, User, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePlanById, useStore } from '../store'
import type { Plan, Prioridade, Status } from '../lib/types'
import { PRIORIDADES, STATUSES } from '../lib/types'
import { addItem, addPhase, normalize, progress, removePhase, renamePhase, sections, setFields, toggleLine, togglePhase } from '../lib/plan'
import { relativeAge, shortDate } from '../lib/dates'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { headingLabel, Markdown } from './Markdown'
import {
  Button, cn, DueBadge, IconButton, Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger,
  PRIO_LABEL, PriorityIcon, ProjectDot, STATUS_META, StatusIcon, Tooltip,
} from './ui'
import { FileViewer } from './FileViewer'
import { ParaVoceCard } from './ParaVoce'

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[32px] items-center">
      <div className="w-[104px] flex-none text-[12.5px] text-[var(--text-3)]">{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function PropButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-2 rounded-[6px] px-2 text-[13px] hover:bg-[var(--bg-hover)] data-[state=open]:bg-[var(--bg-active)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

function InlineInput({
  value,
  onCommit,
  placeholder,
  className,
  autoFocus,
  onCancel,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onCancel?: () => void
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      value={v}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v !== value ? onCommit(v.trim()) : onCancel?.())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value)
          onCancel?.()
          ;(e.target as HTMLInputElement).blur()
        }
        e.stopPropagation()
      }}
      className={cn('w-full bg-transparent outline-none placeholder:text-[var(--text-3)]', className)}
    />
  )
}

function Phases({ plan }: { plan: Plan }) {
  const savePlan = useStore((s) => s.savePlan)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const prog = progress(plan)

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-[12.5px] font-semibold text-[var(--text-2)]">{t('Fases', 'Phases')}</h2>
        <span className="text-[12px] tabular-nums text-[var(--text-3)]">
          {prog.done} {t('de', 'of')} {prog.total}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-active)]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${prog.pct * 100}%` }} />
        </div>
        <span className="w-9 text-right text-[12px] tabular-nums text-[var(--text-3)]">{Math.round(prog.pct * 100)}%</span>
      </div>

      <div className="rounded-[12px] border border-[var(--border)] p-1">
        {plan.phases.map((f, i) => (
          <div key={f.line + f.name} className="group flex min-h-[38px] items-center gap-3 rounded-[8px] px-2.5 hover:bg-[var(--bg-hover)]">
            <input
              type="checkbox"
              className="check"
              checked={f.done}
              onChange={() => savePlan(plan, togglePhase(plan, i), f.done ? `${f.id} reaberta` : `${f.id} concluída`)}
            />
            <span className="w-7 flex-none text-[12px] font-medium tabular-nums text-[var(--text-3)]">{f.id}</span>
            {editing === i ? (
              <InlineInput
                autoFocus
                value={f.name}
                className="text-[13.5px]"
                onCommit={(v) => {
                  savePlan(plan, renamePhase(plan, i, v), `${f.id} renomeada`)
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <span
                onDoubleClick={() => setEditing(i)}
                className={cn('selectable flex-1 text-[13.5px]', f.done && 'text-[var(--text-3)] line-through decoration-[var(--text-3)]/50')}
              >
                {f.name}
              </span>
            )}
            {f.date && <span className="text-[12px] text-[var(--text-3)]">{shortDate(f.date)}</span>}
            <div className="hidden items-center gap-0.5 group-hover:flex">
              <IconButton label={t('Renomear', 'Rename')} className="h-6 w-6" onClick={() => setEditing(i)}>
                <Pencil size={12} />
              </IconButton>
              <IconButton
                label={t('Remover fase', 'Remove phase')}
                className="h-6 w-6"
                onClick={() => {
                  const before = plan.raw
                  const removed = t(`${f.id} removida`, `${f.id} removed`)
                  savePlan(plan, removePhase(plan, i), removed)
                  toast(removed, {
                    action: { label: t('Desfazer', 'Undo'), onClick: () => savePlan({ ...plan, raw: '' }, before, `${f.id} restaurada`) },
                  })
                }}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          </div>
        ))}
        {adding ? (
          <div className="flex min-h-[38px] items-center gap-3 px-2.5">
            <Plus size={16} className="text-[var(--text-3)]" />
            <InlineInput
              autoFocus
              value=""
              placeholder={t('Nome da fase e Enter', 'Phase name, then Enter')}
              className="text-[13.5px]"
              onCommit={(v) => {
                savePlan(plan, addPhase(plan, v), 'fase adicionada')
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex h-[34px] w-full items-center gap-3 rounded-[8px] px-2.5 text-[13px] text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
          >
            <Plus size={16} /> {t('Adicionar fase', 'Add phase')}
          </button>
        )}
      </div>
    </section>
  )
}

/** corpo do plano em blocos por seção, sem as Fases (que têm o editor acima) */
function Body({ plan }: { plan: Plan }) {
  const savePlan = useStore((s) => s.savePlan)
  const blocks = useMemo(() => {
    const lines = plan.body.split('\n')
    const secs = sections(lines)
    const out: { text: string; offset: number; key: string; title?: string }[] = []
    const firstStart = secs[0]?.start ?? lines.length
    const intro = lines.slice(0, firstStart).filter((l) => !/^#\s/.test(l)).join('\n').trim()
    if (intro) out.push({ text: lines.slice(0, firstStart).map((l) => (/^#\s/.test(l) ? '' : l)).join('\n'), offset: 0, key: 'intro' })
    for (const s of secs) {
      if (['fases', 'fase', 'etapas', 'para voce', 'para o leco', 'resumo para voce'].includes(s.key)) continue
      if (s.key.startsWith('objetivo') && plan.objetivo && plan.objetivo !== '_Uma frase._') continue
      out.push({ text: lines.slice(s.start, s.end).join('\n'), offset: s.start, key: s.key + s.start, title: s.key })
    }
    return out
  }, [plan.body, plan.objetivo])

  return (
    <div className="mt-9 flex flex-col gap-7">
      {blocks.map((b) => {
        const empty = b.text.split('\n').slice(1).join('').replace(/_Uma frase\._/, '').trim() === ''
        if (empty && b.title) return <EmptySection key={b.key} plan={plan} title={b.text.split('\n')[0].replace(/^##\s*/, '')} />
        return (
          <Markdown
            key={b.key}
            className="selectable"
            plan={plan}
            onToggle={(line) => savePlan(plan, toggleLine(plan, b.offset + line), 'item marcado')}
          >
            {b.text}
          </Markdown>
        )
      })}
    </div>
  )
}

function EmptySection({ plan, title }: { plan: Plan; title: string }) {
  const savePlan = useStore((s) => s.savePlan)
  const [adding, setAdding] = useState(false)
  const key = normalize(title)
  const kind = key.startsWith('decis') ? 'decisoes' : key.includes('cobranc') ? 'cobrancas' : null
  return (
    <div>
      <h2 className="mb-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">{headingLabel(title)}</h2>
      {kind && adding ? (
        <InlineInput
          autoFocus
          value=""
          placeholder={kind === 'cobrancas' ? t('Pessoa: o que está devendo', 'Person: what they owe') : t('O que precisa ser decidido', 'What needs to be decided')}
          className="h-7 text-[13.5px]"
          onCommit={(v) => {
            savePlan(plan, addItem(plan, kind, v), kind === 'cobrancas' ? 'cobrança adicionada' : 'decisão adicionada')
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : kind ? (
        <button onClick={() => setAdding(true)} className="flex h-7 items-center gap-2 text-[13px] text-[var(--text-3)] hover:text-[var(--text-2)]">
          <Plus size={14} /> {t('Adicionar', 'Add')}
        </button>
      ) : (
        <div className="text-[13px] text-[var(--text-3)]">—</div>
      )}
    </div>
  )
}

function RawEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const savePlan = useStore((s) => s.savePlan)
  const [text, setText] = useState(plan.raw)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.setSelectionRange(0, 0)
  }, [])
  const save = () => {
    savePlan(plan, text, 'editado à mão')
    onClose()
  }
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-[var(--text-3)]">
        <FileText size={13} /> plano.md
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('Cancelar', 'Cancel')} <Kbd>esc</Kbd>
        </Button>
        <Button size="sm" variant="primary" onClick={save}>
          {t('Salvar', 'Save')} <Kbd className="border-white/20 bg-white/15 text-white/80">⌘S</Kbd>
        </Button>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 's' && e.metaKey) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') onClose()
        }}
        spellCheck={false}
        className="h-[calc(100vh-260px)] min-h-[360px] w-full resize-none rounded-[12px] border border-[var(--border)] bg-[var(--bg-subtle)] p-4 font-mono text-[12.5px] leading-[1.7] outline-none focus:border-accent/50"
      />
    </div>
  )
}

export function PlanDetail({ id }: { id: string }) {
  const plan = usePlanById(id)
  const back = useStore((s) => s.back)
  const go = useStore((s) => s.go)
  const savePlan = useStore((s) => s.savePlan)
  const talk = useStore((s) => s.talk)
  const prefs = useStore((s) => s.prefs)
  const setPrefs = useStore((s) => s.setPrefs)
  const project = useStore((s) => (plan ? s.project(plan.projectSlug) : undefined))
  const env = useStore((s) => s.env)
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && !viewing && !document.querySelector('[role=dialog],[role=menu]')) back()
      if (e.key === 'e' && e.metaKey && !editing) {
        e.preventDefault()
        setEditing(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, viewing, back])

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-3)]">
        {t('Plano não encontrado.', 'Plan not found.')}{' '}
        <button className="ml-1 text-accent" onClick={back}>
          {t('Voltar', 'Back')}
        </button>
      </div>
    )
  }

  const set = (patch: Partial<Plan['fm']>, msg: string) => savePlan(plan, setFields(plan, patch, msg), msg)
  const agent = plan.fm.agente ?? 'claude'
  const folderRel = plan.path.replace(/\/plano\.md$/, '')
  const prog = progress(plan)
  const notInstalled = t('não instalado', 'not installed')

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      {/* barra */}
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex h-11 items-center gap-1 bg-[var(--bg)]/85 px-1 backdrop-blur-md">
        <IconButton label={t('Voltar (esc)', 'Back (esc)')} onClick={back}>
          <ArrowLeft size={16} />
        </IconButton>
        {project && (
          <button
            onClick={() => go({ kind: 'project', slug: project.slug })}
            className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          >
            <ProjectDot color={project.cor} /> {project.nome}
          </button>
        )}
        <span className="text-[var(--text-3)]">/</span>
        <span className="truncate px-1 text-[13px] text-[var(--text-2)]">{plan.fm.id}</span>
        <div className="flex-1" />

        <div className="flex items-center">
          <Button variant="primary" size="sm" className="rounded-r-none" onClick={() => talk(plan)}>
            <Bot size={14} /> {t('Conversar', 'Chat')}
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="primary" size="sm" className="rounded-l-none border-l border-white/20 px-1.5" aria-label={t('Escolher agente', 'Choose agent')}>
                <ChevronDown size={14} />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>{t('Abrir com contexto do plano', 'Open with plan context')}</MenuLabel>
              <MenuItem onSelect={() => talk(plan, 'claude')} checked={agent === 'claude'} hint={!env?.hasClaude ? notInstalled : undefined}>
                Claude Code
              </MenuItem>
              <MenuItem onSelect={() => talk(plan, 'codex')} checked={agent === 'codex'} hint={!env?.hasCodex ? notInstalled : undefined}>
                Codex
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>{t('Abrir em', 'Open in')}</MenuLabel>
              <MenuItem
                onSelect={() => setPrefs({ opener: 'claude-app' })}
                checked={prefs.opener === 'claude-app'}
                hint={!env?.hasClaudeApp ? notInstalled : agent === 'codex' ? t('Codex vai pelo Orca', 'Codex opens in Orca') : undefined}
              >
                {t('App do Claude', 'Claude app')}
              </MenuItem>
              <MenuItem onSelect={() => setPrefs({ opener: 'orca' })} checked={prefs.opener === 'orca'} hint={!env?.hasOrca ? notInstalled : undefined}>
                Orca
              </MenuItem>
              <MenuItem onSelect={() => setPrefs({ opener: 'terminal' })} checked={prefs.opener === 'terminal'}>
                Terminal
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => set({ agente: agent === 'claude' ? 'codex' : 'claude' }, t('agente preferido alterado', 'preferred agent changed'))}>
                {t(`Usar ${agent === 'claude' ? 'Codex' : 'Claude'} por padrão`, `Use ${agent === 'claude' ? 'Codex' : 'Claude'} by default`)}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-1 w-7 px-0" aria-label={t('Mais ações', 'More actions')}>
              <MoreHorizontal size={16} />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Pencil size={14} />} hint="⌘E" onSelect={() => setEditing(true)}>
              {t('Editar o Markdown', 'Edit Markdown')}
            </MenuItem>
            <MenuItem icon={<FileText size={14} />} onSelect={() => api.openPath(plan.path)}>
              {t('Abrir no editor', 'Open in editor')}
            </MenuItem>
            <MenuItem icon={<FolderOpen size={14} />} onSelect={() => api.openPath(plan.path, true)}>
              {t('Mostrar no Finder', 'Show in Finder')}
            </MenuItem>
            {plan.fm.worktree && (
              <MenuItem icon={<FolderGit2 size={14} />} onSelect={() => api.openExternalPath(plan.fm.worktree!).catch((e) => toast.error(String(e)))}>
                {t('Abrir worktree', 'Open worktree')}
              </MenuItem>
            )}
            <MenuSeparator />
            {plan.fm.status === 'arquivado' ? (
              <MenuItem icon={<Archive size={14} />} onSelect={() => set({ status: 'proximo' }, t('desarquivado', 'unarchived'))}>
                {t('Desarquivar', 'Unarchive')}
              </MenuItem>
            ) : (
              <MenuItem
                icon={<Archive size={14} />}
                danger
                onSelect={() => {
                  const prev = plan.fm.status
                  set({ status: 'arquivado' }, t('arquivado', 'archived'))
                  toast(t('Plano arquivado', 'Plan archived'), {
                    description: plan.fm.titulo,
                    action: { label: t('Desfazer', 'Undo'), onClick: () => set({ status: prev }, t('desarquivado', 'unarchived')) },
                  })
                  back()
                }}
              >
                {t('Arquivar', 'Archive')}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>

      {/* título */}
      <div className="flex items-start gap-3 pt-3">
        <div className="mt-[9px]">
          <StatusIcon status={plan.fm.status} pct={prog.pct} size={18} />
        </div>
        <InlineInput
          value={plan.fm.titulo}
          onCommit={(v) => set({ titulo: v }, t('título alterado', 'title changed'))}
          className="selectable text-[26px] font-semibold leading-tight tracking-[-0.02em]"
        />
      </div>
      {plan.objetivo && plan.objetivo !== '_Uma frase._' && !plan.paraVoce?.resumo && (
        <p className="selectable ml-[30px] mt-1.5 text-[14px] leading-relaxed text-[var(--text-2)]">
          <Markdown inline plan={plan}>{plan.objetivo}</Markdown>
        </p>
      )}

      {editing ? (
        <RawEditor plan={plan} onClose={() => setEditing(false)} />
      ) : (
        <>
          {plan.fm.status !== 'arquivado' && plan.fm.status !== 'feito' && <ParaVoceCard plan={plan} />}

          {/* propriedades */}
          <div className="mt-6 grid grid-cols-1 gap-x-8 rounded-[12px] border border-[var(--border)] px-3 py-2 md:grid-cols-2">
            <Prop label="Status">
              <Menu>
                <MenuTrigger asChild>
                  <PropButton>
                    <StatusIcon status={plan.fm.status} pct={prog.pct} />
                    {STATUS_META[plan.fm.status].label}
                  </PropButton>
                </MenuTrigger>
                <MenuContent>
                  {STATUSES.map((s: Status) => (
                    <MenuItem key={s} icon={<StatusIcon status={s} pct={0.5} />} checked={plan.fm.status === s} onSelect={() => set({ status: s }, `status → ${s}`)}>
                      {STATUS_META[s].label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            </Prop>
            <Prop label={t('Prioridade', 'Priority')}>
              <Menu>
                <MenuTrigger asChild>
                  <PropButton>
                    <PriorityIcon p={plan.fm.prioridade} />
                    {PRIO_LABEL[plan.fm.prioridade]}
                  </PropButton>
                </MenuTrigger>
                <MenuContent>
                  {PRIORIDADES.map((p: Prioridade) => (
                    <MenuItem key={p} icon={<PriorityIcon p={p} />} checked={plan.fm.prioridade === p} onSelect={() => set({ prioridade: p }, t(`prioridade → ${p}`, `priority → ${p}`))}>
                      {PRIO_LABEL[p]}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            </Prop>
            <Prop label={t('Prazo', 'Due date')}>
              <div className="flex items-center gap-1">
                <label className="relative inline-flex h-7 items-center gap-2 rounded-[6px] px-2 text-[13px] hover:bg-[var(--bg-hover)]">
                  <Calendar size={14} className="text-[var(--text-3)]" />
                  {plan.fm.prazo ? shortDate(plan.fm.prazo) : <span className="text-[var(--text-3)]">{t('Sem prazo', 'No due date')}</span>}
                  <input
                    type="date"
                    value={plan.fm.prazo ?? ''}
                    onChange={(e) => set({ prazo: e.target.value || undefined }, e.target.value ? t(`prazo → ${e.target.value}`, `due date → ${e.target.value}`) : t('prazo removido', 'due date removed'))}
                    className="absolute inset-0 opacity-0"
                  />
                </label>
                <DueBadge prazo={plan.fm.status === 'feito' ? undefined : plan.fm.prazo} />
                {plan.fm.prazo && (
                  <IconButton label={t('Remover prazo', 'Remove due date')} className="h-6 w-6" onClick={() => set({ prazo: undefined }, t('prazo removido', 'due date removed'))}>
                    <X size={12} />
                  </IconButton>
                )}
              </div>
            </Prop>
            <Prop label={t('Pessoas', 'People')}>
              <div className="flex items-center gap-2 px-2">
                <User size={14} className="flex-none text-[var(--text-3)]" />
                <InlineInput
                  value={(plan.fm.pessoas ?? []).join(', ')}
                  placeholder={t('Ninguém', 'No one')}
                  className="h-7 text-[13px]"
                  onCommit={(v) =>
                    set({ pessoas: v.split(',').map((s) => s.trim()).filter(Boolean) }, t('pessoas alteradas', 'people changed'))
                  }
                />
              </div>
            </Prop>
            <Prop label="Worktree">
              <div className="flex min-w-0 items-center">
                <Tooltip label={plan.fm.worktree ? t('Trocar pasta', 'Change folder') : t('Escolher a pasta onde o agente trabalha', 'Choose the folder where the agent works')}>
                  <PropButton
                    className="min-w-0"
                    onClick={async () => {
                      const dir = await api.pickFolder(plan.fm.worktree)
                      if (dir) set({ worktree: env?.home ? dir.replace(env.home, '~') : dir }, t('worktree alterado', 'worktree changed'))
                    }}
                  >
                    <FolderGit2 size={14} className="flex-none text-[var(--text-3)]" />
                    <span className={cn('truncate', !plan.fm.worktree && 'text-[var(--text-3)]')}>
                      {plan.fm.worktree ? plan.fm.worktree.split('/').slice(-2).join('/') : t('Nenhum', 'None')}
                    </span>
                  </PropButton>
                </Tooltip>
              </div>
            </Prop>
            <Prop label={t('Atualizado', 'Updated')}>
              <span className="px-2 text-[13px] text-[var(--text-2)]">{relativeAge(plan.fm.atualizado) || '—'}</span>
            </Prop>
          </div>

          {/* arquivos ligados */}
          {(plan.fm.origem || plan.extras.length > 0 || plan.fm.documentos?.length) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.fm.origem && (
                <button
                  onClick={() => api.openUrl(plan.fm.origem!)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                >
                  <ExternalLink size={12} /> {t('Original no Claude', 'Original in Claude')}
                </button>
              )}
              {plan.extras.map((x) => (
                <button
                  key={x}
                  onClick={() => (x.endsWith('.md') ? setViewing(`${folderRel}/${x}`) : api.openPath(`${folderRel}/${x}`))}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                >
                  <FileText size={12} /> {x}
                </button>
              ))}
              {plan.fm.documentos?.map((d) => (
                <button
                  key={d}
                  onClick={() => api.openExternalPath(d).catch((e) => toast.error(t('Documento não encontrado', 'Document not found'), { description: String(e) }))}
                  className="inline-flex h-7 max-w-[280px] items-center gap-1.5 rounded-full border border-dashed border-[var(--border-strong)] px-3 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                >
                  <FileText size={12} className="flex-none" /> <span className="truncate">{d.split('/').pop()}</span>
                </button>
              ))}
            </div>
          )}

          <Phases plan={plan} />
          <Body plan={plan} />
        </>
      )}

      {viewing && <FileViewer rel={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
