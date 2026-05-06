'use client'

import { useState } from 'react'
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
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react'
import type { BlockType, BlockCategory } from '@/lib/emailTypes'
import { getBlocksByCategory } from '@/lib/emails/blockRegistry'
import { useEmailEditor } from './EmailEditorContext'

// ── Icon map — maps registry icon strings to Lucide components ──────

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

// ── Category metadata ───────────────────────────────────────────────

const categories: { key: BlockCategory; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'content', label: 'Content' },
  { key: 'interactive', label: 'Interactive' },
  { key: 'layout', label: 'Layout' },
]

// ── Component ───────────────────────────────────────────────────────

export default function BlockPalette() {
  const { addBlock } = useEmailEditor()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    data: true,
    content: true,
    interactive: false,
    layout: false,
  })

  function toggleSection(key: string) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleDragStart(e: React.DragEvent, blockType: BlockType) {
    e.dataTransfer.setData('application/x-block-type', blockType)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleClick(blockType: BlockType) {
    addBlock(blockType)
  }

  return (
    <div className="w-60 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
      <div className="p-3 border-b border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Blocks
        </h2>
      </div>

      <div className="py-1">
        {categories.map(cat => {
          const blocks = getBlocksByCategory(cat.key)
          const isOpen = openSections[cat.key] ?? false

          return (
            <div key={cat.key}>
              {/* Category header */}
              <button
                onClick={() => toggleSection(cat.key)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium
                           text-zinc-400 uppercase tracking-wider hover:bg-zinc-800/50
                           transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                {cat.label}
                <span className="ml-auto text-zinc-600 text-[10px] font-normal">
                  {blocks.length}
                </span>
              </button>

              {/* Block items */}
              {isOpen && (
                <div className="pb-1">
                  {blocks.map(block => {
                    const Icon = iconMap[block.icon] ?? LayoutGrid

                    return (
                      <div
                        key={block.type}
                        draggable
                        onDragStart={e => handleDragStart(e, block.type)}
                        onClick={() => handleClick(block.type)}
                        className="group flex items-start gap-2.5 mx-2 px-2 py-2 rounded-md
                                   cursor-grab hover:bg-zinc-800 active:cursor-grabbing
                                   transition-colors select-none"
                        title={block.description}
                      >
                        <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
                          <GripVertical className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="w-7 h-7 rounded bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
                            <Icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-zinc-200 leading-tight">
                            {block.label}
                          </div>
                          <div className="text-[10px] text-zinc-500 leading-tight mt-0.5 line-clamp-2">
                            {block.description}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
