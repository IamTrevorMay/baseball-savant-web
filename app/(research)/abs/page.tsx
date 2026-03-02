'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ResearchNav from '@/components/ResearchNav'
import { BASE_LAYOUT, COLORS } from '@/components/chartConfig'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

// --- Types ---

interface FilterCombo { year: number; game_type: string; level: string }
interface DailyRow {
  game_date: string; challenges: number; overturns: number
  overturn_rate: number | null; tot_pitches: number; chal_rate: number | null
  rolling_overturn_rate_week: number | null; rolling_chal_rate_week: number | null
}
interface BreakdownRow {
  source: string; breakdown_key: string; challenges: number
  overturns: number; rate: number | null; pitches: number; chal_rate: number | null
}
interface TeamRow {
  team_abbr: string; bat_for: number; fld_for: number
  bat_against: number; fld_against: number
}
interface Summary {
  challenges: number; overturns: number; overturn_rate: number
  chal_rate: number; pitches: number
}
interface PlayerRow {
  player_id: number; player_name: string; team_abbr: string
  n_total_sample: number; n_challenges: number; n_overturns: number; n_fails: number
  n_strikeouts: number; n_walks: number
  rate_challenges: number | null; exp_rate_challenges: number | null
  rate_overturns: number | null; exp_rate_overturns: number | null
  exp_chal: number | null; net_net_chal: number | null; overturns_vs_exp: number | null
  n_challenges_against: number; n_overturns_against: number
  rate_overturns_against: number | null; net_net_chal_against: number | null
}
interface DashboardData {
  daily: { all: DailyRow[]; batter: DailyRow[]; fielder: DailyRow[] }
  breakdown: { batter: BreakdownRow[]; fielder: BreakdownRow[]; all: BreakdownRow[] }
  teams: TeamRow[]
  summary: Summary
}

interface UmpireRow {
  hp_umpire: string; games: number; called_pitches: number
  missed_calls: number; miss_rate: number | null
  bad_strikes: number; bad_balls: number
  non_shadow_pitches: number; non_shadow_missed: number; non_shadow_miss_rate: number | null
}

type Tab = 'daily' | 'breakdowns' | 'teams' | 'leaderboard' | 'umpires'
type DailySource = 'all' | 'batter' | 'fielder'
type TeamSortField = 'team_abbr' | 'bat_for' | 'fld_for' | 'total_for' | 'bat_against' | 'fld_against' | 'total_against' | 'total' | 'net'
type UmpireSortField = 'hp_umpire' | 'games' | 'called_pitches' | 'missed_calls' | 'miss_rate' | 'bad_strikes' | 'bad_balls' | 'non_shadow_missed' | 'non_shadow_miss_rate'
type PlayerSortField = 'player_name' | 'n_challenges' | 'n_overturns' | 'n_fails' | 'rate_overturns' | 'exp_rate_overturns' | 'overturns_vs_exp' | 'net_net_chal'

const GAME_TYPES = [
  { value: 'S', label: 'Spring Training' },
  { value: 'R', label: 'Regular Season' },
  { value: 'P', label: 'Postseason' },
]
const LEVELS = [
  { value: 'MLB', label: 'MLB' },
  { value: 'AAA', label: 'AAA' },
]
const TABS: { key: Tab; label: string }[] = [
  { key: 'daily', label: 'Daily Trends' },
  { key: 'breakdowns', label: 'Breakdowns' },
  { key: 'teams', label: 'Teams' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'umpires', label: 'Umpires' },
]

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—'
  return (v * 100).toFixed(digits) + '%'
}

function rateColor(rate: number | null): string {
  if (rate == null) return 'text-zinc-400'
  if (rate >= 0.5) return 'text-emerald-400'
  if (rate >= 0.3) return 'text-yellow-400'
  return 'text-red-400'
}

function vsExpColor(val: number | null): string {
  if (val == null) return 'text-zinc-400'
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-zinc-400'
}

