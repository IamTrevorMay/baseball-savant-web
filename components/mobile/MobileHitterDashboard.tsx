'use client'

import { useState, useMemo } from 'react'
import MobileShell from '@/components/mobile/MobileShell'
import MobileStatCard from '@/components/mobile/MobileStatCard'
import MobileChartWrapper from '@/components/mobile/MobileChartWrapper'
import PlayerBadges from '@/components/PlayerBadges'
import { TEAM_COLORS } from '@/lib/constants'
import type { UseHitterDataReturn } from '@/lib/hooks/useHitterData'

// ── Types ────────────────────────────────────────────────────────────────────

type MobileTab = 'summary' | 'platedisc' | 'results' | 'gamelog' | 'splits'

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'platedisc', label: 'Plate Disc' },
  { id: 'results', label: 'Results' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'splits', label: 'Splits' },
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

function fmtBA(v: number | null): string {
  if (v == null) return '--'
  return v.toFixed(3).replace(/^0/, '')
}

// ── Summary stats computed from pitch data ───────────────────────────────────

function computeSummary(data: any[]) {
  const events = data.filter(p => p.events)
  const pa = events.length
  const hits = events.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length
  const singles = events.filter(p => p.events === 'single').length
  const doubles = events.filter(p => p.events === 'double').length
  const triples = events.filter(p => p.events === 'triple').length
  const hrs = events.filter(p => p.events === 'home_run').length
  const walks = events.filter(p => p.events === 'walk').length
  const hbps = events.filter(p => p.events === 'hit_by_pitch').length
  const ks = events.filter(p => p.events?.includes('strikeout')).length
  const sacFlies = events.filter(p => p.events === 'sac_fly').length
  const sacBunts = events.filter(p => p.events === 'sac_bunt').length

  // AB = PA - BB - HBP - sac_fly - sac_bunt
  const ab = pa - walks - hbps - sacFlies - sacBunts
  const totalBases = singles + doubles * 2 + triples * 3 + hrs * 4

  const battedBalls = data.filter(p => p.launch_speed != null)
  const evArr = battedBalls.map(p => p.launch_speed)
  const laArr = battedBalls.map(p => p.launch_angle).filter(Boolean)
  const hardHit = battedBalls.filter(p => p.launch_speed >= 95).length
  const barrels = battedBalls.filter(p => p.launch_speed_angle === 6).length

  const whiffs = data.filter(p => {
    const d = (p.description || '').toLowerCase()
    return d.includes('swinging_strike')
  }).length
  const swings = data.filter(p => {
    const d = (p.description || '').toLowerCase()
    return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  }).length

  // Chase rate: swings at pitches outside zone / pitches outside zone
  // Zones 11-14 are outside the strike zone
  const outsideZone = data.filter(p => p.zone != null && p.zone >= 11 && p.zone <= 14)
  const chasePitches = outsideZone.filter(p => {
    const d = (p.description || '').toLowerCase()
    return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  }).length

  return {
    pitches: data.length,
    games: new Set(data.map(p => p.game_pk)).size,
    pa,
    ab,
    hits,
    hrs,
    walks,
    ks,
    avg: ab > 0 ? hits / ab : null,
    obp: pa > 0 ? (hits + walks + hbps) / pa : null,
    slg: ab > 0 ? totalBases / ab : null,
    ops: (pa > 0 && ab > 0) ? ((hits + walks + hbps) / pa) + (totalBases / ab) : null,
    avgEV: avg(evArr),
    avgLA: avg(laArr),
    hardHitPct: pct(hardHit, battedBalls.length),
    barrelPct: pct(barrels, battedBalls.length),
    kPct: pct(ks, pa),
    bbPct: pct(walks, pa),
    whiffPct: pct(whiffs, swings),
    chasePct: pct(chasePitches, outsideZone.length),
  }
}

// ── Plate Discipline stats ──────────────────────────────────────────────────

