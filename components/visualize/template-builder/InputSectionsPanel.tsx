'use client'

import { useState, useEffect } from 'react'
import { InputSection, SectionBinding, SectionInputKey, GlobalInputType, SceneElement, MAX_INPUT_SECTIONS } from '@/lib/sceneTypes'
import { SCENE_METRICS, GAME_METRICS } from '@/lib/reportMetrics'
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

const GLOBAL_INPUT_TYPES: { value: GlobalInputType; label: string; icon: string }[] = [
  { value: 'player', label: 'Player', icon: '\u25c9' },
  { value: 'live-game', label: 'Live Game', icon: '\u26be' },
  { value: 'leaderboard', label: 'Leaderboard', icon: '\u2261' },
  { value: 'team', label: 'Team', icon: '\u25a3' },
]

interface GameInfo {
  gamePk: number
  state: string
  detailedState: string
  away: { abbrev: string; score: number | null }
  home: { abbrev: string; score: number | null }
  inningOrdinal: string | null
  inningHalf: string | null
  probableAway: { id: number; name: string } | null
  probableHome: { id: number; name: string } | null
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
  const [configuringSection, setConfiguringSection] = useState<string | null>(null)
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<string | null>(null)

  // Live game state
  const [gamesBySection, setGamesBySection] = useState<Record<string, GameInfo[]>>({})
  const [gamesLoading, setGamesLoading] = useState<string | null>(null)

  function handleCreate() {
    const name = newName.trim() || `Section ${sections.length + 1}`
    onAddSection(name, Array.from(selectedIds))
    setCreating(false)
    setNewName('')
  }

  function handleSetGlobalType(sectionId: string, type: GlobalInputType) {
    // Reset secondary inputs when changing type
    onUpdateSection(sectionId, {
      globalInputType: type,
      playerId: undefined,
      playerName: undefined,
      pitchType: undefined,
      primaryStat: undefined,
      secondaryStat: undefined,
      tertiaryStat: undefined,
      sortDir: undefined,
      count: undefined,
      minSample: undefined,
      leaderboardType: type === 'leaderboard' ? 'players' : undefined,
      gameDate: undefined,
      gamePk: undefined,
      dateRange: { type: 'season', year: 2025 },
    })
    setTypeDropdownOpen(null)
    setConfiguringSection(sectionId)
  }

  async function fetchGamesForDate(sectionId: string, date: string) {
    setGamesLoading(sectionId)
    try {
      const res = await fetch(`/api/scores?date=${date}`)
      const data = await res.json()
      setGamesBySection(prev => ({ ...prev, [sectionId]: data.games || [] }))
    } catch (err) {
      console.error('Failed to fetch games:', err)
    } finally {
      setGamesLoading(null)
    }
  }

  function handleApply(sectionId: string) {
    setConfiguringSection(null)
  }

