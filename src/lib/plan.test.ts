import { describe, expect, it } from 'vitest'
import { addItem, addPhase, askOf, newPlanMarkdown, nextPhase, parsePlan, pendingAsks, progress, sections, setFields, slugify, splitFrontmatter, toggleLine, togglePhase } from './plan'
import { todayISO } from './dates'

const RAW = `---
id: acme-portal
projeto: acme
titulo: 'Portal: home nova'
status: proximo
prioridade: alta
prazo: 2026-11-20
responsavel: ana
pessoas: [sam]
agente: claude
atualizado: 2026-11-01
---

# Portal: home nova

## Para você
**Do que se trata:** Uma home nova para o portal.
**Como está:** A proposta está pronta; falta implementar.
**Precisa de você:**
- [ ] Aprovar: merge do acme/web#12
- [x] Decidir: navegação no celular
- [ ] Olhar o protótipo
**Conferido:** 2026-11-02 · PR #12 aberto, CI verde

## Objetivo
Home clara para quem integra.

## Fases
- [x] F1 Levantar telas — 2026-10-30
- [ ] F2 Implementar home
- [ ] F3 Revisar

## Decisões em aberto
- [ ] Qual navegação usar

## Pessoas e cobranças
- [ ] Sam: confirmar o gateway (desde 2026-10-28)

## Log
- 2026-10-28: plano criado
`

const plan = () => parsePlan({ path: 'projetos/acme/planos/2026-10-28-portal/plano.md', project: 'acme', folder: '2026-10-28-portal', content: RAW, mtime: 0, extras: [] })

describe('splitFrontmatter', () => {
  it('separa cabeçalho e corpo', () => {
    const { data, body } = splitFrontmatter(RAW)
    expect(data.id).toBe('acme-portal')
    expect(data.pessoas).toEqual(['sam'])
    expect(body.trimStart().startsWith('# Portal: home nova')).toBe(true)
  })
  it('sem cabeçalho, devolve tudo como corpo', () => {
    expect(splitFrontmatter('# Só texto')).toEqual({ data: {}, body: '# Só texto' })
  })
  it('cabeçalho quebrado não derruba a leitura', () => {
    expect(() => splitFrontmatter('---\nid: [aberto\n---\n\ncorpo')).not.toThrow()
  })
})

describe('sections', () => {
  it('ignora ## dentro de bloco de código', () => {
    const secs = sections(['## A', '```', '## não é seção', '```', '## B'])
    expect(secs.map((s) => s.title)).toEqual(['A', 'B'])
    expect(secs[0].end).toBe(4)
  })
})

describe('parsePlan', () => {
  it('lê cabeçalho, fases, decisões e cobranças', () => {
    const p = plan()
    expect(p.fm).toMatchObject({ id: 'acme-portal', status: 'proximo', prioridade: 'alta', prazo: '2026-11-20' })
    expect(p.projectSlug).toBe('acme')
    expect(p.phases.map((f) => [f.id, f.name, f.done])).toEqual([
      ['F1', 'Levantar telas', true],
      ['F2', 'Implementar home', false],
      ['F3', 'Revisar', false],
    ])
    expect(p.phases[0].date).toBe('2026-10-30')
    expect(p.decisions.map((d) => d.text)).toEqual(['Qual navegação usar'])
    expect(p.cobrancas[0]).toMatchObject({ person: 'Sam', since: '2026-10-28', done: false })
    expect(p.objetivo).toBe('Home clara para quem integra.')
  })

  it('lê a seção Para você', () => {
    const pv = plan().paraVoce!
    expect(pv.resumo).toBe('Uma home nova para o portal.')
    expect(pv.situacao).toBe('A proposta está pronta; falta implementar.')
    expect(pv.conferido).toBe('2026-11-02')
    expect(pv.fonte).toBe('PR #12 aberto, CI verde')
    expect(pv.acoes.map((a) => [a.kind, a.done])).toEqual([
      ['aprovar', false],
      ['decidir', true],
      ['outro', false],
    ])
  })

  it('"nada agora" vira texto, sem ações', () => {
    const p = parsePlan({ path: 'x/plano.md', project: 'acme', folder: 'x', content: RAW.replace(/\*\*Precisa de você:\*\*\n(- \[.\] .*\n)+/, '**Precisa de você:** nada agora — a IA segue sozinha\n'), mtime: 0, extras: [] })
    expect(p.paraVoce!.acoes).toEqual([])
    expect(p.paraVoce!.nada).toContain('nada agora')
  })

  it('progresso, próxima fase e pendências', () => {
    const p = plan()
    expect(progress(p)).toMatchObject({ done: 1, total: 3 })
    expect(nextPhase(p)?.id).toBe('F2')
    expect(pendingAsks(p).map((a) => a.kind)).toEqual(['aprovar', 'outro'])
  })
})