function computePlateDiscipline(data: any[]) {
  // Zone contact: swings in zone that result in contact / swings in zone
  const inZone = data.filter(p => p.zone != null && p.zone >= 1 && p.zone <= 9)
  const outsideZone = data.filter(p => p.zone != null && p.zone >= 11 && p.zone <= 14)

  const isSwing = (p: any) => {
    const d = (p.description || '').toLowerCase()
    return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  }
  const isContact = (p: any) => {
    const d = (p.description || '').toLowerCase()
    return d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  }
  const isWhiff = (p: any) => (p.description || '').toLowerCase().includes('swinging_strike')

  const zoneSwings = inZone.filter(isSwing).length
  const zoneContact = inZone.filter(isContact).length
  const zoneWhiffs = inZone.filter(isWhiff).length
  const chaseSwings = outsideZone.filter(isSwing).length
  const chaseContact = outsideZone.filter(isContact).length
  const chaseWhiffs = outsideZone.filter(isWhiff).length

  // Pitch type breakdown
  const pitchGroups: Record<string, any[]> = {}
  data.forEach(d => {
    if (d.pitch_name) {
      if (!pitchGroups[d.pitch_name]) pitchGroups[d.pitch_name] = []
      pitchGroups[d.pitch_name].push(d)
    }
  })

  const total = data.length
  const pitchTypes = Object.entries(pitchGroups)
    .map(([name, pitches]) => {
      const swings = pitches.filter(isSwing).length
      const whiffs = pitches.filter(isWhiff).length
      const contacts = pitches.filter(isContact).length
      const velos = pitches.map(p => p.release_speed).filter(Boolean)
      return {
        name,
        count: pitches.length,
        usage: total > 0 ? (pitches.length / total * 100).toFixed(1) : '0',
        avgVelo: fmt(avg(velos)),
        swingPct: pct(swings, pitches.length),
        whiffPct: pct(whiffs, swings),
        contactPct: pct(contacts, swings),
      }
    })
    .sort((a, b) => b.count - a.count)

  return {
    zoneSwingPct: pct(zoneSwings, inZone.length),
    zoneContactPct: pct(zoneContact, zoneSwings),
    zoneWhiffPct: pct(zoneWhiffs, zoneSwings),
    chasePct: pct(chaseSwings, outsideZone.length),
    chaseContactPct: pct(chaseContact, chaseSwings),
    chaseWhiffPct: pct(chaseWhiffs, chaseSwings),
    oSwingPct: pct(chaseSwings, outsideZone.length),
    zSwingPct: pct(zoneSwings, inZone.length),
    pitchTypes,
  }
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
  const bb = data.filter(p => p.launch_speed != null)
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
      const vs = pitches[0]?.vs_team || pitches[0]?.home_team || '--'
      const events = pitches.filter(p => p.events)
      const pa = events.length
      const hits = events.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length
      const ks = events.filter(p => p.events?.includes('strikeout')).length
      const bbs = events.filter(p => p.events === 'walk').length
      const hrs = events.filter(p => p.events === 'home_run').length

      return { date: date || '--', vs, pa, h: hits, k: ks, bb: bbs, hr: hrs }
    })
    .sort((a, b) => (b.date > a.date ? 1 : -1))
}

// ── Splits ───────────────────────────────────────────────────────────────────

function computeSplits(data: any[]) {
  const compute = (subset: any[]) => {
    const events = subset.filter(p => p.events)
    const pa = events.length
    const hits = events.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events)).length
    const singles = events.filter(p => p.events === 'single').length
    const doubles = events.filter(p => p.events === 'double').length
    const triples = events.filter(p => p.events === 'triple').length
    const hrs = events.filter(p => p.events === 'home_run').length
    const walks = events.filter(p => p.events === 'walk').length
    const hbps = events.filter(p => p.events === 'hit_by_pitch').length
    const ks = events.filter(p => p.events?.includes('strikeout')).length
    const sacFlies = events.filter(p => p.events === 'sac_fly').length
    const sacBunts = events.filter(p => p.events === 'sac_bunt').length

    const ab = pa - walks - hbps - sacFlies - sacBunts
    const tb = singles + doubles * 2 + triples * 3 + hrs * 4

    return {
      pa,
      avg: ab > 0 ? hits / ab : null,
      obp: pa > 0 ? (hits + walks + hbps) / pa : null,
      slg: ab > 0 ? tb / ab : null,
      ops: (pa > 0 && ab > 0) ? ((hits + walks + hbps) / pa) + (tb / ab) : null,
      kPct: pct(ks, pa),
      bbPct: pct(walks, pa),
    }
  }

  const vsL = data.filter(p => p.p_throws === 'L')
  const vsR = data.filter(p => p.p_throws === 'R')

  return {
    vsLHP: compute(vsL),
    vsRHP: compute(vsR),
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  hitter: UseHitterDataReturn
}

