import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ChevronDown, Hash, Hourglass, MessageCircle, MessagesSquare, RefreshCw, Scale, ScrollText, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { dfLocale, isEn, t } from '../lib/i18n'
import { useStore } from '../store'
import { parseDay } from '../lib/dates'
import { toggleLine } from '../lib/plan'
import { logEntries } from '../lib/digest'
import { discordRef, parseCanais, type DiscordCanal } from '../lib/discord'
import { matchingAsk, parseTarefas, setTarefa, type Tarefa } from '../lib/tarefas'
import type { CheckItem, Plan } from '../lib/types'
import { AskAction, AskChip } from './ParaVoce'
import { ConferidoBadge, ItemDetailDialog } from './Conferido'
import { conferidoAfter, type Conferido } from '../lib/conferido'
import { Markdown } from './Markdown'
import { Button, cn, Empty, ProjectChip, SectionTitle } from './ui'

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-1.5', className)}>{children}</section>
}

type Raw = Awaited<ReturnType<typeof api.loadDiscord>>

interface Pedido {
  file: string
  raw: string
  t: Tarefa
  at: number
  channel: string
}

const when = (ms: number) => format(new Date(ms), isEn() ? 'MM/dd h:mm a' : "dd/MM HH'h'mm")
const ago = (ms: number) => formatDistanceToNowStrict(new Date(ms), { locale: dfLocale() })

/** linha de baixo de cada item: "#dev_channel · 27/10 14h32 · plano" e o selo do revisor */
function Origin({ channel, at, canais, plan, conf }: { channel: string; at: number; canais: DiscordCanal[]; plan?: Plan; conf?: Conferido }) {
  const go = useStore((s) => s.go)
  const nome = canais.find((c) => c.id === channel)?.nome
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-[var(--text-3)]">
      <span className="min-w-0 truncate">
        {nome ? `#${nome}` : 'Discord'} · {when(at)}
        {plan && (
          <>
            {' · '}
            <button
              onClick={(e) => {
                e.stopPropagation()
                go({ kind: 'plan', id: plan.fm.id })
              }}
              className="hover:text-[var(--text-2)] hover:underline"
            >
              {plan.fm.titulo}
            </button>
          </>
        )}
      </span>
      {conf && <ConferidoBadge c={conf} />}
    </div>
  )
}

function PedidoRow({ p, canais, onToggle }: { p: Pedido; canais: DiscordCanal[]; onToggle: (p: Pedido) => void }) {
  const plan = useStore((s) => (p.t.planId ? s.plans.find((x) => x.fm.id === p.t.planId) : undefined))
  const project = useStore((s) => (plan ? s.project(plan.projectSlug) : undefined))
  const [open, setOpen] = useState(false)
  const ref = discordRef(p.t.label)!
  return (
    <>
      <div onClick={() => setOpen(true)} className={cn('group flex min-h-[44px] cursor-default items-start gap-3 rounded-[8px] px-2 py-2 hover:bg-[var(--bg-hover)]', p.t.done && 'opacity-45')}>
        <input type="checkbox" className="check mt-[2px]" checked={p.t.done} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(p)} />
        <div className="min-w-0 flex-1">
          <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-snug', p.t.done && 'line-through decoration-[var(--text-3)]')}>
            <AskChip kind={p.t.kind} />
            <span>
              <Markdown inline plan={plan}>{p.t.label}</Markdown>
            </span>
          </div>
          <Origin channel={p.channel} at={p.at} canais={canais} plan={plan} conf={p.t.done ? undefined : p.t.conferido} />
        </div>
        {!p.t.done && (
          <span className="mt-[3px] flex-none text-[11.5px] text-[var(--text-3)]" title={t('Desde a mensagem', 'Since the message')}>
            {t(`há ${ago(p.at)}`, `${ago(p.at)} ago`)}
          </span>
        )}
        {plan && !p.t.done && <AskAction plan={plan} ask={p.t} tarefaFile={p.file} />}
        {project && <ProjectChip name={project.nome} color={project.cor} />}
      </div>
      <ItemDetailDialog
        onClose={() => setOpen(false)}
        item={
          open
            ? {
                head: <AskChip kind={p.t.kind} />,
                text: p.t.label,
                plan,
                conferido: p.t.conferido,
                discord: { url: ref.url, at: p.at, canal: canais.find((c) => c.id === p.channel)?.nome },
                actions: plan && !p.t.done ? <AskAction plan={plan} ask={p.t} tarefaFile={p.file} /> : undefined,
                done: p.t.done,
                onDone: () => onToggle(p),
                where: `tarefa do dia em ~/planos/tarefas/${p.file} (a linha que começa com "- [${p.t.done ? 'x' : ' '}] ${p.t.text.slice(0, 70)}…"), com a linha Conferido logo abaixo`,
              }
            : null
        }
      />
    </>
  )
}

