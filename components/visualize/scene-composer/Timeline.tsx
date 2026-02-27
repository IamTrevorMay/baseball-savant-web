'use client'

import { useState, useRef, useCallback } from 'react'
import { Scene, SceneElement, Keyframe, EasingFunction } from '@/lib/sceneTypes'

interface Props {
  scene: Scene
  currentFrame: number
  playing: boolean
  onSetFrame: (frame: number) => void
  onTogglePlay: () => void
  onAddKeyframe: (elementId: string, frame: number) => void
  onDeleteKeyframe: (elementId: string, frameIndex: number) => void
  onUpdateKeyframeEasing: (elementId: string, frameIndex: number, easing: EasingFunction) => void
  onUpdateElement: (id: string, updates: Partial<SceneElement>) => void
  onUpdateScene: (updates: Partial<Scene>) => void
  selectedId: string | null
}

export default function Timeline({
  scene, currentFrame, playing,
  onSetFrame, onTogglePlay, onAddKeyframe, onDeleteKeyframe,
  onUpdateKeyframeEasing, onUpdateElement, onUpdateScene, selectedId,
}: Props) {
  const fps = scene.fps || 30
  const duration = scene.duration || 5
  const totalFrames = fps * duration
  const rulerRef = useRef<HTMLDivElement>(null)
  const [editingKf, setEditingKf] = useState<{ elId: string; kfIdx: number } | null>(null)

  const frameToPercent = (f: number) => (f / totalFrames) * 100
  const timeStr = (f: number) => {
    const s = f / fps
    return `${Math.floor(s)}:${String(Math.round((s % 1) * fps)).padStart(2, '0')}`
  }

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSetFrame(Math.round(pct * totalFrames))
  }, [totalFrames, onSetFrame])

  const handleTrackClick = useCallback((elId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const frame = Math.round(pct * totalFrames)
    onAddKeyframe(elId, frame)
  }, [totalFrames, onAddKeyframe])

  return (
    <div className="bg-zinc-900 border-t border-zinc-800 select-none" style={{ height: 180 }}>
      {/* Transport bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-zinc-800/50">
        <button
          onClick={onTogglePlay}
          className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-cyan-400 hover:border-cyan-600/40 transition text-sm"
        >
          {playing ? '\u275A\u275A' : '\u25B6'}
        </button>

        <div className="text-[11px] text-zinc-400 font-mono tabular-nums w-16 text-center">
          {timeStr(currentFrame)}
        </div>
        <div className="text-[10px] text-zinc-600 font-mono">
          F{currentFrame} / {totalFrames}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-zinc-500 flex items-center gap-1">
            Duration
            <input
              type="number"
              value={duration}
              onChange={e => onUpdateScene({ duration: Math.max(1, Number(e.target.value)) })}
              className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-300 text-right outline-none"
              min={1} max={60} step={1}
            />
            <span className="text-zinc-600">s</span>
          </label>
          <label className="text-[10px] text-zinc-500 flex items-center gap-1">
            FPS
            <input
              type="number"
              value={fps}
              onChange={e => onUpdateScene({ fps: Math.max(1, Math.min(60, Number(e.target.value))) })}
              className="w-10 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-300 text-right outline-none"
              min={1} max={60}
            />
          </label>
        </div>
      </div>

      {/* Ruler + tracks */}
      <div className="flex-1 overflow-y-auto" style={{ height: 140 }}>
        {/* Ruler */}
        <div
          ref={rulerRef}
          className="relative h-6 bg-zinc-800/30 border-b border-zinc-800/50 cursor-pointer"
          onClick={handleRulerClick}
        >
          {/* Frame markers */}
          {Array.from({ length: Math.min(duration + 1, 61) }).map((_, i) => {
            const frame = i * fps
            const pct = frameToPercent(frame)
            return (
              <div key={i} className="absolute top-0 flex flex-col items-center" style={{ left: `${pct}%` }}>
                <div className="w-px h-2.5 bg-zinc-600" />
                <span className="text-[8px] text-zinc-600 mt-0.5">{i}s</span>
              </div>
            )
          })}
          {/* Playhead */}
          <div
            className="absolute top-0 w-0.5 h-full bg-cyan-400 z-10"
            style={{ left: `${frameToPercent(currentFrame)}%` }}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-cyan-400 rounded-b-sm" />
          </div>
        </div>

        {/* Element tracks */}
        <div>
          {scene.elements.map(el => {
            const isSelected = el.id === selectedId
            const enterPct = el.enterFrame !== undefined ? frameToPercent(el.enterFrame) : 0
            const exitPct = el.exitFrame !== undefined ? frameToPercent(el.exitFrame) : 100

            return (
              <div key={el.id} className={`relative h-7 border-b border-zinc-800/30 flex items-center ${isSelected ? 'bg-zinc-800/40' : ''}`}>
                {/* Label */}
                <div className="w-28 shrink-0 px-2 text-[10px] text-zinc-500 truncate">
                  {el.type.replace('-', ' ')}
                </div>
                {/* Track area */}
                <div
                  className="flex-1 relative h-full cursor-pointer"
                  onClick={e => handleTrackClick(el.id, e)}
                >
                  {/* Visibility bar */}
                  <div
                    className="absolute top-1.5 h-4 rounded-sm"
                    style={{
                      left: `${enterPct}%`,
                      width: `${exitPct - enterPct}%`,
                      backgroundColor: isSelected ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                      border: isSelected ? '1px solid rgba(6,182,212,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  />
                  {/* Keyframe diamonds */}
                  {(el.keyframes || []).map((kf, ki) => (
                    <div
                      key={ki}
                      className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 cursor-pointer z-10 hover:scale-150 transition"
                      style={{
                        left: `${frameToPercent(kf.frame)}%`,
                        marginLeft: -5,
                        backgroundColor: editingKf?.elId === el.id && editingKf?.kfIdx === ki ? '#06b6d4' : '#a1a1aa',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        setEditingKf(editingKf?.elId === el.id && editingKf?.kfIdx === ki ? null : { elId: el.id, kfIdx: ki })
                      }}
                      onContextMenu={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        onDeleteKeyframe(el.id, ki)
                      }}
                    />
                  ))}
                  {/* Playhead line */}
                  <div
                    className="absolute top-0 w-px h-full bg-cyan-400/30"
                    style={{ left: `${frameToPercent(currentFrame)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Keyframe easing editor */}
        {editingKf && (() => {
          const el = scene.elements.find(e => e.id === editingKf.elId)
          const kf = el?.keyframes?.[editingKf.kfIdx]
          if (!el || !kf) return null
          return (
            <div className="px-3 py-2 border-t border-zinc-800/50 bg-zinc-800/30 flex items-center gap-3">
              <span className="text-[10px] text-zinc-500">Keyframe at F{kf.frame}</span>
              <select
                value={kf.easing}
                onChange={e => onUpdateKeyframeEasing(editingKf.elId, editingKf.kfIdx, e.target.value as EasingFunction)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-[10px] text-zinc-300 outline-none"
              >
                <option value="linear">Linear</option>
                <option value="ease-in">Ease In</option>
                <option value="ease-out">Ease Out</option>
                <option value="ease-in-out">Ease In Out</option>
              </select>
              <button
                onClick={() => { onDeleteKeyframe(editingKf.elId, editingKf.kfIdx); setEditingKf(null) }}
                className="text-[10px] text-red-400/70 hover:text-red-400 transition"
              >
                Delete
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
