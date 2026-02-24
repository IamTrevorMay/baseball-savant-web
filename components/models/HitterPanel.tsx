'use client'
import type { HAIEOutput, MatchupData } from '@/lib/engines/types'
import { ApproachCard } from './ApproachCard'
import { HitterZoneMap } from './HitterZoneMap'
import { H2HTable, ChaseTable, CountTable } from './MatchupTables'

export function HitterPanel({
  result,
  data,
}: {
  result: HAIEOutput
  data: MatchupData
}) {
  return (
    <div className="space-y-4">
      {/* Fatigue exploit banner */}
      {result.fatigueDetected && result.fatigueMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-emerald-400 text-sm">&#x26A1;</span>
          <span className="text-emerald-300 text-xs">{result.fatigueMessage}</span>
        </div>
      )}

      {/* Approach card + Zone map row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">Approach</h3>
          <ApproachCard result={result} />
        </div>

        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">Hitter Zone Map</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg h-[350px]">
            <HitterZoneMap zoneScores={result.hitterZoneScores} batterZones={data.batterZones} />
          </div>
        </div>
      </div>

      {/* Sit-on zones */}
      {result.sitOnZones.length > 0 && (
        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Attack Zones</h3>
          <div className="flex flex-wrap gap-2">
            {result.sitOnZones.map((z, i) => (
              <div key={i} className="bg-emerald-500/10 border border-emerald-500/20 rounded px-3 py-1.5">
                <span className="text-emerald-400 text-xs font-medium">{z.zoneName}</span>
                <span className="text-zinc-500 text-[10px] ml-2">
                  EV: {z.avg_ev?.toFixed(1) ?? '—'} · Barrel: {z.barrel_pct != null ? z.barrel_pct.toFixed(0) + '%' : '—'} · xwOBA: {z.xwoba?.toFixed(3) ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chase avoidance warnings */}
      {result.chaseWarnings.length > 0 && (
        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Chase Avoidance</h3>
          <div className="space-y-2">
            {result.chaseWarnings.map((w, i) => (
              <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-red-400 text-xs font-medium capitalize">{w.quadrant}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-zinc-500 font-mono">Swing: {w.swing_pct.toFixed(0)}%</span>
                    <span className="text-[9px] text-zinc-500 font-mono">Whiff: {w.whiff_pct.toFixed(0)}%</span>
                  </div>
                </div>
                {w.exploitedBy.length > 0 && (
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[9px] text-zinc-600">Exploited by:</span>
                    {w.exploitedBy.map((p, j) => (
                      <span key={j} className="text-[9px] bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-zinc-400 leading-tight">{w.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-strike mode card */}
      {result.twoStrikeMode && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400 text-sm">&#x26A0;</span>
            <span className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">Two-Strike Mode</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <span className="text-[9px] text-zinc-500 block">Expect</span>
              <span className="text-xs text-white font-medium">{result.twoStrikeMode.expectPitch}</span>
            </div>
            <div>
              <span className="text-[9px] text-zinc-500 block">Protect Against</span>
              <span className="text-xs text-white font-medium">{result.twoStrikeMode.protectAgainst}</span>
            </div>
          </div>
          <p className="text-[11px] text-amber-300/80 leading-tight">{result.twoStrikeMode.strategy}</p>
        </div>
      )}

      {/* H2H + Chase + Count tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Head-to-Head History</h3>
          <H2HTable rows={data.h2h} />
        </div>

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
