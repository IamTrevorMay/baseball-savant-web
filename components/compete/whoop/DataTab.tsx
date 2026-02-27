'use client'

import { useState } from 'react'
import { WhoopCycleRow, WhoopSleepRow, WhoopWorkoutRow, computeReadiness, readinessStateFromScore } from '@/lib/compete/whoop-types'

type SubTab = 'cycles' | 'sleep' | 'workouts'

interface Props {
  cycles: WhoopCycleRow[]
  sleep: WhoopSleepRow[]
  workouts: WhoopWorkoutRow[]
}

function msToHM(ms: number | null): string {
  if (!ms) return '—'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function StateBadge({ state }: { state: string | null }) {
  const colors = state === 'green'
    ? 'bg-green-500/20 text-green-400'
    : state === 'yellow'
    ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-red-500/20 text-red-400'
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors}`}>
      {state || '—'}
    </span>
  )
}

function ReadinessBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-600">—</span>
  const state = readinessStateFromScore(score)
  const colors = state === 'green'
    ? 'bg-teal-500/20 text-teal-400'
    : state === 'yellow'
    ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-red-500/20 text-red-400'
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors}`}>
      {score}%
    </span>
  )
}

function CyclesTable({ cycles, sleep }: { cycles: WhoopCycleRow[]; sleep: WhoopSleepRow[] }) {
  const sorted = [...cycles].sort((a, b) => b.cycle_date.localeCompare(a.cycle_date))
  const sleepByDate = new Map<string, WhoopSleepRow>()
  for (const s of sleep) sleepByDate.set(s.sleep_date, s)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 px-2 font-medium">Date</th>
            <th className="text-center py-2 px-2 font-medium">Readiness</th>
            <th className="text-right py-2 px-2 font-medium">Recovery</th>
            <th className="text-center py-2 px-2 font-medium">State</th>
            <th className="text-right py-2 px-2 font-medium">HRV</th>
            <th className="text-right py-2 px-2 font-medium">RHR</th>
            <th className="text-right py-2 px-2 font-medium">Strain</th>
            <th className="text-right py-2 px-2 font-medium">SpO2</th>
            <th className="text-right py-2 px-2 font-medium">Skin Temp</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => {
            const matchingSleep = sleepByDate.get(c.cycle_date) ?? null
            const readiness = computeReadiness(c, matchingSleep, cycles, sleep)
            return (
              <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                <td className="py-2 px-2 text-zinc-300">{c.cycle_date}</td>
                <td className="py-2 px-2 text-center"><ReadinessBadge score={readiness} /></td>
                <td className="py-2 px-2 text-right text-white font-medium">
                  {c.recovery_score !== null ? `${Math.round(c.recovery_score)}%` : '—'}
                </td>
                <td className="py-2 px-2 text-center"><StateBadge state={c.recovery_state} /></td>
                <td className="py-2 px-2 text-right text-zinc-300">
                  {c.hrv_rmssd !== null ? Math.round(c.hrv_rmssd) : '—'}
                </td>
                <td className="py-2 px-2 text-right text-zinc-300">
                  {c.resting_heart_rate !== null ? Math.round(c.resting_heart_rate) : '—'}
                </td>
                <td className="py-2 px-2 text-right text-zinc-300">
                  {c.strain_score !== null ? c.strain_score.toFixed(1) : '—'}
                </td>
                <td className="py-2 px-2 text-right text-zinc-300">
                  {c.spo2_pct !== null ? `${c.spo2_pct.toFixed(0)}%` : '—'}
                </td>
                <td className="py-2 px-2 text-right text-zinc-300">
                  {c.skin_temp_celsius !== null ? `${c.skin_temp_celsius.toFixed(1)}°C` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="text-center text-zinc-600 text-xs py-8">No cycle data</p>
      )}
    </div>
  )
}

