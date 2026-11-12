import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { AlarmClock, AlarmClockOff, Bot, ChevronDown, Clock, CircleDot, Coffee, Hourglass, Inbox, ListTodo, MessagesSquare, Scale, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { useNow, useToday } from '../hooks'
import { longDate, parseDay, todayISO } from '../lib/dates'
import { askKey, isAdiada, matchingAsk, parseTarefas, sortTarefas, tarefaKeys, type Tarefa } from '../lib/tarefas'
import { CONTEXT_LABEL } from '../lib/config'
import { toggleLine } from '../lib/plan'
import { t, t as tr } from '../lib/i18n'
import type { Ask, CheckItem, Plan } from '../lib/types'
import { AskAction, AskChip } from './ParaVoce'
import { ConferidoBadge, ItemDetailDialog } from './Conferido'
import { discordRef, parseCanais } from '../lib/discord'
import { PlanRow } from './PlanRow'
import { Button, cn, Empty, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, ProjectChip, SectionTitle } from './ui'
import { Markdown } from './Markdown'

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-1.5', className)}>{children}</section>
}

function ItemRow({ plan, item, kind }: { plan: Plan; item: CheckItem; kind: 'decidir' | 'cobrar' }) {
  const go = useStore((s) => s.go)
  const savePlan = useStore((s) => s.savePlan)
  const project = useStore((s) => s.project(plan.projectSlug))
  const [leaving, setLeaving] = useState(false)
  const text = item.person ? item.text.slice(item.text.indexOf(':') + 1).trim() : item.text
  return (
    <div
      onClick={() => go({ kind: 'plan', id: plan.fm.id })}
      className={cn(
        'group flex min-h-[40px] items-start gap-3 rounded-[8px] px-2 py-2 transition-opacity hover:bg-[var(--bg-hover)]',
        leaving && 'opacity-40',
      )}
    >
      <input
        type="checkbox"
        className="check mt-[1px]"
        checked={leaving}
        onClick={(e) => e.stopPropagation()}
        onChange={() => {
          setLeaving(true)
          setTimeout(() => savePlan(plan, toggleLine(plan, item.line), kind === 'decidir' ? 'decisão tomada' : 'cobrança resolvida'), 350)
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-snug">
          {item.person && <span className="font-medium">{item.person}: </span>}
          <Markdown inline plan={plan}>{text}</Markdown>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">{plan.fm.titulo}</div>
      </div>
      {project && <ProjectChip name={project.nome} color={project.cor} />}
    </div>
  )
}

function AskRow({ plan, item }: { plan: Plan; item: Ask }) {
  const go = useStore((s) => s.go)
  const savePlan = useStore((s) => s.savePlan)
  const project = useStore((s) => s.project(plan.projectSlug))
  const [leaving, setLeaving] = useState(false)
  return (
    <div
      onClick={() => go({ kind: 'plan', id: plan.fm.id })}
      className={cn('group flex min-h-[44px] items-start gap-3 rounded-[8px] px-2 py-2 transition-opacity hover:bg-[var(--bg-hover)]', leaving && 'opacity-40')}
    >
      <input
        type="checkbox"
        className="check mt-[2px]"
        checked={leaving}
        onClick={(e) => e.stopPropagation()}
        onChange={() => {
          setLeaving(true)
          setTimeout(() => savePlan(plan, toggleLine(plan, item.line), `feito: ${item.label.slice(0, 60)}`), 350)
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-snug">
          <AskChip kind={item.kind} />
          <span>
            <Markdown inline plan={plan}>{item.label}</Markdown>
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">{plan.fm.titulo}</div>
      </div>
      <AskAction plan={plan} ask={item} />
      {project && <ProjectChip name={project.nome} color={project.cor} />}
    </div>
  )
}

/** Adiar: a tarefa sai da lista e volta sozinha na data escolhida */
function AdiarMenu({ tarefa }: { tarefa: Tarefa }) {
  const adiar = useStore((s) => s.adiarTarefa)
  const now = new Date()
  const iso = (n: number) => todayISO(addDays(now, n))
  const dow = now.getDay() === 0 ? 7 : now.getDay()
  const opts: [string, number][] = [
    [t('Amanhã', 'Tomorrow'), 1],
    [t('Segunda-feira', 'Monday'), 8 - dow],
    [t('Daqui a 1 semana', 'In 1 week'), 7],
    [t('Daqui a 1 mês', 'In 1 month'), 30],
  ]
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          aria-label={t('Adiar', 'Postpone')}
          title={t('Adiar: sai da lista e volta na data', 'Postpone: leaves the list and comes back on the date')}
          onClick={(e) => e.stopPropagation()}
          className="hidden h-7 w-7 flex-none items-center justify-center rounded-[7px] text-[var(--text-3)] hover:bg-[var(--bg-active)] hover:text-[var(--text)] group-hover:flex data-[state=open]:flex"
        >
          <Clock size={14} />
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>{t('Adiar até', 'Postpone until')}</MenuLabel>
        {opts.map(([label, n]) => (
          <MenuItem key={label} onSelect={() => adiar(tarefa, iso(n))}>
            {label} <span className="ml-auto pl-4 text-[var(--text-3)]">{format(addDays(now, n), 'dd/MM')}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

function TarefaRow({ t }: { t: Tarefa }) {
  const adiar = useStore((s) => s.adiarTarefa)
  const adiada = isAdiada(t)
  const go = useStore((s) => s.go)
  const toggle = useStore((s) => s.toggleTarefa)
  const plan = useStore((s) => (t.planId ? s.plans.find((p) => p.fm.id === t.planId) : undefined))
  const project = useStore((s) => (plan ? s.project(plan.projectSlug) : undefined))
  const discordCfg = useStore((s) => s.ws?.discord)
  const tarefaFile = useStore((s) => s.ws?.tarefas?.[0])
  const [leaving, setLeaving] = useState(false)
  const [open, setOpen] = useState(false)
  const conf = t.done ? undefined : t.conferido
  const ref = discordRef(t.label)
  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={cn(
          'group flex min-h-[44px] cursor-default items-start gap-3 rounded-[8px] px-2 py-2 transition-opacity hover:bg-[var(--bg-hover)]',
          (leaving || t.done) && 'opacity-45',
        )}
      >
        <input
          type="checkbox"
          className="check mt-[2px]"
          checked={t.done || leaving}
          onClick={(e) => e.stopPropagation()}
          onChange={() => {
            if (t.done) return void toggle(t)
            setLeaving(true)
            setTimeout(() => toggle(t).finally(() => setLeaving(false)), 350)
          }}
        />
        <div className="min-w-0 flex-1">
          <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-snug', t.done && 'line-through decoration-[var(--text-3)]')}>
            <AskChip kind={t.kind} />
            <span>
              <Markdown inline plan={plan}>{t.label}</Markdown>
            </span>
          </div>
          {(plan || conf || adiada) && (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-[var(--text-3)]">
              {plan && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    go({ kind: 'plan', id: plan.fm.id })
                  }}
                  className="min-w-0 truncate text-left hover:text-[var(--text-2)] hover:underline"
                >
                  {plan.fm.titulo}
                </button>
              )}
              {conf && <ConferidoBadge c={conf} />}
              {adiada && (
                <span className="flex-none text-amber-600 dark:text-amber-400">
                  {tr(`adiada até ${format(parseDay(t.adiado!.ate) ?? new Date(), 'dd/MM')}`, `postponed until ${format(parseDay(t.adiado!.ate) ?? new Date(), 'MM/dd')}`)}
                  {t.adiado!.motivo ? ` · ${t.adiado!.motivo}` : ''}
                </span>
              )}
            </div>
          )}
        </div>
        {adiada ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              adiar(t, null)
            }}
            className="flex h-7 flex-none items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-active)] hover:text-[var(--text)]"
          >
            <AlarmClockOff size={13} /> {tr('Trazer de volta', 'Bring back')}
          </button>
        ) : (
          !t.done && <AdiarMenu tarefa={t} />
        )}
        {plan && !t.done && !adiada && <AskAction plan={plan} ask={t} tarefaFile={tarefaFile} />}
        {project && <ProjectChip name={project.nome} color={project.cor} />}
      </div>
      <ItemDetailDialog
        onClose={() => setOpen(false)}
        item={
          open
            ? {
                head: <AskChip kind={t.kind} />,
                text: t.label,
                plan,
                conferido: t.conferido,
                discord: ref && { url: ref.url, at: ref.at, canal: parseCanais(discordCfg).find((c) => c.id === ref.channel)?.nome },
                actions: plan && !t.done ? <AskAction plan={plan} ask={t} tarefaFile={tarefaFile} /> : undefined,
                done: t.done,
                onDone: () => void toggle(t),
                where: `tarefa do dia em ~/planos/tarefas/${tarefaFile ?? 'hoje'} (a linha que começa com "- [${t.done ? 'x' : ' '}] ${t.text.slice(0, 70)}…"), com a linha Conferido logo abaixo`,
              }
            : null
        }
      />
    </>
  )
}

function Collapsible<T>({ items, limit, render }: { items: T[]; limit: number; render: (t: T, i: number) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, limit)
  return (
    <>
      {shown.map(render)}
      {items.length > limit && (
        <button
          onClick={() => setOpen(!open)}
          className="flex h-8 w-full items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
        >
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
          {open ? t('Mostrar menos', 'Show less') : t(`Mais ${items.length - limit}`, `${items.length - limit} more`)}
        </button>
      )}
    </>
  )
}

export function TodayView() {
  const today = useToday()
  const now = useNow()
  const ctx = useStore((s) => s.context())
  const ws = useStore((s) => s.ws)
  const plans = useStore((s) => s.plans)
  const importEntrada = useStore((s) => s.importEntrada)
  const openNewPlan = useStore((s) => s.openNewPlan)
  const [showAgent, setShowAgent] = useState(false)
  const setPasteChat = useStore((s) => s.setPasteChatFor)

  // tarefas do dia: as de hoje inteiras; de um dia anterior, só as que ficaram
  // um item resolvido no plano (por uma sessão de IA, por exemplo) conta como feito aqui também
  const tarefas = useMemo(() => {
    if (!ws?.tarefas) return null
    const t = parseTarefas(...ws.tarefas)
    const byId = new Map(plans.map((p) => [p.fm.id, p]))
    return { ...t, items: t.items.map((i) => (i.done || !matchingAsk(byId.get(i.planId ?? ''), i)?.done ? i : { ...i, done: true })) }
  }, [ws?.tarefas, plans])
  const tarefasHoje = tarefas?.date === todayISO(now)
  const config = useStore((s) => s.config)
  const tarefaItems = tarefas ? sortTarefas(tarefasHoje ? tarefas.items : tarefas.items.filter((i) => !i.done), plans, config, ctx) : []
  const adiadas = tarefaItems.filter((i) => isAdiada(i, now))
  const tarefasAtivas = tarefaItems.filter((i) => !isAdiada(i, now))
  const [verAdiadas, setVerAdiadas] = useState(false)
  const tarefasPending = tarefasAtivas.filter((i) => !i.done).length
  const inTarefas = useMemo(() => tarefaKeys(tarefas), [tarefas])
  const asks = today.asks.filter((a) => !inTarefas.has(askKey(a.plan, a.item)))

  const greeting =
    now.getHours() < 12 ? t('Bom dia', 'Good morning') : now.getHours() < 18 ? t('Boa tarde', 'Good afternoon') : t('Boa noite', 'Good evening')
  const nothing = !tarefaItems.length && !today.urgent.length && !asks.length && !today.doing.length && !today.decide.length && !today.chase.length

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 pb-24">
      <header className="pb-6 pt-2">
        <div className="text-[13px] font-medium text-[var(--text-3)]">
          {greeting} · {CONTEXT_LABEL[ctx]}
        </div>
        <div className="flex items-end gap-3">
          <h1 className="mt-0.5 flex-1 text-[26px] font-semibold tracking-[-0.02em]">{longDate(now)}</h1>
          <Button size="sm" variant="ghost" onClick={() => setPasteChat('')}>
            <MessagesSquare size={13} /> {t('Colar conversa', 'Paste chat')}
          </Button>
        </div>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-2)]">
          {[
            tarefasPending &&
              t(`${tarefasPending} ${tarefasPending === 1 ? 'tarefa' : 'tarefas'} do dia`, `${tarefasPending} ${tarefasPending === 1 ? 'task' : 'tasks'} today`),
            today.urgent.length && t(`${today.urgent.length} com prazo vencendo`, `${today.urgent.length} due soon`),
            asks.length &&
              t(`${asks.length} ${asks.length === 1 ? 'pendência' : 'pendências'} nos planos`, `${asks.length} open ${asks.length === 1 ? 'item' : 'items'} in plans`),
            today.doing.length && t(`${today.doing.length} para fazer`, `${today.doing.length} to do`),
            today.decide.length &&
              t(`${today.decide.length} ${today.decide.length === 1 ? 'decisão' : 'decisões'}`, `${today.decide.length} ${today.decide.length === 1 ? 'decision' : 'decisions'}`),
            today.chase.length &&
              t(`${today.chase.length} ${today.chase.length === 1 ? 'cobrança' : 'cobranças'}`, `${today.chase.length} ${today.chase.length === 1 ? 'follow-up' : 'follow-ups'}`),
          ]
            .filter(Boolean)
            .join(' · ') || t('Nada pendente agora.', 'Nothing pending right now.')}
          {today.counts.hiddenByContext > 0 && (
            <span className="text-[var(--text-3)]">
              {' · '}
              {t(`${today.counts.hiddenByContext} ocultos fora do contexto`, `${today.counts.hiddenByContext} hidden outside this context`)}
            </span>
          )}
        </p>
      </header>

      {!!ws?.entrada.length && (
        <Card className="mb-4 flex items-center gap-3 border-accent/30 bg-accent-soft px-3 py-2.5">
          <Inbox size={16} className="text-accent" />
          <div className="flex-1 text-[13px]">
            <span className="font-medium">
              {t(`${ws.entrada.length} ${ws.entrada.length === 1 ? 'plano novo' : 'planos novos'}`, `${ws.entrada.length} new ${ws.entrada.length === 1 ? 'plan' : 'plans'}`)}
            </span>{' '}
            {t('em entrada/', 'in entrada/')}
          </div>
          <Button size="sm" variant="primary" onClick={importEntrada}>
            {t('Importar', 'Import')}
          </Button>
        </Card>
      )}

      {ws?.hoje && (
        <Card className="mb-4">
          <button
            onClick={() => setShowAgent(!showAgent)}
            className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
          >
            <Bot size={14} className="text-[var(--text-3)]" />
            <span className="flex-1 font-semibold">{t('Lista do Planejador', 'Planner list')}</span>
            <span className="text-[var(--text-3)]">hoje.md</span>
            <ChevronDown size={14} className={cn('text-[var(--text-3)] transition-transform', showAgent && 'rotate-180')} />
          </button>
          {showAgent && (
            <div className="animate-fade px-3 pb-2 pt-1">
              <Markdown>{ws.hoje.replace(/^#\s.*\n/, '')}</Markdown>
            </div>
          )}
        </Card>
      )}

      {!plans.length ? (
        <Empty icon={<Coffee size={28} />} title={t('Nenhum plano ainda', 'No plans yet')}>
          {t(
            'Crie o primeiro plano, ou peça ao Claude para juntar os planos que você já tem espalhados no Mac.',
            'Create your first plan, or ask Claude to gather the plans you already have scattered around your Mac.',
          )}
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="primary" onClick={() => openNewPlan()}>
              {t('Novo plano', 'New plan')}
            </Button>
            <Button onClick={() => useStore.getState().juntarPlanos()}>{t('Juntar meus planos', 'Gather my plans')}</Button>
          </div>
        </Empty>
      ) : nothing ? (
        <Empty icon={<Coffee size={28} />} title={t('Tudo em dia', 'All caught up')}>
          {t('Nenhum plano ativo pede atenção neste contexto.', 'No active plan needs attention in this context.')}
        </Empty>
      ) : null}

      <div className="flex flex-col gap-4">
        {!!tarefaItems.length && (
          <div>
            <SectionTitle
              icon={<ListTodo size={14} className="text-accent" />}
              count={tarefasPending}
              right={<span className="text-[11.5px] text-[var(--text-3)]">{t('escolhidas pelo investigador', 'picked by the investigator')}</span>}
            >
              {tarefasHoje
                ? t('Tarefas do dia', "Today's tasks")
                : t(`Ficaram de ${format(parseDay(tarefas!.date) ?? now, 'dd/MM')}`, `Left over from ${format(parseDay(tarefas!.date) ?? now, 'MM/dd')}`)}
            </SectionTitle>
            <Card>
              {tarefasAtivas.map((t) => (
                <TarefaRow key={t.line} t={t} />
              ))}
              {!tarefasAtivas.length && <div className="px-2 py-2.5 text-[13px] text-[var(--text-3)]">{t('Nada para hoje: o resto está adiado.', 'Nothing for today: the rest is postponed.')}</div>}
              {adiadas.length > 0 && (
                <>
                  <button
                    onClick={() => setVerAdiadas(!verAdiadas)}
                    className="flex h-8 w-full items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] text-[var(--text-3)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-2)]"
                  >
                    <ChevronDown size={14} className={cn('transition-transform', verAdiadas && 'rotate-180')} />
                    {t(`${adiadas.length} ${adiadas.length === 1 ? 'adiada' : 'adiadas'}`, `${adiadas.length} postponed`)}
                  </button>
                  {verAdiadas && adiadas.map((t) => <TarefaRow key={t.line} t={t} />)}
                </>
              )}
            </Card>
          </div>
        )}

        {!!today.urgent.length && (
          <div>
            <SectionTitle icon={<AlarmClock size={14} className="text-rose-500" />} count={today.urgent.length}>
              {t('Prazo vencendo', 'Due soon')}
            </SectionTitle>
            <Card>
              {today.urgent.map((s) => (
                <PlanRow key={s.plan.path} plan={s.plan} quickCheck />
              ))}
            </Card>
          </div>
        )}

        {!!asks.length && (
          <div>
            <SectionTitle icon={<Sparkles size={14} className="text-accent" />} count={asks.length}>
              {tarefaItems.length ? t('Outras pendências nos planos', 'Other open items in plans') : t('Precisa de você', 'Needs you')}
            </SectionTitle>
            <Card>
              <Collapsible items={asks} limit={tarefaItems.length ? 0 : 8} render={(a) => <AskRow key={a.plan.path + a.item.line} plan={a.plan} item={a.item} />} />
            </Card>
          </div>
        )}

        {!!today.doing.length && (
          <div>
            <SectionTitle icon={<CircleDot size={14} />} count={today.doing.length}>
              {t('Fazer hoje', 'Do today')}
            </SectionTitle>
            <Card>
              {today.doing.map((s) => {
                const allDone = s.plan.phases.length > 0 && s.plan.phases.every((f) => f.done)
                return (
                  <PlanRow
                    key={s.plan.path}
                    plan={s.plan}
                    quickCheck={!allDone}
                    note={allDone ? t('Todas as fases feitas — revisar e marcar como feito', 'All phases done — review and mark as done') : undefined}
                  />
                )
              })}
            </Card>
          </div>
        )}

        {!!today.decide.length && (
          <div>
            <SectionTitle icon={<Scale size={14} />} count={today.decide.length}>
              {t('Decidir', 'Decide')}
            </SectionTitle>
            <Card>
              <Collapsible
                items={today.decide}
                limit={5}
                render={(d) => <ItemRow key={d.plan.path + d.item.line} plan={d.plan} item={d.item} kind="decidir" />}
              />
            </Card>
          </div>
        )}

        {!!today.chase.length && (
          <div>
            <SectionTitle icon={<MessagesSquare size={14} />} count={today.chase.length}>
              {t('Cobrar', 'Follow up')}
            </SectionTitle>
            <Card>
              <Collapsible
                items={today.chase}
                limit={5}
                render={(d) => <ItemRow key={d.plan.path + d.item.line} plan={d.plan} item={d.item} kind="cobrar" />}
              />
            </Card>
          </div>
        )}

        {!!today.stale.length && (
          <div>
            <SectionTitle icon={<Hourglass size={14} />} count={today.stale.length}>
              {t('Parados há 7+ dias', 'Idle for 7+ days')}
            </SectionTitle>
            <Card>
              <Collapsible
                items={today.stale}
                limit={4}
                render={(s) => <PlanRow key={s.plan.path} plan={s.plan} note={t(`Sem mudança há ${s.stale} dias`, `No changes in ${s.stale} ${s.stale === 1 ? 'day' : 'days'}`)} />}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
