import { CORE_SCHEMA, load } from 'js-yaml'
import type { Idioma } from './types'
import { emIdioma } from './prompt'
import { deNome } from './usuario'
import { idiomaRegra, isEn, t } from './i18n'

/**
 * Divulgação automática: `planos divulgar --verificar` lê a branch de cada campanha (`branch`, por padrão master) (divulgacao/campanhas.yaml),
 * cria a pasta do post com status `gerando` e imprime o pedido de geração; o agente monta imagem e legenda
 * com material real e roda `planos divulgar --pronto <pasta>`, que passa o post para `pendente` e avisa no Mac.
 */
export const CAMPANHAS_FILE = 'divulgacao/campanhas.yaml'
export const DIVULGAR_STATE_DIR = '.indice/divulgacao'

export interface Campanha {
  slug: string
  nome: string
  repo: string
  branch: string
  /** branch que está no ar para os usuários (padrão master); os posts dizem se a novidade já chegou nela */
  producao: string
  clone?: string
  plano?: string
  regras: string
}

export function parseCampanhas(yaml: string | null): Campanha[] {
  if (!yaml) return []
  let raw: unknown
  try {
    raw = load(yaml, { schema: CORE_SCHEMA })
  } catch {
    return []
  }
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw as Record<string, Record<string, unknown>>)
    .filter(([, v]) => v && typeof v === 'object' && typeof v.repo === 'string')
    .map(([slug, v]) => ({
      slug,
      nome: String(v.nome ?? slug),
      repo: String(v.repo),
      branch: String(v.branch ?? 'master'),
      producao: String(v.producao ?? 'master'),
      clone: v.clone ? String(v.clone) : undefined,
      plano: v.plano ? String(v.plano) : undefined,
      regras: String(v.regras ?? '').trim(),
    }))
}

export interface PrInfo {
  number: number
  title: string
  body: string
  url: string
  mergedAt: string
  author: string
  files: string[]
}

/** PR que nunca vira post: ci, docs, testes, dependências, refactor e afins (pelo título ou porque só mexe nesses arquivos) */
export function ruido(pr: Pick<PrInfo, 'title' | 'files'>): string | null {
  const title = pr.title.trim()
  if (/^(ci|docs?|chore|build|test|tests|style|refactor|revert)(\([^)]*\))?!?:/i.test(title)) return title.split(':')[0].toLowerCase()
  if (/^(bump|update dependencies|deps|release|version)\b/i.test(title) || /dependabot|renovate/i.test(title)) return t('dependências/versão', 'dependencies/version')
  const meta = (f: string) =>
    /^\.github\/|^docs?\/|\.md$|(^|\/)(test|tests|__tests__|e2e)\/|\.(spec|test)\.[jt]sx?$|(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$|^\.(changeset|husky)\//.test(f)
  if (pr.files.length && pr.files.every(meta)) return t('só docs/ci/testes', 'docs/ci/tests only')
  return null
}

export function prMarkdown(c: Campanha, prs: PrInfo[]) {
  return [
    `# Novidades na ${c.branch} de ${c.repo}`,
    '',
    ...prs.flatMap((p) => [
      `## #${p.number} ${p.title}`,
      '',
      `- Link: ${p.url}`,
      `- Mergeado em ${p.mergedAt.slice(0, 10)} por @${p.author}`,
      `- Arquivos (${p.files.length}): ${p.files.slice(0, 60).join(', ')}${p.files.length > 60 ? ', …' : ''}`,
      '',
      (p.body || '(sem descrição)').trim(),
      '',
    ]),
  ].join('\n')
}

/** Pedido para o agente montar um post (imprime o comando, segue a rotina ou o Console). */
export function gerarPostPrompt(o: { root: string; c: Campanha; pasta: string; today: string; anterior?: string; idioma?: Idioma }) {
  const dir = `${o.root}/divulgacao/${o.pasta}`
  const tools = `${o.root}/divulgacao/ferramentas`
  const clone = o.c.clone ?? `(sem clone local de ${o.c.repo}: use \`gh api\` para ler arquivos)`
  return [
    `Monte o post de divulgação de ${o.c.nome} na pasta ${dir} (hoje é ${o.today}).`,
    `O que entrou na ${o.c.branch}: ${dir}/pr.md (PRs, descrição e arquivos). Use só fatos dele e do código da ${o.c.branch}: não invente números, datas nem promessas.`,
    '',
    'Regras desta campanha:',
    o.c.regras,
    '',
    '1. Decida se vale post. Se nenhum PR muda algo que o usuário perceba, rode',
    `   \`planos divulgar --descartar ${o.pasta} --motivo "<por quê, em 1 linha>"\` e pare aqui.`,
    `2. Imagem com material real, seguindo ${tools}/README.md (primeira vez: \`npm install\` nessa pasta):`,
    `   - clone local: ${clone}. Atualize só com \`git fetch origin ${o.c.branch}\` e leia com \`git show origin/${o.c.branch}:<caminho>\`, sem trocar a branch nem mexer nos arquivos do clone. Se precisar rodar o app local, use um worktree temporário da origin/${o.c.branch} no seu diretório temporário e remova-o (\`git worktree remove\`) ao terminar.`,
    `   - em ${dir}/ref/: o screenshot real da tela que o PR mudou, o logo e os ícones reais.`,
    `   - ${dir}/template.html (1600×900) com título e subtítulo curtos escritos por você, o screenshot, o logo e os ícones, nas cores da marca${o.anterior ? `; use ${o.root}/${o.anterior}/template.html como referência de layout` : ''}.`,
    `   - render: \`node ${tools}/render.mjs ${dir}/template.html ${dir}/imagem.png\`. Abra a imagem e confira: texto sem erro, nada cortado, nada inventado.`,
    '   - O gerador de imagem só entra para um fundo sem texto, se precisar. Avisos e termos de sites nunca são aceitos: só escondidos na cópia da página (--esconder).',
    `3. ${dir}/legenda.md com uma única seção \`## EN\`: o texto do post ${emIdioma(o.idioma)}, até 600 caracteres, tom de anúncio de produto, 2 ou 3 bullets do que muda para o usuário, sem excesso de hashtags.`,
    `4. ${dir}/post.md: troque \`titulo\` por um título curto do post e escreva no corpo, em 2 ou 3 linhas ${isEn() ? 'em inglês' : 'em português'}, de onde saíram o screenshot e os assets e se é preciso segurar o post (e até quando).`,
    `5. Rode \`planos divulgar --pronto ${o.pasta}\`: o post vai para "Para postar" no app, com commit e aviso no Mac.`,
    '',
    `Limites: nunca poste, envie ou publique nada; nos repositórios de código, nada de commit, push ou troca de branch; nunca apague arquivos ${deNome()}; não aceite termos nem avisos de sites.`,
    idiomaRegra(),
  ].join('\n')
}

/** Pedido do botão "Verificar agora" da aba Divulgação, para o agente do Console. */
export function divulgarConsolePrompt(root: string) {
  return [
    `Verifique agora se há novidade para divulgar: rode \`planos divulgar --verificar\` em ${root}.`,
    'Ele lê a branch de cada campanha em divulgacao/campanhas.yaml (o campo `branch`), cria a pasta do post para o que entrou e imprime um pedido de geração para cada post a montar, entre linhas "=== … ===".',
    'Siga cada pedido impresso, um post por vez, exatamente como está escrito. Se ele disser que não há novidade, responda só isso.',
    'Ao final, em até 4 linhas: o que entrou em cada campanha, os posts prontos para postar e os descartados (com o motivo).',
    idiomaRegra(),
  ].join('\n')
}