function CobrancaRow({ plan, item, canais }: { plan: Plan; item: CheckItem; canais: DiscordCanal[] }) {
  const savePlan = useStore((s) => s.savePlan)
  const project = useStore((s) => s.project(plan.projectSlug))
  const ref = discordRef(item.text)!
  const text = item.person ? item.text.slice(item.text.indexOf(':') + 1).trim() : item.text
  const conferido = conferidoAfter(plan.body.split('\n'), item.line)
  const [open, setOpen] = useState(false)
  const resolve = () => savePlan(plan, toggleLine(plan, item.line), `cobrança resolvida: ${text.slice(0, 50)}`)
  return (
    <>
      <div onClick={() => setOpen(true)} className="group flex min-h-[44px] cursor-default items-start gap-3 rounded-[8px] px-2 py-2 hover:bg-[var(--bg-hover)]">
        <input type="checkbox" className="check mt-[2px]" checked={false} onClick={(e) => e.stopPropagation()} onChange={resolve} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug">
            {item.person && <span className="font-medium">{item.person}: </span>}
            <Markdown inline plan={plan}>{text}</Markdown>
          </div>
          <Origin channel={ref.channel} at={ref.at} canais={canais} plan={plan} conf={conferido} />
        </div>
        <span className="mt-[3px] flex-none text-[11.5px] text-[var(--text-3)]">{t(`há ${ago(ref.at)}`, `${ago(ref.at)} ago`)}</span>
        {project && <ProjectChip name={project.nome} color={project.cor} />}
      </div>
      <ItemDetailDialog
        onClose={() => setOpen(false)}
        item={
          open
            ? {
                head: (
                  <span className="inline-flex h-[20px] items-center rounded-full bg-[var(--bg-active)] px-2 text-[11.5px] font-medium">
                    {item.person ? t(`Esperando ${item.person}`, `Waiting on ${item.person}`) : t('Esperando resposta', 'Waiting for a reply')}
                  </span>
                ),
                text,
                plan,
                conferido,
                discord: { url: ref.url, at: ref.at, canal: canais.find((c) => c.id === ref.channel)?.nome },
                onDone: () => void resolve(),
                doneLabel: t('Marcar como resolvida', 'Mark as resolved'),
                where: `cobrança na seção "Pessoas e cobranças" do plano (a linha "- [ ] ${item.text.slice(0, 70)}…"), com a linha Conferido logo abaixo`,
              }
            : null
        }
      />
    </>
  )
}

