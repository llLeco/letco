import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Dia, Tarefa } from '../types'

// The Letco band above the prompt: today's count and three shortcuts.
// "Today" opens a pane with the daily list, read straight from
// ~/planos/tarefas/<today>.md. /letco-atalhos hides or shows the band.

const PANE = 'letco-hoje'
const VAZIO: Dia = { data: '', isEn: false, hasArquivo: false, tarefas: [] }

const isHidden = atom({ plugin: 'letco', key: 'isHidden' } as const, false)
const dia = atom({ plugin: 'letco', key: 'dia' } as const, VAZIO, { shape: 'dia-1' })

const TIPOS = ['Continuar', 'Testar no app', 'Decidir', 'Mensagem', 'Cobrar', 'Aprovar', 'Revisar', 'Acesso', 'Arquivar']
const TIPOS_EN: Record<string, string> = {
  Continuar: 'Continue',
  'Testar no app': 'Test in the app',
  Decidir: 'Decide',
  Mensagem: 'Message',
  Cobrar: 'Follow up',
  Aprovar: 'Approve',
  Revisar: 'Review',
  Acesso: 'Access',
  Arquivar: 'Archive',
}

const pad = (n: number) => String(n).padStart(2, '0')

function hoje(ms: number): string {
  const d = new Date(ms)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The lines of tarefas/<day>.md: `- [ ] Tipo: texto <!-- plano: id -->`, with an optional `  - Adiado até AAAA-MM-DD` below. */
export function lerTarefas(raw: string, data: string): Tarefa[] {
  const tarefas: Tarefa[] = []

  for (const line of raw.split('\n')) {
    const item = /^- \[( |x|X)\] (.*)$/.exec(line)
    if (item) {
      const texto = (item[2] ?? '').replace(/\s*<!--.*?-->\s*/g, ' ').trim()
      const tipo = TIPOS.find(t => texto.startsWith(`${t}:`)) ?? ''
      tarefas.push({
        texto: tipo ? texto.slice(tipo.length + 1).trim() : texto,
        tipo,
        isFeita: item[1] !== ' ',
        adiadaAte: null,
      })
      continue
    }

    const adiado = /^\s+- Adiado até (\d{4}-\d{2}-\d{2})/.exec(line)
    const ultima = tarefas[tarefas.length - 1]
    if (adiado && ultima && adiado[1] && adiado[1] > data) {
      ultima.adiadaAte = adiado[1]
    }
  }

  return tarefas
}

/** `usuario.idioma: en` in projetos.yaml (the projects have an `idioma` of their own, so only the `usuario` block counts). */
export function idiomaEn(yaml: string): boolean {
  const bloco = /^usuario:[ \t]*\n((?:[ \t]+.*\n?)*)/m.exec(yaml)

  return bloco ? /^[ \t]+idioma:[ \t]*["']?en\b/m.test(bloco[1] ?? '') : false
}

function partes(d: Dia) {
  const abertas = d.tarefas.filter(t => !t.isFeita && !t.adiadaAte)
  const adiadas = d.tarefas.filter(t => !t.isFeita && t.adiadaAte)
  const feitas = d.tarefas.filter(t => t.isFeita)

  return { abertas, adiadas, feitas }
}

function resumo(d: Dia): string {
  const t = (pt: string, en: string) => (d.isEn ? en : pt)
  if (!d.hasArquivo) {
    return t('sem lista hoje', 'no list today')
  }

  const { abertas, adiadas, feitas } = partes(d)
  const bits = [abertas.length === 0 ? t('nada aberto', 'nothing open') : t(`${abertas.length} para hoje`, `${abertas.length} for today`)]
  if (feitas.length > 0) {
    bits.push(t(`${feitas.length} ${feitas.length === 1 ? 'feita' : 'feitas'}`, `${feitas.length} done`))
  }
  if (adiadas.length > 0) {
    bits.push(t(`${adiadas.length} ${adiadas.length === 1 ? 'adiada' : 'adiadas'}`, `${adiadas.length} postponed`))
  }

  return bits.join(' · ')
}

// Reads today's list and the app language; a missing file is just "no list today".
async function carregar($: EngineInterface): Promise<void> {
  const home = await $.env.get('HOME')
  if (!home) {
    return
  }

  const data = hoje(await $.clock.now())
  const raiz = `${home}/planos`
  const texto = async (path: string) => ((await $.fs.exists(path)) ? await $.fs.read(path) : null)
  const [arquivo, config] = await Promise.all([texto(`${raiz}/tarefas/${data}.md`), texto(`${raiz}/projetos.yaml`)])

  await update($, dia, () => ({
    data,
    isEn: config ? idiomaEn(config) : false,
    hasArquivo: arquivo !== null,
    tarefas: arquivo ? lerTarefas(arquivo, data) : [],
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'letco-atalhos',
      description: 'Hide or show the Letco buttons above the prompt · Esconde ou mostra os botões do Letco',
    })
    void carregar($).catch(() => undefined)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void carregar($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'letco-atalhos' }, async $ => {
    const hidden = await read($, isHidden)
    const { isEn } = await read($, dia)
    await update($, isHidden, () => !hidden)

    if (hidden) {
      return { text: isEn ? 'Letco buttons are back.' : 'Botões do Letco à mostra.' }
    }

    return {
      text: isEn
        ? 'Letco buttons hidden. /letco-atalhos shows them again.'
        : 'Botões do Letco escondidos. /letco-atalhos mostra de novo.',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const d = await read($, dia)
    const t = (pt: string, en: string) => (d.isEn ? en : pt)
    const busy = e.props.isWorking

    return (
      <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
        <Text weight="semibold">Letco</Text>
        <Text dimColor tabular>
          {resumo(d)}
        </Text>
        <Button
          key="registrar"
          variant="primary"
          label={t('Registrar sessão', 'Record session')}
          onPress={() => {
            if (busy) {
              $.ui.toast(t('Espere o turno terminar para registrar no Letco.', 'Wait for the turn to end to record it in Letco.'))
              return
            }
            void $.prompt.submit({
              text: t(
                'Use a skill letco: registre nos meus planos do Letco (~/planos) o que esta sessão fez até agora.',
                'Use the letco skill: record in my Letco plans (~/planos) what this session has done so far.',
              ),
              asUser: true,
            })
          }}
        />
        <Button
          key="hoje"
          variant="secondary"
          label={t('Lista do dia', 'Today')}
          onPress={async () => {
            await carregar($).catch(() => undefined)
            const opened = await $.ui.open({ id: PANE, title: t('Letco · hoje', 'Letco · today') })
            if (!opened.isPlaced) {
              $.ui.toast(resumo(await read($, dia)))
            }
          }}
        />
        <Button
          key="atualizar"
          variant="secondary"
          label={t('Atualizar app', 'Update app')}
          onPress={async () => {
            // builds and reinstalls the app: it stays in the composer for the person to send
            const filled = await $.prompt.fill({ text: '/letco-atualizar', mode: 'replace' })
            $.ui.toast(
              filled.isFilled
                ? t('Pressione Enter para atualizar o Letco.', 'Press Enter to update Letco.')
                : t('Digite /letco-atualizar para atualizar o Letco.', 'Type /letco-atualizar to update Letco.'),
            )
          }}
        />
        <Button
          key="esconder"
          role="dismiss"
          dimColor
          label={t('Esconder', 'Hide')}
          onPress={async () => {
            await update($, isHidden, () => true)
            $.ui.toast(t('/letco-atalhos mostra os botões de novo.', '/letco-atalhos shows the buttons again.'))
          }}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const d = await read($, dia)
    const t = (pt: string, en: string) => (d.isEn ? en : pt)
    const { abertas, adiadas, feitas } = partes(d)
    const tipo = (x: Tarefa) => (d.isEn ? (TIPOS_EN[x.tipo] ?? x.tipo) : x.tipo)
    const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

    const linha = (x: Tarefa, marca: string, apagada: boolean) => (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>{marca}</Text>
        <Box flexDirection="column" flexShrink={1}>
          {x.tipo !== '' && (
            <Text size="caption" weight="semibold" color={apagada ? 'inactive' : 'suggestion'}>
              {tipo(x)}
              {x.adiadaAte ? ` · ${t('até', 'until')} ${dataCurta(x.adiadaAte)}` : ''}
            </Text>
          )}
          <Text dimColor={apagada} strikethrough={x.isFeita}>
            {x.texto}
          </Text>
        </Box>
      </Box>
    )

    const grupo = (titulo: string, lista: Tarefa[], marca: string, apagada: boolean) =>
      lista.length > 0 && (
        <Box flexDirection="column" gap={1}>
          <Text size="footnote" weight="semibold" dimColor>
            {titulo} · {lista.length}
          </Text>
          {lista.map(x => linha(x, marca, apagada))}
        </Box>
      )

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Text weight="semibold">{d.data ? `${t('Hoje', 'Today')} · ${dataCurta(d.data)}` : t('Hoje', 'Today')}</Text>
          <Button
            key="recarregar"
            dimColor
            label={t('Recarregar', 'Reload')}
            onPress={() => void carregar($).catch(() => undefined)}
          />
        </Box>
        {!d.hasArquivo && (
          <Text dimColor>
            {t(
              'Ainda não há lista para hoje. A rotina da manhã cria o arquivo em ~/planos/tarefas.',
              'No list for today yet. The morning routine creates the file in ~/planos/tarefas.',
            )}
          </Text>
        )}
        {d.hasArquivo && abertas.length === 0 && <Text dimColor>{t('Nada aberto para hoje.', 'Nothing open for today.')}</Text>}
        {grupo(t('Para hoje', 'For today'), abertas, '○', false)}
        {grupo(t('Adiadas', 'Postponed'), adiadas, '◷', true)}
        {grupo(t('Feitas', 'Done'), feitas, '✓', true)}
      </Box>
    )
  })
}
