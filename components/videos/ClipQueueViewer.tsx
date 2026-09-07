'use client'

// Clip queue + frame-step player — the review/playlist half of the Videos
// page, lifted out so the Research game log can open the same thing in a
// modal. One implementation, so the two can't drift apart.
//
// The component owns playback (index is controlled by the caller) and the
// live Savant mp4 resolution for pitches that aren't archived on the NAS.
// Everything queue-shaped that differs between callers — the block above the
// queue, the per-item buttons, the empty states — comes in as props.

import { useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import type { ClipRow } from '@/lib/video/types'
import { flipName, outcome, rowKey } from '@/lib/video/clip'

/** Shape of a row in the queue. `pitch_playlist_items` rows satisfy this. */
export interface QueueItem {
  id: string
  row_key: string
  clip: ClipRow
  position: number
}

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
  const [autoAdvance, setAutoAdvance] = useState(false)
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

  const prev = () => onPlayIndexChange(Math.max(0, playIndex - 1))
  const next = () => onPlayIndexChange(Math.min(items.length - 1, playIndex + 1))

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
          <label className={labelCls}>Queue ({items.length})</label>
          <div className={`space-y-1 ${queueMaxHeightClass} overflow-y-auto`}>
            {loading && <div className="py-4 text-center text-sm text-zinc-600">Loading…</div>}
            {!loading && items.length === 0 && emptyQueueMessage}
            {items.map((it, idx) => {
              const c = it.clip
              const current = idx === playIndex
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-pointer ${current ? 'bg-emerald-600/10 border-emerald-600/60' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}
                  onClick={() => onPlayIndexChange(idx)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis">
                      {idx + 1}. {flipName(c.player_name)}
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
            index={playIndex}
            total={items.length}
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
              <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={prev} disabled={playIndex === 0}>‹ Prev</button>
              <button className={`${btnCls} bg-zinc-800 border border-zinc-700 text-zinc-300 disabled:opacity-40`} onClick={next} disabled={playIndex >= items.length - 1}>Next ›</button>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-sm text-zinc-600">{emptyPlayerMessage}</div>
        )}
      </div>
    </>
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
