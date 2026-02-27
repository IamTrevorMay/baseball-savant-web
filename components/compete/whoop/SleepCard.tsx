'use client'

import { WhoopSleepRow } from '@/lib/compete/whoop-types'

interface Props {
  sleepData: WhoopSleepRow[]
}

function msToHours(ms: number | null): string {
  if (!ms) return '0h'
  const hours = ms / 3_600_000
  if (hours < 1) return `${Math.round(ms / 60_000)}m`
  return `${hours.toFixed(1)}h`
}

export default function SleepCard({ sleepData }: Props) {
  if (sleepData.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Sleep</h3>
        <p className="text-xs text-zinc-600 text-center py-4">No sleep data available</p>
      </div>
    )
  }

  const latest = sleepData[sleepData.length - 1]
  const totalMs = latest.total_duration_ms || 0
  const stages = [
    { label: 'REM', ms: latest.rem_duration_ms || 0, color: 'bg-cyan-500' },
    { label: 'Deep', ms: latest.sws_duration_ms || 0, color: 'bg-blue-600' },
    { label: 'Light', ms: latest.light_duration_ms || 0, color: 'bg-blue-400' },
    { label: 'Awake', ms: latest.awake_duration_ms || 0, color: 'bg-zinc-600' },
  ]

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-white mb-4">Sleep</h3>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{msToHours(latest.total_duration_ms)}</div>
          <div className="text-[10px] text-zinc-500">Duration</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {latest.sleep_score !== null ? `${Math.round(latest.sleep_score)}%` : '—'}
          </div>
          <div className="text-[10px] text-zinc-500">Score</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {latest.sleep_efficiency !== null ? `${Math.round(latest.sleep_efficiency)}%` : '—'}
          </div>
          <div className="text-[10px] text-zinc-500">Efficiency</div>
        </div>
      </div>

      {/* Stacked bar */}
      {totalMs > 0 && (
        <div>
          <div className="flex rounded-full overflow-hidden h-3 mb-2">
            {stages.map(s => {
              const pct = (s.ms / totalMs) * 100
              if (pct < 1) return null
              return (
                <div
                  key={s.label}
                  className={`${s.color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              )
            })}
          </div>
          <div className="flex gap-3 justify-center">
            {stages.map(s => (
              <div key={s.label} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${s.color}`} />
                <span className="text-[10px] text-zinc-500">{s.label} {msToHours(s.ms)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
