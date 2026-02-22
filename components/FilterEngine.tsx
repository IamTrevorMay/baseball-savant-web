'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

// ── Filter Definitions ───────────────────────────────────────────────────────
export interface FilterDef {
  key: string
  label: string
  category: string
  type: 'multi' | 'range' | 'date'
  options?: string[]           // for multi-select filters
  numberCast?: boolean         // cast values to numbers for query
  dbColumn?: string            // if different from key
}

const FILTER_CATALOG: FilterDef[] = [
  // Situational
  { key: 'game_year', label: 'Season', category: 'Situational', type: 'multi', numberCast: true },
  { key: 'pitch_name', label: 'Pitch Type', category: 'Pitch', type: 'multi' },
  { key: 'pitch_type', label: 'Pitch Code', category: 'Pitch', type: 'multi' },
  { key: 'stand', label: 'Batter Side', category: 'Situational', type: 'multi' },
  { key: 'p_throws', label: 'Pitcher Hand', category: 'Situational', type: 'multi' },
  { key: 'balls', label: 'Balls', category: 'Count', type: 'multi', numberCast: true },
  { key: 'strikes', label: 'Strikes', category: 'Count', type: 'multi', numberCast: true },
  { key: 'outs_when_up', label: 'Outs', category: 'Count', type: 'multi', numberCast: true },
  { key: 'inning', label: 'Inning', category: 'Situational', type: 'multi', numberCast: true },
  { key: 'inning_topbot', label: 'Half Inning', category: 'Situational', type: 'multi' },
  { key: 'game_type', label: 'Game Type', category: 'Situational', type: 'multi' },
  { key: 'home_team', label: 'Home Team', category: 'Team', type: 'multi' },
  { key: 'away_team', label: 'Away Team', category: 'Team', type: 'multi' },
  { key: 'zone', label: 'Zone', category: 'Location', type: 'multi', numberCast: true },
  // Date
  { key: 'game_date', label: 'Date Range', category: 'Situational', type: 'date' },
  // Pitch Characteristics
  { key: 'release_speed', label: 'Velocity', category: 'Pitch', type: 'range' },
  { key: 'effective_speed', label: 'Effective Speed', category: 'Pitch', type: 'range' },
  { key: 'release_spin_rate', label: 'Spin Rate', category: 'Pitch', type: 'range' },
  { key: 'spin_axis', label: 'Spin Axis', category: 'Pitch', type: 'range' },
  { key: 'pfx_x', label: 'H Break', category: 'Movement', type: 'range' },
  { key: 'pfx_z', label: 'V Break (IVB)', category: 'Movement', type: 'range' },
  { key: 'release_extension', label: 'Extension', category: 'Release', type: 'range' },
  { key: 'arm_angle', label: 'Arm Angle', category: 'Release', type: 'range' },
  { key: 'release_pos_x', label: 'Release X', category: 'Release', type: 'range' },
  { key: 'release_pos_z', label: 'Release Z', category: 'Release', type: 'range' },
  { key: 'plate_x', label: 'Plate X', category: 'Location', type: 'range' },
  { key: 'plate_z', label: 'Plate Z', category: 'Location', type: 'range' },
  // Outcomes
  { key: 'type', label: 'Pitch Result (B/S/X)', category: 'Outcome', type: 'multi' },
  { key: 'events', label: 'Play Result', category: 'Outcome', type: 'multi' },
  { key: 'description', label: 'Description', category: 'Outcome', type: 'multi' },
  { key: 'bb_type', label: 'Batted Ball Type', category: 'Outcome', type: 'multi' },
  // Batted Ball
  { key: 'launch_speed', label: 'Exit Velocity', category: 'Batted Ball', type: 'range' },
  { key: 'launch_angle', label: 'Launch Angle', category: 'Batted Ball', type: 'range' },
  { key: 'hit_distance_sc', label: 'Distance', category: 'Batted Ball', type: 'range' },
  // Swing
  { key: 'bat_speed', label: 'Bat Speed', category: 'Swing', type: 'range' },
  { key: 'swing_length', label: 'Swing Length', category: 'Swing', type: 'range' },
  // Expected
  { key: 'estimated_ba_using_speedangle', label: 'xBA', category: 'Expected', type: 'range' },
  { key: 'estimated_woba_using_speedangle', label: 'xwOBA', category: 'Expected', type: 'range' },
  { key: 'estimated_slg_using_speedangle', label: 'xSLG', category: 'Expected', type: 'range' },
  { key: 'woba_value', label: 'wOBA Value', category: 'Expected', type: 'range' },
  { key: 'delta_run_exp', label: 'Run Expectancy', category: 'Expected', type: 'range' },
  // Game State
  { key: 'home_score', label: 'Home Score', category: 'Game State', type: 'range' },
  { key: 'away_score', label: 'Away Score', category: 'Game State', type: 'range' },
  { key: 'n_thruorder_pitcher', label: 'Times Thru Order', category: 'Situational', type: 'range' },
  // Alignment
  { key: 'if_fielding_alignment', label: 'IF Alignment', category: 'Alignment', type: 'multi' },
  { key: 'of_fielding_alignment', label: 'OF Alignment', category: 'Alignment', type: 'multi' },
]

