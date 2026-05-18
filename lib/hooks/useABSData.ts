'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

// --- Types ---

export interface FilterCombo { year: number; game_type: string; level: string }
export interface DailyRow {
  game_date: string; challenges: number; overturns: number
  overturn_rate: number | null; tot_pitches: number; chal_rate: number | null
  rolling_overturn_rate_week: number | null; rolling_chal_rate_week: number | null
}
export interface BreakdownRow {
  source: string; breakdown_key: string; challenges: number
  overturns: number; rate: number | null; pitches: number; chal_rate: number | null
}
export interface TeamRow {
  team_abbr: string; bat_for: number; fld_for: number
  bat_against: number; fld_against: number
}
export interface Summary {
  challenges: number; overturns: number; overturn_rate: number
  chal_rate: number; pitches: number
}
export interface PlayerRow {
  player_id: number; player_name: string; team_abbr: string
  n_total_sample: number; n_challenges: number; n_overturns: number; n_fails: number
  n_strikeouts: number; n_walks: number
  rate_challenges: number | null; exp_rate_challenges: number | null
  rate_overturns: number | null; exp_rate_overturns: number | null
  exp_chal: number | null; net_net_chal: number | null; overturns_vs_exp: number | null
  n_challenges_against: number; n_overturns_against: number
  rate_overturns_against: number | null; net_net_chal_against: number | null
}
export interface DashboardData {
  daily: { all: DailyRow[]; batter: DailyRow[]; fielder: DailyRow[] }
  breakdown: { batter: BreakdownRow[]; fielder: BreakdownRow[]; all: BreakdownRow[] }
  teams: TeamRow[]
  summary: Summary
}

export interface UmpireRow {
  hp_umpire: string; games: number; called_pitches: number
  missed_calls: number; miss_rate: number | null
  bad_strikes: number; bad_balls: number
  non_shadow_pitches: number; non_shadow_missed: number; non_shadow_miss_rate: number | null
  challenges: number; overturns: number; overturn_rate: number | null
  abs_challenges: number; abs_overturns: number
}

export type Tab = 'daily' | 'breakdowns' | 'teams' | 'leaderboard' | 'umpires'
export type DailySource = 'all' | 'batter' | 'fielder'
export type TeamSortField = 'team_abbr' | 'bat_for' | 'fld_for' | 'total_for' | 'bat_against' | 'fld_against' | 'total_against' | 'total' | 'net'
export type UmpireSortField = 'hp_umpire' | 'games' | 'called_pitches' | 'missed_calls' | 'miss_rate' | 'bad_strikes' | 'bad_balls' | 'non_shadow_missed' | 'non_shadow_miss_rate' | 'challenges' | 'overturns' | 'overturn_rate'
export type PlayerSortField = 'player_name' | 'n_challenges' | 'n_overturns' | 'n_fails' | 'rate_overturns' | 'exp_rate_overturns' | 'overturns_vs_exp' | 'net_net_chal'

export const GAME_TYPES = [
  { value: 'S', label: 'Spring Training' },
  { value: 'R', label: 'Regular Season' },
  { value: 'P', label: 'Postseason' },
]
export const LEVELS = [
  { value: 'MLB', label: 'MLB' },
  { value: 'AAA', label: 'AAA' },
]
export const TABS: { key: Tab; label: string }[] = [
  { key: 'daily', label: 'Daily Trends' },
  { key: 'breakdowns', label: 'Breakdowns' },
  { key: 'teams', label: 'Teams' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'umpires', label: 'Umpires' },
]

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return '\u2014'
  return (v * 100).toFixed(digits) + '%'
}

export function rateColor(rate: number | null): string {
  if (rate == null) return 'text-zinc-400'
  if (rate >= 0.5) return 'text-emerald-400'
  if (rate >= 0.3) return 'text-yellow-400'
  return 'text-red-400'
}

export function vsExpColor(val: number | null): string {
  if (val == null) return 'text-zinc-400'
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-zinc-400'
}

export function missRateColor(rate: number | null): string {
  if (rate == null) return 'text-zinc-400'
  if (rate <= 0.05) return 'text-emerald-400'
  if (rate <= 0.08) return 'text-yellow-400'
  return 'text-red-400'
}

export function sortArrow(current: string, field: string, dir: 'asc' | 'desc') {
  if (current !== field) return ''
  return dir === 'desc' ? ' \u25BC' : ' \u25B2'
}

