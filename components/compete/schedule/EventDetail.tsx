'use client'

import { ScheduleEvent } from '@/lib/compete/schedule-types'

interface Props {
  event: ScheduleEvent
  compact?: boolean
  onToggleComplete: (eventId: string, completed: boolean) => void
  onToggleExercise: (eventId: string, exerciseId: string, checked: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export default function EventDetail({ event, compact = false, onToggleComplete, onToggleExercise, onEdit, onDelete }: Props) {
  const isThrowing = event.event_type === 'throwing'
  const exercises = event.workout_details?.exercises || []

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

      {/* Workout summary + checkable exercises */}
      {!isThrowing && event.workout_details && (
        <div className="text-[11px] text-zinc-400 space-y-0.5 mb-1.5">
          {event.workout_details.title && <div className="font-medium text-zinc-300">{event.workout_details.title}</div>}
          {event.workout_details.description && <div className="text-zinc-500">{event.workout_details.description}</div>}
          {exercises.length > 0 && (
            <div className="space-y-1 mt-1.5 pt-1.5 border-t border-zinc-800/50">
              {exercises.map(ex => (
                <label
                  key={ex.id}
                  className="flex items-center gap-1.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={ex.checked}
                    onChange={() => onToggleExercise(event.id, ex.id, !ex.checked)}
                    className="w-3 h-3 rounded border-zinc-700 bg-zinc-800 text-green-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className={`text-[11px] transition flex-1 ${ex.checked ? 'text-zinc-600 line-through' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                    {ex.name}
                  </span>
                  {(ex.reps || ex.weight) && (
                    <span className={`text-[10px] ${ex.checked ? 'text-zinc-700' : 'text-zinc-600'}`}>
                      {ex.reps}{ex.reps && ex.weight ? ' @ ' : ''}{ex.weight}{ex.weight ? ' lbs' : ''}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Throwing: Mark Complete toggle */}
      {isThrowing && (
        <button
          onClick={() => onToggleComplete(event.id, !event.completed)}
          className={`w-full mt-1.5 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition ${
            event.completed
              ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          {event.completed ? 'Completed' : 'Mark Complete'}
        </button>
      )}
    </div>
  )
}
