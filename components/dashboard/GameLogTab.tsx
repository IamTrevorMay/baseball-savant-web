'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Tip from '@/components/Tip'
import GameDetail from './GameDetail'
import GameReviewModal from '@/components/videos/GameReviewModal'

/** One official pitching line from /api/pitcher-gamelog, keyed by gamePk. */
interface OfficialLine {
  ip: string
  h: number
  k: number
  bb: number
  r: number
  er: number
}

interface GameLogTabProps {
  data: any[]
  /**
   * MLB player supplying the rows. When given, the log shows the official
   * box-score line (IP/H/K/BB/R/ER from the MLB Stats API) and a Watch button
   * that opens the game's clips. Omit it — as the MiLB dashboard does — and
   * the table stays on Statcast-derived counts with no video.
   */
  pitcher?: { id: number; name: string }
}

export default function GameLogTab({ data, pitcher }: GameLogTabProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [official, setOfficial] = useState<Record<string, OfficialLine>>({})
  const [watching, setWatching] = useState<{ gamePk: number; date: string; matchup: string } | null>(null)

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
      gamePk: first.game_pk as number,
      pitches: pitches.length,
      rawPitches: pitches,
      date: first.game_date, opponent: first.home_team === first.away_team ? '—' : `${first.away_team} @ ${first.home_team}`,
      avgVelo: velos.length ? (velos.reduce((a,b) => a+b,0)/velos.length).toFixed(1) : '—',
      maxVelo: velos.length ? Math.max(...velos).toFixed(1) : '—',
      ks, bbs, hits, whiffPct: swings > 0 ? (whiffs / swings * 100).toFixed(1) : '—',
    }
  }).sort((a, b) => b.date.localeCompare(a.date))

  // Seasons present in the loaded rows — one MLB Stats API call each.
  const seasons = useMemo(() => {
    const set = new Set<number>()
    data.forEach(d => {
      const y = d.game_year ?? parseInt(String(d.game_date || '').slice(0, 4), 10)
      if (y && !isNaN(y)) set.add(Number(y))
    })
    return [...set].sort((a, b) => b - a)
  }, [data])
  const seasonKey = seasons.join(',')

  // Statcast has no earned-run bookkeeping, so IP/R/ER (and the H/K/BB that
  // sit beside them) have to come from the official game log.
  const pitcherId = pitcher?.id
  useEffect(() => {
    if (!pitcherId || !seasonKey) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/pitcher-gamelog?id=${pitcherId}&seasons=${seasonKey}`)
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        setOfficial(res.ok ? json.games || {} : {})
      } catch {
        if (!cancelled) setOfficial({})
      }
    })()
    return () => { cancelled = true }
  }, [pitcherId, seasonKey])

  const colCount = pitcher ? 12 : 8 // chevron + data columns

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
            <th className="w-8 px-2 py-2"></th>
            <th className="text-left px-4 py-2"><Tip label="Date" col="game_date" /></th>
            <th className="text-left px-4 py-2">Matchup</th>
            {pitcher ? (
              <>
                <th className="text-right px-4 py-2"><Tip label="IP" /></th>
                <th className="text-right px-4 py-2"><Tip label="H" /></th>
                <th className="text-right px-4 py-2"><Tip label="K" /></th>
                <th className="text-right px-4 py-2"><Tip label="BB" /></th>
                <th className="text-right px-4 py-2"><Tip label="R" /></th>
                <th className="text-right px-4 py-2"><Tip label="ER" /></th>
                <th className="text-right px-4 py-2"><Tip label="Pitches" /></th>
                <th className="text-right px-4 py-2"><Tip label="Whiff%" /></th>
                <th className="text-right px-4 py-2"></th>
              </>
            ) : (
              <>
                <th className="text-right px-4 py-2"><Tip label="Pitches" /></th>
                <th className="text-right px-4 py-2"><Tip label="K" /></th>
                <th className="text-right px-4 py-2"><Tip label="BB" /></th>
                <th className="text-right px-4 py-2"><Tip label="H" /></th>
                <th className="text-right px-4 py-2"><Tip label="Whiff%" /></th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {gameRows.map((r) => {
            const isExpanded = expandedKey === r.key
            // No official line (spring/exhibition, or the API is behind) falls
            // back to the Statcast-derived counts, with IP/R/ER blank.
            const off = official[String(r.gamePk)]
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
                  {pitcher ? (
                    <>
                      <td className="px-4 py-2 text-sm text-zinc-200 text-right font-mono">{off?.ip || '—'}</td>
                      <td className="px-4 py-2 text-sm text-sky-400 text-right font-mono">{off?.h ?? r.hits}</td>
                      <td className="px-4 py-2 text-sm text-emerald-400 text-right font-mono">{off?.k ?? r.ks}</td>
                      <td className="px-4 py-2 text-sm text-red-400 text-right font-mono">{off?.bb ?? r.bbs}</td>
                      <td className="px-4 py-2 text-sm text-zinc-300 text-right font-mono">{off?.r ?? '—'}</td>
                      <td className="px-4 py-2 text-sm text-zinc-300 text-right font-mono">{off?.er ?? '—'}</td>
                      <td className="px-4 py-2 text-sm text-zinc-400 text-right font-mono">{r.pitches}</td>
                      <td className="px-4 py-2 text-sm text-zinc-300 text-right font-mono">{r.whiffPct}%</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600/15 border border-emerald-600/50 text-emerald-400 hover:bg-emerald-600/25 transition"
                          onClick={e => {
                            e.stopPropagation()
                            setWatching({ gamePk: r.gamePk, date: r.date, matchup: r.opponent })
                          }}
                        >
                          Watch
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-sm text-zinc-400 text-right font-mono">{r.pitches}</td>
                      <td className="px-4 py-2 text-sm text-emerald-400 text-right font-mono">{r.ks}</td>
                      <td className="px-4 py-2 text-sm text-red-400 text-right font-mono">{r.bbs}</td>
                      <td className="px-4 py-2 text-sm text-sky-400 text-right font-mono">{r.hits}</td>
                      <td className="px-4 py-2 text-sm text-zinc-300 text-right font-mono">{r.whiffPct}%</td>
                    </>
                  )}
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

      {watching && pitcher && (
        <GameReviewModal
          pitcherId={pitcher.id}
          pitcherName={pitcher.name}
          gamePk={watching.gamePk}
          gameDate={watching.date}
          matchup={watching.matchup}
          onClose={() => setWatching(null)}
        />
      )}
    </div>
  )
}
