import type { Usuario } from './types'

/**
 * Quem usa o app (`usuario` em projetos.yaml): o nome entra nos pedidos à IA ("Ana decide", "tarefas de Ana").
 * O store e a CLI chamam setUsuario depois de ler o projetos.yaml; sem perfil, os pedidos falam "o usuário".
 */
let atual: { nome: string; apelidos: string[] } = { nome: '', apelidos: [] }

export function setUsuario(u?: Usuario) {
  atual = { nome: u?.nome?.trim() ?? '', apelidos: (u?.apelidos ?? []).map((a) => String(a).trim()).filter(Boolean) }
}

/** nome no meio da frase */
export const nome = () => atual.nome || 'o usuário'

/** nome no começo da frase */
export const Nome = () => atual.nome || 'O usuário'

/** "de Ana" / "do usuário" */
export const deNome = () => (atual.nome ? `de ${atual.nome}` : 'do usuário')

export const apelidos = () => atual.apelidos

/** "Ana, Ana Souza ou anasouza": como a pessoa pode aparecer numa conversa */
export function comoAparece() {
  const all = [atual.nome, ...atual.apelidos].filter(Boolean)
  if (!all.length) return ''
  return all.length === 1 ? all[0] : `${all.slice(0, -1).join(', ')} ou ${all[all.length - 1]}`
}

/** `responsavel` do cabeçalho de um plano novo: o nome em minúsculas, sem acento (sem perfil, fica de fora) */
export function apelidoUsuario() {
  const n = atual.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0]
  return n || undefined
}

/** o `responsavel` de um plano é quem usa o app? (compara com o nome e os apelidos, sem acento nem maiúsculas) */
export function souEu(responsavel?: string) {
  if (!responsavel) return false
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const r = norm(responsavel)
  return [atual.nome, ...atual.apelidos].filter(Boolean).some((n) => norm(n) === r || norm(n).split(/\s+/)[0] === r)
}
