/**
 * planos — comando de terminal do sistema de planejamentos.
 * Fino como o app: só lê e escreve os .md em ~/planos (ou PLANOS_DIR) e faz commit no git.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import type { ContextKey, Plan, Prioridade, Status, WorkspaceRaw } from '../src/lib/types'
import { PRIORIDADES, STATUSES } from '../src/lib/types'
import { buildProjects, configToYaml, CONTEXT_LABEL, DEFAULT_CONFIG, detectContext, orderedSlugs, parseConfig, configError } from '../src/lib/config'
import { addPhase, ASK_LABEL, splitFrontmatter, newPlanMarkdown, nextPhase, normalize, parsePlan, pendingAsks, phaseLabel, progress, setFields, slugify, togglePhase } from '../src/lib/plan'
import { buildToday, isOpen } from '../src/lib/score'
import { daysUntil, dueLabel, todayISO } from '../src/lib/dates'
import { chatPrompt, planPrompt, projectPrompt } from '../src/lib/prompt'
import { nome as nomeUsuario, setUsuario } from '../src/lib/usuario'
import { dfLocale, idiomaRegra, isEn, setLang, t } from '../src/lib/i18n'
import { rotina, ROTINAS } from '../src/lib/rotinas'
import { DISCORD_FILE, KEYCHAIN_SERVICE, parseCanais } from '../src/lib/discord'
import { hojeMarkdown, semanaMarkdown } from '../src/lib/digest'
import { parseTarefas } from '../src/lib/tarefas'
import { placeEntrada } from '../src/lib/migrate'
import { CAMPANHAS_FILE, DIVULGAR_STATE_DIR, gerarPostPrompt, parseCampanhas, prMarkdown, ruido, type Campanha, type PrInfo } from '../src/lib/divulgar'
import { METRICAS, parseResumo, RESUMOS_DIR, resumoPrompt, type Metricas } from '../src/lib/resumo'
import { addDays, format } from 'date-fns'
import { dump } from 'js-yaml'

const HOME = homedir()
const ROOT = process.env.PLANOS_DIR || join(HOME, 'planos')

// ---------- saída ----------

const tty = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code: string) => (s: string | number) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const dim = c('2')
const bold = c('1')
const red = c('31')
const yellow = c('33')
const green = c('32')
const blue = c('34')

function die(msg: string): never {
  console.error(red('✗ ') + msg)
  process.exit(1)
}

const STATUS_ICON: Record<Status, string> = {
  ideia: dim('○'),
  proximo: '○',
  andamento: yellow('◐'),
  revisao: blue('◕'),
  bloqueado: red('⊘'),
  feito: green('●'),
  arquivado: dim('⊗'),
}

// ---------- arquivos ----------

function expand(p: string) {
  return p.startsWith('~/') ? join(HOME, p.slice(2)) : p
}

function readOpt(p: string) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function listExtras(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || (!prefix && name === 'plano.md')) continue
    const rel = prefix ? `${prefix}/${name}` : name
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listExtras(full, rel))
    else out.push(rel)
  }
  return out.sort()
}

function latestTarefas(): [string, string] | null {
  const dir = join(ROOT, 'tarefas')
  if (!existsSync(dir)) return null
  const name = readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort().pop()
  return name ? [name, readFileSync(join(dir, name), 'utf8')] : null
}

function loadWorkspace(): WorkspaceRaw {
  const ws: WorkspaceRaw = {
    root: ROOT,
    exists: existsSync(join(ROOT, 'projetos.yaml')),
    isGit: existsSync(join(ROOT, '.git')),
    projetosYaml: readOpt(join(ROOT, 'projetos.yaml')),
    hoje: readOpt(join(ROOT, 'hoje.md')),
    semana: readOpt(join(ROOT, 'semana.md')),
    tarefas: latestTarefas(),
    projects: [],
    plans: [],
    entrada: existsSync(join(ROOT, 'entrada'))
      ? readdirSync(join(ROOT, 'entrada')).filter((n) => n.endsWith('.md')).map((n) => `entrada/${n}`)
      : [],
  }
  const pdir = join(ROOT, 'projetos')
  if (!existsSync(pdir)) return ws
  for (const slug of readdirSync(pdir)) {
    const proj = join(pdir, slug)
    if (slug.startsWith('.') || !statSync(proj).isDirectory()) continue
    ws.projects.push({ slug, content: readOpt(join(proj, 'projeto.md')) })
    const plansDir = join(proj, 'planos')
    if (!existsSync(plansDir)) continue
    for (const folder of readdirSync(plansDir)) {
      const file = join(plansDir, folder, 'plano.md')
      if (!existsSync(file)) continue
      ws.plans.push({
        path: `projetos/${slug}/planos/${folder}/plano.md`,
        project: slug,
        folder,
        content: readFileSync(file, 'utf8'),
        mtime: statSync(file).mtimeMs,
        extras: listExtras(join(plansDir, folder)),
      })
    }
  }
  return ws
}

function write(rel: string, content: string) {
  const p = join(ROOT, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p + '.tmp', content)
  renameSync(p + '.tmp', p)
}

function git(...args: string[]) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

function commit(message: string) {
  if (!existsSync(join(ROOT, '.git'))) return
  git('add', '-A')
  if (!git('status', '--porcelain').stdout.trim()) return
  const r = git('commit', '-q', '-m', message)
  if (r.status !== 0) {
    console.error(yellow('! ') + t(`o commit em ${ROOT} falhou (a mudança está salva no arquivo): `, `the commit in ${ROOT} failed (the change is saved in the file): `) + (r.stderr || r.stdout || '').trim().split('\n')[0])
    return
  }
  if (git('remote').stdout.trim()) spawn('git', ['push', '-q'], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref()
}

function which(bin: string) {
  return spawnSync('/bin/sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).stdout.trim() || null
}

// ---------- estado ----------

function load() {
  const ws = loadWorkspace()
  if (!ws.exists)
    die(
      t(
        `${ROOT} ainda não existe. Abra o app Letco e clique em Começar, ou rode ${bold('planos iniciar --nome "Seu nome"')}.`,
        `${ROOT} does not exist yet. Open the Letco app and click Get started, or run ${bold('planos iniciar --nome "Your name"')}.`,
      ),
    )
  const config = parseConfig(ws.projetosYaml)
  const erroCfg = configError(ws.projetosYaml)
  if (erroCfg) console.error(yellow('! ') + `projetos.yaml: ${erroCfg} — ` + t('o arquivo está sendo ignorado (ordem, nome e idiomas no padrão)', 'the file is being ignored (default order, name and languages)'))
  setUsuario(config.usuario)
  setLang(config.usuario?.idioma)
  const plans = ws.plans.map(parsePlan)
  const files = [...ws.projects]
  for (const p of plans) if (!files.some((f) => f.slug === p.projectSlug)) files.push({ slug: p.projectSlug, content: null })
  const projects = buildProjects(config, files)
  const ctxFlag = flag('contexto')
  const ctx: ContextKey = ctxFlag
    ? ctxFlag.startsWith('t')
      ? 'trabalho'
      : 'fora-do-horario'
    : detectContext(config)
  return { ws, config, plans, projects, ctx }
}
type State = ReturnType<typeof load>

function projectName(s: State, slug: string) {
  return s.projects.find((p) => p.slug === slug)?.nome ?? slug
}

function findPlan(s: State, query: string | undefined): Plan {
  if (!query) die(t('Diga qual plano (id ou parte do título).', 'Say which plan (id or part of the title).'))
  const q = normalize(query)
  const exact = s.plans.find((p) => p.fm.id === query)
  if (exact) return exact
  const hits = s.plans.filter((p) => normalize(p.fm.id).includes(q) || normalize(p.fm.titulo).includes(q))
  const open = hits.filter(isOpen)
  const pick = open.length ? open : hits
  if (pick.length === 1) return pick[0]
  if (!pick.length) die(t(`Nenhum plano com "${query}".`, `No plan matches "${query}".`))
  console.error(yellow(t(`"${query}" bate com ${pick.length} planos:`, `"${query}" matches ${pick.length} plans:`)))
  for (const p of pick.slice(0, 12)) console.error(`  ${p.fm.id}  ${dim(p.fm.titulo)}`)
  process.exit(1)
}

function findProject(s: State, query: string | undefined) {
  if (!query) die(t('Diga qual projeto.', 'Say which project.'))
  const q = normalize(query)
  const p =
    s.projects.find((x) => x.slug === query) ??
    s.projects.find((x) => normalize(x.nome) === q) ??
    s.projects.find((x) => x.slug.startsWith(q) || normalize(x.nome).startsWith(q))
  if (!p) die(t(`Projeto "${query}" não existe. Projetos: `, `Project "${query}" does not exist. Projects: `) + s.projects.map((x) => x.slug).join(', '))
  return p
}

function save(plan: Plan, raw: string, msg: string) {
  if (raw === plan.raw) return
  write(plan.path, raw)
  commit(`${plan.fm.id}: ${msg}`)
}

// ---------- argumentos ----------

const VALUE_FLAGS = new Set(['contexto', 'prioridade', 'prazo', 'objetivo', 'canal', 'dias', 'pronto', 'descartar', 'motivo', 'campanha', 'data', 'nome'])
const argv = process.argv.slice(2)
const positional = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') && VALUE_FLAGS.has(argv[i - 1].slice(2))))
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return undefined
  return VALUE_FLAGS.has(name) ? argv[i + 1] : 'true'
}

// ---------- comandos ----------

function planLine(s: State, p: Plan, opts: { project?: boolean } = {}) {
  const pr = progress(p)
  const due = dueLabel(p.fm.prazo)
  const overdue = (daysUntil(p.fm.prazo) ?? 0) < 0
  const bits = [
    STATUS_ICON[p.fm.status],
    opts.project ? dim(projectName(s, p.projectSlug) + ' ·') : '',
    p.fm.titulo,
    pr.total ? dim(`${pr.done}/${pr.total}`) : '',
    due ? (overdue ? red(due) : yellow(due)) : '',
    p.fm.prioridade === 'alta' ? red('!') : '',
    dim(p.fm.id),
  ]
  return bits.filter(Boolean).join(' ')
}

function cmdHoje() {
  const s = load()
  if (flag('escrever')) {
    const md = hojeMarkdown(s.plans, s.projects, s.config, s.ctx, new Date(), s.ws.tarefas ? parseTarefas(...s.ws.tarefas) : undefined)
    const strip = (md: string | null) => (md ?? '').replace(/^_(Gerado em|Generated on) .*$/m, '')
    if (strip(md) !== strip(s.ws.hoje)) {
      write('hoje.md', md)
      commit('lista do dia')
    }
    if (!flag('silencioso')) console.log(md)
    return
  }
  const td = buildToday(s.plans, s.config, s.ctx)
  console.log(bold(`${t('Hoje', 'Today')} · ${CONTEXT_LABEL[s.ctx]}`) + dim(`  ${s.ws.root}`))
  const section = (title: string, lines: string[]) => {
    if (!lines.length) return
    console.log('\n' + bold(title) + dim(` ${lines.length}`))
    for (const l of lines) console.log('  ' + l)
  }
  section(t('Prazo vencendo', 'Due soon'), td.urgent.map((x) => planLine(s, x.plan, { project: true })))
  section(t('Precisa de você', 'Needs you'), td.asks.slice(0, 10).map((a) => `${bold(ASK_LABEL[a.item.kind] + ':')} ${a.item.label} ${dim('· ' + a.plan.fm.titulo)}`))
  section(
    t('Fazer hoje', 'Do today'),
    td.doing.map((x) => {
      const n = nextPhase(x.plan)
      const ask = pendingAsks(x.plan)[0]
      const hint = ask ? `${t('você', 'you')} · ${ASK_LABEL[ask.kind]}: ${ask.label}` : x.plan.paraVoce?.nada ?? (n ? phaseLabel(n) : '')
      return planLine(s, x.plan, { project: true }) + (hint ? '\n    ' + dim('→ ' + hint) : '')
    }),
  )
  section(t('Decidir', 'Decide'), td.decide.slice(0, 8).map((d) => `${dim(projectName(s, d.plan.projectSlug) + ':')} ${d.item.text}`))
  if (td.decide.length > 8) console.log(dim(t(`  … mais ${td.decide.length - 8}`, `  … ${td.decide.length - 8} more`)))
  section(t('Cobrar', 'Follow up'), td.chase.slice(0, 8).map((d) => `${d.item.text} ${dim('· ' + d.plan.fm.titulo)}`))
  section(t('Parados há 7+ dias', 'Stalled 7+ days'), td.stale.slice(0, 5).map((x) => planLine(s, x.plan, { project: true }) + dim(t(` · ${x.stale} dias`, ` · ${x.stale} days`))))
  if (td.counts.hiddenByContext) console.log(dim('\n' + t(`${td.counts.hiddenByContext} ocultos fora do contexto`, `${td.counts.hiddenByContext} hidden outside this context`)))
  if (s.ws.entrada.length) console.log(yellow('\n' + t(`${s.ws.entrada.length} arquivo(s) em entrada/ — rode planos importar`, `${s.ws.entrada.length} file(s) in entrada/ — run planos importar`)))
}

function cmdSemana() {
  const s = load()
  const md = semanaMarkdown(s.plans, s.projects, s.config, s.ctx)
  if (flag('escrever')) {
    write('semana.md', md)
    commit('resumo da semana')
  }
  if (!flag('silencioso')) console.log(md)
}

function cmdLs() {
  const s = load()
  const only = positional[1] ? findProject(s, positional[1]).slug : undefined
  const all = flag('todos')
  const order = orderedSlugs(s.config, s.ctx, s.projects.map((p) => p.slug))
  const rank: Record<string, number> = { andamento: 0, revisao: 1, bloqueado: 2, proximo: 3, ideia: 4, feito: 5, arquivado: 6 }
  for (const slug of order) {
    if (only && slug !== only) continue
    const ps = s.plans
      .filter((p) => p.projectSlug === slug && (all || isOpen(p)))
      .sort((a, b) => rank[a.fm.status] - rank[b.fm.status])
    if (!ps.length) continue
    console.log(bold(projectName(s, slug)) + dim(` ${ps.length}`))
    for (const p of ps) console.log('  ' + planLine(s, p))
    console.log()
  }
}

function cmdVer() {
  const s = load()
  const p = findPlan(s, positional[1])
  const pr = progress(p)
  console.log(bold(p.fm.titulo) + dim(`  ${projectName(s, p.projectSlug)} · ${p.fm.id}`))
  console.log(
    [
      STATUS_ICON[p.fm.status] + ' ' + p.fm.status,
      `${t('prioridade', 'priority')} ${p.fm.prioridade}`,
      p.fm.prazo ? `${t('prazo', 'due')} ${p.fm.prazo} (${dueLabel(p.fm.prazo)})` : '',
      `${pr.done}/${pr.total} ${t('fases', 'phases')}`,
    ]
      .filter(Boolean)
      .join(dim(' · ')),
  )
  const pv = p.paraVoce
  if (pv) {
    console.log('\n' + bold(t('Para você', 'For you')))
    if (pv.resumo) console.log('  ' + pv.resumo)
    if (pv.situacao) console.log('  ' + dim(pv.situacao))
    const asks = pendingAsks(p)
    for (const a of asks) console.log(`  ○ ${bold(ASK_LABEL[a.kind] + ':')} ${a.label}`)
    if (!asks.length) console.log('  ' + green('✓ ') + (pv.nada ?? t('nada agora', 'nothing now')))
    if (pv.conferido) console.log('  ' + dim(`${t('conferido em', 'checked on')} ${pv.conferido}${pv.fonte ? ' · ' + pv.fonte : ''}`))
  } else if (p.objetivo) console.log('\n' + p.objetivo)
  if (p.phases.length) {
    console.log('\n' + bold(t('Fases', 'Phases')))
    for (const f of p.phases) console.log(`  ${f.done ? green('✓') : '○'} ${f.id ? dim(f.id) + ' ' : ''}${f.name}${f.date ? dim(' — ' + f.date) : ''}`)
  }
  const dec = p.decisions.filter((d) => !d.done)
  if (dec.length) {
    console.log('\n' + bold(t('Decisões em aberto', 'Open decisions')))
    for (const d of dec) console.log('  ○ ' + d.text)
  }
  const cob = p.cobrancas.filter((d) => !d.done)
  if (cob.length) {
    console.log('\n' + bold(t('Cobranças', 'Follow-ups')))
    for (const d of cob) console.log('  ○ ' + d.text)
  }
  console.log('\n' + dim(join(ROOT, p.path)))
}

function launch(agent: string, prompt: string, worktree: string | undefined, fallbackDir: string) {
  if (agent !== 'claude' && agent !== 'codex') die(t('Agente: claude ou codex.', 'Agent: claude or codex.'))
  const wt = worktree && existsSync(expand(worktree)) ? expand(worktree) : undefined
  if (flag('app')) {
    if (agent !== 'claude') die(t('O app do Claude só abre o Claude; use --orca para o Codex.', 'The Claude app only opens Claude; use --orca for Codex.'))
    const url = `claude://code/new?folder=${encodeURIComponent(wt ?? fallbackDir)}&q=${encodeURIComponent(prompt.slice(0, 14_000))}`
    const r = spawnSync('open', [url], { stdio: 'inherit' })
    if (r.status === 0) console.log(green('✓ ') + t('Sessão nova aberta no app do Claude, com o prompt pronto para enviar.', 'New session opened in the Claude app, with the prompt ready to send.'))
    process.exit(r.status ?? 0)
  }
  if (flag('orca')) {
    if (!wt) die(t('O plano não tem worktree; sem --orca abre aqui no terminal.', 'The plan has no worktree; without --orca it opens here in the terminal.'))
    if (!which('orca')) die(t('orca não encontrado no PATH.', 'orca not found in PATH.'))
    const r = spawnSync('orca', ['agent', 'launch', '--agent', agent, '--worktree', `path:${wt}`, '--prompt', prompt, '--focus', '--json'], { stdio: 'inherit' })
    process.exit(r.status ?? 0)
  }
  if (!which(agent)) die(t(`${agent} não encontrado no PATH.`, `${agent} not found in PATH.`))
  const cwd = wt ?? fallbackDir
  console.log(dim(t(`${agent} em ${cwd}`, `${agent} in ${cwd}`)))
  const r = spawnSync(agent, [prompt], { cwd, stdio: 'inherit' })
  process.exit(r.status ?? 0)
}

function cmdFalar() {
  const s = load()
  const p = findPlan(s, positional[1])
  const agent = positional[2] ?? p.fm.agente ?? 'claude'
  launch(agent, planPrompt(p, ROOT, s.projects.find((x) => x.slug === p.projectSlug)), p.fm.worktree, join(ROOT, dirname(p.path)))
}

function cmdProjeto() {
  const s = load()
  const proj = findProject(s, positional[1])
  const agent = positional[2] ?? 'claude'
  launch(agent, projectPrompt(proj, s.plans.filter((p) => p.projectSlug === proj.slug), ROOT), proj.worktree, join(ROOT, 'projetos', proj.slug))
}

function cmdNovo() {
  const s = load()
  const proj = findProject(s, positional[1])
  const titulo = positional.slice(2).join(' ').trim()
  if (!titulo) die(t('Uso: planos novo <projeto> "título"', 'Usage: planos novo <project> "title"'))
  const prioridade = (flag('prioridade') ?? 'media') as Prioridade
  if (!PRIORIDADES.includes(prioridade)) die(t('Prioridade: alta, media ou baixa.', 'Priority: alta, media or baixa.'))
  const slug = slugify(titulo)
  let id = `${proj.slug}-${slug}`
  if (s.plans.some((p) => p.fm.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`
  const rel = `projetos/${proj.slug}/planos/${todayISO()}-${slug}/plano.md`
  if (existsSync(join(ROOT, rel))) die(t(`Já existe: ${rel}`, `Already exists: ${rel}`))
  write(rel, newPlanMarkdown({ id, projeto: proj.slug, titulo, prioridade, prazo: flag('prazo'), objetivo: flag('objetivo'), fases: [], worktree: proj.worktree }))
  commit(`${id}: plano criado`)
  console.log(green('✓ ') + `${titulo} ${dim(id)}`)
  console.log(dim(join(ROOT, rel)))
}

function cmdStatus() {
  const s = load()
  const p = findPlan(s, positional[1])
  const st = positional[2] as Status
  if (!STATUSES.includes(st)) die(`Status: ${STATUSES.join(', ')}`)
  save(p, setFields(p, { status: st }, `status: ${st}`), `status ${st}`)
  console.log(green('✓ ') + `${p.fm.titulo} → ${STATUS_ICON[st]} ${st}`)
}

function cmdPrazo() {
  const s = load()
  const p = findPlan(s, positional[1])
  const v = positional[2]
  if (!v || (v !== '-' && !/^\d{4}-\d{2}-\d{2}$/.test(v))) die(t('Uso: planos prazo <id> AAAA-MM-DD  (ou - para tirar)', 'Usage: planos prazo <id> YYYY-MM-DD  (or - to remove)'))
  const prazo = v === '-' ? undefined : v
  save(p, setFields(p, { prazo }, prazo ? `prazo: ${prazo}` : 'prazo removido'), prazo ? `prazo ${prazo}` : 'sem prazo')
  console.log(green('✓ ') + `${p.fm.titulo}: ${prazo ? dueLabel(prazo) : t('sem prazo', 'no due date')}`)
}

function cmdPrioridade() {
  const s = load()
  const p = findPlan(s, positional[1])
  const v = positional[2] as Prioridade
  if (!PRIORIDADES.includes(v)) die(t('Prioridade: alta, media ou baixa.', 'Priority: alta, media or baixa.'))
  save(p, setFields(p, { prioridade: v }, `prioridade: ${v}`), `prioridade ${v}`)
  console.log(green('✓ ') + `${p.fm.titulo}: ${t('prioridade', 'priority')} ${v}`)
}

function cmdFase() {
  const sub = positional[1]
  const s = load()
  const p = findPlan(s, positional[2])
  if (sub === 'add' || sub === 'nova') {
    const nome = positional.slice(3).join(' ').trim()
    if (!nome) die(t('Uso: planos fase nova <id> "nome da fase"', 'Usage: planos fase nova <id> "phase name"'))
    save(p, addPhase(p, nome), `fase nova: ${nome}`)
    console.log(green('✓ ') + t(`fase adicionada em ${p.fm.titulo}`, `phase added to ${p.fm.titulo}`))
    return
  }
  if (sub !== 'concluir' && sub !== 'reabrir') die(t('Uso: planos fase concluir|reabrir|nova <id> F3', 'Usage: planos fase concluir|reabrir|nova <id> F3'))
  const key = (positional[3] ?? '').toUpperCase()
  const idx = key
    ? p.phases.findIndex((f) => f.id.toUpperCase() === key || f.id.toUpperCase() === 'F' + key)
    : sub === 'concluir'
      ? p.phases.findIndex((f) => !f.done)
      : -1
  if (idx < 0) die(t(`Fase ${key || '?'} não encontrada. Fases: `, `Phase ${key || '?'} not found. Phases: `) + p.phases.map((f) => f.id || f.name).join(', '))
  const f = p.phases[idx]
  if (f.done === (sub === 'concluir')) {
    console.log(dim(t(`${phaseLabel(f)} já está ${f.done ? 'concluída' : 'aberta'}.`, `${phaseLabel(f)} is already ${f.done ? 'done' : 'open'}.`)))
    return
  }
  const raw = togglePhase(p, idx)
  save(p, raw, `${sub === 'concluir' ? 'concluída' : 'reaberta'} ${f.id || f.name}`)
  const after = parsePlan({ path: p.path, project: p.projectSlug, folder: p.folder, content: raw, mtime: Date.now(), extras: p.extras })
  const pr = progress(after)
  console.log(green('✓ ') + `${phaseLabel(f)} ${sub === 'concluir' ? t('concluída', 'done') : t('reaberta', 'reopened')} · ${pr.done}/${pr.total} · ${STATUS_ICON[after.fm.status]} ${after.fm.status}`)
}

function cmdEditar() {
  const s = load()
  const p = findPlan(s, positional[1])
  const file = join(ROOT, p.path)
  const editor = process.env.VISUAL || process.env.EDITOR
  const r = editor ? spawnSync('/bin/sh', ['-c', `${editor} "$1"`, 'sh', file], { stdio: 'inherit' }) : spawnSync('open', ['-t', file])
  if (editor) commit(`${p.fm.id}: editado`)
  process.exit(r.status ?? 0)
}

function cmdArquivar(undo = false) {
  const s = load()
  const p = findPlan(s, positional[1])
  const st: Status = undo ? 'proximo' : 'arquivado'
  save(p, setFields(p, { status: st }, undo ? 'desarquivado' : 'arquivado'), undo ? 'desarquivado' : 'arquivado')
  console.log(green('✓ ') + `${p.fm.titulo} ${undo ? t('voltou para próximo', 'moved back to proximo') : t('arquivado (nada foi apagado)', 'archived (nothing was deleted)')}`)
}

function cmdImportar() {
  const s = load()
  if (!s.ws.entrada.length) return console.log(dim(t('Nada em entrada/.', 'Nothing in entrada/.')))
  const fallback = orderedSlugs(s.config, s.ctx, s.projects.map((p) => p.slug))[0] ?? 'geral'
  for (const rel of s.ws.entrada) {
    const name = rel.split('/').pop()!
    const placed = placeEntrada(name, readFileSync(join(ROOT, rel), 'utf8'), fallback)
    write(placed.rel, placed.content)
    const dest = join(ROOT, 'entrada/importados', `${todayISO()}-${name}`)
    mkdirSync(dirname(dest), { recursive: true })
    if (!existsSync(dest)) renameSync(join(ROOT, rel), dest)
    console.log(green('✓ ') + `${name} → ${placed.rel}`)
  }
  commit(`importados ${s.ws.entrada.length} planos de entrada/`)
}

function cmdIniciar() {
  if (existsSync(join(ROOT, 'projetos.yaml'))) die(t(`${ROOT} já existe.`, `${ROOT} already exists.`))
  for (const d of ['projetos', 'entrada', 'pedidos', '.indice']) mkdirSync(join(ROOT, d), { recursive: true })
  for (const d of ['entrada', 'pedidos']) writeFileSync(join(ROOT, d, '.gitkeep'), '')
  writeFileSync(join(ROOT, '.gitignore'), '.DS_Store\n.indice/\n*.md.tmp\n')
  const cfg = structuredClone(DEFAULT_CONFIG)
  const quem = flag('nome')
  if (quem) cfg.usuario = { nome: quem }
  writeFileSync(join(ROOT, 'projetos.yaml'), configToYaml(cfg))
  if (!existsSync(join(ROOT, '.git'))) git('init', '-q')
  commit('Início do ~/planos')
  console.log(green('✓ ') + t(`${ROOT} criado.`, `${ROOT} created.`))
}

/** Rotinas de dias úteis no launchd: lista do dia às 8h30, 12h30 e 16h30; resumo da semana sexta 17h. */
function cmdAgendar() {
  const dir = join(HOME, 'Library/LaunchAgents')
  const uid = process.getuid?.() ?? 501
  const jobs = [
    { label: 'dev.leco.planos.hoje', args: ['hoje', '--escrever', '--silencioso'], times: [[8, 30], [12, 30], [16, 30]], days: [1, 2, 3, 4, 5] },
    { label: 'dev.leco.planos.semana', args: ['semana', '--escrever', '--silencioso'], times: [[17, 0]], days: [5] },
  ]
  for (const j of jobs) {
    const plist = join(dir, `${j.label}.plist`)
    spawnSync('launchctl', ['bootout', `gui/${uid}/${j.label}`])
    if (flag('remover')) {
      if (existsSync(plist)) renameSync(plist, plist + '.desativado')
      continue
    }
    const intervals = j.days.flatMap((d) => j.times.map(([h, m]) => `<dict><key>Weekday</key><integer>${d}</integer><key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer></dict>`))
    const args = [process.execPath, resolve(process.argv[1]), ...j.args].map((a) => `<string>${a}</string>`).join('')
    const env = process.env.PLANOS_DIR ? `<key>EnvironmentVariables</key><dict><key>PLANOS_DIR</key><string>${process.env.PLANOS_DIR}</string></dict>` : ''
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${j.label}</string><key>ProgramArguments</key><array>${args}</array>${env}<key>StartCalendarInterval</key><array>${intervals.join('')}</array><key>StandardErrorPath</key><string>/tmp/${j.label}.log</string></dict></plist>\n`,
    )
    spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plist])
  }
  console.log(
    green('✓ ') +
      (flag('remover')
        ? t('Rotinas removidas.', 'Routines removed.')
        : t('Rotinas ligadas: hoje.md seg–sex 8h30, 12h30, 16h30 · semana.md sexta 17h.', 'Routines on: hoje.md Mon–Fri 8:30, 12:30, 16:30 · semana.md Friday 17:00.')),
  )
}

// ---------- discord ----------

const DISCORD_API = 'https://discord.com/api/v10'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const snowflakeTime = (id: string) => Number((BigInt(id) >> 22n) + 1420070400000n)

interface DMsg {
  id: string
  content: string
  timestamp: string
  author: { id: string; username: string; global_name?: string | null }
  mentions?: { id: string; username: string; global_name?: string | null }[]
  attachments?: { filename: string }[]
  embeds?: { title?: string }[]
  referenced_message?: DMsg | null
  thread?: { id: string; name: string } | null
}

/** GET na API do Discord com o token do Keychain; espera e repete quando o Discord pede (429) */
async function discordGet<T>(token: string, path: string): Promise<T> {
  for (let tries = 0; tries < 4; tries++) {
    const r = await fetch(DISCORD_API + path, { headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } })
    if (r.status === 429) {
      const body = (await r.json().catch(() => ({}))) as { retry_after?: number }
      await sleep(Math.ceil((body.retry_after ?? 2) * 1000) + 250)
      continue
    }
    if (r.status === 401) die(t('O Discord recusou o token (401). Cole um token novo em Ajustes → Discord.', 'Discord rejected the token (401). Paste a new token in Settings → Discord.'))
    if (r.status === 403) die(t(`Sem acesso a ${path} (403): confira se a sua conta vê esse canal.`, `No access to ${path} (403): check that your account can see this channel.`))
    if (!r.ok) die(t(`Discord respondeu ${r.status} em ${path}`, `Discord answered ${r.status} on ${path}`))
    return (await r.json()) as T
  }
  die(t('O Discord pediu para esperar demais (429). Tente de novo mais tarde.', 'Discord asked to wait too long (429). Try again later.'))
}

const who = (a: { username: string; global_name?: string | null }) => (a.global_name ? `${a.global_name} (@${a.username})` : `@${a.username}`)

function msgLine(m: DMsg, guild: string, channel: string) {
  const d = new Date(m.timestamp)
  const when = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  let text = m.content
  for (const u of m.mentions ?? []) text = text.replaceAll(`<@${u.id}>`, `@${u.global_name ?? u.username}`).replaceAll(`<@!${u.id}>`, `@${u.global_name ?? u.username}`)
  const extra = [
    ...(m.attachments ?? []).map((a) => `[anexo: ${a.filename}]`),
    ...(m.embeds ?? []).filter((e) => e.title).map((e) => `[link: ${e.title}]`),
    m.thread ? `[abriu a thread "${m.thread.name}"]` : '',
  ].filter(Boolean)
  const reply = m.referenced_message ? `\n    ↳ respondendo a ${who(m.referenced_message.author)}: "${m.referenced_message.content.replace(/\s+/g, ' ').slice(0, 90)}"` : ''
  return `[${when}] ${who(m.author)}: ${[text.trim(), ...extra].filter(Boolean).join(' ')} — https://discord.com/channels/${guild}/${channel}/${m.id}${reply}`
}

/** Lê as mensagens novas dos canais em discord/canais.yaml e imprime o pedido de extração de cada um. */
async function cmdDiscord() {
  if (!flag('ler')) die(`Use ${bold('planos discord --ler')} [--canal <id>] [--dias 2]`)
  const s = load()
  let canais = parseCanais(readOpt(join(ROOT, DISCORD_FILE)))
  const only = flag('canal')
  if (only) canais = canais.filter((c) => c.id === only || c.nome === only)
  if (!canais.length) die(t(`Nenhum canal em ${join(ROOT, DISCORD_FILE)}. Adicione em Ajustes → Discord no app.`, `No channels in ${join(ROOT, DISCORD_FILE)}. Add them in Settings → Discord in the app.`))
  const key = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', 'token', '-w'], { encoding: 'utf8' })
  const token = key.status === 0 ? key.stdout.trim() : ''
  if (!token) die(t('Sem token do Discord no Keychain. Cole em Ajustes → Discord no app.', 'No Discord token in the Keychain. Paste it in Settings → Discord in the app.'))

  const me = await discordGet<{ id: string; username: string; global_name?: string | null }>(token, '/users/@me')
  const voce = `${who(me)} (id ${me.id})`
  const dias = Math.max(1, Number(flag('dias') ?? 2) || 2)
  const stateDir = join(ROOT, '.indice', 'discord')
  mkdirSync(stateDir, { recursive: true })
  const now = new Date()
  const stamp = `${todayISO(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  let novos = 0

  for (const canal of canais) {
    const info = await discordGet<{ guild_id?: string; name?: string }>(token, `/channels/${canal.id}`)
    const guild = info.guild_id ?? '@me'
    const nome = canal.nome || info.name || canal.id
    const stateFile = join(stateDir, `${canal.id}.json`)
    const last = existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, 'utf8')).last as string | undefined) : undefined
    let msgs: DMsg[] = []
    if (last) {
      let after = last
      for (let page = 0; page < 10; page++) {
        const batch = await discordGet<DMsg[]>(token, `/channels/${canal.id}/messages?after=${after}&limit=100`)
        msgs.push(...batch)
        if (batch.length < 100) break
        after = batch.reduce((a, m) => (BigInt(m.id) > BigInt(a) ? m.id : a), after)
        await sleep(600)
      }
    } else {
      // primeira leitura: as mensagens dos últimos dias
      const since = Date.now() - dias * 86_400_000
      let before: string | undefined
      for (let page = 0; page < 10; page++) {
        const batch = await discordGet<DMsg[]>(token, `/channels/${canal.id}/messages?limit=100${before ? `&before=${before}` : ''}`)
        msgs.push(...batch.filter((m) => snowflakeTime(m.id) >= since))
        if (batch.length < 100 || batch.some((m) => snowflakeTime(m.id) < since)) break
        before = batch.reduce((a, m) => (BigInt(m.id) < BigInt(a) ? m.id : a), batch[0].id)
        await sleep(600)
      }
    }
    msgs = msgs.filter((m) => m.content || m.attachments?.length).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    if (!msgs.length) {
      console.log(dim(t(`Sem mensagens novas em #${nome}.`, `No new messages in #${nome}.`)))
      continue
    }
    const rel = `.indice/conversas/discord-${slugify(nome)}-${stamp}.md`
    const header = `<!-- Discord #${nome} · ${msgs.length} mensagens · lido em ${now.toLocaleString('pt-BR')} · ${nomeUsuario()} é ${voce} -->`
    write(rel, `${header}\n\n${msgs.map((m) => msgLine(m, guild, canal.id)).join('\n')}\n`)
    writeFileSync(stateFile, JSON.stringify({ last: msgs[msgs.length - 1].id, lido: now.toISOString() }))
    novos++
    const project = s.projects.find((p) => p.slug === canal.projeto) ?? s.projects[0]
    console.log(`\n=== #${nome}: ${t(`${msgs.length} mensagens novas`, `${msgs.length} new messages`)} → ${join(ROOT, rel)} ===\n`)
    console.log(chatPrompt(project, s.plans.filter((p) => p.projectSlug === project.slug), join(ROOT, rel), ROOT, `Discord #${nome}`, todayISO(now), voce))
  }
  if (!novos) console.log(t('Nenhuma mensagem nova nos canais do Discord.', 'No new messages in the Discord channels.'))
}

