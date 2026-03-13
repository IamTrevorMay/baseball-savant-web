'use client'

import { useState, useEffect } from 'react'
import { useBroadcast } from '../BroadcastContext'
import type { TimerPreset, CountdownWidgetConfig } from '@/lib/widgetTypes'

export default function CountdownControls() {
  const { widgetState, setCountdownTotal, startCountdown, stopCountdown, resetCountdown, activateTimerPreset, assets, updateAsset } = useBroadcast()
  const { countdown } = widgetState
  const [inputMinutes, setInputMinutes] = useState(Math.floor(countdown.total / 60))
  const [inputSeconds, setInputSeconds] = useState(countdown.total % 60)

  // Preset editor state
  const [editingPreset, setEditingPreset] = useState<TimerPreset | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [presetLabel, setPresetLabel] = useState('')
  const [presetMin, setPresetMin] = useState(0)
  const [presetSec, setPresetSec] = useState(0)
  const [presetAutoShow, setPresetAutoShow] = useState(true)
  const [presetAutoHide, setPresetAutoHide] = useState(false)

  useEffect(() => {
    if (!countdown.running) {
      setInputMinutes(Math.floor(countdown.total / 60))
      setInputSeconds(countdown.total % 60)
    }
  }, [countdown.total, countdown.running])

  // Find countdown widget asset and its presets
  const countdownAsset = assets.find(a => a.asset_type === 'widget' && (a.widget_config as any)?.widget_type === 'countdown')
  const countdownConfig = countdownAsset?.widget_config as CountdownWidgetConfig | undefined
  const presets: TimerPreset[] = countdownConfig?.presets || []

  function handleSetTime() {
    const totalSecs = inputMinutes * 60 + inputSeconds
    if (totalSecs > 0) setCountdownTotal(totalSecs)
  }

  function persistPresets(newPresets: TimerPreset[]) {
    if (!countdownAsset) return
    const newConfig = { ...countdownConfig, presets: newPresets }
    updateAsset(countdownAsset.id, { widget_config: newConfig } as any)
    fetch('/api/broadcast/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: countdownAsset.id, widget_config: newConfig }),
    }).catch(console.error)
  }

  function handleAddPreset() {
    setIsAddingNew(true)
    setEditingPreset(null)
    setPresetLabel('')
    setPresetMin(3)
    setPresetSec(0)
    setPresetAutoShow(true)
    setPresetAutoHide(false)
  }

  function handleEditPreset(preset: TimerPreset) {
    setIsAddingNew(false)
    setEditingPreset(preset)
    setPresetLabel(preset.label)
    setPresetMin(Math.floor(preset.seconds / 60))
    setPresetSec(preset.seconds % 60)
    setPresetAutoShow(preset.autoShow)
    setPresetAutoHide(preset.autoHide)
  }

  function handleSavePreset() {
    const seconds = presetMin * 60 + presetSec
    if (!presetLabel.trim() || seconds <= 0) return

    if (isAddingNew) {
      const newPreset: TimerPreset = {
        id: crypto.randomUUID(),
        label: presetLabel.trim(),
        seconds,
        autoShow: presetAutoShow,
        autoHide: presetAutoHide,
      }
      persistPresets([...presets, newPreset])
    } else if (editingPreset) {
      const updated = presets.map(p =>
        p.id === editingPreset.id
          ? { ...p, label: presetLabel.trim(), seconds, autoShow: presetAutoShow, autoHide: presetAutoHide }
          : p
      )
      persistPresets(updated)
    }

    setEditingPreset(null)
    setIsAddingNew(false)
  }

  function handleDeletePreset(presetId: string) {
    persistPresets(presets.filter(p => p.id !== presetId))
    if (editingPreset?.id === presetId) {
      setEditingPreset(null)
      setIsAddingNew(false)
    }
  }

  function handleCancelEdit() {
    setEditingPreset(null)
    setIsAddingNew(false)
  }

  function formatPresetTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
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

      {/* Presets section */}
      {countdownAsset && (
        <div className="pt-2 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-medium">Presets</span>
            <button
              onClick={handleAddPreset}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 transition px-1"
              title="Add preset"
            >
              + Add
            </button>
          </div>

          {/* Preset buttons */}
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {presets.map(preset => (
                <div key={preset.id} className="group relative">
                  <button
                    onClick={() => activateTimerPreset(preset)}
                    className="px-2 py-1 text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 hover:border-zinc-600 transition"
                    title={`${preset.label} — ${formatPresetTime(preset.seconds)}${preset.autoShow ? ' (auto-show)' : ''}${preset.autoHide ? ' (auto-hide)' : ''}`}
                  >
                    {preset.label} <span className="text-zinc-500">{formatPresetTime(preset.seconds)}</span>
                  </button>
                  {/* Edit/delete icons on hover */}
                  <div className="hidden group-hover:flex absolute -top-1 -right-1 gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditPreset(preset) }}
                      className="w-3.5 h-3.5 bg-zinc-600 text-zinc-300 rounded-full text-[8px] flex items-center justify-center hover:bg-zinc-500"
                      title="Edit"
                    >
                      &#9998;
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.id) }}
                      className="w-3.5 h-3.5 bg-red-900/60 text-red-300 rounded-full text-[8px] flex items-center justify-center hover:bg-red-800/60"
                      title="Delete"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inline preset editor */}
          {(isAddingNew || editingPreset) && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded p-2 space-y-1.5">
              <input
                type="text"
                placeholder="Label (e.g. Ad Break)"
                value={presetLabel}
                onChange={e => setPresetLabel(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-600"
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <label className="text-[9px] text-zinc-600">Min</label>
                  <input
                    type="number" min={0} max={999}
                    value={presetMin}
                    onChange={e => setPresetMin(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <span className="text-zinc-500 mt-3">:</span>
                <div className="flex-1">
                  <label className="text-[9px] text-zinc-600">Sec</label>
                  <input
                    type="number" min={0} max={59}
                    value={presetSec}
                    onChange={e => setPresetSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={presetAutoShow}
                    onChange={e => setPresetAutoShow(e.target.checked)}
                    className="rounded border-zinc-600"
                  />
                  Auto-show
                </label>
                <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={presetAutoHide}
                    onChange={e => setPresetAutoHide(e.target.checked)}
                    className="rounded border-zinc-600"
                  />
                  Auto-hide
                </label>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={handleSavePreset}
                  className="flex-1 px-2 py-1 text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition"
                >
                  {isAddingNew ? 'Add' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
