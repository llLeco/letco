import { useMemo, useState } from 'react'
import { Bot, ChevronDown, FileText, FolderOpen, Languages, Layers, MessagesSquare, Plus, Search, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { useOrderedProjects } from '../hooks'
import type { Idioma, Plan, Status } from '../lib/types'
import { IDIOMA_LABEL } from '../lib/prompt'
import { normalize, progress } from '../lib/plan'
import { scorePlan } from '../lib/score'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { PlanRow } from './PlanRow'
import { Button, cn, Empty, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, ProjectDot, SectionTitle, StatusIcon } from './ui'

const GROUPS: { key: string; label: string; statuses: Status[]; collapsed?: boolean }[] = [
  { key: 'andamento', get label() { return t('Em andamento', 'In progress') }, statuses: ['andamento'] },
  { key: 'revisao', get label() { return t('Revisão', 'In review') }, statuses: ['revisao'] },
  { key: 'bloqueado', get label() { return t('Bloqueados', 'Blocked') }, statuses: ['bloqueado'] },
  { key: 'proximo', get label() { return t('Próximos', 'Up next') }, statuses: ['proximo'] },
  { key: 'ideia', get label() { return t('Ideias', 'Ideas') }, statuses: ['ideia'] },
  { key: 'feito', get label() { return t('Feitos', 'Done') }, statuses: ['feito'], collapsed: true },
  { key: 'arquivado', get label() { return t('Arquivados', 'Archived') }, statuses: ['arquivado'], collapsed: true },
]

function Group({ label, status, plans, collapsed, showProject }: { label: string; status: Status; plans: Plan[]; collapsed?: boolean; showProject?: boolean }) {
  const [open, setOpen] = useState(!collapsed)
  if (!plans.length) return null
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <SectionTitle
          icon={<StatusIcon status={status} pct={0.5} size={14} />}
          count={plans.length}
          right={<ChevronDown size={14} className={cn('text-[var(--text-3)] transition-transform', !open && '-rotate-90')} />}
        >
          {label}
        </SectionTitle>
      </button>
      {open && (
        <div className="mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-1.5">
          {plans.map((p) => (
            <PlanRow key={p.path} plan={p} showProject={showProject} />
          ))}
        </div>
      )}
    </div>
  )
}

function sortPlans(plans: Plan[], order: string[]) {
  return [...plans].sort((a, b) => scorePlan(b, order).score - scorePlan(a, order).score)
}

