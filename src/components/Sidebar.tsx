import { Bot, Briefcase, CalendarClock, ChevronRight, Eye, EyeOff, FolderOpen, Layers, Megaphone, MessageCircle, MessagesSquare, Moon, NotebookText, Plus, Search, Settings, SquareTerminal, Sun, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store'
import { isOpen } from '../lib/score'
import { CONTEXT_LABEL } from '../lib/config'
import { t } from '../lib/i18n'
import { cn, Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, ProjectDot, Tooltip } from './ui'
import { useOrderedProjects, useToday } from '../hooks'

function NavItem({
  active,
  icon,
  children,
  count,
  dim,
  action,
  onClick,
  onContextMenu,
}: {
  active?: boolean
  icon: ReactNode
  children: ReactNode
  count?: number
  dim?: boolean
  /** botão que aparece no lugar da contagem quando o mouse passa por cima */
  action?: ReactNode
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={cn(
          'flex h-[30px] w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors',
          active ? 'bg-[var(--bg-active)] font-medium text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
          dim && !active && 'text-[var(--text-3)]',
        )}
      >
        <span className={cn('flex w-4 flex-none justify-center', dim && 'opacity-50')}>{icon}</span>
        <span className="flex-1 truncate">{children}</span>
        {!!count && <span className={cn('text-[11.5px] tabular-nums text-[var(--text-3)]', action && 'group-hover:invisible')}>{count}</span>}
      </button>
      {action && <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 group-hover:block">{action}</div>}
    </div>
  )
}

function HideButton({ hidden, ctxLabel, onClick }: { hidden: boolean; ctxLabel: string; onClick: () => void }) {
  return (
    <Tooltip label={hidden ? t(`Mostrar em ${ctxLabel}`, `Show during ${ctxLabel}`) : t(`Esconder em ${ctxLabel}`, `Hide during ${ctxLabel}`)} side="right">
      <button
        onClick={onClick}
        aria-label={hidden ? t('Mostrar projeto', 'Show project') : t('Esconder projeto', 'Hide project')}
        className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-[var(--text-3)] hover:bg-[var(--bg-active)] hover:text-[var(--text)]"
      >
        {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </Tooltip>
  )
}

export function Sidebar() {
  const view = useStore((s) => s.view)
  const go = useStore((s) => s.go)
  const plans = useStore((s) => s.plans)
  const allProjects = useOrderedProjects()
  const ctx = useStore((s) => s.context())
  const config = useStore((s) => s.config)
  const setHidden = useStore((s) => s.setProjectHidden)
  const hiddenSlugs = new Set(config.contextos[ctx].ocultar ?? [])
  const projects = allProjects.filter((p) => !hiddenSlugs.has(p.slug))
  const hiddenProjects = allProjects.filter((p) => hiddenSlugs.has(p.slug))
  const [showHidden, setShowHidden] = useState(false)
  const ctxLabel = t(CONTEXT_LABEL[ctx].toLowerCase(), ctx === 'trabalho' ? 'work hours' : 'off hours')
  const toggleContext = useStore((s) => s.toggleContext)
  const ctxOverride = useStore((s) => s.ctxOverride)
  const setPalette = useStore((s) => s.setPalette)
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen)
  const today = useToday()
  const openNewPlan = useStore((s) => s.openNewPlan)
  const talkProject = useStore((s) => s.talkProject)
  const setArchiveFor = useStore((s) => s.setArchiveProjectFor)
  /** menu do clique direito num projeto, aberto onde o mouse está */
  const [ctxMenu, setCtxMenu] = useState<{ slug: string; x: number; y: number } | null>(null)
  const menuProject = ctxMenu ? allProjects.find((p) => p.slug === ctxMenu.slug) : undefined

  const todayCount = today ? today.urgent.length + today.doing.length : 0
  const current = view.kind === 'plan' ? view.from : view
  const activeProject = view.kind === 'plan' ? plans.find((p) => p.fm.id === view.id)?.projectSlug : current?.kind === 'project' ? current.slug : undefined

  return (
    <aside className="flex h-full w-[232px] flex-none flex-col bg-[var(--sidebar)]">
      <div data-tauri-drag-region className="h-[52px] flex-none" />

      <div className="px-2.5">
        <button
          onClick={() => setPalette(true)}
          className="mb-3 flex h-[30px] w-full items-center gap-2 rounded-[7px] bg-[var(--bg-hover)] px-2.5 text-[13px] text-[var(--text-3)] transition-colors hover:bg-[var(--bg-active)]"
        >
          <Search size={14} />
          <span className="flex-1 text-left">{t('Buscar', 'Search')}</span>
          <Kbd>⌘K</Kbd>
        </button>

        <NavItem active={current?.kind === 'today'} icon={<Sun size={15} />} count={todayCount} onClick={() => go({ kind: 'today' })}>
          {t('Hoje', 'Today')}
        </NavItem>
        <NavItem active={current?.kind === 'resumos'} icon={<NotebookText size={15} />} onClick={() => go({ kind: 'resumos' })}>
          {t('Resumos', 'Summaries')}
        </NavItem>
        <NavItem
          active={current?.kind === 'all'}
          icon={<Layers size={15} />}
          count={plans.filter(isOpen).length}
          onClick={() => go({ kind: 'all' })}
        >
          {t('Todos os planos', 'All plans')}
        </NavItem>
        <NavItem active={current?.kind === 'routines'} icon={<CalendarClock size={15} />} onClick={() => go({ kind: 'routines' })}>
          {t('Rotinas', 'Routines')}
        </NavItem>
        <NavItem active={current?.kind === 'divulgacao'} icon={<Megaphone size={15} />} onClick={() => go({ kind: 'divulgacao' })}>
          {t('Divulgação', 'Promotion')}
        </NavItem>
        <NavItem active={current?.kind === 'discord'} icon={<MessageCircle size={15} />} onClick={() => go({ kind: 'discord' })}>
          Discord
        </NavItem>
        <NavItem active={current?.kind === 'console'} icon={<SquareTerminal size={15} />} onClick={() => go({ kind: 'console' })}>
          Console
        </NavItem>
      </div>

      <div className="mt-5 flex items-center px-5 pb-1">
        <span className="flex-1 text-[11.5px] font-medium text-[var(--text-3)]">{t('Projetos', 'Projects')}</span>
        <Tooltip label={t('Novo projeto', 'New project')}>
          <button onClick={() => setNewProjectOpen(true)} className="rounded p-0.5 text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            <Plus size={14} />
          </button>
        </Tooltip>
      </div>

      <nav className="scroll-area flex-1 px-2.5 pb-3">
        {[...projects, ...(showHidden ? hiddenProjects : [])].map((p) => {
          const hidden = hiddenSlugs.has(p.slug)
          return (
            <NavItem
              key={p.slug}
              active={activeProject === p.slug && view.kind === 'project'}
              icon={<ProjectDot color={p.cor} />}
              count={plans.filter((x) => x.projectSlug === p.slug && isOpen(x) && x.fm.status !== 'ideia').length}
              dim={hidden}
              action={<HideButton hidden={hidden} ctxLabel={ctxLabel} onClick={() => setHidden(p.slug, !hidden)} />}
              onClick={() => go({ kind: 'project', slug: p.slug })}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ slug: p.slug, x: e.clientX, y: e.clientY })
              }}
            >
              {p.nome}
            </NavItem>
          )
        })}
        {hiddenProjects.length > 0 && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="mt-1 flex h-[26px] w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[12px] text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
          >
            <span className="flex w-4 flex-none justify-center">
              <ChevronRight size={13} className={cn('transition-transform', showHidden && 'rotate-90')} />
            </span>
            <span className="flex-1 truncate">
              {showHidden ? t('Esconder de novo', 'Hide again') : t(`${hiddenProjects.length} ${hiddenProjects.length === 1 ? 'escondido' : 'escondidos'}`, `${hiddenProjects.length} hidden`)}
            </span>
          </button>
        )}
      </nav>

      <Menu open={!!ctxMenu} onOpenChange={(o) => !o && setCtxMenu(null)} modal={false}>
        <MenuTrigger asChild>
          <span aria-hidden className="pointer-events-none fixed h-0 w-0" style={{ left: ctxMenu?.x ?? 0, top: ctxMenu?.y ?? 0 }} />
        </MenuTrigger>
        {ctxMenu && menuProject && (
          <MenuContent>
            <MenuLabel>{menuProject.nome}</MenuLabel>
            <MenuItem icon={<Plus size={14} />} onSelect={() => openNewPlan(ctxMenu.slug)}>
              {t('Novo plano', 'New plan')}
            </MenuItem>
            <MenuItem icon={<Bot size={14} />} onSelect={() => talkProject(ctxMenu.slug, 'claude')}>
              {t('Nova sessão com o Claude', 'New session with Claude')}
            </MenuItem>
            <MenuItem icon={<MessagesSquare size={14} />} onSelect={() => useStore.getState().setPasteChatFor(ctxMenu.slug)}>
              {t('Colar conversa do Discord…', 'Paste Discord conversation…')}
            </MenuItem>
            <MenuItem icon={<FolderOpen size={14} />} onSelect={() => api.openPath(`projetos/${ctxMenu.slug}`, true)}>
              {t('Mostrar no Finder', 'Show in Finder')}
            </MenuItem>
            <MenuItem
              icon={hiddenSlugs.has(ctxMenu.slug) ? <Eye size={14} /> : <EyeOff size={14} />}
              onSelect={() => setHidden(ctxMenu.slug, !hiddenSlugs.has(ctxMenu.slug))}
            >
              {hiddenSlugs.has(ctxMenu.slug) ? t(`Mostrar em ${ctxLabel}`, `Show during ${ctxLabel}`) : t(`Esconder em ${ctxLabel}`, `Hide during ${ctxLabel}`)}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setArchiveFor(ctxMenu.slug)}>
              {t('Excluir projeto…', 'Delete project…')}
            </MenuItem>
          </MenuContent>
        )}
      </Menu>

      <div className="flex items-center gap-1 border-t border-[var(--border)] px-2.5 py-2">
        <Tooltip label={ctxOverride ? t('Contexto escolhido à mão — clique para alternar', 'Context set manually — click to switch') : t('Contexto automático pelo horário — clique para alternar', 'Context set automatically by time — click to switch')} side="top">
          <button
            onClick={toggleContext}
            className="flex h-[28px] flex-1 items-center gap-2 rounded-[7px] px-2 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          >
            {ctx === 'trabalho' ? <Briefcase size={14} /> : <Moon size={14} />}
            <span>{CONTEXT_LABEL[ctx]}</span>
            {ctxOverride && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
        </Tooltip>
        <Tooltip label={t('Ajustes', 'Settings')} side="top">
          <button
            onClick={() => go({ kind: 'settings' })}
            className={cn(
              'flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
              view.kind === 'settings' && 'bg-[var(--bg-active)] text-[var(--text)]',
            )}
          >
            <Settings size={15} />
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
