'use client'

import { SceneElement } from '@/lib/sceneTypes'

interface Props {
  element: SceneElement
  onUpdate: (updates: Partial<SceneElement>) => void
  onUpdateProps: (propUpdates: Record<string, any>) => void
  onDelete: () => void
  onDuplicate: () => void
}

// ── Field Helpers ────────────────────────────────────────────────────────────

function NumField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-right focus:border-cyan-600 outline-none"
      />
    </label>
  )
}

function TxtField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-cyan-600 outline-none"
      />
    </label>
  )
}

function ClrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Normalize rgba/non-hex to display-only text
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={isHex ? value : '#06b6d4'}
          onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-[72px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-400 font-mono focus:border-cyan-600 outline-none"
        />
      </div>
    </label>
  )
}

function SelField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-cyan-600 outline-none"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="accent-cyan-500" />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-800 pb-3 mb-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function PropertiesPanel({ element, onUpdate, onUpdateProps, onDelete, onDuplicate }: Props) {
  const p = element.props

  return (
    <div className="p-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          {element.type.replace('-', ' ')}
        </span>
        <div className="flex gap-1">
          <button onClick={onDuplicate} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-cyan-400 hover:border-cyan-600/40 text-[10px] transition" title="Duplicate">
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

      {/* Stat Card */}
      {element.type === 'stat-card' && (
        <Section title="Content">
          <TxtField label="Label" value={p.label} onChange={v => onUpdateProps({ label: v })} />
          <TxtField label="Value" value={p.value} onChange={v => onUpdateProps({ value: v })} />
          <TxtField label="Sublabel" value={p.sublabel} onChange={v => onUpdateProps({ sublabel: v })} />
          <ClrField label="Accent" value={p.color} onChange={v => onUpdateProps({ color: v })} />
          <NumField label="Font Size" value={p.fontSize} onChange={v => onUpdateProps({ fontSize: v })} min={12} max={120} />
          <SelField
            label="Variant"
            value={p.variant}
            onChange={v => onUpdateProps({ variant: v })}
            options={[
              { value: 'glass', label: 'Glass' },
              { value: 'solid', label: 'Solid' },
              { value: 'outline', label: 'Outline' },
            ]}
          />
        </Section>
      )}

      {/* Text */}
      {element.type === 'text' && (
        <Section title="Content">
          <TxtField label="Text" value={p.text} onChange={v => onUpdateProps({ text: v })} />
          <NumField label="Font Size" value={p.fontSize} onChange={v => onUpdateProps({ fontSize: v })} min={8} max={200} />
          <NumField label="Weight" value={p.fontWeight} onChange={v => onUpdateProps({ fontWeight: v })} min={100} max={900} step={100} />
          <ClrField label="Color" value={p.color} onChange={v => onUpdateProps({ color: v })} />
          <SelField
            label="Align"
            value={p.textAlign}
            onChange={v => onUpdateProps({ textAlign: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Section>
      )}

      {/* Shape */}
      {element.type === 'shape' && (
        <Section title="Shape">
          <SelField
            label="Type"
            value={p.shape}
            onChange={v => onUpdateProps({ shape: v })}
            options={[
              { value: 'rect', label: 'Rectangle' },
              { value: 'circle', label: 'Circle' },
            ]}
          />
          <ClrField label="Fill" value={p.fill} onChange={v => onUpdateProps({ fill: v })} />
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
          <TxtField label="Name" value={p.playerName} onChange={v => onUpdateProps({ playerName: v })} />
          <NumField label="MLB ID" value={p.playerId || 0} onChange={v => onUpdateProps({ playerId: v || null })} />
          <ClrField label="Border" value={p.borderColor} onChange={v => onUpdateProps({ borderColor: v })} />
          <BoolField label="Show Label" value={p.showLabel} onChange={v => onUpdateProps({ showLabel: v })} />
        </Section>
      )}

      {/* Comparison Bar */}
      {element.type === 'comparison-bar' && (
        <Section title="Stat Bar">
          <TxtField label="Label" value={p.label} onChange={v => onUpdateProps({ label: v })} />
          <NumField label="Value" value={p.value} onChange={v => onUpdateProps({ value: v })} step={0.1} />
          <NumField label="Max" value={p.maxValue} onChange={v => onUpdateProps({ maxValue: v })} step={0.1} />
          <ClrField label="Color" value={p.color} onChange={v => onUpdateProps({ color: v })} />
          <BoolField label="Show Value" value={p.showValue} onChange={v => onUpdateProps({ showValue: v })} />
        </Section>
      )}

      {/* Layer */}
      <Section title="Layer">
        <div className="flex gap-1">
          <button
            onClick={() => onUpdate({ zIndex: element.zIndex + 1 })}
            className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-[10px] transition"
          >
            {'\u2191'} Forward
          </button>
          <button
            onClick={() => onUpdate({ zIndex: Math.max(1, element.zIndex - 1) })}
            className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-[10px] transition"
          >
            {'\u2193'} Back
          </button>
        </div>
        <BoolField label="Locked" value={element.locked} onChange={v => onUpdate({ locked: v })} />
      </Section>
    </div>
  )
}
