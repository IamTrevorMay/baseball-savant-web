'use client'

import { TEAM_COLORS } from '@/lib/constants'

interface Stat {
  label: string
  value: string | number
}

interface Props {
  playerId: number
  name: string
  team: string
  stats?: Stat[]
  onClick?: () => void
}

function headshot(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function MobilePlayerCard({ playerId, name, team, stats, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-zinc-900 dark:bg-zinc-900 bg-gray-50 border border-zinc-800 dark:border-zinc-800 border-gray-200 rounded-lg p-3 ${onClick ? 'cursor-pointer active:bg-zinc-800/50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <img
          src={headshot(playerId)}
          alt=""
          className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white dark:text-white text-zinc-900 truncate">{name}</div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
              style={{ backgroundColor: TEAM_COLORS[team] || '#52525b' }}
            >
              {team}
            </div>
            <span className="text-[10px] text-zinc-500">{team}</span>
          </div>
        </div>
      </div>
      {stats && stats.length > 0 && (
        <div className="flex gap-3 mt-2 pt-2 border-t border-zinc-800/50 dark:border-zinc-800/50 border-gray-100">
          {stats.map(s => (
            <div key={s.label} className="flex-1 text-center">
              <div className="text-[9px] text-zinc-500 uppercase">{s.label}</div>
              <div className="text-xs font-mono font-medium text-zinc-300 dark:text-zinc-300 text-zinc-700">{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
