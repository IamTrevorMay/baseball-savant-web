'use client'
import { useState, useEffect } from 'react'

interface ScheduleEvent {
  id: string
  title: string
  description: string | null
  event_type: string
  start_time: string
  end_time: string | null
  location: string | null
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  training: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  game: { bg: 'bg-green-500/15', text: 'text-green-400' },
  recovery: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  meeting: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  other: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
}

export default function TodayPage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/compete/schedule?date=today')
      .then(r => r.json())
      .then(data => { setEvents(data.events || []); setLoading(false) })
  }, [])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-white mb-1">Today</h1>
      <p className="text-sm text-zinc-500 mb-6">{today}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No events scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const colors = TYPE_COLORS[event.event_type] || TYPE_COLORS.other
            const time = new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            const endTime = event.end_time ? new Date(event.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
            return (
              <div key={event.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-4">
                <div className="text-sm text-zinc-400 w-20 shrink-0 pt-0.5">
                  {time}
                  {endTime && <div className="text-[10px] text-zinc-600">to {endTime}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-white">{event.title}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors.bg} ${colors.text}`}>
                      {event.event_type}
                    </span>
                  </div>
                  {event.description && <p className="text-xs text-zinc-500">{event.description}</p>}
                  {event.location && <p className="text-[10px] text-zinc-600 mt-1">{event.location}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Daily Check-In placeholder */}
      <div className="mt-6 bg-zinc-900 border border-dashed border-zinc-800 rounded-xl p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400/50 flex items-center justify-center mx-auto mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <p className="text-sm text-zinc-500">Daily Check-In</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">Coming Soon</p>
      </div>
    </div>
  )
}
