'use client'
import { useState, useCallback, useEffect } from 'react'
import ResearchNav from '@/components/ResearchNav'
import { TEAM_COLORS } from '@/lib/teamColors'

const TABS = ['pitching', 'hitting', 'bullpen', 'platoon'] as const
type Tab = typeof TABS[number]

const GAME_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'spring', label: 'Spring Training' },
  { value: 'regular', label: 'Regular Season' },
  { value: 'postseason', label: 'Postseason' },
] as const
type GameType = typeof GAME_TYPES[number]['value']

const SEASONS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015']

interface TeamRow {
  team: string
  [key: string]: any
}

const PITCHING_COLS = [
  { key: 'team', label: 'Team', align: 'left' as const },
  { key: 'games', label: 'G', fmt: (v: number) => String(v) },
  { key: 'pa', label: 'PA', fmt: (v: number) => String(v) },
  { key: 'avg_velo', label: 'Velo', fmt: (v: number) => v?.toFixed(1) },
  { key: 'whiff_pct', label: 'Whiff%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'k_pct', label: 'K%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'bb_pct', label: 'BB%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'avg_xwoba', label: 'xwOBA', fmt: (v: number) => v?.toFixed(3) },
  { key: 'csw_pct', label: 'CSW%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'zone_pct', label: 'Zone%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'chase_pct', label: 'Chase%', fmt: (v: number) => v?.toFixed(1) + '%' },
]

const HITTING_COLS = [
  { key: 'team', label: 'Team', align: 'left' as const },
  { key: 'games', label: 'G', fmt: (v: number) => String(v) },
  { key: 'pa', label: 'PA', fmt: (v: number) => String(v) },
  { key: 'avg_ev', label: 'Avg EV', fmt: (v: number) => v?.toFixed(1) },
  { key: 'ba', label: 'BA', fmt: (v: number) => v?.toFixed(3) },
  { key: 'slg', label: 'SLG', fmt: (v: number) => v?.toFixed(3) },
  { key: 'k_pct', label: 'K%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'bb_pct', label: 'BB%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'avg_xwoba', label: 'xwOBA', fmt: (v: number) => v?.toFixed(3) },
  { key: 'hard_hit_pct', label: 'Hard%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'barrel_pct', label: 'Barrel%', fmt: (v: number) => v?.toFixed(1) + '%' },
]

const BULLPEN_COLS = [
  { key: 'team', label: 'Team', align: 'left' as const },
  { key: 'games', label: 'G', fmt: (v: number) => String(v) },
  { key: 'unique_pitchers', label: 'Arms', fmt: (v: number) => String(v) },
  { key: 'pitchers_per_game', label: 'P/G', fmt: (v: number) => v?.toFixed(1) },
  { key: 'avg_velo', label: 'Velo', fmt: (v: number) => v?.toFixed(1) },
  { key: 'whiff_pct', label: 'Whiff%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'k_pct', label: 'K%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'avg_xwoba', label: 'xwOBA', fmt: (v: number) => v?.toFixed(3) },
]

const PLATOON_COLS = [
  { key: 'team', label: 'Team', align: 'left' as const },
  { key: 'p_throws', label: 'Hand' },
  { key: 'pa', label: 'PA', fmt: (v: number) => String(v) },
  { key: 'whiff_pct', label: 'Whiff%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'k_pct', label: 'K%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'bb_pct', label: 'BB%', fmt: (v: number) => v?.toFixed(1) + '%' },
  { key: 'ba', label: 'BA', fmt: (v: number) => v?.toFixed(3) },
  { key: 'slg', label: 'SLG', fmt: (v: number) => v?.toFixed(3) },
  { key: 'avg_xwoba', label: 'xwOBA', fmt: (v: number) => v?.toFixed(3) },
]

function getColumns(tab: Tab) {
  if (tab === 'hitting') return HITTING_COLS
  if (tab === 'bullpen') return BULLPEN_COLS
  if (tab === 'platoon') return PLATOON_COLS
  return PITCHING_COLS
}

function TeamBadge({ team }: { team: string }) {
  const tc = TEAM_COLORS[team]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: tc?.primary || '#888' }} />
      <span className="text-white font-medium">{team}</span>
    </span>
  )
}

export default function TeamsPage() {
  const [tab, setTab] = useState<Tab>('pitching')
  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [gameType, setGameType] = useState<GameType>('regular')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TeamRow[]>([])
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleFetch = useCallback(async (t: Tab, s: string, gt: GameType) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/team-tendencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: s, tab: t, gameType: gt }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      setRows(data.rows || [])
      setSortCol(null)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [])

  // Auto-fetch on mount and when tab/season/gameType changes
  useEffect(() => { handleFetch(tab, season, gameType) }, [tab, season, gameType, handleFetch])

  const handleSort = (col: string) => {
    const newDir = sortCol === col && sortDir === 'desc' ? 'asc' : 'desc'
    setSortCol(col); setSortDir(newDir)
  }

  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol]
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
      })
    : rows

  const columns = getColumns(tab)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/teams" />
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-6">
        <h1 className="text-lg font-semibold text-white mb-1">Team Tendencies</h1>
        <p className="text-xs text-zinc-500 mb-4">All 30 teams ranked across pitching, hitting, bullpen, and platoon splits</p>

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
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Game Type</label>
              <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
                {GAME_TYPES.map(gt => (
                  <button key={gt.value} onClick={() => setGameType(gt.value)}
                    className={`px-3 py-1.5 text-xs rounded transition ${gameType === gt.value ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {gt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">View</label>
              <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-3 py-1.5 text-xs rounded transition capitalize ${tab === t ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
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
                    {columns.map(c => (
                      <th key={c.key}
                        onClick={() => c.key !== 'team' && handleSort(c.key)}
                        className={`px-3 py-1.5 font-medium cursor-pointer hover:text-zinc-300 transition ${c.align === 'left' ? 'text-left' : 'text-right'}`}>
                        {c.label}
                        {sortCol === c.key && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={`${row.team}-${row.p_throws || ''}-${i}`} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
                      <td className="px-2 py-1.5 text-center text-zinc-600 font-mono">{i + 1}</td>
                      {columns.map(c => (
                        <td key={c.key} className={`px-3 py-1.5 ${c.align === 'left' ? '' : 'text-right'} font-mono text-zinc-300`}>
                          {c.key === 'team' ? <TeamBadge team={row.team} /> :
                           c.key === 'p_throws' ? <span className="text-zinc-400">{row.p_throws}</span> :
                           c.fmt && row[c.key] != null ? c.fmt(row[c.key]) : (row[c.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="text-center py-20 text-zinc-600 text-sm">
            No data available for {season}.
          </div>
        )}
      </div>
    </div>
  )
}
