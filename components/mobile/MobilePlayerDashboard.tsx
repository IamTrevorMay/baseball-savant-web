'use client'

import { useState, useMemo } from 'react'
import MobileShell from '@/components/mobile/MobileShell'
import MobileStatCard from '@/components/mobile/MobileStatCard'
import MobileChartWrapper from '@/components/mobile/MobileChartWrapper'
import PlayerBadges from '@/components/PlayerBadges'
import { TEAM_COLORS } from '@/lib/constants'
import type { UsePlayerDataReturn } from '@/lib/hooks/usePlayerData'
import { toPitcherX } from '@/lib/pitcherPerspective'

// ── Types ────────────────────────────────────────────────────────────────────

type MobileTab = 'summary' | 'arsenal' | 'results' | 'gamelog' | 'ranks'

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'arsenal', label: 'Arsenal' },
  { id: 'results', label: 'Results' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'ranks', label: 'Ranks' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

function pct(n: number, d: number): string {
  return d > 0 ? (n / d * 100).toFixed(1) : '--'
}

function fmt(v: number | null, decimals = 1): string {
  return v != null ? v.toFixed(decimals) : '--'
}

// ── Summary stats computed from pitch data ───────────────────────────────────

function computeSummary(data: any[]) {
  const pas = data.filter(p => p.events).length
  const ks = data.filter(p => p.events?.includes('strikeout')).length
  const bbs = data.filter(p => p.events?.includes('walk')).length
  const hrs = data.filter(p => p.events === 'home_run').length
  const hits = data.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length
  const hbps = data.filter(p => p.events === 'hit_by_pitch').length

  const whiffs = data.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
  const swings = data.filter(p => {
    const d = (p.description || '').toLowerCase()
    return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  }).length
  const calledStrikes = data.filter(p => (p.description || '').toLowerCase() === 'called_strike').length

  // IP from outs
  const outsEvents = data.filter(p =>
    p.events &&
    !['walk', 'hit_by_pitch', 'single', 'double', 'triple', 'home_run', 'catcher_interf', 'sac_bunt', 'sac_fly_double_play'].includes(p.events) &&
    !(p.events || '').includes('error')
  )
  const outsCount = outsEvents.length
  const ipDisplay = `${Math.floor(outsCount / 3)}.${outsCount % 3}`

  // Batted ball
  const battedBalls = data.filter(p => p.bb_type != null)
  const evArr = battedBalls.map(p => p.launch_speed)
  const gbs = battedBalls.filter(p => p.bb_type === 'ground_ball').length
  const fbs = battedBalls.filter(p => p.bb_type === 'fly_ball').length
  const lds = battedBalls.filter(p => p.bb_type === 'line_drive').length
  const bbTotal = battedBalls.length || 1

  const xwobas = data.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)
  const wobas = data.map(p => p.woba_value).filter((v: any) => v != null)

  // Stuff+ / Cmd+ from the data (if present as pre-computed columns)
  const stuffArr = data.map(p => p.stuff_plus).filter((v: any) => v != null)
  const cmdArr = data.map(p => p.cmd_plus).filter((v: any) => v != null)

  const ba = pas > 0 ? hits / pas : null
  const obp = pas > 0 ? (hits + bbs + hbps) / pas : null

  // ERA approximation from earned runs proxy (delta_run_exp)
  const dres = data.map(p => p.delta_run_exp).filter((v: any) => v != null)
  const totalRE = dres.length ? dres.reduce((a: number, b: number) => a + b, 0) : null

  return {
    pitches: data.length,
    games: new Set(data.map(p => p.game_pk)).size,
    pa: pas,
    ip: ipDisplay,
    kPct: pct(ks, pas),
    bbPct: pct(bbs, pas),
    whiffPct: pct(whiffs, swings),
    csPct: pct(calledStrikes, data.length),
    hr: hrs,
    avgEV: fmt(avg(evArr)),
    gbPct: pct(gbs, bbTotal),
    fbPct: pct(fbs, bbTotal),
    ldPct: pct(lds, bbTotal),
    baOpp: fmt(ba, 3),
    obpOpp: fmt(obp, 3),
    xwOBA: fmt(avg(xwobas), 3),
    wOBA: fmt(avg(wobas), 3),
    stuffPlus: stuffArr.length ? Math.round(avg(stuffArr)!) : null,
    cmdPlus: cmdArr.length ? Math.round(avg(cmdArr)!) : null,
    totalRE: fmt(totalRE, 1),
  }
}

