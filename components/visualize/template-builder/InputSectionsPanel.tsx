'use client'

import { useState } from 'react'
import { InputSection, SectionBinding, SectionInputKey, SECTION_INPUT_OPTIONS, SceneElement, MAX_INPUT_SECTIONS } from '@/lib/sceneTypes'
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
  'stat-card': '#', 'text': 'T', 'shape': '\u25a1', 'player-image': '\u25c9',
  'image': '\u25a3', 'comparison-bar': '\u25ac', 'pitch-flight': '\u2312',
  'stadium': '\u26be', 'ticker': '\u21c4', 'zone-plot': '\u25ce', 'movement-plot': '\u25c8',
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
  onUpdateElementBinding: (elementId: string, binding: SectionBinding | undefined) => void
  fetchLoading: string | null
}

export default function InputSectionsPanel({
  sections, selectedIds, elements, onAddSection, onUpdateSection,
  onRemoveSection, onFetchSection, onSelectElements, onUpdateElementBinding, fetchLoading,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set())
  const [configuringInputs, setConfiguringInputs] = useState<Set<string>>(new Set())

  function handleCreate() {
    const name = newName.trim() || `Section ${sections.length + 1}`
    onAddSection(name, Array.from(selectedIds))
    setCreating(false)
    setNewName('')
  }

  function toggleInput(sectionId: string, key: SectionInputKey) {
    const section = sections.find(s => s.id === sectionId)
    if (!section) return
    const current = section.enabledInputs
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key]
    onUpdateSection(sectionId, { enabledInputs: next })
  }

  function has(section: InputSection, key: SectionInputKey): boolean {
    return section.enabledInputs.includes(key)
  }

  // Group toggle options for rendering
  const groups: { group: string; options: typeof SECTION_INPUT_OPTIONS }[] = []
  for (const opt of SECTION_INPUT_OPTIONS) {
    let g = groups.find(g => g.group === opt.group)
    if (!g) { g = { group: opt.group, options: [] }; groups.push(g) }
    g.options.push(opt)
  }

  // Stat metric selector helper
  function MetricSelect({ value, onChange, label }: { value?: string; onChange: (v: string | undefined) => void; label: string }) {
    return (
      <div className="mb-2">
        <label className="text-[10px] text-zinc-500 block mb-0.5">{label}</label>
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value || undefined)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
        >
          <option value="">Select...</option>
          {SCENE_METRICS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-3">Input Sections</div>

      {sections.map(section => {
        const sectionElements = elements.filter(e => section.elementIds.includes(e.id))
        const isElementsExpanded = expandedElements.has(section.id)
        const isConfiguring = configuringInputs.has(section.id)
        const enabledCount = section.enabledInputs.length

        return (
          <div key={section.id} className="mb-3 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
            {/* Header */}
            <div className="flex items-center justify-between gap-1.5 mb-2">
              <input
                type="text"
                value={section.label}
                onChange={e => onUpdateSection(section.id, { label: e.target.value })}
                className="flex-1 bg-transparent text-xs font-semibold text-white border-none outline-none hover:bg-zinc-700/50 focus:bg-zinc-700/50 px-1 py-0.5 rounded transition min-w-0"
              />
              <button
                onClick={() => setConfiguringInputs(prev => {
                  const next = new Set(prev)
                  if (next.has(section.id)) next.delete(section.id)
                  else next.add(section.id)
                  return next
                })}
                className={`text-[11px] transition shrink-0 px-1 rounded ${
                  isConfiguring ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-300'
                }`}
                title="Configure inputs"
              >{'\u2699'}</button>
              <span className="text-[9px] text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
                {enabledCount} in
              </span>
              <button
                onClick={() => onRemoveSection(section.id)}
                className="text-zinc-600 hover:text-red-400 text-xs transition shrink-0"
                title="Remove section"
              >{'\u2715'}</button>
            </div>

            {/* Input toggles — grouped */}
            {isConfiguring && (
              <div className="mb-2 p-1.5 rounded bg-zinc-900/60 border border-zinc-700/30 space-y-2">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider">Toggle Inputs</div>
                {groups.map(g => (
                  <div key={g.group}>
                    <div className="text-[8px] text-zinc-600 uppercase tracking-wider mb-1">{g.group}</div>
                    <div className="flex flex-wrap gap-1">
                      {g.options.map(opt => {
                        const on = has(section, opt.key)
                        return (
                          <button
                            key={opt.key}
                            onClick={() => toggleInput(section.id, opt.key)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition border ${
                              on
                                ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Rendered input controls (only enabled ones) ── */}

            {/* Title */}
            {has(section, 'title') && (
              <div className="mb-2">
                <label className="text-[10px] text-zinc-500 block mb-0.5">Title</label>
                <input
                  type="text"
                  value={section.title || ''}
                  onChange={e => onUpdateSection(section.id, { title: e.target.value || undefined })}
                  placeholder="Auto-generated"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-600 outline-none"
                />
              </div>
            )}

            {/* Player picker */}
            {has(section, 'playerPicker') && (
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
            )}

            {/* Player type toggle */}
            {has(section, 'playerType') && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Type</span>
                <div className="flex rounded overflow-hidden border border-zinc-700">
                  {(['pitcher', 'batter'] as const).map(pt => (
                    <button
                      key={pt}
                      onClick={() => onUpdateSection(section.id, { playerType: pt })}
                      className={`px-2 py-0.5 text-[10px] transition ${
                        section.playerType === pt
                          ? 'bg-emerald-600/20 text-emerald-300'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {pt === 'pitcher' ? 'Pitcher' : 'Batter'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Season */}
            {has(section, 'season') && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Season</span>
                <select
                  value={section.gameYear}
                  onChange={e => onUpdateSection(section.id, { gameYear: Number(e.target.value) })}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                >
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {/* Date Range */}
            {has(section, 'dateRange') && (() => {
              const dr = section.dateRange || { type: 'season' as const, year: section.gameYear }
              return (
                <div className="mb-2">
                  <label className="text-[10px] text-zinc-500 block mb-1">Date Range</label>
                  <div className="flex gap-1 mb-1.5">
                    {(['season', 'custom'] as const).map(dt => (
                      <button
                        key={dt}
                        onClick={() => {
                          if (dt === 'season') onUpdateSection(section.id, { dateRange: { type: 'season', year: section.gameYear } })
                          else onUpdateSection(section.id, { dateRange: { type: 'custom', from: `${section.gameYear}-03-27`, to: `${section.gameYear}-09-28` } })
                        }}
                        className={`flex-1 px-2 py-0.5 rounded text-[10px] font-medium transition border ${
                          dr.type === dt
                            ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-300'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {dt === 'season' ? 'Season' : 'Custom'}
                      </button>
                    ))}
                  </div>
                  {dr.type === 'season' ? (
                    <select
                      value={dr.year}
                      onChange={e => onUpdateSection(section.id, { dateRange: { type: 'season', year: Number(e.target.value) } })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                    >
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="date"
                        value={dr.from}
                        onChange={e => onUpdateSection(section.id, { dateRange: { ...dr as { type: 'custom'; from: string; to: string }, from: e.target.value } })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                      />
                      <input
                        type="date"
                        value={dr.to}
                        onChange={e => onUpdateSection(section.id, { dateRange: { ...dr as { type: 'custom'; from: string; to: string }, to: e.target.value } })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                      />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Pitch type */}
            {has(section, 'pitchType') && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Pitch Type</span>
                <select
                  value={section.pitchType || ''}
                  onChange={e => onUpdateSection(section.id, { pitchType: e.target.value || undefined })}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                >
                  {PITCH_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
            )}

            {/* Primary Stat */}
            {has(section, 'primaryStat') && (
              <MetricSelect
                label="Primary Stat"
                value={section.primaryStat}
                onChange={v => onUpdateSection(section.id, { primaryStat: v })}
              />
            )}

            {/* Secondary Stat */}
            {has(section, 'secondaryStat') && (
              <MetricSelect
                label="Secondary Stat"
                value={section.secondaryStat}
                onChange={v => onUpdateSection(section.id, { secondaryStat: v })}
              />
            )}

            {/* Tertiary Stat */}
            {has(section, 'tertiaryStat') && (
              <MetricSelect
                label="Tertiary Stat"
                value={section.tertiaryStat}
                onChange={v => onUpdateSection(section.id, { tertiaryStat: v })}
              />
            )}

            {/* Sort Direction */}
            {has(section, 'sortDir') && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Sort</span>
                <div className="flex rounded overflow-hidden border border-zinc-700">
                  {(['desc', 'asc'] as const).map(dir => (
                    <button
                      key={dir}
                      onClick={() => onUpdateSection(section.id, { sortDir: dir })}
                      className={`px-2 py-0.5 text-[10px] transition ${
                        (section.sortDir || 'desc') === dir
                          ? 'bg-emerald-600/20 text-emerald-300'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {dir === 'desc' ? 'Desc' : 'Asc'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Count */}
            {has(section, 'count') && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Count</span>
                <input
                  type="number"
                  value={section.count ?? 5}
                  onChange={e => onUpdateSection(section.id, { count: Math.max(1, parseInt(e.target.value) || 5) })}
                  min={1}
                  max={50}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                />
              </div>
            )}

            {/* Min Sample */}
            {has(section, 'minSample') && (
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Min Sample</span>
                <input
                  type="number"
                  value={section.minSample ?? 300}
                  onChange={e => onUpdateSection(section.id, { minSample: Math.max(0, parseInt(e.target.value) || 0) })}
                  min={0}
                  step={50}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
                />
              </div>
            )}

            {/* ── Bound elements list — collapsible ── */}
            {sectionElements.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setExpandedElements(prev => {
                    const next = new Set(prev)
                    if (next.has(section.id)) next.delete(section.id)
                    else next.add(section.id)
                    return next
                  })}
                  className="w-full flex items-center gap-1.5 text-left hover:bg-zinc-700/30 rounded px-1 py-0.5 transition"
                >
                  <span className={`text-[9px] text-zinc-600 transition-transform ${isElementsExpanded ? 'rotate-90' : ''}`}>{'\u25b6'}</span>
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider flex-1">Elements ({sectionElements.length})</span>
                </button>
                {isElementsExpanded && (
                  <div className="mt-1 space-y-1 pl-1">
                    {sectionElements.map(el => {
                      const isPlayerImage = el.type === 'player-image'
                      const binding = el.sectionBinding
                      return (
                        <div key={el.id} className="rounded bg-zinc-900/50 border border-zinc-700/30 px-1.5 py-1.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] text-zinc-500 w-4 text-center shrink-0">{ELEMENT_ICONS[el.type] || '?'}</span>
                            <span className="text-[10px] text-zinc-400 truncate flex-1">{el.type}</span>
                            <button
                              onClick={() => onSelectElements([el.id])}
                              className="text-[9px] text-zinc-600 hover:text-zinc-300 transition shrink-0"
                              title="Select on canvas"
                            >{'\u25ce'}</button>
                          </div>
                          {isPlayerImage ? (
                            <div className="text-[9px] text-zinc-600 px-1">Auto: player image</div>
                          ) : (
                            <select
                              value={binding?.metric || 'avg_velo'}
                              onChange={e => {
                                if (!binding) return
                                onUpdateElementBinding(el.id, { ...binding, metric: e.target.value })
                              }}
                              className="w-full bg-zinc-800 border border-zinc-700/50 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:border-emerald-600 outline-none"
                            >
                              {SCENE_METRICS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Edit + Fetch buttons */}
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
