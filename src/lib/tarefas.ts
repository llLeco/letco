import type { Ask, Config, ContextKey, Plan } from './types'
import { orderedSlugs } from './config'
import { conferidoAfter, type Conferido } from './conferido'
import { askOf, normalize } from './plan'

/**
 * Tarefas do dia: ~/planos/tarefas/AAAA-MM-DD.md, uma lista de checkboxes que o investigador
 * monta com o que achou de mais importante nos planos (e que o usuário marca ao longo do dia).
 *
 *   # Tarefas de quarta, 28/10
 *   - [ ] Aprovar: merge do acme/api#14 e depois do acme/web#1 <!-- plano: api-auditoria -->
 *
 * O comentário liga a tarefa ao plano; quando o texto é o mesmo do item em "Precisa de você",
 * marcar aqui marca lá também.
 */
export interface Tarefa extends Ask {
  planId?: string
  /** o que o revisor achou no GitHub e nos clones: já feito, em parte ou ainda pendente */
  conferido?: Conferido
}

export interface TarefasDia {
  /** nome do arquivo, ex.: 2026-10-28.md */
  file: string
  date: string
  raw: string
  items: Tarefa[]
}

const LINE_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/
// o comentário pode vir no fim ou antes do link da mensagem
const PLAN_RE = /\s*<!--\s*plano:\s*([^\s>]+)\s*-->\s*/

export function parseTarefas(file: string, raw: string): TarefasDia {
  const items: Tarefa[] = []
  const lines = raw.split('\n')
  lines.forEach((l, line) => {
    const m = l.match(LINE_RE)
    if (!m) return
    const planId = m[2].match(PLAN_RE)?.[1]
    const text = m[2].replace(PLAN_RE, ' ').trim()
    if (!text) return
    items.push({ ...askOf({ text, done: m[1] !== ' ', line }), planId, conferido: conferidoAfter(lines, line) })
  })
  return { file, date: file.replace(/\.md$/, ''), raw, items }
}

/** marca (done = true) ou desmarca a tarefa da linha */
export function setTarefa(raw: string, line: number, done: boolean) {
  const lines = raw.split('\n')
  lines[line] = lines[line].replace(/^(\s*[-*]\s+\[)([ xX])(\])/, (_, a, _c, b) => `${a}${done ? 'x' : ' '}${b}`)
  return lines.join('\n')
}

const key = (planId: string | undefined, label: string) => `${planId ?? ''}|${normalize(label).replace(/\s+/g, ' ')}`

/** chaves (plano + texto) das tarefas do dia, para não repetir o item em "Precisa de você" */
export function tarefaKeys(t?: TarefasDia | null) {
  return new Set((t?.items ?? []).map((i) => key(i.planId, i.label)))
}

export function askKey(plan: Plan, ask: Ask) {
  return key(plan.fm.id, ask.label)
}

/** o item de "Precisa de você" do plano que é esta tarefa (mesmo texto) */
export function matchingAsk(plan: Plan | undefined, t: Tarefa) {
  if (!plan) return undefined
  const k = key(t.planId, t.label)
  return plan.paraVoce?.acoes.find((a) => askKey(plan, a) === k)
}

/**
 * Ordem de exibição: abertas antes das feitas; entre elas, a ordem dos projetos no contexto
 * (projetos.yaml), como no resto da lista do dia; no mesmo projeto, a ordem do arquivo.
 */
export function sortTarefas(items: Tarefa[], plans: Plan[], cfg: Config, ctx: ContextKey) {
  const byId = new Map(plans.map((p) => [p.fm.id, p]))
  const order = orderedSlugs(cfg, ctx, [...new Set(plans.map((p) => p.projectSlug))])
  const pos = (t: Tarefa) => {
    const slug = t.planId ? byId.get(t.planId)?.projectSlug : undefined
    const i = slug ? order.indexOf(slug) : -1
    return i < 0 ? order.length : i
  }
  return [...items].sort((a, b) => Number(a.done) - Number(b.done) || pos(a) - pos(b) || a.line - b.line)
}
