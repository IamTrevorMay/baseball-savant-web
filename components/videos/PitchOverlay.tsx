'use client'

// Pitch Overlay — stack two pitch clips on one canvas to compare movement /
// release / deception. Clip A is the base; clip B is composited on top with an
// adjustable opacity, blend mode, brightness/contrast, transform (to register
// the two mounds), and a time offset Δ. Export burns the composite to mp4.
//
// v1: manual Δ (frame slider). Phase 4 adds auto release-frame alignment.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipRow } from '@/lib/video/types'
import { clipFilename, flipName, loadClipObjectURL, outcome } from '@/lib/video/clip'
import { seekTo } from '@/lib/video/seek'
import { alignClips } from '@/lib/video/align'
import { createMp4Recorder, downloadBlob, webCodecsSupported } from '@/lib/video/mp4Recorder'

const SRC_FPS = 30
const BLENDS: { id: GlobalCompositeOperation; label: string }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'screen', label: 'Screen' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'difference', label: 'Difference' },
  { id: 'multiply', label: 'Multiply' },
]
const EXPORT_SPEEDS: [number, string][] = [[1, '1×'], [0.5, '½×'], [0.25, '¼×']]

const btn = 'px-2.5 py-1.5 rounded text-sm font-medium transition border'
const ctrlBtn = 'bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 px-2 py-1 text-[13px] leading-none hover:bg-zinc-700 disabled:opacity-40'
const lbl = 'text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block'

interface Transform { scale: number; dx: number; dy: number }
interface Adjust { brightness: number; contrast: number }

interface Config {
  opacityB: number
  blend: GlobalCompositeOperation
  adjA: Adjust
  adjB: Adjust
  transformB: Transform
  deltaFrames: number // B shows time = A - deltaFrames/fps
  solo: 'none' | 'A' | 'B'
}

const DEFAULT_CFG: Config = {
  opacityB: 0.5,
  blend: 'screen',
  adjA: { brightness: 1, contrast: 1 },
  adjB: { brightness: 1, contrast: 1 },
  transformB: { scale: 1, dx: 0, dy: 0 },
  deltaFrames: 0,
  solo: 'none',
}

function drawClip(
  ctx: CanvasRenderingContext2D, video: HTMLVideoElement, W: number, H: number,
  adj: Adjust, tf: Transform,
) {
  ctx.filter = `brightness(${adj.brightness}) contrast(${adj.contrast})`
  const sw = W * tf.scale, sh = H * tf.scale
  const x = tf.dx * W + (W - sw) / 2
  const y = tf.dy * H + (H - sh) / 2
  ctx.drawImage(video, x, y, sw, sh)
  ctx.filter = 'none'
}

