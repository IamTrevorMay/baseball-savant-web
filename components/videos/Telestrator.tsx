'use client'

// Telestrator — draw on a pitch clip and burn the markup into a downloadable
// mp4 (WebCodecs → mp4-muxer). Full-screen overlay opened from the Videos page.
//
// Author model: the clip plays in a <video>; a transparent <canvas> layered on
// top holds the strokes (video shows through). Export composites video frames +
// strokes onto a native-resolution offscreen canvas, frame by frame.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipRow } from '@/lib/video/types'
import { clipFilename, flipName, loadClipObjectURL, outcome } from '@/lib/video/clip'
import {
  createMp4Recorder, downloadBlob, webCodecsSupported,
} from '@/lib/video/mp4Recorder'
import {
  drawStrokes, STROKE_COLORS, STROKE_WIDTHS,
  type Point, type Stroke,
} from '@/lib/video/strokes'

type Tool = 'pen' | 'line' | 'arrow' | 'ellipse' | 'spotlight' | 'text'

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pen', label: 'Freehand', icon: '✎' },
  { id: 'line', label: 'Line', icon: '╱' },
  { id: 'arrow', label: 'Arrow', icon: '↗' },
  { id: 'ellipse', label: 'Circle', icon: '◯' },
  { id: 'spotlight', label: 'Spotlight', icon: '◉' },
  { id: 'text', label: 'Text', icon: 'T' },
]
const EXPORT_SPEEDS: [number, string][] = [[1, '1×'], [0.5, '½×'], [0.25, '¼×']]
const SRC_FPS = 30

const btn = 'px-2.5 py-1.5 rounded text-sm font-medium transition border'
const ctrlBtn = 'bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 px-2 py-1 text-[13px] leading-none hover:bg-zinc-700 disabled:opacity-40'

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) { resolve(); return }
    let done = false
    const finish = () => { if (done) return; done = true; v.removeEventListener('seeked', finish); resolve() }
    v.addEventListener('seeked', finish)
    v.currentTime = t
    setTimeout(finish, 800) // safety: some browsers skip 'seeked' on tiny deltas
  })
}

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

