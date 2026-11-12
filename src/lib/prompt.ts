import type { Ask, AskKind, Idioma, Plan, ProjectInfo } from './types'
import { nextPhase, phaseLabel, progress } from './plan'
import { comoAparece, deNome, nome, Nome } from './usuario'
import { idiomaRegra, isEn, t } from './i18n'

export function planPrompt(plan: Plan, root: string, project?: ProjectInfo) {
  const file = `${root}/${plan.path}`
  const prog = progress(plan)
  const done = plan.phases.filter((f) => f.done).map(phaseLabel)
  const todo = plan.phases.filter((f) => !f.done).map(phaseLabel)
  const next = nextPhase(plan)
  const decisions = plan.decisions.filter((d) => !d.done).map((d) => d.text)
  return [
    `Vamos trabalhar no plano "${plan.fm.titulo}" (${project?.nome ?? plan.projectSlug}).`,
    `Arquivo: ${file}`,
    plan.fm.origem ? `Original no Claude: ${plan.fm.origem}` : '',
    plan.extras.length ? `Outros arquivos na pasta do plano: ${plan.extras.join(', ')}` : '',
    '',
    `Status: ${plan.fm.status} · progresso ${prog.done}/${prog.total}.`,
    done.length ? `Fases feitas: ${done.join('; ')}.` : '',
    todo.length ? `Fases pendentes: ${todo.join('; ')}.` : '',
    next ? `Próxima fase: ${phaseLabel(next)}.` : '',
    decisions.length ? `Decisões em aberto: ${decisions.join('; ')}.` : '',
    '',
    plan.paraVoce?.acoes.some((a) => !a.done) ? `O que está pendente para mim: ${plan.paraVoce.acoes.filter((a) => !a.done).map((a) => a.text).join('; ')}.` : '',
    project ? `Rascunhos de mensagem deste projeto: ${emIdioma(project.idioma)}.` : '',
    'Leia o plano.md antes de qualquer coisa. Siga a skill `planejamento`: ao concluir uma fase, marque o checkbox com a data, acrescente uma linha no Log (- AAAA-MM-DD: o que foi feito) e atualize `atualizado` no cabeçalho. Ao terminar, reescreva a seção "## Para você" no topo (do que se trata, como está, o que precisa de mim, em palavras simples). Nunca envie mensagens a terceiros.',
    'Depois me pergunte se quero discutir o plano, alterar as fases ou trabalhar na próxima fase.',
    idiomaRegra(),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}

export function projectPrompt(project: ProjectInfo, plans: Plan[], root: string) {
  const open = plans.filter((p) => p.fm.status !== 'feito' && p.fm.status !== 'arquivado')
  const list = open.map((p) => {
    const pr = progress(p)
    return `- ${p.fm.titulo} [${p.fm.status}, ${pr.done}/${pr.total}] → ${root}/${p.path}`
  })
  return [
    `Sessão do projeto ${project.nome}.`,
    `Contexto do projeto: ${root}/projetos/${project.slug}/projeto.md`,
    '',
    open.length ? 'Planos abertos:' : 'Nenhum plano aberto ainda.',
    ...list,
    '',
    'Use a skill `planejamento`. Se eu pedir um plano novo, crie em ' +
      `${root}/projetos/${project.slug}/planos/<AAAA-MM-DD>-<slug>/plano.md com o cabeçalho padrão.`,
    'Comece me perguntando o que quero fazer neste projeto.',
    idiomaRegra(),
  ].join('\n')
}

export const IDIOMA_LABEL: Record<Idioma, string> = {
  get en() {
    return t('Inglês', 'English')
  },
  get 'pt-BR'() {
    return t('Português', 'Portuguese')
  },
}

/** "em inglês" / "em português do Brasil", para as regras de rascunho */
export function emIdioma(idioma: Idioma = 'en') {
  return idioma === 'pt-BR' ? 'em português do Brasil' : 'em inglês'
}

/** regra de rascunho quando o projeto não é conhecido de antemão (rotinas, console) */
export const IDIOMA_REGRA =
  'no idioma do projeto do item: o campo `idioma` dele em projetos.yaml (pt-BR = português do Brasil; en ou sem o campo = inglês)'

/** item travado por outro trabalho: o app mostra a conferência em vermelho, com o botão do plano que trava */
export const BLOQUEIO_REGRA =
  'Item travado por outro trabalho (um bug em outro repositório, algo que depende de outra pessoa): a linha de conferência é `  - Conferido AAAA-MM-DD · bloqueado por <id do plano que trava>: <por quê, em 1 linha>`, com o id exato do campo `id` daquele plano (se o trabalho ainda não tem plano, crie o plano antes). Nunca escreva "BLOCKER" solto no meio de "ainda pendente". Quando o bloqueio sair, troque por "ainda pendente" ou "já feito".'

/**
 * Regras do investigador: conferir no GitHub se o plano andou e reescrever "Para você".
 * O mesmo texto vai na tarefa agendada "Planos: investigador" e no botão "Conferir agora".
 */
export function investigador() {
  return `## Como conferir um plano

Contexto: no sistema ${deNome()}, quem implementa e revisa é IA (Claude, Codex). ${Nome()} decide, desbloqueia, testa no app de verdade quando precisa e fala com pessoas. "Para você" existe para ele bater o olho e saber o que é o plano e o que depende dele, sem ler o resto.

1. Leia o plano.md inteiro (cabeçalho, fases, decisões, cobranças, Log, "Última análise" se houver).
2. Descubra onde está o código: o worktree do cabeçalho (\`git -C <worktree> remote get-url origin\`), os caminhos em \`documentos\`, os repositórios citados em \`projeto.md\` do projeto e os PRs/issues citados no texto (#123, links do GitHub). Sem repositório, diga isso em "Como está".
3. Confira o estado real, só lendo:
   - PRs citados ou da branch do worktree: \`gh pr view <n> --repo <dono/repo> --json number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,mergedAt,updatedAt,headRefName,url\`
   - PRs abertos ligados ao plano: \`gh pr list --repo <dono/repo> --search "<palavras do título>" --state all --limit 10 --json number,title,state,mergedAt,updatedAt\`
   - commits recentes: \`gh api repos/<dono/repo>/commits?since=<data do último Conferido>\` ou \`git -C <worktree> log --since=...\`; no worktree, também \`git -C <worktree> status -sb\` (mudanças não commitadas, branch atrás/à frente).
4. Fases: marque como feita só com evidência clara (PR mergeado ou commit na branch principal que faz aquela fase). Use o formato \`- [x] F3 Nome — AAAA-MM-DD\`, acrescente no Log \`- AAAA-MM-DD: F3 concluída (PR #807 mergeado) — investigador\` e aplique o status automático (primeira fase → andamento; todas → revisao). Nunca desmarque fase e nunca passe para \`feito\`.
5. Reescreva a seção \`## Para você\`, logo depois do título \`# ...\` (crie se não existir, substitua se existir), exatamente neste formato:

\`\`\`
## Para você
**Do que se trata:** <1 ou 2 frases, palavras simples, o que muda para o usuário ou para o negócio quando isso ficar pronto>
**Como está:** <1 ou 2 frases sobre o estado real: o que já foi feito, o que a IA está fazendo, o que está travando (ex.: "o PR #807 está pronto, mas briga com o #806 que entrou ontem")>
**Precisa de você:**
- [ ] <Tipo>: <ação concreta, curta, com o nome da pessoa ou do PR quando houver>
**Conferido:** AAAA-MM-DD · <o que você olhou, ex.: PR #806 mergeado, PR #807 aberto com conflito, 3 commits desde 20/10>
\`\`\`

   Tipos permitidos no começo de cada item: Continuar, Testar no app, Decidir, Mensagem, Cobrar, Aprovar, Revisar, Acesso, Arquivar.
   - Continuar: abrir uma sessão de IA para seguir (diga o que pedir: "pedir para a IA resolver o conflito do #807 com o #806").
   - Testar no app: só quando precisa do app LIVE/dispositivo real; diga onde e o que olhar.
   - Mensagem: sugira para quem e escreva o rascunho entre aspas, ${IDIOMA_REGRA} (ex. em inglês: "Sam, #807 is ready for review. Could you take a look today?"; em português: "Ana, o #71 está pronto para revisão. Consegue olhar hoje?"). O resto do item segue ${isEn() ? 'em inglês (o idioma do app)' : 'em português'}. Nunca envie.
   - Cobrar: quem está devendo o quê e desde quando; se sugerir a mensagem de cobrança, rascunho entre aspas no mesmo idioma do projeto.
   - Decidir: só para escolha que é ${deNome()} e que dá para fazer agora. Escreva na própria linha a pergunta, as opções e a sua recomendação (ex.: "Decidir: navegação do portal no celular: abas embaixo (recomendo, é o padrão do app) ou menu lateral"). Nunca aponte para outra seção ("as decisões em aberto abaixo"): uma decisão por item. Se a escolha depende de outra pessoa (cliente, direção, outro dev), não é Decidir: é Mensagem ou Cobrar para essa pessoa, com o rascunho. Se já foi decidida (está no Log ou marcada em "Decisões em aberto"), não pergunte de novo: aplique-a.
   - Aprovar / Acesso / Arquivar: a liberação, a credencial ou o plano obsoleto.
   - Todo item tem de ser algo que ${nome()} consegue concluir sozinho, de uma vez, e que deixa claro quando está feito. Item vago ("ver o plano", "acompanhar", "alinhar") não entra.
   - Um assunto, um item: se o mesmo PR, bug ou decisão aparece em mais de um plano, o item fica só no plano principal daquele assunto (o que tem as fases dele). Nos outros, cite em "Como está" ("depende do #807, acompanhado no plano <id>") e não repita o item.
   - Não reescreva por reescrever: um item que continua valendo fica com o texto exatamente igual (é o texto que liga o item à tarefa do dia; mudar uma palavra cria uma pendência repetida). Se o fato mudou e o texto precisa mudar, troque também a linha da tarefa em tarefas/<hoje>.md pelo mesmo texto novo.
   - Não invente pendência para preencher: se desde o último Conferido nada mudou e nada novo depende ${deNome()}, mantenha os itens que continuam valendo como estão (mesmo texto) e não crie outros.
   - No máximo 3 itens, do mais importante para o menos. Se nada depende ${deNome()}, escreva \`**Precisa de você:** nada agora — <o que está andando sozinho>\`.
   - Mantenha os itens que ${nome()} já marcou com [x] só se ainda fizerem sentido; caso contrário, remova.
6. Não mude \`atualizado\` só por reescrever "Para você" (isso esconderia planos parados). Mude só quando marcar fase ou mudar status.

Limites: só leitura nos repositórios de código (nada de push, merge, comentário, review ou issue no GitHub). Nunca envie mensagens a ninguém. Nunca apague arquivos. Em ~/planos, edite só os plano.md (o commit no próprio ~/planos é permitido).`
}

export function conferirPrompt(plan: Plan, root: string, idioma?: Idioma) {
  return [
    `Confira o plano "${plan.fm.titulo}" e atualize a seção "Para você".`,
    `Arquivo: ${root}/${plan.path}`,
    `Rascunhos de mensagem deste projeto: ${emIdioma(idioma)}.`,
    idiomaRegra(),
    '',
    investigador(),
    '',
    `Ao terminar, faça commit em ${root} (\`git -C ${root} add -A && git -C ${root} commit -m "investigador: ${plan.fm.id}"\`) e me diga em 3 linhas o que mudou.`,
  ].join('\n')
}

function askIntro(kind: AskKind) {
  const intro: Partial<Record<AskKind, string>> = {
    aprovar: `${Nome()} clicou em APROVAR neste item. Isso vale como autorização só para esta ação, neste plano.`,
    continuar: `${Nome()} pediu para seguir com este item.`,
    revisar: `${Nome()} pediu para revisar este item.`,
    decidir: `${Nome()} quer decidir este item agora.`,
    testar: `${Nome()} vai testar este item no app de verdade e quer um roteiro.`,
    acesso: `${Nome()} precisa resolver este acesso.`,
    arquivar: `${Nome()} quer resolver se este plano deve ser arquivado.`,
  }
  return intro[kind] ?? `${Nome()} pediu para resolver este item.`
}

const ASK_HOW: Partial<Record<AskKind, string>> = {
  aprovar:
    'Faça exatamente o que o item descreve (por exemplo: `gh pr review <n> --approve` e `gh pr merge <n>`, ou o push das branches citadas), confira o resultado e pare. Nada além disso. Se o GitHub recusar (ex.: não dá para aprovar o próprio PR, falta review obrigatório, CI vermelho, conflito), não force: explique em uma frase e diga o que destrava.',
  continuar: 'Faça o trabalho descrito no item, no repositório/worktree do plano, seguindo a skill `planejamento`.',
  revisar: 'Revise o que o item cita (PR, branch, documento) e me dê o resultado em até 5 linhas, com o que está bom e o que precisa mudar.',
  decidir:
    'Me apresente as opções em poucas linhas, com prós, contras e a sua recomendação, e espere eu escolher. Depois registre a decisão em "Decisões em aberto" (marque [x] com a escolha) e no Log.',
  testar: 'Me dê um roteiro curto do que abrir e o que conferir (com links), espere eu testar e registre o resultado no Log.',
  acesso: 'Me diga, passo a passo e com links, onde clicar para resolver. Eu mesmo faço a parte de login e senhas.',
  arquivar: 'Confira se o plano ainda faz sentido e me diga em 3 linhas. Se eu concordar, mude o status para `arquivado` (nunca apague).',
}

/** prompt de um item de "Para você": abre a IA já focada naquela ação */
export function askPrompt(plan: Plan, ask: Ask, root: string, tarefaFile?: string, idioma?: Idioma) {
  const tarefas = `${root}/tarefas/${tarefaFile ?? `${new Date().toISOString().slice(0, 10)}.md`}`
  return [
    askIntro(ask.kind),
    `Plano: "${plan.fm.titulo}" — ${root}/${plan.path}`,
    plan.fm.worktree ? `Worktree: ${plan.fm.worktree}` : '',
    `Item: ${ask.text}`,
    '',
    'Leia o plano.md antes (principalmente a seção "Para você" e o Log).',
    tarefaFile
      ? `Este item é uma tarefa do dia, em ${tarefas} (a linha que começa com "- [ ] ${ask.text.slice(0, 60).replace(/"/g, "'")}…"), com a conferência do revisor logo abaixo.`
      : '',
    'Antes de trabalhar, confira se já foi feito: PRs mergeados depois da data do pedido (`gh pr list --repo <dono/repo> --state merged --search "merged:>=AAAA-MM-DD"`, lendo título e descrição), commits na branch principal e nos clones locais (`git log` por arquivo e por número de PR, não só por palavra) e versões publicadas. Se já estava feito, não refaça: registre a evidência.',
    ASK_HOW[ask.kind] ?? 'Faça o que o item descreve e pare.',
    tarefaFile ? BLOQUEIO_REGRA : '',
    '',
    `Quando o item estiver resolvido (ou se descobrir que já estava): ${tarefaFile ? `marque a linha dele com [x] em ${tarefas} e troque a linha "  - Conferido …" logo abaixo por \`  - Conferido AAAA-MM-DD · já feito: <evidência: PR, commits, versão>\`; não crie item novo em "Para você" para isso. No plano, ` : `se o item estiver nas tarefas do dia (${tarefas}), marque-o lá também com a conferência "já feito". No plano, `}` +
      'marque-o com [x] na seção "## Para você" do plano.md se ele estiver lá, acrescente no Log `- AAAA-MM-DD: <o que foi feito>`, reescreva "Como está" e "Precisa de você" se o estado mudou, e faça commit em ' +
      `${root} (git -C ${root} add -A && git -C ${root} commit -m "${plan.fm.id}: ${ask.kind}").`,
    `Rascunho de mensagem para qualquer pessoa: ${emIdioma(idioma)}. Nunca envie mensagens a terceiros e nunca apague arquivos.`,
    idiomaRegra(),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}

/**
 * Conversa colada (Discord, WhatsApp…): a IA tira dela as tarefas do usuário, as cobranças,
 * as perguntas sem resposta e as decisões, e escreve nos arquivos de sempre.
 * O texto colado fica em ~/planos/.indice (fora do git); no git só entra o que a IA escreveu.
 */
export function chatPrompt(project: ProjectInfo, plans: Plan[], file: string, root: string, origem: string, today: string, voce?: string) {
  const open = plans.filter((p) => p.fm.status !== 'feito' && p.fm.status !== 'arquivado')
  return [
    `${Nome()} colou uma conversa${origem ? ` de ${origem}` : ' do Discord'} do projeto ${project.nome}. Tire dela o que precisa de ação e guarde nos planos.`,
    `Conversa: ${file} (leia inteira; fica fora do git e não deve ser copiada para nenhum arquivo)`,
    `Hoje é ${today}.`,
    '',
    `Planos abertos de ${project.nome} (id → título):`,
    ...open.map((p) => `- ${p.fm.id} → ${p.fm.titulo} (${root}/${p.path})`),
    '',
    voce
      ? `Quem é quem: ${nome()} é ${voce} no Discord. Cada mensagem termina com o link dela: ponha o link no fim de cada tarefa, cobrança ou decisão que vier dela.`
      : `Quem é quem: ${comoAparece() ? `${nome()} aparece como ${comoAparece()}` : 'a pessoa que colou a conversa é quem usa o app'}. Se não der para saber qual nome é o dela, pergunte antes de escrever. Datas como "Hoje às 10:32", "Ontem" ou "Today at" são relativas à data de hoje.`,
    '',
    'O que tirar e onde escrever:',
    `1. Pedido a ${nome()}, menção a essa pessoa ou pergunta para ela que ficou sem resposta dela → tarefa do dia em ${root}/tarefas/${today}.md. Se o arquivo não existe, crie com \`# Tarefas de <dia da semana>, DD/MM\` e uma linha em branco. Uma linha por item: \`- [ ] <Tipo>: <ação concreta> <link da mensagem, se houver> <!-- plano: <id> -->\` (o comentário sempre por último), com o id do plano do assunto (sem plano claro, sem o comentário). Tipos: Continuar, Testar no app, Decidir, Mensagem, Cobrar, Aprovar, Revisar, Acesso. Para responder alguém, use Mensagem com o rascunho da resposta ${emIdioma(project.idioma)} entre aspas ("…"), citando quem perguntou e quando.`,
    `2. Pergunta para outra pessoa sem resposta, ou promessa ("faço até sexta", "subo amanhã") → cobrança na seção "## Pessoas e cobranças" do plano do assunto: \`- [ ] Pessoa: o que deve (desde AAAA-MM-DD)\`. Se foi ${nome()} quem perguntou ou pediu e já passou mais de um dia útil sem resposta, ponha também nas tarefas do dia como \`Cobrar: <pessoa>, <o quê> (desde DD/MM)\` com o rascunho da cobrança ${emIdioma(project.idioma)} entre aspas. Sem plano claro, liste na resposta final e pergunte onde pôr.`,
    '3. Decisão tomada na conversa → linha no Log do plano do assunto: `- AAAA-MM-DD: decidido na conversa: <decisão> (<quem>)`.',
    '',
    'Antes de escrever cada tarefa ou cobrança, confira se já foi feito: procure nos repositórios do GitHub os PRs mergeados depois da data da mensagem (`gh pr list --state merged --search "merged:>=AAAA-MM-DD"`, lendo título e descrição) e os commits desde então (`gh api repos/<dono>/<repo>/commits?since=<data>`); busca por palavra-chave no git log sozinha não basta, nos clones locais (`git log --since --grep`, worktrees abertos, `npm view` para publicações) e nos planos. Logo abaixo do item, com dois espaços de recuo, escreva a conferência: `  - Conferido AAAA-MM-DD · <já feito | em parte | ainda pendente | bloqueado por <id do plano que trava>>: <a evidência, com o PR (dono/repo#n), o commit ou o comando que você rodou>`. Se já foi feito, escreva o item já marcado ([x]) com a conferência "já feito"; não crie tarefa para o que já está resolvido. Sem como conferir (nada no GitHub nem local), escreva "ainda pendente: sem repositório para conferir" e o porquê.',
    `4. Resumo: acrescente em ${root}/projetos/${project.slug}/conversas/${today}.md (crie se faltar, título \`# Conversas de DD/MM\`) uma seção \`## HH:MM · ${origem || 'Discord'}\` com 3 a 8 linhas do que se falou, em palavras simples, citando pessoas e planos.`,
    '',
    'Regras: não repita item que já está nas tarefas do dia, nas cobranças ou no "Para você" do plano; não marque fases; não copie mensagens inteiras para os arquivos (só o necessário para a ação ou o rascunho); nunca envie mensagem a ninguém; nunca apague arquivos.',
    `Ao terminar, faça commit em ${root} (\`git -C ${root} add -A && git -C ${root} commit -m "conversa: ${project.slug} ${today}"\`) e me diga em até 8 linhas o que entrou: tarefas do dia, cobranças (de quem), decisões e o que ficou sem lugar.`,
    idiomaRegra(),
  ].join('\n')
}

