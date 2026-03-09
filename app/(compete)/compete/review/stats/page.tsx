'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getPitchColor } from '@/components/chartConfig'

interface Summary {
  total: number
  avg: number
  best: number
  worst: number
}

interface PitcherRow {
  pitcher_id: number
  pitcher_name: string
  reviews: number
  avg: number
  best: number
}

interface ReviewRow {
  id: string
  pitcher_name: string
  game_date: string
  opponent: string
  cqr_score: number
  pitch_count: number
  breakdown: Record<string, { count: number; totalScore: number; totalDist: number }>
  results: Array<{ score: number; edgeDistanceInches: number; pitchIndex: number }>
  created_at: string
}

export default function CQRStatsPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Summary>({ total: 0, avg: 0, best: 0, worst: 0 })
  const [byPitcher, setByPitcher] = useState<PitcherRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])

  useEffect(() => {
    fetch('/api/compete/review/stats')
      .then(r => r.json())
      .then(d => {
        setSummary(d.summary || { total: 0, avg: 0, best: 0, worst: 0 })
        setByPitcher(d.byPitcher || [])
        setReviews(d.reviews || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const scoreColor = (score: number) =>
    score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'

  // Aggregate pitch type stats across all reviews
  const pitchTypeAgg: Record<string, { count: number; totalScore: number; totalDist: number }> = {}
  for (const rev of reviews) {
    if (!rev.breakdown) continue
    for (const [name, d] of Object.entries(rev.breakdown)) {
      if (!pitchTypeAgg[name]) pitchTypeAgg[name] = { count: 0, totalScore: 0, totalDist: 0 }
      pitchTypeAgg[name].count += d.count
      pitchTypeAgg[name].totalScore += d.totalScore
      pitchTypeAgg[name].totalDist += d.totalDist
    }
  }

  // Score distribution across all reviews
  const tiers = [100, 75, 50, 25, 0]
  const tierCounts: Record<number, number> = { 100: 0, 75: 0, 50: 0, 25: 0, 0: 0 }
  for (const rev of reviews) {
    if (!rev.results) continue
    for (const r of rev.results) {
      tierCounts[r.score] = (tierCounts[r.score] || 0) + 1
    }
  }
  const maxTierCount = Math.max(...Object.values(tierCounts), 1)

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 mt-6">
        <p className="text-zinc-500">Loading stats...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 mt-6 space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-4 border-b border-zinc-800 pb-2">
        <Link href="/compete/review" className="text-zinc-500 hover:text-zinc-300 pb-2">Review</Link>
        <span className="text-white font-medium border-b-2 border-amber-500 pb-2">Stats</span>
        <Link href="/compete/review/settings" className="text-zinc-500 hover:text-zinc-300 pb-2">Settings</Link>
      </div>

      <h1 className="text-xl font-bold text-white">CQR Stats</h1>

      {summary.total === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-zinc-400">No reviews yet. Complete a CQR review to see stats here.</p>
          <Link href="/compete/review" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            &larr; Go to Review
          </Link>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Reviews', value: summary.total, color: 'text-white' },
              { label: 'Average CQR', value: summary.avg, color: scoreColor(summary.avg) },
              { label: 'Best CQR', value: summary.best, color: 'text-emerald-400' },
              { label: 'Worst CQR', value: summary.worst, color: 'text-red-400' },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-bold font-mono ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* By Pitcher table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <h3 className="text-sm font-medium text-zinc-400 px-4 pt-3 pb-2">By Pitcher</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-4 py-1.5">Pitcher</th>
                  <th className="text-right px-4 py-1.5">Reviews</th>
                  <th className="text-right px-4 py-1.5">Avg CQR</th>
                  <th className="text-right px-4 py-1.5">Best CQR</th>
                </tr>
              </thead>
              <tbody>
                {byPitcher.map(p => (
                  <tr key={p.pitcher_id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-2 text-white">{p.pitcher_name}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 font-mono">{p.reviews}</td>
                    <td className={`px-4 py-2 text-right font-mono font-medium ${scoreColor(p.avg)}`}>{p.avg}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-400">{p.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* By Pitch Type table */}
          {Object.keys(pitchTypeAgg).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <h3 className="text-sm font-medium text-zinc-400 px-4 pt-3 pb-2">By Pitch Type</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="text-left px-4 py-1.5">Pitch</th>
                    <th className="text-right px-4 py-1.5">Count</th>
                    <th className="text-right px-4 py-1.5">Avg Score</th>
                    <th className="text-right px-4 py-1.5">Avg Edge Dist</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(pitchTypeAgg).sort((a, b) => b[1].count - a[1].count).map(([name, d]) => (
                    <tr key={name} className="border-b border-zinc-800/50">
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getPitchColor(name) }} />
                          <span className="text-white">{name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-400 font-mono">{d.count}</td>
                      <td className="px-4 py-2 text-right font-mono text-white">{Math.round(d.totalScore / d.count)}</td>
                      <td className="px-4 py-2 text-right text-zinc-400 font-mono">{(d.totalDist / d.count).toFixed(1)}&quot;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Score distribution */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Score Distribution (All Reviews)</h3>
            <div className="space-y-2">
              {tiers.map(tier => (
                <div key={tier} className="flex items-center gap-3">
                  <span className="w-8 text-right text-xs font-mono text-zinc-400">{tier}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${
                        tier >= 75 ? 'bg-emerald-500' : tier >= 50 ? 'bg-amber-500' : tier >= 25 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${(tierCounts[tier] / maxTierCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs font-mono text-zinc-500">{tierCounts[tier]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent reviews */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <h3 className="text-sm font-medium text-zinc-400 px-4 pt-3 pb-2">Recent Reviews</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-4 py-1.5">Pitcher</th>
                  <th className="text-left px-4 py-1.5">Date</th>
                  <th className="text-left px-4 py-1.5">vs</th>
                  <th className="text-right px-4 py-1.5">Pitches</th>
                  <th className="text-right px-4 py-1.5">CQR</th>
                </tr>
              </thead>
              <tbody>
                {reviews.slice(0, 10).map(r => (
                  <tr key={r.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-2 text-white">{r.pitcher_name}</td>
                    <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{r.game_date}</td>
                    <td className="px-4 py-2 text-zinc-400">{r.opponent}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 font-mono">{r.pitch_count}</td>
                    <td className={`px-4 py-2 text-right font-mono font-bold ${scoreColor(r.cqr_score)}`}>{r.cqr_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
