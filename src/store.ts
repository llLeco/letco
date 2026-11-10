import { useMemo } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import { api } from './lib/api'
import type { Agente, Ask, Config, ContextKey, Env, Idioma, Opener, Plan, Prioridade, ProjectInfo, Usuario, View, WorkspaceRaw } from './lib/types'
import { setUsuario } from './lib/usuario'
import { idiomaDoSistema, setLang, t } from './lib/i18n'
import { buildProjects, configToYaml, detectContext, DEFAULT_CONFIG, orderedSlugs, parseConfig, configError } from './lib/config'
import { newPlanMarkdown, parsePlan, slugify, toggleLine } from './lib/plan'
import { matchingAsk, setTarefa, type Tarefa } from './lib/tarefas'
import { todayISO } from './lib/dates'
import { placeEntrada } from './lib/migrate'
import { buildRepoIndex, linkPRs, mostCited, pickCodeDir, prContext, type LocalRepo, type RepoIndex } from './lib/prs'
import { askPrompt, chatPrompt, conferirPrompt, discordPrompt, juntarPlanosPrompt, organizarPrompt, planPrompt, projectPrompt } from './lib/prompt'
import { rotinasAtualizarPrompt, rotinasInstalarPrompt } from './lib/rotinas'

const PREF_KEY = 'planos:prefs'
interface Prefs {
  opener: Opener
}
function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { opener?: Opener; preferOrca?: boolean }
    // preferência antiga: preferOrca false queria o Terminal
    return { opener: saved.opener ?? (saved.preferOrca === false ? 'terminal' : 'claude-app') }
  } catch {
    return { opener: 'claude-app' }
  }
}

export const OPENER_LABEL: Record<Opener, string> = {
  get 'claude-app'() {
    return t('app do Claude', 'the Claude app')
  },
  orca: 'Orca',
  terminal: 'Terminal',
}
const AGENT_LABEL: Record<Agente, string> = { claude: 'Claude', codex: 'Codex' }

interface State {
  ready: boolean
  ws: WorkspaceRaw | null
  env: Env | null
  config: Config
  plans: Plan[]
  projects: ProjectInfo[]
  ctxOverride: ContextKey | null
  view: View
  paletteOpen: boolean
  newPlanFor: string | null | false
  newProjectOpen: boolean
  prefs: Prefs
  /** worktree → dono/repo do GitHub, para os links de PR */
  remotes: Record<string, string>
  /** clones locais dos repos do GitHub (carregados na primeira vez que a IA abre) */
  clones: LocalRepo[] | null
  /** pasta do código do plano no Mac (worktree, clone citado ou clone principal do repo) */
  codeDir: (plan: Plan) => Promise<string | undefined>

