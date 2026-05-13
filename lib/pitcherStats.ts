/**
 * Pitcher stat computation functions extracted from OverviewTab.
 * Pure functions — no React dependencies.
 */
import { calcFIP, calcXFIP, calcXERA, calcSIERA } from '@/lib/expected-stats'
import {
  getLeagueBaseline, computePlus, computeCommandPlus, computeRPComPlus,
  computeYearWeightedPlus,
} from '@/lib/leagueStats'

// ── Return types ─────────────────────────────────────────────────────────────

export interface TraditionalRow {
  year: number; pitches: number; games: number; pa: number; ip: string
  h: number; '2b': number; '3b': number; hr: number; bb: number; k: number; hbp: number
  ba: string; obp: string; slg: string; ops: string
  kPct: string; bbPct: string; whiffPct: string; csPct: string
}

export interface AdvancedRow {
  year: number; pitches: number
  kPct: string; bbPct: string; kbbPct: string
  whiffPct: string; csPct: string; swStrPct: string; zonePct: string
  avgEV: string; maxEV: string; avgLA: string
  gbPct: string; fbPct: string; ldPct: string; puPct: string
  xBA: string; xwOBA: string; xSLG: string; wOBA: string
  ip: string
  fip: string; xfip: string; xera: string; siera: string
  totalRE: string; fpsPct: string
  commandPlus: string; rpcomPlus: string
}

export interface ArsenalRow {
  name: string; count: number; usagePct: string
  avgVelo: string; maxVelo: string; avgSpin: string
  hBreak: string; vBreak: string; ext: string; armAngle: string
  whiffPct: string; csPct: string; avgEV: string; xBA: string
  brink: string; cluster: string
  brinkPlus: string; clusterPlus: string; stuffPlus: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByYear(data: any[]): Record<number, any[]> {
  const years: Record<number, any[]> = {}
  data.forEach(d => {
    if (d.game_year) {
      if (!years[d.game_year]) years[d.game_year] = []
      years[d.game_year].push(d)
    }
  })
  return years
}

// ── Traditional Stats ────────────────────────────────────────────────────────

export function calcTraditionalByYear(data: any[]): TraditionalRow[] {
  const years = groupByYear(data)

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
      ba: ba.toFixed(3), obp: obp.toFixed(3), slg: slg.toFixed(3), ops: (obp + slg).toFixed(3),
      kPct: pas > 0 ? (ks / pas * 100).toFixed(1) : '—',
      bbPct: pas > 0 ? (bbs / pas * 100).toFixed(1) : '—',
      whiffPct: swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—',
      csPct: pitches.length > 0 ? (calledStrikes / pitches.length * 100).toFixed(1) : '—',
    }
  })
}

// ── Advanced Stats ───────────────────────────────────────────────────────────

export function calcAdvancedByYear(data: any[]): AdvancedRow[] {
  const years = groupByYear(data)

  return Object.entries(years).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, pitches]) => {
    const pas = pitches.filter(p => p.events).length
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const hrs = pitches.filter(p => p.events === 'home_run').length
    const hbps = pitches.filter(p => p.events === 'hit_by_pitch').length

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

    // First Pitch Strike %
    const firstPitches = pitches.filter(p => p.pitch_number === 1)
    const firstPitchStrikes = firstPitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d === 'called_strike' || d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d === 'foul_tip'
    }).length

    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0) / arr.length : null
    const f = (v: number | null, d: number = 1) => v != null ? v.toFixed(d) : '—'
    const pct = (n: number, den: number) => den > 0 ? (n / den * 100).toFixed(1) : '—'

    const dres = pitches.map(p => p.delta_run_exp).filter((v: any) => v != null)

    // Compute usage-weighted Command+ and RPCom+ across pitch types (year-aware)
    const ptGroups: Record<string, any[]> = {}
    pitches.forEach(p => { if (p.pitch_name) { if (!ptGroups[p.pitch_name]) ptGroups[p.pitch_name] = []; ptGroups[p.pitch_name].push(p) } })
    const ptAvg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    let cmdWtSum = 0, cmdWt = 0, rpcWtSum = 0, rpcWt = 0
    Object.entries(ptGroups).forEach(([ptName, pts]) => {
      const yr = Number(year)
      const brinks = pts.map((p: any) => p.brink).filter((v: any) => v != null)
      const clusters = pts.map((p: any) => p.cluster).filter((v: any) => v != null)
      const hdevs = pts.map((p: any) => p.hdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const vdevs = pts.map((p: any) => p.vdev).filter((v: any) => v != null).map((v: number) => Math.abs(v))
      const missfires = brinks.filter((v: number) => v < 0).map((v: number) => -v)
      const ab = ptAvg(brinks), ac = ptAvg(clusters), ah = ptAvg(hdevs), av = ptAvg(vdevs), am = ptAvg(missfires)
      const bL = getLeagueBaseline('brink', ptName, yr), cL = getLeagueBaseline('cluster', ptName, yr)
      const hL = getLeagueBaseline('hdev', ptName, yr), vL = getLeagueBaseline('vdev', ptName, yr)
      const mL = getLeagueBaseline('missfire', ptName, yr)
      if (ab != null && ac != null && am != null && bL && cL && mL) {
        const bp = Math.round(computePlus(ab, bL.mean, bL.stddev))
        const cp = Math.round(100 - (computePlus(ac, cL.mean, cL.stddev) - 100))
        const mp = Math.round(100 - (computePlus(am, mL.mean, mL.stddev) - 100))
        const w = pts.length
        cmdWtSum += computeCommandPlus(bp, cp, mp) * w
        cmdWt += w
        if (ah != null && av != null && hL && vL) {
          const hp = Math.round(100 - (computePlus(ah, hL.mean, hL.stddev) - 100))
          const vp = Math.round(100 - (computePlus(av, vL.mean, vL.stddev) - 100))
          rpcWtSum += computeRPComPlus(bp, cp, hp, vp, mp) * w
          rpcWt += w
        }
      }
    })

    // Compute IP from outs (same logic as traditional tab)
    const outsEvents = pitches.filter(p => p.events && !['walk','hit_by_pitch','single','double','triple','home_run','catcher_interf','sac_bunt','sac_fly_double_play'].includes(p.events) && !p.events.includes('error'))
    const outsCount = outsEvents.length
    const ipDecimal = outsCount / 3
    const ipDisplay = `${Math.floor(outsCount / 3)}.${outsCount % 3}`

    // Expected stats models
    const seasonStats = {
      year: Number(year), k: ks, bb: bbs, hbp: hbps, hr: hrs,
      ip: ipDecimal, fb: fbs, gb: gbs, ld: lds, pu: pus, pa: pas,
      xwOBA: avg(xwobas),
    }
    const fip = calcFIP(seasonStats)
    const xfip = calcXFIP(seasonStats)
    const xera = calcXERA(seasonStats)
    const siera = calcSIERA(seasonStats)

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
      ip: ipDisplay,
      fip: f(fip, 2), xfip: f(xfip, 2), xera: f(xera, 2), siera: f(siera, 2),
      totalRE: f(dres.length ? dres.reduce((a: number, b: number) => a + b, 0) : null, 1),
      fpsPct: pct(firstPitchStrikes, firstPitches.length),
      commandPlus: cmdWt > 0 ? String(Math.round(cmdWtSum / cmdWt)) : '—',
      rpcomPlus: rpcWt > 0 ? String(Math.round(rpcWtSum / rpcWt)) : '—',
    }
  })
}

