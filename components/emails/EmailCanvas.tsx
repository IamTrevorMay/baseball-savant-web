'use client'

import { useState, useCallback, useRef } from 'react'
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
  GripVertical,
  Copy,
  Trash2,
  Plus,
  Mail,
} from 'lucide-react'
import type { EmailBlock, BlockType } from '@/lib/emailTypes'
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

// ── Config summary helper ───────────────────────────────────────────

function getConfigSummary(block: EmailBlock): string {
  const c = block.config
  switch (block.type) {
    case 'rich-text':
    case 'custom-html': {
      const html = (c.html as string) ?? ''
      const text = html.replace(/<[^>]*>/g, '').trim()
      return text.length > 80 ? text.slice(0, 80) + '...' : text || '(empty)'
    }
    case 'button':
      return `"${(c.text as string) || 'Click here'}" -> ${(c.url as string) || '(no url)'}`
    case 'image':
      return (c.src as string) ? (c.alt as string) || 'Image' : '(no image set)'
    case 'spacer':
      return `${c.height ?? 24}px`
    case 'divider':
      return `${c.style ?? 'solid'} ${c.thickness ?? 1}px`
    case 'scores':
      return `${c.columns ?? 4} columns`
    case 'standouts':
      return `${c.maxCards ?? 4} cards, ${c.columns ?? 2} cols`
    case 'stats-table':
      return `${c.maxRows ?? 10} rows max`
    case 'leaderboard':
      return `Top ${c.limit ?? 5} by ${c.metric ?? 'metric'}`
    case 'player-card':
      return c.playerId ? `Player ${c.playerId}` : '(no player selected)'
    case 'header':
      return (c.title as string) || (c.style as string) || 'Header'
    case 'footer':
      return c.showUnsubscribe ? 'With unsubscribe' : 'Footer'
    case 'poll':
      return (c.question as string) || 'Poll'
    case 'countdown':
      return (c.label as string) || 'Countdown'
    case 'personalization':
      return (c.template as string) || `{{${c.field}}}`
    case 'conditional':
      return `If ${c.field} ${c.operator} ${c.value}`
    case 'columns':
      return `${c.columnCount ?? 2} columns`
    case 'section':
      return (c.title as string) || 'Section'
    case 'social-links':
      return `${(c.links as unknown[])?.length ?? 0} links`
    case 'rss-card':
      return (block.binding?.rssUrl as string) || 'RSS feed'
    case 'trend-alerts':
      return `Max ${c.maxItems ?? 5} items`
    case 'starter-card':
      return (c.cardType as string) || 'Starter card'
    default:
      return ''
  }
}

// ── Drop zone component ─────────────────────────────────────────────

function DropZone({
  afterId,
  onDrop,
}: {
  afterId: string | null
  onDrop: (type: BlockType, afterId: string | null) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-block-type')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const blockType = e.dataTransfer.getData('application/x-block-type') as BlockType
      if (blockType) {
        onDrop(blockType, afterId)
      }
    },
    [afterId, onDrop],
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        mx-4 transition-all duration-150 rounded
        ${isDragOver
          ? 'h-3 bg-emerald-500/30 border border-dashed border-emerald-500'
          : 'h-1 hover:h-2 hover:bg-zinc-700/30'}
      `}
    />
  )
}

// ── Block card component ────────────────────────────────────────────

function BlockCard({
  block,
  isSelected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  block: EmailBlock
  isSelected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const def = getBlockDef(block.type)
  const Icon = iconMap[def.icon] ?? LayoutGrid
  const summary = getConfigSummary(block)

  return (
    <div className="relative mx-4 group">
      <div
        onClick={onSelect}
        className={`
          relative rounded-lg border p-3 cursor-pointer transition-all
          ${isSelected
            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'}
          ${!block.visible ? 'opacity-40' : ''}
        `}
      >
        {/* Block content */}
        <div className="flex items-start gap-3">
          <div
            className={`
              w-8 h-8 rounded flex items-center justify-center flex-shrink-0
              ${isSelected ? 'bg-blue-500/10' : 'bg-zinc-800'}
            `}
          >
            <Icon
              className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-zinc-400'}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-200">
                {def.label}
              </span>
              {block.binding && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                  {block.binding.source}
                </span>
              )}
              {!block.visible && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 font-medium">
                  Hidden
                </span>
              )}
            </div>
            {summary && (
              <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {summary}
              </div>
            )}
          </div>
        </div>

        {/* Floating toolbar on selection */}
        {isSelected && (
          <div className="absolute -top-3 right-2 flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg px-1 py-0.5 z-10">
            <button
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Drag to reorder"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation()
                onDuplicate()
              }}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Duplicate block"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation()
                onDelete()
              }}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
              title="Delete block"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Canvas ─────────────────────────────────────────────────────

export default function EmailCanvas() {
  const {
    blocks,
    selectedBlockId,
    selectBlock,
    addBlock,
    removeBlock,
    duplicateBlock,
    deviceMode,
  } = useEmailEditor()

  const scrollRef = useRef<HTMLDivElement>(null)

  const handleDropBlock = useCallback(
    (type: BlockType, afterId: string | null) => {
      addBlock(type, afterId ?? undefined)
    },
    [addBlock],
  )

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg) {
        selectBlock(null)
      }
    },
    [selectBlock],
  )

  return (
    <div
      className="flex-1 overflow-y-auto bg-zinc-950"
      ref={scrollRef}
      onClick={handleCanvasClick}
    >
      <div
        className={`
          mx-auto py-6 transition-all duration-200
          ${deviceMode === 'mobile' ? 'max-w-[375px]' : 'max-w-[680px]'}
        `}
        data-canvas-bg="true"
      >
        {blocks.length === 0 ? (
          /* Empty state */
          <div className="mx-4 flex flex-col items-center justify-center py-24 border-2 border-dashed border-zinc-800 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-500 mb-1">No blocks yet</p>
            <p className="text-xs text-zinc-600 mb-4">
              Drag blocks from the palette or click to add
            </p>
            <button
              onClick={() => addBlock('rich-text')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800
                         text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add a block
            </button>
          </div>
        ) : (
          <>
            {/* Top drop zone */}
            <DropZone afterId={null} onDrop={handleDropBlock} />

            {blocks.map(block => (
              <div key={block.id}>
                <BlockCard
                  block={block}
                  isSelected={selectedBlockId === block.id}
                  onSelect={() => selectBlock(block.id)}
                  onDuplicate={() => duplicateBlock(block.id)}
                  onDelete={() => removeBlock(block.id)}
                />
                <DropZone afterId={block.id} onDrop={handleDropBlock} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
