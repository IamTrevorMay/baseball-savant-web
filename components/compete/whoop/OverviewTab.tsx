'use client'

import { WhoopCycleRow, WhoopSleepRow, WhoopWorkoutRow } from '@/lib/compete/whoop-types'
import { ScheduleEvent } from '@/lib/compete/schedule-types'
import TodayHero from './TodayHero'
import MetricTrend from './MetricTrend'
import SleepCard from './SleepCard'
import StrainCard from './StrainCard'

interface Props {
  cycles: WhoopCycleRow[]
  sleep: WhoopSleepRow[]
  workouts: WhoopWorkoutRow[]
  todayCycle: WhoopCycleRow | null
  todaySleep: WhoopSleepRow | null
  todayEvents: ScheduleEvent[]
}

export default function OverviewTab({ cycles, sleep, workouts, todayCycle, todaySleep, todayEvents }: Props) {
  // Recovery trend data with color-coded markers
  const recoveryData = cycles.map(c => ({ date: c.cycle_date, value: c.recovery_score }))
  const recoveryColors = cycles.map(c => {
    if (c.recovery_state === 'green') return '#22c55e'
    if (c.recovery_state === 'yellow') return '#eab308'
    return '#ef4444'
  })

  // HRV trend
  const hrvData = cycles.map(c => ({ date: c.cycle_date, value: c.hrv_rmssd }))

  // Strain trend
  const strainData = cycles.map(c => ({ date: c.cycle_date, value: c.strain_score }))

  return (
    <div className="space-y-4">
      {/* Today Hero */}
      <TodayHero cycle={todayCycle} sleep={todaySleep} todayEvents={todayEvents} />

      {/* Trend Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        />
        <MetricTrend
          data={hrvData}
          color="#3b82f6"
          title="HRV"
          unit="ms"
        />
        <MetricTrend
          data={strainData}
          color="#f59e0b"
          title="Strain"
          chartType="bar"
        />
      </div>

      {/* Sleep & Workouts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SleepCard sleepData={sleep} />
        <StrainCard workouts={workouts} />
      </div>
    </div>
  )
}
