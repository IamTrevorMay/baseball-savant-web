'use client'
import type { HAIEOutput } from '@/lib/engines/types'
import { getPitchColor } from '../chartConfig'

const APPROACH_STYLES = {
  aggressive: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'Aggressive' },
  neutral: { bg: 'bg-zinc-500/10', border: 'border-zinc-500/30', text: 'text-zinc-300', label: 'Neutral' },
  protective: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: 'Protective' },
}

export function ApproachCard({ result }: { result: HAIEOutput }) {
  const style = APPROACH_STYLES[result.approachMode]
  const barWidth = Math.max(0, Math.min(100, result.confidence))
  const pitchColor = getPitchColor(result.sitOnPitch)

  return (
    <div className="rounded-lg border border-purple-500/40 bg-purple-500/5 p-4">
      {/* Header: approach badge + confidence */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${style.bg} ${style.border} border ${style.text}`}>
            {style.label}
          </span>
          {result.countAdvantage.label !== 'neutral' && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
              result.countAdvantage.label === 'hitter'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              {result.countAdvantage.label === 'hitter' ? 'Hitter advantage' : 'Pitcher advantage'}
              {result.countAdvantage.xwoba !== null && ` · ${result.countAdvantage.xwoba.toFixed(3)}`}
            </span>
          )}
        </div>
        <span className="text-[10px] text-purple-400 font-mono uppercase tracking-wider">HAIE</span>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-zinc-500 w-16">Confidence</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${barWidth}%`,
              backgroundColor: result.confidence >= 70 ? '#a855f7' : result.confidence >= 50 ? '#6366f1' : '#71717a',
            }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-300 w-7 text-right">{result.confidence}</span>
      </div>

      {/* Sit-on pitch */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-zinc-500 w-16">Sit on</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pitchColor }} />
          <span className="text-xs text-white font-medium">{result.sitOnPitch}</span>
        </div>
      </div>

      {/* Take-until rule */}
      <div className="bg-purple-500/10 border border-purple-500/20 rounded px-3 py-2 mb-3">
        <span className="text-[10px] text-purple-400 font-medium block mb-0.5">Take-Until</span>
        <span className="text-[11px] text-zinc-300 leading-tight">{result.takeUntilRule}</span>
      </div>

      {/* Rationale bullets */}
      {result.rationale.length > 0 && (
        <div className="space-y-1">
          {result.rationale.slice(0, 5).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-purple-400 text-[10px] mt-0.5">&#x2022;</span>
              <span className="text-[11px] text-zinc-400 leading-tight">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Adjustments */}
      {result.adjustments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.adjustments.map((a, i) => (
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
