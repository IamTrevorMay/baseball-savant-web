'use client'
import { Fragment, useState } from 'react'
import Tip from '@/components/Tip'
import GameDetail from './GameDetail'

export default function GameLogTab({ data }: { data: any[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Group by game
  const games: Record<string, any[]> = {}
  data.forEach(d => {
    const key = `${d.game_date}_${d.game_pk}`
    if (!games[key]) games[key] = []
    games[key].push(d)
  })

  const gameRows = Object.entries(games).map(([key, pitches]) => {
    const first = pitches[0]
    const velos = pitches.map(p => p.release_speed).filter(Boolean)
    const ks = pitches.filter(p => p.events?.includes('strikeout')).length
    const bbs = pitches.filter(p => p.events?.includes('walk')).length
    const hits = pitches.filter(p => ['single','double','triple','home_run'].includes(p.events)).length
    const whiffs = pitches.filter(p => p.description?.toLowerCase().includes('swinging_strike')).length
    const swings = pitches.filter(p => {
      const d = (p.description || '').toLowerCase()
      return d.includes('swing') || d.includes('foul') || d.includes('in play')
    }).length

    return {
      key,
      pitches: pitches.length,
      rawPitches: pitches,
      date: first.game_date, opponent: first.home_team === first.away_team ? '—' : `${first.away_team} @ ${first.home_team}`,
      avgVelo: velos.length ? (velos.reduce((a,b) => a+b,0)/velos.length).toFixed(1) : '—',
      maxVelo: velos.length ? Math.max(...velos).toFixed(1) : '—',
      ks, bbs, hits, whiffPct: swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—',
    }
  }).sort((a, b) => b.date.localeCompare(a.date))

  const colCount = 10 // chevron + 9 data columns

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
            <th className="w-8 px-2 py-2"></th>
            <th className="text-left px-4 py-2"><Tip label="Date" col="game_date" /></th>
            <th className="text-left px-4 py-2">Matchup</th>
            <th className="text-right px-4 py-2"><Tip label="Pitches" /></th>
            <th className="text-right px-4 py-2"><Tip label="Avg Velo" /></th>
            <th className="text-right px-4 py-2"><Tip label="Max Velo" /></th>
            <th className="text-right px-4 py-2"><Tip label="K" /></th>
            <th className="text-right px-4 py-2"><Tip label="BB" /></th>
            <th className="text-right px-4 py-2"><Tip label="H" /></th>
            <th className="text-right px-4 py-2"><Tip label="Whiff%" /></th>
          </tr>
        </thead>
        <tbody>
          {gameRows.map((r) => {
            const isExpanded = expandedKey === r.key
            return (
              <Fragment key={r.key}>
                <tr
                  className={`border-t border-zinc-800/50 cursor-pointer transition ${
                    isExpanded ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
                  }`}
                  onClick={() => setExpandedKey(isExpanded ? null : r.key)}
                >
                  <td className="px-2 py-2 text-zinc-500">
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                  <td className="px-4 py-2 text-sm text-white font-mono">{r.date}</td>
                  <td className="px-4 py-2 text-sm text-zinc-400">{r.opponent}</td>
                  <td className="px-4 py-2 text-sm text-zinc-400 text-right font-mono">{r.pitches}</td>
                  <td className="px-4 py-2 text-sm text-amber-400 text-right font-mono">{r.avgVelo}</td>
                  <td className="px-4 py-2 text-sm text-amber-400/70 text-right font-mono">{r.maxVelo}</td>
                  <td className="px-4 py-2 text-sm text-emerald-400 text-right font-mono">{r.ks}</td>
                  <td className="px-4 py-2 text-sm text-red-400 text-right font-mono">{r.bbs}</td>
                  <td className="px-4 py-2 text-sm text-sky-400 text-right font-mono">{r.hits}</td>
                  <td className="px-4 py-2 text-sm text-zinc-300 text-right font-mono">{r.whiffPct}%</td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={colCount} className="p-0 border-t border-zinc-700/50">
                      <GameDetail pitches={r.rawPitches} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
