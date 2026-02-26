'use client'
import { useState, useRef, useEffect } from 'react'
import { TileHeatmap, TileScatter, TileBar, TileStrikeZone, TileTable, CUSTOM_COL_CATALOG, GROUP_BY_OPTIONS } from './TileViz'
import type { MetricKey, ScatterMode, BarMetric, TableMode } from './TileViz'
import { applyFiltersToData, FILTER_CATALOG, type ActiveFilter, type FilterDef } from '../FilterEngine'
import { PITCH_CODE_NAMES } from '../chartConfig'

export type VizType = 'heatmap'|'scatter'|'bar'|'strike_zone'|'table'|'empty'

export interface TileConfig {
  id: string
  viz: VizType
  metric?: MetricKey
  scatterMode?: ScatterMode
  barMetric?: BarMetric
  tableMode?: TableMode
  tableColumns?: string[]
  tableGroupBy?: string
  title?: string
  subtitle?: string
  filters: ActiveFilter[]
}

export function defaultTile(id: string): TileConfig {
  return { id, viz: 'empty', filters: [] }
}

interface Props {
  config: TileConfig
  data: any[]
  optionsCache: Record<string, string[]>
  onUpdate: (config: TileConfig) => void
  onRemove: () => void
}

const DEFAULT_CUSTOM_COLS = ['n', 'pct', 'velo', 'spin', 'whiff', 'ev']

