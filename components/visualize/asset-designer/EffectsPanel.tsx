'use client'

import { useState } from 'react'
import { Effect } from '@/lib/sceneTypes'

interface Props {
  effects: Effect[]
  onChange: (effects: Effect[]) => void
}

const EFFECT_TYPES: { value: Effect['type']; label: string }[] = [
  { value: 'shadow', label: 'Shadow' },
  { value: 'inner-shadow', label: 'Inner Shadow' },
  { value: 'outer-glow', label: 'Outer Glow' },
  { value: 'inner-glow', label: 'Inner Glow' },
]

function createEffect(type: Effect['type']): Effect {
  const isGlow = type === 'outer-glow' || type === 'inner-glow'
  return {
    id: Math.random().toString(36).slice(2, 8),
    type,
    color: isGlow ? '#8b5cf6' : '#000000',
    blur: isGlow ? 12 : 8,
    offsetX: 0,
    offsetY: isGlow ? 0 : 4,
    spread: 0,
    opacity: isGlow ? 0.6 : 0.5,
  }
}

export default function EffectsPanel({ effects, onChange }: Props) {
  const [open, setOpen] = useState(true)

  function addEffect(type: Effect['type']) {
    onChange([...effects, createEffect(type)])
  }

  function updateEffect(id: string, updates: Partial<Effect>) {
    onChange(effects.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  function removeEffect(id: string) {
    onChange(effects.filter(e => e.id !== id))
  }

  return (
    <div className="border-b border-zinc-800 pb-3 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2 hover:text-zinc-300 transition"
      >
        Effects ({effects.length})
        <span className="text-[10px]">{open ? '\u25B4' : '\u25BE'}</span>
      </button>

      {open && (
        <div className="space-y-2">
          {effects.map(eff => {
            const isGlow = eff.type === 'outer-glow' || eff.type === 'inner-glow'
            return (
              <div key={eff.id} className="bg-zinc-800/50 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <select
                    value={eff.type}
                    onChange={e => updateEffect(eff.id, { type: e.target.value as Effect['type'] })}
                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:border-violet-600 outline-none"
                  >
                    {EFFECT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeEffect(eff.id)}
                    className="text-zinc-600 hover:text-red-400 text-[10px] transition px-1"
                  >
                    {'\u2715'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">Color</span>
                    <input
                      type="color"
                      value={eff.color}
                      onChange={e => updateEffect(eff.id, { color: e.target.value })}
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-none"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">Blur</span>
                    <input
                      type="number"
                      value={eff.blur}
                      onChange={e => updateEffect(eff.id, { blur: Number(e.target.value) })}
                      min={0} max={100}
                      className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 text-right focus:border-violet-600 outline-none"
                    />
                  </label>
                </div>

                {!isGlow && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-500">X</span>
                      <input
                        type="number"
                        value={eff.offsetX}
                        onChange={e => updateEffect(eff.id, { offsetX: Number(e.target.value) })}
                        min={-50} max={50}
                        className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 text-right focus:border-violet-600 outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-500">Y</span>
                      <input
                        type="number"
                        value={eff.offsetY}
                        onChange={e => updateEffect(eff.id, { offsetY: Number(e.target.value) })}
                        min={-50} max={50}
                        className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 text-right focus:border-violet-600 outline-none"
                      />
                    </label>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">Spread</span>
                    <input
                      type="number"
                      value={eff.spread}
                      onChange={e => updateEffect(eff.id, { spread: Number(e.target.value) })}
                      min={-20} max={50}
                      className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 text-right focus:border-violet-600 outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">Opacity</span>
                    <input
                      type="number"
                      value={eff.opacity}
                      onChange={e => updateEffect(eff.id, { opacity: Math.min(1, Math.max(0, Number(e.target.value))) })}
                      min={0} max={1} step={0.05}
                      className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 text-right focus:border-violet-600 outline-none"
                    />
                  </label>
                </div>
              </div>
            )
          })}

          {/* Add effect button */}
          <div className="flex gap-1 flex-wrap">
            {EFFECT_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => addEffect(t.value)}
                className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 hover:text-violet-400 hover:border-violet-600/40 transition"
              >
                + {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
