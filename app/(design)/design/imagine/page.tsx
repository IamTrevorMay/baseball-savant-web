'use client'

/**
 * Imagine — three-pane visualization tool.
 *   Left:   curated widget list
 *   Center: horizontal filter bar, size/aspect selector, Export, live preview
 *   Right:  per-user persistent history (click to restore)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Widget, SizePreset, FilterControl, PlayerSearchValue } from '@/lib/imagine/types'
import { IMAGINE_WIDGETS, getWidget } from '@/lib/imagine/registry'
import { PANEL_REGISTRY } from '@/lib/imagine/panelRegistry'
import PlayerSearchField from '@/components/imagine/PlayerSearchField'

/* ── Types ─────────────────────────────────────────────────────────────── */

type HistoryRow = {
  id: string
  widget_id: string
  title: string
  filters: Record<string, any>
  size: SizePreset
  thumbnail_url: string
  created_at: string
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function downscaleToDataURL(blob: Blob, maxDim = 400): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const bitmap = await createImageBitmap(blob)
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No 2D context'))
      ctx.drawImage(bitmap, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    } catch (err) {
      reject(err)
    }
  })
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'imagine'
}

async function saveBlobToDisk(blob: Blob, suggestedName: string): Promise<'saved' | 'cancelled'> {
  const w = window as any
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled'
      // fall through to download fallback
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'saved'
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ImaginePage() {
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>(IMAGINE_WIDGETS[0]?.id || '')
  const widget = getWidget(selectedWidgetId)

  const [filters, setFiltersRaw] = useState<Record<string, any>>(widget?.defaultFilters ?? {})
  const [size, setSize] = useState<SizePreset>(widget?.defaultSize ?? { label: '', width: 1920, height: 1080 })

  /** Patch filters and run the active widget's normalizer for cross-field invariants. */
  const setFilters = useCallback((next: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => {
    setFiltersRaw(prev => {
      const proposed = typeof next === 'function' ? next(prev) : next
      return widget?.normalizeFilters ? (widget.normalizeFilters as any)(proposed, prev) : proposed
    })
  }, [widget])

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [history, setHistory] = useState<HistoryRow[]>([])
  const [exporting, setExporting] = useState(false)

  /* Reset filters/size when switching widget — bypass normalizer (not a within-widget edit) */
  const switchWidget = (id: string) => {
    const w = getWidget(id)
    if (!w) return
    setSelectedWidgetId(id)
    setFiltersRaw(w.defaultFilters)
    setSize(w.defaultSize)
  }

  /* Load history on mount */
  useEffect(() => {
    let cancelled = false
    fetch('/api/imagine/history')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`history fetch ${r.status}`)))
      .then(json => { if (!cancelled) setHistory(json.rows || []) })
      .catch(() => { /* not signed in or table missing — ignore silently */ })
    return () => { cancelled = true }
  }, [])

  /* Debounced auto-render on filter / size / widget change */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderSeqRef = useRef(0)

  useEffect(() => {
    if (!widget) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const seq = ++renderSeqRef.current
      setPreviewLoading(true)
      setPreviewError(null)
      try {
        const res = await fetch('/api/imagine/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widget_id: widget.id, filters, size }),
        })
        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`render failed: ${res.status} ${txt.slice(0, 120)}`)
        }
        const blob = await res.blob()
        if (renderSeqRef.current !== seq) return  // a newer render is in-flight
        setPreviewBlob(blob)
        setPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })
      } catch (err) {
        if (renderSeqRef.current !== seq) return
        setPreviewError(err instanceof Error ? err.message : String(err))
      } finally {
        if (renderSeqRef.current === seq) setPreviewLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget?.id, JSON.stringify(filters), size.width, size.height])

  /* Title — auto-generated unless user typed one */
  const effectiveTitle = useMemo(() => {
    const userTitle = (filters.title || '').trim()
    return userTitle || (widget ? widget.autoTitle(filters as any) : '')
  }, [filters, widget])

  /* Export handler */
  const onExport = useCallback(async () => {
    if (!widget || !previewBlob) return
    setExporting(true)
    try {
      const userTitle = (filters.title || '').trim()
      const filenameStem = userTitle
        ? safeFilename(userTitle)
        : (widget.autoFilename ? widget.autoFilename(filters as any) : safeFilename(effectiveTitle))
      const suggestedName = `${filenameStem}.png`
      const result = await saveBlobToDisk(previewBlob, suggestedName)
      if (result === 'cancelled') return

      // Save to history (best-effort).
      try {
        const thumb = await downscaleToDataURL(previewBlob, 400)
        const res = await fetch('/api/imagine/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            widget_id: widget.id,
            title: effectiveTitle,
            filters,
            size,
            thumbnail_data_url: thumb,
          }),
        })
        if (res.ok) {
          const { row } = await res.json()
          if (row) setHistory(h => [row, ...h])
        }
      } catch { /* history save is non-fatal */ }
    } finally {
      setExporting(false)
    }
  }, [widget, previewBlob, effectiveTitle, filters, size])

  /* History — restore. Bypass normalizer so the saved state is reproduced exactly. */
  const onRestoreHistory = (row: HistoryRow) => {
    if (row.widget_id !== selectedWidgetId) {
      setSelectedWidgetId(row.widget_id)
    }
    setFiltersRaw(row.filters)
    setSize(row.size)
  }

  const onDeleteHistory = async (id: string) => {
    setHistory(h => h.filter(r => r.id !== id))
    try {
      await fetch(`/api/imagine/history/${id}`, { method: 'DELETE' })
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-zinc-950 text-zinc-200 overflow-hidden">
      {/* ── Left: Widgets (top 2/3) + History (bottom 1/3) ──────── */}
      <aside className="w-60 shrink-0 border-r border-zinc-800 flex flex-col">
        {/* Widgets */}
        <div className="flex-[2] flex flex-col min-h-0">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">Widgets</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {IMAGINE_WIDGETS.map(w => (
              <button
                key={w.id}
                onClick={() => switchWidget(w.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md mb-1 transition ${
                  selectedWidgetId === w.id
                    ? 'bg-emerald-600/15 border border-emerald-500/30 text-emerald-200'
                    : 'border border-transparent hover:bg-zinc-900 text-zinc-300'
                }`}
              >
                <div className="text-sm font-medium">{w.name}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{w.description}</div>
              </button>
            ))}
          </div>
        </div>
        {/* History (bottom 1/3) */}
        <div className="flex-[1] flex flex-col min-h-0 border-t border-zinc-800">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-wider text-zinc-500">History</h2>
            <span className="text-[10px] text-zinc-600">{history.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {history.length === 0 ? (
              <div className="text-[11px] text-zinc-600 px-2 py-4">
                Exported renders show up here.
              </div>
            ) : (
              history.map(row => (
                <HistoryRowCard
                  key={row.id}
                  row={row}
                  onRestore={() => onRestoreHistory(row)}
                  onDelete={() => onDeleteHistory(row.id)}
                />
              ))
            )}
          </div>
        </div>
      </aside>

      {/* ── Center: Preview ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {widget ? (
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-zinc-900/30">
            <PreviewArea
              url={previewUrl}
              loading={previewLoading}
              error={previewError}
              size={size}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Pick a widget to start.
          </div>
        )}
      </main>

      {/* ── Right: Filters + Output ──────────────────────────── */}
      <aside className="w-80 shrink-0 border-l border-zinc-800 flex flex-col">
        {widget && (() => {
          const CustomPanel = widget.renderPanel || PANEL_REGISTRY[widget.id]
          const panelProps = {
            filters,
            onChange: setFilters,
            size,
            onSizeChange: setSize,
            sizePresets: widget.sizePresets,
            onExport,
            exportDisabled: exporting || previewLoading || !previewBlob,
            exporting,
          }
          return CustomPanel ? (
            <CustomPanel {...panelProps as any} />
          ) : (
            <FilterPanel
              schema={widget.filterSchema}
              {...panelProps}
            />
          )
        })()}
      </aside>
    </div>
  )
}

/* ── FilterPanel ───────────────────────────────────────────────────────── */

const SECTION_TITLES: Record<number, string> = { 1: 'Scope', 2: 'Data', 3: 'Stats' }

function FilterPanel({
  schema, filters, onChange,
  size, onSizeChange, sizePresets,
  onExport, exportDisabled, exporting,
}: {
  schema: FilterControl[]
  filters: Record<string, any>
  onChange: (f: Record<string, any>) => void
  size: SizePreset
  onSizeChange: (s: SizePreset) => void
  sizePresets: SizePreset[]
  onExport: () => void
  exportDisabled: boolean
  exporting: boolean
}) {
  const patch = (key: string, value: any) => onChange({ ...filters, [key]: value })

  // Group controls by their `column` field (now repurposed as a section
  // index since the panel is vertical). Declaration order within a section
  // = top-to-bottom render order. Controls whose `visibleWhen` predicate
  // returns false are dropped entirely.
  const sections: FilterControl[][] = [[], [], []]
  for (const ctrl of schema) {
    if (ctrl.visibleWhen && !ctrl.visibleWhen(filters)) continue
    const s = (ctrl.column ?? 1) - 1
    if (s >= 0 && s < 3) sections[s].push(ctrl)
  }

  const renderField = (ctrl: FilterControl) => (
    <div key={ctrl.key}>
      <FieldLabel>{ctrl.label}</FieldLabel>
      <FilterControlField
        ctrl={ctrl}
        value={filters[ctrl.key]}
        filters={filters}
        onChange={(v) => patch(ctrl.key, v)}
      />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-5">
        {sections.map((controls, idx) => (
          controls.length > 0 && (
            <section key={idx}>
              <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2.5">
                {SECTION_TITLES[idx + 1]}
              </h3>
              <div className="space-y-2.5">
                {controls.map(renderField)}
              </div>
            </section>
          )
        ))}
        {/* Output section — Size/Aspect lives with the filters; Export is
            pinned to the bottom of the panel below the scroll area. */}
        <section>
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2.5">Output</h3>
          <div>
            <FieldLabel>Size / Aspect</FieldLabel>
            <select
              className={selectCls}
              value={`${size.width}x${size.height}`}
              onChange={(e) => {
                const found = sizePresets.find(p => `${p.width}x${p.height}` === e.target.value)
                if (found) onSizeChange(found)
              }}
            >
              {sizePresets.map(p => (
                <option key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>
      {/* Export pinned to bottom */}
      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={onExport}
          disabled={exportDisabled}
          className="w-full px-4 py-2 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>
    </div>
  )
}

/* ── Individual control renderers ──────────────────────────────────────── */

const labelCls = 'block text-[10px] text-zinc-500 uppercase tracking-wider mb-1'
const selectCls =
  'w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-emerald-500'
const inputCls = selectCls

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className={labelCls}>{children}</span>
}

function FilterControlField({
  ctrl, value, filters, onChange,
}: {
  ctrl: FilterControl
  value: any
  filters: Record<string, any>
  onChange: (v: any) => void
}) {
  switch (ctrl.type) {
    case 'text': {
      const placeholder = ctrl.dynamicPlaceholder ? ctrl.dynamicPlaceholder(filters) : ctrl.placeholder
      return (
        <input
          type="text"
          className={inputCls}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }

    case 'segmented':
      return (
        <div className="grid grid-flow-col auto-cols-fr gap-1">
          {ctrl.options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-1.5 rounded text-xs font-medium transition border ${
                value === opt.value
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )

    case 'select':
      return (
        <select
          className={selectCls}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {ctrl.placeholder !== undefined && (
            <option value="">{ctrl.placeholder}</option>
          )}
          {renderGroupedOptions(ctrl.options)}
        </select>
      )

    case 'number':
      return (
        <input
          type="number"
          className={inputCls}
          value={value ?? ''}
          min={ctrl.min}
          max={ctrl.max}
          step={ctrl.step}
          onChange={(e) => onChange(e.target.value === '' ? '' : +e.target.value)}
        />
      )

    case 'toggle-select': {
      const isOn = !!value
      return (
        <div className="flex gap-1">
          <button
            onClick={() => onChange(isOn ? '' : ctrl.options[0]?.value || '')}
            className={`px-2 py-1.5 rounded text-[10px] font-semibold transition border ${
              isOn
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {isOn ? 'ON' : 'OFF'}
          </button>
          {isOn && (
            <select
              className={`${selectCls} flex-1`}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
            >
              {renderGroupedOptions(ctrl.options)}
            </select>
          )}
        </div>
      )
    }

    case 'player-search': {
      const v: PlayerSearchValue = value && typeof value === 'object'
        ? value
        : { playerId: null, playerName: '' }
      const playerType = ctrl.playerTypeKey ? filters[ctrl.playerTypeKey] : 'all'
      return (
        <PlayerSearchField
          value={v}
          playerType={playerType === 'pitcher' ? 'pitcher' : playerType === 'batter' ? 'batter' : 'all'}
          placeholder={ctrl.placeholder}
          onChange={onChange}
        />
      )
    }

    case 'date-range-season-or-custom': {
      const dr = value ?? { type: 'season', year: ctrl.years[0] }
      const isSeason = dr.type === 'season'
      return (
        <div className="space-y-1.5">
          <div className="grid grid-flow-col auto-cols-fr gap-1">
            <button
              onClick={() => onChange({ type: 'season', year: dr.year ?? ctrl.years[0] })}
              className={`px-2 py-1.5 rounded text-xs font-medium transition border ${
                isSeason
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >Season</button>
            <button
              onClick={() => onChange({
                type: 'custom',
                from: dr.from ?? `${ctrl.years[0]}-04-01`,
                to: dr.to ?? `${ctrl.years[0]}-10-31`,
              })}
              className={`px-2 py-1.5 rounded text-xs font-medium transition border ${
                !isSeason
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >Custom</button>
          </div>
          {isSeason ? (
            <select
              className={selectCls}
              value={dr.year}
              onChange={(e) => onChange({ type: 'season', year: +e.target.value })}
            >
              {ctrl.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <input
                type="date" className={inputCls}
                value={dr.from}
                onChange={(e) => onChange({ ...dr, from: e.target.value })}
              />
              <input
                type="date" className={inputCls}
                value={dr.to}
                onChange={(e) => onChange({ ...dr, to: e.target.value })}
              />
            </div>
          )}
        </div>
      )
    }
  }
}

function renderGroupedOptions(options: { value: string; label: string; group?: string }[]) {
  const grouped: Record<string, typeof options> = {}
  const ungrouped: typeof options = []
  for (const o of options) {
    if (o.group) {
      grouped[o.group] = grouped[o.group] || []
      grouped[o.group].push(o)
    } else {
      ungrouped.push(o)
    }
  }
  return (
    <>
      {ungrouped.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      {Object.entries(grouped).map(([group, opts]) => (
        <optgroup key={group} label={group}>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </>
  )
}

/* ── Preview ───────────────────────────────────────────────────────────── */

function PreviewArea({
  url, loading, error, size,
}: {
  url: string | null
  loading: boolean
  error: string | null
  size: SizePreset
}) {
  return (
    <div className="relative max-w-full max-h-full">
      {error ? (
        <div className="px-4 py-3 rounded bg-red-950/40 border border-red-900/50 text-red-300 text-xs max-w-md">
          <div className="font-semibold mb-1">Render failed</div>
          <div className="text-red-200/70 break-words">{error}</div>
        </div>
      ) : url ? (
        <img
          src={url}
          alt="Preview"
          className="max-w-full max-h-[calc(100vh-12rem)] rounded shadow-lg ring-1 ring-zinc-800"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        />
      ) : (
        <div className="text-zinc-600 text-sm">Preparing preview…</div>
      )}
      {loading && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-zinc-300 text-[10px] flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 border-2 border-zinc-500 border-t-emerald-400 rounded-full animate-spin" />
          Rendering
        </div>
      )}
    </div>
  )
}

/* ── HistoryRowCard ────────────────────────────────────────────────────── */

function HistoryRowCard({
  row, onRestore, onDelete,
}: {
  row: HistoryRow
  onRestore: () => void
  onDelete: () => void
}) {
  const widget = getWidget(row.widget_id)
  return (
    <div className="group relative mb-2 rounded-md border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 transition">
      <button onClick={onRestore} className="block w-full text-left p-2">
        {row.thumbnail_url && (
          <img
            src={row.thumbnail_url}
            alt={row.title}
            className="w-full rounded object-contain bg-black/40"
            style={{ aspectRatio: `${row.size.width} / ${row.size.height}` }}
          />
        )}
        <div className="mt-1.5 text-[11px] text-zinc-200 font-medium leading-tight line-clamp-2">
          {row.title}
        </div>
        <div className="mt-0.5 text-[10px] text-zinc-500">
          {widget?.name || row.widget_id} · {new Date(row.created_at).toLocaleDateString()}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-red-900 text-[10px] text-zinc-400 hover:text-red-200 transition"
        aria-label="Delete"
      >
        ✕
      </button>
    </div>
  )
}
