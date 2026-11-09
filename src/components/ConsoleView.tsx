import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { api, isTauri } from '../lib/api'
import { consolePrompt } from '../lib/prompt'
import { t as tr } from '../lib/i18n'
import { useStore } from '../store'
import { Button, Empty } from './ui'

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** Console: Claude Code rodando em ~/planos, dentro do app, já com as regras da ferramenta. */
export function ConsoleView() {
  const root = useStore((s) => s.env?.root ?? '~/planos')
  const box = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const [exited, setExited] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (!isTauri || !box.current) return
    const t = new Terminal({
      fontFamily: '"SF Mono", Menlo, Monaco, monospace',
      fontSize: 12.5,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: {
        background: cssVar('--bg', '#1c1c1e'),
        foreground: cssVar('--text', '#e5e5e5'),
        cursor: cssVar('--text', '#e5e5e5'),
        selectionBackground: 'rgba(120,120,255,0.3)',
      },
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(box.current)
    f.fit()
    term.current = t
    fit.current = f
    setExited(false)

    let offData: (() => void) | undefined
    let offExit: (() => void) | undefined
    let disposed = false
    let lastData = Date.now()
    let waiter: ReturnType<typeof setInterval> | undefined
    ;(async () => {
      const { listen } = await import('@tauri-apps/api/event')
      offData = await listen<string>('console://data', (e) => {
        lastData = Date.now()
        t.write(decode(e.payload))
      })
      offExit = await listen('console://exit', () => {
        setExited(true)
        t.write(`\r\n\x1b[2m${tr('[sessão encerrada — clique em Reiniciar para abrir outra]', '[session ended — click Restart to open another]')}\x1b[0m\r\n`)
      })
      if (disposed) return
      try {
        const t0 = Date.now()
        const before = await api.consoleStart(consolePrompt(root), t.cols, t.rows)
        if (before) t.write(decode(before))
        t.focus()
        // pedido vindo de outra tela (ex.: "Sua decisão" num item): cola quando o Claude Code estiver parado
        const queued = useStore.getState().takeConsoleQueue()
        if (queued) {
          const fresh = !before
          waiter = setInterval(() => {
            const quiet = Date.now() - lastData > 1200
            const warm = Date.now() - t0 > (fresh ? 3500 : 300)
            if (!quiet || !warm) return
            clearInterval(waiter)
            api.consoleWrite(`\x1b[200~${queued}\x1b[201~`).then(() => setTimeout(() => api.consoleWrite('\r').catch(() => undefined), 400))
          }, 250)
        }
      } catch (e) {
        t.write(`\x1b[31m${String(e)}\x1b[0m\r\n`)
        toast.error(tr('Não consegui abrir o console', "Couldn't open the console"), { description: String(e) })
      }
    })()

    const input = t.onData((d) => api.consoleWrite(d).catch(() => undefined))
    const ro = new ResizeObserver(() => {
      try {
        f.fit()
        api.consoleResize(t.cols, t.rows).catch(() => undefined)
      } catch {
        /* sem tamanho ainda */
      }
    })
    ro.observe(box.current)

    return () => {
      disposed = true
      if (waiter) clearInterval(waiter)
      ro.disconnect()
      input.dispose()
      offData?.()
      offExit?.()
      t.dispose()
      term.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  async function restart() {
    await api.consoleStop().catch(() => undefined)
    setRun((n) => n + 1)
  }

  if (!isTauri)
    return (
      <div className="mx-auto w-full max-w-[760px] px-8 pt-2">
        <Empty icon={<SquareTerminal size={28} />} title={tr('O console só funciona no app', 'The console only works in the app')}>
          {tr('Abra o Letco instalado para conversar com o Claude Code aqui.', 'Open the installed Letco app to talk to Claude Code here.')}
        </Empty>
      </div>
    )

  return (
    <div className="flex h-full min-h-0 w-full flex-col px-6 pb-4 pt-2">
      <header className="flex flex-none items-end gap-3 pb-3">
        <div className="flex-1">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Console</h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-2)]">
            {tr('Claude Code em', 'Claude Code in')} <code>{root}</code>
            {tr(
              ', já com as regras da ferramenta. Peça em palavras simples: "o que tenho hoje?", "marca a tarefa do Rui como feita", "lê o Discord agora".',
              ', already set up with the tool\'s rules. Ask in plain words: "what do I have today?", "mark the Rui task as done", "read Discord now".',
            )}
          </p>
        </div>
        <Button size="sm" variant={exited ? 'primary' : 'ghost'} onClick={restart}>
          <RotateCcw size={13} /> {tr('Reiniciar', 'Restart')}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-2">
        <div ref={box} className="h-full w-full" />
      </div>
    </div>
  )
}
