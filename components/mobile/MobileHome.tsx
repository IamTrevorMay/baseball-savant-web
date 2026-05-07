'use client'

import { useState } from 'react'
import MobileShell from './MobileShell'
import MobileSearch from './MobileSearch'
import ScoreCard from '@/components/scores/ScoreCard'
import BoxScorePanel from '@/components/scores/BoxScorePanel'
import { TEAM_COLORS } from '@/lib/constants'
import type { useScores } from '@/lib/hooks/useScores'
import type { useStandings } from '@/lib/hooks/useStandings'
import type { StandingsTeam, Division } from '@/components/standings/StandingsTypes'

interface Props {
  scores: ReturnType<typeof useScores>
  standings: ReturnType<typeof useStandings>
}

export default function MobileHome({ scores, standings }: Props) {
  const {
    scoresDate, games, scoresLoading, isToday, shiftDate, goToToday,
    selectedGamePk, setSelectedGamePk, boxScore, boxLoading, boxTeamSide, setBoxTeamSide,
  } = scores

  const {
    standingsLoading, season, setSeason, view, setView,
    standingsType, setStandingsType, years, getDivisions, getWildCard, divisions,
  } = standings

  const [expandedGame, setExpandedGame] = useState<number | null>(null)
  const [expandedDiv, setExpandedDiv] = useState<string | null>(null)

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
    <MobileShell title="Home">
      <div className="px-4 py-4 space-y-6">
        {/* Search */}
        <MobileSearch />

        {/* ─── Scores ─── */}
        <section>
          {/* Date nav */}
          <div className="flex items-center justify-between mb-3">
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
              className="w-full mb-3 py-2 rounded text-xs font-medium bg-emerald-600 text-white active:bg-emerald-500 transition">
              Go to Today
            </button>
          )}

          {scoresLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                  <div className="h-4 w-full bg-zinc-800 rounded mb-2" />
                  <div className="h-4 w-full bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">No games scheduled.</div>
          ) : (
            <div className="space-y-2">
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
        </section>

        {/* ─── Standings ─── */}
        <section>
          <h2 className="text-base font-bold text-white mb-3">Standings</h2>

          {/* View pills */}
          <div className="flex gap-1 mb-3">
            {(['division', 'league', 'wildcard'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
                  view === v ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                {v === 'wildcard' ? 'Wild Card' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Season + spring */}
          <div className="flex items-center gap-2 mb-4">
            <select value={season} onChange={e => setSeason(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none flex-1">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={() => setStandingsType(prev => prev === 'regular' ? 'spring' : 'regular')}
              className={`px-2.5 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wide transition ${
                standingsType === 'spring'
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}
            >
              Spring
            </button>
          </div>

          {standingsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : view === 'division' ? (
            <div className="space-y-3">
              {['AL', 'NL'].map(league => (
                <div key={league}>
                  <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    {league === 'AL' ? 'American League' : 'National League'}
                  </h3>
                  {getDivisions(league).map(div => (
                    <MobileDivision
                      key={div.division}
                      division={div}
                      expanded={expandedDiv === div.division}
                      onToggle={() => setExpandedDiv(expandedDiv === div.division ? null : div.division)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : view === 'league' ? (
            <div className="space-y-4">
              {['AL', 'NL'].map(league => {
                const teams = divisions.filter(d => d.league === league).flatMap(d => d.teams).sort((a, b) => b.w - a.w || a.l - b.l)
                return (
                  <div key={league}>
                    <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      {league === 'AL' ? 'American League' : 'National League'}
                    </h3>
                    <MobileTeamList teams={teams} showRank />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {['AL', 'NL'].map(league => (
                <div key={league}>
                  <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    {league} Wild Card
                  </h3>
                  <MobileTeamList teams={getWildCard(league)} showWcGb />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MobileShell>
  )
}

/* ─── Sub-components (inlined from MobileStandings) ─── */

function MobileDivision({ division, expanded, onToggle }: { division: Division; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg mb-2 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-xs font-semibold text-zinc-300">{division.division}</span>
        <svg className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="px-3 pb-2">
        {division.teams.map((t, i) => (
          <div key={t.abbrev} className={`flex items-center justify-between py-1.5 ${i > 0 ? 'border-t border-zinc-800/30' : ''}`}>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                style={{ backgroundColor: TEAM_COLORS[t.abbrev] || '#52525b' }}>{t.abbrev}</div>
              <span className="text-xs text-white font-medium">{t.name}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-white font-medium w-7 text-right">{t.w}</span>
              <span className="text-zinc-500 w-7 text-right">{t.l}</span>
              <span className="text-zinc-400 w-9 text-right">{t.pct}</span>
              <span className="text-zinc-500 w-8 text-right">{t.gb}</span>
            </div>
          </div>
        ))}
      </div>
      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2">
          {division.teams.map(t => (
            <div key={t.abbrev} className="flex items-center justify-between py-1 text-[10px]">
              <span className="text-zinc-400 w-10">{t.abbrev}</span>
              <span className="text-zinc-500">L10: {t.l10}</span>
              <span className={t.streak.startsWith('W') ? 'text-emerald-400' : 'text-red-400'}>{t.streak}</span>
              <span className="text-zinc-500">Home: {t.home}</span>
              <span className="text-zinc-500">Away: {t.away}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileTeamList({ teams, showRank, showWcGb }: { teams: StandingsTeam[]; showRank?: boolean; showWcGb?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {teams.map((t, i) => (
        <div key={t.abbrev} className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-zinc-800/30' : ''} ${showWcGb && i < 3 ? 'bg-emerald-900/10' : ''} ${showWcGb && i === 2 ? 'border-b-2 border-b-zinc-600' : ''}`}>
          <div className="flex items-center gap-2">
            {showRank && <span className="text-[10px] text-zinc-600 font-mono w-4">{i + 1}</span>}
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
              style={{ backgroundColor: TEAM_COLORS[t.abbrev] || '#52525b' }}>{t.abbrev}</div>
            <span className={`text-xs font-medium ${showWcGb && i < 3 ? 'text-emerald-300' : 'text-white'}`}>{t.name}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="text-white font-medium w-7 text-right">{t.w}</span>
            <span className="text-zinc-500 w-7 text-right">{t.l}</span>
            <span className="text-zinc-400 w-9 text-right">{t.pct}</span>
            {showWcGb && <span className="text-zinc-500 w-8 text-right">{t.wcGb}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
