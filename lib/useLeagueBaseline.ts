'use client'

/**
 * useLeagueBaseline — small client hook that fetches the league_averages
 * baseline (mean + sample stddev) for a (season, level, role, metric)
 * combination. Heatmap consumers use this to center their color scale on
 * league average and extend ±3σ to the hot/cold extremes.
 *
 * Returns:
 *   { value, stddev } when a baseline row exists,
 *   null when the metric isn't tracked in league_averages, the season
 *   hasn't been refreshed, or the fetch failed.
 *
 * Skips the fetch entirely when `metric` is empty or 'frequency' /
 * 'density' (count-style metrics that have no league midpoint).
 */
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

export type LeagueBaselineRole = 'hitter' | 'hitting' | 'pitcher' | 'pitching' | 'SP' | 'RP'

export interface LeagueBaseline {
  value: number
  stddev: number
}

export function useLeagueBaseline(
  season: number | null | undefined,
  level: 'MLB' | 'MiLB' | undefined,
  role: LeagueBaselineRole | null | undefined,
  metric: string | null | undefined,
): LeagueBaseline | null {
  const skip = !season || !level || !role || !metric ||
    metric === 'frequency' || metric === 'density' || metric === 'count'

  const { data } = useQuery({
    queryKey: queryKeys.leagueBaseline(season, level, role, metric),
    queryFn: async (): Promise<LeagueBaseline | null> => {
      const params = new URLSearchParams({ season: String(season), level: level!, role: role!, metric: metric! })
      const res = await fetch(`/api/league-baseline?${params}`)
      if (!res.ok) return null
      const json = await res.json()
      const b = json?.baseline
      if (!b || b.value == null || b.stddev == null) return null
      return { value: Number(b.value), stddev: Number(b.stddev) }
    },
    enabled: !skip,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  })

  return data ?? null
}
