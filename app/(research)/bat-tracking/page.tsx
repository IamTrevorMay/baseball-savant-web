'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import ResearchNav from '@/components/ResearchNav'

const SEASONS = ['2026', '2025', '2024', '2023']

type Axis = 'tied' | 'timing' | 'overunder'
type PlayerType = 'pitcher' | 'batter'

interface Row {
  player_id: number
  player_name: string
  bat_side: string | null
  team_name: string | null
  [k: string]: any
}

// Column descriptor: numeric, sortable cells.
interface Col { key: string; label: string; fmt: (v: any) => string }

const pct = (v: any) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const num1 = (v: any) => (v == null ? '—' : Number(v).toFixed(1))
const intf = (v: any) => (v == null ? '—' : String(Math.round(v)))

const FIXED_LEFT: Col[] = [
  { key: 'miss_distance', label: 'Miss Dist (in)', fmt: num1 },
  { key: 'flawed_percent', label: 'Flawed%', fmt: pct },
  { key: 'perfect_percent', label: 'Perfect%', fmt: pct },
]
const FIXED_RIGHT: Col[] = [
  { key: 'n_swings', label: 'Swings', fmt: intf },
  { key: 'whiff_rate', label: 'Whiff%', fmt: pct },
  { key: 'competitive_percent', label: 'Comp%', fmt: pct },
]
const AXES: Record<Axis, { label: string; cols: Col[] }> = {
  tied: {
    label: 'Tied Up / Flail',
    cols: [
      { key: 'tied_up_percent', label: 'Tied Up%', fmt: pct },
      { key: 'avg_x_tied_up', label: 'Tied X (in)', fmt: num1 },
      { key: 'centered_percent', label: 'Centered%', fmt: pct },
      { key: 'flailed_percent', label: 'Flail%', fmt: pct },
      { key: 'avg_x_flail', label: 'Flail X (in)', fmt: num1 },
    ],
  },
  timing: {
    label: 'Early / Late',
    cols: [
      { key: 'early_percent', label: 'Early%', fmt: pct },
      { key: 'avg_y_early', label: 'Early (ms)', fmt: num1 },
      { key: 'on_time_percent', label: 'On Time%', fmt: pct },
      { key: 'late_percent', label: 'Late%', fmt: pct },
      { key: 'avg_y_late', label: 'Late (ms)', fmt: num1 },
    ],
  },
  overunder: {
    label: 'Over / Under',
    cols: [
      { key: 'over_percent', label: 'Over%', fmt: pct },
      { key: 'avg_z_over', label: 'Over Z (in)', fmt: num1 },
      { key: 'lined_up_percent', label: 'Lined Up%', fmt: pct },
      { key: 'under_percent', label: 'Under%', fmt: pct },
      { key: 'avg_z_under', label: 'Under Z (in)', fmt: num1 },
    ],
  },
}

// "Last, First" -> "First Last"
function flipName(n: string): string {
  if (!n) return ''
  const p = n.split(',')
  return p.length === 2 ? `${p[1].trim()} ${p[0].trim()}` : n
}

export default function BatTrackingPage() {
  const [type, setType] = useState<PlayerType>('pitcher')
  const [season, setSeason] = useState('2026')
  const [pitchType, setPitchType] = useState('ALL')
  const [minSwings, setMinSwings] = useState(50)
  const [axis, setAxis] = useState<Axis>('timing')

  const [rows, setRows] = useState<Row[]>([])
  const [pitchTypes, setPitchTypes] = useState<string[]>([])
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState('miss_distance')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const p = new URLSearchParams({ type, season, pitchType, minSwings: String(minSwings) })
    fetch(`/api/bat-tracking?${p}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setRows([]) }
        else {
          setRows(d.rows || [])
          setPitchTypes(d.pitchTypes || [])
          setLatestDate(d.latestDate || null)
        }
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [type, season, pitchType, minSwings])

  useEffect(() => { load() }, [load])

  const cols = useMemo(() => [...FIXED_LEFT, ...AXES[axis].cols, ...FIXED_RIGHT], [axis])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1   // nulls last
      if (bv == null) return -1
      return (av - bv) * dir
    })
  }, [rows, sortKey, sortDir])

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const arrow = (key: string) => (key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <ResearchNav active="/bat-tracking" />
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🏏 Bat Tracking
            <span className="text-sm font-normal text-zinc-500">Swing timing &amp; miss distance</span>
          </h1>
          <div className="text-xs text-zinc-600">
            {latestDate ? `Snapshot ${latestDate}` : ''}
          </div>
        </div>
        <p className="text-xs text-zinc-600 mb-4">
          {type === 'pitcher'
            ? 'How far pitchers make hitters miss, and how they miss (timing, tied-up/flail, over/under). Season-to-date.'
            : 'Hitter swing quality and timing — miss distance, contact quality, early/late. Season-to-date.'}
          {' '}Min {minSwings} swings.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 mb-4">
          {/* Pitcher / Batter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">View</span>
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
              {(['pitcher', 'batter'] as PlayerType[]).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`px-3 py-1 capitalize transition ${type === t ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Season */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Season</span>
            <select value={season} onChange={e => setSeason(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500">
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Pitch type */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Pitch Type</span>
            <select value={pitchType} onChange={e => setPitchType(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500">
              <option value="ALL">Overall</option>
              {pitchTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
          </div>

          {/* Min swings */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Min Swings</span>
            <input type="number" min={0} step={10} value={minSwings}
              onChange={e => setMinSwings(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white w-20 focus:outline-none focus:border-emerald-500" />
          </div>

          {/* Axis toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Miss Breakdown</span>
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
              {(Object.keys(AXES) as Axis[]).map(a => (
                <button key={a} onClick={() => setAxis(a)}
                  className={`px-3 py-1 transition whitespace-nowrap ${axis === a ? 'bg-sky-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>
                  {AXES[a].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}
        {loading && <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                  <th className="px-2 py-2 text-right w-8 sticky left-0 bg-zinc-900">#</th>
                  <th className="px-2 py-2 text-left">Player</th>
                  <th className="px-2 py-2 text-left w-12">Tm</th>
                  <th className="px-2 py-2 text-center w-10">Side</th>
                  {cols.map(c => (
                    <th key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`px-2 py-2 text-right cursor-pointer select-none hover:text-white transition ${sortKey === c.key ? 'text-emerald-400' : ''}`}>
                      {c.label}{arrow(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={4 + cols.length} className="px-3 py-6 text-center text-zinc-600">No players match.</td></tr>
                )}
                {sorted.map((r, i) => (
                  <tr key={`${r.player_id}-${r.pitch_type}`} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="px-2 py-1.5 text-right text-zinc-600 sticky left-0 bg-zinc-950">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {type === 'pitcher'
                        ? <a href={`/player/${r.player_id}`} className="text-emerald-400 hover:text-emerald-300 transition">{flipName(r.player_name)}</a>
                        : <span className="text-zinc-200">{flipName(r.player_name)}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-zinc-400">{r.team_name}</td>
                    <td className="px-2 py-1.5 text-center text-zinc-500">{r.bat_side || '—'}</td>
                    {cols.map(c => (
                      <td key={c.key}
                        className={`px-2 py-1.5 text-right tabular-nums ${c.key === sortKey ? 'text-white font-semibold' : 'text-zinc-300'}`}>
                        {c.fmt(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-zinc-600 mt-3">
          Source: Baseball Savant swing-timing/miss-distance leaderboard, snapshotted daily. Available 2023+.
          Miss distance in inches; timing in ms (negative = late, positive = early on the bat&apos;s reference frame).
        </p>
      </div>
    </div>
  )
}
