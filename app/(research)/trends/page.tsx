'use client'
import { useState, useCallback, useEffect } from 'react'
import ResearchNav from '@/components/ResearchNav'

const SEASONS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015']
const PLAYER_TYPES = ['pitcher', 'hitter'] as const

interface Alert {
  player_id: number; player_name: string
  metric: string; metric_label: string
  season_val: number; recent_val: number
  delta: number; sigma: number
  direction: 'up' | 'down'
  sentiment: 'good' | 'bad'
}

function sigmaColor(sigma: number, sentiment: string): string {
  const abs = Math.abs(sigma)
  if (sentiment === 'good') {
    if (abs >= 3) return 'bg-emerald-500/20 border-emerald-500/30'
    if (abs >= 2) return 'bg-emerald-500/10 border-emerald-500/20'
    return 'bg-emerald-500/5 border-emerald-500/10'
  }
  if (abs >= 3) return 'bg-red-500/20 border-red-500/30'
  if (abs >= 2) return 'bg-red-500/10 border-red-500/20'
  return 'bg-red-500/5 border-red-500/10'
}

function fmtVal(key: string, val: number): string {
  if (key === 'xwoba') return val.toFixed(3)
  if (key === 'spin') return String(Math.round(val))
  if (key === 'velo' || key === 'ev') return val.toFixed(1)
  return val.toFixed(1) + '%'
}

function fmtDelta(key: string, delta: number): string {
  const abs = Math.abs(delta)
  if (key === 'xwoba') return abs.toFixed(3)
  if (key === 'spin') return String(Math.round(abs))
  if (key === 'velo' || key === 'ev') return abs.toFixed(1) + ' mph'
  return abs.toFixed(1) + ' pts'
}

function buildReason(a: Alert): string {
  const d = fmtDelta(a.metric, a.delta)
  const verb = a.direction === 'up' ? 'up' : 'down'
  return `${a.metric_label} ${verb} ${d} vs season avg`
}

interface Highlight extends Alert {
  type: 'pitcher' | 'hitter'
  reason: string
}

