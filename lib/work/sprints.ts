// Weekly-sprint helpers. Mon (start) → Sun (end).

export function weekStart(d: Date = new Date()): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = out.getDay() // 0 = Sun, 1 = Mon
  const diff = (day + 6) % 7 // distance back to Monday
  out.setDate(out.getDate() - diff)
  return out
}

export function weekEnd(d: Date = new Date()): Date {
  const start = weekStart(d)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / 86400000)
}

export const PRIORITY_POINTS: Record<string, number> = {
  '1': 1, '3': 3, '6': 6, '10': 10, '15': 15,
}

export const PRIORITY_LABEL: Record<string, string> = {
  '1': 'Trivial', '3': 'Small', '6': 'Medium', '10': 'Large', '15': 'Critical',
}

export const STATUS_LABEL: Record<string, string> = {
  inbox: 'Inbox', today: 'Today', this_week: 'This Week', done: 'Done', backlog: 'Backlog',
}

export const ATHLETE_STAGES = [
  { id: 'lead',       label: 'Lead',       color: 'zinc' },
  { id: 'intake',     label: 'Intake',     color: 'blue' },
  { id: 'assessment', label: 'Assessment', color: 'amber' },
  { id: 'active',     label: 'Active',     color: 'emerald' },
  { id: 'reeval',     label: 'Re-eval',    color: 'purple' },
  { id: 'offboarded', label: 'Offboarded', color: 'rose' },
] as const

export const CATEGORY_LABEL: Record<string, string> = {
  programming: 'Programming',
  assessment: 'Assessment',
  admin: 'Admin',
  communication: 'Comms',
  marketing: 'Marketing',
  business_development: 'BizDev',
}
