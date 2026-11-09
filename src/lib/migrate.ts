import type { Frontmatter, Status } from './types'
import { compose, slugify, splitFrontmatter } from './plan'
import { todayISO } from './dates'
import { titleCase } from './config'
import { apelidoUsuario, souEu } from './usuario'

/** Plano no formato do sistema anterior (~/.hermes/planos/planos.json) */
interface HermesPlan {
  id: string
  projeto: string
  titulo: string
  etapa: string
  prioridade?: string
  objetivo?: string
  fases?: { done: boolean; name: string }[]
  pendencias?: string[]
  bloqueios?: string[]
  responsavel?: string
  envolvidos?: string[]
  plano?: string | null
  plano_tipo?: string
  planos_extra?: string[]
  worktree?: string | null
  criterio_pronto?: string | null
  copia_local?: string | null
}

const STATUS_MAP: Record<string, Status> = {
  backlog: 'ideia',
  ideia: 'ideia',
  proximo: 'proximo',
  andamento: 'andamento',
  bloqueado: 'bloqueado',
  revisao: 'revisao',
  concluido: 'feito',
  feito: 'feito',
}

export function projectSlug(name: string) {
  return slugify(name)
}

function originFromCopy(copy: string) {
  return copy.match(/^-\s*Fonte:\s*(https?:\/\/\S+)/m)?.[1]
}

function copyKind(copy: string) {
  return /^-\s*Tipo:\s*design/im.test(copy) ? 'design.md' : 'artifact.md'
}

