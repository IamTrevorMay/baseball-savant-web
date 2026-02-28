'use client'

import { WhoopCycleRow, WhoopSleepRow, WhoopWorkoutRow, computeReadiness } from '@/lib/compete/whoop-types'
import { ScheduleEvent } from '@/lib/compete/schedule-types'
import TodayHero from './TodayHero'
import MetricTrend from './MetricTrend'
import StrainCard from './StrainCard'

interface Props {
  cycles: WhoopCycleRow[]
  sleep: WhoopSleepRow[]
  workouts: WhoopWorkoutRow[]
  todayCycle: WhoopCycleRow | null
  todaySleep: WhoopSleepRow | null
  todayEvents: ScheduleEvent[]
  onGraphClick?: (graphKey: string) => void
}

export default function OverviewTab({ cycles, sleep, workouts, todayCycle, todaySleep, todayEvents, onGraphClick }: Props) {
  // Recovery trend data with color-coded markers
  const recoveryData = cycles.map(c => ({ date: c.cycle_date, value: c.recovery_score }))
  const recoveryColors = cycles.map(c => {
    if (c.recovery_state === 'green') return '#22c55e'
    if (c.recovery_state === 'yellow') return '#eab308'
    return '#ef4444'
  })

  // Prepare trend data (computed per-cycle using full history for percentile context)
  const sleepByDate = new Map(sleep.map(s => [s.sleep_date, s]))
  const prepareData = cycles.map(c => {
    const matchingSleep = sleepByDate.get(c.cycle_date) ?? null
    const score = computeReadiness(c, matchingSleep, cycles, sleep)
    return { date: c.cycle_date, value: score }
  })

  // HRV trend
  const hrvData = cycles.map(c => ({ date: c.cycle_date, value: c.hrv_rmssd }))

  // Strain trend
  const strainData = cycles.map(c => ({ date: c.cycle_date, value: c.strain_score }))

  return (
    <div className="space-y-4">
      {/* Today Hero */}
      <TodayHero cycle={todayCycle} sleep={todaySleep} todayEvents={todayEvents} allCycles={cycles} allSleep={sleep} sleepData={sleep} />

      {/* Trend Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={onGraphClick ? 'cursor-pointer rounded-xl transition hover:ring-1 hover:ring-zinc-700' : ''}
          onClick={() => onGraphClick?.('recovery')}
        >
          <MetricTrend
            data={recoveryData}
            color="#22c55e"
            title="Recovery"
            unit="%"
            markerColors={recoveryColors}
            referenceLines={[
              { y: 67, color: '#22c55e' },
              { y: 34, color: '#ef4444' },
            ]}
            secondary={{ data: prepareData, color: '#14b8a6', label: 'Prepare' }}
          />
        </div>
        <div
          className={onGraphClick ? 'cursor-pointer rounded-xl transition hover:ring-1 hover:ring-zinc-700' : ''}
          onClick={() => onGraphClick?.('hrv')}
        >
          <MetricTrend
            data={hrvData}
            color="#3b82f6"
            title="HRV"
            unit="ms"
          />
        </div>
        <div
          className={onGraphClick ? 'cursor-pointer rounded-xl transition hover:ring-1 hover:ring-zinc-700' : ''}
          onClick={() => onGraphClick?.('strain')}
        >
          <MetricTrend
            data={strainData}
            color="#f59e0b"
            title="Strain"
            chartType="bar"
          />
        </div>
      </div>

      {/* Workouts */}
      <StrainCard workouts={workouts} />
    </div>
  )
}
