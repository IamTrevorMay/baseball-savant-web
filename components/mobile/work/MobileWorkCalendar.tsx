'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MobileWorkShell from './MobileWorkShell'

type Event = { id: string; title: string; event_type: string; start_at: string }

export default function MobileWorkCalendar() {
  const [events, setEvents] = useState<Event[]>([])

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const now = new Date()
    const in14 = new Date(now); in14.setDate(now.getDate() + 14)
    const { data } = await supabase
      .from('work_calendar_events')
      .select('*').eq('user_id', user.id)
      .gte('start_at', now.toISOString()).lte('start_at', in14.toISOString())
      .order('start_at', { ascending: true })
    setEvents((data as Event[]) || [])
  }, [])

  useEffect(() => { reload() }, [reload])

  const grouped: Record<string, Event[]> = {}
  events.forEach(e => {
    const key = e.start_at.slice(0,10)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(e)
  })

  return (
    <MobileWorkShell title="Calendar">
      <div className="p-3 space-y-4">
        {Object.entries(grouped).length === 0 && (
          <div className="text-sm text-zinc-500 text-center py-8">Nothing in the next two weeks.</div>
        )}
        {Object.entries(grouped).map(([day, evs]) => (
          <div key={day}>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              {new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div className="space-y-2">
              {evs.map(e => (
                <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-100 truncate">{e.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{new Date(e.start_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · {e.event_type}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MobileWorkShell>
  )
}
