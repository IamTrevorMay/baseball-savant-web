'use client'

import { useState, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset } from '@/lib/broadcastTypes'

// ── Stream Deck Models ────────────────────────────────────────────────────────

interface StreamDeckModel {
  label: string
  cols: number
  rows: number
}

const MODELS: Record<string, StreamDeckModel> = {
  xl: { label: 'XL', cols: 8, rows: 4 },
  mk2: { label: 'MK.2', cols: 5, rows: 3 },
  mini: { label: 'Mini', cols: 3, rows: 2 },
}

// ── StreamDeckKey ─────────────────────────────────────────────────────────────

function StreamDeckKey({
  index,
  asset,
  isActive,
  previewMode,
  onAssign,
  onTrigger,
}: {
  index: number
  asset: BroadcastAsset | null
  isActive: boolean
  previewMode: boolean
  onAssign: (index: number) => void
  onTrigger: (assetId: string) => void
}) {
  const [flash, setFlash] = useState(false)

  function handleClick() {
    if (previewMode && asset) {
      onTrigger(asset.id)
      setFlash(true)
      setTimeout(() => setFlash(false), 200)
    } else if (!previewMode) {
      onAssign(index)
    }
  }

  const color = asset?.hotkey_color || '#52525b'

  return (
    <button
      onClick={handleClick}
      className={`relative aspect-square rounded-xl border-2 transition-all duration-150 flex flex-col items-center justify-center gap-1 overflow-hidden ${
        flash
          ? 'scale-95'
          : previewMode && asset
          ? 'hover:scale-105 cursor-pointer'
          : !previewMode
          ? 'hover:border-zinc-500 cursor-pointer'
          : 'cursor-default'
      }`}
      style={{
        borderColor: isActive ? color : '#3f3f46',
        backgroundColor: isActive ? color + '20' : '#18181b',
        boxShadow: isActive ? `0 0 12px ${color}40` : flash ? `0 0 20px ${color}80` : undefined,
      }}
    >
      {asset ? (
        <>
          {/* Thumbnail */}
          <div className="w-full flex-1 flex items-center justify-center p-1.5 overflow-hidden">
            {asset.asset_type === 'scene' && (
              <div className="w-full h-full rounded bg-zinc-800 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 3v18" />
                </svg>
              </div>
            )}
            {asset.asset_type === 'image' && asset.storage_path && (
              <img src={asset.storage_path} alt={asset.name} className="max-w-full max-h-full object-contain rounded" draggable={false} />
            )}
            {asset.asset_type === 'video' && (
              <div className="w-full h-full rounded bg-zinc-800 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            )}
          </div>

          {/* Label bar */}
          <div className="w-full px-1 pb-1 flex items-center justify-between gap-1">
            <span className="text-[9px] text-zinc-400 truncate flex-1">{asset.hotkey_label || asset.name}</span>
            {asset.hotkey_key && (
              <span className="text-[8px] font-mono bg-zinc-700 text-zinc-300 px-1 rounded shrink-0">
                {asset.hotkey_key.toUpperCase()}
              </span>
            )}
          </div>

          {/* Active indicator dot */}
          <div
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full transition-colors"
            style={{ backgroundColor: isActive ? color : '#3f3f46' }}
          />
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-[8px] text-zinc-600">{index + 1}</span>
        </>
      )}
    </button>
  )
}

// ── StreamDeckGrid ────────────────────────────────────────────────────────────

export default function StreamDeckGrid() {
  const { assets, visibleAssetIds, toggleAssetVisibility, session, project } = useBroadcast()
  const [modelKey, setModelKey] = useState<string>('xl')
  const [previewMode, setPreviewMode] = useState(false)
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null)

  const model = MODELS[modelKey]
  const totalKeys = model.cols * model.rows

  // Build slot → asset mapping using sort_order
  const slotMap = new Map<number, BroadcastAsset>()
  for (const asset of assets) {
    const slot = asset.sort_order
    if (slot >= 0 && slot < totalKeys) {
      slotMap.set(slot, asset)
    }
  }

  const handleAssign = useCallback((index: number) => {
    setAssigningSlot(prev => prev === index ? null : index)
  }, [])

  const handleAssignAsset = useCallback((assetId: string, slot: number) => {
    // Update sort_order to assign asset to this slot
    fetch('/api/broadcast/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: assetId, sort_order: slot }),
    }).catch(console.error)
    setAssigningSlot(null)
  }, [])

  const handleTrigger = useCallback((assetId: string) => {
    toggleAssetVisibility(assetId)
  }, [toggleAssetVisibility])

  function handleExport() {
    const deviceModel = modelKey === 'xl' ? 'StreamDeckXL' : modelKey === 'mk2' ? 'StreamDeckMK2' : 'StreamDeckMini'
    const keys: Record<string, { Name: string; Title: string; State: number }> = {}

    for (let i = 0; i < totalKeys; i++) {
      const asset = slotMap.get(i)
      if (asset) {
        keys[String(i)] = {
          Name: asset.name,
          Title: asset.hotkey_label || asset.name,
          State: visibleAssetIds.has(asset.id) ? 1 : 0,
        }
      }
    }

    const profile = {
      Name: `Broadcast - ${project?.name || 'Project'}`,
      DeviceModel: deviceModel,
      Keys: keys,
    }

    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name || 'broadcast'}.streamDeckProfile`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Unassigned assets (not in any slot for current model)
  const assignedIds = new Set(Array.from(slotMap.values()).map(a => a.id))
  const unassignedAssets = assets.filter(a => !assignedIds.has(a.id))

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800">
        {/* Model selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Model</span>
          <select
            value={modelKey}
            onChange={e => setModelKey(e.target.value)}
            className="text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1"
          >
            {Object.entries(MODELS).map(([key, m]) => (
              <option key={key} value={key}>{m.label} ({m.cols}x{m.rows})</option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        {/* Preview mode toggle */}
        <button
          onClick={() => setPreviewMode(prev => !prev)}
          disabled={!session}
          className={`text-xs px-3 py-1 rounded-lg border transition ${
            previewMode
              ? 'bg-red-500/20 border-red-500 text-red-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
          } ${!session ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {previewMode ? 'Preview ON' : 'Preview'}
        </button>

        {/* Export */}
        <button
          onClick={handleExport}
          className="text-xs px-3 py-1 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
        >
          Export
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 shadow-2xl">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${model.cols}, minmax(0, 1fr))`,
              width: model.cols * 80 + (model.cols - 1) * 8,
            }}
          >
            {Array.from({ length: totalKeys }, (_, i) => {
              const asset = slotMap.get(i) || null
              const isActive = asset ? visibleAssetIds.has(asset.id) : false
              return (
                <div key={i} className="relative">
                  <StreamDeckKey
                    index={i}
                    asset={asset}
                    isActive={isActive}
                    previewMode={previewMode}
                    onAssign={handleAssign}
                    onTrigger={handleTrigger}
                  />

                  {/* Assignment dropdown */}
                  {assigningSlot === i && (
                    <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                      <div className="p-1.5 border-b border-zinc-700 text-[10px] text-zinc-500 uppercase tracking-wider px-2">
                        Assign to key {i + 1}
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {/* Clear option if slot has asset */}
                        {asset && (
                          <button
                            onClick={() => { handleAssignAsset(asset.id, -1); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700/50 transition"
                          >
                            Clear slot
                          </button>
                        )}
                        {unassignedAssets.map(a => (
                          <button
                            key={a.id}
                            onClick={() => handleAssignAsset(a.id, i)}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700/50 transition flex items-center gap-2"
                          >
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: a.hotkey_color || '#06b6d4' }}
                            />
                            {a.name}
                          </button>
                        ))}
                        {unassignedAssets.length === 0 && !asset && (
                          <div className="px-3 py-2 text-xs text-zinc-500">No unassigned assets</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