export default function MobileHitterDashboard({ hitter }: Props) {
  const {
    info, loading, dataLoading, data, seasonFilteredData,
    lahmanData, seasonType, setSeasonType,
    selectedYear, setSelectedYear, availableYears, fetchData,
  } = hitter

  const [tab, setTab] = useState<MobileTab>('summary')

  const summary = useMemo(() => computeSummary(data), [data])
  const discipline = useMemo(() => computePlateDiscipline(data), [data])
  const results = useMemo(() => computeResults(data), [data])
  const gameLog = useMemo(() => computeGameLog(data), [data])
  const splits = useMemo(() => computeSplits(data), [data])

  if (loading || !info) {
    return (
      <MobileShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-500 text-xs">Loading hitter...</p>
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
      <div className="h-[1.5px] w-full" style={{ backgroundColor: teamColor }} />

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
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-500">Bats: {info.bats || '--'}</span>
              {lahmanData && (
                <PlayerBadges awards={lahmanData.awards} allstars={lahmanData.allstars} hof={lahmanData.hof} />
              )}
            </div>
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
        {tab === 'platedisc' && <PlateDiscTab discipline={discipline} />}
        {tab === 'results' && <ResultsTabContent results={results} data={data} />}
        {tab === 'gamelog' && <GameLogTabContent gameLog={gameLog} />}
        {tab === 'splits' && <SplitsTab splits={splits} />}
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
        <MobileStatCard label="Pitches Seen" value={summary.pitches.toLocaleString()} />
        <MobileStatCard label="Games" value={summary.games} />
        <MobileStatCard label="PA" value={summary.pa} />
      </div>

      {/* Rate stats */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Rate Stats</h3>
        <div className="grid grid-cols-2 gap-2">
          <MobileStatCard label="AVG" value={fmtBA(summary.avg)} accent />
          <MobileStatCard label="OBP" value={fmtBA(summary.obp)} />
          <MobileStatCard label="SLG" value={fmtBA(summary.slg)} accent />
          <MobileStatCard label="OPS" value={fmtBA(summary.ops)} />
        </div>
      </div>

      {/* Batted ball quality */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Batted Ball Quality</h3>
        <div className="grid grid-cols-2 gap-2">
          <MobileStatCard label="Avg EV" value={fmt(summary.avgEV)} accent />
          <MobileStatCard label="Avg LA" value={`${fmt(summary.avgLA)}\u00b0`} />
          <MobileStatCard label="Hard Hit%" value={`${summary.hardHitPct}%`} accent />
          <MobileStatCard label="Barrel%" value={`${summary.barrelPct}%`} />
        </div>
      </div>

      {/* Discipline */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Discipline</h3>
        <div className="grid grid-cols-2 gap-2">
          <MobileStatCard label="K%" value={`${summary.kPct}%`} />
          <MobileStatCard label="BB%" value={`${summary.bbPct}%`} accent />
          <MobileStatCard label="Whiff%" value={`${summary.whiffPct}%`} />
          <MobileStatCard label="Chase%" value={`${summary.chasePct}%`} />
        </div>
      </div>
    </div>
  )
}

function PlateDiscTab({ discipline }: { discipline: ReturnType<typeof computePlateDiscipline> }) {
  return (
    <div className="space-y-4">
      {/* Zone discipline */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Zone Discipline</h3>
        <div className="grid grid-cols-2 gap-2">
          <MobileStatCard label="Z-Swing%" value={`${discipline.zoneSwingPct}%`} accent />
          <MobileStatCard label="Z-Contact%" value={`${discipline.zoneContactPct}%`} accent />
          <MobileStatCard label="Z-Whiff%" value={`${discipline.zoneWhiffPct}%`} />
          <MobileStatCard label="O-Swing% (Chase)" value={`${discipline.oSwingPct}%`} />
          <MobileStatCard label="Chase Contact%" value={`${discipline.chaseContactPct}%`} />
          <MobileStatCard label="Chase Whiff%" value={`${discipline.chaseWhiffPct}%`} />
        </div>
      </div>

      {/* Pitch type breakdown */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">By Pitch Type</h3>
        <div className="space-y-2">
          {discipline.pitchTypes.map(pt => (
            <div key={pt.name} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              {/* Pitch header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{pt.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">{pt.count} pitches</span>
                  <span className="text-xs font-medium text-emerald-400">{pt.usage}%</span>
                </div>
              </div>

              {/* Pitch metrics grid */}
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <div className="text-[9px] text-zinc-600 uppercase">Avg Velo</div>
                  <div className="text-sm font-bold text-white tabular-nums">{pt.avgVelo}</div>
                </div>
                <div>
                  <div className="text-[9px] text-zinc-600 uppercase">Swing%</div>
                  <div className="text-sm font-bold text-white tabular-nums">{pt.swingPct}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-zinc-600 uppercase">Whiff%</div>
                  <div className="text-sm font-bold text-white tabular-nums">{pt.whiffPct}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-zinc-600 uppercase">Contact%</div>
                  <div className="text-sm font-bold text-white tabular-nums">{pt.contactPct}%</div>
                </div>
              </div>
            </div>
          ))}

          {discipline.pitchTypes.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">No pitch data available</p>
          )}
        </div>
      </div>
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
          <MobileStatCard label="LD%" value={`${results.battedBall.ld}%`} accent />
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

      {/* EV vs Launch Angle scatter chart */}
      {data.filter(p => p.launch_speed != null).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">EV vs Launch Angle</h3>
          <MobileChartWrapper
            title="EV vs LA"
            height={240}
            data={[{
              x: data.filter(p => p.launch_speed != null).map(p => p.launch_angle),
              y: data.filter(p => p.launch_speed != null).map(p => p.launch_speed),
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
  const visible = gameLog.slice(0, 30)

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_40px_32px_32px_32px_32px_32px] gap-1 px-2 py-1 text-[9px] text-zinc-600 uppercase font-medium">
        <div>Date</div>
        <div className="text-center">vs</div>
        <div className="text-center">PA</div>
        <div className="text-center">H</div>
        <div className="text-center">K</div>
        <div className="text-center">BB</div>
        <div className="text-center">HR</div>
      </div>

      {visible.map((g, i) => (
        <div
          key={`${g.date}-${i}`}
          className="grid grid-cols-[1fr_40px_32px_32px_32px_32px_32px] gap-1 px-2 py-1.5 bg-zinc-900 border border-zinc-800/50 rounded text-xs"
        >
          <div className="text-zinc-300 tabular-nums truncate">{g.date}</div>
          <div className="text-center text-zinc-400 font-medium">{g.vs}</div>
          <div className="text-center text-white tabular-nums">{g.pa}</div>
          <div className="text-center text-emerald-400 tabular-nums">{g.h}</div>
          <div className="text-center text-red-400 tabular-nums">{g.k}</div>
          <div className="text-center text-zinc-300 tabular-nums">{g.bb}</div>
          <div className="text-center text-yellow-400 tabular-nums">{g.hr}</div>
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

function SplitsTab({ splits }: { splits: ReturnType<typeof computeSplits> }) {
  return (
    <div className="space-y-4">
      <SplitCard label="vs LHP" stats={splits.vsLHP} />
      <SplitCard label="vs RHP" stats={splits.vsRHP} />
    </div>
  )
}

function SplitCard({ label, stats }: {
  label: string
  stats: {
    pa: number
    avg: number | null
    obp: number | null
    slg: number | null
    ops: number | null
    kPct: string
    bbPct: string
  }
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-[10px] text-zinc-500">{stats.pa} PA</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-zinc-600 uppercase">AVG</div>
          <div className="text-sm font-bold text-white tabular-nums">{fmtBA(stats.avg)}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-600 uppercase">OPS</div>
          <div className="text-sm font-bold text-emerald-400 tabular-nums">{fmtBA(stats.ops)}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-600 uppercase">K%</div>
          <div className="text-sm font-bold text-white tabular-nums">{stats.kPct}%</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-600 uppercase">BB%</div>
          <div className="text-sm font-bold text-white tabular-nums">{stats.bbPct}%</div>
        </div>
      </div>

      {/* OBP / SLG detail row */}
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-zinc-800/50">
        <div className="text-[10px] text-zinc-500">
          OBP <span className="text-white font-medium ml-1">{fmtBA(stats.obp)}</span>
        </div>
        <div className="text-[10px] text-zinc-500">
          SLG <span className="text-white font-medium ml-1">{fmtBA(stats.slg)}</span>
        </div>
      </div>
    </div>
  )
}
