'use client'

import { useState } from 'react'
import { SceneElement, DataBinding } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import PlayerPicker from '@/components/visualize/PlayerPicker'

const PITCH_TYPES = [
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

interface Props {
  element: SceneElement
  onUpdate: (updates: Partial<SceneElement>) => void
  onUpdateProps: (propUpdates: Record<string, any>) => void
  onUpdateBinding: (binding: DataBinding | undefined) => void
  onFetchBinding: () => void
  onDelete: () => void
  onDuplicate: () => void
  bindingLoading?: boolean
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

// ── Player Image Section ─────────────────────────────────────────────────────

function PlayerImageSection({ p, onUpdateProps }: { p: Record<string, any>; onUpdateProps: (u: Record<string, any>) => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const imgUrl = p.playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
    : null

  return (
    <>
      <Section title="Player">
        <PlayerPicker
          label="Search player..."
          onSelect={(id, name) => onUpdateProps({ playerId: id, playerName: name })}
        />
        {p.playerId && (
          <div className="flex items-center gap-2 mt-1 p-1.5 rounded bg-zinc-800/80 border border-zinc-700/50">
            <img src={imgUrl!} alt={p.playerName} className="w-8 h-8 rounded object-cover" />
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-200 truncate">{p.playerName}</div>
              <div className="text-[10px] text-zinc-500 font-mono">ID: {p.playerId}</div>
            </div>
          </div>
        )}
        <ClrField label="Border" value={p.borderColor} onChange={v => onUpdateProps({ borderColor: v })} />
        <BoolField label="Show Label" value={p.showLabel} onChange={v => onUpdateProps({ showLabel: v })} />
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition mt-1"
        >
          {showAdvanced ? '\u25B4 Hide' : '\u25BE Advanced'} manual ID
        </button>
        {showAdvanced && (
          <div className="space-y-2 mt-1 pl-2 border-l border-zinc-700/50">
            <TxtField label="Name" value={p.playerName} onChange={v => onUpdateProps({ playerName: v })} />
            <NumField label="MLB ID" value={p.playerId || 0} onChange={v => onUpdateProps({ playerId: v || null })} />
          </div>
        )}
      </Section>
    </>
  )
}

// ── Data Binding Section ─────────────────────────────────────────────────────

function DataBindingSection({ binding, onUpdateBinding, onFetch, loading }: {
  binding?: DataBinding
  onUpdateBinding: (b: DataBinding | undefined) => void
  onFetch: () => void
  loading?: boolean
}) {
  const [source, setSource] = useState<'manual' | 'statcast' | 'lahman'>(binding?.source || 'manual')

  function updateField(field: string, value: any) {
    const base: DataBinding = binding || { playerId: 0, playerName: '', metric: 'avg_velo', source: 'statcast' }
    onUpdateBinding({ ...base, [field]: value })
  }

  return (
    <Section title="Data Binding">
      <SelField
        label="Source"
        value={source}
        onChange={v => {
          const s = v as 'manual' | 'statcast' | 'lahman'
          setSource(s)
          if (s === 'manual') { onUpdateBinding(undefined) }
          else { updateField('source', s) }
        }}
        options={[
          { value: 'manual', label: 'Manual' },
          { value: 'statcast', label: 'Statcast' },
          { value: 'lahman', label: 'Lahman' },
        ]}
      />
      {source !== 'manual' && (
        <>
          <PlayerPicker
            label="Pick player..."
            onSelect={(id, name) => {
              updateField('playerId', id)
              updateField('playerName', name)
              onUpdateBinding({ ...(binding || { playerId: 0, playerName: '', metric: 'avg_velo', source }), playerId: id, playerName: name })
            }}
          />
          {binding?.playerName && (
            <div className="text-[10px] text-cyan-400/70 truncate">{binding.playerName}</div>
          )}
          {source === 'statcast' && (
            <>
              <SelField
                label="Metric"
                value={binding?.metric || 'avg_velo'}
                onChange={v => updateField('metric', v)}
                options={SCENE_METRICS}
              />
              <NumField
                label="Year"
                value={binding?.gameYear || 2024}
                onChange={v => updateField('gameYear', v)}
                min={2015} max={2025}
              />
              <SelField
                label="Pitch Type"
                value={binding?.pitchType || ''}
                onChange={v => updateField('pitchType', v || undefined)}
                options={[{ value: '', label: 'All' }, ...PITCH_TYPES]}
              />
            </>
          )}
          {source === 'lahman' && (
            <TxtField
              label="Lahman Stat"
              value={binding?.lahmanStat || 'era'}
              onChange={v => updateField('lahmanStat', v)}
            />
          )}
          <button
            onClick={onFetch}
            disabled={!binding?.playerId || loading}
            className="w-full mt-1 px-3 py-1.5 rounded bg-cyan-600/20 border border-cyan-600/50 text-[11px] font-medium text-cyan-300 hover:bg-cyan-600/30 transition disabled:opacity-40"
          >
            {loading ? 'Fetching...' : 'Fetch & Apply'}
          </button>
        </>
      )}
    </Section>
  )
}

// ── Pitch Flight Section ────────────────────────────────────────────────────

const DEFAULT_PITCH_COLORS = ['#06b6d4', '#f97316', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#ec4899', '#3b82f6']

interface PitchEntry {
  id: string
  playerId: number | null
  playerName: string
  pitchType: string
  pitchColor: string
  mode: 'player' | 'custom'
  customPitch?: any
  plateX?: number
  plateZ?: number
  gameYear?: number
  dateFrom?: string
  dateTo?: string
  showInKey?: boolean
}

function PitchFlightSection({ p, onUpdateProps }: { p: Record<string, any>; onUpdateProps: (u: Record<string, any>) => void }) {
  // Normalize legacy single-pitch into array
  const pitches: PitchEntry[] = (p.pitches && Array.isArray(p.pitches) && p.pitches.length > 0)
    ? p.pitches
    : [{ id: 'p1', playerId: p.playerId ?? null, playerName: p.playerName ?? '', pitchType: p.pitchType ?? 'FF', pitchColor: p.pitchColor ?? '#06b6d4', mode: p.mode ?? 'player', customPitch: p.customPitch ?? null }]

  function updatePitch(idx: number, updates: Partial<PitchEntry>) {
    const next = pitches.map((pt, i) => i === idx ? { ...pt, ...updates } : pt)
    onUpdateProps({ pitches: next })
  }

  function addPitch() {
    const colorIdx = pitches.length % DEFAULT_PITCH_COLORS.length
    const newPitch: PitchEntry = {
      id: Math.random().toString(36).slice(2, 8),
      playerId: null, playerName: '', pitchType: 'FF',
      pitchColor: DEFAULT_PITCH_COLORS[colorIdx],
      mode: 'player', customPitch: null,
    }
    onUpdateProps({ pitches: [...pitches, newPitch] })
  }

  function removePitch(idx: number) {
    if (pitches.length <= 1) return
    onUpdateProps({ pitches: pitches.filter((_, i) => i !== idx) })
  }

  return (
    <>
      {/* Per-pitch controls */}
      {pitches.map((pt, idx) => (
        <Section key={pt.id} title={`Pitch ${idx + 1}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pt.pitchColor }} />
              <span className="text-[10px] text-zinc-400">{pt.playerName || 'No pitcher'}</span>
            </div>
            {pitches.length > 1 && (
              <button
                onClick={() => removePitch(idx)}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition px-1"
                title="Remove pitch"
              >
                {'\u2715'}
              </button>
            )}
          </div>
          <SelField
            label="Mode"
            value={pt.mode || 'player'}
            onChange={v => updatePitch(idx, { mode: v as 'player' | 'custom' })}
            options={[
              { value: 'player', label: 'Player Data' },
              { value: 'custom', label: 'Custom Pitch' },
            ]}
          />
          {pt.mode !== 'custom' && (
            <>
              <PlayerPicker
                label="Pick pitcher..."
                onSelect={(id, name) => updatePitch(idx, { playerId: id, playerName: name })}
              />
              {pt.playerName && (
                <div className="text-[10px] text-cyan-400/70 truncate">{pt.playerName}</div>
              )}
            </>
          )}
          <SelField
            label="Pitch Type"
            value={pt.pitchType || 'FF'}
            onChange={v => updatePitch(idx, { pitchType: v })}
            options={PITCH_TYPES}
          />
          <ClrField label="Color" value={pt.pitchColor || '#06b6d4'} onChange={v => updatePitch(idx, { pitchColor: v })} />

          {/* Zone location */}
          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/50">
            <div className="text-[10px] text-zinc-600 mb-1">Plate Location (ft)</div>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="H" value={pt.plateX ?? 0} onChange={v => updatePitch(idx, { plateX: v })} step={0.1} min={-2} max={2} />
              <NumField label="V" value={pt.plateZ ?? 0} onChange={v => updatePitch(idx, { plateZ: v })} step={0.1} min={-2} max={2} />
            </div>
          </div>

          {/* Date filters */}
          {pt.mode !== 'custom' && (
            <div className="mt-1.5 pt-1.5 border-t border-zinc-800/50">
              <div className="text-[10px] text-zinc-600 mb-1">Data Filter</div>
              <NumField label="Season" value={pt.gameYear ?? 0} onChange={v => updatePitch(idx, { gameYear: v || undefined })} min={2015} max={2025} />
              <label className="flex flex-col gap-0.5 mt-1">
                <span className="text-[10px] text-zinc-600">Date Range</span>
                <div className="flex gap-1">
                  <input
                    type="date"
                    value={pt.dateFrom || ''}
                    onChange={e => updatePitch(idx, { dateFrom: e.target.value || undefined })}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:border-cyan-600 outline-none"
                  />
                  <input
                    type="date"
                    value={pt.dateTo || ''}
                    onChange={e => updatePitch(idx, { dateTo: e.target.value || undefined })}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:border-cyan-600 outline-none"
                  />
                </div>
              </label>
            </div>
          )}
          <BoolField label="Show in Key" value={pt.showInKey !== false} onChange={v => updatePitch(idx, { showInKey: v })} />
        </Section>
      ))}

      {/* Add pitch button */}
      <div className="mb-3">
        <button
          onClick={addPitch}
          className="w-full px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 border-dashed text-[11px] text-zinc-400 hover:text-cyan-400 hover:border-cyan-600/40 transition"
        >
          + Add Pitch
        </button>
      </div>

      {/* Shared settings */}
      <Section title="Display">
        <SelField
          label="View"
          value={p.viewMode || 'catcher'}
          onChange={v => onUpdateProps({ viewMode: v })}
          options={[
            { value: 'catcher', label: "Catcher's View" },
            { value: 'pitcher', label: "Pitcher's View" },
          ]}
        />
        <BoolField label="Show Key" value={p.showKey !== false} onChange={v => onUpdateProps({ showKey: v })} />
        <BoolField label="Strike Zone" value={p.showZone ?? true} onChange={v => onUpdateProps({ showZone: v })} />
        <BoolField label="Animate" value={p.animate ?? true} onChange={v => onUpdateProps({ animate: v })} />
        <BoolField label="Grid" value={p.showGrid ?? true} onChange={v => onUpdateProps({ showGrid: v })} />
        <ClrField label="BG Color" value={p.bgColor || '#09090b'} onChange={v => onUpdateProps({ bgColor: v })} />
        <NumField label="Loop (s)" value={p.loopDuration || 1.5} onChange={v => onUpdateProps({ loopDuration: v })} min={0.5} max={5} step={0.1} />
      </Section>
    </>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function PropertiesPanel({ element, onUpdate, onUpdateProps, onUpdateBinding, onFetchBinding, onDelete, onDuplicate, bindingLoading }: Props) {
  const p = element.props
  const b = element.dataBinding
  const showBinding = element.type === 'stat-card' || element.type === 'comparison-bar'

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
        <PlayerImageSection p={p} onUpdateProps={onUpdateProps} />
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

      {/* Pitch Flight */}
      {element.type === 'pitch-flight' && (
        <PitchFlightSection p={p} onUpdateProps={onUpdateProps} />
      )}

      {/* Data Binding */}
      {showBinding && (
        <DataBindingSection
          binding={b}
          onUpdateBinding={onUpdateBinding}
          onFetch={onFetchBinding}
          loading={bindingLoading}
        />
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
