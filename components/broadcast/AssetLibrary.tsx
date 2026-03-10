'use client'

import { useState, useEffect, useRef } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { CustomTemplateRecord } from '@/lib/sceneTypes'
import { DATA_DRIVEN_TEMPLATES, type DataDrivenTemplate } from '@/lib/sceneTemplates'
import { getSampleData } from '@/lib/templateBindingSchemas'

interface SavedScene {
  id: string
  name: string
  thumbnail_url: string | null
  width: number
  height: number
}

export default function AssetLibrary() {
  const { assets, selectedAssetId, setSelectedAssetId, addAsset, removeAsset, updateAsset, project, visibleAssetIds, toggleAssetVisibility, session } = useBroadcast()
  const [showImport, setShowImport] = useState(false)
  const [showTemplateImport, setShowTemplateImport] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [scenes, setScenes] = useState<SavedScene[]>([])
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRecord[]>([])
  const [loadingScenes, setLoadingScenes] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
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

  useEffect(() => {
    if (!showTemplateImport) return
    setLoadingTemplates(true)
    fetch('/api/custom-templates')
      .then(r => r.json())
      .then(d => setCustomTemplates(d.templates || []))
      .catch(() => setCustomTemplates([]))
      .finally(() => setLoadingTemplates(false))
  }, [showTemplateImport])

  async function importScene(sceneId: string, sceneName: string) {
    if (!project) return
    setImporting(sceneId)
    try {
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

  async function importCustomTemplate(template: CustomTemplateRecord) {
    if (!project) return
    setImporting(template.id)
    try {
      const assetRes = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: template.name,
          asset_type: 'scene',
          template_id: template.id,
          template_data: { sections: {} },
          scene_config: {
            width: template.width || 1920,
            height: template.height || 1080,
            background: template.background || '#09090b',
            elements: template.elements || [],
          },
          canvas_width: template.width || 1920,
          canvas_height: template.height || 1080,
          sort_order: assets.length,
        }),
      })
      const assetData = await assetRes.json()
      if (assetData.asset) {
        addAsset(assetData.asset)
        setShowTemplateImport(false)
      }
    } catch (err) {
      console.error('Failed to import template:', err)
    } finally {
      setImporting(null)
    }
  }

  async function importBuiltinTemplate(template: DataDrivenTemplate) {
    if (!project) return
    setImporting(template.id)
    try {
      // Detect if this is a live-game template
      const isLiveGame = template.inputType === 'live-game'

      // Build the scene with sample data to get elements
      const config = { templateId: template.id, ...template.defaultConfig }
      const sampleData = isLiveGame ? [] : getSampleData(template.defaultConfig.primaryStat ? 'leaderboard' : 'generic')
      const builtScene = template.rebuild(config, sampleData)

      // Build input sections based on template type
      const inputSections = isLiveGame
        ? [{
            id: 'main',
            label: 'Main',
            elementIds: builtScene.elements.filter(e => e.sectionBinding).map(e => e.id),
            enabledInputs: ['playerType', 'season'] as any[],
            globalInputType: 'live-game' as const,
            playerType: template.defaultConfig.playerType || 'pitcher',
            gameYear: template.defaultConfig.dateRange?.type === 'season' ? template.defaultConfig.dateRange.year : 2025,
          }]
        : [{
            id: 'main',
            label: 'Main',
            elementIds: [],
            enabledInputs: ['playerType', 'season', 'primaryStat', 'secondaryStat', 'tertiaryStat', 'sortDir', 'count', 'minSample', 'pitchType', 'title'],
            playerType: template.defaultConfig.playerType || 'pitcher',
            gameYear: template.defaultConfig.dateRange?.type === 'season' ? template.defaultConfig.dateRange.year : 2025,
          }]

      // Auto-save as a custom template so we get a DB ID for linking
      const saveRes = await fetch('/api/custom-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          category: template.category,
          icon: template.icon,
          width: template.width,
          height: template.height,
          background: builtScene.background,
          elements: builtScene.elements,
          schemaType: isLiveGame ? 'generic' : 'leaderboard',
          inputSections,
          base_template_id: template.id,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveData.id) throw new Error('Failed to save template')

      // Create broadcast asset linked to the saved template
      const assetRes = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: template.name,
          asset_type: 'scene',
          template_id: saveData.id,
          template_data: { sections: {} },
          scene_config: {
            width: template.width,
            height: template.height,
            background: builtScene.background,
            elements: builtScene.elements,
          },
          canvas_width: template.width,
          canvas_height: template.height,
          sort_order: assets.length,
        }),
      })
      const assetData = await assetRes.json()
      if (assetData.asset) {
        addAsset(assetData.asset)
        setShowTemplateImport(false)
      }
    } catch (err) {
      console.error('Failed to import built-in template:', err)
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
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', project.id)

      const res = await fetch('/api/broadcast/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!data.url) return

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

  async function createSlideshow() {
    if (!project) return
    try {
      const assetRes = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: 'New Slideshow',
          asset_type: 'slideshow',
          slideshow_config: { slides: [], fit: 'contain' },
          canvas_width: 1920,
          canvas_height: 1080,
          sort_order: assets.length,
        }),
      })
      const assetData = await assetRes.json()
      if (assetData.asset) {
        addAsset(assetData.asset)
        setSelectedAssetId(assetData.asset.id)
      }
    } catch (err) {
      console.error('Failed to create slideshow:', err)
    }
  }

  function getAssetIcon(asset: BroadcastAsset) {
    if (asset.template_id) return '\u26A1'
    if (asset.asset_type === 'scene') return 'S'
    if (asset.asset_type === 'video') return 'V'
    if (asset.asset_type === 'slideshow') return 'P'
    return 'I'
  }

  const allTemplateItems = [
    ...DATA_DRIVEN_TEMPLATES.map(t => ({ type: 'builtin' as const, builtin: t, id: t.id, name: t.name, icon: t.icon, description: t.description, width: t.width, height: t.height, inputCount: 0 })),
    ...customTemplates.map(t => ({ type: 'custom' as const, custom: t, id: t.id, name: t.name, icon: t.icon, description: t.description, width: t.width, height: t.height, inputCount: t.inputSections?.length || 0 })),
  ]

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Asset Library</h3>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 flex flex-col gap-1.5 border-b border-zinc-800">
        <div className="flex gap-2">
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
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplateImport(true)}
            className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition"
          >
            Import Template
          </button>
          <button
            onClick={createSlideshow}
            className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/20 transition"
          >
            New Slideshow
          </button>
        </div>
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
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-[10px] shrink-0"
                  style={{ backgroundColor: asset.hotkey_color + '20', color: asset.hotkey_color }}
                >
                  {getAssetIcon(asset)}
                </div>

                {editingId === asset.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => {
                      if (editValue.trim() && editValue !== asset.name) {
                        updateAsset(asset.id, { name: editValue.trim() })
                        fetch('/api/broadcast/assets', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: asset.id, name: editValue.trim() }),
                        }).catch(console.error)
                      }
                      setEditingId(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="flex-1 text-xs text-white bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="text-xs text-zinc-300 truncate flex-1"
                    onDoubleClick={e => {
                      e.stopPropagation()
                      setEditingId(asset.id)
                      setEditValue(asset.name)
                    }}
                  >
                    {asset.name}
                  </span>
                )}

                {/* Visibility toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggleAssetVisibility(asset.id) }}
                  className={`shrink-0 transition ${
                    visibleAssetIds.has(asset.id)
                      ? 'opacity-100 text-emerald-400'
                      : 'opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300'
                  }`}
                  title={visibleAssetIds.has(asset.id) ? 'Hide' : 'Show'}
                >
                  {visibleAssetIds.has(asset.id) ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <path d="M1 1l22 22" />
                    </svg>
                  )}
                </button>

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

      {/* Import Scene Modal */}
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

      {/* Import Template Modal */}
      {showTemplateImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTemplateImport(false)}>
          <div
            className="w-[600px] max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Import Template</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Select a data-driven template for dynamic broadcast use</p>
              </div>
              <button onClick={() => setShowTemplateImport(false)} className="text-zinc-500 hover:text-zinc-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingTemplates ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
                </div>
              ) : allTemplateItems.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">No templates available</div>
              ) : (
                <div className="space-y-4">
                  {/* Built-in Templates */}
                  {DATA_DRIVEN_TEMPLATES.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-emerald-500 font-medium mb-2">Built-in Templates</div>
                      <div className="grid grid-cols-2 gap-3">
                        {DATA_DRIVEN_TEMPLATES.map(t => (
                          <button
                            key={t.id}
                            onClick={() => importBuiltinTemplate(t)}
                            disabled={importing === t.id}
                            className="bg-zinc-800 border border-zinc-700 hover:border-emerald-500/40 rounded-lg p-3 text-left transition disabled:opacity-50"
                          >
                            <div className="w-full h-20 bg-zinc-900 rounded mb-2 flex items-center justify-center text-2xl">
                              {t.icon}
                            </div>
                            <div className="text-xs font-medium text-white truncate">{t.name}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{t.width}x{t.height}</div>
                            {t.description && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{t.description}</div>}
                            {importing === t.id && <div className="text-[10px] text-amber-400 mt-1">Importing...</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Templates (from DB) */}
                  {customTemplates.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-amber-500 font-medium mb-2">Custom Templates</div>
                      <div className="grid grid-cols-2 gap-3">
                        {customTemplates.map(t => (
                          <button
                            key={t.id}
                            onClick={() => importCustomTemplate(t)}
                            disabled={importing === t.id}
                            className="bg-zinc-800 border border-zinc-700 hover:border-amber-500/40 rounded-lg p-3 text-left transition disabled:opacity-50"
                          >
                            <div className="w-full h-20 bg-zinc-900 rounded mb-2 flex items-center justify-center text-2xl">
                              {t.icon || '\u26A1'}
                            </div>
                            <div className="text-xs font-medium text-white truncate">{t.name}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {t.width}x{t.height}
                              {t.inputSections && t.inputSections.length > 0 && (
                                <span className="ml-1 text-amber-500">{t.inputSections.length} input{t.inputSections.length > 1 ? 's' : ''}</span>
                              )}
                            </div>
                            {t.description && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{t.description}</div>}
                            {importing === t.id && <div className="text-[10px] text-amber-400 mt-1">Importing...</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
