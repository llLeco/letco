import { useEffect, useMemo, useState } from 'react'
import { useStore } from './store'
import { buildToday } from './lib/score'
import { orderedSlugs } from './lib/config'

/** relógio que muda a cada minuto (contexto automático e "vence hoje") */
export function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function useToday() {
  const plans = useStore((s) => s.plans)
  const config = useStore((s) => s.config)
  const ctx = useStore((s) => s.context())
  const now = useNow()
  return useMemo(() => buildToday(plans, config, ctx, now), [plans, config, ctx, now])
}

export function useOrderedProjects() {
  const projects = useStore((s) => s.projects)
  const config = useStore((s) => s.config)
  const ctx = useStore((s) => s.context())
  return useMemo(() => {
    const order = orderedSlugs(config, ctx, projects.map((p) => p.slug))
    return order.map((s) => projects.find((p) => p.slug === s)!).filter(Boolean)
  }, [projects, config, ctx])
}
