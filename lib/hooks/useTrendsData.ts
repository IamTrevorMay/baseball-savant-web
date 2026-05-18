'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { postJson, fetchJson } from '@/lib/queries/fetchers'

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

function pickUnique(list: Highlight[], n: number): Highlight[] {
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

export function useTrendsData() {
  const [season, setSeason] = useState(String(CURRENT_YEAR))
  const [playerType, setPlayerType] = useState<'pitcher' | 'hitter'>('pitcher')
  const [minPitches, setMinPitches] = useState(new Date().getMonth() + 1 <= 4 ? '50' : '500')
  const [trendTab, setTrendTab] = useState<'overview' | 'stuff' | 'arsenal'>('overview')

  // Scan state (user-triggered, stays as local state)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [recentDate, setRecentDate] = useState('')
  const [latestDate, setLatestDate] = useState('')

  // Daily highlights query
  const { data: daily = null, isLoading: dailyLoading } = useQuery({
    queryKey: queryKeys.dailyHighlights(),
    queryFn: async () => {
      const d = await fetchJson<DailyHighlights & { error?: string }>('/api/daily-highlights')
      if (d.error) return null
      return d
    },
    staleTime: 10 * 60 * 1000,
  })

  // Trend highlights (surges/concerns) query
  const { data: highlights = null, isLoading: highlightsLoading } = useQuery({
    queryKey: queryKeys.trendsHighlights(),
    queryFn: async () => {
      const month = new Date().getMonth() + 1
      const autoMinPitches = month <= 4 ? 50 : 500
      const [pd, hd] = await Promise.all([
        postJson<{ rows?: Alert[]; recentDate?: string; latestDate?: string }>('/api/trends', {
          season: CURRENT_YEAR, playerType: 'pitcher', minPitches: autoMinPitches,
        }),
        postJson<{ rows?: Alert[] }>('/api/trends', {
          season: CURRENT_YEAR, playerType: 'hitter', minPitches: autoMinPitches,
        }),
      ])

      const pitcherAlerts: Alert[] = (pd.rows || []).map((a: Alert) => ({ ...a }))
      const hitterAlerts: Alert[] = (hd.rows || []).map((a: Alert) => ({ ...a }))

      const all: Highlight[] = [
        ...pitcherAlerts.map(a => ({ ...a, type: 'pitcher' as const, reason: buildReason(a) })),
        ...hitterAlerts.map(a => ({ ...a, type: 'hitter' as const, reason: buildReason(a) })),
      ]

      const surgeAll = all.filter(a => a.sentiment === 'good').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))
      const concernAll = all.filter(a => a.sentiment === 'bad').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))

      // Update recentDate/latestDate from response
      if (pd.recentDate) {
        setRecentDate(pd.recentDate)
        setLatestDate(pd.latestDate || '')
      }

      return {
        surges: pickUnique(surgeAll, 5),
        concerns: pickUnique(concernAll, 5),
      }
    },
    staleTime: 10 * 60 * 1000,
  })

  // Stuff tab query
  const { data: stuffData = null, isLoading: stuffLoading } = useQuery<any>({
    queryKey: queryKeys.trendsTab(season, 'stuff', minPitches),
    queryFn: () => postJson('/api/trends', {
      season: Number(season), tab: 'stuff', minPitches: parseInt(minPitches) || 50,
    }),
    enabled: trendTab === 'stuff',
    staleTime: Infinity,
  })

  // Arsenal tab query
  const { data: arsenalData = null, isLoading: arsenalLoading } = useQuery<any>({
    queryKey: queryKeys.trendsTab(season, 'arsenal', minPitches),
    queryFn: () => postJson('/api/trends', {
      season: Number(season), tab: 'arsenal', minPitches: parseInt(minPitches) || 50,
    }),
    enabled: trendTab === 'arsenal',
    staleTime: Infinity,
  })

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
