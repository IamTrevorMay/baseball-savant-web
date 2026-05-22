'use client'

interface Sprint {
  id: string
  start_date: string
  velocity: number | null
}

export default function VelocityChart({ sprints }: { sprints: Sprint[] }) {
  if (!sprints || sprints.length === 0) return null

  const maxVelocity = Math.max(...sprints.map(s => s.velocity || 0), 1)
  const avg = sprints.length > 0
    ? (sprints.reduce((sum, s) => sum + (s.velocity || 0), 0) / sprints.length).toFixed(1)
    : '0'

  const barWidth = 28
  const barGap = 6
  const chartHeight = 48
  const labelHeight = 18
  const totalWidth = sprints.length * (barWidth + barGap) - barGap

  return (
    <div className="flex items-end gap-4">
      <svg width={totalWidth} height={chartHeight + labelHeight} style={{ overflow: 'visible' }}>
        {sprints.map((sprint, i) => {
          const v = sprint.velocity || 0
          const barH = maxVelocity > 0 ? (v / maxVelocity) * chartHeight : 0
          const x = i * (barWidth + barGap)
          const label = new Date(sprint.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <g key={sprint.id}>
              <rect
                x={x}
                y={chartHeight - barH}
                width={barWidth}
                height={Math.max(barH, 2)}
                rx={4}
                fill={i === sprints.length - 1 ? '#38bdf8' : 'rgba(56,189,248,0.35)'}
              />
              {v > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - barH - 4}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize="10"
                  fontWeight="600"
                >
                  {v}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 14}
                textAnchor="middle"
                fill="rgba(255,255,255,0.3)"
                fontSize="9"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="text-xs text-zinc-500 whitespace-nowrap" style={{ paddingBottom: labelHeight + 2 }}>
        avg: <span className="text-sky-400 font-semibold">{avg}</span> pts/sprint
      </div>
    </div>
  )
}
