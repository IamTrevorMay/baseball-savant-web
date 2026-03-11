'use client'

import { useState, useRef } from 'react'
import { BroadcastAsset, SlideshowSlide, SlideshowConfig, SLIDESHOW_TRANSITIONS, SlideshowTransitionType } from '@/lib/broadcastTypes'
import { useBroadcast } from './BroadcastContext'
import { uploadBroadcastMedia } from '@/lib/uploadMedia'

interface Props {
  asset: BroadcastAsset
}

export default function SlideshowEditor({ asset }: Props) {
  const { updateAsset } = useBroadcast()
  const [uploading, setUploading] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [selectedTransitionIdx, setSelectedTransitionIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const config: SlideshowConfig = asset.slideshow_config || { slides: [], fit: 'contain' }
  const slides = config.slides || []

  const hasAnyTransition = (config.transition && config.transition !== 'none') ||
    slides.some(s => s.transition && s.transition !== 'none')

  function persistConfig(newConfig: SlideshowConfig) {
    updateAsset(asset.id, { slideshow_config: newConfig })
    fetch('/api/broadcast/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id, slideshow_config: newConfig }),
    }).catch(console.error)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    setUploading(true)
    const newSlides = [...slides]

    for (const file of Array.from(e.target.files)) {
      try {
        const result = await uploadBroadcastMedia(file, asset.project_id)
        if (!result) continue

        const isVideo = file.type.startsWith('video/')
        const slide: SlideshowSlide = {
          id: crypto.randomUUID(),
          storage_path: result.url,
          name: file.name.replace(/\.[^.]+$/, ''),
          type: isVideo ? 'video' : 'image',
        }
        newSlides.push(slide)
      } catch (err) {
        console.error('Failed to upload slide:', err)
      }
    }

    persistConfig({ ...config, slides: newSlides })
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeSlide(index: number) {
    const newSlides = slides.filter((_, i) => i !== index)
    persistConfig({ ...config, slides: newSlides })
    if (selectedTransitionIdx === index) setSelectedTransitionIdx(null)
  }

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const newSlides = [...slides]
    const [moved] = newSlides.splice(dragIndex, 1)
    newSlides.splice(index, 0, moved)
    persistConfig({ ...config, slides: newSlides })
    setDragIndex(null)
    setDragOverIndex(null)
    setSelectedTransitionIdx(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  function setFit(fit: 'cover' | 'contain') {
    persistConfig({ ...config, fit })
  }

  // ── Transition handlers ──────────────────────────────────────────────────

  function handleAddTransitions() {
    const globalType: SlideshowTransitionType = 'crossfade'
    const newSlides = slides.map(s => ({ ...s, transition: undefined }))
    persistConfig({ ...config, slides: newSlides, transition: globalType, transitionDuration: config.transitionDuration || 500 })
  }

  function handleRemoveTransitions() {
    const newSlides = slides.map(s => {
      const { transition, ...rest } = s
      return rest
    })
    persistConfig({ ...config, slides: newSlides, transition: undefined, transitionDuration: undefined })
    setSelectedTransitionIdx(null)
  }

  function updateSlideTransition(slideIndex: number, type: SlideshowTransitionType) {
    const newSlides = slides.map((s, i) =>
      i === slideIndex ? { ...s, transition: type === config.transition ? undefined : type } : s
    )
    persistConfig({ ...config, slides: newSlides })
  }

  function getEffectiveTransition(slide: SlideshowSlide): SlideshowTransitionType {
    return slide.transition || config.transition || 'none'
  }

  function handleApplyToAll() {
    if (selectedTransitionIdx === null) return
    const type = getEffectiveTransition(slides[selectedTransitionIdx])
    const newSlides = slides.map(s => ({ ...s, transition: undefined }))
    persistConfig({ ...config, slides: newSlides, transition: type })
    setSelectedTransitionIdx(null)
  }

  function handleDurationChange(ms: number) {
    persistConfig({ ...config, transitionDuration: Math.max(100, Math.min(2000, ms)) })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="border-b border-zinc-800">
      <div className="px-4 py-3">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Slideshow</label>

        {/* Upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mt-2 w-full px-3 py-2 text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 border-dashed rounded hover:bg-purple-500/20 transition disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Add Slides'}
        </button>

        {/* Add/Remove Transitions */}
        {slides.length >= 2 && (
          hasAnyTransition ? (
            <button
              onClick={handleRemoveTransitions}
              className="mt-1.5 w-full px-3 py-1.5 text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 hover:text-zinc-300 transition"
            >
              Remove Transitions
            </button>
          ) : (
            <button
              onClick={handleAddTransitions}
              className="mt-1.5 w-full px-3 py-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition"
            >
              Add Transition
            </button>
          )
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/avif,image/webp,video/mp4,video/quicktime"
          className="hidden"
          onChange={handleUpload}
        />

        {/* Slide list with transition rows */}
        {slides.length > 0 && (
          <div className="mt-3 space-y-0.5">
            {slides.map((slide, i) => (
              <div key={slide.id}>
                {/* Transition row (between slides) */}
                {i > 0 && hasAnyTransition && (
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 my-0.5 rounded border border-dashed cursor-pointer transition ${
                      selectedTransitionIdx === i
                        ? 'border-amber-500/50 bg-amber-500/10'
                        : 'border-zinc-700/40 bg-zinc-800/20 hover:bg-zinc-800/50'
                    }`}
                    onClick={() => setSelectedTransitionIdx(selectedTransitionIdx === i ? null : i)}
                  >
                    {/* Transition icon */}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400/60 shrink-0">
                      <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                    </svg>

                    <select
                      value={getEffectiveTransition(slide)}
                      onChange={e => {
                        e.stopPropagation()
                        updateSlideTransition(i, e.target.value as SlideshowTransitionType)
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-transparent text-[10px] text-zinc-300 outline-none cursor-pointer appearance-none"
                    >
                      {SLIDESHOW_TRANSITIONS.map(t => (
                        <option key={t.id} value={t.id} className="bg-zinc-800">{t.name}</option>
                      ))}
                    </select>

                    {slide.transition && slide.transition !== config.transition && (
                      <span className="text-[8px] text-amber-400/60 shrink-0">custom</span>
                    )}
                  </div>
                )}

                {/* Slide row */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded border transition cursor-grab active:cursor-grabbing ${
                    dragOverIndex === i
                      ? 'border-purple-500/50 bg-purple-500/10'
                      : 'border-zinc-800 bg-zinc-800/50 hover:bg-zinc-800'
                  }`}
                >
                  {/* Drag handle */}
                  <div className="text-zinc-600 shrink-0 cursor-grab">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="8" cy="6" r="2" /><circle cx="16" cy="6" r="2" />
                      <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
                      <circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" />
                    </svg>
                  </div>

                  {/* Thumbnail */}
                  {slide.type === 'image' ? (
                    <img
                      src={slide.storage_path}
                      alt={slide.name}
                      className="w-10 h-7 object-cover rounded shrink-0 bg-zinc-900"
                    />
                  ) : (
                    <div className="w-10 h-7 rounded shrink-0 bg-zinc-900 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  )}

                  {/* Name */}
                  <span className="text-[10px] text-zinc-400 truncate flex-1">{slide.name}</span>

                  {/* Index */}
                  <span className="text-[9px] text-zinc-600 shrink-0">{i + 1}</span>

                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); removeSlide(i) }}
                    className="text-zinc-600 hover:text-red-400 shrink-0 transition"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {slides.length === 0 && (
          <div className="mt-3 text-[10px] text-zinc-600 text-center py-4">
            No slides yet. Upload images or videos.
          </div>
        )}

        {/* Transition duration */}
        {hasAnyTransition && (
          <div className="mt-3">
            <label className="text-[9px] text-zinc-600">Transition Duration</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={config.transitionDuration || 500}
                onChange={e => handleDurationChange(Number(e.target.value))}
                className="flex-1 h-1 accent-amber-500"
              />
              <span className="text-[9px] text-zinc-500 font-mono w-10 text-right">
                {config.transitionDuration || 500}ms
              </span>
            </div>
          </div>
        )}

        {/* Fit selector */}
        <div className="mt-3">
          <label className="text-[9px] text-zinc-600">Object Fit</label>
          <div className="flex bg-zinc-800 rounded overflow-hidden border border-zinc-700 mt-1">
            <button
              onClick={() => setFit('contain')}
              className={`flex-1 px-2 py-1 text-[10px] font-medium transition ${
                config.fit === 'contain' ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Contain
            </button>
            <button
              onClick={() => setFit('cover')}
              className={`flex-1 px-2 py-1 text-[10px] font-medium transition ${
                config.fit === 'cover' ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Cover
            </button>
          </div>
        </div>

        {/* Slide count */}
        {slides.length > 0 && (
          <div className="mt-2 text-[9px] text-zinc-600">
            {slides.length} slide{slides.length !== 1 ? 's' : ''} ({slides.filter(s => s.type === 'image').length} images, {slides.filter(s => s.type === 'video').length} videos)
          </div>
        )}

        {/* Apply to All */}
        {selectedTransitionIdx !== null && hasAnyTransition && (
          <button
            onClick={handleApplyToAll}
            className="mt-2 w-full px-3 py-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition"
          >
            Apply &ldquo;{SLIDESHOW_TRANSITIONS.find(t => t.id === getEffectiveTransition(slides[selectedTransitionIdx]))?.name}&rdquo; to All
          </button>
        )}
      </div>
    </div>
  )
}
