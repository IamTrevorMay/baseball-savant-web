'use client'
import { useMemo } from 'react'
import {
  computeYearWeightedPlus, computeCommandPlus, computeRPComPlus,
} from '@/lib/leagueStats'

interface Props { data: any[] }

const avgArr = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

export default function PitchLevelTab({ data }: Props) {
  const rows = useMemo(() => {
    const groups: Record<string, any[]> = {}
    data.forEach(d => {
      if (d.pitch_name) {
        if (!groups[d.pitch_name]) groups[d.pitch_name] = []
        groups[d.pitch_name].push(d)
      }
    })

    return Object.entries(groups).map(([name, pitches]) => {
      const brinks = pitches.map(p => p.brink).filter((v: any) => v != null)
      const clusters = pitches.map(p => p.cluster).filter((v: any) => v != null)
      const hdevs = pitches.map(p => p.hdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const vdevs = pitches.map(p => p.vdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const missfires = brinks.filter((v: number) => v < 0).map((v: number) => -v)

      const avgBrink = avgArr(brinks)
      const avgCluster = avgArr(clusters)
      const avgHdev = avgArr(hdevs)
      const avgVdev = avgArr(vdevs)
      const avgMissfire = avgArr(missfires)
      const wastePct = brinks.length > 0 ? (brinks.filter((v: number) => v < -10).length / brinks.length) * 100 : null

      // Year-weighted plus stats
      const brinkPlus = computeYearWeightedPlus(pitches, name, 'brink',
        pts => { const v = pts.map((p: any) => p.brink).filter((x: any) => x != null); return avgArr(v) })
      const clusterPlus = computeYearWeightedPlus(pitches, name, 'cluster',
        pts => { const v = pts.map((p: any) => p.cluster).filter((x: any) => x != null); return avgArr(v) }, true)
      const hdevPlus = computeYearWeightedPlus(pitches, name, 'hdev',
        pts => { const v = pts.map((p: any) => p.hdev).filter((x: any) => x != null).map((x: number) => Math.abs(x)); return avgArr(v) }, true)
      const vdevPlus = computeYearWeightedPlus(pitches, name, 'vdev',
        pts => { const v = pts.map((p: any) => p.vdev).filter((x: any) => x != null).map((x: number) => Math.abs(x)); return avgArr(v) }, true)
      const missfirePlus = computeYearWeightedPlus(pitches, name, 'missfire',
        pts => { const b = pts.map((p: any) => p.brink).filter((x: any) => x != null && x < 0).map((x: number) => -x); return avgArr(b) }, true)

      const commandPlus = brinkPlus != null && clusterPlus != null && missfirePlus != null
        ? String(computeCommandPlus(brinkPlus, clusterPlus, missfirePlus)) : '—'
      const rpcomPlus = brinkPlus != null && clusterPlus != null && hdevPlus != null && vdevPlus != null && missfirePlus != null
        ? String(computeRPComPlus(brinkPlus, clusterPlus, hdevPlus, vdevPlus, missfirePlus)) : '—'

      return {
        name,
        count: pitches.length,
        brink: avgBrink != null ? avgBrink.toFixed(1) : '—',
        cluster: avgCluster != null ? avgCluster.toFixed(1) : '—',
        hdev: avgHdev != null ? avgHdev.toFixed(1) : '—',
        vdev: avgVdev != null ? avgVdev.toFixed(1) : '—',
        missfire: avgMissfire != null ? avgMissfire.toFixed(1) : '—',
        wastePct: wastePct != null ? wastePct.toFixed(1) + '%' : '—',
        brinkPlus: brinkPlus != null ? String(brinkPlus) : '—',
        clusterPlus: clusterPlus != null ? String(clusterPlus) : '—',
        hdevPlus: hdevPlus != null ? String(hdevPlus) : '—',
        vdevPlus: vdevPlus != null ? String(vdevPlus) : '—',
        missfirePlus: missfirePlus != null ? String(missfirePlus) : '—',
        commandPlus,
        rpcomPlus,
      }
    }).sort((a, b) => b.count - a.count)
  }, [data])

  const cols = [
    { k: 'name', l: 'Pitch' },
    { k: 'count', l: '#' },
    { k: 'brink', l: 'Brink' },
    { k: 'cluster', l: 'Cluster' },
    { k: 'hdev', l: 'HDev' },
    { k: 'vdev', l: 'VDev' },
    { k: 'missfire', l: 'Missfire' },
    { k: 'wastePct', l: 'Waste%' },
    { k: 'brinkPlus', l: 'Brink+' },
    { k: 'clusterPlus', l: 'Cluster+' },
    { k: 'hdevPlus', l: 'HDev+' },
    { k: 'vdevPlus', l: 'VDev+' },
    { k: 'missfirePlus', l: 'Missfire+' },
    { k: 'commandPlus', l: 'Cmd+' },
    { k: 'rpcomPlus', l: 'RPCom+' },
  ]

  const cellColor = (k: string, v: any) => {
    if (k === 'name') return 'text-white font-medium'
    if (k === 'count') return 'text-zinc-400'
    if (['brink', 'cluster', 'hdev', 'vdev', 'missfire'].includes(k)) return 'text-teal-400'
    if (k === 'wastePct') return 'text-orange-400'
    if (['brinkPlus', 'clusterPlus', 'hdevPlus', 'vdevPlus', 'missfirePlus', 'commandPlus', 'rpcomPlus'].includes(k)) {
      const n = Number(v)
      if (isNaN(n)) return 'text-zinc-400'
      return n > 100 ? 'text-teal-400' : n < 100 ? 'text-orange-400' : 'text-zinc-300'
    }
    return 'text-zinc-300'
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Pitch-Level Metrics</h3>
          <span className="text-[11px] text-zinc-500">{data.length.toLocaleString()} pitches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.k} className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium whitespace-nowrap text-right first:text-left">{c.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/30 transition">
                  {cols.map(c => (
                    <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${cellColor(c.k, r[c.k])}`}>
                      {r[c.k] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="text-[11px] text-zinc-500 space-y-1 px-1">
        <p><span className="text-teal-400 font-medium">Brink</span> — avg signed distance to nearest strike zone edge (in). Higher = closer to edges.</p>
        <p><span className="text-teal-400 font-medium">Cluster</span> — avg distance from pitch-type centroid (in). Lower = tighter grouping.</p>
        <p><span className="text-teal-400 font-medium">HDev</span> — avg horizontal deviation from centroid (in, pitcher POV). Lower = tighter horizontal spread.</p>
        <p><span className="text-teal-400 font-medium">VDev</span> — avg vertical deviation from centroid (in). Lower = tighter vertical spread.</p>
        <p><span className="text-teal-400 font-medium">Missfire</span> — avg distance of outside-zone pitches from closest zone edge (in). Lower = misses stay closer to zone.</p>
        <p><span className="text-orange-400 font-medium">Waste%</span> — percentage of pitches more than 10\" outside the zone. Lower = fewer wasted pitches.</p>
        <p>Plus stats: 100 = league avg, +10 = 1 stddev better. <span className="text-teal-400">Above 100</span> = better than avg, <span className="text-orange-400">below 100</span> = worse.</p>
        <p><span className="text-teal-400 font-medium">Cmd+</span> — Command+ composite: 40% Brink+ + 30% Cluster+ + 30% Missfire+ (theory-weighted skill).</p>
        <p><span className="text-teal-400 font-medium">RPCom+</span> — Run Prevention Command+: all 5 metrics weighted by correlation with xwOBA-against.</p>
      </div>
    </div>
  )
}