function SleepTable({ sleep }: { sleep: WhoopSleepRow[] }) {
  const sorted = [...sleep].sort((a, b) => b.sleep_date.localeCompare(a.sleep_date))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 px-2 font-medium">Date</th>
            <th className="text-right py-2 px-2 font-medium">Score</th>
            <th className="text-right py-2 px-2 font-medium">Duration</th>
            <th className="text-right py-2 px-2 font-medium">Efficiency</th>
            <th className="text-right py-2 px-2 font-medium">REM</th>
            <th className="text-right py-2 px-2 font-medium">Deep</th>
            <th className="text-right py-2 px-2 font-medium">Light</th>
            <th className="text-right py-2 px-2 font-medium">Awake</th>
            <th className="text-right py-2 px-2 font-medium">Resp Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => (
            <tr key={s.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
              <td className="py-2 px-2 text-zinc-300">{s.sleep_date}</td>
              <td className="py-2 px-2 text-right text-white font-medium">
                {s.sleep_score !== null ? `${Math.round(s.sleep_score)}%` : '—'}
              </td>
              <td className="py-2 px-2 text-right text-zinc-300">{msToHM(s.total_duration_ms)}</td>
              <td className="py-2 px-2 text-right text-zinc-300">
                {s.sleep_efficiency !== null ? `${Math.round(s.sleep_efficiency)}%` : '—'}
              </td>
              <td className="py-2 px-2 text-right text-zinc-300">{msToHM(s.rem_duration_ms)}</td>
              <td className="py-2 px-2 text-right text-zinc-300">{msToHM(s.sws_duration_ms)}</td>
              <td className="py-2 px-2 text-right text-zinc-300">{msToHM(s.light_duration_ms)}</td>
              <td className="py-2 px-2 text-right text-zinc-300">{msToHM(s.awake_duration_ms)}</td>
              <td className="py-2 px-2 text-right text-zinc-300">
                {s.respiratory_rate !== null ? `${s.respiratory_rate.toFixed(1)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="text-center text-zinc-600 text-xs py-8">No sleep data</p>
      )}
    </div>
  )
}

function WorkoutsTable({ workouts }: { workouts: WhoopWorkoutRow[] }) {
  const sorted = [...workouts].sort((a, b) => b.workout_date.localeCompare(a.workout_date))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 px-2 font-medium">Date</th>
            <th className="text-left py-2 px-2 font-medium">Sport</th>
            <th className="text-right py-2 px-2 font-medium">Strain</th>
            <th className="text-right py-2 px-2 font-medium">Avg HR</th>
            <th className="text-right py-2 px-2 font-medium">Max HR</th>
            <th className="text-right py-2 px-2 font-medium">Duration</th>
            <th className="text-right py-2 px-2 font-medium">Distance</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(w => (
            <tr key={w.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
              <td className="py-2 px-2 text-zinc-300">{w.workout_date}</td>
              <td className="py-2 px-2 text-white">{w.sport_name || 'Activity'}</td>
              <td className="py-2 px-2 text-right text-zinc-300">
                {w.strain_score !== null ? w.strain_score.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 text-right text-zinc-300">
                {w.average_heart_rate !== null ? `${Math.round(w.average_heart_rate)}` : '—'}
              </td>
              <td className="py-2 px-2 text-right text-zinc-300">
                {w.max_heart_rate !== null ? `${Math.round(w.max_heart_rate)}` : '—'}
              </td>
              <td className="py-2 px-2 text-right text-zinc-300">{msToHM(w.duration_ms)}</td>
              <td className="py-2 px-2 text-right text-zinc-300">
                {w.distance_meter !== null ? `${(w.distance_meter / 1000).toFixed(2)} km` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="text-center text-zinc-600 text-xs py-8">No workout data</p>
      )}
    </div>
  )
}

export default function DataTab({ cycles, sleep, workouts }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('cycles')

  const tabs: { key: SubTab; label: string; count: number }[] = [
    { key: 'cycles', label: 'Cycles', count: cycles.length },
    { key: 'sleep', label: 'Sleep', count: sleep.length },
    { key: 'workouts', label: 'Workouts', count: workouts.length },
  ]

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      {/* Sub-tab selector */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5 mb-4 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              subTab === t.key ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] text-zinc-600">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table content */}
      {subTab === 'cycles' && <CyclesTable cycles={cycles} sleep={sleep} />}
      {subTab === 'sleep' && <SleepTable sleep={sleep} />}
      {subTab === 'workouts' && <WorkoutsTable workouts={workouts} />}
    </div>
  )
}
