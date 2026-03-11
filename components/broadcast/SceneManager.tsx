'use client'

import { useState, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastScene, BroadcastSceneAsset } from '@/lib/broadcastTypes'
import { getTransitions } from '@/lib/transitions'

export default function SceneManager() {
  const {
    scenes, sceneAssets, activeSceneId, switchingScene, assets, session,
    addScene, updateScene, removeScene, switchScene,
    addSceneAsset, removeSceneAsset, updateSceneAsset, reloadSceneAssets,
  } = useBroadcast()

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')

  const selectedScene = scenes.find(s => s.id === selectedSceneId) || null
  const selectedSceneAssetList = selectedSceneId ? sceneAssets.get(selectedSceneId) || [] : []
  const assignedAssetIds = new Set(selectedSceneAssetList.map(sa => sa.asset_id))

  // Create new scene
  const handleAddScene = useCallback(async () => {
    const project_id = scenes[0]?.project_id
    if (!project_id && assets.length === 0) return
    const pid = project_id || assets[0]?.project_id
    if (!pid) return

    try {
      const res = await fetch('/api/broadcast/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: pid,
          name: `Scene ${scenes.length + 1}`,
          sort_order: scenes.length,
        }),
      })
      const data = await res.json()
      if (data.scene) {
        addScene(data.scene)
        setSelectedSceneId(data.scene.id)
      }
    } catch (err) {
      console.error('Failed to create scene:', err)
    }
  }, [scenes, assets, addScene])

  // Delete scene
  const handleDeleteScene = useCallback(async (id: string) => {
    try {
      await fetch('/api/broadcast/scenes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      removeScene(id)
      if (selectedSceneId === id) setSelectedSceneId(null)
    } catch (err) {
      console.error('Failed to delete scene:', err)
    }
  }, [removeScene, selectedSceneId])

  // Rename scene
  const handleStartRename = useCallback((scene: BroadcastScene) => {
    setEditingName(scene.id)
    setNameInput(scene.name)
  }, [])

  const handleFinishRename = useCallback(async (id: string) => {
    setEditingName(null)
    if (!nameInput.trim()) return
    try {
      await fetch('/api/broadcast/scenes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: nameInput.trim() }),
      })
      updateScene(id, { name: nameInput.trim() })
    } catch (err) {
      console.error('Failed to rename scene:', err)
    }
  }, [nameInput, updateScene])

  // Toggle asset in scene
  const handleToggleAsset = useCallback(async (assetId: string) => {
    if (!selectedSceneId) return
    const existing = selectedSceneAssetList.find(sa => sa.asset_id === assetId)

    if (existing) {
      // Remove
      try {
        await fetch('/api/broadcast/scene-assets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existing.id }),
        })
        removeSceneAsset(existing.id)
      } catch (err) {
        console.error('Failed to remove scene asset:', err)
      }
    } else {
      // Add
      try {
        const res = await fetch('/api/broadcast/scene-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene_id: selectedSceneId, asset_id: assetId }),
        })
        const data = await res.json()
        if (data.sceneAsset) addSceneAsset(data.sceneAsset)
      } catch (err) {
        console.error('Failed to add scene asset:', err)
      }
    }
  }, [selectedSceneId, selectedSceneAssetList, addSceneAsset, removeSceneAsset])

  // Update scene-asset override
  const handleUpdateOverride = useCallback(async (saId: string, field: string, value: number | null) => {
    try {
      await fetch('/api/broadcast/scene-assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: saId, [field]: value }),
      })
      updateSceneAsset(saId, { [field]: value } as any)
    } catch (err) {
      console.error('Failed to update override:', err)
    }
  }, [updateSceneAsset])

  // Update scene fields
  const handleUpdateSceneField = useCallback(async (field: string, value: any) => {
    if (!selectedSceneId) return
    try {
      await fetch('/api/broadcast/scenes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedSceneId, [field]: value }),
      })
      updateScene(selectedSceneId, { [field]: value } as any)
    } catch (err) {
      console.error('Failed to update scene:', err)
    }
  }, [selectedSceneId, updateScene])

  return (
    <div className="flex-1 overflow-hidden flex bg-zinc-950">
      {/* Scene List */}
      <div className="w-64 border-r border-zinc-800 flex flex-col">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Scenes</span>
          <button
            onClick={handleAddScene}
            className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition"
          >
            + Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {scenes.map(scene => (
            <div
              key={scene.id}
              onClick={() => setSelectedSceneId(scene.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition ${
                selectedSceneId === scene.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
            >
              {/* Active indicator */}
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: activeSceneId === scene.id ? (scene.hotkey_color || '#10b981') : '#3f3f46',
                }}
              />

              {/* Name */}
              {editingName === scene.id ? (
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={() => handleFinishRename(scene.id)}
                  onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(scene.id) }}
                  className="flex-1 text-xs bg-zinc-700 text-zinc-100 px-1.5 py-0.5 rounded border border-zinc-600 outline-none"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="flex-1 text-xs truncate"
                  onDoubleClick={() => handleStartRename(scene)}
                >
                  {scene.name}
                </span>
              )}

              {/* Hotkey badge */}
              {scene.hotkey_key && (
                <span className="text-[8px] font-mono bg-zinc-700 text-zinc-300 px-1 rounded shrink-0">
                  {scene.hotkey_key.toUpperCase()}
                </span>
              )}

              {/* Stinger indicator */}
              {scene.stinger_enabled && (
                <span className="text-[9px] text-amber-400" title="Stinger enabled">S</span>
              )}

              {/* Delete */}
              <button
                onClick={e => { e.stopPropagation(); handleDeleteScene(scene.id) }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          {scenes.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-xs">
              No scenes yet. Create one to group assets.
            </div>
          )}
        </div>
      </div>

      {/* Scene Detail Panel */}
      <div className="flex-1 overflow-y-auto">
        {selectedScene ? (
          <div className="p-4 space-y-6">
            {/* Scene header + switch button */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">{selectedScene.name}</h3>
              <div className="flex items-center gap-2">
                {activeSceneId === selectedScene.id ? (
                  <span className="text-[10px] px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded">
                    Active
                  </span>
                ) : (
                  <button
                    onClick={() => switchScene(selectedScene.id)}
                    disabled={!session || switchingScene}
                    className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded transition"
                  >
                    {switchingScene ? 'Switching...' : 'Switch To'}
                  </button>
                )}
              </div>
            </div>

            {/* Asset Assignment */}
            <div>
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Assets in Scene</h4>
              <div className="space-y-1">
                {assets.map(asset => {
                  const isAssigned = assignedAssetIds.has(asset.id)
                  const sceneAsset = selectedSceneAssetList.find(sa => sa.asset_id === asset.id)
                  return (
                    <div key={asset.id} className="space-y-1">
                      <button
                        onClick={() => handleToggleAsset(asset.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition ${
                          isAssigned
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                            : 'bg-zinc-800/50 border border-zinc-700 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded border-2 flex items-center justify-center ${
                          isAssigned ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'
                        }`}>
                          {isAssigned && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: asset.hotkey_color || '#06b6d4' }}
                        />
                        <span className="truncate">{asset.name}</span>
                        <span className="ml-auto text-[9px] text-zinc-500">{asset.asset_type}</span>
                      </button>

                      {/* Overrides (only if assigned) */}
                      {isAssigned && sceneAsset && (
                        <div className="ml-8 grid grid-cols-3 gap-1.5">
                          {[
                            { field: 'override_x', label: 'X' },
                            { field: 'override_y', label: 'Y' },
                            { field: 'override_width', label: 'W' },
                            { field: 'override_height', label: 'H' },
                            { field: 'override_layer', label: 'Z' },
                            { field: 'override_opacity', label: 'Op' },
                          ].map(({ field, label }) => (
                            <div key={field} className="flex items-center gap-1">
                              <span className="text-[9px] text-zinc-500 w-3">{label}</span>
                              <input
                                type="number"
                                placeholder="—"
                                value={(sceneAsset as any)[field] ?? ''}
                                onChange={e => {
                                  const v = e.target.value === '' ? null : Number(e.target.value)
                                  handleUpdateOverride(sceneAsset.id, field, v)
                                }}
                                className="w-full text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 outline-none focus:border-zinc-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Stinger Config */}
            <div>
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Stinger Transition</h4>
              <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                {/* Enable toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedScene.stinger_enabled}
                    onChange={e => handleUpdateSceneField('stinger_enabled', e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="text-xs text-zinc-300">Enable stinger</span>
                </label>

                {selectedScene.stinger_enabled && (
                  <>
                    {/* Video URL */}
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">Video URL</label>
                      <input
                        type="text"
                        value={selectedScene.stinger_video_url || ''}
                        onChange={e => handleUpdateSceneField('stinger_video_url', e.target.value || null)}
                        placeholder="https://... or upload"
                        className="w-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-2 py-1.5 outline-none focus:border-zinc-500"
                      />
                    </div>

                    {/* Cut point slider */}
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">
                        Cut Point: {Math.round((selectedScene.stinger_cut_point || 0.5) * 100)}%
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((selectedScene.stinger_cut_point || 0.5) * 100)}
                        onChange={e => handleUpdateSceneField('stinger_cut_point', Number(e.target.value) / 100)}
                        className="w-full accent-emerald-500"
                      />
                      <div className="flex justify-between text-[9px] text-zinc-600">
                        <span>0%</span>
                        <span>Swap happens here</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Hotkey Config */}
            <div>
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Hotkey</h4>
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 block mb-1">Key</label>
                  <input
                    type="text"
                    maxLength={1}
                    value={selectedScene.hotkey_key || ''}
                    onChange={e => handleUpdateSceneField('hotkey_key', e.target.value.toLowerCase() || null)}
                    className="w-12 text-center text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-2 py-1.5 outline-none focus:border-zinc-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 block mb-1">Color</label>
                  <input
                    type="color"
                    value={selectedScene.hotkey_color || '#10b981'}
                    onChange={e => handleUpdateSceneField('hotkey_color', e.target.value)}
                    className="w-8 h-8 rounded border border-zinc-700 cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-xs">
              {scenes.length > 0 ? 'Select a scene to configure' : 'Create a scene to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
