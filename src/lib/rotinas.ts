import { investigador } from './prompt'
import { deNome, nome } from './usuario'
import { idiomaRegra, t } from './i18n'
import { hojeSecoes } from './digest'

/**
 * Rotinas do Letco: tarefas agendadas do app do Claude que mantêm ~/planos em dia.
 * `planos rotina <id>` imprime o texto de cada uma; o onboarding e a tela Rotinas pedem ao Claude para criá-las.
 * Os ids batem com os das tarefas já existentes, para a tela Rotinas saber quais estão instaladas.
 */
export interface Rotina {
  id: string
  titulo: string
  descricao: string
  cron: string
  /** horário em palavras, para a tela */
  quando: string
  /** marcada por padrão no onboarding */
  padrao: boolean
  texto: (root: string) => string
}

const PLANOS = '~/.local/bin/planos'

const falta = (root: string) =>
  `Se ${root}/projetos.yaml não existir, responda só "${t(`${root} ainda não existe: abra o app Letco e faça o onboarding`, `${root} does not exist yet: open the Letco app and complete the onboarding`)}" e pare. Não crie a pasta.`

export const ROTINAS: Rotina[] = [
  {
    id: 'planos-investigador',
    get titulo() {
      return t('Letco: investigador', 'Letco: investigator')
    },
    get descricao() {
      return t('Confere no GitHub se os planos ativos andaram, marca fases prontas, reescreve "Para você" e escolhe as tarefas do dia.', 'Checks GitHub to see if active plans moved, marks finished phases, rewrites "For you" and picks today\'s tasks.')
    },
    cron: '5 8,14 * * 1-5',
    get quando() {
      return t('dias úteis às 8h05 e 14h05', 'weekdays at 8:05 and 14:05')
    },
    padrao: true,
    texto: (root) => `Você é o "investigador" do sistema de planejamentos ${deNome()}. ${idiomaRegra()}

Os planos moram em ${root}/projetos/<projeto>/planos/<pasta>/plano.md (Markdown + git). Seu trabalho: conferir no GitHub e nos repositórios locais se cada plano ativo realmente andou, marcar as fases que estão de fato prontas e reescrever a seção "## Para você" no topo de cada plano, em palavras simples.

Antes de começar:
- ${falta(root)}
- Confirme que \`gh auth status\` está ok; se não estiver, pare e diga que o gh precisa de login.

Antes dos planos, o trabalho feito fora do app: rode \`${PLANOS} atividade\`. Ele lista as sessões recentes do Claude e os PRs dos últimos 2 dias, cada um com o plano que já o cita ou "SEM PLANO", e imprime o que fazer. Siga esse pedido primeiro (sem fazer o commit dele: entra no commit único do fim). Os planos que você atualizar ali já contam como conferidos nesta rodada.

Quais planos conferir nesta rodada:
- Só os de status proximo, andamento, revisao ou bloqueado (ignore ideia, feito e arquivado).
- Ordem: primeiro os que não têm "**Conferido:**" na seção Para você, depois os conferidos há mais tempo. Pule os conferidos hoje.
- No máximo 15 planos por rodada. Use subagentes em paralelo se ajudar, um plano por subagente, todos com as mesmas regras abaixo.

${investigador().replace('Em ~/planos, edite só os plano.md', `Em ${root}, edite só os plano.md e o arquivo de tarefas do dia`)}

Depois de conferir:
1. Tarefas do dia: o que ${nome()} deve fazer hoje vai para \`${root}/tarefas/AAAA-MM-DD.md\` (data de hoje). O app mostra esse arquivo no topo da aba Hoje, com checkbox.
   A lista do dia mostra o que mudou e o que dá para resolver hoje. Ela não é o estoque de pendências: lista curta e nova vale mais que lista cheia.
   - Se o arquivo de hoje não existe, crie com \`# Tarefas de <dia da semana>, DD/MM\` e uma linha em branco. Do arquivo mais recente de \`tarefas/\`, traga as linhas ainda não marcadas cujo item continua não marcado em "Precisa de você" do plano, junto com as linhas de recuo logo abaixo (Conferido, Adiado). As outras ficaram velhas: não traga.
   - Adiadas: uma tarefa com a linha \`  - Adiado até AAAA-MM-DD\` abaixo dela foi adiada ${deNome().replace(/^de /, 'por ')}. Traga-a sempre com essa linha, sem mexer, e não crie outra tarefa do mesmo plano sobre o mesmo assunto enquanto a data não chegar. Ela não conta no teto.
   - Paradas: se uma tarefa aberta (sem Adiado) já apareceu em 3 arquivos de dias diferentes e nada mudou no assunto (mesmo estado do PR, sem resposta nova), não a repita como está: acrescente abaixo dela \`  - Adiado até <a próxima segunda-feira> · parada há N dias\`. Ela volta sozinha na segunda, numa revisão só.
   - Novas: escolha no máximo 5 itens de "Precisa de você" dos planos ativos, e só os que são novos ou mudaram desde ontem (PR mergeado, resposta que chegou, prazo que encostou, bloqueio que saiu). Ordem: primeiro o que trava a IA (Aprovar, Decidir, Acesso), depois Testar no app, Cobrar e Mensagem. Se nada mudou, não acrescente nada: uma lista com 3 tarefas é um bom resultado.
   - Teto: no máximo 7 tarefas abertas sem Adiado no arquivo. Se passar, adie as mais antigas para a próxima segunda, como as paradas.
   - Não entra: item vago ou que aponta para outro lugar ("as decisões em aberto abaixo"); "Decidir" que depende de outra pessoa (isso é Cobrar ou Mensagem); decisão já tomada; e um segundo item sobre o mesmo PR, bug ou decisão que já está no arquivo por outro plano (um assunto, uma tarefa: fica a do plano principal). Se o item do plano tem um desses problemas, corrija-o primeiro no "Precisa de você" do plano e use o texto corrigido.
   - Pule o que já está no arquivo (mesmo plano e mesmo texto) e o que já está marcado.
   - Uma linha por item, com o texto exatamente igual ao do plano, tipo incluído, e o id do cabeçalho do plano: \`- [ ] Aprovar: fazer merge de acme/api#14 <!-- plano: api-auditoria -->\`. O texto igual é o que liga as duas listas: marcar a tarefa marca o item no plano.
   - Nunca desmarque nem apague linhas que já estão no arquivo, nem as linhas Adiado; na rodada da tarde, só acrescente (tarefas novas ou a linha Adiado das paradas).
2. Commit único: \`git -C ${root} add -A && git -C ${root} commit -m "investigador: N planos conferidos"\` (só se houve mudança). Se houver remoto configurado, \`git -C ${root} push\`.
3. Atualize a lista do dia: \`${PLANOS} hoje --escrever --silencioso\`.
4. Responda com no máximo 8 linhas: quantos planos conferiu, fases que marcou como feitas (com a evidência) e quantas tarefas do dia você acrescentou. Não repita a lista de tarefas (ela está no app). Se algum repositório não foi encontrado ou o gh falhou, diga qual.`,
  },
  {
    id: 'planos-lista-do-dia',
    get titulo() {
      return t('Letco: lista do dia', 'Letco: daily list')
    },
    get descricao() {
      return t('Atualiza hoje.md nos dias úteis e entrega o resumo (8h40 a lista completa; 12h40 e 16h40 só novidades).', 'Updates hoje.md on weekdays and delivers the overview (8:40 the full list; 12:40 and 16:40 only what is new).')
    },
    cron: '40 8,12,16 * * 1-5',
    get quando() {
      return t('dias úteis às 8h40, 12h40 e 16h40', 'weekdays at 8:40, 12:40 and 16:40')
    },
    padrao: true,
    texto: (root) => {
      const h = hojeSecoes()
      return `Você é a "escuta" do sistema de planejamentos ${deNome()}. ${idiomaRegra()} Sem jargão.

Os planos moram em ${root} (Markdown + git). A lista do dia fica em ${root}/hoje.md. Existe o comando de terminal \`planos\` (em ${PLANOS}).

Passos:

1. Rode \`date +%H\` para saber a hora local.
2. ${falta(root)}
3. Atualize a lista: rode \`${PLANOS} hoje --escrever --silencioso\` (se o comando falhar, siga com o hoje.md que já existe). Depois leia ${root}/hoje.md.
4. Rodada da manhã (antes de 12h): entregue a lista do dia em até ~15 linhas, nesta ordem e omitindo seções vazias: ${h.tarefas} (o que o investigador escolheu para hoje), ${h.prazos}, ${h.fazer}, ${h.cobrar}, ${h.decidir}, ${h.atualizacao}. Mantenha os nomes de projeto e plano como estão no arquivo. Termine com uma linha dizendo quantas decisões ficaram de fora, se houver.
5. Rodadas de 12h40 e 16h40: compare o hoje.md atual com a cópia salva em ${root}/.indice/escuta-anterior.md (se existir). Entregue só o que é novo: itens que apareceram em ${h.tarefas}, ${h.prazos}, ${h.fazer}, ${h.cobrar} ou ${h.decidir}, e as linhas novas de "${h.novidades}". Se não houver nada novo, responda apenas "${t('Sem novidades.', 'Nothing new.')}" e não envie notificação.
6. Em todas as rodadas, ao final, copie o hoje.md atual para ${root}/.indice/escuta-anterior.md (crie a pasta .indice se faltar). Essa é a única escrita permitida além do que o comando \`planos\` faz.
7. Se houver algo a entregar e a ferramenta PushNotification estiver disponível, envie uma notificação de uma linha (até 200 caracteres) com o mais importante: prazo vencendo primeiro, senão o primeiro item de "${h.fazer}" e a contagem de decisões.

Limites: nunca envie mensagens a terceiros, nunca apague arquivos, não altere planos (sem marcar fases, mudar status ou editar plano.md). Se ${nome()} quiser agir, usa o app Letco ou o comando \`planos\`.`
    },
  },
  {
    id: 'planos-resumo-do-dia',
    get titulo() {
      return t('Letco: resumo do dia', 'Letco: daily summary')
    },
    get descricao() {
      return t('Escreve o resumo do dia (o que foi feito, decisões, produtividade, para amanhã) em resumos/ e avisa no Mac.', 'Writes the daily summary (what got done, decisions, productivity, for tomorrow) in resumos/ and notifies you on the Mac.')
    },
    cron: '0 19 * * *',
    get quando() {
      return t('todos os dias às 19h', 'every day at 19:00')
    },
    padrao: true,
    texto: (root) => `Você é a rotina de resumo do dia do sistema de planejamentos ${deNome()}. ${idiomaRegra()}

Os planos moram em ${root} (Markdown + git). Os resumos ficam em ${root}/resumos/AAAA-MM-DD.md e aparecem na tela Resumos do app Letco.

1. ${falta(root)}
2. Rode \`${PLANOS} resumo\`. Ele junta os fatos de hoje: tarefas do dia feitas e abertas, mudanças nos planos (commits em ${root}), linhas do Log com a data de hoje, conversas do dia e o que ${nome()} fez no GitHub (PRs abertos, mergeados e revisados, commits). Depois imprime os números do dia e o pedido de escrita, com o formato do arquivo.
3. Se ele disser "${t('Nada feito em <data>: sem resumo.', 'Nothing done on <date>: no summary.')}", responda só isso e pare.
4. Siga o pedido impresso exatamente: escreva ${root}/resumos/<hoje>.md com o cabeçalho de números copiado como está, e termine com \`${PLANOS} resumo --pronto <hoje>\` (faz o commit e avisa no Mac).
5. Se o comando falhar, diga o erro em uma linha e pare.

Limites: só escreva o arquivo do resumo; não mexa em planos, tarefas nem repositórios de código; nunca envie mensagem a ninguém; nunca apague arquivos; não invente números, PRs nem conquistas que não estejam nos fatos.

Ao final, responda em 1 linha com a frase do resumo.`,
  },
  {
    id: 'planos-discord',
    titulo: 'Letco: Discord',
    get descricao() {
      return t('Lê as mensagens novas dos canais do Discord configurados no app e tira delas tarefas do dia, cobranças e decisões.', 'Reads new messages from the Discord channels set up in the app and turns them into today\'s tasks, follow-ups and decisions.')
    },
    cron: '50 7 * * 1-5',
    get quando() {
      return t('dias úteis às 7h50', 'weekdays at 7:50')
    },
    padrao: false,
    texto: (root) => `Você é a leitura do Discord do sistema de planejamentos ${deNome()}. ${idiomaRegra()}

Os planos moram em ${root} (Markdown + git). Os canais acompanhados estão em ${root}/discord/canais.yaml; o token da conta do Discord está no Keychain do Mac e só o comando \`planos\` o usa.

1. ${falta(root)}
2. Rode \`${PLANOS} discord --ler\`. Ele busca só as mensagens novas de cada canal, grava cada canal num arquivo em ${root}/.indice/conversas/ (fora do git) e imprime, para cada canal com novidade, um pedido de extração entre linhas "=== #canal ===".
3. Siga cada pedido impresso, um canal por vez, exatamente como está escrito: tarefas ${deNome()} em ${root}/tarefas/<hoje>.md, cobranças em "Pessoas e cobranças" do plano do assunto, decisões no Log, resumo em ${root}/projetos/<projeto>/conversas/<hoje>.md, cada item com o link da mensagem, e commit em ${root}.
4. Se ele disser que não há mensagens novas, responda só "${t('Sem novidades no Discord.', 'Nothing new on Discord.')}" e pare.
5. Se o comando falhar (sem canal configurado, sem token, token recusado, canal sem acesso), diga o erro em uma linha e pare. Não tente outro jeito de ler o Discord.

Limites: nunca escreva, reaja ou envie nada no Discord; nunca mostre, copie ou grave o token; não copie mensagens inteiras para os planos (só o necessário para a ação); nunca envie mensagens a ninguém; nunca apague arquivos.

Ao final, em até 6 linhas: quantas mensagens leu por canal, tarefas do dia que entraram, cobranças (de quem) e o que ficou sem lugar.`,
  },
  {
    id: 'planos-divulgacao',
    get titulo() {
      return t('Letco: divulgação', 'Letco: promotion')
    },
    get descricao() {
      return t('Confere a branch de cada campanha de divulgacao/campanhas.yaml e monta, com prints e assets reais, o post de cada novidade.', 'Checks the branch of each campaign in divulgacao/campanhas.yaml and builds a post for each new feature, with real screenshots and assets.')
    },
    cron: '0 9,13,17 * * 1-5',
    get quando() {
      return t('dias úteis às 9h, 13h e 17h', 'weekdays at 9:00, 13:00 and 17:00')
    },
    padrao: false,
    texto: (root) => `Você é a rotina de divulgação do sistema de planejamentos ${deNome()}. ${idiomaRegra()}

Os planos moram em ${root} (Markdown + git). As campanhas acompanhadas estão em ${root}/divulgacao/campanhas.yaml; cada post fica numa pasta ${root}/divulgacao/<campanha>/<AAAA-MM-DD>-<sha7>/ e aparece na aba Divulgação do app Letco.

1. ${falta(root)} Se ${root}/divulgacao/campanhas.yaml não existir, responda só "${t('Nenhuma campanha configurada', 'No campaigns set up')}" e pare. Confirme que \`gh auth status\` está ok; se não estiver, diga que o gh precisa de login e pare.
2. Rode \`${PLANOS} divulgar --verificar\`. Ele confere a branch de cada campanha desde a última verificação, pula só os PRs que já têm post e separa os outros por categoria: novidades e correções viram post, cada uma no seu; manutenção (ci, docs, dependências, merges entre branches) fica de fora. Cria a pasta de cada post (status gerando) e imprime um pedido de geração para cada post a montar, entre linhas "=== … ===" (inclusive os que ficaram de uma rodada anterior).
3. Siga cada pedido impresso, um post por vez, exatamente como está escrito: montar a imagem na forma da categoria (com screenshot real, logo e ícones reais e layout em HTML), sem descartar o post nem deixar PR de fora, escrever legenda.md e post.md, e terminar com \`planos divulgar --pronto <pasta>\` (que faz o commit e avisa no Mac). As regras de cada campanha (o que não citar, onde estão os assets) vêm no pedido.
4. Se ele disser "${t('Nenhum post para montar', 'No posts to build')}", responda só a primeira parte da saída (o que entrou em cada campanha) e pare.
5. Se o comando falhar, diga o erro em uma linha e pare.

Limites: nunca poste, envie ou publique nada em lugar nenhum (${nome()} posta com a própria conta); nos repositórios de código, só leitura (nada de commit, push ou troca de branch; worktree temporário só em diretório temporário, removido ao final); nunca apague arquivos ${deNome()}; nunca aceite termos, avisos ou disclaimers de sites (só esconda na cópia da página).

Ao final, em até 4 linhas: o que entrou em cada campanha, os posts prontos para postar e os descartados (com o motivo).`,
  },
]

