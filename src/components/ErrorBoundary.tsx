import { Component, type ReactNode } from 'react'

/**
 * Erro ao desenhar a tela: em vez de janela em branco, mostra o que quebrou e um botão para recarregar.
 * Os arquivos em ~/planos não são tocados; o texto é para colar numa issue.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e) }
  }

  componentDidMount() {
    // erros fora do desenho (promessas, eventos) também aparecem aqui, se a tela ainda não desenhou nada
    window.addEventListener('error', this.onError)
    window.addEventListener('unhandledrejection', this.onRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onError)
    window.removeEventListener('unhandledrejection', this.onRejection)
  }

  onError = (e: ErrorEvent) => {
    if (!document.querySelector('[data-app-ready]')) this.setState({ error: `${e.message}\n\n${e.error?.stack ?? `${e.filename}:${e.lineno}`}` })
  }

  onRejection = (e: PromiseRejectionEvent) => {
    if (!document.querySelector('[data-app-ready]')) this.setState({ error: String(e.reason?.stack ?? e.reason) })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg)] p-10">
        <div className="w-full max-w-[640px]">
          <h1 className="text-[18px] font-semibold">O Letco encontrou um erro · Letco hit an error</h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-2)]">
            Seus arquivos em ~/planos não foram alterados. Recarregue; se continuar, copie o texto abaixo numa issue. · Your files in ~/planos were not changed. Reload; if it keeps happening, paste the text below into an issue.
          </p>
          <pre className="mt-4 max-h-[320px] select-text overflow-auto whitespace-pre-wrap rounded-[10px] border border-[var(--border)] p-3 text-[11.5px] leading-relaxed text-[var(--text-2)]">{this.state.error}</pre>
          <button onClick={() => window.location.reload()} className="mt-4 h-8 rounded-[8px] bg-accent px-4 text-[13px] text-white">
            Recarregar · Reload
          </button>
        </div>
      </div>
    )
  }
}