/** Leitura do Discord: o mesmo texto vai no botão "Ler agora" e na tarefa agendada "Planos: Discord". */
export function discordPrompt(root: string) {
  return [
    `Leia os canais do Discord ${deNome()} e tire deles tarefas e cobranças.`,
    '',
    `1. Rode \`~/.local/bin/planos discord --ler\` (a pasta é ${root}). Ele busca só as mensagens novas, grava cada canal num arquivo fora do git e imprime, para cada canal com novidade, um pedido de extração entre linhas "=== #canal ===".`,
    '2. Siga cada pedido impresso, um canal por vez, exatamente como está escrito.',
    '3. Se ele disser que não há mensagens novas, responda só "Sem novidades no Discord." e pare.',
    '4. Se o comando falhar (token recusado, canal sem acesso), diga o erro em uma linha e pare; não tente outro jeito de ler.',
    '',
    'Nunca escreva, reaja ou envie nada no Discord. Nunca mostre nem copie o token.',
    idiomaRegra(),
  ].join('\n')
}

/** Instruções do console: o Claude Code que roda dentro do app para o usuário controlar a ferramenta conversando. */
export function consolePrompt(root: string) {
  return `Você é o console do Letco, o app de planejamento ${deNome()}. Essa pessoa fala com você para mexer na ferramenta: ver o que tem para hoje, marcar coisas como feitas, criar ou mudar planos, ler o Discord, preparar posts. ${idiomaRegra()} Use palavras simples.

Tudo vive em ${root} (Markdown + git). O app relê os arquivos na hora em que mudam, então basta editar e fazer commit.
- projetos.yaml: projetos (nome, cor, idioma das mensagens), ordem e contextos (trabalho / fora do horário).
- projetos/<projeto>/projeto.md e projetos/<projeto>/planos/<AAAA-MM-DD>-<slug>/plano.md: os planos, no padrão da skill planejamento (cabeçalho, "## Para você", fases, decisões, "## Pessoas e cobranças", Log).
- tarefas/<AAAA-MM-DD>.md: as tarefas do dia. Uma linha por item, \`- [ ] <Tipo>: <texto> <link> <!-- plano: <id> -->\`, e embaixo, com recuo, \`  - Conferido AAAA-MM-DD · já feito|em parte|ainda pendente|bloqueado por <id do plano>: <evidência>\`. Marcar a tarefa com [x] e, se o texto for igual ao item de "Para você" do plano, marcar lá também.
- projetos/<projeto>/conversas/<AAAA-MM-DD>.md: resumos das conversas lidas (Discord ou coladas).
- discord/canais.yaml: canais do Discord que a rotina lê. O token fica no Keychain: nunca leia, mostre ou copie.
- resumos/<AAAA-MM-DD>.md: resumo do dia (números no cabeçalho, o que foi feito, decisões, para amanhã), escrito pela rotina das 19h.
- divulgacao/<campanha>/<pasta>/: imagem.png, legenda.md e post.md (status pendente | postado | descartado) dos posts das campanhas de divulgacao/campanhas.yaml.
- hoje.md e semana.md: gerados pelo comando planos; não edite à mão.
- .indice/: fora do git (conversas brutas, estado das leituras).

Comando de terminal \`planos\` (~/.local/bin/planos): \`planos hoje --escrever\`, \`planos ls [projeto]\`, \`planos ver <id>\`, \`planos novo <projeto> "título"\`, \`planos status <id> <status>\`, \`planos prazo <id> <data>\`, \`planos fase concluir <id> [F3]\`, \`planos arquivar <id>\`, \`planos discord --ler\` (lê as mensagens novas e imprime o pedido de extração: siga-o), \`planos atividade\` (sessões do Claude e PRs recentes que ainda não estão nos planos, com o pedido para registrar: siga-o). Prefira o comando quando ele faz o que foi pedido; ele já faz o commit.
Rotinas agendadas do Claude: planos-investigador (confere planos no GitHub), planos-lista-do-dia, planos-discord, planos-divulgacao, planos-resumo-do-dia (19h: \`planos resumo\` escreve resumos/AAAA-MM-DD.md). As instruções ficam em ~/.claude/scheduled-tasks/<id>/SKILL.md.

Regras:
- Rascunho de mensagem para qualquer pessoa: entre aspas, ${IDIOMA_REGRA}. Para mudar o idioma de um projeto, edite \`idioma\` em projetos.yaml. Nunca envie mensagem a ninguém, nem escreva no Discord.
- Nunca apague arquivos ou planos: para tirar de cena, status arquivado.
- Ao criar tarefa ou cobrança, ou dizer que algo está feito, confira antes no GitHub (PRs mergeados depois da data do pedido, lendo título e descrição; commits) e nos clones locais, e grave a linha Conferido com a evidência. Busca por palavra-chave sozinha não basta.
- Quando resolver ou descobrir que uma tarefa do dia já estava feita, marque a linha dela com [x] no arquivo de tarefas e troque a linha Conferido por "já feito: <evidência>".
- ${BLOQUEIO_REGRA}
- Nos repositórios de código, só leitura, a menos que ${nome()} peça explicitamente uma mudança.
- Depois de mudar arquivos em ${root}: \`git -C ${root} add -A && git -C ${root} commit -m "<o que mudou>"\` e, se algo afeta a lista do dia, \`planos hoje --escrever --silencioso\`.

Comece se apresentando em uma linha e perguntando o que quer fazer.`
}

