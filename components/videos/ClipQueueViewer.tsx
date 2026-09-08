'use client'

// Clip queue + frame-step player — the review/playlist half of the Videos
// page, lifted out so the Research game log can open the same thing in a
// modal. One implementation, so the two can't drift apart.
//
// The component owns playback (index is controlled by the caller) and the
// live Savant mp4 resolution for pitches that aren't archived on the NAS.
// Everything queue-shaped that differs between callers — the block above the
// queue, the per-item buttons, the empty states — comes in as props.

import { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react'
import type { ClipRow } from '@/lib/video/types'
import { flipName, outcome, rowKey } from '@/lib/video/clip'

/** Shape of a row in the queue. `pitch_playlist_items` rows satisfy this. */
export interface QueueItem {
  id: string
  row_key: string
  clip: ClipRow
  position: number
}

// ── Queue filters ───────────────────────────────────────────────────────────
// Client-side narrowing of the loaded queue. Multi-select within a facet is
// OR; facets combine with AND. "Situation" is outs + inning — the pitch rows
// carry no baserunner state, so runners-on can't be filtered here.

interface QueueFilters {
  pitchTypes: string[]
  outcomes: string[]
  counts: string[]
  stand: '' | 'L' | 'R'
  outs: number[]
  innings: number[]
}

const EMPTY_QUEUE_FILTERS: QueueFilters = {
  pitchTypes: [], outcomes: [], counts: [], stand: '', outs: [], innings: [],
}

const desc = (c: ClipRow) => (c.description || '').toLowerCase()

/** Outcome buckets — per-pitch results plus PA-enders; same vocab as the dashboards. */
const OUTCOME_TESTS: Record<string, { label: string; test: (c: ClipRow) => boolean }> = {
  whiff: { label: 'Whiff', test: c => desc(c).includes('swinging_strike') || desc(c) === 'missed_bunt' || desc(c) === 'swinging_pitchout' },
  called_strike: { label: 'Called Strike', test: c => desc(c) === 'called_strike' },
  foul: { label: 'Foul', test: c => desc(c).includes('foul') },
  ball: { label: 'Ball', test: c => desc(c).includes('ball') && !desc(c).includes('hit') },
  in_play: { label: 'In Play', test: c => desc(c).startsWith('hit_into_play') },
  hit: { label: 'Hit', test: c => ['single', 'double', 'triple', 'home_run'].includes(c.events || '') },
  hr: { label: 'HR', test: c => c.events === 'home_run' },
  k: { label: 'K', test: c => (c.events || '').includes('strikeout') },
  bb: { label: 'BB', test: c => c.events === 'walk' },
}

function clipMatches(c: ClipRow, f: QueueFilters): boolean {
  if (f.pitchTypes.length && !f.pitchTypes.includes(c.pitch_name || c.pitch_type || '')) return false
  if (f.stand && (c.stand || '') !== f.stand) return false
  if (f.counts.length && !f.counts.includes(`${c.balls ?? '?'}-${c.strikes ?? '?'}`)) return false
  if (f.outs.length && !f.outs.includes(c.outs_when_up ?? -1)) return false
  if (f.innings.length && !f.innings.includes(c.inning ?? -1)) return false
  if (f.outcomes.length && !f.outcomes.some(k => OUTCOME_TESTS[k]?.test(c))) return false
  return true
}

const countActiveFilters = (f: QueueFilters) =>
  f.pitchTypes.length + f.outcomes.length + f.counts.length + (f.stand ? 1 : 0) + f.outs.length + f.innings.length

const labelCls = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block'
const infoKeyCls = 'text-[10px] text-zinc-500 uppercase tracking-wider self-center'
const btnCls = 'px-3 py-1.5 rounded text-sm font-medium transition'

interface ClipQueueViewerProps {
  items: QueueItem[]
  playIndex: number
  onPlayIndexChange: (index: number) => void
  /** Block rendered above the queue — the playlist picker, or a review banner. */
  header?: ReactNode
  loading?: boolean
  /** Per-item buttons (reorder, remove). Clicks inside are not propagated. */
  itemControls?: (item: QueueItem, index: number) => ReactNode
  /** Shown in the queue list when there is nothing in it. */
  emptyQueueMessage?: ReactNode
  /** Shown where the player would be when there is nothing to play. */
  emptyPlayerMessage?: ReactNode
  /** Tailwind height for the player box; modals want a different one. */
  playerHeightClass?: string
  /** Max height of the scrolling queue list. */
  queueMaxHeightClass?: string
  /** Optional shared Savant-url cache, so a caller can reuse resolved mp4s. */
  cache?: Record<string, string | null>
  onCache?: (key: string, url: string | null) => void
}

export default function ClipQueueViewer({
  items,
  playIndex,
  onPlayIndexChange,
  header,
  loading = false,
  itemControls,
  emptyQueueMessage,
  emptyPlayerMessage,
  playerHeightClass = 'h-[calc(100vh-160px)]',
  queueMaxHeightClass = 'max-h-[45vh]',
  cache: externalCache,
  onCache,
}: ClipQueueViewerProps) {
  // On by default — reviewing an outing is watching a reel, not one clip.
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_QUEUE_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [localCache, setLocalCache] = useState<Record<string, string | null>>({})
  const cache = externalCache ?? localCache

  // With a shared cache the owner holds the state; only fall back to local.
  const setCached = useCallback(
    (key: string, url: string | null) => {
      if (onCache) onCache(key, url)
      else setLocalCache(m => ({ ...m, [key]: url }))
    },
    [onCache],
  )

  // Indices (into the full items array) that pass the filters. playIndex keeps
  // full-list semantics so the caller's bookkeeping (removal, reordering)
  // stays valid; navigation just skips the hidden entries.
  const visible = useMemo(
    () => items.map((it, i) => (clipMatches(it.clip, filters) ? i : -1)).filter(i => i >= 0),
    [items, filters],
  )
  const activeFilterCount = countActiveFilters(filters)

  // If the playing clip gets filtered out, hop to the nearest visible one.
  useEffect(() => {
    if (!visible.length || visible.includes(playIndex)) return
    const next = visible.find(i => i > playIndex) ?? visible[visible.length - 1]
    onPlayIndexChange(next)
  }, [visible, playIndex, onPlayIndexChange])

  const playClip: ClipRow | null = items[playIndex]?.clip || null
  const playClipKey = playClip ? rowKey(playClip) : null
  const playSrc = playClip && playClipKey ? playClip.video_url || cache[playClipKey] : null

  // Unarchived clips: live-resolve the Savant CDN mp4 when they come up.
  useEffect(() => {
    if (!playClip || playClip.video_url) return undefined
    const key = rowKey(playClip)
    if (cache[key] !== undefined) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/pitch-video?game_pk=${playClip.game_pk}&ab=${playClip.at_bat_number}&pitch=${playClip.pitch_number}&resolve_mp4=true`,
        )
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setCached(key, json?.row?.savant_mp4_url || null)
      } catch {
        if (!cancelled) setCached(key, null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [playClip, cache, setCached])

  const pos = visible.indexOf(playIndex)
  const prev = () => {
    const target = [...visible].reverse().find(i => i < playIndex)
    if (target != null) onPlayIndexChange(target)
  }
  const next = () => {
    const target = visible.find(i => i > playIndex)
    if (target != null) onPlayIndexChange(target)
  }

  const toggleIn = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v]

  // Facet options come from what's actually in the queue.
  const facetOptions = useMemo(() => {
    const pitches = new Set<string>()
    const counts = new Set<string>()
    const innings = new Set<number>()
    for (const it of items) {
      const c = it.clip
      if (c.pitch_name || c.pitch_type) pitches.add(c.pitch_name || c.pitch_type || '')
      if (c.balls != null && c.strikes != null) counts.add(`${c.balls}-${c.strikes}`)
      if (c.inning != null) innings.add(c.inning)
    }
    return {
      pitches: [...pitches].sort(),
      counts: [...counts].sort((a, b) => a.localeCompare(b)),
      innings: [...innings].sort((a, b) => a - b),
    }
  }, [items])

  return (
    <>
      {/* ── Left: queue column ── */}
      <div className="w-[260px] shrink-0 space-y-3">
        {header}

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
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Queue ({activeFilterCount ? `${visible.length} of ${items.length}` : items.length})
            </label>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`text-[10px] uppercase tracking-wider font-semibold transition ${
                filtersOpen || activeFilterCount ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''} {filtersOpen ? '▴' : '▾'}
            </button>
          </div>

          {filtersOpen && (
            <div className="mb-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 space-y-2">
              <FilterChipGroup
                label="Pitch"
                options={facetOptions.pitches.map(v => ({ value: v, label: v }))}
                selected={filters.pitchTypes}
                onToggle={v => setFilters(f => ({ ...f, pitchTypes: toggleIn(f.pitchTypes, v) }))}
              />
              <FilterChipGroup
                label="Outcome"
                options={Object.entries(OUTCOME_TESTS).map(([value, o]) => ({ value, label: o.label }))}
                selected={filters.outcomes}
                onToggle={v => setFilters(f => ({ ...f, outcomes: toggleIn(f.outcomes, v) }))}
              />
              <FilterChipGroup
                label="Count"
                options={facetOptions.counts.map(v => ({ value: v, label: v }))}
                selected={filters.counts}
                onToggle={v => setFilters(f => ({ ...f, counts: toggleIn(f.counts, v) }))}
              />
              <FilterChipGroup
                label="Batter Side"
                options={[{ value: 'L', label: 'LHH' }, { value: 'R', label: 'RHH' }]}
                selected={filters.stand ? [filters.stand] : []}
                onToggle={v => setFilters(f => ({ ...f, stand: f.stand === v ? '' : (v as 'L' | 'R') }))}
              />
              <FilterChipGroup
                label="Outs"
                options={[0, 1, 2].map(v => ({ value: String(v), label: String(v) }))}
                selected={filters.outs.map(String)}
                onToggle={v => setFilters(f => ({ ...f, outs: toggleIn(f.outs, Number(v)) }))}
              />
              <FilterChipGroup
                label="Inning"
                options={facetOptions.innings.map(v => ({ value: String(v), label: String(v) }))}
                selected={filters.innings.map(String)}
                onToggle={v => setFilters(f => ({ ...f, innings: toggleIn(f.innings, Number(v)) }))}
              />
              {activeFilterCount > 0 && (
                <button
                  onClick={() => setFilters(EMPTY_QUEUE_FILTERS)}
                  className="w-full text-[11px] text-zinc-500 hover:text-red-400 transition pt-0.5"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          <div className={`space-y-1 ${queueMaxHeightClass} overflow-y-auto`}>
            {loading && <div className="py-4 text-center text-sm text-zinc-600">Loading…</div>}
            {!loading && items.length === 0 && emptyQueueMessage}
            {!loading && items.length > 0 && visible.length === 0 && (
              <div className="py-4 text-center text-sm text-zinc-600">No clips match the filters.</div>
            )}
            {visible.map(idx => {
              const it = items[idx]
              const c = it.clip
              const current = idx === playIndex
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-pointer ${current ? 'bg-emerald-600/10 border-emerald-600/60' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}
                  onClick={() => onPlayIndexChange(idx)}
                >
                  <div className="flex-1 min-w-0">
                    {/* The batter, not the pitcher — reviewing an outing, every
                        row would otherwise repeat the same name. */}
                    <div className="text-xs font-semibold text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis">
                      {idx + 1}. {flipName(c.batter_name)}
                    </div>
                    <div className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis">
                      {c.pitch_name || c.pitch_type}{c.release_speed ? ` · ${c.release_speed.toFixed(1)}` : ''} · {outcome(c)}{!c.video_url ? ' · Savant' : ''}
                    </div>
                  </div>
                  {itemControls && (
                    <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {itemControls(it, idx)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Center: player ── */}
      <div className="flex-1 min-w-0">
        {playClip && playSrc ? (
          <ClipPlayer
            key={items[playIndex]?.id}
            src={playSrc}
            index={pos >= 0 ? pos : 0}
            total={visible.length || items.length}
            autoAdvance={autoAdvance}
            heightClass={playerHeightClass}
            onToggleAutoAdvance={() => setAutoAdvance(v => !v)}
            onPrev={prev}
            onNext={next}
            onEnded={() => { if (autoAdvance) next() }}
          />
        ) : playClip && playClipKey && cache[playClipKey] === undefined ? (
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
              <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={prev} disabled={pos <= 0}>‹ Prev</button>
              <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={next} disabled={pos < 0 || pos >= visible.length - 1}>Next ›</button>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-sm text-zinc-600">{emptyPlayerMessage}</div>
        )}
      </div>
    </>
  )
}

// ── Filter chips ──

function FilterChipGroup({
  label, options, selected, onToggle,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div>
      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map(o => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              onClick={() => onToggle(o.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition ${
                on
                  ? 'bg-emerald-600/20 border-emerald-600/60 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Player ──

const PLAYBACK_RATES = [0.25, 0.5, 1, 2]
const FRAME_S = 1 / 30

const ctrlBtnCls = 'bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 px-2 py-1 text-[13px] leading-none hover:bg-zinc-700 disabled:opacity-40'

interface ClipPlayerProps {
  src: string
  index: number
  total: number
  autoAdvance: boolean
  heightClass: string
  onToggleAutoAdvance: () => void
  onPrev: () => void
  onNext: () => void
  onEnded: () => void
}

function ClipPlayer({ src, index, total, autoAdvance, heightClass, onToggleAutoAdvance, onPrev, onNext, onEnded }: ClipPlayerProps) {
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
    <div ref={wrapRef} className={`flex flex-col ${heightClass} bg-black rounded-xl overflow-hidden border border-zinc-800`}>
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
