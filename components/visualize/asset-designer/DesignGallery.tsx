'use client'

import { useState, useEffect } from 'react'
import { Scene } from '@/lib/sceneTypes'

interface SavedDesign {
  id: string
  name: string
  type: string
  config: Scene
  created_at: string
}

interface Props {
  onOpen: (design: SavedDesign) => void
  onNew: () => void
  onClose?: () => void
}

export default function DesignGallery({ onOpen, onNew, onClose }: Props) {
  const [designs, setDesigns] = useState<SavedDesign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchDesigns()
  }, [])

  async function fetchDesigns() {
    try {
      const res = await fetch('/api/scene-assets?type=design')
      const data = await res.json()
      setDesigns(data.assets || [])
    } catch (err) {
      console.error('Failed to load designs:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/scene-assets?id=${id}`, { method: 'DELETE' })
      setDesigns(prev => prev.filter(d => d.id !== id))
    } catch (err) {
      console.error('Failed to delete design:', err)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = search
    ? designs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : designs

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Saved Designs</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">{designs.length} design{designs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 transition">
              Cancel
            </button>
          )}
          <button
            onClick={onNew}
            className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-[11px] font-medium text-white transition"
          >
            + New Design
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3">
        <input
          type="text"
          placeholder="Search designs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 outline-none"
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <div className="text-3xl mb-2">{'\u25a1'}</div>
            <p className="text-sm">{search ? 'No designs match your search' : 'No saved designs yet'}</p>
            <button onClick={onNew} className="mt-3 text-[11px] text-violet-400 hover:text-violet-300 transition">
              Create your first design
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(d => (
              <div
                key={d.id}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-violet-600/40 transition cursor-pointer"
                onClick={() => onOpen(d)}
              >
                {/* Preview */}
                <div className="aspect-video bg-zinc-800 flex items-center justify-center overflow-hidden">
                  <div className="text-zinc-600 text-2xl">{'\u25a3'}</div>
                </div>
                {/* Info */}
                <div className="p-3">
                  <div className="text-[12px] font-medium text-zinc-200 truncate group-hover:text-violet-300 transition">
                    {d.name}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    {new Date(d.created_at).toLocaleDateString()}
                    {d.config?.width && d.config?.height && (
                      <span className="ml-2">{d.config.width}&times;{d.config.height}</span>
                    )}
                  </div>
                  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={e => { e.stopPropagation(); onOpen(d) }}
                      className="flex-1 px-2 py-1 rounded bg-violet-600/20 border border-violet-600/30 text-[10px] text-violet-300 hover:bg-violet-600/30 transition"
                    >
                      Open
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(d.id) }}
                      disabled={deleting === d.id}
                      className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-500 hover:text-red-400 hover:border-red-600/30 transition disabled:opacity-50"
                    >
                      {deleting === d.id ? '...' : '\u2715'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
