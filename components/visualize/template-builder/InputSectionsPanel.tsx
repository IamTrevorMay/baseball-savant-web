'use client'

import { useState } from 'react'
import { InputSection, SceneElement, MAX_INPUT_SECTIONS } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import PlayerPicker from '@/components/visualize/PlayerPicker'

const PITCH_TYPES = [
  { value: '', label: 'All' },
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

const YEARS = Array.from({ length: 11 }, (_, i) => 2025 - i)

const ELEMENT_ICONS: Record<string, string> = {
  'stat-card': '#',
  'text': 'T',
  'shape': '\u25a1',
  'player-image': '\u25c9',
  'image': '\u25a3',
  'comparison-bar': '\u25ac',
  'pitch-flight': '\u2312',
  'stadium': '\u26be',
  'ticker': '\u21c4',
  'zone-plot': '\u25ce',
  'movement-plot': '\u25c8',
}

interface Props {
  sections: InputSection[]
  selectedIds: Set<string>
  elements: SceneElement[]
  onAddSection: (name: string, elementIds: string[]) => void
  onUpdateSection: (id: string, updates: Partial<InputSection>) => void
  onRemoveSection: (id: string) => void
  onFetchSection: (id: string) => void
  onSelectElements: (ids: string[]) => void
  fetchLoading: string | null
}

export default function InputSectionsPanel({
  sections, selectedIds, elements, onAddSection, onUpdateSection,
  onRemoveSection, onFetchSection, onSelectElements, fetchLoading,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  function handleCreate() {
    const name = newName.trim() || `Section ${sections.length + 1}`
    onAddSection(name, Array.from(selectedIds))
    setCreating(false)
    setNewName('')
  }

  function getMetricLabel(metric: string): string {
    if (metric === '__player__') return 'Player Image'
    const m = SCENE_METRICS.find(sm => sm.value === metric)
    return m?.label || metric
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-3">Input Sections</div>

      {sections.map(section => {
        const sectionElements = elements.filter(e => section.elementIds.includes(e.id))

        return (
          <div key={section.id} className="mb-3 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
            {/* Header: editable name + element count + remove */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <input
                type="text"
                value={section.label}
                onChange={e => onUpdateSection(section.id, { label: e.target.value })}
                className="flex-1 bg-transparent text-xs font-semibold text-white border-none outline-none hover:bg-zinc-700/50 focus:bg-zinc-700/50 px-1 py-0.5 rounded transition"
              />
              <span className="text-[9px] text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
                {sectionElements.length} el
              </span>
              <button
                onClick={() => onRemoveSection(section.id)}
                className="text-zinc-600 hover:text-red-400 text-xs transition shrink-0"
                title="Remove section"
              >
                {'\u2715'}
              </button>
            </div>

            {/* Player picker */}
            <div className="mb-2">
              <PlayerPicker
                label="Search player..."
                playerType={section.playerType === 'batter' ? 'hitter' : 'pitcher'}
                onSelect={(id, name) => onUpdateSection(section.id, { playerId: id, playerName: name })}
              />
              {section.playerName && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-cyan-400/70 truncate flex-1">{section.playerName}</span>
                  <button
                    onClick={() => onUpdateSection(section.id, { playerId: undefined, playerName: undefined })}
                    className="text-zinc-600 hover:text-zinc-400 text-[10px] transition shrink-0"
                  >{'\u2715'}</button>
                </div>
              )}
            </div>

            {/* Player type toggle */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] text-zinc-500 shrink-0">Type</span>
              <div className="flex rounded overflow-hidden border border-zinc-700">
                <button
                  onClick={() => onUpdateSection(section.id, { playerType: 'pitcher' })}
                  className={`px-2 py-0.5 text-[10px] transition ${
                    section.playerType === 'pitcher'
                      ? 'bg-emerald-600/20 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Pitcher
                </button>
                <button
                  onClick={() => onUpdateSection(section.id, { playerType: 'batter' })}
                  className={`px-2 py-0.5 text-[10px] transition ${
                    section.playerType === 'batter'
                      ? 'bg-emerald-600/20 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Batter
                </button>
              </div>
            </div>

            {/* Season */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] text-zinc-500 shrink-0">Season</span>
              <select
                value={section.gameYear}
                onChange={e => onUpdateSection(section.id, { gameYear: Number(e.target.value) })}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Pitch type */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] text-zinc-500 shrink-0">Pitch Type</span>
              <select
                value={section.pitchType || ''}
                onChange={e => onUpdateSection(section.id, { pitchType: e.target.value || undefined })}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
              >
                {PITCH_TYPES.map(pt => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            {/* Bound elements list */}
            {sectionElements.length > 0 && (
              <div className="mb-2 space-y-0.5">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Bound Elements</div>
                {sectionElements.map(el => (
                  <button
                    key={el.id}
                    onClick={() => onSelectElements([el.id])}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left hover:bg-zinc-700/50 transition"
                  >
                    <span className="text-[10px] text-zinc-500 w-4 text-center shrink-0">{ELEMENT_ICONS[el.type] || '?'}</span>
                    <span className="text-[10px] text-zinc-400 truncate flex-1">{el.type}</span>
                    <span className="text-[9px] text-emerald-500/70 truncate max-w-[80px]">
                      {el.sectionBinding ? getMetricLabel(el.sectionBinding.metric) : '—'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Edit button — select all section elements */}
            <div className="flex gap-1.5">
              <button
                onClick={() => onSelectElements(section.elementIds)}
                className="flex-1 px-2 py-1 rounded bg-zinc-700/50 border border-zinc-600/50 text-[10px] text-zinc-400 hover:text-white transition"
              >
                Edit Elements
              </button>
              <button
                onClick={() => onFetchSection(section.id)}
                disabled={!section.playerId || fetchLoading === section.id}
                className="flex-1 px-2 py-1.5 rounded bg-emerald-600/20 border border-emerald-600/50 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-600/30 transition disabled:opacity-40"
              >
                {fetchLoading === section.id ? 'Fetching...' : 'Fetch Data'}
              </button>
            </div>
          </div>
        )
      })}

      {/* Create Section from Selected */}
      {creating ? (
        <div className="p-2 rounded-lg bg-zinc-800/60 border border-emerald-600/30">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
            placeholder={`Section ${sections.length + 1}`}
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 outline-none mb-2"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleCreate}
              className="flex-1 px-2 py-1 rounded bg-emerald-600/20 border border-emerald-600/50 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-600/30 transition"
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName('') }}
              className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          disabled={selectedIds.size === 0 || sections.length >= MAX_INPUT_SECTIONS}
          className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-zinc-600 transition disabled:opacity-40 disabled:cursor-default"
        >
          + Create Section from Selected ({selectedIds.size})
        </button>
      )}

      {sections.length >= MAX_INPUT_SECTIONS && (
        <p className="text-[9px] text-zinc-600 text-center mt-1">Max {MAX_INPUT_SECTIONS} sections reached</p>
      )}
    </div>
  )
}
