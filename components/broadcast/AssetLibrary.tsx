'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset, BroadcastSegment } from '@/lib/broadcastTypes'
import { CustomTemplateRecord } from '@/lib/sceneTypes'
import { DATA_DRIVEN_TEMPLATES, type DataDrivenTemplate } from '@/lib/sceneTemplates'
import { getSampleData } from '@/lib/templateBindingSchemas'
import { uploadBroadcastMedia } from '@/lib/uploadMedia'

interface SavedScene {
  id: string
  name: string
  thumbnail_url: string | null
  width: number
  height: number
}

export default function AssetLibrary() {
  const {
    assets, selectedAssetId, setSelectedAssetId, addAsset, removeAsset, updateAsset, project,
    visibleAssetIds, toggleAssetVisibility, session,
    segments, segmentAssets, activeSegmentId, switchingSegment, switchSegment,
    selectedSegmentId, setSelectedSegmentId,
    addSegment, updateSegment, removeSegment,
    addSegmentAsset, removeSegmentAsset, reloadSegmentAssets,
    slideshowPrev, slideshowNext, getSlideshowIndex,
    goLive, endSession,
  } = useBroadcast()

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

  // Segment folder collapse state
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(new Set())

  // Multi-select for grouping
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())

  // Editing segment name
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [segmentNameInput, setSegmentNameInput] = useState('')

  // Drag-and-drop state
  const [dragAssetId, setDragAssetId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null) // segmentId or '__loose__'

  // Go Live state
  const [goingLive, setGoingLive] = useState(false)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  // Delete key handler for selected assets/segments
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (selectedSegmentId) {
        const segment = segments.find(s => s.id === selectedSegmentId)
        if (segment && confirm(`Delete segment "${segment.name}"?`)) {
          handleDeleteSegment(selectedSegmentId)
          setSelectedSegmentId(null)
        }
      } else if (selectedAssetId) {
        handleDelete(selectedAssetId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSegmentId, selectedAssetId, segments])

  // Compute which assets belong to which segment
  const assetToSegment = new Map<string, string>() // assetId → segmentId
  for (const [segmentId, saList] of segmentAssets) {
    for (const sa of saList) {
      assetToSegment.set(sa.asset_id, segmentId)
    }
  }

  const looseAssets = assets.filter(a => !assetToSegment.has(a.id))
  const sortedSegments = [...segments].sort((a, b) => a.sort_order - b.sort_order)

  function toggleCollapse(segmentId: string) {
    setCollapsedSegments(prev => {
      const next = new Set(prev)
      if (next.has(segmentId)) next.delete(segmentId)
      else next.add(segmentId)
      return next
    })
  }

  function handleAssetClick(assetId: string, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      // Multi-select toggle
      setSelectedAssetIds(prev => {
        const next = new Set(prev)
        if (next.has(assetId)) next.delete(assetId)
        else next.add(assetId)
        return next
      })
    } else {
      setSelectedAssetIds(new Set())
      setSelectedAssetId(assetId)
      setSelectedSegmentId(null)
    }
  }

  function handleSegmentHeaderClick(segmentId: string) {
    setSelectedSegmentId(segmentId)
    setSelectedAssetId(null)
    setSelectedAssetIds(new Set())
  }

  // Group selected assets into new segment
  async function handleGroupIntoSegment() {
    if (selectedAssetIds.size < 2 || !project) return
    try {
      const res = await fetch('/api/broadcast/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: `Segment ${segments.length + 1}`,
          sort_order: segments.length,
        }),
      })
      const data = await res.json()
      if (data.scene) {
        addSegment(data.scene)
        // Add each selected asset to the segment
        for (const assetId of selectedAssetIds) {
          const saRes = await fetch('/api/broadcast/scene-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scene_id: data.scene.id, asset_id: assetId }),
          })
          const saData = await saRes.json()
          if (saData.sceneAsset) addSegmentAsset(saData.sceneAsset)
        }
        setSelectedAssetIds(new Set())
        setSelectedSegmentId(data.scene.id)
        setSelectedAssetId(null)
      }
    } catch (err) {
      console.error('Failed to group into segment:', err)
    }
  }

  // Create empty segment
  async function handleAddSegment() {
    if (!project) return
    try {
      const res = await fetch('/api/broadcast/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: `Segment ${segments.length + 1}`,
          sort_order: segments.length,
        }),
      })
      const data = await res.json()
      if (data.scene) {
        addSegment(data.scene)
        setSelectedSegmentId(data.scene.id)
        setSelectedAssetId(null)
      }
    } catch (err) {
      console.error('Failed to create segment:', err)
    }
  }

  // Delete segment
  async function handleDeleteSegment(id: string) {
    try {
      await fetch('/api/broadcast/scenes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      removeSegment(id)
    } catch (err) {
      console.error('Failed to delete segment:', err)
    }
  }

  // Inline rename segment
  function startSegmentRename(segment: BroadcastSegment) {
    setEditingSegmentId(segment.id)
    setSegmentNameInput(segment.name)
  }

  async function finishSegmentRename(id: string) {
    setEditingSegmentId(null)
    if (!segmentNameInput.trim()) return
    try {
      await fetch('/api/broadcast/scenes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: segmentNameInput.trim() }),
      })
      updateSegment(id, { name: segmentNameInput.trim() })
    } catch (err) {
      console.error('Failed to rename segment:', err)
    }
  }

  // Duplicate asset
  async function handleDuplicateAsset(asset: BroadcastAsset) {
    if (!project) return
    try {
      const { id, created_at, updated_at, ...rest } = asset
      const res = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          name: `${asset.name} (Copy)`,
          sort_order: assets.length,
        }),
      })
      const data = await res.json()
      if (data.asset) addAsset(data.asset)
    } catch (err) {
      console.error('Failed to duplicate asset:', err)
    }
  }

  // Duplicate segment + its asset assignments
  async function handleDuplicateSegment(segment: BroadcastSegment) {
    if (!project) return
    try {
      const res = await fetch('/api/broadcast/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: `${segment.name} (Copy)`,
          sort_order: segments.length,
          stinger_video_url: segment.stinger_video_url,
          stinger_storage_path: segment.stinger_storage_path,
          stinger_enabled: segment.stinger_enabled,
          stinger_cut_point: segment.stinger_cut_point,
          transition_override: segment.transition_override,
          hotkey_color: segment.hotkey_color,
        }),
      })
      const data = await res.json()
      if (data.scene) {
        addSegment(data.scene)
        // Copy asset assignments
        const saList = segmentAssets.get(segment.id) || []
        for (const sa of saList) {
          const saRes = await fetch('/api/broadcast/scene-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scene_id: data.scene.id, asset_id: sa.asset_id }),
          })
          const saData = await saRes.json()
          if (saData.sceneAsset) addSegmentAsset(saData.sceneAsset)
        }
      }
    } catch (err) {
      console.error('Failed to duplicate segment:', err)
    }
  }

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
      const isLiveGame = template.inputType === 'live-game'
      const config = { templateId: template.id, ...template.defaultConfig }
      const sampleData = isLiveGame ? [] : getSampleData(template.defaultConfig.primaryStat ? 'leaderboard' : 'generic')
      const builtScene = template.rebuild(config, sampleData)

      const inputSections = isLiveGame
        ? [{
            id: 'main', label: 'Main',
            elementIds: builtScene.elements.filter(e => e.sectionBinding).map(e => e.id),
            enabledInputs: ['playerType', 'season'] as any[],
            globalInputType: 'live-game' as const,
            playerType: template.defaultConfig.playerType || 'pitcher',
            gameYear: template.defaultConfig.dateRange?.type === 'season' ? template.defaultConfig.dateRange.year : 2025,
          }]
        : [{
            id: 'main', label: 'Main',
            elementIds: [],
            enabledInputs: ['playerType', 'season', 'primaryStat', 'secondaryStat', 'tertiaryStat', 'sortDir', 'count', 'minSample', 'pitchType', 'title'],
            playerType: template.defaultConfig.playerType || 'pitcher',
            gameYear: template.defaultConfig.dateRange?.type === 'season' ? template.defaultConfig.dateRange.year : 2025,
          }]

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
    const files = Array.from(e.target.files)

    for (const file of files) {
      const isVideo = file.type.startsWith('video/')
      const assetType = isVideo ? 'video' : 'image'

      try {
        const result = await uploadBroadcastMedia(file, project.id)
        if (!result) continue

        const assetRes = await fetch('/api/broadcast/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: project.id,
            name: file.name.replace(/\.[^.]+$/, ''),
            asset_type: assetType,
            storage_path: result.url,
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

  const adFileInputRef = useRef<HTMLInputElement>(null)

  async function handleAdSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return
    const file = e.target.files[0]
    const blobUrl = URL.createObjectURL(file)
    try {
      const assetRes = await fetch('/api/broadcast/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: file.name.replace(/\.[^.]+$/, ''),
          asset_type: 'advertisement',
          storage_path: blobUrl,
          ad_config: { volume: 1 },
          canvas_width: 1920,
          canvas_height: 1080,
          trigger_mode: 'toggle',
          sort_order: assets.length,
        }),
      })
      const assetData = await assetRes.json()
      if (assetData.asset) {
        // Override storage_path with blob URL for this session
        addAsset({ ...assetData.asset, storage_path: blobUrl })
        setSelectedAssetId(assetData.asset.id)
      }
    } catch (err) {
      console.error('Failed to create ad:', err)
    }
    if (adFileInputRef.current) adFileInputRef.current.value = ''
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
    if (asset.asset_type === 'advertisement') return 'A'
    if (asset.asset_type === 'slideshow') return 'P'
    return 'I'
  }

  // Go live handlers
  async function handleGoLive() {
    setGoingLive(true)
    const sessionId = await goLive()
    if (sessionId) {
      setOverlayUrl(`${window.location.origin}/overlay/${sessionId}`)
    }
    setGoingLive(false)
  }

  async function handleEndSession() {
    await endSession()
    setOverlayUrl(null)
  }

  function copyUrl() {
    if (!overlayUrl) return
    navigator.clipboard.writeText(overlayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Drag-and-drop handlers ───────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, assetId: string) {
    setDragAssetId(assetId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', assetId)
  }

  function handleDragEnd() {
    setDragAssetId(null)
    setDragOverTarget(null)
  }

  function handleDragOverSegment(e: React.DragEvent, segmentId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverTarget !== segmentId) setDragOverTarget(segmentId)
  }

  function handleDragOverLoose(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverTarget !== '__loose__') setDragOverTarget('__loose__')
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the actual target (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverTarget(null)
    }
  }

  async function handleDropOnSegment(e: React.DragEvent, targetSegmentId: string) {
    e.preventDefault()
    setDragOverTarget(null)
    const assetId = e.dataTransfer.getData('text/plain') || dragAssetId
    if (!assetId) return
    setDragAssetId(null)

    const currentSegmentId = assetToSegment.get(assetId)

    // Already in this segment — no-op
    if (currentSegmentId === targetSegmentId) return

    // If currently in another segment, remove from old
    if (currentSegmentId) {
      const oldSaList = segmentAssets.get(currentSegmentId) || []
      const existingSa = oldSaList.find(sa => sa.asset_id === assetId)
      if (existingSa) {
        try {
          await fetch('/api/broadcast/scene-assets', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existingSa.id }),
          })
          removeSegmentAsset(existingSa.id)
        } catch (err) {
          console.error('Failed to remove from old segment:', err)
          return
        }
      }
    }

    // Add to new segment
    try {
      const res = await fetch('/api/broadcast/scene-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: targetSegmentId, asset_id: assetId }),
      })
      const data = await res.json()
      if (data.sceneAsset) addSegmentAsset(data.sceneAsset)
    } catch (err) {
      console.error('Failed to add to segment:', err)
    }
  }

  async function handleDropOnLoose(e: React.DragEvent) {
    e.preventDefault()
    setDragOverTarget(null)
    const assetId = e.dataTransfer.getData('text/plain') || dragAssetId
    if (!assetId) return
    setDragAssetId(null)

    const currentSegmentId = assetToSegment.get(assetId)
    if (!currentSegmentId) return // already loose

    // Remove from segment
    const saList = segmentAssets.get(currentSegmentId) || []
    const existingSa = saList.find(sa => sa.asset_id === assetId)
    if (existingSa) {
      try {
        await fetch('/api/broadcast/scene-assets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existingSa.id }),
        })
        removeSegmentAsset(existingSa.id)
      } catch (err) {
        console.error('Failed to remove from segment:', err)
      }
    }
  }

  // ── Asset row renderer ────────────────────────────────────────────────────

  function renderAssetRow(asset: BroadcastAsset, indent: boolean = false) {
    const isSelected = selectedAssetId === asset.id
    const isMultiSelected = selectedAssetIds.has(asset.id)
    const isVisible = visibleAssetIds.has(asset.id)
    const isSlideshow = asset.asset_type === 'slideshow'
    const slideCount = asset.slideshow_config?.slides?.length || 0
    const isDragging = dragAssetId === asset.id

    return (
      <div
        key={asset.id}
        draggable
        onDragStart={e => handleDragStart(e, asset.id)}
        onDragEnd={handleDragEnd}
        className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-grab active:cursor-grabbing transition ${
          indent ? 'pl-7' : ''
        } ${
          isDragging
            ? 'opacity-40'
            : isSelected
            ? 'bg-red-500/10 border-l-2 border-red-400'
            : isMultiSelected
            ? 'bg-blue-500/10 border-l-2 border-blue-400'
            : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
        } ${!isDragging && !isSelected && !isMultiSelected ? 'border-l-2 border-transparent' : ''}`}
        onClick={e => handleAssetClick(asset.id, e)}
      >
        <div
          className="w-5 h-5 rounded flex items-center justify-center text-[9px] shrink-0"
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
            className="flex-1 text-[11px] text-white bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 outline-none"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-[11px] text-zinc-300 truncate flex-1"
            onDoubleClick={e => {
              e.stopPropagation()
              setEditingId(asset.id)
              setEditValue(asset.name)
            }}
          >
            {asset.name}
          </span>
        )}

        {/* Hotkey badge */}
        {asset.hotkey_key && (
          <span className="text-[8px] font-mono bg-zinc-700 text-zinc-300 px-1 rounded shrink-0">
            {asset.hotkey_key.toUpperCase()}
          </span>
        )}

        {/* Slideshow nav */}
        {isSlideshow && slideCount > 0 && session && (
          <div className="flex items-center gap-0.5">
            <button onClick={e => { e.stopPropagation(); slideshowPrev(asset.id) }} className="text-zinc-500 hover:text-zinc-300">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-[8px] text-zinc-500 font-mono">{getSlideshowIndex(asset.id) + 1}/{slideCount}</span>
            <button onClick={e => { e.stopPropagation(); slideshowNext(asset.id) }} className="text-zinc-500 hover:text-zinc-300">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}

        {/* Visibility toggle */}
        {session && (
          <button
            onClick={e => { e.stopPropagation(); toggleAssetVisibility(asset.id) }}
            className={`shrink-0 transition ${
              isVisible ? 'text-emerald-400' : 'opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300'
            }`}
          >
            {isVisible ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M1 1l22 22" />
              </svg>
            )}
          </button>
        )}

        {/* Duplicate */}
        <button
          onClick={e => { e.stopPropagation(); handleDuplicateAsset(asset) }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition"
          title="Duplicate"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); handleDelete(asset.id) }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // ── Segment folder renderer ───────────────────────────────────────────────

  function renderSegmentFolder(segment: BroadcastSegment) {
    const isCollapsed = collapsedSegments.has(segment.id)
    const isActive = activeSegmentId === segment.id
    const isHeaderSelected = selectedSegmentId === segment.id
    const saList = segmentAssets.get(segment.id) || []
    const segAssetIds = new Set(saList.map(sa => sa.asset_id))
    const segAssets = assets.filter(a => segAssetIds.has(a.id))
    const color = segment.hotkey_color || '#10b981'
    const isDragOver = dragOverTarget === segment.id && dragAssetId != null

    return (
      <div
        key={segment.id}
        onDragOver={e => handleDragOverSegment(e, segment.id)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDropOnSegment(e, segment.id)}
      >
        {/* Segment header */}
        <div
          className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition ${
            isDragOver
              ? 'bg-emerald-500/15 border-l-2 border-emerald-400 ring-1 ring-inset ring-emerald-500/30'
              : isHeaderSelected
              ? 'bg-emerald-500/10 border-l-2 border-emerald-400'
              : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
          }`}
          onClick={() => handleSegmentHeaderClick(segment.id)}
        >
          {/* Collapse toggle */}
          <button
            onClick={e => { e.stopPropagation(); toggleCollapse(segment.id) }}
            className="text-zinc-500 hover:text-zinc-300 shrink-0"
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Folder icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" className="shrink-0">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>

          {/* Active dot */}
          {isActive && (
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          )}

          {/* Name */}
          {editingSegmentId === segment.id ? (
            <input
              autoFocus
              value={segmentNameInput}
              onChange={e => setSegmentNameInput(e.target.value)}
              onBlur={() => finishSegmentRename(segment.id)}
              onKeyDown={e => { if (e.key === 'Enter') finishSegmentRename(segment.id); if (e.key === 'Escape') setEditingSegmentId(null) }}
              className="flex-1 text-[11px] text-white bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-[11px] text-zinc-200 truncate flex-1 font-medium"
              onDoubleClick={e => { e.stopPropagation(); startSegmentRename(segment) }}
            >
              {segment.name}
            </span>
          )}

          {/* Asset count badge */}
          <span className="text-[9px] text-zinc-500 shrink-0">{segAssets.length}</span>

          {/* Hotkey badge */}
          {segment.hotkey_key && (
            <span className="text-[8px] font-mono bg-zinc-700 text-zinc-300 px-1 rounded shrink-0">
              {segment.hotkey_key.toUpperCase()}
            </span>
          )}

          {/* Stinger indicator */}
          {segment.stinger_enabled && (
            <span className="text-[9px] text-amber-400 shrink-0" title="Stinger enabled">S</span>
          )}

          {/* Switch to segment (when live) */}
          {session && !isActive && (
            <button
              onClick={e => { e.stopPropagation(); switchSegment(segment.id) }}
              disabled={switchingSegment}
              className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 bg-emerald-600/30 text-emerald-400 rounded hover:bg-emerald-600/50 transition"
            >
              Go
            </button>
          )}

          {/* Duplicate */}
          <button
            onClick={e => { e.stopPropagation(); handleDuplicateSegment(segment) }}
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition"
            title="Duplicate segment"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); handleDeleteSegment(segment.id) }}
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nested assets */}
        {!isCollapsed && segAssets.map(asset => renderAssetRow(asset, true))}
      </div>
    )
  }

  const allTemplateItems = [
    ...DATA_DRIVEN_TEMPLATES.map(t => ({ type: 'builtin' as const, builtin: t, id: t.id, name: t.name, icon: t.icon, description: t.description, width: t.width, height: t.height, inputCount: 0 })),
    ...customTemplates.map(t => ({ type: 'custom' as const, custom: t, id: t.id, name: t.name, icon: t.icon, description: t.description, width: t.width, height: t.height, inputCount: t.inputSections?.length || 0 })),
  ]

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Assets</h3>
        <button
          onClick={handleAddSegment}
          className="text-[9px] px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded hover:bg-emerald-600/30 transition"
          title="New Segment"
        >
          + Segment
        </button>
      </div>

      {/* Actions */}
      <div className="px-3 py-1.5 flex flex-col gap-1 border-b border-zinc-800">
        <div className="flex gap-1.5">
          <button onClick={() => setShowImport(true)} className="flex-1 px-2 py-1 text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition">
            Import Scene
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition">
            Upload Media
          </button>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setShowTemplateImport(true)} className="flex-1 px-2 py-1 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition">
            Template
          </button>
          <button onClick={createSlideshow} className="flex-1 px-2 py-1 text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/20 transition">
            Slideshow
          </button>
          <button onClick={() => adFileInputRef.current?.click()} className="flex-1 px-2 py-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition">
            Ad
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
        <input ref={adFileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleAdSelect} />
      </div>

      {/* Multi-select action bar */}
      {selectedAssetIds.size >= 2 && (
        <div className="px-3 py-1.5 border-b border-zinc-800 bg-blue-500/5">
          <button
            onClick={handleGroupIntoSegment}
            className="w-full px-2 py-1 text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/20 transition"
          >
            Group {selectedAssetIds.size} into Segment
          </button>
        </div>
      )}

      {/* Asset + Segment Tree */}
      <div className="flex-1 overflow-y-auto">
        {assets.length === 0 && segments.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-600 text-xs">
            No assets yet. Import a scene or upload media.
          </div>
        ) : (
          <div className="py-0.5">
            {/* Loose assets drop zone */}
            <div
              onDragOver={handleDragOverLoose}
              onDragLeave={handleDragLeave}
              onDrop={handleDropOnLoose}
              className={`min-h-[4px] transition-all ${
                dragOverTarget === '__loose__' && dragAssetId
                  ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30 min-h-[24px] flex items-center justify-center'
                  : ''
              }`}
            >
              {dragOverTarget === '__loose__' && dragAssetId && (
                <span className="text-[9px] text-blue-400">Drop here to ungroup</span>
              )}
              {looseAssets.map(asset => renderAssetRow(asset))}
            </div>

            {/* Segment folders */}
            {sortedSegments.map(segment => renderSegmentFolder(segment))}
          </div>
        )}
      </div>

      {/* Triggers section */}
      {segments.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Segments</div>
          <div className="flex flex-wrap gap-1">
            {sortedSegments.map(segment => {
              const isActive = activeSegmentId === segment.id
              const color = segment.hotkey_color || '#10b981'
              return (
                <button
                  key={segment.id}
                  onClick={() => session ? switchSegment(segment.id) : handleSegmentHeaderClick(segment.id)}
                  disabled={session ? switchingSegment || isActive : false}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition border ${
                    isActive
                      ? 'text-white border-transparent'
                      : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  } ${(session && (switchingSegment || isActive)) ? 'opacity-60' : 'cursor-pointer'}`}
                  style={{
                    backgroundColor: isActive ? color + '30' : 'transparent',
                    borderColor: isActive ? color : undefined,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? color : '#52525b' }} />
                  {segment.name}
                  {segment.hotkey_key && (
                    <span className="text-[8px] font-mono bg-zinc-700/60 text-zinc-300 px-0.5 rounded">
                      {segment.hotkey_key.toUpperCase()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Go Live / Session controls */}
      <div className="border-t border-zinc-800 px-3 py-2 space-y-1.5">
        {overlayUrl && (
          <button onClick={copyUrl} className="w-full px-2 py-1 text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition">
            {copied ? 'Copied!' : 'Copy OBS URL'}
          </button>
        )}
        {!session ? (
          <button
            onClick={handleGoLive}
            disabled={goingLive || assets.length === 0}
            className="w-full px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1.5"
          >
            <div className="w-2 h-2 rounded-full bg-white" />
            {goingLive ? 'Starting...' : 'Go Live'}
          </button>
        ) : (
          <button
            onClick={handleEndSession}
            className="w-full px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1.5"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            End Session
          </button>
        )}
      </div>

      {/* Import Scene Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowImport(false)}>
          <div className="w-[600px] max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Import Scene</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Select a scene to import as a broadcast asset</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-zinc-500 hover:text-zinc-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingScenes ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-zinc-700 border-t-red-400 rounded-full animate-spin" /></div>
              ) : scenes.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">No saved scenes found</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {scenes.map(scene => (
                    <button key={scene.id} onClick={() => importScene(scene.id, scene.name)} disabled={importing === scene.id} className="bg-zinc-800 border border-zinc-700 hover:border-red-500/40 rounded-lg p-3 text-left transition disabled:opacity-50">
                      {scene.thumbnail_url ? (
                        <img src={scene.thumbnail_url} alt={scene.name} className="w-full h-24 object-cover rounded mb-2 bg-zinc-900" />
                      ) : (
                        <div className="w-full h-24 bg-zinc-900 rounded mb-2 flex items-center justify-center text-zinc-600 text-2xl">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
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
          <div className="w-[600px] max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Import Template</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Select a data-driven template for dynamic broadcast use</p>
              </div>
              <button onClick={() => setShowTemplateImport(false)} className="text-zinc-500 hover:text-zinc-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingTemplates ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" /></div>
              ) : allTemplateItems.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">No templates available</div>
              ) : (
                <div className="space-y-4">
                  {DATA_DRIVEN_TEMPLATES.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-emerald-500 font-medium mb-2">Built-in Templates</div>
                      <div className="grid grid-cols-2 gap-3">
                        {DATA_DRIVEN_TEMPLATES.map(t => (
                          <button key={t.id} onClick={() => importBuiltinTemplate(t)} disabled={importing === t.id} className="bg-zinc-800 border border-zinc-700 hover:border-emerald-500/40 rounded-lg p-3 text-left transition disabled:opacity-50">
                            <div className="w-full h-20 bg-zinc-900 rounded mb-2 flex items-center justify-center text-2xl">{t.icon}</div>
                            <div className="text-xs font-medium text-white truncate">{t.name}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{t.width}x{t.height}</div>
                            {t.description && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{t.description}</div>}
                            {importing === t.id && <div className="text-[10px] text-amber-400 mt-1">Importing...</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {customTemplates.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-amber-500 font-medium mb-2">Custom Templates</div>
                      <div className="grid grid-cols-2 gap-3">
                        {customTemplates.map(t => (
                          <button key={t.id} onClick={() => importCustomTemplate(t)} disabled={importing === t.id} className="bg-zinc-800 border border-zinc-700 hover:border-amber-500/40 rounded-lg p-3 text-left transition disabled:opacity-50">
                            <div className="w-full h-20 bg-zinc-900 rounded mb-2 flex items-center justify-center text-2xl">{t.icon || '\u26A1'}</div>
                            <div className="text-xs font-medium text-white truncate">{t.name}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {t.width}x{t.height}
                              {t.inputSections && t.inputSections.length > 0 && <span className="ml-1 text-amber-500">{t.inputSections.length} input{t.inputSections.length > 1 ? 's' : ''}</span>}
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