// ── Arsenal ──────────────────────────────────────────────────────────────────

export function calcArsenal(data: any[]): ArsenalRow[] {
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
    const brinks = pitches.map(p => p.brink).filter((v: any) => v != null)
    const clusters = pitches.map(p => p.cluster).filter((v: any) => v != null)

    const avg = (arr: number[]) => arr.length ? arr.reduce((a,b) => a+b,0)/arr.length : null
    const f = (v: number|null, d=1) => v != null ? v.toFixed(d) : '—'
    const pct = (n: number, den: number) => den > 0 ? (n/den*100).toFixed(1) : '—'

    const avgBrink = avg(brinks)
    const avgCluster = avg(clusters)
    const ptAvgFn = (arr: number[]) => arr.length ? arr.reduce((a: number, b: number) => a + b, 0) / arr.length : null
    const brinkPlus = computeYearWeightedPlus(pitches, name, 'brink',
      pts => { const v = pts.map((p: any) => p.brink).filter((x: any) => x != null); return ptAvgFn(v) })
    const clusterPlus = computeYearWeightedPlus(pitches, name, 'cluster',
      pts => { const v = pts.map((p: any) => p.cluster).filter((x: any) => x != null); return ptAvgFn(v) }, true)

    // Stuff+: DB stuff_plus (0-200 scale) preferred; fall back to Z-score stuff_rv (same scale)
    const dbStuffPlusVals = pitches.map((p: any) => p.stuff_plus).filter((x: any) => x != null)
    const clientStuffVals = pitches.map((p: any) => p.stuff_rv).filter((x: any) => x != null)
    const stuffSrc = dbStuffPlusVals.length > pitches.length * 0.5 ? dbStuffPlusVals : clientStuffVals
    const finalStuffPlus = stuffSrc.length > 0
      ? Math.round(stuffSrc.reduce((a: number, b: number) => a + b, 0) / stuffSrc.length)
      : null

    return {
      name, count: pitches.length, usagePct: pct(pitches.length, total),
      avgVelo: f(avg(velos)), maxVelo: f(velos.length ? Math.max(...velos) : null),
      avgSpin: f(avg(spins), 0), hBreak: f(avg(hb.map(v => v * 12))), vBreak: f(avg(vb.map(v => v * 12))),
      ext: f(avg(exts)), armAngle: f(avg(arms)),
      whiffPct: pct(whiffs, swings), csPct: pct(cs, pitches.length),
      avgEV: f(avg(evs)), xBA: f(avg(xbas), 3),
      brink: f(avgBrink),
      cluster: f(avgCluster),
      brinkPlus: brinkPlus != null ? String(brinkPlus) : '—',
      clusterPlus: clusterPlus != null ? String(clusterPlus) : '—',
      stuffPlus: finalStuffPlus != null ? String(finalStuffPlus) : '—',
    }
  }).sort((a, b) => b.count - a.count)
}
