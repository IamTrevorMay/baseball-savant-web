'use client'
import { useState } from 'react'
import PitchUsage from '../charts/PitchUsage'
import PitchMovement from '../charts/PitchMovement'
import VelocityDistribution from '../charts/VelocityDistribution'
import StrikeZoneHeatmap from '../charts/StrikeZoneHeatmap'

interface Props { data: any[]; info: any; mlbStats?: any[] }

type StatsMode = 'traditional' | 'advanced' | 'arsenal'

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

    // Innings: count outs recorded (rough estimate from events)
    const outsEvents = pitches.filter(p => p.events && !['walk','hit_by_pitch','single','double','triple','home_run','catcher_interf','sac_bunt','sac_fly_double_play'].includes(p.events) && !p.events.includes('error'))
    const outsFromEvents = outsEvents.length
    const fullInnings = Math.floor(outsFromEvents / 3)
    const partialOuts = outsFromEvents % 3
    const ipDisplay = `${fullInnings}.${partialOuts}`

    const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip') || d.includes('foul_bunt') || d.includes('missed_bunt')
    }).length
    const calledStrikes = pitches.filter(p => (p.description || '').toLowerCase() === 'called_strike').length

    const tb = hits + doubles + triples * 2 + hrs * 3
    const ba = pas > 0 ? (hits / pas) : 0
    const obp = pas > 0 ? ((hits + bbs + hbps) / pas) : 0
    const slg = pas > 0 ? (tb / pas) : 0

    return {
      year: Number(year), pitches: pitches.length, games, pa: pas, ip: ipDisplay,
      h: hits, '2b': doubles, '3b': triples, hr: hrs, bb: bbs, k: ks, hbp: hbps,
      ba: ba.toFixed(3), obp: obp.toFixed(3), slg: slg.toFixed(3),
      kPct: pas > 0 ? (ks / pas * 100).toFixed(1) : '—',
      bbPct: pas > 0 ? (bbs / pas * 100).toFixed(1) : '—',
      whiffPct: swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—',
      csPct: pitches.length > 0 ? (calledStrikes / pitches.length * 100).toFixed(1) : '—',
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
    const pus = battedBalls.filter(p => p.bb_type === 'popup').length
    const bbT = battedBalls.length || 1

    const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    }).length
    const calledStrikes = pitches.filter(p => (p.description || '').toLowerCase() === 'called_strike').length
    const zoneP = pitches.filter(p => p.zone && p.zone >= 1 && p.zone <= 9).length

    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0) / arr.length : null
    const f = (v: number | null, d: number = 1) => v != null ? v.toFixed(d) : '—'
    const pct = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) : '—'

    const dres = pitches.map(p => p.delta_run_exp).filter((v: any) => v != null)

    return {
      year: Number(year), pitches: pitches.length,
      kPct: pct(ks, pas), bbPct: pct(bbs, pas), kbbPct: pas > 0 ? ((ks - bbs) / pas * 100).toFixed(1) : '—',
      whiffPct: pct(whiffs, swings), csPct: pct(calledStrikes, pitches.length),
      swStrPct: pct(whiffs, pitches.length), zonePct: pct(zoneP, pitches.length),
      avgEV: f(avg(evs)), maxEV: f(evs.length ? Math.max(...evs) : null),
      avgLA: f(avg(las)),
      gbPct: pct(gbs, bbT), fbPct: pct(fbs, bbT), ldPct: pct(lds, bbT), puPct: pct(pus, bbT),
      xBA: f(avg(xbas), 3), xwOBA: f(avg(xwobas), 3), xSLG: f(avg(xslgs), 3),
      wOBA: f(avg(wobas), 3),
      totalRE: f(dres.length ? dres.reduce((a: number, b: number) => a + b, 0) : null, 1),
    }
  })
}

function calcArsenal(data: any[]) {
  const groups: Record<string, any[]> = {}
  data.forEach(d => { if (d.pitch_name) { if (!groups[d.pitch_name]) groups[d.pitch_name] = []; groups[d.pitch_name].push(d) } })

  const total = data.length
  return Object.entries(groups).map(([name, pitches]) => {
    const velos = pitches.map(p => p.release_speed).filter(Boolean)
    const spins = pitches.map(p => p.release_spin_rate).filter(Boolean)
    const hb = pitches.map(p => p.pfx_x).filter((v: any) => v != null)
    const vb = pitches.map(p => p.pfx_z).filter((v: any) => v != null)
    const exts = pitches.map(p => p.release_extension).filter(Boolean)
    const arms = pitches.map(p => p.arm_angle).filter(Boolean)

    const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    }).length
    const cs = pitches.filter(p => (p.description || '').toLowerCase() === 'called_strike').length
    const evs = pitches.filter(p => p.launch_speed != null).map(p => p.launch_speed)
    const xbas = pitches.map(p => p.estimated_ba_using_speedangle).filter((v: any) => v != null)

    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0)/arr.length : null
    const f = (v: number|null, d=1) => v != null ? v.toFixed(d) : '—'
    const pct = (n: number, den: number) => den > 0 ? (n/den*100).toFixed(1) : '—'

    return {
      name, count: pitches.length, usagePct: pct(pitches.length, total),
      avgVelo: f(avg(velos)), maxVelo: f(velos.length ? Math.max(...velos) : null),
      avgSpin: f(avg(spins), 0), hBreak: f(avg(hb.map(v => v * 12))), vBreak: f(avg(vb.map(v => v * 12))),
      ext: f(avg(exts)), armAngle: f(avg(arms)),
      whiffPct: pct(whiffs, swings), csPct: pct(cs, pitches.length),
      avgEV: f(avg(evs)), xBA: f(avg(xbas), 3),
    }
  }).sort((a, b) => b.count - a.count)
}

