'use client'

import { useState, useEffect } from 'react'
import { SceneElement } from '@/lib/sceneTypes'
import PlayerPicker from '@/components/visualize/PlayerPicker'
import GradientPicker from './GradientPicker'

// ── Field Helpers (matching PropertiesPanel) ──────────────────────────────────

function NumField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-right focus:border-violet-600 outline-none"
      />
    </label>
  )
}

function TxtField({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  if (multiline) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-600 outline-none resize-none"
        />
      </label>
    )
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-violet-600 outline-none"
      />
    </label>
  )
}

function ClrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={isHex ? value : '#06b6d4'} onChange={e => onChange(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-[72px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-400 font-mono focus:border-violet-600 outline-none" />
      </div>
    </label>
  )
}

function SelField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-violet-600 outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="accent-violet-500" />
    </label>
  )
}

function Section({ title, children, collapsible, defaultOpen = true }: { title: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (collapsible) {
    return (
      <div className="border-b border-zinc-800 pb-3 mb-3">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2 hover:text-zinc-300 transition"
        >
          {title}
          <span className="text-[10px]">{open ? '\u25B4' : '\u25BE'}</span>
        </button>
        {open && <div className="space-y-2">{children}</div>}
      </div>
    )
  }
  return (
    <div className="border-b border-zinc-800 pb-3 mb-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Google Font Loader ──────────────────────────────────────────────────────

const GOOGLE_FONTS = [
  { value: '', label: 'System Default' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Roboto Condensed', label: 'Roboto Condensed' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Righteous', label: 'Righteous' },
  { value: 'Anton', label: 'Anton' },
]

const _loadedFontLinks = new Set<string>()

function useGoogleFont(family: string) {
  useEffect(() => {
    if (!family || _loadedFontLinks.has(family)) return
    _loadedFontLinks.add(family)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700;800;900&display=swap`
    document.head.appendChild(link)
  }, [family])
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  element: SceneElement
  onUpdate: (updates: Partial<SceneElement>) => void
  onUpdateProps: (propUpdates: Record<string, any>) => void
  onDelete: () => void
  onDuplicate: () => void
}

const TEXT_TYPES = new Set(['text', 'stat-card', 'ticker', 'comparison-bar'])

export default function DesignerPropertiesPanel({ element, onUpdate, onUpdateProps, onDelete, onDuplicate }: Props) {
  const p = element.props
  useGoogleFont(p.fontFamily || '')

  return (
    <div className="p-3 text-xs overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          {element.type.replace('-', ' ')}
        </span>
        <div className="flex gap-1">
          <button onClick={onDuplicate} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-violet-400 hover:border-violet-600/40 text-[10px] transition" title="Duplicate">
            {'\u2398'}
          </button>
          <button onClick={onDelete} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-600/40 text-[10px] transition" title="Delete">
            {'\u2715'}
          </button>
        </div>
      </div>

      {/* Transform */}
      <Section title="Transform">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={element.x} onChange={v => onUpdate({ x: v })} />
          <NumField label="Y" value={element.y} onChange={v => onUpdate({ y: v })} />
          <NumField label="W" value={element.width} onChange={v => onUpdate({ width: Math.max(20, v) })} min={20} />
          <NumField label="H" value={element.height} onChange={v => onUpdate({ height: Math.max(20, v) })} min={20} />
        </div>
        <NumField label="Rotation" value={element.rotation} onChange={v => onUpdate({ rotation: v })} />
        <NumField label="Opacity" value={element.opacity} onChange={v => onUpdate({ opacity: Math.min(1, Math.max(0, v)) })} min={0} max={1} step={0.05} />
      </Section>

      {/* Text Content */}
      {element.type === 'text' && (
        <Section title="Text">
          <TxtField label="Text" value={p.text} onChange={v => onUpdateProps({ text: v })} />
          <NumField label="Font Size" value={p.fontSize} onChange={v => onUpdateProps({ fontSize: v })} min={8} max={200} />
          <NumField label="Weight" value={p.fontWeight} onChange={v => onUpdateProps({ fontWeight: v })} min={100} max={900} step={100} />
          <ClrField label="Color" value={p.color} onChange={v => onUpdateProps({ color: v })} />
          <SelField label="Align" value={p.textAlign} onChange={v => onUpdateProps({ textAlign: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
          <NumField label="Letter Spacing" value={p.letterSpacing || 0} onChange={v => onUpdateProps({ letterSpacing: v })} min={-5} max={30} step={0.5} />
          <NumField label="Line Height" value={p.lineHeight || 1.2} onChange={v => onUpdateProps({ lineHeight: v })} min={0.5} max={3} step={0.1} />
        </Section>
      )}

      {/* Stat Card */}
      {element.type === 'stat-card' && (
        <Section title="Content">
          <TxtField label="Label" value={p.label} onChange={v => onUpdateProps({ label: v })} />
          <TxtField label="Value" value={p.value} onChange={v => onUpdateProps({ value: v })} />
          <TxtField label="Sublabel" value={p.sublabel} onChange={v => onUpdateProps({ sublabel: v })} />
          <ClrField label="Accent" value={p.color} onChange={v => onUpdateProps({ color: v })} />
          <NumField label="Font Size" value={p.fontSize} onChange={v => onUpdateProps({ fontSize: v })} min={12} max={120} />
          <SelField label="Variant" value={p.variant} onChange={v => onUpdateProps({ variant: v })} options={[{ value: 'glass', label: 'Glass' }, { value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }]} />
          <NumField label="Letter Spacing" value={p.letterSpacing || 0} onChange={v => onUpdateProps({ letterSpacing: v })} min={-5} max={30} step={0.5} />
          <NumField label="Line Height" value={p.lineHeight || 1.2} onChange={v => onUpdateProps({ lineHeight: v })} min={0.5} max={3} step={0.1} />
        </Section>
      )}

      {/* Shape */}
      {element.type === 'shape' && (
        <Section title="Shape">
          <SelField label="Type" value={p.shape} onChange={v => onUpdateProps({ shape: v })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'circle', label: 'Circle' }]} />
          <div className="text-[10px] text-zinc-600 font-medium mt-1 mb-1">Fill</div>
          <GradientPicker
            value={p.gradient || ''}
            fill={p.fill}
            onChange={v => onUpdateProps({ gradient: v })}
            onChangeFill={v => onUpdateProps({ fill: v })}
          />
          <ClrField label="Stroke" value={p.stroke} onChange={v => onUpdateProps({ stroke: v })} />
          <NumField label="Stroke W" value={p.strokeWidth} onChange={v => onUpdateProps({ strokeWidth: v })} min={0} max={20} />
          {p.shape !== 'circle' && (
            <NumField label="Radius" value={p.borderRadius} onChange={v => onUpdateProps({ borderRadius: v })} min={0} max={500} />
          )}
        </Section>
      )}

      {/* Player Image */}
      {element.type === 'player-image' && (
        <Section title="Player">
          <PlayerPicker label="Search player..." onSelect={(id, name) => onUpdateProps({ playerId: id, playerName: name })} />
          {p.playerId && (
            <div className="flex items-center gap-2 mt-1 p-1.5 rounded bg-zinc-800/80 border border-zinc-700/50">
              <img
                src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`}
                alt={p.playerName}
                className="w-8 h-8 rounded object-cover"
              />
              <div className="min-w-0">
                <div className="text-[11px] text-zinc-200 truncate">{p.playerName}</div>
                <div className="text-[10px] text-zinc-500 font-mono">ID: {p.playerId}</div>
              </div>
            </div>
          )}
          <ClrField label="Border" value={p.borderColor} onChange={v => onUpdateProps({ borderColor: v })} />
          <BoolField label="Show Label" value={p.showLabel} onChange={v => onUpdateProps({ showLabel: v })} />
        </Section>
      )}

      {/* Image */}
      {element.type === 'image' && (
        <Section title="Image">
          <ImageUpload src={p.src} onUpdateProps={onUpdateProps} />
          <SelField label="Fit" value={p.objectFit || 'cover'} onChange={v => onUpdateProps({ objectFit: v })} options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }, { value: 'fill', label: 'Fill' }]} />
        </Section>
      )}

      {/* Comparison Bar */}
      {element.type === 'comparison-bar' && (
        <Section title="Stat Bar">
          <TxtField label="Label" value={p.label} onChange={v => onUpdateProps({ label: v })} />
          <NumField label="Value" value={p.value} onChange={v => onUpdateProps({ value: v })} step={0.1} />
          <NumField label="Max" value={p.maxValue} onChange={v => onUpdateProps({ maxValue: v })} step={0.1} />
          <ClrField label="Color" value={p.color} onChange={v => onUpdateProps({ color: v })} />
          <ClrField label="Track BG" value={p.barBgColor || '#27272a'} onChange={v => onUpdateProps({ barBgColor: v })} />
          <BoolField label="Show Value" value={p.showValue} onChange={v => onUpdateProps({ showValue: v })} />
        </Section>
      )}

      {/* Ticker */}
      {element.type === 'ticker' && (
        <>
          <Section title="Content">
            <TxtField label="Text" value={p.text || ''} onChange={v => onUpdateProps({ text: v })} multiline />
            <NumField label="Font Size" value={p.fontSize || 20} onChange={v => onUpdateProps({ fontSize: v })} min={10} max={80} />
            <ClrField label="Color" value={p.color || '#ffffff'} onChange={v => onUpdateProps({ color: v })} />
            <TxtField label="Separator" value={p.separator || ' \u2022 '} onChange={v => onUpdateProps({ separator: v })} />
          </Section>
          <Section title="Scroll">
            <NumField label="Speed" value={p.speed || 60} onChange={v => onUpdateProps({ speed: v })} min={10} max={300} />
            <SelField label="Direction" value={p.direction || 'left'} onChange={v => onUpdateProps({ direction: v })} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
          </Section>
        </>
      )}

      {/* Typography (for text types) */}
      {TEXT_TYPES.has(element.type) && (
        <Section title="Typography" collapsible defaultOpen={false}>
          <SelField label="Font" value={p.fontFamily || ''} onChange={v => onUpdateProps({ fontFamily: v })} options={GOOGLE_FONTS} />
          <SelField label="Transform" value={p.textTransform || 'none'} onChange={v => onUpdateProps({ textTransform: v })} options={[
            { value: 'none', label: 'None' }, { value: 'uppercase', label: 'UPPERCASE' },
            { value: 'lowercase', label: 'lowercase' }, { value: 'capitalize', label: 'Capitalize' },
          ]} />
          <div className="text-[10px] text-zinc-600 font-medium mt-2">Text Shadow</div>
          <NumField label="Blur" value={p.textShadowBlur || 0} onChange={v => onUpdateProps({ textShadowBlur: v })} min={0} max={30} />
          {(p.textShadowBlur || 0) > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <NumField label="X" value={p.textShadowOffsetX || 0} onChange={v => onUpdateProps({ textShadowOffsetX: v })} min={-10} max={10} />
                <NumField label="Y" value={p.textShadowOffsetY || 0} onChange={v => onUpdateProps({ textShadowOffsetY: v })} min={-10} max={10} />
              </div>
              <ClrField label="Color" value={p.textShadowColor || '#06b6d4'} onChange={v => onUpdateProps({ textShadowColor: v })} />
            </>
          )}
        </Section>
      )}

      {/* Style (universal) */}
      <Section title="Style" collapsible defaultOpen={false}>
        <div className="text-[10px] text-zinc-600 font-medium">Drop Shadow</div>
        <NumField label="Blur" value={p.shadowBlur || 0} onChange={v => onUpdateProps({ shadowBlur: v })} min={0} max={50} />
        {(p.shadowBlur || 0) > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="X" value={p.shadowOffsetX || 0} onChange={v => onUpdateProps({ shadowOffsetX: v })} min={-20} max={20} />
              <NumField label="Y" value={p.shadowOffsetY ?? 4} onChange={v => onUpdateProps({ shadowOffsetY: v })} min={-20} max={20} />
            </div>
            <ClrField label="Color" value={p.shadowColor || '#000000'} onChange={v => onUpdateProps({ shadowColor: v })} />
          </>
        )}
        <div className="text-[10px] text-zinc-600 font-medium mt-2">Border</div>
        <NumField label="Width" value={p.borderWidth || 0} onChange={v => onUpdateProps({ borderWidth: v })} min={0} max={20} />
        {(p.borderWidth || 0) > 0 && (
          <ClrField label="Color" value={p.borderColor || '#06b6d4'} onChange={v => onUpdateProps({ borderColor: v })} />
        )}
        <NumField label="Radius" value={p.borderRadius ?? 12} onChange={v => onUpdateProps({ borderRadius: v })} min={0} max={100} />
        <div className="text-[10px] text-zinc-600 font-medium mt-2">Background</div>
        <ClrField label="Color" value={p.bgColor || ''} onChange={v => onUpdateProps({ bgColor: v })} />
        <NumField label="Opacity" value={p.bgOpacity ?? 1} onChange={v => onUpdateProps({ bgOpacity: Math.min(1, Math.max(0, v)) })} min={0} max={1} step={0.05} />
      </Section>

      {/* Layer */}
      <Section title="Layer">
        <div className="flex gap-1">
          <button onClick={() => onUpdate({ zIndex: element.zIndex + 1 })} className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-[10px] transition">
            {'\u2191'} Forward
          </button>
          <button onClick={() => onUpdate({ zIndex: Math.max(1, element.zIndex - 1) })} className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-[10px] transition">
            {'\u2193'} Back
          </button>
        </div>
        <BoolField label="Locked" value={element.locked} onChange={v => onUpdate({ locked: v })} />
      </Section>
    </div>
  )
}

// ── Image Upload helper ──────────────────────────────────────────────────────

function ImageUpload({ src, onUpdateProps }: { src: string; onUpdateProps: (u: Record<string, any>) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onUpdateProps({ src: reader.result as string })
    reader.readAsDataURL(file)
  }

  return (
    <>
      <label className="block">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="hidden" />
        <div className="w-full px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-violet-400 hover:border-violet-600/40 transition cursor-pointer text-center">
          {src ? 'Replace Image' : 'Upload Image'}
        </div>
      </label>
      {src && (
        <>
          <div className="mt-1 rounded overflow-hidden border border-zinc-700">
            <img src={src} alt="preview" className="w-full h-20 object-contain bg-zinc-900" />
          </div>
          <button onClick={() => onUpdateProps({ src: '' })} className="w-full px-3 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-red-400 hover:text-red-300 transition">
            Remove Image
          </button>
        </>
      )}
    </>
  )
}
