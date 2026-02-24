'use client'

interface RiskGaugeProps {
  score: number
  level: 'low' | 'moderate' | 'elevated' | 'high'
}

const LEVEL_CONFIG = {
  low: { label: 'Low Risk', color: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  moderate: { label: 'Moderate Risk', color: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/30' },
  elevated: { label: 'Elevated Risk', color: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/30' },
  high: { label: 'High Risk', color: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/30' },
}

export function RiskGauge({ score, level }: RiskGaugeProps) {
  const config = LEVEL_CONFIG[level]

  return (
    <div className={`bg-zinc-900 border ${config.border} rounded-lg p-5`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Risk Score</span>
        <span className={`text-[10px] ${config.text} font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${config.color}/20`}>
          {config.label}
        </span>
      </div>

      {/* Large score display */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className={`text-5xl font-bold ${config.text}`}>{score}</span>
        <span className="text-zinc-600 text-lg">/100</span>
      </div>

      {/* Horizontal bar gauge */}
      <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
        {/* Gradient background showing full range */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-emerald-500/20" />
          <div className="flex-1 bg-amber-500/20" />
          <div className="flex-1 bg-orange-500/20" />
          <div className="flex-1 bg-red-500/20" />
        </div>
        {/* Active fill */}
        <div
          className={`absolute inset-y-0 left-0 ${config.color} rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] text-zinc-600">0</span>
        <span className="text-[9px] text-zinc-600">25</span>
        <span className="text-[9px] text-zinc-600">50</span>
        <span className="text-[9px] text-zinc-600">75</span>
        <span className="text-[9px] text-zinc-600">100</span>
      </div>
    </div>
  )
}
