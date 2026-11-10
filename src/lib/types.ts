export const STATUSES = ['ideia', 'proximo', 'andamento', 'revisao', 'bloqueado', 'feito', 'arquivado'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORIDADES = ['alta', 'media', 'baixa'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

export type Agente = 'claude' | 'codex'
/** onde o Conversar abre o agente */
export type Opener = 'claude-app' | 'orca' | 'terminal'
export type ContextKey = 'trabalho' | 'fora-do-horario'

export interface Frontmatter {
  id: string
  projeto: string
  titulo: string
  status: Status
  prioridade: Prioridade
  prazo?: string
  responsavel?: string
  pessoas?: string[]
  agente?: Agente
  worktree?: string
  origem?: string
  documentos?: string[]
  atualizado?: string
  [key: string]: unknown
}

export interface Phase {
  /** F1, F2… (vazio se o item não tiver id) */
  id: string
  name: string
  done: boolean
  date?: string
  /** índice da linha no corpo */
  line: number
}

export interface CheckItem {
  text: string
  done: boolean
  line: number
  person?: string
  since?: string
}

/** o que um item de "Precisa de você" pede: muda o ícone e o atalho na tela */
export type AskKind = 'continuar' | 'testar' | 'decidir' | 'mensagem' | 'cobrar' | 'aprovar' | 'revisar' | 'acesso' | 'arquivar' | 'outro'

export interface Ask extends CheckItem {
  kind: AskKind
  /** o texto sem o prefixo ("Testar no app: …" → "…") */
  label: string
}

/** seção "## Para você" no topo do plano: explicação mastigada e o que depende do usuário */
export interface ParaVoce {
  resumo?: string
  situacao?: string
  acoes: Ask[]
  /** "Precisa de você: nada agora — …" */
  nada?: string
  /** data da última conferência (AAAA-MM-DD) e o que foi olhado */
  conferido?: string
  fonte?: string
}

export interface Plan {
  path: string
  folder: string
  projectSlug: string
  mtime: number
  extras: string[]
  raw: string
  fm: Frontmatter
  body: string
  phases: Phase[]
  decisions: CheckItem[]
  cobrancas: CheckItem[]
  objetivo: string
  paraVoce?: ParaVoce
}

/** idioma dos rascunhos de mensagem do projeto (Mensagem, Cobrar, posts) */
export type Idioma = 'en' | 'pt-BR'

export interface ProjectInfo {
  slug: string
  nome: string
  cor: string
  worktree?: string
  idioma: Idioma
  content?: string | null
}

export interface ContextConfig {
  dias?: number[]
  inicio?: string
  fim?: string
  ordem: string[]
  /** projetos que só aparecem neste contexto se tiverem prazo vencendo */
  ocultar?: string[]
}

/** quem usa o app: o nome vai nos pedidos à IA; apelidos ajudam a reconhecer a pessoa numa conversa */
export interface Usuario {
  nome: string
  apelidos?: string[]
  /** idioma do app (telas, comando planos, respostas da IA); sem o campo, português */
  idioma?: Idioma
}

export interface Config {
  usuario?: Usuario
  projetos: Record<string, { nome?: string; cor?: string; worktree?: string; idioma?: Idioma }>
  contextos: Record<ContextKey, ContextConfig>
}

export interface WorkspaceRaw {
  root: string
  exists: boolean
  isGit: boolean
  projetosYaml: string | null
  hoje: string | null
  semana: string | null
  /** tarefas/AAAA-MM-DD.md mais recente: [nome do arquivo, conteúdo] */
  tarefas?: [string, string] | null
  /** discord/canais.yaml */
  discord?: string | null
  projects: { slug: string; content: string | null }[]
  plans: { path: string; project: string; folder: string; content: string; mtime: number; extras: string[] }[]
  entrada: string[]
}

export interface Env {
  root: string
  home: string
  hasOrca: boolean
  hasClaudeApp: boolean
  hasClaude: boolean
  hasCodex: boolean
  hasGit: boolean
  hasNode: boolean
  hasGh: boolean
  skillInstalled: boolean
  /** a skill instalada é diferente da que vem nesta versão do app */
  skillOutdated?: boolean
  cliInstalled: boolean
}

export type View =
  | { kind: 'today' }
  | { kind: 'all' }
  | { kind: 'project'; slug: string }
  | { kind: 'plan'; id: string; from?: View }
  | { kind: 'settings' }
  | { kind: 'routines' }
  | { kind: 'divulgacao' }
  | { kind: 'resumos' }
  | { kind: 'docs' }
  | { kind: 'discord' }
  | { kind: 'console' }
