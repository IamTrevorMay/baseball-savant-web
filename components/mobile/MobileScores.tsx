'use client'

import { useState } from 'react'
import MobileShell from './MobileShell'
import ScoreCard from '@/components/scores/ScoreCard'
import BoxScorePanel from '@/components/scores/BoxScorePanel'
import type { useScores } from '@/lib/hooks/useScores'

interface Props {
  scores: ReturnType<typeof useScores>
}

export default function MobileScores({ scores }: Props) {
  const {
    scoresDate, setScoresDate, games, scoresLoading, isToday, shiftDate, goToToday,
    selectedGamePk, setSelectedGamePk, boxScore, boxLoading, boxTeamSide, setBoxTeamSide,
  } = scores

  const [expandedGame, setExpandedGame] = useState<number | null>(null)

  function handleCardTap(gamePk: number) {
    if (expandedGame === gamePk) {
      setExpandedGame(null)
      setSelectedGamePk(null)
    } else {
      setExpandedGame(gamePk)
      setSelectedGamePk(gamePk)
    }
  }

  return (
    <MobileShell title="Scores">
      <div className="px-4 py-4">
        {/* Date nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => shiftDate(-1)} className="p-2 rounded bg-zinc-800 text-zinc-300 active:bg-zinc-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="text-center">
            <div className="text-sm font-medium text-white">
              {new Date(scoresDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            {isToday && <span className="text-[10px] text-emerald-400 font-medium">Today</span>}
          </div>
          <button onClick={() => shiftDate(1)} className="p-2 rounded bg-zinc-800 text-zinc-300 active:bg-zinc-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {!isToday && (
          <button onClick={goToToday}
            className="w-full mb-4 py-2 rounded text-xs font-medium bg-emerald-600 text-white active:bg-emerald-500 transition">
            Go to Today
          </button>
        )}

        {/* Games */}
        {scoresLoading ? (
          <div className="space-y-3">
            {Array.from({length: 4}).map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                <div className="h-4 w-full bg-zinc-800 rounded mb-2" />
                <div className="h-4 w-full bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 text-sm">No games scheduled.</div>
        ) : (
          <div className="space-y-3">
            {games.map(g => (
              <div key={g.gamePk}>
                <ScoreCard
                  game={g}
                  selected={expandedGame === g.gamePk}
                  onClick={() => handleCardTap(g.gamePk)}
                />
                {expandedGame === g.gamePk && (
                  <div className="mt-2">
                    {boxLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                      </div>
                    ) : boxScore ? (
                      <BoxScorePanel box={boxScore} side={boxTeamSide} setSide={setBoxTeamSide} />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
