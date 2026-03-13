'use client'

import { useState, useEffect } from 'react'
import { useBroadcast } from '../BroadcastContext'

export default function CountdownControls() {
  const { widgetState, setCountdownTotal, startCountdown, stopCountdown, resetCountdown } = useBroadcast()
  const { countdown } = widgetState
  const [inputMinutes, setInputMinutes] = useState(Math.floor(countdown.total / 60))
  const [inputSeconds, setInputSeconds] = useState(countdown.total % 60)

  useEffect(() => {
    if (!countdown.running) {
      setInputMinutes(Math.floor(countdown.total / 60))
      setInputSeconds(countdown.total % 60)
    }
  }, [countdown.total, countdown.running])

  function handleSetTime() {
    const totalSecs = inputMinutes * 60 + inputSeconds
    if (totalSecs > 0) setCountdownTotal(totalSecs)
  }

  const displayMin = Math.floor(countdown.remaining / 60)
  const displaySec = countdown.remaining % 60
  const displayStr = `${String(displayMin).padStart(2, '0')}:${String(displaySec).padStart(2, '0')}`

  return (
    <div className="space-y-2">
      {/* Current time display */}
      <div className="text-center py-2">
        <div className={`text-2xl font-mono font-bold ${countdown.running ? 'text-cyan-400' : 'text-zinc-300'}`}>
          {displayStr}
        </div>
        {countdown.running && (
          <div className="text-[9px] text-cyan-500 uppercase tracking-wider mt-0.5">Running</div>
        )}
      </div>

      {/* Time input */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <label className="text-[9px] text-zinc-600">Min</label>
          <input
            type="number" min={0} max={999}
            value={inputMinutes}
            onChange={e => setInputMinutes(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
          />
        </div>
        <span className="text-zinc-500 mt-3">:</span>
        <div className="flex-1">
          <label className="text-[9px] text-zinc-600">Sec</label>
          <input
            type="number" min={0} max={59}
            value={inputSeconds}
            onChange={e => setInputSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
          />
        </div>
        <button
          onClick={handleSetTime}
          className="mt-3 px-2 py-1 text-[10px] bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition"
        >
          Set
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-1.5">
        {!countdown.running ? (
          <button
            onClick={startCountdown}
            disabled={countdown.total <= 0}
            className="flex-1 px-2 py-1.5 text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 disabled:opacity-40 transition"
          >
            Start
          </button>
        ) : (
          <button
            onClick={stopCountdown}
            className="flex-1 px-2 py-1.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition"
          >
            Stop
          </button>
        )}
        <button
          onClick={resetCountdown}
          className="flex-1 px-2 py-1.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 transition"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
