'use client'
import { useState, useCallback } from 'react'
import ResearchNav from '@/components/ResearchNav'

const SEASONS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015']
const CATEGORIES = ['pitching', 'hitting'] as const
const VIEWS = ['both', 'raw', 'adjusted'] as const

interface ParkRow {
  player_id: number; player_name: string; team: string
  pitches: number; pa: number; park_factor: number
  xwoba: number | null; adj_xwoba: number | null
  hr_pct: number | null; adj_hr_pct: number | null
  k_pct: number | null; adj_k_pct: number | null
  bb_pct: number | null; adj_bb_pct: number | null
}

function delta(raw: number | null, adj: number | null): string {
  if (raw == null || adj == null) return ''
  const d = adj - raw
  if (Math.abs(d) < 0.0005) return ''
  return d > 0 ? '+' : ''
}

function deltaColor(raw: number | null, adj: number | null, isPitching: boolean): string {
  if (raw == null || adj == null) return ''
  const d = adj - raw
  if (Math.abs(d) < 0.001) return 'text-zinc-500'
  // For pitching: lower xwOBA is good (green), for hitting: higher is good (green)
  const isGoodForPitcher = d < 0
  return isPitching
    ? (isGoodForPitcher ? 'text-emerald-400' : 'text-rose-400')
    : (isGoodForPitcher ? 'text-rose-400' : 'text-emerald-400')
}

export default function ParkAdjustedPage() {
  const [season, setSeason] = useState('2025')
  const [category, setCategory] = useState<'pitching' | 'hitting'>('pitching')
  const [view, setView] = useState<'both' | 'raw' | 'adjusted'>('both')
  const [minPitches, setMinPitches] = useState('500')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParkRow[]>([])
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleFetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/park-adjusted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, category, minPitches: parseInt(minPitches) || 500 }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      setRows(data.rows || [])
      setSortCol(null)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [season, category, minPitches])

  const handleSort = (col: string) => {
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc'
    setSortCol(col); setSortDir(newDir)
  }

  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const av = (a as any)[sortCol], bv = (b as any)[sortCol]
        if (av == null && bv == null) return 0
        if (av == null) return 1; if (bv == null) return -1
        return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
      })
    : rows

  const showRaw = view === 'raw' || view === 'both'
  const showAdj = view === 'adjusted' || view === 'both'
  const isPitching = category === 'pitching'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/park-adjusted" />
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-6">
        <h1 className="text-lg font-semibold text-white mb-1">Park-Adjusted Stats</h1>
        <p className="text-xs text-zinc-500 mb-4">Expected stats adjusted for home park factors</p>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
              <select value={season} onChange={e => setSeason(e.target.value)}
                className="h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none">
                {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Category</label>
              <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 text-xs rounded transition capitalize ${category === c ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">View</label>
              <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
                {VIEWS.map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-xs rounded transition capitalize ${view === v ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Min Pitches</label>
              <input value={minPitches} onChange={e => setMinPitches(e.target.value)} type="number"
                className="h-9 w-20 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none" />
            </div>
            <button onClick={handleFetch} disabled={loading}
              className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded transition">
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm mb-4">{error}</div>}

        {/* Table */}
        {rows.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-zinc-800/40 text-zinc-500">
                    <th className="px-2 py-1.5 text-center font-medium w-8">#</th>
                    <th className="px-3 py-1.5 text-left font-medium">Player</th>
                    <th className="px-3 py-1.5 text-left font-medium">Team</th>
                    <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('park_factor')}>
                      PF{sortCol === 'park_factor' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                    <th className="px-3 py-1.5 text-right font-medium">PA</th>
                    {showRaw && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('xwoba')}>xwOBA{sortCol === 'xwoba' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showAdj && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300 text-emerald-400" onClick={() => handleSort('adj_xwoba')}>Adj xwOBA{sortCol === 'adj_xwoba' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showRaw && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('hr_pct')}>HR%{sortCol === 'hr_pct' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showAdj && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300 text-emerald-400" onClick={() => handleSort('adj_hr_pct')}>Adj HR%{sortCol === 'adj_hr_pct' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showRaw && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('k_pct')}>K%{sortCol === 'k_pct' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showAdj && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300 text-emerald-400" onClick={() => handleSort('adj_k_pct')}>Adj K%{sortCol === 'adj_k_pct' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showRaw && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('bb_pct')}>BB%{sortCol === 'bb_pct' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                    {showAdj && <th className="px-3 py-1.5 text-right font-medium cursor-pointer hover:text-zinc-300 text-emerald-400" onClick={() => handleSort('adj_bb_pct')}>Adj BB%{sortCol === 'adj_bb_pct' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={row.player_id} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
                      <td className="px-2 py-1.5 text-center text-zinc-600 font-mono">{i + 1}</td>
                      <td className="px-3 py-1.5 text-white font-medium">{row.player_name}</td>
                      <td className="px-3 py-1.5 text-zinc-400">{row.team}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{row.park_factor}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{row.pa}</td>
                      {showRaw && <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{row.xwoba?.toFixed(3) ?? '—'}</td>}
                      {showAdj && (
                        <td className={`px-3 py-1.5 text-right font-mono ${deltaColor(row.xwoba, row.adj_xwoba, isPitching)}`}>
                          {row.adj_xwoba?.toFixed(3) ?? '—'}
                          {view === 'both' && row.xwoba != null && row.adj_xwoba != null && Math.abs(row.adj_xwoba - row.xwoba) >= 0.001 && (
                            <span className="text-[9px] ml-1">({delta(row.xwoba, row.adj_xwoba)}{(row.adj_xwoba - row.xwoba).toFixed(3)})</span>
                          )}
                        </td>
                      )}
                      {showRaw && <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{row.hr_pct?.toFixed(1) ?? '—'}%</td>}
                      {showAdj && <td className={`px-3 py-1.5 text-right font-mono ${deltaColor(row.hr_pct, row.adj_hr_pct, isPitching)}`}>{row.adj_hr_pct?.toFixed(1) ?? '—'}%</td>}
                      {showRaw && <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{row.k_pct?.toFixed(1) ?? '—'}%</td>}
                      {showAdj && <td className={`px-3 py-1.5 text-right font-mono ${deltaColor(row.k_pct, row.adj_k_pct, isPitching)}`}>{row.adj_k_pct?.toFixed(1) ?? '—'}%</td>}
                      {showRaw && <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{row.bb_pct?.toFixed(1) ?? '—'}%</td>}
                      {showAdj && <td className={`px-3 py-1.5 text-right font-mono ${deltaColor(row.bb_pct, row.adj_bb_pct, isPitching)}`}>{row.adj_bb_pct?.toFixed(1) ?? '—'}%</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="text-center py-20 text-zinc-600 text-sm">
            Select a season and click Load to see park-adjusted stats.
          </div>
        )}
      </div>
    </div>
  )
}
