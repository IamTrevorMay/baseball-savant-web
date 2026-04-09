'use client'
import { useState, useCallback, useEffect } from 'react'
import ResearchNav from '@/components/ResearchNav'

const CURRENT_YEAR = new Date().getFullYear()
const SEASONS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => String(CURRENT_YEAR - i))
const PLAYER_TYPES = ['pitcher', 'hitter'] as const

interface Alert {
  player_id: number; player_name: string
  metric: string; metric_label: string
  season_val: number; recent_val: number
  delta: number; sigma: number
  direction: 'up' | 'down'
  sentiment: 'good' | 'bad'
}

interface GameLine {
  ip: string; h: number; r: number; er: number; bb: number; k: number
  pitches: number; decision: string
}

interface DailyHighlights {
  date: string
  stuff_starter: { player_id: number; player_name: string; team: string; pitch_name: string; stuff_plus: number; velo: number | null; hbreak_in: number | null; ivb_in: number | null; game_line: GameLine | null } | null
  stuff_reliever: { player_id: number; player_name: string; team: string; pitch_name: string; stuff_plus: number; velo: number | null; hbreak_in: number | null; ivb_in: number | null; game_line: GameLine | null } | null
  cmd_starter: { player_id: number; player_name: string; team: string; cmd_plus: number; pitches: number; game_line: GameLine | null } | null
  cmd_reliever: { player_id: number; player_name: string; team: string; cmd_plus: number; pitches: number; game_line: GameLine | null } | null
  new_pitches: Array<{
    player_id: number; player_name: string; team: string; pitch_name: string; count: number
    avg_hbreak: number | null; avg_ivb: number | null; avg_stuff_plus: number | null
    avg_brink: number | null; avg_cluster: number | null; avg_missfire: number | null; cmd_plus: number | null
  }>
}

