import { useState } from 'react'
import { Archive, BellRing, CheckCheck, Circle, Copy, ExternalLink, Eye, KeyRound, MessageCircle, Play, Scale, ScanSearch, Smartphone, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Ask, AskKind, Plan } from '../lib/types'
import { api } from '../lib/api'
import { ASK_LABEL, toggleLine } from '../lib/plan'
import { relativeAge } from '../lib/dates'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { Markdown } from './Markdown'
import { Button, cn } from './ui'

export const ASK_ICON: Record<AskKind, typeof Play> = {
  continuar: Play,
  testar: Smartphone,
  decidir: Scale,
  mensagem: MessageCircle,
  cobrar: BellRing,
  aprovar: CheckCheck,
  revisar: Eye,
  acesso: KeyRound,
  arquivar: Archive,
  outro: Circle,
}

export function AskChip({ kind }: { kind: AskKind }) {
  const Icon = ASK_ICON[kind]
  return (
    <span className="inline-flex h-[20px] flex-none items-center gap-1 rounded-full bg-accent-soft px-1.5 text-[11.5px] font-medium text-accent">
      <Icon size={11} strokeWidth={2.2} /> {ASK_LABEL[kind]}
    </span>
  )
}

/** texto entre aspas no item de mensagem = rascunho pronto para copiar */
function draftOf(label: string) {
  return label.match(/[“"]([^”"]{8,})[”"]/)?.[1]
}

function urlOf(label: string) {
  return label.match(/https?:\/\/[^\s`)"”]+/)?.[0]?.replace(/[.,;]+$/, '')
}

/** o que o botão de cada tipo faz: abrir a IA focada no item, copiar o rascunho ou abrir o link */
function aiAction(kind: AskKind): string | undefined {
  const labels: Partial<Record<AskKind, string>> = {
    aprovar: t('Aprovar', 'Approve'),
    continuar: t('Fazer com IA', 'Do with AI'),
    revisar: t('Revisar com IA', 'Review with AI'),
    decidir: t('Decidir com IA', 'Decide with AI'),
    testar: t('Roteiro', 'Test steps'),
    acesso: t('Como fazer', 'How to'),
    arquivar: t('Ver com IA', 'Check with AI'),
    outro: t('Fazer com IA', 'Do with AI'),
  }
  return labels[kind]
}

/** tarefaFile: quando o item vem das tarefas do dia, a IA marca a linha de lá também */
export function AskAction({ plan, ask, tarefaFile }: { plan: Plan; ask: Ask; tarefaFile?: string }) {
  const act = useStore((s) => s.act)
  const draft = ask.kind === 'mensagem' || ask.kind === 'cobrar' ? draftOf(ask.label) : undefined
  const url = ask.kind === 'testar' || ask.kind === 'acesso' ? urlOf(ask.label) : undefined
  const ai = aiAction(ask.kind)
  const Icon = ASK_ICON[ask.kind]
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <div className="flex flex-none items-center gap-1" onClick={stop}>
      {url && (
        <Button size="sm" variant="ghost" onClick={() => api.openUrl(url)}>
          <ExternalLink size={13} /> {t('Abrir', 'Open')}
        </Button>
      )}
      {draft && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            navigator.clipboard.writeText(draft).then(
              () => toast.success(t('Mensagem copiada', 'Message copied'), { description: t('Cole e envie você mesmo.', 'Paste and send it yourself.') }),
              () => toast.error(t('Não consegui copiar', "Couldn't copy")),
            )
          }
        >
          <Copy size={13} /> {t('Copiar mensagem', 'Copy message')}
        </Button>
      )}
      {ai && (
        <Button size="sm" variant={ask.kind === 'aprovar' ? 'primary' : 'secondary'} onClick={() => act(plan, ask, tarefaFile)}>
          <Icon size={13} /> {ai}
        </Button>
      )}
    </div>
  )
}

/** Topo do plano: do que se trata, como está e o que depende do usuário, em palavras simples. */
export function ParaVoceCard({ plan }: { plan: Plan }) {
  const savePlan = useStore((s) => s.savePlan)
  const conferir = useStore((s) => s.conferir)
  const [leaving, setLeaving] = useState<number | null>(null)
  const pv = plan.paraVoce
  const pending = pv?.acoes.filter((a) => !a.done) ?? []
  const done = pv?.acoes.filter((a) => a.done) ?? []

  if (!pv) {
    return (
      <section className="mt-5 flex items-center gap-3 rounded-[12px] border border-dashed border-[var(--border-strong)] px-4 py-3">
        <Sparkles size={16} className="flex-none text-[var(--text-3)]" />
        <div className="flex-1 text-[13px] text-[var(--text-2)]">
          {t(
            'Ainda sem resumo para você. O investigador confere no GitHub e escreve aqui o que é o plano e o que depende de você.',
            'No summary for you yet. The investigator checks GitHub and writes here what the plan is about and what depends on you.',
          )}
        </div>
        <Button size="sm" onClick={() => conferir(plan)}>
          <ScanSearch size={13} /> {t('Conferir agora', 'Check now')}
        </Button>
      </section>
    )
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[12px] border border-accent/25 bg-accent-soft/40">
      <div className="px-4 pb-3 pt-3.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-accent">
          <Sparkles size={12} /> {t('Para você', 'For you')}
        </div>
        {pv.resumo && (
          <p className="selectable text-[14.5px] leading-relaxed">
            <Markdown inline plan={plan}>{pv.resumo}</Markdown>
          </p>
        )}
        {pv.situacao && (
          <p className="selectable mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-2)]">
            <Markdown inline plan={plan}>{pv.situacao}</Markdown>
          </p>
        )}
      </div>

      <div className="border-t border-accent/15 bg-[var(--bg)]/70 px-2 py-1.5">
        {pending.length ? (
          pending.map((a) => {
            return (
              <div key={a.line} className={cn('group flex items-start gap-3 rounded-[8px] px-2 py-2 hover:bg-[var(--bg-hover)]', leaving === a.line && 'opacity-40')}>
                <input
                  type="checkbox"
                  className="check mt-[2px]"
                  checked={leaving === a.line}
                  onChange={() => {
                    setLeaving(a.line)
                    setTimeout(() => {
                      savePlan(plan, toggleLine(plan, a.line), `feito: ${a.label.slice(0, 60)}`)
                      setLeaving(null)
                    }, 300)
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <AskChip kind={a.kind} />
                    <span className="selectable text-[13.5px] leading-snug">
                      <Markdown inline plan={plan}>{a.label}</Markdown>
                    </span>
                  </div>
                </div>
                <AskAction plan={plan} ask={a} />
              </div>
            )
          })
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-2 text-[13px] text-[var(--text-2)]">
            <CheckCheck size={15} className="flex-none text-emerald-600 dark:text-emerald-400" />
            <span>
              <span className="font-medium text-[var(--text)]">{t('Nada para você agora.', 'Nothing for you right now.')}</span>{' '}
              {pv.nada?.replace(/^(nada( agora)?|nothing( right now| for now)?( for you)?)\s*[—–:-]?\s*/i, '')}
            </span>
          </div>
        )}
        {done.length > 0 && <div className="px-2 pb-1 text-[11.5px] text-[var(--text-3)]">{t(`${done.length} já resolvido(s)`, `${done.length} already resolved`)}</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-accent/15 px-4 py-2 text-[11.5px] text-[var(--text-3)]">
        <ScanSearch size={12} className="flex-none" />
        <span className="min-w-0 flex-1 truncate">
          {pv.conferido
            ? t(`Conferido ${relativeAge(pv.conferido)}`, `Checked ${relativeAge(pv.conferido)}`)
            : t('Ainda não conferido no GitHub', 'Not checked on GitHub yet')}
          {pv.fonte ? ` · ${pv.fonte}` : ''}
        </span>
        <button onClick={() => conferir(plan)} className="flex-none font-medium text-accent hover:underline">
          {t('Conferir agora', 'Check now')}
        </button>
      </div>
    </section>
  )
}
