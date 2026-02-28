'use client'

import { WhoopCycleRow, WhoopSleepRow, computeReadiness, readinessStateFromScore } from '@/lib/compete/whoop-types'
import { ScheduleEvent } from '@/lib/compete/schedule-types'
import Link from 'next/link'

interface Props {
  cycle: WhoopCycleRow | null
  sleep: WhoopSleepRow | null
  todayEvents: ScheduleEvent[]
  allCycles?: WhoopCycleRow[]
  allSleep?: WhoopSleepRow[]
  sleepData?: WhoopSleepRow[]
}

/* ── SVG Circular Gauge ── */
function CircularGauge({
  value,
  max,
  color,
  label,
  display,
  size = 90,
}: {
  value: number | null
  max: number
  color: string
  label: string
  display: string
  size?: number
}) {
  const strokeW = 6
  const radius = (size - strokeW) / 2
  const circumference = 2 * Math.PI * radius
  const pct = value !== null ? Math.min(value / max, 1) : 0
  const offset = circumference * (1 - pct)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 absolute inset-0">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeW} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={value !== null ? color : '#3f3f46'}
            strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white leading-none">{display}</span>
        </div>
      </div>
      <span className="text-[10px] text-zinc-400 mt-1">{label}</span>
    </div>
  )
}

/* ── Baseline color helper ── */
function baselineColor(todayVal: number | null, historical: (number | null)[], invert = false): string {
  if (todayVal === null) return 'text-white'
  const valid = historical.filter((v): v is number => v !== null)
  if (valid.length < 3) return 'text-white'
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  if (avg === 0) return 'text-white'
  let pctDiff = ((todayVal - avg) / Math.abs(avg)) * 100
  if (invert) pctDiff = -pctDiff
  if (pctDiff > 10) return 'text-emerald-400'
  if (pctDiff > 0.01) return 'text-green-300'
  if (pctDiff >= -0.01) return 'text-yellow-400'
  if (pctDiff >= -10) return 'text-orange-400'
  return 'text-red-400'
}

/* ── Stat Pill ── */
function StatPill({ label, value, unit, valueColor }: { label: string; value: string; unit?: string; valueColor?: string }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center min-w-[70px]">
      <div className={`text-sm font-semibold ${valueColor || 'text-white'}`}>
        {value}
        {unit && <span className="text-[10px] text-zinc-500 ml-0.5">{unit}</span>}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  )
}