  // Derive a compact summary for applied state
  function getSummary(section: InputSection): string {
    const parts: string[] = []

    if (!section.globalInputType) return 'No input configured'

    switch (section.globalInputType) {
      case 'player':
        parts.push(section.playerType === 'pitcher' ? 'Pitcher' : 'Batter')
        if (section.playerName) parts.push(section.playerName)
        break
      case 'leaderboard':
        parts.push('Leaderboard')
        if (section.leaderboardType) parts.push(section.leaderboardType === 'team' ? 'Team' : 'Players')
        break
      case 'team':
        parts.push('Team')
        break
      case 'live-game':
        parts.push('Live Game')
        if (section.gamePk) {
          const games = gamesBySection[section.id] || []
          const game = games.find(g => g.gamePk === section.gamePk)
          if (game) parts.push(`${game.away.abbrev} @ ${game.home.abbrev}`)
        }
        break
    }

    // Date range
    const dr = section.dateRange
    if (dr) {
      if (dr.type === 'season') parts.push(String(dr.year))
      else parts.push(`${dr.from} \u2013 ${dr.to}`)
    }

    // Pitch type
    if (section.pitchType) {
      const pt = PITCH_TYPES.find(p => p.value === section.pitchType)
      parts.push(pt?.label || section.pitchType)
    } else if (section.globalInputType !== 'live-game' && section.globalInputType !== 'team') {
      parts.push('All Pitches')
    }

    return parts.join(' \u00b7 ')
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

  // Date range controls (shared between player, leaderboard, team)
  function DateRangeInputs({ section }: { section: InputSection }) {
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
  }

  // Player type toggle
  function PlayerTypeToggle({ section }: { section: InputSection }) {
    return (
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
    )
  }

  // Pitch type select
  function PitchTypeSelect({ section }: { section: InputSection }) {
    return (
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
    )
  }

  // Configure mode content per global type
  function ConfigureContent({ section }: { section: InputSection }) {
    switch (section.globalInputType) {
      case 'player':
        return (
          <>
            <PlayerTypeToggle section={section} />
            <DateRangeInputs section={section} />
            <PitchTypeSelect section={section} />
          </>
        )

      case 'leaderboard':
        return (
          <>
            {/* Leaderboard type */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] text-zinc-500 shrink-0">Leaderboard</span>
              <div className="flex rounded overflow-hidden border border-zinc-700">
                {(['players', 'team'] as const).map(lt => (
                  <button
                    key={lt}
                    onClick={() => onUpdateSection(section.id, { leaderboardType: lt })}
                    className={`px-2 py-0.5 text-[10px] transition ${
                      (section.leaderboardType || 'players') === lt
                        ? 'bg-emerald-600/20 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {lt === 'players' ? 'Players' : 'Team'}
                  </button>
                ))}
              </div>
            </div>
            <PlayerTypeToggle section={section} />
            <DateRangeInputs section={section} />
            <PitchTypeSelect section={section} />
            <MetricSelect label="Primary Stat" value={section.primaryStat} onChange={v => onUpdateSection(section.id, { primaryStat: v })} />
            <MetricSelect label="Secondary Stat" value={section.secondaryStat} onChange={v => onUpdateSection(section.id, { secondaryStat: v })} />
            <MetricSelect label="Tertiary Stat" value={section.tertiaryStat} onChange={v => onUpdateSection(section.id, { tertiaryStat: v })} />
            {/* Sort Direction */}
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
            {/* Count */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] text-zinc-500 shrink-0">Count</span>
              <input
                type="number"
                value={section.count ?? 5}
                onChange={e => onUpdateSection(section.id, { count: Math.max(1, parseInt(e.target.value) || 5) })}
                min={1} max={50}
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
              />
            </div>
            {/* Min Sample */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] text-zinc-500 shrink-0">Min Sample</span>
              <input
                type="number"
                value={section.minSample ?? 300}
                onChange={e => onUpdateSection(section.id, { minSample: Math.max(0, parseInt(e.target.value) || 0) })}
                min={0} step={50}
                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
              />
            </div>
          </>
        )

      case 'team':
        return <DateRangeInputs section={section} />

      case 'live-game':
        return <LiveGameInputs section={section} />

      default:
        return null
    }
  }

  // Live game inputs: date picker + game cards
  function LiveGameInputs({ section }: { section: InputSection }) {
    const games = gamesBySection[section.id] || []
    const isLoading = gamesLoading === section.id

    return (
      <>
        <div className="mb-2">
          <label className="text-[10px] text-zinc-500 block mb-0.5">Game Date</label>
          <input
            type="date"
            value={section.gameDate || ''}
            onChange={e => {
              const date = e.target.value
              onUpdateSection(section.id, { gameDate: date, gamePk: undefined })
              if (date) fetchGamesForDate(section.id, date)
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-600 outline-none"
          />
        </div>

        {isLoading && (
          <div className="text-[10px] text-zinc-500 py-2 text-center">Loading games...</div>
        )}

        {!isLoading && section.gameDate && games.length === 0 && (
          <div className="text-[10px] text-zinc-600 py-2 text-center">No games found</div>
        )}

        {!isLoading && games.length > 0 && (
          <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
            {games.map(game => {
              const selected = section.gamePk === game.gamePk
              return (
                <button
                  key={game.gamePk}
                  onClick={() => onUpdateSection(section.id, { gamePk: game.gamePk })}
                  className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition border ${
                    selected
                      ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-300'
                      : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{game.away.abbrev} @ {game.home.abbrev}</span>
                    <span className={`text-[9px] ${
                      game.state === 'Live' ? 'text-red-400' :
                      game.state === 'Final' ? 'text-zinc-500' : 'text-zinc-600'
                    }`}>
                      {game.state === 'Live'
                        ? `${game.inningHalf === 'Top' ? '\u25b2' : '\u25bc'} ${game.inningOrdinal}`
                        : game.detailedState}
                    </span>
                  </div>
                  {game.state !== 'Preview' && game.away.score != null && (
                    <div className="text-[9px] text-zinc-600 mt-0.5">
                      {game.away.abbrev} {game.away.score} - {game.home.abbrev} {game.home.score}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </>
    )
  }

  // Fetch games on mount for sections that already have a gameDate
  useEffect(() => {
    for (const section of sections) {
      if (section.globalInputType === 'live-game' && section.gameDate && !gamesBySection[section.id]) {
        fetchGamesForDate(section.id, section.gameDate)
      }
    }
  }, [sections])

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-3">Input Sections</div>

      {sections.map(section => {
        const sectionElements = elements.filter(e => section.elementIds.includes(e.id))
        const isElementsExpanded = expandedElements.has(section.id)
        const isConfiguring = configuringSection === section.id
        const isDropdownOpen = typeDropdownOpen === section.id
        const hasType = !!section.globalInputType
        const isApplied = hasType && !isConfiguring

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
              {hasType && (
                <span className="text-[9px] text-emerald-400/70 bg-emerald-600/10 px-1.5 py-0.5 rounded shrink-0">
                  {GLOBAL_INPUT_TYPES.find(t => t.value === section.globalInputType)?.label}
                </span>
              )}
              <button
                onClick={() => onRemoveSection(section.id)}
                className="text-zinc-600 hover:text-red-400 text-xs transition shrink-0"
                title="Remove section"
              >{'\u2715'}</button>
            </div>

            {/* ── Empty state: no globalInputType ── */}
            {!hasType && !isConfiguring && (
              <div className="relative">
                <button
                  onClick={() => setTypeDropdownOpen(isDropdownOpen ? null : section.id)}
                  className="w-full px-3 py-2 rounded border border-dashed border-zinc-600 text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition"
                >
                  + Add Input
                </button>
                {isDropdownOpen && (
                  <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                    {GLOBAL_INPUT_TYPES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => handleSetGlobalType(section.id, t.value)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-700/70 hover:text-white transition text-left"
                      >
                        <span className="text-sm w-5 text-center">{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Configure mode ── */}
            {isConfiguring && hasType && (
              <div className="mb-2 p-2 rounded bg-zinc-900/60 border border-zinc-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Configure</span>
                  <button
                    onClick={() => {
                      // Change type — show dropdown again
                      onUpdateSection(section.id, { globalInputType: undefined })
                      setConfiguringSection(null)
                      setTypeDropdownOpen(section.id)
                    }}
                    className="text-[9px] text-zinc-600 hover:text-zinc-400 transition"
                  >
                    Change type
                  </button>
                </div>
                <ConfigureContent section={section} />
                <button
                  onClick={() => handleApply(section.id)}
                  className="w-full mt-2 px-3 py-1.5 rounded bg-emerald-600/20 border border-emerald-600/50 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-600/30 transition"
                >
                  Apply
                </button>
              </div>
            )}

            {/* ── Applied state: compact summary ── */}
            {isApplied && (
              <div className="mb-2">
                <div className="px-2 py-1.5 rounded bg-zinc-900/40 border border-zinc-700/30 text-[10px] text-zinc-400 mb-1.5">
                  {getSummary(section)}
                </div>
                <button
                  onClick={() => setConfiguringSection(section.id)}
                  className="w-full px-2 py-1 rounded bg-zinc-700/40 border border-zinc-600/50 text-[10px] text-zinc-400 hover:text-white transition"
                >
                  Edit Inputs
                </button>
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
                      const isLiveGame = section.globalInputType === 'live-game'
                      const metricOptions = isLiveGame ? GAME_METRICS : SCENE_METRICS
                      const defaultMetric = isLiveGame ? 'away_abbrev' : 'avg_velo'
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
                          {isPlayerImage && !isLiveGame ? (
                            <div className="text-[9px] text-zinc-600 px-1">Auto: player image</div>
                          ) : (
                            <select
                              value={binding?.metric || defaultMetric}
                              onChange={e => {
                                if (!binding) return
                                onUpdateElementBinding(el.id, { ...binding, metric: e.target.value })
                              }}
                              className="w-full bg-zinc-800 border border-zinc-700/50 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:border-emerald-600 outline-none"
                            >
                              {metricOptions.map(m => (
                                <option key={m.value} value={m.value}>{m.group ? `${m.group} — ` : ''}{m.label}</option>
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
                disabled={
                  (section.globalInputType === 'player' && !section.playerId) ||
                  (section.globalInputType === 'live-game' && !section.gamePk) ||
                  (!section.globalInputType) ||
                  fetchLoading === section.id
                }
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
