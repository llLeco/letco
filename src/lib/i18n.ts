import { enUS, ptBR } from 'date-fns/locale'
import type { Idioma } from './types'

/**
 * Idioma do app (`usuario.idioma` em projetos.yaml): telas, comando planos e respostas da IA.
 * Os marcadores dentro dos arquivos (## Para você, Conferido, # Tarefas de…) ficam sempre em português,
 * porque é por eles que o app lê os planos; na tela, aparecem traduzidos.
 * O store e a CLI chamam setLang depois de ler o projetos.yaml.
 */
let lang: Idioma = 'pt-BR'

export function setLang(l?: Idioma) {
  lang = l === 'en' ? 'en' : 'pt-BR'
}

export const getLang = () => lang
export const isEn = () => lang === 'en'

/** texto nas duas línguas, lado a lado: t('Hoje', 'Today'). Chame na hora de mostrar, nunca no topo de um módulo. */
export const t = (pt: string, en: string) => (lang === 'en' ? en : pt)

/** locale do date-fns no idioma do app */
export const dfLocale = () => (lang === 'en' ? enUS : ptBR)

/** idioma do sistema, para a primeira vez (antes de existir projetos.yaml) */
export function idiomaDoSistema(): Idioma {
  const n = typeof navigator !== 'undefined' ? navigator.language : 'pt-BR'
  return /^pt/i.test(n) ? 'pt-BR' : 'en'
}

export const LANG_LABEL: Record<Idioma, string> = { 'pt-BR': 'Português', en: 'English' }

/**
 * Regra de idioma para os pedidos à IA (rotinas, Console, botões). Em inglês, o conteúdo sai em inglês,
 * mas os marcadores que o app lê continuam exatamente em português.
 */
export function idiomaRegra() {
  if (lang !== 'en') return 'Responda em português, curto.'
  return [
    'Answer in English, briefly. Everything you write for the user (answers, plan text, tasks, summaries) is in English.',
    'Exception: keep these fixed markers exactly as they are, in Portuguese, because the Letco app reads files by them: section titles (## Para você, ## Objetivo, ## Fases, ## Decisões em aberto, ## Pessoas e cobranças, ## Log), the labels **Do que se trata:**, **Como está:**, **Precisa de você:**, **Conferido:**, **Em uma frase:**, the item types at the start of a line (Continuar, Testar no app, Decidir, Mensagem, Cobrar, Aprovar, Revisar, Acesso, Arquivar), the words of the Conferido line (já feito, em parte, ainda pendente, bloqueado por), the "# Tarefas de" title and the header fields (status, prioridade…) with their values.',
  ].join(' ')
}
