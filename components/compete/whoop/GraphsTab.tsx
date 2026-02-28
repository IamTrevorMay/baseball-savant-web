'use client'

import { WhoopCycleRow, WhoopSleepRow, computeReadiness } from '@/lib/compete/whoop-types'
import MetricTrend from './MetricTrend'

const GRAPHS = [
  { key: 'recovery', label: 'Recovery' },
  { key: 'hrv', label: 'HRV' },
  { key: 'strain', label: 'Strain' },
  { key: 'sleep_score', label: 'Sleep Score' },
  { key: 'sleep_duration', label: 'Sleep Duration' },
  { key: 'rhr', label: 'Resting HR' },
  { key: 'calories', label: 'Calories' },
] as const

interface Props {
  cycles: WhoopCycleRow[]
  sleep: WhoopSleepRow[]
  selectedGraph: string
  onSelectGraph: (key: string) => void
}

export default function GraphsTab({ cycles, sleep, selectedGraph, onSelectGraph }: Props) {
  const sleepByDate = new Map(sleep.map(s => [s.sleep_date, s]))

  function getChartProps() {
    switch (selectedGraph) {
      case 'recovery': {
        const data = cycles.map(c => ({ date: c.cycle_date, value: c.recovery_score }))
        const colors = cycles.map(c => {
          if (c.recovery_state === 'green') return '#22c55e'
          if (c.recovery_state === 'yellow') return '#eab308'
          return '#ef4444'
        })
        const prepareData = cycles.map(c => {
          const matchingSleep = sleepByDate.get(c.cycle_date) ?? null
          const score = computeReadiness(c, matchingSleep, cycles, sleep)
          return { date: c.cycle_date, value: score }
        })
        return {
          data,
          color: '#22c55e',
          title: 'Recovery + Prepare',
          unit: '%',
          markerColors: colors,
          referenceLines: [
            { y: 67, color: '#22c55e' },
            { y: 34, color: '#ef4444' },
          ],
          secondary: { data: prepareData, color: '#14b8a6', label: 'Prepare' },
        }
      }
      case 'hrv':
        return {
          data: cycles.map(c => ({ date: c.cycle_date, value: c.hrv_rmssd })),
          color: '#3b82f6',
          title: 'HRV',
          unit: 'ms',
        }
      case 'strain':
        return {
          data: cycles.map(c => ({ date: c.cycle_date, value: c.strain_score })),
          color: '#f59e0b',
          title: 'Strain',
          chartType: 'bar' as const,
        }
      case 'sleep_score':
        return {
          data: sleep.map(s => ({ date: s.sleep_date, value: s.sleep_score })),
          color: '#8b5cf6',
          title: 'Sleep Score',
          unit: '%',
        }
      case 'sleep_duration':
        return {
          data: sleep.map(s => ({
            date: s.sleep_date,
            value: s.total_duration_ms ? +(s.total_duration_ms / 3_600_000).toFixed(2) : null,
          })),
          color: '#8b5cf6',
          title: 'Sleep Duration',
          unit: 'hrs',
          chartType: 'bar' as const,
        }
      case 'rhr':
        return {
          data: cycles.map(c => ({ date: c.cycle_date, value: c.resting_heart_rate })),
          color: '#ef4444',
          title: 'Resting HR',
          unit: 'bpm',
        }
      case 'calories':
        return {
          data: cycles.map(c => ({
            date: c.cycle_date,
            value: c.kilojoule ? Math.round(c.kilojoule / 4.184) : null,
          })),
          color: '#f97316',
          title: 'Calories',
          unit: 'kcal',
          chartType: 'bar' as const,
        }
      default:
        return {
          data: cycles.map(c => ({ date: c.cycle_date, value: c.recovery_score })),
          color: '#22c55e',
          title: 'Recovery',
          unit: '%',
        }
    }
  }

  const chartProps = getChartProps()

  return (
    <div className="space-y-4">
      {/* Metric selector pills */}
      <div className="flex flex-wrap gap-1.5">
        {GRAPHS.map(g => (
          <button
            key={g.key}
            onClick={() => onSelectGraph(g.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              selectedGraph === g.key
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Large chart */}
      <MetricTrend {...chartProps} height={350} />
    </div>
  )
}
