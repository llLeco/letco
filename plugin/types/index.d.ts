export type Tarefa = {
  texto: string
  tipo: string
  isFeita: boolean
  adiadaAte: string | null
}

export type Dia = {
  data: string
  isEn: boolean
  hasArquivo: boolean
  tarefas: Tarefa[]
}

declare module 'claude-code' {
  interface PluginState {
    letco: { isHidden: boolean; dia: Shaped<Dia> }
  }
}
