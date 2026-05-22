'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkDashboard from '@/components/mobile/work/MobileWorkDashboard'
import { isoDate, weekStart, weekEnd, ATHLETE_STAGES } from '@/lib/work/sprints'

type Counts = {
  todayTasks: number
  weekTasks: number
  doneThisWeek: number
  activeAthletes: number
  leadAthletes: number
  upcomingEvents: number
}

export default function WorkDashboardPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setName((user.user_metadata?.full_name as string) || user.email || '')

      const ws = isoDate(weekStart())
      const we = isoDate(weekEnd())
      const today = isoDate(new Date())
      const in7 = new Date(); in7.setDate(in7.getDate() + 7)

      const [todayQ, weekQ, doneQ, activeQ, leadQ, evtsQ] = await Promise.all([
        supabase.from('work_tasks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'today'),
        supabase.from('work_tasks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'this_week'),
        supabase.from('work_tasks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'done').gte('completed_at', ws),
        supabase.from('work_athletes').select('id', { count: 'exact', head: true }).eq('stage', 'active').is('archived_at', null),
        supabase.from('work_athletes').select('id', { count: 'exact', head: true }).eq('stage', 'lead').is('archived_at', null),
        supabase.from('work_calendar_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('start_at', new Date().toISOString()).lte('start_at', in7.toISOString()),
      ])

      setCounts({
        todayTasks: todayQ.count ?? 0,
        weekTasks: weekQ.count ?? 0,
        doneThisWeek: doneQ.count ?? 0,
        activeAthletes: activeQ.count ?? 0,
        leadAthletes: leadQ.count ?? 0,
        upcomingEvents: evtsQ.count ?? 0,
      })
      void today
    })()
  }, [])

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkDashboard />

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Good {greeting()}{name ? `, ${firstName(name)}` : ''}</h1>
        <p className="text-sm text-zinc-500 mt-1">Here's your shop floor for the week.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Today" value={counts?.todayTasks ?? '—'} href="/work/myboard" accent="sky" />
        <StatCard label="This Week" value={counts?.weekTasks ?? '—'} href="/work/myboard" accent="indigo" />
        <StatCard label="Completed this week" value={counts?.doneThisWeek ?? '—'} href="/work/sprints" accent="emerald" />
        <StatCard label="Active athletes" value={counts?.activeAthletes ?? '—'} href="/work/athletes" accent="emerald" />
        <StatCard label="Open leads" value={counts?.leadAthletes ?? '—'} href="/work/athletes" accent="amber" />
        <StatCard label="Upcoming (7d)" value={counts?.upcomingEvents ?? '—'} href="/work/calendar" accent="rose" />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Athlete pipeline" href="/work/athletes">
          <div className="flex flex-wrap gap-2">
            {ATHLETE_STAGES.map(s => (
              <span key={s.id} className="text-xs px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300">
                {s.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-3">Lead → Intake → Assessment → Active → Re-eval → Offboarded</p>
        </Card>

        <Card title="Sprint" href="/work/sprints">
          <p className="text-sm text-zinc-300">Weekly cadence (Mon–Sun). Define 1–3 sprint goals to focus the week.</p>
          <p className="text-xs text-zinc-500 mt-2">Tasks tagged with the active sprint roll up here.</p>
        </Card>
      </section>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
function firstName(s: string) {
  return s.split(/[\s@.]/)[0]
}

function StatCard({ label, value, href, accent }: { label: string; value: number | string; href: string; accent: string }) {
  const tone: Record<string, string> = {
    sky: 'text-sky-300',
    indigo: 'text-indigo-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
  }
  return (
    <Link href={href} className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-3xl font-semibold mt-2 ${tone[accent] || 'text-zinc-100'}`}>{value}</div>
    </Link>
  )
}

function Card({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
      <h3 className="text-sm font-semibold text-zinc-100 mb-3">{title}</h3>
      {children}
    </Link>
  )
}
