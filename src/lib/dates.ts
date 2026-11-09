import { differenceInCalendarDays, format, parseISO, isValid } from 'date-fns'
import { dfLocale, isEn, t } from './i18n'

export function todayISO(d = new Date()) {
  return format(d, 'yyyy-MM-dd')
}

export function parseDay(s?: string) {
  if (!s) return undefined
  const d = parseISO(s)
  return isValid(d) ? d : undefined
}

/** dias até a data (negativo = vencido) */
export function daysUntil(s?: string, now = new Date()) {
  const d = parseDay(s)
  return d ? differenceInCalendarDays(d, now) : undefined
}

export function daysSince(s?: string, now = new Date()) {
  const n = daysUntil(s, now)
  return n === undefined ? undefined : -n
}

export function dueLabel(s?: string, now = new Date()) {
  const n = daysUntil(s, now)
  if (n === undefined) return undefined
  if (n < -1) return t(`venceu há ${-n} dias`, `${-n} days overdue`)
  if (n === -1) return t('venceu ontem', 'due yesterday')
  if (n === 0) return t('vence hoje', 'due today')
  if (n === 1) return t('amanhã', 'tomorrow')
  if (n < 7) return format(parseDay(s)!, 'EEEE', { locale: dfLocale() })
  return format(parseDay(s)!, isEn() ? 'MMM d' : "d 'de' MMM", { locale: dfLocale() })
}

export function longDate(now = new Date()) {
  const s = format(now, isEn() ? 'EEEE, MMMM d' : "EEEE, d 'de' MMMM", { locale: dfLocale() })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortDate(s?: string) {
  const d = parseDay(s)
  return d ? format(d, isEn() ? 'MMM d' : 'd MMM', { locale: dfLocale() }) : ''
}

export function relativeAge(s?: string, now = new Date()) {
  const n = daysSince(s, now)
  if (n === undefined) return ''
  if (n <= 0) return t('hoje', 'today')
  if (n === 1) return t('ontem', 'yesterday')
  if (n < 30) return t(`há ${n} dias`, `${n} days ago`)
  const m = Math.round(n / 30)
  return t(`há ${m} meses`, m === 1 ? '1 month ago' : `${m} months ago`)
}
