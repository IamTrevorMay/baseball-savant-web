'use client'

import { WhoopCycleRow, WhoopSleepRow } from '@/lib/compete/whoop-types'
import { ScheduleEvent } from '@/lib/compete/schedule-types'
import Link from 'next/link'

interface Props {
  cycle: WhoopCycleRow | null
  sleep: WhoopSleepRow | null
  todayEvents: ScheduleEvent[]
}

/* ── SVG Circular Gauge ── */
function CircularGauge({
  value,
  max,
  color,
  label,
  display,
  size = 120,
}: {
  value: number | null
  max: number
  color: string
  label: string
  display: string
  size?: number
}) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const pct = value !== null ? Math.min(value / max, 1) : 0
  const offset = circumference * (1 - pct)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={8}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={value !== null ? color : '#3f3f46'}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Center text (absolutely positioned over SVG) */}
      <div className="relative -mt-[calc(var(--size)*0.5+0.375rem)]" style={{ '--size': `${size}px` } as React.CSSProperties}>
        <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
          <span className="text-2xl font-bold text-white">{display}</span>
        </div>
      </div>
      <span className="text-[11px] text-zinc-400 -mt-2">{label}</span>
    </div>
  )
}

/* ── Stat Pill ── */
function StatPill({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-center min-w-[70px]">
      <div className="text-sm font-semibold text-white">
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

/* ── Main Component ── */
export default function TodayHero({ cycle, sleep, todayEvents }: Props) {
  // Recovery gauge
  const recoveryScore = cycle?.recovery_score ?? null
  const recoveryColor = cycle?.recovery_state === 'green' ? '#22c55e'
    : cycle?.recovery_state === 'yellow' ? '#eab308' : '#ef4444'

  // Sleep gauge
  const sleepScore = sleep?.sleep_score ?? null
  const totalHours = sleep?.total_duration_ms ? (sleep.total_duration_ms / 3_600_000).toFixed(1) : null

  // Strain gauge
  const strainScore = cycle?.strain_score ?? null

  function msToHours(ms: number | null): string {
    if (!ms) return '—'
    const hours = ms / 3_600_000
    return `${hours.toFixed(1)}h`
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      {/* Three Gauges */}
      <div className="flex justify-center gap-8 sm:gap-12 mb-6">
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
          color="#f59e0b"
          label="Strain"
          display={strainScore !== null ? strainScore.toFixed(1) : '—'}
        />
      </div>

      {/* Secondary Metric Pills */}
      <div className="flex justify-center gap-2 flex-wrap mb-5">
        <StatPill
          label="HRV"
          value={cycle?.hrv_rmssd !== null && cycle?.hrv_rmssd !== undefined ? `${Math.round(cycle.hrv_rmssd)}` : '—'}
          unit="ms"
        />
        <StatPill
          label="RHR"
          value={cycle?.resting_heart_rate !== null && cycle?.resting_heart_rate !== undefined ? `${Math.round(cycle.resting_heart_rate)}` : '—'}
          unit="bpm"
        />
        <StatPill
          label="SpO2"
          value={cycle?.spo2_pct !== null && cycle?.spo2_pct !== undefined ? `${cycle.spo2_pct.toFixed(0)}` : '—'}
          unit="%"
        />
        <StatPill
          label="Skin Temp"
          value={cycle?.skin_temp_celsius !== null && cycle?.skin_temp_celsius !== undefined ? `${cycle.skin_temp_celsius.toFixed(1)}` : '—'}
          unit="°C"
        />
        {sleep?.respiratory_rate !== null && sleep?.respiratory_rate !== undefined && (
          <StatPill
            label="Resp Rate"
            value={sleep.respiratory_rate.toFixed(1)}
            unit="rpm"
          />
        )}
      </div>

      {/* Today's Schedule */}
      {todayEvents.length > 0 && (
        <div className="border-t border-zinc-800 pt-4">
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
