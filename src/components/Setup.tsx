import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Download, FileCode2, FolderOpen, FolderSearch, GitBranch, Hash, KeyRound, Languages, RefreshCw, Sparkles, SquareTerminal, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { commitOrWarn, useStore } from '../store'
import { api } from '../lib/api'
import { CONTEXT_LABEL } from '../lib/config'
import { Button, cn, IconButton } from './ui'
import { useOrderedProjects } from '../hooks'
import { canaisYaml, DISCORD_FILE, parseCanais, type DiscordCanal } from '../lib/discord'
import type { Idioma, Opener } from '../lib/types'
import { isEn, LANG_LABEL, t } from '../lib/i18n'

function Row({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] py-4 last:border-0">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] bg-[var(--bg-hover)] text-[var(--text-2)]">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        {desc && <div className="text-[12.5px] text-[var(--text-2)]">{desc}</div>}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  )
}

const openers = (): { id: Opener; label: string }[] => [
  { id: 'claude-app', label: t('App do Claude', 'Claude app') },
  { id: 'orca', label: 'Orca' },
  { id: 'terminal', label: 'Terminal' },
]

function OpenerPicker({ value, onChange, available }: { value: Opener; onChange: (v: Opener) => void; available: Record<Opener, boolean> }) {
  return (
    <div className="flex flex-none rounded-[8px] bg-[var(--bg-hover)] p-0.5">
      {openers().map((o) => (
        <button
          type="button"
          key={o.id}
          disabled={!available[o.id]}
          onClick={() => onChange(o.id)}
          className={cn(
            'h-7 rounded-[6px] px-2.5 text-[12.5px] disabled:opacity-40',
            value === o.id ? 'bg-[var(--bg)] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)]' : 'text-[var(--text-2)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const openerDesc = (): Record<Opener, string> => ({
  'claude-app': t(
    'Abre uma sessão nova no Claude Code deste app, na pasta do plano, com o prompt pronto para enviar. O Codex abre no Orca.',
    "Opens a new Claude Code session in this app, in the plan's folder, with the prompt ready to send. Codex opens in Orca.",
  ),
  orca: t(
    'Abre no Orca: no worktree do plano ou, sem worktree, na pasta dos planos (registrada como projeto no Orca).',
    "Opens in Orca: in the plan's worktree or, without one, in the plans folder (registered as a project in Orca).",
  ),
  terminal: t('Abre o agente no Terminal, no worktree do plano ou na pasta dele.', "Opens the agent in Terminal, in the plan's worktree or its folder."),
})

export function SettingsView() {
  const env = useStore((s) => s.env)
  const ws = useStore((s) => s.ws)
  const config = useStore((s) => s.config)
  const prefs = useStore((s) => s.prefs)
  const setPrefs = useStore((s) => s.setPrefs)
  const importHermes = useStore((s) => s.importHermes)
  const plans = useStore((s) => s.plans)
  const setOnboarding = useStore((s) => s.setOnboarding)
  const juntarPlanos = useStore((s) => s.juntarPlanos)
  const go = useStore((s) => s.go)
  const lang = useStore((s) => s.lang)
  const setLangUI = useStore((s) => s.setLangUI)
  const saveUsuario = useStore((s) => s.saveUsuario)
  const [skill, setSkill] = useState(!!env?.skillInstalled)
  const [skillOld, setSkillOld] = useState(!!env?.skillOutdated)
  const [cli, setCli] = useState(!!env?.cliInstalled)
  const trab = config.contextos.trabalho
  const dias = isEn() ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

  return (
    <div className="mx-auto w-full max-w-[680px] px-8 pb-24">
      <h1 className="pb-4 pt-2 text-[26px] font-semibold tracking-[-0.02em]">{t('Ajustes', 'Settings')}</h1>

      <div className="mb-8 rounded-[12px] border border-[var(--border)] px-4">
        <Row
          icon={<UserRound size={16} />}
          title={config.usuario?.nome ?? t('Sem nome', 'No name')}
          desc={
            config.usuario?.nome
              ? t('O nome que vai nos pedidos ao Claude. Refazer a configuração também deixa trocar o horário e criar projetos.', 'The name used in requests to Claude. Redoing setup also lets you change your hours and create projects.')
              : t('Falta dizer seu nome: sem ele, os pedidos ao Claude falam "o usuário".', 'Your name is missing: without it, requests to Claude say "the user".')
          }
        >
          <Button size="sm" variant={config.usuario?.nome ? 'secondary' : 'primary'} onClick={() => setOnboarding(true)}>
            {t('Refazer configuração', 'Redo setup')}
          </Button>
        </Row>
        <Row icon={<Languages size={16} />} title="Idioma · Language" desc={t('Telas, comando planos e respostas da IA. Os títulos dentro dos arquivos de plano continuam em português.', 'Screens, the planos command and AI replies. Section titles inside plan files stay in Portuguese.')}>
          <div className="flex items-center gap-1 rounded-[8px] bg-[var(--bg-hover)] p-0.5">
            {(Object.keys(LANG_LABEL) as Idioma[]).map((l) => (
              <button
                key={l}
                onClick={async () => {
                  setLangUI(l)
                  await saveUsuario({ ...(config.usuario ?? { nome: '' }), idioma: l })
                }}
                className={cn('h-6 rounded-[6px] px-2.5 text-[12px]', lang === l ? 'bg-[var(--bg)] font-medium text-[var(--text)] shadow-sm' : 'text-[var(--text-2)]')}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
        </Row>
        <Row icon={<FolderSearch size={16} />} title={t('Juntar planos que você já tem', 'Gather plans you already have')} desc={t('O Claude procura planos espalhados no Mac, mostra a lista e copia os que você escolher. Os originais ficam onde estão.', 'Claude looks for plans scattered around your Mac, lists them and copies the ones you pick. The originals stay where they are.')}>
          <Button size="sm" onClick={() => juntarPlanos()}>
            {t('Juntar no Claude', 'Gather with Claude')}
          </Button>
        </Row>
        <Row icon={<CalendarClock size={16} />} title={t('Rotinas do Letco', 'Letco routines')} desc={t('Investigador, lista do dia, resumo, Discord e divulgação, como tarefas agendadas do app do Claude.', 'Investigator, daily list, summary, Discord and promotion, as scheduled tasks in the Claude app.')}>
          <Button size="sm" onClick={() => go({ kind: 'routines' })}>
            {t('Ver rotinas', 'View routines')}
          </Button>
        </Row>
        <Row icon={<Download size={16} />} title={t('Skill no claude.ai', 'Skill on claude.ai')} desc={t('Salva a skill planejamento num .zip em Downloads para enviar em claude.ai → Ajustes → Capabilities → Skills.', 'Saves the planejamento skill as a .zip in Downloads to upload at claude.ai → Settings → Capabilities → Skills.')}>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const path = await api.exportSkillZip()
                toast.success(t('Skill salva', 'Skill saved'), { description: path })
              } catch (e) {
                toast.error(t('Não consegui salvar o .zip', "Couldn't save the .zip"), { description: String(e) })
              }
            }}
          >
            {t('Salvar .zip', 'Save .zip')}
          </Button>
        </Row>
      </div>

      <div className="rounded-[12px] border border-[var(--border)] px-4">
        <Row icon={<FolderOpen size={16} />} title={t('Pasta dos planos', 'Plans folder')} desc={<code>{env?.root}</code>}>
          <Button size="sm" onClick={() => api.openPath('', true)}>
            {t('Mostrar no Finder', 'Show in Finder')}
          </Button>
        </Row>
        <Row
          icon={<GitBranch size={16} />}
          title={t('Histórico no git', 'Git history')}
          desc={ws?.isGit ? t('Cada mudança vira um commit. Se houver um remoto configurado, o app envia sozinho.', 'Every change becomes a commit. If a remote is set up, the app pushes on its own.') : t('A pasta ainda não é um repositório git.', "The folder isn't a git repository yet.")}
        >
          <span className={cn('text-[12.5px] font-medium', ws?.isGit ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-3)]')}>
            {ws?.isGit ? t('Ativo', 'On') : t('Inativo', 'Off')}
          </span>
        </Row>
        <Row
          icon={<FileCode2 size={16} />}
          title={t('Projetos e contextos', 'Projects and contexts')}
          desc={`${CONTEXT_LABEL.trabalho}: ${(trab.dias ?? []).map((d) => dias[d]).join(', ')}, ${trab.inicio}–${trab.fim}. ${t('Ordem e horários em projetos.yaml.', 'Order and hours in projetos.yaml.')}`}
        >
          <Button size="sm" onClick={() => api.openPath('projetos.yaml')}>
            {t('Editar', 'Edit')}
          </Button>
        </Row>
      </div>

      <h2 className="mb-2 mt-8 px-1 text-[12.5px] font-semibold text-[var(--text-2)]">{t('Agentes', 'Agents')}</h2>
      <div className="rounded-[12px] border border-[var(--border)] px-4">
        <Row icon={<Sparkles size={16} />} title={t('Conversar abre em', 'Chat opens in')} desc={openerDesc()[prefs.opener]}>
          <OpenerPicker
            value={prefs.opener}
            onChange={(opener) => setPrefs({ opener })}
            available={{ 'claude-app': env?.hasClaudeApp ?? true, orca: env?.hasOrca ?? true, terminal: true }}
          />
        </Row>
        <Row
          icon={<FileCode2 size={16} />}
          title={t('Skill planejamento', 'planejamento skill')}
          desc={
            skillOld
              ? t('A skill instalada é de uma versão anterior do app. Atualize para o Claude e o Codex escreverem planos no formato atual.', 'The installed skill is from an earlier version of the app. Update it so Claude and Codex write plans in the current format.')
              : t('Instala o padrão de documentos no Claude (~/.claude/skills) e no AGENTS.md global do Codex, para todo plano novo nascer no formato certo.', "Installs the document format in Claude (~/.claude/skills) and in Codex's global AGENTS.md, so every new plan starts in the right format.")
          }
        >
          <Button
            size="sm"
            variant={skill && !skillOld ? 'secondary' : 'primary'}
            onClick={async () => {
              try {
                await api.installSkill()
                setSkill(true)
                setSkillOld(false)
                toast.success(t('Skill planejamento instalada', 'planejamento skill installed'), { description: t('Claude e Codex', 'Claude and Codex') })
              } catch (e) {
                toast.error(t('Não consegui instalar', "Couldn't install"), { description: String(e) })
              }
            }}
          >
            {skillOld ? (
              t('Atualizar', 'Update')
            ) : skill ? (
              <>
                <Check size={13} /> {t('Reinstalar', 'Reinstall')}
              </>
            ) : (
              t('Instalar', 'Install')
            )}
          </Button>
        </Row>
        <Row
          icon={<SquareTerminal size={16} />}
          title={t('Comando planos', 'planos command')}
          desc={
            <>
              <code>planos hoje</code>, <code>planos falar &lt;id&gt;</code>, <code>planos fase concluir &lt;id&gt; F3</code> {t('e o resto no terminal. Instala em ~/.local/bin.', 'and the rest in the terminal. Installs to ~/.local/bin.')}
            </>
          }
        >
          <Button
            size="sm"
            variant={cli ? 'secondary' : 'primary'}
            onClick={async () => {
              try {
                await api.installCli()
                setCli(true)
                toast.success(t('Comando planos instalado', 'planos command installed'), { description: t('Rode planos ajuda no terminal', 'Run planos ajuda in the terminal') })
              } catch (e) {
                toast.error(t('Não consegui instalar', "Couldn't install"), { description: String(e) })
              }
            }}
          >
            {cli ? (
              <>
                <Check size={13} /> {t('Reinstalar', 'Reinstall')}
              </>
            ) : (
              t('Instalar', 'Install')
            )}
          </Button>
        </Row>
      </div>

      <DiscordSettings />

      {env?.hasHermes && (
        <>
          <h2 className="mb-2 mt-8 px-1 text-[12.5px] font-semibold text-[var(--text-2)]">{t('Migração', 'Migration')}</h2>
          <div className="rounded-[12px] border border-[var(--border)] px-4">
            <Row icon={<Download size={16} />} title={t('Importar do Hermes', 'Import from Hermes')} desc={t('Traz os planos de ~/.hermes/planos que ainda não estão aqui. Não altera a origem.', "Brings in plans from ~/.hermes/planos that aren't here yet. Doesn't change the source.")}>
              <Button size="sm" onClick={() => importHermes()}>
                {t('Importar', 'Import')}
              </Button>
            </Row>
          </div>
        </>
      )}

      <p className="mt-8 px-1 text-[12px] text-[var(--text-3)]">
        {t(
          `Letco 0.1 · ${plans.length} planos · ⌘K busca · ⌘N novo plano · ⌘E edita o Markdown`,
          `Letco 0.1 · ${plans.length} ${plans.length === 1 ? 'plan' : 'plans'} · ⌘K search · ⌘N new plan · ⌘E edit Markdown`,
        )}
      </p>
    </div>
  )
}

function DiscordSettings() {
  const ws = useStore((s) => s.ws)
  const projects = useOrderedProjects()
  const readDiscord = useStore((s) => s.readDiscord)
  const load = useStore((s) => s.load)
  const canais = useMemo(() => parseCanais(ws?.discord), [ws?.discord])
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [token, setToken] = useState('')
  const [novo, setNovo] = useState({ id: '', nome: '', projeto: '' })
  const projetoNovo = novo.projeto || projects[0]?.slug || ''

  useEffect(() => {
    api.discordTokenStatus().then(setHasToken, () => setHasToken(false))
  }, [])

  async function saveCanais(next: DiscordCanal[]) {
    try {
      await api.writeText(DISCORD_FILE, canaisYaml(next))
      await commitOrWarn('discord: canais')
      await load()
    } catch (e) {
      toast.error(t('Não consegui salvar os canais', "Couldn't save the channels"), { description: String(e) })
    }
  }

  const input = 'h-8 rounded-[8px] border border-[var(--border)] bg-transparent px-2.5 text-[13px] outline-none placeholder:text-[var(--text-3)] focus:border-accent/60'
  return (
    <>
      <h2 className="mb-2 mt-8 px-1 text-[12.5px] font-semibold text-[var(--text-2)]">Discord</h2>
      <div className="rounded-[12px] border border-[var(--border)] px-4">
        <Row
          icon={<KeyRound size={16} />}
          title={t('Token da sua conta', 'Your account token')}
          desc={
            hasToken
              ? t('Guardado no Keychain do Mac. O app não mostra nem copia o valor.', "Stored in the Mac's Keychain. The app never shows or copies the value.")
              : t(
                  'Fica só no Keychain do Mac. Usar o token da conta vai contra os termos do Discord: a leitura é só uma vez por dia, sem escrever nada.',
                  "Kept only in the Mac's Keychain. Using your account token goes against Discord's terms: it reads once a day and never writes anything.",
                )
          }
        >
          {hasToken ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                api.discordTokenClear().then(
                  () => setHasToken(false),
                  (e) => toast.error(String(e)),
                )
              }
            >
              {t('Remover', 'Remove')}
            </Button>
          ) : (
            <div className="flex gap-1.5">
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t('Cole o token', 'Paste the token')} className={cn(input, 'w-[170px]')} />
              <Button
                size="sm"
                variant="primary"
                disabled={!token.trim()}
                onClick={() =>
                  api.discordTokenSet(token.trim()).then(
                    () => {
                      setToken('')
                      setHasToken(true)
                      toast.success(t('Token guardado no Keychain', 'Token saved to Keychain'))
                    },
                    (e) => toast.error(t('Não guardei o token', "Couldn't save the token"), { description: String(e) }),
                  )
                }
              >
                {t('Guardar', 'Save')}
              </Button>
            </div>
          )}
        </Row>

        <div className="border-b border-[var(--border)] py-4 last:border-0">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] bg-[var(--bg-hover)] text-[var(--text-2)]">
              <Hash size={16} />
            </div>
            <div className="flex-1">
              <div className="text-[13.5px] font-medium">{t('Canais acompanhados', 'Followed channels')}</div>
              <div className="text-[12.5px] text-[var(--text-2)]">
                {t(
                  'No Discord: Ajustes → Avançado → Modo desenvolvedor; depois clique com o botão direito no canal → Copiar ID do canal.',
                  'In Discord: Settings → Advanced → Developer Mode; then right-click the channel → Copy Channel ID.',
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1 pl-12">
            {canais.map((c) => (
              <div key={c.id} className="flex h-8 items-center gap-2 rounded-[8px] px-2 text-[13px] hover:bg-[var(--bg-hover)]">
                <span className="font-medium">#{c.nome}</span>
                <span className="font-mono text-[11.5px] text-[var(--text-3)]">{c.id}</span>
                <span className="flex-1 text-[12px] text-[var(--text-3)]">→ {projects.find((p) => p.slug === c.projeto)?.nome ?? c.projeto}</span>
                <IconButton label={t('Tirar o canal', 'Remove channel')} onClick={() => saveCanais(canais.filter((x) => x.id !== c.id))}>
                  <X size={13} />
                </IconButton>
              </div>
            ))}
            <div className="flex gap-1.5">
              <input value={novo.id} onChange={(e) => setNovo({ ...novo, id: e.target.value.trim() })} placeholder={t('ID do canal', 'Channel ID')} className={cn(input, 'w-[170px] font-mono text-[12px]')} />
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder={t('nome (ex.: dev)', 'name (e.g. dev)')} className={cn(input, 'min-w-0 flex-1')} />
              <select value={projetoNovo} onChange={(e) => setNovo({ ...novo, projeto: e.target.value })} className={cn(input, 'px-1.5')}>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!/^\d{15,25}$/.test(novo.id)}
                onClick={() => {
                  saveCanais([...canais.filter((c) => c.id !== novo.id), { ...novo, projeto: projetoNovo, nome: novo.nome.replace(/^#/, '').trim() || novo.id }])
                  setNovo({ id: '', nome: '', projeto: projetoNovo })
                }}
              >
                {t('Adicionar', 'Add')}
              </Button>
            </div>
          </div>
        </div>

        <Row icon={<RefreshCw size={16} />} title={t('Ler agora', 'Read now')} desc={t('Abre o Claude para ler as mensagens novas e pôr tarefas e cobranças nos planos. A rotina diária faz o mesmo nos dias úteis às 7h50.', 'Opens Claude to read new messages and add tasks and follow-ups to the plans. The daily routine does the same on weekdays at 7:50.')}>
          <Button size="sm" disabled={!hasToken || !canais.length} onClick={() => readDiscord()}>
            {t('Ler agora', 'Read now')}
          </Button>
        </Row>
      </div>
    </>
  )
}
