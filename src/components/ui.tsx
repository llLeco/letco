import * as DM from '@radix-ui/react-dropdown-menu'
import * as Tip from '@radix-ui/react-tooltip'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import type { Prioridade, Status } from '../lib/types'
import { daysUntil, dueLabel } from '../lib/dates'
import { t } from '../lib/i18n'

export function cn(...c: ClassValue[]) {
  return twMerge(clsx(c))
}

// ---------- botões ----------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'secondary', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-[background,box-shadow,color,transform] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(0_0_0/0.15)] hover:brightness-110',
        variant === 'secondary' && 'bg-[var(--bg)] text-[var(--text)] shadow-[0_0_0_1px_var(--border-strong),0_1px_2px_rgb(0_0_0/0.04)] hover:bg-[var(--bg-subtle)]',
        variant === 'ghost' && 'text-[var(--text-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
        variant === 'danger' && 'text-rose-600 hover:bg-rose-500/10 dark:text-rose-400',
        className,
      )}
      {...rest}
    />
  )
})

export const IconButton = forwardRef<HTMLButtonElement, BtnProps & { label: string }>(function IconButton(
  { label, className, ...rest },
  ref,
) {
  return (
    <Tooltip label={label}>
      <Button ref={ref} variant="ghost" aria-label={label} className={cn('h-7 w-7 px-0', className)} {...rest} />
    </Tooltip>
  )
})

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--bg-subtle)] px-1 font-sans text-[10.5px] font-medium text-[var(--text-3)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function Tooltip({ label, children, side = 'bottom' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tip.Root delayDuration={500}>
      <Tip.Trigger asChild>{children}</Tip.Trigger>
      <Tip.Portal>
        <Tip.Content
          side={side}
          sideOffset={6}
          className="animate-fade z-50 rounded-md bg-zinc-900 px-2 py-1 text-[11.5px] font-medium text-white shadow-lg dark:bg-zinc-700"
        >
          {label}
        </Tip.Content>
      </Tip.Portal>
    </Tip.Root>
  )
}

// ---------- menus ----------

export const Menu = DM.Root
export const MenuTrigger = DM.Trigger

export function MenuContent({ children, align = 'start', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn('animate-pop z-50 min-w-[190px] rounded-[10px] bg-[var(--bg)] p-1 shadow-[var(--shadow-pop)]', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  checked,
  icon,
  hint,
  danger,
}: {
  children: ReactNode
  onSelect?: () => void
  checked?: boolean
  icon?: ReactNode
  hint?: ReactNode
  danger?: boolean
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default items-center gap-2 rounded-[6px] px-2 text-[13px] outline-none data-[highlighted]:bg-[var(--bg-hover)]',
        danger && 'text-rose-600 dark:text-rose-400',
      )}
    >
      {icon && <span className="flex w-4 justify-center text-[var(--text-2)]">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[11.5px] text-[var(--text-3)]">{hint}</span>}
      {checked && <Check size={14} className="text-accent" />}
    </DM.Item>
  )
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-[var(--border)]" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-3)]">{children}</DM.Label>
}

// ---------- status ----------

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  ideia: {
    get label() {
      return t('Ideia', 'Idea')
    },
    color: '#9a9aa5',
  },
  proximo: {
    get label() {
      return t('Próximo', 'Next')
    },
    color: '#7c8698',
  },
  andamento: {
    get label() {
      return t('Em andamento', 'In progress')
    },
    color: '#e5a42b',
  },
  revisao: {
    get label() {
      return t('Revisão', 'In review')
    },
    color: '#8b5cf6',
  },
  bloqueado: {
    get label() {
      return t('Bloqueado', 'Blocked')
    },
    color: '#e5484d',
  },
  feito: {
    get label() {
      return t('Feito', 'Done')
    },
    color: '#30a46c',
  },
  arquivado: {
    get label() {
      return t('Arquivado', 'Archived')
    },
    color: '#9a9aa5',
  },
}

