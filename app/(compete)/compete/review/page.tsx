'use client'

import { useState, useEffect, useCallback } from 'react'
import PlayerPicker from '@/components/visualize/PlayerPicker'
import InteractiveZone from '@/components/compete/review/InteractiveZone'
import { scorePitch, computeCQR, CQRPitchResult } from '@/lib/compete/cqrScoring'
import { getPitchColor } from '@/components/chartConfig'

interface CQRPitch {
  plate_x: number
  plate_z: number
  pitch_name: string
  pitch_type: string
  balls: number
  strikes: number
  zone: number
  batter_name: string
  at_bat_number: number
  pitch_number: number
}

interface Game {
  game_pk: number
  game_date: string
  opponent: string
  pitches: number
  ip: string
}

type Phase = 'idle' | 'search' | 'grading' | 'results'

export default function CQRReviewPage() {
  const [phase, setPhase] = useState<Phase>('idle')

  // Search state
  const [pitcherId, setPitcherId] = useState<number | null>(null)
  const [pitcherName, setPitcherName] = useState('')
  const [season, setSeason] = useState('2025')
  const [games, setGames] = useState<Game[]>([])
  const [loadingGames, setLoadingGames] = useState(false)

  // Grading state
  const [pitches, setPitches] = useState<CQRPitch[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [target, setTarget] = useState<{ x: number; z: number } | null>(null)
  const [results, setResults] = useState<CQRPitchResult[]>([])
  const [targets, setTargets] = useState<Array<{ x: number; z: number }>>([])
  const [showReview, setShowReview] = useState(false)
  const [loadingPitches, setLoadingPitches] = useState(false)

  // Fetch games when pitcher + season selected
  const fetchGames = useCallback(async () => {
    if (!pitcherId) return
    setLoadingGames(true)
    try {
      const res = await fetch(`/api/compete/review?games=true&pitcherId=${pitcherId}&season=${season}`)
      const data = await res.json()
      setGames(data.games || [])
    } catch {
      setGames([])
    }
    setLoadingGames(false)
  }, [pitcherId, season])

  useEffect(() => {
    if (phase === 'search' && pitcherId) fetchGames()
  }, [phase, pitcherId, season, fetchGames])

  const startGame = async (gamePk: number) => {
    setLoadingPitches(true)
    try {
      const res = await fetch(`/api/compete/review?pitcherId=${pitcherId}&gamePk=${gamePk}`)
      const data = await res.json()
      if (data.pitches?.length) {
        setPitches(data.pitches)
        setCurrentIndex(0)
        setTarget(null)
        setResults([])
        setTargets([])
        setShowReview(false)
        setPhase('grading')
      }
    } catch { /* ignore */ }
    setLoadingPitches(false)
  }

  const handleSubmit = () => {
    if (!target || showReview) return
    const pitch = pitches[currentIndex]
    const result = scorePitch(target, pitch, pitch.zone, currentIndex)

    const newResults = [...results, result]
    const newTargets = [...targets, target]
    setResults(newResults)
    setTargets(newTargets)
    setShowReview(true)

    // Show review for 1.5s then advance
    setTimeout(() => {
      setShowReview(false)
      if (currentIndex < pitches.length - 1) {
        setCurrentIndex(currentIndex + 1)
        setTarget(null)
      } else {
        setPhase('results')
      }
    }, 1500)
  }

  const currentPitch = pitches[currentIndex]
  const cqrScore = phase === 'results' ? computeCQR(results) : 0

  // ── Phase: idle ──
  if (phase === 'idle') {
    return (
      <div className="max-w-2xl mx-auto p-8 mt-12">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-3">Command Quality Review</h1>
          <p className="text-zinc-400 mb-2">
            Grade a pitcher&apos;s command pitch-by-pitch. Set intended targets on a strike zone
            for every pitch in an outing, then receive a CQR score (0-100) based on how close
            each actual pitch was to its target.
          </p>
          <p className="text-zinc-500 text-sm mb-6">
            Scoring: &le;2&quot; = 100 &bull; &le;3&quot; = 80 &bull; &le;4&quot; = 60 &bull; &le;5&quot; in zone = 30 &bull; Center zone &amp; balls beyond 4&quot; = 0
          </p>
          <button
            onClick={() => setPhase('search')}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition"
          >
            Start CQR Review
          </button>
        </div>
      </div>
    )
  }

  // ── Phase: search ──
  if (phase === 'search') {
    return (
      <div className="max-w-3xl mx-auto p-6 mt-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setPhase('idle')} className="text-zinc-500 hover:text-zinc-300 text-sm">&larr; Back</button>
          <h2 className="text-lg font-semibold text-white">Select Pitcher &amp; Game</h2>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <PlayerPicker
              label="Search pitcher..."
              playerType="pitcher"
              onSelect={(id, name) => { setPitcherId(id); setPitcherName(name) }}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Season</label>
            <select
              value={season}
              onChange={e => setSeason(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 text-sm"
            >
              {Array.from({ length: 11 }, (_, i) => 2025 - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {pitcherId && pitcherName && (
          <p className="text-sm text-zinc-400">Selected: <span className="text-white font-medium">{pitcherName}</span></p>
        )}

        {loadingGames && <p className="text-zinc-500 text-sm">Loading games...</p>}

        {!loadingGames && games.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Opponent</th>
                  <th className="text-right px-4 py-2">Pitches</th>
                  <th className="text-right px-4 py-2">IP</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {games.map(g => (
                  <tr key={g.game_pk} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-300 font-mono text-xs">{g.game_date}</td>
                    <td className="px-4 py-2 text-white">{g.opponent}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 font-mono">{g.pitches}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 font-mono">{g.ip}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => startGame(g.game_pk)}
                        disabled={loadingPitches}
                        className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded transition disabled:opacity-50"
                      >
                        Start
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loadingGames && pitcherId && games.length === 0 && (
          <p className="text-zinc-500 text-sm">No games found for {season}.</p>
        )}
      </div>
    )
  }

  // ── Phase: grading ──
  if (phase === 'grading' && currentPitch) {
    const progress = ((currentIndex + (showReview ? 1 : 0)) / pitches.length) * 100

    return (
      <div className="max-w-5xl mx-auto p-6 mt-4 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-zinc-400">
              Pitch <span className="text-white font-mono">{currentIndex + 1}</span> of <span className="font-mono">{pitches.length}</span>
            </span>
            <span className="text-xs text-zinc-500">{pitcherName}</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6 items-start">
          {/* Left: Zone */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <InteractiveZone
              mode={showReview ? 'review' : 'target'}
              width={400}
              height={500}
              target={target}
              onTargetSet={(x, z) => { if (!showReview) setTarget({ x, z }) }}
              actualPitch={showReview ? currentPitch : undefined}
            />
          </div>

          {/* Right: Pitch info */}
          <div className="flex-1 space-y-4 min-w-[200px]">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              {/* Pitch type */}
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getPitchColor(currentPitch.pitch_name) }} />
                <span className="text-white font-medium">{currentPitch.pitch_name}</span>
              </div>

              {/* Count */}
              <div>
                <span className="text-xs text-zinc-500">Count</span>
                <p className="text-white font-mono text-lg">{currentPitch.balls}-{currentPitch.strikes}</p>
              </div>

              {/* Batter */}
              <div>
                <span className="text-xs text-zinc-500">Batter</span>
                <p className="text-white text-sm">{currentPitch.batter_name}</p>
              </div>

              {/* At-bat */}
              <div>
                <span className="text-xs text-zinc-500">At-bat</span>
                <p className="text-zinc-300 font-mono text-sm">#{currentPitch.at_bat_number}</p>
              </div>

              {/* Review flash score */}
              {showReview && results.length > 0 && (
                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-xs text-zinc-500">Pitch Score</span>
                  <p className={`text-2xl font-bold font-mono ${
                    results[results.length - 1].score >= 80 ? 'text-emerald-400' :
                    results[results.length - 1].score >= 60 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {results[results.length - 1].score}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {results[results.length - 1].distanceInches.toFixed(1)}&quot; from target
                  </p>
                </div>
              )}
            </div>

            {/* Submit button */}
            {!showReview && (
              <button
                onClick={handleSubmit}
                disabled={!target}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition"
              >
                {target ? 'Submit Target' : 'Click zone to set target'}
              </button>
            )}

            {showReview && (
              <div className="text-center text-zinc-500 text-sm py-3">Reviewing...</div>
            )}

            {/* Running average */}
            {results.length > 0 && !showReview && (
              <div className="text-center">
                <span className="text-xs text-zinc-500">Running CQR</span>
                <p className="text-white font-mono text-lg">{computeCQR(results)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Phase: results ──
  if (phase === 'results') {
    // Breakdown by pitch type
    const byType: Record<string, { count: number; totalScore: number; totalDist: number }> = {}
    for (let i = 0; i < results.length; i++) {
      const name = pitches[i].pitch_name
      if (!byType[name]) byType[name] = { count: 0, totalScore: 0, totalDist: 0 }
      byType[name].count++
      byType[name].totalScore += results[i].score
      byType[name].totalDist += results[i].distanceInches
    }

    // Score distribution
    const tiers = [100, 80, 60, 30, 0]
    const tierCounts: Record<number, number> = { 100: 0, 80: 0, 60: 0, 30: 0, 0: 0 }
    for (const r of results) tierCounts[r.score]++
    const maxTierCount = Math.max(...Object.values(tierCounts), 1)

    const scoreColor = cqrScore >= 80 ? 'text-emerald-400' : cqrScore >= 60 ? 'text-amber-400' : 'text-red-400'

    return (
      <div className="max-w-5xl mx-auto p-6 mt-4 space-y-6">
        {/* CQR Score */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-zinc-500 text-sm mb-1">CQR Score</p>
          <p className={`text-6xl font-bold font-mono ${scoreColor}`}>{cqrScore}</p>
          <p className="text-zinc-500 text-sm mt-2">{pitcherName} &bull; {pitches.length} pitches graded</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Zone plot */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">All Pitches &amp; Targets</h3>
            <InteractiveZone
              mode="results"
              width={400}
              height={450}
              allPitches={pitches.map((p, i) => ({
                plate_x: p.plate_x,
                plate_z: p.plate_z,
                pitch_name: p.pitch_name,
                score: results[i]?.score ?? 0,
              }))}
              allTargets={targets}
            />
          </div>

          <div className="space-y-6">
            {/* Breakdown table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <h3 className="text-sm font-medium text-zinc-400 px-4 pt-3 pb-2">Breakdown by Pitch Type</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="text-left px-4 py-1.5">Pitch</th>
                    <th className="text-right px-4 py-1.5">Count</th>
                    <th className="text-right px-4 py-1.5">Avg Score</th>
                    <th className="text-right px-4 py-1.5">Avg Dist</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byType).sort((a, b) => b[1].count - a[1].count).map(([name, d]) => (
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

            {/* Score distribution */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-zinc-400 mb-3">Score Distribution</h3>
              <div className="space-y-2">
                {tiers.map(tier => (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="w-8 text-right text-xs font-mono text-zinc-400">{tier}</span>
                    <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all ${
                          tier >= 80 ? 'bg-emerald-500' : tier >= 60 ? 'bg-amber-500' : tier >= 30 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${(tierCounts[tier] / maxTierCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-xs font-mono text-zinc-500">{tierCounts[tier]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => {
              setGames([])
              setPitches([])
              setResults([])
              setTargets([])
              setCurrentIndex(0)
              setTarget(null)
              setPhase('search')
            }}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition"
          >
            Review Another
          </button>
          <button
            onClick={() => {
              setPitcherId(null)
              setPitcherName('')
              setGames([])
              setPitches([])
              setResults([])
              setTargets([])
              setPhase('idle')
            }}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return null
}
