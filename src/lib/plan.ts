import { CORE_SCHEMA, dump, load } from 'js-yaml'
import type { Ask, AskKind, CheckItem, Frontmatter, ParaVoce, Phase, Plan, Prioridade, Status } from './types'
import { PRIORIDADES, STATUSES } from './types'
import { todayISO } from './dates'
import { t } from './i18n'
import { apelidoUsuario } from './usuario'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/
const CHECK_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/
const DATE_SUFFIX_RE = /\s+[—–-]\s+(\d{4}-\d{2}-\d{2})\s*$/
const PHASE_ID_RE = /^(F\d+)[\s.:)-]+(.*)$/

/** ordem canônica das chaves do cabeçalho */
const FM_ORDER = [
  'id', 'projeto', 'titulo', 'status', 'prioridade', 'prazo', 'responsavel', 'pessoas',
  'agente', 'worktree', 'origem', 'documentos', 'atualizado',
]

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function slugify(s: string) {
  return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'plano'
}

export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = raw.match(FM_RE)
  if (!m) return { data: {}, body: raw }
  let data: Record<string, unknown> = {}
  try {
    const parsed = load(m[1], { schema: CORE_SCHEMA })
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
  } catch {
    // YAML inválido (ex.: título com ": " sem aspas, escrito à mão): lê chave por chave
    data = looseYaml(m[1])
  }
  return { data, body: raw.slice(m[0].length) }
}

function looseYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const line of text.split('\n')) {
    const km = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!km) continue
    let v = km[2].replace(/\s+#.*$/, '').trim()
    if (/^\[.*\]$/.test(v)) {
      out[km[1]] = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      continue
    }
    v = v.replace(/^["'](.*)["']$/, '$1')
    out[km[1]] = v
  }
  return out
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

function list(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean)
  return undefined
}

export function serializeFrontmatter(fm: Frontmatter): string {
  const ordered: Record<string, unknown> = {}
  for (const k of FM_ORDER) if (fm[k] !== undefined && fm[k] !== '' && fm[k] !== null) ordered[k] = fm[k]
  for (const k of Object.keys(fm)) if (!(k in ordered) && fm[k] !== undefined && fm[k] !== null) ordered[k] = fm[k]
  return '---\n' + dump(ordered, { schema: CORE_SCHEMA, lineWidth: -1, flowLevel: 1 }) + '---\n'
}

export function compose(fm: Frontmatter, body: string) {
  return serializeFrontmatter(fm) + '\n' + body.replace(/^\n+/, '')
}

// ---------- seções ----------

interface Section {
  title: string
  key: string
  /** linha do cabeçalho ## */
  start: number
  /** primeira linha depois da seção (exclusivo) */
  end: number
}

export function sections(lines: string[]): Section[] {
  const out: Section[] = []
  let inFence = false
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) inFence = !inFence
    if (inFence) return
    const m = l.match(/^##\s+(.+?)\s*#*\s*$/)
    if (m) {
      if (out.length) out[out.length - 1].end = i
      out.push({ title: m[1], key: normalize(m[1]), start: i, end: lines.length })
    }
  })
  return out
}

const KEYS = {
  fases: ['fases', 'fase', 'etapas', 'checklist'],
  decisoes: ['decisoes em aberto', 'decisoes', 'decidir', 'bloqueios'],
  cobrancas: ['pessoas e cobrancas', 'cobrancas', 'cobrar', 'pessoas'],
  objetivo: ['objetivo', 'objetivo em uma frase'],
  log: ['log', 'historico'],
  paraVoce: ['para voce', 'para o leco', 'resumo para voce'],
}

const ASK_PREFIX: [RegExp, AskKind][] = [
  [/^(continuar|retomar|seguir)/, 'continuar'],
  [/^testar/, 'testar'],
  [/^decidir|^escolher/, 'decidir'],
  [/^(mandar |enviar )?mensagem|^avisar|^falar com|^responder/, 'mensagem'],
  [/^cobrar|^pedir/, 'cobrar'],
  [/^aprovar|^autorizar|^liberar/, 'aprovar'],
  [/^revisar|^conferir|^validar/, 'revisar'],
  [/^acesso|^credencia|^senha|^conta/, 'acesso'],
  [/^arquivar/, 'arquivar'],
]

export function askOf(item: CheckItem): Ask {
  const m = item.text.match(/^\*{0,2}([^:*]{2,40}?)\*{0,2}:\s+(.*)$/)
  if (m) {
    const key = normalize(m[1])
    const hit = ASK_PREFIX.find(([re]) => re.test(key))
    if (hit) return { ...item, kind: hit[1], label: m[2].trim() }
  }
  return { ...item, kind: 'outro', label: item.text }
}

const LABEL_RE = /^\s*\*\*([^*]+?):?\*\*:?\s*(.*)$/

