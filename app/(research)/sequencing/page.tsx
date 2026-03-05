'use client'
import { useState, useCallback, useRef, useMemo } from 'react'
import ResearchNav from '@/components/ResearchNav'
import PlayerSearchInput from '@/components/PlayerSearchInput'
import SequenceReplayCanvas, { type SequenceReplayHandle, type ReplayPitch } from '@/components/sequencing/SequenceReplayCanvas'
import AtBatSelector, { type AtBatGroup } from '@/components/sequencing/AtBatSelector'
import { exportSequenceReplayMP4 } from '@/lib/exportSequenceReplay'

interface PlayerResult {
  player_name: string
  pitcher?: number
  batter?: number
  total_pitches: number
  team: string
}

interface Transition {
  from_pitch: string; to_pitch: string
  freq: number; transition_pct: number
  whiff_pct: number | null; xwoba: number | null
}

interface ArsenalRow {
  pitch_name: string; pitches: number; usage_pct: number
  avg_velo: number | null; whiff_pct: number | null
}

const PITCH_COLORS: Record<string, string> = {
  '4-Seam Fastball': '#ef4444', 'Sinker': '#f97316', 'Cutter': '#eab308',
  'Slider': '#22c55e', 'Sweeper': '#14b8a6', 'Curveball': '#3b82f6',
  'Changeup': '#a855f7', 'Split-Finger': '#ec4899', 'Knuckle Curve': '#6366f1',
  'Slurve': '#06b6d4',
}

const SEASONS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015']
const HANDS = ['All', 'L', 'R']

function pctBg(pct: number): string {
  if (pct >= 40) return 'bg-emerald-500/30'
  if (pct >= 25) return 'bg-emerald-500/15'
  if (pct >= 10) return 'bg-zinc-700/30'
  return ''
}

