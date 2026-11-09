import { splitFrontmatter } from './plan'
import { deNome } from './usuario'
import { idiomaRegra, isEn, t } from './i18n'

/**
 * Resumo do dia: `planos resumo` junta os fatos do dia (tarefas, commits em ~/planos, Log dos planos, GitHub)
 * e imprime o pedido; o agente da rotina das 19h escreve resumos/AAAA-MM-DD.md e roda `planos resumo --pronto`.
 */
export const RESUMOS_DIR = 'resumos'

/** números do dia, gravados no cabeçalho do resumo (o app mostra e compara com os dias anteriores) */
export interface Metricas {
  tarefas_feitas: number
  tarefas_total: number
  fases: number
  decisoes: number
  prs_mergeados: number
  prs_abertos: number
  revisoes: number
  commits: number
}

const metrica = (key: keyof Metricas, pt: string, en: string) => ({
  key,
  get label() {
    return t(pt, en)
  },
})

/** rótulos no idioma do app (getter: lido na hora de mostrar) */
export const METRICAS: { key: keyof Metricas; label: string }[] = [
  metrica('tarefas_feitas', 'tarefas', 'tasks'),
  metrica('fases', 'fases', 'phases'),
  metrica('decisoes', 'decisões', 'decisions'),
  metrica('prs_mergeados', 'PRs mergeados', 'PRs merged'),
  metrica('prs_abertos', 'PRs abertos', 'PRs opened'),
  metrica('revisoes', 'revisões', 'reviews'),
  metrica('commits', 'commits', 'commits'),
]

export interface Resumo {
  date: string
  metricas: Partial<Metricas>
  /** linha "**Em uma frase:** …" */
  frase?: string
  body: string
}

export function parseResumo(file: string, raw: string): Resumo {
  const { data, body } = splitFrontmatter(raw)
  const metricas: Partial<Metricas> = {}
  for (const { key } of [...METRICAS, { key: 'tarefas_total' as const }]) {
    const n = Number(data[key])
    if (Number.isFinite(n) && data[key] !== undefined && data[key] !== '') metricas[key] = n
  }
  const frase = body.match(/^\*\*Em uma frase:\*\*\s*(.+)$/m)?.[1]?.trim()
  return { date: String(data.data ?? file.replace(/\.md$/, '')), metricas, frase, body: body.replace(/^\s*#\s+.*\n/, '').trim() }
}

export function metricasYaml(m: Metricas) {
  return Object.entries(m)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

/** pedido para o agente escrever o resumo a partir dos fatos impressos por `planos resumo` */
export function resumoPrompt(o: { root: string; date: string; diaLabel: string; fatos: string; metricas: Metricas; anteriores: Resumo[] }) {
  const file = `${o.root}/${RESUMOS_DIR}/${o.date}.md`
  const hist = o.anteriores.length
    ? o.anteriores.map((r) => `- ${r.date}: ${METRICAS.map(({ key, label }) => `${r.metricas[key] ?? 0} ${label}`).join(', ')}`).join('\n')
    : '(nenhum resumo anterior ainda)'
  // títulos das seções no idioma do app; "**Em uma frase:**" e o cabeçalho ficam como estão (o app lê por eles)
  const sec = isEn()
    ? { titulo: `# Summary for ${o.diaLabel}`, prod: '## Productivity', feito: '## What got done', projeto: '### <Project>', dec: '## Decisions', travado: '## Blocked or waiting on someone', amanha: '## For tomorrow' }
    : { titulo: `# Resumo de ${o.diaLabel}`, prod: '## Produtividade', feito: '## O que foi feito', projeto: '### <Projeto>', dec: '## Decisões', travado: '## Travado ou esperando alguém', amanha: '## Para amanhã' }
  return [
    `Escreva o resumo do dia ${o.date} ${deNome()} em ${file}, curto e em palavras simples. ${idiomaRegra()}`,
    'Use só os fatos abaixo e o que você conferir nos arquivos citados (planos, conversas do dia). Não invente números, PRs nem conquistas; se algo não está claro, deixe de fora.',
    '',
    '## Fatos do dia',
    o.fatos,
    '',
    '## Números dos dias anteriores (para comparar)',
    hist,
    '',
    '## Formato do arquivo (copie o cabeçalho exatamente)',
    '```',
    '---',
    `data: ${o.date}`,
    metricasYaml(o.metricas),
    '---',
    sec.titulo,
    '',
    '**Em uma frase:** <o dia em até 20 palavras: o que andou de mais importante>',
    '',
    sec.prod,
    '<2 ou 3 linhas: os números do dia comparados com os dias anteriores, em quais projetos foi o tempo, o que rendeu e o que travou. Sem elogio vazio.>',
    '',
    sec.feito,
    sec.projeto,
    '- <entrega concreta, com o PR (dono/repo#n) ou o id do plano quando houver>',
    '',
    sec.dec,
    '- <decisão tomada hoje e onde ficou registrada> (omita a seção se não houve)',
    '',
    sec.travado,
    '- <o que ficou parado, por quê e de quem depende> (omita se nada)',
    '',
    sec.amanha,
    '- <até 3 itens, do mais importante: tarefas abertas, cobranças, "Precisa de você" dos planos>',
    '```',
    '',
    'Agrupe por projeto, juntando itens repetidos (o mesmo PR citado em commit, Log e GitHub é uma coisa só). Commits de rotina (lista do dia, investigador, leitura do Discord) não contam como trabalho feito.',
    `Ao terminar, rode \`planos resumo --pronto ${o.date}\`: faz o commit e avisa no Mac.`,
    'Limites: só escreva esse arquivo; nada de mexer em planos, tarefas ou repositórios de código; nunca envie mensagem a ninguém.',
  ].join('\n')
}

/** pedido do botão "Gerar agora" da tela Resumos, para o agente do Console */
export function resumoConsolePrompt(root: string, date: string) {
  return [
    `Gere o resumo do dia ${date}: rode \`planos resumo --data ${date}\` em ${root}.`,
    'Ele junta os fatos do dia (tarefas, mudanças nos planos, GitHub) e imprime o pedido de escrita: siga-o exatamente. Se ele disser que não houve atividade, responda só isso.',
    'Ao final, responda em 1 linha com a frase do resumo.',
    idiomaRegra(),
  ].join('\n')
}