function parseParaVoce(lines: string[], sec?: Section): ParaVoce | undefined {
  if (!sec) return undefined
  const pv: ParaVoce = { acoes: [] }
  let field: 'resumo' | 'situacao' | 'precisa' | 'conferido' | undefined
  const add = (k: 'resumo' | 'situacao', t: string) => {
    if (t) pv[k] = pv[k] ? `${pv[k]} ${t}` : t
  }
  for (let i = sec.start + 1; i < sec.end; i++) {
    const line = lines[i]
    const lm = line.match(LABEL_RE)
    if (lm) {
      const k = normalize(lm[1])
      const rest = lm[2].trim()
      if (k.startsWith('do que se trata') || k === 'resumo') field = 'resumo'
      else if (k.startsWith('como esta') || k === 'situacao') field = 'situacao'
      else if (k.startsWith('precisa de voce') || k.startsWith('o que precisa')) field = 'precisa'
      else if (k.startsWith('conferido')) field = 'conferido'
      else field = undefined
      if (field === 'resumo' || field === 'situacao') add(field, rest)
      else if (field === 'precisa' && rest) pv.nada = rest
      else if (field === 'conferido') {
        const dm = rest.match(/(\d{4}-\d{2}-\d{2})/)
        pv.conferido = dm?.[1]
        pv.fonte = rest.replace(/^.*?\d{4}-\d{2}-\d{2}\s*[·:—–-]?\s*/, '').trim() || undefined
      }
      continue
    }
    const cm = line.match(CHECK_RE)
    if (cm && !/^\s{2,}/.test(line)) {
      pv.acoes.push(askOf({ text: cm[4].trim(), done: cm[2] !== ' ', line: i }))
      field = 'precisa'
      continue
    }
    const t = line.trim()
    if (!t) continue
    if (field === 'resumo' || field === 'situacao') add(field, t)
    else if (field === 'precisa' && /^[-*]\s+/.test(t)) pv.nada = pv.nada ?? t.replace(/^[-*]\s+/, '')
  }
  return pv
}

function findSection(secs: Section[], names: string[]) {
  return secs.find((s) => names.includes(s.key))
}

function checkItems(lines: string[], sec?: Section): CheckItem[] {
  if (!sec) return []
  const out: CheckItem[] = []
  for (let i = sec.start + 1; i < sec.end; i++) {
    const m = lines[i].match(CHECK_RE)
    if (!m || /^\s{2,}/.test(lines[i])) continue
    const text = m[4].trim()
    const pm = text.match(/^\*{0,2}([^:*]{1,40}?)\*{0,2}:\s+(.*)$/)
    const since = text.match(/desde\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})/i)?.[1]
    out.push({ text, done: m[2] !== ' ', line: i, person: pm?.[1]?.trim(), since })
  }
  return out
}

export function parsePlan(file: {
  path: string
  project: string
  folder: string
  content: string
  mtime: number
  extras: string[]
}): Plan {
  const { data, body } = splitFrontmatter(file.content)
  const lines = body.split('\n')
  const secs = sections(lines)

  const status = STATUSES.includes(data.status as Status) ? (data.status as Status) : 'ideia'
  const prioridade = PRIORIDADES.includes(data.prioridade as Prioridade) ? (data.prioridade as Prioridade) : 'media'
  const h1 = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, '').trim()

  const fm: Frontmatter = {
    ...data,
    id: str(data.id) ?? `${file.project}-${file.folder.replace(/^\d{4}-\d{2}-\d{2}-/, '')}`,
    projeto: str(data.projeto) ?? file.project,
    titulo: str(data.titulo) ?? h1 ?? file.folder,
    status,
    prioridade,
    prazo: str(data.prazo),
    responsavel: str(data.responsavel),
    pessoas: list(data.pessoas),
    agente: data.agente === 'codex' ? 'codex' : data.agente === 'claude' ? 'claude' : undefined,
    worktree: str(data.worktree),
    origem: str(data.origem),
    documentos: list(data.documentos),
    atualizado: str(data.atualizado),
  }

  const faseSec = findSection(secs, KEYS.fases)
  const phases: Phase[] = checkItems(lines, faseSec).map((it) => {
    let name = it.text
    let date: string | undefined
    const dm = name.match(DATE_SUFFIX_RE)
    if (dm) {
      date = dm[1]
      name = name.slice(0, dm.index).trim()
    }
    const im = name.match(PHASE_ID_RE)
    return { id: im?.[1] ?? '', name: (im?.[2] ?? name).trim(), done: it.done, date, line: it.line }
  })

  const objSec = findSection(secs, KEYS.objetivo)
  const objetivo = objSec
    ? lines.slice(objSec.start + 1, objSec.end).join('\n').trim().split('\n\n')[0].trim()
    : ''

  return {
    path: file.path,
    folder: file.folder,
    projectSlug: file.project,
    mtime: file.mtime,
    extras: file.extras,
    raw: file.content,
    fm,
    body,
    phases,
    decisions: checkItems(lines, findSection(secs, KEYS.decisoes)),
    cobrancas: checkItems(lines, findSection(secs, KEYS.cobrancas)),
    objetivo,
    paraVoce: parseParaVoce(lines, findSection(secs, KEYS.paraVoce)),
  }
}

