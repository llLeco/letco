import { dump } from 'js-yaml'
import { splitFrontmatter } from './plan'
import { t } from './i18n'
import { CATEGORIAS, type Categoria } from './divulgar'

export const categoriaLabel = (c: Categoria) => ({ novidade: t('Novidade', 'New'), correcao: t('Correções', 'Fixes'), manutencao: t('Manutenção', 'Maintenance') })[c]

/**
 * Posts de divulgação: ~/planos/divulgacao/<campanha>/<AAAA-MM-DD>-<sha7>/
 *   imagem.png  · a arte
 *   legenda.md  · o texto, com uma seção por idioma (## EN, ## PT)
 *   post.md     · cabeçalho com titulo, status (gerando | pendente | postado | descartado), postado_em, prs, sha,
 *                 ambiente (develop | producao) e em_producao (data em que a novidade chegou à branch de produção)
 * O usuário copia imagem e texto no app e posta com a própria conta.
 */
export interface PostRaw {
  dir: string
  campaign: string
  folder: string
  image: string | null
  legenda: string | null
  post: string | null
  mtime: number
}

export type PostStatus = 'gerando' | 'pendente' | 'postado' | 'descartado'

export interface Post extends PostRaw {
  titulo: string
  status: PostStatus
  postadoEm?: string
  /** novidade, correção ou manutenção (post antigo, sem o campo, conta como novidade) */
  categoria: Categoria
  /** onde a novidade está: só na branch acompanhada (develop) ou já na de produção; vazio se ainda não foi conferido */
  ambiente?: 'develop' | 'producao'
  /** data em que a verificação viu a novidade na branch de produção */
  emProducao?: string
  /** nomes das branches, para o texto do selo */
  branch?: string
  producaoBranch?: string
  date?: string
  textos: { lang: string; text: string }[]
}

/** nome da campanha para a tela: o `nome` dela em campanhas.yaml (quando a tela já leu), senão o slug com espaços */
export const campaignLabel = (c: string, nomes?: Record<string, string>) => nomes?.[c] ?? c.replace(/-/g, ' ')

export function parsePost(raw: PostRaw): Post {
  const { data } = splitFrontmatter(raw.post ?? '')
  const status = (['gerando', 'pendente', 'postado', 'descartado'] as const).find((s) => s === data.status) ?? 'pendente'
  const textos: Post['textos'] = []
  const leg = (raw.legenda ?? '').trim()
  const parts = leg.split(/^##\s+(.+)$/m)
  if (parts.length > 1) for (let i = 1; i < parts.length; i += 2) textos.push({ lang: parts[i].trim(), text: (parts[i + 1] ?? '').trim() })
  else if (leg) textos.push({ lang: t('Texto', 'Text'), text: leg })
  return {
    ...raw,
    titulo: String(data.titulo ?? raw.folder),
    status,
    categoria: CATEGORIAS.find((k) => k === data.categoria) ?? 'novidade',
    postadoEm: data.postado_em ? String(data.postado_em) : undefined,
    ambiente: data.ambiente === 'producao' || data.ambiente === 'develop' ? data.ambiente : undefined,
    emProducao: data.em_producao ? String(data.em_producao).slice(0, 10) : undefined,
    branch: data.branch ? String(data.branch) : undefined,
    producaoBranch: data.producao_branch ? String(data.producao_branch) : undefined,
    date: raw.folder.match(/^\d{4}-\d{2}-\d{2}/)?.[0],
    textos,
  }
}

/** novo post.md com o status trocado (mantém o resto do cabeçalho e o corpo) */
export function withStatus(p: Post, status: PostStatus, today: string) {
  const { data, body } = splitFrontmatter(p.post ?? '')
  const next: Record<string, unknown> = { titulo: p.titulo, ...data, status }
  if (status === 'postado') next.postado_em = today
  else delete next.postado_em
  return `---\n${dump(next, { lineWidth: -1 })}---\n${body.startsWith('\n') ? body : `\n${body}`}`
}
