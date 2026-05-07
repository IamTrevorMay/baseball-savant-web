'use client'

import MobileShell from '@/components/mobile/MobileShell'
import MobileStatCard from '@/components/mobile/MobileStatCard'
import MobilePlayerCard from '@/components/mobile/MobilePlayerCard'
import type { useTrendsData } from '@/lib/hooks/useTrendsData'
import {
  plusColor, headshot, fmtGameLine, fmtVal, sigmaColor,
  SEASONS, PLAYER_TYPES,
} from '@/lib/hooks/useTrendsData'

interface Props {
  trends: ReturnType<typeof useTrendsData>
}

function decisionBadge(d: string) {
  if (d === 'W') return <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-1 py-0.5 rounded">W</span>
  if (d === 'L') return <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1 py-0.5 rounded">L</span>
  if (d === 'SV') return <span className="text-[9px] font-bold text-sky-400 bg-sky-500/15 px-1 py-0.5 rounded">SV</span>
  if (d === 'HLD') return <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded">HLD</span>
  return null
}

export default function MobileTrends({ trends }: Props) {
  const {
    season, setSeason, playerType, setPlayerType,
    minPitches, setMinPitches,
    loading, error, alerts,
    recentDate, latestDate,
    highlights, highlightsLoading,
    daily, dailyLoading,
    trendTab, setTrendTab,
    stuffData, stuffLoading,
    arsenalData, arsenalLoading,
    handleScan,
  } = trends

  return (
    <MobileShell title="Trends">
      <div className="px-4 py-4">
        {/* Tab pills */}
        <div className="flex gap-1 mb-4">
          {([['overview', 'Overview'], ['stuff', 'Stuff+'], ['arsenal', 'Arsenal']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTrendTab(key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
                trendTab === key ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {trendTab === 'overview' && (
          <>
            {/* Daily Highlights - loading skeleton */}
            {dailyLoading && (
              <div className="space-y-3 mb-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 animate-pulse">
                    <div className="h-3 w-20 bg-zinc-800 rounded mb-3" />
                    <div className="flex gap-3 items-center">
                      <div className="w-10 h-10 rounded-full bg-zinc-800" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 bg-zinc-800 rounded" />
                        <div className="h-2.5 w-16 bg-zinc-800/60 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Daily Highlights - Standout Cards */}
            {daily && !dailyLoading && (
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-white">Yesterday&apos;s Standouts</h2>
                  <span className="text-[10px] text-zinc-600">{daily.date}</span>
                </div>

                <div className="space-y-2">
                  {/* Stuff+ Starter */}
                  {daily.stuff_starter && (
                    <a href={`/player/${daily.stuff_starter.player_id}`}
                      className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 active:bg-zinc-800/50">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">
                        <span className="text-amber-400">Stuff+</span> Starter
                      </div>
                      <div className="flex gap-3 items-center">
                        <img src={headshot(daily.stuff_starter.player_id)} alt=""
                          className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{daily.stuff_starter.player_name}</div>
                          <div className="text-[10px] text-zinc-500">{daily.stuff_starter.team} · {daily.stuff_starter.pitch_name}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-lg font-bold font-mono ${plusColor(daily.stuff_starter.stuff_plus)}`}>
                            {daily.stuff_starter.stuff_plus}
                          </span>
                          {daily.stuff_starter.velo && (
                            <div className="text-[9px] text-zinc-600">{daily.stuff_starter.velo} mph</div>
                          )}
                        </div>
                      </div>
                      {daily.stuff_starter.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-2 flex items-center gap-1">
                          {decisionBadge(daily.stuff_starter.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.stuff_starter.game_line)}</span>
                        </div>
                      )}
                    </a>
                  )}

                  {/* Stuff+ Reliever */}
                  {daily.stuff_reliever && (
                    <a href={`/player/${daily.stuff_reliever.player_id}`}
                      className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 active:bg-zinc-800/50">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">
                        <span className="text-amber-400">Stuff+</span> Reliever
                      </div>
                      <div className="flex gap-3 items-center">
                        <img src={headshot(daily.stuff_reliever.player_id)} alt=""
                          className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{daily.stuff_reliever.player_name}</div>
                          <div className="text-[10px] text-zinc-500">{daily.stuff_reliever.team} · {daily.stuff_reliever.pitch_name}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-lg font-bold font-mono ${plusColor(daily.stuff_reliever.stuff_plus)}`}>
                            {daily.stuff_reliever.stuff_plus}
                          </span>
                          {daily.stuff_reliever.velo && (
                            <div className="text-[9px] text-zinc-600">{daily.stuff_reliever.velo} mph</div>
                          )}
                        </div>
                      </div>
                      {daily.stuff_reliever.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-2 flex items-center gap-1">
                          {decisionBadge(daily.stuff_reliever.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.stuff_reliever.game_line)}</span>
                        </div>
                      )}
                    </a>
                  )}

                  {/* Cmd+ Starter */}
                  {daily.cmd_starter && (
                    <a href={`/player/${daily.cmd_starter.player_id}`}
                      className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 active:bg-zinc-800/50">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">
                        <span className="text-sky-400">Cmd+</span> Starter
                      </div>
                      <div className="flex gap-3 items-center">
                        <img src={headshot(daily.cmd_starter.player_id)} alt=""
                          className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{daily.cmd_starter.player_name}</div>
                          <div className="text-[10px] text-zinc-500">{daily.cmd_starter.team} · {daily.cmd_starter.pitches} pitches</div>
                        </div>
                        <span className={`text-lg font-bold font-mono shrink-0 ${plusColor(daily.cmd_starter.cmd_plus)}`}>
                          {daily.cmd_starter.cmd_plus}
                        </span>
                      </div>
                      {daily.cmd_starter.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-2 flex items-center gap-1">
                          {decisionBadge(daily.cmd_starter.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.cmd_starter.game_line)}</span>
                        </div>
                      )}
                    </a>
                  )}

                  {/* Cmd+ Reliever */}
                  {daily.cmd_reliever && (
                    <a href={`/player/${daily.cmd_reliever.player_id}`}
                      className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 active:bg-zinc-800/50">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">
                        <span className="text-sky-400">Cmd+</span> Reliever
                      </div>
                      <div className="flex gap-3 items-center">
                        <img src={headshot(daily.cmd_reliever.player_id)} alt=""
                          className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{daily.cmd_reliever.player_name}</div>
                          <div className="text-[10px] text-zinc-500">{daily.cmd_reliever.team} · {daily.cmd_reliever.pitches} pitches</div>
                        </div>
                        <span className={`text-lg font-bold font-mono shrink-0 ${plusColor(daily.cmd_reliever.cmd_plus)}`}>
                          {daily.cmd_reliever.cmd_plus}
                        </span>
                      </div>
                      {daily.cmd_reliever.game_line && (
                        <div className="text-[9px] text-zinc-500 mt-2 flex items-center gap-1">
                          {decisionBadge(daily.cmd_reliever.game_line.decision)}
                          <span className="font-mono">{fmtGameLine(daily.cmd_reliever.game_line)}</span>
                        </div>
                      )}
                    </a>
                  )}

                  {/* New Pitch Alerts */}
                  {daily.new_pitches.length > 0 ? daily.new_pitches.map(np => (
                    <a key={`${np.player_id}-${np.pitch_name}`}
                      href={`/player/${np.player_id}`}
                      className="block bg-zinc-900 border border-orange-500/20 rounded-lg p-3 active:bg-zinc-800/50">
                      <div className="text-[9px] text-orange-400 uppercase tracking-wider mb-2">New Pitch Alert</div>
                      <div className="flex gap-3 items-center">
                        <img src={headshot(np.player_id)} alt=""
                          className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{np.player_name}</div>
                          <div className="text-[10px] text-zinc-500">
                            {np.team} · {np.pitch_name} ({np.count}x)
                          </div>
                        </div>
                        {np.avg_stuff_plus != null && (
                          <div className="text-right shrink-0">
                            <div className="text-[9px] text-zinc-500">Stuff+</div>
                            <span className={`text-sm font-mono font-bold ${plusColor(np.avg_stuff_plus)}`}>
                              {np.avg_stuff_plus}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3 mt-2 pt-2 border-t border-zinc-800/30 text-[10px]">
                        {np.avg_hbreak != null && (
                          <span className="text-zinc-400">HB: <span className="font-mono text-zinc-300">{np.avg_hbreak}&quot;</span></span>
                        )}
                        {np.avg_ivb != null && (
                          <span className="text-zinc-400">IVB: <span className="font-mono text-zinc-300">{np.avg_ivb}&quot;</span></span>
                        )}
                        {np.cmd_plus != null && (
                          <span className="text-zinc-400">Cmd+: <span className={`font-mono font-medium ${plusColor(np.cmd_plus)}`}>{np.cmd_plus}</span></span>
                        )}
                      </div>
                    </a>
                  )) : (
                    <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg p-4 text-center">
                      <div className="text-[9px] text-orange-400/40 uppercase tracking-wider mb-1">New Pitch Alert</div>
                      <span className="text-[11px] text-zinc-600">No new pitches for today</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Surges & Concerns */}
            {highlightsLoading && (
              <div className="space-y-4 mb-6">
                {[0, 1].map(i => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                    <div className="h-4 w-20 bg-zinc-800 rounded mb-3" />
                    {[0, 1, 2].map(j => <div key={j} className="h-10 bg-zinc-800/50 rounded mb-2" />)}
                  </div>
                ))}
              </div>
            )}
            {highlights && !highlightsLoading && (
              <div className="space-y-4 mb-6">
                {/* Surges */}
                <div className="bg-zinc-900 border border-emerald-500/20 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-emerald-500/10 flex items-center gap-2">
                    <span className="text-emerald-400 text-sm font-semibold">Surges</span>
                    <span className="text-[10px] text-zinc-600">Top performing trends</span>
                  </div>
                  <div className="divide-y divide-zinc-800/50">
                    {highlights.surges.map((h, i) => (
                      <div key={h.player_id} className="px-4 py-2.5 flex items-start gap-3">
                        <span className="text-emerald-500/50 text-xs font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium truncate">{h.player_name}</span>
                            <span className="text-[9px] text-zinc-600 uppercase">{h.type === 'pitcher' ? 'P' : 'H'}</span>
                            <span className="text-[10px] font-mono text-emerald-400 ml-auto shrink-0">
                              {h.sigma > 0 ? '+' : ''}{h.sigma.toFixed(1)}\u03C3
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{h.reason}</p>
                        </div>
                      </div>
                    ))}
                    {highlights.surges.length === 0 && (
                      <div className="px-4 py-6 text-center text-zinc-600 text-xs">No surges detected</div>
                    )}
                  </div>
                </div>

                {/* Concerns */}
                <div className="bg-zinc-900 border border-red-500/20 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-red-500/10 flex items-center gap-2">
                    <span className="text-red-400 text-sm font-semibold">Concerns</span>
                    <span className="text-[10px] text-zinc-600">Notable declines to watch</span>
                  </div>
                  <div className="divide-y divide-zinc-800/50">
                    {highlights.concerns.map((h, i) => (
                      <div key={h.player_id} className="px-4 py-2.5 flex items-start gap-3">
                        <span className="text-red-500/50 text-xs font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium truncate">{h.player_name}</span>
                            <span className="text-[9px] text-zinc-600 uppercase">{h.type === 'pitcher' ? 'P' : 'H'}</span>
                            <span className="text-[10px] font-mono text-red-400 ml-auto shrink-0">
                              {h.sigma > 0 ? '+' : ''}{h.sigma.toFixed(1)}\u03C3
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{h.reason}</p>
                        </div>
                      </div>
                    ))}
                    {highlights.concerns.length === 0 && (
                      <div className="px-4 py-6 text-center text-zinc-600 text-xs">No concerns detected</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Scan Controls */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
                    <select value={season} onChange={e => setSeason(e.target.value)}
                      className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none">
                      {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Min Pitches</label>
                    <input value={minPitches} onChange={e => setMinPitches(e.target.value)} type="number"
                      className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Player Type</label>
                  <div className="flex gap-1">
                    {PLAYER_TYPES.map(t => (
                      <button key={t} onClick={() => setPlayerType(t)}
                        className={`flex-1 py-2 text-xs rounded transition capitalize ${
                          playerType === t ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                        {t === 'pitcher' ? 'Pitchers' : 'Hitters'}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleScan} disabled={loading}
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded transition">
                  {loading ? 'Scanning...' : 'Scan'}
                </button>
              </div>
              {recentDate && (
                <div className="mt-2 text-[10px] text-zinc-600">
                  Comparing season avg vs last 14 days ({recentDate} to {latestDate})
                </div>
              )}
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm mb-4">{error}</div>}

            {/* Alert results as cards */}
            {alerts.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="text-xs text-zinc-400 font-medium px-1">
                  {alerts.length} alerts found
                </div>
                {alerts.map(a => (
                  <div key={`${a.player_id}-${a.metric}`}
                    className={`border rounded-lg p-3 ${sigmaColor(a.sigma, a.sentiment)}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white font-medium">{a.player_name}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        a.sentiment === 'good' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {a.direction === 'up' ? '\u2191' : '\u2193'}
                        {a.sentiment === 'good' ? 'Surge' : 'Concern'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mb-2">{a.metric_label}</div>
                    <div className="flex gap-4 text-[11px]">
                      <div>
                        <span className="text-zinc-500">Season: </span>
                        <span className="font-mono text-zinc-300">{fmtVal(a.metric, a.season_val)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Recent: </span>
                        <span className="font-mono text-white">{fmtVal(a.metric, a.recent_val)}</span>
                      </div>
                      <div className="ml-auto">
                        <span className="font-mono font-medium text-white">
                          {a.sigma > 0 ? '+' : ''}{a.sigma.toFixed(1)}\u03C3
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && alerts.length === 0 && !error && (
              <div className="text-center py-12 text-zinc-600 text-sm">
                Tap Scan to detect players with significant recent performance changes.
              </div>
            )}
          </>
        )}

        {/* Stuff+ Tab */}
        {trendTab === 'stuff' && (
          <div className="space-y-4">
            {stuffLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : stuffData ? (
              <>
                {/* Leaders */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-white">Stuff+ Leaders</h2>
                    <p className="text-[10px] text-zinc-500">Top 25 by avg Stuff+ ({stuffData.recentDate} - {stuffData.latestDate})</p>
                  </div>
                  <div className="divide-y divide-zinc-800/30">
                    {(stuffData.leaders || []).map((r: any, i: number) => (
                      <a key={r.player_id} href={`/player/${r.player_id}`}
                        className="flex items-center justify-between px-4 py-2.5 active:bg-zinc-800/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-zinc-600 text-xs font-mono w-5 shrink-0">{i + 1}</span>
                          <span className="text-emerald-400 text-sm font-medium truncate">{r.player_name}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-[10px] text-zinc-500 tabular-nums">{Number(r.pitches).toLocaleString()} P</span>
                          <span className={`text-sm font-mono font-bold tabular-nums ${plusColor(Number(r.avg_stuff_plus))}`}>
                            {r.avg_stuff_plus}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Gainers */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-emerald-400">Biggest Stuff+ Gainers</h2>
                    <p className="text-[10px] text-zinc-500">Recent vs season avg by pitch type</p>
                  </div>
                  <div className="divide-y divide-zinc-800/30">
                    {(stuffData.gainers || []).map((r: any) => (
                      <a key={`${r.player_id}-${r.pitch_name}`} href={`/player/${r.player_id}`}
                        className="flex items-center justify-between px-4 py-2.5 active:bg-zinc-800/30">
                        <div className="min-w-0">
                          <div className="text-sm text-white font-medium truncate">{r.player_name}</div>
                          <div className="text-[10px] text-zinc-500">{r.pitch_name}</div>
                        </div>
                        <div className="flex items-center gap-3 text-xs shrink-0 tabular-nums">
                          <span className="text-zinc-500">{r.season_stuff}</span>
                          <span className="text-white">{r.recent_stuff}</span>
                          <span className="text-emerald-400 font-bold">+{r.delta}</span>
                        </div>
                      </a>
                    ))}
                    {(!stuffData.gainers || stuffData.gainers.length === 0) && (
                      <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant gainers</div>
                    )}
                  </div>
                </div>

                {/* Losers */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-sm font-semibold text-red-400">Biggest Stuff+ Drops</h2>
                    <p className="text-[10px] text-zinc-500">Recent vs season avg by pitch type</p>
                  </div>
                  <div className="divide-y divide-zinc-800/30">
                    {(stuffData.losers || []).map((r: any) => (
                      <a key={`${r.player_id}-${r.pitch_name}`} href={`/player/${r.player_id}`}
                        className="flex items-center justify-between px-4 py-2.5 active:bg-zinc-800/30">
                        <div className="min-w-0">
                          <div className="text-sm text-white font-medium truncate">{r.player_name}</div>
                          <div className="text-[10px] text-zinc-500">{r.pitch_name}</div>
                        </div>
                        <div className="flex items-center gap-3 text-xs shrink-0 tabular-nums">
                          <span className="text-zinc-500">{r.season_stuff}</span>
                          <span className="text-white">{r.recent_stuff}</span>
                          <span className="text-red-400 font-bold">{r.delta}</span>
                        </div>
                      </a>
                    ))}
                    {(!stuffData.losers || stuffData.losers.length === 0) && (
                      <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant drops</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-zinc-600 text-sm">No Stuff+ data available</div>
            )}
          </div>
        )}

        {/* Arsenal Tab */}
        {trendTab === 'arsenal' && (
          <div className="space-y-4">
            {arsenalLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : arsenalData?.changes?.length > 0 ? (
              <>
                {(() => {
                  const veloChanges = [...arsenalData.changes].filter((r: any) => Math.abs(r.velo_delta) >= 0.5).sort((a: any, b: any) => Math.abs(b.velo_delta) - Math.abs(a.velo_delta)).slice(0, 20)
                  const moveChanges = [...arsenalData.changes].filter((r: any) => Math.abs(r.ivb_delta) >= 0.5 || Math.abs(r.hb_delta) >= 0.5).sort((a: any, b: any) => (Math.abs(b.ivb_delta) + Math.abs(b.hb_delta)) - (Math.abs(a.ivb_delta) + Math.abs(a.hb_delta))).slice(0, 20)
                  const usageChanges = [...arsenalData.changes].filter((r: any) => Math.abs(r.usage_delta) >= 3).sort((a: any, b: any) => Math.abs(b.usage_delta) - Math.abs(a.usage_delta)).slice(0, 20)
                  const deltaColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-zinc-400'
                  const fmtD = (v: number, unit: string) => `${v > 0 ? '+' : ''}${v}${unit}`

                  return (
                    <>
                      {/* Velocity Changes */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <h2 className="text-sm font-semibold text-white">Velocity Changes</h2>
                          <p className="text-[10px] text-zinc-500">Season vs recent ({arsenalData.recentDate} - {arsenalData.latestDate})</p>
                        </div>
                        {veloChanges.length > 0 ? (
                          <div className="divide-y divide-zinc-800/30">
                            {veloChanges.map((r: any) => (
                              <a key={`${r.player_id}-${r.pitch_name}-v`} href={`/player/${r.player_id}`}
                                className="flex items-center justify-between px-4 py-2.5 active:bg-zinc-800/30">
                                <div className="min-w-0">
                                  <div className="text-sm text-white font-medium truncate">{r.player_name}</div>
                                  <div className="text-[10px] text-zinc-500">{r.pitch_name}</div>
                                </div>
                                <div className="flex items-center gap-3 text-xs shrink-0 tabular-nums">
                                  <span className="text-zinc-500">{r.season_velo}</span>
                                  <span className="text-white">{r.recent_velo}</span>
                                  <span className={`font-bold ${deltaColor(r.velo_delta)}`}>{fmtD(r.velo_delta, ' mph')}</span>
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant velocity changes</div>
                        )}
                      </div>

                      {/* Movement Changes */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <h2 className="text-sm font-semibold text-white">Movement Changes</h2>
                          <p className="text-[10px] text-zinc-500">IVB and horizontal break shifts</p>
                        </div>
                        {moveChanges.length > 0 ? (
                          <div className="divide-y divide-zinc-800/30">
                            {moveChanges.map((r: any) => (
                              <a key={`${r.player_id}-${r.pitch_name}-m`} href={`/player/${r.player_id}`}
                                className="flex items-center justify-between px-4 py-2.5 active:bg-zinc-800/30">
                                <div className="min-w-0">
                                  <div className="text-sm text-white font-medium truncate">{r.player_name}</div>
                                  <div className="text-[10px] text-zinc-500">{r.pitch_name}</div>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] shrink-0 tabular-nums">
                                  <span className={`font-bold ${deltaColor(r.ivb_delta)}`}>IVB {fmtD(r.ivb_delta, '"')}</span>
                                  <span className={`font-bold ${deltaColor(r.hb_delta)}`}>HB {fmtD(r.hb_delta, '"')}</span>
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant movement changes</div>
                        )}
                      </div>

                      {/* Usage Changes */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <h2 className="text-sm font-semibold text-white">Usage Changes</h2>
                          <p className="text-[10px] text-zinc-500">Pitch mix shifts (recent vs season)</p>
                        </div>
                        {usageChanges.length > 0 ? (
                          <div className="divide-y divide-zinc-800/30">
                            {usageChanges.map((r: any) => (
                              <a key={`${r.player_id}-${r.pitch_name}-u`} href={`/player/${r.player_id}`}
                                className="flex items-center justify-between px-4 py-2.5 active:bg-zinc-800/30">
                                <div className="min-w-0">
                                  <div className="text-sm text-white font-medium truncate">{r.player_name}</div>
                                  <div className="text-[10px] text-zinc-500">{r.pitch_name}</div>
                                </div>
                                <div className="flex items-center gap-3 text-xs shrink-0 tabular-nums">
                                  <span className="text-zinc-500">{r.season_usage}%</span>
                                  <span className="text-white">{r.recent_usage}%</span>
                                  <span className={`font-bold ${deltaColor(r.usage_delta)}`}>{fmtD(r.usage_delta, '%')}</span>
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-zinc-600 text-xs">No significant usage changes</div>
                        )}
                      </div>
                    </>
                  )
                })()}
              </>
            ) : (
              <div className="text-center py-16 text-zinc-600 text-sm">
                {arsenalLoading ? '' : 'No arsenal data available'}
              </div>
            )}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
