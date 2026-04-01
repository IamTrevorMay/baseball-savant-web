'use client'

import { useState, useEffect } from 'react'
import { ChatMessage } from './AutoChatPanel'

interface RenderSnapshot {
  messageId: string
  content: string
  toolsUsed?: string[]
  sceneSnapshot: any
  createdAt: string
}

interface SessionSummary {
  id: string
  title: string
  thumbnail_url?: string
  updated_at: string
}

interface AutoSessionsPanelProps {
  messages: ChatMessage[]
  currentSessionId: string | null
  onRewind: (sceneSnapshot: any) => void
  onNewSession: () => void
  onLoadSession: (sessionId: string) => void
  onExport: () => void
}

export default function AutoSessionsPanel({
  messages,
  currentSessionId,
  onRewind,
  onNewSession,
  onLoadSession,
  onExport,
}: AutoSessionsPanelProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)

  // Extract render snapshots from assistant messages that have scene_snapshot
  const snapshots: RenderSnapshot[] = messages
    .filter(m => m.role === 'assistant' && m.sceneSnapshot)
    .map(m => ({
      messageId: m.id,
      content: m.content.slice(0, 60) + (m.content.length > 60 ? '...' : ''),
      toolsUsed: m.toolsUsed,
      sceneSnapshot: m.sceneSnapshot,
      createdAt: m.createdAt,
    }))

  // Fetch sessions list
  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    setLoadingSessions(true)
    try {
      const res = await fetch('/api/auto-sessions')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch {}
    setLoadingSessions(false)
  }

  function handleRewind(snapshot: RenderSnapshot) {
    setActiveSnapshotId(snapshot.messageId)
    onRewind(snapshot.sceneSnapshot)
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return 'Today'
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Action buttons */}
      <div className="shrink-0 p-2 border-b border-zinc-800 flex gap-1.5">
        <button
          onClick={onNewSession}
          className="flex-1 px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300 hover:text-white hover:border-zinc-600 transition"
        >
          New Session
        </button>
        <button
          onClick={onExport}
          className="flex-1 px-2 py-1.5 rounded bg-cyan-600/20 border border-cyan-600/40 text-[10px] text-cyan-300 hover:bg-cyan-600/30 transition"
        >
          Export PNG
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Past Renders (snapshots) */}
        {snapshots.length > 0 && (
          <div className="p-2">
            <div className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
              Renders ({snapshots.length})
            </div>
            <div className="space-y-1.5">
              {snapshots.map((snap, i) => (
                <button
                  key={snap.messageId}
                  onClick={() => handleRewind(snap)}
                  className={`w-full text-left p-2 rounded-lg border transition ${
                    activeSnapshotId === snap.messageId
                      ? 'bg-emerald-600/10 border-emerald-600/30'
                      : 'bg-zinc-800/50 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold ${
                      activeSnapshotId === snap.messageId
                        ? 'bg-emerald-600/20 text-emerald-300'
                        : 'bg-zinc-700 text-zinc-400'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-zinc-300 truncate">{snap.content}</div>
                      <div className="text-[9px] text-zinc-600">{formatTime(snap.createdAt)}</div>
                    </div>
                  </div>
                  {snap.toolsUsed && snap.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {[...new Set(snap.toolsUsed)].slice(0, 3).map((tool, j) => (
                        <span key={j} className="px-1 py-0.5 rounded bg-zinc-700/40 text-[8px] text-zinc-600 font-mono">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Past Sessions */}
        <div className="p-2 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider">
              Past Sessions
            </span>
            <button
              onClick={fetchSessions}
              className="text-[9px] text-zinc-600 hover:text-zinc-400 transition"
            >
              Refresh
            </button>
          </div>

          {loadingSessions ? (
            <div className="text-[10px] text-zinc-600 text-center py-4">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="text-[10px] text-zinc-600 text-center py-4">No saved sessions</div>
          ) : (
            <div className="space-y-1">
              {sessions
                .filter(s => s.id !== currentSessionId)
                .map(session => (
                  <button
                    key={session.id}
                    onClick={() => onLoadSession(session.id)}
                    className="w-full text-left px-2.5 py-2 bg-zinc-800/30 border border-zinc-800 rounded-lg hover:border-zinc-700 transition"
                  >
                    <div className="text-[10px] text-zinc-300 truncate">{session.title}</div>
                    <div className="text-[9px] text-zinc-600">{formatDate(session.updated_at)}</div>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
