'use client'

import { useState, useEffect, useRef } from 'react'
import { useBroadcast } from './BroadcastContext'
import { formatMarkerTime } from '@/lib/clipMarkerTypes'

export default function ClipMarkerPanel() {
  const {
    clipMarkers, recordingState, getRecordingElapsedSeconds,
    markClipIn, markClipOut, updateClipMarker, removeClipMarker, exportClipMarkers,
  } = useBroadcast()

  const [collapsed, setCollapsed] = useState(false)
  const [elapsedDisplay, setElapsedDisplay] = useState('00:00:00')
  const listRef = useRef<HTMLDivElement>(null)

  // Tick elapsed timer
  useEffect(() => {
    if (!recordingState.isRecording) {
      setElapsedDisplay('00:00:00')
      return
    }
    const interval = setInterval(() => {
      setElapsedDisplay(formatMarkerTime(getRecordingElapsedSeconds()))
    }, 250)
    return () => clearInterval(interval)
  }, [recordingState.isRecording, getRecordingElapsedSeconds])

  // Auto-scroll when new marker added
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [clipMarkers.length])

  const hasOpenShort = clipMarkers.some(m => m.clip_type === 'short' && m.status === 'open')
  const hasOpenLong = clipMarkers.some(m => m.clip_type === 'long' && m.status === 'open')
  const closedCount = clipMarkers.filter(m => m.status === 'closed').length

  function handleExport() {
    const data = exportClipMarkers()
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clip-markers-${data.show_date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border-t border-zinc-800">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800/50 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-400 tracking-wider">CLIP MARKERS</span>
          {clipMarkers.length > 0 && (
            <span className="text-[9px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
              {closedCount}/{clipMarkers.length}
            </span>
          )}
        </div>
        <span className="text-zinc-600 text-xs">{collapsed ? '+' : '-'}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-2">
          {/* Recording status bar */}
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-900/50">
            {recordingState.isRecording ? (
              <>
                <div className={`w-2 h-2 rounded-full ${recordingState.isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
                <span className="text-[11px] font-mono text-zinc-300 flex-1">
                  {recordingState.isPaused ? 'PAUSED' : 'REC'} {elapsedDisplay}
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-zinc-600" />
                <span className="text-[11px] text-zinc-500 flex-1">Not Recording</span>
              </>
            )}
          </div>

          {/* Quick mark buttons */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => markClipIn('short')}
              disabled={!recordingState.isRecording || hasOpenShort}
              className="px-2 py-1 text-[10px] font-medium rounded bg-indigo-600/20 text-indigo-300 border border-indigo-600/30 hover:bg-indigo-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Short In [
            </button>
            <button
              onClick={() => markClipOut('short')}
              disabled={!recordingState.isRecording || !hasOpenShort}
              className="px-2 py-1 text-[10px] font-medium rounded bg-indigo-600/20 text-indigo-300 border border-indigo-600/30 hover:bg-indigo-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Short Out ]
            </button>
            <button
              onClick={() => markClipIn('long')}
              disabled={!recordingState.isRecording || hasOpenLong}
              className="px-2 py-1 text-[10px] font-medium rounded bg-amber-600/20 text-amber-300 border border-amber-600/30 hover:bg-amber-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Long In {'{'}
            </button>
            <button
              onClick={() => markClipOut('long')}
              disabled={!recordingState.isRecording || !hasOpenLong}
              className="px-2 py-1 text-[10px] font-medium rounded bg-amber-600/20 text-amber-300 border border-amber-600/30 hover:bg-amber-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Long Out {'}'}
            </button>
          </div>

          {/* Marker list */}
          {clipMarkers.length > 0 && (
            <div ref={listRef} className="max-h-48 overflow-y-auto space-y-1">
              {clipMarkers.map(marker => (
                <MarkerRow
                  key={marker.id}
                  marker={marker}
                  onUpdate={updateClipMarker}
                  onRemove={removeClipMarker}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          {closedCount > 0 && (
            <button
              onClick={handleExport}
              className="w-full px-2 py-1 text-[10px] font-medium rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 hover:border-zinc-600 transition"
            >
              Export JSON ({closedCount} clip{closedCount !== 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MarkerRow({
  marker,
  onUpdate,
  onRemove,
}: {
  marker: any
  onUpdate: (id: string, updates: any) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(marker.title)

  const isOpen = marker.status === 'open'
  const typeColor = marker.clip_type === 'short' ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'

  function handleTitleBlur() {
    setEditing(false)
    if (title !== marker.title) {
      onUpdate(marker.id, { title })
    }
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900/50 ${isOpen ? 'ring-1 ring-emerald-500/40 animate-pulse' : ''}`}>
      {/* Type badge */}
      <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${typeColor} shrink-0`}>
        {marker.clip_type === 'short' ? 'S' : 'L'}
      </span>

      {/* Times */}
      <span className="text-[10px] font-mono text-zinc-400 shrink-0">
        {marker.start_time != null ? formatMarkerTime(marker.start_time) : '--:--:--'}
        {' - '}
        {marker.end_time != null ? formatMarkerTime(marker.end_time) : '--:--:--'}
      </span>

      {/* Title */}
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleTitleBlur() }}
          className="flex-1 min-w-0 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200 outline-none focus:border-zinc-500"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className="flex-1 min-w-0 text-[10px] text-zinc-500 truncate cursor-text hover:text-zinc-300"
          title="Click to edit title"
        >
          {marker.title || 'Untitled'}
        </span>
      )}

      {/* Delete */}
      <button
        onClick={() => onRemove(marker.id)}
        className="text-zinc-600 hover:text-red-400 text-[10px] shrink-0 transition"
        title="Remove marker"
      >
        &times;
      </button>
    </div>
  )
}
