'use client'

// Videos — pitch video archive search (More → Videos).
//
// Same system as Mayday Studio's Pitch Video Search tool: left filter
// column, results table with per-row selection, a global History drawer
// (collapsed by default; every search logged to pitch_video_searches and
// clicking an entry re-fills the filters), a review modal that plays
// archived clips from the Mayday NAS — or live-resolves the Savant CDN mp4
// for unarchived pitches — plus single/batch local downloads named
// "[Pitcher] to [Hitter] [Pitch Type] [Count] [Outcome].mp4".
//
// Data comes from our own /api/pitch-video (session cookie auth); the page
// never needs a consumer key.

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import PlayerSearchInput from '@/components/PlayerSearchInput'
import type { PlayerResult } from '@/lib/types'

const PITCH_TYPES: [string, string][] = [
  ['FF', 'Four-Seam'], ['SI', 'Sinker'], ['FC', 'Cutter'],
  ['SL', 'Slider'], ['ST', 'Sweeper'], ['SV', 'Slurve'],
  ['CU', 'Curveball'], ['KC', 'Knuckle Curve'], ['CH', 'Changeup'],
  ['FS', 'Splitter'], ['KN', 'Knuckleball'], ['EP', 'Eephus'],
]

const EVENTS = [
  'home_run', 'strikeout', 'single', 'double', 'triple', 'walk',
  'field_out', 'force_out', 'grounded_into_double_play', 'sac_fly',
  'hit_by_pitch', 'field_error',
]

const DESCRIPTIONS = [
  'swinging_strike', 'swinging_strike_blocked', 'called_strike',
  'foul', 'foul_tip', 'ball', 'blocked_ball', 'hit_into_play', 'missed_bunt',
]

interface Filters {
  pitcher: { id: number | null; name: string }
  batter: { id: number | null; name: string }
  team: string
  pitchTypes: string[]
  event: string
  description: string
  dateFrom: string
  dateTo: string
  gameYear: string
  veloMin: string
  veloMax: string
  stand: string
  pThrows: string
  balls: string
  strikes: string
  inning: string
  onlyArchived: boolean
}

const EMPTY_FILTERS: Filters = {
  pitcher: { id: null, name: '' },
  batter: { id: null, name: '' },
  team: '',
  pitchTypes: [],
  event: '',
  description: '',
  dateFrom: '',
  dateTo: '',
  gameYear: '',
  veloMin: '',
  veloMax: '',
  stand: '',
  pThrows: '',
  balls: '',
  strikes: '',
  inning: '',
  onlyArchived: true,
}

interface VideoRow {
  game_pk: number
  game_date: string
  at_bat_number: number
  pitch_number: number
  player_name: string
  batter_name: string
  pitch_type: string | null
  pitch_name: string | null
  release_speed: number | null
  balls: number | null
  strikes: number | null
  outs_when_up: number | null
  inning: number | null
  inning_topbot: string | null
  home_team: string
  away_team: string
  events: string | null
  description: string | null
  launch_speed: number | null
  launch_angle: number | null
  status: string
  video_url: string | null
  savant_url: string | null
}

interface HistoryEntry {
  id: string
  user_id: string | null
  user_name: string | null
  filters: Filters
  result_count: number | null
  created_at: string
}

const label = (s: string | null) => String(s || '').replace(/_/g, ' ')
const titleCase = (s: string | null) => label(s).replace(/\b\w/g, c => c.toUpperCase())

