'use client'
import { useState } from 'react'
import PitchUsage from '../charts/PitchUsage'
import StrikeZoneHeatmap from '../charts/StrikeZoneHeatmap'
import ExitVeloLaunchAngle from '../charts/ExitVeloLaunchAngle'
import SprayChart from '../charts/SprayChart'

interface Props { data: any[]; info: any }

type StatsMode = 'traditional' | 'advanced' | 'vsPitchType'

function calcTraditionalByYear(data: any[]) {
  const years: Record<number, any[]> = {}
  data.forEach(d => { if (d.game_year) { if (!years[d.game_year]) years[d.game_year] = []; years[d.game_year].push(d) } })

  return Object.entries(years).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, pitches]) => {
    const games = new Set(pitches.map(p => p.game_pk)).size
    const pas = pitches.filter(p => p.events).length
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const hits = pitches.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
    const hrs = pitches.filter(p => p.events === 'home_run').length
    const doubles = pitches.filter(p => p.events === 'double').length
    const triples = pitches.filter(p => p.events === 'triple').length
    const hbps = pitches.filter(p => p.events === 'hit_by_pitch').length

    const tb = hits + doubles + triples * 2 + hrs * 3
    const abEst = pas - bbs - hbps
    const ba = abEst > 0 ? (hits / abEst) : 0
    const obp = pas > 0 ? ((hits + bbs + hbps) / pas) : 0
    const slg = abEst > 0 ? (tb / abEst) : 0

    return {
      year: Number(year), pitches: pitches.length, games, pa: pas,
      h: hits, '2b': doubles, '3b': triples, hr: hrs, bb: bbs, k: ks, hbp: hbps,
      ba: ba.toFixed(3), obp: obp.toFixed(3), slg: slg.toFixed(3),
      ops: (obp + slg).toFixed(3),
    }
  })
}

function calcAdvancedByYear(data: any[]) {
  const years: Record<number, any[]> = {}
  data.forEach(d => { if (d.game_year) { if (!years[d.game_year]) years[d.game_year] = []; years[d.game_year].push(d) } })

  return Object.entries(years).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, pitches]) => {
    const pas = pitches.filter(p => p.events).length
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length

    const battedBalls = pitches.filter(p => p.launch_speed != null)
    const evs = battedBalls.map(p => p.launch_speed)
    const las = battedBalls.map(p => p.launch_angle).filter(Boolean)
    const xbas = pitches.map(p => p.estimated_ba_using_speedangle).filter((v: any) => v != null)
    const xwobas = pitches.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)
    const xslgs = pitches.map(p => p.estimated_slg_using_speedangle).filter((v: any) => v != null)
    const wobas = pitches.map(p => p.woba_value).filter((v: any) => v != null)

    const gbs = battedBalls.filter(p => p.bb_type === 'ground_ball').length
    const fbs = battedBalls.filter(p => p.bb_type === 'fly_ball').length
    const lds = battedBalls.filter(p => p.bb_type === 'line_drive').length
    const bbT = battedBalls.length || 1

    const hardHits = battedBalls.filter(p => p.launch_speed >= 95).length
    const barrels = battedBalls.filter(p => p.launch_speed >= 98 && p.launch_angle >= 8 && p.launch_angle <= 32).length

    const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    }).length
    const zoneP = pitches.filter(p => p.zone && p.zone >= 1 && p.zone <= 9).length
    const zoneSwings = pitches.filter(p => p.zone && p.zone >= 1 && p.zone <= 9 && (() => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    })()).length
    const chaseSwings = pitches.filter(p => p.zone && p.zone >= 11 && (() => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    })()).length
    const outOfZone = pitches.filter(p => p.zone && p.zone >= 11).length

    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0) / arr.length : null
    const f = (v: number | null, d: number = 1) => v != null ? v.toFixed(d) : '—'
    const pct = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) : '—'

    const dres = pitches.map(p => p.delta_run_exp).filter((v: any) => v != null)

    return {
      year: Number(year), pitches: pitches.length,
      kPct: pct(ks, pas), bbPct: pct(bbs, pas),
      whiffPct: pct(whiffs, swings), contactPct: swings > 0 ? ((1 - whiffs / swings) * 100).toFixed(1) : '—',
      zonePct: pct(zoneP, pitches.length),
      chasePct: pct(chaseSwings, outOfZone),
      avgEV: f(avg(evs)), maxEV: f(evs.length ? Math.max(...evs) : null),
      avgLA: f(avg(las)),
      hardHitPct: pct(hardHits, bbT), barrelPct: pct(barrels, bbT),
      gbPct: pct(gbs, bbT), fbPct: pct(fbs, bbT), ldPct: pct(lds, bbT),
      xBA: f(avg(xbas), 3), xwOBA: f(avg(xwobas), 3), xSLG: f(avg(xslgs), 3),
      wOBA: f(avg(wobas), 3),
      totalRE: f(dres.length ? dres.reduce((a: number, b: number) => a + b, 0) : null, 1),
    }
  })
}