export default function PitchOverlay({
  clips, onExit,
}: { clips: [ClipRow, ClipRow]; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vARef = useRef<HTMLVideoElement>(null)
  const vBRef = useRef<HTMLVideoElement>(null)

  const [swap, setSwap] = useState(false)
  const rowA = swap ? clips[1] : clips[0]
  const rowB = swap ? clips[0] : clips[1]

  // Load both clips as blob URLs (keyed by original order; role swap is a view flip).
  const [urls, setUrls] = useState<[string | null, string | null]>([null, null])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const urlA = swap ? urls[1] : urls[0]
  const urlB = swap ? urls[0] : urls[1]

  const [dimsA, setDimsA] = useState<{ w: number; h: number } | null>(null)
  const [durA, setDurA] = useState(0)
  const [durB, setDurB] = useState(0)

  const [cfg, setCfg] = useState<Config>(DEFAULT_CFG)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const setC = (patch: Partial<Config>) => setCfg(c => ({ ...c, ...patch }))

  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [rate, setRate] = useState(0.5)
  const [time, setTime] = useState(0)

  const [exportSpeed, setExportSpeed] = useState(0.5)
  const [exporting, setExporting] = useState<number | null>(null)
  const exportCancel = useRef(false)
  const canExport = webCodecsSupported()

  const [aligning, setAligning] = useState(false)
  const [alignInfo, setAlignInfo] = useState<{ confidence: number; peakA: number } | null>(null)

  useEffect(() => {
    let live = true
    const made: string[] = []
    ;(async () => {
      try {
        const [a, b] = await Promise.all([loadClipObjectURL(clips[0]), loadClipObjectURL(clips[1])])
        made.push(a, b)
        if (!live) { made.forEach(URL.revokeObjectURL); return }
        setUrls([a, b])
      } catch (e) {
        if (live) setLoadErr(e instanceof Error ? e.message : 'Could not load one of the clips.')
      }
    })()
    return () => { live = false; made.forEach(URL.revokeObjectURL) }
  }, [clips])

  const bTimeFor = useCallback((tA: number) => {
    const d = cfgRef.current.deltaFrames / SRC_FPS
    return Math.min(Math.max(0, tA - d), Math.max(0, durB))
  }, [durB])

  // ── Composite one frame onto the canvas ──
  const compose = useCallback(() => {
    const c = canvasRef.current, vA = vARef.current, vB = vBRef.current
    if (!c || !vA || !vB || !dimsA) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const { opacityB, blend, adjA, adjB, transformB, solo } = cfgRef.current
    const W = c.width, H = c.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    if (solo !== 'B') {
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      drawClip(ctx, vA, W, H, adjA, { scale: 1, dx: 0, dy: 0 })
    }
    if (solo !== 'A') {
      ctx.globalAlpha = solo === 'B' ? 1 : opacityB
      ctx.globalCompositeOperation = solo === 'B' ? 'source-over' : blend
      drawClip(ctx, vB, W, H, adjB, transformB)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }, [dimsA])

  // ── rAF loop: keep B synced to A, composite, mirror time ──
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const vA = vARef.current, vB = vBRef.current
      if (vA && vB && !aligningRef.current) {
        const targetB = bTimeFor(vA.currentTime)
        if (Math.abs(vB.currentTime - targetB) > 1.5 / SRC_FPS && vB.readyState >= 2) {
          vB.currentTime = targetB
        }
        compose()
        setTime(vA.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [compose, bTimeFor])

  const bothReady = urlA && urlB && dimsA

  // ── Transport ──
  const play = useCallback(() => {
    const vA = vARef.current, vB = vBRef.current
    if (!vA || !vB) return
    if (vA.paused) {
      if (vA.currentTime >= (durA || Infinity) - 1e-2) { vA.currentTime = 0; vB.currentTime = bTimeFor(0) }
      vA.play().catch(() => {}); vB.play().catch(() => {})
    } else { vA.pause(); vB.pause() }
  }, [durA, bTimeFor])

  const stepFrame = useCallback((dir: number) => {
    const vA = vARef.current, vB = vBRef.current
    if (!vA || !vB) return
    vA.pause(); vB.pause()
    vA.currentTime = Math.min(Math.max(0, vA.currentTime + dir / SRC_FPS), durA || 0)
    vB.currentTime = bTimeFor(vA.currentTime)
  }, [durA, bTimeFor])

  const scrub = useCallback((t: number) => {
    const vA = vARef.current, vB = vBRef.current
    if (!vA || !vB) return
    vA.currentTime = t; vB.currentTime = bTimeFor(t)
    setTime(t)
  }, [bTimeFor])

  const setPlaybackRate = useCallback((r: number) => {
    setRate(r)
    if (vARef.current) vARef.current.playbackRate = r
    if (vBRef.current) vBRef.current.playbackRate = r
  }, [])

  // ── Auto-align (phase 4) ──
  const aligningRef = useRef(false)
  const runAutoAlign = async () => {
    const vA = vARef.current, vB = vBRef.current
    if (!vA || !vB || aligning) return
    vA.pause(); vB.pause()
    aligningRef.current = true
    setAligning(true)
    try {
      const res = await alignClips(vA, vB, SRC_FPS)
      const clamped = Math.max(-90, Math.min(90, res.deltaFrames))
      setC({ deltaFrames: clamped })
      setAlignInfo({ confidence: res.confidence, peakA: res.peakA })
      // Park A on its motion peak (≈ release); B follows the freshly-set Δ.
      vA.currentTime = res.peakA
      vB.currentTime = Math.min(Math.max(0, res.peakA - clamped / SRC_FPS), durB)
      setTime(res.peakA)
    } catch {
      alert('Auto-align could not read one of the clips.')
    } finally {
      aligningRef.current = false
      setAligning(false)
    }
  }
  const jumpToRelease = () => { if (alignInfo) scrub(alignInfo.peakA) }

  // Loop clip A (and re-park B) when it ends.
  const onEndedA = useCallback(() => {
    const vA = vARef.current, vB = vBRef.current
    if (!vA || !vB) return
    if (loop) { vA.currentTime = 0; vB.currentTime = bTimeFor(0); vA.play().catch(() => {}); vB.play().catch(() => {}) }
  }, [loop, bTimeFor])

  // ── Export ──
  const runExport = async () => {
    const vA = vARef.current, vB = vBRef.current, c = canvasRef.current
    if (!vA || !vB || !c || !dimsA || !canExport) return
    exportCancel.current = false
    setExporting(0)
    const wasA = vA.currentTime, wasB = vB.currentTime
    vA.pause(); vB.pause()
    const W = dimsA.w - (dimsA.w % 2), H = dimsA.h - (dimsA.h % 2)
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const ctx = off.getContext('2d')!
    try {
      const rec = await createMp4Recorder({ width: W, height: H, fps: SRC_FPS })
      const total = Math.max(1, Math.round((durA || vA.duration) * SRC_FPS))
      const repeat = Math.max(1, Math.round(1 / exportSpeed))
      let outIdx = 0
      const { opacityB, blend, adjA, adjB, transformB, solo } = cfgRef.current
      for (let i = 0; i < total; i++) {
        if (exportCancel.current) { rec.abort(); setExporting(null); vA.currentTime = wasA; vB.currentTime = wasB; return }
        const tA = i / SRC_FPS
        await seekTo(vA, tA)
        await seekTo(vB, bTimeFor(tA))
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
        if (solo !== 'B') { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; drawClip(ctx, vA, W, H, adjA, { scale: 1, dx: 0, dy: 0 }) }
        if (solo !== 'A') { ctx.globalAlpha = solo === 'B' ? 1 : opacityB; ctx.globalCompositeOperation = solo === 'B' ? 'source-over' : blend; drawClip(ctx, vB, W, H, adjB, transformB) }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
        for (let r = 0; r < repeat; r++) await rec.addFrame(off, outIdx++)
        setExporting((i + 1) / total)
      }
      const blob = await rec.finish()
      downloadBlob(blob, clipFilename(rowA, { suffix: ` overlay ${flipName(rowB.player_name)}` }))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(null)
      vA.currentTime = wasA; vB.currentTime = wasB
    }
  }

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00.00'
    const m = Math.floor(s / 60)
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`
  }
  const range = (v: number, min: number, max: number, step: number, on: (n: number) => void) => (
    <input type="range" min={min} max={max} step={step} value={v} onChange={e => on(Number(e.target.value))} className="w-full accent-sky-500 cursor-pointer" />
  )

  return (
    <div className="flex gap-5 items-start w-full">
      {/* Controls */}
      <div className="w-[280px] shrink-0 space-y-3.5 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">Overlay</span>
          <button className={`${btn} bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200`} onClick={onExit}>Exit</button>
        </div>

        {/* Clip legend */}
        <div className="space-y-1.5">
          {([['A', rowA], ['B', rowB]] as const).map(([k, r]) => (
            <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Clip {k}</div>
              <div className="text-xs font-semibold text-zinc-200 truncate">{flipName(r.player_name)}</div>
              <div className="text-[11px] text-zinc-500 truncate">{r.pitch_type || '—'}{r.release_speed ? ` · ${r.release_speed.toFixed(1)}` : ''} · {outcome(r)} · {r.game_date}</div>
            </div>
          ))}
          <div className="flex gap-1.5">
            <button className={`${btn} flex-1 bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200`} onClick={() => { setSwap(s => !s); setAlignInfo(null); setC({ deltaFrames: 0 }) }}>Swap A/B</button>
            <button className={`${btn} flex-1 ${cfg.solo === 'A' ? 'bg-sky-600/20 border-sky-600 text-sky-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`} onClick={() => setC({ solo: cfg.solo === 'A' ? 'none' : 'A' })}>Solo A</button>
            <button className={`${btn} flex-1 ${cfg.solo === 'B' ? 'bg-sky-600/20 border-sky-600 text-sky-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`} onClick={() => setC({ solo: cfg.solo === 'B' ? 'none' : 'B' })}>Solo B</button>
          </div>
        </div>

        <div>
          <label className={lbl}>Clip B opacity · {Math.round(cfg.opacityB * 100)}%</label>
          {range(cfg.opacityB, 0, 1, 0.01, n => setC({ opacityB: n }))}
        </div>

        <div>
          <label className={lbl}>Blend mode</label>
          <div className="grid grid-cols-3 gap-1.5">
            {BLENDS.map(b => (
              <button key={b.id} onClick={() => setC({ blend: b.id })} className={`${btn} text-xs ${cfg.blend === b.id ? 'bg-sky-600/20 border-sky-600 text-sky-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>{b.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className={lbl}>B offset · {cfg.deltaFrames > 0 ? '+' : ''}{cfg.deltaFrames} frames</label>
          {range(cfg.deltaFrames, -90, 90, 1, n => setC({ deltaFrames: Math.round(n) }))}
          <button
            className={`${btn} w-full mt-1.5 ${aligning ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-sky-600/20 border-sky-600 text-sky-400 hover:bg-sky-600/30'}`}
            onClick={runAutoAlign}
            disabled={!bothReady || aligning}
            title="Detect and line up the two deliveries automatically"
          >
            {aligning ? 'Aligning…' : 'Auto-align releases'}
          </button>
          {alignInfo && !aligning && (
            <div className={`text-[10px] mt-1 leading-snug ${alignInfo.confidence < 0.3 ? 'text-amber-500/80' : 'text-zinc-600'}`}>
              {alignInfo.confidence < 0.3
                ? 'Low match confidence — fine-tune the offset by hand.'
                : `Aligned (match ${Math.round(alignInfo.confidence * 100)}%). Nudge the slider if needed.`}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-800">
          {([['A', cfg.adjA, (a: Adjust) => setC({ adjA: a })], ['B', cfg.adjB, (a: Adjust) => setC({ adjB: a })]] as const).map(([k, adj, set]) => (
            <div key={k} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Clip {k}</div>
              <div><label className={lbl}>Bright · {adj.brightness.toFixed(2)}</label>{range(adj.brightness, 0.3, 2, 0.01, n => set({ ...adj, brightness: n }))}</div>
              <div><label className={lbl}>Contrast · {adj.contrast.toFixed(2)}</label>{range(adj.contrast, 0.3, 2.5, 0.01, n => set({ ...adj, contrast: n }))}</div>
            </div>
          ))}
        </div>

        <div className="pt-1 border-t border-zinc-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Clip B registration</div>
          <div><label className={lbl}>Scale · {cfg.transformB.scale.toFixed(2)}×</label>{range(cfg.transformB.scale, 0.5, 2, 0.01, n => setC({ transformB: { ...cfg.transformB, scale: n } }))}</div>
          <div><label className={lbl}>Move X · {(cfg.transformB.dx * 100).toFixed(0)}%</label>{range(cfg.transformB.dx, -0.5, 0.5, 0.005, n => setC({ transformB: { ...cfg.transformB, dx: n } }))}</div>
          <div><label className={lbl}>Move Y · {(cfg.transformB.dy * 100).toFixed(0)}%</label>{range(cfg.transformB.dy, -0.5, 0.5, 0.005, n => setC({ transformB: { ...cfg.transformB, dy: n } }))}</div>
          <button className={`${btn} w-full bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200`} onClick={() => setCfg(DEFAULT_CFG)}>Reset all</button>
        </div>

        <div className="pt-1 border-t border-zinc-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Export</div>
          <div className="flex gap-1.5">
            {EXPORT_SPEEDS.map(([v, l]) => (
              <button key={v} onClick={() => setExportSpeed(v)} className={`${btn} flex-1 ${exportSpeed === v ? 'bg-sky-600/20 border-sky-600 text-sky-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>{l}</button>
            ))}
          </div>
          <button className={`${btn} w-full bg-sky-600 hover:bg-sky-500 border-sky-600 text-white disabled:opacity-40`} onClick={runExport} disabled={!bothReady || !canExport || exporting != null} title={canExport ? 'Burn the overlay into an mp4' : 'mp4 export needs Chrome or Edge'}>Export overlay (mp4)</button>
          {!canExport && <div className="text-[11px] text-amber-500/80 leading-snug">mp4 export needs a Chromium browser (Chrome / Edge).</div>}
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 min-w-0">
        {loadErr ? (
          <div className="py-24 text-center text-sm text-red-400">{loadErr}</div>
        ) : !bothReady ? (
          <div className="py-24 text-center text-sm text-zinc-500">Loading clips…</div>
        ) : null}

        <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black" style={{ display: bothReady ? undefined : 'none' }}>
          <canvas ref={canvasRef} width={dimsA?.w || 1280} height={dimsA?.h || 720} className="w-full h-auto block" />
          <div className="bg-zinc-950 border-t border-zinc-800 px-3.5 pt-2 pb-2.5 space-y-1.5">
            <input type="range" min={0} max={durA || 0} step={1 / SRC_FPS} value={Math.min(time, durA || 0)} onChange={e => scrub(Number(e.target.value))} className="w-full accent-sky-500 cursor-pointer" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <button className={ctrlBtn} onClick={() => stepFrame(-1)} title="Frame back">‹｜</button>
              <button className="bg-sky-600/20 border border-sky-600 rounded-md text-sky-400 px-3.5 py-1 text-[13px] leading-none hover:bg-sky-600/30" onClick={play}>{playing ? '❚❚' : '▶'}</button>
              <button className={ctrlBtn} onClick={() => stepFrame(1)} title="Frame forward">｜›</button>
              {alignInfo && <button className={ctrlBtn} onClick={jumpToRelease} title="Jump both clips to the detected release">⤓ Release</button>}
              <span className="text-xs text-zinc-400 tabular-nums ml-1.5">{fmt(time)} / {fmt(durA)}</span>
              <div className="flex-1" />
              {[0.25, 0.5, 1].map(r => (
                <button key={r} className={`rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${rate === r ? 'bg-sky-600/20 border-sky-600 text-sky-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`} onClick={() => setPlaybackRate(r)}>{r === 0.25 ? '¼×' : r === 0.5 ? '½×' : `${r}×`}</button>
              ))}
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer ml-2 select-none"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />Loop</label>
            </div>
          </div>
        </div>
      </div>

      {/* Source videos — kept in the DOM but offscreen. NOT display:none, which
          can let the browser throttle frame decoding and break drawImage. */}
      {urlA && <video ref={vARef} src={urlA} muted playsInline crossOrigin="anonymous"
        style={{ position: 'absolute', left: -99999, top: 0, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }}
        onLoadedMetadata={e => { const v = e.target as HTMLVideoElement; setDimsA({ w: v.videoWidth || 1280, h: v.videoHeight || 720 }); setDurA(v.duration || 0); v.playbackRate = rate }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEndedA} />}
      {urlB && <video ref={vBRef} src={urlB} muted playsInline crossOrigin="anonymous"
        style={{ position: 'absolute', left: -99999, top: 0, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }}
        onLoadedMetadata={e => { const v = e.target as HTMLVideoElement; setDurB(v.duration || 0); v.playbackRate = rate }} />}

      {/* Export progress */}
      {exporting != null && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-5 w-[320px] text-center">
            <div className="text-sm font-semibold text-zinc-100 mb-3">Encoding mp4… {Math.round(exporting * 100)}%</div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-4"><div className="h-full bg-sky-500 transition-[width]" style={{ width: `${Math.round(exporting * 100)}%` }} /></div>
            <button className={`${btn} bg-zinc-800 border-zinc-700 text-zinc-300`} onClick={() => { exportCancel.current = true }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
