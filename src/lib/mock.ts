// Backend falso para abrir a interface no navegador (desenvolvimento e prévias).
// No app instalado, todas as chamadas vão para o Rust (src-tauri/src/lib.rs).
import { DEFAULT_CONFIG, configToYaml } from './config'

/** projetos inventados da prévia */
const NOMES: Record<string, string> = { acme: 'Acme', orbit: 'Orbit', atlas: 'Atlas', delta: 'Delta', kite: 'Kite', carely: 'Carely', scanly: 'Scanly', learnly: 'Learnly', ion: 'Ion', lume: 'Lume', friends: 'Friends' }
import { todayISO } from './dates'
import { addDays, format } from 'date-fns'

const d = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd')

function plan(o: {
  proj: string
  slug: string
  titulo: string
  status: string
  prio: string
  prazo?: string
  fases: [string, boolean][]
  decisoes?: string[]
  cobrancas?: string[]
  atualizado?: string
  worktree?: string
  origem?: string
  objetivo: string
  paraVoce?: string[]
}) {
  const fm = [
    '---',
    `id: ${o.proj}-${o.slug}`,
    `projeto: ${o.proj}`,
    `titulo: ${o.titulo}`,
    `status: ${o.status}`,
    `prioridade: ${o.prio}`,
    o.prazo ? `prazo: ${o.prazo}` : '',
    'responsavel: alex',
    'pessoas: [sam, mike]',
    'agente: claude',
    o.worktree ? `worktree: ${o.worktree}` : '',
    o.origem ? `origem: ${o.origem}` : '',
    `atualizado: ${o.atualizado ?? todayISO()}`,
    '---',
  ].filter(Boolean)
  const body = [
    '',
    `# ${o.titulo}`,
    '',
    ...(o.paraVoce ? ['## Para você', ...o.paraVoce, ''] : []),
    '## Objetivo',
    o.objetivo,
    '',
    '## Contexto',
    'The portal currently shows gateway subscriptions and daily usage. The home page and the ticket queue are still missing.',
    '',
    '## Fases',
    ...o.fases.map(([n, done], i) => `- [${done ? 'x' : ' '}] F${i + 1} ${n}${done ? ' — ' + d(-3 + i) : ''}`),
    '',
    '## Decisões em aberto',
    ...(o.decisoes ?? []).map((x) => `- [ ] ${x}`),
    '',
    '## Pessoas e cobranças',
    ...(o.cobrancas ?? []).map((x) => `- [ ] ${x}`),
    '',
    '## Critério de pronto',
    'Home and tickets live in production, reviewed with Sam.',
    '',
    '## Log',
    `- ${d(-6)}: plan created`,
    `- ${d(-2)}: F2 concluída`,
    '',
  ]
  return [...fm, ...body].join('\n')
}

const files = new Map<string, string>()
/** ?novo na URL da prévia: pasta ainda não criada, para testar o onboarding */
let initialized = !new URLSearchParams(location.search).has('novo')

/** projetos de exemplo da prévia (a pasta de verdade começa vazia) */
const EXEMPLO = {
  ...DEFAULT_CONFIG,
  // ?lang=en na URL da prévia abre o app em inglês (screenshots do README)
  usuario: { nome: 'Alex', apelidos: ['Alexander'], ...(new URLSearchParams(location.search).get('lang') === 'en' ? { idioma: 'en' as const } : {}) },
  projetos: Object.fromEntries(Object.entries(NOMES).map(([k, nome]) => [k, { nome }])),
  contextos: {
    trabalho: { ...DEFAULT_CONFIG.contextos.trabalho, ordem: Object.keys(NOMES) },
    'fora-do-horario': { ...DEFAULT_CONFIG.contextos['fora-do-horario'], ordem: Object.keys(NOMES).reverse() },
  },
}

