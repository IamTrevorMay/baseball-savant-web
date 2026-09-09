'use client'

// Compare — up to four players side by side, Stathead-style.
//
// Rows come from three sources with three different coverages (see
// lib/compareMetrics.ts), kept in separate banded sections so a Statcast
// number is never silently mixed with a 1960s box score. Preset sections
// toggle on and off; a Custom section at the bottom takes any metric in the
// active group by dropdown.
//
// With exactly two players the stat label sits between them, as in the
// Stathead layout this is modelled on. At three or four it moves to a left
// column — a centred label cannot divide an odd number of players.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ResearchNav from '@/components/ResearchNav'
import { supabase } from '@/lib/supabase'
import ComparePlayerPicker, { type ComparePlayerRef } from '@/components/compare/ComparePlayerPicker'
import { TEAM_COLORS } from '@/lib/teamColors'
import {
  metricsFor, sectionsFor, sourcesForSections, needsPitchTypeRows,
  formatCompareValue, winningIndices, PITCH_TYPES,
  type CompareGroup, type CompareMetric,
} from '@/lib/compareMetrics'

const MAX_PLAYERS = 4
const CURRENT_SEASON = 2026
// The official line comes from the MLB Stats API, so any season works —
// Statcast-sourced sections simply dash out before 2015.
const SEASONS = Array.from({ length: CURRENT_SEASON - 1900 }, (_, i) => CURRENT_SEASON - i)

type Scope = 'career' | 'season' | 'custom'
type TimeMode = 'global' | 'individual'

/** Per-player window override (individual mode). */
interface PlayerWindow { season?: number; from?: string; to?: string }

/**
 * One column of the comparison. `uid` is a client-side instance key — the
 * same player can occupy two columns (e.g. Judge 2024 vs Judge 2025), so
 * nothing may be keyed by the player's ids.
 */
type Slot = ComparePlayerRef & { uid: string }

/** A saved row layout (compare_presets, owner-only RLS). Never players/scope. */
interface SavedPreset {
  id: string
  name: string
  player_group: CompareGroup
  config: {
    sections?: string[]
    closedRows?: Record<string, string[]>
    customMetrics?: string[]
  }
}

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}/${y.slice(2)}`
}

interface PlayerPayload {
  mlbId: number | null
  lahmanId: string | null
  name: string | null
  debut: string | null
  finalGame: string | null
  active: boolean
  team: string | null
  lahman: Record<string, number | null> | null
  statcast: Record<string, number | null> | null
  triton: Record<string, number | null> | null
  awards: Record<string, number | boolean> | null
  byPitch: Record<string, unknown>[] | null
}

interface CustomRow { id: string; metricKey: string }

const headshot = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`

const btnCls = 'px-3 py-1.5 rounded text-sm font-medium transition'
const selCls = 'bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200'

/** Pull one metric's value out of whichever source payload holds it. */
function valueOf(player: PlayerPayload | undefined, metric: CompareMetric): unknown {
  if (!player) return null
  if (metric.derive) return player.statcast ? metric.derive(player.statcast) : null
  const bag = player[metric.source] as Record<string, unknown> | null
  if (!bag) return null
  return bag[metric.field] ?? null
}

