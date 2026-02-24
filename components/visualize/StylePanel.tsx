'use client'
import { useState } from 'react'
import { useStyle } from './StyleContext'
import { PALETTE_PRESETS, DEFAULT_STYLE } from '@/lib/stylePresets'
import { PITCH_COLORS } from '@/components/chartConfig'

// Common pitch names for per-pitch color overrides
const COMMON_PITCHES = [
  '4-Seam Fastball', 'Sinker', 'Cutter', 'Slider', 'Sweeper',
  'Changeup', 'Splitter', 'Curveball', 'Knuckle Curve',
]

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition"
      >
        {title}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function SliderField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="text-[11px] text-zinc-500 tabular-nums">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
          [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer
          ${checked ? 'bg-cyan-600' : 'bg-zinc-700'}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform
          ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  )
}

function TextInput({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder: string; onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-zinc-400 block mb-1">{label}</span>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
          placeholder:text-zinc-600 focus:outline-none focus:border-cyan-600/50 transition"
      />
    </label>
  )
}

interface StylePanelProps {
  open: boolean
  onClose: () => void
}

export default function StylePanel({ open, onClose }: StylePanelProps) {
  const { style, updateStyle, resetStyle } = useStyle()

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-80 z-30 bg-zinc-900 border-l border-zinc-800
        shadow-2xl shadow-black/40 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-bold text-white">Style</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={resetStyle}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition"
            >
              Reset
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto">
          {/* Colors */}
          <Section title="Colors" defaultOpen={true}>
            <label className="block">
              <span className="text-[11px] text-zinc-400 block mb-1">Palette</span>
              <select
                value={style.paletteId}
                onChange={e => updateStyle({ paletteId: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
                  focus:outline-none focus:border-cyan-600/50 transition cursor-pointer"
              >
                {PALETTE_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <div>
              <span className="text-[11px] text-zinc-400 block mb-1.5">Pitch Colors</span>
              <div className="grid grid-cols-3 gap-1.5">
                {COMMON_PITCHES.map(name => {
                  const current = style.pitchColorOverrides[name] ||
                    PALETTE_PRESETS.find(p => p.id === style.paletteId)?.colors[name] ||
                    PITCH_COLORS[name] || '#71717a'
                  return (
                    <label key={name} className="flex items-center gap-1.5 cursor-pointer" title={name}>
                      <input
                        type="color" value={current}
                        onChange={e => updateStyle({
                          pitchColorOverrides: { ...style.pitchColorOverrides, [name]: e.target.value }
                        })}
                        className="w-5 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer
                          [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded"
                      />
                      <span className="text-[10px] text-zinc-500 truncate">{name.split(' ').pop()}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] text-zinc-400 block mb-1">Background</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.backgroundColor || '#09090b'}
                  onChange={e => updateStyle({ backgroundColor: e.target.value })}
                  className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer
                    [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded"
                />
                <input
                  type="text" value={style.backgroundColor} placeholder="auto"
                  onChange={e => updateStyle({ backgroundColor: e.target.value })}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
                    placeholder:text-zinc-600 focus:outline-none focus:border-cyan-600/50 transition"
                />
              </div>
            </label>
          </Section>

          {/* Rendering */}
          <Section title="Rendering">
            <SliderField label="Trail Length" value={style.trailLength} min={0} max={20} step={1}
              onChange={v => updateStyle({ trailLength: v })} />
            <SliderField label="Trail Opacity" value={style.trailOpacity} min={0} max={1} step={0.05}
              onChange={v => updateStyle({ trailOpacity: v })} />
            <SliderField label="Trail Width" value={style.trailWidth} min={1} max={5} step={0.5}
              onChange={v => updateStyle({ trailWidth: v })} />
            <SliderField label="Ball Size" value={style.ballSize} min={0.5} max={3} step={0.1}
              onChange={v => updateStyle({ ballSize: v })} />
            <Toggle label="Glow Effect" checked={style.glowEnabled}
              onChange={v => updateStyle({ glowEnabled: v })} />
          </Section>

          {/* Animation */}
          <Section title="Animation">
            <SliderField label="Playback Speed" value={style.playbackSpeed} min={0.25} max={4} step={0.25}
              onChange={v => updateStyle({ playbackSpeed: v })} />
            <SliderField label="Batch Size" value={style.batchSize} min={1} max={20} step={1}
              onChange={v => updateStyle({ batchSize: v })} />
            <SliderField label="Max Pitch Override" value={style.maxPitchOverride} min={0} max={2000} step={10}
              onChange={v => updateStyle({ maxPitchOverride: v })} />
            <span className="text-[10px] text-zinc-600">0 = use quality preset</span>
          </Section>

          {/* Display */}
          <Section title="Display">
            <TextInput label="Title Override" value={style.titleOverride} placeholder="auto"
              onChange={v => updateStyle({ titleOverride: v })} />
            <TextInput label="Subtitle" value={style.subtitleText} placeholder="none"
              onChange={v => updateStyle({ subtitleText: v })} />
            <TextInput label="Watermark" value={style.watermarkText} placeholder="none"
              onChange={v => updateStyle({ watermarkText: v })} />
            <SliderField label="Font Scale" value={style.fontScale} min={0.75} max={2} step={0.05}
              onChange={v => updateStyle({ fontScale: v })} />
            <Toggle label="Show Legend" checked={style.showLegend}
              onChange={v => updateStyle({ showLegend: v })} />
            <Toggle label="Show Axis Labels" checked={style.showAxisLabels}
              onChange={v => updateStyle({ showAxisLabels: v })} />
            <Toggle label="Show Grid Lines" checked={style.showGridLines}
              onChange={v => updateStyle({ showGridLines: v })} />
            <Toggle label="Show Stat Callouts" checked={style.showStatCallouts}
              onChange={v => updateStyle({ showStatCallouts: v })} />
          </Section>
        </div>
      </div>
    </>
  )
}
