'use client'
import { useMemo } from 'react'
import {
  BRINK_LEAGUE, CLUSTER_LEAGUE, HDEV_LEAGUE, VDEV_LEAGUE, computePlus,
} from '@/lib/leagueStats'

interface Props { data: any[] }

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
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

      const brinks = pitches.map(p => p.brink).filter((v: any) => v != null)
      const clusters = pitches.map(p => p.cluster).filter((v: any) => v != null)
      const hdevs = pitches.map(p => p.hdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const vdevs = pitches.map(p => p.vdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))

      const avgBrink = avg(brinks)
      const avgCluster = avg(clusters)
      const avgHdev = avg(hdevs)
      const avgVdev = avg(vdevs)

      // Plus stats
      const brinkL = BRINK_LEAGUE[name]
      const clusterL = CLUSTER_LEAGUE[name]
      const hdevL = HDEV_LEAGUE[name]
      const vdevL = VDEV_LEAGUE[name]

      const brinkPlus = avgBrink != null && brinkL ? Math.round(computePlus(avgBrink, brinkL.mean, brinkL.stddev)) : null
      // Lower = tighter = better, so invert for cluster, hdev, vdev
      const clusterPlus = avgCluster != null && clusterL ? Math.round(100 - (computePlus(avgCluster, clusterL.mean, clusterL.stddev) - 100)) : null
      const hdevPlus = avgHdev != null && hdevL ? Math.round(100 - (computePlus(avgHdev, hdevL.mean, hdevL.stddev) - 100)) : null
      const vdevPlus = avgVdev != null && vdevL ? Math.round(100 - (computePlus(avgVdev, vdevL.mean, vdevL.stddev) - 100)) : null

      return {
        name,
        count: pitches.length,
        brink: avgBrink != null ? avgBrink.toFixed(1) : '—',
        cluster: avgCluster != null ? avgCluster.toFixed(1) : '—',
        hdev: avgHdev != null ? avgHdev.toFixed(1) : '—',
        vdev: avgVdev != null ? avgVdev.toFixed(1) : '—',
        brinkPlus: brinkPlus != null ? String(brinkPlus) : '—',
        clusterPlus: clusterPlus != null ? String(clusterPlus) : '—',
        hdevPlus: hdevPlus != null ? String(hdevPlus) : '—',
        vdevPlus: vdevPlus != null ? String(vdevPlus) : '—',
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
    { k: 'brinkPlus', l: 'Brink+' },
    { k: 'clusterPlus', l: 'Cluster+' },
    { k: 'hdevPlus', l: 'HDev+' },
    { k: 'vdevPlus', l: 'VDev+' },
  ]

  const cellColor = (k: string, v: any) => {
    if (k === 'name') return 'text-white font-medium'
    if (k === 'count') return 'text-zinc-400'
    if (['brink', 'cluster', 'hdev', 'vdev'].includes(k)) return 'text-teal-400'
    if (['brinkPlus', 'clusterPlus', 'hdevPlus', 'vdevPlus'].includes(k)) {
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
        <p>Plus stats: 100 = league avg, +10 = 1 stddev better. <span className="text-teal-400">Above 100</span> = better than avg, <span className="text-orange-400">below 100</span> = worse.</p>
      </div>
    </div>
  )
}
