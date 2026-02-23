'use client'
import { useState, useEffect } from 'react'

interface Team {
  id: number; name: string; abbrev: string
  w: number; l: number; pct: string; gb: string; wcGb: string
  streak: string; l10: string; home: string; away: string
  rs: number; ra: number; diff: string; divRank: string; wcRank: string
}
interface Division { division: string; divisionAbbrev: string; league: string; teams: Team[] }

const TEAM_COLORS: Record<string,string> = {
  ARI:'#A71930',ATH:'#003831',ATL:'#CE1141',BAL:'#DF4601',BOS:'#BD3039',
  CHC:'#0E3386',CIN:'#C6011F',CLE:'#00385D',COL:'#333366',CWS:'#27251F',
  DET:'#0C2340',HOU:'#002D62',KC:'#004687',LAA:'#BA0021',LAD:'#005A9C',
  MIA:'#00A3E0',MIL:'#FFC52F',MIN:'#002B5C',NYM:'#002D72',NYY:'#003087',
  OAK:'#003831',PHI:'#E81828',PIT:'#27251F',SD:'#2F241D',SEA:'#0C2C56',
  SF:'#FD5A1E',STL:'#C41E3A',TB:'#092C5C',TEX:'#003278',TOR:'#134A8E',
  WSH:'#AB0003',
}

const AL_ORDER = ['AL East','AL Central','AL West']
const NL_ORDER = ['NL East','NL Central','NL West']

export default function StandingsPage() {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState(new Date().getFullYear())
  const [view, setView] = useState<'division'|'league'|'wildcard'>('division')

  useEffect(() => { load() }, [season])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/standings?season=${season}`)
    const data = await res.json()
    if (data.divisions) setDivisions(data.divisions)
    setLoading(false)
  }

  function getDivisions(league: string) {
    const order = league === 'AL' ? AL_ORDER : NL_ORDER
    return order.map(name => {
      const abbrev = name.replace('AL ','').replace('NL ','')
      return divisions.find(d => d.divisionAbbrev === name || d.division?.includes(abbrev)) || null
    }).filter(Boolean) as Division[]
  }

  function getWildCard(league: string) {
    const leagueName = league
    const leagueDivs = divisions.filter(d => d.league === league)
    const allTeams = leagueDivs.flatMap(d => d.teams)
    // WC teams: non-division leaders sorted by record
    const divLeaders = leagueDivs.map(d => d.teams[0]?.abbrev).filter(Boolean)
    const wcTeams = allTeams
      .filter(t => !divLeaders.includes(t.abbrev))
      .sort((a, b) => b.w - a.w || a.l - b.l)
    return wcTeams
  }

  const years = Array.from({length: 11}, (_, i) => new Date().getFullYear() - i)

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <a href="/" className="font-bold text-emerald-400 text-sm hover:text-emerald-300 transition">Triton</a>
          <div className="flex gap-4 text-xs text-zinc-500">
            <a href="/standings" className="text-emerald-400">Standings</a>
            <a href="/" className="hover:text-zinc-300 transition">Pitchers</a>
            <a href="/reports" className="hover:text-zinc-300 transition">Reports</a>
            <a href="/explore" className="hover:text-zinc-300 transition">Explore</a>
            <a href="/analyst" className="hover:text-zinc-300 transition">Analyst</a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">MLB Standings</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['division','league','wildcard'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                    view === v ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>
                  {v === 'wildcard' ? 'Wild Card' : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <select value={season} onChange={e => setSeason(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-white focus:border-emerald-600 focus:outline-none">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        {view === 'division' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* American League */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">American League</h2>
              {getDivisions('AL').map(div => (
                <DivisionTable key={div.division} division={div} />
              ))}
            </div>
            {/* National League */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">National League</h2>
              {getDivisions('NL').map(div => (
                <DivisionTable key={div.division} division={div} />
              ))}
            </div>
          </div>
        )}

        {view === 'league' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">American League</h2>
              <LeagueTable teams={divisions.filter(d => d.league === 'AL').flatMap(d => d.teams).sort((a,b) => b.w - a.w || a.l - b.l)} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">National League</h2>
              <LeagueTable teams={divisions.filter(d => d.league === 'NL').flatMap(d => d.teams).sort((a,b) => b.w - a.w || a.l - b.l)} />
            </div>
          </div>
        )}

        {view === 'wildcard' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">AL Wild Card</h2>
              <WildCardTable teams={getWildCard('AL')} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">NL Wild Card</h2>
              <WildCardTable teams={getWildCard('NL')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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

function LeagueTable({ teams }: { teams: Team[] }) {
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

function WildCardTable({ teams }: { teams: Team[] }) {
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
