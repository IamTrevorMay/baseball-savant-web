'use client'
import type { PitchArsenal, AtBatSequence } from '@/lib/engines/types'
import { getPitchColor } from '../chartConfig'

interface SequenceBuilderProps {
  arsenal: PitchArsenal[]
  currentSequence: string[]
  count: { balls: number; strikes: number }
  recentABs: AtBatSequence[]
  onAddPitch: (pitchName: string) => void
  onRemoveLast: () => void
  onClear: () => void
  onSetCount: (count: { balls: number; strikes: number }) => void
  onLoadAB: (ab: AtBatSequence) => void
}

export function SequenceBuilder({
  arsenal,
  currentSequence,
  count,
  recentABs,
  onAddPitch,
  onRemoveLast,
  onClear,
  onSetCount,
  onLoadAB,
}: SequenceBuilderProps) {
  // Build velo lookup
  const veloMap = new Map<string, number>()
  for (const p of arsenal) {
    if (p.avg_velo) veloMap.set(p.pitch_name, p.avg_velo)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sequence Builder</h3>
        <div className="flex items-center gap-2">
          {/* Load from AB dropdown */}
          {recentABs.length > 0 && (
            <select
              onChange={e => {
                const idx = parseInt(e.target.value)
                if (!isNaN(idx)) onLoadAB(recentABs[idx])
                e.target.value = ''
              }}
              defaultValue=""
              className="h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 focus:outline-none focus:border-purple-500/50"
            >
              <option value="" disabled>Load AB...</option>
              {recentABs.map((ab, i) => (
                <option key={`${ab.game_pk}-${ab.at_bat_number}`} value={i}>
                  {ab.game_date} — {ab.pitches.length}p — {ab.result.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onClear}
            disabled={currentSequence.length === 0}
            className="h-7 px-3 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Arsenal buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {arsenal.map(p => (
          <button
            key={p.pitch_name}
            onClick={() => onAddPitch(p.pitch_name)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 transition text-sm"
            style={{ backgroundColor: getPitchColor(p.pitch_name) + '18' }}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getPitchColor(p.pitch_name) }} />
            <span className="text-white font-medium text-xs">{p.pitch_name}</span>
            {p.avg_velo && (
              <span className="text-zinc-500 text-[10px]">{p.avg_velo.toFixed(0)}</span>
            )}
          </button>
        ))}
      </div>

      {/* Count selector */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Balls</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map(b => (
              <button
                key={b}
                onClick={() => onSetCount({ ...count, balls: b })}
                className={`w-7 h-7 rounded text-xs font-mono transition ${
                  count.balls === b
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Strikes</span>
          <div className="flex gap-1">
            {[0, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => onSetCount({ ...count, strikes: s })}
                className={`w-7 h-7 rounded text-xs font-mono transition ${
                  count.strikes === s
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <span className="text-sm font-mono text-zinc-300 ml-2">
          {count.balls}-{count.strikes}
        </span>
      </div>

      {/* Current sequence timeline */}
      <div className="flex items-center gap-1.5 min-h-[36px]">
        {currentSequence.length === 0 ? (
          <span className="text-xs text-zinc-600 italic">Click a pitch to start the at-bat sequence...</span>
        ) : (
          <>
            {currentSequence.map((pitch, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-zinc-700 text-xs">→</span>}
                <button
                  onClick={i === currentSequence.length - 1 ? onRemoveLast : undefined}
                  className={`flex items-center gap-1 px-2 py-1 rounded border transition ${
                    i === currentSequence.length - 1
                      ? 'border-zinc-600 hover:border-red-500/50 cursor-pointer'
                      : 'border-zinc-800 cursor-default'
                  }`}
                  style={{ backgroundColor: getPitchColor(pitch) + '20' }}
                  title={i === currentSequence.length - 1 ? 'Click to remove' : undefined}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getPitchColor(pitch) }} />
                  <span className="text-[11px] text-white font-medium">{pitch}</span>
                  {veloMap.has(pitch) && (
                    <span className="text-[9px] text-zinc-500">{veloMap.get(pitch)!.toFixed(0)}</span>
                  )}
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1 ml-1">
              <span className="text-zinc-700 text-xs">→</span>
              <span className="text-purple-400 text-xs font-mono animate-pulse">?</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
