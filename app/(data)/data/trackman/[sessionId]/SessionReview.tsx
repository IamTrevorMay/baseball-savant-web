'use client'

import { useMemo, useState } from 'react'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS, ZONE_SHAPES, getPitchColor } from '@/components/chartConfig'

// Mirrors the row shape selected in page.tsx's loadSession().
export type Pitch = {
  id: string
  pitch_uid: string | null
  pitch_no: number | null
  pitch_time: string | null
  pitcher_name: string | null
  pitcher_throws: string | null
  tagged_pitch_type: string | null
  pitch_call: string | null
  balls: number | null
  strikes: number | null
  rel_speed: number | null
  spin_rate: number | null
  spin_axis: number | null
  tilt: string | null
  rel_height: number | null
  rel_side: number | null
  extension: number | null
  induced_vert_break: number | null
  horz_break: number | null
  plate_loc_height: number | null
  plate_loc_side: number | null
}

const UNTAGGED = 'Untagged'
const typeKey = (p: Pitch) => p.tagged_pitch_type || UNTAGGED

function fmtNum(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

const CALL_COLOR: Record<string, string> = {
  StrikeCalled: 'text-emerald-300',
  StrikeSwinging: 'text-emerald-300',
  BallCalled: 'text-zinc-400',
  BallinDirt: 'text-zinc-400',
  HitByPitch: 'text-amber-300',
  FoulBall: 'text-zinc-300',
  FoulBallNotFieldable: 'text-zinc-300',
  FoulBallFieldable: 'text-zinc-300',
  InPlay: 'text-cyan-300',
}

function callClass(call: string | null) {
  if (!call) return 'text-zinc-600'
  return CALL_COLOR[call] || 'text-zinc-300'
}

export default function SessionReview({ pitches }: { pitches: Pitch[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedPitcher, setSelectedPitcher] = useState<string>('')
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  // Distinct pitchers — selector only shows when more than one.
  const pitchers = useMemo(() => {
    const s = new Set<string>()
    for (const p of pitches) if (p.pitcher_name) s.add(p.pitcher_name)
    return [...s].sort()
  }, [pitches])

  // Pitcher filter scopes both the table and the plots.
  const scoped = useMemo(
    () => (selectedPitcher ? pitches.filter(p => p.pitcher_name === selectedPitcher) : pitches),
    [pitches, selectedPitcher],
  )

  // Pitch types present (for the legend), with a count each.
  const types = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of scoped) counts[typeKey(p)] = (counts[typeKey(p)] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [scoped])

  // Points drawn on the plots — pitcher-scoped minus toggled-off types.
  const plotted = useMemo(
    () => scoped.filter(p => !hiddenTypes.has(typeKey(p))),
    [scoped, hiddenTypes],
  )

  const hovered = useMemo(
    () => (hoveredId ? pitches.find(p => p.id === hoveredId) ?? null : null),
    [hoveredId, pitches],
  )

  function toggleType(t: string) {
    setHiddenTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // Build one scatter trace per pitch type so colors + legend semantics hold.
  // customdata carries the pitch id so hover can resolve back to a row.
  function buildTraces(
    xOf: (p: Pitch) => number | null,
    yOf: (p: Pitch) => number | null,
  ) {
    const byType: Record<string, Pitch[]> = {}
    for (const p of plotted) {
      if (xOf(p) == null || yOf(p) == null) continue
      ;(byType[typeKey(p)] ||= []).push(p)
    }
    return Object.entries(byType).map(([t, pts]) => ({
      x: pts.map(xOf),
      y: pts.map(yOf),
      customdata: pts.map(p => p.id),
      text: pts.map(p => `#${p.pitch_no ?? '—'} · ${t}<br>${fmtNum(p.rel_speed)} mph`),
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: t,
      marker: { color: getPitchColor(t), size: 9, opacity: 0.75, line: { color: '#18181b', width: 0.5 } },
      hovertemplate: '%{text}<extra></extra>',
      showlegend: false,
    }))
  }

  // Ring overlay marking the hovered pitch on a given plot.
  function highlightTrace(x: number | null | undefined, y: number | null | undefined) {
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return []
    return [
      {
        x: [x],
        y: [y],
        type: 'scatter' as const,
        mode: 'markers' as const,
        marker: { size: 18, color: 'rgba(0,0,0,0)', line: { color: '#ffffff', width: 2 } },
        hoverinfo: 'skip' as const,
        showlegend: false,
      },
    ]
  }

  function onPlotHover(e: { points?: Array<{ customdata?: unknown }> }) {
    const id = e?.points?.[0]?.customdata
    if (typeof id === 'string') setHoveredId(id)
  }

  // ── Zone Location (catcher's view, feet — matches ZONE_SHAPES units) ──
  const zoneData = [
    ...buildTraces(p => p.plate_loc_side, p => p.plate_loc_height),
    ...highlightTrace(hovered?.plate_loc_side, hovered?.plate_loc_height),
  ]
  const zoneLayout = {
    ...BASE_LAYOUT,
    title: { text: 'Zone Location', font: { size: 13, color: COLORS.textLight } },
    shapes: ZONE_SHAPES,
    xaxis: {
      ...BASE_LAYOUT.xaxis, title: 'Plate Side (ft)', range: [-2.2, 2.2],
      zeroline: false, scaleanchor: 'y', scaleratio: 1,
    },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Plate Height (ft)', range: [0, 5], zeroline: false },
    height: 420,
    margin: { t: 36, r: 16, b: 42, l: 46 },
  }

  // ── Movement (raw TrackMan break, inches — matches the IVB/HB table cols) ──
  const movMax = useMemo(() => {
    let m = 12
    for (const p of plotted) {
      if (p.horz_break != null) m = Math.max(m, Math.abs(p.horz_break))
      if (p.induced_vert_break != null) m = Math.max(m, Math.abs(p.induced_vert_break))
    }
    return Math.ceil((m + 2) / 6) * 6 // pad + snap to a 6" grid
  }, [plotted])

  const movData = [
    ...buildTraces(p => p.horz_break, p => p.induced_vert_break),
    ...highlightTrace(hovered?.horz_break, hovered?.induced_vert_break),
  ]
  const movLayout = {
    ...BASE_LAYOUT,
    title: { text: 'Movement', font: { size: 13, color: COLORS.textLight } },
    xaxis: {
      ...BASE_LAYOUT.xaxis, title: 'Horizontal Break (in)', range: [-movMax, movMax],
      zeroline: true, zerolinecolor: '#52525b', zerolinewidth: 1, scaleanchor: 'y', scaleratio: 1,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis, title: 'Induced Vert Break (in)', range: [-movMax, movMax],
      zeroline: true, zerolinecolor: '#52525b', zerolinewidth: 1,
    },
    height: 420,
    margin: { t: 36, r: 16, b: 42, l: 46 },
  }

  const plotConfig = { displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }

  return (
    <section className="mb-8">
      {/* Controls: pitcher selector (when >1) + clickable pitch-type legend */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mr-1">Zone &amp; Movement</h2>
        {pitchers.length > 1 && (
          <select
            value={selectedPitcher}
            onChange={e => setSelectedPitcher(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300"
          >
            <option value="">All pitchers</option>
            {pitchers.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {types.map(([t, count]) => {
            const off = hiddenTypes.has(t)
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  off
                    ? 'border-zinc-800 text-zinc-600 bg-zinc-900/40'
                    : 'border-zinc-700 text-zinc-300 bg-zinc-900'
                }`}
                title={off ? 'Show on plots' : 'Hide from plots'}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: off ? '#3f3f46' : getPitchColor(t) }}
                />
                {t}
                <span className="tabular-nums text-zinc-500">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Two plots + readout card */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_240px] gap-3 mb-6">
        <div
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-1"
          onMouseLeave={() => setHoveredId(null)}
        >
          <Plot data={zoneData} layout={zoneLayout} config={plotConfig} onHover={onPlotHover} />
        </div>
        <div
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-1"
          onMouseLeave={() => setHoveredId(null)}
        >
          <Plot data={movData} layout={movLayout} config={plotConfig} onHover={onPlotHover} />
        </div>
        <ReadoutCard pitch={hovered} />
      </div>

      {/* Pitches table — rows link bidirectionally with the plots */}
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Pitches</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-right px-2 py-2 font-medium">#</th>
              <th className="text-left px-2 py-2 font-medium">Pitcher</th>
              <th className="text-left px-2 py-2 font-medium">Hand</th>
              <th className="text-left px-2 py-2 font-medium">Type</th>
              <th className="text-left px-2 py-2 font-medium">Call</th>
              <th className="text-right px-2 py-2 font-medium">Count</th>
              <th className="text-right px-2 py-2 font-medium">Velo</th>
              <th className="text-right px-2 py-2 font-medium">Spin</th>
              <th className="text-right px-2 py-2 font-medium">Tilt</th>
              <th className="text-right px-2 py-2 font-medium">IVB</th>
              <th className="text-right px-2 py-2 font-medium">HB</th>
              <th className="text-right px-2 py-2 font-medium">Ext</th>
              <th className="text-right px-2 py-2 font-medium">Rel ht</th>
              <th className="text-right px-2 py-2 font-medium">Rel sd</th>
              <th className="text-right px-2 py-2 font-medium">Plate H</th>
              <th className="text-right px-2 py-2 font-medium">Plate S</th>
            </tr>
          </thead>
          <tbody>
            {scoped.length === 0 && (
              <tr><td colSpan={16} className="px-3 py-10 text-center text-zinc-500">No pitches recorded in this session.</td></tr>
            )}
            {scoped.map(p => {
              const active = p.id === hoveredId
              return (
                <tr
                  key={p.id}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`border-t border-zinc-800 cursor-default ${
                    active ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/40'
                  }`}
                >
                  <td className="px-2 py-1.5 text-right text-zinc-500 tabular-nums">
                    {active && <span className="text-emerald-400 mr-1">▶</span>}
                    {p.pitch_no ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-300 whitespace-nowrap">{p.pitcher_name ?? '—'}</td>
                  <td className="px-2 py-1.5 text-zinc-500">{p.pitcher_throws ?? '—'}</td>
                  <td className="px-2 py-1.5 text-zinc-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: getPitchColor(typeKey(p)) }} />
                      {p.tagged_pitch_type ?? '—'}
                    </span>
                  </td>
                  <td className={`px-2 py-1.5 ${callClass(p.pitch_call)}`}>{p.pitch_call ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-500 tabular-nums">{p.balls ?? 0}-{p.strikes ?? 0}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-100 tabular-nums">{fmtNum(p.rel_speed, 1)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-300 tabular-nums">{p.spin_rate != null ? Math.round(p.spin_rate) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{p.tilt ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-300 tabular-nums">{fmtNum(p.induced_vert_break, 1)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-300 tabular-nums">{fmtNum(p.horz_break, 1)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.extension, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.rel_height, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.rel_side, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.plate_loc_height, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{fmtNum(p.plate_loc_side, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReadoutCard({ pitch }: { pitch: Pitch | null }) {
  if (!pitch) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-center text-center min-h-[180px]">
        <p className="text-xs text-zinc-600 leading-relaxed">
          Hover a point on either plot<br />or a row in the table to inspect a pitch.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 min-h-[180px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: getPitchColor(typeKey(pitch)) }} />
        <span className="text-sm text-white font-medium">{pitch.tagged_pitch_type || 'Untagged'}</span>
        <span className="text-xs text-zinc-500 ml-auto">#{pitch.pitch_no ?? '—'}</span>
      </div>
      {pitch.pitcher_name && <div className="text-xs text-zinc-400 mb-3 truncate">{pitch.pitcher_name}</div>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <ReadoutRow label="Velo" value={pitch.rel_speed != null ? `${fmtNum(pitch.rel_speed, 1)} mph` : '—'} />
        <ReadoutRow label="Spin" value={pitch.spin_rate != null ? `${Math.round(pitch.spin_rate)} rpm` : '—'} />
        <ReadoutRow label="Tilt" value={pitch.tilt ?? '—'} />
        <ReadoutRow label="Ext" value={pitch.extension != null ? `${fmtNum(pitch.extension, 2)} ft` : '—'} />
        <ReadoutRow label="IVB" value={pitch.induced_vert_break != null ? `${fmtNum(pitch.induced_vert_break, 1)}″` : '—'} />
        <ReadoutRow label="HB" value={pitch.horz_break != null ? `${fmtNum(pitch.horz_break, 1)}″` : '—'} />
        <ReadoutRow label="Plate S" value={pitch.plate_loc_side != null ? `${fmtNum(pitch.plate_loc_side, 2)} ft` : '—'} />
        <ReadoutRow label="Plate H" value={pitch.plate_loc_height != null ? `${fmtNum(pitch.plate_loc_height, 2)} ft` : '—'} />
        <ReadoutRow label="Count" value={`${pitch.balls ?? 0}-${pitch.strikes ?? 0}`} />
        <ReadoutRow label="Call" value={pitch.pitch_call ?? '—'} valueClass={callClass(pitch.pitch_call)} />
      </dl>
    </div>
  )
}

function ReadoutRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`tabular-nums ${valueClass || 'text-zinc-200'}`}>{value}</dd>
    </div>
  )
}
