'use client'

import { useDevice } from '@/lib/hooks/useDeviceContext'
import { useScores } from '@/lib/hooks/useScores'
import ResearchNav from '@/components/ResearchNav'
import ScoreCard from '@/components/scores/ScoreCard'
import BoxScorePanel from '@/components/scores/BoxScorePanel'
import MobileScores from '@/components/mobile/MobileScores'

export default function ScoresPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const scores = useScores()

  if (deviceLoading) return null
  if (isMobile) return <MobileScores scores={scores} />

  const {
    scoresDate, setScoresDate, games, scoresLoading, isToday, shiftDate, goToToday,
    selectedGamePk, setSelectedGamePk, boxScore, boxLoading, boxTeamSide, setBoxTeamSide,
  } = scores

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/scores" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Scores</h2>
            <p className="text-sm text-zinc-500">
              {new Date(scoresDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {isToday && <span className="ml-2 text-emerald-400 font-medium">Today</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDate(-1)}
              className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              aria-label="Previous day">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <input type="date" value={scoresDate} onChange={e => e.target.value && setScoresDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-white focus:border-emerald-600 focus:outline-none [color-scheme:dark]" />
            {!isToday && (
              <button onClick={goToToday}
                className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition">
                Today
              </button>
            )}
            <button onClick={() => shiftDate(1)}
              className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              aria-label="Next day">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {scoresLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse min-w-[220px] flex-shrink-0">
                <div className="h-3 w-16 bg-zinc-800 rounded mb-4" />
                <div className="h-4 w-full bg-zinc-800 rounded mb-2" />
                <div className="h-4 w-full bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-sm">No games scheduled for this date.</div>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {games.map(g => (
                <ScoreCard key={g.gamePk} game={g} selected={g.gamePk === selectedGamePk}
                  onClick={() => setSelectedGamePk(g.gamePk === selectedGamePk ? null : g.gamePk)} />
              ))}
            </div>
            {selectedGamePk && (
              <div className="mt-4">
                {boxLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                ) : boxScore ? (
                  <BoxScorePanel box={boxScore} side={boxTeamSide} setSide={setBoxTeamSide} />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
