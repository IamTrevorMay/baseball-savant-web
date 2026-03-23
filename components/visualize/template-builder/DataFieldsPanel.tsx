'use client'

import { useState, useMemo } from 'react'
import type { GlobalFilterType } from '@/lib/sceneTypes'
import { getFilterFields, fieldColor } from '@/lib/filterFieldSchemas'
import type { FilterField, FilterFieldCategory } from '@/lib/filterFieldSchemas'

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  filterType: GlobalFilterType
  playerType?: 'pitcher' | 'batter'
  selectedIds: Set<string>
  onFieldClick: (field: string, fieldType: string) => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DataFieldsPanel({
  filterType,
  playerType,
  selectedIds,
  onFieldClick,
}: Props) {
  const categories = useMemo(
    () => getFilterFields(filterType, playerType) || [],
    [filterType, playerType],
  )

  // Track collapsed categories by name; default all open
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const hasSelection = selectedIds.size > 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Data Fields
        </h3>
        {hasSelection && (
          <p className="text-[9px] text-emerald-400 mt-0.5">
            Click a field to bind to {selectedIds.size} selected element
            {selectedIds.size > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Scrollable field list */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {categories.map((cat) => (
          <CategoryGroup
            key={cat.category}
            category={cat}
            isCollapsed={collapsed.has(cat.category)}
            onToggle={() => toggle(cat.category)}
            hasSelection={hasSelection}
            onFieldClick={onFieldClick}
          />
        ))}
      </div>
    </div>
  )
}

// ── Category group ─────────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  isCollapsed,
  onToggle,
  hasSelection,
  onFieldClick,
}: {
  category: FilterFieldCategory
  isCollapsed: boolean
  onToggle: () => void
  hasSelection: boolean
  onFieldClick: (field: string, fieldType: string) => void
}) {
  return (
    <div>
      {/* Category header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-1 w-full px-1 py-1 rounded
                   text-[10px] font-medium text-zinc-500 hover:text-zinc-300
                   hover:bg-zinc-800/50 transition-colors"
      >
        <svg className="w-3 h-3 shrink-0 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
        <span>{category.category}</span>
        <span className="ml-auto text-zinc-600">{category.fields.length}</span>
      </button>

      {/* Fields */}
      {!isCollapsed && (
        <div className="flex flex-wrap gap-1 pl-3 pb-1.5 pt-0.5">
          {category.fields.map((field) => (
            <FieldChip
              key={field.key}
              field={field}
              hasSelection={hasSelection}
              onFieldClick={onFieldClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Draggable field chip ───────────────────────────────────────────────────────

function FieldChip({
  field,
  hasSelection,
  onFieldClick,
}: {
  field: FilterField
  hasSelection: boolean
  onFieldClick: (field: string, fieldType: string) => void
}) {
  const color = fieldColor(field.key)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/x-triton-field',
      JSON.stringify({ field: field.key, fieldType: field.type }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleClick = () => {
    if (hasSelection) {
      onFieldClick(field.key, field.type)
    }
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      title={
        hasSelection
          ? `Click to bind "${field.label}" to selected elements`
          : field.label
      }
      className={`
        inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-full
        bg-zinc-900 border border-zinc-800 text-zinc-300
        cursor-grab active:cursor-grabbing select-none
        hover:bg-zinc-800 hover:border-zinc-700 transition-colors
        ${hasSelection ? 'hover:ring-1 hover:ring-emerald-500/50 cursor-pointer' : ''}
      `}
    >
      {/* Colored dot */}
      <span
        className="shrink-0 rounded-full"
        style={{ width: 6, height: 6, backgroundColor: color }}
      />
      <span className="whitespace-nowrap">{field.shortLabel}</span>
    </div>
  )
}