// ── Arsenal stats ────────────────────────────────────────────────────────────

function computeArsenal(data: any[]) {
  const groups: Record<string, any[]> = {}
  data.forEach(d => {
    if (d.pitch_name) {
      if (!groups[d.pitch_name]) groups[d.pitch_name] = []
      groups[d.pitch_name].push(d)
    }
  })

  const total = data.length
  return Object.entries(groups)
    .map(([name, pitches]) => {
      const velos = pitches.map(p => p.release_speed).filter(Boolean)
      const spins = pitches.map(p => p.release_spin_rate).filter(Boolean)
      const hb = pitches.map(p => p.pfx_x_in).filter((v: any) => v != null)
      const vb = pitches.map(p => p.pfx_z_in).filter((v: any) => v != null)

      const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
      const swings = pitches.filter(p => {
        const d = (p.description || '').toLowerCase()
        return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
      }).length

      const stuffArr = pitches.map(p => p.stuff_plus).filter((v: any) => v != null)

      return {
        name,
        count: pitches.length,
        usage: total > 0 ? (pitches.length / total * 100).toFixed(1) : '0',
        velo: fmt(avg(velos)),
        spin: avg(spins) ? Math.round(avg(spins)!) : '--',
        hBreak: fmt(avg(hb) != null ? toPitcherX(avg(hb)!) : null),
        vBreak: fmt(avg(vb)),
        whiffPct: pct(whiffs, swings),
        stuffPlus: stuffArr.length ? Math.round(avg(stuffArr)!) : null,
      }
    })
    .sort((a, b) => b.count - a.count)
}

// ── Results stats ────────────────────────────────────────────────────────────

function computeResults(data: any[]) {
  const events = data.filter(p => p.events)
  const total = events.length || 1

  const outcomes: Record<string, number> = {}
  events.forEach(p => {
    const e = p.events as string
    outcomes[e] = (outcomes[e] || 0) + 1
  })

  const sorted = Object.entries(outcomes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([event, count]) => ({
      event: event.replace(/_/g, ' '),
      count,
      pct: (count / total * 100).toFixed(1),
    }))

  // Batted ball breakdown
  const bb = data.filter(p => p.bb_type != null)
  const bbT = bb.length || 1
  const gbs = bb.filter(p => p.bb_type === 'ground_ball').length
  const fbs = bb.filter(p => p.bb_type === 'fly_ball').length
  const lds = bb.filter(p => p.bb_type === 'line_drive').length
  const pus = bb.filter(p => p.bb_type === 'popup').length

  return {
    outcomes: sorted,
    battedBall: {
      gb: pct(gbs, bbT),
      fb: pct(fbs, bbT),
      ld: pct(lds, bbT),
      pu: pct(pus, bbT),
      avgEV: fmt(avg(bb.map(p => p.launch_speed))),
      avgLA: fmt(avg(bb.map(p => p.launch_angle).filter(Boolean))),
      hardHitPct: pct(bb.filter(p => p.launch_speed >= 95).length, bbT),
    },
  }
}

// ── Game log ─────────────────────────────────────────────────────────────────

