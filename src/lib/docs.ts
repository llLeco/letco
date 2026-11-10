import type { Plan } from './types'
import { t } from './i18n'

/**
 * Tela Documentos: tudo o que existe em ~/planos/projetos num lugar só (planos, anexos dos planos,
 * documentos e conversas dos projetos), os links do Claude citados nos planos (designs e artifacts)
 * e o que está em entrada/organizar/ esperando a IA decidir o lugar.
 */
export const ORGANIZAR_DIR = 'entrada/organizar'

export interface DocFile {
  path: string
  size: number
  mtime: number
}

export type DocKind = 'plano' | 'claude' | 'anexo' | 'projeto' | 'conversa' | 'entrada'

export interface Doc {
  /** caminho do arquivo ou o link: identifica a linha */
  key: string
  kind: DocKind
  title: string
  /** nome do arquivo ou tipo do link, em letra menor */
  sub?: string
  project?: string
  /** plano dono do documento (o próprio, para kind plano) */
  planId?: string
  planTitle?: string
  rel?: string
  url?: string
  mtime: number
}

export const DOC_KINDS: DocKind[] = ['plano', 'claude', 'anexo', 'projeto', 'conversa', 'entrada']

export const docKindLabel = (k: DocKind) =>
  ({
    plano: t('Planos', 'Plans'),
    claude: t('Claude (designs e artifacts)', 'Claude (designs and artifacts)'),
    anexo: t('Anexos de planos', 'Plan attachments'),
    projeto: t('Documentos de projeto', 'Project documents'),
    conversa: t('Conversas', 'Conversations'),
    entrada: t('Para organizar', 'To organize'),
  })[k]

const CLAUDE_URL = /https:\/\/claude\.ai\/[^\s)>\]"'`]+/g

/** "Design do Claude" / "Artifact do Claude" / "Conversa do Claude", pelo formato do link */
export function claudeLinkLabel(url: string) {
  if (/\/design/.test(url)) return t('Design do Claude', 'Claude design')
  if (/artifact/.test(url)) return t('Artifact do Claude', 'Claude artifact')
  if (/\/(chat|share|code)\b/.test(url)) return t('Conversa do Claude', 'Claude conversation')
  return t('Link do Claude', 'Claude link')
}

const fileTitle = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/[-_]+/g, ' ').trim() || name

export function buildDocs(files: DocFile[], plans: Plan[]): Doc[] {
  const out: Doc[] = []
  const byDir = new Map(plans.map((p) => [p.path.replace(/\/plano\.md$/, ''), p]))

  for (const p of plans) {
    out.push({ key: p.path, kind: 'plano', title: p.fm.titulo, sub: p.fm.status, project: p.projectSlug, planId: p.fm.id, planTitle: p.fm.titulo, rel: p.path, mtime: p.mtime })
    const urls = new Set<string>([...(p.fm.origem && p.fm.origem.includes('claude.ai') ? [p.fm.origem] : []), ...(p.raw.match(CLAUDE_URL) ?? [])].map((u) => u.replace(/[.,;:]+$/, '')))
    for (const url of urls) {
      out.push({ key: `${p.fm.id}|${url}`, kind: 'claude', title: p.fm.titulo, sub: claudeLinkLabel(url), project: p.projectSlug, planId: p.fm.id, planTitle: p.fm.titulo, url, mtime: p.mtime })
    }
  }

  for (const f of files) {
    const parts = f.path.split('/')
    const name = parts[parts.length - 1]
    if (f.path.startsWith(`${ORGANIZAR_DIR}/`)) {
      out.push({ key: f.path, kind: 'entrada', title: name, rel: f.path, mtime: f.mtime })
      continue
    }
    if (parts[0] !== 'projetos' || parts.length < 3) continue
    const project = parts[1]
    if (name === 'plano.md' && byDir.has(parts.slice(0, -1).join('/'))) continue
    // arquivo dentro da pasta de um plano (em qualquer nível): anexo daquele plano
    let plan: Plan | undefined
    for (let i = parts.length - 1; i > 2 && !plan; i--) plan = byDir.get(parts.slice(0, i).join('/'))
    if (plan) {
      out.push({ key: f.path, kind: 'anexo', title: fileTitle(name), sub: name, project, planId: plan.fm.id, planTitle: plan.fm.titulo, rel: f.path, mtime: f.mtime })
    } else if (parts[2] === 'conversas') {
      out.push({ key: f.path, kind: 'conversa', title: t(`Conversas de ${name.replace(/\.md$/, '')}`, `Conversations on ${name.replace(/\.md$/, '')}`), sub: name, project, rel: f.path, mtime: f.mtime })
    } else {
      out.push({ key: f.path, kind: 'projeto', title: name === 'projeto.md' ? t('Contexto do projeto', 'Project context') : fileTitle(name), sub: parts.slice(2).join('/'), project, rel: f.path, mtime: f.mtime })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** busca simples: todas as palavras precisam aparecer no título, no arquivo, no plano ou no projeto */
export function filterDocs(docs: Doc[], q: string, kind: DocKind | 'todos', projectName: (slug?: string) => string) {
  const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
  return docs.filter((d) => {
    if (kind !== 'todos' && d.kind !== kind) return false
    if (!words.length) return true
    const hay = [d.title, d.sub, d.planTitle, projectName(d.project), d.url].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return words.every((w) => hay.includes(w))
  })
}
