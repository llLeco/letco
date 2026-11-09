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
    'pessoas: [walt, mike]',
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
    'O portal hoje mostra as assinaturas do gateway e o uso do dia. Falta a home e a fila de tickets.',
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
    'Home e tickets no ar em produção, revisados com o Sam.',
    '',
    '## Log',
    `- ${d(-6)}: plano criado`,
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
  usuario: { nome: 'Alex', apelidos: ['Alexander'] },
  projetos: Object.fromEntries(Object.entries(NOMES).map(([k, nome]) => [k, { nome }])),
  contextos: {
    trabalho: { ...DEFAULT_CONFIG.contextos.trabalho, ordem: Object.keys(NOMES) },
    'fora-do-horario': { ...DEFAULT_CONFIG.contextos['fora-do-horario'], ordem: Object.keys(NOMES).reverse() },
  },
}

function seed() {
  files.set('projetos.yaml', configToYaml(EXEMPLO))
  const plans: Parameters<typeof plan>[0][] = [
    { proj: 'acme', slug: 'developer-portal', titulo: 'Developer Portal redesign', status: 'andamento', prio: 'alta', prazo: d(5), worktree: '~/orca/workspaces/acme-website/pollock', origem: 'https://claude.ai/code/artifact/exemplo', objetivo: 'Portal de desenvolvedor claro, com home e tickets.', fases: [['Levantar telas atuais', true], ['Proposta no Claude Design', true], ['Implementar home e tickets', false], ['Revisão com o Sam', false]], decisoes: ['Qual navegação usar no celular'], cobrancas: ['Sam: confirmar se o gateway testnet aceita o brief v2 (desde ' + d(-4) + ')'], paraVoce: [
      '**Do que se trata:** Um portal novo para quem integra com a Acme: uma página inicial clara e uma fila de chamados, no lugar das telas soltas de hoje.',
      '**Como está:** A IA já fez o levantamento e a proposta visual. A home e os chamados estão no PR #807, que ficou com conflito depois que o #806 entrou ontem.',
      '**Precisa de você:**',
      '- [ ] Aprovar: fazer o merge do PR #806 (CI verde, sem conflito, esperando só você)',
      '- [ ] Continuar: abrir o Conversar e pedir para a IA resolver o conflito do #807 com o #806',
      '- [ ] Mensagem: pedir review ao Sam "Sam, o #807 (home e chamados do portal) está pronto para review, consegue olhar hoje?"',
      '- [ ] Testar no app: abrir https://staging.portal.exemplo.dev no celular e ver se a navegação de baixo funciona',
      '**Conferido:** ' + d(0) + ' · PR #806 mergeado, PR #807 aberto com conflito, CI verde',
    ] },
    { proj: 'acme', slug: 'wallet-backend', titulo: 'Wallet backend brief', status: 'bloqueado', prio: 'media', objetivo: 'Brief do backend da wallet para o time.', fases: [['Rascunho do brief', true], ['Revisão técnica', false]], decisoes: ['Aprovar escopo P0 do backend'], cobrancas: ['Ken: endpoints de saldo (desde ' + d(-9) + ')'], atualizado: d(-9) },
    { proj: 'orbit', slug: 'orbitdex-prs', titulo: 'OrbitDex: fila de PRs do Nico', status: 'proximo', prio: 'alta', prazo: d(0), objetivo: 'Zerar a fila de PRs pendentes.', fases: [['Revisar PRs abertos', false], ['Mergear os aprovados', false]] },
    { proj: 'atlas', slug: 'site-tema', titulo: 'Tema visual do site', status: 'revisao', prio: 'media', objetivo: 'Escolher e aplicar o tema do site.', fases: [['Três propostas', true], ['Aplicar o escolhido', true]], decisoes: ['Qual tema visual seguir no site'] },
    { proj: 'ion', slug: 'navegacao-classica', titulo: 'Navegação clássica', status: 'andamento', prio: 'baixa', objetivo: 'Voltar a navegação clássica do app.', fases: [['Auditoria', true], ['Protótipo', false], ['Implementação', false]], cobrancas: ['Luiz: respostas sobre navegação clássica (desde ' + d(-13) + ')'], atualizado: d(-12) },
    { proj: 'learnly', slug: 'epic-angels', titulo: 'North Angels: formulário', status: 'proximo', prio: 'media', prazo: d(-1), objetivo: 'Enviar o formulário da North Angels.', fases: [['Preencher', true], ['Enviar', false]], cobrancas: ['Gina: o formulário foi enviado?'] },
    { proj: 'carely', slug: 'guia-usuario', titulo: 'Guia do usuário', status: 'ideia', prio: 'baixa', objetivo: 'Guia curto para novos usuários.', fases: [['Roteiro', false]] },
    { proj: 'lume', slug: 'notificacoes', titulo: 'Notificações do chat', status: 'feito', prio: 'media', objetivo: 'Push nas mensagens novas.', fases: [['Backend', true], ['App', true]] },
  ]
  for (const p of plans) {
    files.set(`projetos/${p.proj}/planos/${d(-6)}-${p.slug}/plano.md`, plan(p))
  }
  files.set(`projetos/acme/planos/${d(-6)}-developer-portal/design.md`, '# Developer Portal — design\n\nCópia do design do Claude.\n')
  files.set(
    'hoje.md',
    `# ${format(new Date(), 'EEEE')} · trabalho\n\n## Fazer hoje\n- [ ] Acme · Developer Portal F3: implementar home e tickets (2/4)\n- [ ] Orbit · OrbitDex: revisar fila de PRs do Nico\n\n## Mensagens para mandar\n- Sam: confirmar se o gateway testnet aceita o brief v2\n`,
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
      return { root: '~/planos', home: '~', hasOrca: true, hasClaudeApp: true, hasClaude: true, hasCodex: true, hasHermes: false, hasGit: true, hasNode: true, hasGh: true, skillInstalled: false, cliInstalled: false }
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
          [
            '# Tarefas do dia',
            '',
            '- [ ] Aprovar: fazer o merge do PR #806 (CI verde, sem conflito, esperando só você) <!-- plano: acme-developer-portal -->',
            '- [x] Cobrar: Ken, as decisões de produto D1–D7 para os widgets <!-- plano: acme-developer-portal -->',
            '- [ ] Testar no app: abrir o app do Learnly e copiar um módulo com vídeo, PDF e quiz <!-- plano: learnly-copiar-modulo -->',
            '- [ ] Revisar: o preview da fila de PRs do Nico e dizer se pode seguir para merge <!-- plano: orbit-orbitdex-prs -->',
            '  - Conferido 2026-10-29 · bloqueado por acme-wallet-backend: o backend da carteira ainda não tem os endpoints de saldo (plano acme-wallet-backend)',
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
    case 'read_hermes':
      return { planosJson: null, copies: [], analyses: [] }
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
    case 'load_resumos': {
      const dia = (n: number) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10)
      const r = (n: number, m: number[], frase: string, corpo: string) => [
        `${dia(n)}.md`,
        `---\ndata: ${dia(n)}\ntarefas_feitas: ${m[0]}\ntarefas_total: ${m[1]}\nfases: ${m[2]}\ndecisoes: ${m[3]}\nprs_mergeados: ${m[4]}\nprs_abertos: ${m[5]}\nrevisoes: ${m[6]}\ncommits: ${m[7]}\n---\n# Resumo do dia\n\n**Em uma frase:** ${frase}\n\n${corpo}`,
      ]
      return [
        r(0, [6, 12, 3, 3, 3, 4, 0, 8], 'Ion fechou a onda 2, o #806 entrou na master e a divulgação passou a rodar sozinha.', '## Produtividade\nDia acima da média: 6 de 12 tarefas e 3 PRs mergeados, contra 3 e 1 nos dias anteriores. O tempo foi para Acme e Ion; o NFT DEX travou num bug da carteira.\n\n## O que foi feito\n### Acme\n- #806 (envio de token ledger) mergeado depois do teste na testnet (plano acme-developer-portal)\n- PRs draft #815 e #816 do Marketplace abertos\n### Ion\n- Onda 2 fechada: alexdev/ion#15 e alexdev/ion-web#2 mergeados\n\n## Decisões\n- Fase 0 da auditoria do OrbitDex antes dos PRs de feature\n\n## Travado ou esperando alguém\n- NFT DEX (#277): a carteira Acme perde o 2º pedido do dApp\n\n## Para amanhã\n- Abrir a issue da carteira no acme-connect\n- Cobrar o Ana sobre o teste do WhatsApp'),
        r(1, [3, 9, 1, 2, 1, 2, 1, 5], 'Dia de conversas: contratos da Delta e revisão do #282.', '## Produtividade\nDia mais de alinhamento do que de entrega.\n\n## O que foi feito\n### Orbit\n- Revisado o acme-labs/orbitdex#282'),
        r(2, [2, 7, 0, 1, 1, 1, 0, 3], 'Pouco movimento: só ajustes na landing do Learnly.', '## O que foi feito\n### Learnly\n- Landing nova mergeada'),
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
              '- [ ] Cobrar: Ken, sobre os bloqueios do Marketplace (desde 27/10, sem resposta) — "Hey Ken, any update on the marketplace blockers?" https://discord.com/channels/100000000006666666/100000000001111111/100000000003333333 <!-- plano: acme-developer-portal -->',
              '  - Conferido 2026-10-28 · ainda pendente: sem resposta no canal desde 27/10',
              '- [ ] Revisar: update do swapr que o Nico mandou (mais tokens, novo relay address) https://discord.com/channels/@me/100000000002222222/100000000005555555',
              '  - Conferido 2026-10-28 · em parte: o update é o acme-labs/orbitdex#282, aberto e com review pedido',
              '- [x] Mensagem: responder o Rui sobre a exportação da chave — "It happens when 2FA is off; it was requested in an earlier audit." https://discord.com/channels/100000000006666666/100000000001111111/100000000004444444',
            ].join('\n'),
          ],
        ],
        conversas: [
          ['acme', `${day}.md`, '# Conversas\n\n## 11:42 · Discord #dev_channel\n- O Alex perguntou ao Ken sobre os bloqueios do Marketplace; sem resposta.\n- O Rui relatou que exportar a chave pede biometria e senha; não é bug.'],
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
              { id: 'planos-investigador', displayName: 'Planos: investigador', cronExpression: '5 8,14 * * 1-5', enabled: true, lastRunAt: new Date(Date.now() - 3 * 3600e3).toISOString(), filePath: '~/.claude/scheduled-tasks/planos-investigador/SKILL.md' },
              { id: 'planos-lista-do-dia', displayName: 'Planos: lista do dia', cronExpression: '40 8,12,16 * * 1-5', enabled: true, filePath: '~/.claude/scheduled-tasks/planos-lista-do-dia/SKILL.md' },
              { id: 'orbitdex-houdini-pr-review', displayName: 'Revisar PRs do Nico (orbitdex)', cronExpression: '0 9 * * *', enabled: true, lastRunAt: new Date(t - 3 * 3600e3).toISOString() },
              { id: 'dex-modularization-nightly', cronExpression: '0 2 * * *', enabled: false },
              { id: 'orbitdex-pr258-265-after-publish', displayName: 'OrbitDex #258/#265: verificar e enviar após publish do acme-connect', cronExpression: '0 */6 * * *', enabled: true },
            ],
            recordedSkips: {
              'orbitdex-pr258-265-after-publish': Array.from({ length: 12 }, (_, i) => ({ at: new Date(new Date().setHours(0, 0, 0, 0)).getTime() + i * 3600e3, reason: 'per_task_limit' })),
            },
          }),
        ],
        claudeRuns: [
          { task: 'planos-investigador', session: 'local_mock-1', started: new Date(new Date().setHours(8, 10)).getTime(), lastActivity: t - 3 * 3600e3, turns: 3, status: 'blocked', detail: 'ion repos ahead of GitHub; PRs #14 and #1 need merge' },
          { task: 'planos-lista-do-dia', session: 'local_mock-2', started: new Date(new Date().setHours(8, 52)).getTime(), lastActivity: t - 3 * 3600e3, turns: 3, status: 'completed', detail: 'lista de quarta pronta: 7 fazer, 2 cobrar, 2 decidir' },
          { task: 'orbitdex-pr258-265-after-publish', session: 'local_mock-4', started: t - 21 * 3600e3, lastActivity: t - 21 * 3600e3, turns: 0, status: null, detail: null },
          { task: 'orbitdex-houdini-pr-review', session: 'local_mock-3', started: new Date(new Date().setHours(9, 1)).getTime(), lastActivity: t - 3 * 3600e3, turns: 3, status: 'completed', detail: 'reviewed #282 and #283' },
        ],
        claudeSkills: [
          ['planos-lista-do-dia', '---\ndescription: Lê ~/planos/hoje.md nos dias úteis e entrega o resumo.\n---\n'],
          ['orbitdex-houdini-pr-review', '---\ndescription: Revisa localmente cada PR nova do NicoNFT e escreve um relatório.\n---\n'],
          ['dex-modularization-nightly', '---\ndescription: Nightly scoped dev-issue-runner, draft PRs only.\n---\n'],
        ],
        hermesJobs: JSON.stringify({
          jobs: [
            { id: 'a6014dea315d', name: 'revisor-planos', prompt: 'Rode a revisão periódica do Quadro de Planos no Plane (workspace alexdev).', skills: ['quadro-de-planos'], schedule: { kind: 'cron', expr: '36 8,11,14,17 * * 1-5' }, enabled: true, state: 'scheduled', last_run_at: new Date(t - 2 * 3600e3).toISOString(), last_status: 'ok' },
            { id: 'fde005ac069c', name: 'investigador-planos', prompt: 'Rode a investigação dos planos no Plane.', skills: ['quadro-de-planos'], schedule: { kind: 'cron', expr: '41 9,15 * * 1-5' }, enabled: true, state: 'scheduled', last_status: 'ok' },
          ],
        }),
        hermesHeartbeat: `${t / 1000} 1`,
        hermesOutputs: [],
        planosLaunchd: [
          ['dev.leco.planos.hoje', false],
          ['dev.leco.planos.semana', false],
        ],
        openbotInstalled: true,
        openbotFiles: [{ path: '~/OpenBot/Shared/Planos/brief-do-dia.md', mtime: t - 9 * 3600e3 }],
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
      return 'exemplo'
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
