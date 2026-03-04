'use client'
import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ResearchNav from '@/components/ResearchNav'
import PlayerSearchInput from '@/components/PlayerSearchInput'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface PlayerResult {
  player_name: string
  pitcher?: number
  batter?: number
  total_pitches: number
  team: string
}

interface Summary {
  pa: number; ba: number | null; obp: number | null; slg: number | null
  k_pct: number | null; bb_pct: number | null; pitches: number
}

interface PitchBreakdown {
  pitch_name: string; pitches: number; usage_pct: number
  whiff_pct: number | null; xwoba: number | null; ba: number | null; avg_ev: number | null
}

interface Location {
  plate_x: number; plate_z: number; pitch_name: string
  description: string; events: string | null; velo: number
}

const PITCH_COLORS: Record<string, string> = {
  '4-Seam Fastball': '#ef4444', 'Sinker': '#f97316', 'Cutter': '#eab308',
  'Slider': '#22c55e', 'Sweeper': '#14b8a6', 'Curveball': '#3b82f6',
  'Changeup': '#a855f7', 'Split-Finger': '#ec4899', 'Knuckle Curve': '#6366f1',
  'Slurve': '#06b6d4',
}

const SEASONS = ['all', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015']

export default function MatchupsPage() {
  const [pitcher, setPitcher] = useState<PlayerResult | null>(null)
  const [batter, setBatter] = useState<PlayerResult | null>(null)
  const [season, setSeason] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [breakdown, setBreakdown] = useState<PitchBreakdown[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [pitcherName, setPitcherName] = useState('')
  const [batterName, setBatterName] = useState('')

  const handleLookup = useCallback(async () => {
    if (!pitcher?.pitcher || !batter?.batter) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/matchup-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitcherId: pitcher.pitcher, batterId: batter.batter, season }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      setSummary(data.summary)
      setBreakdown(data.breakdown || [])
      setLocations(data.locations || [])
      setPitcherName(data.pitcherName)
      setBatterName(data.batterName)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [pitcher, batter, season])

  const clearResults = () => { setSummary(null); setBreakdown([]); setLocations([]) }

  // Build Plotly scatter data grouped by pitch type
  const pitchTypes = [...new Set(locations.map(l => l.pitch_name))]
  const plotData = pitchTypes.map(pt => ({
    x: locations.filter(l => l.pitch_name === pt).map(l => l.plate_x),
    y: locations.filter(l => l.pitch_name === pt).map(l => l.plate_z),
    text: locations.filter(l => l.pitch_name === pt).map(l => `${pt}\n${l.velo} mph\n${l.description}${l.events ? '\n' + l.events : ''}`),
    mode: 'markers' as const,
    type: 'scatter' as const,
    name: pt,
    marker: { size: 6, color: PITCH_COLORS[pt] || '#888', opacity: 0.7 },
    hoverinfo: 'text' as const,
  }))

  // Strike zone rectangle
  const zoneShapes = [{
    type: 'rect' as const, x0: -0.83, x1: 0.83, y0: 1.5, y1: 3.5,
    line: { color: '#52525b', width: 2 },
  }]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/matchups" />
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6">
        <h1 className="text-lg font-semibold text-white mb-1">Matchup Lookup</h1>
        <p className="text-xs text-zinc-500 mb-4">Head-to-head pitcher vs batter analysis</p>

        {/* Search controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <PlayerSearchInput type="pitcher" label="Pitcher" value={pitcher}
              onSelect={p => { setPitcher(p); clearResults() }}
              onClear={() => { setPitcher(null); clearResults() }} />
            <span className="text-zinc-600 text-lg font-bold pb-1">vs</span>
            <PlayerSearchInput type="batter" label="Batter" value={batter}
              onSelect={b => { setBatter(b); clearResults() }}
              onClear={() => { setBatter(null); clearResults() }} />
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
              <select value={season} onChange={e => setSeason(e.target.value)}
                className="h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none">
                {SEASONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All-Time' : s}</option>)}
              </select>
            </div>
            <button onClick={handleLookup}
              disabled={!pitcher?.pitcher || !batter?.batter || loading}
              className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded transition">
              {loading ? 'Loading...' : 'Lookup'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm mb-4">{error}</div>}

        {/* Results */}
        {summary && (
          <>
            {/* Header */}
            <div className="text-sm text-zinc-400 mb-4">
              <span className="text-white font-medium">{pitcherName}</span>
              <span className="mx-2 text-zinc-600">vs</span>
              <span className="text-white font-medium">{batterName}</span>
              <span className="ml-3 text-zinc-500">{summary.pitches} pitches &middot; {summary.pa} PA</span>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
              {[
                { label: 'BA', value: summary.ba, fmt: (v: number) => v.toFixed(3) },
                { label: 'OBP', value: summary.obp, fmt: (v: number) => v.toFixed(3) },
                { label: 'SLG', value: summary.slg, fmt: (v: number) => v.toFixed(3) },
                { label: 'K%', value: summary.k_pct, fmt: (v: number) => v.toFixed(1) + '%' },
                { label: 'BB%', value: summary.bb_pct, fmt: (v: number) => v.toFixed(1) + '%' },
                { label: 'PA', value: summary.pa, fmt: (v: number) => String(v) },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase">{s.label}</div>
                  <div className="text-lg font-mono text-white">
                    {s.value != null ? s.fmt(s.value) : '—'}
                  </div>
                </div>
              ))}
            </div>

            {/* Pitch-type breakdown table */}
            {breakdown.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-6">
                <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400 font-medium">Pitch Breakdown</div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-zinc-800/40 text-zinc-500">
                      <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                      <th className="px-3 py-1.5 text-right font-medium">N</th>
                      <th className="px-3 py-1.5 text-right font-medium">Usage%</th>
                      <th className="px-3 py-1.5 text-right font-medium">Whiff%</th>
                      <th className="px-3 py-1.5 text-right font-medium">xwOBA</th>
                      <th className="px-3 py-1.5 text-right font-medium">BA</th>
                      <th className="px-3 py-1.5 text-right font-medium">Avg EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map(r => (
                      <tr key={r.pitch_name} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
                        <td className="px-3 py-1.5 text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: PITCH_COLORS[r.pitch_name] || '#888' }} />
                          {r.pitch_name}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{r.pitches}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{r.usage_pct}%</td>
                        <td className="px-3 py-1.5 text-right font-mono text-emerald-400">{r.whiff_pct ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-rose-400">{r.xwoba ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{r.ba ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{r.avg_ev ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Location scatter */}
            {locations.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-400 font-medium mb-2">Pitch Locations</div>
                <Plot
                  data={plotData}
                  layout={{
                    width: 500, height: 500,
                    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                    xaxis: { range: [-2.5, 2.5], zeroline: false, showgrid: false, color: '#71717a', title: { text: 'Plate X (ft)', font: { size: 10, color: '#71717a' } } },
                    yaxis: { range: [0, 5], zeroline: false, showgrid: false, color: '#71717a', title: { text: 'Plate Z (ft)', font: { size: 10, color: '#71717a' } } },
                    shapes: zoneShapes,
                    margin: { l: 50, r: 20, t: 20, b: 50 },
                    legend: { font: { size: 10, color: '#a1a1aa' }, bgcolor: 'transparent' },
                    showlegend: true,
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                />
              </div>
            )}

            {/* Empty state */}
            {summary.pitches === 0 && (
              <div className="text-center py-12 text-zinc-500 text-sm">
                No pitch data found for this matchup{season !== 'all' ? ` in ${season}` : ''}.
              </div>
            )}
          </>
        )}

        {!summary && !loading && !error && (
          <div className="text-center py-20 text-zinc-600 text-sm">
            Select a pitcher and batter to see their head-to-head matchup data.
          </div>
        )}
      </div>
    </div>
  )
}