export default function Telestrator({ row, onClose }: { row: ClipRow; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [src, setSrc] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState(STROKE_COLORS[1])
  const [widthKey, setWidthKey] = useState<'S' | 'M' | 'L'>('M')

  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redo, setRedo] = useState<Stroke[]>([])
  const [draft, setDraft] = useState<Stroke | null>(null)
  const startRef = useRef<Point | null>(null)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)

  const [exportSpeed, setExportSpeed] = useState(0.5)
  const [exporting, setExporting] = useState<number | null>(null) // 0..1 or null
  const exportCancel = useRef(false)
  const canExport = webCodecsSupported()

  // ── Load clip as a same-origin blob URL ──
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    ;(async () => {
      try {
        const u = await loadClipObjectURL(row)
        if (cancelled) { URL.revokeObjectURL(u); return }
        url = u
        setSrc(u)
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Could not load clip.')
      }
    })()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [row])

  // ── Redraw the author overlay whenever strokes / draft / size change ──
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !dims) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    drawStrokes(ctx, draft ? [...strokes, draft] : strokes, c.width, c.height)
  }, [strokes, draft, dims])

  // ── Pointer → normalized coords ──
  const toNorm = useCallback((e: React.PointerEvent): Point => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ]
  }, [])

  const commit = useCallback((s: Stroke) => {
    setStrokes(prev => [...prev, s])
    setRedo([])
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (exporting != null) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const p = toNorm(e)
    startRef.current = p
    const base = { color, width: STROKE_WIDTHS[widthKey] }
    if (tool === 'text') {
      const text = window.prompt('Label text')?.trim()
      if (text) commit({ kind: 'text', at: p, text, size: 34, ...base })
      startRef.current = null
      return
    }
    if (tool === 'pen') setDraft({ kind: 'pen', pts: [p], ...base })
    else if (tool === 'line') setDraft({ kind: 'line', a: p, b: p, ...base })
    else if (tool === 'arrow') setDraft({ kind: 'arrow', a: p, b: p, ...base })
    else if (tool === 'ellipse') setDraft({ kind: 'ellipse', c: p, rx: 0, ry: 0, ...base })
    else if (tool === 'spotlight') setDraft({ kind: 'spotlight', c: p, rx: 0, ry: 0, dim: 0.6, ...base })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draft || !startRef.current) return
    const p = toNorm(e)
    const s = startRef.current
    setDraft(d => {
      if (!d) return d
      if (d.kind === 'pen') return { ...d, pts: [...d.pts, p] }
      if (d.kind === 'line' || d.kind === 'arrow') return { ...d, b: p }
      if (d.kind === 'ellipse' || d.kind === 'spotlight')
        return { ...d, c: mid(s, p), rx: Math.abs(p[0] - s[0]) / 2, ry: Math.abs(p[1] - s[1]) / 2 }
      return d
    })
  }

  const onPointerUp = () => {
    if (!draft) return
    const d = draft
    setDraft(null)
    startRef.current = null
    // drop degenerate shapes
    if ((d.kind === 'ellipse' || d.kind === 'spotlight') && d.rx < 0.005 && d.ry < 0.005) return
    if ((d.kind === 'line' || d.kind === 'arrow') && d.a[0] === d.b[0] && d.a[1] === d.b[1]) return
    if (d.kind === 'pen' && d.pts.length < 2) return
    commit(d)
  }

  const undo = useCallback(() => {
    setStrokes(prev => {
      if (!prev.length) return prev
      setRedo(r => [...r, prev[prev.length - 1]])
      return prev.slice(0, -1)
    })
  }, [])
  const redoLast = useCallback(() => {
    setRedo(prev => {
      if (!prev.length) return prev
      setStrokes(s => [...s, prev[prev.length - 1]])
      return prev.slice(0, -1)
    })
  }, [])

  // ── Transport ──
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
    v.currentTime = Math.min(Math.max(0, v.currentTime + dir / SRC_FPS), max)
  }, [])
  const setPlaybackRate = useCallback((r: number) => {
    setRate(r)
    if (videoRef.current) videoRef.current.playbackRate = r
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'Escape') { if (exporting == null) onClose() }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoLast(); else undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redoLast, onClose, exporting])

  // ── Export ──
  const runExport = async () => {
    const v = videoRef.current
    if (!v || !dims || !canExport) return
    exportCancel.current = false
    setExporting(0)
    const wasTime = v.currentTime
    v.pause()
    // H.264 needs even dimensions — match the recorder's own rounding so the
    // VideoFrame size equals the encoder config.
    const W = dims.w - (dims.w % 2), H = dims.h - (dims.h % 2)
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const ctx = off.getContext('2d')!
    try {
      const rec = await createMp4Recorder({ width: W, height: H, fps: SRC_FPS })
      const dur = v.duration || duration
      const total = Math.max(1, Math.round(dur * SRC_FPS))
      const repeat = Math.max(1, Math.round(1 / exportSpeed))
      let outIdx = 0
      for (let i = 0; i < total; i++) {
        if (exportCancel.current) { rec.abort(); setExporting(null); v.currentTime = wasTime; return }
        await seekTo(v, Math.min(dur, i / SRC_FPS))
        ctx.clearRect(0, 0, W, H)
        ctx.drawImage(v, 0, 0, W, H)
        drawStrokes(ctx, strokes, W, H)
        for (let r = 0; r < repeat; r++) await rec.addFrame(off, outIdx++)
        setExporting((i + 1) / total)
      }
      const blob = await rec.finish()
      downloadBlob(blob, clipFilename(row, { suffix: ' (telestrated)' }))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(null)
      v.currentTime = wasTime
    }
  }

  const exportFrame = () => {
    const v = videoRef.current
    if (!v || !dims) return
    const off = document.createElement('canvas')
    off.width = dims.w; off.height = dims.h
    const ctx = off.getContext('2d')!
    ctx.drawImage(v, 0, 0, dims.w, dims.h)
    drawStrokes(ctx, strokes, dims.w, dims.h)
    off.toBlob(b => { if (b) downloadBlob(b, clipFilename(row, { suffix: ' (telestrated)', ext: 'png' })) }, 'image/png')
  }

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00.00'
    const m = Math.floor(s / 60)
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950">
        <div className="text-sm font-bold text-zinc-100">
          {flipName(row.player_name)} <span className="text-zinc-500 font-normal">to {flipName(row.batter_name)}</span>
          <span className="text-zinc-600 font-normal text-xs"> · {row.pitch_type || '—'}{row.release_speed ? ` ${row.release_speed.toFixed(1)}` : ''} · {outcome(row)}</span>
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-600">Telestrator</span>
        <button className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-1" onClick={onClose} title="Close (Esc)">×</button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Toolbar */}
        <div className="w-[220px] shrink-0 border-r border-zinc-800 bg-zinc-950 p-3 space-y-4 overflow-y-auto">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Tool</div>
            <div className="grid grid-cols-3 gap-1.5">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  title={t.label}
                  className={`${btn} flex flex-col items-center gap-0.5 py-1.5 ${tool === t.id ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  <span className="text-[9px]">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Color</div>
            <div className="flex flex-wrap gap-1.5">
              {STROKE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Width</div>
            <div className="flex gap-1.5">
              {(['S', 'M', 'L'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setWidthKey(k)}
                  className={`${btn} flex-1 ${widthKey === k ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            <button className={`${btn} flex-1 bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40`} onClick={undo} disabled={!strokes.length} title="Undo (⌘Z)">Undo</button>
            <button className={`${btn} flex-1 bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40`} onClick={redoLast} disabled={!redo.length} title="Redo (⇧⌘Z)">Redo</button>
          </div>
          <button className={`${btn} w-full bg-zinc-900 border-zinc-700 text-red-400/80 hover:text-red-400 disabled:opacity-40`} onClick={() => { setStrokes([]); setRedo([]) }} disabled={!strokes.length}>Clear all</button>

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Export</div>
            <div className="flex gap-1.5">
              {EXPORT_SPEEDS.map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => setExportSpeed(v)}
                  className={`${btn} flex-1 ${exportSpeed === v ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                  title={`Export at ${lbl} speed`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <button
              className={`${btn} w-full bg-emerald-600 hover:bg-emerald-500 border-emerald-600 text-white disabled:opacity-40`}
              onClick={runExport}
              disabled={!src || !canExport || exporting != null}
              title={canExport ? 'Burn markup into an mp4' : 'mp4 export needs Chrome or Edge'}
            >
              Export clip (mp4)
            </button>
            <button
              className={`${btn} w-full bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white disabled:opacity-40`}
              onClick={exportFrame}
              disabled={!src}
            >
              Export frame (png)
            </button>
            {!canExport && <div className="text-[11px] text-amber-500/80 leading-snug">mp4 export needs a Chromium browser (Chrome / Edge).</div>}
          </div>
        </div>

        {/* Stage */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-4 bg-black">
          {loadErr ? (
            <div className="text-sm text-red-400 max-w-sm text-center">
              {loadErr}{row.savant_url && <> <a href={row.savant_url} target="_blank" rel="noreferrer" className="text-emerald-400 underline">Savant ↗</a></>}
            </div>
          ) : !src || !dims ? (
            <div className="text-sm text-zinc-500">Loading clip…</div>
          ) : null}

          <div
            ref={wrapRef}
            className="relative max-w-full max-h-full"
            style={dims ? { aspectRatio: `${dims.w} / ${dims.h}`, width: 'min(100%, 1100px)' } : { display: src ? undefined : 'none' }}
          >
            {src && (
              <video
                ref={videoRef}
                src={src}
                className="absolute inset-0 w-full h-full object-contain bg-black"
                onLoadedMetadata={e => {
                  const v = e.target as HTMLVideoElement
                  const w = v.videoWidth || 1280, h = v.videoHeight || 720
                  setDims({ w, h })
                  setDuration(v.duration || 0)
                  const c = canvasRef.current
                  if (c) { c.width = w; c.height = h }
                  v.playbackRate = rate
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={e => setTime((e.target as HTMLVideoElement).currentTime)}
                playsInline
              />
            )}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: exporting != null ? 'wait' : 'crosshair', touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
        </div>
      </div>

      {/* Transport */}
      {src && dims && (
        <div className="border-t border-zinc-800 bg-zinc-950 px-4 pt-2 pb-2.5 space-y-1.5">
          <input
            type="range" min={0} max={duration || 0} step={1 / SRC_FPS}
            value={Math.min(time, duration || 0)}
            onChange={e => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); setTime(Number(e.target.value)) }}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex items-center gap-1.5">
            <button className={ctrlBtn} onClick={() => stepFrame(-1)} title="Frame back">‹｜</button>
            <button className="bg-emerald-600/20 border border-emerald-600 rounded-md text-emerald-400 px-3.5 py-1 text-[13px] leading-none hover:bg-emerald-600/30" onClick={togglePlay}>{playing ? '❚❚' : '▶'}</button>
            <button className={ctrlBtn} onClick={() => stepFrame(1)} title="Frame forward">｜›</button>
            <span className="text-xs text-zinc-400 tabular-nums ml-1.5">{fmt(time)} / {fmt(duration)}</span>
            <div className="flex-1" />
            {[0.25, 0.5, 1].map(r => (
              <button key={r} className={`rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${rate === r ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`} onClick={() => setPlaybackRate(r)}>
                {r === 0.25 ? '¼×' : r === 0.5 ? '½×' : `${r}×`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Export progress */}
      {exporting != null && (
        <div className="absolute inset-0 z-10 bg-black/70 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-5 w-[320px] text-center">
            <div className="text-sm font-semibold text-zinc-100 mb-3">Encoding mp4… {Math.round(exporting * 100)}%</div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${Math.round(exporting * 100)}%` }} />
            </div>
            <button className={`${btn} bg-zinc-800 border-zinc-700 text-zinc-300`} onClick={() => { exportCancel.current = true }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
