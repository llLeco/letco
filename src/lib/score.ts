import type { Ask, CheckItem, Config, ContextKey, Plan } from './types'
import { pendingAsks } from './plan'
import { daysSince, daysUntil } from './dates'
import { orderedSlugs } from './config'

export const ACTIVE = ['proximo', 'andamento', 'revisao', 'bloqueado'] as const

export function isActive(p: Plan) {
  return (ACTIVE as readonly string[]).includes(p.fm.status)
}

export function isOpen(p: Plan) {
  return p.fm.status !== 'feito' && p.fm.status !== 'arquivado'
}

export function staleDays(p: Plan, now = new Date()) {
  const d = daysSince(p.fm.atualizado, now)
  if (d !== undefined) return d
  return Math.floor((now.getTime() - p.mtime) / 86_400_000)
}

export interface Scored {
  plan: Plan
  score: number
  due?: number
  stale: number
}

/**
 * Pontuação da lista do dia, nesta ordem de peso:
 * 1. prazo vencido ou vencendo hoje · 2. bloqueio que só eu destravo ·
 * 3. posição do projeto no contexto · 4. prioridade · 5. tempo parado (7+ dias sobe)
 */
export function scorePlan(p: Plan, order: string[], now = new Date()): Scored {
  const due = daysUntil(p.fm.prazo, now)
  const stale = staleDays(p, now)
  let score = 0
  if (due !== undefined) {
    if (due <= 0) score += 10_000
    else if (due <= 3) score += 2_000 - due * 100
  }
  const openDecisions = p.decisions.filter((d) => !d.done).length
  if (p.fm.status === 'bloqueado' || openDecisions > 0) score += 1_000
  if (p.fm.status === 'revisao') score += 600
  const pos = order.indexOf(p.projectSlug)
  score += (order.length - (pos < 0 ? order.length : pos)) * 40
  score += { alta: 30, media: 15, baixa: 0 }[p.fm.prioridade]
  if (p.fm.status === 'andamento') score += 12
  if (stale >= 7) score += 10
  return { plan: p, score, due, stale }
}

export interface TodayData {
  urgent: Scored[]
  /** itens de "Precisa de você", na ordem dos planos */
  asks: { plan: Plan; item: Ask }[]
  doing: Scored[]
  decide: { plan: Plan; item: CheckItem }[]
  chase: { plan: Plan; item: CheckItem }[]
  stale: Scored[]
  counts: { active: number; hiddenByContext: number }
}

export function buildToday(plans: Plan[], cfg: Config, ctx: ContextKey, now = new Date()): TodayData {
  const slugs = [...new Set(plans.map((p) => p.projectSlug))]
  const order = orderedSlugs(cfg, ctx, slugs)
  const hidden = new Set(cfg.contextos[ctx].ocultar ?? [])

  const candidates = plans.filter((p) => isActive(p) || (p.fm.status === 'ideia' && p.fm.prazo))
  let hiddenByContext = 0
  const visible = candidates.filter((p) => {
    if (!hidden.has(p.projectSlug)) return true
    const due = daysUntil(p.fm.prazo, now)
    const show = due !== undefined && due <= 1
    if (!show) hiddenByContext++
    return show
  })

  const scored = visible.map((p) => scorePlan(p, order, now)).sort((a, b) => b.score - a.score)
  const urgent = scored.filter((s) => s.due !== undefined && s.due <= 0)
  const rest = scored.filter((s) => !urgent.includes(s))
  const doing = rest.filter((s) => s.plan.fm.status !== 'bloqueado').slice(0, 7)

  const rank = new Map(scored.map((s, i) => [s.plan.path, i]))
  const byRank = (a: { plan: Plan }, b: { plan: Plan }) => (rank.get(a.plan.path) ?? 999) - (rank.get(b.plan.path) ?? 999)

  const asks = visible.flatMap((plan) => pendingAsks(plan).map((item) => ({ plan, item }))).sort(byRank)

  // planos com "Para você" já trazem decisões e cobranças mastigadas: não repetir aqui
  const decide = visible
    .filter((plan) => !plan.paraVoce)
    .flatMap((plan) => plan.decisions.filter((i) => !i.done).map((item) => ({ plan, item })))
    .sort(byRank)

  const chase = visible
    .filter((plan) => !plan.paraVoce)
    .flatMap((plan) => plan.cobrancas.filter((i) => !i.done).map((item) => ({ plan, item })))
    .sort(byRank)

  const shown = new Set([...urgent, ...doing].map((s) => s.plan.path))
  const stale = scored
    .filter((s) => !shown.has(s.plan.path) && s.stale >= 7)
    .sort((a, b) => b.stale - a.stale)

  return { urgent, asks, doing, decide, chase, stale, counts: { active: visible.length, hiddenByContext } }
}
