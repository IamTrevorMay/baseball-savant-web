'use client'
import { useMemo } from 'react'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor, ZONE_SHAPES } from '../chartConfig'

interface Props { pitches: any[] }

function Pill({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-zinc-800 rounded px-3 py-1.5 flex flex-col items-center min-w-[60px]">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono font-semibold ${color}`}>{value}</span>
    </div>
  )
}

export default function GameDetail({ pitches }: Props) {
  const first = pitches[0]

  // === Section 1: Summary Header ===
  const summary = useMemo(() => {
    const homeScore = Math.max(...pitches.map(p => p.home_score ?? 0))
    const awayScore = Math.max(...pitches.map(p => p.away_score ?? 0))
    const matchup = `${first.away_team} @ ${first.home_team}`
    const score = `${awayScore}–${homeScore}`

    const total = pitches.length
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const hits = pitches.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length

    // IP: count out-events
    const outsEvents = pitches.filter(p =>
      p.events && !['walk', 'hit_by_pitch', 'single', 'double', 'triple', 'home_run',
        'catcher_interf', 'sac_bunt', 'sac_fly_double_play'].includes(p.events) && !p.events.includes('error')
    )
    const outs = outsEvents.length
    const ip = `${Math.floor(outs / 3)}.${outs % 3}`

    const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
    }).length
    const calledStrikes = pitches.filter(p => (p.description || '').toLowerCase() === 'called_strike').length
    const zoneP = pitches.filter(p => p.zone && p.zone >= 1 && p.zone <= 9).length

    const whiffPct = swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—'
    const cswPct = total > 0 ? ((calledStrikes + whiffs) / total * 100).toFixed(1) : '—'
    const zonePct = total > 0 ? (zoneP / total * 100).toFixed(1) : '—'

    return { matchup, score, date: first.game_date, ip, total, ks, bbs, hits, whiffPct, cswPct, zonePct }
  }, [pitches, first])

  // === Section 2: Pitch Arsenal ===
  const arsenal = useMemo(() => {
    const groups: Record<string, any[]> = {}
    pitches.forEach(p => {
      const k = p.pitch_name || 'Unknown'
      if (!groups[k]) groups[k] = []
      groups[k].push(p)
    })
    const total = pitches.length
    return Object.entries(groups).map(([name, pts]) => {
      const velos = pts.map(p => p.release_speed).filter(Boolean)
      const spins = pts.map(p => p.release_spin_rate).filter(Boolean)
      const ivb = pts.map(p => p.pfx_z_in).filter((v: any) => v != null)
      const hb = pts.map(p => p.pfx_x_in).filter((v: any) => v != null)
      const whiffs = pts.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
      const swings = pts.filter(p => {
        const d = (p.description || '').toLowerCase()
        return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
      }).length
      const cs = pts.filter(p => (p.description || '').toLowerCase() === 'called_strike').length
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
      const f = (v: number | null, d = 1) => v != null ? v.toFixed(d) : '—'
      return {
        name, count: pts.length, usagePct: (pts.length / total * 100).toFixed(1),
        avgVelo: f(avg(velos)), maxVelo: f(velos.length ? Math.max(...velos) : null),
        whiffPct: swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—',
        cswPct: pts.length > 0 ? ((cs + whiffs) / pts.length * 100).toFixed(1) : '—',
        avgSpin: f(avg(spins), 0),
        avgIVB: f(avg(ivb)),
        avgHB: f(avg(hb)),
      }
    }).sort((a, b) => b.count - a.count)
  }, [pitches])

  // === Section 3: Chart data (grouped by pitch_name) ===
  const pitchGroups = useMemo(() => {
    const groups: Record<string, any[]> = {}
    pitches.forEach(p => {
      const k = p.pitch_name || 'Unknown'
      if (!groups[k]) groups[k] = []
      groups[k].push(p)
    })
    return groups
  }, [pitches])

  // === Section 4: Inning-by-Inning ===
  const innings = useMemo(() => {
    const groups: Record<number, any[]> = {}
    pitches.forEach(p => {
      if (p.inning) {
        if (!groups[p.inning]) groups[p.inning] = []
        groups[p.inning].push(p)
      }
    })
    return Object.entries(groups).sort((a, b) => Number(a[0]) - Number(b[0])).map(([inn, pts]) => {
      const velos = pts.map(p => p.release_speed).filter(Boolean)
      const ks = pts.filter(p => p.events?.includes('strikeout')).length
      const bbs = pts.filter(p => p.events?.includes('walk')).length
      const hits = pts.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length
      const avg = velos.length ? (velos.reduce((a, b) => a + b, 0) / velos.length).toFixed(1) : '—'
      return { inning: inn, pitches: pts.length, avgVelo: avg, ks, bbs, hits }
    })
  }, [pitches])

  // === Section 5: At-Bat Results ===
  const atBats = useMemo(() => {
    const groups: Record<number, any[]> = {}
    pitches.forEach(p => {
      if (p.at_bat_number) {
        if (!groups[p.at_bat_number]) groups[p.at_bat_number] = []
        groups[p.at_bat_number].push(p)
      }
    })
    return Object.entries(groups).sort((a, b) => Number(a[0]) - Number(b[0])).map(([ab, pts]) => {
      const last = pts[pts.length - 1]
      const pitchTypes = [...new Set(pts.map(p => p.pitch_name).filter(Boolean))].join(', ')
      const result = last.events || '—'
      const ev = last.launch_speed != null ? last.launch_speed.toFixed(1) : '—'
      const la = last.launch_angle != null ? last.launch_angle.toFixed(0) + '°' : '—'
      const balls = last.balls ?? 0
      const strikes = last.strikes ?? 0
      return {
        batter: last.batter_name || `Batter #${last.batter || '?'}`,
        count: `${balls}-${strikes}`,
        pitchTypes,
        result,
        ev,
        la,
        numPitches: pts.length,
      }
    })
  }, [pitches])

  // === Section 6: Batted Ball Summary ===
  const battedBall = useMemo(() => {
    const bb = pitches.filter(p => p.launch_speed != null)
    if (bb.length === 0) return null
    const evs = bb.map(p => p.launch_speed)
    const avgEV = (evs.reduce((a, b) => a + b, 0) / evs.length).toFixed(1)
    const hardHitPct = (bb.filter(p => p.launch_speed >= 95).length / bb.length * 100).toFixed(1)
    const total = bb.length
    const gb = bb.filter(p => p.bb_type === 'ground_ball').length
    const fb = bb.filter(p => p.bb_type === 'fly_ball').length
    const ld = bb.filter(p => p.bb_type === 'line_drive').length
    const pu = bb.filter(p => p.bb_type === 'popup').length
    return {
      avgEV,
      hardHitPct,
      gbPct: (gb / total * 100).toFixed(1),
      fbPct: (fb / total * 100).toFixed(1),
      ldPct: (ld / total * 100).toFixed(1),
      puPct: (pu / total * 100).toFixed(1),
    }
  }, [pitches])

  const resultColor = (result: string) => {
    if (result.includes('strikeout')) return 'text-red-400'
    if (result === 'home_run') return 'text-yellow-400'
    if (['single', 'double', 'triple'].includes(result)) return 'text-emerald-400'
    if (result.includes('walk')) return 'text-amber-400'
    return 'text-zinc-400'
  }

  const chartH = 250

  // Strike zone scatter traces
  const zoneTraces = Object.entries(pitchGroups).map(([name, pts]) => {
    const f = pts.filter(p => p.plate_x != null && p.plate_z != null)
    return {
      x: f.map(p => p.plate_x), y: f.map(p => p.plate_z),
      type: 'scatter' as any, mode: 'markers' as any,
      marker: { size: 5, color: getPitchColor(name), opacity: 0.7 },
      name,
      hovertemplate: `${name}<br>x: %{x:.2f}<br>z: %{y:.2f}<extra></extra>`,
    }
  })

  // Movement chart traces
  const moveTraces = Object.entries(pitchGroups).map(([name, pts]) => {
    const f = pts.filter(p => p.pfx_x_in != null && p.pfx_z_in != null)
    return {
      x: f.map(p => p.pfx_x_in), y: f.map(p => p.pfx_z_in),
      type: 'scatter' as any, mode: 'markers' as any,
      marker: { size: 5, color: getPitchColor(name), opacity: 0.7 },
      name,
      hovertemplate: `${name}<br>HB: %{x:.1f}"<br>IVB: %{y:.1f}"<extra></extra>`,
    }
  })

  // Velocity by pitch # traces
  const veloTraces = Object.entries(pitchGroups).map(([name, pts]) => {
    const f = pts.filter(p => p.pitch_number != null && p.release_speed != null)
    return {
      x: f.map(p => p.pitch_number), y: f.map(p => p.release_speed),
      type: 'scatter' as any, mode: 'markers' as any,
      marker: { size: 4, color: getPitchColor(name), opacity: 0.7 },
      name,
      hovertemplate: `${name}<br>Pitch #%{x}<br>%{y:.1f} mph<extra></extra>`,
    }
  })

  const compactLayout = (extra: any = {}) => ({
    paper_bgcolor: 'transparent', plot_bgcolor: COLORS.bg,
    font: { ...BASE_LAYOUT.font, size: 10 },
    margin: { t: 25, r: 10, b: 30, l: 35 },
    showlegend: false,
    height: chartH,
    ...extra,
  })

  return (
    <div className="px-4 py-4 space-y-4 bg-zinc-950/50">
      {/* Section 1: Summary Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-4">
          <span className="text-xs text-zinc-500">{summary.date}</span>
          <span className="text-sm text-white ml-2 font-medium">{summary.matchup}</span>
          <span className="text-sm text-zinc-400 ml-2">{summary.score}</span>
        </div>
        <Pill label="IP" value={summary.ip} />
        <Pill label="Pitches" value={summary.total} />
        <Pill label="K" value={summary.ks} color="text-emerald-400" />
        <Pill label="BB" value={summary.bbs} color="text-red-400" />
        <Pill label="H" value={summary.hits} color="text-sky-400" />
        <Pill label="Whiff%" value={summary.whiffPct === '—' ? '—' : summary.whiffPct + '%'} color="text-amber-400" />
        <Pill label="CSW%" value={summary.cswPct === '—' ? '—' : summary.cswPct + '%'} color="text-amber-400" />
        <Pill label="Zone%" value={summary.zonePct === '—' ? '—' : summary.zonePct + '%'} color="text-sky-400" />
      </div>

      {/* Section 2: Pitch Arsenal Table */}
      <div className="bg-zinc-900 rounded border border-zinc-800 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-3 py-1.5">Pitch</th>
              <th className="text-right px-3 py-1.5">#</th>
              <th className="text-right px-3 py-1.5">Usage%</th>
              <th className="text-right px-3 py-1.5">Velo</th>
              <th className="text-right px-3 py-1.5">Max</th>
              <th className="text-right px-3 py-1.5">Whiff%</th>
              <th className="text-right px-3 py-1.5">CSW%</th>
              <th className="text-right px-3 py-1.5">Spin</th>
              <th className="text-right px-3 py-1.5">IVB</th>
              <th className="text-right px-3 py-1.5">HB</th>
            </tr>
          </thead>
          <tbody>
            {arsenal.map(r => (
              <tr key={r.name} className="border-t border-zinc-800/30">
                <td className="px-3 py-1.5 font-medium" style={{ color: getPitchColor(r.name) }}>{r.name}</td>
                <td className="px-3 py-1.5 text-right text-zinc-400 font-mono">{r.count}</td>
                <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.usagePct}%</td>
                <td className="px-3 py-1.5 text-right text-amber-400 font-mono">{r.avgVelo}</td>
                <td className="px-3 py-1.5 text-right text-amber-400/70 font-mono">{r.maxVelo}</td>
                <td className="px-3 py-1.5 text-right text-emerald-400 font-mono">{r.whiffPct}%</td>
                <td className="px-3 py-1.5 text-right text-emerald-400 font-mono">{r.cswPct}%</td>
                <td className="px-3 py-1.5 text-right text-sky-400 font-mono">{r.avgSpin}</td>
                <td className="px-3 py-1.5 text-right text-purple-400 font-mono">{r.avgIVB}"</td>
                <td className="px-3 py-1.5 text-right text-purple-400 font-mono">{r.avgHB}"</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 3: Three Compact Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Strike Zone Scatter */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider text-center mb-1">Strike Zone</div>
          <Plot
            data={zoneTraces}
            layout={compactLayout({
              xaxis: { range: [-1.96, 1.96], showticklabels: false, showgrid: false, zeroline: false, fixedrange: true },
              yaxis: { range: [0.25, 4.75], showticklabels: false, showgrid: false, zeroline: false, scaleanchor: 'x', fixedrange: true },
              shapes: ZONE_SHAPES,
              margin: { t: 5, r: 5, b: 5, l: 5 },
            })}
            style={{ width: '100%', height: chartH }}
          />
        </div>
        {/* Movement Chart */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider text-center mb-1">Movement</div>
          <Plot
            data={moveTraces}
            layout={compactLayout({
              xaxis: { title: { text: 'HB (in)', font: { size: 9, color: COLORS.text } }, gridcolor: COLORS.grid, zeroline: true, zerolinecolor: '#52525b', fixedrange: true, tickfont: { size: 9 } },
              yaxis: { title: { text: 'IVB (in)', font: { size: 9, color: COLORS.text } }, gridcolor: COLORS.grid, zeroline: true, zerolinecolor: '#52525b', fixedrange: true, tickfont: { size: 9 } },
            })}
            style={{ width: '100%', height: chartH }}
          />
        </div>
        {/* Velocity by Pitch # */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider text-center mb-1">Velocity by Pitch #</div>
          <Plot
            data={veloTraces}
            layout={compactLayout({
              xaxis: { title: { text: 'Pitch #', font: { size: 9, color: COLORS.text } }, gridcolor: COLORS.grid, zeroline: false, fixedrange: true, tickfont: { size: 9 } },
              yaxis: { title: { text: 'MPH', font: { size: 9, color: COLORS.text } }, gridcolor: COLORS.grid, zeroline: false, fixedrange: true, tickfont: { size: 9 } },
            })}
            style={{ width: '100%', height: chartH }}
          />
        </div>
      </div>

      {/* Pitch color legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.keys(pitchGroups).map(name => (
          <div key={name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getPitchColor(name) }} />
            <span className="text-[10px] text-zinc-400">{name}</span>
          </div>
        ))}
      </div>

      {/* Sections 4 & 5: Inning-by-Inning & At-Bat Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Inning-by-Inning */}
        <div className="bg-zinc-900 rounded border border-zinc-800 overflow-x-auto">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider px-3 pt-2 pb-1">Inning by Inning</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-3 py-1">Inn</th>
                <th className="text-right px-3 py-1">Pitches</th>
                <th className="text-right px-3 py-1">Velo</th>
                <th className="text-right px-3 py-1">K</th>
                <th className="text-right px-3 py-1">BB</th>
                <th className="text-right px-3 py-1">H</th>
              </tr>
            </thead>
            <tbody>
              {innings.map(r => (
                <tr key={r.inning} className="border-t border-zinc-800/30">
                  <td className="px-3 py-1 text-white font-medium">{r.inning}</td>
                  <td className="px-3 py-1 text-right text-zinc-400 font-mono">{r.pitches}</td>
                  <td className="px-3 py-1 text-right text-amber-400 font-mono">{r.avgVelo}</td>
                  <td className="px-3 py-1 text-right text-emerald-400 font-mono">{r.ks}</td>
                  <td className="px-3 py-1 text-right text-red-400 font-mono">{r.bbs}</td>
                  <td className="px-3 py-1 text-right text-sky-400 font-mono">{r.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* At-Bat Results */}
        <div className="bg-zinc-900 rounded border border-zinc-800 overflow-x-auto">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider px-3 pt-2 pb-1">At-Bat Results</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-3 py-1">Batter</th>
                <th className="text-right px-3 py-1">Count</th>
                <th className="text-left px-3 py-1">Pitches</th>
                <th className="text-left px-3 py-1">Result</th>
                <th className="text-right px-3 py-1">EV</th>
                <th className="text-right px-3 py-1">LA</th>
              </tr>
            </thead>
            <tbody>
              {atBats.map((r, i) => (
                <tr key={i} className="border-t border-zinc-800/30">
                  <td className="px-3 py-1 text-white text-xs truncate max-w-[120px]">{r.batter}</td>
                  <td className="px-3 py-1 text-right text-zinc-400 font-mono">{r.count}</td>
                  <td className="px-3 py-1 text-zinc-500 text-[10px] truncate max-w-[140px]">{r.pitchTypes}</td>
                  <td className={`px-3 py-1 font-mono ${resultColor(r.result)}`}>{r.result.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-1 text-right text-orange-400 font-mono">{r.ev}</td>
                  <td className="px-3 py-1 text-right text-orange-400 font-mono">{r.la}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 6: Batted Ball Summary */}
      {battedBall && (
        <div className="flex flex-wrap gap-2">
          <Pill label="Avg EV" value={battedBall.avgEV} color="text-orange-400" />
          <Pill label="Hard Hit%" value={battedBall.hardHitPct + '%'} color="text-orange-400" />
          <Pill label="GB%" value={battedBall.gbPct + '%'} color="text-zinc-300" />
          <Pill label="FB%" value={battedBall.fbPct + '%'} color="text-zinc-300" />
          <Pill label="LD%" value={battedBall.ldPct + '%'} color="text-zinc-300" />
          <Pill label="PU%" value={battedBall.puPct + '%'} color="text-zinc-300" />
        </div>
      )}
    </div>
  )
}
