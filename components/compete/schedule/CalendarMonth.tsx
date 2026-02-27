'use client'

import { ScheduleEvent } from '@/lib/compete/schedule-types'
import { WhoopCycleRow } from '@/lib/compete/whoop-types'
import RecoveryBadge from '@/components/compete/whoop/RecoveryBadge'

interface Props {
  currentDate: Date
  events: ScheduleEvent[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
  whoopRecovery?: Map<string, WhoopCycleRow>
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const days: { date: string; day: number; inMonth: boolean }[] = []

  // Previous month fill
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i
    const m = month === 0 ? 12 : month
    const y = month === 0 ? year - 1 : year
    days.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, inMonth: false })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      inMonth: true,
    })
  }

  // Next month fill
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month + 2 > 12 ? 1 : month + 2
      const y = month + 2 > 12 ? year + 1 : year
      days.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, inMonth: false })
    }
  }

  return days
}

function EventBar({ event }: { event: ScheduleEvent }) {
  const label = event.event_type === 'throwing' ? 'THROW' : 'WORKOUT'
  const bgClass = event.completed
    ? 'bg-green-500/20 text-green-400'
    : event.event_type === 'throwing'
      ? 'bg-blue-500/20 text-blue-400'
      : 'bg-purple-500/20 text-purple-400'

  return (
    <div className={`rounded px-1 py-0.5 text-[9px] font-semibold tracking-wider truncate ${bgClass}`}>
      {label}
    </div>
  )
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarMonth({ currentDate, events, selectedDate, onSelectDate, whoopRecovery }: Props) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const days = getMonthDays(year, month)
  const today = new Date().toISOString().split('T')[0]

  // Group events by date
  const eventsByDate = new Map<string, ScheduleEvent[]>()
  for (const evt of events) {
    const d = evt.event_date
    if (!eventsByDate.has(d)) eventsByDate.set(d, [])
    eventsByDate.get(d)!.push(evt)
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-zinc-700">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] text-zinc-500 font-medium py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-zinc-700">
        {days.map(({ date, day, inMonth }) => {
          const dayEvents = eventsByDate.get(date) || []
          const isToday = date === today
          const isSelected = date === selectedDate
          const recovery = whoopRecovery?.get(date)
          const visibleEvents = dayEvents.slice(0, 2)
          const overflowCount = dayEvents.length - 2

          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={`
                relative min-h-[120px] p-1.5 text-left transition-colors border-r border-b border-zinc-700
                ${inMonth ? 'bg-zinc-900' : 'bg-zinc-950/50'}
                ${isSelected ? 'ring-1 ring-inset ring-amber-500/60' : ''}
                hover:bg-zinc-800/80
              `}
            >
              {/* Top row: date left, recovery right */}
              <div className="flex items-start justify-between mb-1">
                <span className={`
                  text-xs font-medium leading-none
                  ${!inMonth ? 'text-zinc-700' : isToday ? 'text-amber-400 font-bold' : 'text-zinc-400'}
                `}>
                  {day}
                </span>
                {recovery && (
                  <RecoveryBadge score={recovery.recovery_score} state={recovery.recovery_state} size="sm" />
                )}
              </div>
              <div className="space-y-0.5">
                {visibleEvents.map(evt => (
                  <EventBar key={evt.id} event={evt} />
                ))}
                {overflowCount > 0 && (
                  <div className="text-[9px] text-zinc-600 px-1">+{overflowCount} more</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