/* ── Schedule Event Row ── */
function ScheduleEventRow({ event }: { event: ScheduleEvent }) {
  const isThrow = event.event_type === 'throwing'
  const td = event.throwing_details
  const wd = event.workout_details

  let summary = ''
  if (isThrow && td) {
    const parts: string[] = []
    if (td.throws) parts.push(`${td.throws} throws`)
    if (td.distance_ft) parts.push(`@ ${td.distance_ft}ft`)
    if (td.effort_pct) parts.push(`${td.effort_pct}% effort`)
    summary = parts.join(', ') || 'Throwing session'
  } else if (wd) {
    const total = wd.exercises?.length || 0
    const done = wd.exercises?.filter(e => e.checked).length || 0
    summary = wd.title || 'Workout'
    if (total > 0) summary += ` — ${done}/${total} exercises`
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40 rounded-lg">
      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
        isThrow ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
      }`}>
        {isThrow ? 'THROW' : 'WORKOUT'}
      </span>
      <span className="text-xs text-zinc-300 flex-1 truncate">{summary}</span>
      {event.completed ? (
        <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <div className="w-4 h-4 border border-zinc-600 rounded-full shrink-0" />
      )}
    </div>
  )
}

/* ── Sleep Stage Bar (inline) ── */
function SleepStageBar({ sleep }: { sleep: WhoopSleepRow }) {
  const totalMs = sleep.total_duration_ms || 0
  if (totalMs === 0) return null

  const stages = [
    { label: 'REM', ms: sleep.rem_duration_ms || 0, color: 'bg-cyan-500' },
    { label: 'Deep', ms: sleep.sws_duration_ms || 0, color: 'bg-blue-600' },
    { label: 'Light', ms: sleep.light_duration_ms || 0, color: 'bg-blue-400' },
    { label: 'Awake', ms: sleep.awake_duration_ms || 0, color: 'bg-zinc-600' },
  ]

  function msToHours(ms: number): string {
    const hours = ms / 3_600_000
    if (hours < 1) return `${Math.round(ms / 60_000)}m`
    return `${hours.toFixed(1)}h`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-zinc-400">Latest Sleep</h4>
        <span className="text-[10px] text-zinc-500">{msToHours(totalMs)}</span>
      </div>
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
      <div className="flex gap-3 justify-center flex-wrap">
        {stages.map(s => (
          <div key={s.label} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-[10px] text-zinc-500">{s.label} {msToHours(s.ms)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main Component ── */
export default function TodayHero({ cycle, sleep, todayEvents, allCycles = [], allSleep = [], sleepData = [] }: Props) {
  // Prepare gauge (formerly Readiness)
  const prepareScore = computeReadiness(cycle, sleep, allCycles, allSleep)
  const prepareState = readinessStateFromScore(prepareScore)
  const prepareColor = prepareState === 'green' ? '#14b8a6'
    : prepareState === 'yellow' ? '#eab308' : prepareState === 'red' ? '#ef4444' : '#14b8a6'

  // Recovery gauge
  const recoveryScore = cycle?.recovery_score ?? null
  const recoveryColor = cycle?.recovery_state === 'green' ? '#22c55e'
    : cycle?.recovery_state === 'yellow' ? '#eab308' : '#ef4444'

  // Sleep gauge
  const sleepScore = sleep?.sleep_score ?? null
  const totalHours = sleep?.total_duration_ms ? (sleep.total_duration_ms / 3_600_000).toFixed(1) : null

  // Strain & Calories (bottom section, orange)
  const strainScore = cycle?.strain_score ?? null
  const kilojoules = cycle?.kilojoule ?? null
  const calories = kilojoules !== null ? Math.round(kilojoules * 0.239006) : null

  // Latest sleep for stage bar
  const latestSleep = sleepData.length > 0 ? sleepData[sleepData.length - 1] : sleep

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-xs font-medium text-zinc-400 mb-3 text-center">Today</h3>

      {/* Gauges */}
      <div className="flex justify-center gap-4 sm:gap-6 mb-4 flex-wrap">
        <CircularGauge
          value={prepareScore}
          max={100}
          color={prepareColor}
          label="Prepare"
          display={prepareScore !== null ? `${prepareScore}%` : '—'}
        />
        <CircularGauge
          value={recoveryScore}
          max={100}
          color={recoveryColor}
          label="Recovery"
          display={recoveryScore !== null ? `${Math.round(recoveryScore)}%` : '—'}
        />
        <CircularGauge
          value={sleepScore}
          max={100}
          color="#3b82f6"
          label={totalHours ? `${totalHours}h sleep` : 'Sleep'}
          display={sleepScore !== null ? `${Math.round(sleepScore)}%` : '—'}
        />
        <CircularGauge
          value={strainScore}
          max={21}
          color="#f97316"
          label="Strain"
          display={strainScore !== null ? strainScore.toFixed(1) : '—'}
        />
        <CircularGauge
          value={calories}
          max={4000}
          color="#f97316"
          label="Calories"
          display={calories !== null ? `${calories}` : '—'}
        />
      </div>

      {/* Secondary Metric Pills */}
      <div className="flex justify-center gap-2 flex-wrap mb-3">
        <StatPill
          label="Time in Bed"
          value={sleep?.total_duration_ms ? `${(sleep.total_duration_ms / 3_600_000).toFixed(1)}` : '—'}
          unit="hrs"
          valueColor={baselineColor(sleep?.total_duration_ms ?? null, allSleep.map(s => s.total_duration_ms))}
        />
        <StatPill
          label="HRV"
          value={cycle?.hrv_rmssd !== null && cycle?.hrv_rmssd !== undefined ? `${Math.round(cycle.hrv_rmssd)}` : '—'}
          unit="ms"
          valueColor={baselineColor(cycle?.hrv_rmssd ?? null, allCycles.map(c => c.hrv_rmssd))}
        />
        <StatPill
          label="RHR"
          value={cycle?.resting_heart_rate !== null && cycle?.resting_heart_rate !== undefined ? `${Math.round(cycle.resting_heart_rate)}` : '—'}
          unit="bpm"
          valueColor={baselineColor(cycle?.resting_heart_rate ?? null, allCycles.map(c => c.resting_heart_rate), true)}
        />
        <StatPill
          label="SpO2"
          value={cycle?.spo2_pct !== null && cycle?.spo2_pct !== undefined ? `${cycle.spo2_pct.toFixed(0)}` : '—'}
          unit="%"
          valueColor={baselineColor(cycle?.spo2_pct ?? null, allCycles.map(c => c.spo2_pct))}
        />
        <StatPill
          label="Skin Temp"
          value={cycle?.skin_temp_celsius !== null && cycle?.skin_temp_celsius !== undefined ? `${cycle.skin_temp_celsius.toFixed(1)}` : '—'}
          unit="°C"
          valueColor={baselineColor(cycle?.skin_temp_celsius ?? null, allCycles.map(c => c.skin_temp_celsius), true)}
        />
        {sleep?.respiratory_rate !== null && sleep?.respiratory_rate !== undefined && (
          <StatPill
            label="Resp Rate"
            value={sleep.respiratory_rate.toFixed(1)}
            unit="rpm"
            valueColor={baselineColor(sleep.respiratory_rate, allSleep.map(s => s.respiratory_rate), true)}
          />
        )}
      </div>

      {/* Latest Sleep Bar */}
      {latestSleep && (
        <div className="border-t border-zinc-800 pt-3">
          <SleepStageBar sleep={latestSleep} />
        </div>
      )}

      {/* Today's Schedule */}
      {todayEvents.length > 0 && (
        <div className="border-t border-zinc-800 pt-4 mt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-zinc-400">Today&apos;s Schedule</h4>
            <Link href="/compete/schedule" className="text-[10px] text-zinc-600 hover:text-zinc-400 transition">
              View full schedule →
            </Link>
          </div>
          <div className="space-y-1.5">
            {todayEvents.map(event => (
              <ScheduleEventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