function groupAtBats(pitches: any[]): AtBatGroup[] {
  const map = new Map<string, any[]>()
  for (const p of pitches) {
    const key = `${p.game_pk}-${p.at_bat_number}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }

  const groups: AtBatGroup[] = []
  for (const [key, rows] of map) {
    const first = rows[0]
    const last = rows[rows.length - 1]
    groups.push({
      key,
      game_pk: first.game_pk,
      at_bat_number: first.at_bat_number,
      game_date: first.game_date,
      batter_name: first.batter_name,
      inning: first.inning,
      inning_topbot: first.inning_topbot,
      stand: first.stand,
      result: last.events || null,
      pitchCount: rows.length,
      pitches: rows,
    })
  }

  return groups
}

export default function SequencingPage() {
  const [pitcher, setPitcher] = useState<PlayerResult | null>(null)
  const [season, setSeason] = useState('2025')
  const [hand, setHand] = useState('All')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [arsenal, setArsenal] = useState<ArsenalRow[]>([])

  // Replay state
  const [atBats, setAtBats] = useState<AtBatGroup[]>([])
  const [selectedAtBat, setSelectedAtBat] = useState<AtBatGroup | null>(null)
  const [loadingAtBats, setLoadingAtBats] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const replayRef = useRef<SequenceReplayHandle>(null)

  const handleFetch = useCallback(async () => {
    if (!pitcher?.pitcher) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/sequencing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitcherId: pitcher.pitcher, season, hand }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      setTransitions(data.transitions || [])
      setArsenal(data.arsenal || [])
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [pitcher, season, hand])

  const handleLoadAtBats = useCallback(async () => {
    if (!pitcher?.pitcher) return
    setLoadingAtBats(true)
    try {
      const res = await fetch('/api/sequencing-atbats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitcherId: pitcher.pitcher, season, hand }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      const groups = groupAtBats(data.pitches || [])
      setAtBats(groups)
      if (groups.length > 0) setSelectedAtBat(groups[0])
    } catch (e: any) { setError(e.message) }
    setLoadingAtBats(false)
  }, [pitcher, season, hand])

  const handleExportMP4 = useCallback(async () => {
    if (!replayRef.current || !selectedAtBat) return
    setExporting(true)
    setExportProgress(0)
    try {
      const { renderFrameAt, totalDurationMs } = replayRef.current
      const batter = selectedAtBat.batter_name.replace(/\s+/g, '-').toLowerCase()
      await exportSequenceReplayMP4(
        renderFrameAt,
        totalDurationMs,
        { fps: 30, filename: `sequence-${batter}.mp4` },
        pct => setExportProgress(pct),
      )
    } catch (e: any) {
      setError(e.message)
    }
    setExporting(false)
  }, [selectedAtBat])

  const replayPitches: ReplayPitch[] = useMemo(() => {
    if (!selectedAtBat) return []
    return selectedAtBat.pitches as ReplayPitch[]
  }, [selectedAtBat])

  // Build matrix: rows = from_pitch, cols = all unique pitches
  const allPitches = [...new Set([...transitions.map(t => t.from_pitch), ...transitions.map(t => t.to_pitch)])]
  // Sort by arsenal usage
  const pitchOrder = arsenal.map(a => a.pitch_name).filter(p => allPitches.includes(p))
  const extraPitches = allPitches.filter(p => !pitchOrder.includes(p))
  const orderedPitches = [...pitchOrder, ...extraPitches]

  const getCell = (from: string, to: string) => transitions.find(t => t.from_pitch === from && t.to_pitch === to)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/sequencing" />
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-6">
        <h1 className="text-lg font-semibold text-white mb-1">Pitch Sequencing</h1>
        <p className="text-xs text-zinc-500 mb-4">Transition matrix showing pitch-to-pitch sequencing patterns</p>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <PlayerSearchInput type="pitcher" label="Pitcher" value={pitcher}
              onSelect={p => { setPitcher(p); setTransitions([]); setArsenal([]); setAtBats([]); setSelectedAtBat(null) }}
              onClear={() => { setPitcher(null); setTransitions([]); setArsenal([]); setAtBats([]); setSelectedAtBat(null) }} />
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
              <select value={season} onChange={e => setSeason(e.target.value)}
                className="h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none">
                {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Batter Hand</label>
              <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
                {HANDS.map(h => (
                  <button key={h} onClick={() => setHand(h)}
                    className={`px-3 py-1.5 text-xs rounded transition ${hand === h ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleFetch} disabled={!pitcher?.pitcher || loading}
              className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded transition">
              {loading ? 'Loading...' : 'Analyze'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm mb-4">{error}</div>}

        {/* Arsenal Summary */}
        {arsenal.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-6">
            <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400 font-medium">Arsenal</div>
            <div className="flex flex-wrap gap-3 p-3">
              {arsenal.map(a => (
                <div key={a.pitch_name} className="flex items-center gap-2 bg-zinc-800/50 rounded px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PITCH_COLORS[a.pitch_name] || '#888' }} />
                  <span className="text-xs text-white">{a.pitch_name}</span>
                  <span className="text-[10px] text-zinc-500">{a.usage_pct}%</span>
                  <span className="text-[10px] text-zinc-500">{a.avg_velo} mph</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transition Matrix */}
        {transitions.length > 0 && orderedPitches.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-6">
            <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400 font-medium">
              Transition Matrix <span className="text-zinc-600 ml-1">Row = Previous Pitch, Column = Next Pitch</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-zinc-800/40 text-zinc-500">
                    <th className="px-3 py-2 text-left font-medium sticky left-0 bg-zinc-900 z-10">From ↓ / To →</th>
                    {orderedPitches.map(p => (
                      <th key={p} className="px-2 py-2 text-center font-medium min-w-[80px]">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PITCH_COLORS[p] || '#888' }} />
                          {p.replace('4-Seam ', '').replace('Fastball', 'FB').replace('Split-Finger', 'SF').replace('Knuckle Curve', 'KC')}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedPitches.map(from => (
                    <tr key={from} className="border-t border-zinc-800/30">
                      <td className="px-3 py-2 text-white font-medium sticky left-0 bg-zinc-900 z-10">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PITCH_COLORS[from] || '#888' }} />
                          {from}
                        </span>
                      </td>
                      {orderedPitches.map(to => {
                        const cell = getCell(from, to)
                        if (!cell) return <td key={to} className="px-2 py-2 text-center text-zinc-700">—</td>
                        return (
                          <td key={to} className={`px-2 py-2 text-center ${pctBg(cell.transition_pct)}`}>
                            <div className="font-mono text-white text-xs">{cell.transition_pct}%</div>
                            <div className="text-[9px] text-zinc-500 mt-0.5">
                              {cell.whiff_pct != null && <span className="text-emerald-400">{cell.whiff_pct}% whiff</span>}
                              {cell.whiff_pct != null && cell.xwoba != null && <span className="mx-0.5">·</span>}
                              {cell.xwoba != null && <span className="text-rose-400">{cell.xwoba} xw</span>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pitch Sequence Replay */}
        {transitions.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mb-6">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-medium">Pitch Sequence Replay</span>
              <div className="flex items-center gap-2">
                {atBats.length === 0 && (
                  <button
                    onClick={handleLoadAtBats}
                    disabled={loadingAtBats}
                    className="h-7 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 text-zinc-300 text-[11px] rounded border border-zinc-700 transition"
                  >
                    {loadingAtBats ? 'Loading...' : 'Load Replays'}
                  </button>
                )}
                {selectedAtBat && (
                  <button
                    onClick={handleExportMP4}
                    disabled={exporting}
                    className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-[11px] rounded transition"
                  >
                    {exporting ? `Exporting ${Math.round(exportProgress)}%` : 'Export MP4'}
                  </button>
                )}
              </div>
            </div>
            <div className="p-4">
              {atBats.length > 0 && (
                <div className="mb-3">
                  <AtBatSelector atBats={atBats} selected={selectedAtBat} onSelect={setSelectedAtBat} />
                </div>
              )}
              {atBats.length === 0 && !loadingAtBats && (
                <div className="text-center py-8 text-zinc-600 text-sm">
                  Click &quot;Load Replays&quot; to fetch at-bat data for animated replay.
                </div>
              )}
              {loadingAtBats && (
                <div className="text-center py-8 text-zinc-500 text-sm">Loading at-bats...</div>
              )}
              {replayPitches.length > 0 && (
                <SequenceReplayCanvas
                  ref={replayRef}
                  pitches={replayPitches}
                  width={540}
                  height={480}
                />
              )}
            </div>
          </div>
        )}

        {!loading && transitions.length === 0 && !error && (
          <div className="text-center py-20 text-zinc-600 text-sm">
            Select a pitcher to see their pitch sequencing patterns.
          </div>
        )}
      </div>
    </div>
  )
}
