'use client'

import { ScheduleEvent } from '@/lib/compete/schedule-types'
import EventDetail from './EventDetail'

interface Props {
  currentDate: Date
  events: ScheduleEvent[]
  onToggleChecklist: (eventId: string, itemId: string, checked: boolean) => void
  onEditEvent: (event: ScheduleEvent) => void
  onDeleteEvent: (eventId: string) => void
}

function getWeekDates(date: Date) {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarWeek({ currentDate, events, onToggleChecklist, onEditEvent, onDeleteEvent }: Props) {
  const weekDates = getWeekDates(currentDate)
  const today = new Date().toISOString().split('T')[0]

  const eventsByDate = new Map<string, ScheduleEvent[]>()
  for (const evt of events) {
    if (!eventsByDate.has(evt.event_date)) eventsByDate.set(evt.event_date, [])
    eventsByDate.get(evt.event_date)!.push(evt)
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDates.map((date, i) => {
        const dayEvents = eventsByDate.get(date) || []
        const isToday = date === today
        const dayNum = new Date(date + 'T00:00:00').getDate()

        return (
          <div key={date} className="min-h-[200px]">
            <div className={`text-center mb-2 ${isToday ? 'text-amber-400' : 'text-zinc-500'}`}>
              <div className="text-[10px] font-medium">{DOW[i]}</div>
              <div className={`text-lg font-bold ${isToday ? 'text-amber-400' : 'text-zinc-300'}`}>{dayNum}</div>
            </div>
            <div className="space-y-2">
              {dayEvents.length === 0 ? (
                <div className="text-center text-zinc-700 text-[10px] py-4">—</div>
              ) : (
                dayEvents.map(evt => (
                  <EventDetail
                    key={evt.id}
                    event={evt}
                    compact={false}
                    onToggleChecklist={onToggleChecklist}
                    onEdit={() => onEditEvent(evt)}
                    onDelete={() => onDeleteEvent(evt.id)}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
