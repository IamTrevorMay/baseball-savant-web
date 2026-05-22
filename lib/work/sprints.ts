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
  ready: 'Ready', in_progress: 'In Progress', holding: 'Holding',
}

export const SPRINT_COLUMNS = [
  { id: 'ready', label: 'Ready', color: '#38bdf8' },
  { id: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { id: 'holding', label: 'Holding', color: '#f97316' },
  { id: 'done', label: 'Done', color: '#22c55e' },
] as const

export const BUCKET_COLUMNS = [
  { id: 'inbox', label: 'Inbox', color: '#a78bfa' },
  { id: 'backlog', label: 'Backlog', color: '#f97316' },
] as const

export const POINT_COLORS: Record<string, string> = {
  '15': '#ef4444', '10': '#f97316', '6': '#f59e0b', '3': '#38bdf8', '1': '#6b7280',
}

export function getSprintWeek(date: Date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  }
}

export function offsetWeek(startDate: string, offset: number) {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + offset * 7)
  return getSprintWeek(d)
}

export function fmtWeekRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

export function isCurrentWeek(start: string) {
  const current = getSprintWeek()
  return current.start === start
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