// ---------- divulgação ----------

function gh<T>(path: string): T {
  const r = spawnSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (r.error) die(t('Não encontrei o comando gh (GitHub CLI). Instale e faça login com `gh auth login`.', "Couldn't find the gh command (GitHub CLI). Install it and log in with `gh auth login`."))
  if (r.status !== 0) die(`gh api ${path}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  return JSON.parse(r.stdout) as T
}

/** aceita divulgacao/<campanha>/<pasta>, <campanha>/<pasta> ou o caminho completo */
function postDir(arg: string | undefined) {
  if (!arg || arg === 'true') die(t('Diga a pasta do post, ex.: minha-campanha/2026-10-30-abc1234', 'Say which post folder, e.g. minha-campanha/2026-10-30-abc1234'))
  const rel = relative(resolve(ROOT), resolve(ROOT, arg.startsWith('divulgacao/') || arg.startsWith('/') || arg.startsWith('~/') ? expand(arg) : join('divulgacao', arg)))
  if (!rel.startsWith('divulgacao/') || !existsSync(join(ROOT, rel, 'post.md'))) die(t(`Não achei ${join(ROOT, rel, 'post.md')}`, `Couldn't find ${join(ROOT, rel, 'post.md')}`))
  return rel
}

function setPostStatus(rel: string, status: string, nota?: string) {
  const { data, body } = splitFrontmatter(readFileSync(join(ROOT, rel, 'post.md'), 'utf8'))
  const next = { ...data, status }
  const corpo = nota ? `${body.trimEnd()}\n\n${nota}\n` : body.startsWith('\n') ? body : `\n${body}`
  write(`${rel}/post.md`, `---\n${dump(next, { lineWidth: -1 })}---\n${corpo}`)
  return next
}

function notifyMac(title: string, text: string) {
  const q = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`
  spawnSync('osascript', ['-e', `display notification ${q(text)} with title ${q(title)} sound name "Glass"`])
}

/** posts de uma campanha em ordem (pasta = AAAA-MM-DD-sha7), com status */
function campaignPosts(slug: string) {
  const dir = join(ROOT, 'divulgacao', slug)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-[0-9a-f]{7,}$/.test(f) && existsSync(join(dir, f, 'post.md')))
    .sort()
    .map((f) => {
      const { data } = splitFrontmatter(readFileSync(join(dir, f, 'post.md'), 'utf8'))
      return { rel: `divulgacao/${slug}/${f}`, folder: f, status: String(data.status ?? ''), sha: String(data.sha ?? f.slice(11)) }
    })
}

function verificarCampanha(c: Campanha, today: string) {
  const stateFile = join(ROOT, DIVULGAR_STATE_DIR, `${c.slug}.json`)
  const state = existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, 'utf8')) as { sha?: string; branch?: string }) : {}
  // campanha trocou de branch (ex.: master → develop): recomeça da ponta da nova, sem virar post o que ela já tinha à frente
  const trocou = !!state.sha && (state.branch ?? 'master') !== c.branch
  const head = gh<{ sha: string; commit: { committer: { date: string } } }>(`repos/${c.repo}/commits/${c.branch}`)
  const saveState = () => {
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(stateFile, JSON.stringify({ sha: head.sha, branch: c.branch, verificado: new Date().toISOString() }))
  }
  // primeira vez: parte do último post já feito (ou da ponta atual, sem puxar o passado)
  const base = trocou ? undefined : (state.sha ?? campaignPosts(c.slug).pop()?.sha)
  if (!base) {
    saveState()
    return {
      linha: trocou
        ? t(`${c.nome}: agora na ${c.branch}, a partir de ${head.sha.slice(0, 7)}.`, `${c.nome}: now on ${c.branch}, starting from ${head.sha.slice(0, 7)}.`)
        : t(`${c.nome}: primeira verificação, a partir de ${head.sha.slice(0, 7)}.`, `${c.nome}: first check, starting from ${head.sha.slice(0, 7)}.`),
    }
  }
  const baseSha = base.length < 40 ? gh<{ sha: string }>(`repos/${c.repo}/commits/${base}`).sha : base
  if (baseSha === head.sha) {
    saveState()
    return { linha: t(`${c.nome}: nada novo na ${c.branch} (${head.sha.slice(0, 7)}).`, `${c.nome}: nothing new on ${c.branch} (${head.sha.slice(0, 7)}).`) }
  }
  const cmp = gh<{ commits: { sha: string }[]; total_commits: number }>(`repos/${c.repo}/compare/${baseSha}...${head.sha}`)
  const seen = new Set<number>()
  const prs: PrInfo[] = []
  for (const cm of cmp.commits) {
    const list = gh<{ number: number; title: string; body: string | null; html_url: string; merged_at: string | null; user: { login: string } }[]>(
      `repos/${c.repo}/commits/${cm.sha}/pulls`,
    )
    for (const p of list) {
      if (!p.merged_at || seen.has(p.number)) continue
      seen.add(p.number)
      const files = gh<{ filename: string }[]>(`repos/${c.repo}/pulls/${p.number}/files?per_page=100`).map((f) => f.filename)
      prs.push({ number: p.number, title: p.title, body: p.body ?? '', url: p.html_url, mergedAt: p.merged_at, author: p.user.login, files })
    }
  }
  // PR que já tem post (de uma rodada anterior ou feito à mão) não entra de novo
  const feitos = new Set(
    campaignPosts(c.slug).flatMap((x) => {
      const { data } = splitFrontmatter(readFileSync(join(ROOT, x.rel, 'post.md'), 'utf8'))
      return Array.isArray(data.prs) ? data.prs.map(Number) : []
    }),
  )
  const fora = prs.map((p) => [p, feitos.has(p.number) ? t('já tem post', 'already has a post') : ruido(p)] as const).filter(([, r]) => r)
  const bons = prs.filter((p) => !feitos.has(p.number) && !ruido(p))
  const foraTxt = fora.length ? ` ${t('Fora', 'Left out')}: ${fora.map(([p, r]) => `#${p.number} (${r})`).join(', ')}.` : ''
  if (!bons.length) {
    saveState()
    return { linha: t(`${c.nome}: ${cmp.total_commits} commits novos, ${prs.length} PRs, nenhum vira post.`, `${c.nome}: ${cmp.total_commits} new commits, ${prs.length} PRs, none becomes a post.`) + foraTxt }
  }
  const rel = `divulgacao/${c.slug}/${today}-${head.sha.slice(0, 7)}`
  if (!existsSync(join(ROOT, rel, 'post.md'))) {
    write(`${rel}/pr.md`, prMarkdown(c, bons))
    const fm = { titulo: `${c.nome}: ${bons.map((p) => `#${p.number}`).join(', ')}`, status: 'gerando', prs: bons.map((p) => p.number), sha: head.sha.slice(0, 7), repo: c.repo }
    write(`${rel}/post.md`, `---\n${dump(fm, { lineWidth: -1 })}---\n\nCriado por \`planos divulgar --verificar\` em ${today}.\n`)
  }
  saveState()
  return { linha: `${c.nome}: ${bons.length} ${t('PR(s) para post', 'PR(s) for a post')} (${bons.map((p) => `#${p.number}`).join(', ')}) → ${rel}.${foraTxt}` }
}

