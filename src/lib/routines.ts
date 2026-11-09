import { splitFrontmatter } from './plan'
import { isEn, t } from './i18n'

/** O que o backend devolve: arquivos lidos como estão, sem alterar nada. */
export interface RoutinesRaw {
  claudeTasks: string[]
  claudeSkills: [string, string][]
  claudeRuns: ClaudeRun[]
  hermesJobs: string | null
  hermesHeartbeat: string | null
  hermesOutputs: [string, { path: string; mtime: number }][]
  planosLaunchd: [string, boolean][]
  openbotInstalled: boolean
  openbotFiles: { path: string; mtime: number }[]
}

/** uma sessão aberta por uma tarefa agendada do Claude */
export interface ClaudeRun {
  task: string
  session: string
  started: number
  lastActivity: number
  turns: number
  status: string | null
  detail: string | null
}

/** uma execução: quando começou e como terminou */
export interface Run {
  at: number
  status: 'ok' | 'atencao' | 'erro' | 'rodando'
  detail?: string
  /** sessão do Claude que dá para abrir */
  session?: string
}

export type RoutineSource = 'planos' | 'claude' | 'hermes' | 'openbot'

export interface Routine {
  source: RoutineSource
  id: string
  name: string
  /** o que faz, em uma ou duas frases */
  what: string
  cron?: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
  lastStatus?: 'ok' | 'erro'
  lastError?: string
  /** arquivo com as instruções (SKILL.md) ou a última saída */
  file?: string
  output?: string
  /** a rotina mexe no sistema de planos (lê/escreve ~/planos, Plane, quadro) */
  planning: boolean
  /** execuções conhecidas, da mais antiga para a mais nova */
  runs: Run[]
  /** quando o agendador pulou a vez (ex.: a execução anterior ainda rodava) */
  skips: number[]
}

export interface RoutinesData {
  routines: Routine[]
  hermesAlive: boolean
  openbotInstalled: boolean
  openbotFiles: { path: string; mtime: number }[]
}

const PLANNING_RE = /planos|plane\b|quadro|planejad|hoje\.md/i

