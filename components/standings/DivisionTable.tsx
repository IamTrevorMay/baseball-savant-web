'use client'
import { TEAM_COLORS } from '@/lib/constants'
import type { StandingsTeam, Division } from './StandingsTypes'

/* ─── Division Table ─── */

function DivisionTable({ division }: { division: Division }) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{division.division}</h3>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-zinc-500 font-medium">
            <th className="text-left px-3 py-2">Team</th>
            <th className="text-right px-2 py-2">W</th>
            <th className="text-right px-2 py-2">L</th>
            <th className="text-right px-2 py-2">PCT</th>
            <th className="text-right px-2 py-2">GB</th>
            <th className="text-right px-2 py-2 hidden md:table-cell">L10</th>
            <th className="text-right px-2 py-2 hidden md:table-cell">STRK</th>
            <th className="text-right px-2 py-2 hidden lg:table-cell">Home</th>
            <th className="text-right px-2 py-2 hidden lg:table-cell">Away</th>
            <th className="text-right px-2 py-2 hidden lg:table-cell">DIFF</th>
          </tr>
        </thead>
        <tbody>
          {division.teams.map((t, i) => (
            <tr key={t.abbrev} className={`border-t border-zinc-800/30 hover:bg-zinc-800/30 transition ${i === 0 ? 'bg-zinc-800/20' : ''}`}>
              <td className="px-3 py-2 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                  style={{ backgroundColor: TEAM_COLORS[t.abbrev] || '#52525b' }}>{t.abbrev}</div>
                <span className="text-white font-medium">{t.name}</span>
              </td>
              <td className="text-right px-2 py-2 text-white font-mono font-medium">{t.w}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.l}</td>
              <td className="text-right px-2 py-2 text-zinc-300 font-mono">{t.pct}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.gb}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono hidden md:table-cell">{t.l10}</td>
              <td className={`text-right px-2 py-2 font-mono hidden md:table-cell ${t.streak.startsWith('W') ? 'text-emerald-400' : 'text-red-400'}`}>{t.streak}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono hidden lg:table-cell">{t.home}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono hidden lg:table-cell">{t.away}</td>
              <td className={`text-right px-2 py-2 font-mono hidden lg:table-cell ${t.diff.startsWith('+') ? 'text-emerald-400' : t.diff.startsWith('-') ? 'text-red-400' : 'text-zinc-400'}`}>{t.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── League Table ─── */

export function LeagueTable({ teams }: { teams: StandingsTeam[] }) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-zinc-500 font-medium bg-zinc-800/50">
            <th className="text-left px-3 py-2">#</th>
            <th className="text-left px-3 py-2">Team</th>
            <th className="text-right px-2 py-2">W</th>
            <th className="text-right px-2 py-2">L</th>
            <th className="text-right px-2 py-2">PCT</th>
            <th className="text-right px-2 py-2">RS</th>
            <th className="text-right px-2 py-2">RA</th>
            <th className="text-right px-2 py-2">DIFF</th>
            <th className="text-right px-2 py-2 hidden md:table-cell">L10</th>
            <th className="text-right px-2 py-2 hidden md:table-cell">STRK</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.abbrev} className="border-t border-zinc-800/30 hover:bg-zinc-800/30 transition">
              <td className="px-3 py-2 text-zinc-500 font-mono">{i + 1}</td>
              <td className="px-3 py-2 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                  style={{ backgroundColor: TEAM_COLORS[t.abbrev] || '#52525b' }}>{t.abbrev}</div>
                <span className="text-white font-medium">{t.name}</span>
              </td>
              <td className="text-right px-2 py-2 text-white font-mono font-medium">{t.w}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.l}</td>
              <td className="text-right px-2 py-2 text-zinc-300 font-mono">{t.pct}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.rs}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.ra}</td>
              <td className={`text-right px-2 py-2 font-mono ${t.diff.startsWith('+') ? 'text-emerald-400' : t.diff.startsWith('-') ? 'text-red-400' : 'text-zinc-400'}`}>{t.diff}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono hidden md:table-cell">{t.l10}</td>
              <td className={`text-right px-2 py-2 font-mono hidden md:table-cell ${t.streak.startsWith('W') ? 'text-emerald-400' : 'text-red-400'}`}>{t.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Wild Card Table ─── */

export function WildCardTable({ teams }: { teams: StandingsTeam[] }) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-zinc-500 font-medium bg-zinc-800/50">
            <th className="text-left px-3 py-2">Team</th>
            <th className="text-right px-2 py-2">W</th>
            <th className="text-right px-2 py-2">L</th>
            <th className="text-right px-2 py-2">PCT</th>
            <th className="text-right px-2 py-2">WC GB</th>
            <th className="text-right px-2 py-2 hidden md:table-cell">L10</th>
            <th className="text-right px-2 py-2 hidden md:table-cell">STRK</th>
            <th className="text-right px-2 py-2 hidden lg:table-cell">DIFF</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.abbrev} className={`border-t border-zinc-800/30 hover:bg-zinc-800/30 transition ${i < 3 ? 'bg-emerald-900/10' : ''} ${i === 2 ? 'border-b-2 border-b-zinc-600' : ''}`}>
              <td className="px-3 py-2 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                  style={{ backgroundColor: TEAM_COLORS[t.abbrev] || '#52525b' }}>{t.abbrev}</div>
                <span className={`font-medium ${i < 3 ? 'text-emerald-300' : 'text-white'}`}>{t.name}</span>
              </td>
              <td className="text-right px-2 py-2 text-white font-mono font-medium">{t.w}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.l}</td>
              <td className="text-right px-2 py-2 text-zinc-300 font-mono">{t.pct}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono">{t.wcGb}</td>
              <td className="text-right px-2 py-2 text-zinc-400 font-mono hidden md:table-cell">{t.l10}</td>
              <td className={`text-right px-2 py-2 font-mono hidden md:table-cell ${t.streak.startsWith('W') ? 'text-emerald-400' : 'text-red-400'}`}>{t.streak}</td>
              <td className={`text-right px-2 py-2 font-mono hidden lg:table-cell ${t.diff.startsWith('+') ? 'text-emerald-400' : t.diff.startsWith('-') ? 'text-red-400' : 'text-zinc-400'}`}>{t.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default DivisionTable