function seed() {
  files.set('projetos.yaml', configToYaml(EXEMPLO))
  const plans: Parameters<typeof plan>[0][] = [
    { proj: 'acme', slug: 'developer-portal', titulo: 'Developer Portal redesign', status: 'andamento', prio: 'alta', prazo: d(5), worktree: '~/orca/workspaces/acme-website/pollock', origem: 'https://claude.ai/code/artifact/exemplo', objetivo: 'A clear developer portal with a home page and tickets.', fases: [['Survey current screens', true], ['Proposal in Claude Design', true], ['Build home and tickets', false], ['Review with Sam', false]], decisoes: ['Which navigation to use on mobile'], cobrancas: ['Sam: confirm whether the testnet gateway accepts brief v2 (desde ' + d(-4) + ')'], paraVoce: [
      '**Do que se trata:** A new portal for teams integrating with Acme: a clear home page and a ticket queue, replacing today\'s scattered screens.',
      '**Como está:** The AI already did the survey and the visual proposal. Home and tickets are in PR #807, which picked up a conflict after #806 landed yesterday.',
      '**Precisa de você:**',
      '- [ ] Aprovar: merge PR #806 (CI green, no conflicts, only waiting on you)',
      '- [ ] Continuar: open Chat and ask the AI to resolve the conflict between #807 and #806',
      '- [ ] Mensagem: ask Sam for a review "Sam, #807 (portal home and tickets) is ready for review, can you take a look today?"',
      '- [ ] Testar no app: open https://staging.portal.exemplo.dev on your phone and check that the bottom navigation works',
      '**Conferido:** ' + d(0) + ' · PR #806 merged, PR #807 open with a conflict, CI green',
    ] },
    { proj: 'acme', slug: 'wallet-backend', titulo: 'Wallet backend brief', status: 'bloqueado', prio: 'media', objetivo: 'Wallet backend brief for the team.', fases: [['Draft the brief', true], ['Technical review', false]], decisoes: ['Approve the backend P0 scope'], cobrancas: ['Ken: balance endpoints (desde ' + d(-9) + ')'], atualizado: d(-9) },
    { proj: 'orbit', slug: 'orbitdex-prs', titulo: 'OrbitDex: Nico\'s PR queue', status: 'proximo', prio: 'alta', prazo: d(0), objetivo: 'Clear the queue of pending PRs.', fases: [['Review open PRs', false], ['Merge the approved ones', false]] },
    { proj: 'atlas', slug: 'site-tema', titulo: 'Site visual theme', status: 'revisao', prio: 'media', objetivo: 'Pick and apply the site theme.', fases: [['Three proposals', true], ['Apply the chosen one', true]], decisoes: ['Which visual theme to use on the site'] },
    { proj: 'ion', slug: 'navegacao-classica', titulo: 'Classic navigation', status: 'andamento', prio: 'baixa', objetivo: 'Bring back the app\'s classic navigation.', fases: [['Audit', true], ['Prototype', false], ['Implementation', false]], cobrancas: ['Leo: answers about classic navigation (desde ' + d(-13) + ')'], atualizado: d(-12) },
    { proj: 'learnly', slug: 'epic-angels', titulo: 'North Angels: application form', status: 'proximo', prio: 'media', prazo: d(-1), objetivo: 'Submit the North Angels form.', fases: [['Fill it in', true], ['Submit', false]], cobrancas: ['Mia: was the form submitted?'] },
    { proj: 'carely', slug: 'guia-usuario', titulo: 'User guide', status: 'ideia', prio: 'baixa', objetivo: 'A short guide for new users.', fases: [['Outline', false]] },
    { proj: 'lume', slug: 'notificacoes', titulo: 'Chat notifications', status: 'feito', prio: 'media', objetivo: 'Push notifications for new messages.', fases: [['Backend', true], ['App', true]] },
  ]
  for (const p of plans) {
    files.set(`projetos/${p.proj}/planos/${d(-6)}-${p.slug}/plano.md`, plan(p))
  }
  files.set(`projetos/acme/planos/${d(-6)}-developer-portal/design.md`, '# Developer Portal — design\n\nCopy of the design from Claude.\n')
  files.set(
    'hoje.md',
    `# ${format(new Date(), 'EEEE')} · work\n\n## Do today\n- [ ] Acme · Developer Portal F3: build home and tickets (2/4)\n- [ ] Orbit · OrbitDex: review Nico\'s PR queue\n\n## Messages to send\n- Sam: confirm whether the testnet gateway accepts brief v2\n`,
  )
}
/** com ?novo, a prévia começa sem nada: só o que o onboarding criar */
const exemplo = initialized
if (exemplo) seed()

function emit() {
  window.dispatchEvent(new Event('planos-mock-changed'))
}

