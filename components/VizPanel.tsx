'use client'
import { useState } from 'react'
import {
  StrikeZoneHeatmap, PitchMovement, SprayChart, VelocityDistribution,
  ReleasePoint, PitchUsage, RollingAverages, SpinVsVelo,
  ExitVeloLaunchAngle, WhiffByZone, ArmAngleBreak
} from './charts'

const CHARTS = [
  { id: 'usage', label: 'Pitch Usage', component: PitchUsage },
  { id: 'zone', label: 'Strike Zone', component: StrikeZoneHeatmap },
  { id: 'movement', label: 'Pitch Movement', component: PitchMovement },
  { id: 'velo', label: 'Velocity', component: VelocityDistribution },
  { id: 'release', label: 'Release Point', component: ReleasePoint },
  { id: 'spray', label: 'Spray Chart', component: SprayChart },
  { id: 'spin_velo', label: 'Spin vs Velo', component: SpinVsVelo },
  { id: 'ev_la', label: 'EV vs LA', component: ExitVeloLaunchAngle },
  { id: 'whiff', label: 'Whiff by Zone', component: WhiffByZone },
  { id: 'arm', label: 'Arm Angle vs Break', component: ArmAngleBreak },
  { id: 'trend', label: 'Velo Trend', component: RollingAverages },
]

export default function VizPanel({ data }: { data: any[] }) {
  const [active, setActive] = useState<string[]>([])

  function toggle(id: string) {
    setActive(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  if (!data.length) return null

  return (
    <div className="border-t border-zinc-800">
      {/* Chart selector bar */}
      <div className="bg-zinc-900/50 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold shrink-0 mr-2">Charts</span>
        {CHARTS.map(c => (
          <button key={c.id} onClick={() => toggle(c.id)}
            className={`px-3 py-1.5 rounded text-[11px] font-medium border transition whitespace-nowrap ${
              active.includes(c.id)
                ? 'bg-emerald-700/30 border-emerald-600/50 text-emerald-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}>
            {c.label}
          </button>
        ))}
        {active.length > 0 && (
          <button onClick={() => setActive([])}
            className="px-2 py-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition shrink-0">
            Clear all
          </button>
        )}
      </div>

      {/* Active charts */}
      {active.length > 0 && (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {active.map(id => {
            const chart = CHARTS.find(c => c.id === id)
            if (!chart) return null
            const Component = chart.component
            return (
              <div key={id} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                <Component data={data} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
