'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
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
  const [games, setGames] = useState<Game[]>([])
  const [scoresLoading, setScoresLoading] = useState(true)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [boxScore, setBoxScore] = useState<BoxScore | null>(null)
  const [boxLoading, setBoxLoading] = useState(false)
  const [boxTeamSide, setBoxTeamSide] = useState<'away' | 'home'>('away')

  const fetchScores = useCallback((date: string, showLoading = false) => {
    if (showLoading) setScoresLoading(true)
    fetch(`/api/scores?date=${date}`)
      .then(r => r.json())
      .then(d => { setGames(d.games || []); setScoresLoading(false) })
      .catch(() => setScoresLoading(false))
  }, [])

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

  // Fetch scores + auto-refresh
  useEffect(() => {
    fetchScores(scoresDate, true)
    setSelectedGamePk(null)
    setBoxScore(null)
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(() => fetchScores(scoresDate), 30000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [scoresDate, fetchScores])

  // Fetch box score
  useEffect(() => {
    if (!selectedGamePk) { setBoxScore(null); return }
    setBoxLoading(true)
    setBoxTeamSide('away')
    fetch(`/api/boxscore?gamePk=${selectedGamePk}`)
      .then(r => r.json())
      .then(d => { if (d.away) setBoxScore(d); setBoxLoading(false) })
      .catch(() => setBoxLoading(false))
  }, [selectedGamePk])

  return {
    scoresDate, setScoresDate, games, scoresLoading, isToday, shiftDate, goToToday,
    selectedGamePk, setSelectedGamePk, boxScore, boxLoading, boxTeamSide, setBoxTeamSide,
  }
}