export async function mockApi(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 10))
  switch (cmd) {
    case 'environment':
      return { root: '~/planos', home: '~', hasOrca: true, hasClaudeApp: true, hasClaude: true, hasCodex: true, hasGit: true, hasNode: true, hasGh: true, skillInstalled: false, cliInstalled: false }
    case 'load_workspace': {
      const plans = [...files.keys()]
        .filter((k) => /^projetos\/[^/]+\/planos\/[^/]+\/plano\.md$/.test(k))
        .map((k) => {
          const [, project, , folder] = k.split('/')
          const dir = k.replace(/plano\.md$/, '')
          const extras = [...files.keys()].filter((x) => x.startsWith(dir) && x !== k).map((x) => x.slice(dir.length))
          return { path: k, project, folder, content: files.get(k)!, mtime: Date.now(), extras }
        })
      const slugs = [...new Set([...files.keys()].filter((k) => k.startsWith('projetos/')).map((k) => k.split('/')[1]))]
      return {
        root: '~/planos',
        exists: initialized,
        isGit: true,
        projetosYaml: initialized ? (files.get('projetos.yaml') ?? null) : null,
        hoje: files.get('hoje.md') ?? null,
        semana: null,
        discord: !exemplo ? null : "canais:\n  - id: '100000000001111111'\n    nome: dev_channel\n    projeto: acme\n  - id: '100000000002222222'\n    nome: Nico_DMs\n    projeto: orbit\n",
        tarefas: !exemplo ? null : [
          `${new Date().toISOString().slice(0, 10)}.md`,
          files.get(`tarefas/${new Date().toISOString().slice(0, 10)}.md`) ?? [
            '# Tarefas do dia',
            '',
            '- [ ] Aprovar: merge PR #806 (CI green, no conflicts, only waiting on you) <!-- plano: acme-developer-portal -->',
            '- [x] Cobrar: Ken, the product decisions D1–D7 for the widgets <!-- plano: acme-developer-portal -->',
            '- [ ] Testar no app: open the Learnly app and copy a module with video, PDF and quiz <!-- plano: learnly-copiar-modulo -->',
            '- [ ] Revisar: the preview of Nico\'s PR queue and say whether it can go ahead to merge <!-- plano: orbit-orbitdex-prs -->',
            '  - Conferido 2026-10-29 · bloqueado por acme-wallet-backend: the wallet backend still lacks the balance endpoints (plan acme-wallet-backend)',
          ].join('\n'),
        ],
        projects: slugs.map((slug) => ({ slug, content: files.get(`projetos/${slug}/projeto.md`) ?? null })),
        plans,
        entrada: [],
      }
    }
    case 'read_text':
      return files.get(args.rel as string) ?? ''
    case 'write_text':
      files.set(args.rel as string, args.content as string)
      emit()
      return
    case 'move_file': {
      const from = args.from as string
      const to = args.to as string
      for (const [k, c] of [...files]) {
        if (k === from || k.startsWith(from + '/')) {
          files.delete(k)
          files.set(to + k.slice(from.length), c)
        }
      }
      emit()
      return
    }
    case 'init_workspace':
      if (!initialized) {
        files.clear()
        files.set('projetos.yaml', String(args.projetosYaml))
      }
      initialized = true
      return
    case 'git_commit':
      return true
    case 'launch_agent':
      return args.opener === 'claude-app' && args.agent === 'codex' ? 'orca' : (args.opener ?? 'terminal')
    case 'install_skill':
      return '~/.claude/skills/planejamento'
    case 'load_posts':
      return [
        {
          dir: 'divulgacao/acme-carteira/2026-10-17-5f55fcc',
          campaign: 'acme-carteira',
          folder: '2026-10-17-5f55fcc',
          image: 'divulgacao/acme-carteira/2026-10-17-5f55fcc/imagem.png',
          legenda: files.get('divulgacao/acme-carteira/2026-10-17-5f55fcc/legenda.md') ?? '## EN\n\nA fresh connection experience for Acme Wallet 💜\n\n• One wallet list replaces the multi-step wizard.\n\n## PT\n\nUm novo jeito de conectar na Acme Wallet 💜\n\n• Uma lista única substitui o assistente de várias etapas.',
          post: files.get('divulgacao/acme-carteira/2026-10-17-5f55fcc/post.md') ?? null,
          mtime: Date.now(),
        },
      ]
    case 'load_documents':
      return [...files.keys()]
        .filter((k) => k.startsWith('projetos/') || k.startsWith('entrada/organizar/'))
        .map((k, i) => ({ path: k, size: files.get(k)!.length, mtime: Date.now() - i * 3600e3 }))
    case 'import_dropped': {
      const rels = (args.paths as string[]).map((p) => `entrada/organizar/${p.split('/').pop()}`)
      for (const r of rels) files.set(r, '(arquivo solto na prévia)')
      window.dispatchEvent(new Event('planos-mock-changed'))
      return rels
    }
    case 'load_resumos': {
      const dia = (n: number) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10)
      const r = (n: number, m: number[], frase: string, corpo: string) => [
        `${dia(n)}.md`,
        `---\ndata: ${dia(n)}\ntarefas_feitas: ${m[0]}\ntarefas_total: ${m[1]}\nfases: ${m[2]}\ndecisoes: ${m[3]}\nprs_mergeados: ${m[4]}\nprs_abertos: ${m[5]}\nrevisoes: ${m[6]}\ncommits: ${m[7]}\n---\n# Daily summary\n\n**Em uma frase:** ${frase}\n\n${corpo}`,
      ]
      return [
        r(0, [6, 12, 3, 3, 3, 4, 0, 8], 'Ion closed wave 2, #806 landed on master and the promo posts now run on their own.', '## Productivity\nAbove-average day: 6 of 12 tasks done and 3 PRs merged, versus 3 and 1 on previous days. Time went to Acme and Ion; the NFT DEX got stuck on a wallet bug.\n\n## What got done\n### Acme\n- #806 (ledger token send) merged after testing on testnet (plan acme-developer-portal)\n- Marketplace draft PRs #815 and #816 opened\n### Ion\n- Wave 2 closed: alexdev/ion#15 and alexdev/ion-web#2 merged\n\n## Decisions\n- OrbitDex audit phase 0 comes before the feature PRs\n\n## Blocked or waiting on someone\n- NFT DEX (#277): the Acme wallet drops the dApp\'s second request\n\n## For tomorrow\n- Open the wallet issue in acme-connect\n- Follow up with Ana on the SMS test'),
        r(1, [3, 9, 1, 2, 1, 2, 1, 5], 'A day of conversations: Delta contracts and the #282 review.', '## Productivity\nMore alignment than delivery today.\n\n## What got done\n### Orbit\n- Reviewed acme-labs/orbitdex#282'),
        r(2, [2, 7, 0, 1, 1, 1, 0, 3], 'Quiet day: only tweaks to the Learnly landing page.', '## What got done\n### Learnly\n- New landing page merged'),
      ]
    }
    case 'load_discord': {
      const day = new Date().toISOString().slice(0, 10)
      return {
        tarefas: [
          [
            `${day}.md`,
            [
              '# Tarefas do dia',
              '',
              '- [ ] Cobrar: Ken, about the Marketplace blockers (since Oct 27, no reply) — "Hey Ken, any update on the marketplace blockers?" https://discord.com/channels/100000000006666666/100000000001111111/100000000003333333 <!-- plano: acme-developer-portal -->',
              '  - Conferido 2026-10-28 · ainda pendente: no reply in the channel since Oct 27',
              '- [ ] Revisar: the swapr update Nico sent (more tokens, new relay address) https://discord.com/channels/@me/100000000002222222/100000000005555555',
              '  - Conferido 2026-10-28 · em parte: the update is acme-labs/orbitdex#282, open with a review requested',
              '- [x] Mensagem: reply to Rui about the key export — "It happens when 2FA is off; it was requested in an earlier audit." https://discord.com/channels/100000000006666666/100000000001111111/100000000004444444',
            ].join('\n'),
          ],
        ],
        conversas: [
          ['acme', `${day}.md`, '# Conversas\n\n## 11:42 · Discord #dev_channel\n- Alex asked Ken about the Marketplace blockers; no reply yet.\n- Rui reported that exporting the key asks for biometrics and a password; not a bug.'],
        ],
        estado: [['100000000001111111', JSON.stringify({ last: '1', lido: new Date(Date.now() - 2 * 3600e3).toISOString() })]],
      }
    }
    case 'read_image':
      return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#1b0b24"/><text x="80" y="480" font-size="120" font-family="sans-serif" font-weight="700" fill="#f4eff8">Connect in one tap</text></svg>')
    case 'load_routines': {
      const t = Date.now()
      return {
        claudeTasks: [
          JSON.stringify({
            scheduledTasks: [
              { id: 'planos-investigador', displayName: 'Planos: investigator', cronExpression: '5 8,14 * * 1-5', enabled: true, lastRunAt: new Date(Date.now() - 3 * 3600e3).toISOString(), filePath: '~/.claude/scheduled-tasks/planos-investigador/SKILL.md' },
              { id: 'planos-lista-do-dia', displayName: 'Planos: daily list', cronExpression: '40 8,12,16 * * 1-5', enabled: true, filePath: '~/.claude/scheduled-tasks/planos-lista-do-dia/SKILL.md' },
              { id: 'orbitdex-nico-pr-review', displayName: 'Review Nico\'s PRs (orbitdex)', cronExpression: '0 9 * * *', enabled: true, lastRunAt: new Date(t - 3 * 3600e3).toISOString() },
              { id: 'dex-modularization-nightly', cronExpression: '0 2 * * *', enabled: false },
              { id: 'orbitdex-pr258-265-after-publish', displayName: 'OrbitDex #258/#265: verify and ship after the acme-connect publish', cronExpression: '0 */6 * * *', enabled: true },
            ],
            recordedSkips: {
              'orbitdex-pr258-265-after-publish': Array.from({ length: 12 }, (_, i) => ({ at: new Date(new Date().setHours(0, 0, 0, 0)).getTime() + i * 3600e3, reason: 'per_task_limit' })),
            },
          }),
        ],
        claudeRuns: [
          { task: 'planos-investigador', session: 'local_mock-1', started: new Date(new Date().setHours(8, 10)).getTime(), lastActivity: t - 3 * 3600e3, turns: 3, status: 'blocked', detail: 'ion repos ahead of GitHub; PRs #14 and #1 need merge' },
          { task: 'planos-lista-do-dia', session: 'local_mock-2', started: new Date(new Date().setHours(8, 52)).getTime(), lastActivity: t - 3 * 3600e3, turns: 3, status: 'completed', detail: 'Wednesday list ready: 7 to do, 2 to follow up, 2 to decide' },
          { task: 'orbitdex-pr258-265-after-publish', session: 'local_mock-4', started: t - 21 * 3600e3, lastActivity: t - 21 * 3600e3, turns: 0, status: null, detail: null },
          { task: 'orbitdex-nico-pr-review', session: 'local_mock-3', started: new Date(new Date().setHours(9, 1)).getTime(), lastActivity: t - 3 * 3600e3, turns: 3, status: 'completed', detail: 'reviewed #282 and #283' },
        ],
        claudeSkills: [
          ['planos-lista-do-dia', '---\ndescription: Reads ~/planos/hoje.md on weekdays and delivers the summary.\n---\n'],
          ['orbitdex-nico-pr-review', '---\ndescription: Reviews each new NicoNFT PR locally and writes a report.\n---\n'],
          ['dex-modularization-nightly', '---\ndescription: Nightly scoped dev-issue-runner, draft PRs only.\n---\n'],
        ],
        hermesJobs: null,
        hermesHeartbeat: null,
        hermesOutputs: [],
        planosLaunchd: [
          ['dev.leco.planos.hoje', false],
          ['dev.leco.planos.semana', false],
        ],
        openbotInstalled: false,
        openbotFiles: [],
      }
    }
    case 'hermes_cron':
    case 'planos_schedule':
    case 'discord_token_status':
      return false
    case 'discord_token_set':
    case 'discord_token_clear':
    case 'open_claude_session':
    case 'copy_image':
      return 'ok'
    case 'install_cli':
      return '~/.local/bin/planos'
    case 'gh_user':
      return 'example'
    case 'export_skill_zip':
      return '~/Downloads/planejamento-skill.zip'
    case 'local_repos':
      return [{ path: '/Users/alex/Developer/acme-website', repo: 'acme-labs/acme-website', branch: 'main', worktree: false }]
    case 'git_remotes':
      return ((args?.paths as string[]) ?? []).map((p) => [p, p.includes('pollock') ? 'acme-labs/acme-website' : null])
    case 'open_in_chrome':
      return window.open(String(args?.url), '_blank'), undefined
    case 'path_exists':
      return true
    default:
      return
  }
}
