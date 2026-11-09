import { MessageSquare } from 'lucide-react'
import type { Plan } from '../lib/types'
import { ASK_LABEL, nextPhase, pendingAsks, phaseLabel, progress, togglePhase } from '../lib/plan'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { cn, DueBadge, PriorityIcon, ProgressBar, ProjectChip, StatusIcon, Tooltip } from './ui'

export function PlanRow({
  plan,
  showProject = true,
  quickCheck = false,
  note,
}: {
  plan: Plan
  showProject?: boolean
  /** checkbox para concluir a próxima fase direto da lista */
  quickCheck?: boolean
  note?: string
}) {
  const go = useStore((s) => s.go)
  const project = useStore((s) => s.project(plan.projectSlug))
  const savePlan = useStore((s) => s.savePlan)
  const talk = useStore((s) => s.talk)
  const prog = progress(plan)
  const next = nextPhase(plan)
  const nextIdx = next ? plan.phases.indexOf(next) : -1
  const muted = plan.fm.status === 'feito' || plan.fm.status === 'arquivado'
  const ask = pendingAsks(plan)[0]
  const nada = plan.paraVoce && !ask ? plan.paraVoce.nada : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => go({ kind: 'plan', id: plan.fm.id })}
      onKeyDown={(e) => e.key === 'Enter' && go({ kind: 'plan', id: plan.fm.id })}
      className="group flex min-h-[44px] items-center gap-3 rounded-[8px] px-2 py-1.5 outline-none hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
    >
      {quickCheck && next ? (
        <Tooltip label={t(`Concluir ${phaseLabel(next)}`, `Complete ${phaseLabel(next)}`)}>
          <input
            type="checkbox"
            className="check"
            checked={false}
            onClick={(e) => e.stopPropagation()}
            onChange={() => savePlan(plan, togglePhase(plan, nextIdx), `${phaseLabel(next)} concluída`)}
          />
        </Tooltip>
      ) : (
        <StatusIcon status={plan.fm.status} pct={prog.pct} />
      )}

      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13.5px] font-medium', muted && 'text-[var(--text-2)] line-through decoration-[var(--text-3)]/40')}>
          {plan.fm.titulo}
        </div>
        {(next || note || ask || nada) && !muted && (
          <div className="truncate text-[12.5px] text-[var(--text-2)]">
            {note ??
              (ask ? (
                <>
                  <span className="font-medium text-accent">{t('Você', 'You')} · {ASK_LABEL[ask.kind]}:</span> {ask.label}
                </>
              ) : nada ? (
                <span className="text-[var(--text-3)]">{nada.replace(/^(nada( agora)?|nothing( right now| for now)?)\s*[—–:-]?\s*/i, t('IA tocando: ', 'AI on it: '))}</span>
              ) : (
                <>
                  <span className="text-[var(--text-3)]">{next!.id || t('Próxima', 'Next')}</span> {next!.name}
                </>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-none items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            talk(plan)
          }}
          className="hidden h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-[var(--text-2)] hover:bg-[var(--bg-active)] hover:text-[var(--text)] group-hover:inline-flex"
        >
          <MessageSquare size={12} /> {t('Conversar', 'Chat')}
        </button>
        <DueBadge prazo={muted ? undefined : plan.fm.prazo} />
        {showProject && project && <ProjectChip name={project.nome} color={project.cor} />}
        {plan.fm.prioridade === 'alta' && !muted && <PriorityIcon p="alta" />}
        {prog.total > 0 && <ProgressBar done={prog.done} total={prog.total} />}
      </div>
    </div>
  )
}
