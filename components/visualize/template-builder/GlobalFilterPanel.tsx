'use client'

import { useState, useEffect } from 'react'
import type { GlobalFilter, GlobalFilterType } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import PlayerPicker from '@/components/visualize/PlayerPicker'

/* ── Constants ─────────────────────────────────────────────────────────────── */

const FILTER_TYPES: { value: GlobalFilterType; label: string }[] = [
  { value: 'single-player', label: 'Player' },
  { value: 'team', label: 'Team' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'depth-chart', label: 'Depth Chart' },
  { value: 'bullpen-depth-chart', label: 'Bullpen' },
  { value: 'live-game', label: 'Live Game' },
  { value: 'matchup', label: 'Matchup' },
  { value: 'player-checkin', label: 'Check-In' },
  { value: 'yesterday-scores', label: 'Scores' },
  { value: 'trends', label: 'Trends' },
]

const MLB_TEAMS = [
  'ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET',
  'HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK',
  'PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH',
]

const PITCH_TYPES = [
  { value: '', label: 'All Pitches' },
  { value: 'FF', label: 'Four-Seam' },
  { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' },
  { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' },
  { value: 'CH', label: 'Changeup' },
  { value: 'SW', label: 'Sweeper' },
  { value: 'ST', label: 'Stuff+' },
  { value: 'KC', label: 'Knuckle Curve' },
  { value: 'FS', label: 'Splitter' },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i)

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const pill = (active: boolean) =>
  `px-2.5 py-1 rounded-full text-[10px] font-medium cursor-pointer transition-colors ${
    active
      ? 'bg-emerald-600 text-white'
      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
  }`

const labelCls = 'block text-[10px] text-zinc-500 uppercase tracking-wider mb-1'
const selectCls =
  'w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-emerald-500'
const inputCls = selectCls

function seasonYear(f: GlobalFilter): number {
  return f.dateRange?.type === 'season' ? f.dateRange.year : CURRENT_YEAR
}

/* ── Component ─────────────────────────────────────────────────────────────── */

interface Props {
  globalFilter: GlobalFilter
  onChange: (filter: GlobalFilter) => void
  onFetchData: () => void
  dataLoaded?: boolean
  fetchLoading?: boolean
}

export default function GlobalFilterPanel({
  globalFilter: gf,
  onChange,
  onFetchData,
  dataLoaded = false,
  fetchLoading = false,
}: Props) {
  const [games, setGames] = useState<{ gamePk: number; label: string }[]>([])

  /* Fetch games when live-game date changes */
  useEffect(() => {
    if (gf.type !== 'live-game' || !gf.gameDate) return
    let cancelled = false
    fetch(`/api/scores?date=${gf.gameDate}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const list = (data.dates?.[0]?.games ?? data.games ?? data ?? []).map(
          (g: any) => ({
            gamePk: g.gamePk ?? g.game_pk,
            label: `${g.teams?.away?.team?.abbreviation ?? g.away ?? '?'} @ ${g.teams?.home?.team?.abbreviation ?? g.home ?? '?'}`,
          }),
        )
        setGames(list)
      })
      .catch(() => setGames([]))
    return () => { cancelled = true }
  }, [gf.type, gf.gameDate])

  /* Patch helper — merges partial into globalFilter */
  const patch = (partial: Partial<GlobalFilter>) => onChange({ ...gf, ...partial })

  /* Type change — reset type-specific fields, keep common ones */
  const changeType = (type: GlobalFilterType) => {
    const base: GlobalFilter = {
      type,
      playerType: gf.playerType ?? 'pitcher',
      dateRange: gf.dateRange ?? { type: 'season', year: CURRENT_YEAR },
    }
    onChange(base)
    setGames([])
  }

  const pType = gf.playerType ?? 'pitcher'
  const year = seasonYear(gf)

  /* ── Shared sub-sections ─────────────────────────────────────────────────── */

  const PitcherBatterToggle = ({ value, onToggle }: { value: 'pitcher' | 'batter'; onToggle: (v: 'pitcher' | 'batter') => void }) => (
    <div className="flex gap-1">
      {(['pitcher', 'batter'] as const).map((t) => (
        <button key={t} className={pill(value === t)} onClick={() => onToggle(t)}>
          {t === 'pitcher' ? 'Pitcher' : 'Batter'}
        </button>
      ))}
    </div>
  )

  const SeasonSelect = () => (
    <div>
      <span className={labelCls}>Season</span>
      <select
        className={selectCls}
        value={year}
        onChange={(e) => patch({ dateRange: { type: 'season', year: +e.target.value } })}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )

  /* ── Per-type sections ───────────────────────────────────────────────────── */

  const renderSinglePlayer = () => (
    <div className="space-y-2.5">
      <PitcherBatterToggle value={pType} onToggle={(v) => patch({ playerType: v })} />
      <div>
        <span className={labelCls}>Player</span>
        <PlayerPicker
          playerType={pType === 'batter' ? 'hitter' : 'pitcher'}
          onSelect={(id, name) => patch({ playerId: id, playerName: name })}
        />
        {gf.playerName && (
          <div className="mt-1 text-[10px] text-emerald-400">{gf.playerName}</div>
        )}
      </div>
      <SeasonSelect />
      <div>
        <span className={labelCls}>Pitch Type</span>
        <select className={selectCls} value={gf.pitchType ?? ''} onChange={(e) => patch({ pitchType: e.target.value || undefined })}>
          {PITCH_TYPES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderTeam = () => (
    <div className="space-y-2.5">
      <PitcherBatterToggle value={pType} onToggle={(v) => patch({ playerType: v })} />
      <div>
        <span className={labelCls}>Team</span>
        <select className={selectCls} value={gf.teamAbbrev ?? ''} onChange={(e) => patch({ teamAbbrev: e.target.value })}>
          <option value="">Select team...</option>
          {MLB_TEAMS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <SeasonSelect />
    </div>
  )

  const renderLeaderboard = () => (
    <div className="space-y-2.5">
      <PitcherBatterToggle value={pType} onToggle={(v) => patch({ playerType: v })} />
      <div>
        <span className={labelCls}>Stat</span>
        <select className={selectCls} value={gf.rankStat ?? ''} onChange={(e) => patch({ rankStat: e.target.value })}>
          <option value="">Select stat...</option>
          {SCENE_METRICS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <span className={labelCls}>Count</span>
          <input
            type="number"
            className={inputCls}
            value={gf.count ?? 10}
            min={1}
            max={50}
            onChange={(e) => patch({ count: +e.target.value })}
          />
        </div>
        <div>
          <span className={labelCls}>Sort</span>
          <select className={selectCls} value={gf.sortDir ?? 'desc'} onChange={(e) => patch({ sortDir: e.target.value as 'asc' | 'desc' })}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div>
          <span className={labelCls}>Min PA</span>
          <input
            type="number"
            className={inputCls}
            value={gf.minSample ?? 50}
            min={1}
            onChange={(e) => patch({ minSample: +e.target.value })}
          />
        </div>
      </div>
      <SeasonSelect />
      {/* Repeater controls */}
      <div className="border-t border-zinc-800 pt-2">
        <span className={labelCls}>Repeater</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>Direction</span>
            <select
              className={selectCls}
              value={gf.repeaterDirection ?? 'vertical'}
              onChange={(e) => patch({ repeaterDirection: e.target.value as 'vertical' | 'horizontal' })}
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </div>
          <div>
            <span className={labelCls}>Offset (px)</span>
            <input
              type="number"
              className={inputCls}
              value={gf.repeaterOffset ?? 0}
              onChange={(e) => patch({ repeaterOffset: +e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  )

  const renderLiveGame = () => (
    <div className="space-y-2.5">
      <div>
        <span className={labelCls}>Date</span>
        <input
          type="date"
          className={inputCls}
          value={gf.gameDate ?? ''}
          onChange={(e) => patch({ gameDate: e.target.value, gamePk: undefined })}
        />
      </div>
      <div>
        <span className={labelCls}>Game</span>
        <select
          className={selectCls}
          value={gf.gamePk ?? ''}
          onChange={(e) => patch({ gamePk: +e.target.value || undefined })}
        >
          <option value="">{games.length ? 'Select game...' : 'Pick a date first'}</option>
          {games.map((g) => (
            <option key={g.gamePk} value={g.gamePk}>{g.label}</option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderDepthChart = () => (
    <div className="space-y-2.5">
      <div>
        <span className={labelCls}>Team</span>
        <select className={selectCls} value={gf.teamAbbrev ?? ''} onChange={(e) => patch({ teamAbbrev: e.target.value })}>
          <option value="">Select team...</option>
          {MLB_TEAMS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <SeasonSelect />
    </div>
  )

  const renderMatchup = () => (
    <div className="space-y-3">
      {/* Player A */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Player A</span>
        <PitcherBatterToggle
          value={gf.playerA?.type ?? 'pitcher'}
          onToggle={(v) => patch({ playerA: { ...gf.playerA!, type: v } })}
        />
        <PlayerPicker
          playerType={(gf.playerA?.type ?? 'pitcher') === 'batter' ? 'hitter' : 'pitcher'}
          onSelect={(id, name) =>
            patch({ playerA: { id, name, type: gf.playerA?.type ?? 'pitcher' } })
          }
        />
        {gf.playerA?.name && (
          <div className="text-[10px] text-emerald-400">{gf.playerA.name}</div>
        )}
      </div>
      {/* Player B */}
      <div className="space-y-1.5 border-t border-zinc-800 pt-2">
        <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Player B</span>
        <PitcherBatterToggle
          value={gf.playerB?.type ?? 'batter'}
          onToggle={(v) => patch({ playerB: { ...gf.playerB!, type: v } })}
        />
        <PlayerPicker
          playerType={(gf.playerB?.type ?? 'batter') === 'batter' ? 'hitter' : 'pitcher'}
          onSelect={(id, name) =>
            patch({ playerB: { id, name, type: gf.playerB?.type ?? 'batter' } })
          }
        />
        {gf.playerB?.name && (
          <div className="text-[10px] text-emerald-400">{gf.playerB.name}</div>
        )}
      </div>
    </div>
  )

  const renderPlayerCheckin = () => (
    <div className="space-y-3">
      <PitcherBatterToggle value={pType} onToggle={(v) => patch({ playerType: v })} />
      {[0, 1, 2].map((idx) => {
        const p = gf.players?.[idx]
        return (
          <div key={idx} className="space-y-1.5 border-t border-zinc-800 pt-2">
            <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Player {idx + 1}</span>
            <PlayerPicker
              playerType={pType === 'batter' ? 'hitter' : 'pitcher'}
              onSelect={(id, name) => {
                const current = [...(gf.players || [])]
                current[idx] = { id, name, type: pType }
                patch({ players: current })
              }}
            />
            {p?.name && (
              <div className="text-[10px] text-emerald-400">{p.name}</div>
            )}
          </div>
        )
      })}
      <SeasonSelect />
    </div>
  )

  const renderYesterdayScores = () => {
    // Default to yesterday's date
    const defaultDate = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return d.toISOString().slice(0, 10)
    })()
    return (
      <div className="space-y-2.5">
        <div>
          <span className={labelCls}>Date</span>
          <input
            type="date"
            className={inputCls}
            value={gf.scoreDate ?? defaultDate}
            onChange={(e) => patch({ scoreDate: e.target.value })}
          />
        </div>
      </div>
    )
  }

  const sections: Record<GlobalFilterType, () => React.ReactNode> = {
    'single-player': renderSinglePlayer,
    team: renderTeam,
    leaderboard: renderLeaderboard,
    'depth-chart': renderDepthChart,
    'bullpen-depth-chart': renderDepthChart,
    'live-game': renderLiveGame,
    matchup: renderMatchup,
    'player-checkin': renderPlayerCheckin,
    'yesterday-scores': renderYesterdayScores,
    trends: () => (
      <div className="space-y-2.5">
        <p className="text-[11px] text-zinc-400">Fetches top surges &amp; concerns from the Trends API. No configuration needed.</p>
      </div>
    ),
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
      {/* Filter type pills */}
      <div>
        <span className={labelCls}>Filter Type</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {FILTER_TYPES.map((ft) => (
            <button key={ft.value} className={pill(gf.type === ft.value)} onClick={() => changeType(ft.value)}>
              {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contextual inputs */}
      <div className="border-t border-zinc-800 pt-2">
        {sections[gf.type]()}
      </div>

      {/* Fetch button */}
      <button
        onClick={onFetchData}
        disabled={fetchLoading}
        className="mt-1 flex items-center justify-center gap-2 w-full py-2 rounded text-xs font-semibold transition-colors bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {fetchLoading ? (
          <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : dataLoaded ? (
          <span className="w-2 h-2 rounded-full bg-green-400" />
        ) : null}
        {fetchLoading ? 'Fetching...' : 'Fetch Data'}
      </button>
    </div>
  )
}