export default function ComparePage() {
  const [group, setGroup] = useState<CompareGroup>('hitting')
  const [scope, setScope] = useState<Scope>('career')
  const [season, setSeason] = useState(CURRENT_SEASON)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Global = one window for everyone; Individual = per-player windows under
  // each header, interpreted under the active scope (season or range).
  const [timeMode, setTimeMode] = useState<TimeMode>('global')
  const [windowsByKey, setWindowsByKey] = useState<Record<string, PlayerWindow>>({})
  const [timeMenuOpen, setTimeMenuOpen] = useState(false)
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([])
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const [presetBusy, setPresetBusy] = useState(false)
  const [pitchType, setPitchType] = useState('FF')
  const [players, setPlayers] = useState<Slot[]>([])
  const [activeSections, setActiveSections] = useState<string[]>(
    sectionsFor('hitting').filter(s => s.defaultOn).map(s => s.id),
  )
  const [customRows, setCustomRows] = useState<CustomRow[]>([])
  // Rows closed inside preset sections, keyed by section id. Cleared for a
  // section when it is toggled off, so re-toggling restores the full list.
  const [closedRows, setClosedRows] = useState<Record<string, string[]>>({})
  const [adding, setAdding] = useState(false)
  const [data, setData] = useState<PlayerPayload[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [urlReady, setUrlReady] = useState(false)

  const tableRef = useRef<HTMLDivElement>(null)
  const rowSeq = useRef(0)
  const slotSeq = useRef(0)

  const METRICS = metricsFor(group)
  const SECTIONS = sectionsFor(group)

  // ── URL state ──
  // Read from window rather than useSearchParams: this page has no server
  // render to suspend, and window.location keeps the Suspense boundary out.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const g = sp.get('g')
    const nextGroup: CompareGroup = g === 'pitching' ? 'pitching' : g === 'pitch' ? 'pitch' : 'hitting'
    setGroup(nextGroup)
    const pt = sp.get('pt')
    if (pt && PITCH_TYPES.some(x => x.code === pt)) setPitchType(pt)
    const sVal = sp.get('s')
    if (sVal === 'season' || sVal === 'custom') setScope(sVal)
    const y = parseInt(sp.get('y') || '', 10)
    if (!isNaN(y)) setSeason(y)
    const df = sp.get('df'); const dt = sp.get('dt')
    if (df) setDateFrom(df)
    if (dt) setDateTo(dt)
    if (sp.get('tm') === 'ind') setTimeMode('individual')
    const secs = (sp.get('sec') || '').split(',').filter(Boolean)
    setActiveSections(
      secs.length ? secs : sectionsFor(nextGroup).filter(s => s.defaultOn).map(s => s.id),
    )

    // Closed preset rows: "sectionId:key1.key2" chunks.
    const crRaw = (sp.get('cr') || '').split(',').filter(Boolean)
    if (crRaw.length) {
      const cr: Record<string, string[]> = {}
      for (const chunk of crRaw) {
        const [sec, keys] = chunk.split(':')
        if (sec && keys) cr[sec] = keys.split('.').filter(Boolean)
      }
      setClosedRows(cr)
    }

    // Each player rides as "mlbId~lahmanId~Name", either id allowed to be blank.
    const ps = (sp.get('p') || '').split(',').filter(Boolean).slice(0, MAX_PLAYERS)
    const uids: string[] = []
    if (ps.length) {
      setPlayers(ps.map(chunk => {
        const [mlb, lahman, name] = chunk.split('~')
        const mlbId = parseInt(mlb || '', 10)
        const uid = `u${slotSeq.current++}`
        uids.push(uid)
        return {
          uid,
          key: mlb || lahman || chunk,
          name: decodeURIComponent(name || ''),
          mlbId: isNaN(mlbId) ? null : mlbId,
          lahmanId: lahman || null,
          years: null,
          team: null,
          hasStatcast: !isNaN(mlbId),
        }
      }))
    }

    // Per-player windows: "index:season" or "index:from..to", comma-joined —
    // indexed by column because the same player can hold two columns.
    const wRaw = (sp.get('w') || '').split(',').filter(Boolean)
    if (wRaw.length) {
      const w: Record<string, PlayerWindow> = {}
      for (const chunk of wRaw) {
        const [idx, val] = chunk.split(':')
        const uid = uids[parseInt(idx || '', 10)]
        if (!uid || !val) continue
        if (val.includes('..')) {
          const [from, to] = val.split('..')
          if (from && to) w[uid] = { from, to }
        } else {
          const yv = parseInt(val, 10)
          if (!isNaN(yv)) w[uid] = { season: yv }
        }
      }
      setWindowsByKey(w)
    }
    setUrlReady(true)
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const sp = new URLSearchParams()
    sp.set('g', group)
    if (group === 'pitch') sp.set('pt', pitchType)
    sp.set('s', scope)
    if (scope === 'season') sp.set('y', String(season))
    if (scope === 'custom') {
      if (dateFrom) sp.set('df', dateFrom)
      if (dateTo) sp.set('dt', dateTo)
    }
    if (timeMode === 'individual' && scope !== 'career') {
      sp.set('tm', 'ind')
      const chunks = players
        .map((p, i) => {
          const w = windowsByKey[p.uid]
          if (!w) return null
          return w.season != null ? `${i}:${w.season}` : w.from && w.to ? `${i}:${w.from}..${w.to}` : null
        })
        .filter(Boolean)
      if (chunks.length) sp.set('w', chunks.join(','))
    }
    if (activeSections.length) sp.set('sec', activeSections.join(','))
    const crChunks = Object.entries(closedRows)
      .filter(([sec, keys]) => keys.length && activeSections.includes(sec))
      .map(([sec, keys]) => `${sec}:${keys.join('.')}`)
    if (crChunks.length) sp.set('cr', crChunks.join(','))
    if (players.length) {
      sp.set('p', players.map(p =>
        `${p.mlbId ?? ''}~${p.lahmanId ?? ''}~${encodeURIComponent(p.name)}`).join(','))
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${sp}`)
  }, [urlReady, group, pitchType, scope, season, dateFrom, dateTo, timeMode, windowsByKey, activeSections, closedRows, players])

  // Switching group invalidates section ids and custom rows — the catalogs
  // are keyed per group and share no metric keys by contract.
  const switchGroup = (next: CompareGroup) => {
    if (next === group) return
    setGroup(next)
    setActiveSections(sectionsFor(next).filter(s => s.defaultOn).map(s => s.id))
    setCustomRows([])
    setClosedRows({})
    setPlayers([])
    setData([])
  }

  // ── Fetch ──
  const sources = useMemo(
    () => sourcesForSections(group, activeSections).concat(customRows.length ? ['lahman', 'statcast', 'awards', 'triton'] : []),
    [group, activeSections, customRows.length],
  )
  const wantByPitch = needsPitchTypeRows(group, activeSections)
  const sourceKey = [...new Set(sources)].sort().join(',') + (wantByPitch ? '+bypitch' : '')

  // A custom range only fetches once both ends are set and ordered.
  const rangeReady = scope !== 'custom' || (!!dateFrom && !!dateTo && dateFrom <= dateTo)
  const individual = timeMode === 'individual' && scope !== 'career'

  /**
   * The override sent for one player — their own window in individual mode
   * (field names match the API body), or nothing to inherit the global one.
   */
  const windowFor = (uid: string): { season?: number; dateFrom?: string; dateTo?: string } | null => {
    if (!individual) return null
    const w = windowsByKey[uid]
    if (!w) return null
    if (scope === 'season') return w.season != null ? { season: w.season } : null
    return w.from && w.to && w.from <= w.to ? { dateFrom: w.from, dateTo: w.to } : null
  }

  const playerKey = players
    .map(p => `${p.mlbId ?? ''}:${p.lahmanId ?? ''}:${JSON.stringify(windowFor(p.uid))}`)
    .join('|')

  useEffect(() => {
    if (!urlReady) return undefined
    if (players.length === 0 || !rangeReady) { setData([]); return undefined }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group,
            pitchType: group === 'pitch' ? pitchType : undefined,
            scope: scope === 'custom' ? 'range' : scope,
            season: scope === 'season' ? season : undefined,
            dateFrom: scope === 'custom' ? dateFrom : undefined,
            dateTo: scope === 'custom' ? dateTo : undefined,
            sources: sourceKey.replace('+bypitch', '').split(',').filter(Boolean),
            byPitch: wantByPitch,
            players: players.map(p => ({ mlbId: p.mlbId, lahmanId: p.lahmanId, ...(windowFor(p.uid) || {}) })),
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) throw new Error(json.error || `Load failed (${res.status})`)
        setData(json.players || [])
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Load failed'); setData([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [urlReady, group, pitchType, scope, season, dateFrom, dateTo, rangeReady, sourceKey, playerKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Saved presets (row layouts) ──
  const loadPresets = useCallback(async (g: CompareGroup) => {
    const { data } = await supabase
      .from('compare_presets')
      .select('id, name, player_group, config')
      .eq('player_group', g)
      .order('created_at', { ascending: true })
    setSavedPresets((data as SavedPreset[]) || [])
  }, [])

  useEffect(() => { loadPresets(group) }, [group, loadPresets])

  const savePreset = async () => {
    const name = window.prompt('Save current layout as preset')
    if (!name || !name.trim()) return
    setPresetBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Sign in to save presets'); return }
      const { error: err } = await supabase.from('compare_presets').insert({
        name: name.trim(),
        player_group: group,
        config: {
          sections: activeSections,
          closedRows,
          customMetrics: customRows.map(r => r.metricKey),
        },
        created_by: user.id,
      })
      if (err) { setError(err.message); return }
      await loadPresets(group)
    } finally {
      setPresetBusy(false)
    }
  }

  const applyPreset = (preset: SavedPreset) => {
    const cfg = preset.config || {}
    const valid = new Set(SECTIONS.map(sec => sec.id))
    setActiveSections((cfg.sections || []).filter(id => valid.has(id)))
    setClosedRows(cfg.closedRows || {})
    setCustomRows((cfg.customMetrics || [])
      .filter(k => METRICS[k])
      .map(k => ({ id: `row-${rowSeq.current++}`, metricKey: k })))
    setPresetMenuOpen(false)
  }

  const deletePreset = async (preset: SavedPreset) => {
    if (!window.confirm(`Delete preset "${preset.name}"?`)) return
    await supabase.from('compare_presets').delete().eq('id', preset.id)
    loadPresets(group)
  }

  const addPlayer = (p: ComparePlayerRef) => {
    // Duplicates are legal — two columns of one player with different
    // windows is the whole point of individual mode.
    setPlayers(prev => (prev.length >= MAX_PLAYERS ? prev : [...prev, { ...p, uid: `u${slotSeq.current++}` }]))
    setAdding(false)
  }
  const removePlayer = (uid: string) => {
    setPlayers(prev => prev.filter(p => p.uid !== uid))
    setWindowsByKey(({ [uid]: _dropped, ...rest }) => rest)
  }

  const toggleSection = (id: string) =>
    setActiveSections(prev => {
      if (prev.includes(id)) {
        // Off wipes the section's closed rows, so on brings the full list back.
        setClosedRows(({ [id]: _dropped, ...rest }) => rest)
        return prev.filter(s => s !== id)
      }
      return [...prev, id]
    })

  // ── PNG export ──
  const exportPng = useCallback(async () => {
    if (!tableRef.current) return
    setExporting(true)
    try {
      // Let React re-render without the interactive chrome (remove buttons,
      // row ✕s, pickers become text) before the canvas snapshot is taken.
      await new Promise(r => setTimeout(r, 80))
      const html2canvas = (await import('html2canvas-pro')).default
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#09090b',
        scale: 2,
        useCORS: true,
        imageTimeout: 15000,
      })
      const link = document.createElement('a')
      const who = players.map(p => p.name.split(' ').slice(-1)[0]).join('-vs-') || 'compare'
      link.download = `${who}-${scope === 'season' ? season : 'career'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [players, scope, season])

  // ── Layout ──
  const n = players.length
  // Two players get the Stathead centre-label layout; three or four cannot.
  const centreLabel = n === 2
  const gridStyle = centreLabel
    ? { gridTemplateColumns: '1fr minmax(120px, 190px) 1fr' }
    : { gridTemplateColumns: `minmax(120px, 190px) repeat(${Math.max(n, 1)}, 1fr)` }

  /** Cells in display order for one row: label placed per the layout above. */
  const orderCells = (label: React.ReactNode, cells: React.ReactNode[]) =>
    centreLabel ? [cells[0], label, cells[1]] : [label, ...cells]

  const visibleSections = SECTIONS.filter(s => activeSections.includes(s.id))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/compare" />
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Compare</h1>
            <p className="text-xs text-zinc-600">Up to four players, side by side</p>
          </div>
          <div className="flex-1" />
          <button
            onClick={exportPng}
            disabled={exporting || n === 0}
            className={`${btnCls} bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40`}
          >
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {(['hitting', 'pitching', 'pitch'] as const).map(g => (
              <button
                key={g}
                onClick={() => switchGroup(g)}
                className={`px-3.5 py-1 rounded text-sm font-semibold transition ${
                  group === g ? 'bg-emerald-600/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {g === 'hitting' ? 'Hitters' : g === 'pitching' ? 'Pitchers' : 'Pitch'}
              </button>
            ))}
          </div>

          {group === 'pitch' && (
            <select className={selCls} value={pitchType} onChange={e => setPitchType(e.target.value)}>
              {PITCH_TYPES.map(pt => <option key={pt.code} value={pt.code}>{pt.name}</option>)}
            </select>
          )}

          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {(['career', 'season', 'custom'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setScope(s); if (s === 'career') setTimeMode('global') }}
                className={`px-3.5 py-1 rounded text-sm font-semibold capitalize transition ${
                  scope === s ? 'bg-emerald-600/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {scope === 'season' && timeMode === 'global' && (
            <select className={selCls} value={season} onChange={e => setSeason(Number(e.target.value))}>
              {SEASONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}

          {scope === 'custom' && timeMode === 'global' && (
            <div className="flex items-center gap-1.5">
              <input type="date" className={selCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-zinc-600 text-sm">→</span>
              <input type="date" className={selCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              {!rangeReady && <span className="text-[11px] text-zinc-600">pick both dates</span>}
            </div>
          )}

          {loading && <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />}
        </div>

        {/* Section toggles */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider mr-1">Presets</span>
          {SECTIONS.map(s => {
            const on = activeSections.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggleSection(s.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  on
                    ? 'bg-emerald-600/15 border-emerald-600/50 text-emerald-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {on ? '✓ ' : ''}{s.label}
              </button>
            )
          })}

          {/* Saved layouts */}
          <div className="relative">
            <button
              onClick={() => setPresetMenuOpen(o => !o)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                presetMenuOpen
                  ? 'bg-sky-600/15 border-sky-600/50 text-sky-400'
                  : 'bg-zinc-900 border-zinc-800 text-sky-500/80 hover:text-sky-400'
              }`}
            >
              Custom ▾
            </button>
            {presetMenuOpen && (
              <div className="absolute top-full left-0 mt-1 z-40 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1">
                {savedPresets.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-500">No saved presets yet — set up your rows and hit Save preset.</div>
                )}
                {savedPresets.map(preset => (
                  <div key={preset.id} className="flex items-center hover:bg-zinc-700/40">
                    <button
                      onClick={() => applyPreset(preset)}
                      className="flex-1 text-left px-3 py-1.5 text-xs text-zinc-200 truncate"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => deletePreset(preset)}
                      className="px-2 text-zinc-600 hover:text-red-400 text-xs"
                      title="Delete preset"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={savePreset}
            disabled={presetBusy}
            className="px-2.5 py-1 rounded-full text-xs font-medium border bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 transition disabled:opacity-40"
          >
            {presetBusy ? 'Saving…' : 'Save preset'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Add player — above the graphic so the card stays export-clean */}
        <div className="flex items-center justify-center gap-3 mb-4">
          {adding ? (
            <div className="w-72">
              <ComparePlayerPicker
                group={group === 'hitting' ? 'hitting' : 'pitching'}
                autoFocus
                onSelect={addPlayer}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              disabled={n >= MAX_PLAYERS}
              className={`${btnCls} bg-emerald-600/15 border border-emerald-600/50 text-emerald-400 hover:bg-emerald-600/25 disabled:opacity-40`}
            >
              + Player
            </button>
          )}
          {n >= MAX_PLAYERS && (
            <span className="text-xs text-zinc-600 self-center">Four is the maximum — remove one to swap.</span>
          )}
        </div>

        {/* ── The comparison ── */}
        <div ref={tableRef} className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Player headers */}
          <div className="grid border-b border-zinc-800" style={gridStyle}>
            {orderCells(
              <div key="brand" className="relative flex items-center justify-center px-2 py-4">
                <button
                  onClick={() => { if (scope !== 'career') setTimeMenuOpen(o => !o) }}
                  className={`text-[11px] uppercase tracking-[0.2em] font-semibold text-center transition ${
                    scope === 'career' ? 'text-zinc-600 cursor-default' : 'text-zinc-500 hover:text-emerald-400'
                  }`}
                  title={scope === 'career' ? undefined : 'Global or per-player time window'}
                >
                  {individual
                    ? 'Individual'
                    : scope === 'season'
                      ? season
                      : scope === 'custom'
                        ? (dateFrom && dateTo ? `${shortDate(dateFrom)}–${shortDate(dateTo)}` : 'Custom')
                        : group === 'pitch'
                          ? (PITCH_TYPES.find(pt => pt.code === pitchType)?.name ?? 'Career')
                          : 'Career'}
                </button>
                {timeMenuOpen && scope !== 'career' && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-40 w-44 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1">
                    {([['global', 'Global', 'One window for everyone'], ['individual', 'Individual', 'A window per player']] as const).map(([mode, label, tip]) => (
                      <button
                        key={mode}
                        onClick={() => { setTimeMode(mode); setTimeMenuOpen(false) }}
                        className={`w-full text-left px-3 py-1.5 transition hover:bg-zinc-700/40 ${timeMode === mode ? 'text-emerald-400' : 'text-zinc-300'}`}
                      >
                        <div className="text-xs font-semibold normal-case tracking-normal">{timeMode === mode ? '✓ ' : ''}{label}</div>
                        <div className="text-[10px] text-zinc-500 normal-case tracking-normal">{tip}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>,
              Array.from({ length: Math.max(n, 1) }, (_, i) => {
                const p = players[i]
                if (!p) {
                  return (
                    <div key="empty" className="px-4 py-10 text-center text-sm text-zinc-600">
                      Add a player to start.
                    </div>
                  )
                }
                const payload = data[i]
                const team = payload?.team || p.team
                const colour = (team && TEAM_COLORS[team]?.primary) || '#3f3f46'
                return (
                  <div key={p.uid} className="relative px-3 pt-4 pb-3 flex flex-col items-center gap-1.5">
                    {!exporting && (
                      <button
                        onClick={() => removePlayer(p.uid)}
                        className="absolute top-2 right-2 text-zinc-700 hover:text-red-400 text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                    {p.mlbId != null ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={headshot(p.mlbId)}
                        alt={p.name}
                        crossOrigin="anonymous"
                        className="w-20 h-20 rounded-full object-cover border-2"
                        style={{ borderColor: colour }}
                      />
                    ) : (
                      <div
                        className="w-20 h-20 rounded-full border-2 flex items-center justify-center text-lg font-bold text-zinc-400 bg-zinc-800"
                        style={{ borderColor: colour }}
                      >
                        {p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                    )}
                    <div className="text-sm font-bold text-center leading-tight">{p.name || payload?.name}</div>
                    <div className="text-[11px] text-zinc-500 tabular-nums">
                      {payload?.debut
                        ? `${payload.debut.slice(0, 4)}–${payload.active ? '' : payload.finalGame?.slice(0, 4) ?? ''}`
                        : p.years || ''}
                      {team ? ` · ${team}` : ''}
                    </div>
                    {individual && scope === 'season' && exporting && (
                      <div className="text-[11px] text-emerald-500/90 font-semibold tabular-nums">
                        {windowsByKey[p.uid]?.season ?? season}
                      </div>
                    )}
                    {individual && scope === 'custom' && exporting && (
                      <div className="text-[11px] text-emerald-500/90 font-semibold tabular-nums">
                        {shortDate(windowsByKey[p.uid]?.from ?? (dateFrom || '1900-01-01'))}–{shortDate(windowsByKey[p.uid]?.to ?? (dateTo || '1900-01-01'))}
                      </div>
                    )}
                    {individual && scope === 'season' && !exporting && (
                      <select
                        className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200"
                        value={windowsByKey[p.uid]?.season ?? season}
                        onChange={e => setWindowsByKey(w => ({ ...w, [p.uid]: { season: Number(e.target.value) } }))}
                      >
                        {SEASONS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    )}
                    {individual && scope === 'custom' && !exporting && (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 w-[110px]"
                          value={windowsByKey[p.uid]?.from ?? dateFrom}
                          onChange={e => setWindowsByKey(w => ({ ...w, [p.uid]: { ...w[p.uid], season: undefined, from: e.target.value, to: w[p.uid]?.to ?? dateTo } }))}
                        />
                        <input
                          type="date"
                          className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-zinc-200 w-[110px]"
                          value={windowsByKey[p.uid]?.to ?? dateTo}
                          onChange={e => setWindowsByKey(w => ({ ...w, [p.uid]: { ...w[p.uid], season: undefined, from: w[p.uid]?.from ?? dateFrom, to: e.target.value } }))}
                        />
                      </div>
                    )}
                    <div className="h-0.5 w-10 rounded-full" style={{ backgroundColor: colour }} />
                  </div>
                )
              }),
            )}
          </div>

          {/* Sections */}
          {n > 0 && visibleSections.map(section => (
            <div key={section.id}>
              <div className="bg-zinc-800/60 border-y border-zinc-800 px-3 py-1.5 text-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {section.label}
                </div>
                {section.note && (
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    {section.note}
                    {scope === 'custom' && (section.source === 'triton' || section.source === 'awards') &&
                      ' · season-level source — a date range widens to the seasons it touches'}
                  </div>
                )}
              </div>
              {section.special ? (
                <ByPitchBand kind={section.special} data={data} n={n} gridStyle={gridStyle} centreLabel={centreLabel} />
              ) : section.metrics.filter(key => !closedRows[section.id]?.includes(key)).map(key => {
                const metric = METRICS[key]
                if (!metric) return null
                return (
                  <StatRow
                    key={key}
                    metric={metric}
                    data={data}
                    n={n}
                    gridStyle={gridStyle}
                    centreLabel={centreLabel}
                    exporting={exporting}
                    onClose={() => setClosedRows(cr => ({ ...cr, [section.id]: [...(cr[section.id] || []), key] }))}
                  />
                )
              })}
            </div>
          ))}

          {/* Custom rows */}
          {n > 0 && !(exporting && customRows.length === 0) && (
            <div>
              <div className="bg-zinc-800/60 border-y border-zinc-800 px-3 py-1.5 text-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">Custom</div>
              </div>
              {customRows.map(row => {
                const metric = METRICS[row.metricKey]
                return (
                  <div key={row.id} className="grid items-stretch border-b border-zinc-800/60 last:border-b-0" style={gridStyle}>
                    {orderCells(
                      exporting ? (
                        <div key="label" className="px-3 py-1.5 text-center text-xs font-semibold text-zinc-400 bg-zinc-900/60 self-center">
                          {metric?.label ?? ''}
                        </div>
                      ) : (
                      <div key="label" className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900/60">
                        <select
                          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200"
                          value={row.metricKey}
                          onChange={e => setCustomRows(rs =>
                            rs.map(r => (r.id === row.id ? { ...r, metricKey: e.target.value } : r)))}
                        >
                          {Object.values(METRICS).map(mt => (
                            <option key={mt.key} value={mt.key}>
                              {mt.label} · {mt.source === 'lahman' ? 'Lahman' : mt.source === 'statcast' ? 'Statcast' : mt.source === 'triton' ? 'Triton' : 'Awards'}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setCustomRows(rs => rs.filter(r => r.id !== row.id))}
                          className="text-zinc-600 hover:text-red-400 text-xs px-0.5"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </div>
                      ),
                      metric
                        ? cellsFor(metric, data, n)
                        : Array.from({ length: n }, (_, i) => <div key={i} />),
                    )}
                  </div>
                )
              })}
              {!exporting && (
                <div className="px-3 py-2">
                  <button
                    onClick={() => setCustomRows(rs => [
                      ...rs,
                      { id: `row-${rowSeq.current++}`, metricKey: Object.keys(METRICS)[0] },
                    ])}
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                  >
                    + Add row
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Row rendering ───────────────────────────────────────────────────────────

/** Value cells for one metric, with the winner shaded. */
function cellsFor(metric: CompareMetric, data: PlayerPayload[], n: number) {
  const values = Array.from({ length: n }, (_, i) => valueOf(data[i], metric))
  const winners = new Set(winningIndices(metric, values))
  return values.map((v, i) => (
    <div
      key={i}
      className={`px-3 py-1.5 text-center text-sm tabular-nums ${
        winners.has(i)
          ? 'bg-emerald-600/15 text-emerald-300 font-bold'
          : 'text-zinc-300'
      }`}
    >
      {formatCompareValue(metric, v)}
    </div>
  ))
}

// ── Per-pitch-type band (Arsenal / vs Pitch Type) ───────────────────────────
//
// Arsenals differ between players, so these rows cannot align across columns.
// Each player's cell renders its own compact table instead — every column the
// Overview page shows, horizontally scrollable where four players squeeze it.

const ARSENAL_COLS: { k: string; l: string; d?: number }[] = [
  { k: 'pitch_name', l: 'Pitch' }, { k: 'count', l: '#' }, { k: 'usage_pct', l: 'Use%', d: 1 },
  { k: 'avg_velo', l: 'Velo', d: 1 }, { k: 'max_velo', l: 'Max', d: 1 }, { k: 'avg_spin', l: 'Spin', d: 0 },
  { k: 'hb', l: 'HB', d: 1 }, { k: 'ivb', l: 'IVB', d: 1 }, { k: 'ext', l: 'Ext', d: 2 },
  { k: 'arm_angle', l: 'Arm°', d: 1 }, { k: 'whiff_pct', l: 'Whiff%', d: 1 }, { k: 'cs_pct', l: 'CSt%', d: 1 },
  { k: 'avg_ev', l: 'EV', d: 1 }, { k: 'avg_xba', l: 'xBA', d: 3 },
  { k: 'brink', l: 'Brink', d: 1 }, { k: 'cluster', l: 'Cluster', d: 1 },
  { k: 'brink_plus', l: 'Brink+', d: 0 }, { k: 'cluster_plus', l: 'Cluster+', d: 0 },
  { k: 'stuff_plus', l: 'Stuff+', d: 0 },
]

const MOVEMENT_COLS: { k: string; l: string; d?: number }[] = [
  { k: 'pitch_name', l: 'Pitch' }, { k: 'count', l: '#' }, { k: 'usage_pct', l: 'Use%', d: 1 },
  { k: 'avg_velo', l: 'Velo', d: 1 }, { k: 'avg_spin', l: 'Spin', d: 0 },
  { k: 'ivb', l: 'IVB', d: 1 }, { k: 'hb', l: 'HB', d: 1 }, { k: 'ext', l: 'Ext', d: 2 },
  { k: 'arm_angle', l: 'Arm°', d: 1 }, { k: 'rel_h', l: 'Rel H', d: 2 }, { k: 'rel_s', l: 'Rel S', d: 2 },
]

const VSPITCH_COLS: { k: string; l: string; d?: number }[] = [
  { k: 'pitch_name', l: 'Pitch' }, { k: 'count', l: '#' }, { k: 'faced_pct', l: 'Faced%', d: 1 },
  { k: 'avg_velo', l: 'Velo', d: 1 }, { k: 'whiff_pct', l: 'Whiff%', d: 1 }, { k: 'ba', l: 'BA', d: 3 },
  { k: 'avg_ev', l: 'Avg EV', d: 1 }, { k: 'max_ev', l: 'Max EV', d: 1 }, { k: 'avg_la', l: 'Avg LA', d: 1 },
  { k: 'avg_xba', l: 'xBA', d: 3 }, { k: 'avg_xwoba', l: 'xwOBA', d: 3 },
]

function fmtCell(v: unknown, d?: number): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!isFinite(n)) return String(v)
  if (d === 3) { const t = n.toFixed(3); return t.startsWith('0.') ? t.slice(1) : t }
  return d != null ? n.toFixed(d) : String(n)
}

function ByPitchBand({
  kind, data, n, gridStyle, centreLabel,
}: {
  kind: 'arsenal' | 'vspitch' | 'movement'
  data: PlayerPayload[]
  n: number
  gridStyle: React.CSSProperties
  centreLabel: boolean
}) {
  const cols = kind === 'arsenal' ? ARSENAL_COLS : kind === 'movement' ? MOVEMENT_COLS : VSPITCH_COLS
  const cells = Array.from({ length: n }, (_, i) => {
    const rows = data[i]?.byPitch
    return (
      <div key={i} className="px-2 py-2 min-w-0">
        {!rows || rows.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-600">—</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-zinc-500">
                  {cols.map(c => (
                    <th key={c.k} className={`px-1.5 py-0.5 font-medium whitespace-nowrap ${c.k === 'pitch_name' ? 'text-left' : 'text-right'}`}>
                      {c.l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={String(r.pitch_name)} className="border-t border-zinc-800/50">
                    {cols.map(c => (
                      <td key={c.k} className={`px-1.5 py-0.5 whitespace-nowrap ${c.k === 'pitch_name' ? 'text-left text-zinc-200 font-medium' : 'text-right text-zinc-400'}`}>
                        {c.k === 'pitch_name' ? String(r.pitch_name ?? '—') : fmtCell(r[c.k], c.d)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  })

  return (
    <div className="grid items-start border-b border-zinc-800/60 last:border-b-0" style={gridStyle}>
      {centreLabel ? [cells[0], <div key="spacer" className="bg-zinc-900/60 self-stretch" />, cells[1]] : [<div key="spacer" className="bg-zinc-900/60 self-stretch" />, ...cells]}
    </div>
  )
}

function StatRow({
  metric, data, n, gridStyle, centreLabel, exporting = false, onClose,
}: {
  metric: CompareMetric
  data: PlayerPayload[]
  n: number
  gridStyle: React.CSSProperties
  centreLabel: boolean
  exporting?: boolean
  onClose?: () => void
}) {
  const cells = cellsFor(metric, data, n)
  const label = (
    <div key="label" className="relative px-3 py-1.5 text-center text-xs font-semibold text-zinc-400 bg-zinc-900/60">
      {metric.label}
      {onClose && !exporting && (
        <button
          onClick={onClose}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-red-400 text-[10px] opacity-0 group-hover/statrow:opacity-100 transition-opacity"
          title="Remove row (re-toggle the section to restore)"
        >
          ✕
        </button>
      )}
    </div>
  )
  return (
    <div className="group/statrow grid items-stretch border-b border-zinc-800/60 last:border-b-0" style={gridStyle}>
      {centreLabel ? [cells[0], label, cells[1]] : [label, ...cells]}
    </div>
  )
}
