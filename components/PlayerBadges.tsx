'use client'
import type { LahmanAward, LahmanAllStar, LahmanHOF } from '@/lib/lahman-stats'

interface Props {
  awards?: LahmanAward[]
  allstars?: LahmanAllStar[]
  hof?: LahmanHOF[]
}

const AWARD_COLORS: Record<string, string> = {
  'Most Valuable Player': 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  'Cy Young Award': 'bg-sky-600/20 text-sky-400 border-sky-600/30',
  'Gold Glove': 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  'Silver Slugger': 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  'Rookie of the Year': 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
}

export default function PlayerBadges({ awards = [], allstars = [], hof = [] }: Props) {
  const isHOF = hof.some(h => h.inducted === 'Y')
  const allStarCount = allstars.length
  const awardCounts: Record<string, number> = {}
  awards.forEach(a => { awardCounts[a.award_id] = (awardCounts[a.award_id] || 0) + 1 })

  const badges: { label: string; cls: string }[] = []

  if (isHOF) badges.push({ label: 'HOF', cls: 'bg-purple-600/20 text-purple-400 border-purple-600/30' })
  if (allStarCount > 0) badges.push({ label: `${allStarCount}x All-Star`, cls: 'bg-rose-600/20 text-rose-400 border-rose-600/30' })

  for (const [award, count] of Object.entries(awardCounts)) {
    const short = award === 'Most Valuable Player' ? 'MVP'
      : award === 'Cy Young Award' ? 'Cy Young'
      : award === 'Gold Glove' ? 'Gold Glove'
      : award === 'Silver Slugger' ? 'Silver Slugger'
      : award === 'Rookie of the Year' ? 'ROY'
      : null
    if (!short) continue
    const cls = AWARD_COLORS[award] || 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30'
    badges.push({ label: count > 1 ? `${count}x ${short}` : short, cls })
  }

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {badges.map((b, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${b.cls}`}>
          {b.label}
        </span>
      ))}
    </div>
  )
}
