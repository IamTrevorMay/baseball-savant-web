'use client'

import { ScheduleEvent, ChecklistItem } from '@/lib/compete/schedule-types'

interface Props {
  event: ScheduleEvent
  compact?: boolean
  onToggleChecklist: (eventId: string, itemId: string, checked: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export default function EventDetail({ event, compact = false, onToggleChecklist, onEdit, onDelete }: Props) {
  const isThrowing = event.event_type === 'throwing'
  const details = isThrowing ? event.throwing_details : event.workout_details
  const checklist: ChecklistItem[] = details?.checklist || []

  const colorClasses = event.completed
    ? 'border-green-500/30 bg-green-500/5'
    : isThrowing
      ? 'border-blue-500/30 bg-blue-500/5'
      : 'border-purple-500/30 bg-purple-500/5'

  const textColor = event.completed
    ? 'text-green-400'
    : isThrowing
      ? 'text-blue-400'
      : 'text-purple-400'

  const label = isThrowing ? 'Throwing' : 'Workout'

  return (
    <div className={`border rounded-lg p-2.5 ${colorClasses} transition-colors`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${textColor}`}>
          {label}
          {event.completed && ' \u2713'}
        </span>
        {!compact && (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="text-zinc-600 hover:text-zinc-400 transition p-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button onClick={onDelete} className="text-zinc-600 hover:text-red-400 transition p-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Throwing summary */}
      {isThrowing && event.throwing_details && (
        <div className="text-[11px] text-zinc-400 space-y-0.5 mb-1.5">
          {event.throwing_details.throws && <div>{event.throwing_details.throws} throws</div>}
          {event.throwing_details.distance_ft && <div>{event.throwing_details.distance_ft} ft</div>}
          {event.throwing_details.effort_pct && <div>{event.throwing_details.effort_pct}% effort</div>}
          {event.throwing_details.notes && <div className="text-zinc-500 italic">{event.throwing_details.notes}</div>}
        </div>
      )}

      {/* Workout summary */}
      {!isThrowing && event.workout_details && (
        <div className="text-[11px] text-zinc-400 space-y-0.5 mb-1.5">
          {event.workout_details.title && <div className="font-medium text-zinc-300">{event.workout_details.title}</div>}
          {event.workout_details.description && <div className="text-zinc-500">{event.workout_details.description}</div>}
          {event.workout_details.exercises && event.workout_details.exercises.length > 0 && (
            <div className="text-zinc-500">
              {event.workout_details.exercises.length} exercise{event.workout_details.exercises.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Checklist */}
      {checklist.length > 0 && (
        <div className="space-y-1 mt-1.5 pt-1.5 border-t border-zinc-800/50">
          {checklist.map(item => (
            <label
              key={item.id}
              className="flex items-center gap-1.5 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => onToggleChecklist(event.id, item.id, !item.checked)}
                className="w-3 h-3 rounded border-zinc-700 bg-zinc-800 text-green-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className={`text-[11px] transition ${item.checked ? 'text-zinc-600 line-through' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
