import { format } from 'date-fns'
import { souEu } from './usuario'
import type { Config, ContextKey, Plan, ProjectInfo } from './types'
import { daysUntil, dueLabel, parseDay, todayISO } from './dates'
import { ASK_LABEL, nextPhase, phaseLabel, progress, sections, normalize } from './plan'
import { buildToday, isOpen, staleDays } from './score'
import { CONTEXT_LABEL, orderedSlugs } from './config'
import { askKey, matchingAsk, sortTarefas, tarefaKeys, type TarefasDia } from './tarefas'
import { dfLocale, isEn, t } from './i18n'

/**
 * Títulos das seções do hoje.md, no idioma do app. O app só mostra o hoje.md e o semana.md (não lê nada deles);
 * a rotina "lista do dia" usa os mesmos nomes para achar as seções.
 */
export function hojeSecoes() {
  return {
    prazos: t('Prazos', 'Deadlines'),
    tarefas: t('Tarefas do dia', "Today's tasks"),
    precisa: t('Precisa de você', 'Needs you'),
    fazer: t('Fazer hoje', 'Do today'),
    cobrar: t('Cobrar', 'Follow up'),
    decidir: t('Decidir', 'Decide'),
    atualizacao: t('Pedir atualização', 'Ask for an update'),
    novidades: t('Novidades de hoje', 'New today'),
  }
}

/** dia curto: 14/10 em português, Oct 14 em inglês */
const curto = (d: Date) => format(d, isEn() ? 'MMM d' : 'dd/MM', { locale: dfLocale() })
const curtoHora = (d: Date) => format(d, isEn() ? 'MMM d HH:mm' : 'dd/MM HH:mm', { locale: dfLocale() })

export interface LogEntry {
  date: string
  text: string
}

/** linhas `- AAAA-MM-DD: texto` da seção Log */
export function logEntries(p: Plan): LogEntry[] {
  const lines = p.body.split('\n')
  const sec = sections(lines).find((s) => ['log', 'historico'].includes(normalize(s.title)))
  if (!sec) return []
  const out: LogEntry[] = []
  for (let i = sec.start + 1; i < sec.end; i++) {
    const m = lines[i].match(/^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s*[:—–-]\s*(.+)$/)
    // a linha da importação não é novidade de trabalho
    if (m && !/^importado d[eo] /i.test(m[2])) out.push({ date: m[1], text: m[2].trim() })
  }
  return out
}

function name(projects: ProjectInfo[], slug: string) {
  return projects.find((p) => p.slug === slug)?.nome ?? slug
}

function since(s?: string) {
  // "desde 2026-10-14" vira 14/10; "desde 14/10" fica como está
  const d = parseDay(s)
  return d ? curto(d) : s
}

function stripSince(text: string) {
  return text.replace(/\s*\(?desde\s+[\d/-]+\)?\s*$/i, '').trim()
}

