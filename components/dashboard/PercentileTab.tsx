'use client'
import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  SAVANT_PERCENTILES,
  computePercentile, percentileColor, plusToPercentile,
  computeYearWeightedPlus, computeCommandPlus, computeRPComPlus,
  isFastball, computeXDeceptionScore,
} from '@/lib/leagueStats'

type View = 'rankings' | 'brink' | 'cluster' | 'hdev' | 'vdev' | 'missfire'

interface Props { data: any[] }

const avgArr = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

export default function PercentileTab({ data }: Props) {
  const [view, setView] = useState<View>('rankings')
  const [deceptionVals, setDeceptionVals] = useState<Record<string, number | null>>({
    unique_score: null, deception_score: null, xdeception_score: null,
  })

  // Fetch pre-computed deception scores
  useEffect(() => {
    const pitcherId = data[0]?.pitcher
    if (!pitcherId) return

    const years = [...new Set(data.map(d => d.game_year).filter(Boolean))]
    if (years.length === 0) return

    async function fetchDeception() {
      const yearList = years.join(',')
      const sql = `SELECT pitch_type, pitches, unique_score, deception_score, z_vaa, z_haa, z_vb, z_hb, z_ext FROM pitcher_season_deception WHERE pitcher = ${pitcherId} AND game_year IN (${yearList})`
      const { data: rows } = await supabase.rpc('run_query', { query_text: sql })
      if (!rows?.length) return

      let uniqueSum = 0, decSum = 0, totalW = 0
      const fbZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }
      const osZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }

      for (const r of rows) {
        const w = Number(r.pitches) || 0
        if (r.unique_score != null) { uniqueSum += Number(r.unique_score) * w; totalW += w }
        if (r.deception_score != null) { decSum += Number(r.deception_score) * w }

        const bucket = isFastball(r.pitch_type) ? fbZ : osZ
        if (r.z_vaa != null) {
          bucket.vaa += Number(r.z_vaa) * w
          bucket.haa += Number(r.z_haa) * w
          bucket.vb += Number(r.z_vb) * w
          bucket.hb += Number(r.z_hb) * w
          bucket.ext += (Number(r.z_ext) || 0) * w
          bucket.w += w
        }
      }

      let xdec: number | null = null
      if (fbZ.w > 0 && osZ.w > 0) {
        xdec = computeXDeceptionScore(
          { vaa: fbZ.vaa / fbZ.w, haa: fbZ.haa / fbZ.w, vb: fbZ.vb / fbZ.w, hb: fbZ.hb / fbZ.w, ext: fbZ.ext / fbZ.w },
          { vaa: osZ.vaa / osZ.w, haa: osZ.haa / osZ.w, vb: osZ.vb / osZ.w, hb: osZ.hb / osZ.w, ext: osZ.ext / osZ.w }
        )
      }

      setDeceptionVals({
        unique_score: totalW > 0 ? uniqueSum / totalW : null,
        deception_score: totalW > 0 ? decSum / totalW : null,
        xdeception_score: xdec,
      })
    }
    fetchDeception()
  }, [data])

  // Rankings metrics
  const rankings = useMemo(() => {
    if (!data.length) return []
    const fastballs = data.filter(d => ['4-Seam Fastball', 'FF', 'Fastball', 'FA'].includes(d.pitch_name || d.pitch_type || ''))
    const pas = data.filter(p => p.events)
    const ks = data.filter(p => p.events?.includes('strikeout')).length
    const bbs = data.filter(p => p.events?.includes('walk')).length
    const battedBalls = data.filter(p => p.launch_speed != null)
    const swings = data.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    })
    const whiffs = swings.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d === 'swinging_strike' || d === 'swinging_strike_blocked'
    })
    const outsideZone = data.filter(d => d.zone != null && Number(d.zone) >= 11)
    const chasePitches = outsideZone.filter(d => {
      const desc = (d.description || '').toLowerCase()
      return desc.includes('swing') || desc.includes('foul') || desc.includes('hit_into_play')
    })

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const velos = data.map(d => d.release_speed).filter((v): v is number => v != null)
    const spins = data.map(d => d.release_spin_rate).filter((v): v is number => v != null)
    const exts = data.map(d => d.release_extension).filter((v): v is number => v != null)
    const evs = battedBalls.map(d => d.launch_speed)
    const xbas = data.map(d => d.estimated_ba_using_speedangle).filter((v: any) => v != null)
    const barrels = battedBalls.filter(d => d.launch_speed >= 98 && d.launch_angle >= 26 && d.launch_angle <= 30).length
    const hardHits = battedBalls.filter(d => d.launch_speed >= 95).length
    const gbs = battedBalls.filter(d => d.bb_type === 'ground_ball').length
    const ffIvbs = fastballs.map(d => d.pfx_z != null ? d.pfx_z * 12 : null).filter((v): v is number => v != null)
    const ffVaas = fastballs.map(d => d.vaa).filter((v): v is number => v != null)

    const vals: Record<string, number | null> = {
      avg_velo: avg(velos),
      max_velo: velos.length ? Math.max(...velos) : null,
      k_pct: pas.length > 0 ? (ks / pas.length) * 100 : null,
      bb_pct: pas.length > 0 ? (bbs / pas.length) * 100 : null,
      whiff_pct: swings.length > 0 ? (whiffs.length / swings.length) * 100 : null,
      chase_pct: outsideZone.length > 0 ? (chasePitches.length / outsideZone.length) * 100 : null,
      barrel_pct: battedBalls.length > 0 ? (barrels / battedBalls.length) * 100 : null,
      hard_hit: battedBalls.length > 0 ? (hardHits / battedBalls.length) * 100 : null,
      avg_ev: avg(evs),
      xba: avg(xbas),
      gb_pct: battedBalls.length > 0 ? (gbs / battedBalls.length) * 100 : null,
      avg_spin: avg(spins),
      extension: avg(exts),
      ivb_ff: avg(ffIvbs),
      vaa_ff: avg(ffVaas),
      unique_score: deceptionVals.unique_score,
      deception_score: deceptionVals.deception_score,
      xdeception_score: deceptionVals.xdeception_score,
    }

    const results: { key: string; label: string; value: number; unit: string; pct: number }[] = []
    for (const [key, def] of Object.entries(SAVANT_PERCENTILES)) {
      const v = vals[key]
      if (v == null) continue
      results.push({
        key, label: def.label, unit: def.unit, value: v,
        pct: computePercentile(v, def.percentiles, def.higherBetter),
      })
    }
    return results
  }, [data, deceptionVals])

  // Raw command metrics per pitch type with percentile ranks
  const rawMetrics = useMemo(() => {
    const groups: Record<string, any[]> = {}
    data.forEach(d => { if (d.pitch_name) { if (!groups[d.pitch_name]) groups[d.pitch_name] = []; groups[d.pitch_name].push(d) } })

    type MetricRow = { name: string; value: number; count: number; pct: number | null }

    const brinkRows: MetricRow[] = []
    const clusterRows: MetricRow[] = []
    const hdevRows: MetricRow[] = []
    const vdevRows: MetricRow[] = []
    const missfireRows: MetricRow[] = []

    for (const [name, pitches] of Object.entries(groups)) {
      const brinks = pitches.map(p => p.brink).filter((v: any) => v != null)
      const clusters = pitches.map(p => p.cluster).filter((v: any) => v != null)
      const hdevs = pitches.map(p => p.hdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const vdevs = pitches.map(p => p.vdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const missfires = brinks.filter((v: number) => v < 0).map((v: number) => -v)

      // Compute plus stats → percentile for each metric
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

      const ab = avgArr(brinks)
      if (ab != null) brinkRows.push({ name, value: ab, count: pitches.length, pct: brinkPlus != null ? plusToPercentile(brinkPlus) : null })
      const ac = avgArr(clusters)
      if (ac != null) clusterRows.push({ name, value: ac, count: pitches.length, pct: clusterPlus != null ? plusToPercentile(clusterPlus) : null })
      const ah = avgArr(hdevs)
      if (ah != null) hdevRows.push({ name, value: ah, count: pitches.length, pct: hdevPlus != null ? plusToPercentile(hdevPlus) : null })
      const av = avgArr(vdevs)
      if (av != null) vdevRows.push({ name, value: av, count: pitches.length, pct: vdevPlus != null ? plusToPercentile(vdevPlus) : null })
      const am = avgArr(missfires)
      if (am != null) missfireRows.push({ name, value: am, count: pitches.length, pct: missfirePlus != null ? plusToPercentile(missfirePlus) : null })
    }

    return {
      brinkRows: brinkRows.sort((a, b) => b.value - a.value),
      clusterRows: clusterRows.sort((a, b) => a.value - b.value),
      hdevRows: hdevRows.sort((a, b) => a.value - b.value),
      vdevRows: vdevRows.sort((a, b) => a.value - b.value),
      missfireRows: missfireRows.sort((a, b) => a.value - b.value),
    }
  }, [data])

  const formatVal = (v: number, unit: string) => {
    if (unit === '%') return v.toFixed(1) + '%'
    if (unit === '') return v.toFixed(3)
    if (unit === 'z') return v.toFixed(2)
    return v.toFixed(1) + (unit ? ' ' + unit : '')
  }

  type MetricView = { key: View; title: string; desc: string; unit: string; rows: { name: string; value: number; count: number; pct: number | null }[]; higherBetter: boolean }
  const metricViews: MetricView[] = [
    { key: 'brink', title: 'Brink', desc: 'Avg signed distance to nearest strike zone edge (in) — higher = pitches closer to edges', unit: 'in', rows: rawMetrics.brinkRows, higherBetter: true },
    { key: 'cluster', title: 'Cluster', desc: 'Avg distance from pitch-type centroid (in) — lower = tighter clustering', unit: 'in', rows: rawMetrics.clusterRows, higherBetter: false },
    { key: 'hdev', title: 'HDev', desc: 'Avg absolute horizontal deviation from centroid (in) — lower = tighter horizontal spread', unit: 'in', rows: rawMetrics.hdevRows, higherBetter: false },
    { key: 'vdev', title: 'VDev', desc: 'Avg absolute vertical deviation from centroid (in) — lower = tighter vertical spread', unit: 'in', rows: rawMetrics.vdevRows, higherBetter: false },
    { key: 'missfire', title: 'Missfire', desc: 'Avg distance of outside-zone pitches from closest zone edge (in) — lower = misses stay closer', unit: 'in', rows: rawMetrics.missfireRows, higherBetter: false },
  ]

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex gap-1 flex-wrap">
        {([['rankings', 'Rankings'], ['brink', 'Brink'], ['cluster', 'Cluster'], ['hdev', 'HDev'], ['vdev', 'VDev'], ['missfire', 'Missfire']] as [View, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${
              view === v ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Rankings view */}
      {view === 'rankings' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <h3 className="text-sm font-semibold text-zinc-300 mb-4">Percentile Rankings</h3>
          <div className="space-y-2">
            {rankings.map(m => {
              const pct = Math.round(m.pct)
              const color = percentileColor(pct)
              return (
                <div key={m.key} className="flex items-center gap-3 h-8">
                  <span className="w-24 text-xs text-zinc-400 text-right shrink-0">{m.label}</span>
                  <span className="w-16 text-xs font-mono text-zinc-300 text-right shrink-0">{formatVal(m.value, m.unit)}</span>
                  <div className="flex-1 relative h-5 bg-zinc-800 rounded overflow-hidden">
                    <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-zinc-600 z-10" />
                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }} />
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: color }}>
                    {pct}
                  </div>
                </div>
              )
            })}
          </div>
          {rankings.length === 0 && <p className="text-zinc-500 text-sm">Insufficient data</p>}
        </div>
      )}

      {/* Raw metric views by pitch type */}
      {metricViews.map(mv => view === mv.key && (
        <div key={mv.key} className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
          <h3 className="text-sm font-semibold text-zinc-300 mb-1">{mv.title} by Pitch Type</h3>
          <p className="text-[11px] text-zinc-500 mb-4">{mv.desc}</p>
          <div className="space-y-2">
            {mv.rows.map((r) => {
              const maxVal = Math.max(...mv.rows.map(x => Math.abs(x.value)))
              const barPct = maxVal > 0 ? (Math.abs(r.value) / maxVal) * 100 : 0
              const pct = r.pct
              const color = pct != null ? percentileColor(pct) : 'rgb(100,100,100)'
              return (
                <div key={r.name} className="flex items-center gap-3 h-8">
                  <span className="w-28 text-xs text-zinc-400 text-right shrink-0 truncate">{r.name}</span>
                  <span className="w-14 text-xs font-mono text-zinc-300 text-right shrink-0">{r.value.toFixed(1)}&quot;</span>
                  <div className="flex-1 relative h-5 bg-zinc-800 rounded overflow-hidden">
                    <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-zinc-600 z-10" />
                    <div className="h-full rounded transition-all" style={{ width: `${barPct}%`, backgroundColor: color, opacity: 0.8 }} />
                  </div>
                  {pct != null ? (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                      style={{ backgroundColor: color }}>
                      {pct}
                    </div>
                  ) : (
                    <span className="w-8 text-[10px] font-mono text-zinc-500 text-center shrink-0">—</span>
                  )}
                </div>
              )
            })}
          </div>
          {mv.rows.length === 0 && <p className="text-zinc-500 text-sm">Insufficient data</p>}
        </div>
      ))}
    </div>
  )
}