/** Divulgação: confere a branch de cada campanha e cria os posts a montar; --pronto e --descartar fecham um post. */
function cmdDivulgar() {
  const today = todayISO()
  if (flag('pronto')) {
    const rel = postDir(flag('pronto'))
    for (const f of ['imagem.png', 'legenda.md']) if (!existsSync(join(ROOT, rel, f))) die(t(`Falta ${f} em ${join(ROOT, rel)}`, `Missing ${f} in ${join(ROOT, rel)}`))
    const fm = setPostStatus(rel, 'pendente')
    commit(`divulgacao: ${rel.slice(11)} pronto para postar`)
    const c = parseCampanhas(readOpt(join(ROOT, CAMPANHAS_FILE))).find((x) => rel.startsWith(`divulgacao/${x.slug}/`))
    notifyMac(t('Letco · Divulgação', 'Letco · Promotion'), t(`Post ${c ? `de ${c.nome} ` : ''}pronto para postar: `, `Post ${c ? `for ${c.nome} ` : ''}ready to post: `) + String((fm as Record<string, unknown>).titulo ?? ''))
    console.log(green('✓ ') + t(`${rel} pronto: aparece em Divulgação → Para postar.`, `${rel} ready: it shows in Promotion → To post.`))
    return
  }
  if (flag('descartar')) {
    const rel = postDir(flag('descartar'))
    const motivo = flag('motivo')
    setPostStatus(rel, 'descartado', motivo && motivo !== 'true' ? `Descartado em ${today}: ${motivo}` : undefined)
    commit(`divulgacao: ${rel.slice(11)} descartado`)
    console.log(green('✓ ') + t(`${rel} descartado.`, `${rel} discarded.`))
    return
  }
  if (!flag('verificar'))
    die(
      t(
        `Use ${bold('planos divulgar --verificar')} [--campanha slug], --pronto <pasta> ou --descartar <pasta> --motivo "…"`,
        `Use ${bold('planos divulgar --verificar')} [--campanha slug], --pronto <folder> or --descartar <folder> --motivo "…"`,
      ),
    )
  let campanhas = parseCampanhas(readOpt(join(ROOT, CAMPANHAS_FILE)))
  const only = flag('campanha')
  if (only) campanhas = campanhas.filter((c) => c.slug === only)
  if (!campanhas.length) die(t(`Nenhuma campanha em ${join(ROOT, CAMPANHAS_FILE)}.`, `No campaigns in ${join(ROOT, CAMPANHAS_FILE)}.`))
  const s = load()
  for (const c of campanhas) console.log(verificarCampanha(c, today).linha)
  commit('divulgacao: verificação das campanhas')

  // tudo que está em "gerando" (o que acabou de entrar e o que ficou de uma rodada que não terminou)
  let n = 0
  for (const c of campanhas) {
    const posts = campaignPosts(c.slug)
    const plan = s.plans.find((p) => p.fm.id === c.plano)
    const idioma = plan && s.projects.find((p) => p.slug === plan.projectSlug)?.idioma
    for (const p of posts.filter((x) => x.status === 'gerando')) {
      const anterior = posts.filter((x) => x.folder < p.folder && existsSync(join(ROOT, x.rel, 'template.html'))).pop()?.rel
      console.log(`\n=== ${p.rel.slice(11)} ===\n`)
      console.log(gerarPostPrompt({ root: ROOT, c, pasta: p.rel.slice(11), today, anterior, idioma }))
      n++
    }
  }
  if (!n) console.log('\n' + t('Nenhum post para montar.', 'No posts to build.'))
}

