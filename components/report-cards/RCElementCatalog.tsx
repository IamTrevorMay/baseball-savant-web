'use client'

import { useEffect, useState } from 'react'
import { ElementType } from '@/lib/sceneTypes'
import { RC_ELEMENT_CATALOG, RC_LAYOUT_CATALOG } from '@/lib/reportCardDefaults'

interface Template {
  id: string
  name: string
  width: number
  height: number
  background: string
  elements: any[]
  updated_at: string
}

interface Props {
  onAddElement: (type: ElementType) => void
  onLoadTemplate?: (t: Template) => void
  activeTemplateId?: string | null
  onRenameTemplate?: (id: string, newName: string) => void
}

export default function RCElementCatalog({ onAddElement, onLoadTemplate, activeTemplateId, onRenameTemplate }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    fetch('/api/report-card-templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Refresh list when the active template changes (i.e. after a save)
  useEffect(() => {
    if (!activeTemplateId) return
    fetch('/api/report-card-templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
  }, [activeTemplateId])

  const handleRenameSubmit = async (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingId(null); return }
    try {
      await fetch(`/api/report-card-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t))
      onRenameTemplate?.(id, trimmed)
    } catch { /* ignore */ }
    setRenamingId(null)
  }

  return (
    <div className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex flex-col">
      {/* Data Objects */}
      <div className="p-3 border-b border-zinc-800">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Data Objects</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {RC_ELEMENT_CATALOG.map(item => (
            <button
              key={item.type}
              onClick={() => onAddElement(item.type)}
              className="
                text-left p-2 rounded-lg
                bg-zinc-800/50 border border-zinc-700/50
                hover:border-cyan-500/40 hover:bg-zinc-800
                transition text-xs group
              "
            >
              <span className="text-base block mb-0.5 text-zinc-400 group-hover:text-cyan-400 transition">{item.icon}</span>
              <span className="font-medium text-zinc-300 block leading-tight">{item.name}</span>
              <span className="text-[10px] text-zinc-600 block mt-0.5">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Layout Elements */}
      <div className="p-3 border-b border-zinc-800">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Layout</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {RC_LAYOUT_CATALOG.map(item => (
            <button
              key={item.type}
              onClick={() => onAddElement(item.type)}
              className="
                text-left p-2 rounded-lg
                bg-zinc-800/50 border border-zinc-700/50
                hover:border-zinc-600 hover:bg-zinc-800
                transition text-xs group
              "
            >
              <span className="text-base block mb-0.5 text-zinc-500">{item.icon}</span>
              <span className="font-medium text-zinc-400 block leading-tight">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Saved Templates */}
      <div className="p-3 flex-1 min-h-0">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Saved Templates</h3>
        {loading ? (
          <div className="text-[10px] text-zinc-600 py-4 text-center">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="text-[10px] text-zinc-600 py-4 text-center">No saved templates</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => onLoadTemplate?.(t)}
                className={`text-left rounded-lg overflow-hidden border transition ${
                  activeTemplateId === t.id
                    ? 'border-cyan-500/60 bg-cyan-500/5'
                    : 'border-zinc-700/50 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
                }`}
              >
                {/* Thumbnail preview */}
                <div
                  className="w-full relative overflow-hidden"
                  style={{
                    aspectRatio: `${t.width}/${t.height}`,
                    maxHeight: '80px',
                    background: t.background || '#09090b',
                  }}
                >
                  {/* Mini element preview */}
                  <div className="absolute inset-0" style={{ transform: `scale(${Math.min(224 / t.width, 80 / t.height)})`, transformOrigin: 'top left' }}>
                    {(t.elements || []).map((el: any, i: number) => (
                      <div
                        key={el.id || i}
                        className="absolute rounded-sm"
                        style={{
                          left: el.x,
                          top: el.y,
                          width: el.width,
                          height: el.height,
                          background: el.type === 'text' || el.type === 'player-image'
                            ? 'transparent'
                            : (el.fill || el.background || 'rgba(255,255,255,0.08)'),
                          border: el.type === 'text' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>
                </div>
                {/* Name */}
                <div className="px-2 py-1.5">
                  {renamingId === t.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(t.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameSubmit(t.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-[11px] font-medium text-zinc-200 bg-zinc-800 border border-cyan-500/50 rounded px-1 py-0.5 outline-none"
                    />
                  ) : (
                    <div
                      className="text-[11px] font-medium text-zinc-300 truncate cursor-text"
                      onDoubleClick={e => {
                        e.stopPropagation()
                        setRenamingId(t.id)
                        setRenameValue(t.name)
                      }}
                    >
                      {t.name}
                    </div>
                  )}
                  <div className="text-[9px] text-zinc-600">{t.width}×{t.height}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
