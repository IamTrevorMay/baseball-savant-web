'use client'

// "Watch" from the Research game log — the Videos page's Review Game, in a
// modal. Loads every pitch the player threw in one game, drops the ones with
// no clip anywhere, and hands the rest to the shared ClipQueueViewer.
//
// Deliberately closes only via the Close button: no Escape key, no
// backdrop click. Frame-stepping a clip is fiddly enough without a stray
// click throwing the whole queue away.

import { useState, useEffect, useCallback } from 'react'
import type { ClipRow } from '@/lib/video/types'
import ClipQueueViewer, { QueueItem } from '@/components/videos/ClipQueueViewer'
import { rowKey, flipName } from '@/lib/video/clip'
import { createPlaylist, appendPlaylistItems } from '@/lib/video/playlists'

const btnCls = 'px-3 py-1.5 rounded text-sm font-medium transition'

interface GameReviewModalProps {
  pitcherId: number
  pitcherName: string
  gamePk: number
  gameDate: string
  /** "AWY @ HOM", shown in the header alongside the date. */
  matchup: string
  onClose: () => void
}

export default function GameReviewModal({
  pitcherId,
  pitcherName,
  gamePk,
  gameDate,
  matchup,
  onClose,
}: GameReviewModalProps) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [skipped, setSkipped] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playIndex, setPlayIndex] = useState(0)
  const [saveBusy, setSaveBusy] = useState(false)
  const [savedAs, setSavedAs] = useState<string | null>(null)

  const label = `${flipName(pitcherName)} · ${gameDate} · ${matchup}`

  // The page behind the modal must not scroll while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/pitch-video?game_pk=${gamePk}&pitcher=${pitcherId}&limit=1000`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || `Load failed (${res.status})`)
        const all = (json.rows as ClipRow[]) || []
        // Playable = archived on the NAS, or a play_id Savant can resolve on
        // demand. Anything else would be a dead stop in the middle of a reel.
        const playable = all.filter(r => r.video_url || r.savant_url)
        if (cancelled) return
        setSkipped(all.length - playable.length)
        setItems(
          playable.map((r, i) => ({
            id: `review-${rowKey(r)}`,
            row_key: rowKey(r),
            clip: r,
            position: i,
          })),
        )
        if (playable.length === 0) setError('No clips available for this game yet')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [gamePk, pitcherId])

  const saveAsPlaylist = useCallback(async () => {
    if (!items.length) return
    const name = window.prompt('Save review as playlist', label)
    if (!name || !name.trim()) return
    setSaveBusy(true)
    try {
      const pl = await createPlaylist(name)
      if (!pl) { setError('Could not create playlist — are you signed in?'); return }
      const err = await appendPlaylistItems(pl.id, items.map(it => it.clip))
      if (err) { setError(err); return }
      setSavedAs(pl.name)
    } finally {
      setSaveBusy(false)
    }
  }, [items, label])

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3">
      <div className="w-[97vw] max-w-[1500px] h-[94vh] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-emerald-500/80 font-semibold">
              Reviewing game
            </div>
            <div className="text-sm font-semibold text-zinc-100 truncate">{label}</div>
          </div>
          <div className="flex-1" />
          <button
            className={`${btnCls} bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500`}
            onClick={onClose}
          >
            Close ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {error && items.length === 0 ? (
            <div className="py-24 text-center text-sm text-zinc-500">{error}</div>
          ) : loading ? (
            <div className="py-24 text-center text-sm text-zinc-600">Loading clips…</div>
          ) : (
            <div className="flex gap-5 items-start">
              <ClipQueueViewer
                items={items}
                playIndex={playIndex}
                onPlayIndexChange={setPlayIndex}
                playerHeightClass="h-[calc(94vh-140px)]"
                queueMaxHeightClass="max-h-[calc(94vh-460px)]"
                emptyPlayerMessage="No clips available for this game yet."
                header={
                  <div className="rounded-lg border border-emerald-600/50 bg-emerald-600/10 p-3">
                    <div className="text-[11px] text-zinc-400">
                      {items.length} clips
                      {skipped > 0 && ` · ${skipped} pitches without video skipped`}
                      {savedAs ? ` · saved as “${savedAs}”` : ' · not saved'}
                    </div>
                    {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
                    <button
                      className={`${btnCls} w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50`}
                      onClick={saveAsPlaylist}
                      disabled={saveBusy || !items.length}
                    >
                      {saveBusy ? 'Saving…' : 'Save as playlist'}
                    </button>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
