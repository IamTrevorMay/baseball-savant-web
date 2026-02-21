'use client'
import SprayChart from '../charts/SprayChart'
import ExitVeloLaunchAngle from '../charts/ExitVeloLaunchAngle'

export default function ResultsTab({ data }: { data: any[] }) {
  const batted = data.filter(d => d.events)
  const hits = batted.filter(d => ['single','double','triple','home_run'].includes(d.events))
  const ks = batted.filter(d => d.events?.includes('strikeout'))
  const bbs = batted.filter(d => d.events?.includes('walk'))

  const evs = data.filter(d => d.launch_speed).map(d => d.launch_speed)
  const avgEv = evs.length ? (evs.reduce((a: number,b: number) => a+b,0)/evs.length).toFixed(1) : '—'
  const maxEv = evs.length ? Math.max(...evs).toFixed(1) : '—'

  const xbas = data.filter(d => d.estimated_ba_using_speedangle != null).map(d => d.estimated_ba_using_speedangle)
  const avgXba = xbas.length ? (xbas.reduce((a: number,b: number) => a+b,0)/xbas.length).toFixed(3) : '—'

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'PA', value: batted.length },
          { label: 'Hits', value: hits.length },
          { label: 'K', value: ks.length },
          { label: 'BB', value: bbs.length },
          { label: 'Avg EV', value: avgEv },
          { label: 'Avg xBA', value: avgXba },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 text-center">
            <div className="text-lg font-bold text-white">{s.value}</div>
            <div className="text-[11px] text-zinc-500 uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <SprayChart data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <ExitVeloLaunchAngle data={data} />
        </div>
      </div>
    </div>
  )
}
