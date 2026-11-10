import { describe, expect, it } from 'vitest'
import { configError, configToYaml, DEFAULT_CONFIG, detectContext, orderedSlugs, parseConfig } from './config'
import { parsePlan } from './plan'
import { buildToday } from './score'
import { todayISO } from './dates'
import { addDays, format } from 'date-fns'

describe('config', () => {
  it('sem arquivo, começa vazio', () => {
    expect(parseConfig(null).projetos).toEqual({})
  })

  it('grava e lê de volta o mesmo conteúdo', () => {
    const cfg = structuredClone(DEFAULT_CONFIG)
    cfg.usuario = { nome: 'Ana', apelidos: ['anasouza'], idioma: 'en' }
    cfg.projetos = { acme: { nome: 'Acme', idioma: 'pt-BR' } }
    cfg.contextos.trabalho.ordem = ['acme']
    cfg.contextos['fora-do-horario'].ocultar = ['acme']
    expect(parseConfig(configToYaml(cfg))).toEqual(cfg)
  })

  it('horários ficam entre aspas no arquivo (09:00 não pode virar número)', () => {
    expect(configToYaml(DEFAULT_CONFIG)).toContain('inicio: "09:00"')
  })

  it('arquivo quebrado cai no padrão em vez de derrubar o app', () => {
    expect(parseConfig('projetos: [').contextos.trabalho.inicio).toBe('09:00')
  })

  it('aponta o erro de um arquivo quebrado, em vez de ignorar em silêncio', () => {
    expect(configError('projetos:\n  a:\n    idioma: pt-BR  b:\n    nome: B\n')).toBeTruthy()
    expect(configError(configToYaml(DEFAULT_CONFIG))).toBeNull()
    expect(configError(null)).toBeNull()
  })

  it('contexto pelo dia e pela hora', () => {
    // 2026-11-09 é segunda-feira
    expect(detectContext(DEFAULT_CONFIG, new Date(2026, 10, 9, 10, 0))).toBe('trabalho')
    expect(detectContext(DEFAULT_CONFIG, new Date(2026, 10, 9, 18, 0))).toBe('fora-do-horario')
    expect(detectContext(DEFAULT_CONFIG, new Date(2026, 10, 8, 10, 0))).toBe('fora-do-horario')
  })

  it('ordem: os listados primeiro, o resto em ordem alfabética', () => {
    const cfg = structuredClone(DEFAULT_CONFIG)
    cfg.contextos.trabalho.ordem = ['orbit', 'sumiu', 'acme']
    expect(orderedSlugs(cfg, 'trabalho', ['zeta', 'acme', 'beta', 'orbit'])).toEqual(['orbit', 'acme', 'beta', 'zeta'])
  })
})

describe('lista do dia', () => {
  const now = new Date()
  const day = (n: number) => format(addDays(now, n), 'yyyy-MM-dd')
  const mk = (id: string, projeto: string, status: string, prazo?: string) =>
    parsePlan({
      path: `projetos/${projeto}/planos/${id}/plano.md`,
      project: projeto,
      folder: id,
      mtime: 0,
      extras: [],
      content: `---\nid: ${id}\nprojeto: ${projeto}\ntitulo: ${id}\nstatus: ${status}\nprioridade: media\n${prazo ? `prazo: ${prazo}\n` : ''}atualizado: ${todayISO()}\n---\n\n# ${id}\n\n## Fases\n- [ ] F1 Fazer\n`,
    })

  it('prazo vencido vai para urgente; feito e arquivado ficam de fora', () => {
    const today = buildToday([mk('a', 'acme', 'andamento', day(-1)), mk('b', 'acme', 'proximo'), mk('c', 'acme', 'feito'), mk('d', 'acme', 'arquivado')], DEFAULT_CONFIG, 'trabalho', now)
    expect(today.urgent.map((s) => s.plan.fm.id)).toEqual(['a'])
    expect(today.doing.map((s) => s.plan.fm.id)).toEqual(['b'])
  })

  it('projeto escondido no contexto só aparece com prazo vencendo', () => {
    const cfg = structuredClone(DEFAULT_CONFIG)
    cfg.contextos.trabalho.ocultar = ['lume']
    const today = buildToday([mk('longe', 'lume', 'andamento', day(10)), mk('amanha', 'lume', 'andamento', day(1)), mk('sem-prazo', 'lume', 'proximo')], cfg, 'trabalho', now)
    const ids = [...today.urgent, ...today.doing].map((s) => s.plan.fm.id)
    expect(ids).toEqual(['amanha'])
    expect(today.counts.hiddenByContext).toBe(2)
  })
})

describe('rotinas', () => {
  it('rotina instalada com o texto desta versão não é marcada como desatualizada', async () => {
    const { ROTINAS, rotinasDesatualizadas } = await import('./rotinas')
    const root = '/tmp/planos'
    const iguais = ROTINAS.map((r) => [r.id, `---\nname: ${r.id}\ndescription: x\n---\n\n${r.texto(root)}\n`] as [string, string])
    expect(rotinasDesatualizadas(root, iguais)).toEqual([])
    const velha: [string, string][] = [[ROTINAS[0].id, '---\nname: x\n---\n\nTexto antigo.']]
    expect(rotinasDesatualizadas(root, velha).map((r) => r.id)).toEqual([ROTINAS[0].id])
  })
})