function Resumo({ project, name, content, open: startOpen }: { project: string; name: string; content: string; open: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const info = useStore((s) => s.project(project))
  const day = parseDay(name.replace(/\.md$/, ''))
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left hover:bg-[var(--bg-hover)]">
        <ChevronDown size={14} className={cn('flex-none text-[var(--text-3)] transition-transform', !open && '-rotate-90')} />
        <span className="text-[13px] font-medium">{day ? format(day, isEn() ? 'EEEE, MMM d' : "EEEE, d 'de' MMM", { locale: dfLocale() }) : name}</span>
        <span className="flex-1" />
        {info && <ProjectChip name={info.nome} color={info.cor} />}
      </button>
      {open && (
        <div className="animate-fade px-3 pb-3 pl-8">
          <Markdown className="text-[13px]">{content.replace(/^#\s.*\n/, '')}</Markdown>
        </div>
      )}
    </div>
  )
}

export function DiscordView() {
  const ws = useStore((s) => s.ws)
  const plans = useStore((s) => s.plans)
  const load = useStore((s) => s.load)
  const savePlan = useStore((s) => s.savePlan)
  const readDiscord = useStore((s) => s.readDiscord)
  const go = useStore((s) => s.go)
  const canais = useMemo(() => parseCanais(ws?.discord), [ws?.discord])
  const [raw, setRaw] = useState<Raw | null>(null)
  const [showDone, setShowDone] = useState(false)

  const reload = useCallback(() => api.loadDiscord().then(setRaw, (e) => toast.error(t('Não consegui ler', "Couldn't read"), { description: String(e) })), [])
  useEffect(() => {
    reload()
  }, [reload, ws])

  // pedidos: tarefas com link do Discord; a mesma mensagem em vários dias vale a versão mais nova
  const pedidos = useMemo(() => {
    const byMsg = new Map<string, Pedido>()
    for (const [file, content] of [...(raw?.tarefas ?? [])].sort((a, b) => a[0].localeCompare(b[0]))) {
      const parsed = parseTarefas(file, content)
      for (const item of parsed.items) {
        const ref = discordRef(item.label)
        if (!ref) continue
        const plan = plans.find((p) => p.fm.id === item.planId)
        const done = item.done || !!matchingAsk(plan, item)?.done
        byMsg.set(`${ref.message}|${item.kind}`, { file, raw: content, t: { ...item, done }, at: ref.at, channel: ref.channel })
      }
    }
    return [...byMsg.values()].sort((a, b) => a.at - b.at)
  }, [raw, plans])
  const pending = useMemo(() => pedidos.filter((p) => !p.t.done), [pedidos])
  const done = pedidos.filter((p) => p.t.done).reverse()

  // esperando outros: cobranças com link; enquanto a cobrança ainda é tarefa sua (Cobrar aberto), ela fica só em Pedidos
  const cobrancas = useMemo(() => {
    const emPedidos = new Set(pending.map((p) => discordRef(p.t.label)!.message))
    return plans
      .filter((p) => p.fm.status !== 'arquivado')
      .flatMap((plan) => plan.cobrancas.filter((i) => !i.done && discordRef(i.text) && !emPedidos.has(discordRef(i.text)!.message)).map((item) => ({ plan, item })))
      .sort((a, b) => discordRef(a.item.text)!.at - discordRef(b.item.text)!.at)
  }, [plans, pending])

  const decisoes = useMemo(
    () =>
      plans
        .flatMap((plan) => logEntries(plan).filter((e) => discordRef(e.text)).map((e) => ({ plan, e, at: discordRef(e.text)!.at })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 20),
    [plans],
  )

  const resumos = useMemo(() => [...(raw?.conversas ?? [])].sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])), [raw])
  const estado = useMemo(() => {
    const m = new Map<string, string>()
    for (const [id, json] of raw?.estado ?? []) {
      try {
        const lido = JSON.parse(json).lido as string | undefined
        if (lido) m.set(id, lido)
      } catch {
        /* estado ilegível: só não mostra a hora */
      }
    }
    return m
  }, [raw])

  async function togglePedido(p: Pedido) {
    const next = setTarefa(p.raw, p.t.line, !p.t.done)
    try {
      if (next !== p.raw) await api.writeText(`tarefas/${p.file}`, next)
      const plan = plans.find((x) => x.fm.id === p.t.planId)
      const ask = matchingAsk(plan, p.t)
      if (plan && ask && ask.done === p.t.done) await savePlan(plan, toggleLine(plan, ask.line), `${p.t.done ? 'reaberto' : 'feito'}: ${ask.label.slice(0, 60)}`)
      await api.gitCommit(`discord: ${p.t.done ? 'reaberto' : 'feito'} ${p.t.label.slice(0, 50)}`).catch(() => undefined)
      await Promise.all([reload(), load()])
    } catch (e) {
      toast.error(t('Não consegui salvar', "Couldn't save"), { description: String(e) })
    }
  }

  const nothing = raw && !pedidos.length && !cobrancas.length && !decisoes.length && !resumos.length

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="pb-5 pt-2">
        <div className="flex items-end gap-3">
          <h1 className="flex-1 text-[26px] font-semibold tracking-[-0.02em]">Discord</h1>
          <Button size="sm" variant="ghost" onClick={() => go({ kind: 'settings' })}>
            <Settings size={13} /> {t('Canais', 'Channels')}
          </Button>
          <Button size="sm" disabled={!canais.length} onClick={() => readDiscord()}>
            <RefreshCw size={13} /> {t('Ler agora', 'Read now')}
          </Button>
        </div>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-2)]">
          {[
            pending.length &&
              (pending.length === 1 ? t(`${pending.length} pedido para você`, `${pending.length} request for you`) : t(`${pending.length} pedidos para você`, `${pending.length} requests for you`)),
            cobrancas.length && t(`${cobrancas.length} esperando outros`, `${cobrancas.length} waiting on others`),
          ]
            .filter(Boolean)
            .join(' · ') || t('Nada pendente que veio do Discord.', 'Nothing pending from Discord.')}
        </p>
        {!!canais.length && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {canais.map((c) => {
              const lido = estado.get(c.id)
              return (
                <span key={c.id} className="inline-flex items-center gap-1 text-[12px] text-[var(--text-3)]">
                  <Hash size={12} />
                  <span className="font-medium text-[var(--text-2)]">{c.nome}</span>
                  {lido ? t(`lido há ${ago(Date.parse(lido))}`, `read ${ago(Date.parse(lido))} ago`) : t('ainda não lido', 'not read yet')}
                </span>
              )
            })}
          </div>
        )}
      </header>

      {!canais.length && (
        <Empty icon={<MessageCircle size={28} />} title={t('Nenhum canal acompanhado', 'No channels followed')}>
          {t('Adicione o canal e o token em Ajustes → Discord.', 'Add the channel and token in Settings → Discord.')}
          <div className="mt-4">
            <Button variant="primary" onClick={() => go({ kind: 'settings' })}>
              {t('Abrir Ajustes', 'Open Settings')}
            </Button>
          </div>
        </Empty>
      )}
      {!!canais.length && nothing && (
        <Empty icon={<MessageCircle size={28} />} title={t('Nada por aqui ainda', 'Nothing here yet')}>
          {t('Clique em "Ler agora" ou espere a leitura das 7h50.', 'Click "Read now" or wait for the 7:50 AM read.')}
        </Empty>
      )}

      <div className="flex flex-col gap-5">
        {!!pedidos.length && (
          <div>
            <SectionTitle icon={<MessageCircle size={14} className="text-accent" />} count={pending.length}>
              {t('Pedidos para você', 'Requests for you')}
            </SectionTitle>
            <Card>
              {pending.map((p) => (
                <PedidoRow key={p.file + p.t.line} p={p} canais={canais} onToggle={togglePedido} />
              ))}
              {!pending.length && <div className="px-2 py-2.5 text-[13px] text-[var(--text-2)]">{t('Nenhum pedido em aberto.', 'No open requests.')}</div>}
              {!!done.length && (
                <>
                  <button
                    onClick={() => setShowDone(!showDone)}
                    className="flex h-8 w-full items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
                  >
                    <ChevronDown size={14} className={cn('transition-transform', showDone && 'rotate-180')} />
                    {showDone ? t('Esconder resolvidos', 'Hide resolved') : t(`${done.length} resolvido(s)`, `${done.length} resolved`)}
                  </button>
                  {showDone && done.map((p) => <PedidoRow key={p.file + p.t.line} p={p} canais={canais} onToggle={togglePedido} />)}
                </>
              )}
            </Card>
          </div>
        )}

        {!!cobrancas.length && (
          <div>
            <SectionTitle icon={<Hourglass size={14} />} count={cobrancas.length}>
              {t('Esperando outros', 'Waiting on others')}
            </SectionTitle>
            <Card>
              {cobrancas.map(({ plan, item }) => (
                <CobrancaRow key={plan.path + item.line} plan={plan} item={item} canais={canais} />
              ))}
            </Card>
          </div>
        )}

        {!!decisoes.length && (
          <div>
            <SectionTitle icon={<Scale size={14} />} count={decisoes.length}>
              {t('Decidido nas conversas', 'Decided in conversations')}
            </SectionTitle>
            <Card>
              {decisoes.map(({ plan, e, at }) => (
                <div key={plan.path + e.date + e.text} onClick={() => go({ kind: 'plan', id: plan.fm.id })} className="rounded-[8px] px-2 py-2 hover:bg-[var(--bg-hover)]">
                  <div className="text-[13.5px] leading-snug">
                    <Markdown inline plan={plan}>{e.text.replace(/^decidido na conversa:\s*/i, '')}</Markdown>
                  </div>
                  <Origin channel={discordRef(e.text)!.channel} at={at} canais={canais} plan={plan} />
                </div>
              ))}
            </Card>
          </div>
        )}

        {!!resumos.length && (
          <div>
            <SectionTitle icon={<ScrollText size={14} />} count={resumos.length}>
              {t('Resumos das conversas', 'Conversation summaries')}
            </SectionTitle>
            <Card>
              {resumos.map(([project, name, content], i) => (
                <Resumo key={project + name} project={project} name={name} content={content} open={i < 2 && name === resumos[0][1]} />
              ))}
            </Card>
          </div>
        )}

        {!!canais.length && (
          <p className="flex items-center gap-1.5 px-1 text-[12px] text-[var(--text-3)]">
            <MessagesSquare size={12} />{' '}
            {t('Conversas de outros lugares também entram aqui pelo "Colar conversa" no Hoje.', 'Conversations from other places also land here through "Paste conversation" in Today.')}
          </p>
        )}
      </div>
    </div>
  )
}
