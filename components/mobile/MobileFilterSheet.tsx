'use client'

import { useState, useEffect } from 'react'
import { FILTER_CATALOG, type ActiveFilter, type FilterDef } from '@/lib/filterEngineCore'

interface Props {
  open: boolean
  onClose: () => void
  activeFilters: ActiveFilter[]
  onFiltersChange: (filters: ActiveFilter[]) => void
  optionsCache: Record<string, string[]>
}

// Group the filter catalog by category
function groupByCategory(catalog: FilterDef[]): Record<string, FilterDef[]> {
  const groups: Record<string, FilterDef[]> = {}
  for (const f of catalog) {
    if (!groups[f.category]) groups[f.category] = []
    groups[f.category].push(f)
  }
  return groups
}

export default function MobileFilterSheet({ open, onClose, activeFilters, onFiltersChange, optionsCache }: Props) {
  // Work on a draft copy so changes only apply on "Apply"
  const [draft, setDraft] = useState<ActiveFilter[]>(activeFilters)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  // Sync draft when sheet opens
  useEffect(() => {
    if (open) setDraft(activeFilters)
  }, [open, activeFilters])

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const categories = groupByCategory(FILTER_CATALOG)
  const activeKeys = new Set(draft.map(f => f.def.key))

  function toggleFilterValue(def: FilterDef, value: string) {
    setDraft(prev => {
      const existing = prev.find(f => f.def.key === def.key)
      if (existing) {
        const vals = existing.values || []
        const newVals = vals.includes(value)
          ? vals.filter(v => v !== value)
          : [...vals, value]
        if (newVals.length === 0) {
          return prev.filter(f => f.def.key !== def.key)
        }
        return prev.map(f => f.def.key === def.key ? { ...f, values: newVals } : f)
      } else {
        return [...prev, { def, values: [value] }]
      }
    })
  }

  function setRangeValue(def: FilterDef, field: 'min' | 'max', value: string) {
    setDraft(prev => {
      const existing = prev.find(f => f.def.key === def.key)
      if (existing) {
        const updated = { ...existing, [field]: value }
        // Remove if both min and max are empty
        if (!updated.min && !updated.max) {
          return prev.filter(f => f.def.key !== def.key)
        }
        return prev.map(f => f.def.key === def.key ? updated : f)
      } else {
        return [...prev, { def, min: field === 'min' ? value : '', max: field === 'max' ? value : '' }]
      }
    })
  }

  function setDateValue(def: FilterDef, field: 'startDate' | 'endDate', value: string) {
    setDraft(prev => {
      const existing = prev.find(f => f.def.key === def.key)
      if (existing) {
        const updated = { ...existing, [field]: value }
        if (!updated.startDate && !updated.endDate) {
          return prev.filter(f => f.def.key !== def.key)
        }
        return prev.map(f => f.def.key === def.key ? updated : f)
      } else {
        return [...prev, { def, startDate: field === 'startDate' ? value : '', endDate: field === 'endDate' ? value : '' }]
      }
    })
  }

  function handleApply() {
    onFiltersChange(draft)
    onClose()
  }

  function handleClear() {
    setDraft([])
  }

  function getFilterValues(key: string): string[] {
    return draft.find(f => f.def.key === key)?.values || []
  }

  function getRangeValue(key: string, field: 'min' | 'max'): string {
    const f = draft.find(f => f.def.key === key)
    return (field === 'min' ? f?.min : f?.max) || ''
  }

  function getDateValue(key: string, field: 'startDate' | 'endDate'): string {
    const f = draft.find(f => f.def.key === key)
    return (field === 'startDate' ? f?.startDate : f?.endDate) || ''
  }

  const activeCount = draft.filter(f => {
    if (f.def.type === 'multi') return (f.values?.length || 0) > 0
    if (f.def.type === 'range') return !!f.min || !!f.max
    if (f.def.type === 'date') return !!f.startDate || !!f.endDate
    return false
  }).length

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-zinc-900 border-t border-zinc-700 rounded-t-2xl"
        style={{ height: '85vh' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 rounded-full bg-zinc-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Filters</h2>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="text-[10px] text-emerald-400 font-medium">{activeCount} active</span>
            )}
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable filter categories */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {Object.entries(categories).map(([category, filters]) => {
            const isExpanded = expandedCategory === category
            const categoryActiveCount = filters.filter(f => activeKeys.has(f.key)).length

            return (
              <div key={category} className="border border-zinc-800 rounded-lg overflow-hidden">
                {/* Accordion header */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{category}</span>
                    {categoryActiveCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[9px] font-medium bg-emerald-500/20 text-emerald-400 rounded-full">
                        {categoryActiveCount}
                      </span>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Accordion body */}
                {isExpanded && (
                  <div className="px-3 py-2 space-y-3 bg-zinc-900">
                    {filters.map(def => {
                      const options = optionsCache[def.key] || def.options || []
                      const selectedValues = getFilterValues(def.key)

                      return (
                        <div key={def.key}>
                          <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5 block">
                            {def.label}
                          </label>

                          {def.type === 'multi' && (
                            <div className="flex flex-wrap gap-1.5">
                              {options.map(opt => {
                                const selected = selectedValues.includes(opt)
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => toggleFilterValue(def, opt)}
                                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                                      selected
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                )
                              })}
                              {options.length === 0 && (
                                <span className="text-[11px] text-zinc-600 italic">No options loaded</span>
                              )}
                            </div>
                          )}

                          {def.type === 'range' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Min"
                                value={getRangeValue(def.key, 'min')}
                                onChange={e => setRangeValue(def, 'min', e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[11px] focus:border-emerald-600 focus:outline-none placeholder-zinc-600"
                              />
                              <span className="text-zinc-600 text-[10px]">to</span>
                              <input
                                type="number"
                                placeholder="Max"
                                value={getRangeValue(def.key, 'max')}
                                onChange={e => setRangeValue(def, 'max', e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[11px] focus:border-emerald-600 focus:outline-none placeholder-zinc-600"
                              />
                            </div>
                          )}

                          {def.type === 'date' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={getDateValue(def.key, 'startDate')}
                                onChange={e => setDateValue(def, 'startDate', e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[11px] focus:border-emerald-600 focus:outline-none"
                              />
                              <span className="text-zinc-600 text-[10px]">to</span>
                              <input
                                type="date"
                                value={getDateValue(def.key, 'endDate')}
                                onChange={e => setDateValue(def, 'endDate', e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[11px] focus:border-emerald-600 focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pinned bottom actions */}
        <div className="border-t border-zinc-800 px-4 py-3 flex gap-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleClear}
            className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-sm font-medium text-zinc-400 hover:text-white hover:border-zinc-500 transition"
          >
            Clear All
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-500 transition"
          >
            Apply{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
        </div>
      </div>
    </>
  )
}