/** Lista do dia no formato do hoje.md (curta, cabe numa tela). */
export function hojeMarkdown(plans: Plan[], projects: ProjectInfo[], cfg: Config, ctx: ContextKey, now = new Date(), tarefas?: TarefasDia) {
  const td = buildToday(plans, cfg, ctx, now)
  const h = hojeSecoes()
  const inTarefas = tarefaKeys(tarefas)
  const asks = td.asks.filter(({ plan, item }) => !inTarefas.has(askKey(plan, item)))
  const day = format(now, isEn() ? 'EEEE, MMM d' : 'EEEE, dd/MM', { locale: dfLocale() })
  const title = day.charAt(0).toUpperCase() + day.slice(1)
  const out: string[] = [`# ${title} · ${CONTEXT_LABEL[ctx].toLowerCase()}`, '']
  const label = (p: Plan) => `${name(projects, p.projectSlug)} · ${p.fm.titulo}`

  const block = (heading: string, items: string[]) => {
    if (!items.length) return
    out.push(`## ${heading}`, ...items, '')
  }

  // prazos: vencidos, de hoje e dos próximos 3 dias
  const soon = plans
    .filter(isOpen)
    .map((p) => ({ p, d: daysUntil(p.fm.prazo, now) }))
    .filter((x) => x.d !== undefined && x.d <= 3)
    .sort((a, b) => a.d! - b.d!)
  block(h.prazos, soon.map(({ p }) => `- [ ] ${label(p)}: ${dueLabel(p.fm.prazo, now)}`))

  // tarefas do dia: o que o investigador escolheu para hoje (arquivo de hoje ou o último, se ainda não há)
  if (tarefas) {
    const byId = new Map(plans.map((p) => [p.fm.id, p]))
    const pending = sortTarefas(
      tarefas.items.filter((i) => !i.done && !matchingAsk(byId.get(i.planId ?? ''), i)?.done),
      plans,
      cfg,
      ctx,
    )
    const done = tarefas.items.length - pending.length
    const isToday = tarefas.date === todayISO(now)
    const heading = isToday
      ? `${h.tarefas}${done ? t(` (${done} de ${tarefas.items.length} feitas)`, ` (${done} of ${tarefas.items.length} done)`) : ''}`
      : t(`Tarefas que ficaram de ${curto(parseDay(tarefas.date) ?? now)}`, `Tasks left from ${curto(parseDay(tarefas.date) ?? now)}`)
    block(
      heading,
      pending.map((i) => {
        const plan = i.planId ? byId.get(i.planId) : undefined
        return `- [ ] ${ASK_LABEL[i.kind]}${plan ? ` · ${label(plan)}` : ''}: ${i.label}`
      }),
    )
  }

  block(
    h.precisa,
    asks.slice(0, 10).map(({ plan, item }) => `- [ ] ${ASK_LABEL[item.kind]} · ${label(plan)}: ${item.label}`),
  )
  if (asks.length > 10) out.splice(out.length - 1, 0, t(`- … e mais ${asks.length - 10} no app`, `- … and ${asks.length - 10} more in the app`))

  const shownUrgent = new Set(soon.map((x) => x.p.path))
  block(
    h.fazer,
    td.doing
      .filter((s) => !shownUrgent.has(s.plan.path))
      .map(({ plan }) => {
        const pr = progress(plan)
        const next = nextPhase(plan)
        const what = next ? `: ${phaseLabel(next)}` : plan.phases.length ? t(': revisar e marcar como feito', ': review and mark as done') : ''
        return `- [ ] ${label(plan)}${what}${pr.total ? ` (${pr.done}/${pr.total})` : ''}`
      }),
  )

  block(
    h.cobrar,
    td.chase.slice(0, 6).map(({ plan, item }) => {
      const s = since(item.since)
      return `- ${stripSince(item.text)}${s ? t(` (desde ${s})`, ` (since ${s})`) : ''} — ${name(projects, plan.projectSlug)}`
    }),
  )

  block(
    h.decidir,
    td.decide.slice(0, 6).map(({ plan, item }) => `- ${name(projects, plan.projectSlug)}: ${item.text}`),
  )
  if (td.decide.length > 6) out.splice(out.length - 1, 0, t(`- … e mais ${td.decide.length - 6} no app`, `- … and ${td.decide.length - 6} more in the app`))

  // planos tocados por outra pessoa e parados: pedir atualização
  const ask = plans
    .filter((p) => isOpen(p) && p.fm.status !== 'ideia' && p.fm.responsavel && !souEu(p.fm.responsavel))
    .filter((p) => staleDays(p, now) >= 7)
    .slice(0, 4)
  block(h.atualizacao, ask.map((p) => `- ${p.fm.responsavel}: ${label(p)} ${t(`(parado há ${staleDays(p, now)} dias)`, `(stalled for ${staleDays(p, now)} days)`)}`))

  const today = todayISO(now)
  const news = plans.flatMap((p) => logEntries(p).filter((e) => e.date === today).map((e) => `- ${label(p)}: ${e.text}`))
  block(h.novidades, news.slice(0, 8))

  if (out.length <= 2) out.push(t('Nada pendente neste contexto.', 'Nothing pending in this context.'), '')
  out.push(t(`_Gerado em ${curtoHora(now)} pelo comando \`planos hoje --escrever\`._`, `_Generated on ${curtoHora(now)} by \`planos hoje --escrever\`._`), '')
  return out.join('\n')
}

/** Resumo da semana por projeto: o que andou, o que está parado, o que dá para arquivar. */
export function semanaMarkdown(plans: Plan[], projects: ProjectInfo[], cfg: Config, ctx: ContextKey, now = new Date()) {
  const from = todayISO(new Date(now.getTime() - 7 * 86_400_000))
  const out: string[] = [t(`# Semana até ${curto(now)}`, `# Week to ${curto(now)}`), '']
  const order = orderedSlugs(cfg, ctx, [...new Set(plans.map((p) => p.projectSlug))])
  let archive: string[] = []

  for (const slug of order) {
    const ps = plans.filter((p) => p.projectSlug === slug && p.fm.status !== 'arquivado')
    const moved = ps
      .map((p) => ({ p, log: logEntries(p).filter((e) => e.date > from) }))
      .filter((x) => x.log.length)
    const stale = ps.filter((p) => isOpen(p) && p.fm.status !== 'ideia' && staleDays(p, now) >= 7)
    archive = archive.concat(
      ps
        .filter((p) => (p.fm.status === 'ideia' || p.fm.status === 'proximo') && staleDays(p, now) >= 30)
        .map((p) => `- ${name(projects, slug)} · ${p.fm.titulo} (${p.fm.status}, ${t(`parado há ${staleDays(p, now)} dias`, `stalled for ${staleDays(p, now)} days`)})`),
    )
    if (!moved.length && !stale.length) continue
    out.push(`## ${name(projects, slug)}`)
    for (const { p, log } of moved) {
      const pr = progress(p)
      out.push(`- ${p.fm.titulo}${pr.total ? ` (${pr.done}/${pr.total})` : ''}: ${log.map((e) => e.text).join('; ')}`)
    }
    for (const p of stale) out.push(`- ${t(`Parado há ${staleDays(p, now)} dias`, `Stalled for ${staleDays(p, now)} days`)}: ${p.fm.titulo} [${p.fm.status}]`)
    out.push('')
  }

  if (archive.length) out.push(t('## Sugestões de arquivar', '## Suggested to archive'), ...archive, '')
  if (out.length <= 2) out.push(t('Nada andou nem ficou parado nesta semana.', 'Nothing moved or stalled this week.'), '')
  out.push(t(`_Gerado em ${curtoHora(now)} pelo comando \`planos semana --escrever\`._`, `_Generated on ${curtoHora(now)} by \`planos semana --escrever\`._`), '')
  return out.join('\n')
}
