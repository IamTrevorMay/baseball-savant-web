'use client'

import { WhoopWorkoutRow } from '@/lib/compete/whoop-types'

interface Props {
  workouts: WhoopWorkoutRow[]
}

function msToHM(ms: number | null): string {
  if (!ms) return '—'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function StrainCard({ workouts }: Props) {
  const recentWorkouts = [...workouts].sort((a, b) => b.workout_date.localeCompare(a.workout_date)).slice(0, 10)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-white mb-4">Recent Workouts</h3>

      {recentWorkouts.length > 0 ? (
        <div className="space-y-1.5">
          {recentWorkouts.map(w => (
            <div key={w.id} className="flex items-center justify-between px-2.5 py-2 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-zinc-500 w-[72px] shrink-0">{w.workout_date}</span>
                <span className="text-xs text-white truncate">{w.sport_name || 'Activity'}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500 shrink-0">
                {w.strain_score !== null && (
                  <span className="text-amber-400/80">{w.strain_score.toFixed(1)}</span>
                )}
                {w.average_heart_rate !== null && (
                  <span>{Math.round(w.average_heart_rate)} bpm</span>
                )}
                {w.max_heart_rate !== null && (
                  <span className="text-zinc-600">max {Math.round(w.max_heart_rate)}</span>
                )}
                {w.distance_meter !== null && w.distance_meter > 0 && (
                  <span>{(w.distance_meter / 1000).toFixed(1)} km</span>
                )}
                {w.duration_ms && <span>{msToHM(w.duration_ms)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-4">No workouts recorded</p>
      )}
    </div>
  )
}
