'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useBroadcast } from './BroadcastContext'
import { generateStreamDeckProfile, DEVICE_DIMS, type DeviceModel, type ButtonEntry } from '@/lib/streamDeckProfile'
import type { useStreamDeck } from '@/lib/useStreamDeck'

const DEVICE_OPTIONS: { value: DeviceModel; label: string }[] = [
  { value: 'sd', label: 'Stream Deck (5×3)' },
  { value: 'sd-xl', label: 'Stream Deck XL (8×4)' },
  { value: 'sd-mini', label: 'Stream Deck Mini (3×2)' },
  { value: 'sd-plus', label: 'Stream Deck + (4×2)' },
]

interface StreamDeckSetupProps {
  onClose: () => void
  streamDeck?: ReturnType<typeof useStreamDeck>
  buttonOrder?: ButtonEntry[]
  onButtonOrderChange?: (order: ButtonEntry[]) => void
}

export default function StreamDeckSetup({ onClose, streamDeck, buttonOrder: externalButtonOrder, onButtonOrderChange }: StreamDeckSetupProps) {
  const { project, assets, session, updateAsset, segments, visibleAssetIds, activeSegmentId } = useBroadcast()
  const [deviceModel, setDeviceModel] = useState<DeviceModel>('sd')
  const [downloading, setDownloading] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const dims = DEVICE_DIMS[deviceModel]
  const totalButtons = dims.cols * dims.rows
  const sorted = [...assets].sort((a, b) => a.sort_order - b.sort_order)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  // --- Drag-and-drop state ---
  const buttonOrder = externalButtonOrder || []
  const setButtonOrder = onButtonOrderChange || (() => {})
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Pad button order to match grid when no external order
  const gridEntries = [...buttonOrder]
  while (gridEntries.length < totalButtons) gridEntries.push({ type: 'empty' })
  const displayEntries = gridEntries.slice(0, totalButtons)

  // --- Drag handlers ---
  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setHoverIdx(idx)
  }

  function handleDragLeave() {
    setHoverIdx(null)
  }

  function handleDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault()
    const fromIdx = dragIdx
    setDragIdx(null)
    setHoverIdx(null)
    if (fromIdx === null || fromIdx === dropIdx) return

    const next = [...buttonOrder]
    // Ensure we have enough entries
    while (next.length <= Math.max(fromIdx, dropIdx)) next.push({ type: 'empty' })
    const [moved] = next.splice(fromIdx, 1)
    next.splice(dropIdx, 0, moved)

    // Persist sort_order for asset buttons
    let order = 0
    for (const entry of next) {
      if (entry.type === 'asset') {
        if (entry.asset.sort_order !== order) {
          updateAsset(entry.asset.id, { sort_order: order })
        }
        order++
      }
    }

    setButtonOrder(next)
  }

  function handleDragEnd() {
    setDragIdx(null)
    setHoverIdx(null)
  }

  // --- Download with custom layout ---
  const handleDownload = useCallback(async () => {
    if (!project) return
    setDownloading(true)
    try {
      const blob = await generateStreamDeckProfile({
        assets,
        projectName: project.name,
        deviceModel,
        sessionId: session?.id,
        baseUrl,
        buttonLayout: buttonOrder,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.name.replace(/\s+/g, '-')}.streamDeckProfile`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }, [project, assets, deviceModel, session, baseUrl, buttonOrder])

  function getTriggerUrl(assetId: string, action: string) {
    return `${baseUrl}/api/broadcast/trigger?sid=${session?.id}&aid=${assetId}&action=${action}`
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedUrl(id)
    setTimeout(() => setCopiedUrl(null), 1500)
  }

  function copyAllUrls() {
    const lines: string[] = []
    for (const asset of sorted) {
      lines.push(getTriggerUrl(asset.id, 'toggle'))
      if (asset.asset_type === 'slideshow') {
        lines.push(getTriggerUrl(asset.id, 'slideshow_next'))
        lines.push(getTriggerUrl(asset.id, 'slideshow_prev'))
      }
    }
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedUrl('all')
    setTimeout(() => setCopiedUrl(null), 1500)
  }

  // --- Render a single grid cell ---
  function renderCell(entry: ButtonEntry, idx: number) {
    const isDragging = dragIdx === idx
    const isHover = hoverIdx === idx && dragIdx !== null && dragIdx !== idx
    const isEmpty = entry.type === 'empty'

    const dragProps = isEmpty ? {} : {
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, idx),
    }

    const dropProps = {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleDragOver(e, idx),
      onDragLeave: handleDragLeave,
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleDrop(e, idx),
      onDragEnd: handleDragEnd,
    }

    const hoverRing = isHover ? 'ring-2 ring-emerald-500' : ''
    const dragOpacity = isDragging ? 'opacity-40' : ''

    if (entry.type === 'asset') {
      const { asset } = entry
      const label = asset.hotkey_label || asset.name
      const color = asset.hotkey_color || '#3f3f46'
      const isActive = visibleAssetIds.has(asset.id)
      return (
        <div
          key={`btn-${idx}`}
          className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 relative cursor-grab active:cursor-grabbing select-none ${hoverRing} ${dragOpacity}`}
          style={{
            backgroundColor: color,
            border: isActive ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
          }}
          {...dragProps}
          {...dropProps}
        >
          <span className="text-[10px] font-bold text-white text-center leading-tight truncate w-full px-0.5">
            {label.length > 10 ? label.slice(0, 9) + '\u2026' : label}
          </span>
          {asset.hotkey_key && (
            <span className="absolute bottom-0.5 right-1 text-[8px] text-white/60 font-mono">
              {asset.hotkey_key.toUpperCase()}
            </span>
          )}
        </div>
      )
    }

    if (entry.type === 'segment') {
      const { segment } = entry
      const color = segment.hotkey_color || '#6366f1'
      const isActive = activeSegmentId === segment.id
      return (
        <div
          key={`btn-${idx}`}
          className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 relative cursor-grab active:cursor-grabbing select-none ${hoverRing} ${dragOpacity}`}
          style={{
            backgroundColor: color,
            border: isActive ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
          }}
          {...dragProps}
          {...dropProps}
        >
          <span className="text-[7px] text-white/50 uppercase tracking-wider font-medium">Seg</span>
          <span className="text-[10px] font-bold text-white text-center leading-tight truncate w-full px-0.5">
            {segment.name.length > 8 ? segment.name.slice(0, 7) + '\u2026' : segment.name}
          </span>
          {segment.hotkey_key && (
            <span className="absolute bottom-0.5 right-1 text-[8px] text-white/60 font-mono">
              {segment.hotkey_key.toUpperCase()}
            </span>
          )}
        </div>
      )
    }

    if (entry.type === 'slideshow-prev') {
      return (
        <div
          key={`btn-${idx}`}
          className={`aspect-square rounded-lg border border-white/10 flex items-center justify-center p-1 cursor-grab active:cursor-grabbing select-none ${hoverRing} ${dragOpacity}`}
          style={{ backgroundColor: '#3f3f46' }}
          {...dragProps}
          {...dropProps}
        >
          <span className="text-[10px] font-bold text-white text-center leading-tight">&lt; Prev Slide</span>
        </div>
      )
    }

    if (entry.type === 'slideshow-next') {
      return (
        <div
          key={`btn-${idx}`}
          className={`aspect-square rounded-lg border border-white/10 flex items-center justify-center p-1 cursor-grab active:cursor-grabbing select-none ${hoverRing} ${dragOpacity}`}
          style={{ backgroundColor: '#3f3f46' }}
          {...dragProps}
          {...dropProps}
        >
          <span className="text-[10px] font-bold text-white text-center leading-tight">Next Slide &gt;</span>
        </div>
      )
    }

    // Empty slot — drop target only
    return (
      <div
        key={`btn-${idx}`}
        className={`aspect-square rounded-lg bg-zinc-800/50 border border-zinc-800 ${hoverRing}`}
        {...dropProps}
      />
    )
  }

  const sdStatus = streamDeck?.state.status || 'disconnected'
  const sdConnected = streamDeck?.isConnected || false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg w-[720px] max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Stream Deck Setup</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Physical device connection */}
          {streamDeck && (
            <div className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 p-3 space-y-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Physical Device (WebHID)</p>

              {sdStatus === 'disconnected' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={streamDeck.connect}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-500 text-white transition"
                  >
                    Connect Device
                  </button>
                  <span className="text-[10px] text-zinc-600">Chrome 89+ required &middot; HTTPS or localhost</span>
                </div>
              )}

              {sdStatus === 'connecting' && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border border-zinc-500 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-xs text-zinc-400">Connecting...</span>
                </div>
              )}

              {sdStatus === 'connected' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs text-zinc-200 font-medium">{streamDeck.state.deviceModel}</span>
                    {streamDeck.state.serialNumber && (
                      <span className="text-[10px] text-zinc-600 font-mono">{streamDeck.state.serialNumber}</span>
                    )}
                  </div>
                  <button
                    onClick={streamDeck.disconnect}
                    className="px-2 py-1 text-[10px] font-medium rounded bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-600/50 transition"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {sdStatus === 'error' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-xs text-red-400">{streamDeck.state.error}</span>
                  </div>
                  <button
                    onClick={streamDeck.connect}
                    className="px-2 py-1 text-[10px] font-medium rounded bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-600/50 transition"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Profile export: device selector + download */}
          <div className="flex items-center gap-3">
            <select
              value={deviceModel}
              onChange={e => setDeviceModel(e.target.value as DeviceModel)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
            >
              {DEVICE_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
            >
              {downloading ? 'Generating...' : 'Download Profile'}
            </button>
          </div>

          {/* Grid preview with drag-and-drop */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
              Button Layout
              <span className="ml-2 normal-case tracking-normal text-zinc-600">
                Drag to rearrange
                {sdConnected && ' \u2022 Live on device'}
              </span>
            </p>
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${dims.cols}, 1fr)`,
                gridTemplateRows: `repeat(${dims.rows}, 1fr)`,
              }}
            >
              {displayEntries.map((entry, i) => renderCell(entry, i))}
            </div>
          </div>

          {/* HTTP Trigger URLs — only when live */}
          {session && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">HTTP Trigger URLs</p>
                <button
                  onClick={copyAllUrls}
                  className="px-2 py-0.5 text-[10px] font-medium rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition"
                >
                  {copiedUrl === 'all' ? 'Copied!' : 'Copy All URLs'}
                </button>
              </div>
              <div className="space-y-1">
                {sorted.map(asset => {
                  const rows: { label: string; action: string; id: string }[] = [
                    { label: asset.name, action: 'toggle', id: `${asset.id}-toggle` },
                  ]
                  if (asset.asset_type === 'slideshow') {
                    rows.push(
                      { label: `${asset.name} — Next`, action: 'slideshow_next', id: `${asset.id}-next` },
                      { label: `${asset.name} — Prev`, action: 'slideshow_prev', id: `${asset.id}-prev` },
                    )
                  }
                  return rows.map(row => {
                    const url = getTriggerUrl(asset.id, row.action)
                    return (
                      <div key={row.id} className="flex items-center gap-2 bg-zinc-800/50 rounded px-2.5 py-1.5">
                        <span className="text-[10px] text-zinc-300 font-medium w-32 truncate shrink-0">{row.label}</span>
                        <span className="text-[9px] text-zinc-500 uppercase w-20 shrink-0">{row.action}</span>
                        <span className="text-[9px] text-zinc-600 font-mono truncate flex-1 min-w-0">{url}</span>
                        <button
                          onClick={() => copyToClipboard(url, row.id)}
                          className="px-1.5 py-0.5 text-[9px] rounded bg-zinc-700 text-zinc-400 hover:text-zinc-200 shrink-0 transition"
                        >
                          {copiedUrl === row.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )
                  })
                })}
              </div>
            </div>
          )}

          {!session && (
            <p className="text-[10px] text-zinc-600 italic">Go live to see HTTP trigger URLs for Stream Deck / Companion integration.</p>
          )}
        </div>
      </div>
    </div>
  )
}