// ---------- resumo do dia ----------

/** gh api sem matar o comando: o resumo sai mesmo sem GitHub */
function ghSoft<T>(args: string[]): T | null {
  const r = spawnSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (r.error || r.status !== 0) return null
  try {
    return JSON.parse(r.stdout) as T
  } catch {
    return null
  }
}

/** commits de rotina em ~/planos: não contam como trabalho do dia */
const ROTINA_RE = /^(lista do dia|discord: canais|divulgacao: verificação das campanhas|investigador: \d+ planos? conferidos?)$/

interface GhEvent {
  type: string
  created_at: string
  repo: { name: string }
  payload: { action?: string; number?: number; pull_request?: { number?: number; title?: string; merged?: boolean } }
}

/** o que o usuário fez no GitHub no dia: PRs abertos e mergeados (pelos eventos dele), revisões e commits (pela busca) */
function githubDoDia(date: string) {
  const off = -new Date(`${date}T12:00:00`).getTimezoneOffset()
  const tz = `${off < 0 ? '-' : '+'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`
  const range = `${date}T00:00:00${tz}..${date}T23:59:59${tz}`
  const me = ghSoft<{ login: string }>(['user'])?.login
  if (!me) return null
  const events: GhEvent[] = []
  for (let page = 1; page <= 3; page++) {
    const batch = ghSoft<GhEvent[]>([`users/${me}/events?per_page=100&page=${page}`]) ?? []
    events.push(...batch)
    if (batch.length < 100 || batch.some((e) => todayISO(new Date(e.created_at)) < date)) break
  }
  const titles = new Map<string, string>()
  const title = (repo: string, n: number) => {
    const k = `${repo}#${n}`
    if (!titles.has(k)) titles.set(k, ghSoft<{ title: string }>([`repos/${repo}/pulls/${n}`])?.title ?? '')
    return titles.get(k)!
  }
  const prs = { abertos: [] as string[], mergeados: [] as string[] }
  for (const e of events) {
    if (e.type !== 'PullRequestEvent' || todayISO(new Date(e.created_at)) !== date) continue
    const n = e.payload.number ?? e.payload.pull_request?.number
    if (!n) continue
    const merged = e.payload.action === 'merged' || (e.payload.action === 'closed' && e.payload.pull_request?.merged)
    const list = e.payload.action === 'opened' ? prs.abertos : merged ? prs.mergeados : null
    const line = `${e.repo.name}#${n} ${e.payload.pull_request?.title || title(e.repo.name, n)}`.trim()
    if (list && !list.includes(line)) list.push(line)
  }
  type Search = { total_count: number; items: { number: number; title: string; repository_url?: string; repository?: { full_name: string }; user?: { login: string } }[] }
  const revs =
    ghSoft<Search>(['-X', 'GET', 'search/issues', '-f', `q=is:pr reviewed-by:${me} -author:${me} updated:${range}`, '-f', 'per_page=30'])?.items.map(
      (i) => `${i.repository_url?.split('/').slice(-2).join('/')}#${i.number} ${i.title}`,
    ) ?? []
  const commits = ghSoft<Search>(['-X', 'GET', 'search/commits', '-f', `q=author:${me} committer-date:${range}`, '-f', 'per_page=100'])
  const porRepo = new Map<string, number>()
  for (const i of commits?.items ?? []) porRepo.set(i.repository!.full_name, (porRepo.get(i.repository!.full_name) ?? 0) + 1)
  return { me, ...prs, revisoes: revs, commits: commits?.total_count ?? 0, porRepo: [...porRepo].sort((a, b) => b[1] - a[1]) }
}

