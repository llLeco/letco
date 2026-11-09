import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { Check, CircleCheck, CircleDashed, CircleDot, FileText, MessageCircle, OctagonAlert, Send, X } from 'lucide-react'
import { decisionPrompt, itemPrompt } from '../lib/prompt'
import { todayISO } from '../lib/dates'
import type { Conferido } from '../lib/conferido'
import { parseDay } from '../lib/dates'
import type { Plan } from '../lib/types'
import { api } from '../lib/api'
import { dfLocale, isEn, t } from '../lib/i18n'
import { useStore } from '../store'
import { Modal } from './Dialogs'
import { Markdown } from './Markdown'
import { ClaudeLogo } from './ClaudeLogo'
import { Button, cn, IconButton, ProjectChip, STATUS_META, StatusIcon, Tooltip } from './ui'

const LOOK = {
  feito: { get label() { return t('Já feito', 'Done') }, icon: CircleCheck, cls: 'text-emerald-600 dark:text-emerald-400' },
  parcial: { get label() { return t('Em parte', 'Partly done') }, icon: CircleDot, cls: 'text-amber-600 dark:text-amber-400' },
  pendente: { get label() { return t('Pendente', 'Pending') }, icon: CircleDashed, cls: 'text-[var(--text-3)]' },
  bloqueado: { get label() { return t('Bloqueado', 'Blocked') }, icon: OctagonAlert, cls: 'text-[#e5484d]' },
} as const

/** selo pequeno com o que o revisor achou; o detalhe fica na janela do item */
export function ConferidoBadge({ c }: { c: Conferido }) {
  const look = LOOK[c.status]
  const Icon = look.icon
  const day = parseDay(c.date)
  const blocker = useStore((s) => (c.blockedBy ? s.plans.find((p) => p.fm.id === c.blockedBy) : undefined))
  if (c.status === 'bloqueado')
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-[var(--text-3)]" title={
          blocker
            ? t(`Travado pelo plano ${blocker.fm.titulo}. Clique no card para ver.`, `Blocked by plan ${blocker.fm.titulo}. Click the card to see more.`)
            : t('Travado por outro trabalho. Clique no card para ver.', 'Blocked by other work. Click the card to see more.')
        }>
        <Icon size={11} className={cn('flex-none', look.cls)} />
        <span className={cn('flex-none font-medium', look.cls)}>{look.label}</span>
        {blocker && <span className="truncate">{t('por', 'by')} {blocker.fm.titulo}</span>}
      </span>
    )
  return (
    <span className="inline-flex flex-none items-center gap-1 text-[11.5px] text-[var(--text-3)]" title={t('Conferência do revisor no GitHub e nos repositórios locais. Clique no card para ver.', "Reviewer's check on GitHub and local repositories. Click the card to see more.")}>
      <Icon size={11} className={cn('flex-none', look.cls)} />
      <span className={cn(c.status !== 'pendente' && look.cls)}>{look.label}</span>
      <span>· {t('revisor', 'reviewer')}{day ? ` ${format(day, isEn() ? 'MM/dd' : 'dd/MM')}` : ''}</span>
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] px-5 py-3">
      <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">{title}</div>
      {children}
    </div>
  )
}

export interface ItemDetail {
  /** chip do tipo (Cobrar, Revisar…) ou o nome da pessoa */
  head: React.ReactNode
  text: string
  plan?: Plan
  conferido?: Conferido
  discord?: { url: string; at: number; canal?: string }
  /** botões do item (Copiar mensagem, Fazer com IA…) */
  actions?: React.ReactNode
  done?: boolean
  onDone?: () => void
  doneLabel?: string
  /** onde o item mora, para o agente achar a linha (ex.: tarefa em tarefas/2026-10-28.md) */
  where?: string
}