  load: () => Promise<void>
  go: (v: View) => void
  back: () => void
  context: () => ContextKey
  toggleContext: () => void
  orderedProjects: () => ProjectInfo[]
  project: (slug: string) => ProjectInfo | undefined
  savePlan: (plan: Plan, raw: string, msg: string) => Promise<void>
  /** marca/desmarca uma tarefa do dia (e o mesmo item em "Precisa de você" do plano) */
  toggleTarefa: (t: Tarefa) => Promise<void>
  createPlan: (input: { projeto: string; titulo: string; prioridade: Prioridade; prazo?: string; objetivo?: string; fases: string[] }) => Promise<Plan | null>
  createProject: (nome: string) => Promise<string | null>
  /** idioma dos rascunhos de mensagem do projeto (en é o padrão e some do yaml) */
  setProjectIdioma: (slug: string, idioma: Idioma) => Promise<void>
  /** esconde/mostra o projeto no contexto atual (lista "ocultar" do projetos.yaml) */
  setProjectHidden: (slug: string, hidden: boolean) => Promise<void>
  /** assistente de primeira vez aberto (continua aberto depois de criar a pasta, até o último passo) */
  onboarding: boolean
  setOnboarding: (open: boolean) => void
  /** idioma do app; trocar redesenha as telas */
  lang: Idioma
  setLangUI: (l: Idioma) => void
  /** cria (ou completa) ~/planos com o perfil, os projetos e o horário de trabalho do onboarding */
  setupWorkspace: (o: { nome: string; apelidos: string[]; idioma: Idioma; projetos: string[]; trabalho: { dias: number[]; inicio: string; fim: string } }) => Promise<void>
  saveUsuario: (u: Usuario) => Promise<void>
  /** abre no app do Claude o pedido para juntar os planos que a pessoa já tem espalhados no Mac */
  juntarPlanos: () => Promise<void>
  /** abre no app do Claude o pedido para criar as rotinas do Letco como tarefas agendadas */
  instalarRotinas: (ids: string[], atualizar?: boolean) => Promise<void>
  /** pede à IA (Console) para ler os arquivos de entrada/organizar/ e pôr cada um no lugar */
  organizar: (rels: string[]) => void
  /** arquivos soltos na janela: copia para entrada/organizar/ e pede à IA para organizar */
  soltarArquivos: (paths: string[]) => Promise<void>
  /** link ou texto colado na tela Documentos: vira uma nota em entrada/organizar/ e segue o mesmo caminho */
  guardarNota: (texto: string) => Promise<void>
  importEntrada: () => Promise<void>
  talk: (plan: Plan, agent?: Agente, opener?: Opener) => Promise<void>
  talkProject: (slug: string, agent: Agente, opener?: Opener) => Promise<void>
  /** abre uma sessão de IA que confere o plano no GitHub e reescreve "Para você" */
  conferir: (plan: Plan) => Promise<void>
  /** abre a IA focada num item de "Para você" (aprovar, continuar, decidir…) */
  act: (plan: Plan, ask: Ask, tarefaFile?: string) => Promise<void>
  /** abre o Claude Code numa conversa sobre um item qualquer (tarefa do dia, cobrança), no worktree do plano se houver */
  talkItem: (prompt: string, plan?: Plan) => Promise<void>
  setPrefs: (p: Partial<Prefs>) => void
  setPalette: (open: boolean) => void
  openNewPlan: (project?: string | null) => void
  closeNewPlan: () => void
  setNewProjectOpen: (open: boolean) => void
  /** projeto que está pedindo confirmação para sair da lista */
  archiveProjectFor: string | null
  setArchiveProjectFor: (slug: string | null) => void
  /** janela "Colar conversa": projeto escolhido de início ('' = o primeiro da ordem) */
  pasteChatFor: string | null
  setPasteChatFor: (slug: string | null) => void
  /** guarda a conversa colada fora do git e abre o Claude para tirar dela tarefas e cobranças */
  extractChat: (slug: string, text: string, origem: string) => Promise<boolean>
  /** abre o Claude para rodar `planos discord --ler` e extrair dos canais */
  readDiscord: () => Promise<void>
  /** pedido esperando para ser colado no agente do Console */
  consoleQueue: string | null
  /** manda um pedido ao agente do Console e abre a aba */
  sendToConsole: (text: string) => void
  takeConsoleQueue: () => string | null
  /** "excluir" projeto = mover a pasta para arquivo/projetos e tirar de projetos.yaml (dá para desfazer) */
  archiveProject: (slug: string) => Promise<void>
}

// commits agrupados: várias edições seguidas viram um commit só
let commitTimer: ReturnType<typeof setTimeout> | undefined
const pendingMsgs = new Set<string>()
function scheduleCommit(msg: string) {
  pendingMsgs.add(msg)
  clearTimeout(commitTimer)
  commitTimer = setTimeout(() => {
    const message = [...pendingMsgs].slice(0, 6).join('; ')
    pendingMsgs.clear()
    commitOrWarn(message)
  }, 2500)
}

/** commit em ~/planos; se falhar, avisa (a mudança já está no arquivo, só não entrou no histórico) */
export function commitOrWarn(message: string) {
  return api.gitCommit(message).catch((e) => {
    toast.error(t('Não consegui gravar no histórico (git)', "Couldn't save to history (git)"), {
      id: 'git-commit',
      description: t(`A mudança está salva no arquivo, mas o commit falhou: ${String(e).trim().slice(0, 200)}`, `The change is saved in the file, but the commit failed: ${String(e).trim().slice(0, 200)}`),
      duration: 10000,
    })
    return false
  })
}