function computeGameLog(data: any[]) {
  const games: Record<string, any[]> = {}
  data.forEach(d => {
    const key = `${d.game_pk}::${d.game_date}`
    if (!games[key]) games[key] = []
    games[key].push(d)
  })

  return Object.entries(games)
    .map(([key, pitches]) => {
      const [, date] = key.split('::')
      const vs = pitches[0]?.vs_team || pitches[0]?.away_team || '--'
      const ks = pitches.filter(p => p.events?.includes('strikeout')).length
      const bbs = pitches.filter(p => p.events?.includes('walk')).length
      const hits = pitches.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length
      const pas = pitches.filter(p => p.events).length

      return {
        date: date || '--',
        vs,
        pitches: pitches.length,
        pa: pas,
        k: ks,
        bb: bbs,
        h: hits,
      }
    })
    .sort((a, b) => (b.date > a.date ? 1 : -1))
}

// ── Percentile ranks ─────────────────────────────────────────────────────────

interface RankBar {
  label: string
  value: number | null
  higherIsBetter: boolean
}

function computeRanks(data: any[]): RankBar[] {
  const velos = data.map(p => p.release_speed).filter(Boolean)
  const spins = data.map(p => p.release_spin_rate).filter(Boolean)
  const exts = data.map(p => p.release_extension).filter(Boolean)
  const evs = data.filter(p => p.bb_type != null).map(p => p.launch_speed)
  const xwobas = data.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)

  const whiffs = data.filter(p => (p.description || '').toLowerCase().includes('swinging_strike')).length
  const swings = data.filter(p => {
    const d = (p.description || '').toLowerCase()
    return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  }).length
  const pas = data.filter(p => p.events).length
  const ks = data.filter(p => p.events?.includes('strikeout')).length
  const bbs = data.filter(p => p.events?.includes('walk')).length

  const stuffArr = data.map(p => p.stuff_plus).filter((v: any) => v != null)
  const cmdArr = data.map(p => p.cmd_plus).filter((v: any) => v != null)

  return [
    { label: 'Velocity', value: avg(velos), higherIsBetter: true },
    { label: 'Spin Rate', value: avg(spins) ? Math.round(avg(spins)!) : null, higherIsBetter: true },
    { label: 'Extension', value: avg(exts) ? +avg(exts)!.toFixed(1) : null, higherIsBetter: true },
    { label: 'Whiff%', value: swings > 0 ? +(whiffs / swings * 100).toFixed(1) : null, higherIsBetter: true },
    { label: 'K%', value: pas > 0 ? +(ks / pas * 100).toFixed(1) : null, higherIsBetter: true },
    { label: 'BB%', value: pas > 0 ? +(bbs / pas * 100).toFixed(1) : null, higherIsBetter: false },
    { label: 'Avg EV Against', value: avg(evs) ? +avg(evs)!.toFixed(1) : null, higherIsBetter: false },
    { label: 'xwOBA', value: avg(xwobas) ? +avg(xwobas)!.toFixed(3) : null, higherIsBetter: false },
    { label: 'Stuff+', value: stuffArr.length ? Math.round(avg(stuffArr)!) : null, higherIsBetter: true },
    { label: 'Cmd+', value: cmdArr.length ? Math.round(avg(cmdArr)!) : null, higherIsBetter: true },
  ]
}

// ── Percentile bar color ─────────────────────────────────────────────────────

function rankColor(value: number | null): string {
  if (value == null) return 'bg-zinc-700'
  // Stuff+/Cmd+ centered at 100; other stats we just show raw
  return 'bg-emerald-500'
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  player: UsePlayerDataReturn
}

