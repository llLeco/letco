/**
 * Id de plano citado no texto (ex.: "plano acme-wallet-login", com ou sem crases) vira link `#plano/<id>`,
 * que o Markdown mostra como botão com o título do plano. Só ids com hífen, para não pegar palavras comuns;
 * links, URLs e comentários HTML ficam como estão.
 */
export const PLAN_HREF = '#plano/'

const SKIP = /(<!--[\s\S]*?-->|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)/

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function planLinker(ids: string[], self?: string) {
  const list = ids.filter((id) => id.includes('-') && id !== self).sort((a, b) => b.length - a.length)
  if (!list.length) return (md: string) => md
  const re = new RegExp(`(?<![\\w/.#-])\`?(${list.map(esc).join('|')})\`?(?![\\w/-])`, 'g')
  return (md: string) =>
    md
      .split(SKIP)
      .map((part, i) => (i % 2 ? part : part.replace(re, (_, id: string) => `[${id}](${PLAN_HREF}${id})`)))
      .join('')
}