export const rotina = (id: string) => ROTINAS.find((r) => r.id === id || r.id === `planos-${id}`)

/** pedido para o Claude do app criar as tarefas agendadas (o texto completo de cada uma sai de `planos rotina <id>`) */
/** corpo de um SKILL.md de tarefa agendada (sem o cabeçalho), para comparar com o texto desta versão */
export const corpoSkill = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()

/** rotinas instaladas cujo texto é diferente do que esta versão do app gera */
export function rotinasDesatualizadas(root: string, instaladas: [string, string][]) {
  const map = new Map(instaladas)
  return ROTINAS.filter((r) => map.has(r.id) && corpoSkill(map.get(r.id)!) !== r.texto(root).trim())
}

/** pedido para o Claude do app trocar o texto das rotinas já instaladas pelo desta versão (mantém horário e estado) */
export function rotinasAtualizarPrompt(root: string, ids: string[]) {
  const lista = ROTINAS.filter((r) => ids.includes(r.id))
  return [
    `Atualize as rotinas do Letco que já existem como tarefas agendadas do app do Claude. A pasta dos planos é ${root}.`,
    '',
    'Para cada rotina abaixo:',
    `1. Rode \`${PLANOS} rotina <id>\` e use a saída inteira, sem mudar nada, como o novo prompt da tarefa.`,
    '2. Atualize a tarefa com a sua ferramenta de tarefas agendadas (update_scheduled_task): troque só o prompt, o título e a descrição. Não mude o horário nem ligue ou desligue a tarefa.',
    '3. Se a tarefa não existir, não crie: diga que ela não existe.',
    '',
    ...lista.map((r) => `- ${r.id} · "${r.titulo}" · ${r.descricao}`),
    '',
    'Antes de trocar, se o prompt atual de alguma tiver regras que o novo não tem (algo escrito à mão), mostre a diferença em 1 ou 2 linhas e pergunte se pode trocar.',
    `${idiomaRegra()} Não mexa em nenhum outro arquivo.`,
  ].join('\n')
}

