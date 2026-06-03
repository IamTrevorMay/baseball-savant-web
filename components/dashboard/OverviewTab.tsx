'use client'
import { useState, useMemo, useEffect } from 'react'
import PercentileRankings from '../charts/PercentileRankings'
import MovementProfile from '../charts/MovementProfile'
import PitchLocationCards from '../charts/PitchLocationCards'
import { calcTraditionalByYear, calcAdvancedByYear, calcArsenal } from '@/lib/pitcherStats'
import type { LahmanPitchingSeason } from '@/lib/lahman-stats'
import Tip from '@/components/Tip'
import { getColumns, formatMetric, getCellColor, calcTotalsFromRegistry } from '@/lib/metricRegistry'
import { supabase } from '@/lib/supabase'
import { isFastball, computeXDeceptionScore } from '@/lib/leagueStats'

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


  // Compute season-wide average arm angle for the gauge tooltip
  const seasonAvgArmAngle = useMemo(() => {
    const angles = data.map(d => d.arm_angle).filter((v: any): v is number => v != null)
    return angles.length ? angles.reduce((a, b) => a + b, 0) / angles.length : null
  }, [data])

  // Fetch deception + unique scores per year from pitcher_season_deception
  const [deceptionByYear, setDeceptionByYear] = useState<Record<number, { deception: number | null; unique: number | null }>>({})

  useEffect(() => {
    const pitcherId = data[0]?.pitcher
    if (!pitcherId) return

    const years = [...new Set(data.map(d => d.game_year).filter(Boolean))] as number[]
    if (years.length === 0) return

    async function fetchDeception() {
      const yearList = years.join(',')
      const sql = `SELECT game_year, pitch_type, pitches, unique_score, deception_score, z_vaa, z_haa, z_vb, z_hb, z_ext FROM pitcher_season_deception WHERE pitcher = ${pitcherId} AND game_year IN (${yearList})`
      const { data: rows } = await supabase.rpc('run_query', { query_text: sql })
      if (!rows?.length) return

      // Group rows by year, compute pitch-weighted averages
      const byYear: Record<number, typeof rows> = {}
      for (const r of rows) {
        const yr = Number(r.game_year)
        if (!byYear[yr]) byYear[yr] = []
        byYear[yr].push(r)
      }

      const result: Record<number, { deception: number | null; unique: number | null }> = {}
      for (const [yr, yrRows] of Object.entries(byYear)) {
        let uniqueSum = 0, decSum = 0, totalW = 0
        const fbZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }
        const osZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }

        for (const r of yrRows) {
          const w = Number(r.pitches) || 0
          if (r.unique_score != null) { uniqueSum += Number(r.unique_score) * w; totalW += w }
          if (r.deception_score != null) { decSum += Number(r.deception_score) * w }

          const bucket = isFastball(r.pitch_type) ? fbZ : osZ
          if (r.z_vaa != null) {
            bucket.vaa += Number(r.z_vaa) * w
            bucket.haa += Number(r.z_haa) * w
            bucket.vb += Number(r.z_vb) * w
            bucket.hb += Number(r.z_hb) * w
            bucket.ext += (Number(r.z_ext) || 0) * w
            bucket.w += w
          }
        }

        let xdec: number | null = null
        if (fbZ.w > 0 && osZ.w > 0) {
          xdec = computeXDeceptionScore(
            { vaa: fbZ.vaa / fbZ.w, haa: fbZ.haa / fbZ.w, vb: fbZ.vb / fbZ.w, hb: fbZ.hb / fbZ.w, ext: fbZ.ext / fbZ.w },
            { vaa: osZ.vaa / osZ.w, haa: osZ.haa / osZ.w, vb: osZ.vb / osZ.w, hb: osZ.hb / osZ.w, ext: osZ.ext / osZ.w }
          )
        }

        // Use deception_score from DB; fall back to xdeception if available
        const dec = totalW > 0 ? decSum / totalW : null
        result[Number(yr)] = {
          deception: dec ?? xdec,
          unique: totalW > 0 ? uniqueSum / totalW : null,
        }
      }

      setDeceptionByYear(result)
    }
    fetchDeception()
  }, [data])

  // Merge deception scores into advanced rows
  const mergedAdvRowsFinal = mergedAdvRows.map(r => {
    const dec = deceptionByYear[r.year]
    return {
      ...r,
      deceptionScore: dec?.deception != null ? dec.deception.toFixed(1) : '—',
      uniqueScore: dec?.unique != null ? dec.unique.toFixed(1) : '—',
    }
  })

  const tradCols = getColumns('pitcher:traditional')
  const advCols = getColumns('pitcher:advanced')
  const arsenalCols = getColumns('pitcher:arsenal')

  const activeRows = mode === 'traditional' ? mergedTradRows : mode === 'advanced' ? mergedAdvRowsFinal : arsenalRows
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
          <MovementProfile data={data} seasonAvgArmAngle={seasonAvgArmAngle} />
        </div>
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <PitchLocationCards data={data} playerName={info?.player_name} />
      </div>
    </div>
  )
}
