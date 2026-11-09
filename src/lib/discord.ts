import { dump, load } from 'js-yaml'

/**
 * Canais do Discord que a rotina lê: ~/planos/discord/canais.yaml (sem segredos; o token fica no Keychain).
 * A leitura é do comando `planos discord --ler`, que grava as mensagens novas em ~/planos/.indice/conversas/
 * (fora do git) e imprime o pedido de extração para o Claude.
 */
export interface DiscordCanal {
  id: string
  nome: string
  projeto: string
}

export const DISCORD_FILE = 'discord/canais.yaml'
export const KEYCHAIN_SERVICE = 'dev.leco.planos.discord'

export function parseCanais(raw?: string | null): DiscordCanal[] {
  if (!raw) return []
  try {
    const data = load(raw) as { canais?: Partial<DiscordCanal>[] } | null
    return (data?.canais ?? [])
      .map((c) => ({ id: String(c.id ?? '').trim(), nome: String(c.nome ?? '').trim(), projeto: String(c.projeto ?? '').trim() }))
      .filter((c) => /^\d{15,25}$/.test(c.id))
  } catch {
    return []
  }
}

export function canaisYaml(canais: DiscordCanal[]) {
  return (
    '# Canais do Discord que o Letco lê uma vez por dia (só leitura).\n' +
    '# O token fica no Keychain (Ajustes → Discord), nunca aqui.\n' +
    dump({ canais: canais.map((c) => ({ id: c.id, nome: c.nome || c.id, projeto: c.projeto })) }, { lineWidth: -1 })
  )
}

/** link de uma mensagem: https://discord.com/channels/<servidor|@me>/<canal>/<mensagem> */
export const DISCORD_MSG_RE = /https:\/\/discord\.com\/channels\/(?:@me|\d+)\/(\d+)\/(\d+)/

/** canal e hora da mensagem citada no texto (a hora sai do próprio id do Discord) */
export function discordRef(text: string) {
  const m = text.match(DISCORD_MSG_RE)
  if (!m) return undefined
  const at = Number((BigInt(m[2]) >> 22n) + 1420070400000n)
  return { channel: m[1], message: m[2], url: m[0], at }
}