function firstSentences(text: string, max = 220) {
  const clean = text
    .replace(/^#.*$/gm, '')
    .replace(/[*`_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const dot = cut.lastIndexOf('. ')
  return (dot > 80 ? cut.slice(0, dot + 1) : cut.trimEnd() + '…').trim()
}

const planosJobs = (): Record<string, { name: string; what: string; cron: string }> => ({
  'dev.leco.planos.hoje': {
    name: t('Lista do dia (hoje.md)', 'Daily list (hoje.md)'),
    what: t('Roda planos hoje --escrever: grava a lista do dia em ~/planos/hoje.md.', 'Runs planos hoje --escrever: writes the daily list to ~/planos/hoje.md.'),
    cron: '30 8,12,16 * * 1-5',
  },
  'dev.leco.planos.semana': {
    name: t('Resumo da semana (semana.md)', 'Weekly summary (semana.md)'),
    what: t('Roda planos semana --escrever: grava o resumo por projeto em ~/planos/semana.md.', 'Runs planos semana --escrever: writes the per-project summary to ~/planos/semana.md.'),
    cron: '0 17 * * 5',
  },
})

export function parseRoutines(raw: RoutinesRaw, now = new Date()): RoutinesData {
  const routines: Routine[] = []

  const jobs = planosJobs()
  for (const [label, installed] of raw.planosLaunchd) {
    const j = jobs[label]
    if (!j) continue
    routines.push({ source: 'planos', id: label, name: j.name, what: j.what, cron: j.cron, enabled: installed, planning: true, runs: [], skips: [] })
  }

  // Claude: agenda no JSON do app, instruções no SKILL.md
  const skills = new Map(raw.claudeSkills)
  const runsByTask = new Map<string, Run[]>()
  for (const c of raw.claudeRuns ?? []) {
    const list = runsByTask.get(c.task) ?? []
    list.push(claudeRun(c, now))
    runsByTask.set(c.task, list)
  }
  const seen = new Set<string>()
  for (const text of raw.claudeTasks) {
    let tasks: Record<string, unknown>[] = []
    let skipped: Record<string, { at: number }[]> = {}
    try {
      const json = JSON.parse(text)
      tasks = (json.scheduledTasks ?? []) as Record<string, unknown>[]
      skipped = json.recordedSkips ?? {}
    } catch {
      continue
    }
    for (const t of tasks) {
      const id = String(t.id)
      if (seen.has(id)) continue
      seen.add(id)
      const runs = (runsByTask.get(id) ?? []).sort((a, b) => a.at - b.at)
      // sessão apagada: a última execução ainda aparece pelo lastRunAt
      const lastAt = t.lastRunAt ? Date.parse(String(t.lastRunAt)) : NaN
      if (!Number.isNaN(lastAt) && !runs.some((r) => Math.abs(r.at - lastAt) < 5 * 60e3)) runs.push({ at: lastAt, status: 'ok' })
      runs.sort((a, b) => a.at - b.at)
      const last = runs[runs.length - 1]
      const skill = skills.get(id) ?? ''
      const { data, body } = splitFrontmatter(skill)
      const desc = (data.description as string | undefined) ?? firstSentences(body)
      routines.push({
        source: 'claude',
        id,
        name: (t.displayName as string | undefined) ?? id,
        what: desc,
        cron: t.cronExpression as string | undefined,
        enabled: t.enabled === true,
        lastRun: last ? new Date(last.at).toISOString() : undefined,
        nextRun: t.enabled === true && t.cronExpression ? nextOccurrence(String(t.cronExpression), now)?.toISOString() : undefined,
        lastStatus: last?.status === 'erro' ? 'erro' : undefined,
        lastError: last?.status === 'erro' ? last.detail : undefined,
        file: t.filePath as string | undefined,
        planning: PLANNING_RE.test(id + ' ' + desc),
        runs,
        skips: (skipped[id] ?? []).map((k) => k.at).filter((n) => typeof n === 'number'),
      })
    }
  }

  // Hermes
  let hermesAlive = false
  if (raw.hermesHeartbeat) {
    const ts = parseFloat(raw.hermesHeartbeat.split(/\s+/)[0])
    hermesAlive = !Number.isNaN(ts) && now.getTime() / 1000 - ts < 600
  }
  if (raw.hermesJobs) {
    try {
      const jobs = (JSON.parse(raw.hermesJobs).jobs ?? []) as Record<string, any>[]
      const outputs = new Map(raw.hermesOutputs)
      for (const j of jobs) {
        const expr = j.schedule?.kind === 'cron' ? (j.schedule.expr as string) : undefined
        const paused = j.state === 'paused' || !!j.paused_at
        const err = j.last_status && j.last_status !== 'ok' ? (j.last_error ?? j.last_status) : undefined
        const lastAt = j.last_run_at ? Date.parse(j.last_run_at) : NaN
        routines.push({
          source: 'hermes',
          id: j.id,
          name: j.name ?? j.id,
          what: firstSentences(j.prompt ?? ''),
          cron: expr,
          enabled: j.enabled !== false && !paused,
          lastRun: j.last_run_at ?? undefined,
          nextRun: !paused ? (j.next_run_at ?? undefined) : undefined,
          lastStatus: j.last_status ? (j.last_status === 'ok' ? 'ok' : 'erro') : undefined,
          lastError: err ? String(err) : undefined,
          output: outputs.get(j.id)?.path,
          planning: PLANNING_RE.test(`${j.name} ${j.prompt} ${(j.skills ?? []).join(' ')}`),
          runs: Number.isNaN(lastAt) ? [] : [{ at: lastAt, status: err ? 'erro' : 'ok', detail: err ? String(err) : undefined }],
          skips: [],
        })
      }
    } catch {
      /* jobs.json ilegível: segue sem o Hermes */
    }
  }

  return { routines, hermesAlive, openbotInstalled: raw.openbotInstalled, openbotFiles: raw.openbotFiles }
}

function claudeRun(c: ClaudeRun, now: Date): Run {
  const base = { at: c.started, detail: c.detail ?? undefined, session: c.session }
  if (c.status === 'completed') return { ...base, status: 'ok' }
  // "blocked" é o resumo do que a rodada achou (coisas para o usuário), não falha da rodada:
  // essas coisas vão para os planos e para as tarefas do dia
  if (c.status) return { ...base, status: /fail|error/i.test(c.status) ? 'erro' : 'ok' }
  // sem resumo: rodando se mexeu há pouco; parada se nem terminou o primeiro turno
  if (now.getTime() - c.lastActivity < 10 * 60e3) return { ...base, status: 'rodando' }
  if (!c.turns) return { ...base, status: 'atencao', detail: t('Não terminou: a sessão parou logo no começo, provavelmente esperando você aprovar algo.', "Didn't finish: the session stopped right at the start, probably waiting for you to approve something.") }
  return { ...base, status: 'ok' }
}

export type SlotState =
  | { kind: 'rodou'; run: Run }
  | { kind: 'pulou'; at: number; blocker?: Run }
  | { kind: 'esperando' }
  | { kind: 'faltou' }

/**
 * O que aconteceu num horário que já passou: a execução que começou entre esse horário
 * e o próximo da mesma rotina, o pulo registrado pelo agendador, ou nada.
 * Até 30 min depois do horário, sem execução, ainda conta como esperando (o Mac pode estar acordando).
 */
export function slotState(r: Routine, slot: Date, next: Date | undefined, now: Date): SlotState | undefined {
  const from = slot.getTime() - 2 * 60e3
  if (now.getTime() < slot.getTime()) return undefined
  const until = Math.min(next?.getTime() ?? Infinity, now.getTime() + 60e3)
  const run = r.runs.find((x) => x.at >= from && x.at < until)
  if (run) return { kind: 'rodou', run }
  const skip = r.skips.find((k) => k >= from && k < until)
  if (skip) return { kind: 'pulou', at: skip, blocker: r.runs.filter((x) => x.at < skip).pop() }
  if (r.source === 'planos') return undefined // o launchd não deixa registro de execução
  if (now.getTime() - slot.getTime() < 30 * 60e3) return { kind: 'esperando' }
  return { kind: 'faltou' }
}

// ---------- cron ----------

function expand(field: string, min: number, max: number): Set<number> | null {
  if (field === '*' || field === '?') return null // qualquer valor
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/')
    const step = stepStr ? parseInt(stepStr, 10) : 1
    let a = min
    let b = max
    if (range !== '*') {
      const [x, y] = range.split('-').map((n) => parseInt(n, 10))
      a = x
      b = y ?? (stepStr ? max : x)
    }
    for (let v = a; v <= b; v += step) out.add(v)
  }
  return out
}

export interface Cron {
  minutes: Set<number> | null
  hours: Set<number> | null
  dom: Set<number> | null
  months: Set<number> | null
  dow: Set<number> | null
}

export function parseCron(expr: string): Cron | null {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) return null
  try {
    const dow = expand(f[4], 0, 7)
    if (dow?.has(7)) dow.add(0)
    return { minutes: expand(f[0], 0, 59), hours: expand(f[1], 0, 23), dom: expand(f[2], 1, 31), months: expand(f[3], 1, 12), dow }
  } catch {
    return null
  }
}

function dayMatches(c: Cron, d: Date) {
  if (c.months && !c.months.has(d.getMonth() + 1)) return false
  const domOk = !c.dom || c.dom.has(d.getDate())
  const dowOk = !c.dow || c.dow.has(d.getDay())
  // regra do cron: com dia do mês e da semana restritos, vale qualquer um dos dois
  if (c.dom && c.dow) return domOk || dowOk
  return domOk && dowOk
}

/** horários (em minutos do dia) em que a rotina roda nesta data */
export function timesOn(expr: string, d: Date): number[] {
  const c = parseCron(expr)
  if (!c || !dayMatches(c, d)) return []
  const hours = c.hours ? [...c.hours] : Array.from({ length: 24 }, (_, i) => i)
  const mins = c.minutes ? [...c.minutes] : Array.from({ length: 60 }, (_, i) => i)
  return hours.flatMap((h) => mins.map((m) => h * 60 + m)).sort((a, b) => a - b)
}

export function nextOccurrence(expr: string, from = new Date()): Date | undefined {
  for (let i = 0; i < 400; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    const nowMin = i === 0 ? from.getHours() * 60 + from.getMinutes() : -1
    const t = timesOn(expr, d).find((m) => m > nowMin)
    if (t !== undefined) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(t / 60), t % 60)
  }
  return undefined
}

const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DOW_LONG = ['todo domingo', 'toda segunda', 'toda terça', 'toda quarta', 'toda quinta', 'toda sexta', 'todo sábado']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_LONG_EN = ['every Sunday', 'every Monday', 'every Tuesday', 'every Wednesday', 'every Thursday', 'every Friday', 'every Saturday']

function hhmm(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (isEn()) return `${h}:${String(m).padStart(2, '0')}`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** "seg a sex às 8h40, 12h40 e 16h40" */
export function cronHuman(expr: string): string {
  const f = expr.trim().split(/\s+/)
  const c = parseCron(expr)
  if (!c || f.length !== 5) return expr
  let days = t('todo dia', 'every day')
  if (c.dow) {
    const ds = [...c.dow].filter((d) => d !== 7).sort()
    const key = ds.join(',')
    const dow = isEn() ? DOW_EN : DOW
    const dowLong = isEn() ? DOW_LONG_EN : DOW_LONG
    days = key === '1,2,3,4,5' ? t('seg a sex', 'Mon–Fri') : key === '0,6' ? t('fim de semana', 'weekends') : ds.length === 1 ? dowLong[ds[0]] : ds.map((d) => dow[d]).join(', ')
  }
  if (c.dom) days = t(`dia ${[...c.dom].join(', ')}`, `day ${[...c.dom].join(', ')}`) + (c.dow ? t(` ou ${days}`, ` or ${days}`) : '')
  if (c.months) days += t(` (meses ${[...c.months].join(', ')})`, ` (months ${[...c.months].join(', ')})`)

  const hourStep = f[1].match(/^\*\/(\d+)$/)
  if (hourStep && c.minutes?.size === 1) return t(`${days}, a cada ${hourStep[1]} horas`, `${days}, every ${hourStep[1]} hours`)
  const minStep = f[0].match(/^\*\/(\d+)$/)
  if (!c.hours) {
    if (minStep) return t(`${days}, a cada ${minStep[1]} minutos`, `${days}, every ${minStep[1]} minutes`)
    if (!c.minutes) return t(`${days}, a cada minuto`, `${days}, every minute`)
    return c.minutes.size === 1 ? t(`${days}, a cada hora`, `${days}, every hour`) : t(`${days}, ${c.minutes.size} vezes por hora`, `${days}, ${c.minutes.size} times an hour`)
  }
  if (!c.minutes) return t(`${days}, a cada minuto entre ${[...c.hours].join(', ')}h`, `${days}, every minute during hours ${[...c.hours].join(', ')}`)
  const times = [...c.hours].flatMap((h) => [...c.minutes!].map((m) => h * 60 + m)).sort((a, b) => a - b)
  if (times.length > 6) return t(`${days}, ${times.length} vezes por dia`, `${days}, ${times.length} times a day`)
  const list = times.map(hhmm)
  const and = t(' e ', ' and ')
  const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')}${and}${list[list.length - 1]}` : list[0]
  return t(`${days} às ${joined}`, `${days} at ${joined}`)
}

export const SOURCE_LABEL: Record<RoutineSource, string> = {
  get planos() {
    return t('Letco (este Mac)', 'Letco (this Mac)')
  },
  get claude() {
    return t('Claude (tarefas agendadas)', 'Claude (scheduled tasks)')
  },
  hermes: 'Hermes',
  openbot: 'OpenBot',
}
