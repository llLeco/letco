/**
 * Conferência do revisor: uma linha logo abaixo do item (tarefa do dia ou cobrança),
 * dizendo se aquilo já foi feito, com a evidência que ele achou no GitHub ou nos clones locais.
 *
 *   - [ ] Cobrar: Rui, publicar os pacotes … <!-- plano: … -->
 *     - Conferido 2026-10-28 · ainda pendente: `npm view @acme/sdk version` responde 2.2.0
 *
 * Travado por outro plano: `- Conferido 2026-10-29 · bloqueado por acme-wallet-login: <por quê>`.
 */
export type ConferidoStatus = 'feito' | 'parcial' | 'pendente' | 'bloqueado'

export interface Conferido {
  date: string
  status: ConferidoStatus
  text: string
  /** id do plano que trava o item (status `bloqueado`) */
  blockedBy?: string
}

const RE = /^\s+[-*]\s+Conferido\s+(\d{4}-\d{2}-\d{2})\s*[·-]\s*(já feito|feito|em parte|parcial|ainda pendente|pendente|bloqueado(?:\s+por\s+`?([\w.-]+)`?)?)\s*:\s*(.*)$/i

export function parseConferido(line: string | undefined): Conferido | undefined {
  const m = line?.match(RE)
  if (!m) return undefined
  const s = m[2].toLowerCase()
  if (s.startsWith('bloqueado')) return { date: m[1], status: 'bloqueado', text: m[4].trim(), blockedBy: m[3] }
  const status: ConferidoStatus = s.includes('feito') ? 'feito' : s.includes('parte') || s === 'parcial' ? 'parcial' : 'pendente'
  return { date: m[1], status, text: m[4].trim() }
}

/** a conferência mais recente nas linhas logo depois do item */
export function conferidoAfter(lines: string[], line: number): Conferido | undefined {
  let last: Conferido | undefined
  for (let i = line + 1; i < lines.length; i++) {
    const c = parseConferido(lines[i])
    if (!c) break
    if (!last || c.date >= last.date) last = c
  }
  return last
}