describe('askOf', () => {
  it.each([
    ['Aprovar: merge do #1', 'aprovar', 'merge do #1'],
    ['Testar no app: abrir a tela', 'testar', 'abrir a tela'],
    ['**Cobrar:** Sam, o brief', 'cobrar', 'Sam, o brief'],
    ['Mensagem: avisar o time', 'mensagem', 'avisar o time'],
    ['Comprar pão', 'outro', 'Comprar pão'],
  ])('%s', (text, kind, label) => {
    expect(askOf({ text, done: false, line: 0 })).toMatchObject({ kind, label })
  })
})

describe('edições', () => {
  it('concluir a primeira fase pendente marca a data, escreve no Log e muda o status', () => {
    const p = plan()
    const proximo = parsePlan({ path: p.path, project: 'acme', folder: p.folder, content: RAW.replace('- [x] F1 Levantar telas — 2026-10-30', '- [ ] F1 Levantar telas'), mtime: 0, extras: [] })
    const after = parsePlan({ path: p.path, project: 'acme', folder: p.folder, content: togglePhase(proximo, 0), mtime: 0, extras: [] })
    expect(after.phases[0]).toMatchObject({ done: true, date: todayISO() })
    expect(after.fm.status).toBe('andamento')
    expect(after.fm.atualizado).toBe(todayISO())
    expect(after.raw).toContain(`- ${todayISO()}: F1 Levantar telas concluída · status → andamento`)
  })

  it('concluir todas as fases passa para revisão, nunca para feito', () => {
    let p = plan()
    for (const i of [1, 2]) p = parsePlan({ path: p.path, project: 'acme', folder: p.folder, content: togglePhase(p, i), mtime: 0, extras: [] })
    expect(p.fm.status).toBe('revisao')
  })

  it('reabrir uma fase tira a data', () => {
    const after = parsePlan({ path: 'x', project: 'acme', folder: 'x', content: togglePhase(plan(), 0), mtime: 0, extras: [] })
    expect(after.phases[0]).toMatchObject({ done: false, date: undefined })
  })

  it('marcar um item mantém o resto do arquivo', () => {
    const p = plan()
    const line = p.paraVoce!.acoes[0].line
    const after = parsePlan({ path: 'x', project: 'acme', folder: 'x', content: toggleLine(p, line), mtime: 0, extras: [] })
    expect(after.paraVoce!.acoes[0].done).toBe(true)
    expect(after.phases).toHaveLength(3)
    expect(after.decisions).toHaveLength(1)
  })

  it('acrescenta fase, decisão e cobrança nas seções certas', () => {
    const re = (raw: string) => parsePlan({ path: 'x', project: 'acme', folder: 'x', content: raw, mtime: 0, extras: [] })
    expect(re(addPhase(plan(), 'Publicar')).phases.at(-1)).toMatchObject({ id: 'F4', name: 'Publicar', done: false })
    expect(re(addItem(plan(), 'decisoes', 'Cor do botão')).decisions.map((d) => d.text)).toContain('Cor do botão')
    expect(re(addItem(plan(), 'cobrancas', 'Ken: enviar o logo')).cobrancas.at(-1)?.person).toBe('Ken')
  })

  it('mudar campo do cabeçalho preserva o corpo', () => {
    const after = parsePlan({ path: 'x', project: 'acme', folder: 'x', content: setFields(plan(), { prioridade: 'baixa' }, 'prioridade → baixa'), mtime: 0, extras: [] })
    expect(after.fm.prioridade).toBe('baixa')
    expect(after.paraVoce!.resumo).toBe('Uma home nova para o portal.')
    expect(after.raw).toContain('prioridade → baixa')
  })
})

describe('plano novo', () => {
  it('o modelo que o app cria é lido de volta pelo próprio app', () => {
    const raw = newPlanMarkdown({ id: 'acme-teste', projeto: 'acme', titulo: 'Teste', prioridade: 'media', fases: ['Primeira', 'Segunda'], objetivo: 'Ver se funciona' })
    const p = parsePlan({ path: 'x', project: 'acme', folder: 'x', content: raw, mtime: 0, extras: [] })
    expect(p.fm).toMatchObject({ id: 'acme-teste', status: 'proximo', prioridade: 'media' })
    expect(p.phases.map((f) => f.id)).toEqual(['F1', 'F2'])
    expect(p.paraVoce!.acoes[0].kind).toBe('continuar')
    expect(p.objetivo).toBe('Ver se funciona')
  })
})

describe('slugify', () => {
  it('tira acentos e símbolos', () => {
    expect(slugify('Ação & Reação: Módulo 2')).toBe('acao-reacao-modulo-2')
  })
})
