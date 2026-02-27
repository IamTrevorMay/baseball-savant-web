'use client'
import { useRouter } from 'next/navigation'
import { modernTeamCode } from '@/lib/lahman-stats'

interface Props {
  rows: any[]
  type: 'career' | 'season'
  category: 'batting' | 'pitching'
  statLabel: string
  loading: boolean
}

export default function LeaderboardTable({ rows, type, category, statLabel, loading }: Props) {
  const router = useRouter()

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8 text-center text-zinc-500 text-sm">
        No results found. Try adjusting qualifiers or filters.
      </div>
    )
  }

  function handleClick(row: any) {
    if (row.mlb_id) {
      router.push(category === 'pitching' ? `/player/${row.mlb_id}` : `/hitter/${row.mlb_id}`)
    } else {
      router.push(`/historical/${row.lahman_id}`)
    }
  }

  const isSeason = type === 'season'

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium text-left w-10">#</th>
              <th className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium text-left">Player</th>
              {isSeason && <th className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium text-right">Year</th>}
              <th className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium text-right">Team{!isSeason ? 's' : ''}</th>
              {!isSeason && <th className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium text-right">Years</th>}
              <th className="bg-zinc-800/50 px-3 py-2 text-zinc-500 font-medium text-right">{statLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i} onClick={() => handleClick(r)}
                className="border-t border-zinc-800/30 hover:bg-zinc-800/30 transition cursor-pointer">
                <td className="px-3 py-2 text-zinc-500 font-mono">{i + 1}</td>
                <td className="px-3 py-2 text-white font-medium">
                  {r.name_last}, {r.name_first}
                  {r.mlb_id && <span className="ml-1.5 text-[9px] text-emerald-500/60">SC</span>}
                </td>
                {isSeason && <td className="px-3 py-2 text-zinc-400 text-right font-mono">{r.year}</td>}
                <td className="px-3 py-2 text-zinc-400 text-right font-mono text-[11px]">
                  {isSeason ? modernTeamCode(r.team_id) : (r.teams || '').split('/').map((t: string) => modernTeamCode(t)).filter(Boolean).slice(0, 5).join('/')}
                </td>
                {!isSeason && (
                  <td className="px-3 py-2 text-zinc-500 text-right font-mono text-[11px]">
                    {r.first_year}–{r.last_year}
                  </td>
                )}
                <td className="px-3 py-2 text-emerald-400 text-right font-mono font-medium">
                  {typeof r.stat_value === 'number' ? r.stat_value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : r.stat_value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
