import type { Frontmatter, Status } from './types'
import { compose, slugify, splitFrontmatter } from './plan'
import { todayISO } from './dates'

/** Arquivo solto em entrada/: completa o cabeçalho e decide a pasta de destino. */
export function placeEntrada(name: string, content: string, fallbackProject: string) {
  const { data, body } = splitFrontmatter(content)
  const date = todayISO()
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const titulo = (data.titulo as string) ?? h1 ?? name.replace(/\.md$/, '')
  const proj = data.projeto ? slugify(String(data.projeto)) : fallbackProject
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