// ---------- derivados ----------

export function progress(p: Plan) {
  const total = p.phases.length
  const done = p.phases.filter((f) => f.done).length
  return { done, total, pct: total ? done / total : p.fm.status === 'feito' ? 1 : 0 }
}

export function nextPhase(p: Plan) {
  return p.phases.find((f) => !f.done)
}

export function phaseLabel(f: Phase) {
  return f.id ? `${f.id} ${f.name}` : f.name
}

/** o que está pendente para o usuário neste plano (seção Para você) */
export function pendingAsks(p: Plan) {
  return p.paraVoce?.acoes.filter((a) => !a.done) ?? []
}

export const ASK_LABEL: Record<AskKind, string> = {
  get continuar() {
    return t('Continuar', 'Continue')
  },
  get testar() {
    return t('Testar no app', 'Test in the app')
  },
  get decidir() {
    return t('Decidir', 'Decide')
  },
  get mensagem() {
    return t('Mensagem', 'Message')
  },
  get cobrar() {
    return t('Cobrar', 'Follow up')
  },
  get aprovar() {
    return t('Aprovar', 'Approve')
  },
  get revisar() {
    return t('Revisar', 'Review')
  },
  get acesso() {
    return t('Acesso', 'Access')
  },
  get arquivar() {
    return t('Arquivar', 'Archive')
  },
  get outro() {
    return t('Fazer', 'Do')
  },
}

// ---------- mutações (puras: devolvem o novo texto do arquivo) ----------

function appendLog(lines: string[], text: string, date: string) {
  const secs = sections(lines)
  const log = findSection(secs, KEYS.log)
  const entry = `- ${date}: ${text}`
  if (!log) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', '## Log', entry, '')
    return
  }
  let at = log.end
  while (at > log.start + 1 && lines[at - 1].trim() === '') at--
  lines.splice(at, 0, entry)
}

function finish(p: Plan, lines: string[], patch: Partial<Frontmatter> = {}, log?: string) {
  const date = todayISO()
  if (log) appendLog(lines, log, date)
  const fm: Frontmatter = { ...p.fm, ...patch, atualizado: date }
  return compose(fm, lines.join('\n'))
}

export function setFields(p: Plan, patch: Partial<Frontmatter>, log?: string) {
  return finish(p, p.body.split('\n'), patch, log)
}

/** status automático: primeira fase marcada → andamento; todas → revisão. Só o usuário marca "feito". */
function autoStatus(p: Plan, phases: { done: boolean }[]): Status {
  const done = phases.filter((f) => f.done).length
  if (phases.length && done === phases.length && ['ideia', 'proximo', 'andamento'].includes(p.fm.status)) return 'revisao'
  if (done > 0 && ['ideia', 'proximo'].includes(p.fm.status)) return 'andamento'
  if (done < phases.length && p.fm.status === 'revisao') return 'andamento'
  return p.fm.status
}

export function togglePhase(p: Plan, index: number) {
  const f = p.phases[index]
  if (!f) return p.raw
  const lines = p.body.split('\n')
  const date = todayISO()
  const done = !f.done
  const m = lines[f.line].match(CHECK_RE)
  if (!m) return p.raw
  let text = m[4].replace(DATE_SUFFIX_RE, '')
  if (done) text = `${text} — ${date}`
  lines[f.line] = `${m[1]}${done ? 'x' : ' '}${m[3]}${text}`
  const phases = p.phases.map((x, i) => (i === index ? { ...x, done } : x))
  const status = autoStatus(p, phases)
  const msg = done ? `${phaseLabel(f)} concluída` : `${phaseLabel(f)} reaberta`
  return finish(p, lines, { status }, msg + (status !== p.fm.status ? ` · status → ${status}` : ''))
}

export function toggleLine(p: Plan, line: number) {
  const lines = p.body.split('\n')
  const m = lines[line]?.match(CHECK_RE)
  if (!m) return p.raw
  lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}${m[4]}`
  return finish(p, lines)
}

function ensureSection(lines: string[], title: string, names: string[], after: string[][]) {
  let secs = sections(lines)
  let sec = findSection(secs, names)
  if (sec) return sec
  // insere depois da primeira seção existente da lista `after`, senão antes do Log, senão no fim
  let at = lines.length
  for (const a of after) {
    const s = findSection(secs, a)
    if (s) {
      at = s.end
      break
    }
  }
  if (at === lines.length) {
    const log = findSection(secs, KEYS.log)
    if (log) at = log.start
  }
  const block = [`## ${title}`, '']
  if (at > 0 && lines[at - 1]?.trim() !== '') block.unshift('')
  lines.splice(at, 0, ...block)
  secs = sections(lines)
  sec = findSection(secs, names)!
  return sec
}

