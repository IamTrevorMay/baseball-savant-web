'use client'

import { useState } from 'react'
import { SceneElement, DataBinding } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import PlayerPicker from '@/components/visualize/PlayerPicker'
import { TEAM_OPTIONS } from '@/lib/stadiumData'
import { TRANSITIONS, applyTransition, type TransitionPreset } from '@/lib/transitions'
import { TEAM_COLORS, TEAM_COLOR_OPTIONS } from '@/lib/teamColors'
import { saveElementPreset } from '@/lib/sceneTemplates'

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
  onUpdateKeyframes?: (keyframes: import('@/lib/sceneTypes').Keyframe[]) => void
  bindingLoading?: boolean
  fps?: number
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

// ── Stadium Section ──────────────────────────────────────────────────────────

const DEFAULT_HIT_COLORS = ['#06b6d4', '#f97316', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#ec4899', '#3b82f6']

const EVENT_OPTIONS = [
  { value: '', label: 'All Events' },
  { value: 'home_run', label: 'Home Runs' },
  { value: 'double', label: 'Doubles' },
  { value: 'triple', label: 'Triples' },
  { value: 'single', label: 'Singles' },
  { value: 'home_run,double,triple,single', label: 'All Hits' },
]

const BB_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'fly_ball', label: 'Fly Ball' },
  { value: 'line_drive', label: 'Line Drive' },
  { value: 'ground_ball', label: 'Ground Ball' },
  { value: 'popup', label: 'Popup' },
]

interface HitEntry {
  id: string
  batterId: number | null
  batterName: string
  eventFilter: string
  bbTypeFilter: string
  color: string
  showInKey: boolean
  gameYear?: number
  dateFrom?: string
  dateTo?: string
}

