import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { useEffect, useMemo, useState } from 'react'
import { Briefcase, FolderOpen, Layers, MessagesSquare, Moon, Plus, RefreshCw, Settings, Sun } from 'lucide-react'
import { useStore } from '../store'
import { useOrderedProjects } from '../hooks'
import type { Prioridade } from '../lib/types'
import { PRIORIDADES } from '../lib/types'
import { api } from '../lib/api'
import { normalize, progress } from '../lib/plan'
import { t } from '../lib/i18n'
import { Button, cn, Kbd, PRIO_LABEL, PriorityIcon, ProjectDot, StatusIcon } from './ui'

export function Modal({ open, onClose, children, className, title }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string; title: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-black/20 dark:bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'animate-pop fixed left-1/2 top-[14vh] z-50 w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-[14px] bg-[var(--bg)] shadow-[var(--shadow-pop)] outline-none',
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const itemCls =
  'flex h-9 cursor-default items-center gap-3 rounded-[8px] px-3 text-[13.5px] data-[selected=true]:bg-[var(--bg-hover)] aria-selected:bg-[var(--bg-hover)]'

export function CommandMenu() {
  const open = useStore((s) => s.paletteOpen)
  const setPalette = useStore((s) => s.setPalette)
  const plans = useStore((s) => s.plans)
  const go = useStore((s) => s.go)
  const openNewPlan = useStore((s) => s.openNewPlan)
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)
  const toggleContext = useStore((s) => s.toggleContext)
  const load = useStore((s) => s.load)
  const ctx = useStore((s) => s.context())
  const projects = useOrderedProjects()
  const projName = (slug: string) => projects.find((p) => p.slug === slug)

  return (
    <Modal open={open} onClose={() => setPalette(false)} title={t('Buscar', 'Search')}>
      <Command
        loop
        className="flex flex-col"
        filter={(value, search) => {
          const v = normalize(value)
          const words = normalize(search).split(/\s+/).filter(Boolean)
          if (v.includes(normalize(search))) return 1
          return words.every((w) => v.includes(w)) ? 0.6 : 0
        }}
      >
        <Command.Input
          autoFocus
          placeholder={t('Buscar planos, projetos e ações…', 'Search plans, projects and actions…')}
          className="h-[52px] border-b border-[var(--border)] bg-transparent px-4 text-[15px] outline-none placeholder:text-[var(--text-3)]"
        />
        <Command.List className="scroll-area max-h-[min(440px,60vh)] p-1.5">
          <Command.Empty className="py-10 text-center text-[13px] text-[var(--text-3)]">{t('Nada encontrado.', 'Nothing found.')}</Command.Empty>

          <Command.Group heading={t('Ações', 'Actions')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-[var(--text-3)]">
            <Command.Item className={itemCls} onSelect={() => openNewPlan()}>
              <Plus size={15} className="text-[var(--text-3)]" /> {t('Novo plano', 'New plan')} <span className="flex-1" />
              <Kbd>⌘N</Kbd>
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => go({ kind: 'today' })}>
              <Sun size={15} className="text-[var(--text-3)]" /> {t('Ir para Hoje', 'Go to Today')} <span className="flex-1" />
              <Kbd>⌘1</Kbd>
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => go({ kind: 'all' })}>
              <Layers size={15} className="text-[var(--text-3)]" /> {t('Todos os planos', 'All plans')} <span className="flex-1" />
              <Kbd>⌘2</Kbd>
            </Command.Item>
            <Command.Item
              className={itemCls}
              onSelect={() => {
                toggleContext()
                setPalette(false)
              }}
            >
              {ctx === 'trabalho' ? <Moon size={15} className="text-[var(--text-3)]" /> : <Briefcase size={15} className="text-[var(--text-3)]" />}
              {ctx === 'trabalho' ? t('Mudar para fora do horário', 'Switch to off hours') : t('Mudar para trabalho', 'Switch to work')}
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => { setPalette(false); useStore.getState().setPasteChatFor('') }}>
              <MessagesSquare size={15} className="text-[var(--text-3)]" /> {t('Colar conversa do Discord', 'Paste Discord conversation')}
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => setNewProjectOpen(true)}>
              <Plus size={15} className="text-[var(--text-3)]" /> {t('Novo projeto', 'New project')}
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => { api.openPath('', true); setPalette(false) }}>
              <FolderOpen size={15} className="text-[var(--text-3)]" /> {t('Abrir ~/planos no Finder', 'Open ~/planos in Finder')}
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => { load(); setPalette(false) }}>
              <RefreshCw size={15} className="text-[var(--text-3)]" /> {t('Recarregar arquivos', 'Reload files')}
            </Command.Item>
            <Command.Item className={itemCls} onSelect={() => go({ kind: 'settings' })}>
              <Settings size={15} className="text-[var(--text-3)]" /> {t('Ajustes', 'Settings')} <span className="flex-1" />
              <Kbd>⌘,</Kbd>
            </Command.Item>
          </Command.Group>

          <Command.Group heading={t('Projetos', 'Projects')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-[var(--text-3)]">
            {projects.map((p) => (
              <Command.Item key={p.slug} value={`projeto ${p.nome} ${p.slug}`} className={itemCls} onSelect={() => go({ kind: 'project', slug: p.slug })}>
                <span className="flex w-[15px] justify-center">
                  <ProjectDot color={p.cor} />
                </span>
                {p.nome}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={t('Planos', 'Plans')} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-[var(--text-3)]">
            {plans.map((p) => {
              const proj = projName(p.projectSlug)
              const pr = progress(p)
              return (
                <Command.Item
                  key={p.path}
                  value={`${p.fm.titulo} ${p.fm.id} ${proj?.nome ?? ''} ${p.fm.status}`}
                  className={itemCls}
                  onSelect={() => go({ kind: 'plan', id: p.fm.id })}
                >
                  <StatusIcon status={p.fm.status} pct={pr.pct} />
                  <span className="truncate">{p.fm.titulo}</span>
                  <span className="flex-1" />
                  <span className="flex-none text-[12px] text-[var(--text-3)]">{proj?.nome}</span>
                </Command.Item>
              )
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  )
}

const field =
  'h-9 w-full rounded-[8px] border border-[var(--border-strong)] bg-transparent px-3 text-[13.5px] outline-none transition-shadow placeholder:text-[var(--text-3)] focus:border-accent focus:ring-[3px] focus:ring-accent/15'

export function NewPlanDialog() {
  const newPlanFor = useStore((s) => s.newPlanFor)
  const close = useStore((s) => s.closeNewPlan)
  const createPlan = useStore((s) => s.createPlan)
  const projects = useOrderedProjects()
  const open = newPlanFor !== false
  const [projeto, setProjeto] = useState('')
  const [titulo, setTitulo] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [fases, setFases] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('media')
  const [prazo, setPrazo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setProjeto(newPlanFor || projects[0]?.slug || '')
      setTitulo('')
      setObjetivo('')
      setFases('')
      setPrioridade('media')
      setPrazo('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    if (!titulo.trim() || !projeto || busy) return
    setBusy(true)
    await createPlan({
      projeto,
      titulo: titulo.trim(),
      objetivo,
      prioridade,
      prazo: prazo || undefined,
      fases: fases.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean),
    })
    setBusy(false)
    close()
  }

  return (
    <Modal open={open} onClose={close} title={t('Novo plano', 'New plan')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey) submit()
        }}
        className="flex flex-col gap-4 p-5"
      >
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[15px] font-semibold">{t('Novo plano', 'New plan')}</h2>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {projects.map((p) => (
            <button
              type="button"
              key={p.slug}
              onClick={() => setProjeto(p.slug)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors',
                projeto === p.slug ? 'border-accent bg-accent-soft font-medium text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <ProjectDot color={p.cor} size={7} /> {p.nome}
            </button>
          ))}
        </div>

        <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={t('Título do plano', 'Plan title')} className={cn(field, 'h-10 text-[15px] font-medium')} />
        <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder={t('Objetivo em uma frase (opcional)', 'Goal in one sentence (optional)')} className={field} />
        <textarea
          value={fases}
          onChange={(e) => setFases(e.target.value)}
          placeholder={t('Fases, uma por linha (opcional)\nLevantar telas atuais\nImplementar home', 'Phases, one per line (optional)\nReview current screens\nBuild the home screen')}
          rows={4}
          className={cn(field, 'h-auto resize-none py-2 leading-relaxed')}
        />

        <div className="flex items-center gap-3">
          <div className="flex rounded-[8px] bg-[var(--bg-hover)] p-0.5">
            {PRIORIDADES.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPrioridade(p)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px]',
                  prioridade === p ? 'bg-[var(--bg)] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)]' : 'text-[var(--text-2)]',
                )}
              >
                <PriorityIcon p={p} /> {PRIO_LABEL[p]}
              </button>
            ))}
          </div>
          <label className="flex h-8 items-center gap-2 rounded-[8px] border border-[var(--border)] px-2.5 text-[12.5px] text-[var(--text-2)]">
            {t('Prazo', 'Due date')}
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="bg-transparent text-[12.5px] text-[var(--text)] outline-none" />
          </label>
          <div className="flex-1" />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
          <span className="mr-auto text-[12px] text-[var(--text-3)]">{t('Salvo em', 'Saved to')} ~/planos/projetos/{projeto || '…'}/planos/</span>
          <Button type="button" variant="ghost" onClick={close}>
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!titulo.trim() || !projeto || busy}>
            {t('Criar plano', 'Create plan')} <Kbd className="border-white/20 bg-white/15 text-white/80">⌘↵</Kbd>
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function NewProjectDialog() {
  const open = useStore((s) => s.newProjectOpen)
  const setOpen = useStore((s) => s.setNewProjectOpen)
  const createProject = useStore((s) => s.createProject)
  const [nome, setNome] = useState('')
  useEffect(() => {
    if (open) setNome('')
  }, [open])
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t('Novo projeto', 'New project')} className="w-[min(420px,92vw)]">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!nome.trim()) return
          await createProject(nome)
          setOpen(false)
        }}
      >
        <h2 className="text-[15px] font-semibold">{t('Novo projeto', 'New project')}</h2>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t('Nome do projeto', 'Project name')} className={field} />
        <p className="text-[12.5px] text-[var(--text-2)]">{t('Entra no fim da ordem dos dois contextos. Reordene em projetos.yaml.', 'Goes to the end of the order in both contexts. Reorder it in projetos.yaml.')}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!nome.trim()}>
            {t('Criar', 'Create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** "Excluir projeto": sai da lista e a pasta vai para ~/planos/arquivo (nada é apagado) */
export function ArchiveProjectDialog() {
  const slug = useStore((s) => s.archiveProjectFor)
  const setFor = useStore((s) => s.setArchiveProjectFor)
  const archive = useStore((s) => s.archiveProject)
  const project = useStore((s) => (slug ? s.project(slug) : undefined))
  const allPlans = useStore((s) => s.plans)
  const plans = useMemo(() => allPlans.filter((p) => p.projectSlug === slug), [allPlans, slug])
  const [busy, setBusy] = useState(false)
  const open = plans.filter((p) => p.fm.status !== 'feito' && p.fm.status !== 'arquivado').length
  return (
    <Modal open={!!slug} onClose={() => setFor(null)} title={t('Excluir projeto', 'Delete project')} className="w-[min(440px,92vw)]">
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-[15px] font-semibold">{t(`Excluir ${project?.nome ?? 'projeto'}?`, `Delete ${project?.nome ?? 'project'}?`)}</h2>
        <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
          {plans.length
            ? t(
                `Ele sai da barra lateral, do Hoje e das buscas, junto com ${plans.length === 1 ? 'o plano' : `os ${plans.length} planos`}${open ? ` (${open} ${open === 1 ? 'aberto' : 'abertos'})` : ''}.`,
                `It leaves the sidebar, Today and search, along with ${plans.length === 1 ? 'its plan' : `its ${plans.length} plans`}${open ? ` (${open} open)` : ''}.`,
              )
            : t('Ele sai da barra lateral e da ordem dos contextos.', 'It leaves the sidebar and the context order.')}{' '}
          {t('Nada é apagado: a pasta vai para', 'Nothing is deleted: the folder moves to')} <code className="text-[12px]">~/planos/arquivo/projetos</code>{' '}
          {t('e fica no histórico do git. Dá para desfazer logo depois.', 'and stays in the git history. You can undo it right after.')}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setFor(null)}>
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button
            autoFocus
            disabled={busy}
            variant="primary"
            className="bg-rose-600"
            onClick={async () => {
              if (!slug) return
              setBusy(true)
              await archive(slug)
              setBusy(false)
              setFor(null)
            }}
          >
            {t('Excluir projeto', 'Delete project')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Colar uma conversa (Discord, WhatsApp…) para a IA tirar tarefas do dia, cobranças e decisões */
export function PasteChatDialog() {
  const initial = useStore((s) => s.pasteChatFor)
  const setFor = useStore((s) => s.setPasteChatFor)
  const extract = useStore((s) => s.extractChat)
  const projects = useOrderedProjects()
  const [slug, setSlug] = useState('')
  const [origem, setOrigem] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initial === null) return
    setSlug(initial || projects[0]?.slug || '')
    setText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const lines = text.trim() ? text.trim().split('\n').length : 0
  return (
    <Modal open={initial !== null} onClose={() => setFor(null)} title={t('Colar conversa', 'Paste conversation')} className="w-[min(620px,92vw)]">
      <div className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">{t('Colar conversa', 'Paste conversation')}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-2)]">
            {t(
              'No Discord, selecione as mensagens do canal, copie (⌘C) e cole aqui. O Claude tira o que pediram para você, o que ficou sem resposta e quem prometeu o quê, e põe nas tarefas do dia e nas cobranças. O texto colado fica só neste Mac, fora do git.',
              "In Discord, select the channel's messages, copy (⌘C) and paste them here. Claude picks out what people asked of you, what went unanswered and who promised what, and adds it to today's tasks and follow-ups. The pasted text stays on this Mac only, outside git.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-8 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-2 text-[13px] outline-none"
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nome}
              </option>
            ))}
          </select>
          <input
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            placeholder={t('De onde (ex.: Discord #wallet-dev)', 'Source (e.g. Discord #wallet-dev)')}
            className="h-8 flex-1 rounded-[8px] border border-[var(--border)] bg-transparent px-2.5 text-[13px] outline-none placeholder:text-[var(--text-3)] focus:border-accent/60"
          />
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Cole a conversa aqui', 'Paste the conversation here')}
          className="selectable h-[300px] resize-none rounded-[10px] border border-[var(--border)] bg-transparent p-3 font-mono text-[12px] leading-relaxed outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-[var(--text-3)] focus:border-accent/60"
        />
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[12px] text-[var(--text-3)]">{lines ? t(`${lines} linhas`, lines === 1 ? '1 line' : `${lines} lines`) : ''}</span>
          <Button variant="ghost" onClick={() => setFor(null)}>
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !text.trim() || !slug}
            onClick={async () => {
              setBusy(true)
              const ok = await extract(slug, text, origem)
              setBusy(false)
              if (ok) setFor(null)
            }}
          >
            {t('Extrair tarefas', 'Extract tasks')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
