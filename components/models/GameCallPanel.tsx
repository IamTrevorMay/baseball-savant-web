'use client'
import { useState, useMemo, useCallback } from 'react'
import type { GameCallData, CGCIEOutput, AtBatSequence, RecentABRow } from '@/lib/engines/types'
import { computeCGCIE } from '@/lib/engines/cgcie'
import { SequenceBuilder } from './SequenceBuilder'
import { PitchCard } from './PitchCard'
import { getPitchColor } from '../chartConfig'

function groupRecentABs(rows: RecentABRow[]): AtBatSequence[] {
  const map = new Map<string, RecentABRow[]>()
  for (const r of rows) {
    const key = `${r.game_pk}-${r.at_bat_number}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.values()).map(pitches => {
    pitches.sort((a, b) => a.pitch_number - b.pitch_number)
    const last = pitches[pitches.length - 1]
    return {
      game_date: pitches[0].game_date,
      game_pk: pitches[0].game_pk,
      at_bat_number: pitches[0].at_bat_number,
      pitches: pitches.map(p => ({
        pitch_name: p.pitch_name,
        description: p.description,
        count: `${p.balls}-${p.strikes}`,
        velo: p.release_speed,
      })),
      result: last.description,
    }
  })
}

interface GameCallPanelProps {
  data: GameCallData
}

export function GameCallPanel({ data }: GameCallPanelProps) {
  const [currentSequence, setCurrentSequence] = useState<string[]>([])
  const [count, setCount] = useState({ balls: 0, strikes: 0 })

  const recentABs = useMemo(() => groupRecentABs(data.recentABs), [data.recentABs])

  const handleAddPitch = useCallback((pitchName: string) => {
    setCurrentSequence(prev => [...prev, pitchName])
  }, [])

  const handleRemoveLast = useCallback(() => {
    setCurrentSequence(prev => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    setCurrentSequence([])
    setCount({ balls: 0, strikes: 0 })
  }, [])

  const handleLoadAB = useCallback((ab: AtBatSequence) => {
    // Load all pitches except the last (that's what we're recommending)
    const seq = ab.pitches.slice(0, -1).map(p => p.pitch_name)
    setCurrentSequence(seq)
    // Set count from the last loaded pitch
    if (ab.pitches.length > 1) {
      const lastLoaded = ab.pitches[ab.pitches.length - 2]
      const [b, s] = lastLoaded.count.split('-').map(Number)
      setCount({ balls: b, strikes: s })
    } else {
      setCount({ balls: 0, strikes: 0 })
    }
  }, [])

  // Compute CGCIE on every sequence/count change
  const result: CGCIEOutput = useMemo(() => {
    return computeCGCIE({
      arsenal: data.arsenal,
      batterZones: data.batterZones,
      h2h: data.h2h,
      transitions: data.transitions,
      currentSequence,
      count,
      recentABs: data.recentABs,
    })
  }, [data, currentSequence, count])

  return (
    <div className="space-y-4">
      {/* 1. Sequence Builder */}
      <SequenceBuilder
        arsenal={data.arsenal}
        currentSequence={currentSequence}
        count={count}
        recentABs={recentABs}
        onAddPitch={handleAddPitch}
        onRemoveLast={handleRemoveLast}
        onClear={handleClear}
        onSetCount={setCount}
        onLoadAB={handleLoadAB}
      />

      {/* 2. Recommendation Cards */}
      {result.recommended.pitch_name !== 'N/A' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PitchCard rec={result.recommended} rank="primary" />
          <PitchCard rec={result.secondary} rank="secondary" />
        </div>
      )}

      {/* 3. Sequence Insights */}
      {result.insights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sequence Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.insights.map((insight, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 ${
                  insight.level === 'warning'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-zinc-800 bg-zinc-900/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-mono uppercase mt-0.5 ${
                    insight.level === 'warning' ? 'text-amber-400' : 'text-purple-400'
                  }`}>
                    {insight.type}
                  </span>
                  <span className="text-[11px] text-zinc-300 leading-tight">{insight.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. All Pitches Ranked */}
      {result.allPitches.length > 2 && (
        <div>
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">All Pitches Ranked</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">#</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Pitch</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Confidence</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Target</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Adjustments</th>
                </tr>
              </thead>
              <tbody>
                {result.allPitches.map((p, i) => (
                  <tr key={p.pitch_name} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-3 py-2 text-zinc-600 font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getPitchColor(p.pitch_name) }} />
                        <span className="text-white font-medium">{p.pitch_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-mono ${p.confidence >= 60 ? 'text-purple-400' : 'text-zinc-400'}`}>
                        {p.confidence}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{p.target}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.adjustments.slice(0, 3).map((a, j) => (
                          <span
                            key={j}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              a.delta > 0
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {a.rule} {a.delta > 0 ? '+' : ''}{a.delta}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Recent At-Bats Table */}
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
          Recent At-Bats {recentABs.length > 0 && `(${recentABs.length})`}
        </h3>
        {recentABs.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-8 text-center">
            <p className="text-zinc-600 text-sm">No head-to-head history this season</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Date</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Pitches</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Result</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Load</th>
                </tr>
              </thead>
              <tbody>
                {recentABs.map((ab, i) => (
                  <tr key={`${ab.game_pk}-${ab.at_bat_number}`} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-3 py-2 text-zinc-400 font-mono">{ab.game_date}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {ab.pitches.map((p, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]"
                            style={{ backgroundColor: getPitchColor(p.pitch_name) + '20' }}
                            title={`${p.pitch_name} ${p.velo ? p.velo + ' mph' : ''} (${p.count})`}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getPitchColor(p.pitch_name) }} />
                            <span className="text-zinc-300">{p.pitch_name.slice(0, 2)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {ab.result.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleLoadAB(ab)}
                        className="text-purple-400 hover:text-purple-300 text-[10px] font-medium"
                      >
                        Load
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
