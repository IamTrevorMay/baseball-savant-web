'use client'
import { useMemo, useState, useEffect } from 'react'
import {
  SAVANT_PERCENTILES, computePercentile, percentileColor, valueToPercentile,
  METRIC_META, METRIC_ORDER, isFastball, computeXDeceptionScore,
} from '@/lib/leagueStats'
import { supabase } from '@/lib/supabase'

const avgArr = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

export default function PercentileRankings({ data }: { data: any[] }) {
  const [baselines, setBaselines] = useState<Record<string, { mean: number; stddev: number; higher_better: boolean }>>({})
  const [deceptionVals, setDeceptionVals] = useState<Record<string, number | null>>({
    unique_score: null, deception_score: null, xdeception_score: null,
  })

  // Fetch dynamic league baselines
  useEffect(() => {
    const years = [...new Set(data.map(d => d.game_year).filter(Boolean))]
    if (years.length === 0) return
    fetch(`/api/league-baselines?years=${years.join(',')}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const map: Record<string, { mean: number; stddev: number; higher_better: boolean }> = {}
        for (const r of rows) {
          if (r.pitch_type === '_all') {
            map[r.metric] = { mean: Number(r.mean), stddev: Number(r.stddev), higher_better: r.higher_better }
          }
        }
        setBaselines(map)
      })
      .catch(() => {})
  }, [data])

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
    const evs = battedBalls.map(d => d.launch_speed)
    const xbas = data.map(d => d.estimated_ba_using_speedangle).filter((v: any) => v != null)
    const barrels = battedBalls.filter(d => String(d.launch_speed_angle) === '6').length
    const hardHits = battedBalls.filter(d => d.launch_speed >= 95).length
    const gbs = battedBalls.filter(d => d.bb_type === 'ground_ball').length
    const ffIvbs = fastballs.map(d => d.pfx_z != null ? d.pfx_z * 12 : null).filter((v): v is number => v != null)
    const ffVaas = fastballs.map(d => d.vaa).filter((v): v is number => v != null)
    const exts = data.map(d => d.release_extension).filter((v): v is number => v != null)
    const velos = data.map(d => d.release_speed).filter((v): v is number => v != null)

    const vals: Record<string, number | null> = {
      avg_velo: avg(velos),
      k_pct: pas.length > 0 ? (ks / pas.length) * 100 : null,
      bb_pct: pas.length > 0 ? (bbs / pas.length) * 100 : null,
      whiff_pct: swings.length > 0 ? (whiffs.length / swings.length) * 100 : null,
      chase_pct: outsideZone.length > 0 ? (chasePitches.length / outsideZone.length) * 100 : null,
      barrel_pct: battedBalls.length > 0 ? (barrels / battedBalls.length) * 100 : null,
      hard_hit: battedBalls.length > 0 ? (hardHits / battedBalls.length) * 100 : null,
      avg_ev: avg(evs),
      xba: avg(xbas),
      gb_pct: battedBalls.length > 0 ? (gbs / battedBalls.length) * 100 : null,
      extension: avg(exts),
      ivb_ff: avg(ffIvbs),
      unique_score: deceptionVals.unique_score,
      deception_score: deceptionVals.deception_score,
    }

    // Subset of metrics for the compact overview panel
    const overviewOrder = [
      'k_pct', 'bb_pct', 'whiff_pct', 'chase_pct',
      'barrel_pct', 'hard_hit', 'avg_ev', 'xba', 'gb_pct',
      'extension', 'avg_velo', 'ivb_ff',
    ]

    const results: { key: string; label: string; value: number; unit: string; pct: number }[] = []
    for (const key of overviewOrder) {
      const v = vals[key]
      if (v == null) continue
      const meta = METRIC_META[key]
      if (!meta) continue

      let pct: number
      const bl = baselines[key]
      if (bl && bl.stddev > 0) {
        pct = valueToPercentile(v, bl.mean, bl.stddev, bl.higher_better)
      } else {
        const def = SAVANT_PERCENTILES[key]
        pct = def ? computePercentile(v, def.percentiles, def.higherBetter) : 50
      }
      results.push({ key, label: meta.label, unit: meta.unit, value: v, pct })
    }
    return results
  }, [data, deceptionVals, baselines])

  if (!rankings.length) return <div className="text-zinc-500 text-sm text-center py-10">No data</div>

  const fmtValue = (key: string, value: number, unit: string) => {
    if (key === 'xba') return value.toFixed(3)
    if (unit === '%') return value.toFixed(1) + '%'
    if (unit === 'mph' || unit === 'in' || unit === 'ft' || unit === 'rpm') return value.toFixed(1)
    return value.toFixed(1)
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">MLB Percentile Rankings</h3>
      <div className="space-y-1.5">
        {rankings.map(r => {
          const color = percentileColor(r.pct)
          const pctRound = Math.round(r.pct)
          return (
            <div key={r.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-[72px] text-zinc-400 text-right shrink-0 truncate">{r.label}</span>
              <div className="flex-1 relative h-5 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${pctRound}%`, backgroundColor: color, opacity: 0.35 }}
                />
                {/* 50th percentile dashed line */}
                <div className="absolute inset-y-0 left-1/2 w-px border-l border-dashed border-zinc-600" />
              </div>
              <div
                className="w-7 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ backgroundColor: color, color: pctRound >= 30 && pctRound <= 70 ? '#18181b' : '#fff' }}
              >
                {pctRound}
              </div>
              <span className="w-[52px] text-zinc-300 text-right font-mono shrink-0 text-[10px]">
                {fmtValue(r.key, r.value, r.unit)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
