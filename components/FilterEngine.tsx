'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
// Pure logic + types live in lib/filterEngineCore.ts so server code can
// import them without dragging this 'use client' file in. Re-export for
// existing consumers that import from '@/components/FilterEngine'.
import {
  FILTER_CATALOG, getFullCatalog, applyFiltersToQuery, applyFiltersToData,
  type FilterDef, type ActiveFilter,
} from '@/lib/filterEngineCore'

export {
  FILTER_CATALOG, getFullCatalog, applyFiltersToQuery, applyFiltersToData,
}
export type { FilterDef, ActiveFilter }

export interface FilterEngineProps {
  activeFilters: ActiveFilter[]
  onFiltersChange: (filters: ActiveFilter[]) => void
  optionsCache: Record<string, string[]>  // available options per filter key
  extraFilters?: FilterDef[]              // additional filters from deployed models
}

// ── Component ────────────────────────────────────────────────────────────────
export default function FilterEngine({ activeFilters, onFiltersChange, optionsCache, extraFilters = [] }: FilterEngineProps) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [expandedChip, setExpandedChip] = useState<string | null>(null)
  const [chipSearch, setChipSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
      if (expandedChip) {
        const target = e.target as HTMLElement
        const isInsideChip = target.closest("[data-chip-dropdown]")
        if (!isInsideChip) {
          setExpandedChip(null)
          setChipSearch("")
        }
      }
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [expandedChip])

  // Filter catalog by search query, exclude already-active filters
  const activeKeys = new Set(activeFilters.map(f => f.def.key))
  const [showAll, setShowAll] = useState(false)
  const fullCatalog = getFullCatalog(extraFilters)
  const available = fullCatalog.filter(f => !activeKeys.has(f.key))
  const suggestions = query.trim()
    ? available.filter(f =>
        f.label.toLowerCase().includes(query.toLowerCase()) ||
        f.category.toLowerCase().includes(query.toLowerCase()) ||
        f.key.toLowerCase().includes(query.toLowerCase())
      )
    : showAll ? available : []
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
        <div ref={chipsRef} className="flex items-center gap-2 flex-wrap min-h-[36px]">
          {/* Active filter chips */}
          {activeFilters.map(f => {
            const isExpanded = expandedChip === f.def.key
            const hasValue = f.def.type === 'multi' ? (f.values?.length || 0) > 0 :
              f.def.type === 'range' ? !!(f.min || f.max) :
              !!(f.startDate || f.endDate)

            return (
              <div key={f.def.key} className="relative">
                <button data-chip-dropdown
                  onClick={() => { setExpandedChip(isExpanded ? null : f.def.key); setChipSearch("") }}
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
                  <div data-chip-dropdown className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[200px] max-w-[300px] p-2"
                    onClick={e => e.stopPropagation()}>
                    {f.def.type === "multi" && (() => {
                      const opts = optionsCache[f.def.key] || []
                      const needsSearch = opts.length > 15
                      const filtered = needsSearch && chipSearch
                        ? opts.filter(o => o.toLowerCase().includes(chipSearch.toLowerCase()))
                        : opts
                      return (
                        <div>
                          {needsSearch && (
                            <input type="text" value={expandedChip === f.def.key ? chipSearch : ""}
                              onChange={e => setChipSearch(e.target.value)}
                              placeholder="Search..."
                              className="w-full px-2 py-1.5 mb-1 bg-zinc-900 border border-zinc-600 rounded text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
                          )}
                          {f.values && f.values.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {f.values.map(v => (
                                <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-900/40 border border-emerald-700/50 rounded text-[10px] text-emerald-300">
                                  {v}
                                  <span onClick={() => toggleValue(f.def.key, v)} className="cursor-pointer hover:text-red-400">&times;</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="max-h-48 overflow-y-auto space-y-px">
                            {filtered.slice(0, 50).map(opt => (
                              <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-700 rounded cursor-pointer text-[11px]">
                                <input type="checkbox" checked={f.values?.includes(opt) || false}
                                  onChange={() => toggleValue(f.def.key, opt)}
                                  className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 w-3 h-3" />
                                <span className={f.values?.includes(opt) ? "text-white" : "text-zinc-400"}>{opt}</span>
                              </label>
                            ))}
                            {filtered.length > 50 && (
                              <div className="text-[10px] text-zinc-500 px-2 py-1">+{filtered.length - 50} more — type to search</div>
                            )}
                            {opts.length === 0 && (
                              <div className="text-[11px] text-zinc-500 px-2 py-1">Loading options...</div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
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
          <div className="relative flex items-center gap-0" ref={dropdownRef}>
            <input ref={inputRef} type="text" value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true); setShowAll(false) }}
              placeholder={activeFilters.length ? "+ Add filter..." : "Search filters..."}
              className="w-44 px-2.5 py-1 bg-transparent border border-zinc-700 rounded-l-lg text-[11px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none focus:w-56 transition-all" />
            <button onClick={() => { setShowDropdown(!showDropdown); setShowAll(!showAll); setQuery("") }}
              className="px-1.5 py-1 border border-l-0 border-zinc-700 rounded-r-lg text-zinc-500 hover:text-zinc-300 transition">
              <svg className={`w-3.5 h-3.5 transition-transform ${showDropdown && showAll ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>

            {showDropdown && suggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 w-72 max-h-80 overflow-y-auto">
                {Object.entries(grouped).map(([cat, defs]) => (
                  <div key={cat}>
                    <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold bg-zinc-800/80 sticky top-0">{cat}</div>
                    {defs.map(d => (
                      <button key={d.key} onClick={() => addFilter(d)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition flex items-center justify-between">
                        <span>{d.label}</span>
                        <span className="text-[10px] text-zinc-600">{d.type === "multi" ? "select" : d.type === "range" ? "min/max" : "date"}</span>
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

// applyFiltersToQuery + applyFiltersToData live in lib/filterEngineCore.ts
// and are re-exported at the top of this file for back-compat.
