import type { Ask, Config, ContextKey, Plan } from './types'
import { orderedSlugs } from './config'
import { parseConferido, type Conferido } from './conferido'
import { todayISO } from './dates'
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
  /** adiada: só volta para a lista quando a data chegar */
  adiado?: { ate: string; motivo?: string }
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
/** `  - Adiado até AAAA-MM-DD · motivo`, logo abaixo da tarefa (depois das linhas Conferido) */
const ADIADO_RE = /^\s+[-*]\s+Adiado\s+at[eé]\s+(\d{4}-\d{2}-\d{2})\s*(?:[·:—-]\s*(.*))?$/i
const SUB_RE = /^\s+[-*]\s+/

/** linhas de recuo logo abaixo da tarefa: a conferência mais recente e o adiamento, se houver */
function subLines(lines: string[], line: number) {
  let conferido: Conferido | undefined
  let adiado: Tarefa['adiado']
  let end = line + 1
  for (; end < lines.length && SUB_RE.test(lines[end]); end++) {
    const c = parseConferido(lines[end])
    if (c && (!conferido || c.date >= conferido.date)) conferido = c
    const a = lines[end].match(ADIADO_RE)
    if (a) adiado = { ate: a[1], motivo: a[2]?.trim() || undefined }
  }
  return { conferido, adiado, end }
}

/** a tarefa está adiada hoje? (aberta, com data de volta no futuro) */
export const isAdiada = (t: Tarefa, now = new Date()) => !t.done && !!t.adiado && t.adiado.ate > todayISO(now)

/** adia a tarefa da linha até a data (ou tira o adiamento, com `ate` nulo) */
export function setAdiado(raw: string, line: number, ate: string | null, motivo?: string) {
  const lines = raw.split('\n')
  const { end } = subLines(lines, line)
  const kept = lines.slice(line + 1, end).filter((l) => !ADIADO_RE.test(l))
  const novo = ate ? [`  - Adiado até ${ate}${motivo ? ` · ${motivo}` : ''}`] : []
  return [...lines.slice(0, line + 1), ...kept, ...novo, ...lines.slice(end)].join('\n')
}

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
    const { conferido, adiado } = subLines(lines, line)
    items.push({ ...askOf({ text, done: m[1] !== ' ', line }), planId, conferido, adiado })
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
