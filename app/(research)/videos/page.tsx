'use client'

// Videos — pitch video archive search (More → Videos).
//
// Same system as Mayday Studio's Pitch Video Search tool: left filter
// column, results table with per-row selection (any pitch — archived or
// not), a global History drawer (collapsed by default; every search logged
// to pitch_video_searches and clicking an entry re-fills the filters), a
// review modal that plays archived clips from the Mayday NAS — or
// live-resolves the Savant CDN mp4 for unarchived pitches — plus
// single/batch local downloads named
// "[Pitcher] to [Hitter] [Pitch Type] [Count] [Outcome].mp4" (multi-clip
// batches bundle into one zip), and a Playlist view: personal DB-backed
// playlists (pitch_playlists + items, RLS owner-only) with a frame-step
// player.
//
// Data comes from our own /api/pitch-video (session cookie auth); the page
// never needs a consumer key.

import { useState, useEffect, useRef, useCallback } from 'react'
import { zipSync } from 'fflate'
import { supabase } from '@/lib/supabase'
import PlayerSearchInput from '@/components/PlayerSearchInput'
import type { PlayerResult } from '@/lib/types'
import type { ClipRow as VideoRow } from '@/lib/video/types'
import { label, flipName, outcome, rowKey, clipFilename, resolveClipUrl } from '@/lib/video/clip'
import Telestrator from '@/components/videos/Telestrator'

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

interface Playlist {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
  pitch_playlist_items?: { count: number }[]
}

interface PlaylistItem {
  id: string
  playlist_id: string
  row_key: string
  clip: VideoRow
  position: number
  added_at: string
}

