'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const NES = {
  bg: '#0C0C0C',
  red: '#FC0D1B',
  blue: '#0058F8',
  green: '#00A800',
  yellow: '#F8D878',
  white: '#FCFCFC',
  gray: '#7C7C7C',
  darkGray: '#383838',
} as const

// Score distribution bucket colors (NES percentile palette)
const BUCKET_COLORS: Record<string, string> = {
  '0-20': '#FC0D1B',
  '21-40': '#F87858',
  '41-60': '#F8D878',
  '61-80': '#58D854',
  '81-100': '#00A800',
}

interface Stats {
  headline: {
    total_games: number
    games_today: number
    games_week: number
    games_month: number
    unique_players: number
    win_rate: number
    avg_score: number
  }
  by_type: { puzzle_type: string; games: number; avg_score: number; win_rate: number; perfect_scores: number }[]
  by_year: { puzzle_year: number; games: number; avg_score: number; win_rate: number }[]
  top_players: { display_name: string; total_score: number; games_played: number; wins: number; avg_score: number }[]
  most_games: { display_name: string; games_played: number } | null
  hardest: { puzzle_date: string; puzzle_year: number; puzzle_type: string; avg_score: number; submissions: number } | null
  easiest: { puzzle_date: string; puzzle_year: number; puzzle_type: string; avg_score: number; submissions: number } | null
  distribution: Record<string, number>
  fun: {
    avg_guesses_to_win: number
    hint_usage_rate: number
    first_guess_wins: number
    perfect_100s: number
    score_95_plus: number
    score_80_plus: number
  }
}

