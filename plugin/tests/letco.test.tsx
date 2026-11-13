import { expect, test } from 'claude-code/testing'

import { idiomaEn, lerTarefas } from '../hooks/register'

const LISTA = `# Tarefas de sexta, 13/11

- [x] Acesso: liberar o deploy <!-- plano: api -->
  - Conferido 2026-11-13 · já feito
- [ ] Decidir: abas embaixo ou menu lateral <!-- plano: portal -->
- [ ] Cobrar: Sam deve a revisão do #14 <!-- plano: api -->
  - Adiado até 2026-11-16 · parada há 3 dias
- [ ] Testar no app: o fluxo de troca <!-- plano: troca -->
  - Adiado até 2026-11-13 · já venceu
`

const BAND = {
  plugin: 'letco',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

test('reads the daily file: type, done and postponed', () => {
  const tarefas = lerTarefas(LISTA, '2026-11-13')

  expect(tarefas.map(t => t.tipo)).toEqual(['Acesso', 'Decidir', 'Cobrar', 'Testar no app'])
  expect(tarefas[0]?.isFeita).toBe(true)
  expect(tarefas[1]?.texto).toBe('abas embaixo ou menu lateral')
  expect(tarefas[2]?.adiadaAte).toBe('2026-11-16')
  // a postponement that has reached its date is open again
  expect(tarefas[3]?.adiadaAte).toBe(null)
})

test('the app language is the one under usuario, not a project', () => {
  expect(idiomaEn('usuario:\n  nome: Sam\n  idioma: en\nprojetos:\n  a:\n    idioma: pt-BR\n')).toBe(true)
  expect(idiomaEn('usuario:\n  nome: Sam\nprojetos:\n  a:\n    idioma: en\n')).toBe(false)
})

test('the band counts today, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'letco-atalhos' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/sam' }))
  on('clock.now', () => ({ value: new Date(2026, 10, 13, 10).getTime() }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('.md') ? LISTA : 'usuario:\n  nome: Sam\n' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /para hoje/ }))?.text).toBe('2 para hoje · 1 feita · 1 adiada')
    expect(await ui.find({ type: 'Button', key: 'registrar' })).toBeTruthy()
    await ui.unmount()
  }
})

test('the pane lists the day, and hiding the band leaves it to the engine', async ($, on) => {
  on('command.register', () => ({ value: { command: 'letco-atalhos' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/sam' }))
  on('clock.now', () => ({ value: new Date(2026, 10, 13, 10).getTime() }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('.md') ? LISTA : 'usuario:\n  idioma: en\n' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const pane = await $.ui.mount({
    plugin: 'letco',
    component: 'Pane',
    requestId: 'letco-hoje',
    surface: 'desktop',
    props: {
      title: 'Letco',
      isFocused: false,
      bodyColumns: 40,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })
  expect((await pane.find({ type: 'Text', text: /For today/ }))?.text).toBe('For today · 2')
  expect(await pane.find({ type: 'Text', text: /menu lateral/ })).toBeTruthy()
  await pane.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'esconder' })
  await band.unmount()

  const again = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await again.find({ type: 'Text' }))?.text).toBe('engine')
  await again.unmount()
})
