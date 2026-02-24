'use client'
import type { PAIEOutput, MatchupData, H2HRecord, ChaseRegion, CountProfile } from '@/lib/engines/types'
import { PitchCard } from './PitchCard'
import { DamageZoneMap } from './DamageZoneMap'

export function MatchupPanel({
  result,
  data,
}: {
  result: PAIEOutput
  data: MatchupData
}) {
  return (
    <div className="space-y-4">
      {/* Fatigue banner */}
      {result.fatigueDetected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-amber-400 text-sm">&#x26A0;</span>
          <span className="text-amber-300 text-xs">
            Fatigue detected — recent velo {result.recentVelo?.toFixed(1)} mph vs {result.seasonBaselineVelo?.toFixed(1)} season avg
          </span>
        </div>
      )}

      {/* Primary + Damage Map row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Pitch Recommendations</h3>
          <PitchCard rec={result.primary} rank="primary" />
          <PitchCard rec={result.secondary} rank="secondary" />
        </div>

        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">Batter Damage Map</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg h-[350px]">
            <DamageZoneMap zoneScores={result.zoneScores} batterZones={data.batterZones} />
          </div>
        </div>
      </div>

      {/* Avoid list */}
      {result.avoid.length > 0 && (
        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Avoid Zones</h3>
          <div className="flex flex-wrap gap-2">
            {result.avoid.map((a, i) => (
              <div key={i} className="bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5">
                <span className="text-red-400 text-xs font-medium">{a.zone}</span>
                <span className="text-zinc-500 text-[10px] ml-2">{a.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* H2H + Chase + Count grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Head-to-Head table */}
        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Head-to-Head History</h3>
          <H2HTable rows={data.h2h} />
        </div>

        {/* Chase Profile + Count Tendencies */}
        <div className="space-y-4">
          <div>
            <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Chase Profile</h3>
            <ChaseTable rows={data.chaseProfile} />
          </div>
          <div>
            <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Count Tendencies</h3>
            <CountTable rows={data.countProfile} />
          </div>
        </div>
      </div>
    </div>
  )
}

function H2HTable({ rows }: { rows: H2HRecord[] }) {
  if (!rows.length) return <div className="text-zinc-600 text-xs py-4">No head-to-head data</div>
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            <th className="px-3 py-1.5 text-left text-zinc-400 font-medium">Pitch</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">#</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Whiff%</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">xwOBA</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Avg EV</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">BA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              <td className="px-3 py-1.5 text-white">{r.pitch_name}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.pitches}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.whiff_pct?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.xwoba?.toFixed(3) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.avg_ev?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.ba?.toFixed(3) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChaseTable({ rows }: { rows: ChaseRegion[] }) {
  if (!rows.length) return <div className="text-zinc-600 text-xs py-4">No chase data</div>
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            <th className="px-3 py-1.5 text-left text-zinc-400 font-medium">Region</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">#</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Swing%</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Whiff%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              <td className="px-3 py-1.5 text-white capitalize">{r.quadrant}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.pitches}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">
                {r.swing_pct != null ? (
                  <span className={r.swing_pct > 30 ? 'text-amber-400' : ''}>{r.swing_pct.toFixed(1)}</span>
                ) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">
                {r.whiff_pct != null ? (
                  <span className={r.whiff_pct > 35 ? 'text-emerald-400' : ''}>{r.whiff_pct.toFixed(1)}</span>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CountTable({ rows }: { rows: CountProfile[] }) {
  if (!rows.length) return <div className="text-zinc-600 text-xs py-4">No count data</div>
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-zinc-800/50">
            <th className="px-3 py-1.5 text-left text-zinc-400 font-medium">Count</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">#</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Swing%</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">Avg EV</th>
            <th className="px-3 py-1.5 text-right text-zinc-400 font-medium">xwOBA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800/30 hover:bg-zinc-800/20">
              <td className="px-3 py-1.5 text-white font-mono">{r.balls}-{r.strikes}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.pitches}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.swing_pct?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.avg_ev?.toFixed(1) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{r.xwoba?.toFixed(3) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
