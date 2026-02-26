'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import ResearchNav from '@/components/ResearchNav'

/* ─── Scores Types ─── */
interface GameTeam {
  id: number; name: string; abbrev: string; score: number | null
}
interface PlayerRef { id: number; name: string }
interface Game {
  gamePk: number; gameDate: string; gameType: string; seriesDescription: string
  state: string; detailedState: string
  away: GameTeam; home: GameTeam
  inning: number | null; inningOrdinal: string | null; inningHalf: string | null
  outs: number | null; onFirst: boolean; onSecond: boolean; onThird: boolean
  pitcher: PlayerRef | null; batter: PlayerRef | null
  probableAway: PlayerRef | null; probableHome: PlayerRef | null
}

/* ─── Box Score Types ─── */
interface BoxBatter {
  id: number; name: string; boxName: string; pos: string
  ab: number; r: number; h: number; rbi: number; bb: number; so: number
  avg: string; obp: string; slg: string; hr: number
}
interface BoxPitcher {
  id: number; name: string; boxName: string
  ip: string; h: number; r: number; er: number; bb: number; so: number
  hr: number; era: string; pitches: number; strikes: number
}
interface BoxTeam {
  team: { id: number; name: string; abbrev: string }
  batting: { totals: any }
  batters: BoxBatter[]; pitchers: BoxPitcher[]
}
interface InningLine { num: number; ordinal: string; away: { runs: number | null }; home: { runs: number | null } }
interface BoxScore {
  gamePk: string; away: BoxTeam; home: BoxTeam; innings: InningLine[]
  totals: { away: { runs: number; hits: number; errors: number }; home: { runs: number; hits: number; errors: number } }
}

/* ─── News Types ─── */
interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  sourceColor: string
  description: string
  imageUrl: string | null
}

/* ─── Standings Types ─── */
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