export function rotinasInstalarPrompt(root: string, ids: string[]) {
  const lista = ROTINAS.filter((r) => ids.includes(r.id))
  return [
    `Crie as rotinas do Letco como tarefas agendadas do app do Claude, para ${nome()}. A pasta dos planos é ${root}.`,
    '',
    'Para cada rotina abaixo:',
    `1. Rode \`${PLANOS} rotina <id>\` e use a saída inteira, sem mudar nada, como o prompt da tarefa.`,
    '2. Crie a tarefa agendada com a sua ferramenta de tarefas agendadas (create_scheduled_task): o id como taskId, o título, a descrição e o cron abaixo, com a pasta de trabalho ' + root + '.',
    '3. Se já existir uma tarefa com esse id, não crie outra: diga que ela já existe.',
    '',
    ...lista.map((r) => `- ${r.id} · "${r.titulo}" · cron \`${r.cron}\` (${r.quando}) · ${r.descricao}`),
    '',
    'Depois, pergunte se quero rodar cada uma agora, uma vez, para aprovar as permissões que ela pede (comando planos, gh e edição em ' + root + '); sem essa aprovação, a rodada agendada pode parar esperando.',
    'Se a ferramenta de tarefas agendadas não estiver disponível nesta sessão, diga isso e mostre como criar pela tela de tarefas agendadas do app do Claude, com os mesmos dados.',
    `${idiomaRegra()} Não mexa em nenhum outro arquivo.`,
  ].join('\n')
}
