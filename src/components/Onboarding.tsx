import { useEffect, useState, type ReactNode } from 'react'
import { Check, CircleAlert, Download, FolderSearch, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../store'
import { api } from '../lib/api'
import { ROTINAS } from '../lib/rotinas'
import { slugify } from '../lib/plan'
import { LANG_LABEL, t } from '../lib/i18n'
import type { Idioma } from '../lib/types'
import { Button, cn } from './ui'

const field =
  'h-9 w-full rounded-[8px] border border-[var(--border-strong)] bg-transparent px-3 text-[13.5px] outline-none transition-shadow placeholder:text-[var(--text-3)] focus:border-accent focus:ring-[3px] focus:ring-accent/15'

const dias7 = () => [t('seg', 'Mon'), t('ter', 'Tue'), t('qua', 'Wed'), t('qui', 'Thu'), t('sex', 'Fri'), t('sáb', 'Sat'), t('dom', 'Sun')]
const passos = () => [t('Você', 'You'), t('Projetos', 'Projects'), t('Comando e skill', 'Command and skill'), t('Seus planos', 'Your plans'), t('Rotinas', 'Routines')]

/**
 * Primeira vez no Letco: perfil, projetos e horário (cria ~/planos), comando e skill, planos que a pessoa já tem
 * e rotinas no app do Claude. Também abre de Ajustes ("Refazer configuração"), já preenchido.
 */
export function Onboarding() {
  const env = useStore((s) => s.env)
  const ws = useStore((s) => s.ws)
  const config = useStore((s) => s.config)
  const projects = useStore((s) => s.projects)
  const setupWorkspace = useStore((s) => s.setupWorkspace)
  const setOnboarding = useStore((s) => s.setOnboarding)
  const go = useStore((s) => s.go)
  const lang = useStore((s) => s.lang)

  const [passo, setPasso] = useState(0)
  const [nome, setNome] = useState(config.usuario?.nome ?? '')
  const [apelidos, setApelidos] = useState((config.usuario?.apelidos ?? []).join(', '))
  const [novos, setNovos] = useState<string[]>([])
  const trab = config.contextos.trabalho
  const [dias, setDias] = useState<number[]>(trab.dias ?? [1, 2, 3, 4, 5])
  const [inicio, setInicio] = useState(trab.inicio ?? '09:00')
  const [fim, setFim] = useState(trab.fim ?? '18:00')
  const [busy, setBusy] = useState(false)

  const lista = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

  async function criar() {
    setBusy(true)
    try {
      setOnboarding(true)
      await setupWorkspace({ nome, apelidos: lista(apelidos), idioma: lang, projetos: novos, trabalho: { dias: [...dias].sort(), inicio, fim } })
      setNovos([])
      setPasso(2)
    } catch (e) {
      toast.error(t('Não consegui criar a pasta', "Couldn't create the folder"), { description: String(e) })
    }
    setBusy(false)
  }

  function concluir() {
    setOnboarding(false)
    go({ kind: 'today' })
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-[var(--bg)]">
      <div data-tauri-drag-region className="fixed inset-x-0 top-0 h-12" />
      <div className="animate-pop w-[520px] pb-16 pt-[9vh]">
        {passo === 0 && (
          <div className="mb-7 text-center">
            <img src="/app-icon.png" alt="" className="mx-auto mb-4 h-16 w-16 drop-shadow-md" />
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{ws?.exists ? t('Configuração do Letco', 'Letco setup') : t('Bem-vindo ao Letco', 'Welcome to Letco')}</h1>
            <p className="mx-auto mt-2 max-w-[400px] text-[14px] leading-relaxed text-[var(--text-2)]">
              {t('Seus planos em Markdown dentro de', 'Your plans in Markdown inside')} <code className="text-[13px]">{env?.root ?? '~/planos'}</code>
              {t(', com histórico no git, e o Claude cuidando para que fiquem em dia.', ', with git history, and Claude keeping them up to date.')}
            </p>
          </div>
        )}

        <ol className="mb-5 flex items-center gap-1.5">
          {passos().map((p, i) => (
            <li key={i} className="flex flex-1 flex-col gap-1.5">
              <span className={cn('h-[3px] rounded-full', i <= passo ? 'bg-accent' : 'bg-[var(--border-strong)]')} />
              <span className={cn('text-[11px]', i === passo ? 'font-medium text-[var(--text)]' : 'text-[var(--text-3)]')}>{p}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          {passo === 0 && <PassoVoce nome={nome} setNome={setNome} apelidos={apelidos} setApelidos={setApelidos} />}
          {passo === 1 && (
            <PassoProjetos
              existentes={projects.map((p) => p.nome)}
              novos={novos}
              setNovos={setNovos}
              dias={dias}
              setDias={setDias}
              inicio={inicio}
              setInicio={setInicio}
              fim={fim}
              setFim={setFim}
            />
          )}
          {passo === 2 && <PassoFerramentas />}
          {passo === 3 && <PassoPlanos />}
          {passo === 4 && <PassoRotinas />}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {passo > 0 && passo !== 2 && (
            <Button variant="ghost" onClick={() => setPasso(passo - 1)} disabled={busy}>
              {t('Voltar', 'Back')}
            </Button>
          )}
          {ws?.exists && passo < 2 && (
            <Button variant="ghost" onClick={() => setOnboarding(false)} disabled={busy}>
              {t('Fechar', 'Close')}
            </Button>
          )}
          <span className="flex-1" />
          {passo === 0 && (
            <Button variant="primary" className="h-9 px-5" disabled={!nome.trim()} onClick={() => setPasso(1)}>
              {t('Continuar', 'Continue')}
            </Button>
          )}
          {passo === 1 && (
            <Button variant="primary" className="h-9 px-5" disabled={busy || !dias.length} onClick={criar}>
              {busy ? t('Preparando…', 'Setting up…') : ws?.exists ? t('Salvar e continuar', 'Save and continue') : t(`Criar ${env?.root ?? '~/planos'}`, `Create ${env?.root ?? '~/planos'}`)}
            </Button>
          )}
          {(passo === 2 || passo === 3) && (
            <Button variant="primary" className="h-9 px-5" onClick={() => setPasso(passo + 1)}>
              {t('Continuar', 'Continue')}
            </Button>
          )}
          {passo === 4 && (
            <Button variant="primary" className="h-9 px-5" onClick={concluir}>
              {t('Concluir', 'Finish')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Titulo({ children, desc }: { children: ReactNode; desc?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{children}</h2>
      {desc && <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-2)]">{desc}</p>}
    </div>
  )
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[12.5px] font-medium text-[var(--text-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-[var(--text-3)]">{hint}</span>}
    </label>
  )
}

/** item da lista "o que este Mac tem": ok, ou o que fazer para ter */
function Requisito({ ok, nome, uso, falta }: { ok: boolean | null; nome: string; uso: string; falta: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className="mt-[1px] flex h-4 w-4 flex-none items-center justify-center">
        {ok === null ? (
          <Loader2 size={13} className="animate-spin text-[var(--text-3)]" />
        ) : ok ? (
          <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleAlert size={14} className="text-amber-600 dark:text-amber-400" />
        )}
      </span>
      <div className="min-w-0 text-[13px]">
        <span className="font-medium">{nome}</span> <span className="text-[var(--text-3)]">· {uso}</span>
        {ok === false && <div className="mt-0.5 text-[12.5px] text-[var(--text-2)]">{falta}</div>}
      </div>
    </li>
  )
}

/** Português / English: troca na hora, antes de qualquer outro campo */
function EscolhaIdioma() {
  const lang = useStore((s) => s.lang)
  const setLangUI = useStore((s) => s.setLangUI)
  return (
    <div className="mb-4 flex items-center gap-1 rounded-[9px] bg-[var(--bg-hover)] p-0.5">
      {(Object.keys(LANG_LABEL) as Idioma[]).map((l) => (
        <button
          key={l}
          onClick={() => setLangUI(l)}
          className={cn('h-7 flex-1 rounded-[7px] text-[12.5px] transition-colors', lang === l ? 'bg-[var(--bg)] font-medium text-[var(--text)] shadow-sm' : 'text-[var(--text-2)] hover:text-[var(--text)]')}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  )
}

function PassoVoce({ nome, setNome, apelidos, setApelidos }: { nome: string; setNome: (s: string) => void; apelidos: string; setApelidos: (s: string) => void }) {
  const env = useStore((s) => s.env)
  const [gh, setGh] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!env?.hasGh) return setGh(null)
    api
      .ghUser()
      .then((login) => {
        setGh(login)
        if (login && !apelidos.split(',').map((x) => x.trim()).includes(login)) setApelidos(apelidos ? `${apelidos}, ${login}` : login)
      })
      .catch(() => setGh(null))
    // só na primeira vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <EscolhaIdioma />
      <Titulo desc={t('O nome vai nos pedidos que o Letco faz ao Claude, como “o que você precisa decidir hoje”.', 'Your name goes into the requests Letco sends to Claude, like “what you need to decide today”.')}>
        {t('Quem é você', 'Who you are')}
      </Titulo>
      <Campo label={t('Seu nome', 'Your name')}>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t('Como quer ser chamado', 'What you want to be called')} className={field} />
      </Campo>
      <Campo
        label={t('Outros nomes (opcional)', 'Other names (optional)')}
        hint={t(
          'Como você aparece no Discord, no GitHub ou nas conversas, separados por vírgula. Ajuda a IA a saber quais mensagens são para você.',
          'How you show up on Discord, GitHub or in chats, separated by commas. Helps the AI tell which messages are for you.',
        )}
      >
        <input value={apelidos} onChange={(e) => setApelidos(e.target.value)} placeholder={t('ex.: Nome completo, usuario-github', 'e.g. Full name, github-username')} className={field} />
      </Campo>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-1 text-[12.5px] font-medium text-[var(--text-2)]">{t('O que este Mac tem', 'What this Mac has')}</div>
        <ul>
          <Requisito ok={env?.hasGit ?? false} nome="git" uso={t('histórico dos planos', 'plan history')} falta={<>{t('Rode', 'Run')} <code>xcode-select --install</code> {t('no Terminal.', 'in Terminal.')}</>} />
          <Requisito ok={env?.hasNode ?? false} nome="Node.js" uso={t('o comando planos', 'the planos command')} falta={<>{t('Instale em nodejs.org ou com', 'Install from nodejs.org or with')} <code>brew install node</code>.</>} />
          <Requisito
            ok={!env?.hasGh ? false : gh === undefined ? null : !!gh}
            nome={gh ? `GitHub (${gh})` : 'GitHub CLI'}
            uso={t('conferir PRs e o resumo do dia', 'checking PRs and the daily summary')}
            falta={
              env?.hasGh ? (
                <>
                  {t('Rode', 'Run')} <code>gh auth login</code> {t('no Terminal.', 'in Terminal.')}
                </>
              ) : (
                <>
                  {t('Instale com', 'Install with')} <code>brew install gh</code> {t('e rode', 'and run')} <code>gh auth login</code>.
                </>
              )
            }
          />
          <Requisito ok={env?.hasClaudeApp ?? false} nome={t('App do Claude', 'Claude app')} uso={t('as rotinas agendadas', 'scheduled routines')} falta={<>{t('Baixe em claude.ai/download e entre na sua conta.', 'Download it from claude.ai/download and sign in.')}</>} />
          <Requisito ok={env?.hasClaude ?? false} nome="Claude Code" uso={t('o Console e as conversas sobre planos', 'the Console and chats about plans')} falta={<>{t('Rode', 'Run')} <code>npm install -g @anthropic-ai/claude-code</code>.</>} />
        </ul>
        <p className="mt-2 text-[12px] text-[var(--text-3)]">{t('Dá para seguir sem tudo isso e instalar depois; o que faltar só deixa de funcionar até lá.', "You can continue without all of this and install it later; whatever's missing just won't work until then.")}</p>
      </div>
    </>
  )
}

function PassoProjetos(p: {
  existentes: string[]
  novos: string[]
  setNovos: (n: string[]) => void
  dias: number[]
  setDias: (d: number[]) => void
  inicio: string
  setInicio: (s: string) => void
  fim: string
  setFim: (s: string) => void
}) {
  const [texto, setTexto] = useState('')
  const usados = new Set([...p.existentes, ...p.novos].map(slugify))
  const add = () => {
    const n = texto.trim()
    if (!n || usados.has(slugify(n))) return setTexto('')
    p.setNovos([...p.novos, n])
    setTexto('')
  }

  return (
    <>
      <Titulo desc={t('Cada projeto vira uma pasta com os planos dele. Pode ser um cliente, um produto ou uma área da vida.', 'Each project becomes a folder with its plans. It can be a client, a product or an area of your life.')}>
        {t('Seus projetos', 'Your projects')}
      </Titulo>
      <div className="flex gap-2">
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={t('Nome do projeto e Enter', 'Project name, then Enter')}
          className={field}
        />
        <Button className="h-9" onClick={add} disabled={!texto.trim()}>
          {t('Adicionar', 'Add')}
        </Button>
      </div>
      <div className="mt-3 flex min-h-[28px] flex-wrap gap-1.5">
        {p.existentes.map((n) => (
          <span key={n} className="rounded-full bg-[var(--bg-hover)] px-2.5 py-1 text-[12.5px] text-[var(--text-2)]">
            {n}
          </span>
        ))}
        {p.novos.map((n) => (
          <span key={n} className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-2.5 pr-1 text-[12.5px] text-[var(--text)]">
            {n}
            <button aria-label={t(`Tirar ${n}`, `Remove ${n}`)} onClick={() => p.setNovos(p.novos.filter((x) => x !== n))} className="rounded-full p-0.5 text-[var(--text-3)] hover:text-[var(--text)]">
              <X size={12} />
            </button>
          </span>
        ))}
        {!p.existentes.length && !p.novos.length && <span className="text-[12.5px] text-[var(--text-3)]">{t('Nenhum ainda. Dá para criar depois, pelo + da barra lateral.', 'None yet. You can create them later with the + in the sidebar.')}</span>}
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-1 text-[12.5px] font-medium text-[var(--text-2)]">{t('Horário de trabalho', 'Work hours')}</div>
        <p className="mb-2.5 text-[12px] text-[var(--text-3)]">{t('Fora dele, a barra lateral pode esconder os projetos de trabalho (o olho ao lado de cada um).', 'Outside them, the sidebar can hide work projects (the eye next to each one).')}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {dias7().map((d, i) => {
            const n = i + 1
            const on = p.dias.includes(n)
            return (
              <button
                key={d}
                onClick={() => p.setDias(on ? p.dias.filter((x) => x !== n) : [...p.dias, n])}
                className={cn(
                  'h-7 w-10 rounded-[7px] text-[12.5px] transition-colors',
                  on ? 'bg-accent text-white' : 'text-[var(--text-2)] shadow-[0_0_0_1px_var(--border-strong)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {d}
              </button>
            )
          })}
          <span className="ml-2 flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)]">
            {t('das', 'from')}
            <input type="time" value={p.inicio} onChange={(e) => p.setInicio(e.target.value)} className={cn(field, 'h-7 w-[92px] px-2 text-[12.5px]')} />
            {t('às', 'to')}
            <input type="time" value={p.fim} onChange={(e) => p.setFim(e.target.value)} className={cn(field, 'h-7 w-[92px] px-2 text-[12.5px]')} />
          </span>
        </div>
      </div>
    </>
  )
}

function PassoFerramentas() {
  const env = useStore((s) => s.env)
  const [cli, setCli] = useState<'ok' | 'erro' | null>(env?.cliInstalled ? 'ok' : null)
  const [skill, setSkill] = useState<'ok' | 'erro' | null>(env?.skillInstalled ? 'ok' : null)
  const [busy, setBusy] = useState(false)

  async function instalar() {
    setBusy(true)
    await api.installCli().then(
      () => setCli('ok'),
      (e) => (setCli('erro'), toast.error(t('Não consegui instalar o comando', "Couldn't install the command"), { description: String(e) })),
    )
    await api.installSkill().then(
      () => setSkill('ok'),
      (e) => (setSkill('erro'), toast.error(t('Não consegui instalar a skill', "Couldn't install the skill"), { description: String(e) })),
    )
    setBusy(false)
  }

  async function zip() {
    try {
      const path = await api.exportSkillZip()
      toast.success(t('Skill salva para o claude.ai', 'Skill saved for claude.ai'), {
        description: t(`${path}. No claude.ai: Ajustes → Capabilities → Skills → Upload skill.`, `${path}. On claude.ai: Settings → Capabilities → Skills → Upload skill.`),
        duration: 10000,
      })
    } catch (e) {
      toast.error(t('Não consegui salvar o .zip', "Couldn't save the .zip"), { description: String(e) })
    }
  }

  const estado = (s: 'ok' | 'erro' | null) =>
    s === 'ok' ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : s === 'erro' ? <CircleAlert size={14} className="text-rose-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--border-strong)]" />

  return (
    <>
      <Titulo
        desc={t(
          'O comando planos é o que as rotinas e o Claude usam para ler e atualizar os planos. A skill ensina o Claude (e o Codex) a escrever planos no padrão do Letco.',
          "The planos command is what routines and Claude use to read and update plans. The skill teaches Claude (and Codex) to write plans in Letco's format.",
        )}
      >
        {t('Comando e skill', 'Command and skill')}
      </Titulo>
      <ul className="mb-4 space-y-2 text-[13px]">
        <li className="flex items-center gap-2.5">
          <span className="flex w-4 justify-center">{estado(cli)}</span>
          <span>
            {t('Comando', 'The')} <code>planos</code> {t('em ~/.local/bin', 'command in ~/.local/bin')}
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className="flex w-4 justify-center">{estado(skill)}</span>
          <span>{t('Skills no Claude Code (~/.claude/skills): planejamento, /letco e /letco-atualizar; e o padrão no Codex', 'Skills in Claude Code (~/.claude/skills): planejamento, /letco and /letco-atualizar; and the format in Codex')}</span>
        </li>
      </ul>
      <Button variant={cli === 'ok' && skill === 'ok' ? 'secondary' : 'primary'} disabled={busy} onClick={instalar}>
        {busy ? t('Instalando…', 'Installing…') : cli === 'ok' && skill === 'ok' ? t('Instalar de novo', 'Reinstall') : t('Instalar', 'Install')}
      </Button>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="text-[13px] font-medium">{t('Usar a skill no Claude da web e do celular', 'Use the skill in Claude on the web and mobile')}</div>
        <p className="mb-2.5 mt-0.5 text-[12.5px] text-[var(--text-2)]">
          {t(
            'Salva a skill num .zip em Downloads. No claude.ai, envie em Ajustes → Capabilities → Skills. Lá, sem acesso à pasta, o Claude entrega o plano como arquivo para você soltar em entrada/.',
            "Saves the skill as a .zip in Downloads. On claude.ai, upload it under Settings → Capabilities → Skills. There, without access to the folder, Claude hands you the plan as a file to drop into entrada/.",
          )}
        </p>
        <Button size="sm" onClick={zip}>
          <Download size={13} /> {t('Salvar .zip da skill', 'Save skill .zip')}
        </Button>
      </div>
    </>
  )
}

function PassoPlanos() {
  const juntarPlanos = useStore((s) => s.juntarPlanos)
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Titulo
        desc={t(
          'Se você já tem planos espalhados (planos do Claude Code, PLAN.md e TODO.md nos repositórios, documentos soltos), o Claude procura, mostra a lista e pergunta quais entram. Ele só copia: os originais ficam onde estão.',
          'If you already have plans scattered around (Claude Code plans, PLAN.md and TODO.md in repos, loose documents), Claude finds them, shows the list and asks which ones to bring in. It only copies: the originals stay where they are.',
        )}
      >
        {t('Juntar os planos que você já tem', 'Gather the plans you already have')}
      </Titulo>
      <Button
        variant={aberto ? 'secondary' : 'primary'}
        onClick={async () => {
          await juntarPlanos()
          setAberto(true)
        }}
      >
        <FolderSearch size={14} /> {aberto ? t('Abrir o pedido de novo', 'Open the request again') : t('Juntar no Claude', 'Gather with Claude')}
      </Button>
      <p className="mt-3 text-[12.5px] text-[var(--text-3)]">
        {aberto
          ? t('O pedido está no Claude. Pode continuar aqui: os planos aparecem no Letco quando ele terminar.', 'The request is in Claude. You can continue here: the plans show up in Letco when it finishes.')
          : t('Sem planos antigos? Continue: dá para fazer isso depois, em Ajustes.', 'No old plans? Continue: you can do this later in Settings.')}
      </p>
    </>
  )
}

function PassoRotinas() {
  const env = useStore((s) => s.env)
  const instalarRotinas = useStore((s) => s.instalarRotinas)
  const [sel, setSel] = useState(() => new Set(ROTINAS.filter((r) => r.padrao).map((r) => r.id)))
  const [aberto, setAberto] = useState(false)
  const nota: Record<string, string> = {
    'planos-discord': t('Precisa dos canais e do token em Ajustes → Discord.', 'Needs the channels and token in Settings → Discord.'),
    'planos-divulgacao': t('Precisa de campanhas em divulgacao/campanhas.yaml.', 'Needs campaigns in divulgacao/campanhas.yaml.'),
  }

  return (
    <>
      <Titulo
        desc={t(
          'Tarefas agendadas no app do Claude que mantêm os planos em dia sozinhas. O Letco abre o pedido no Claude, que cria cada uma; na primeira rodada, ele pede para você aprovar as permissões.',
          'Scheduled tasks in the Claude app that keep your plans up to date on their own. Letco opens the request in Claude, which creates each one; on the first run, it asks you to approve the permissions.',
        )}
      >
        {t('Rotinas', 'Routines')}
      </Titulo>
      <ul className="mb-4 divide-y divide-[var(--border)] rounded-[10px] border border-[var(--border)]">
        {ROTINAS.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-default items-start gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                className="check mt-0.5"
                checked={sel.has(r.id)}
                onChange={(e) => {
                  const n = new Set(sel)
                  if (e.target.checked) n.add(r.id)
                  else n.delete(r.id)
                  setSel(n)
                }}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-medium">
                  {r.titulo.replace('Letco: ', '')} <span className="font-normal text-[var(--text-3)]">· {r.quando}</span>
                </div>
                <div className="text-[12.5px] text-[var(--text-2)]">{r.descricao}</div>
                {nota[r.id] && <div className="mt-0.5 text-[12px] text-[var(--text-3)]">{nota[r.id]}</div>}
              </div>
            </label>
          </li>
        ))}
      </ul>
      <Button
        variant={aberto ? 'secondary' : 'primary'}
        disabled={!sel.size || !env?.hasClaudeApp}
        onClick={async () => {
          await instalarRotinas([...sel])
          setAberto(true)
        }}
      >
        {aberto
          ? t('Abrir o pedido de novo', 'Open the request again')
          : t(`Criar ${sel.size === 1 ? 'a rotina' : `as ${sel.size} rotinas`} no Claude`, `Create ${sel.size === 1 ? 'the routine' : `the ${sel.size} routines`} in Claude`)}
      </Button>
      <p className="mt-3 text-[12.5px] text-[var(--text-3)]">
        {!env?.hasClaudeApp
          ? t('As rotinas precisam do app do Claude. Instale e crie depois, na tela Rotinas.', 'Routines need the Claude app. Install it and create them later on the Routines screen.')
          : aberto
            ? t('Envie o pedido no Claude. Depois, a tela Rotinas mostra quais estão instaladas.', 'Send the request in Claude. Then the Routines screen shows which ones are installed.')
            : t('Dá para criar depois, na tela Rotinas.', 'You can create them later on the Routines screen.')}
      </p>
    </>
  )
}