interface HistoryEntry {
  id: string
  user_id: string | null
  user_name: string | null
  filters: Filters
  result_count: number | null
  created_at: string
}

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
const infoKeyCls = 'text-[10px] text-zinc-500 uppercase tracking-wider self-center'
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
  const [telestrateRow, setTelestrateRow] = useState<VideoRow | null>(null)
  const [savantMp4, setSavantMp4] = useState<Record<string, string | null>>({})
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [batch, setBatch] = useState<{ done: number; total: number; failed: number } | null>(null)
  const batchCancelRef = useRef(false)

  // Playlist view — DB-backed personal playlists (pitch_playlists +
  // pitch_playlist_items, RLS owner-only). Items snapshot the pitch row as
  // jsonb so playback works without re-running the search.
  const [view, setView] = useState<'search' | 'playlist'>('search')
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([])
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [addPicker, setAddPicker] = useState<{ rows: VideoRow[] } | null>(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [addBusy, setAddBusy] = useState(false)

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
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setRows(null)
    } finally {
      setSearching(false)
    }
  }

  // ── Selection ──
  // Any pitch can be selected — playlists and downloads resolve the Savant
  // CDN mp4 on demand for unarchived rows.
  const archivedRows = (rows || []).filter(r => r.video_url)
  const selectedRows = (rows || []).filter(r => selectedKeys.has(rowKey(r)))
  const allSelected = (rows || []).length > 0 && selectedRows.length === (rows || []).length

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set((rows || []).map(rowKey)))
  }

  // ── Playlists ──
  const fetchPlaylists = useCallback(async () => {
    const { data, error } = await supabase
      .from('pitch_playlists')
      .select('*, pitch_playlist_items(count)')
      .order('created_at', { ascending: true })
    if (error) { console.error('Error fetching playlists:', error); return }
    setPlaylists((data as Playlist[]) || [])
  }, [])

  useEffect(() => { fetchPlaylists() }, [fetchPlaylists])

  const fetchPlaylistItems = useCallback(async (playlistId: string | null) => {
    if (!playlistId) { setPlaylistItems([]); return }
    setPlaylistLoading(true)
    const { data, error } = await supabase
      .from('pitch_playlist_items')
      .select('*')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })
    if (error) console.error('Error fetching playlist items:', error)
    setPlaylistItems((data as PlaylistItem[]) || [])
    setPlaylistLoading(false)
  }, [])

  useEffect(() => {
    fetchPlaylistItems(activePlaylistId)
    setPlayIndex(0)
  }, [activePlaylistId, fetchPlaylistItems])

  // Keep the playing index inside the queue when items are removed
  useEffect(() => {
    setPlayIndex(i => Math.min(i, Math.max(0, playlistItems.length - 1)))
  }, [playlistItems.length])

  const createPlaylist = async (name: string): Promise<Playlist | null> => {
    const trimmed = (name || '').trim()
    if (!trimmed) return null
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('pitch_playlists')
      .insert({ name: trimmed, created_by: user.id })
      .select()
      .single()
    if (error) { console.error('Error creating playlist:', error); return null }
    await fetchPlaylists()
    return data as Playlist
  }

  const addRowsToPlaylist = async (playlistId: string, rowsToAdd: VideoRow[]) => {
    setAddBusy(true)
    try {
      const { data: existing } = await supabase
        .from('pitch_playlist_items')
        .select('row_key, position')
        .eq('playlist_id', playlistId)
      const seen = new Set((existing || []).map(r => r.row_key))
      let pos = (existing || []).reduce((m, r) => Math.max(m, r.position), -1) + 1
      const payload = rowsToAdd
        .filter(r => !seen.has(rowKey(r)))
        .map(r => ({ playlist_id: playlistId, row_key: rowKey(r), clip: r, position: pos++ }))
      if (payload.length) {
        const { error } = await supabase.from('pitch_playlist_items').insert(payload)
        if (error) throw error
      }
      setAddPicker(null)
      setSelectedKeys(new Set())
      fetchPlaylists()
      if (playlistId === activePlaylistId) fetchPlaylistItems(playlistId)
    } catch (err) {
      console.error('Error adding to playlist:', err)
      alert('Could not add clips to the playlist.')
    } finally {
      setAddBusy(false)
    }
  }

  const deletePlaylist = async (playlistId: string) => {
    const pl = playlists.find(p => p.id === playlistId)
    if (!window.confirm(`Delete playlist "${pl?.name || ''}" and its queue?`)) return
    await supabase.from('pitch_playlists').delete().eq('id', playlistId)
    if (activePlaylistId === playlistId) setActivePlaylistId(null)
    fetchPlaylists()
  }

  const renamePlaylist = async (playlistId: string) => {
    const pl = playlists.find(p => p.id === playlistId)
    const name = window.prompt('Rename playlist', pl?.name || '')
    if (!name || !name.trim()) return
    await supabase.from('pitch_playlists')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', playlistId)
    fetchPlaylists()
  }

  const removePlaylistItem = async (itemId: string) => {
    const idx = playlistItems.findIndex(it => it.id === itemId)
    setPlaylistItems(prev => prev.filter(it => it.id !== itemId))
    if (idx !== -1 && idx < playIndex) setPlayIndex(i => Math.max(0, i - 1))
    await supabase.from('pitch_playlist_items').delete().eq('id', itemId)
    fetchPlaylists()
  }

  const movePlaylistItem = async (idx: number, dir: number) => {
    const j = idx + dir
    if (j < 0 || j >= playlistItems.length) return
    const a = playlistItems[idx]
    const b = playlistItems[j]
    const next = [...playlistItems]
    next[idx] = { ...b, position: a.position }
    next[j] = { ...a, position: b.position }
    setPlaylistItems(next)
    if (playIndex === idx) setPlayIndex(j)
    else if (playIndex === j) setPlayIndex(idx)
    await Promise.all([
      supabase.from('pitch_playlist_items').update({ position: b.position }).eq('id', a.id),
      supabase.from('pitch_playlist_items').update({ position: a.position }).eq('id', b.id),
    ])
  }

  // ── Downloads ──
  // Archived clips stream from the Mayday NAS; unarchived ones resolve the
  // Savant CDN mp4 on demand (MLB's CDN allows cross-origin fetches), so any
  // pitch with a clip is downloadable with the formatted filename.
  const getPlayableUrl = async (row: VideoRow): Promise<string | null> => {
    if (row.video_url) return row.video_url
    const key = rowKey(row)
    if (savantMp4[key] !== undefined) return savantMp4[key]
    const url = await resolveClipUrl(row)
    setSavantMp4(m => ({ ...m, [key]: url }))
    return url
  }

  const downloadClip = async (row: VideoRow): Promise<boolean> => {
    const src = await getPlayableUrl(row)
    if (!src) {
      if (row.savant_url) window.open(row.savant_url, '_blank', 'noopener')
      return false
    }
    try {
      const res = await fetch(src)
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
      window.open(src, '_blank', 'noopener')
      return false
    }
  }

  const fetchClipBytes = async (row: VideoRow): Promise<Uint8Array | null> => {
    const src = await getPlayableUrl(row)
    if (!src) return null
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch {
      return null
    }
  }

  // Browsers block every programmatic download after the first one in a
  // batch (no user activation), so multi-clip downloads are bundled into a
  // single zip. Store mode — the mp4s don't recompress.
  const runBatchDownload = async (targets: VideoRow[]) => {
    if (!targets.length) return
    if (targets.length === 1) {
      setBatch({ done: 0, total: 1, failed: 0 })
      await downloadClip(targets[0])
      setBatch(null)
      return
    }
    batchCancelRef.current = false
    setBatch({ done: 0, total: targets.length, failed: 0 })
    const files: Record<string, [Uint8Array, { level: 0 }]> = {}
    for (let i = 0; i < targets.length; i++) {
      if (batchCancelRef.current) { setBatch(null); return }
      const bytes = await fetchClipBytes(targets[i])
      if (bytes) {
        let name = clipFilename(targets[i])
        if (files[name]) {
          const base = name.replace(/\.mp4$/, '')
          let n = 2
          while (files[`${base} (${n}).mp4`]) n++
          name = `${base} (${n}).mp4`
        }
        files[name] = [bytes, { level: 0 }]
      }
      setBatch(b => b && ({ ...b, done: i + 1, failed: b.failed + (bytes ? 0 : 1) }))
    }
    if (Object.keys(files).length > 0) {
      const blob = new Blob([zipSync(files)], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pitch-clips-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
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

  // ── Playlist view ──
  const activePlaylist = playlists.find(p => p.id === activePlaylistId) || null
  const playClip: VideoRow | null = playlistItems[playIndex]?.clip || null
  const playClipKey = playClip ? rowKey(playClip) : null
  const playSrc = playClip && playClipKey ? (playClip.video_url || savantMp4[playClipKey]) : null

  // Unarchived playlist clips: live-resolve the Savant CDN mp4 when they come
  // up for playback (same path as the review modal).
  useEffect(() => {
    if (view !== 'playlist' || !playClip || playClip.video_url) return undefined
    const key = rowKey(playClip)
    if (savantMp4[key] !== undefined) return undefined
    let cancelled = false
    ;(async () => {
      setResolvingKey(key)
      try {
        const res = await fetch(
          `/api/pitch-video?game_pk=${playClip.game_pk}&ab=${playClip.at_bat_number}&pitch=${playClip.pitch_number}&resolve_mp4=true`,
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
  }, [view, playClip, savantMp4])

  function renderPlaylistView() {
    return (
      <>
        {/* ── Left: playlist column (replaces filters) ── */}
        <div className="w-[260px] shrink-0 space-y-3">
          <div>
            <label className={labelCls}>Playlist</label>
            <select
              className={inputCls}
              value={activePlaylistId || ''}
              onChange={e => setActivePlaylistId(e.target.value || null)}
            >
              <option value="">Select a playlist…</option>
              {playlists.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.pitch_playlist_items?.[0]?.count ?? 0})
                </option>
              ))}
            </select>
            {activePlaylist && (
              <div className="flex gap-1.5 mt-1.5">
                <button
                  className={`${btnCls} flex-1 bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200`}
                  onClick={() => renamePlaylist(activePlaylist.id)}
                >
                  Rename
                </button>
                <button
                  className={`${btnCls} flex-1 bg-zinc-900 border border-zinc-700 text-red-400/80 hover:text-red-400`}
                  onClick={() => deletePlaylist(activePlaylist.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {playClip && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <label className={labelCls}>Now playing</label>
              <div className="text-[15px] font-bold">{flipName(playClip.player_name)}</div>
              <div className="text-xs text-zinc-500 mb-2">to {flipName(playClip.batter_name)}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-300">
                <span className={infoKeyCls}>Pitch</span>
                <span>{playClip.pitch_name || playClip.pitch_type || '—'}</span>
                <span className={infoKeyCls}>Velo</span>
                <span>{playClip.release_speed ? `${playClip.release_speed.toFixed(1)} mph` : '—'}</span>
                <span className={infoKeyCls}>Count</span>
                <span>{playClip.balls ?? '–'}-{playClip.strikes ?? '–'}</span>
                <span className={infoKeyCls}>Result</span>
                <span>{outcome(playClip)}</span>
                <span className={infoKeyCls}>Game</span>
                <span>{playClip.away_team} @ {playClip.home_team}</span>
                <span className={infoKeyCls}>Date</span>
                <span>{playClip.game_date}</span>
                <span className={infoKeyCls}>Inning</span>
                <span>{playClip.inning_topbot} {playClip.inning}</span>
              </div>
              {playClip.savant_url && (
                <a href={playClip.savant_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 mt-2 inline-block">Savant ↗</a>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Queue ({playlistItems.length})</label>
            <div className="space-y-1 max-h-[45vh] overflow-y-auto">
              {playlistLoading && <div className="py-4 text-center text-sm text-zinc-600">Loading…</div>}
              {!playlistLoading && !activePlaylistId && (
                <div className="py-4 text-center text-sm text-zinc-600">Pick a playlist, or select pitches in Search and hit “Add to playlist”.</div>
              )}
              {!playlistLoading && activePlaylistId && playlistItems.length === 0 && (
                <div className="py-4 text-center text-sm text-zinc-600">Empty — add pitches from the Search view.</div>
              )}
              {playlistItems.map((it, idx) => {
                const c = it.clip
                const current = idx === playIndex
                return (
                  <div
                    key={it.id}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-pointer ${current ? 'bg-emerald-600/10 border-emerald-600/60' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}
                    onClick={() => setPlayIndex(idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis">
                        {idx + 1}. {flipName(c.player_name)}
                      </div>
                      <div className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis">
                        {c.pitch_name || c.pitch_type}{c.release_speed ? ` · ${c.release_speed.toFixed(1)}` : ''} · {outcome(c)}{!c.video_url ? ' · Savant' : ''}
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <button className="text-zinc-600 hover:text-zinc-300 text-xs px-1 disabled:opacity-30" onClick={() => movePlaylistItem(idx, -1)} disabled={idx === 0} title="Move up">↑</button>
                      <button className="text-zinc-600 hover:text-zinc-300 text-xs px-1 disabled:opacity-30" onClick={() => movePlaylistItem(idx, 1)} disabled={idx === playlistItems.length - 1} title="Move down">↓</button>
                      <button className="text-zinc-600 hover:text-red-400 text-xs px-1" onClick={() => removePlaylistItem(it.id)} title="Remove">×</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Center: player ── */}
        <div className="flex-1 min-w-0">
          {playClip && playSrc ? (
            <PlaylistPlayer
              key={playlistItems[playIndex]?.id}
              src={playSrc}
              index={playIndex}
              total={playlistItems.length}
              autoAdvance={autoAdvance}
              onToggleAutoAdvance={() => setAutoAdvance(v => !v)}
              onPrev={() => setPlayIndex(i => Math.max(0, i - 1))}
              onNext={() => setPlayIndex(i => Math.min(playlistItems.length - 1, i + 1))}
              onEnded={() => { if (autoAdvance) setPlayIndex(i => (i < playlistItems.length - 1 ? i + 1 : i)) }}
            />
          ) : playClip && playClipKey && savantMp4[playClipKey] === undefined ? (
            <div className="py-24 text-center text-sm text-zinc-600">Loading clip from Savant…</div>
          ) : playClip ? (
            <div className="py-24 text-center text-sm text-zinc-600">
              <div>
                No clip available for this pitch.{' '}
                {playClip.savant_url && (
                  <a href={playClip.savant_url} target="_blank" rel="noreferrer" className="text-emerald-400">Try Savant ↗</a>
                )}
              </div>
              <div className="flex gap-2 justify-center mt-3.5">
                <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={() => setPlayIndex(i => Math.max(0, i - 1))} disabled={playIndex === 0}>‹ Prev</button>
                <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={() => setPlayIndex(i => Math.min(playlistItems.length - 1, i + 1))} disabled={playIndex >= playlistItems.length - 1}>Next ›</button>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-sm text-zinc-600">
              {activePlaylistId ? 'This playlist is empty.' : 'Select a playlist on the left.'}
            </div>
          )}
        </div>
      </>
    )
  }

  // ── Render ──
  return (
    <div className="max-w-[1500px] mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Videos</h1>
          <p className="text-xs text-zinc-600">Pitch video archive — search, review, download</p>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 ml-3">
          {(['search', 'playlist'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-1 rounded text-sm font-semibold capitalize transition ${view === v ? 'bg-emerald-600/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {view === 'search' && (
          <button
            onClick={() => setDrawerOpen(o => !o)}
            className={`${btnCls} border ${drawerOpen ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
          >
            History
          </button>
        )}
      </div>

      <div className="flex gap-5 items-start">
        {view === 'playlist' && renderPlaylistView()}
        {view === 'search' && (<>
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
                    <button className={`${btnCls} bg-emerald-600/20 border border-emerald-600 text-emerald-400`} onClick={() => setAddPicker({ rows: selectedRows })}>Add to playlist</button>
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
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all" />
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
                            <input type="checkbox" checked={checked} onChange={() => toggleKey(key)} />
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
                            {!row.video_url && (
                              <span className="text-[11px] italic text-zinc-600 mr-1.5" title={`Status: ${row.status || 'not archived'} — downloads via Savant CDN`}>{row.status || 'not archived'}</span>
                            )}
                            <button
                              className="inline-flex items-center justify-center w-6 h-6 rounded border border-zinc-700 text-sky-400 hover:bg-zinc-800 mr-1"
                              title="Telestrate this pitch"
                              onClick={() => setTelestrateRow(row)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" />
                              </svg>
                            </button>
                            <button
                              className="inline-flex items-center justify-center w-6 h-6 rounded border border-zinc-700 text-emerald-400 hover:bg-zinc-800"
                              title={row.video_url ? 'Download clip' : 'Download via Savant'}
                              onClick={() => downloadClip(row)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                              </svg>
                            </button>
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
        </>)}
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
                No clip available for this pitch ({modalClip.status || 'not archived'}).{' '}
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
              <button className={`${btnCls} bg-sky-600/20 border border-sky-600 text-sky-400`} onClick={() => { setModal(null); setTelestrateRow(modalClip) }}>Telestrate</button>
              <button className={`${btnCls} bg-emerald-600/20 border border-emerald-600 text-emerald-400`} onClick={() => downloadClip(modalClip)}>Download</button>
              <a href={modalClip.savant_url || '#'} target="_blank" rel="noreferrer" className="text-sm text-emerald-400">Savant ↗</a>
            </div>
          </div>
        </div>
      )}

      {/* ── Add-to-playlist picker modal ── */}
      {addPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => !addBusy && setAddPicker(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[420px] max-w-[92vw] p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="text-[15px] font-bold">
                Add {addPicker.rows.length} clip{addPicker.rows.length > 1 ? 's' : ''} to playlist
              </div>
              <button className="text-zinc-500 hover:text-zinc-300 text-xl leading-none px-1" onClick={() => setAddPicker(null)}>×</button>
            </div>
            <div className="space-y-1 max-h-[280px] overflow-y-auto mb-3">
              {playlists.map(p => (
                <button
                  key={p.id}
                  disabled={addBusy}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
                  onClick={() => addRowsToPlaylist(p.id, addPicker.rows)}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-zinc-500">{p.pitch_playlist_items?.[0]?.count ?? 0}</span>
                </button>
              ))}
              {playlists.length === 0 && (
                <div className="py-4 text-center text-sm text-zinc-600">No playlists yet — create one below.</div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={newPlaylistName}
                placeholder="New playlist name"
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
              />
              <button
                className={`${btnCls} shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50`}
                disabled={addBusy || !newPlaylistName.trim()}
                onClick={async () => {
                  const pl = await createPlaylist(newPlaylistName)
                  if (pl) {
                    setNewPlaylistName('')
                    await addRowsToPlaylist(pl.id, addPicker.rows)
                    setActivePlaylistId(pl.id)
                  }
                }}
              >
                Create + add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Telestrator ── */}
      {telestrateRow && (
        <Telestrator row={telestrateRow} onClose={() => setTelestrateRow(null)} />
      )}
    </div>
  )
}

// ── Playlist player ──
// Custom <video> chrome: scrubber, quarter/half/normal/double speed, and
// single-frame stepping. Savant broadcast clips are ~30fps, so a "frame"
// is 1/30s (the <video> element exposes no real frame API).
const PLAYBACK_RATES = [0.25, 0.5, 1, 2]
const FRAME_S = 1 / 30

const ctrlBtnCls = 'bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 px-2 py-1 text-[13px] leading-none hover:bg-zinc-700 disabled:opacity-40'

interface PlaylistPlayerProps {
  src: string
  index: number
  total: number
  autoAdvance: boolean
  onToggleAutoAdvance: () => void
  onPrev: () => void
  onNext: () => void
  onEnded: () => void
}

function PlaylistPlayer({ src, index, total, autoAdvance, onToggleAutoAdvance, onPrev, onNext, onEnded }: PlaylistPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  const setPlaybackRate = useCallback((r: number) => {
    setRate(r)
    if (videoRef.current) videoRef.current.playbackRate = r
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  const stepFrame = useCallback((dir: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const max = isFinite(v.duration) ? v.duration : Number.MAX_SAFE_INTEGER
    v.currentTime = Math.min(Math.max(0, v.currentTime + dir * FRAME_S), max)
  }, [])

  // Keyboard: ←→ frame step · ↑↓ prev/next clip · space play/pause ·
  // , ¼× · . ½× · / 1×
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = (target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onPrev() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onNext() }
      else if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === ',') setPlaybackRate(0.25)
      else if (e.key === '.') setPlaybackRate(0.5)
      else if (e.key === '/') setPlaybackRate(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepFrame, togglePlay, onPrev, onNext, setPlaybackRate])

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00.00'
    const m = Math.floor(s / 60)
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`
  }

  return (
    <div ref={wrapRef} className="flex flex-col h-[calc(100vh-160px)] bg-black rounded-xl overflow-hidden border border-zinc-800">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted={muted}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={e => setTime((e.target as HTMLVideoElement).currentTime)}
        onLoadedMetadata={e => {
          const v = e.target as HTMLVideoElement
          setDuration(v.duration || 0)
          v.playbackRate = rate
        }}
        onEnded={onEnded}
        onClick={togglePlay}
        className="flex-1 min-h-0 w-full object-contain bg-black cursor-pointer"
      />
      <div className="bg-zinc-950 border-t border-zinc-800 px-3.5 pt-2 pb-2.5 space-y-1.5">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={FRAME_S}
          value={Math.min(time, duration || 0)}
          onChange={e => {
            const v = videoRef.current
            if (v) v.currentTime = Number(e.target.value)
            setTime(Number(e.target.value))
          }}
          className="w-full accent-emerald-500 cursor-pointer"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button className={ctrlBtnCls} onClick={onPrev} disabled={index === 0} title="Previous clip (↑)">⏮</button>
          <button className={ctrlBtnCls} onClick={() => stepFrame(-1)} title="Frame back (←)">‹｜</button>
          <button
            className="bg-emerald-600/20 border border-emerald-600 rounded-md text-emerald-400 px-3.5 py-1 text-[13px] leading-none hover:bg-emerald-600/30"
            onClick={togglePlay}
            title="Play / pause (space)"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button className={ctrlBtnCls} onClick={() => stepFrame(1)} title="Frame forward (→)">｜›</button>
          <button className={ctrlBtnCls} onClick={onNext} disabled={index >= total - 1} title="Next clip (↓)">⏭</button>
          <span className="text-xs text-zinc-400 tabular-nums ml-1.5">{fmt(time)} / {fmt(duration)}</span>
          <div className="flex-1" />
          {PLAYBACK_RATES.map(r => (
            <button
              key={r}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${rate === r ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setPlaybackRate(r)}
              title={r === 0.25 ? 'Quarter speed (,)' : r === 0.5 ? 'Half speed (.)' : r === 1 ? 'Normal speed (/)' : 'Double speed'}
            >
              {r === 0.25 ? '¼×' : r === 0.5 ? '½×' : `${r}×`}
            </button>
          ))}
          <button className={ctrlBtnCls} onClick={() => setMuted(m => !m)} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <button className={ctrlBtnCls} onClick={() => wrapRef.current?.requestFullscreen?.()} title="Fullscreen">⛶</button>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer ml-2 select-none" title="Play the next clip automatically when this one ends">
            <input type="checkbox" checked={autoAdvance} onChange={onToggleAutoAdvance} />
            Auto-advance
          </label>
          <span className="text-xs text-zinc-500 ml-1">{index + 1} / {total}</span>
        </div>
      </div>
    </div>
  )
}