function calcVsPitchType(data: any[]) {
  const groups: Record<string, any[]> = {}
  data.forEach(d => { if (d.pitch_name) { if (!groups[d.pitch_name]) groups[d.pitch_name] = []; groups[d.pitch_name].push(d) } })

  const total = data.length
  return Object.entries(groups).map(([name, pitches]) => {
    const velos = pitches.map(p => p.release_speed).filter(Boolean)
    const pas = pitches.filter(p => p.events).length
    const hits = pitches.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const hbps = pitches.filter(p => p.events === 'hit_by_pitch').length
    const abEst = pas - bbs - hbps

    const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    }).length

    const battedBalls = pitches.filter(p => p.launch_speed != null)
    const evs = battedBalls.map(p => p.launch_speed)
    const las = battedBalls.map(p => p.launch_angle).filter(Boolean)
    const xbas = pitches.map(p => p.estimated_ba_using_speedangle).filter((v: any) => v != null)
    const xwobas = pitches.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)

    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0)/arr.length : null
    const f = (v: number|null, d=1) => v != null ? v.toFixed(d) : '—'
    const pct = (n: number, den: number) => den > 0 ? (n/den*100).toFixed(1) : '—'

    return {
      name, count: pitches.length, facedPct: pct(pitches.length, total),
      avgVelo: f(avg(velos)),
      whiffPct: pct(whiffs, swings),
      ba: abEst > 0 ? f(hits / abEst, 3) : '—',
      avgEV: f(avg(evs)), maxEV: f(evs.length ? Math.max(...evs) : null),
      avgLA: f(avg(las)),
      xBA: f(avg(xbas), 3), xwOBA: f(avg(xwobas), 3),
    }
  }).sort((a, b) => b.count - a.count)
}

