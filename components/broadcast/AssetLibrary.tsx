'use client'

import { useState, useEffect, useRef } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset } from '@/lib/broadcastTypes'

interface SavedScene {
  id: string
  name: string
  thumbnail_url: string | null
  width: number
  height: number
}

export default function AssetLibrary() {
  const { assets, selectedAssetId, setSelectedAssetId, addAsset, removeAsset, project } = useBroadcast()
  const [showImport, setShowImport] = useState(false)
  const [scenes, setScenes] = useState<SavedScene[]>([])
  const [loadingScenes, setLoadingScenes] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showImport) return
    setLoadingScenes(true)
    fetch('/api/scenes')
      .then(r => r.json())
      .then(d => setScenes(d.scenes || []))
      .catch(() => setScenes([]))
      .finally(() => setLoadingScenes(false))
  }, [showImport])

  async function importScene(sceneId: string, sceneName: string) {
    if (!project) return
    setImporting(sceneId)
    try {
      // Fetch full scene config
      const res = await fetch(`/api/scenes/${sceneId}`)
      const data = await res.json()
      if (!data.scene) return

      const config = data.scene.config
      const assetRes = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: sceneName,
          asset_type: 'scene',
          scene_config: {
            width: data.scene.width || 1920,
            height: data.scene.height || 1080,
            background: config?.background || '#09090b',
            elements: config?.elements || [],
          },
          canvas_width: data.scene.width || 1920,
          canvas_height: data.scene.height || 1080,
          sort_order: assets.length,
        }),
      })
      const assetData = await assetRes.json()
      if (assetData.asset) {
        addAsset(assetData.asset)
        setShowImport(false)
      }
    } catch (err) {
      console.error('Failed to import scene:', err)
    } finally {
      setImporting(null)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return
    const file = e.target.files[0]
    const isVideo = file.type.startsWith('video/')
    const assetType = isVideo ? 'video' : 'image'

    try {
      // Upload to API
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', project.id)

      const res = await fetch('/api/broadcast/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!data.url) return

      // Create asset
      const assetRes = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: file.name.replace(/\.[^.]+$/, ''),
          asset_type: assetType,
          storage_path: data.url,
          canvas_width: isVideo ? 1920 : 400,
          canvas_height: isVideo ? 1080 : 300,
          sort_order: assets.length,
        }),
      })
      const assetData = await assetRes.json()
      if (assetData.asset) addAsset(assetData.asset)
    } catch (err) {
      console.error('Failed to upload:', err)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this asset?')) return
    try {
      await fetch('/api/broadcast/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      removeAsset(id)
    } catch (err) {
      console.error('Failed to delete asset:', err)
    }
  }

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Asset Library</h3>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2 border-b border-zinc-800">
        <button
          onClick={() => setShowImport(true)}
          className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition"
        >
          Import Scene
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition"
        >
          Upload Media
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Asset List */}
      <div className="flex-1 overflow-y-auto">
        {assets.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-600 text-xs">
            No assets yet. Import a scene or upload media.
          </div>
        ) : (
          <div className="py-1">
            {assets.map(asset => (
              <div
                key={asset.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition ${
                  selectedAssetId === asset.id
                    ? 'bg-red-500/10 border-l-2 border-red-400'
                    : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
                }`}
                onClick={() => setSelectedAssetId(asset.id)}
              >
                {/* Type icon */}
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-[10px] shrink-0"
                  style={{ backgroundColor: asset.hotkey_color + '20', color: asset.hotkey_color }}
                >
                  {asset.asset_type === 'scene' ? 'S' : asset.asset_type === 'video' ? 'V' : 'I'}
                </div>

                <span className="text-xs text-zinc-300 truncate flex-1">{asset.name}</span>

                <button
                  onClick={e => { e.stopPropagation(); handleDelete(asset.id) }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowImport(false)}>
          <div
            className="w-[600px] max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Import Scene</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Select a scene to import as a broadcast asset</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-zinc-500 hover:text-zinc-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingScenes ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-zinc-700 border-t-red-400 rounded-full animate-spin" />
                </div>
              ) : scenes.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">No saved scenes found</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {scenes.map(scene => (
                    <button
                      key={scene.id}
                      onClick={() => importScene(scene.id, scene.name)}
                      disabled={importing === scene.id}
                      className="bg-zinc-800 border border-zinc-700 hover:border-red-500/40 rounded-lg p-3 text-left transition disabled:opacity-50"
                    >
                      {scene.thumbnail_url ? (
                        <img src={scene.thumbnail_url} alt={scene.name} className="w-full h-24 object-cover rounded mb-2 bg-zinc-900" />
                      ) : (
                        <div className="w-full h-24 bg-zinc-900 rounded mb-2 flex items-center justify-center text-zinc-600 text-2xl">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18" /><path d="M9 21V9" />
                          </svg>
                        </div>
                      )}
                      <div className="text-xs font-medium text-white truncate">{scene.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{scene.width}x{scene.height}</div>
                      {importing === scene.id && <div className="text-[10px] text-red-400 mt-1">Importing...</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