function headshot(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

function plusColor(val: number) {
  if (val >= 130) return 'text-emerald-400'
  if (val >= 115) return 'text-emerald-500'
  if (val >= 100) return 'text-zinc-200'
  if (val >= 85) return 'text-orange-400'
  return 'text-red-400'
}

function fmtGameLine(gl: GameLine): string {
  return `${gl.ip} IP, ${gl.h} H, ${gl.er} ER, ${gl.bb} BB, ${gl.k} K`
}

function decisionBadge(d: string) {
  if (d === 'W') return <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-1 py-0.5 rounded">W</span>
  if (d === 'L') return <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1 py-0.5 rounded">L</span>
  if (d === 'SV') return <span className="text-[9px] font-bold text-sky-400 bg-sky-500/15 px-1 py-0.5 rounded">SV</span>
  if (d === 'HLD') return <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded">HLD</span>
  return null
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
  const [season, setSeason] = useState(String(CURRENT_YEAR))
  const [playerType, setPlayerType] = useState<'pitcher' | 'hitter'>('pitcher')
  const [minPitches, setMinPitches] = useState(new Date().getMonth() + 1 <= 4 ? '50' : '500')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [recentDate, setRecentDate] = useState('')
  const [latestDate, setLatestDate] = useState('')
  const [highlights, setHighlights] = useState<{ surges: Highlight[]; concerns: Highlight[] } | null>(null)
  const [highlightsLoading, setHighlightsLoading] = useState(true)
  const [daily, setDaily] = useState<DailyHighlights | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [trendTab, setTrendTab] = useState<'overview' | 'stuff' | 'arsenal'>('overview')
  const [stuffData, setStuffData] = useState<any>(null)
  const [stuffLoading, setStuffLoading] = useState(false)
  const [arsenalData, setArsenalData] = useState<any>(null)
  const [arsenalLoading, setArsenalLoading] = useState(false)

  // Load Stuff+ data when tab changes
  useEffect(() => {
    if (trendTab !== 'stuff' || stuffData) return
    setStuffLoading(true)
    fetch('/api/trends', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: Number(season), tab: 'stuff', minPitches: parseInt(minPitches) || 50 }),
    }).then(r => r.json()).then(d => setStuffData(d)).catch(() => {}).finally(() => setStuffLoading(false))
  }, [trendTab, season])

  // Load Arsenal data when tab changes
  useEffect(() => {
    if (trendTab !== 'arsenal' || arsenalData) return
    setArsenalLoading(true)
    fetch('/api/trends', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: Number(season), tab: 'arsenal', minPitches: parseInt(minPitches) || 50 }),
    }).then(r => r.json()).then(d => setArsenalData(d)).catch(() => {}).finally(() => setArsenalLoading(false))
  }, [trendTab, season])

  // Auto-load daily highlights
  useEffect(() => {
    let cancelled = false
    fetch('/api/daily-highlights')
      .then(r => r.json())
      .then(d => { if (!cancelled && !d.error) setDaily(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDailyLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Auto-load highlights on mount — fetch both pitcher and hitter trends
  useEffect(() => {
    let cancelled = false
    async function loadHighlights() {
      try {
        // Use lower threshold early in season (before May)
        const month = new Date().getMonth() + 1
        const autoMinPitches = month <= 4 ? 50 : 500
        const [pitcherRes, hitterRes] = await Promise.all([
          fetch('/api/trends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ season: CURRENT_YEAR, playerType: 'pitcher', minPitches: autoMinPitches }),
          }),
          fetch('/api/trends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ season: CURRENT_YEAR, playerType: 'hitter', minPitches: autoMinPitches }),
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
        <p className="text-xs text-zinc-500 mb-3">Detect significant recent performance changes vs season averages</p>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-4">
          {([['overview', 'Overview'], ['stuff', 'Stuff+'], ['arsenal', 'Arsenal']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTrendTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${trendTab === key ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {trendTab === 'overview' && <>
        {/* Daily Highlights — previous day standouts */}
        {dailyLoading && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 animate-pulse">
                <div className="h-3 w-16 bg-zinc-800 rounded mb-3" />
                <div className="flex gap-2 items-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-20 bg-zinc-800 rounded" />
                    <div className="h-2.5 w-14 bg-zinc-800/60 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {daily && !dailyLoading && (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-sm font-semibold text-white">Yesterday&apos;s Standouts</h2>
              <span className="text-[10px] text-zinc-600">{daily.date}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {/* Best Stuff+ Starter */}
              {daily.stuff_starter && (
                <a href={`/player/${daily.stuff_starter.player_id}`}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition group">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="text-amber-400">Stuff+</span> Starter
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <img src={headshot(daily.stuff_starter.player_id)} alt=""
                      className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate group-hover:text-emerald-400 transition">
                        {daily.stuff_starter.player_name}
                      </div>
                      <div className="text-[10px] text-zinc-500">{daily.stuff_starter.team} · {daily.stuff_starter.pitch_name}</div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className={`text-lg font-bold font-mono ${plusColor(daily.stuff_starter.stuff_plus)}`}>
                          {daily.stuff_starter.stuff_plus}
                        </span>
                        <span className="text-[9px] text-zinc-600">
                          {daily.stuff_starter.velo && `${daily.stuff_starter.velo} mph`}
                        </span>
                      </div>
                      {daily.stuff_starter.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-1 flex items-center gap-1">
                          {decisionBadge(daily.stuff_starter.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.stuff_starter.game_line)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              )}

              {/* Best Stuff+ Reliever */}
              {daily.stuff_reliever && (
                <a href={`/player/${daily.stuff_reliever.player_id}`}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition group">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="text-amber-400">Stuff+</span> Reliever
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <img src={headshot(daily.stuff_reliever.player_id)} alt=""
                      className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate group-hover:text-emerald-400 transition">
                        {daily.stuff_reliever.player_name}
                      </div>
                      <div className="text-[10px] text-zinc-500">{daily.stuff_reliever.team} · {daily.stuff_reliever.pitch_name}</div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className={`text-lg font-bold font-mono ${plusColor(daily.stuff_reliever.stuff_plus)}`}>
                          {daily.stuff_reliever.stuff_plus}
                        </span>
                        <span className="text-[9px] text-zinc-600">
                          {daily.stuff_reliever.velo && `${daily.stuff_reliever.velo} mph`}
                        </span>
                      </div>
                      {daily.stuff_reliever.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-1 flex items-center gap-1">
                          {decisionBadge(daily.stuff_reliever.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.stuff_reliever.game_line)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              )}

              {/* Best Cmd+ Starter */}
              {daily.cmd_starter && (
                <a href={`/player/${daily.cmd_starter.player_id}`}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition group">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="text-sky-400">Cmd+</span> Starter
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <img src={headshot(daily.cmd_starter.player_id)} alt=""
                      className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate group-hover:text-emerald-400 transition">
                        {daily.cmd_starter.player_name}
                      </div>
                      <div className="text-[10px] text-zinc-500">{daily.cmd_starter.team} · {daily.cmd_starter.pitches} pitches</div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className={`text-lg font-bold font-mono ${plusColor(daily.cmd_starter.cmd_plus)}`}>
                          {daily.cmd_starter.cmd_plus}
                        </span>
                      </div>
                      {daily.cmd_starter.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-1 flex items-center gap-1">
                          {decisionBadge(daily.cmd_starter.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.cmd_starter.game_line)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              )}

              {/* Best Cmd+ Reliever */}
              {daily.cmd_reliever && (
                <a href={`/player/${daily.cmd_reliever.player_id}`}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition group">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="text-sky-400">Cmd+</span> Reliever
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <img src={headshot(daily.cmd_reliever.player_id)} alt=""
                      className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate group-hover:text-emerald-400 transition">
                        {daily.cmd_reliever.player_name}
                      </div>
                      <div className="text-[10px] text-zinc-500">{daily.cmd_reliever.team} · {daily.cmd_reliever.pitches} pitches</div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className={`text-lg font-bold font-mono ${plusColor(daily.cmd_reliever.cmd_plus)}`}>
                          {daily.cmd_reliever.cmd_plus}
                        </span>
                      </div>
                      {daily.cmd_reliever.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-1 flex items-center gap-1">
                          {decisionBadge(daily.cmd_reliever.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.cmd_reliever.game_line)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              )}

              {/* New Pitch Alert — show first one as card, or empty state */}
              {daily.new_pitches.length > 0 ? (
                <a href={`/player/${daily.new_pitches[0].player_id}`}
                  className="bg-zinc-900 border border-orange-500/20 rounded-lg p-3 hover:border-orange-500/30 transition group">
                  <div className="text-[9px] text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    New Pitch Alert
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <img src={headshot(daily.new_pitches[0].player_id)} alt=""
                      className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate group-hover:text-emerald-400 transition">
                        {daily.new_pitches[0].player_name}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {daily.new_pitches[0].team} · {daily.new_pitches[0].pitch_name} ({daily.new_pitches[0].count}×)
                      </div>
                      {daily.new_pitches[0].avg_stuff_plus != null && (
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Stuff+ <span className={`font-mono font-medium ${plusColor(daily.new_pitches[0].avg_stuff_plus)}`}>{daily.new_pitches[0].avg_stuff_plus}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-3 flex flex-col min-h-[100px]">
                  <div className="text-[9px] text-orange-400/40 uppercase tracking-wider mb-2">New Pitch Alert</div>
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[11px] text-zinc-600">No new pitches for today</span>
                  </div>
                </div>
              )}
            </div>

            {/* Expanded new pitch alerts table */}
            {daily.new_pitches.length > 0 && (
              <div className="bg-zinc-900 border border-orange-500/10 rounded-lg overflow-hidden mb-6">
                <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                  <span className="text-orange-400 text-xs font-semibold">New Pitch Alerts</span>
                  <span className="text-[10px] text-zinc-600">Pitch types never thrown before · {daily.date}</span>
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-zinc-800/40 text-zinc-500">
                      <th className="px-3 py-1.5 text-left font-medium">Pitcher</th>
                      <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                      <th className="px-3 py-1.5 text-right font-medium">Count</th>
                      <th className="px-3 py-1.5 text-right font-medium">HBreak</th>
                      <th className="px-3 py-1.5 text-right font-medium">IVB</th>
                      <th className="px-3 py-1.5 text-right font-medium">Stuff+</th>
                      <th className="px-3 py-1.5 text-right font-medium">Brink</th>
                      <th className="px-3 py-1.5 text-right font-medium">Cluster</th>
                      <th className="px-3 py-1.5 text-right font-medium">Missfire</th>
                      <th className="px-3 py-1.5 text-right font-medium">Cmd+</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.new_pitches.map((np) => (
                      <tr key={`${np.player_id}-${np.pitch_name}`} className="border-t border-zinc-800/30 hover:bg-orange-500/5 transition">
                        <td className="px-3 py-1.5">
                          <a href={`/player/${np.player_id}`} className="flex items-center gap-2 text-white font-medium hover:text-emerald-400 transition">
                            <img src={headshot(np.player_id)} alt="" className="w-6 h-6 rounded-full object-cover bg-zinc-800" />
                            {np.player_name}
                            <span className="text-[9px] text-zinc-600 font-normal">{np.team}</span>
                          </a>
                        </td>
                        <td className="px-3 py-1.5 text-orange-300 font-medium">{np.pitch_name}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{np.count}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{np.avg_hbreak != null ? `${np.avg_hbreak}"` : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{np.avg_ivb != null ? `${np.avg_ivb}"` : '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-medium ${np.avg_stuff_plus != null ? plusColor(np.avg_stuff_plus) : 'text-zinc-600'}`}>
                          {np.avg_stuff_plus ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{np.avg_brink != null ? np.avg_brink.toFixed(1) : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{np.avg_cluster != null ? np.avg_cluster.toFixed(1) : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{np.avg_missfire != null ? np.avg_missfire.toFixed(1) : '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-medium ${np.cmd_plus != null ? plusColor(np.cmd_plus) : 'text-zinc-600'}`}>
                          {np.cmd_plus ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

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
        </>}

        {/* Stuff+ Tab */}
        {trendTab === 'stuff' && (
          <div className="space-y-6">
            {stuffLoading ? (
              <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" /></div>
            ) : stuffData ? (<>
              {/* Leaders */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <h2 className="text-sm font-semibold text-white">Stuff+ Leaders</h2>
                  <p className="text-[10px] text-zinc-500">Top 25 by average Stuff+ ({stuffData.recentDate} – {stuffData.latestDate})</p>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-zinc-800/40 text-zinc-500">
                    <th className="px-3 py-1.5 text-left font-medium w-8">#</th>
                    <th className="px-3 py-1.5 text-left font-medium">Player</th>
                    <th className="px-3 py-1.5 text-right font-medium">Pitches</th>
                    <th className="px-3 py-1.5 text-right font-medium">Avg Stuff+</th>
                  </tr></thead>
                  <tbody>
                    {(stuffData.leaders || []).map((r: any, i: number) => (
                      <tr key={r.player_id} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
                        <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
                        <td className="px-3 py-1.5"><a href={`/player/${r.player_id}`} className="text-emerald-400 hover:text-emerald-300 font-medium">{r.player_name}</a></td>
                        <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{Number(r.pitches).toLocaleString()}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold tabular-nums ${plusColor(Number(r.avg_stuff_plus))}`}>{r.avg_stuff_plus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Gainers & Losers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gainers */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-emerald-400">Biggest Stuff+ Gainers</h2>
                    <p className="text-[10px] text-zinc-500">Recent vs season avg by pitch type</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="bg-zinc-800/40 text-zinc-500">
                      <th className="px-3 py-1.5 text-left font-medium">Player</th>
                      <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                      <th className="px-3 py-1.5 text-right font-medium">Season</th>
                      <th className="px-3 py-1.5 text-right font-medium">Recent</th>
                      <th className="px-3 py-1.5 text-right font-medium">Delta</th>
                    </tr></thead>
                    <tbody>
                      {(stuffData.gainers || []).map((r: any, i: number) => (
                        <tr key={`${r.player_id}-${r.pitch_name}`} className="border-t border-zinc-800/30">
                          <td className="px-3 py-1.5"><a href={`/player/${r.player_id}`} className="text-white hover:text-emerald-300 font-medium">{r.player_name}</a></td>
                          <td className="px-3 py-1.5 text-zinc-400">{r.pitch_name}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{r.season_stuff}</td>
                          <td className="px-3 py-1.5 text-right text-white tabular-nums font-medium">{r.recent_stuff}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-400 tabular-nums font-bold">+{r.delta}</td>
                        </tr>
                      ))}
                      {(!stuffData.gainers || stuffData.gainers.length === 0) && <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600">No significant gainers</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Losers */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-red-400">Biggest Stuff+ Drops</h2>
                    <p className="text-[10px] text-zinc-500">Recent vs season avg by pitch type</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="bg-zinc-800/40 text-zinc-500">
                      <th className="px-3 py-1.5 text-left font-medium">Player</th>
                      <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                      <th className="px-3 py-1.5 text-right font-medium">Season</th>
                      <th className="px-3 py-1.5 text-right font-medium">Recent</th>
                      <th className="px-3 py-1.5 text-right font-medium">Delta</th>
                    </tr></thead>
                    <tbody>
                      {(stuffData.losers || []).map((r: any, i: number) => (
                        <tr key={`${r.player_id}-${r.pitch_name}`} className="border-t border-zinc-800/30">
                          <td className="px-3 py-1.5"><a href={`/player/${r.player_id}`} className="text-white hover:text-red-300 font-medium">{r.player_name}</a></td>
                          <td className="px-3 py-1.5 text-zinc-400">{r.pitch_name}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{r.season_stuff}</td>
                          <td className="px-3 py-1.5 text-right text-white tabular-nums font-medium">{r.recent_stuff}</td>
                          <td className="px-3 py-1.5 text-right text-red-400 tabular-nums font-bold">{r.delta}</td>
                        </tr>
                      ))}
                      {(!stuffData.losers || stuffData.losers.length === 0) && <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600">No significant drops</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>) : <div className="text-center py-20 text-zinc-600 text-sm">No Stuff+ data available</div>}
          </div>
        )}

        {/* Arsenal Tab */}
        {trendTab === 'arsenal' && (
          <div className="space-y-6">
            {arsenalLoading ? (
              <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" /></div>
            ) : arsenalData?.changes?.length > 0 ? (<>
              {/* Velocity Changes */}
              {(() => {
                const veloChanges = [...arsenalData.changes].filter((r: any) => Math.abs(r.velo_delta) >= 0.5).sort((a: any, b: any) => Math.abs(b.velo_delta) - Math.abs(a.velo_delta)).slice(0, 20)
                const moveChanges = [...arsenalData.changes].filter((r: any) => Math.abs(r.ivb_delta) >= 0.5 || Math.abs(r.hb_delta) >= 0.5).sort((a: any, b: any) => (Math.abs(b.ivb_delta) + Math.abs(b.hb_delta)) - (Math.abs(a.ivb_delta) + Math.abs(a.hb_delta))).slice(0, 20)
                const usageChanges = [...arsenalData.changes].filter((r: any) => Math.abs(r.usage_delta) >= 3).sort((a: any, b: any) => Math.abs(b.usage_delta) - Math.abs(a.usage_delta)).slice(0, 20)
                const deltaColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-zinc-400'
                const fmtDelta = (v: number, unit: string) => `${v > 0 ? '+' : ''}${v}${unit}`
                return (<>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800">
                      <h2 className="text-sm font-semibold text-white">Velocity Changes</h2>
                      <p className="text-[10px] text-zinc-500">Season vs recent window ({arsenalData.recentDate} – {arsenalData.latestDate})</p>
                    </div>
                    {veloChanges.length > 0 ? (
                      <table className="w-full text-xs"><thead><tr className="bg-zinc-800/40 text-zinc-500">
                        <th className="px-3 py-1.5 text-left font-medium">Player</th>
                        <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                        <th className="px-3 py-1.5 text-right font-medium">Season</th>
                        <th className="px-3 py-1.5 text-right font-medium">Recent</th>
                        <th className="px-3 py-1.5 text-right font-medium">Delta</th>
                      </tr></thead><tbody>
                        {veloChanges.map((r: any) => (
                          <tr key={`${r.player_id}-${r.pitch_name}-v`} className="border-t border-zinc-800/30">
                            <td className="px-3 py-1.5"><a href={`/player/${r.player_id}`} className="text-white hover:text-emerald-300 font-medium">{r.player_name}</a></td>
                            <td className="px-3 py-1.5 text-zinc-400">{r.pitch_name}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{r.season_velo}</td>
                            <td className="px-3 py-1.5 text-right text-white tabular-nums">{r.recent_velo}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${deltaColor(r.velo_delta)}`}>{fmtDelta(r.velo_delta, ' mph')}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    ) : <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant velocity changes</div>}
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800">
                      <h2 className="text-sm font-semibold text-white">Movement Changes</h2>
                      <p className="text-[10px] text-zinc-500">IVB and horizontal break shifts</p>
                    </div>
                    {moveChanges.length > 0 ? (
                      <table className="w-full text-xs"><thead><tr className="bg-zinc-800/40 text-zinc-500">
                        <th className="px-3 py-1.5 text-left font-medium">Player</th>
                        <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                        <th className="px-3 py-1.5 text-right font-medium">IVB Δ</th>
                        <th className="px-3 py-1.5 text-right font-medium">HB Δ</th>
                        <th className="px-3 py-1.5 text-right font-medium">Spin Δ</th>
                      </tr></thead><tbody>
                        {moveChanges.map((r: any) => (
                          <tr key={`${r.player_id}-${r.pitch_name}-m`} className="border-t border-zinc-800/30">
                            <td className="px-3 py-1.5"><a href={`/player/${r.player_id}`} className="text-white hover:text-emerald-300 font-medium">{r.player_name}</a></td>
                            <td className="px-3 py-1.5 text-zinc-400">{r.pitch_name}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${deltaColor(r.ivb_delta)}`}>{fmtDelta(r.ivb_delta, '"')}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${deltaColor(r.hb_delta)}`}>{fmtDelta(r.hb_delta, '"')}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${deltaColor(r.spin_delta)}`}>{fmtDelta(r.spin_delta, ' rpm')}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    ) : <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant movement changes</div>}
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800">
                      <h2 className="text-sm font-semibold text-white">Usage Changes</h2>
                      <p className="text-[10px] text-zinc-500">Pitch mix shifts (recent vs season)</p>
                    </div>
                    {usageChanges.length > 0 ? (
                      <table className="w-full text-xs"><thead><tr className="bg-zinc-800/40 text-zinc-500">
                        <th className="px-3 py-1.5 text-left font-medium">Player</th>
                        <th className="px-3 py-1.5 text-left font-medium">Pitch</th>
                        <th className="px-3 py-1.5 text-right font-medium">Season %</th>
                        <th className="px-3 py-1.5 text-right font-medium">Recent %</th>
                        <th className="px-3 py-1.5 text-right font-medium">Delta</th>
                      </tr></thead><tbody>
                        {usageChanges.map((r: any) => (
                          <tr key={`${r.player_id}-${r.pitch_name}-u`} className="border-t border-zinc-800/30">
                            <td className="px-3 py-1.5"><a href={`/player/${r.player_id}`} className="text-white hover:text-emerald-300 font-medium">{r.player_name}</a></td>
                            <td className="px-3 py-1.5 text-zinc-400">{r.pitch_name}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{r.season_usage}%</td>
                            <td className="px-3 py-1.5 text-right text-white tabular-nums">{r.recent_usage}%</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${deltaColor(r.usage_delta)}`}>{fmtDelta(r.usage_delta, '%')}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    ) : <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant usage changes</div>}
                  </div>
                </>)
              })()}
            </>) : <div className="text-center py-20 text-zinc-600 text-sm">{arsenalLoading ? '' : 'No arsenal data available'}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
