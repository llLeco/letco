import type { Plan } from './types'

/**
 * Menções a PR (#807, PR #291, dono/repo#12) viram links do GitHub.
 * O repositório sai, nesta ordem: do próprio texto (dono/repo#n ou o repo citado na mesma linha),
 * de outro trecho do plano ou do projeto que cita o mesmo número junto do repo,
 * do worktree do plano (remote origin), do repo mais citado no plano e do mais citado no projeto.
 */

const URL_RE = /github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?=[/\s)#`"'”,;]|$)/g
const FULL_RE = /(?<![\w./~-])([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]*[A-Za-z][A-Za-z0-9_.-]*?)(?=#\d|[\s)`"'”,;:]|\.(?:\s|$)|$)/g
const PR_RE = /(^|[^\w/#&-])(?:([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)#|#)(\d{1,6})\b/g

export interface RepoIndex {
  /** nome do repo (minúsculo) → dono/repo */
  byName: Map<string, string>
  owners: Set<string>
}

/** repos conhecidos: links do GitHub e remotes dos worktrees; com o dono conhecido, "Dono/repo" no texto também vale */
export function buildRepoIndex(plans: Plan[], remotes: Record<string, string>): RepoIndex {
  const full = new Set<string>(Object.values(remotes))
  for (const p of plans) for (const m of p.raw.matchAll(URL_RE)) full.add(`${m[1]}/${m[2]}`)
  const owners = new Set([...full].map((r) => r.split('/')[0].toLowerCase()))
  for (const p of plans)
    for (const m of p.raw.matchAll(FULL_RE)) if (owners.has(m[1].toLowerCase())) full.add(`${m[1]}/${m[2]}`)
  const byName = new Map<string, string>()
  for (const r of full) byName.set(r.split('/')[1].toLowerCase(), r)
  return { byName, owners }
}

interface Mention {
  repo: string
  at: number
  /** citado como dono/repo (vale mais que o nome solto) */
  full: boolean
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** repos citados num texto; o nome solto só conta com a grafia exata do repo ("ADAM" não é o repo adam) */
function mentions(text: string, idx: RepoIndex): Mention[] {
  const out: Mention[] = []
  for (const repo of idx.byName.values()) {
    const [owner, name] = repo.split('/')
    const re = new RegExp(`(?<![\\w-])(?:${esc(owner)}/)?${esc(name)}(?![\\w-])`, 'g')
    for (const m of text.matchAll(re)) out.push({ repo, at: m.index!, full: m[0].includes('/') })
  }
  return out
}

function nearest(list: Mention[], pos: number) {
  if (!list.length) return undefined
  const score = (m: Mention) => Math.abs(m.at - pos) - (m.full ? 40 : 0)
  return list.reduce((best, m) => (score(m) < score(best) ? m : best)).repo
}

export function mostCited(text: string, idx: RepoIndex) {
  const count = new Map<string, number>()
  for (const { repo, full } of mentions(text, idx)) count.set(repo, (count.get(repo) ?? 0) + (full ? 3 : 1))
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function explicitRepo(token: string, idx: RepoIndex) {
  const [owner, name] = token.split('/')
  return idx.owners.has(owner.toLowerCase()) ? token : idx.byName.get(name.toLowerCase())
}

/** número do PR → repo, quando alguma linha cita o número junto do repo (ex.: "PR #807 (acme-labs/acme-connect") */
function numbersIn(text: string, idx: RepoIndex, into = new Map<string, string>()) {
  for (const line of text.split('\n')) {
    if (!line.includes('#')) continue
    const near = mentions(line, idx)
    for (const m of line.matchAll(PR_RE)) {
      if (into.has(m[3])) continue
      const repo = m[2] ? explicitRepo(m[2], idx) : nearest(near, m.index! + m[1].length)
      if (repo) into.set(m[3], repo)
    }
  }
  return into
}

export interface PrContext {
  /** números já vistos com repo, primeiro neste plano e depois nos outros do projeto */
  byNumber: Map<string, string>
  fallback?: string
}

export function prContext(plan: Plan, all: Plan[], idx: RepoIndex, remotes: Record<string, string>): PrContext {
  const siblings = all.filter((p) => p.projectSlug === plan.projectSlug && p !== plan)
  const byNumber = numbersIn(plan.raw, idx)
  for (const p of siblings) numbersIn(p.raw, idx, byNumber)
  const fallback =
    (plan.fm.worktree && remotes[plan.fm.worktree]) ||
    mostCited(plan.raw, idx) ||
    mostCited(siblings.map((p) => p.raw + ' ' + (p.fm.worktree ? (remotes[p.fm.worktree] ?? '') : '')).join('\n'), idx)
  return { byNumber, fallback }
}

export const prUrl = (repo: string, n: string | number) => `https://github.com/${repo}/pull/${n}`

/** troca #123 por [#123](link do PR), fora de código e de links que já existem */
export function linkPRs(md: string, idx: RepoIndex, ctx: PrContext): string {
  if (!md.includes('#')) return md
  return md
    .split('\n')
    .map((line) => {
      const near = mentions(line, idx)
      return line
        .split(/(`[^`]*`|\[[^\]]*\]\([^)]*\)|<[^>]+>)/)
        .map((part, i, parts) => {
          if (i % 2 === 1) return part
          const offset = parts.slice(0, i).join('').length
          return part.replace(PR_RE, (whole, pre: string, explicit: string | undefined, n: string, at: number) => {
            const repo =
              (explicit && explicitRepo(explicit, idx)) || nearest(near, offset + at + pre.length) || ctx.byNumber.get(n) || ctx.fallback
            if (!repo) return whole
            const label = explicit ? `${explicit}#${n}` : `#${n}`
            return `${pre}[${label}](${prUrl(repo, n)})`
          })
        })
        .join('')
    })
    .join('\n')
}

export const PR_LINK_RE = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)\/?$/

export interface LocalRepo {
  path: string
  repo: string
  branch: string
  worktree: boolean
}

const MAIN_BRANCHES = new Set(['main', 'master', 'develop', 'dev', ''])

/**
 * Pasta de código onde a IA deve abrir para este plano (ou projeto): um clone citado no texto,
 * o worktree na branch citada no plano, o clone principal do repo do plano ou, sem repo,
 * o clone com o nome do projeto (ex.: ~/…/rafescan para o projeto rafescan).
 */
export function pickCodeDir(text: string, repo: string | undefined, clones: LocalRepo[], home: string, slug?: string): string | undefined {
  const tilde = (p: string) => (home && p.startsWith(home + '/') ? '~' + p.slice(home.length) : p)
  const cited = clones
    .filter((c) => text.includes(c.path) || text.includes(tilde(c.path)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (cited) return cited.path
  const main = (list: LocalRepo[]) => [...list].sort((a, b) => Number(a.worktree) - Number(b.worktree) || a.path.length - b.path.length)[0]?.path
  const same = repo ? clones.filter((c) => c.repo.toLowerCase() === repo.toLowerCase()) : []
  const onBranch = same.find((c) => !MAIN_BRANCHES.has(c.branch) && text.includes(c.branch))
  if (onBranch) return onBranch.path
  return main(same) ?? (slug ? main(clones.filter((c) => c.path.split('/').pop()?.toLowerCase() === slug.toLowerCase())) : undefined)
}