export function ProjectView({ slug }: { slug: string }) {
  const project = useStore((s) => s.project(slug))
  const allPlans = useStore((s) => s.plans)
  const openNewPlan = useStore((s) => s.openNewPlan)
  const talkProject = useStore((s) => s.talkProject)
  const setArchiveFor = useStore((s) => s.setArchiveProjectFor)
  const setIdioma = useStore((s) => s.setProjectIdioma)
  const plans = useMemo(() => allPlans.filter((p) => p.projectSlug === slug), [allPlans, slug])
  const order = [slug]

  if (!project) return <Empty title={t('Projeto não encontrado', 'Project not found')} />
  const open = plans.filter((p) => p.fm.status !== 'feito' && p.fm.status !== 'arquivado')
  const totals = open.reduce((a, p) => {
    const pr = progress(p)
    return { done: a.done + pr.done, total: a.total + pr.total }
  }, { done: 0, total: 0 })

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="flex items-end gap-4 pb-6 pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <ProjectDot color={project.cor} size={12} />
            <h1 className="truncate text-[26px] font-semibold tracking-[-0.02em]">{project.nome}</h1>
          </div>
          <p className="mt-1 text-[13.5px] text-[var(--text-2)]">
            {t(`${open.length} ${open.length === 1 ? 'plano aberto' : 'planos abertos'}`, `${open.length} open ${open.length === 1 ? 'plan' : 'plans'}`)}
            {totals.total > 0 &&
              t(` · ${totals.done} de ${totals.total} fases feitas`, ` · ${totals.done} of ${totals.total} ${totals.total === 1 ? 'phase' : 'phases'} done`)}
            {' · '}
            <Menu>
              <MenuTrigger asChild>
                <button className="inline-flex items-center gap-1 rounded-[5px] px-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text)]" title={t('Língua dos rascunhos de mensagem e cobrança deste projeto', 'Language for message and follow-up drafts in this project')}>
                  <Languages size={12} />{' '}
                  {t(`Mensagens em ${IDIOMA_LABEL[project.idioma].toLowerCase()}`, `Messages in ${IDIOMA_LABEL[project.idioma]}`)}{' '}
                  <ChevronDown size={11} className="text-[var(--text-3)]" />
                </button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>{t('Rascunhos de mensagem e cobrança', 'Message and follow-up drafts')}</MenuLabel>
                {(['en', 'pt-BR'] as Idioma[]).map((i) => (
                  <MenuItem key={i} checked={project.idioma === i} onSelect={() => project.idioma !== i && setIdioma(slug, i)}>
                    {IDIOMA_LABEL[i]}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button>
              <Bot size={14} /> {t('Nova sessão', 'New session')} <ChevronDown size={13} className="text-[var(--text-3)]" />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => talkProject(slug, 'claude')}>Claude Code</MenuItem>
            <MenuItem onSelect={() => talkProject(slug, 'codex')}>Codex</MenuItem>
            <MenuItem icon={<FileText size={14} />} onSelect={() => api.openPath(`projetos/${slug}/projeto.md`)}>
              {t('Editar projeto.md', 'Edit projeto.md')}
            </MenuItem>
            <MenuItem icon={<MessagesSquare size={14} />} onSelect={() => useStore.getState().setPasteChatFor(slug)}>
              {t('Colar conversa do Discord…', 'Paste Discord chat…')}
            </MenuItem>
            <MenuItem icon={<FolderOpen size={14} />} onSelect={() => api.openPath(`projetos/${slug}`, true)}>
              {t('Mostrar no Finder', 'Show in Finder')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setArchiveFor(slug)}>
              {t('Excluir projeto…', 'Delete project…')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Button variant="primary" onClick={() => openNewPlan(slug)}>
          <Plus size={14} /> {t('Novo plano', 'New plan')}
        </Button>
      </header>

      {!plans.length ? (
        <Empty icon={<Layers size={28} />} title={t('Nenhum plano neste projeto', 'No plans in this project')}>
          <Button variant="primary" className="mt-3" onClick={() => openNewPlan(slug)}>
            {t('Criar o primeiro', 'Create the first one')}
          </Button>
        </Empty>
      ) : (
        GROUPS.map((g) => (
          <Group
            key={g.key}
            label={g.label}
            status={g.statuses[0]}
            collapsed={g.collapsed}
            showProject={false}
            plans={sortPlans(plans.filter((p) => g.statuses.includes(p.fm.status)), order)}
          />
        ))
      )}
    </div>
  )
}

const FILTERS: { key: string; label: string; test: (p: Plan) => boolean }[] = [
  { key: 'abertos', get label() { return t('Abertos', 'Open') }, test: (p) => !['feito', 'arquivado', 'ideia'].includes(p.fm.status) },
  { key: 'ideias', get label() { return t('Ideias', 'Ideas') }, test: (p) => p.fm.status === 'ideia' },
  { key: 'feitos', get label() { return t('Feitos', 'Done') }, test: (p) => p.fm.status === 'feito' },
  { key: 'arquivados', get label() { return t('Arquivados', 'Archived') }, test: (p) => p.fm.status === 'arquivado' },
  { key: 'todos', get label() { return t('Todos', 'All') }, test: () => true },
]

export function AllPlansView() {
  const plans = useStore((s) => s.plans)
  const projects = useOrderedProjects()
  const [filter, setFilter] = useState('abertos')
  const [q, setQ] = useState('')
  const f = FILTERS.find((x) => x.key === filter)!
  const order = projects.map((p) => p.slug)
  const nq = normalize(q)
  const visible = plans.filter(
    (p) => f.test(p) && (!nq || normalize(`${p.fm.titulo} ${p.fm.id} ${p.objetivo} ${(p.fm.pessoas ?? []).join(' ')}`).includes(nq)),
  )

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="pb-5 pt-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t('Todos os planos', 'All plans')}</h1>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex rounded-[8px] bg-[var(--bg-hover)] p-0.5">
            {FILTERS.map((x) => (
              <button
                key={x.key}
                onClick={() => setFilter(x.key)}
                className={cn(
                  'h-7 rounded-[6px] px-3 text-[12.5px] font-medium transition-colors',
                  filter === x.key ? 'bg-[var(--bg)] text-[var(--text)] shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)]' : 'text-[var(--text-2)] hover:text-[var(--text)]',
                )}
              >
                {x.label} <span className="tabular-nums text-[var(--text-3)]">{plans.filter(x.test).length}</span>
              </button>
            ))}
          </div>
          <div className="flex h-8 flex-1 items-center gap-2 rounded-[8px] border border-[var(--border)] px-2.5">
            <Search size={14} className="text-[var(--text-3)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filtrar…', 'Filter…')} className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--text-3)]" />
          </div>
        </div>
      </header>

      {!visible.length && <Empty title={t('Nada aqui', 'Nothing here')} />}
      {projects.map((proj) => {
        const ps = sortPlans(visible.filter((p) => p.projectSlug === proj.slug), order)
        if (!ps.length) return null
        return (
          <div key={proj.slug} className="mb-4">
            <SectionTitle icon={<ProjectDot color={proj.cor} />} count={ps.length}>
              {proj.nome}
            </SectionTitle>
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-1.5">
              {ps.map((p) => (
                <PlanRow key={p.path} plan={p} showProject={false} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