function StadiumSection({ p, onUpdateProps }: { p: Record<string, any>; onUpdateProps: (u: Record<string, any>) => void }) {
  const hits: HitEntry[] = p.hits || [{ id: 'h1', batterId: null, batterName: '', eventFilter: '', bbTypeFilter: '', color: '#06b6d4', showInKey: true }]

  function updateHit(idx: number, updates: Partial<HitEntry>) {
    const next = hits.map((h, i) => i === idx ? { ...h, ...updates } : h)
    onUpdateProps({ hits: next })
  }

  function addHit() {
    const colorIdx = hits.length % DEFAULT_HIT_COLORS.length
    const newHit: HitEntry = {
      id: Math.random().toString(36).slice(2, 8),
      batterId: null, batterName: '', eventFilter: '', bbTypeFilter: '',
      color: DEFAULT_HIT_COLORS[colorIdx], showInKey: true,
    }
    onUpdateProps({ hits: [...hits, newHit] })
  }

  function removeHit(idx: number) {
    if (hits.length <= 1) return
    onUpdateProps({ hits: hits.filter((_, i) => i !== idx) })
  }

  return (
    <>
      {/* Per-hit-group controls */}
      {hits.map((h, idx) => (
        <Section key={h.id} title={`Hit Group ${idx + 1}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.color }} />
              <span className="text-[10px] text-zinc-400">{h.batterName || 'No batter'}</span>
            </div>
            {hits.length > 1 && (
              <button
                onClick={() => removeHit(idx)}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition px-1"
                title="Remove hit group"
              >
                {'\u2715'}
              </button>
            )}
          </div>

          <PlayerPicker
            label="Search hitter..."
            playerType="hitter"
            onSelect={(id, name) => updateHit(idx, { batterId: id, batterName: name })}
          />
          {h.batterName && (
            <div className="text-[10px] text-cyan-400/70 truncate">{h.batterName}</div>
          )}

          <SelField
            label="Events"
            value={h.eventFilter || ''}
            onChange={v => updateHit(idx, { eventFilter: v })}
            options={EVENT_OPTIONS}
          />
          <SelField
            label="Hit Type"
            value={h.bbTypeFilter || ''}
            onChange={v => updateHit(idx, { bbTypeFilter: v })}
            options={BB_TYPE_OPTIONS}
          />
          <ClrField label="Color" value={h.color || '#06b6d4'} onChange={v => updateHit(idx, { color: v })} />

          {/* Date filters */}
          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/50">
            <div className="text-[10px] text-zinc-600 mb-1">Data Filter</div>
            <NumField label="Season" value={h.gameYear ?? 0} onChange={v => updateHit(idx, { gameYear: v || undefined })} min={2015} max={2025} />
            <label className="flex flex-col gap-0.5 mt-1">
              <span className="text-[10px] text-zinc-600">Date Range</span>
              <div className="flex gap-1">
                <input
                  type="date"
                  value={h.dateFrom || ''}
                  onChange={e => updateHit(idx, { dateFrom: e.target.value || undefined })}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:border-cyan-600 outline-none"
                />
                <input
                  type="date"
                  value={h.dateTo || ''}
                  onChange={e => updateHit(idx, { dateTo: e.target.value || undefined })}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:border-cyan-600 outline-none"
                />
              </div>
            </label>
          </div>
          <BoolField label="Show in Key" value={h.showInKey !== false} onChange={v => updateHit(idx, { showInKey: v })} />
        </Section>
      ))}

      {/* Add hit group button */}
      <div className="mb-3">
        <button
          onClick={addHit}
          className="w-full px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 border-dashed text-[11px] text-zinc-400 hover:text-cyan-400 hover:border-cyan-600/40 transition"
        >
          + Add Hit Group
        </button>
      </div>

      {/* Shared settings */}
      <Section title="Field">
        <SelField
          label="Park"
          value={p.park || 'generic'}
          onChange={v => onUpdateProps({ park: v })}
          options={TEAM_OPTIONS}
        />
        <SelField
          label="View"
          value={p.viewMode || 'overhead'}
          onChange={v => onUpdateProps({ viewMode: v })}
          options={[
            { value: 'overhead', label: 'Overhead (2D)' },
            { value: 'broadcast', label: 'Broadcast (3D)' },
            { value: 'centerfield', label: 'Centerfield (3D)' },
          ]}
        />
        <BoolField label="Show Wall" value={p.showWall !== false} onChange={v => onUpdateProps({ showWall: v })} />
        <BoolField label="Show Field" value={p.showField !== false} onChange={v => onUpdateProps({ showField: v })} />
      </Section>

      <Section title="Display">
        <SelField
          label="Display"
          value={p.displayMode || 'all'}
          onChange={v => onUpdateProps({ displayMode: v })}
          options={[
            { value: 'all', label: 'All Hits' },
            { value: 'single', label: 'Single Hit' },
          ]}
        />
        {p.displayMode === 'single' && (
          <NumField label="Hit #" value={p.singleHitIndex || 0} onChange={v => onUpdateProps({ singleHitIndex: v })} min={0} />
        )}
        <SelField
          label="Anim Mode"
          value={p.animMode || 'simultaneous'}
          onChange={v => onUpdateProps({ animMode: v })}
          options={[
            { value: 'simultaneous', label: 'Simultaneous' },
            { value: 'sequential', label: 'Sequential' },
          ]}
        />
        <BoolField label="Animate" value={p.animate ?? true} onChange={v => onUpdateProps({ animate: v })} />
        <BoolField label="Show Key" value={p.showKey !== false} onChange={v => onUpdateProps({ showKey: v })} />
        <ClrField label="BG Color" value={p.bgColor || '#09090b'} onChange={v => onUpdateProps({ bgColor: v })} />
        <NumField label="Loop (s)" value={p.loopDuration || 3} onChange={v => onUpdateProps({ loopDuration: v })} min={1} max={10} step={0.5} />
      </Section>
    </>
  )
}

// ── Ticker Section ──────────────────────────────────────────────────────────

function TickerSection({ p, onUpdateProps }: { p: Record<string, any>; onUpdateProps: (u: Record<string, any>) => void }) {
  return (
    <>
      <Section title="Content">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">Text</span>
          <textarea
            value={p.text || ''}
            onChange={e => onUpdateProps({ text: e.target.value })}
            rows={3}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-cyan-600 outline-none resize-none"
          />
        </label>
        <NumField label="Font Size" value={p.fontSize || 20} onChange={v => onUpdateProps({ fontSize: v })} min={10} max={80} />
        <NumField label="Weight" value={p.fontWeight || 600} onChange={v => onUpdateProps({ fontWeight: v })} min={100} max={900} step={100} />
        <ClrField label="Color" value={p.color || '#ffffff'} onChange={v => onUpdateProps({ color: v })} />
        <TxtField label="Separator" value={p.separator || ' \u2022 '} onChange={v => onUpdateProps({ separator: v })} />
      </Section>
      <Section title="Scroll">
        <NumField label="Speed" value={p.speed || 60} onChange={v => onUpdateProps({ speed: v })} min={10} max={300} />
        <SelField
          label="Direction"
          value={p.direction || 'left'}
          onChange={v => onUpdateProps({ direction: v })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
        />
        <BoolField label="Show BG" value={p.showBg !== false} onChange={v => onUpdateProps({ showBg: v })} />
        <ClrField label="BG Color" value={p.bgColor || '#09090b'} onChange={v => onUpdateProps({ bgColor: v })} />
      </Section>
    </>
  )
}

// ── Transition Section ──────────────────────────────────────────────────────

function TransitionSection({ element, onUpdateKeyframes, fps }: { element: SceneElement; onUpdateKeyframes?: (kfs: import('@/lib/sceneTypes').Keyframe[]) => void; fps: number }) {
  const [category, setCategory] = useState<'enter' | 'exit' | 'emphasis'>('enter')
  const [duration, setDuration] = useState(15) // frames

  if (!onUpdateKeyframes) return null

  const filtered = TRANSITIONS.filter(t => t.category === category)

  function handleApply(preset: TransitionPreset) {
    const startFrame = category === 'exit' ? Math.max(0, (fps * 5) - duration) : (element.enterFrame || 0)
    const kfs = applyTransition(element, preset.id, startFrame, duration)
    onUpdateKeyframes!(kfs)
  }

  return (
    <Section title="Transitions">
      <div className="flex gap-1 mb-2">
        {(['enter', 'exit', 'emphasis'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-1 px-1.5 py-1 rounded text-[10px] transition ${
              category === cat
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-600/40'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>
      <NumField label="Duration (frames)" value={duration} onChange={v => setDuration(Math.max(2, v))} min={2} max={120} />
      <div className="space-y-1 mt-2">
        {filtered.map(t => (
          <button
            key={t.id}
            onClick={() => handleApply(t)}
            className="w-full text-left px-2.5 py-1.5 rounded bg-zinc-800/50 border border-zinc-800 hover:border-cyan-600/40 hover:bg-zinc-800 transition text-[11px] text-zinc-300 flex items-center gap-2"
          >
            <span className="text-zinc-500">{t.icon}</span>
            {t.name}
          </button>
        ))}
      </div>
      {(element.keyframes?.length ?? 0) > 0 && (
        <button
          onClick={() => onUpdateKeyframes!([])}
          className="w-full mt-2 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-500 hover:text-red-400 hover:border-red-600/40 transition"
        >
          Clear All Keyframes
        </button>
      )}
    </Section>
  )
}

// ── Team Color Section ──────────────────────────────────────────────────────

function TeamColorSection({ element, onUpdate, onUpdateProps }: { element: SceneElement; onUpdate: (u: Partial<SceneElement>) => void; onUpdateProps: (u: Record<string, any>) => void }) {
  function applyTheme(teamKey: string) {
    const tc = TEAM_COLORS[teamKey]
    if (!tc) return
    const p = element.props
    // Apply primary color to main color fields based on element type
    switch (element.type) {
      case 'stat-card':
        onUpdateProps({ color: tc.primary })
        break
      case 'text':
        onUpdateProps({ color: tc.primary })
        break
      case 'shape':
        onUpdateProps({ fill: tc.secondary, stroke: tc.primary })
        break
      case 'player-image':
        onUpdateProps({ borderColor: tc.primary })
        break
      case 'comparison-bar':
        onUpdateProps({ color: tc.primary })
        break
      case 'ticker':
        onUpdateProps({ color: tc.accent, bgColor: tc.primary })
        break
    }
  }

  return (
    <Section title="Team Theme">
      <select
        onChange={e => { if (e.target.value) applyTheme(e.target.value) }}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-300 focus:border-cyan-600 outline-none"
        defaultValue=""
      >
        {TEAM_COLOR_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Section>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function PropertiesPanel({ element, onUpdate, onUpdateProps, onUpdateBinding, onFetchBinding, onDelete, onDuplicate, onUpdateKeyframes, bindingLoading, fps = 30 }: Props) {
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

      {/* Stadium */}
      {element.type === 'stadium' && (
        <StadiumSection p={p} onUpdateProps={onUpdateProps} />
      )}

      {/* Ticker */}
      {element.type === 'ticker' && (
        <TickerSection p={p} onUpdateProps={onUpdateProps} />
      )}

      {/* Transitions */}
      <TransitionSection element={element} onUpdateKeyframes={onUpdateKeyframes} fps={fps} />

      {/* Team Color Theme */}
      <TeamColorSection element={element} onUpdate={onUpdate} onUpdateProps={onUpdateProps} />

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

      {/* Save as Preset */}
      <div className="border-t border-zinc-800 pt-3 mt-1">
        <button
          onClick={() => {
            const name = prompt('Preset name:', `${element.type} preset`)
            if (name) saveElementPreset(name, element)
          }}
          className="w-full px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 border-dashed text-[11px] text-zinc-400 hover:text-emerald-400 hover:border-emerald-600/40 transition"
        >
          {'\u2605'} Save as Preset
        </button>
      </div>
    </div>
  )
}
