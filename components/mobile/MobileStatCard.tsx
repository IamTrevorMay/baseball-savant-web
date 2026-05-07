'use client'

interface Props {
  label: string
  value: string | number
  trend?: 'up' | 'down' | null
  accent?: boolean
  small?: boolean
}

export default function MobileStatCard({ label, value, trend, accent, small }: Props) {
  return (
    <div className="bg-zinc-900 dark:bg-zinc-900 bg-gray-50 border border-zinc-800 dark:border-zinc-800 border-gray-200 rounded-lg p-3">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-500 text-zinc-600 uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`${small ? 'text-base' : 'text-lg'} font-bold tabular-nums ${accent ? 'text-emerald-400' : 'text-white dark:text-white text-zinc-900'}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-[10px] font-medium ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend === 'up' ? '\u2191' : '\u2193'}
          </span>
        )}
      </div>
    </div>
  )
}
