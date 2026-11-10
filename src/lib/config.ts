import { CORE_SCHEMA, dump, load } from 'js-yaml'
import type { Config, ContextKey, ProjectInfo } from './types'
import { splitFrontmatter } from './plan'
import { t } from './i18n'

/** pasta nova: sem projetos (o onboarding pergunta), trabalho de segunda a sexta das 9h às 18h */
export const DEFAULT_CONFIG: Config = {
  projetos: {},
  contextos: {
    trabalho: { dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00', ordem: [], ocultar: [] },
    'fora-do-horario': { ordem: [], ocultar: [] },
  },
}

const HEADER = `# Letco — projetos e ordem por contexto.
# Editável à mão. "ordem" define a prioridade dos projetos na lista do dia.
# "ocultar": projetos que só aparecem naquele contexto se tiverem prazo vencendo.
# dias: 1 = segunda … 7 = domingo.
# "idioma" de um projeto: língua dos rascunhos de mensagem (en = inglês, o padrão; pt-BR = português).
# "usuario": quem usa o app (o nome vai nos pedidos à IA; apelidos ajudam a reconhecer a pessoa numa conversa; idioma: en para o app em inglês).
`

export function configToYaml(c: Config) {
  // horários entre aspas: em YAML 1.1 (ex.: Python) 09:00 sem aspas vira o número 540
  const body = dump(c, { schema: CORE_SCHEMA, lineWidth: -1, flowLevel: 3 }).replace(/^(\s+(?:inicio|fim)): (\d{1,2}:\d{2})$/gm, '$1: "$2"')
  return HEADER + '\n' + body
}

/** erro de leitura do projetos.yaml (null se está ok). Com erro, o app usa o padrão: sem ordem, sem nome, sem idiomas. */
export function configError(text: string | null): string | null {
  if (!text) return null
  try {
    const raw = load(text, { schema: CORE_SCHEMA })
    if (raw !== null && raw !== undefined && typeof raw !== 'object') return 'o arquivo não é uma lista de chaves'
    return null
  } catch (e) {
    return String((e as Error).message ?? e).split('\n')[0]
  }
}

export function parseConfig(text: string | null): Config {
  if (!text) return DEFAULT_CONFIG
  try {
    const raw = (load(text, { schema: CORE_SCHEMA }) ?? {}) as Partial<Config>
    const ctx = (raw.contextos ?? {}) as Partial<Config['contextos']>
    const u = raw.usuario as Config['usuario'] | undefined
    return {
      ...(u?.nome ? { usuario: { nome: String(u.nome), ...(u.apelidos?.length ? { apelidos: u.apelidos.map(String) } : {}), ...(u.idioma === 'en' ? { idioma: 'en' as const } : {}) } } : {}),
      projetos: raw.projetos ?? {},
      contextos: {
        trabalho: { ...DEFAULT_CONFIG.contextos.trabalho, ...(ctx.trabalho ?? {}) },
        'fora-do-horario': { ...DEFAULT_CONFIG.contextos['fora-do-horario'], ...(ctx['fora-do-horario'] ?? {}) },
      },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

const PALETTE = ['#5b6ee1', '#e0723a', '#2f9e6e', '#c2489a', '#d4a72c', '#3b9bd1', '#8a5cd6', '#d1495b', '#4aa39b', '#7d8a2e', '#b06a3b']

export function colorFor(slug: string) {
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function titleCase(slug: string) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function buildProjects(cfg: Config, files: { slug: string; content: string | null }[]): ProjectInfo[] {
  const slugs = new Set([...files.map((f) => f.slug), ...Object.keys(cfg.projetos)])
  return [...slugs].map((slug) => {
    const file = files.find((f) => f.slug === slug)
    const fm = file?.content ? splitFrontmatter(file.content).data : {}
    const c = cfg.projetos[slug] ?? {}
    return {
      slug,
      nome: c.nome ?? (fm.nome as string) ?? titleCase(slug),
      cor: c.cor ?? colorFor(slug),
      worktree: c.worktree ?? (fm.worktree as string | undefined),
      idioma: c.idioma === 'pt-BR' ? 'pt-BR' : 'en',
      content: file?.content,
    }
  })
}

function minutes(hhmm?: string) {
  const [h, m] = (hhmm ?? '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function detectContext(cfg: Config, now = new Date()): ContextKey {
  const t = cfg.contextos.trabalho
  const dow = now.getDay() === 0 ? 7 : now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const inDays = (t.dias ?? [1, 2, 3, 4, 5]).includes(dow)
  const inHours = mins >= minutes(t.inicio ?? '09:00') && mins < minutes(t.fim ?? '18:00')
  return inDays && inHours ? 'trabalho' : 'fora-do-horario'
}

/** ordem dos projetos no contexto: os listados primeiro, o resto em ordem alfabética */
export function orderedSlugs(cfg: Config, ctx: ContextKey, all: string[]) {
  const ordem = cfg.contextos[ctx].ordem ?? []
  const listed = ordem.filter((s) => all.includes(s))
  const rest = all.filter((s) => !listed.includes(s)).sort()
  return [...listed, ...rest]
}

export const CONTEXT_LABEL: Record<ContextKey, string> = {
  get trabalho() {
    return t('Trabalho', 'Work')
  },
  get 'fora-do-horario'() {
    return t('Fora do horário', 'Off hours')
  },
}
