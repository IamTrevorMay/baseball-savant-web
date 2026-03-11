'use client'

import { useState, useRef, useCallback } from 'react'
import { BroadcastAsset, SlideshowSlide, SlideshowConfig } from '@/lib/broadcastTypes'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const config: SlideshowConfig = asset.slideshow_config || { slides: [], fit: 'contain' }
  const slides = config.slides || []

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
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  function setFit(fit: 'cover' | 'contain') {
    persistConfig({ ...config, fit })
  }

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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/avif,image/webp,video/mp4,video/quicktime"
          className="hidden"
          onChange={handleUpload}
        />

        {/* Slide list */}
        {slides.length > 0 && (
          <div className="mt-3 space-y-1">
            {slides.map((slide, i) => (
              <div
                key={slide.id}
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
            ))}
          </div>
        )}

        {slides.length === 0 && (
          <div className="mt-3 text-[10px] text-zinc-600 text-center py-4">
            No slides yet. Upload images or videos.
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
      </div>
    </div>
  )
}