export default function ReportTile({ config, data, optionsCache, onUpdate, onRemove }: Props) {
  const [showConfig, setShowConfig] = useState(config.viz === 'empty')
  const [filterSearch, setFilterSearch] = useState('')
  const [showTileFilters, setShowTileFilters] = useState(false)
  const [showColPicker, setShowColPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setShowColPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Apply tile-level filters
  const filtered = config.filters.length > 0 ? applyFiltersToData(data, config.filters) : data

  function setViz(viz: VizType) { onUpdate({ ...config, viz }) }

  if (config.viz === 'empty') {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col items-center justify-center p-4 h-full min-h-[200px]">
        <p className="text-[11px] text-zinc-500 mb-3">Choose a visualization</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['heatmap', 'Heatmap'],
            ['scatter', 'Scatter'],
            ['bar', 'Bar Chart'],
            ['strike_zone', 'Strike Zone'],
            ['table', 'Data Table'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setViz(k as VizType)}
              className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition">
              {l}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col h-full min-h-[200px] overflow-hidden relative group/tile">
      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-zinc-950/80 z-50 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm">
          <p className="text-sm text-white font-medium mb-4">Delete this tile?</p>
          <div className="flex gap-3">
            <button onClick={() => { onRemove(); setShowDeleteConfirm(false) }}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded transition">Delete</button>
            <button onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium rounded transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Tile Header */}
      <div className="flex items-center px-2 py-1 border-b border-zinc-800 bg-zinc-800/30 flex-shrink-0 relative">
        {/* Delete X button */}
        <button onClick={() => setShowDeleteConfirm(true)}
          className="absolute left-1 top-1 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-700/80 text-zinc-400 hover:bg-red-600 hover:text-white opacity-0 group-hover/tile:opacity-100 transition-all text-[10px] leading-none z-10">
          &times;
        </button>
        <div className="flex-1 flex flex-col items-center">
          <input type="text" value={config.title || ""} onChange={e => onUpdate({ ...config, title: e.target.value })}
            placeholder={config.viz.replace("_", " ")} className="bg-transparent text-[11px] text-white font-medium text-center w-full focus:outline-none placeholder-zinc-500" />
          <input type="text" value={config.subtitle || ""} onChange={e => onUpdate({ ...config, subtitle: e.target.value })}
            placeholder="subtitle" className="bg-transparent text-[9px] text-zinc-500 text-center w-full focus:outline-none placeholder-zinc-700" />
        </div>
        <div className="absolute right-1 top-1 flex items-center gap-1">
          <button onClick={() => setShowConfig(!showConfig)} className="text-zinc-500 hover:text-zinc-300 transition">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v1m0 16v1m-7.07-2.93l.71.71M5.64 5.64l-.71-.71M3 12h1m16 0h1m-2.93 7.07l-.71-.71M18.36 5.64l.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          </button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="px-2 py-1.5 border-b border-zinc-800 bg-zinc-800/20 space-y-1.5 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-zinc-500">Viz:</span>
            {['heatmap','scatter','bar','strike_zone','table'].map(v => (
              <button key={v} onClick={() => setViz(v as VizType)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition ${config.viz === v ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                {v.replace('_', ' ')}
              </button>
            ))}
          </div>

          {config.viz === 'heatmap' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">Metric:</span>
              <select value={config.metric || 'frequency'} onChange={e => onUpdate({ ...config, metric: e.target.value as MetricKey })}
                className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none">
                {([['frequency','Frequency'],['ba','BA'],['slg','SLG'],['woba','wOBA'],['xba','xBA'],['xwoba','xwOBA'],['xslg','xSLG'],['ev','Exit Velo'],['la','Launch Angle'],['whiff_pct','Whiff%'],['chase_pct','Chase%'],['swing_pct','Swing%']] as [MetricKey,string][]).map(([m,label]) => (
                  <option key={m} value={m}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {config.viz === 'scatter' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">Mode:</span>
              {(['location','movement','ev_la'] as ScatterMode[]).map(m => (
                <button key={m} onClick={() => onUpdate({ ...config, scatterMode: m })}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition ${(config.scatterMode||'location')===m ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                  {m === 'ev_la' ? 'EV/LA' : m}
                </button>
              ))}
            </div>
          )}

          {config.viz === 'bar' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">Metric:</span>
              <select value={config.barMetric || 'usage'} onChange={e => onUpdate({ ...config, barMetric: e.target.value as BarMetric })}
                className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none">
                {([['usage','Usage%'],['whiff','Whiff%'],['velo','Avg Velo'],['spin','Avg Spin'],['csw','CSW%'],['zone','Zone%'],['chase','Chase%'],['swing','Swing%'],['ev','Avg EV'],['xwoba','xwOBA']] as [BarMetric,string][]).map(([m,label]) => (
                  <option key={m} value={m}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {config.viz === 'table' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-zinc-500">View:</span>
              {(['arsenal','results','splits','custom'] as TableMode[]).map(m => (
                <button key={m} onClick={() => onUpdate({ ...config, tableMode: m, tableColumns: m === 'custom' ? (config.tableColumns || DEFAULT_CUSTOM_COLS) : config.tableColumns })}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition ${(config.tableMode||'arsenal')===m ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                  {m}
                </button>
              ))}
              {(config.tableMode === 'custom') && (<>
                <select value={config.tableGroupBy || 'pitch_name'}
                  onChange={e => onUpdate({ ...config, tableGroupBy: e.target.value })}
                  className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none">
                  {GROUP_BY_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                <div className="relative" ref={colPickerRef}>
                  <button onClick={() => setShowColPicker(!showColPicker)}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition">
                    Columns ({(config.tableColumns || DEFAULT_CUSTOM_COLS).length})
                  </button>
                  {showColPicker && (
                    <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 w-48 max-h-56 overflow-y-auto">
                      {(() => {
                        const cats = [...new Set(CUSTOM_COL_CATALOG.map(c => c.category))]
                        const selected = new Set(config.tableColumns || DEFAULT_CUSTOM_COLS)
                        return cats.map(cat => (
                          <div key={cat}>
                            <div className="px-2 py-1 text-[9px] text-zinc-500 font-medium uppercase tracking-wider bg-zinc-900/50 sticky top-0">{cat}</div>
                            {CUSTOM_COL_CATALOG.filter(c => c.category === cat).map(c => (
                              <label key={c.key} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-700 cursor-pointer">
                                <input type="checkbox" checked={selected.has(c.key)}
                                  onChange={() => {
                                    const cols = [...(config.tableColumns || DEFAULT_CUSTOM_COLS)]
                                    const idx = cols.indexOf(c.key)
                                    if (idx >= 0) cols.splice(idx, 1)
                                    else cols.push(c.key)
                                    onUpdate({ ...config, tableColumns: cols })
                                  }}
                                  className="accent-emerald-500 w-3 h-3" />
                                <span className="text-[10px] text-zinc-300">{c.label}</span>
                              </label>
                            ))}
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              </>)}
            </div>
          )}

          {/* Tile Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-zinc-500">Filters:</span>
            {config.filters.map((f, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ${
                f.readonly
                  ? 'bg-amber-900/30 border border-amber-700/50 text-amber-300'
                  : 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300'
              }`}>
                {f.def.label}: {f.def.key === 'pitch_type' ? f.values?.map(v => PITCH_CODE_NAMES[v] || v).join(", ") : (f.values?.join(", ") || `${f.min||""}\u2013${f.max||""}`)}
                {!f.readonly && (
                  <span onClick={() => onUpdate({ ...config, filters: config.filters.filter((_, idx) => idx !== i) })} className="cursor-pointer hover:text-red-400">&times;</span>
                )}
              </span>
            ))}
            <div className="relative">
              <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                onFocus={() => setShowTileFilters(true)}
                placeholder="+ filter" className="w-16 px-1 py-0.5 bg-transparent border border-zinc-700 rounded text-[9px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none focus:w-28 transition-all" />
              {showTileFilters && (() => {
                const activeKeys = new Set(config.filters.map(f => f.def.key))
                const matches = filterSearch.trim()
                  ? FILTER_CATALOG.filter(f => !activeKeys.has(f.key) && (f.label.toLowerCase().includes(filterSearch.toLowerCase()) || f.category.toLowerCase().includes(filterSearch.toLowerCase())))
                  : FILTER_CATALOG.filter(f => !activeKeys.has(f.key)).slice(0, 12)
                if (!matches.length) return null
                return (
                  <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 w-48 max-h-40 overflow-y-auto">
                    {matches.map(d => (
                      <button key={d.key} onClick={() => {
                        const nf: ActiveFilter = { def: d }
                        if (d.type === "multi") nf.values = []
                        if (d.type === "range") { nf.min = ""; nf.max = "" }
                        onUpdate({ ...config, filters: [...config.filters, nf] })
                        setFilterSearch(""); setShowTileFilters(false)
                      }}
                        className="w-full text-left px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition">
                        {d.label} <span className="text-zinc-600">{d.type === "multi" ? "select" : "range"}</span>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Expanded tile filter editors */}
          {config.filters.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[9px] text-zinc-500 w-14 truncate">{f.def.label}:</span>
              {f.def.type === "multi" && (
                <div className="flex flex-wrap gap-0.5 flex-1">
                  {(optionsCache[f.def.key] || []).slice(0, 20).map(opt => (
                    <button key={opt} onClick={() => {
                      const vals = f.values || []
                      const nv = vals.includes(opt) ? vals.filter(v => v !== opt) : [...vals, opt]
                      const nf = [...config.filters]; nf[i] = { ...f, values: nv }; onUpdate({ ...config, filters: nf })
                    }}
                      className={`px-1 py-0 rounded text-[9px] transition ${f.values?.includes(opt) ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>{f.def.key === 'pitch_type' ? (PITCH_CODE_NAMES[opt] || opt) : opt}</button>
                  ))}
                </div>
              )}
              {f.def.type === "range" && (
                <div className="flex gap-1">
                  <input type="number" value={f.min||""} onChange={e => { const nf=[...config.filters]; nf[i]={...f, min:e.target.value}; onUpdate({...config, filters:nf}) }}
                    placeholder="Min" className="w-14 px-1 py-0.5 bg-zinc-900 border border-zinc-600 rounded text-[9px] text-white placeholder-zinc-600 focus:outline-none" />
                  <input type="number" value={f.max||""} onChange={e => { const nf=[...config.filters]; nf[i]={...f, max:e.target.value}; onUpdate({...config, filters:nf}) }}
                    placeholder="Max" className="w-14 px-1 py-0.5 bg-zinc-900 border border-zinc-600 rounded text-[9px] text-white placeholder-zinc-600 focus:outline-none" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Visualization */}
      <div className="flex-1 p-1 min-h-0">
        {config.viz === 'heatmap' && <TileHeatmap data={filtered} metric={config.metric || 'frequency'} />}
        {config.viz === 'scatter' && <TileScatter data={filtered} mode={config.scatterMode || 'location'} />}
        {config.viz === 'bar' && <TileBar data={filtered} metric={config.barMetric || 'usage'} />}
        {config.viz === 'strike_zone' && <TileStrikeZone data={filtered} />}
        {config.viz === 'table' && <TileTable data={filtered} mode={config.tableMode || 'arsenal'} columns={config.tableColumns} groupBy={config.tableGroupBy} />}
      </div>
    </div>
  )
}