function insertInSection(lines: string[], sec: { start: number; end: number }, line: string) {
  let at = sec.end
  while (at > sec.start + 1 && lines[at - 1].trim() === '') at--
  lines.splice(at, 0, line)
  if (lines[at + 1] !== undefined && lines[at + 1].trim() !== '' && /^##\s/.test(lines[at + 1])) lines.splice(at + 1, 0, '')
}

export function addPhase(p: Plan, name: string) {
  const lines = p.body.split('\n')
  const sec = ensureSection(lines, 'Fases', KEYS.fases, [['contexto'], KEYS.objetivo])
  const max = p.phases.reduce((m, f) => Math.max(m, Number(f.id.slice(1)) || 0), 0)
  insertInSection(lines, sec, `- [ ] F${max + 1} ${name.trim()}`)
  const status = p.fm.status === 'revisao' ? 'andamento' : p.fm.status
  return finish(p, lines, { status }, `fase F${max + 1} adicionada: ${name.trim()}`)
}

export function renamePhase(p: Plan, index: number, name: string) {
  const f = p.phases[index]
  if (!f) return p.raw
  const lines = p.body.split('\n')
  const m = lines[f.line].match(CHECK_RE)
  if (!m) return p.raw
  const label = f.id ? `${f.id} ${name.trim()}` : name.trim()
  lines[f.line] = `${m[1]}${m[2]}${m[3]}${label}${f.date ? ` — ${f.date}` : ''}`
  return finish(p, lines)
}

export function removePhase(p: Plan, index: number) {
  const f = p.phases[index]
  if (!f) return p.raw
  const lines = p.body.split('\n')
  lines.splice(f.line, 1)
  return finish(p, lines, {}, `${phaseLabel(f)} removida`)
}

export function addItem(p: Plan, kind: 'decisoes' | 'cobrancas', text: string) {
  const lines = p.body.split('\n')
  const sec =
    kind === 'decisoes'
      ? ensureSection(lines, 'Decisões em aberto', KEYS.decisoes, [KEYS.fases, ['contexto']])
      : ensureSection(lines, 'Pessoas e cobranças', KEYS.cobrancas, [KEYS.decisoes, KEYS.fases])
  const suffix = kind === 'cobrancas' && !/desde\s/i.test(text) ? ` (desde ${todayISO()})` : ''
  insertInSection(lines, sec, `- [ ] ${text.trim()}${suffix}`)
  return finish(p, lines)
}

// ---------- criação ----------

export function newPlanMarkdown(input: {
  id: string
  projeto: string
  titulo: string
  prioridade: Prioridade
  prazo?: string
  objetivo?: string
  fases: string[]
  agente?: string
  worktree?: string
}) {
  const date = todayISO()
  const fm: Frontmatter = {
    id: input.id,
    projeto: input.projeto,
    titulo: input.titulo,
    status: 'proximo',
    prioridade: input.prioridade,
    prazo: input.prazo || undefined,
    responsavel: apelidoUsuario(),
    pessoas: [],
    agente: (input.agente as Frontmatter['agente']) || 'claude',
    worktree: input.worktree || undefined,
    atualizado: date,
  }
  const fases = input.fases.length ? input.fases.map((f, i) => `- [ ] F${i + 1} ${f}`) : [`- [ ] F1 ${t('Definir as fases', 'Define the phases')}`]
  const body = [
    `# ${input.titulo}`,
    '',
    '## Para você',
    `**Do que se trata:** ${input.objetivo?.trim() || t('a definir.', 'to be defined.')}`,
    '**Precisa de você:**',
    input.fases.length
      ? `- [ ] Continuar: ${t('abrir o Conversar e pedir para a IA começar pela F1', 'open Chat and ask the AI to start with F1')}`
      : `- [ ] Continuar: ${t('abrir o Conversar e pedir para a IA detalhar as fases', 'open Chat and ask the AI to detail the phases')}`,
    '',
    '## Objetivo',
    input.objetivo?.trim() || '_Uma frase._',
    '',
    '## Contexto',
    '',
    '## Fases',
    ...fases,
    '',
    '## Decisões em aberto',
    '',
    '## Pessoas e cobranças',
    '',
    '## Critério de pronto',
    '',
    '## Log',
    `- ${date}: plano criado`,
    '',
  ].join('\n')
  return compose(fm, body)
}