function hydrate(ws: WorkspaceRaw) {
  const config = parseConfig(ws.projetosYaml)
  const erro = configError(ws.projetosYaml)
  if (erro) {
    toast.error(t('O projetos.yaml tem um erro e está sendo ignorado', 'projetos.yaml has an error and is being ignored'), {
      id: 'config-erro',
      description: t(`Ordem, projetos escondidos, seu nome e os idiomas voltam ao padrão até corrigir. ${erro}`, `Order, hidden projects, your name and languages fall back to defaults until it's fixed. ${erro}`),
      duration: Infinity,
    })
  } else toast.dismiss('config-erro')
  setUsuario(config.usuario)
  // sem projetos.yaml (primeira vez), o idioma do sistema; com a pasta, o do perfil (sem campo = português)
  const lang: Idioma = ws.projetosYaml ? (config.usuario?.idioma ?? 'pt-BR') : useStore.getState().lang
  setLang(lang)
  const plans = ws.plans.map(parsePlan)
  const files = [...ws.projects]
  for (const p of plans) if (!files.some((f) => f.slug === p.projectSlug)) files.push({ slug: p.projectSlug, content: null })
  const projects = buildProjects(config, files)
  return { config, plans, projects, lang }
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  ws: null,
  env: null,
  config: DEFAULT_CONFIG,
  plans: [],
  projects: [],
  ctxOverride: null,
  onboarding: false,
  lang: idiomaDoSistema(),
  view: { kind: 'today' },
  paletteOpen: false,
  newPlanFor: false,
  newProjectOpen: false,
  archiveProjectFor: null,
  pasteChatFor: null,
  consoleQueue: null,
  prefs: loadPrefs(),
  remotes: {},
  clones: null,

  async load() {
    try {
      const [ws, env] = await Promise.all([api.loadWorkspace(), get().env ? Promise.resolve(get().env!) : api.environment()])
      set({ ws, env, ready: true, ...hydrate(ws) })
      const wts = [...new Set(get().plans.flatMap((p) => (p.fm.worktree ? [p.fm.worktree] : [])))]
      api
        .gitRemotes(wts.filter((w) => !(w in get().remotes)))
        .then((r) => r.length && set({ remotes: { ...get().remotes, ...Object.fromEntries(r.filter((x): x is [string, string] => !!x[1])) } }))
        .catch(() => {})
    } catch (e) {
      toast.error(t('Não consegui ler ~/planos', "Couldn't read ~/planos"), { description: String(e) })
      set({ ready: true })
    }
  },

  go(v) {
    const cur = get().view
    if (v.kind === 'plan' && !v.from && cur.kind !== 'plan') v = { ...v, from: cur }
    set({ view: v, paletteOpen: false })
    document.querySelector('[data-main-scroll]')?.scrollTo({ top: 0 })
  },

  back() {
    const v = get().view
    if (v.kind === 'plan') set({ view: v.from ?? { kind: 'today' } })
  },

  context() {
    return get().ctxOverride ?? detectContext(get().config)
  },

  toggleContext() {
    const cur = get().context()
    const next: ContextKey = cur === 'trabalho' ? 'fora-do-horario' : 'trabalho'
    set({ ctxOverride: next === detectContext(get().config) ? null : next })
  },

  orderedProjects() {
    const { projects } = get()
    const order = orderedSlugs(get().config, get().context(), projects.map((p) => p.slug))
    return order.map((s) => projects.find((p) => p.slug === s)!).filter(Boolean)
  },

  project(slug) {
    return get().projects.find((p) => p.slug === slug)
  },

  async savePlan(plan, raw, msg) {
    if (raw === plan.raw) return
    const updated = parsePlan({ path: plan.path, project: plan.projectSlug, folder: plan.folder, content: raw, mtime: Date.now(), extras: plan.extras })
    set({ plans: get().plans.map((p) => (p.path === plan.path ? updated : p)) })
    try {
      await api.writeText(plan.path, raw)
      scheduleCommit(`${plan.fm.id}: ${msg}`)
    } catch (e) {
      toast.error(t('Não consegui salvar', "Couldn't save"), { description: String(e) })
      set({ plans: get().plans.map((p) => (p.path === plan.path ? plan : p)) })
    }
  },

  async toggleTarefa(tarefa) {
    const ws = get().ws
    if (!ws?.tarefas) return
    const [file, raw] = ws.tarefas
    const next = setTarefa(raw, tarefa.line, !tarefa.done)
    set({ ws: { ...ws, tarefas: [file, next] } })
    try {
      await api.writeText(`tarefas/${file}`, next)
      scheduleCommit(`tarefas: ${tarefa.done ? 'reaberta' : 'feita'} ${tarefa.label.slice(0, 50)}`)
    } catch (e) {
      toast.error(t('Não consegui salvar', "Couldn't save"), { description: String(e) })
      set({ ws: { ...ws, tarefas: [file, raw] } })
      return
    }
    const plan = get().plans.find((p) => p.fm.id === tarefa.planId)
    const ask = matchingAsk(plan, tarefa)
    if (plan && ask && ask.done === tarefa.done) await get().savePlan(plan, toggleLine(plan, ask.line), `${tarefa.done ? 'reaberto' : 'feito'}: ${ask.label.slice(0, 60)}`)
  },

  async createPlan(input) {
    const slug = slugify(input.titulo)
    const folder = `${todayISO()}-${slug}`
    const rel = `projetos/${input.projeto}/planos/${folder}/plano.md`
    let id = `${input.projeto}-${slug}`
    if (get().plans.some((p) => p.fm.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`
    const project = get().project(input.projeto)
    const content = newPlanMarkdown({ ...input, id, worktree: project?.worktree })
    try {
      await api.writeText(rel, content)
      scheduleCommit(`${id}: plano criado`)
      await get().load()
      const plan = get().plans.find((p) => p.path === rel) ?? null
      if (plan) get().go({ kind: 'plan', id: plan.fm.id })
      toast.success(t('Plano criado', 'Plan created'), { description: input.titulo })
      return plan
    } catch (e) {
      toast.error(t('Não consegui criar o plano', "Couldn't create the plan"), { description: String(e) })
      return null
    }
  },

  async createProject(nome) {
    const slug = slugify(nome)
    if (!slug) return null
    const cfg = structuredClone(get().config)
    cfg.projetos[slug] = { ...(cfg.projetos[slug] ?? {}), nome: nome.trim() }
    for (const k of Object.keys(cfg.contextos) as ContextKey[]) {
      if (!cfg.contextos[k].ordem.includes(slug)) cfg.contextos[k].ordem.push(slug)
    }
    await api.writeText('projetos.yaml', configToYaml(cfg))
    await api.writeText(
      `projetos/${slug}/projeto.md`,
      `---\nnome: ${nome.trim()}\n---\n\n# ${nome.trim()}\n\nContexto do projeto: repositórios, worktrees, pessoas.\n`,
    )
    scheduleCommit(`projeto ${slug} criado`)
    await get().load()
    get().go({ kind: 'project', slug })
    return slug
  },

  async setProjectIdioma(slug, idioma) {
    const cfg = structuredClone(get().config)
    const cur = cfg.projetos[slug] ?? {}
    if (idioma === 'en') delete cur.idioma
    else cur.idioma = idioma
    cfg.projetos[slug] = cur
    await api.writeText('projetos.yaml', configToYaml(cfg))
    scheduleCommit(`projeto ${slug}: mensagens em ${idioma}`)
    await get().load()
  },

  async setProjectHidden(slug, hidden) {
    const ctx = get().context()
    const cfg = structuredClone(get().config)
    const cur = (cfg.contextos[ctx].ocultar ?? []).filter((s) => s !== slug)
    cfg.contextos[ctx].ocultar = hidden ? [...cur, slug] : cur
    set({ config: cfg })
    try {
      await api.writeText('projetos.yaml', configToYaml(cfg))
    } catch (e) {
      toast.error(t('Não consegui salvar', "Couldn't save"), { description: String(e) })
      await get().load()
      return
    }
    scheduleCommit(`projeto ${slug}: ${hidden ? 'escondido' : 'visível'} em ${ctx === 'trabalho' ? 'trabalho' : 'fora do horário'}`)
    await get().load()
  },

  setPasteChatFor(slug) {
    set({ pasteChatFor: slug })
  },

  async extractChat(slug, text, origem) {
    const project = get().project(slug)
    if (!project || !text.trim()) return false
    const root = get().env?.root ?? '~/planos'
    const now = new Date()
    const stamp = `${todayISO(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const rel = `.indice/conversas/${slug}-${stamp}.md`
    try {
      await api.writeText(rel, `<!-- ${origem || 'Discord'} · colado em ${todayISO(now)} -->\n\n${text.trim()}\n`)
      const via = await api.launchAgent({
        agent: 'claude',
        worktree: root,
        cwd: root,
        prompt: chatPrompt(project, get().plans.filter((p) => p.projectSlug === slug), `${root}/${rel}`, root, origem.trim(), todayISO(now)),
        opener: get().prefs.opener,
      })
      toast.success(t(`Conversa enviada ao Claude (${OPENER_LABEL[via as Opener] ?? via})`, `Conversation sent to Claude (${OPENER_LABEL[via as Opener] ?? via})`), {
        description: via === 'claude-app' ? t('O pedido já está na caixa: é só enviar.', 'The request is in the box: just send it.') : t('As tarefas aparecem em Hoje quando ele terminar.', 'The tasks show up in Today when it finishes.'),
      })
      return true
    } catch (e) {
      toast.error(t('Não consegui abrir o Claude', "Couldn't open Claude"), { description: String(e) })
      return false
    }
  },

  sendToConsole(text) {
    set({ consoleQueue: text })
    get().go({ kind: 'console' })
  },

  takeConsoleQueue() {
    const q = get().consoleQueue
    if (q) set({ consoleQueue: null })
    return q
  },

  async readDiscord() {
    const root = get().env?.root ?? '~/planos'
    try {
      const via = await api.launchAgent({ agent: 'claude', worktree: root, cwd: root, prompt: discordPrompt(root), opener: get().prefs.opener })
      toast.success(t(`Leitura do Discord no ${OPENER_LABEL[via as Opener] ?? via}`, `Reading Discord in ${OPENER_LABEL[via as Opener] ?? via}`), {
        description: via === 'claude-app' ? t('O pedido já está na caixa: é só enviar.', 'The request is in the box: just send it.') : t('As tarefas aparecem em Hoje quando ele terminar.', 'The tasks show up in Today when it finishes.'),
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o Claude', "Couldn't open Claude"), { description: String(e) })
    }
  },

  setArchiveProjectFor(slug) {
    set({ archiveProjectFor: slug })
  },

  async archiveProject(slug) {
    const project = get().project(slug)
    if (!project) return
    const oldYaml = get().ws?.projetosYaml ?? configToYaml(get().config)
    const cfg = structuredClone(get().config)
    delete cfg.projetos[slug]
    for (const k of Object.keys(cfg.contextos) as ContextKey[]) {
      cfg.contextos[k].ordem = (cfg.contextos[k].ordem ?? []).filter((s) => s !== slug)
      cfg.contextos[k].ocultar = (cfg.contextos[k].ocultar ?? []).filter((s) => s !== slug)
    }
    const hasFolder = project.content != null || get().plans.some((p) => p.projectSlug === slug)
    let dest: string | null = null
    try {
      if (hasFolder) {
        dest = `arquivo/projetos/${slug}`
        await api.moveFile(`projetos/${slug}`, dest).catch(async () => {
          dest = `arquivo/projetos/${slug}-${todayISO()}-${Date.now().toString(36).slice(-4)}`
          await api.moveFile(`projetos/${slug}`, dest)
        })
      }
      await api.writeText('projetos.yaml', configToYaml(cfg))
    } catch (e) {
      toast.error(t('Não consegui tirar o projeto', "Couldn't remove the project"), { description: String(e) })
      await get().load()
      return
    }
    scheduleCommit(`projeto ${slug} arquivado`)
    const v = get().view
    if ((v.kind === 'project' && v.slug === slug) || (v.kind === 'plan' && get().plans.find((p) => p.fm.id === v.id)?.projectSlug === slug)) {
      set({ view: { kind: 'today' } })
    }
    await get().load()
    toast.success(t(`${project.nome} saiu da lista`, `${project.nome} removed from the list`), {
      description: dest ? t(`Os planos foram para ~/planos/${dest}.`, `The plans moved to ~/planos/${dest}.`) : undefined,
      duration: 8000,
      action: {
        label: t('Desfazer', 'Undo'),
        onClick: async () => {
          try {
            if (dest) await api.moveFile(dest, `projetos/${slug}`)
            await api.writeText('projetos.yaml', oldYaml)
            scheduleCommit(`projeto ${slug} restaurado`)
            await get().load()
            toast.success(t(`${project.nome} voltou`, `${project.nome} is back`))
          } catch (e) {
            toast.error(t('Não consegui desfazer', "Couldn't undo"), { description: String(e) })
          }
        },
      },
    })
  },

  setOnboarding(open) {
    set({ onboarding: open })
  },

  setLangUI(l) {
    setLang(l)
    set({ lang: l })
  },

  async setupWorkspace({ nome, apelidos, idioma, projetos, trabalho }) {
    const exists = !!get().ws?.exists
    const cfg = structuredClone(exists ? get().config : DEFAULT_CONFIG)
    cfg.usuario = { nome: nome.trim(), ...(apelidos.length ? { apelidos } : {}), ...(idioma === 'en' ? { idioma } : {}) }
    cfg.contextos.trabalho = { ...cfg.contextos.trabalho, ...trabalho }
    const novos: { slug: string; nome: string }[] = []
    for (const p of projetos.map((x) => x.trim()).filter(Boolean)) {
      const slug = slugify(p)
      if (cfg.projetos[slug]) continue
      cfg.projetos[slug] = { nome: p }
      for (const k of Object.keys(cfg.contextos) as ContextKey[]) if (!cfg.contextos[k].ordem.includes(slug)) cfg.contextos[k].ordem.push(slug)
      novos.push({ slug, nome: p })
    }
    if (exists) await api.writeText('projetos.yaml', configToYaml(cfg))
    else await api.initWorkspace(configToYaml(cfg))
    for (const p of novos) {
      await api.writeText(`projetos/${p.slug}/projeto.md`, `---\nnome: ${p.nome}\n---\n\n# ${p.nome}\n\nContexto do projeto: repositórios, worktrees, pessoas.\n`)
    }
    await api.gitCommit(exists ? 'onboarding: perfil e projetos' : 'Início do ~/planos')
    await get().load()
  },

  async saveUsuario(u) {
    const cfg = structuredClone(get().config)
    cfg.usuario = { nome: u.nome.trim(), ...(u.apelidos?.length ? { apelidos: u.apelidos } : {}), ...(u.idioma === 'en' ? { idioma: 'en' as const } : {}) }
    await api.writeText('projetos.yaml', configToYaml(cfg))
    scheduleCommit('perfil do usuário')
    await get().load()
  },

  async juntarPlanos() {
    const root = get().env?.root ?? '~/planos'
    const prompt = juntarPlanosPrompt(root, get().projects.map((p) => ({ slug: p.slug, nome: p.nome })))
    try {
      const via = await api.launchAgent({ agent: 'claude', worktree: root, cwd: root, prompt, opener: get().env?.hasClaudeApp ? 'claude-app' : get().prefs.opener })
      toast.success(t(`Pedido aberto no ${OPENER_LABEL[via as Opener] ?? via}`, `Request opened in ${OPENER_LABEL[via as Opener] ?? via}`), {
        description:
          via === 'claude-app'
            ? t('Envie o pedido: o Claude procura, mostra a lista e pergunta antes de copiar.', 'Send the request: Claude searches, shows the list and asks before copying.')
            : t('O Claude procura, mostra a lista e pergunta antes de copiar.', 'Claude searches, shows the list and asks before copying.'),
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o Claude', "Couldn't open Claude"), { description: String(e) })
    }
  },

  organizar(rels) {
    if (!rels.length) return
    const root = get().env?.root ?? '~/planos'
    const abertos = get().plans.filter((p) => p.fm.status !== 'feito' && p.fm.status !== 'arquivado')
    get().sendToConsole(organizarPrompt(root, rels, get().projects.map((p) => ({ slug: p.slug, nome: p.nome })), abertos.map((p) => ({ id: p.fm.id, titulo: p.fm.titulo, path: p.path }))))
  },

  async soltarArquivos(paths) {
    try {
      const rels = await api.importDropped(paths)
      get().organizar(rels)
    } catch (e) {
      toast.error(t('Não consegui receber os arquivos', "Couldn't take the files"), { description: String(e) })
    }
  },

  async guardarNota(texto) {
    const body = texto.trim()
    if (!body) return
    const now = new Date()
    const stamp = `${todayISO(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const rel = `entrada/organizar/${stamp}-nota.md`
    try {
      await api.writeText(rel, `${body}\n`)
      get().organizar([rel])
    } catch (e) {
      toast.error(t('Não consegui guardar a nota', "Couldn't save the note"), { description: String(e) })
    }
  },

  async instalarRotinas(ids, atualizar) {
    if (!ids.length) return
    if (!get().env?.hasClaudeApp) {
      toast.error(t('As rotinas rodam no app do Claude', 'Routines run in the Claude app'), {
        description: t('Instale o app do Claude (claude.ai/download), entre na sua conta e tente de novo.', 'Install the Claude app (claude.ai/download), sign in and try again.'),
      })
      return
    }
    const root = get().env?.root ?? '~/planos'
    try {
      await api.launchAgent({ agent: 'claude', worktree: root, cwd: root, prompt: atualizar ? rotinasAtualizarPrompt(root, ids) : rotinasInstalarPrompt(root, ids), opener: 'claude-app' })
      toast.success(t('Pedido das rotinas aberto no app do Claude', 'Routines request opened in the Claude app'), {
        description: atualizar
          ? t('Envie o pedido: ele troca o texto das rotinas pelo desta versão, sem mexer nos horários.', 'Send the request: it replaces the routine text with this version, without touching the schedules.')
          : t('Envie o pedido: ele cria as tarefas agendadas e pergunta se você quer rodar cada uma agora.', 'Send the request: it creates the scheduled tasks and asks whether you want to run each one now.'),
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o Claude', "Couldn't open Claude"), { description: String(e) })
    }
  },

  async importEntrada() {
    const ws = get().ws
    if (!ws?.entrada.length) return
    const fallback = get().orderedProjects()[0]?.slug ?? 'geral'
    let n = 0
    for (const rel of ws.entrada) {
      const content = await api.readText(rel)
      const placed = placeEntrada(rel.split('/').pop()!, content, fallback)
      await api.writeText(placed.rel, placed.content)
      const name = rel.split('/').pop()!
      await api.moveFile(rel, `entrada/importados/${todayISO()}-${name}`).catch(() => {})
      n++
    }
    scheduleCommit(`importados ${n} planos de entrada/`)
    await get().load()
    toast.success(t(`${n} ${n === 1 ? 'plano importado' : 'planos importados'} de entrada/`, `${n} ${n === 1 ? 'plan' : 'plans'} imported from entrada/`))
  },

  async talk(plan, agent, opener) {
    const a = agent ?? plan.fm.agente ?? 'claude'
    const root = get().env?.root ?? '~/planos'
    const dir = `${root}/${plan.path.replace(/\/plano\.md$/, '')}`
    try {
      const via = await api.launchAgent({
        agent: a,
        worktree: (await get().codeDir(plan)) ?? plan.fm.worktree,
        cwd: dir,
        prompt: planPrompt(plan, root, get().project(plan.projectSlug)),
        opener: opener ?? get().prefs.opener,
      })
      toast.success(t(`${AGENT_LABEL[a]} aberto no ${OPENER_LABEL[via as Opener] ?? via}`, `${AGENT_LABEL[a]} opened in ${OPENER_LABEL[via as Opener] ?? via}`), {
        description: via === 'claude-app' ? t('O prompt já está na caixa: confira e envie.', 'The prompt is in the box: check it and send.') : plan.fm.titulo,
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o agente', "Couldn't open the agent"), { description: String(e) })
    }
  },

  async act(plan, ask, tarefaFile) {
    const root = get().env?.root ?? '~/planos'
    const agent = plan.fm.agente ?? 'claude'
    try {
      const via = await api.launchAgent({
        agent,
        worktree: (await get().codeDir(plan)) ?? plan.fm.worktree,
        cwd: `${root}/${plan.path.replace(/\/plano\.md$/, '')}`,
        prompt: askPrompt(plan, ask, root, tarefaFile, get().project(plan.projectSlug)?.idioma),
        opener: get().prefs.opener,
      })
      toast.success(t(`${AGENT_LABEL[agent]} aberto no ${OPENER_LABEL[via as Opener] ?? via}`, `${AGENT_LABEL[agent]} opened in ${OPENER_LABEL[via as Opener] ?? via}`), {
        description: via === 'claude-app' ? t('O pedido já está na caixa: confira e envie.', 'The request is in the box: check it and send.') : ask.label,
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o agente', "Couldn't open the agent"), { description: String(e) })
    }
  },

  async talkItem(prompt, plan) {
    const root = get().env?.root ?? '~/planos'
    try {
      const via = await api.launchAgent({
        agent: 'claude',
        worktree: (plan && ((await get().codeDir(plan)) ?? plan.fm.worktree)) || root,
        cwd: plan ? `${root}/${plan.path.replace(/\/plano\.md$/, '')}` : root,
        prompt,
        opener: get().prefs.opener,
      })
      toast.success(t(`Claude aberto no ${OPENER_LABEL[via as Opener] ?? via}`, `Claude opened in ${OPENER_LABEL[via as Opener] ?? via}`), {
        description: via === 'claude-app' ? t('O pedido já está na caixa: é só enviar.', 'The request is in the box: just send it.') : plan?.fm.titulo,
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o Claude', "Couldn't open Claude"), { description: String(e) })
    }
  },

  async conferir(plan) {
    const root = get().env?.root ?? '~/planos'
    try {
      const via = await api.launchAgent({
        agent: 'claude',
        worktree: (await get().codeDir(plan)) ?? plan.fm.worktree,
        cwd: `${root}/${plan.path.replace(/\/plano\.md$/, '')}`,
        prompt: conferirPrompt(plan, root, get().project(plan.projectSlug)?.idioma),
        opener: get().prefs.opener,
      })
      toast.success(t(`Conferindo no ${OPENER_LABEL[via as Opener] ?? via}`, `Checking in ${OPENER_LABEL[via as Opener] ?? via}`), {
        description: via === 'claude-app' ? t('O pedido já está na caixa: é só enviar.', 'The request is in the box: just send it.') : plan.fm.titulo,
      })
    } catch (e) {
      toast.error(t('Não consegui abrir o agente', "Couldn't open the agent"), { description: String(e) })
    }
  },

  async talkProject(slug, agent, opener) {
    const project = get().project(slug)
    if (!project) return
    const root = get().env?.root ?? '~/planos'
    const plans = get().plans.filter((p) => p.projectSlug === slug)
    try {
      const via = await api.launchAgent({
        agent,
        worktree: project.worktree ?? (await projectCodeDir(get, slug)),
        cwd: `${root}/projetos/${slug}`,
        prompt: projectPrompt(project, plans, root),
        opener: opener ?? get().prefs.opener,
      })
      toast.success(t(`Sessão de ${project.nome} aberta no ${OPENER_LABEL[via as Opener] ?? via}`, `${project.nome} session opened in ${OPENER_LABEL[via as Opener] ?? via}`))
    } catch (e) {
      toast.error(t('Não consegui abrir o agente', "Couldn't open the agent"), { description: String(e) })
    }
  },

  async codeDir(plan) {
    const clones = await ensureClones(get, set)
    const { plans, remotes } = get()
    const ctx = prContext(plan, plans, repoIndex(plans, remotes), remotes)
    return pickCodeDir(plan.raw, ctx.fallback, clones, get().env?.home ?? '', plan.projectSlug)
  },

  setPrefs(p) {
    const prefs = { ...get().prefs, ...p }
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    set({ prefs })
  },

  setPalette: (open) => set({ paletteOpen: open }),
  openNewPlan: (project) => set({ newPlanFor: project ?? null, paletteOpen: false }),
  closeNewPlan: () => set({ newPlanFor: false }),
  setNewProjectOpen: (open) => set({ newProjectOpen: open, paletteOpen: false }),
}))

export function usePlanById(id: string) {
  return useStore((s) => s.plans.find((p) => p.fm.id === id))
}

async function ensureClones(get: () => State, set: (s: Partial<State>) => void) {
  const have = get().clones
  if (have) return have
  const clones = await api.localRepos().catch(() => [] as LocalRepo[])
  set({ clones })
  return clones
}

async function projectCodeDir(get: () => State, slug: string) {
  const clones = await ensureClones(get, useStore.setState)
  const { plans, remotes } = get()
  const mine = plans.filter((p) => p.projectSlug === slug)
  const text = mine.map((p) => p.raw + ' ' + (p.fm.worktree ? (remotes[p.fm.worktree] ?? '') : '')).join('\n')
  return pickCodeDir('', mostCited(text, repoIndex(plans, remotes)), clones, get().env?.home ?? '', slug)
}

function repoIndex(plans: Plan[], remotes: Record<string, string>) {
  if (repoCache?.plans !== plans || repoCache.remotes !== remotes) repoCache = { plans, remotes, idx: buildRepoIndex(plans, remotes) }
  return repoCache.idx
}

let repoCache: { plans: Plan[]; remotes: Record<string, string>; idx: RepoIndex } | undefined

/** transforma #123 do texto do plano em link do PR no GitHub */
export function useLinkPRs(plan?: Plan) {
  const plans = useStore((s) => s.plans)
  const remotes = useStore((s) => s.remotes)
  return useMemo(() => {
    if (!plan) return (md: string) => md
    const idx = repoIndex(plans, remotes)
    const ctx = prContext(plan, plans, idx, remotes)
    return (md: string) => linkPRs(md, idx, ctx)
  }, [plan, plans, remotes])
}
