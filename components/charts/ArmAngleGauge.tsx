'use client'

interface Props {
  angle: number | null
  seasonAngle?: number | null
  throwHand?: 'R' | 'L'
}

export default function ArmAngleGauge({ angle, seasonAngle, throwHand = 'R' }: Props) {
  if (angle == null) return null

  const clamped = Math.max(0, Math.min(90, angle))
  const isRight = throwHand === 'R'

  // Quarter-circle gauge: 0° (sidearm) to 90° (overhead)
  // Righty (pitcher's POV): center at bottom-left, arc from right → up
  // Lefty (pitcher's POV): center at bottom-right, arc from left → up
  const svgW = 64
  const svgH = 52
  const r = 38
  const strokeW = 5
  const cx = isRight ? 8 : svgW - 8
  const cy = svgH - 4
  const dir = isRight ? 1 : -1

  // 0° (sidearm) endpoint on the arm side
  const zeroX = cx + dir * r
  // 90° (overhead) endpoint
  const ninetyY = cy - r
  // Sweep flag: righty counterclockwise (0), lefty clockwise (1)
  const sweepFlag = isRight ? 0 : 1

  // Background arc: full quarter circle from 0° to 90°
  const bgArc = `M ${zeroX} ${cy} A ${r} ${r} 0 0 ${sweepFlag} ${cx} ${ninetyY}`

  // Filled arc up to the angle value
  const angleRad = (clamped * Math.PI) / 180
  const filledEndX = cx + dir * r * Math.cos(angleRad)
  const filledEndY = cy - r * Math.sin(angleRad)
  const filledArc = clamped > 0
    ? `M ${zeroX} ${cy} A ${r} ${r} 0 0 ${sweepFlag} ${filledEndX} ${filledEndY}`
    : ''

  // Needle
  const needleLen = r - 3
  const nx = cx + dir * needleLen * Math.cos(angleRad)
  const ny = cy - needleLen * Math.sin(angleRad)

  const showTooltip = seasonAngle != null && Math.abs(seasonAngle - angle) >= 0.5
  const title = showTooltip ? `Season avg: ${seasonAngle!.toFixed(1)}°` : `Arm Angle: ${angle.toFixed(1)}°`

  // Label positions
  const zeroLabelX = isRight ? zeroX + 3 : zeroX - 3
  const zeroAnchor = isRight ? 'start' : 'end'

  return (
    <div className="flex flex-col items-center" title={title}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <defs>
          <linearGradient id="armGaugeGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#065f46" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* Background arc */}
        <path d={bgArc} fill="none" stroke="#3f3f46" strokeWidth={strokeW} strokeLinecap="round" />
        {/* Filled arc */}
        {filledArc && (
          <path d={filledArc} fill="none" stroke="url(#armGaugeGrad)" strokeWidth={strokeW} strokeLinecap="round" />
        )}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#e4e4e7" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2} fill="#e4e4e7" />
        {/* Labels */}
        <text x={zeroLabelX} y={cy + 1} fill="#52525b" fontSize="7" textAnchor={zeroAnchor} dominantBaseline="middle">0°</text>
        <text x={cx} y={ninetyY - 3} fill="#52525b" fontSize="7" textAnchor="middle">90°</text>
      </svg>
      <div className="text-center -mt-0.5">
        <span className="text-zinc-100 text-xs font-bold font-mono">{angle.toFixed(1)}°</span>
        <div className="text-[8px] text-zinc-500 uppercase tracking-wider leading-none mt-0.5">Arm Angle</div>
      </div>
    </div>
  )
}
