'use client'

import { useState, useRef } from 'react'
import { SceneElement } from '@/lib/sceneTypes'

const TYPE_ICONS: Record<string, string> = {
  'text': 'T',
  'stat-card': '#',
  'shape': '\u25a1',
  'player-image': '\u25c9',
  'image': '\u25a3',
  'comparison-bar': '\u25ac',
  'pitch-flight': '\u2312',
  'stadium': '\u26be',
  'ticker': '\u21c4',
  'zone-plot': '\u25ce',
  'movement-plot': '\u25c8',
  'path': '\u2710',
  'curved-text': '\u223F',
  'group': '\u29C9',
}

interface Props {
  elements: SceneElement[]
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number) => void
  onRename: (id: string, name: string) => void
  hiddenIds: Set<string>
}

export default function LayersPanel({ elements, selectedIds, onSelect, onToggleVisibility, onToggleLock, onReorder, onRename, hiddenIds }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Build set of child IDs (elements that belong to a group)
  const childIdSet = new Set<string>()
  for (const el of elements) {
    if (el.type === 'group' && el.props.childIds) {
      for (const cid of el.props.childIds) childIdSet.add(cid)
    }
  }

  // Sort by zIndex descending (top layer first), filter out group children for top level
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)

  function startEdit(el: SceneElement) {
    setEditingId(el.id)
    setEditName(el.props._layerName || el.type)
  }

  function commitEdit() {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function handleDrop(idx: number) {
    if (dragIdx !== null && dragIdx !== idx) {
      onReorder(dragIdx, idx)
    }
    setDragIdx(null)
    setDragOverIdx(null)
  }

  return (
    <div className="h-full flex flex-col bg-zinc-900/50">
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Layers</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="px-3 py-6 text-center text-zinc-600 text-[11px]">No elements yet</div>
        )}
        {sorted.map((el, idx) => {
          // Skip elements that are children of a group (they render inside the group)
          if (childIdSet.has(el.id)) return null

          const isSelected = selectedIds.has(el.id)
          const isHidden = hiddenIds.has(el.id)
          const name = el.props._layerName || el.type.replace('-', ' ')
          const isEditing = editingId === el.id
          const isGroup = el.type === 'group'
          const isCollapsed = collapsedGroups.has(el.id)
          const childIds: string[] = isGroup ? (el.props.childIds || []) : []
          const children = isGroup ? elements.filter(c => childIds.includes(c.id)).sort((a, b) => b.zIndex - a.zIndex) : []

          return (
            <div key={el.id}>
              <div
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                onClick={() => onSelect(el.id)}
                className={`
                  flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition border-l-2
                  ${isSelected ? 'bg-violet-600/10 border-violet-500' : 'border-transparent hover:bg-zinc-800/60'}
                  ${dragOverIdx === idx ? 'border-t border-t-violet-500' : ''}
                `}
              >
                {/* Drag handle */}
                <span className="text-zinc-600 text-[10px] cursor-grab select-none">{'\u2261'}</span>

                {/* Group expand/collapse arrow */}
                {isGroup && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setCollapsedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(el.id)) next.delete(el.id); else next.add(el.id)
                        return next
                      })
                    }}
                    className="text-zinc-500 text-[9px] w-3 shrink-0 hover:text-zinc-300"
                  >
                    {isCollapsed ? '\u25B6' : '\u25BC'}
                  </button>
                )}

                {/* Type icon */}
                <span className="text-zinc-500 text-[11px] w-4 text-center shrink-0">
                  {TYPE_ICONS[el.type] || '?'}
                </span>

                {/* Name */}
                {isEditing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-zinc-800 border border-violet-600 rounded px-1 py-0.5 text-[11px] text-zinc-200 outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => { e.stopPropagation(); startEdit(el) }}
                    className={`flex-1 min-w-0 truncate text-[11px] ${isSelected ? 'text-zinc-200' : 'text-zinc-400'}`}
                  >
                    {name}
                  </span>
                )}

                {/* Visibility toggle */}
                <button
                  onClick={e => { e.stopPropagation(); onToggleVisibility(el.id) }}
                  className={`text-[10px] px-0.5 transition ${isHidden ? 'text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title={isHidden ? 'Show' : 'Hide'}
                >
                  {isHidden ? '\u25C7' : '\u25C6'}
                </button>

                {/* Lock toggle */}
                <button
                  onClick={e => { e.stopPropagation(); onToggleLock(el.id) }}
                  className={`text-[10px] px-0.5 transition ${el.locked ? 'text-amber-500' : 'text-zinc-600 hover:text-zinc-400'}`}
                  title={el.locked ? 'Unlock' : 'Lock'}
                >
                  {el.locked ? '\u{1F512}' : '\u{1F513}'}
                </button>
              </div>

              {/* Group children (indented) */}
              {isGroup && !isCollapsed && children.map(child => {
                const childSelected = selectedIds.has(child.id)
                const childHidden = hiddenIds.has(child.id)
                const childName = child.props._layerName || child.type.replace('-', ' ')
                const childEditing = editingId === child.id
                return (
                  <div
                    key={child.id}
                    onClick={() => onSelect(child.id)}
                    className={`
                      flex items-center gap-1.5 pl-7 pr-2 py-1 cursor-pointer transition border-l-2 ml-3
                      ${childSelected ? 'bg-violet-600/10 border-violet-500' : 'border-zinc-700 hover:bg-zinc-800/60'}
                    `}
                  >
                    <span className="text-zinc-500 text-[11px] w-4 text-center shrink-0">
                      {TYPE_ICONS[child.type] || '?'}
                    </span>
                    {childEditing ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-zinc-800 border border-violet-600 rounded px-1 py-0.5 text-[11px] text-zinc-200 outline-none"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => { e.stopPropagation(); startEdit(child) }}
                        className={`flex-1 min-w-0 truncate text-[11px] ${childSelected ? 'text-zinc-200' : 'text-zinc-400'}`}
                      >
                        {childName}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); onToggleVisibility(child.id) }}
                      className={`text-[10px] px-0.5 transition ${childHidden ? 'text-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      {childHidden ? '\u25C7' : '\u25C6'}
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