function cmdResumo() {
  if (flag('pronto')) {
    const date = flag('pronto')!
    const file = join(ROOT, RESUMOS_DIR, `${date}.md`)
    const raw = readOpt(file)
    if (!raw) die(t(`Não achei ${file}`, `Couldn't find ${file}`))
    const r = parseResumo(`${date}.md`, raw)
    commit(`resumo do dia ${date}`)
    notifyMac(t('Letco · Resumo do dia', 'Letco · Daily summary'), r.frase ?? t(`Resumo de ${date} pronto.`, `Summary for ${date} is ready.`))
    console.log(green('✓ ') + t(`${file} pronto: aparece em Resumos no app.`, `${file} ready: it shows in Summaries in the app.`))
    return
  }
  const date = flag('data') && flag('data') !== 'true' ? flag('data')! : todayISO()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(t('Use --data AAAA-MM-DD', 'Use --data YYYY-MM-DD'))
  const s = load()
  const fatos: string[] = []

  // tarefas do dia
  const tRaw = readOpt(join(ROOT, 'tarefas', `${date}.md`))
  const tarefas = tRaw ? parseTarefas(`${date}.md`, tRaw).items : []
  const feitas = tarefas.filter((t) => t.done)
  const abertas = tarefas.filter((t) => !t.done)
  const tLine = (t: (typeof tarefas)[number]) =>
    `- ${t.text}${t.planId ? ` (plano ${t.planId})` : ''}${t.conferido && !t.done ? ` — revisor: ${t.conferido.status}${t.conferido.blockedBy ? ` por ${t.conferido.blockedBy}` : ''}: ${t.conferido.text}` : ''}`
  fatos.push(`### Tarefas do dia (${feitas.length} de ${tarefas.length} feitas) — ${ROOT}/tarefas/${date}.md`)
  fatos.push(feitas.length ? `Feitas:\n${feitas.map(tLine).join('\n')}` : 'Nenhuma marcada como feita.')
  if (abertas.length) fatos.push(`Abertas:\n${abertas.map(tLine).join('\n')}`)

  // mudanças nos planos (commits em ~/planos)
  const next = format(addDays(new Date(`${date}T12:00:00`), 1), 'yyyy-MM-dd')
  const log = git('log', `--since=${date} 00:00`, `--until=${next} 00:00`, '--format=%ad\t%s', '--date=format:%H:%M').stdout.trim()
  const commits = log ? log.split('\n').map((l) => l.split('\t') as [string, string]).reverse() : []
  const trabalho = commits.filter(([, m]) => !ROTINA_RE.test(m))
  fatos.push(`\n### Mudanças nos planos (${trabalho.length} commits em ${ROOT}, sem contar ${commits.length - trabalho.length} das rotinas)`)
  fatos.push(trabalho.length ? trabalho.map(([h, m]) => `- ${h} ${m}`).join('\n') : 'Nenhuma.')

  // Log dos planos com a data do dia
  const logRe = new RegExp(`^\\s*[-*]\\s+${date}\\s*[:·-]\\s*(.+)$`)
  const logs: string[] = []
  for (const p of s.plans)
    for (const l of p.body.split('\n')) {
      const m = l.match(logRe)
      if (m) logs.push(`- ${projectName(s, p.projectSlug)} · ${p.fm.titulo} (${p.fm.id}): ${m[1].trim()}`)
    }
  fatos.push(`\n### Log dos planos com data de ${date} (${logs.length})`)
  fatos.push(logs.length ? logs.join('\n') : 'Nenhuma linha.')

  // conversas resumidas
  const conversas = s.projects.map((p) => `projetos/${p.slug}/conversas/${date}.md`).filter((f) => existsSync(join(ROOT, f)))
  if (conversas.length) fatos.push(`\n### Conversas do dia (leia se precisar de contexto)\n${conversas.map((f) => `- ${ROOT}/${f}`).join('\n')}`)

  // GitHub
  const gh = githubDoDia(date)
  if (gh) {
    fatos.push(`\n### GitHub (${gh.me})`)
    fatos.push(`PRs mergeados por ele: ${gh.mergeados.length ? '\n' + gh.mergeados.map((x) => `- ${x}`).join('\n') : 'nenhum'}`)
    fatos.push(`PRs abertos por ele: ${gh.abertos.length ? '\n' + gh.abertos.map((x) => `- ${x}`).join('\n') : 'nenhum'}`)
    fatos.push(`PRs de outros que ele revisou: ${gh.revisoes.length ? '\n' + gh.revisoes.map((x) => `- ${x}`).join('\n') : 'nenhum'}`)
    fatos.push(`Commits dele: ${gh.commits}${gh.porRepo.length ? ` (${gh.porRepo.map(([r, n]) => `${r}: ${n}`).join(', ')})` : ''}`)
  } else fatos.push(`\n### GitHub\nSem acesso ao gh agora: resuma só pelos planos e diga isso em ${t('Produtividade', 'Productivity')}.`)

  // "Precisa de você" em aberto, para o "Para amanhã"
  const asks = s.plans.filter(isOpen).flatMap((p) => (p.paraVoce?.acoes ?? []).filter((a) => !a.done).map((a) => `- ${a.text} (${p.fm.id})`))
  if (asks.length) fatos.push(`\n### "Precisa de você" ainda aberto nos planos\n${asks.slice(0, 12).join('\n')}`)

  const metricas: Metricas = {
    tarefas_feitas: feitas.length,
    tarefas_total: tarefas.length,
    fases: trabalho.filter(([, m]) => /conclu[ií]da F\d|F\d+ conclu[ií]da/i.test(m)).length,
    decisoes: Math.max(logs.filter((l) => /decidid/i.test(l)).length, trabalho.filter(([, m]) => /decidid/i.test(m)).length),
    prs_mergeados: gh?.mergeados.length ?? 0,
    prs_abertos: gh?.abertos.length ?? 0,
    revisoes: gh?.revisoes.length ?? 0,
    commits: gh?.commits ?? 0,
  }
  if (!feitas.length && !trabalho.length && !logs.length && !metricas.prs_mergeados && !metricas.prs_abertos && !metricas.revisoes && !metricas.commits) {
    console.log(t(`Nada feito em ${date}: sem resumo.`, `Nothing done on ${date}: no summary.`))
    return
  }
  const dir = join(ROOT, RESUMOS_DIR)
  const anteriores = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f < `${date}.md`)
        .sort()
        .slice(-7)
        .map((f) => parseResumo(f, readFileSync(join(dir, f), 'utf8')))
    : []
  const diaLabel = format(new Date(`${date}T12:00:00`), isEn() ? 'EEEE, MMM d' : 'EEEE, dd/MM', { locale: dfLocale() })
  console.log(`${t('Números de', 'Numbers for')} ${date}: ${METRICAS.map(({ key, label }) => `${metricas[key]} ${label}`).join(' · ')}\n`)
  console.log(resumoPrompt({ root: ROOT, date, diaLabel, fatos: fatos.join('\n'), metricas, anteriores }))
}

