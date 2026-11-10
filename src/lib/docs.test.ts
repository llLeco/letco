import { describe, expect, it } from 'vitest'
import { buildDocs, filterDocs } from './docs'
import { parsePlan } from './plan'

const plan = parsePlan({
  path: 'projetos/acme/planos/2026-11-01-portal/plano.md',
  project: 'acme',
  folder: '2026-11-01-portal',
  mtime: 50,
  extras: ['design.md'],
  content: `---\nid: acme-portal\nprojeto: acme\ntitulo: Portal novo\nstatus: andamento\nprioridade: media\norigem: https://claude.ai/design/abc123\natualizado: 2026-11-01\n---\n\n# Portal novo\n\n## Contexto\nVer também https://claude.ai/code/artifact/xyz, e de novo https://claude.ai/design/abc123.\n`,
})
const files = [
  { path: 'projetos/acme/planos/2026-11-01-portal/plano.md', size: 1, mtime: 50 },
  { path: 'projetos/acme/planos/2026-11-01-portal/design.md', size: 1, mtime: 40 },
  { path: 'projetos/acme/planos/2026-11-01-portal/ref/tela.png', size: 1, mtime: 30 },
  { path: 'projetos/acme/projeto.md', size: 1, mtime: 20 },
  { path: 'projetos/acme/docs/brief-do-cliente.pdf', size: 1, mtime: 60 },
  { path: 'projetos/acme/conversas/2026-11-02.md', size: 1, mtime: 10 },
  { path: 'entrada/organizar/solto.md', size: 1, mtime: 70 },
]

describe('buildDocs', () => {
  const docs = buildDocs(files, [plan])
  const kinds = (k: string) => docs.filter((d) => d.kind === k)

  it('classifica cada arquivo e não repete o plano.md', () => {
    expect(kinds('plano').map((d) => d.rel)).toEqual(['projetos/acme/planos/2026-11-01-portal/plano.md'])
    expect(kinds('anexo').map((d) => d.sub).sort()).toEqual(['design.md', 'tela.png'])
    expect(kinds('anexo').every((d) => d.planId === 'acme-portal')).toBe(true)
    expect(kinds('projeto').map((d) => d.sub).sort()).toEqual(['docs/brief-do-cliente.pdf', 'projeto.md'])
    expect(kinds('conversa')).toHaveLength(1)
    expect(kinds('entrada').map((d) => d.title)).toEqual(['solto.md'])
  })

  it('acha os links do Claude do plano, sem repetir e sem a pontuação do fim', () => {
    expect(kinds('claude').map((d) => d.url).sort()).toEqual(['https://claude.ai/code/artifact/xyz', 'https://claude.ai/design/abc123'])
  })

  it('mais recentes primeiro', () => {
    expect(docs[0].key).toBe('entrada/organizar/solto.md')
  })

  it('busca por palavras, sem acento, e filtra por tipo', () => {
    const name = () => 'Acme'
    expect(filterDocs(docs, 'brief cliente', 'todos', name).map((d) => d.kind)).toEqual(['projeto'])
    expect(filterDocs(docs, 'PORTAL', 'claude', name)).toHaveLength(2)
    expect(filterDocs(docs, 'nada disso', 'todos', name)).toEqual([])
  })
})
