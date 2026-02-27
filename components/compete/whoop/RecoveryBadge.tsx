'use client'

interface Props {
  score: number | null
  state: string | null
  size?: 'sm' | 'md'
}

const COLORS = {
  green: 'bg-green-500/20 text-green-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  red: 'bg-red-500/20 text-red-400',
}

export default function RecoveryBadge({ score, state, size = 'sm' }: Props) {
  if (score === null || !state) return null

  const colors = COLORS[state as keyof typeof COLORS] || COLORS.red

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold ${colors}`}>
        {Math.round(score)}%
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${colors}`}>
      {Math.round(score)}%
    </span>
  )
}
