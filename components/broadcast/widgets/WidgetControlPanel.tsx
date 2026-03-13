'use client'

import { useState, useRef } from 'react'
import { useBroadcast } from '../BroadcastContext'
import ChatControls from './ChatControls'
import TopicControls from './TopicControls'
import CountdownControls from './CountdownControls'
import LowerThirdControls from './LowerThirdControls'
import NotificationControls from './NotificationControls'
import UsernameStackControls from './UsernameStackControls'

const SECTION_META: Record<string, { label: string; color: string }> = {
  chat: { label: 'Chat', color: '#06b6d4' },
  topics: { label: 'Topics', color: '#06b6d4' },
  countdown: { label: 'Countdown', color: '#06b6d4' },
  lowerthird: { label: 'Lower Third', color: '#06b6d4' },
  notifications: { label: 'Notifications', color: '#f59e0b' },
  usernames: { label: 'Username Stack', color: '#f59e0b' },
}

function SectionContent({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case 'chat': return <ChatControls />
    case 'topics': return <TopicControls />
    case 'countdown': return <CountdownControls />
    case 'lowerthird': return <LowerThirdControls />
    case 'notifications': return <NotificationControls />
    case 'usernames': return <UsernameStackControls />
    default: return null
  }
}

export default function WidgetControlPanel() {
  const { widgetState, updateWidgetState } = useBroadcast()
  const { panelOrder } = widgetState
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (dragId && dragId !== id) setDragOverId(id)
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId) return

    const oldIdx = panelOrder.indexOf(dragId)
    const newIdx = panelOrder.indexOf(targetId)
    if (oldIdx === -1 || newIdx === -1) return

    const newOrder = [...panelOrder]
    newOrder.splice(oldIdx, 1)
    newOrder.splice(newIdx, 0, dragId)

    updateWidgetState({ panelOrder: newOrder })
    setDragId(null)
    setDragOverId(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setDragOverId(null)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {panelOrder.map(sectionId => {
        const meta = SECTION_META[sectionId]
        if (!meta) return null
        const isCollapsed = collapsed.has(sectionId)
        const isDragOver = dragOverId === sectionId

        return (
          <div
            key={sectionId}
            onDragOver={e => handleDragOver(e, sectionId)}
            onDrop={e => handleDrop(e, sectionId)}
            className={isDragOver ? 'border-t-2 border-cyan-400' : 'border-t-2 border-transparent'}
          >
            {/* Section header */}
            <div
              draggable
              onDragStart={e => handleDragStart(e, sectionId)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border-b border-zinc-800 cursor-grab active:cursor-grabbing select-none hover:bg-zinc-800/50 transition"
              onClick={() => toggleCollapse(sectionId)}
            >
              {/* Drag handle */}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600 shrink-0">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
              </svg>

              <svg
                width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={`text-zinc-500 transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>

              <span className="text-[10px] font-medium text-zinc-300 flex-1">{meta.label}</span>
            </div>

            {/* Section content */}
            {!isCollapsed && (
              <div className="px-3 py-2 border-b border-zinc-800/50">
                <SectionContent sectionId={sectionId} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