// "Palmquist, Carson" → "Carson Palmquist"
function flipName(name: string | null): string {
  const parts = String(name || '').split(',')
  if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`
  return String(name || '').trim()
}

const outcome = (row: VideoRow) => titleCase(row.events || row.description || 'Unknown')

// [Pitcher] to [Hitter] [Pitch Type] [Count] [Outcome].mp4
function clipFilename(row: VideoRow): string {
  const raw = `${flipName(row.player_name)} to ${flipName(row.batter_name)} ${row.pitch_type || 'NA'} ${row.balls ?? '-'}-${row.strikes ?? '-'} ${outcome(row)}`
  return `${raw.replace(/[^\w\-. ]+/g, '').replace(/\s+/g, ' ').trim()}.mp4`
}

const rowKey = (row: VideoRow) => `${row.game_pk}-${row.at_bat_number}-${row.pitch_number}`

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function summarizeFilters(f: Partial<Filters>): string {
  const bits: string[] = []
  if (f.pitcher?.name) bits.push(f.pitcher.name)
  if (f.batter?.name) bits.push(`vs ${f.batter.name}`)
  if (f.team) bits.push(f.team)
  if (f.pitchTypes?.length) bits.push(f.pitchTypes.join('/'))
  if (f.event) bits.push(label(f.event))
  if (f.description) bits.push(label(f.description))
  if (f.gameYear) bits.push(f.gameYear)
  if (f.dateFrom || f.dateTo) bits.push(`${f.dateFrom || '…'}→${f.dateTo || '…'}`)
  if (f.veloMin || f.veloMax) bits.push(`${f.veloMin || '…'}–${f.veloMax || '…'} mph`)
  if (f.balls) bits.push(`${f.balls}-${f.strikes || 'x'}`)
  else if (f.strikes) bits.push(`x-${f.strikes}`)
  if (f.stand) bits.push(`bat ${f.stand}`)
  if (f.pThrows) bits.push(`thr ${f.pThrows}`)
  if (f.inning) bits.push(`inn ${f.inning}`)
  return bits.length ? bits.join(' · ') : 'all pitches'
}

const inputCls = 'w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200'
const labelCls = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block'
const btnCls = 'px-3 py-1.5 rounded text-sm font-medium transition'

export default function VideosPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [pitcherSel, setPitcherSel] = useState<PlayerResult | null>(null)
  const [batterSel, setBatterSel] = useState<PlayerResult | null>(null)
  const [rows, setRows] = useState<VideoRow[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<{ clips: VideoRow[]; index: number } | null>(null)
  const [savantMp4, setSavantMp4] = useState<Record<string, string | null>>({})
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [batch, setBatch] = useState<{ done: number; total: number; failed: number } | null>(null)
  const batchCancelRef = useRef(false)

  const setF = (patch: Partial<Filters>) => setFilters(f => ({ ...f, ...patch }))

  // Keep the PlayerSearchInput selections mirrored into filters (so history
  // refill can also restore them the other way).
  useEffect(() => {
    setF({ pitcher: { id: pitcherSel?.pitcher ?? null, name: pitcherSel?.player_name ?? '' } })
  }, [pitcherSel])
  useEffect(() => {
    setF({ batter: { id: batterSel?.batter ?? null, name: batterSel?.player_name ?? '' } })
  }, [batterSel])

  // ── History: load + realtime ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('pitch_video_searches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!cancelled && data) setHistory(data as HistoryEntry[])
    })()

    const channel = supabase
      .channel('pitch_video_searches_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pitch_video_searches' }, payload => {
        setHistory(h => [payload.new as HistoryEntry, ...h].slice(0, 50))
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  const logSearch = useCallback(async (f: Filters, resultCount: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const latestOwn = history.find(h => h.user_id === user.id)
      if (latestOwn && JSON.stringify(latestOwn.filters) === JSON.stringify(f)) return
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      await supabase.from('pitch_video_searches').insert({
        user_id: user.id,
        user_name: prof?.full_name || user.email,
        filters: f,
        result_count: resultCount,
      })
    } catch { /* history is best-effort */ }
  }, [history])

  const applyHistoryEntry = (entry: HistoryEntry) => {
    const f = { ...EMPTY_FILTERS, ...(entry.filters || {}) }
    setFilters(f)
    setPitcherSel(f.pitcher?.id ? ({ player_name: f.pitcher.name, pitcher: f.pitcher.id, team: '', total_pitches: 0 } as PlayerResult) : null)
    setBatterSel(f.batter?.id ? ({ player_name: f.batter.name, batter: f.batter.id, team: '', total_pitches: 0 } as PlayerResult) : null)
  }

  // ── Search ──
  const buildQuery = useCallback(() => {
    const q = new URLSearchParams()
    const f = filters
    if (f.pitcher.id) q.set('pitcher', String(f.pitcher.id))
    if (f.batter.id) q.set('batter', String(f.batter.id))
    if (f.team.trim()) q.set('team', f.team.trim().toUpperCase())
    if (f.pitchTypes.length) q.set('pitch_type', f.pitchTypes.join(','))
    if (f.event) q.set('event', f.event)
    if (f.description) q.set('description', f.description)
    if (f.dateFrom) q.set('date_from', f.dateFrom)
    if (f.dateTo) q.set('date_to', f.dateTo)
    if (f.gameYear) q.set('game_year', f.gameYear)
    if (f.veloMin) q.set('velo_min', f.veloMin)
    if (f.veloMax) q.set('velo_max', f.veloMax)
    if (f.stand) q.set('stand', f.stand)
    if (f.pThrows) q.set('p_throws', f.pThrows)
    if (f.balls !== '') q.set('balls', f.balls)
    if (f.strikes !== '') q.set('strikes', f.strikes)
    if (f.inning !== '') q.set('inning', f.inning)
    if (f.onlyArchived) q.set('only_archived', 'true')
    q.set('limit', '200')
    return q
  }, [filters])

  const runSearch = async () => {
    const q = buildQuery()
    const meaningful = [...q.keys()].filter(k => !['limit', 'offset'].includes(k))
    if (meaningful.length === 0) {
      setSearchError('Set at least one filter first.')
      return
    }
    setSearching(true)
    setSearchError(null)
    setSelectedKeys(new Set())
    try {
      const res = await fetch(`/api/pitch-video?${q.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Search failed (${res.status})`)
      const result: VideoRow[] = json.rows || []
      setRows(result)
      logSearch(filters, result.length)
    } catch (err: any) {
      setSearchError(err.message || 'Search failed')
      setRows(null)
    } finally {
      setSearching(false)
    }
  }

  // ── Selection ──
  const archivedRows = (rows || []).filter(r => r.video_url)
  const selectedRows = archivedRows.filter(r => selectedKeys.has(rowKey(r)))
  const allSelected = archivedRows.length > 0 && selectedRows.length === archivedRows.length

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set(archivedRows.map(rowKey)))
  }

  // ── Downloads ──
  const downloadClip = async (row: VideoRow): Promise<boolean> => {
    if (!row.video_url) return false
    try {
      const res = await fetch(row.video_url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = clipFilename(row)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return true
    } catch {
      window.open(row.video_url, '_blank', 'noopener')
      return false
    }
  }

  const runBatchDownload = async (targets: VideoRow[]) => {
    if (!targets.length) return
    batchCancelRef.current = false
    setBatch({ done: 0, total: targets.length, failed: 0 })
    for (let i = 0; i < targets.length; i++) {
      if (batchCancelRef.current) break
      const ok = await downloadClip(targets[i])
      setBatch(b => b && ({ ...b, done: i + 1, failed: b.failed + (ok ? 0 : 1) }))
    }
    setBatch(null)
  }

  // ── Modal ──
  const openSingle = (row: VideoRow) => setModal({ clips: [row], index: 0 })
  const openPlaylist = () => { if (selectedRows.length) setModal({ clips: selectedRows, index: 0 }) }
  const modalClip = modal ? modal.clips[modal.index] : null
  const modalNext = () => setModal(m => m && ({ ...m, index: Math.min(m.index + 1, m.clips.length - 1) }))
  const modalPrev = () => setModal(m => m && ({ ...m, index: Math.max(m.index - 1, 0) }))

  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null)
      if (e.key === 'ArrowRight') modalNext()
      if (e.key === 'ArrowLeft') modalPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  // Live-resolve the Savant CDN mp4 for unarchived clips opened in the modal.
  useEffect(() => {
    const clip = modal ? modal.clips[modal.index] : null
    if (!clip || clip.video_url) return
    const key = rowKey(clip)
    if (savantMp4[key] !== undefined) return
    let cancelled = false
    ;(async () => {
      setResolvingKey(key)
      try {
        const res = await fetch(
          `/api/pitch-video?game_pk=${clip.game_pk}&ab=${clip.at_bat_number}&pitch=${clip.pitch_number}&resolve_mp4=true`,
        )
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setSavantMp4(m => ({ ...m, [key]: json?.row?.savant_mp4_url || null }))
      } catch {
        if (!cancelled) setSavantMp4(m => ({ ...m, [key]: null }))
      } finally {
        if (!cancelled) setResolvingKey(k => (k === key ? null : k))
      }
    })()
    return () => { cancelled = true }
  }, [modal, savantMp4])

  // ── Render ──
  return (
    <div className="max-w-[1500px] mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Videos</h1>
          <p className="text-xs text-zinc-600">Pitch video archive — search, review, download</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setDrawerOpen(o => !o)}
          className={`${btnCls} border ${drawerOpen ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
        >
          History
        </button>
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Left: filters ── */}
        <div className="w-[260px] shrink-0 space-y-3">
          <div>
            <PlayerSearchInput
              type="pitcher"
              value={pitcherSel}
              onSelect={p => setPitcherSel(p)}
              onClear={() => setPitcherSel(null)}
              label="Pitcher"
              placeholder="Search pitchers…"
            />
          </div>
          <div>
            <PlayerSearchInput
              type="batter"
              value={batterSel}
              onSelect={p => setBatterSel(p)}
              onClear={() => setBatterSel(null)}
              label="Batter"
              placeholder="Search batters…"
            />
          </div>
          <div>
            <label className={labelCls}>Team</label>
            <input className={inputCls} value={filters.team} maxLength={3} placeholder="e.g. PIT"
              onChange={e => setF({ team: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Pitch types</label>
            <div className="flex flex-wrap gap-1.5">
              {PITCH_TYPES.map(([code, name]) => {
                const on = filters.pitchTypes.includes(code)
                return (
                  <button
                    key={code}
                    title={name}
                    onClick={() => setF({
                      pitchTypes: on ? filters.pitchTypes.filter(c => c !== code) : [...filters.pitchTypes, code],
                    })}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition ${on ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {code}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className={labelCls}>Result (event)</label>
            <select className={inputCls} value={filters.event} onChange={e => setF({ event: e.target.value })}>
              <option value="">Any</option>
              {EVENTS.map(ev => <option key={ev} value={ev}>{label(ev)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Pitch result</label>
            <select className={inputCls} value={filters.description} onChange={e => setF({ description: e.target.value })}>
              <option value="">Any</option>
              {DESCRIPTIONS.map(d => <option key={d} value={d}>{label(d)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Season</label>
            <input className={inputCls} value={filters.gameYear} placeholder="2026"
              onChange={e => setF({ gameYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </div>
          <div>
            <label className={labelCls}>Date from / to</label>
            <input type="date" className={`${inputCls} [color-scheme:dark]`} value={filters.dateFrom}
              onChange={e => setF({ dateFrom: e.target.value })} />
            <input type="date" className={`${inputCls} mt-1.5 [color-scheme:dark]`} value={filters.dateTo}
              onChange={e => setF({ dateTo: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Velo (mph)</label>
            <div className="flex gap-1.5">
              <input className={inputCls} value={filters.veloMin} placeholder="min"
                onChange={e => setF({ veloMin: e.target.value.replace(/[^\d.]/g, '') })} />
              <input className={inputCls} value={filters.veloMax} placeholder="max"
                onChange={e => setF({ veloMax: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Count (B-S)</label>
            <div className="flex gap-1.5">
              <select className={inputCls} value={filters.balls} onChange={e => setF({ balls: e.target.value })}>
                <option value="">B</option>
                {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select className={inputCls} value={filters.strikes} onChange={e => setF({ strikes: e.target.value })}>
                <option value="">S</option>
                {[0, 1, 2].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Sides</label>
            <div className="flex gap-1.5">
              <select className={inputCls} value={filters.stand} onChange={e => setF({ stand: e.target.value })}>
                <option value="">Bat: any</option>
                <option value="L">Bat: L</option>
                <option value="R">Bat: R</option>
              </select>
              <select className={inputCls} value={filters.pThrows} onChange={e => setF({ pThrows: e.target.value })}>
                <option value="">Thr: any</option>
                <option value="L">Thr: L</option>
                <option value="R">Thr: R</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Inning</label>
            <input className={inputCls} value={filters.inning} placeholder="any"
              onChange={e => setF({ inning: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={filters.onlyArchived} onChange={e => setF({ onlyArchived: e.target.checked })} />
            Archived only
          </label>
          <div className="flex gap-2 pt-1">
            <button
              className={`${btnCls} bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200`}
              onClick={() => { setFilters(EMPTY_FILTERS); setPitcherSel(null); setBatterSel(null) }}
            >
              Clear
            </button>
            <button
              className={`${btnCls} flex-1 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50`}
              onClick={runSearch}
              disabled={searching}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {searchError && <div className="text-sm text-red-400">{searchError}</div>}
        </div>

        {/* ── Center: results ── */}
        <div className="flex-1 min-w-0">
          {rows === null ? (
            <div className="py-24 text-center text-sm text-zinc-600">Set filters on the left and run a search.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                <span className="text-sm text-zinc-500">
                  {rows.length} pitches · {archivedRows.length} with video
                  {selectedRows.length > 0 && ` · ${selectedRows.length} selected`}
                </span>
                <div className="flex-1" />
                {batch ? (
                  <>
                    <span className="text-sm text-emerald-400">
                      Downloading {batch.done}/{batch.total}{batch.failed ? ` (${batch.failed} failed)` : ''}
                    </span>
                    <button className={`${btnCls} bg-zinc-900 border border-zinc-700 text-zinc-400`}
                      onClick={() => { batchCancelRef.current = true }}>
                      Cancel
                    </button>
                  </>
                ) : selectedRows.length > 0 ? (
                  <>
                    <button className={`${btnCls} bg-emerald-600/20 border border-emerald-600 text-emerald-400`} onClick={openPlaylist}>View selected</button>
                    <button className={`${btnCls} bg-emerald-600/20 border border-emerald-600 text-emerald-400`} onClick={() => runBatchDownload(selectedRows)}>Download</button>
                    <button className={`${btnCls} bg-zinc-900 border border-zinc-700 text-zinc-400`} onClick={() => setSelectedKeys(new Set())}>Clear</button>
                  </>
                ) : archivedRows.length > 0 && (
                  <button className={`${btnCls} bg-emerald-600/20 border border-emerald-600 text-emerald-400`} onClick={() => runBatchDownload(archivedRows)}>
                    Download all ({archivedRows.length})
                  </button>
                )}
              </div>

              <div className="overflow-auto rounded-lg border border-zinc-800 max-h-[calc(100vh-220px)]">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all with video" />
                      </th>
                      {['Date', 'Pitcher', 'Batter', 'Pitch', 'Velo', 'Count', 'Inn', 'Result', ''].map((h, i) => (
                        <th key={i} className="px-2 py-2 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const key = rowKey(row)
                      const checked = selectedKeys.has(key)
                      return (
                        <tr
                          key={key}
                          onClick={() => openSingle(row)}
                          className={`cursor-pointer border-b border-zinc-800/60 hover:bg-zinc-900/60 ${checked ? 'bg-emerald-600/10' : ''}`}
                        >
                          <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                            {row.video_url && (
                              <input type="checkbox" checked={checked} onChange={() => toggleKey(key)} />
                            )}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-zinc-300">{row.game_date}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-zinc-200">{row.player_name}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-zinc-200">{row.batter_name}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{row.pitch_type || '—'}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{row.release_speed ? row.release_speed.toFixed(1) : '—'}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{row.balls ?? '–'}-{row.strikes ?? '–'}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{row.inning ?? '—'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap capitalize text-zinc-300">{outcome(row)}</td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {row.video_url ? (
                              <button
                                className="inline-flex items-center justify-center w-6 h-6 rounded border border-zinc-700 text-emerald-400 hover:bg-zinc-800"
                                title="Download clip"
                                onClick={() => downloadClip(row)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                </svg>
                              </button>
                            ) : (
                              <span className="text-[11px] italic text-zinc-600" title={`Status: ${row.status}`}>{row.status}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && (
                      <tr><td colSpan={10} className="px-2 py-8 text-center text-zinc-600">No pitches matched these filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Right: history drawer ── */}
        {drawerOpen && (
          <div className="w-[300px] shrink-0 rounded-lg border border-zinc-800 max-h-[calc(100vh-160px)] flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
              <span className="text-sm font-semibold">Search History</span>
              <button className="text-zinc-500 hover:text-zinc-300 text-lg leading-none" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
              {history.length === 0 && <div className="py-8 text-center text-sm text-zinc-600">No searches yet.</div>}
              {history.map(entry => (
                <button
                  key={entry.id}
                  className="block w-full text-left rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 px-3 py-2"
                  onClick={() => applyHistoryEntry(entry)}
                >
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs font-semibold text-emerald-400">{entry.user_name || 'Unknown'}</span>
                    <span className="text-[11px] text-zinc-600">{timeAgo(entry.created_at)}</span>
                  </div>
                  <div className="text-xs text-zinc-300 leading-snug">{summarizeFilters(entry.filters || {})}</div>
                  {entry.result_count != null && (
                    <div className="text-[11px] text-zinc-600 mt-0.5">{entry.result_count} results</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Review modal ── */}
      {modal && modalClip && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setModal(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[720px] max-w-[92vw] max-h-[90vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="text-[15px] font-bold">
                {flipName(modalClip.player_name)} to {flipName(modalClip.batter_name)}
                <span className="font-normal text-zinc-500 text-[13px]">
                  {' '}· {modalClip.pitch_name || modalClip.pitch_type}{modalClip.release_speed ? ` ${modalClip.release_speed.toFixed(1)} mph` : ''}
                  {' '}· {modalClip.balls ?? '–'}-{modalClip.strikes ?? '–'} · {outcome(modalClip)}
                </span>
              </div>
              <button className="text-zinc-500 hover:text-zinc-300 text-xl leading-none px-1" onClick={() => setModal(null)}>×</button>
            </div>
            {(modalClip.video_url || savantMp4[rowKey(modalClip)]) ? (
              <video
                key={rowKey(modalClip)}
                src={modalClip.video_url || savantMp4[rowKey(modalClip)] || undefined}
                controls
                autoPlay
                onEnded={() => { if (modal.index < modal.clips.length - 1) modalNext() }}
                className="w-full rounded-lg bg-black"
              />
            ) : resolvingKey === rowKey(modalClip) ? (
              <div className="py-16 text-center text-sm text-zinc-500 bg-zinc-950/60 rounded-lg">Loading clip from Savant…</div>
            ) : (
              <div className="py-16 text-center text-sm text-zinc-500 bg-zinc-950/60 rounded-lg">
                No clip available for this pitch ({modalClip.status}).{' '}
                <a href={modalClip.savant_url || '#'} target="_blank" rel="noreferrer" className="text-emerald-400">Try Savant</a>
              </div>
            )}
            <div className="flex items-center gap-2.5 mt-3 flex-wrap">
              <span className="text-xs text-zinc-500">
                {modalClip.away_team} @ {modalClip.home_team} · {modalClip.game_date} · {modalClip.inning_topbot} {modalClip.inning}
              </span>
              <div className="flex-1" />
              {modal.clips.length > 1 && (
                <>
                  <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={modalPrev} disabled={modal.index === 0}>‹ Prev</button>
                  <span className="text-sm text-zinc-400 min-w-[52px] text-center">{modal.index + 1} / {modal.clips.length}</span>
                  <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={modalNext} disabled={modal.index === modal.clips.length - 1}>Next ›</button>
                </>
              )}
              {modalClip.video_url && (
                <button className={`${btnCls} bg-emerald-600/20 border border-emerald-600 text-emerald-400`} onClick={() => downloadClip(modalClip)}>Download</button>
              )}
              <a href={modalClip.savant_url || '#'} target="_blank" rel="noreferrer" className="text-sm text-emerald-400">Savant ↗</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
