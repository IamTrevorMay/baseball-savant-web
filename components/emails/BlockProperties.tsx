'use client'

import { useCallback, useMemo } from 'react'
import {
  LayoutGrid,
  Star,
  TrendingUp,
  Image,
  Table,
  User,
  Trophy,
  Rss,
  Type,
  ImageIcon,
  MousePointerClick,
  Minus,
  Space,
  Share2,
  Code,
  PanelTop,
  PanelBottom,
  BarChart3,
  Clock,
  GitBranch,
  UserCheck,
  Columns,
  SquareDashedBottom,
  Trash2,
  Database,
  Settings2,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { EmailBlock, BlockType, DataBinding } from '@/lib/emailTypes'
import { getBlockDef } from '@/lib/emails/blockRegistry'
import { useEmailEditor } from './EmailEditorContext'

// ── Icon map ────────────────────────────────────────────────────────

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutGrid,
  Star,
  TrendingUp,
  Image,
  Table,
  User,
  Trophy,
  Rss,
  Type,
  ImageIcon,
  MousePointerClick,
  Minus,
  Space,
  Share2,
  Code,
  PanelTop,
  PanelBottom,
  BarChart3,
  Clock,
  GitBranch,
  UserCheck,
  Columns,
  SquareDashedBottom,
}

// ── Known select options for common config keys ─────────────────────

const selectOptions: Record<string, { value: string; label: string }[]> = {
  align: [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
  ],
  style: [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
  ],
  headerStyle: [
    { value: 'banner', label: 'Banner' },
    { value: 'logo', label: 'Logo' },
    { value: 'text', label: 'Text' },
  ],
  operator: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'exists', label: 'Exists' },
  ],
  role: [
    { value: 'SP', label: 'SP' },
    { value: 'RP', label: 'RP' },
    { value: 'ALL', label: 'All' },
  ],
}

// ── Data binding sources ────────────────────────────────────────────

const bindingSources: { value: DataBinding['source']; label: string }[] = [
  { value: 'briefs', label: 'Daily Briefs' },
  { value: 'daily_cards', label: 'Daily Cards' },
  { value: 'stats_query', label: 'Stats Query' },
  { value: 'rss', label: 'RSS Feed' },
  { value: 'static', label: 'Static' },
  { value: 'claude', label: 'Claude AI' },
]

// ── Label formatting ────────────────────────────────────────────────

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, c => c.toUpperCase())
    .trim()
}

// ── Determine field type from key and value ─────────────────────────

function getFieldType(key: string, value: unknown): 'boolean' | 'color' | 'select' | 'textarea' | 'number' | 'text' {
  if (typeof value === 'boolean') return 'boolean'
  if (key in selectOptions) return 'select'
  if (key.toLowerCase().includes('color') || key === 'bgColor' || key === 'textColor') return 'color'
  if (key === 'html' || key === 'query' || key === 'template') return 'textarea'
  if (typeof value === 'number') return 'number'
  return 'text'
}

// ── Generic field renderer ──────────────────────────────────────────