export default function MobilePlayerDashboard({ player }: Props) {
  const {
    info, loading, dataLoading, data, seasonFilteredData,
    lahmanData, seasonType, setSeasonType,
    selectedYear, setSelectedYear, availableYears, fetchData,
  } = player

  const [tab, setTab] = useState<MobileTab>('summary')

  const summary = useMemo(() => computeSummary(data), [data])
  const arsenal = useMemo(() => computeArsenal(data), [data])
  const results = useMemo(() => computeResults(data), [data])
  const gameLog = useMemo(() => computeGameLog(data), [data])
  const ranks = useMemo(() => computeRanks(data), [data])

  if (loading || !info) {
    return (
      <MobileShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-500 text-xs">Loading player...</p>
          </div>
        </div>
      </MobileShell>
    )
  }

  const teamColor = TEAM_COLORS[info.team] || '#52525b'
  const dateRange = info.first_date && info.last_date
    ? `${info.first_date} - ${info.last_date}`
    : ''

  return (
    <MobileShell title={info.player_name}>
      {/* Team color bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: teamColor }} />

      {/* Player header */}
      <div className="px-4 pt-3 pb-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: teamColor }}
          >
            {info.team}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">{info.player_name}</h2>
            {lahmanData && (
              <PlayerBadges awards={lahmanData.awards} allstars={lahmanData.allstars} hof={lahmanData.hof} />
            )}
          </div>
          {/* Season dropdown */}
          <select
            value={selectedYear ?? 'all'}
            onChange={e => {
              const v = e.target.value === 'all' ? null : parseInt(e.target.value)
              setSelectedYear(v)
              fetchData(v)
            }}
            className="bg-zinc-800 border border-zinc-700 text-white text-[11px] rounded px-2 py-1 focus:border-emerald-600 focus:outline-none shrink-0"
          >
            <option value="all">All</option>
            {(availableYears.length > 0 ? availableYears : [new Date().getFullYear()]).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Key stats row */}
        <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-400">
          <span>{seasonFilteredData.length.toLocaleString()} pitches</span>
          <span className="text-zinc-700">|</span>
          <span>{new Set(seasonFilteredData.map((r: any) => r.game_pk)).size} games</span>
          <span className="text-zinc-700">|</span>
          <span className="truncate">{dateRange}</span>
          {dataLoading && (
            <div className="w-3 h-3 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin ml-auto shrink-0" />
          )}
        </div>

        {/* Season type toggle */}
        <div className="flex gap-1 mt-2">
          {(['regular', 'postseason', 'spring', 'all'] as const).map(st => (
            <button
              key={st}
              onClick={() => setSeasonType(st)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                seasonType === st
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-500 active:bg-zinc-700'
              }`}
            >
              {st === 'regular' ? 'Reg' : st === 'postseason' ? 'Post' : st === 'spring' ? 'Spring' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar — horizontal scroll */}
      <div className="bg-zinc-900/50 border-b border-zinc-800 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                tab === t.id
                  ? 'text-emerald-400 border-emerald-400'
                  : 'text-zinc-500 border-transparent active:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 py-4">
        {tab === 'summary' && <SummaryTab summary={summary} />}
        {tab === 'arsenal' && <ArsenalTab arsenal={arsenal} />}
        {tab === 'results' && <ResultsTabContent results={results} data={data} />}
        {tab === 'gamelog' && <GameLogTabContent gameLog={gameLog} />}
        {tab === 'ranks' && <RanksTab ranks={ranks} />}
      </div>
    </MobileShell>
  )
}

// ── Tab content components ───────────────────────────────────────────────────

function SummaryTab({ summary }: { summary: ReturnType<typeof computeSummary> }) {
  return (
    <div className="space-y-3">
      {/* Top row: key counting stats */}
      <div className="grid grid-cols-3 gap-2">
        <MobileStatCard label="Pitches" value={summary.pitches.toLocaleString()} />
        <MobileStatCard label="Games" value={summary.games} />
        <MobileStatCard label="IP" value={summary.ip} />
      </div>

      {/* Rate stats */}
      <div className="grid grid-cols-2 gap-2">
        <MobileStatCard label="K%" value={`${summary.kPct}%`} accent />
        <MobileStatCard label="BB%" value={`${summary.bbPct}%`} />
        <MobileStatCard label="Whiff%" value={`${summary.whiffPct}%`} accent />
        <MobileStatCard label="CSW%" value={`${summary.csPct}%`} />
      </div>

      {/* Model metrics (if available) */}
      {(summary.stuffPlus != null || summary.cmdPlus != null) && (
        <div className="grid grid-cols-2 gap-2">
          {summary.stuffPlus != null && (
            <MobileStatCard label="Stuff+" value={summary.stuffPlus} accent />
          )}
          {summary.cmdPlus != null && (
            <MobileStatCard label="Cmd+" value={summary.cmdPlus} accent />
          )}
        </div>
      )}

      {/* Batted ball / quality */}
      <div className="grid grid-cols-2 gap-2">
        <MobileStatCard label="xwOBA" value={summary.xwOBA} />
        <MobileStatCard label="wOBA" value={summary.wOBA} />
        <MobileStatCard label="Avg EV" value={summary.avgEV} />
        <MobileStatCard label="HR" value={summary.hr} />
      </div>

      {/* Batted ball profile */}
      <div className="grid grid-cols-3 gap-2">
        <MobileStatCard label="GB%" value={`${summary.gbPct}%`} small />
        <MobileStatCard label="FB%" value={`${summary.fbPct}%`} small />
        <MobileStatCard label="LD%" value={`${summary.ldPct}%`} small />
      </div>
    </div>
  )
}

function ArsenalTab({ arsenal }: { arsenal: ReturnType<typeof computeArsenal> }) {
  return (
    <div className="space-y-3">
      {arsenal.map(pitch => (
        <div key={pitch.name} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          {/* Pitch header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">{pitch.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">{pitch.count} pitches</span>
              <span className="text-xs font-medium text-emerald-400">{pitch.usage}%</span>
            </div>
          </div>

          {/* Pitch metrics grid */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <div className="text-[9px] text-zinc-600 uppercase">Velo</div>
              <div className="text-sm font-bold text-white tabular-nums">{pitch.velo}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase">Spin</div>
              <div className="text-sm font-bold text-white tabular-nums">{pitch.spin}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase">HB</div>
              <div className="text-sm font-bold text-white tabular-nums">{pitch.hBreak}&quot;</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase">VB</div>
              <div className="text-sm font-bold text-white tabular-nums">{pitch.vBreak}&quot;</div>
            </div>
          </div>

          {/* Whiff + Stuff row */}
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-zinc-800/50">
            <div className="text-[10px] text-zinc-500">
              Whiff% <span className="text-white font-medium ml-1">{pitch.whiffPct}%</span>
            </div>
            {pitch.stuffPlus != null && (
              <div className="text-[10px] text-zinc-500">
                Stuff+ <span className="text-emerald-400 font-medium ml-1">{pitch.stuffPlus}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      {arsenal.length === 0 && (
        <p className="text-center text-zinc-500 text-sm py-8">No pitch data available</p>
      )}
    </div>
  )
}

function ResultsTabContent({ results, data }: { results: ReturnType<typeof computeResults>; data: any[] }) {
  return (
    <div className="space-y-4">
      {/* Batted ball breakdown */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Batted Ball</h3>
        <div className="grid grid-cols-2 gap-2">
          <MobileStatCard label="GB%" value={`${results.battedBall.gb}%`} />
          <MobileStatCard label="FB%" value={`${results.battedBall.fb}%`} />
          <MobileStatCard label="LD%" value={`${results.battedBall.ld}%`} />
          <MobileStatCard label="PU%" value={`${results.battedBall.pu}%`} />
          <MobileStatCard label="Avg EV" value={results.battedBall.avgEV} />
          <MobileStatCard label="Avg LA" value={`${results.battedBall.avgLA}\u00b0`} />
        </div>
        <div className="mt-2">
          <MobileStatCard label="Hard Hit%" value={`${results.battedBall.hardHitPct}%`} accent />
        </div>
      </div>

      {/* Outcome breakdown */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Outcomes</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800/50">
          {results.outcomes.map(o => (
            <div key={o.event} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-zinc-300 capitalize">{o.event}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500">{o.count}</span>
                <span className="text-xs font-medium text-white w-12 text-right tabular-nums">{o.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Batted ball scatter chart */}
      {data.filter(p => p.bb_type != null).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">EV vs Launch Angle</h3>
          <MobileChartWrapper
            title="EV vs LA"
            height={240}
            data={[{
              x: data.filter(p => p.bb_type != null).map(p => p.launch_angle),
              y: data.filter(p => p.bb_type != null).map(p => p.launch_speed),
              mode: 'markers' as const,
              type: 'scattergl' as const,
              marker: { size: 3, color: '#34d399', opacity: 0.4 },
            }]}
            layout={{
              xaxis: { title: { text: 'Launch Angle', font: { size: 10 } }, color: '#71717a', gridcolor: '#27272a' },
              yaxis: { title: { text: 'Exit Velo', font: { size: 10 } }, color: '#71717a', gridcolor: '#27272a' },
            }}
          />
        </div>
      )}
    </div>
  )
}

function GameLogTabContent({ gameLog }: { gameLog: ReturnType<typeof computeGameLog> }) {
  // Show latest 30 games
  const visible = gameLog.slice(0, 30)

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_40px_40px_32px_32px_32px_32px] gap-1 px-2 py-1 text-[9px] text-zinc-600 uppercase font-medium">
        <div>Date</div>
        <div className="text-center">vs</div>
        <div className="text-center">P</div>
        <div className="text-center">PA</div>
        <div className="text-center">K</div>
        <div className="text-center">BB</div>
        <div className="text-center">H</div>
      </div>

      {visible.map((g, i) => (
        <div
          key={`${g.date}-${i}`}
          className="grid grid-cols-[1fr_40px_40px_32px_32px_32px_32px] gap-1 px-2 py-1.5 bg-zinc-900 border border-zinc-800/50 rounded text-xs"
        >
          <div className="text-zinc-300 tabular-nums truncate">{g.date}</div>
          <div className="text-center text-zinc-400 font-medium">{g.vs}</div>
          <div className="text-center text-white tabular-nums">{g.pitches}</div>
          <div className="text-center text-zinc-400 tabular-nums">{g.pa}</div>
          <div className="text-center text-emerald-400 tabular-nums">{g.k}</div>
          <div className="text-center text-red-400 tabular-nums">{g.bb}</div>
          <div className="text-center text-zinc-300 tabular-nums">{g.h}</div>
        </div>
      ))}

      {visible.length === 0 && (
        <p className="text-center text-zinc-500 text-sm py-8">No games found</p>
      )}

      {gameLog.length > 30 && (
        <p className="text-center text-zinc-600 text-[10px] pt-2">
          Showing 30 of {gameLog.length} games
        </p>
      )}
    </div>
  )
}

function RanksTab({ ranks }: { ranks: RankBar[] }) {
  return (
    <div className="space-y-2">
      {ranks.map(r => (
        <div key={r.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-zinc-400">{r.label}</span>
            <span className="text-sm font-bold text-white tabular-nums">
              {r.value != null ? r.value : '--'}
            </span>
          </div>
          {/* Visual bar */}
          {r.value != null && (
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${rankColor(r.value)}`}
                style={{
                  width: `${Math.min(100, Math.max(5,
                    r.label.includes('+')
                      ? Math.min(r.value, 200) / 2   // Plus stats: 0-200 scale
                      : r.label === 'xwOBA'
                        ? r.value * 250                // xwOBA: 0-0.400 -> 0-100
                        : r.label === 'Avg EV Against'
                          ? (120 - r.value) * 2.5      // EV: invert, ~80-120 -> 0-100
                          : r.label === 'Velocity'
                            ? (r.value - 70) * 2.5     // Velo: 70-110 -> 0-100
                            : r.label === 'Spin Rate'
                              ? r.value / 30            // Spin: 0-3000 -> 0-100
                              : r.label === 'Extension'
                                ? (r.value - 4) * 20   // Ext: 4-9 -> 0-100
                                : r.value               // Percentages stay as-is
                  ))}%`,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