function api(action: string, params: Record<string, unknown> = {}) {
  return fetch('/api/abs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  }).then(r => r.json())
}

export function useABSData() {
  const queryClient = useQueryClient()
  const [year, setYear] = useState(2026)
  const [gameType, setGameType] = useState('S')
  const [level, setLevel] = useState('MLB')
  const [tab, setTab] = useState<Tab>('daily')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // Daily tab
  const [dailySource, setDailySource] = useState<DailySource>('all')

  // Teams tab
  const [teamSort, setTeamSort] = useState<TeamSortField>('net')
  const [teamDir, setTeamDir] = useState<'asc' | 'desc'>('desc')

  // Leaderboard tab
  const [challengeType, setChallengeType] = useState('batter')
  const [minChal, setMinChal] = useState(1)
  const [playerSort, setPlayerSort] = useState<PlayerSortField>('n_challenges')
  const [playerDir, setPlayerDir] = useState<'asc' | 'desc'>('desc')

  // Umpires tab
  const [umpireSort, setUmpireSort] = useState<UmpireSortField>('missed_calls')
  const [umpireDir, setUmpireDir] = useState<'asc' | 'desc'>('desc')
  const [minGames, setMinGames] = useState(1)
  const [umpireYear, setUmpireYear] = useState(new Date().getFullYear())
  const [umpireGameType, setUmpireGameType] = useState('R')

  // Filters query
  const { data: filters = [] } = useQuery({
    queryKey: queryKeys.absFilters(),
    queryFn: async () => {
      const d = await api('filters')
      return Array.isArray(d) ? (d as FilterCombo[]) : []
    },
    staleTime: Infinity,
  })

  const years = useMemo(() => {
    const s = new Set(filters.map(f => f.year))
    return Array.from(s).sort((a, b) => b - a)
  }, [filters])

  // Dashboard query
  const { data = null, isLoading: loading } = useQuery({
    queryKey: queryKeys.absDashboard(year, gameType, level),
    queryFn: async () => {
      const d = await api('dashboard', { year, gameType, level })
      return d.error ? null : (d as DashboardData)
    },
  })

  // Leaderboard query
  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: queryKeys.absLeaderboard({ year, gameType, level, challengeType, minChal }),
    queryFn: async () => {
      const d = await api('leaderboard', { year, gameType, level, challengeType, minChal })
      return Array.isArray(d) ? (d as PlayerRow[]) : []
    },
    enabled: tab === 'leaderboard',
  })

  // Umpires query
  const { data: umpires = [], isLoading: umpiresLoading } = useQuery({
    queryKey: queryKeys.absUmpires({ year: umpireYear, gameType: umpireGameType, minGames }),
    queryFn: async () => {
      const d = await api('umpires', { year: umpireYear, gameType: umpireGameType, minGames })
      return Array.isArray(d) ? (d as UmpireRow[]) : []
    },
    enabled: tab === 'umpires',
  })

  // Sync
  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const d = await api('sync', { year, gameType, level })
      if (d.error) { setSyncMsg(`Error: ${d.error}`); return }
      setSyncMsg(`Synced: ${d.daily} daily, ${d.breakdowns} breakdowns, ${d.teams} teams`)
      queryClient.invalidateQueries({ queryKey: ['abs'] })
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [year, gameType, level, queryClient])

  // Team sort
  function handleTeamSort(field: TeamSortField) {
    if (teamSort === field) setTeamDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setTeamSort(field); setTeamDir('desc') }
  }
  const sortedTeams = useMemo(() => {
    if (!data) return []
    return [...data.teams].sort((a, b) => {
      const mul = teamDir === 'desc' ? -1 : 1
      const getVal = (r: TeamRow): number | string => {
        if (teamSort === 'team_abbr') return r.team_abbr
        if (teamSort === 'total_for') return r.bat_for + r.fld_for
        if (teamSort === 'total_against') return r.bat_against + r.fld_against
        if (teamSort === 'total') return r.bat_for + r.fld_for + r.bat_against + r.fld_against
        if (teamSort === 'net') return (r.bat_for + r.fld_for) - (r.bat_against + r.fld_against)
        return r[teamSort] as number
      }
      const av = getVal(a), bv = getVal(b)
      if (typeof av === 'string') return av.localeCompare(bv as string) * mul
      return ((av as number) - (bv as number)) * mul
    })
  }, [data, teamSort, teamDir])

  // Player sort
  function handlePlayerSort(field: PlayerSortField) {
    if (playerSort === field) setPlayerDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setPlayerSort(field); setPlayerDir('desc') }
  }
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const mul = playerDir === 'desc' ? -1 : 1
      const av = a[playerSort], bv = b[playerSort]
      if (typeof av === 'string') return (av || '').localeCompare((bv as string) || '') * mul
      return ((av as number || 0) - (bv as number || 0)) * mul
    })
  }, [players, playerSort, playerDir])

  // Umpire sort
  function handleUmpireSort(field: UmpireSortField) {
    if (umpireSort === field) setUmpireDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setUmpireSort(field); setUmpireDir('desc') }
  }
  const sortedUmpires = useMemo(() => {
    return [...umpires].sort((a, b) => {
      const mul = umpireDir === 'desc' ? -1 : 1
      const av = a[umpireSort], bv = b[umpireSort]
      if (typeof av === 'string') return (av || '').localeCompare((bv as string) || '') * mul
      return ((av as number || 0) - (bv as number || 0)) * mul
    })
  }, [umpires, umpireSort, umpireDir])

  const summary = data?.summary

  return {
    // Filters / state
    filters, years,
    year, setYear,
    gameType, setGameType,
    level, setLevel,
    tab, setTab,
    data, loading,
    syncing, syncMsg,
    summary,
    // Daily
    dailySource, setDailySource,
    // Teams
    teamSort, teamDir, handleTeamSort, sortedTeams,
    // Leaderboard
    challengeType, setChallengeType,
    minChal, setMinChal,
    players: sortedPlayers, playersLoading,
    playerSort, playerDir, handlePlayerSort,
    // Umpires
    umpires: sortedUmpires, umpiresLoading,
    umpireSort, umpireDir, handleUmpireSort,
    minGames, setMinGames,
    umpireYear, setUmpireYear,
    umpireGameType, setUmpireGameType,
    // Actions
    handleSync,
  }
}
