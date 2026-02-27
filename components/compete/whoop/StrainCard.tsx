'use client'

import { WhoopCycleRow, WhoopWorkoutRow } from '@/lib/compete/whoop-types'

interface Props {
  cycles: WhoopCycleRow[]
  workouts: WhoopWorkoutRow[]
}

function msToHM(ms: number | null): string {
  if (!ms) return '—'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function StrainCard({ cycles, workouts }: Props) {
  // Show recent workouts
  const recentWorkouts = workouts.slice(-10).reverse()

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-white mb-4">Strain & Workouts</h3>

      {/* Daily strain bars */}
      {cycles.length > 0 && (
        <div className="mb-4">
          <div className="flex items-end gap-1 h-20">
            {cycles.slice(-14).map(c => {
              const strain = c.strain_score ?? 0
              const pct = Math.min((strain / 21) * 100, 100) // WHOOP strain max ~21
              return (
                <div key={c.id} className="flex-1 flex flex-col items-center gap-0.5" title={`${c.cycle_date}: ${strain.toFixed(1)}`}>
                  <div
                    className="w-full bg-amber-500/60 rounded-t transition-all min-h-[2px]"
                    style={{ height: `${Math.max(pct, 3)}%` }}
                  />
                  <span className="text-[7px] text-zinc-600">{new Date(c.cycle_date + 'T00:00:00').getDate()}</span>
                </div>
              )
            })}
          </div>
          <div className="text-[10px] text-zinc-600 text-center mt-1">Daily Strain (last 14 days)</div>
        </div>
      )}

      {/* Workout list */}
      {recentWorkouts.length > 0 ? (
        <div className="space-y-1.5">
          {recentWorkouts.map(w => (
            <div key={w.id} className="flex items-center justify-between px-2 py-1.5 bg-zinc-800/50 rounded">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-16">{w.workout_date}</span>
                <span className="text-xs text-white">{w.sport_name || 'Activity'}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                {w.strain_score !== null && <span>Strain {w.strain_score.toFixed(1)}</span>}
                {w.duration_ms && <span>{msToHM(w.duration_ms)}</span>}
                {w.average_heart_rate !== null && <span>{Math.round(w.average_heart_rate)} bpm</span>}
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
