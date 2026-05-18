'use client'
import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import type { Game } from '@/lib/types'

// Box Score types
export interface BoxBatter {
  id: number; name: string; boxName: string; pos: string
  ab: number; r: number; h: number; rbi: number; bb: number; so: number
  avg: string; obp: string; slg: string; hr: number
}
export interface BoxPitcher {
  id: number; name: string; boxName: string
  ip: string; h: number; r: number; er: number; bb: number; so: number
  hr: number; era: string; pitches: number; strikes: number
}
export interface BoxTeam {
  team: { id: number; name: string; abbrev: string }
  batting: { totals: any }
  batters: BoxBatter[]; pitchers: BoxPitcher[]
}
export interface InningLine { num: number; ordinal: string; away: { runs: number | null }; home: { runs: number | null } }
export interface BoxScore {
  gamePk: string; away: BoxTeam; home: BoxTeam; innings: InningLine[]
  totals: { away: { runs: number; hits: number; errors: number }; home: { runs: number; hits: number; errors: number } }
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function useScores() {
  const [scoresDate, setScoresDate] = useState(localToday)
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [boxTeamSide, setBoxTeamSide] = useState<'away' | 'home'>('away')

  // Scores query with auto-refresh every 30s
  const { data: games = [], isLoading: scoresLoading } = useQuery({
    queryKey: queryKeys.scores(scoresDate),
    queryFn: async () => {
      const res = await fetch(`/api/scores?date=${scoresDate}`)
      const d = await res.json()
      return (d.games || []) as Game[]
    },
    refetchInterval: 30_000,
    staleTime: 0,
  })

  // Box score query
  const { data: boxScore = null, isLoading: boxLoading } = useQuery({
    queryKey: queryKeys.boxscore(selectedGamePk),
    queryFn: async () => {
      const res = await fetch(`/api/boxscore?gamePk=${selectedGamePk}`)
      const d = await res.json()
      return d.away ? (d as BoxScore) : null
    },
    enabled: !!selectedGamePk,
  })

  const shiftDate = useCallback((days: number) => {
    setScoresDate(prev => {
      const d = new Date(prev + 'T12:00:00')
      d.setDate(d.getDate() + days)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    })
  }, [])

  const isToday = scoresDate === localToday()

  const goToToday = useCallback(() => setScoresDate(localToday()), [])

  // Correct date on hydration
  useEffect(() => {
    const today = localToday()
    if (scoresDate !== today) setScoresDate(today)
  }, [])

  // Reset selection when date changes
  useEffect(() => {
    setSelectedGamePk(null)
  }, [scoresDate])

  // Reset team side when game changes
  useEffect(() => {
    setBoxTeamSide('away')
  }, [selectedGamePk])

  return {
    scoresDate, setScoresDate, games, scoresLoading, isToday, shiftDate, goToToday,
    selectedGamePk, setSelectedGamePk, boxScore, boxLoading, boxTeamSide, setBoxTeamSide,
  }
}