export function StatusIcon({ status, pct = 0, size = 15 }: { status: Status; pct?: number; size?: number }) {
  const c = STATUS_META[status].color
  const r = 6
  const circ = 2 * Math.PI * 3
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="flex-none" aria-label={STATUS_META[status].label}>
      {status === 'ideia' && <circle cx="8" cy="8" r={r} fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.2 2.2" />}
      {status === 'proximo' && <circle cx="8" cy="8" r={r} fill="none" stroke={c} strokeWidth="1.6" />}
      {(status === 'andamento' || status === 'revisao') && (
        <>
          <circle cx="8" cy="8" r={r} fill="none" stroke={c} strokeWidth="1.6" />
          <circle
            cx="8"
            cy="8"
            r="3"
            fill="none"
            stroke={c}
            strokeWidth="6"
            strokeDasharray={`${circ * Math.max(status === 'revisao' ? 0.75 : 0.12, Math.min(pct, 0.88))} ${circ}`}
            transform="rotate(-90 8 8)"
          />
        </>
      )}
      {status === 'bloqueado' && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M5 8h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {status === 'feito' && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === 'arquivado' && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} opacity="0.5" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function PriorityIcon({ p, className }: { p: Prioridade; className?: string }) {
  const n = p === 'alta' ? 3 : p === 'media' ? 2 : 1
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className={cn('flex-none', className)} aria-label={t(`prioridade ${p}`, `${PRIO_LABEL[p].toLowerCase()} priority`)}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2 + i * 4}
          y={9 - i * 3}
          width="2.6"
          height={3 + i * 3}
          rx="0.8"
          fill="currentColor"
          opacity={i < n ? (p === 'alta' ? 1 : 0.75) : 0.18}
          className={i < n && p === 'alta' ? 'text-orange-500' : ''}
        />
      ))}
    </svg>
  )
}

export const PRIO_LABEL: Record<Prioridade, string> = {
  get alta() {
    return t('Alta', 'High')
  },
  get media() {
    return t('Média', 'Medium')
  },
  get baixa() {
    return t('Baixa', 'Low')
  },
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? (done / total) * 100 : 0
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--bg-active)]">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-[11.5px] tabular-nums text-[var(--text-3)]">
        {done}/{total}
      </span>
    </div>
  )
}

export function ProjectDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block flex-none rounded-full" style={{ width: size, height: size, background: color }} />
}

export function ProjectChip({ name, color, onClick }: { name: string; color: string; onClick?: () => void }) {
  return (
    <span
      onClick={(e) => {
        if (!onClick) return
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex h-[20px] max-w-[130px] items-center gap-1.5 rounded-full border border-[var(--border)] px-2 text-[11.5px] text-[var(--text-2)]',
        onClick && 'hover:bg-[var(--bg-hover)]',
      )}
    >
      <ProjectDot color={color} size={6} />
      <span className="truncate">{name}</span>
    </span>
  )
}

export function DueBadge({ prazo, className }: { prazo?: string; className?: string }) {
  const n = daysUntil(prazo)
  if (n === undefined) return null
  const tone =
    n < 0
      ? 'text-rose-600 bg-rose-500/10 dark:text-rose-400'
      : n === 0
        ? 'text-orange-600 bg-orange-500/10 dark:text-orange-400'
        : n <= 3
          ? 'text-amber-700 bg-amber-500/10 dark:text-amber-400'
          : 'text-[var(--text-2)] bg-[var(--bg-hover)]'
  return <span className={cn('inline-flex h-[20px] items-center rounded-full px-2 text-[11.5px] font-medium', tone, className)}>{dueLabel(prazo)}</span>
}

export function SectionTitle({ icon, children, count, right }: { icon?: ReactNode; children: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex h-7 items-center gap-2 px-2">
      {icon && <span className="text-[var(--text-3)]">{icon}</span>}
      <h3 className="text-[12.5px] font-semibold text-[var(--text-2)]">{children}</h3>
      {count !== undefined && <span className="text-[12px] tabular-nums text-[var(--text-3)]">{count}</span>}
      <div className="flex-1" />
      {right}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {icon && <div className="mb-1 text-[var(--text-3)]">{icon}</div>}
      <div className="text-[14px] font-medium">{title}</div>
      {children && <div className="max-w-sm text-[13px] text-[var(--text-2)]">{children}</div>}
    </div>
  )
}
