import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isTauri } from './lib/api'
import { ErrorBoundary } from './components/ErrorBoundary'

if (!isTauri) document.documentElement.classList.add('web')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// sem o menu nativo do WebView ("Reload"); continua valendo em campos de texto e com texto selecionado
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, [contenteditable="true"]')) return
  if (window.getSelection()?.toString()) return
  e.preventDefault()
})