/** Resumo da análise do investigador: situação, o que falta e o que depende de mim; o texto completo fica em analise.md */
function lastAnalysis(md: string) {
  const parts = md.split(/^## /m)
  const when = parts[0].match(/Análise de (\d{4}-\d{2}-\d{2})/)?.[1]
  const keep = parts.slice(1).filter((p) => /^(Situação|O que falta|O que depende)/.test(p))
  const body = keep.map((p) => '### ' + p.trim()).join('\n\n')
  return `${when ? `Do investigador, ${when}. ` : ''}Completa em \`analise.md\`.\n\n${body}`
}

export interface MigrationFile {
  rel: string
  content: string
}

export function migrateHermes(
  json: string,
  copies: [string, string][],
  existingIds: Set<string>,
  analyses: [string, string][] = [],
): { files: MigrationFile[]; projects: string[]; skipped: number } {
  const plans = JSON.parse(json) as HermesPlan[]
  const date = todayISO()
  const files: MigrationFile[] = []
  const projects = new Set<string>()
  const usedCopies = new Set<string>()
  let skipped = 0

  for (const h of plans) {
    if (existingIds.has(h.id)) {
      skipped++
      continue
    }
    const proj = projectSlug(h.projeto)
    projects.add(proj)
    const slug = slugify(h.id.startsWith(proj + '-') ? h.id.slice(proj.length + 1) : h.id)
    const folder = `projetos/${proj}/planos/${date}-${slug}`

    const fases = h.fases ?? []
    let status = STATUS_MAP[h.etapa] ?? 'ideia'
    if (status === 'ideia' && fases.some((f) => f.done)) status = 'andamento'

    let origem: string | undefined
    const extraFiles: MigrationFile[] = []
    const copyName = h.copia_local?.split('/').pop()
    const copy = copyName ? copies.find(([n]) => n === copyName) : undefined
    if (copy) {
      usedCopies.add(copy[0])
      origem = originFromCopy(copy[1])
      extraFiles.push({ rel: `${folder}/${copyKind(copy[1])}`, content: copy[1] })
    }

    const original = h.plano_tipo === 'md' && h.plano ? h.plano : undefined
    const documentos = [original, ...(h.planos_extra ?? [])].filter(Boolean) as string[]

    const fm: Frontmatter = {
      id: h.id,
      projeto: proj,
      titulo: h.titulo,
      status,
      prioridade: h.prioridade === 'alta' || h.prioridade === 'baixa' ? h.prioridade : 'media',
      responsavel: h.responsavel ? h.responsavel.toLowerCase() : apelidoUsuario(),
      pessoas: (h.envolvidos ?? []).map((p) => p.toLowerCase()),
      agente: 'claude',
      worktree: h.worktree ? h.worktree.replace(/^\/Users\/[^/]+\//, '~/') : undefined,
      origem,
      documentos: documentos.length ? documentos.map((d) => d.replace(/^\/Users\/[^/]+\//, '~/')) : undefined,
      atualizado: date,
    }

    const lines: string[] = [`# ${h.titulo}`, '', '## Objetivo', h.objetivo?.trim() || '_Uma frase._', '', '## Contexto']
    if (documentos.length) {
      lines.push('Documentos originais (continuam onde estão):')
      for (const d of documentos) lines.push(`- \`${d.replace(/^\/Users\/[^/]+\//, '~/')}\``)
    }
    if (copy) lines.push(`Cópia local do Claude: \`${copyKind(copy[1])}\``)
    if (h.pendencias?.length) {
      lines.push('', 'Pendências registradas:')
      for (const p of h.pendencias) lines.push(`- ${p}`)
    }
    lines.push('', '## Fases')
    fases.forEach((f, i) => lines.push(`- [${f.done ? 'x' : ' '}] F${i + 1} ${f.name}`))
    if (!fases.length) lines.push('- [ ] F1 Definir as fases')
    lines.push('', '## Decisões em aberto')
    for (const b of h.bloqueios ?? []) lines.push(`- [ ] ${b}`)
    lines.push('', '## Pessoas e cobranças')
    if (h.responsavel && !souEu(h.responsavel)) lines.push(`Responsável: ${h.responsavel}.`)
    if (h.envolvidos?.length) lines.push(`Envolvidos: ${h.envolvidos.join(', ')}.`)
    lines.push('', '## Critério de pronto', h.criterio_pronto?.trim() || '')
    const analysis = analyses.find(([n]) => n === `${h.id}.md`)?.[1]
    if (analysis) {
      lines.push('', '## Última análise', lastAnalysis(analysis))
      extraFiles.push({ rel: `${folder}/analise.md`, content: analysis })
    }
    lines.push('', '## Log', `- ${date}: importado do Hermes (${h.etapa})`, '')

    files.push({ rel: `${folder}/plano.md`, content: compose(fm, lines.join('\n')) })
    files.push(...extraFiles)
  }

  // cópias que nenhum plano referencia vão para docs/ do projeto (pelo prefixo do nome)
  for (const [name, content] of copies) {
    if (usedCopies.has(name)) continue
    const prefix = name.split('-')[0]
    const proj = [...projects].find((k) => k.replace(/-/g, '') === prefix || k === prefix) ?? 'geral'
    projects.add(proj)
    files.push({ rel: `projetos/${proj}/docs/${name}`, content })
  }

  for (const p of projects) {
    files.push({
      rel: `projetos/${p}/projeto.md`,
      content: `---\nnome: ${titleCase(p)}\n---\n\n# ${titleCase(p)}\n\nContexto do projeto: repositórios, worktrees, pessoas.\n`,
    })
  }

  return { files, projects: [...projects], skipped }
}

/** Arquivo solto em entrada/: completa o cabeçalho e decide a pasta de destino. */
export function placeEntrada(name: string, content: string, fallbackProject: string) {
  const { data, body } = splitFrontmatter(content)
  const date = todayISO()
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const titulo = (data.titulo as string) ?? h1 ?? name.replace(/\.md$/, '')
  const proj = data.projeto ? projectSlug(String(data.projeto)) : fallbackProject
  const slug = slugify(titulo)
  const fm: Frontmatter = {
    ...(data as Frontmatter),
    id: (data.id as string) ?? `${proj}-${slug}`,
    projeto: proj,
    titulo,
    status: ((data.status as Status) ?? 'proximo') as Status,
    prioridade: (data.prioridade as Frontmatter['prioridade']) ?? 'media',
    atualizado: date,
  }
  return {
    rel: `projetos/${proj}/planos/${date}-${slug}/plano.md`,
    content: compose(fm, body),
  }
}
