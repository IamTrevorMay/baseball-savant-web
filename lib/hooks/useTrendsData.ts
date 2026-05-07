'use client'

import { useState, useCallback, useEffect } from 'react'

const CURRENT_YEAR = new Date().getFullYear()
const SEASONS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => String(CURRENT_YEAR - i))
const PLAYER_TYPES = ['pitcher', 'hitter'] as const

export interface Alert {
  player_id: number; player_name: string
  metric: string; metric_label: string
  season_val: number; recent_val: number
  delta: number; sigma: number
  direction: 'up' | 'down'
  sentiment: 'good' | 'bad'
}

export interface GameLine {
  ip: string; h: number; r: number; er: number; bb: number; k: number
  pitches: number; decision: string
}

export interface DailyHighlights {
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

export interface Highlight extends Alert {
  type: 'pitcher' | 'hitter'
  reason: string
}

function buildReason(a: Alert): string {
  const d = fmtDelta(a.metric, a.delta)
  const verb = a.direction === 'up' ? 'up' : 'down'
  return `${a.metric_label} ${verb} ${d} vs season avg`
}

export function fmtDelta(key: string, delta: number): string {
  const abs = Math.abs(delta)
  if (key === 'xwoba') return abs.toFixed(3)
  if (key === 'spin') return String(Math.round(abs))
  if (key === 'velo' || key === 'ev') return abs.toFixed(1) + ' mph'
  return abs.toFixed(1) + ' pts'
}

export function fmtVal(key: string, val: number): string {
  if (key === 'xwoba') return val.toFixed(3)
  if (key === 'spin') return String(Math.round(val))
  if (key === 'velo' || key === 'ev') return val.toFixed(1)
  return val.toFixed(1) + '%'
}

export function plusColor(val: number) {
  if (val >= 130) return 'text-emerald-400'
  if (val >= 115) return 'text-emerald-500'
  if (val >= 100) return 'text-zinc-200'
  if (val >= 85) return 'text-orange-400'
  return 'text-red-400'
}

export function sigmaColor(sigma: number, sentiment: string): string {
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

export function headshot(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

export function fmtGameLine(gl: GameLine): string {
  return `${gl.ip} IP, ${gl.h} H, ${gl.er} ER, ${gl.bb} BB, ${gl.k} K`
}

export { CURRENT_YEAR, SEASONS, PLAYER_TYPES }

export function useTrendsData() {
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

  // Auto-load highlights on mount
  useEffect(() => {
    let cancelled = false
    async function loadHighlights() {
      try {
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

        const all: Highlight[] = [
          ...pitcherAlerts.map(a => ({ ...a, type: 'pitcher' as const, reason: buildReason(a) })),
          ...hitterAlerts.map(a => ({ ...a, type: 'hitter' as const, reason: buildReason(a) })),
        ]

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
        // Silently fail
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

  return {
    // Constants
    SEASONS,
    PLAYER_TYPES,
    // State
    season, setSeason,
    playerType, setPlayerType,
    minPitches, setMinPitches,
    loading, error,
    alerts,
    recentDate, latestDate,
    highlights, highlightsLoading,
    daily, dailyLoading,
    trendTab, setTrendTab,
    stuffData, stuffLoading,
    arsenalData, arsenalLoading,
    // Derived
    playerGroups,
    // Actions
    handleScan,
  }
}
