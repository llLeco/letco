import { describe, expect, it } from 'vitest'
import { parseConferido } from './conferido'
import { isAdiada, parseTarefas, setAdiado, setTarefa, tarefaKeys } from './tarefas'

const RAW = `# Tarefas de quarta, 28/10

- [ ] Aprovar: merge do acme/api#14 <!-- plano: acme-api -->
  - Conferido 2026-10-27 · ainda pendente: PR aberto
  - Conferido 2026-10-28 · já feito: PR #14 mergeado
- [x] Cobrar: Sam, o brief <!-- plano: acme-portal --> https://exemplo.dev/m/1
- [ ] Revisar: a fila de PRs
  - Conferido 2026-10-28 · bloqueado por acme-wallet-login: falta o login
texto solto
`

describe('parseTarefas', () => {
  const t = parseTarefas('2026-10-28.md', RAW)

  it('lê os itens, o plano e o tipo', () => {
    expect(t.date).toBe('2026-10-28')
    expect(t.items.map((i) => [i.kind, i.done, i.planId])).toEqual([
      ['aprovar', false, 'acme-api'],
      ['cobrar', true, 'acme-portal'],
      ['revisar', false, undefined],
    ])
  })

  it('tira o comentário do plano do texto, mesmo antes do link', () => {
    expect(t.items[1].text).toBe('Cobrar: Sam, o brief https://exemplo.dev/m/1')
  })

  it('usa a conferência mais recente logo abaixo do item', () => {
    expect(t.items[0].conferido).toMatchObject({ date: '2026-10-28', status: 'feito', text: 'PR #14 mergeado' })
    expect(t.items[1].conferido).toBeUndefined()
    expect(t.items[2].conferido).toMatchObject({ status: 'bloqueado', blockedBy: 'acme-wallet-login' })
  })

  it('marcar e desmarcar mexe só na linha da tarefa', () => {
    const line = t.items[0].line
    const marked = setTarefa(RAW, line, true)
    expect(parseTarefas('2026-10-28.md', marked).items.map((i) => i.done)).toEqual([true, true, false])
    expect(setTarefa(marked, line, false)).toBe(RAW)
  })

  it('a chave ignora acentos e maiúsculas, para ligar a tarefa ao item do plano', () => {
    const a = tarefaKeys(parseTarefas('a.md', '- [ ] Aprovar: Revisão do PR <!-- plano: p -->'))
    const b = tarefaKeys(parseTarefas('b.md', '- [ ] Aprovar: revisao do pr <!-- plano: p -->'))
    expect([...a]).toEqual([...b])
  })
})

describe('adiar', () => {
  const now = new Date(2026, 10, 12)
  it('adia, lê de volta e mantém a conferência', () => {
    const t = parseTarefas('2026-10-28.md', RAW)
    const raw = setAdiado(RAW, t.items[0].line, '2026-11-16', 'esperando o Sam')
    const again = parseTarefas('2026-10-28.md', raw)
    expect(again.items[0].adiado).toEqual({ ate: '2026-11-16', motivo: 'esperando o Sam' })
    expect(again.items[0].conferido?.status).toBe('feito')
    expect(again.items.map((i) => i.kind)).toEqual(['aprovar', 'cobrar', 'revisar'])
    expect(isAdiada(again.items[0], now)).toBe(true)
    expect(isAdiada(again.items[2], now)).toBe(false)
  })
  it('adiar de novo troca a data; tirar o adiamento devolve o arquivo original', () => {
    const line = parseTarefas('a.md', RAW).items[2].line
    const um = setAdiado(RAW, line, '2026-11-16')
    const dois = setAdiado(um, line, '2026-11-20')
    expect(dois.match(/Adiado até/g)).toHaveLength(1)
    expect(setAdiado(dois, line, null)).toBe(RAW)
  })
  it('quando a data chega, a tarefa volta', () => {
    const raw = setAdiado(RAW, parseTarefas('a.md', RAW).items[0].line, '2026-11-12')
    expect(isAdiada(parseTarefas('a.md', raw).items[0], now)).toBe(false)
  })
})

describe('parseConferido', () => {
  it.each([
    ['  - Conferido 2026-10-28 · já feito: PR mergeado', 'feito'],
    ['  - Conferido 2026-10-28 · em parte: metade', 'parcial'],
    ['  - Conferido 2026-10-28 · ainda pendente: nada', 'pendente'],
    ['  - Conferido 2026-10-28 · bloqueado por `acme-x`: espera', 'bloqueado'],
    ['  - Conferido 2026-10-28 · bloqueado: sem plano', 'bloqueado'],
  ])('%s', (line, status) => {
    expect(parseConferido(line)?.status).toBe(status)
  })

  it('só vale com recuo (linha de conferência, não item)', () => {
    expect(parseConferido('- Conferido 2026-10-28 · já feito: x')).toBeUndefined()
    expect(parseConferido('  - outra coisa')).toBeUndefined()
  })
})
