import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMemo } from 'react'
import { GitPullRequest, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { isEn, t } from '../lib/i18n'
import { normalize } from '../lib/plan'
import { PLAN_HREF, planLinker } from '../lib/planLinks'
import { PR_LINK_RE } from '../lib/prs'
import type { Plan } from '../lib/types'
import { useLinkPRs, useStore } from '../store'
import { cn, StatusIcon } from './ui'

/** PR citado no texto: botão que abre o PR no Chrome */
function PrButton({ href, repo, children }: { href: string; repo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={t(`Abrir ${repo} no Chrome`, `Open ${repo} in Chrome`)}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        api.openInChrome(href)
      }}
      className="mx-[1px] inline-flex h-[19px] translate-y-[-1px] items-center gap-[3px] rounded-[5px] border border-[var(--border-strong)] bg-[var(--bg)] px-[5px] align-middle text-[12px] font-medium leading-none text-[var(--text)] no-underline transition-colors hover:border-accent/60 hover:text-accent"
    >
      <GitPullRequest size={11} strokeWidth={2.2} className="flex-none" />
      {children}
    </button>
  )
}

const DISCORD_LINK_RE = /^https:\/\/discord\.com\/channels\/(@me|\d+)\/\d+\/\d+$/

/** link de mensagem do Discord: botão pequeno no lugar da URL comprida */
function DiscordButton({ href }: { href: string }) {
  return (
    <button
      type="button"
      title={t('Abrir a mensagem no Discord', 'Open the message in Discord')}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        api.openUrl(href)
      }}
      className="mx-[1px] inline-flex h-[19px] translate-y-[-1px] items-center gap-[3px] rounded-[5px] border border-[var(--border-strong)] bg-[var(--bg)] px-[5px] align-middle text-[12px] font-medium leading-none text-[var(--text-2)] transition-colors hover:border-[#5865f2]/60 hover:text-[#5865f2]"
    >
      <MessageCircle size={11} strokeWidth={2.2} className="flex-none" />
      Discord
    </button>
  )
}

/** plano citado no texto: botão com o status e o título, que abre o plano */
function PlanButton({ id, children }: { id: string; children: React.ReactNode }) {
  const plan = useStore((s) => s.plans.find((p) => p.fm.id === id))
  const go = useStore((s) => s.go)
  if (!plan) return <>{children}</>
  const titulo = plan.fm.titulo.length > 44 ? `${plan.fm.titulo.slice(0, 42)}…` : plan.fm.titulo
  return (
    <button
      type="button"
      title={t(`Abrir o plano ${plan.fm.titulo} (${id})`, `Open plan ${plan.fm.titulo} (${id})`)}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        go({ kind: 'plan', id })
      }}
      className="mx-[1px] inline-flex h-[19px] max-w-full translate-y-[-1px] items-center gap-[4px] rounded-[5px] border border-[var(--border-strong)] bg-[var(--bg)] px-[5px] align-middle text-[12px] font-medium leading-none text-[var(--text)] no-underline transition-colors hover:border-accent/60 hover:text-accent"
    >
      <StatusIcon status={plan.fm.status} size={11} />
      <span className="truncate">{titulo}</span>
    </button>
  )
}

/** títulos de seção conhecidos (marcadores em português no arquivo), traduzidos só na tela */
const HEADINGS_EN: Record<string, string> = {
  'para voce': 'For you',
  objetivo: 'Goal',
  fases: 'Phases',
  'decisoes em aberto': 'Open decisions',
  'pessoas e cobrancas': 'People and follow-ups',
  log: 'Log',
  'ultima analise': 'Latest analysis',
  'precisa de voce': 'Needs you',
}

/** título de seção no idioma do app; o arquivo continua com o marcador em português */
export function headingLabel(text: string) {
  if (!isEn()) return text
  return HEADINGS_EN[normalize(text).replace(/:$/, '')] ?? text
}

function headingChildren(children: React.ReactNode) {
  if (typeof children === 'string') return headingLabel(children)
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') return headingLabel(children[0])
  return children
}

const linkComponents: Components = {
  a: ({ href, children }) => {
    if (href?.startsWith(PLAN_HREF)) return <PlanButton id={href.slice(PLAN_HREF.length)}>{children}</PlanButton>
    const pr = href?.match(PR_LINK_RE)
    if (href && pr) return <PrButton href={href} repo={`${pr[1]}#${pr[2]}`}>{children}</PrButton>
    if (href && DISCORD_LINK_RE.test(href)) return <DiscordButton href={href} />
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (href) api.openUrl(href)
        }}
        className="cursor-pointer text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
      >
        {children}
      </a>
    )
  },
}

/**
 * Markdown renderizado. `onToggle` recebe a linha (0-based, relativa ao texto)
 * de um checkbox clicado — usado para marcar decisões e cobranças no arquivo.
 * Com `plan`, menções a PR (#807) viram botões que abrem o PR no Chrome.
 * Ids de outros planos citados no texto viram botões que abrem o plano.
 */
export function Markdown({
  children,
  inline,
  onToggle,
  className,
  plan,
}: {
  children: string
  inline?: boolean
  onToggle?: (line: number) => void
  className?: string
  plan?: Plan
}) {
  const plans = useStore((s) => s.plans)
  const linkPlans = useMemo(() => planLinker(plans.map((p) => p.fm.id), plan?.fm.id), [plans, plan?.fm.id])
  const text = linkPlans(useLinkPRs(plan)(children))
  if (inline) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ ...linkComponents, p: ({ children }) => <>{children}</> }}>
        {text}
      </ReactMarkdown>
    )
  }
  return (
    <div className={cn('prose prose-zinc dark:prose-invert', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...linkComponents,
          h2: ({ node: _node, children, ...props }) => <h2 {...props}>{headingChildren(children)}</h2>,
          h3: ({ node: _node, children, ...props }) => <h3 {...props}>{headingChildren(children)}</h3>,
          input: ({ node, ...props }) =>
            props.type === 'checkbox' ? (
              <input
                type="checkbox"
                className="check align-[-3px]"
                checked={!!props.checked}
                disabled={!onToggle}
                onChange={() => {
                  const line = node?.position?.start.line
                  if (onToggle && line) onToggle(line - 1)
                }}
              />
            ) : (
              <input {...props} />
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