/**
 * Atividade fora do app: sessões recentes do app do Claude (só os dados de capa: título, pasta, branches e PRs;
 * a conversa não é lida) e PRs abertos ou mergeados no GitHub. Cada item sai marcado com o plano que já o cita,
 * ou "sem plano", seguido do pedido para a IA registrar nos planos o que andou.
 */
function cmdAtividade() {
  const s = load()
  const dias = Math.max(1, Math.min(14, Number(flag('dias') ?? 2) || 2))
  const desde = Date.now() - dias * 86_400_000
  const til = (p: string) => (p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p)
  const ativos = s.plans.filter((p) => p.fm.status !== 'arquivado')
  const planosDe = (o: { prs?: { repo: string; n: number }[]; cwd?: string; branches?: string[] }) => {
    const hit = ativos.filter((p) => {
      const wt = p.fm.worktree ? expand(p.fm.worktree) : ''
      if (o.cwd && wt && (o.cwd === wt || o.cwd.startsWith(wt + '/'))) return true
      if (o.cwd && o.cwd.startsWith(join(ROOT, dirname(p.path)))) return true
      if (o.prs?.some((x) => new RegExp(`#${x.n}\\b`).test(p.raw) && p.raw.toLowerCase().includes(x.repo.split('/').pop()!.toLowerCase()))) return true
      return !!o.branches?.some((b) => b.length > 6 && !/^(main|master|develop)$/.test(b) && p.raw.includes(b))
    })
    return hit.length ? `→ ${t('plano', 'plan')} ${hit.slice(0, 3).map((p) => p.fm.id).join(', ')}` : `→ ${t('SEM PLANO', 'NO PLAN')}`
  }

  type Sess = { title?: string; cwd?: string; lastActivityAt?: number; completedTurns?: number; scheduledTaskId?: string; isArchived?: boolean; writtenBranches?: string[]; prs?: { prNumber: number; repo: string; state?: string }[]; turnWrapUp?: { recap?: string } | null }
  const base = join(HOME, 'Library/Application Support/Claude/claude-code-sessions')
  const sess: Sess[] = []
  for (const a of existsSync(base) ? readdirSync(base) : []) {
    for (const o of statSync(join(base, a)).isDirectory() ? readdirSync(join(base, a)) : []) {
      const dir = join(base, a, o)
      if (!statSync(dir).isDirectory()) continue
      for (const f of readdirSync(dir)) {
        if (!f.startsWith('local_') || !f.endsWith('.json') || statSync(join(dir, f)).mtimeMs < desde) continue
        try {
          const d = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Sess
          // rotinas agendadas e o Console do app (pasta dos planos) não são trabalho novo
          if (d.scheduledTaskId || !d.completedTurns || !d.cwd || d.cwd === ROOT || (d.lastActivityAt ?? 0) < desde) continue
          // o app grava "<pasta>, um byte nulo, <branch>": fica só o nome da branch
          d.writtenBranches = [...new Set((d.writtenBranches ?? []).map((b) => b.split('\0').pop()!.trim()).filter(Boolean))]
          sess.push(d)
        } catch {
          // arquivo de sessão ilegível: ignora
        }
      }
    }
  }
  sess.sort((x, y) => (y.lastActivityAt ?? 0) - (x.lastActivityAt ?? 0))

  const out: string[] = [t(`Atividade fora do app nos últimos ${dias} dias (${ROOT})`, `Activity outside the app in the last ${dias} days (${ROOT})`), '']
  out.push(t(`## Sessões do Claude (${sess.length})`, `## Claude sessions (${sess.length})`))
  for (const d of sess.slice(0, 60)) {
    const prs = (d.prs ?? []).map((p) => ({ repo: p.repo, n: p.prNumber, state: p.state }))
    const quando = format(new Date(d.lastActivityAt!), 'dd/MM HH:mm')
    const extra = [
      d.writtenBranches?.length ? `branch ${d.writtenBranches.slice(0, 3).join(', ')}` : '',
      prs.length ? `PR ${prs.map((p) => `${p.repo}#${p.n}${p.state ? ` (${p.state})` : ''}`).join(', ')}` : '',
      d.turnWrapUp?.recap ? `"${d.turnWrapUp.recap.replace(/\s+/g, ' ').slice(0, 220)}"` : '',
    ].filter(Boolean)
    out.push(`- [${quando}] "${d.title ?? t('sem título', 'untitled')}" · ${til(d.cwd!)}${extra.length ? ' · ' + extra.join(' · ') : ''} ${planosDe({ prs, cwd: d.cwd, branches: d.writtenBranches })}`)
  }
  if (!sess.length) out.push(t('(nenhuma)', '(none)'))

  out.push('', t('## PRs seus no GitHub', '## Your PRs on GitHub'))
  let nPr = 0
  for (let i = 0; i < dias; i++) {
    const date = todayISO(addDays(new Date(), -i))
    const g = githubDoDia(date)
    if (!g) {
      out.push(t('(sem acesso ao GitHub: rode gh auth login)', '(no GitHub access: run gh auth login)'))
      break
    }
    for (const [rotulo, lista] of [[t('aberto', 'opened'), g.abertos], [t("mergeado", "merged"), g.mergeados]] as const) {
      for (const linha of lista) {
        const m = linha.match(/^(\S+)#(\d+)/)
        out.push(`- ${date} ${rotulo}: ${linha} ${m ? planosDe({ prs: [{ repo: m[1], n: Number(m[2]) }] }) : ''}`)
        nPr++
      }
    }
  }
  if (!nPr) out.push(t('(nenhum)', '(none)'))

  out.push(
    '',
    t('## O que fazer com isso', '## What to do with this'),
    `O app só mostra o que está escrito em ${ROOT}. Registre nos planos o trabalho acima, para ${nomeUsuario()} ver o que andou sem ter de contar:`,
    '1. Item com "→ plano <id>": confira no GitHub ou no repositório local o estado real (PR aberto, mergeado, commits na branch) e atualize aquele plano: linha no Log (`- AAAA-MM-DD: <o que foi feito>, PR dono/repo#n`), fase marcada só com evidência (PR mergeado ou commit na branch principal), "Como está" e "Precisa de você" reescritos. Se uma tarefa do dia ou um item de "Precisa de você" ficou resolvido por esse trabalho, marque [x] com a linha `  - Conferido AAAA-MM-DD · já feito: <evidência>`.',
    `2. Item "→ SEM PLANO" que é trabalho de verdade (tem PR ou branch, ou são 2 ou mais sessões sobre o mesmo assunto): primeiro veja se é parte de um plano existente do mesmo projeto e, se for, registre lá como no passo 1. Se não for, crie um plano novo no padrão da skill planejamento, com status andamento (ou revisao, se o PR já está aberto esperando revisão), as fases já feitas marcadas com a evidência e as próximas em aberto. Descubra o projeto pela pasta ou pelo repositório; sem projeto claro, pergunte.`,
    '3. Item "→ SEM PLANO" pequeno (uma sessão curta, sem PR nem branch: uma pergunta, um teste, um ajuste): não crie plano; ignore.',
    '4. Não crie tarefa do dia para trabalho que já está andando sozinho: isto é registro do que foi feito, não pedido novo.',
    'Só leitura nos repositórios de código. A conversa das sessões não é lida: use só o título, a pasta, as branches e os PRs acima, e o que o GitHub e o git mostram.',
    `Ao terminar: \`git -C ${ROOT} add -A && git -C ${ROOT} commit -m "atividade: <N planos atualizados, M criados>"\` e diga em até 6 linhas o que mudou em cada plano.`,
    idiomaRegra(),
  )
  console.log(out.join('\n'))
}

/** Rotinas do Letco: lista, ou imprime o texto de uma (é o prompt da tarefa agendada no app do Claude). */
function cmdRotina() {
  load()
  const id = positional[1]
  if (positional[0] === 'rotinas' || !id) {
    for (const r of ROTINAS) console.log(`${bold(r.id)}  ${r.titulo} · ${r.quando} · cron ${r.cron}\n  ${dim(r.descricao)}`)
    return
  }
  const r = rotina(id)
  if (!r) die(t(`Rotina desconhecida: ${id}. Rode ${bold('planos rotinas')} para ver a lista.`, `Unknown routine: ${id}. Run ${bold('planos rotinas')} to see the list.`))
  console.log(r.texto(ROOT))
}

/** ajuda: função, para ler o idioma na hora de mostrar */
function help() {
  const en = isEn()
  const L = (cmd: string, pt: string, eng: string) => `  ${cmd}${en ? eng : pt}`
  return [
    `${bold('planos')} — ${t('planejamentos em', 'plans in')} ${dim(ROOT)}`,
    '',
    L(`${bold('planos hoje')} [--escrever]           `, 'lista do dia (--escrever grava hoje.md)', 'daily list (--escrever writes hoje.md)'),
    L(`${bold('planos semana')} [--escrever]         `, 'resumo da semana por projeto (semana.md)', 'weekly summary by project (semana.md)'),
    L(`${bold('planos ls')} [projeto] [--todos]      `, 'planos abertos, na ordem do contexto', 'open plans, in context order'),
    L(`${bold('planos ver')} <id>                    `, 'um plano: fases, decisões, cobranças', 'one plan: phases, decisions, follow-ups'),
    L(`${bold('planos falar')} <id> [claude|codex]   `, 'abre o agente no worktree com o prompt pronto (--app, --orca)', 'opens the agent in the worktree with the prompt ready (--app, --orca)'),
    L(`${bold('planos projeto')} <proj> [claude|codex] `, 'sessão do projeto, sem task', 'project session, no task'),
    L(`${bold('planos novo')} <proj> ${t('"título"        ', '"title"         ')}`, '[--prioridade alta] [--prazo AAAA-MM-DD] [--objetivo "…"]', '[--prioridade alta] [--prazo YYYY-MM-DD] [--objetivo "…"]'),
    L(`${bold('planos status')} <id> <status>        `, STATUSES.join(' | '), STATUSES.join(' | ')),
    L(`${bold('planos prazo')} <id> `, '<AAAA-MM-DD|->', '<YYYY-MM-DD|->'),
    L(`${bold('planos prioridade')} <id> `, '<alta|media|baixa>', '<alta|media|baixa>'),
    L(`${bold('planos fase concluir')} <id> [F3]     `, 'sem F, conclui a próxima (também: reabrir, nova)', 'without F, completes the next one (also: reabrir, nova)'),
    L(`${bold('planos editar')} <id>                 `, 'abre o plano.md no $EDITOR', 'opens plano.md in $EDITOR'),
    L(`${bold('planos arquivar')} <id>               `, 'apagar = arquivar (desarquivar desfaz)', 'delete = archive (desarquivar undoes it)'),
    L(`${bold('planos importar')}                    `, 'traz os arquivos de entrada/', 'brings in the files from entrada/'),
    L(`${bold('planos iniciar')} [--nome X]          `, `cria ${ROOT}`, `creates ${ROOT}`),
    L(`${bold('planos agendar')} [--remover]         `, 'rotinas de dias úteis que gravam hoje.md e semana.md', 'weekday routines that write hoje.md and semana.md'),
    L(`${bold('planos discord --ler')} [--canal id]  `, 'lê as mensagens novas dos canais (token no Keychain) e imprime o pedido de extração', 'reads new channel messages (token in the Keychain) and prints the extraction request'),
    L(`${bold('planos divulgar --verificar')}        `, 'confere a branch de cada campanha (campanhas.yaml) e imprime o pedido de cada post a montar', 'checks the branch of each campaign (campanhas.yaml) and prints the request for each post to build'),
    L(`${bold('planos atividade')} [--dias 2]       `, 'sessões do Claude e PRs recentes, com o plano de cada um (ou "sem plano") e o pedido para registrar', 'recent Claude sessions and PRs, with the plan each belongs to (or "no plan") and the request to record them'),
    L(`${bold('planos rotinas')}                     `, `lista as rotinas do Letco; ${bold('planos rotina')} <id> imprime o texto de uma`, `lists the Letco routines; ${bold('planos rotina')} <id> prints one`),
    L(`${bold('planos resumo')} ${t('[--data AAAA-MM-DD]    ', '[--data YYYY-MM-DD]    ')}`, 'junta os fatos do dia e imprime o pedido do resumo (--pronto <data>: commit e aviso no Mac)', "gathers the day's facts and prints the summary request (--pronto <date>: commit and Mac notification)"),
    L(`${bold('planos divulgar --pronto')} ${t('<pasta>   ', '<folder>  ')}`, 'post montado: vai para "Para postar" e avisa no Mac (--descartar <pasta> --motivo "…")', 'post built: moves to "To post" and notifies on the Mac (--descartar <folder> --motivo "…")'),
    '',
    t('  <id> aceita parte do id ou do título. --contexto trabalho|fora força o contexto.', '  <id> accepts part of the id or the title. --contexto trabalho|fora forces the context.'),
  ].join('\n')
}

const commands: Record<string, () => void | Promise<void>> = {
  discord: cmdDiscord,
  divulgar: cmdDivulgar,
  resumo: cmdResumo,
  rotina: cmdRotina,
  atividade: cmdAtividade,
  rotinas: cmdRotina,
  hoje: cmdHoje,
  semana: cmdSemana,
  ls: cmdLs,
  ver: cmdVer,
  falar: cmdFalar,
  projeto: cmdProjeto,
  novo: cmdNovo,
  status: cmdStatus,
  prazo: cmdPrazo,
  prioridade: cmdPrioridade,
  fase: cmdFase,
  editar: cmdEditar,
  arquivar: () => cmdArquivar(false),
  desarquivar: () => cmdArquivar(true),
  importar: cmdImportar,
  iniciar: cmdIniciar,
  agendar: cmdAgendar,
}

// idioma antes de qualquer comando (ajuda, iniciar, erros que saem antes do load); o load() lê de novo
const yamlInicial = readOpt(join(ROOT, 'projetos.yaml'))
if (yamlInicial) setLang(parseConfig(yamlInicial).usuario?.idioma)

const cmd = positional[0] ?? 'hoje'
if (cmd === 'ajuda' || cmd === 'help' || flag('help') || flag('ajuda')) console.log(help())
else if (commands[cmd]) Promise.resolve(commands[cmd]()).catch((e) => die(String(e?.message ?? e)))
else {
  console.error(red(t(`Comando desconhecido: ${cmd}`, `Unknown command: ${cmd}`)) + '\n')
  console.log(help())
  process.exit(1)
}