export default function TrendsPage() {
  const [season, setSeason] = useState('2025')
  const [playerType, setPlayerType] = useState<'pitcher' | 'hitter'>('pitcher')
  const [minPitches, setMinPitches] = useState('500')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [recentDate, setRecentDate] = useState('')
  const [latestDate, setLatestDate] = useState('')
  const [highlights, setHighlights] = useState<{ surges: Highlight[]; concerns: Highlight[] } | null>(null)
  const [highlightsLoading, setHighlightsLoading] = useState(true)

  // Auto-load highlights on mount — fetch both pitcher and hitter trends
  useEffect(() => {
    let cancelled = false
    async function loadHighlights() {
      try {
        const [pitcherRes, hitterRes] = await Promise.all([
          fetch('/api/trends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ season: 2025, playerType: 'pitcher', minPitches: 500 }),
          }),
          fetch('/api/trends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ season: 2025, playerType: 'hitter', minPitches: 500 }),
          }),
        ])
        if (cancelled) return
        const [pd, hd] = await Promise.all([pitcherRes.json(), hitterRes.json()])
        const pitcherAlerts: Alert[] = (pd.rows || []).map((a: Alert) => ({ ...a }))
        const hitterAlerts: Alert[] = (hd.rows || []).map((a: Alert) => ({ ...a }))

        // Tag with type and add reason
        const all: Highlight[] = [
          ...pitcherAlerts.map(a => ({ ...a, type: 'pitcher' as const, reason: buildReason(a) })),
          ...hitterAlerts.map(a => ({ ...a, type: 'hitter' as const, reason: buildReason(a) })),
        ]

        // Deduplicate: one entry per player, keep highest |sigma|
        const surgeAll = all.filter(a => a.sentiment === 'good').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))
        const concernAll = all.filter(a => a.sentiment === 'bad').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))

        const pickUnique = (list: Highlight[], n: number): Highlight[] => {
          const seen = new Set<number>()
          const result: Highlight[] = []
          for (const item of list) {
            if (seen.has(item.player_id)) continue
            seen.add(item.player_id)
            result.push(item)
            if (result.length >= n) break
          }
          return result
        }

        setHighlights({
          surges: pickUnique(surgeAll, 5),
          concerns: pickUnique(concernAll, 5),
        })
        if (pd.recentDate) { setRecentDate(pd.recentDate); setLatestDate(pd.latestDate) }
      } catch {
        // Silently fail — highlights are supplementary
      }
      if (!cancelled) setHighlightsLoading(false)
    }
    loadHighlights()
    return () => { cancelled = true }
  }, [])

  const handleScan = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season, playerType, minPitches: parseInt(minPitches) || 500 }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      setAlerts(data.rows || [])
      setRecentDate(data.recentDate || '')
      setLatestDate(data.latestDate || '')
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [season, playerType, minPitches])

  // Group alerts by player
  const playerGroups: Record<string, Alert[]> = {}
  for (const a of alerts) {
    const key = `${a.player_id}`
    if (!playerGroups[key]) playerGroups[key] = []
    playerGroups[key].push(a)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/trends" />
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6">
        <h1 className="text-lg font-semibold text-white mb-1">Trend Alerts</h1>
        <p className="text-xs text-zinc-500 mb-4">Detect significant recent performance changes vs season averages</p>

        {/* Trends to Notice — auto-loaded highlights */}
        {highlightsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[0, 1].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                <div className="h-4 w-24 bg-zinc-800 rounded mb-3" />
                {[0, 1, 2, 3, 4].map(j => <div key={j} className="h-10 bg-zinc-800/50 rounded mb-2" />)}
              </div>
            ))}
          </div>
        )}
        {highlights && !highlightsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Surges */}
            <div className="bg-zinc-900 border border-emerald-500/20 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-emerald-500/10 flex items-center gap-2">
                <span className="text-emerald-400 text-sm font-semibold">Surges</span>
                <span className="text-[10px] text-zinc-600">Top performing trends</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {highlights.surges.map((h, i) => (
                  <div key={h.player_id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-emerald-500/5 transition">
                    <span className="text-emerald-500/50 text-xs font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{h.player_name}</span>
                        <span className="text-[9px] text-zinc-600 uppercase">{h.type === 'pitcher' ? 'P' : 'H'}</span>
                        <span className="text-[10px] font-mono text-emerald-400 ml-auto shrink-0">
                          {h.sigma > 0 ? '+' : ''}{h.sigma.toFixed(1)}σ
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{h.reason}</p>
                    </div>
                  </div>
                ))}
                {highlights.surges.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-xs">No surges detected</div>
                )}
              </div>
            </div>
            {/* Concerns */}
            <div className="bg-zinc-900 border border-red-500/20 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-red-500/10 flex items-center gap-2">
                <span className="text-red-400 text-sm font-semibold">Concerns</span>
                <span className="text-[10px] text-zinc-600">Notable declines to watch</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {highlights.concerns.map((h, i) => (
                  <div key={h.player_id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-red-500/5 transition">
                    <span className="text-red-500/50 text-xs font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{h.player_name}</span>
                        <span className="text-[9px] text-zinc-600 uppercase">{h.type === 'pitcher' ? 'P' : 'H'}</span>
                        <span className="text-[10px] font-mono text-red-400 ml-auto shrink-0">
                          {h.sigma > 0 ? '+' : ''}{h.sigma.toFixed(1)}σ
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{h.reason}</p>
                    </div>
                  </div>
                ))}
                {highlights.concerns.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-xs">No concerns detected</div>
                )}
              </div>
            </div>
          </div>
        )}

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
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Player Type</label>
              <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
                {PLAYER_TYPES.map(t => (
                  <button key={t} onClick={() => setPlayerType(t)}
                    className={`px-3 py-1.5 text-xs rounded transition capitalize ${playerType === t ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                    {t === 'pitcher' ? 'Pitchers' : 'Hitters'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Min Pitches</label>
              <input value={minPitches} onChange={e => setMinPitches(e.target.value)} type="number"
                className="h-9 w-20 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none" />
            </div>
            <button onClick={handleScan} disabled={loading}
              className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded transition">
              {loading ? 'Scanning...' : 'Scan'}
            </button>
          </div>
          {recentDate && (
            <div className="mt-2 text-[10px] text-zinc-600">
              Comparing season avg vs last 14 days ({recentDate} to {latestDate})
            </div>
          )}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm mb-4">{error}</div>}

        {/* Alert table */}
        {alerts.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400 font-medium">
              {alerts.length} alerts found <span className="text-zinc-600 ml-1">(|sigma| &gt; 1.5)</span>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-zinc-800/40 text-zinc-500">
                  <th className="px-3 py-1.5 text-left font-medium">Player</th>
                  <th className="px-3 py-1.5 text-left font-medium">Metric</th>
                  <th className="px-3 py-1.5 text-right font-medium">Season Avg</th>
                  <th className="px-3 py-1.5 text-right font-medium">Recent (14d)</th>
                  <th className="px-3 py-1.5 text-right font-medium">Delta</th>
                  <th className="px-3 py-1.5 text-center font-medium">Sigma</th>
                  <th className="px-3 py-1.5 text-center font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a, i) => (
                  <tr key={`${a.player_id}-${a.metric}`}
                    className={`border-t border-zinc-800/30 ${sigmaColor(a.sigma, a.sentiment)}`}>
                    <td className="px-3 py-1.5 text-white font-medium">{a.player_name}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{a.metric_label}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{fmtVal(a.metric, a.season_val)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white">{fmtVal(a.metric, a.recent_val)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${a.sentiment === 'good' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {a.delta > 0 ? '+' : ''}{a.metric === 'xwoba' ? a.delta.toFixed(3) : a.metric === 'spin' ? Math.round(a.delta) : a.delta.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-white font-medium">
                      {a.sigma > 0 ? '+' : ''}{a.sigma.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        a.sentiment === 'good' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {a.direction === 'up' ? '↑' : '↓'}
                        {a.sentiment === 'good' ? 'Surge' : 'Concern'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && alerts.length === 0 && !error && (
          <div className="text-center py-20 text-zinc-600 text-sm">
            Click Scan to detect players with significant recent performance changes.
          </div>
        )}
      </div>
    </div>
  )
}