function calcTotals(rows: any[], cols: {k:string,l:string}[]): any {
  if (rows.length === 0) return null
  const pctFields = ["ba","obp","slg","ops","kPct","bbPct","whiffPct","contactPct","zonePct","chasePct","gbPct","fbPct","ldPct","xBA","xwOBA","xSLG","wOBA","facedPct","avgEV","maxEV","avgLA","avgVelo","hardHitPct","barrelPct"]
  const totals: any = {}
  cols.forEach(c => {
    if (c.k === "year" || c.k === "name") { totals[c.k] = "Career"; return }
    const vals = rows.map(r => parseFloat(r[c.k])).filter(v => !isNaN(v))
    if (vals.length === 0) { totals[c.k] = "—"; return }
    if (pctFields.includes(c.k)) {
      totals[c.k] = (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(c.k === "ba" || c.k === "obp" || c.k === "slg" || c.k === "ops" || c.k === "xBA" || c.k === "xwOBA" || c.k === "xSLG" || c.k === "wOBA" ? 3 : 1)
    } else if (c.k === "totalRE") {
      totals[c.k] = vals.reduce((a,b) => a+b, 0).toFixed(1)
    } else if (c.k === "maxEV") {
      totals[c.k] = Math.max(...vals).toFixed(1)
    } else {
      totals[c.k] = vals.reduce((a,b) => a+b, 0)
    }
  })
  return totals
}

export default function HitterOverviewTab({ data, info }: Props) {
  const [mode, setMode] = useState<StatsMode>('traditional')

  const tradRows = calcTraditionalByYear(data)
  const advRows = calcAdvancedByYear(data)
  const vsPitchRows = calcVsPitchType(data)

  const tradCols = [
    { k:"year", l:"Year" }, { k:"games", l:"G" }, { k:"pa", l:"PA" },
    { k:"h", l:"H" }, { k:"2b", l:"2B" }, { k:"3b", l:"3B" },
    { k:"hr", l:"HR" }, { k:"bb", l:"BB" }, { k:"k", l:"K" }, { k:"hbp", l:"HBP" },
    { k:"ba", l:"BA" }, { k:"obp", l:"OBP" }, { k:"slg", l:"SLG" }, { k:"ops", l:"OPS" },
    { k:"pitches", l:"Pitches" },
  ]
  const advCols = [
    { k:"year", l:"Year" }, { k:"pitches", l:"Pitches" },
    { k:"kPct", l:"K%" }, { k:"bbPct", l:"BB%" },
    { k:"whiffPct", l:"Whiff%" }, { k:"contactPct", l:"Contact%" },
    { k:"zonePct", l:"Zone%" }, { k:"chasePct", l:"Chase%" },
    { k:"avgEV", l:"Avg EV" }, { k:"maxEV", l:"Max EV" }, { k:"avgLA", l:"Avg LA" },
    { k:"hardHitPct", l:"Hard Hit%" }, { k:"barrelPct", l:"Barrel%" },
    { k:"gbPct", l:"GB%" }, { k:"fbPct", l:"FB%" }, { k:"ldPct", l:"LD%" },
    { k:"xBA", l:"xBA" }, { k:"xwOBA", l:"xwOBA" }, { k:"xSLG", l:"xSLG" },
    { k:"wOBA", l:"wOBA" }, { k:"totalRE", l:"RE24" },
  ]
  const vsPitchCols = [
    { k:'name', l:'Pitch Type' }, { k:'count', l:'#' }, { k:'facedPct', l:'Faced%' },
    { k:'avgVelo', l:'Velo' }, { k:'whiffPct', l:'Whiff%' },
    { k:'ba', l:'BA' }, { k:'avgEV', l:'Avg EV' }, { k:'maxEV', l:'Max EV' },
    { k:'avgLA', l:'Avg LA' }, { k:'xBA', l:'xBA' }, { k:'xwOBA', l:'xwOBA' },
  ]

  const activeRows = mode === 'traditional' ? tradRows : mode === 'advanced' ? advRows : vsPitchRows
  const activeCols = mode === 'traditional' ? tradCols : mode === 'advanced' ? advCols : vsPitchCols

  const cellColor = (k: string, v: any) => {
    if (k === 'year' || k === 'name') return 'text-white font-medium'
    if (k === 'games' || k === 'pitches' || k === 'pa' || k === 'count') return 'text-zinc-400'
    if (['h','2b','3b','hr','bb','k','hbp','facedPct'].includes(k)) return 'text-zinc-300'
    if (['ba','obp','slg','ops','wOBA','xBA','xwOBA','xSLG'].includes(k)) return 'text-rose-400'
    if (['kPct','whiffPct'].includes(k)) return 'text-red-400'
    if (['bbPct','contactPct'].includes(k)) return 'text-emerald-400'
    if (['avgVelo'].includes(k)) return 'text-amber-400'
    if (['avgEV','maxEV','avgLA','hardHitPct','barrelPct'].includes(k)) return 'text-orange-400'
    if (['gbPct','fbPct','ldPct'].includes(k)) return 'text-sky-400'
    if (['zonePct','chasePct'].includes(k)) return 'text-purple-400'
    if (k === 'totalRE') return Number(v) > 0 ? 'text-emerald-400' : 'text-red-400'
    return 'text-zinc-300'
  }

  const pctKeys = ['kPct','bbPct','whiffPct','contactPct','zonePct','chasePct','gbPct','fbPct','ldPct','hardHitPct','barrelPct','facedPct']

  return (
    <div className="space-y-6">
      {/* Stats Table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex gap-1">
            {([['traditional','Traditional'],['advanced','Advanced'],['vsPitchType','vs Pitch Type']] as [StatsMode,string][]).map(([m,label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  mode === m ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">{data.length.toLocaleString()} pitches seen</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {activeCols.map(c => (
                  <th key={c.k} className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium whitespace-nowrap text-right first:text-left">{c.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRows.map((r: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/30 transition">
                  {activeCols.map(c => (
                    <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${cellColor(c.k, r[c.k])}`}>
                      {pctKeys.includes(c.k) ? (r[c.k] !== '—' ? r[c.k] + '%' : '—') : (r[c.k] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {(() => {
                const totals = calcTotals(activeRows, activeCols)
                if (!totals) return null
                return (
                  <tr className="border-t-2 border-zinc-600 bg-zinc-800/40 font-semibold">
                    {activeCols.map(c => (
                      <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${cellColor(c.k, totals[c.k])}`}>
                        {pctKeys.includes(c.k) ? (totals[c.k] !== "—" ? totals[c.k] + "%" : "—") : (totals[c.k] ?? "—")}
                      </td>
                    ))}
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <PitchUsage data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <StrikeZoneHeatmap data={data} />
        </div>
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
