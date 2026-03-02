'use client'
import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  computeYearWeightedPlus, computeCommandPlus, computeRPComPlus,
  isFastball, computeXDeceptionScore,
} from '@/lib/leagueStats'
import Tip from '@/components/Tip'

interface Props { data: any[] }

const avgArr = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

// Map pitch_name → pitch_type for deception lookup
const PITCH_NAME_TO_TYPE: Record<string, string> = {
  '4-Seam Fastball': 'FF', 'Sinker': 'SI', 'Cutter': 'FC', 'Slider': 'SL',
  'Sweeper': 'SW', 'Curveball': 'CU', 'Changeup': 'CH', 'Split-Finger': 'FS',
  'Knuckle Curve': 'KC', 'Slurve': 'SV',
}

export default function PitchLevelTab({ data }: Props) {
  // Fetch pre-computed deception scores for this pitcher
  const [deceptionData, setDeceptionData] = useState<Record<string, any>>({})

  useEffect(() => {
    const pitcherId = data[0]?.pitcher
    if (!pitcherId) return

    // Get the years from the data
    const years = [...new Set(data.map(d => d.game_year).filter(Boolean))]
    if (years.length === 0) return

    async function fetchDeception() {
      const yearList = years.join(',')
      const sql = `SELECT pitch_type, pitch_name, pitches, unique_score, deception_score, z_vaa, z_haa, z_vb, z_hb, z_ext, game_year FROM pitcher_season_deception WHERE pitcher = ${pitcherId} AND game_year IN (${yearList})`
      const { data: rows } = await supabase.rpc('run_query', { query_text: sql })
      if (!rows) return
      // Group by pitch_type, weighted average across years
      const byType: Record<string, { unique_sum: number; dec_sum: number; weight: number; z: Record<string, number>; zw: number }> = {}
      for (const r of rows) {
        const pt = r.pitch_type
        const w = Number(r.pitches) || 0
        if (!byType[pt]) byType[pt] = { unique_sum: 0, dec_sum: 0, weight: 0, z: { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0 }, zw: 0 }
        const b = byType[pt]
        if (r.unique_score != null) { b.unique_sum += Number(r.unique_score) * w; b.weight += w }
        if (r.deception_score != null) { b.dec_sum += Number(r.deception_score) * w }
        if (r.z_vaa != null) {
          b.z.vaa += Number(r.z_vaa) * w
          b.z.haa += Number(r.z_haa) * w
          b.z.vb += Number(r.z_vb) * w
          b.z.hb += Number(r.z_hb) * w
          b.z.ext += (Number(r.z_ext) || 0) * w
          b.zw += w
        }
      }
      const result: Record<string, any> = {}
      for (const [pt, b] of Object.entries(byType)) {
        result[pt] = {
          unique: b.weight > 0 ? b.unique_sum / b.weight : null,
          deception: b.weight > 0 ? b.dec_sum / b.weight : null,
          z: b.zw > 0 ? { vaa: b.z.vaa / b.zw, haa: b.z.haa / b.zw, vb: b.z.vb / b.zw, hb: b.z.hb / b.zw, ext: b.z.ext / b.zw } : null,
        }
      }
      setDeceptionData(result)
    }
    fetchDeception()
  }, [data])

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

      // Deception scores from pre-computed data
      const pt = PITCH_NAME_TO_TYPE[name]
      const dec = pt ? deceptionData[pt] : null

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
        unique: dec?.unique != null ? dec.unique.toFixed(2) : '—',
        deception: dec?.deception != null ? dec.deception.toFixed(2) : '—',
        _pitchType: pt,
      }
    }).sort((a, b) => b.count - a.count)
  }, [data, deceptionData])

  // Compute overall xDeception from FB/OS z-score aggregates
  const xDeception = useMemo(() => {
    const fbZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }
    const osZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }
    for (const row of rows) {
      const pt = row._pitchType
      if (!pt) continue
      const dec = deceptionData[pt]
      if (!dec?.z) continue
      const w = row.count
      const bucket = isFastball(pt) ? fbZ : osZ
      bucket.vaa += dec.z.vaa * w; bucket.haa += dec.z.haa * w
      bucket.vb += dec.z.vb * w; bucket.hb += dec.z.hb * w
      bucket.ext += dec.z.ext * w; bucket.w += w
    }
    if (fbZ.w > 0 && osZ.w > 0) {
      return computeXDeceptionScore(
        { vaa: fbZ.vaa / fbZ.w, haa: fbZ.haa / fbZ.w, vb: fbZ.vb / fbZ.w, hb: fbZ.hb / fbZ.w, ext: fbZ.ext / fbZ.w },
        { vaa: osZ.vaa / osZ.w, haa: osZ.haa / osZ.w, vb: osZ.vb / osZ.w, hb: osZ.hb / osZ.w, ext: osZ.ext / osZ.w }
      ).toFixed(2)
    }
    return '—'
  }, [rows, deceptionData])

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
    { k: 'unique', l: 'Unique' },
    { k: 'deception', l: 'Deception' },
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
    if (k === 'unique' || k === 'deception') {
      const n = Number(v)
      if (isNaN(n)) return 'text-zinc-400'
      if (n >= 1.0) return 'text-emerald-300'
      if (n >= 0.5) return 'text-teal-400'
      if (n >= 0.0) return 'text-zinc-300'
      if (n >= -0.5) return 'text-orange-400'
      return 'text-red-400'
    }
    return 'text-zinc-300'
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Pitch-Level Metrics</h3>
          <div className="flex items-center gap-4">
            {xDeception !== '—' && (
              <span className="text-[11px] text-zinc-400">
                xDeception: <span className={`font-mono font-medium ${Number(xDeception) >= 0.5 ? 'text-emerald-400' : Number(xDeception) >= 0 ? 'text-zinc-300' : 'text-orange-400'}`}>{xDeception}</span>
              </span>
            )}
            <span className="text-[11px] text-zinc-500">{data.length.toLocaleString()} pitches</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.k} className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium whitespace-nowrap text-right first:text-left"><Tip label={c.l} /></th>
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
        <p><span className="text-orange-400 font-medium">Waste%</span> — percentage of pitches more than 10&quot; outside the zone. Lower = fewer wasted pitches.</p>
        <p>Plus stats: 100 = league avg, +10 = 1 stddev better. <span className="text-teal-400">Above 100</span> = better than avg, <span className="text-orange-400">below 100</span> = worse.</p>
        <p><span className="text-teal-400 font-medium">Cmd+</span> — Command+ composite: 40% Brink+ + 30% Cluster+ + 30% Missfire+ (theory-weighted skill).</p>
        <p><span className="text-teal-400 font-medium">RPCom+</span> — Run Prevention Command+: all 5 metrics weighted by correlation with xwOBA-against.</p>
        <p><span className="text-emerald-300 font-medium">Unique</span> — how unusual the ball flight is (absolute z-scores). Higher = more unique pitch characteristics.</p>
        <p><span className="text-emerald-300 font-medium">Deception</span> — signed z-scores with directional value. Higher = more deceptive pitch movement/release.</p>
        <p><span className="text-emerald-300 font-medium">xDeception</span> — empirical regression-weighted overall deception (best predictive validity with whiff%).</p>
      </div>
    </div>
  )
}
