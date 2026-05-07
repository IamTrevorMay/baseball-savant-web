'use client'
import { TEAM_COLORS } from '@/lib/constants'

/* ─── Box Score Types ─── */

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

/* ─── Box Score Panel ─── */

function BoxScorePanel({ box, side, setSide }: { box: BoxScore; side: 'away' | 'home'; setSide: (s: 'away' | 'home') => void }) {
  const team = side === 'away' ? box.away : box.home

  // Always show at least 9 innings
  const minInnings = 9
  const inningCount = Math.max(minInnings, box.innings.length)
  const displayInnings = Array.from({ length: inningCount }, (_, i) => {
    const num = i + 1
    const existing = box.innings.find(inn => inn.num === num)
    return existing || { num, ordinal: String(num), away: { runs: null }, home: { runs: null } }
  })
  // Determine which innings have been played (have data)
  const lastPlayedInning = box.innings.length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Line Score */}
      <div className="overflow-x-auto border-b border-zinc-800">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-zinc-500 bg-zinc-800/50">
              <th className="text-left px-3 py-2 w-20"></th>
              {displayInnings.map(inn => (
                <th key={inn.num} className="text-center px-2 py-2 min-w-[24px]">{inn.num}</th>
              ))}
              <th className="text-center px-3 py-2 font-bold">R</th>
              <th className="text-center px-3 py-2 font-bold">H</th>
              <th className="text-center px-3 py-2 font-bold">E</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as const).map(s => {
              const t = s === 'away' ? box.away : box.home
              const tot = box.totals[s]
              return (
                <tr key={s} className="border-t border-zinc-800/30">
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                      style={{ backgroundColor: TEAM_COLORS[t.team.abbrev] || '#52525b' }}>{t.team.abbrev}</div>
                    <span className="text-white font-medium text-[11px]">{t.team.abbrev}</span>
                  </td>
                  {displayInnings.map(inn => {
                    const runs = s === 'away' ? inn.away.runs : inn.home.runs
                    const played = inn.num <= lastPlayedInning
                    return (
                      <td key={inn.num} className={`text-center px-2 py-1.5 ${played ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {runs !== null ? runs : played ? 0 : ''}
                      </td>
                    )
                  })}
                  <td className="text-center px-3 py-1.5 text-white font-bold">{tot.runs}</td>
                  <td className="text-center px-3 py-1.5 text-zinc-300">{tot.hits}</td>
                  <td className="text-center px-3 py-1.5 text-zinc-300">{tot.errors}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Team toggle */}
      <div className="flex justify-center gap-1 px-4 pt-3 pb-2">
        {(['away', 'home'] as const).map(s => {
          const t = s === 'away' ? box.away : box.home
          return (
            <button key={s} onClick={() => setSide(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${
                side === s ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                style={{ backgroundColor: TEAM_COLORS[t.team.abbrev] || '#52525b' }}>{t.team.abbrev}</div>
              {t.team.name}
            </button>
          )
        })}
      </div>

      {/* Batting table */}
      <div className="px-4 pb-3">
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Batting</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-500 font-medium">
                <th className="text-left px-2 py-1.5">Player</th>
                <th className="text-right px-2 py-1.5">AB</th>
                <th className="text-right px-2 py-1.5">R</th>
                <th className="text-right px-2 py-1.5">H</th>
                <th className="text-right px-2 py-1.5">RBI</th>
                <th className="text-right px-2 py-1.5">BB</th>
                <th className="text-right px-2 py-1.5">SO</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">HR</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">AVG</th>
                <th className="text-right px-2 py-1.5 hidden lg:table-cell">OBP</th>
                <th className="text-right px-2 py-1.5 hidden lg:table-cell">SLG</th>
              </tr>
            </thead>
            <tbody>
              {team.batters.map((b, i) => (
                <tr key={b.id} className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition">
                  <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">
                    <span className="text-zinc-500 mr-1.5">{b.pos}</span>{b.boxName || b.name}
                  </td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.ab}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.r}</td>
                  <td className="text-right px-2 py-1.5 text-white font-mono font-medium">{b.h}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.rbi}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.bb}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.so}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono hidden md:table-cell">{b.hr}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden md:table-cell">{b.avg}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden lg:table-cell">{b.obp}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden lg:table-cell">{b.slg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pitching table */}
      <div className="px-4 pb-4">
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Pitching</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-500 font-medium">
                <th className="text-left px-2 py-1.5">Pitcher</th>
                <th className="text-right px-2 py-1.5">IP</th>
                <th className="text-right px-2 py-1.5">H</th>
                <th className="text-right px-2 py-1.5">R</th>
                <th className="text-right px-2 py-1.5">ER</th>
                <th className="text-right px-2 py-1.5">BB</th>
                <th className="text-right px-2 py-1.5">SO</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">HR</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">P-S</th>
                <th className="text-right px-2 py-1.5 hidden lg:table-cell">ERA</th>
              </tr>
            </thead>
            <tbody>
              {team.pitchers.map(p => (
                <tr key={p.id} className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition">
                  <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">{p.boxName || p.name}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.ip}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.h}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.r}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.er}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.bb}</td>
                  <td className="text-right px-2 py-1.5 text-white font-mono font-medium">{p.so}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono hidden md:table-cell">{p.hr}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden md:table-cell">{p.pitches}-{p.strikes}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden lg:table-cell">{p.era}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default BoxScorePanel
