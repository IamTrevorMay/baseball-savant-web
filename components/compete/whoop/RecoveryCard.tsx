'use client'

import { WhoopCycleRow } from '@/lib/compete/whoop-types'

interface Props {
  cycle: WhoopCycleRow | null
}

function scoreColor(state: string | null) {
  if (state === 'green') return 'text-green-400 bg-green-500/10'
  if (state === 'yellow') return 'text-yellow-400 bg-yellow-500/10'
  return 'text-red-400 bg-red-500/10'
}

export default function RecoveryCard({ cycle }: Props) {
  if (!cycle) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <p className="text-xs text-zinc-600">No recovery data for today</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className={`rounded-lg p-3 text-center ${scoreColor(cycle.recovery_state)}`}>
        <div className="text-2xl font-bold">
          {cycle.recovery_score !== null ? `${Math.round(cycle.recovery_score)}%` : '—'}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">Recovery</div>
      </div>
      <div className="bg-blue-500/10 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-blue-400">
          {cycle.hrv_rmssd !== null ? Math.round(cycle.hrv_rmssd) : '—'}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">HRV (ms)</div>
      </div>
      <div className="bg-purple-500/10 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-purple-400">
          {cycle.resting_heart_rate !== null ? Math.round(cycle.resting_heart_rate) : '—'}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">RHR (bpm)</div>
      </div>
      <div className="bg-amber-500/10 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-amber-400">
          {cycle.strain_score !== null ? cycle.strain_score.toFixed(1) : '—'}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">Strain</div>
      </div>
    </div>
  )
}
