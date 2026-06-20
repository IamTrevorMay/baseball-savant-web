'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ymdLocal } from '@/lib/dateTz'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkCalendar from '@/components/mobile/work/MobileWorkCalendar'

type Event = {
  id: string
  user_id: string
  title: string
  description: string | null
  event_type: 'session' | 'meeting' | 'assessment' | 'admin' | 'other'
  start_at: string
  end_at: string | null
  all_day: boolean
}

const TYPE_COLOR: Record<string, string> = {
  session:    'bg-emerald-500/20 text-emerald-300 border-emerald-700/40',
  meeting:    'bg-sky-500/20 text-sky-300 border-sky-700/40',
  assessment: 'bg-amber-500/20 text-amber-300 border-amber-700/40',
  admin:      'bg-zinc-500/20 text-zinc-300 border-zinc-700/40',
  other:      'bg-rose-500/20 text-rose-300 border-rose-700/40',
}

export default function CalendarPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [events, setEvents] = useState<Event[]>([])
  const [anchor, setAnchor] = useState<Date>(new Date())
  const [loading, setLoading] = useState(true)
  const [newDay, setNewDay] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<Event['event_type']>('session')
  const [newTime, setNewTime] = useState('09:00')

  const monthStart = useMemo(() => {
    const d = new Date(anchor); d.setDate(1); d.setHours(0,0,0,0); return d
  }, [anchor])
  const monthEnd = useMemo(() => {
    const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d
  }, [monthStart])

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setLoading(false)
    const { data } = await supabase
      .from('work_calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('start_at', monthStart.toISOString())
      .lt('start_at', monthEnd.toISOString())
      .order('start_at', { ascending: true })
    setEvents((data as Event[]) || [])
    setLoading(false)
  }, [monthStart, monthEnd])

  useEffect(() => { reload() }, [reload])

  async function createEvent() {
    if (!newDay || !newTitle.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const start = new Date(`${newDay}T${newTime}:00`)
    await supabase.from('work_calendar_events').insert({
      user_id: user.id,
      title: newTitle.trim(),
      event_type: newType,
      start_at: start.toISOString(),
    })
    setNewTitle('')
    setNewDay(null)
    reload()
  }

  async function deleteEvent(id: string) {
    const supabase = createClient()
    await supabase.from('work_calendar_events').delete().eq('id', id)
    reload()
  }

  const cells = useMemo(() => buildMonthGrid(monthStart), [monthStart])

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkCalendar />

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {monthStart.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Sessions, meetings, and assessments.</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm text-zinc-300">←</button>
          <button onClick={() => setAnchor(new Date())} className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm text-zinc-300">Today</button>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm text-zinc-300">→</button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-px bg-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500 px-2 py-1.5">{d}</div>
        ))}
        {cells.map(({ date, inMonth }, idx) => {
          const key = ymdLocal(date)
          const dayEvents = events.filter(e => ymdLocal(new Date(e.start_at)) === key)
          const isToday = key === ymdLocal(new Date())
          return (
            <div
              key={idx}
              onClick={() => { if (inMonth) { setNewDay(key); setNewTitle(''); setNewType('session'); setNewTime('09:00') } }}
              className={`bg-zinc-950 min-h-[110px] p-1.5 cursor-pointer hover:bg-zinc-900 transition ${!inMonth ? 'opacity-40' : ''}`}
            >
              <div className={`text-[11px] font-medium mb-1 ${isToday ? 'text-sky-300' : 'text-zinc-500'}`}>{date.getDate()}</div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(e => (
                  <div
                    key={e.id}
                    onClick={ev => { ev.stopPropagation(); if (confirm(`Delete "${e.title}"?`)) deleteEvent(e.id) }}
                    className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${TYPE_COLOR[e.event_type]}`}
                    title={e.title}
                  >{new Date(e.start_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} {e.title}</div>
                ))}
                {dayEvents.length > 3 && <div className="text-[10px] text-zinc-500">+{dayEvents.length - 3} more</div>}
              </div>
            </div>
          )
        })}
      </div>

      {newDay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setNewDay(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100 mb-3">New event — {newDay}</h3>
            <div className="space-y-3">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus placeholder="Title" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
              <div className="flex gap-2">
                <input value={newTime} onChange={e => setNewTime(e.target.value)} type="time" className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
                <select value={newType} onChange={e => setNewType(e.target.value as Event['event_type'])} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600">
                  <option value="session">Session</option>
                  <option value="meeting">Meeting</option>
                  <option value="assessment">Assessment</option>
                  <option value="admin">Admin</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNewDay(null)} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Cancel</button>
                <button onClick={createEvent} className="px-3 py-1.5 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-zinc-500 mt-3">Loading…</div>}
    </div>
  )
}

function buildMonthGrid(monthStart: Date): { date: Date; inMonth: boolean }[] {
  const start = new Date(monthStart)
  const dayOfWeek = (start.getDay() + 6) % 7 // Mon = 0
  start.setDate(1 - dayOfWeek)
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === monthStart.getMonth() })
  }
  return cells
}