export default function GameStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/game/stats')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setStats(d))
      .catch(() => setError('FAILED TO LOAD STATS'))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-xs" style={{ color: NES.red }}>{error}</p>
        <Link href="/game" className="text-[10px]" style={{ color: NES.gray }}>BACK TO GAME</Link>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs animate-pulse" style={{ color: NES.yellow }}>LOADING STATS...</p>
      </div>
    )
  }

  const { headline, by_type, by_year, top_players, most_games, hardest, easiest, distribution, fun } = stats
  const pitcher = by_type?.find(t => t.puzzle_type === 'pitcher')
  const hitter = by_type?.find(t => t.puzzle_type === 'hitter')

  // Distribution max for bar scaling
  const distBuckets = ['0-20', '21-40', '41-60', '61-80', '81-100']
  const distMax = distribution ? Math.max(...distBuckets.map(b => distribution[b] || 0), 1) : 1

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <h1 className="text-center text-sm sm:text-base mb-6 mt-4 tracking-wider" style={{ color: NES.yellow }}>
        PERCENTILE<br />COMMUNITY STATS
      </h1>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <StatBox label="TOTAL GAMES" value={headline.total_games} color={NES.white} />
        <StatBox label="UNIQUE PLAYERS" value={headline.unique_players} color={NES.blue} />
        <StatBox label="WIN RATE" value={`${headline.win_rate}%`} color={NES.green} />
        <StatBox label="AVG SCORE" value={headline.avg_score} color={NES.yellow} />
      </div>
      <div className="flex justify-center gap-4 mb-6 text-[8px]">
        <span style={{ color: NES.gray }}>TODAY: <span style={{ color: NES.white }}>{headline.games_today}</span></span>
        <span style={{ color: NES.gray }}>WEEK: <span style={{ color: NES.white }}>{headline.games_week}</span></span>
        <span style={{ color: NES.gray }}>MONTH: <span style={{ color: NES.white }}>{headline.games_month}</span></span>
      </div>

      {/* Pitcher vs Hitter */}
      <SectionTitle>PITCHER vs HITTER</SectionTitle>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <TypeCard label="PITCHER" data={pitcher} borderColor={NES.red} />
        <TypeCard label="HITTER" data={hitter} borderColor={NES.blue} />
      </div>

      {/* By Year */}
      {by_year && by_year.length > 0 && (
        <>
          <SectionTitle>BY YEAR</SectionTitle>
          <div className="border-2 mb-6" style={{ borderColor: NES.darkGray }}>
            <div className="grid grid-cols-4 text-[7px] px-2 py-1 border-b" style={{ borderColor: NES.darkGray, color: NES.gray }}>
              <span>YEAR</span><span className="text-right">GAMES</span><span className="text-right">AVG</span><span className="text-right">WIN%</span>
            </div>
            {by_year.map(y => (
              <div key={y.puzzle_year} className="grid grid-cols-4 text-[8px] px-2 py-1" style={{ color: NES.white }}>
                <span style={{ color: NES.yellow }}>{y.puzzle_year}</span>
                <span className="text-right">{y.games}</span>
                <span className="text-right">{y.avg_score}</span>
                <span className="text-right" style={{ color: NES.green }}>{y.win_rate}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Score Distribution */}
      {distribution && (
        <>
          <SectionTitle>SCORE DISTRIBUTION</SectionTitle>
          <div className="space-y-1 mb-6">
            {distBuckets.map(bucket => {
              const count = distribution[bucket] || 0
              const pct = Math.round((count / Math.max(headline.total_games, 1)) * 100)
              return (
                <div key={bucket} className="flex items-center gap-2">
                  <span className="text-[8px] w-12 text-right shrink-0" style={{ color: NES.gray }}>{bucket}</span>
                  <div className="flex-1 h-4 relative" style={{ background: NES.darkGray }}>
                    <div
                      className="h-full"
                      style={{ width: `${(count / distMax) * 100}%`, background: BUCKET_COLORS[bucket] }}
                    />
                  </div>
                  <span className="text-[8px] w-12 shrink-0" style={{ color: NES.gray }}>{count} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Top Players */}
      {top_players && top_players.length > 0 && (
        <>
          <SectionTitle>TOP PLAYERS</SectionTitle>
          <div className="border-2 mb-2" style={{ borderColor: NES.yellow }}>
            <div className="flex text-[7px] px-2 py-1 border-b" style={{ borderColor: NES.darkGray, color: NES.gray }}>
              <span className="w-5">#</span>
              <span className="flex-1">NAME</span>
              <span className="w-10 text-right">PTS</span>
              <span className="w-8 text-right">W</span>
              <span className="w-8 text-right">GP</span>
              <span className="w-10 text-right">AVG</span>
            </div>
            {top_players.map((p, i) => (
              <div key={i} className="flex text-[8px] px-2 py-1"
                style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                <span className="w-5" style={{ color: i === 0 ? NES.yellow : NES.gray }}>{i + 1}</span>
                <span className="flex-1 truncate" style={{ color: NES.white }}>{p.display_name}</span>
                <span className="w-10 text-right" style={{ color: NES.yellow }}>{p.total_score}</span>
                <span className="w-8 text-right" style={{ color: NES.green }}>{p.wins}</span>
                <span className="w-8 text-right" style={{ color: NES.gray }}>{p.games_played}</span>
                <span className="w-10 text-right" style={{ color: NES.gray }}>{p.avg_score}</span>
              </div>
            ))}
          </div>
          {most_games && (
            <p className="text-[8px] text-center mb-6" style={{ color: NES.gray }}>
              MOST GAMES: <span style={{ color: NES.white }}>{most_games.display_name}</span> ({most_games.games_played})
            </p>
          )}
        </>
      )}

      {/* Fun Stats */}
      {fun && (
        <>
          <SectionTitle>FUN STATS</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
            <StatBox label="AVG GUESSES" value={fun.avg_guesses_to_win} color={NES.white} small />
            <StatBox label="HINT RATE" value={`${fun.hint_usage_rate}%`} color={NES.yellow} small />
            <StatBox label="1ST GUESS WINS" value={fun.first_guess_wins} color={NES.green} small />
            <StatBox label="PERFECT 100s" value={fun.perfect_100s} color={NES.red} small />
            <StatBox label="95+ SCORES" value={fun.score_95_plus} color={NES.blue} small />
            <StatBox label="80+ SCORES" value={fun.score_80_plus} color={NES.gray} small />
          </div>
        </>
      )}

      {/* Records */}
      {(hardest || easiest) && (
        <>
          <SectionTitle>RECORDS</SectionTitle>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {hardest && (
              <div className="border-2 p-3 text-center" style={{ borderColor: NES.red }}>
                <p className="text-[7px] mb-1" style={{ color: NES.red }}>HARDEST PUZZLE</p>
                <p className="text-[10px] mb-1" style={{ color: NES.white }}>{hardest.puzzle_date}</p>
                <p className="text-[8px]" style={{ color: NES.gray }}>
                  {hardest.puzzle_year} {hardest.puzzle_type.toUpperCase()}
                </p>
                <p className="text-sm mt-1" style={{ color: NES.red }}>{hardest.avg_score} AVG</p>
                <p className="text-[7px]" style={{ color: NES.darkGray }}>{hardest.submissions} PLAYS</p>
              </div>
            )}
            {easiest && (
              <div className="border-2 p-3 text-center" style={{ borderColor: NES.green }}>
                <p className="text-[7px] mb-1" style={{ color: NES.green }}>EASIEST PUZZLE</p>
                <p className="text-[10px] mb-1" style={{ color: NES.white }}>{easiest.puzzle_date}</p>
                <p className="text-[8px]" style={{ color: NES.gray }}>
                  {easiest.puzzle_year} {easiest.puzzle_type.toUpperCase()}
                </p>
                <p className="text-sm mt-1" style={{ color: NES.green }}>{easiest.avg_score} AVG</p>
                <p className="text-[7px]" style={{ color: NES.darkGray }}>{easiest.submissions} PLAYS</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="text-center py-6">
        <Link href="/game" className="text-[10px] border-2 px-4 py-2 inline-block transition-colors hover:bg-white/10"
          style={{ borderColor: NES.gray, color: NES.gray }}>
          BACK TO GAME
        </Link>
      </div>
    </div>
  )
}

// ── Subcomponents ──

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] tracking-widest text-center mb-3" style={{ color: NES.gray }}>
      ── {children} ──
    </p>
  )
}

function StatBox({ label, value, color, small }: { label: string; value: string | number; color: string; small?: boolean }) {
  return (
    <div className="border-2 p-2 text-center" style={{ borderColor: NES.darkGray }}>
      <p className={small ? 'text-sm' : 'text-base sm:text-lg'} style={{ color }}>{value}</p>
      <p className="text-[7px] mt-0.5" style={{ color: NES.gray }}>{label}</p>
    </div>
  )
}

function TypeCard({ label, data, borderColor }: {
  label: string
  data: { games: number; avg_score: number; win_rate: number; perfect_scores: number } | undefined
  borderColor: string
}) {
  if (!data) return <div className="border-2 p-3 text-center" style={{ borderColor: NES.darkGray }}><p className="text-[8px]" style={{ color: NES.gray }}>NO DATA</p></div>
  return (
    <div className="border-2 p-3 text-center space-y-1" style={{ borderColor }}>
      <p className="text-[9px] tracking-wider" style={{ color: borderColor }}>{label}</p>
      <p className="text-[8px]" style={{ color: NES.white }}>{data.games} GAMES</p>
      <p className="text-[8px]" style={{ color: NES.white }}>AVG {data.avg_score}</p>
      <p className="text-[8px]" style={{ color: NES.green }}>{data.win_rate}% WIN</p>
      <p className="text-[8px]" style={{ color: NES.yellow }}>{data.perfect_scores} PERFECT</p>
    </div>
  )
}
