'use client'
import type { PitchRecommendation } from '@/lib/engines/types'
import { getPitchColor } from '../chartConfig'

export function PitchCard({
  rec,
  rank,
}: {
  rec: PitchRecommendation
  rank: 'primary' | 'secondary'
}) {
  const color = getPitchColor(rec.pitch_name)
  const barWidth = Math.max(0, Math.min(100, rec.confidence))

  return (
    <div className={`rounded-lg border p-4 ${
      rank === 'primary'
        ? 'border-purple-500/40 bg-purple-500/5'
        : 'border-zinc-800 bg-zinc-900/50'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-bold text-white text-sm">{rec.pitch_name}</span>
        </div>
        <span className={`text-xs font-mono ${
          rank === 'primary' ? 'text-purple-400' : 'text-zinc-400'
        }`}>
          {rank === 'primary' ? 'PRIMARY' : 'SECONDARY'}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-zinc-500 w-16">Confidence</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${barWidth}%`,
              backgroundColor: rec.confidence >= 70 ? '#a855f7' : rec.confidence >= 50 ? '#6366f1' : '#71717a',
            }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-300 w-7 text-right">{rec.confidence}</span>
      </div>

      {/* Target */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-zinc-500 w-16">Target</span>
        <span className="text-xs text-zinc-200">{rec.target}</span>
      </div>

      {/* Rationale bullets */}
      {rec.rationale.length > 0 && (
        <div className="space-y-1">
          {rec.rationale.slice(0, 4).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-purple-400 text-[10px] mt-0.5">&#x2022;</span>
              <span className="text-[11px] text-zinc-400 leading-tight">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Adjustments summary */}
      {rec.adjustments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {rec.adjustments.map((a, i) => (
            <span
              key={i}
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                a.delta > 0
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {a.rule} {a.delta > 0 ? '+' : ''}{a.delta}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
