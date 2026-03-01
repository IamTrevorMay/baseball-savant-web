'use client'
import { useState } from 'react'

interface Conversation {
  id: string
  title: string
  updated_at: string
}

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  open: boolean
  onClose: () => void
}

function timeGroup(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return 'Previous 7 Days'
  return 'Older'
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onClose,
}: ConversationSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Group conversations by time
  const groups: Record<string, Conversation[]> = {}
  const groupOrder = ['Today', 'Yesterday', 'Previous 7 Days', 'Older']
  for (const conv of conversations) {
    const group = timeGroup(conv.updated_at)
    if (!groups[group]) groups[group] = []
    groups[group].push(conv)
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`${
          open ? 'translate-x-0' : '-translate-x-full'
        } fixed md:relative z-50 md:z-auto top-0 left-0 h-full w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          !open ? 'md:hidden' : ''
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <button
            onClick={onNew}
            className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition md:hidden"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-8">No conversations yet</p>
          )}
          {groupOrder.map((group) => {
            const items = groups[group]
            if (!items || items.length === 0) return null
            return (
              <div key={group}>
                <div className="px-3 pt-4 pb-1 text-[11px] font-medium text-zinc-600 uppercase tracking-wider">
                  {group}
                </div>
                {items.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group relative px-3 py-2 mx-1 rounded-lg cursor-pointer transition ${
                      conv.id === activeId
                        ? 'bg-emerald-900/20 border-l-2 border-emerald-500 pl-2.5'
                        : 'hover:bg-zinc-800/60'
                    }`}
                    onMouseEnter={() => setHoveredId(conv.id)}
                    onMouseLeave={() => {
                      setHoveredId(null)
                      setConfirmDeleteId(null)
                    }}
                    onClick={() => {
                      onSelect(conv.id)
                      onClose()
                    }}
                  >
                    <div className="text-sm text-zinc-300 truncate pr-6">{conv.title}</div>

                    {/* Delete button */}
                    {hoveredId === conv.id && (
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-red-400 transition"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirmDeleteId === conv.id) {
                            onDelete(conv.id)
                            setConfirmDeleteId(null)
                          } else {
                            setConfirmDeleteId(conv.id)
                          }
                        }}
                        title={confirmDeleteId === conv.id ? 'Click again to confirm' : 'Delete'}
                      >
                        <svg
                          className={`w-4 h-4 ${confirmDeleteId === conv.id ? 'text-red-400' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
