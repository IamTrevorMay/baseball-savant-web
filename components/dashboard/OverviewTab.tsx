'use client'
import { useState } from 'react'
import PercentileRankings from '../charts/PercentileRankings'
import MovementProfile from '../charts/MovementProfile'
import PitchLocationCards from '../charts/PitchLocationCards'
import { calcTraditionalByYear, calcAdvancedByYear, calcArsenal } from '@/lib/pitcherStats'
import type { LahmanPitchingSeason } from '@/lib/lahman-stats'
import Tip from '@/components/Tip'
import { getColumns, formatMetric, getCellColor, calcTotalsFromRegistry } from '@/lib/metricRegistry'

interface Props { data: any[]; info: any; mlbStats?: any[]; lahmanPitching?: LahmanPitchingSeason[]; sosScores?: Record<number, { sos: number }> }

type StatsMode = 'traditional' | 'advanced' | 'arsenal'

export default function OverviewTab({ data, info, mlbStats = [], lahmanPitching = [], sosScores = {} }: Props) {
  const [mode, setMode] = useState<StatsMode>('traditional')

  const tradRows = calcTraditionalByYear(data)
  const advRows = calcAdvancedByYear(data)
  const arsenalRows = calcArsenal(data)

  // Build Lahman-only rows for years without Statcast data
  const statcastYears = new Set(tradRows.map(r => r.year))
  const lahmanOnlyRows = lahmanPitching
    .filter(s => !statcastYears.has(s.year))
    .map(s => ({
      year: s.year, pitches: 0, games: s.g ?? 0, pa: s.bfp ?? 0,
      ip: s.ipouts != null ? `${Math.floor(s.ipouts / 3)}.${s.ipouts % 3}` : '—',
      h: s.h ?? 0, '2b': 0, '3b': 0, hr: s.hr ?? 0, bb: s.bb ?? 0, k: s.so ?? 0, hbp: s.hbp ?? 0,
      ba: '—', obp: '—', slg: '—',
      kPct: s.bfp && s.bfp > 0 ? (((s.so ?? 0) / s.bfp) * 100).toFixed(1) : '—',
      bbPct: s.bfp && s.bfp > 0 ? (((s.bb ?? 0) / s.bfp) * 100).toFixed(1) : '—',
      whiffPct: '—', csPct: '—',
      w: s.w ?? '—', l: s.l ?? '—',
      era: s.era != null ? s.era.toFixed(2) : '—',
      sv: s.sv ?? '—', gs: s.gs ?? '—',
      whip: s.whip != null ? s.whip.toFixed(2) : '—',
      _lahmanOnly: true,
    }))

  // Merge MLB official stats into traditional rows
  const mergedTradRows = [
    ...tradRows.map(r => {
      const mlb = mlbStats.find((s: any) => Number(s.year) === r.year)
      const lahman = lahmanPitching.find(s => s.year === r.year)
      return {
        ...r,
        w: mlb?.w ?? lahman?.w ?? "—",
        l: mlb?.l ?? lahman?.l ?? "—",
        era: mlb?.era ?? (lahman?.era != null ? lahman.era.toFixed(2) : "—"),
        sv: mlb?.sv ?? lahman?.sv ?? "—",
        gs: mlb?.gs ?? lahman?.gs ?? "—",
        whip: mlb?.whip ?? (lahman?.whip != null ? lahman.whip.toFixed(2) : "—"),
      }
    }),
    ...lahmanOnlyRows,
  ].sort((a, b) => b.year - a.year)

  const mergedAdvRows = advRows.map(r => {
    const mlb = mlbStats.find((s: any) => Number(s.year) === r.year)
    const lahman = lahmanPitching.find(s => s.year === r.year)
    const sos = sosScores[r.year]
    return {
      ...r,
      k9: mlb?.k9 ?? (lahman?.k9 != null ? lahman.k9.toFixed(1) : "—"),
      bb9: mlb?.bb9 ?? (lahman?.bb9 != null ? lahman.bb9.toFixed(1) : "—"),
      hr9: mlb?.hr9 ?? (lahman?.hr9 != null ? lahman.hr9.toFixed(1) : "—"),
      sos: sos?.sos != null ? sos.sos.toFixed(1) : '—',
    }
  })


  const tradCols = getColumns('pitcher:traditional')
  const advCols = getColumns('pitcher:advanced')
  const arsenalCols = getColumns('pitcher:arsenal')

  const activeRows = mode === 'traditional' ? mergedTradRows : mode === 'advanced' ? mergedAdvRows : arsenalRows
  const activeCols = mode === 'traditional' ? tradCols : mode === 'advanced' ? advCols : arsenalCols

  return (
    <div className="space-y-6">
      {/* Stats Table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex gap-1">
            {(['traditional','advanced','arsenal'] as StatsMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  mode === m ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">{data.length.toLocaleString()} pitches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {activeCols.map(c => (
                  <th key={c.k} className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium whitespace-nowrap text-right first:text-left"><Tip label={c.l} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRows.map((r: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/30 transition">
                  {activeCols.map(c => (
                    <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${getCellColor(c.k, r[c.k])}`}>
                      {formatMetric(c.k, r[c.k])}
                    </td>
                  ))}
                </tr>
              ))}
              {(() => {
                const totals = calcTotalsFromRegistry(activeRows, activeCols.map(c => c.k))
                if (!totals) return null
                return (
                  <tr className="border-t-2 border-zinc-600 bg-zinc-800/40 font-semibold">
                    {activeCols.map(c => (
                      <td key={c.k} className={`px-3 py-2 whitespace-nowrap font-mono text-right first:text-left first:font-sans ${getCellColor(c.k, totals[c.k])}`}>
                        {formatMetric(c.k, totals[c.k])}
                      </td>
                    ))}
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Percentile Rankings + Movement Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <PercentileRankings data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <MovementProfile data={data} />
        </div>
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <PitchLocationCards data={data} playerName={info?.player_name} />
      </div>
    </div>
  )
}