/** janela de detalhes de uma tarefa ou cobrança: texto inteiro, origem, conferência do revisor e ações */
export function ItemDetailDialog({ item, onClose }: { item: ItemDetail | null; onClose: () => void }) {
  const go = useStore((s) => s.go)
  const root = useStore((s) => s.env?.root ?? '~/planos')
  const sendToConsole = useStore((s) => s.sendToConsole)
  const project = useStore((s) => (item?.plan ? s.project(item.plan.projectSlug) : undefined))
  const blocker = useStore((s) => (item?.conferido?.blockedBy ? s.plans.find((p) => p.fm.id === item.conferido!.blockedBy) : undefined))
  const [texto, setTexto] = useState('')
  const close = () => {
    setTexto('')
    onClose()
  }
  // um plano citado no texto abre por cima: a janela fecha junto
  const view = useStore((s) => s.view)
  const viewAtOpen = useRef(view)
  useEffect(() => {
    if (!item) viewAtOpen.current = view
    else if (view !== viewAtOpen.current) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, item])
  const talkItem = useStore((s) => s.talkItem)
  /** o que o agente precisa saber do item, igual para "Sua decisão" e "Abrir no Claude Code" */
  const context = (it: ItemDetail) => {
    const c = it.conferido
    return {
      root,
      item: it.text,
      where: it.where ?? (it.plan ? t(`no plano ${it.plan.fm.titulo}`, `in plan ${it.plan.fm.titulo}`) : t('nas tarefas do dia', "in today's tasks")),
      plan: it.plan && { titulo: it.plan.fm.titulo, path: it.plan.path, id: it.plan.fm.id },
      conferido: c && `${LOOK[c.status].label}${c.blockedBy ? t(` pelo plano ${c.blockedBy}`, ` by plan ${c.blockedBy}`) : ''} (${c.date}): ${c.text}`,
      origem: it.discord && `Discord${it.discord.canal ? ` #${it.discord.canal}` : ''}, ${new Date(it.discord.at).toISOString().slice(0, 16).replace('T', ' ')} — ${it.discord.url}`,
      today: todayISO(),
      idioma: project?.idioma,
    }
  }
  const send = () => {
    if (!item || !texto.trim()) return
    sendToConsole(decisionPrompt({ ...context(item), texto }))
    close()
  }
  const openClaude = () => {
    if (!item) return
    talkItem(itemPrompt(context(item)), item.plan)
    close()
  }
  const c = item?.conferido
  const look = c ? LOOK[c.status] : undefined
  const Icon = look?.icon
  const day = c ? parseDay(c.date) : undefined
  return (
    <Modal open={!!item} onClose={close} title={t('Detalhes', 'Details')} className="w-[min(600px,92vw)]">
      {item && (
        <div className="flex max-h-[76vh] flex-col">
          <div className="flex items-start gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {item.head}
                {project && <ProjectChip name={project.nome} color={project.cor} />}
                {item.done && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                    <Check size={12} /> {t('resolvido', 'resolved')}
                  </span>
                )}
              </div>
              <div className="selectable text-[14.5px] leading-relaxed">
                <Markdown inline plan={item.plan}>{item.text}</Markdown>
              </div>
            </div>
            <IconButton label={t('Fechar', 'Close')} onClick={close}>
              <X size={15} />
            </IconButton>
          </div>

          <div className="scroll-area min-h-0 flex-1">
            {c && look && Icon && (
              <Section title={t('Conferência do revisor', "Reviewer's check")}>
                <div className="flex items-center gap-1.5 text-[13px]">
                  <Icon size={14} className={cn('flex-none', look.cls)} />
                  <span className={cn('font-medium', c.status === 'pendente' ? 'text-[var(--text)]' : look.cls)}>{look.label}</span>
                  {day && (
                    <span className="text-[var(--text-3)]">
                      · {t('conferido em', 'checked on')} {format(day, isEn() ? 'MMM d' : "d 'de' MMM", { locale: dfLocale() })}
                    </span>
                  )}
                </div>
                {c.status === 'bloqueado' && (
                  <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#e5484d]/30 bg-[#e5484d]/[0.06] px-3 py-2 text-[13px]">
                    {blocker ? <StatusIcon status={blocker.fm.status} size={14} /> : <OctagonAlert size={14} className="flex-none text-[#e5484d]" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] text-[var(--text-3)]">{t('Bloqueado por', 'Blocked by')}{blocker ? ` · ${STATUS_META[blocker.fm.status].label.toLowerCase()}` : ''}</div>
                      <div className="truncate font-medium">{blocker?.fm.titulo ?? c.blockedBy ?? t('outro trabalho (o revisor não disse qual plano)', "other work (the reviewer didn't say which plan)")}</div>
                    </div>
                    {blocker && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          close()
                          go({ kind: 'plan', id: blocker.fm.id })
                        }}
                      >
                        {t('Abrir plano', 'Open plan')}
                      </Button>
                    )}
                  </div>
                )}
                <div className="selectable mt-1 text-[13px] leading-relaxed text-[var(--text-2)]">
                  <Markdown inline plan={item.plan}>{c.text}</Markdown>
                </div>
                <div className="mt-1.5 text-[11.5px] text-[var(--text-3)]">
                  {t(
                    'O revisor procura no GitHub (PRs e commits), nos clones locais e no npm antes de gravar a tarefa.',
                    'The reviewer checks GitHub (PRs and commits), local clones and npm before saving the task.',
                  )}
                </div>
              </Section>
            )}

            {(item.discord || item.plan) && (
              <Section title={t('Origem', 'Source')}>
                <div className="flex flex-col gap-2">
                  {item.discord && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <MessageCircle size={14} className="flex-none text-[var(--text-3)]" />
                      <span className="min-w-0 flex-1 truncate text-[var(--text-2)]">
                        {item.discord.canal ? `#${item.discord.canal}` : 'Discord'} · {format(new Date(item.discord.at), isEn() ? 'MMM d, HH:mm' : "d 'de' MMM, HH'h'mm", { locale: dfLocale() })}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => api.openUrl(item.discord!.url)}>
                        {t('Abrir no Discord', 'Open in Discord')}
                      </Button>
                    </div>
                  )}
                  {item.plan && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <FileText size={14} className="flex-none text-[var(--text-3)]" />
                      <span className="min-w-0 flex-1 truncate text-[var(--text-2)]">{item.plan.fm.titulo}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          close()
                          go({ kind: 'plan', id: item.plan!.fm.id })
                        }}
                      >
                        {t('Abrir plano', 'Open plan')}
                      </Button>
                    </div>
                  )}
                </div>
              </Section>
            )}
            <Section title={t('Sua decisão', 'Your decision')}>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={3}
                placeholder={t(
                  'Escreva livremente: “decidi esperar a call do Ken”, “muda o rascunho para…”, “isso já saiu no PR 812”…',
                  'Write freely: “I decided to wait for the call with Ken”, “change the draft to…”, “this already shipped in PR 812”…',
                )}
                className="selectable w-full resize-none rounded-[10px] border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-[var(--text-3)] focus:border-accent/60"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex-1 text-[11.5px] text-[var(--text-3)]">
                  {t('O agente do Console aplica nos planos e nas tarefas, e você acompanha lá. ⌘↩ envia.', 'The Console agent applies it to your plans and tasks, and you can follow along there. ⌘↩ sends.')}
                </span>
                <Button size="sm" variant={texto.trim() ? 'primary' : 'secondary'} disabled={!texto.trim()} onClick={send}>
                  <Send size={13} /> {t('Enviar ao agente', 'Send to agent')}
                </Button>
              </div>
            </Section>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-5 py-3">
            {item.actions}
            <Tooltip label={t('Abrir no Claude Code', 'Open in Claude Code')}>
              <Button variant="secondary" aria-label={t('Abrir no Claude Code', 'Open in Claude Code')} className="w-8 px-0" onClick={openClaude}>
                <ClaudeLogo size={16} />
              </Button>
            </Tooltip>
            <span className="flex-1" />
            {item.onDone && (
              <Button
                variant={item.done ? 'ghost' : 'primary'}
                onClick={() => {
                  item.onDone!()
                  close()
                }}
              >
                <Check size={14} /> {item.done ? t('Reabrir', 'Reopen') : (item.doneLabel ?? t('Marcar como feito', 'Mark as done'))}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