function ConfigField({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: string
  value: unknown
  onChange: (key: string, value: unknown) => void
}) {
  const fieldType = getFieldType(fieldKey, value)
  const label = formatLabel(fieldKey)

  // Skip complex objects and arrays (links, options, columns, stats)
  if (typeof value === 'object' && value !== null) return null

  switch (fieldType) {
    case 'boolean':
      return (
        <label className="flex items-center justify-between py-1.5 cursor-pointer">
          <span className="text-xs text-zinc-300">{label}</span>
          <button
            type="button"
            onClick={() => onChange(fieldKey, !value)}
            className={`
              relative w-9 h-5 rounded-full transition-colors flex-shrink-0
              ${value ? 'bg-emerald-500' : 'bg-zinc-700'}
            `}
          >
            <span
              className={`
                absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                ${value ? 'left-[18px]' : 'left-0.5'}
              `}
            />
          </button>
        </label>
      )

    case 'color':
      return (
        <div className="py-1.5">
          <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(value as string) || '#000000'}
              onChange={e => onChange(fieldKey, e.target.value)}
              className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={(value as string) || ''}
              onChange={e => onChange(fieldKey, e.target.value)}
              placeholder="#000000"
              className="flex-1 px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                         text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )

    case 'select':
      return (
        <div className="py-1.5">
          <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
          <select
            value={(value as string) ?? ''}
            onChange={e => onChange(fieldKey, e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                       text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none
                       appearance-none cursor-pointer"
          >
            {(selectOptions[fieldKey] ?? []).map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )

    case 'textarea':
      return (
        <div className="py-1.5">
          <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
          <textarea
            value={(value as string) ?? ''}
            onChange={e => onChange(fieldKey, e.target.value)}
            rows={4}
            className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                       text-xs text-zinc-200 font-mono focus:border-emerald-500
                       focus:outline-none resize-y"
          />
        </div>
      )

    case 'number':
      return (
        <div className="py-1.5">
          <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
          <input
            type="number"
            value={(value as number) ?? 0}
            onChange={e => onChange(fieldKey, parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                       text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      )

    default:
      return (
        <div className="py-1.5">
          <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={e => onChange(fieldKey, e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                       text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      )
  }
}

// ── Padding editor ──────────────────────────────────────────────────

function PaddingEditor({
  padding,
  onChange,
}: {
  padding: { top: number; right: number; bottom: number; left: number }
  onChange: (padding: { top: number; right: number; bottom: number; left: number }) => void
}) {
  const handleChange = (side: 'top' | 'right' | 'bottom' | 'left', val: string) => {
    onChange({ ...padding, [side]: parseInt(val, 10) || 0 })
  }

  return (
    <div className="py-1.5">
      <label className="text-xs text-zinc-400 mb-1.5 block">Padding</label>
      <div className="grid grid-cols-4 gap-1.5">
        {(['top', 'right', 'bottom', 'left'] as const).map(side => (
          <div key={side}>
            <div className="text-[10px] text-zinc-600 text-center mb-0.5 capitalize">
              {side}
            </div>
            <input
              type="number"
              value={padding[side]}
              onChange={e => handleChange(side, e.target.value)}
              min={0}
              className="w-full px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700
                         text-xs text-zinc-200 text-center focus:border-emerald-500
                         focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Data binding section ────────────────────────────────────────────

function DataBindingSection({
  binding,
  onChange,
}: {
  binding: DataBinding | undefined
  onChange: (binding: DataBinding | undefined) => void
}) {
  const source = binding?.source ?? 'static'

  const handleSourceChange = (newSource: DataBinding['source']) => {
    onChange({ source: newSource, path: binding?.path })
  }

  const handlePathChange = (path: string) => {
    onChange({ ...binding, source: binding?.source ?? 'static', path })
  }

  const handleQueryChange = (query: string) => {
    onChange({ ...binding, source: binding?.source ?? 'stats_query', query })
  }

  const handleRssUrlChange = (rssUrl: string) => {
    onChange({ ...binding, source: binding?.source ?? 'rss', rssUrl })
  }

  const handleClaudeFieldChange = (claudeField: string) => {
    onChange({ ...binding, source: binding?.source ?? 'claude', claudeField })
  }

  return (
    <div className="border-t border-zinc-800 pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-zinc-300">Data Binding</span>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Source</label>
          <select
            value={source}
            onChange={e => handleSourceChange(e.target.value as DataBinding['source'])}
            className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                       text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none
                       appearance-none cursor-pointer"
          >
            {bindingSources.map(src => (
              <option key={src.value} value={src.value}>
                {src.label}
              </option>
            ))}
          </select>
        </div>

        {(source === 'briefs' || source === 'daily_cards' || source === 'static') && (
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">JSON Path</label>
            <input
              type="text"
              value={binding?.path ?? ''}
              onChange={e => handlePathChange(e.target.value)}
              placeholder="e.g. metadata.scores"
              className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                         text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}

        {source === 'stats_query' && (
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">SQL Query</label>
            <textarea
              value={binding?.query ?? ''}
              onChange={e => handleQueryChange(e.target.value)}
              rows={3}
              placeholder="SELECT ... FROM ..."
              className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                         text-xs text-zinc-200 font-mono focus:border-emerald-500
                         focus:outline-none resize-y"
            />
          </div>
        )}

        {source === 'rss' && (
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">RSS URL</label>
            <input
              type="text"
              value={binding?.rssUrl ?? ''}
              onChange={e => handleRssUrlChange(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                         text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}

        {source === 'claude' && (
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Claude Field</label>
            <input
              type="text"
              value={binding?.claudeField ?? ''}
              onChange={e => handleClaudeFieldChange(e.target.value)}
              placeholder="e.g. analysis"
              className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                         text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Properties Panel ───────────────────────────────────────────

export default function BlockProperties() {
  const { blocks, selectedBlockId, updateBlock, removeBlock } = useEmailEditor()

  const selectedBlock = useMemo(
    () => blocks.find(b => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  )

  const handleConfigChange = useCallback(
    (key: string, value: unknown) => {
      if (!selectedBlock) return
      updateBlock(selectedBlock.id, { [key]: value })
    },
    [selectedBlock, updateBlock],
  )

  const handlePaddingChange = useCallback(
    (padding: { top: number; right: number; bottom: number; left: number }) => {
      if (!selectedBlock) return
      // Padding is a top-level block property, not a config property.
      // We store it inside config under a special __padding key and handle it
      // at the block level. For simplicity, we piggyback on updateBlock
      // which merges into config, so we use a reserved key.
      // Actually, padding is on the EmailBlock directly, so we need to update
      // the block's own padding. We'll use updateBlock with a special approach:
      // store it in config and let the renderer read block.padding.
      // The context's updateBlock merges into config. So we need to handle
      // padding separately. Let's put it through as a config key that the
      // context can handle, or we can update the block directly.
      // Since the context only supports config updates, we'll encode padding
      // in the config and have the consumer read it back.
      // A cleaner approach: extend updateBlock to accept full block patches.
      // For now, we write padding into the config as __padding and note it.
      updateBlock(selectedBlock.id, { __padding: padding })
    },
    [selectedBlock, updateBlock],
  )

  const handleBackgroundChange = useCallback(
    (color: string) => {
      if (!selectedBlock) return
      updateBlock(selectedBlock.id, { __background: color })
    },
    [selectedBlock, updateBlock],
  )

  const handleVisibilityToggle = useCallback(() => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, { __visible: !selectedBlock.visible })
  }, [selectedBlock, updateBlock])

  const handleBindingChange = useCallback(
    (binding: DataBinding | undefined) => {
      if (!selectedBlock) return
      updateBlock(selectedBlock.id, { __binding: binding })
    },
    [selectedBlock, updateBlock],
  )

  if (!selectedBlock) {
    return (
      <div className="w-80 flex-shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
          <Settings2 className="w-8 h-8 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500 mb-1">No block selected</p>
          <p className="text-xs text-zinc-600">
            Click a block in the canvas to edit its properties
          </p>
        </div>
      </div>
    )
  }

  const def = getBlockDef(selectedBlock.type)
  const Icon = iconMap[def.icon] ?? LayoutGrid

  return (
    <div className="w-80 flex-shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
            <Icon className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-200">{def.label}</div>
            <div className="text-[10px] text-zinc-500">{def.category}</div>
          </div>
        </div>
      </div>

      {/* Config fields */}
      <div className="p-3 space-y-0.5">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Configuration
        </div>

        {Object.entries(selectedBlock.config).map(([key, value]) => {
          // Skip internal/reserved keys
          if (key.startsWith('__')) return null

          return (
            <ConfigField
              key={key}
              fieldKey={key}
              value={value}
              onChange={handleConfigChange}
            />
          )
        })}
      </div>

      {/* Padding */}
      <div className="px-3 pb-1">
        <PaddingEditor
          padding={selectedBlock.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={handlePaddingChange}
        />
      </div>

      {/* Background color */}
      <div className="px-3 py-1.5">
        <label className="text-xs text-zinc-400 mb-1 block">Background Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={selectedBlock.background || '#09090b'}
            onChange={e => handleBackgroundChange(e.target.value)}
            className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
          />
          <input
            type="text"
            value={selectedBlock.background || ''}
            onChange={e => handleBackgroundChange(e.target.value)}
            placeholder="transparent"
            className="flex-1 px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700
                       text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Visibility toggle */}
      <div className="px-3 py-2">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs text-zinc-300 flex items-center gap-1.5">
            {selectedBlock.visible !== false ? (
              <Eye className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
            )}
            Visible
          </span>
          <button
            type="button"
            onClick={handleVisibilityToggle}
            className={`
              relative w-9 h-5 rounded-full transition-colors flex-shrink-0
              ${selectedBlock.visible !== false ? 'bg-emerald-500' : 'bg-zinc-700'}
            `}
          >
            <span
              className={`
                absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                ${selectedBlock.visible !== false ? 'left-[18px]' : 'left-0.5'}
              `}
            />
          </button>
        </label>
      </div>

      {/* Data binding */}
      {def.supportsBinding && (
        <div className="px-3 pb-3">
          <DataBindingSection
            binding={selectedBlock.binding}
            onChange={handleBindingChange}
          />
        </div>
      )}

      {/* Delete button */}
      <div className="p-3 border-t border-zinc-800 mt-2">
        <button
          onClick={() => removeBlock(selectedBlock.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md
                     bg-red-500/10 border border-red-500/20 text-red-400 text-xs
                     hover:bg-red-500/20 hover:border-red-500/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Block
        </button>
      </div>
    </div>
  )
}
