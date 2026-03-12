'use client'

import { useState } from 'react'

interface GradientStop {
  color: string
  position: number // 0-100
}

interface Props {
  value: string // CSS gradient string or solid hex
  fill: string  // solid fallback color
  onChange: (gradient: string) => void
  onChangeFill: (color: string) => void
}

type GradientMode = 'solid' | 'linear' | 'radial'

function parseMode(gradient: string): GradientMode {
  if (!gradient) return 'solid'
  if (gradient.startsWith('linear-gradient')) return 'linear'
  if (gradient.startsWith('radial-gradient')) return 'radial'
  return 'solid'
}

function parseStops(gradient: string): GradientStop[] {
  const match = gradient.match(/,\s*(.+)\)$/)
  if (!match) return [{ color: '#06b6d4', position: 0 }, { color: '#8b5cf6', position: 100 }]
  const raw = match[1].split(/,\s*(?=#|rgb|hsl)/)
  return raw.map(s => {
    const parts = s.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/)
    if (parts) return { color: parts[1].trim(), position: parseFloat(parts[2]) }
    return { color: s.trim(), position: 0 }
  })
}

function parseAngle(gradient: string): number {
  const m = gradient.match(/linear-gradient\(\s*(\d+)deg/)
  return m ? parseFloat(m[1]) : 180
}

function parseCenterX(gradient: string): number {
  const m = gradient.match(/at\s+(\d+)%/)
  return m ? parseFloat(m[1]) : 50
}

function parseCenterY(gradient: string): number {
  const m = gradient.match(/at\s+\d+%\s+(\d+)%/)
  return m ? parseFloat(m[1]) : 50
}

function buildGradient(mode: GradientMode, stops: GradientStop[], angle: number, cx: number, cy: number): string {
  const stopsStr = stops.map(s => `${s.color} ${s.position}%`).join(', ')
  if (mode === 'linear') return `linear-gradient(${angle}deg, ${stopsStr})`
  if (mode === 'radial') return `radial-gradient(circle at ${cx}% ${cy}%, ${stopsStr})`
  return ''
}

export default function GradientPicker({ value, fill, onChange, onChangeFill }: Props) {
  const [mode, setMode] = useState<GradientMode>(parseMode(value))
  const [stops, setStops] = useState<GradientStop[]>(
    value ? parseStops(value) : [{ color: '#06b6d4', position: 0 }, { color: '#8b5cf6', position: 100 }]
  )
  const [angle, setAngle] = useState(value ? parseAngle(value) : 180)
  const [cx, setCx] = useState(value ? parseCenterX(value) : 50)
  const [cy, setCy] = useState(value ? parseCenterY(value) : 50)

  function emit(m: GradientMode, s: GradientStop[], a: number, cxv: number, cyv: number) {
    if (m === 'solid') {
      onChange('')
    } else {
      onChange(buildGradient(m, s, a, cxv, cyv))
    }
  }

  function updateStop(idx: number, updates: Partial<GradientStop>) {
    const next = stops.map((s, i) => i === idx ? { ...s, ...updates } : s)
    setStops(next)
    emit(mode, next, angle, cx, cy)
  }

  function addStop() {
    const next = [...stops, { color: '#ffffff', position: 50 }].sort((a, b) => a.position - b.position)
    setStops(next)
    emit(mode, next, angle, cx, cy)
  }

  function removeStop(idx: number) {
    if (stops.length <= 2) return
    const next = stops.filter((_, i) => i !== idx)
    setStops(next)
    emit(mode, next, angle, cx, cy)
  }

  const previewBg = mode === 'solid'
    ? fill
    : buildGradient(mode, stops, angle, cx, cy)

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-1">
        {(['solid', 'linear', 'radial'] as const).map(m => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              if (m === 'solid') {
                onChange('')
              } else {
                if (stops.length < 2) {
                  const newStops = [{ color: '#06b6d4', position: 0 }, { color: '#8b5cf6', position: 100 }]
                  setStops(newStops)
                  emit(m, newStops, angle, cx, cy)
                } else {
                  emit(m, stops, angle, cx, cy)
                }
              }
            }}
            className={`flex-1 px-1.5 py-1 rounded text-[10px] transition ${
              mode === m
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/40'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div
        className="w-full h-6 rounded border border-zinc-700"
        style={{ background: previewBg }}
      />

      {mode === 'solid' && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500">Color</span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(fill) ? fill : '#18181b'}
              onChange={e => onChangeFill(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
            />
            <input
              type="text"
              value={fill}
              onChange={e => onChangeFill(e.target.value)}
              className="w-[72px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-400 font-mono focus:border-purple-600 outline-none"
            />
          </div>
        </label>
      )}

      {mode !== 'solid' && (
        <>
          {/* Angle / Center */}
          {mode === 'linear' && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-500">Angle</span>
              <input
                type="range"
                min={0}
                max={360}
                value={angle}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  setAngle(v)
                  emit(mode, stops, v, cx, cy)
                }}
                className="w-24 accent-purple-500"
              />
              <span className="text-[10px] text-zinc-400 w-8 text-right">{angle}&deg;</span>
            </label>
          )}
          {mode === 'radial' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-zinc-500">CX</span>
                <input
                  type="number"
                  value={cx}
                  onChange={e => { const v = Number(e.target.value); setCx(v); emit(mode, stops, angle, v, cy) }}
                  min={0} max={100}
                  className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 text-right focus:border-purple-600 outline-none"
                />
              </label>
              <label className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-zinc-500">CY</span>
                <input
                  type="number"
                  value={cy}
                  onChange={e => { const v = Number(e.target.value); setCy(v); emit(mode, stops, angle, cx, v) }}
                  min={0} max={100}
                  className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 text-right focus:border-purple-600 outline-none"
                />
              </label>
            </div>
          )}

          {/* Stops */}
          <div className="space-y-1.5">
            {stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(stop.color) ? stop.color : '#06b6d4'}
                  onChange={e => updateStop(i, { color: e.target.value })}
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-none shrink-0"
                />
                <input
                  type="text"
                  value={stop.color}
                  onChange={e => updateStop(i, { color: e.target.value })}
                  className="w-[60px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-400 font-mono focus:border-purple-600 outline-none"
                />
                <input
                  type="number"
                  value={stop.position}
                  onChange={e => updateStop(i, { position: Number(e.target.value) })}
                  min={0} max={100}
                  className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-zinc-200 text-right focus:border-purple-600 outline-none"
                />
                <span className="text-[9px] text-zinc-600">%</span>
                {stops.length > 2 && (
                  <button
                    onClick={() => removeStop(i)}
                    className="text-[10px] text-zinc-600 hover:text-red-400 transition px-0.5"
                  >{'\u2715'}</button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addStop}
            className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 border-dashed text-[10px] text-zinc-500 hover:text-purple-400 hover:border-purple-600/40 transition"
          >
            + Add Stop
          </button>
        </>
      )}
    </div>
  )
}
