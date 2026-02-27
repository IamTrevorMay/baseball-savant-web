'use client'

import { useState, useEffect } from 'react'

interface SavedScene {
  id: string
  name: string
  thumbnail_url: string | null
  width: number
  height: number
  updated_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  onLoad: (id: string) => void
  onNew: () => void
}

export default function SceneGallery({ open, onClose, onLoad, onNew }: Props) {
  const [scenes, setScenes] = useState<SavedScene[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/scenes')
      .then(r => r.json())
      .then(d => setScenes(d.scenes || []))
      .catch(() => setScenes([]))
      .finally(() => setLoading(false))
  }, [open])

  async function handleDelete(id: string) {
    await fetch(`/api/scenes/${id}`, { method: 'DELETE' })
    setScenes(prev => prev.filter(s => s.id !== id))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[720px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Scene Gallery</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">{scenes.length} saved scene{scenes.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNew}
              className="px-3 py-1.5 rounded bg-cyan-600/20 border border-cyan-600/50 text-[11px] font-medium text-cyan-300 hover:bg-cyan-600/30 transition"
            >
              + New Scene
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-lg px-1">{'\u2715'}</button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : scenes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-zinc-600 text-3xl mb-3">{'\u25a1'}</div>
              <p className="text-sm text-zinc-500">No saved scenes yet</p>
              <p className="text-[11px] text-zinc-600 mt-1">Save your current scene to see it here</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {scenes.map(s => (
                <div
                  key={s.id}
                  className="group bg-zinc-800/50 border border-zinc-700/50 rounded-lg overflow-hidden hover:border-cyan-600/40 transition cursor-pointer"
                  onClick={() => onLoad(s.id)}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-zinc-800 flex items-center justify-center">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-zinc-600 text-2xl">{'\u25a1'}</div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-zinc-200 truncate group-hover:text-white transition">{s.name}</div>
                      <div className="text-[10px] text-zinc-600">{s.width}{'\u00d7'}{s.height}</div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-[10px] transition px-1"
                      title="Delete"
                    >
                      {'\u2715'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
