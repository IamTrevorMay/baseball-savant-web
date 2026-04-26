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
import { useEffect, useRef, useState } from 'react'

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
  const [baseline, setBaseline] = useState<LeagueBaseline | null>(null)
  // Sequence guard for races when filters change rapidly.
  const seq = useRef(0)

  useEffect(() => {
    if (!season || !level || !role || !metric) { setBaseline(null); return }
    if (metric === 'frequency' || metric === 'density' || metric === 'count') {
      setBaseline(null); return
    }
    const mySeq = ++seq.current
    const params = new URLSearchParams({ season: String(season), level, role, metric })
    fetch(`/api/league-baseline?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`baseline ${r.status}`)))
      .then(json => {
        if (mySeq !== seq.current) return
        const b = json?.baseline
        if (!b || b.value == null || b.stddev == null) setBaseline(null)
        else setBaseline({ value: Number(b.value), stddev: Number(b.stddev) })
      })
      .catch(() => { if (mySeq === seq.current) setBaseline(null) })
  }, [season, level, role, metric])

  return baseline
}