function api(action: string, params: Record<string, unknown> = {}) {
  return fetch('/api/abs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  }).then(r => r.json())
}

// --- Sort helpers ---

function sortArrow(current: string, field: string, dir: 'asc' | 'desc') {
  if (current !== field) return ''
  return dir === 'desc' ? ' ▼' : ' ▲'
}

// --- Component ---

export default function ABSPage() {
  const [filters, setFilters] = useState<FilterCombo[]>([])
  const [year, setYear] = useState(2026)
  const [gameType, setGameType] = useState('S')
  const [level, setLevel] = useState('MLB')
  const [tab, setTab] = useState<Tab>('daily')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // Daily tab
  const [dailySource, setDailySource] = useState<DailySource>('all')

  // Teams tab
  const [teamSort, setTeamSort] = useState<TeamSortField>('net')
  const [teamDir, setTeamDir] = useState<'asc' | 'desc'>('desc')

  // Leaderboard tab
  const [challengeType, setChallengeType] = useState('batter')
  const [minChal, setMinChal] = useState(1)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playerSort, setPlayerSort] = useState<PlayerSortField>('n_challenges')
  const [playerDir, setPlayerDir] = useState<'asc' | 'desc'>('desc')

  // Umpires tab
  const [umpires, setUmpires] = useState<UmpireRow[]>([])
  const [umpiresLoading, setUmpiresLoading] = useState(false)
  const [umpireSort, setUmpireSort] = useState<UmpireSortField>('missed_calls')
  const [umpireDir, setUmpireDir] = useState<'asc' | 'desc'>('desc')
  const [minGames, setMinGames] = useState(1)

  // Load filters
  useEffect(() => {
    api('filters').then(d => {
      if (Array.isArray(d)) setFilters(d)
    })
  }, [])

  const years = useMemo(() => {
    const s = new Set(filters.map(f => f.year))
    return Array.from(s).sort((a, b) => b - a)
  }, [filters])

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('dashboard', { year, gameType, level })
      if (!d.error) setData(d)
    } finally {
      setLoading(false)
    }
  }, [year, gameType, level])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Load leaderboard
  const loadLeaderboard = useCallback(async () => {
    setPlayersLoading(true)
    try {
      const d = await api('leaderboard', { year, gameType, level, challengeType, minChal })
      if (Array.isArray(d)) setPlayers(d)
    } finally {
      setPlayersLoading(false)
    }
  }, [year, gameType, level, challengeType, minChal])

  useEffect(() => {
    if (tab === 'leaderboard') loadLeaderboard()
  }, [tab, loadLeaderboard])

  // Load umpires
  const loadUmpires = useCallback(async () => {
    setUmpiresLoading(true)
    try {
      const d = await api('umpires', { year, gameType, minGames })
      if (Array.isArray(d)) setUmpires(d)
    } finally {
      setUmpiresLoading(false)
    }
  }, [year, gameType, minGames])

  useEffect(() => {
    if (tab === 'umpires') loadUmpires()
  }, [tab, loadUmpires])

  // Sync
  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const d = await api('sync', { year, gameType, level })
      if (d.error) { setSyncMsg(`Error: ${d.error}`); return }
      setSyncMsg(`Synced: ${d.daily} daily, ${d.breakdowns} breakdowns, ${d.teams} teams`)
      loadDashboard()
      if (tab === 'leaderboard') loadLeaderboard()
    } catch (e) {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Team sort
  function handleTeamSort(field: TeamSortField) {
    if (teamSort === field) setTeamDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setTeamSort(field); setTeamDir('desc') }
  }
  const sortedTeams = useMemo(() => {
    if (!data) return []
    return [...data.teams].sort((a, b) => {
      const mul = teamDir === 'desc' ? -1 : 1
      const getVal = (r: TeamRow): number | string => {
        if (teamSort === 'team_abbr') return r.team_abbr
        if (teamSort === 'total_for') return r.bat_for + r.fld_for
        if (teamSort === 'total_against') return r.bat_against + r.fld_against
        if (teamSort === 'total') return r.bat_for + r.fld_for + r.bat_against + r.fld_against
        if (teamSort === 'net') return (r.bat_for + r.fld_for) - (r.bat_against + r.fld_against)
        return r[teamSort] as number
      }
      const av = getVal(a), bv = getVal(b)
      if (typeof av === 'string') return av.localeCompare(bv as string) * mul
      return ((av as number) - (bv as number)) * mul
    })
  }, [data, teamSort, teamDir])

  // Player sort
  function handlePlayerSort(field: PlayerSortField) {
    if (playerSort === field) setPlayerDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setPlayerSort(field); setPlayerDir('desc') }
  }
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const mul = playerDir === 'desc' ? -1 : 1
      const av = a[playerSort], bv = b[playerSort]
      if (typeof av === 'string') return (av || '').localeCompare((bv as string) || '') * mul
      return ((av as number || 0) - (bv as number || 0)) * mul
    })
  }, [players, playerSort, playerDir])

  // Umpire sort
  function handleUmpireSort(field: UmpireSortField) {
    if (umpireSort === field) setUmpireDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setUmpireSort(field); setUmpireDir('desc') }
  }
  const sortedUmpires = useMemo(() => {
    return [...umpires].sort((a, b) => {
      const mul = umpireDir === 'desc' ? -1 : 1
      const av = a[umpireSort], bv = b[umpireSort]
      if (typeof av === 'string') return (av || '').localeCompare((bv as string) || '') * mul
      return ((av as number || 0) - (bv as number || 0)) * mul
    })
  }, [umpires, umpireSort, umpireDir])

  const summary = data?.summary

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/abs" />

      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6 pb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">ABS Challenge System</h1>
            <p className="text-zinc-500 text-sm mt-1">Automated Ball-Strike challenge & overturn tracking</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Year */}
            {years.length > 0 && (
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-600 focus:outline-none">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {/* Game Type chips */}
            <div className="flex gap-1">
              {GAME_TYPES.map(gt => (
                <button key={gt.value} onClick={() => setGameType(gt.value)}
                  className={`px-2.5 py-1.5 rounded text-xs transition ${gameType === gt.value ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'}`}>
                  {gt.label}
                </button>
              ))}
            </div>
            {/* Level chips */}
            <div className="flex gap-1">
              {LEVELS.map(lv => (
                <button key={lv.value} onClick={() => setLevel(lv.value)}
                  className={`px-2.5 py-1.5 rounded text-xs transition ${level === lv.value ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'}`}>
                  {lv.label}
                </button>
              ))}
            </div>
            {/* Sync */}
            <button onClick={handleSync} disabled={syncing}
              className="px-3 py-1.5 rounded text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition disabled:opacity-50">
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>
        {syncMsg && <p className="text-xs mt-2 text-zinc-500">{syncMsg}</p>}
      </div>

      {/* Summary Cards */}
      {summary && !loading && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Total Challenges" value={summary.challenges.toLocaleString()} />
            <SummaryCard label="Total Overturns" value={summary.overturns.toLocaleString()} />
            <SummaryCard label="Overturn Rate" value={pct(summary.overturn_rate)} accent />
            <SummaryCard label="Challenge Rate" value={pct(summary.chal_rate, 2)} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium transition border-b-2 -mb-px ${tab === t.key ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-16">
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Loading ABS data...</p>
          </div>
        ) : !data || (data.daily.all.length === 0 && data.teams.length === 0) ? (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-lg mb-2">No data available</p>
            <p className="text-sm">Try syncing data or selecting different filters.</p>
          </div>
        ) : (
          <>
            {tab === 'daily' && <DailyTab data={data} source={dailySource} setSource={setDailySource} />}
            {tab === 'breakdowns' && <BreakdownsTab data={data} />}
            {tab === 'teams' && (
              <TeamsTab teams={sortedTeams} sort={teamSort} dir={teamDir} onSort={handleTeamSort} />
            )}
            {tab === 'leaderboard' && (
              <LeaderboardTab
                players={sortedPlayers} loading={playersLoading}
                challengeType={challengeType} setChallengeType={setChallengeType}
                minChal={minChal} setMinChal={setMinChal}
                sort={playerSort} dir={playerDir} onSort={handlePlayerSort}
              />
            )}
            {tab === 'umpires' && (
              <UmpiresTab
                umpires={sortedUmpires} loading={umpiresLoading}
                minGames={minGames} setMinGames={setMinGames}
                sort={umpireSort} dir={umpireDir} onSort={handleUmpireSort}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-[11px] text-zinc-500 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
    </div>
  )
}

function DailyTab({ data, source, setSource }: { data: DashboardData; source: DailySource; setSource: (s: DailySource) => void }) {
  const rows = data.daily[source]

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-zinc-500">Source:</span>
        {(['all', 'batter', 'fielder'] as DailySource[]).map(s => (
          <button key={s} onClick={() => setSource(s)}
            className={`px-2.5 py-1 rounded text-xs transition ${source === s ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'}`}>
            {s === 'all' ? 'All' : s === 'batter' ? 'Batter' : 'Fielder'}
          </button>
        ))}
      </div>

      {rows.length > 0 && (() => {
        const last = rows[rows.length - 1]
        return (
          <div className="mb-4">
            <div className="text-[11px] text-zinc-500 mb-2 font-medium uppercase tracking-wider">Most Recent Day</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Date" value={last.game_date} />
              <SummaryCard label="Challenges" value={last.challenges.toLocaleString()} />
              <SummaryCard label="Overturns" value={last.overturns.toLocaleString()} />
              <SummaryCard label="Overturn Rate" value={pct(last.overturn_rate)} accent />
            </div>
          </div>
        )
      })()}

      {rows.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No daily data for this source.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <Plot
            data={[
              // Rolling overturn rate
              {
                x: rows.map(r => r.game_date),
                y: rows.map(r => r.rolling_overturn_rate_week != null ? r.rolling_overturn_rate_week * 100 : null),
                type: 'scatter' as const, mode: 'lines' as const,
                name: '7-Day Overturn Rate',
                line: { color: COLORS.emerald, width: 2.5 },
                yaxis: 'y',
              },
              // Daily raw overturn rate dots
              {
                x: rows.map(r => r.game_date),
                y: rows.map(r => r.overturn_rate != null ? r.overturn_rate * 100 : null),
                type: 'scatter' as const, mode: 'markers' as const,
                name: 'Daily Overturn Rate',
                marker: { color: COLORS.emerald, size: 4, opacity: 0.25 },
                yaxis: 'y',
              },
              // Rolling challenge rate
              {
                x: rows.map(r => r.game_date),
                y: rows.map(r => r.rolling_chal_rate_week != null ? r.rolling_chal_rate_week * 100 : null),
                type: 'scatter' as const, mode: 'lines' as const,
                name: '7-Day Challenge Rate',
                line: { color: COLORS.amber, width: 2.5 },
                yaxis: 'y2',
              },
              // Daily raw challenge rate dots
              {
                x: rows.map(r => r.game_date),
                y: rows.map(r => r.chal_rate != null ? r.chal_rate * 100 : null),
                type: 'scatter' as const, mode: 'markers' as const,
                name: 'Daily Challenge Rate',
                marker: { color: COLORS.amber, size: 4, opacity: 0.25 },
                yaxis: 'y2',
              },
            ]}
            layout={{
              ...BASE_LAYOUT,
              title: { text: 'Daily ABS Challenge Trends', font: { size: 14, color: COLORS.textLight } },
              xaxis: { ...BASE_LAYOUT.xaxis, title: { text: 'Date', font: { size: 11 } } },
              yaxis: {
                ...BASE_LAYOUT.yaxis,
                title: { text: 'Overturn Rate %', font: { size: 11, color: COLORS.emerald } },
                side: 'left',
              },
              yaxis2: {
                ...BASE_LAYOUT.yaxis,
                title: { text: 'Challenge Rate %', font: { size: 11, color: COLORS.amber } },
                side: 'right', overlaying: 'y',
              },
              legend: { ...BASE_LAYOUT.legend, orientation: 'h' as const, y: -0.2, x: 0.5, xanchor: 'center' as const },
              margin: { ...BASE_LAYOUT.margin, b: 80 },
              height: 420,
            }}
            config={{ responsive: true, displayModeBar: false }}
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}

function BreakdownsTab({ data }: { data: DashboardData }) {
  // Group breakdowns by category — keys match Savant format
  const inningKeys = Array.from({ length: 9 }, (_, i) => `inning_${i + 1}`)
  const runnerKeys = ['nrunners_0', 'nrunners_1', 'nrunners_2', 'nrunners_3']
  const countKeys = ['count_ball3', 'count_strike2', 'count_full', 'count_other']

  const sections = [
    { title: 'By Inning', keys: inningKeys, labelFn: (k: string) => `Inning ${k.split('_')[1]}` },
    { title: 'By Runners On', keys: runnerKeys, labelFn: (k: string) => `${k.split('_')[1]} runners` },
    { title: 'By Count', keys: countKeys, labelFn: (k: string) => {
      const v = k.replace('count_', '')
      if (v === 'ball3') return '3 Balls'
      if (v === 'strike2') return '2 Strikes'
      if (v === 'full') return 'Full Count'
      return 'Other'
    }},
  ]

  function getRow(rows: BreakdownRow[], key: string) {
    return rows.find(r => r.breakdown_key === key)
  }

  return (
    <div className="space-y-6">
      {sections.map(sec => (
        <div key={sec.title} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">{sec.title}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-2 text-left text-zinc-500 font-medium w-32"></th>
                  <th className="px-3 py-2 text-center text-zinc-500 font-medium" colSpan={3}>Batter</th>
                  <th className="px-3 py-2 text-center text-zinc-500 font-medium border-l border-zinc-800" colSpan={3}>Fielder</th>
                  <th className="px-3 py-2 text-center text-zinc-500 font-medium border-l border-zinc-800" colSpan={3}>All</th>
                </tr>
                <tr className="border-b border-zinc-800 text-zinc-600">
                  <th className="px-4 py-1.5 text-left font-medium"></th>
                  {['Chal', 'Over', 'Rate', 'Chal', 'Over', 'Rate', 'Chal', 'Over', 'Rate'].map((h, i) => (
                    <th key={i} className={`px-3 py-1.5 text-center font-medium ${i === 3 || i === 6 ? 'border-l border-zinc-800' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sec.keys.map(key => {
                  const bat = getRow(data.breakdown.batter, key)
                  const fld = getRow(data.breakdown.fielder, key)
                  const all = getRow(data.breakdown.all, key)
                  return (
                    <tr key={key} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-300 font-medium">{sec.labelFn(key)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{bat?.challenges ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{bat?.overturns ?? '—'}</td>
                      <td className={`px-3 py-2 text-center tabular-nums font-medium ${rateColor(bat?.rate ?? null)}`}>{pct(bat?.rate ?? null)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400 border-l border-zinc-800">{fld?.challenges ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{fld?.overturns ?? '—'}</td>
                      <td className={`px-3 py-2 text-center tabular-nums font-medium ${rateColor(fld?.rate ?? null)}`}>{pct(fld?.rate ?? null)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400 border-l border-zinc-800">{all?.challenges ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{all?.overturns ?? '—'}</td>
                      <td className={`px-3 py-2 text-center tabular-nums font-medium ${rateColor(all?.rate ?? null)}`}>{pct(all?.rate ?? null)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function TeamsTab({ teams, sort, dir, onSort }: {
  teams: (TeamRow & { total_for?: number; total_against?: number; net?: number })[]
  sort: TeamSortField; dir: 'asc' | 'desc'; onSort: (f: TeamSortField) => void
}) {
  const th = (label: string, field: TeamSortField) => (
    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300 transition select-none whitespace-nowrap"
      onClick={() => onSort(field)}>
      {label}{sortArrow(sort, field, dir)}
    </th>
  )

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              {th('Team', 'team_abbr')}
              {th('Bat For', 'bat_for')}
              {th('Fld For', 'fld_for')}
              {th('Total For', 'total_for')}
              {th('Bat Against', 'bat_against')}
              {th('Fld Against', 'fld_against')}
              {th('Total Against', 'total_against')}
              {th('Total', 'total')}
              {th('Net', 'net')}
            </tr>
          </thead>
          <tbody>
            {teams.map(t => {
              const totalFor = t.bat_for + t.fld_for
              const totalAgainst = t.bat_against + t.fld_against
              const net = totalFor - totalAgainst
              return (
                <tr key={t.team_abbr} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-3 py-2 text-center font-medium text-white">{t.team_abbr}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{t.bat_for}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{t.fld_for}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-300 font-medium">{totalFor}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{t.bat_against}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{t.fld_against}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-zinc-300 font-medium">{totalAgainst}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-white font-bold">{totalFor + totalAgainst}</td>
                  <td className={`px-3 py-2 text-center tabular-nums font-bold ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                    {net > 0 ? '+' : ''}{net}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LeaderboardTab({ players, loading, challengeType, setChallengeType, minChal, setMinChal, sort, dir, onSort }: {
  players: PlayerRow[]; loading: boolean
  challengeType: string; setChallengeType: (v: string) => void
  minChal: number; setMinChal: (v: number) => void
  sort: PlayerSortField; dir: 'asc' | 'desc'; onSort: (f: PlayerSortField) => void
}) {
  const th = (label: string, field: PlayerSortField) => (
    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300 transition select-none whitespace-nowrap"
      onClick={() => onSort(field)}>
      {label}{sortArrow(sort, field, dir)}
    </th>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-zinc-500">Type:</span>
        {['batter', 'pitcher', 'catcher'].map(ct => (
          <button key={ct} onClick={() => setChallengeType(ct)}
            className={`px-2.5 py-1 rounded text-xs transition ${challengeType === ct ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'}`}>
            {ct === 'batter' ? 'Batter' : ct === 'pitcher' ? 'Pitcher' : 'Catcher'}
          </button>
        ))}
        <span className="text-xs text-zinc-500 ml-2">Min Challenges:</span>
        <input type="number" value={minChal} onChange={e => setMinChal(Math.max(0, Number(e.target.value)))}
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-600 focus:outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : players.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No player data found.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  {th('Player', 'player_name')}
                  <th className="px-3 py-2 text-center font-medium">Team</th>
                  {th('Challenges', 'n_challenges')}
                  {th('Overturns', 'n_overturns')}
                  {th('Fails', 'n_fails')}
                  {th('Overturn %', 'rate_overturns')}
                  {th('Exp %', 'exp_rate_overturns')}
                  {th('vs Expected', 'overturns_vs_exp')}
                  {th('Net', 'net_net_chal')}
                </tr>
              </thead>
              <tbody>
                {players.map((p, idx) => (
                  <tr key={p.player_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 text-zinc-600 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 text-left text-white font-medium whitespace-nowrap">{p.player_name}</td>
                    <td className="px-3 py-2 text-center text-zinc-400">{p.team_abbr}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-300">{p.n_challenges}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-300">{p.n_overturns}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{p.n_fails}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-300">{pct(p.rate_overturns)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-500">{pct(p.exp_rate_overturns)}</td>
                    <td className={`px-3 py-2 text-center tabular-nums font-medium ${vsExpColor(p.overturns_vs_exp)}`}>
                      {p.overturns_vs_exp != null ? (p.overturns_vs_exp > 0 ? '+' : '') + p.overturns_vs_exp.toFixed(1) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums font-bold ${vsExpColor(p.net_net_chal)}`}>
                      {p.net_net_chal != null ? (p.net_net_chal > 0 ? '+' : '') + p.net_net_chal.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function missRateColor(rate: number | null): string {
  if (rate == null) return 'text-zinc-400'
  if (rate <= 0.05) return 'text-emerald-400'
  if (rate <= 0.08) return 'text-yellow-400'
  return 'text-red-400'
}

function UmpiresTab({ umpires, loading, minGames, setMinGames, sort, dir, onSort }: {
  umpires: UmpireRow[]; loading: boolean
  minGames: number; setMinGames: (v: number) => void
  sort: UmpireSortField; dir: 'asc' | 'desc'; onSort: (f: UmpireSortField) => void
}) {
  const th = (label: string, field: UmpireSortField) => (
    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300 transition select-none whitespace-nowrap"
      onClick={() => onSort(field)}>
      {label}{sortArrow(sort, field, dir)}
    </th>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-zinc-500">Min Games:</span>
        <input type="number" value={minGames} onChange={e => setMinGames(Math.max(1, Number(e.target.value)))}
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-600 focus:outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : umpires.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No umpire data found.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  {th('Umpire', 'hp_umpire')}
                  {th('Games', 'games')}
                  {th('Called Pitches', 'called_pitches')}
                  {th('Missed Calls', 'missed_calls')}
                  {th('Miss Rate', 'miss_rate')}
                  {th('Bad Strikes', 'bad_strikes')}
                  {th('Bad Balls', 'bad_balls')}
                  {th('Non-Shadow Missed', 'non_shadow_missed')}
                  {th('NS Miss Rate', 'non_shadow_miss_rate')}
                </tr>
              </thead>
              <tbody>
                {umpires.map((u, idx) => (
                  <tr key={u.hp_umpire} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 text-zinc-600 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      <a href={`/umpire/${encodeURIComponent(u.hp_umpire)}`}
                        className="text-emerald-400 hover:text-emerald-300 font-medium transition">
                        {u.hp_umpire}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{u.games}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{u.called_pitches.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-300 font-medium">{u.missed_calls.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-center tabular-nums font-medium ${missRateColor(u.miss_rate)}`}>{pct(u.miss_rate)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{u.bad_strikes.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{u.bad_balls.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-300 font-medium">{u.non_shadow_missed.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-center tabular-nums font-medium ${missRateColor(u.non_shadow_miss_rate)}`}>{pct(u.non_shadow_miss_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
