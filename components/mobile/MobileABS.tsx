'use client'

import { useState } from 'react'
import MobileShell from '@/components/mobile/MobileShell'
import MobileStatCard from '@/components/mobile/MobileStatCard'
import type { useABSData } from '@/lib/hooks/useABSData'
import {
  GAME_TYPES, LEVELS, TABS,
  pct, rateColor, vsExpColor, missRateColor,
  type BreakdownRow, type DashboardData,
} from '@/lib/hooks/useABSData'

interface Props {
  abs: ReturnType<typeof useABSData>
}

export default function MobileABS({ abs }: Props) {
  const {
    years, year, setYear,
    gameType, setGameType,
    level, setLevel,
    tab, setTab,
    data, loading,
    syncing, syncMsg, handleSync,
    summary,
    // Daily
    dailySource, setDailySource,
    // Teams
    sortedTeams,
    // Leaderboard
    challengeType, setChallengeType,
    minChal, setMinChal,
    players, playersLoading,
    // Umpires
    umpires, umpiresLoading,
    minGames, setMinGames,
    umpireYear, setUmpireYear,
    umpireGameType, setUmpireGameType,
  } = abs

  return (
    <MobileShell title="ABS">
      <div className="px-4 py-4">
        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {years.length > 0 && (
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <div className="flex gap-1">
            {GAME_TYPES.map(gt => (
              <button key={gt.value} onClick={() => setGameType(gt.value)}
                className={`px-2 py-1.5 rounded text-[10px] transition ${
                  gameType === gt.value
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                {gt.value}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {LEVELS.map(lv => (
              <button key={lv.value} onClick={() => setLevel(lv.value)}
                className={`px-2 py-1.5 rounded text-[10px] transition ${
                  level === lv.value
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                {lv.label}
              </button>
            ))}
          </div>
          <button onClick={handleSync} disabled={syncing}
            className="px-2.5 py-1.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 transition disabled:opacity-50">
            {syncing ? '...' : 'Sync'}
          </button>
        </div>
        {syncMsg && <p className="text-[10px] text-zinc-500 mb-3">{syncMsg}</p>}

        {/* Summary cards - 2x2 grid */}
        {summary && !loading && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <MobileStatCard label="Challenges" value={summary.challenges.toLocaleString()} />
            <MobileStatCard label="Overturns" value={summary.overturns.toLocaleString()} />
            <MobileStatCard label="Overturn Rate" value={pct(summary.overturn_rate)} accent />
            <MobileStatCard label="Challenge Rate" value={pct(summary.chal_rate, 2)} />
          </div>
        )}

        {/* Tab pills */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-lg text-[11px] font-medium transition whitespace-nowrap ${
                tab === t.key ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'umpires' ? (
          <MobileUmpiresContent
            umpires={umpires} loading={umpiresLoading}
            minGames={minGames} setMinGames={setMinGames}
            umpireYear={umpireYear} setUmpireYear={setUmpireYear}
            umpireGameType={umpireGameType} setUmpireGameType={setUmpireGameType}
          />
        ) : loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : !data || (data.daily.all.length === 0 && data.teams.length === 0) ? (
          <div className="text-center py-16 text-zinc-500 text-sm">
            <p className="mb-1">No data available</p>
            <p className="text-xs">Try syncing data or selecting different filters.</p>
          </div>
        ) : (
          <>
            {tab === 'daily' && <MobileDailyContent data={data} source={dailySource} setSource={setDailySource} />}
            {tab === 'breakdowns' && <MobileBreakdownsContent data={data} />}
            {tab === 'teams' && <MobileTeamsContent teams={sortedTeams} />}
            {tab === 'leaderboard' && (
              <MobileLeaderboardContent
                players={players} loading={playersLoading}
                challengeType={challengeType} setChallengeType={setChallengeType}
                minChal={minChal} setMinChal={setMinChal}
              />
            )}
          </>
        )}
      </div>
    </MobileShell>
  )
}

// --- Daily ---

function MobileDailyContent({ data, source, setSource }: {
  data: DashboardData; source: 'all' | 'batter' | 'fielder'; setSource: (s: 'all' | 'batter' | 'fielder') => void
}) {
  const rows = data.daily[source]
  const last = rows.length > 0 ? rows[rows.length - 1] : null

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['all', 'batter', 'fielder'] as const).map(s => (
          <button key={s} onClick={() => setSource(s)}
            className={`flex-1 py-1.5 rounded text-[10px] transition ${
              source === s ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>
            {s === 'all' ? 'All' : s === 'batter' ? 'Batter' : 'Fielder'}
          </button>
        ))}
      </div>

      {last && (
        <div className="mb-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Most Recent Day</div>
          <div className="grid grid-cols-2 gap-2">
            <MobileStatCard label="Date" value={last.game_date} small />
            <MobileStatCard label="Challenges" value={last.challenges.toLocaleString()} small />
            <MobileStatCard label="Overturns" value={last.overturns.toLocaleString()} small />
            <MobileStatCard label="Overturn Rate" value={pct(last.overturn_rate)} accent small />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No daily data for this source.</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 text-[10px] text-zinc-500 font-medium">
            Daily Chart (view on desktop for interactive plot)
          </div>
          <div className="divide-y divide-zinc-800/30 max-h-[400px] overflow-y-auto">
            {[...rows].reverse().slice(0, 14).map(r => (
              <div key={r.game_date} className="px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400 font-mono">{r.game_date}</span>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-zinc-500">{r.challenges} chal</span>
                  <span className="text-zinc-300">{r.overturns} OT</span>
                  <span className={rateColor(r.overturn_rate)}>{pct(r.overturn_rate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Breakdowns ---

function MobileBreakdownsContent({ data }: { data: DashboardData }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

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
    <div className="space-y-2">
      {sections.map(sec => {
        const expanded = expandedSection === sec.title
        return (
          <div key={sec.title} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedSection(expanded ? null : sec.title)}
              className="w-full flex items-center justify-between px-4 py-3 text-left">
              <span className="text-sm font-semibold text-white">{sec.title}</span>
              <svg className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expanded && (
              <div className="px-4 pb-3 space-y-2">
                {sec.keys.map(key => {
                  const all = getRow(data.breakdown.all, key)
                  const bat = getRow(data.breakdown.batter, key)
                  const fld = getRow(data.breakdown.fielder, key)
                  return (
                    <div key={key} className="border border-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-white font-medium mb-2">{sec.labelFn(key)}</div>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <div className="text-zinc-500 mb-0.5">All</div>
                          <div className="text-zinc-300 tabular-nums">{all?.challenges ?? 0} / {all?.overturns ?? 0}</div>
                          <div className={`font-medium tabular-nums ${rateColor(all?.rate ?? null)}`}>{pct(all?.rate ?? null)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500 mb-0.5">Batter</div>
                          <div className="text-zinc-300 tabular-nums">{bat?.challenges ?? 0} / {bat?.overturns ?? 0}</div>
                          <div className={`font-medium tabular-nums ${rateColor(bat?.rate ?? null)}`}>{pct(bat?.rate ?? null)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500 mb-0.5">Fielder</div>
                          <div className="text-zinc-300 tabular-nums">{fld?.challenges ?? 0} / {fld?.overturns ?? 0}</div>
                          <div className={`font-medium tabular-nums ${rateColor(fld?.rate ?? null)}`}>{pct(fld?.rate ?? null)}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// --- Teams ---

function MobileTeamsContent({ teams }: { teams: any[] }) {
  return (
    <div className="space-y-2">
      {teams.map(t => {
        const totalFor = t.bat_for + t.fld_for
        const totalAgainst = t.bat_against + t.fld_against
        const net = totalFor - totalAgainst
        return (
          <div key={t.team_abbr} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-white">{t.team_abbr}</span>
              <span className={`text-sm font-bold tabular-nums ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                {net > 0 ? '+' : ''}{net} net
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">Bat For</span>
                <span className="text-zinc-300 tabular-nums">{t.bat_for}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Bat Against</span>
                <span className="text-zinc-300 tabular-nums">{t.bat_against}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Fld For</span>
                <span className="text-zinc-300 tabular-nums">{t.fld_for}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Fld Against</span>
                <span className="text-zinc-300 tabular-nums">{t.fld_against}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800/30 pt-1">
                <span className="text-zinc-400 font-medium">Total For</span>
                <span className="text-white font-medium tabular-nums">{totalFor}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800/30 pt-1">
                <span className="text-zinc-400 font-medium">Total Against</span>
                <span className="text-white font-medium tabular-nums">{totalAgainst}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Leaderboard ---

function MobileLeaderboardContent({ players, loading, challengeType, setChallengeType, minChal, setMinChal }: {
  players: any[]; loading: boolean
  challengeType: string; setChallengeType: (v: string) => void
  minChal: number; setMinChal: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {['batter', 'pitcher', 'catcher'].map(ct => (
          <button key={ct} onClick={() => setChallengeType(ct)}
            className={`px-2.5 py-1.5 rounded text-[10px] transition ${
              challengeType === ct
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>
            {ct.charAt(0).toUpperCase() + ct.slice(1)}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-zinc-500">Min:</span>
          <input type="number" value={minChal} onChange={e => setMinChal(Math.max(0, Number(e.target.value)))}
            className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-white focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : players.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No player data found.</p>
      ) : (
        <div className="space-y-2">
          {players.map((p, idx) => (
            <div key={p.player_id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-zinc-600 font-mono">{idx + 1}</span>
                  <span className="text-sm text-white font-medium truncate">{p.player_name}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0">{p.team_abbr}</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${vsExpColor(p.net_net_chal)}`}>
                  {p.net_net_chal != null ? (p.net_net_chal > 0 ? '+' : '') + p.net_net_chal.toFixed(1) : '\u2014'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Chal</span>
                  <span className="text-zinc-300 tabular-nums">{p.n_challenges}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">OT</span>
                  <span className="text-zinc-300 tabular-nums">{p.n_overturns}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Fails</span>
                  <span className="text-zinc-300 tabular-nums">{p.n_fails}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">OT%</span>
                  <span className="text-zinc-300 tabular-nums">{pct(p.rate_overturns)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Exp%</span>
                  <span className="text-zinc-500 tabular-nums">{pct(p.exp_rate_overturns)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">vs Exp</span>
                  <span className={`tabular-nums font-medium ${vsExpColor(p.overturns_vs_exp)}`}>
                    {p.overturns_vs_exp != null ? (p.overturns_vs_exp > 0 ? '+' : '') + p.overturns_vs_exp.toFixed(1) : '\u2014'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Umpires ---

function MobileUmpiresContent({ umpires, loading, minGames, setMinGames, umpireYear, setUmpireYear, umpireGameType, setUmpireGameType }: {
  umpires: any[]; loading: boolean
  minGames: number; setMinGames: (v: number) => void
  umpireYear: number; setUmpireYear: (v: number) => void
  umpireGameType: string; setUmpireGameType: (v: string) => void
}) {
  const pitchYears = Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <select value={umpireYear} onChange={e => setUmpireYear(Number(e.target.value))}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none">
          {pitchYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1">
          {GAME_TYPES.map(gt => (
            <button key={gt.value} onClick={() => setUmpireGameType(gt.value)}
              className={`px-2 py-1.5 rounded text-[10px] transition ${
                umpireGameType === gt.value
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}>
              {gt.value}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500">Min:</span>
          <input type="number" value={minGames} onChange={e => setMinGames(Math.max(1, Number(e.target.value)))}
            className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-white focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : umpires.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No umpire data found.</p>
      ) : (
        <div className="space-y-2">
          {umpires.map((u, idx) => (
            <a key={u.hp_umpire} href={`/umpire/${encodeURIComponent(u.hp_umpire)}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 active:bg-zinc-800/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-zinc-600 font-mono">{idx + 1}</span>
                  <span className="text-sm text-emerald-400 font-medium truncate">{u.hp_umpire}</span>
                </div>
                <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">{u.games} games</span>
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Missed</span>
                  <span className="text-zinc-300 tabular-nums">{u.missed_calls.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Miss%</span>
                  <span className={`tabular-nums font-medium ${missRateColor(u.miss_rate)}`}>{pct(u.miss_rate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">NS Miss%</span>
                  <span className={`tabular-nums font-medium ${missRateColor(u.non_shadow_miss_rate)}`}>{pct(u.non_shadow_miss_rate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Bad K</span>
                  <span className="text-zinc-300 tabular-nums">{u.bad_strikes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Bad BB</span>
                  <span className="text-zinc-300 tabular-nums">{u.bad_balls.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">OT Rate</span>
                  <span className={`tabular-nums font-medium ${
                    u.overturn_rate != null && u.overturn_rate > 0.5 ? 'text-red-400' : u.overturn_rate != null && u.overturn_rate > 0.3 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{u.overturn_rate != null ? (u.overturn_rate * 100).toFixed(1) + '%' : '\u2014'}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
