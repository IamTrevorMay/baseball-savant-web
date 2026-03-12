'use client'

import { useState, useEffect, useCallback } from 'react'
import { SceneElement } from '@/lib/sceneTypes'

interface Symbol {
  id: string
  name: string
  elements: SceneElement[]
  created_at: string
}

interface Props {
  onInsert: (elements: SceneElement[]) => void
  selectedElements: SceneElement[]
  onClose: () => void
}

export default function AssetLibraryPanel({ onInsert, selectedElements, onClose }: Props) {
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  // Load symbols
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/scene-assets?type=symbol')
        if (res.ok) {
          const data = await res.json()
          setSymbols(data.assets || [])
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  // Save selection as symbol
  const handleSave = useCallback(async () => {
    if (!saveName.trim() || selectedElements.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/scene-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          type: 'symbol',
          config: { elements: selectedElements },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSymbols(prev => [...prev, {
          id: data.id,
          name: saveName.trim(),
          elements: selectedElements,
          created_at: new Date().toISOString(),
        }])
        setSaveName('')
      }
    } catch {}
    setSaving(false)
  }, [saveName, selectedElements])

  // Delete symbol
  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch('/api/scene-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setSymbols(prev => prev.filter(s => s.id !== id))
    } catch {}
  }, [])

  // Insert symbol copy
  const handleInsert = useCallback((symbol: Symbol) => {
    const newElements = symbol.elements.map(el => ({
      ...el,
      id: Math.random().toString(36).slice(2, 10),
      props: { ...el.props },
    }))
    onInsert(newElements)
  }, [onInsert])

  const filtered = symbols.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="text-sm font-medium text-zinc-200">Asset Library</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">{'\u2715'}</button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Search */}
          <input
            type="text"
            placeholder="Search symbols..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-zinc-200 focus:border-violet-600 outline-none"
          />

          {/* Save selection */}
          {selectedElements.length > 0 && (
            <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                Save selection as symbol ({selectedElements.length} element{selectedElements.length !== 1 ? 's' : ''})
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Symbol name..."
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:border-violet-600 outline-none"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !saveName.trim()}
                  className="px-3 py-1.5 rounded bg-violet-600/20 border border-violet-600/40 text-[11px] font-medium text-violet-300 hover:bg-violet-600/30 transition disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Symbol grid */}
          {loading ? (
            <div className="text-center text-zinc-500 text-[11px] py-8">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-zinc-600 text-[11px] py-8">
              {search ? 'No symbols match your search' : 'No saved symbols yet'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filtered.map(sym => (
                <div
                  key={sym.id}
                  className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2 hover:border-violet-600/40 transition group cursor-pointer"
                  onClick={() => handleInsert(sym)}
                >
                  <div className="text-[11px] text-zinc-300 truncate">{sym.name}</div>
                  <div className="text-[9px] text-zinc-600 mt-0.5">
                    {sym.elements.length} element{sym.elements.length !== 1 ? 's' : ''}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(sym.id) }}
                    className="hidden group-hover:block text-[9px] text-red-500 hover:text-red-400 mt-1"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