// ── Active Filter State ──────────────────────────────────────────────────────
export interface ActiveFilter {
  def: FilterDef
  values?: string[]            // for multi-select
  min?: string                 // for range
  max?: string                 // for range
  startDate?: string           // for date
  endDate?: string             // for date
}

export interface FilterEngineProps {
  activeFilters: ActiveFilter[]
  onFiltersChange: (filters: ActiveFilter[]) => void
  optionsCache: Record<string, string[]>  // available options per filter key
}

// ── Component ────────────────────────────────────────────────────────────────
export default function FilterEngine({ activeFilters, onFiltersChange, optionsCache }: FilterEngineProps) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [expandedChip, setExpandedChip] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Filter catalog by search query, exclude already-active filters
  const activeKeys = new Set(activeFilters.map(f => f.def.key))
  const suggestions = query.trim()
    ? FILTER_CATALOG.filter(f =>
        !activeKeys.has(f.key) &&
        (f.label.toLowerCase().includes(query.toLowerCase()) ||
         f.category.toLowerCase().includes(query.toLowerCase()) ||
         f.key.toLowerCase().includes(query.toLowerCase()))
      )
    : FILTER_CATALOG.filter(f => !activeKeys.has(f.key)).slice(0, 15)

  // Group suggestions by category
  const grouped: Record<string, FilterDef[]> = {}
  suggestions.forEach(s => { if (!grouped[s.category]) grouped[s.category] = []; grouped[s.category].push(s) })

  function addFilter(def: FilterDef) {
    const newFilter: ActiveFilter = { def }
    if (def.type === 'multi') newFilter.values = []
    if (def.type === 'range') { newFilter.min = ''; newFilter.max = '' }
    if (def.type === 'date') { newFilter.startDate = ''; newFilter.endDate = '' }
    onFiltersChange([...activeFilters, newFilter])
    setQuery('')
    setShowDropdown(false)
    setExpandedChip(def.key)
  }

  function removeFilter(key: string) {
    onFiltersChange(activeFilters.filter(f => f.def.key !== key))
    if (expandedChip === key) setExpandedChip(null)
  }

  function updateFilter(key: string, updates: Partial<ActiveFilter>) {
    onFiltersChange(activeFilters.map(f => f.def.key === key ? { ...f, ...updates } : f))
  }

  function toggleValue(key: string, value: string) {
    const filter = activeFilters.find(f => f.def.key === key)
    if (!filter) return
    const vals = filter.values || []
    const newVals = vals.includes(value) ? vals.filter(v => v !== value) : [...vals, value]
    updateFilter(key, { values: newVals })
  }

  function clearAll() {
    onFiltersChange([])
    setExpandedChip(null)
  }

  const totalActive = activeFilters.filter(f => {
    if (f.def.type === 'multi') return (f.values?.length || 0) > 0
    if (f.def.type === 'range') return !!(f.min || f.max)
    if (f.def.type === 'date') return !!(f.startDate || f.endDate)
    return false
  }).length

  function chipSummary(f: ActiveFilter): string {
    if (f.def.type === 'multi') {
      if (!f.values?.length) return 'Any'
      if (f.values.length <= 2) return f.values.join(', ')
      return `${f.values[0]}, +${f.values.length - 1}`
    }
    if (f.def.type === 'range') {
      if (f.min && f.max) return `${f.min}\u2013${f.max}`
      if (f.min) return `\u2265${f.min}`
      if (f.max) return `\u2264${f.max}`
      return 'Any'
    }
    if (f.def.type === 'date') {
      if (f.startDate && f.endDate) return `${f.startDate} \u2013 ${f.endDate}`
      if (f.startDate) return `From ${f.startDate}`
      if (f.endDate) return `To ${f.endDate}`
      return 'Any'
    }
    return ''
  }

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-2">
      <div className="max-w-7xl mx-auto">
        {/* Search + Active Chips Row */}
        <div className="flex items-center gap-2 flex-wrap min-h-[36px]">
          {/* Active filter chips */}
          {activeFilters.map(f => {
            const isExpanded = expandedChip === f.def.key
            const hasValue = f.def.type === 'multi' ? (f.values?.length || 0) > 0 :
              f.def.type === 'range' ? !!(f.min || f.max) :
              !!(f.startDate || f.endDate)

            return (
              <div key={f.def.key} className="relative">
                <button
                  onClick={() => setExpandedChip(isExpanded ? null : f.def.key)}
                  className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                    hasValue
                      ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  <span className="text-zinc-500">{f.def.label}:</span>
                  <span>{chipSummary(f)}</span>
                  <svg className={`w-3 h-3 ml-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                  <span onClick={e => { e.stopPropagation(); removeFilter(f.def.key) }}
                    className="ml-0.5 text-zinc-600 hover:text-red-400 transition cursor-pointer">&times;</span>
                </button>

                {/* Expanded chip editor */}
                {isExpanded && (
                  <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[200px] max-w-[300px] p-2"
                    onClick={e => e.stopPropagation()}>
                    {f.def.type === 'multi' && (
                      <div className="max-h-48 overflow-y-auto space-y-px">
                        {(optionsCache[f.def.key] || []).map(opt => (
                          <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-700 rounded cursor-pointer text-[11px]">
                            <input type="checkbox" checked={f.values?.includes(opt) || false}
                              onChange={() => toggleValue(f.def.key, opt)}
                              className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 w-3 h-3" />
                            <span className={f.values?.includes(opt) ? 'text-white' : 'text-zinc-400'}>{opt}</span>
                          </label>
                        ))}
                        {!(optionsCache[f.def.key]?.length) && (
                          <div className="text-[11px] text-zinc-500 px-2 py-1">Loading options...</div>
                        )}
                      </div>
                    )}
                    {f.def.type === 'range' && (
                      <div className="flex gap-2">
                        <input type="number" value={f.min || ''} onChange={e => updateFilter(f.def.key, { min: e.target.value })}
                          placeholder="Min" className="w-full p-1.5 bg-zinc-900 border border-zinc-600 rounded text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
                        <input type="number" value={f.max || ''} onChange={e => updateFilter(f.def.key, { max: e.target.value })}
                          placeholder="Max" className="w-full p-1.5 bg-zinc-900 border border-zinc-600 rounded text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
                      </div>
                    )}
                    {f.def.type === 'date' && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-zinc-500 block mb-0.5">From</label>
                          <input type="date" value={f.startDate || ''} onChange={e => updateFilter(f.def.key, { startDate: e.target.value })}
                            className="w-full p-1.5 bg-zinc-900 border border-zinc-600 rounded text-[11px] text-white focus:border-emerald-600 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 block mb-0.5">To</label>
                          <input type="date" value={f.endDate || ''} onChange={e => updateFilter(f.def.key, { endDate: e.target.value })}
                            className="w-full p-1.5 bg-zinc-900 border border-zinc-600 rounded text-[11px] text-white focus:border-emerald-600 focus:outline-none" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Search input */}
          <div className="relative" ref={dropdownRef}>
            <input ref={inputRef} type="text" value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder={activeFilters.length ? '+ Add filter...' : 'Search filters...'}
              className="w-44 px-2.5 py-1 bg-transparent border border-zinc-700 rounded-lg text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none focus:w-56 transition-all" />

            {showDropdown && Object.keys(grouped).length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 w-64 max-h-72 overflow-y-auto">
                {Object.entries(grouped).map(([cat, defs]) => (
                  <div key={cat}>
                    <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/80 sticky top-0">{cat}</div>
                    {defs.map(d => (
                      <button key={d.key} onClick={() => addFilter(d)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition flex items-center justify-between">
                        <span>{d.label}</span>
                        <span className="text-[10px] text-zinc-600">{d.type === 'multi' ? 'select' : d.type === 'range' ? 'min/max' : 'date'}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clear all */}
          {totalActive > 0 && (
            <button onClick={clearAll} className="text-[11px] text-zinc-500 hover:text-red-400 transition ml-1">
              Clear all ({totalActive})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helper: apply filters to a Supabase query ───────────────────────────────
export function applyFiltersToQuery(q: any, filters: ActiveFilter[]) {
  for (const f of filters) {
    const col = f.def.dbColumn || f.def.key
    if (f.def.type === 'multi' && f.values && f.values.length > 0) {
      if (f.def.numberCast) {
        q = q.in(col, f.values.map(Number))
      } else {
        q = q.in(col, f.values)
      }
    }
    if (f.def.type === 'range') {
      if (f.min) q = q.gte(col, parseFloat(f.min))
      if (f.max) q = q.lte(col, parseFloat(f.max))
    }
    if (f.def.type === 'date') {
      if (f.startDate) q = q.gte('game_date', f.startDate)
      if (f.endDate) q = q.lte('game_date', f.endDate)
    }
  }
  return q
}

// ── Helper: apply filters to client-side data array ──────────────────────────
export function applyFiltersToData(data: any[], filters: ActiveFilter[]): any[] {
  return data.filter(d => {
    for (const f of filters) {
      const col = f.def.dbColumn || f.def.key
      if (f.def.type === 'multi' && f.values && f.values.length > 0) {
        const val = f.def.numberCast ? Number(d[col]) : String(d[col])
        const check = f.def.numberCast ? f.values.map(Number) : f.values
        if (!check.includes(val as any)) return false
      }
      if (f.def.type === 'range') {
        if (f.min && (d[col] == null || d[col] < parseFloat(f.min))) return false
        if (f.max && (d[col] == null || d[col] > parseFloat(f.max))) return false
      }
      if (f.def.type === 'date') {
        if (f.startDate && d.game_date < f.startDate) return false
        if (f.endDate && d.game_date > f.endDate) return false
      }
    }
    return true
  })
}
