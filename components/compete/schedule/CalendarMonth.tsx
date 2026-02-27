'use client'

import { ScheduleEvent } from '@/lib/compete/schedule-types'

interface Props {
  currentDate: Date
  events: ScheduleEvent[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
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

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarMonth({ currentDate, events, selectedDate, onSelectDate }: Props) {
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
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] text-zinc-600 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-zinc-800/50 rounded-lg overflow-hidden">
        {days.map(({ date, day, inMonth }) => {
          const dayEvents = eventsByDate.get(date) || []
          const isToday = date === today
          const isSelected = date === selectedDate

          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={`
                relative min-h-[72px] p-1.5 text-left transition-colors
                ${inMonth ? 'bg-zinc-900' : 'bg-zinc-950/50'}
                ${isSelected ? 'ring-1 ring-amber-500/50' : ''}
                hover:bg-zinc-800/80
              `}
            >
              <span className={`
                text-xs font-medium block mb-1
                ${!inMonth ? 'text-zinc-700' : isToday ? 'text-amber-400' : 'text-zinc-400'}
              `}>
                {day}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {dayEvents.map(evt => (
                  <div
                    key={evt.id}
                    className={`w-2 h-2 rounded-full ${
                      evt.completed
                        ? 'bg-green-500'
                        : evt.event_type === 'throwing'
                          ? 'bg-blue-500'
                          : 'bg-purple-500'
                    }`}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