/** Decisão livre do usuário sobre um item (tarefa do dia ou cobrança): vai para o agente do Console aplicar nos arquivos. */
export function decisionPrompt(o: {
  root: string
  item: string
  where: string
  plan?: { titulo: string; path: string; id: string }
  conferido?: string
  origem?: string
  texto: string
  today: string
  idioma?: Idioma
}) {
  return [
    `${Nome()} escreveu uma decisão ou instrução sobre um item da lista. Aplique nos arquivos de ${o.root}.`,
    '',
    `Item: ${o.item}`,
    `Onde está: ${o.where}`,
    o.plan ? `Plano: "${o.plan.titulo}" (id ${o.plan.id}) — ${o.root}/${o.plan.path}` : '',
    o.conferido ? `Conferência do revisor: ${o.conferido}` : '',
    o.origem ? `Origem: ${o.origem}` : '',
    '',
    `O que ${nome()} escreveu:`,
    '"""',
    o.texto.trim(),
    '"""',
    '',
    `Como aplicar (hoje é ${o.today}):`,
    '- Interprete o que ele quis. Se for uma decisão, registre no plano: marque [x] o item correspondente em "Decisões em aberto" com a escolha (ou acrescente já marcado) e ponha no Log `- AAAA-MM-DD: decidido: <decisão>`.',
    '- Atualize o item: marque [x] se ficou resolvido; reescreva o texto se mudou; se a decisão gera uma ação nova (tarefa, cobrança, mensagem), crie-a no lugar certo, com a linha Conferido depois de conferir no GitHub e nos clones se aquilo já existe.',
    '- Se ele disser que já foi feito, confira antes (PRs mergeados, commits) e grave a evidência na linha Conferido; se não achar evidência, diga isso e não marque.',
    `- ${BLOQUEIO_REGRA}`,
    `- Rascunhos de mensagem ${o.plan ? emIdioma(o.idioma) : IDIOMA_REGRA}. Nunca envie nada a ninguém. Nunca apague arquivos.`,
    `- Ao terminar: commit em ${o.root} e, se mexeu em tarefas ou planos ativos, \`planos hoje --escrever --silencioso\`. Responda em até 3 linhas o que mudou.`,
    '- Se a instrução estiver ambígua, pergunte antes de mexer.',
    idiomaRegra(),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}

/** Conversa sobre um item (tarefa do dia ou cobrança), aberta pelo botão "Abrir no Claude Code" da janela do item. */
export function itemPrompt(o: {
  root: string
  item: string
  where: string
  plan?: { titulo: string; path: string; id: string }
  conferido?: string
  origem?: string
  today: string
  idioma?: Idioma
}) {
  return [
    `${Nome()} abriu esta conversa para tratar de um item da lista (hoje é ${o.today}).`,
    '',
    `Item: ${o.item}`,
    `Onde está: ${o.where}`,
    o.plan ? `Plano: "${o.plan.titulo}" (id ${o.plan.id}) — ${o.root}/${o.plan.path}` : '',
    o.conferido ? `Conferência do revisor: ${o.conferido}` : '',
    o.origem ? `Origem: ${o.origem}` : '',
    '',
    o.plan ? 'Leia o plano.md antes (principalmente "Para você", "Decisões em aberto", "Pessoas e cobranças" e o Log).' : '',
    'Confira o estado real antes de opinar: PRs mergeados depois da data do item (`gh pr list --state merged --search "merged:>=AAAA-MM-DD"`, lendo título e descrição), commits na branch principal e nos clones locais. Busca por palavra-chave sozinha não basta.',
    'Depois me diga em até 4 linhas como o item está e me pergunte o que quero fazer. Não faça nada além de ler até eu responder.',
    '',
    `Quando o item ficar resolvido (ou se descobrir que já estava): marque-o com [x] onde ele está e troque a linha "  - Conferido …" logo abaixo por \`  - Conferido AAAA-MM-DD · já feito: <evidência>\`; ${o.plan ? 'no plano, marque o item igual em "Para você" se houver e acrescente no Log `- AAAA-MM-DD: <o que foi feito>`; ' : ''}depois faça commit em ${o.root} e rode \`planos hoje --escrever --silencioso\`.`,
    BLOQUEIO_REGRA,
    `Rascunhos de mensagem ${o.plan ? emIdioma(o.idioma) : IDIOMA_REGRA}. Nunca envie nada a ninguém. Nunca apague arquivos. Nos repositórios de código, só leitura, a menos que eu peça uma mudança.`,
    idiomaRegra(),
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}

/**
 * Juntar os planos que a pessoa já tem espalhados no Mac (planos do Claude, PLAN.md, TODO.md, docs de repositório)
 * no padrão de ~/planos. Roda no Claude da máquina dela: procura, mostra a lista, pergunta e só então copia.
 */
export function juntarPlanosPrompt(root: string, projetos: { slug: string; nome: string }[]) {
  return [
    `Quero juntar no Letco os planos que eu já tenho espalhados neste Mac. A pasta do Letco é ${root}; siga a skill \`planejamento\` para o formato.`,
    projetos.length ? `Projetos que já existem em ${root}/projetos.yaml: ${projetos.map((p) => `${p.nome} (${p.slug})`).join(', ')}.` : `Ainda não há projetos em ${root}/projetos.yaml.`,
    '',
    '1. Procure, só lendo, documentos de planejamento:',
    '   - planos do Claude Code em ~/.claude/plans/*.md;',
    '   - nos repositórios git das pastas de código de sempre (~/Documents, ~/Developer, ~/Projects, ~/code, ~/dev, ~/src, ~/repos, ~/orca, até 3 níveis): PLAN*.md, PLANO*.md, TODO*.md, ROADMAP*.md, SPEC*.md, HANDOFF*.md e docs/plans, docs/planos, docs/specs;',
    '   - em ~/Documents, ~/Desktop e ~/Downloads, arquivos .md cujo nome ou primeiro título fale em plano, roadmap, spec, handoff ou to-do (pule node_modules, .git, Library e pastas de build).',
    '   Ignore README, CHANGELOG, licenças e documentação de bibliotecas de terceiros.',
    '2. Mostre a lista agrupada por projeto provável: caminho, título, data da última mudança e uma linha do que é. Sugira o projeto de cada um (pelo repositório ou pelo assunto) e quais parecem velhos ou já concluídos.',
    '3. Pergunte quais entram, em quais projetos (existentes ou novos) e com que status. Não escreva nada antes da minha resposta.',
    `4. Para cada escolhido, crie ${root}/projetos/<projeto>/planos/<AAAA-MM-DD>-<slug>/plano.md no padrão da skill: cabeçalho completo (\`origem\` com o caminho do arquivo original), "## Para você" em palavras simples, objetivo, fases como checkboxes (marque as que o documento já dá como feitas), decisões em aberto e Log com \`- <hoje>: importado de <caminho>\`. Projeto novo: acrescente em ${root}/projetos.yaml (nome, e o slug na \`ordem\` dos dois contextos) e crie ${root}/projetos/<projeto>/projeto.md com os repositórios que você achou.`,
    '5. Nunca mova, edite ou apague o arquivo original: só copie o conteúdo para o padrão.',
    `6. Ao terminar: \`git -C ${root} add -A && git -C ${root} commit -m "planos importados"\`, \`~/.local/bin/planos hoje --escrever --silencioso\` e me diga em até 6 linhas o que entrou em cada projeto e o que ficou de fora.`,
    '',
    `${idiomaRegra()} Nunca envie mensagens a ninguém.`,
  ].join('\n')
}

/**
 * Arquivos soltos na tela Documentos (copiados para entrada/organizar/): a IA lê cada um, decide o que é
 * e põe no lugar certo de ~/planos. O original, fora da pasta, nunca é tocado.
 */
export function organizarPrompt(root: string, rels: string[], projetos: { slug: string; nome: string }[], planos: { id: string; titulo: string; path: string }[]) {
  return [
    `${Nome()} soltou ${rels.length === 1 ? 'um arquivo' : `${rels.length} arquivos`} no Letco para você organizar em ${root}. Siga a skill \`planejamento\` para o formato.`,
    '',
    'Arquivos (já copiados para dentro da pasta):',
    ...rels.map((r) => `- ${root}/${r}`),
    '',
    `Projetos: ${projetos.map((p) => `${p.nome} (${p.slug})`).join(', ') || 'nenhum ainda'}.`,
    planos.length ? 'Planos abertos (id → título):' : '',
    ...planos.slice(0, 80).map((p) => `- ${p.id} → ${p.titulo} (${root}/${p.path})`),
    '',
    'Para cada arquivo, leia o conteúdo inteiro (texto, PDF ou imagem; se for um link, abra-o se conseguir) e decida:',
    `1. É um planejamento novo (plano, spec, brief, handoff, roadmap, design de implementação) → crie ${root}/projetos/<projeto>/planos/<AAAA-MM-DD>-<slug>/plano.md no padrão da skill (cabeçalho completo, "## Para você", objetivo, fases como checkboxes, decisões em aberto, Log com \`- <hoje>: importado de <nome do arquivo>\`) e guarde o arquivo original na mesma pasta do plano. Se vier de um link do Claude (design, artifact), ponha o link em \`origem\`.`,
    '2. Complementa um plano que já existe (design, print, pesquisa, ata, nova versão do mesmo documento) → mova para a pasta daquele plano, acrescente no Log dele `- <hoje>: anexado <arquivo>: <o que é, em 1 linha>` e, se o conteúdo muda fases, decisões ou cobranças, atualize essas seções e reescreva "Para você".',
    `3. É material de um projeto sem plano específico (contrato, contexto, referência) → mova para ${root}/projetos/<projeto>/docs/.`,
    '4. Traz tarefas, pedidos ou decisões soltas (anotação, conversa) → tarefas do dia, "Pessoas e cobranças" ou Log do plano do assunto, como numa conversa colada; o arquivo vai para docs/ do projeto.',
    '',
    `Mova com \`git -C ${root} mv\` (ou \`mv\` se o arquivo ainda não está no git); nada fica em entrada/organizar/ ao terminar. Nunca apague um arquivo: sem lugar claro, deixe onde está e diga por quê.`,
    'Se não der para saber o projeto ou se é plano novo ou anexo, pergunte antes de mover: mostre em 1 linha o que o arquivo é e as opções.',
    `Ao terminar: \`git -C ${root} add -A && git -C ${root} commit -m "documentos: <o que entrou>"\`, \`~/.local/bin/planos hoje --escrever --silencioso\` e diga em até 6 linhas onde cada arquivo ficou.`,
    `${idiomaRegra()} Nunca envie mensagens a ninguém.`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
}