function calcTotals(rows: any[], cols: {k:string,l:string}[], mode: string): any {
  if (rows.length === 0) return null
  const totals: any = {}
  const pctFields = ["ba","obp","slg","kPct","bbPct","kbbPct","whiffPct","swStrPct","csPct","zonePct","gbPct","fbPct","ldPct","puPct","xBA","xwOBA","xSLG","wOBA","usagePct","avgEV","maxEV","avgLA","avgVelo","maxVelo","avgSpin","hBreak","vBreak","ext","armAngle","era","whip","fip","k9","bb9","hr9"]
  cols.forEach(c => {
    if (c.k === "year" || c.k === "name") { totals[c.k] = "Total"; return }
    const vals = rows.map(r => parseFloat(r[c.k])).filter(v => !isNaN(v))
    if (vals.length === 0) { totals[c.k] = "—"; return }
    if (pctFields.includes(c.k)) {
      totals[c.k] = (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(c.k === "ba" || c.k === "obp" || c.k === "slg" || c.k === "xBA" || c.k === "xwOBA" || c.k === "xSLG" || c.k === "wOBA" ? 3 : 1)
    } else if (c.k === "ip") {
      const outs = rows.reduce((sum, r) => { const parts = String(r.ip).split("."); return sum + parseInt(parts[0])*3 + parseInt(parts[1]||"0") }, 0)
      totals[c.k] = Math.floor(outs/3) + "." + (outs%3)
    } else if (c.k === "totalRE") {
      totals[c.k] = vals.reduce((a,b) => a+b, 0).toFixed(1)
    } else if (c.k === "maxVelo" || c.k === "maxEV") {
      totals[c.k] = Math.max(...vals).toFixed(1)
    } else {
      totals[c.k] = vals.reduce((a,b) => a+b, 0)
    }
  })
  return totals
}

export default function OverviewTab({ data, info, mlbStats = [] }: Props) {
  const [mode, setMode] = useState<StatsMode>('traditional')

  const tradRows = calcTraditionalByYear(data)
  const advRows = calcAdvancedByYear(data)
  const arsenalRows = calcArsenal(data)

  // Merge MLB official stats into traditional rows
  const mergedTradRows = tradRows.map(r => {
    const mlb = mlbStats.find((s: any) => Number(s.year) === r.year)
    return { ...r, w: mlb?.w ?? "—", l: mlb?.l ?? "—", era: mlb?.era ?? "—", sv: mlb?.sv ?? "—", gs: mlb?.gs ?? "—", whip: mlb?.whip ?? "—" }
  })
  const mergedAdvRows = advRows.map(r => {
    const mlb = mlbStats.find((s: any) => Number(s.year) === r.year)
    return { ...r, fip: mlb?.fip ?? "—", k9: mlb?.k9 ?? "—", bb9: mlb?.bb9 ?? "—", hr9: mlb?.hr9 ?? "—" }
  })


  const tradCols = [
    { k:"year", l:"Year" }, { k:"w", l:"W" }, { k:"l", l:"L" }, { k:"era", l:"ERA" },
    { k:"games", l:"G" }, { k:"gs", l:"GS" }, { k:"sv", l:"SV" }, { k:"ip", l:"IP" },
    { k:"pa", l:"PA" }, { k:"h", l:"H" }, { k:"2b", l:"2B" }, { k:"3b", l:"3B" },
    { k:"hr", l:"HR" }, { k:"bb", l:"BB" }, { k:"k", l:"K" }, { k:"hbp", l:"HBP" },
    { k:"ba", l:"BA" }, { k:"obp", l:"OBP" }, { k:"slg", l:"SLG" }, { k:"whip", l:"WHIP" },
    { k:"kPct", l:"K%" }, { k:"bbPct", l:"BB%" }, { k:"whiffPct", l:"Whiff%" },
    { k:"pitches", l:"Pitches" },
  ]
  const advCols = [
    { k:"year", l:"Year" }, { k:"pitches", l:"Pitches" },
    { k:"kPct", l:"K%" }, { k:"bbPct", l:"BB%" }, { k:"kbbPct", l:"K-BB%" },
    { k:"whiffPct", l:"Whiff%" }, { k:"swStrPct", l:"SwStr%" },
    { k:"csPct", l:"CSt%" }, { k:"zonePct", l:"Zone%" },
    { k:"avgEV", l:"Avg EV" }, { k:"maxEV", l:"Max EV" }, { k:"avgLA", l:"Avg LA" },
    { k:"gbPct", l:"GB%" }, { k:"fbPct", l:"FB%" }, { k:"ldPct", l:"LD%" },
    { k:"xBA", l:"xBA" }, { k:"xwOBA", l:"xwOBA" }, { k:"xSLG", l:"xSLG" },
    { k:"wOBA", l:"wOBA" }, { k:"fip", l:"FIP" }, { k:"k9", l:"K/9" },
    { k:"bb9", l:"BB/9" }, { k:"hr9", l:"HR/9" }, { k:"totalRE", l:"RE24" },
  ]
  const arsenalCols = [
    { k:'name', l:'Pitch' }, { k:'count', l:'#' }, { k:'usagePct', l:'Usage%' },
    { k:'avgVelo', l:'Velo' }, { k:'maxVelo', l:'Max' },
    { k:'avgSpin', l:'Spin' }, { k:'hBreak', l:'HB' }, { k:'vBreak', l:'IVB' },
    { k:'ext', l:'Ext' }, { k:'armAngle', l:'Arm°' },
    { k:'whiffPct', l:'Whiff%' }, { k:'csPct', l:'CSt%' },
    { k:'avgEV', l:'EV' }, { k:'xBA', l:'xBA' },
  ]

  const activeRows = mode === 'traditional' ? mergedTradRows : mode === 'advanced' ? mergedAdvRows : arsenalRows
  const activeCols = mode === 'traditional' ? tradCols : mode === 'advanced' ? advCols : arsenalCols

  const cellColor = (k: string, v: any) => {
    if (k === 'year' || k === 'name') return 'text-white font-medium'
    if (k === 'games' || k === 'pitches' || k === 'pa' || k === 'ip' || k === 'count') return 'text-zinc-400'
    if (['h','2b','3b','hr','bb','k','hbp','usagePct'].includes(k)) return 'text-zinc-300'
    if (['ba','obp','slg','wOBA','xBA','xwOBA','xSLG'].includes(k)) return 'text-rose-400'
    if (['kPct','kbbPct','whiffPct','swStrPct','csPct'].includes(k)) return 'text-emerald-400'
    if (['bbPct'].includes(k)) return 'text-red-400'
    if (['avgVelo','maxVelo'].includes(k)) return 'text-amber-400'
    if (['avgSpin'].includes(k)) return 'text-sky-400'
    if (['hBreak','vBreak','ext','armAngle'].includes(k)) return 'text-purple-400'
    if (['avgEV','maxEV','avgLA','gbPct','fbPct','ldPct','puPct'].includes(k)) return 'text-orange-400'
    if (['zonePct'].includes(k)) return 'text-sky-400'
    if (['totalRE'].includes(k)) return Number(v) < 0 ? 'text-emerald-400' : 'text-red-400'
    return 'text-zinc-300'
  }

  return (
    <div className="space-y-6">
      {/* Stats Table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex gap-1">
            {(['traditional','advanced','arsenal'] as StatsMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  mode === m ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">{data.length.toLocaleString()} pitches</span>
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
                      {c.k === 'kPct' || c.k === 'bbPct' || c.k === 'kbbPct' || c.k === 'whiffPct' || c.k === 'swStrPct' || c.k === 'csPct' || c.k === 'zonePct' || c.k === 'gbPct' || c.k === 'fbPct' || c.k === 'ldPct' || c.k === 'puPct' || c.k === 'usagePct'
                        ? (r[c.k] !== '—' ? r[c.k] + '%' : '—')
                        : (r[c.k] ?? r[c.k] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {(() => {
                const totals = calcTotals(activeRows, activeCols, mode)
                if (!totals) return null
                return (
                  <tr className="border-t-2 border-zinc-600 bg-zinc-800/40 font-semibold">
                    {activeCols.map(c => (
                      <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${cellColor(c.k, totals[c.k])}`}>
                        {c.k === "kPct" || c.k === "bbPct" || c.k === "kbbPct" || c.k === "whiffPct" || c.k === "swStrPct" || c.k === "csPct" || c.k === "zonePct" || c.k === "gbPct" || c.k === "fbPct" || c.k === "ldPct" || c.k === "puPct" || c.k === "usagePct"
                          ? (totals[c.k] !== "—" ? totals[c.k] + "%" : "—")
                          : (totals[c.k] ?? "—")}
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
          <PitchMovement data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <VelocityDistribution data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <StrikeZoneHeatmap data={data} />
        </div>
      </div>
    </div>
  )
}
