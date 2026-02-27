'use client'

import { ScheduleEvent } from '@/lib/compete/schedule-types'
import { WhoopCycleRow } from '@/lib/compete/whoop-types'
import EventDetail from './EventDetail'
import RecoveryBadge from '@/components/compete/whoop/RecoveryBadge'

interface Props {
  currentDate: Date
  events: ScheduleEvent[]
  onToggleComplete: (eventId: string, completed: boolean) => void
  onToggleExercise: (eventId: string, exerciseId: string, checked: boolean) => void
  onEditEvent: (event: ScheduleEvent) => void
  onDeleteEvent: (eventId: string) => void
  whoopRecovery?: Map<string, WhoopCycleRow>
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

export default function CalendarWeek({ currentDate, events, onToggleComplete, onToggleExercise, onEditEvent, onDeleteEvent, whoopRecovery }: Props) {
  const weekDates = getWeekDates(currentDate)
  const today = new Date().toISOString().split('T')[0]

  const eventsByDate = new Map<string, ScheduleEvent[]>()
  for (const evt of events) {
    if (!eventsByDate.has(evt.event_date)) eventsByDate.set(evt.event_date, [])
    eventsByDate.get(evt.event_date)!.push(evt)
  }

  return (
    <div className="grid grid-cols-7 border-l border-t border-zinc-700">
      {weekDates.map((date, i) => {
        const dayEvents = eventsByDate.get(date) || []
        const isToday = date === today
        const dayNum = new Date(date + 'T00:00:00').getDate()
        const recovery = whoopRecovery?.get(date)

        return (
          <div
            key={date}
            className="min-h-[420px] p-2 border-r border-b border-zinc-700"
          >
            <div className={`flex items-center justify-between mb-3 pb-2 border-b border-zinc-800`}>
              <div className={isToday ? 'text-amber-400' : 'text-zinc-500'}>
                <span className="text-[10px] font-medium mr-1">{DOW[i]}</span>
                <span className={`text-base font-bold ${isToday ? 'text-amber-400' : 'text-zinc-300'}`}>{dayNum}</span>
              </div>
              {recovery && (
                <RecoveryBadge score={recovery.recovery_score} state={recovery.recovery_state} size="sm" />
              )}
            </div>
            <div className="space-y-2">
              {dayEvents.length === 0 ? (
                <div className="text-center text-zinc-700 text-[10px] py-4">&mdash;</div>
              ) : (
                dayEvents.map(evt => (
                  <EventDetail
                    key={evt.id}
                    event={evt}
                    compact={false}
                    onToggleComplete={onToggleComplete}
                    onToggleExercise={onToggleExercise}
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