export default function HomePage() {
  /* ─── Scores state ─── */
  const todayStr = new Date().toISOString().slice(0, 10)
  const [scoresDate, setScoresDate] = useState(todayStr)
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

  const shiftDate = (days: number) => {
    const d = new Date(scoresDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setScoresDate(d.toISOString().slice(0, 10))
  }

  const isToday = scoresDate === todayStr

  /* ─── News state ─── */
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(true)

  /* ─── Standings state ─── */
  const [divisions, setDivisions] = useState<Division[]>([])
  const [standingsLoading, setStandingsLoading] = useState(true)
  const [season, setSeason] = useState(new Date().getFullYear())
  const [view, setView] = useState<'division'|'league'|'wildcard'>('division')

  /* fetch scores on date change + auto-refresh every 30s */
  useEffect(() => {
    fetchScores(scoresDate, true)
    setSelectedGamePk(null)
    setBoxScore(null)
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(() => fetchScores(scoresDate), 30000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [scoresDate, fetchScores])

  /* fetch box score when a game is selected */
  useEffect(() => {
    if (!selectedGamePk) { setBoxScore(null); return }
    setBoxLoading(true)
    setBoxTeamSide('away')
    fetch(`/api/boxscore?gamePk=${selectedGamePk}`)
      .then(r => r.json())
      .then(d => { if (d.away) setBoxScore(d); setBoxLoading(false) })
      .catch(() => setBoxLoading(false))
  }, [selectedGamePk])

  useEffect(() => {
    fetch('/api/news').then(r => r.json()).then(d => { setNews(d.items || []); setNewsLoading(false) }).catch(() => setNewsLoading(false))
  }, [])

  useEffect(() => {
    setStandingsLoading(true)
    fetch(`/api/standings?season=${season}`).then(r => r.json()).then(d => { if (d.divisions) setDivisions(d.divisions); setStandingsLoading(false) }).catch(() => setStandingsLoading(false))
  }, [season])

  function getDivisions(league: string) {
    const order = league === 'AL' ? AL_ORDER : NL_ORDER
    return order.map(name => {
      const abbrev = name.replace('AL ','').replace('NL ','')
      return divisions.find(d => d.divisionAbbrev === name || d.division?.includes(abbrev)) || null
    }).filter(Boolean) as Division[]
  }

  function getWildCard(league: string) {
    const leagueDivs = divisions.filter(d => d.league === league)
    const allTeams = leagueDivs.flatMap(d => d.teams)
    const divLeaders = leagueDivs.map(d => d.teams[0]?.abbrev).filter(Boolean)
    return allTeams.filter(t => !divLeaders.includes(t.abbrev)).sort((a, b) => b.w - a.w || a.l - b.l)
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const years = Array.from({length: 11}, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/home" />

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ─── Scores Section ─── */}
        <div className="mb-10">
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
                <button onClick={() => setScoresDate(todayStr)}
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

        {/* ─── News Section ─── */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-1">News</h2>
          <p className="text-sm text-zinc-500 mb-6">Latest from around baseball</p>

          {newsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 animate-pulse">
                  <div className="h-3 w-20 bg-zinc-800 rounded mb-3" />
                  <div className="h-4 w-full bg-zinc-800 rounded mb-2" />
                  <div className="h-4 w-3/4 bg-zinc-800 rounded mb-3" />
                  <div className="h-3 w-full bg-zinc-800 rounded mb-1" />
                  <div className="h-3 w-2/3 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">No articles available right now.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {news.slice(0, 12).map((item, i) => (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 hover:bg-zinc-800/50 transition group block">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: item.sourceColor }}>{item.source}</span>
                    <span className="text-[11px] text-zinc-600">{timeAgo(item.pubDate)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition leading-snug mb-2 line-clamp-2">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3">{item.description}</p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ─── Standings Section ─── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">MLB Standings</h2>
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

          {standingsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {view === 'division' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">American League</h3>
                    {getDivisions('AL').map(div => <DivisionTable key={div.division} division={div} />)}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">National League</h3>
                    {getDivisions('NL').map(div => <DivisionTable key={div.division} division={div} />)}
                  </div>
                </div>
              )}

              {view === 'league' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">American League</h3>
                    <LeagueTable teams={divisions.filter(d => d.league === 'AL').flatMap(d => d.teams).sort((a,b) => b.w - a.w || a.l - b.l)} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">National League</h3>
                    <LeagueTable teams={divisions.filter(d => d.league === 'NL').flatMap(d => d.teams).sort((a,b) => b.w - a.w || a.l - b.l)} />
                  </div>
                </div>
              )}

              {view === 'wildcard' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">AL Wild Card</h3>
                    <WildCardTable teams={getWildCard('AL')} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">NL Wild Card</h3>
                    <WildCardTable teams={getWildCard('NL')} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Diamond (base runners) ─── */

function Diamond({ onFirst, onSecond, onThird, size = 20 }: { onFirst: boolean; onSecond: boolean; onThird: boolean; size?: number }) {
  const s = size
  const half = s / 2
  const baseSize = s * 0.26
  const bh = baseSize / 2
  const pad = s * 0.12
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0">
      <path d={`M${half} ${pad} L${s - pad} ${half} L${half} ${s - pad} L${pad} ${half} Z`}
        fill="none" stroke="#3f3f46" strokeWidth={0.8} />
      {/* 2nd */}
      <rect x={half - bh} y={pad - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${half} ${pad})`}
        fill={onSecond ? '#34d399' : '#27272a'} stroke={onSecond ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
      {/* 3rd */}
      <rect x={pad - bh} y={half - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${pad} ${half})`}
        fill={onThird ? '#34d399' : '#27272a'} stroke={onThird ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
      {/* 1st */}
      <rect x={s - pad - bh} y={half - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${s - pad} ${half})`}
        fill={onFirst ? '#34d399' : '#27272a'} stroke={onFirst ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
    </svg>
  )
}

/* ─── Outs indicator ─── */

function OutsDots({ outs }: { outs: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < outs ? 'bg-amber-400' : 'bg-zinc-700'}`} />
      ))}
    </div>
  )
}

/* ─── Score Card ─── */

function ScoreCard({ game, selected, onClick }: { game: Game; selected: boolean; onClick: () => void }) {
  const isLive = game.state === 'Live'
  const isFinal = game.state === 'Final'
  const isPreview = game.state === 'Preview'

  const awayWon = isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score
  const homeWon = isFinal && game.away.score !== null && game.home.score !== null && game.home.score > game.away.score

  function gameTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  let statusText = ''
  let statusColor = 'text-zinc-500'
  if (isLive) {
    statusText = `${game.inningHalf === 'Top' ? '\u25B2' : '\u25BC'} ${game.inningOrdinal || ''}`
    statusColor = 'text-emerald-400'
  } else if (isFinal) {
    statusText = game.inning && game.inning > 9 ? `Final/${game.inning}` : 'Final'
  } else if (game.detailedState === 'Postponed') {
    statusText = 'PPD'
    statusColor = 'text-red-400'
  } else {
    statusText = gameTime(game.gameDate)
  }

  const lastName = (name: string) => name.split(' ').slice(-1)[0]

  return (
    <div onClick={onClick} className={`bg-zinc-900 border rounded-lg p-4 min-w-[240px] flex-shrink-0 cursor-pointer transition ${
      selected ? 'border-emerald-500 ring-1 ring-emerald-500/30' : isLive ? 'border-emerald-700/50 hover:border-emerald-700' : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      {/* Header: status + situation */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
          {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse align-middle" />}
          {statusText}
        </span>
        {isLive && game.outs !== null && (
          <div className="flex items-center gap-2">
            <OutsDots outs={game.outs} />
            <Diamond onFirst={game.onFirst} onSecond={game.onSecond} onThird={game.onThird} />
          </div>
        )}
      </div>

      {/* Away team */}
      <div className={`flex items-center justify-between py-1 ${awayWon ? 'text-white' : 'text-zinc-400'}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ backgroundColor: TEAM_COLORS[game.away.abbrev] || '#52525b' }}>
            {game.away.abbrev}
          </div>
          <span className={`text-sm font-medium ${awayWon ? 'text-white' : ''}`}>{game.away.abbrev}</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${awayWon ? 'text-white' : ''}`}>
          {game.away.score !== null ? game.away.score : ''}
        </span>
      </div>

      {/* Home team */}
      <div className={`flex items-center justify-between py-1 ${homeWon ? 'text-white' : 'text-zinc-400'}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ backgroundColor: TEAM_COLORS[game.home.abbrev] || '#52525b' }}>
            {game.home.abbrev}
          </div>
          <span className={`text-sm font-medium ${homeWon ? 'text-white' : ''}`}>{game.home.abbrev}</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${homeWon ? 'text-white' : ''}`}>
          {game.home.score !== null ? game.home.score : ''}
        </span>
      </div>

      {/* Live: pitcher / batter */}
      {isLive && (game.pitcher || game.batter) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-0.5">
          {game.pitcher && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 font-medium shrink-0">P</span>
              <span className="text-zinc-400 truncate">{lastName(game.pitcher.name)}</span>
            </div>
          )}
          {game.batter && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 font-medium shrink-0">AB</span>
              <span className="text-zinc-400 truncate">{lastName(game.batter.name)}</span>
            </div>
          )}
        </div>
      )}

      {/* Preview: probable pitchers */}
      {isPreview && (game.probableAway || game.probableHome) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-0.5">
          {game.probableAway && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-600 font-medium">{game.away.abbrev}</span>
              <span className="text-zinc-400 truncate">{lastName(game.probableAway.name)}</span>
            </div>
          )}
          {game.probableHome && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-600 font-medium">{game.home.abbrev}</span>
              <span className="text-zinc-400 truncate">{lastName(game.probableHome.name)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
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

/* ─── Standings Sub-Components ─── */

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
