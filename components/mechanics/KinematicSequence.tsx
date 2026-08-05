'use client'

// Kinematic sequence chart — angular velocity of each segment through the delivery.
//
// Two stacked panels sharing one time axis, never two y-scales on one plot: the four
// rotational segments belong on a common °/s axis (that is what makes them comparable
// to published sequence plots), while lead-knee extension is an order of magnitude
// smaller and gets its own band underneath.
//
// The bold line is smoothed for readability; the faint line behind it is the raw
// derivative the metrics actually run on. That pairing is deliberate — `peakAngVel`
// differentiates raw marker positions with no filter, and the gap between the two
// traces is the honest picture of how much of a peak is signal.

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSequence, type SeqSeries } from '@/lib/mechanics/sequence'
import type { CanonicalCapture, EventFrames } from '@/lib/mechanics/types'
import type { Hand } from '@/lib/mechanics/events'

// Categorical slots 1–4 + 5, dark steps. Validated on the zinc-900 chart surface:
// worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3, all ≥3:1 contrast.
const SERIES_COLOR: Record<string, string> = {
  pelvis: '#3987e5',
  trunk: '#d95926',
  upperArm: '#199e70',
  hand: '#c98500',
  kneeExt: '#d55181',
}

const W = 900, H_MAIN = 210, H_KNEE = 74, PAD_L = 52, PAD_R = 16, PAD_T = 14, PAD_B = 22

export default function KinematicSequence({
  cap, events, hand, window: win, frameRef,
}: {
  cap: CanonicalCapture
  events: EventFrames
  hand: Hand
  window: { start: number; end: number }
  /** live playhead position, shared with the 3D viewer (never a React re-render) */
  frameRef: React.MutableRefObject<number>
}) {
  const seq = useMemo(() => buildSequence(cap, events, hand, win), [cap, events, hand, win])
  const [hover, setHover] = useState<number | null>(null)
  const [showRaw, setShowRaw] = useState(true)
  const playheadRef = useRef<SVGGElement>(null)

  const fps = seq.frameRate
  const ms = (f: number) => ((f - events.footContact) / fps) * 1000
  const x = (f: number) => PAD_L + ((f - seq.startFrame) / Math.max(1, seq.endFrame - seq.startFrame)) * (W - PAD_L - PAD_R)

  // Both axes scale on the SMOOTHED envelope, not the raw one. The raw derivative spikes
  // far above its own smoothed peak (the upper arm's raw peak is ~2.4x), and letting that
  // set the ceiling flattens hips and chest onto the baseline. Raw is clipped instead.
  const maxRot = useMemo(() => {
    let m = 0
    for (const s of seq.rotational) for (const v of s.smooth) if (Number.isFinite(v) && v > m) m = v
    // include the raw peaks that get a marker, so a dot never sits on the ceiling
    for (const s of seq.rotational) if (s.metricKey && Number.isFinite(s.peakValue)) m = Math.max(m, s.peakValue)
    return Math.max(1, m * 1.12)
  }, [seq])
  const maxKnee = useMemo(() => {
    let m = 0
    for (const v of seq.knee.smooth) if (Number.isFinite(v) && Math.abs(v) > m) m = Math.abs(v)
    return Math.max(1, Math.max(m, Math.abs(seq.knee.reportedValue ?? 0)) * 1.2)
  }, [seq])

  const yRot = (v: number) => PAD_T + (1 - v / maxRot) * (H_MAIN - PAD_T - PAD_B)
  const yKnee = (v: number) => PAD_T / 2 + (1 - (v + maxKnee) / (2 * maxKnee)) * (H_KNEE - PAD_T)

  const path = (s: SeqSeries, key: 'raw' | 'smooth', y: (v: number) => number) => {
    const arr = s[key]
    let d = '', pen = false
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]
      if (!Number.isFinite(v)) { pen = false; continue }
      const px = x(seq.startFrame + i).toFixed(1), py = y(v).toFixed(1)
      d += `${pen ? 'L' : 'M'}${px} ${py}`
      pen = true
    }
    return d
  }

  // Playhead is driven straight off the shared ref, so it tracks 240 fps playback
  // without the chart re-rendering.
  useEffect(() => {
    let alive = true
    const tick = () => {
      if (!alive) return
      const g = playheadRef.current
      if (g) {
        const f = Math.max(seq.startFrame, Math.min(seq.endFrame, frameRef.current))
        g.setAttribute('transform', `translate(${x(f)},0)`)
      }
      requestAnimationFrame(tick)
    }
    const id = requestAnimationFrame(tick)
    return () => { alive = false; cancelAnimationFrame(id) }
  }, [seq.startFrame, seq.endFrame, frameRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const frac = (px - PAD_L) / (W - PAD_L - PAD_R)
    if (frac < 0 || frac > 1) { setHover(null); return }
    setHover(Math.round(seq.startFrame + frac * (seq.endFrame - seq.startFrame)))
  }

  const ticks = useMemo(() => {
    const out: number[] = []
    const step = maxRot > 6000 ? 2000 : maxRot > 3000 ? 1000 : 500
    for (let v = 0; v <= maxRot; v += step) out.push(v)
    return out
  }, [maxRot])

  const eventMarks: Array<[string, number]> = [
    ['FC', events.footContact], ['MER', events.maxExternalRotation], ['REL', events.release],
  ]

  return (
    <div className="border-t border-zinc-800 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-baseline gap-2">
          <h4 className="text-[11px] uppercase tracking-wide text-zinc-500">Kinematic Sequence</h4>
          <span className={`text-[11px] ${seq.sequencedCorrectly ? 'text-emerald-400' : 'text-amber-400'}`}>
            {seq.sequencedCorrectly ? 'proximal → distal order intact' : 'out of order — a segment peaks early'}
          </span>
        </div>
        <button onClick={() => setShowRaw(r => !r)}
          className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
          {showRaw ? 'Hide raw' : 'Show raw'}
        </button>
      </div>

      {/* legend — identity is never colour-alone, and all four are direct-labelled at their peaks */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
        {[...seq.rotational, seq.knee].map(s => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: SERIES_COLOR[s.key] }} />
            {s.label}
            <span className="text-zinc-600 tabular-nums">
              {Number.isFinite(s.peakValue)
                ? `${Math.round(s.peakValue)}°/s @ ${ms(s.peakFrame) >= 0 ? '+' : ''}${ms(s.peakFrame).toFixed(0)}ms`
                : '—'}
              {!s.metricKey && ' (not a report metric)'}
              {s.reportedValue != null && ` · report ${Math.round(s.reportedValue)} (mean)`}
            </span>
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H_MAIN + H_KNEE}`} className="w-full"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <clipPath id="ks-main"><rect x={PAD_L} y={0} width={W - PAD_L - PAD_R} height={H_MAIN - PAD_B} /></clipPath>
          <clipPath id="ks-knee"><rect x={PAD_L} y={0} width={W - PAD_L - PAD_R} height={H_KNEE - PAD_T} /></clipPath>
        </defs>
        {/* ── rotational panel ── */}
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yRot(v)} y2={yRot(v)} stroke="#27272a" strokeWidth={1} />
            <text x={PAD_L - 6} y={yRot(v) + 3} textAnchor="end" fontSize={9} fill="#52525b">{v}</text>
          </g>
        ))}
        <text x={PAD_L - 6} y={PAD_T - 3} textAnchor="end" fontSize={9} fill="#71717a">°/s</text>

        {eventMarks.map(([label, f]) => (
          <g key={label}>
            <line x1={x(f)} x2={x(f)} y1={PAD_T - 6} y2={H_MAIN - PAD_B} stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(f) + 3} y={PAD_T} fontSize={9} fill="#a1a1aa">{label}</text>
          </g>
        ))}

        {showRaw && (
          <g clipPath="url(#ks-main)">
            {seq.rotational.map(s => (
              <path key={`${s.key}-raw`} d={path(s, 'raw', yRot)} fill="none"
                stroke={SERIES_COLOR[s.key]} strokeWidth={1} opacity={0.3} />
            ))}
          </g>
        )}
        {seq.rotational.map(s => (
          <path key={s.key} d={path(s, 'smooth', yRot)} fill="none"
            stroke={SERIES_COLOR[s.key]} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {/* Peak of the RAW signal — the value the report prints. It sits on the faint raw
            trace, so a leader ties it back to the smoothed line it belongs to. */}
        <g clipPath="url(#ks-main)">
          {seq.rotational.map(s => {
            if (!Number.isFinite(s.peakValue) || !s.metricKey) return null
            const sm = s.smooth[s.peakFrame - seq.startFrame]
            return (
              <g key={`${s.key}-pk`}>
                {Number.isFinite(sm) && (
                  <line x1={x(s.peakFrame)} x2={x(s.peakFrame)} y1={yRot(s.peakValue)} y2={yRot(sm)}
                    stroke={SERIES_COLOR[s.key]} strokeWidth={1} opacity={0.45} />
                )}
                <circle cx={x(s.peakFrame)} cy={yRot(s.peakValue)} r={3.5}
                  fill={SERIES_COLOR[s.key]} stroke="#18181b" strokeWidth={2} />
              </g>
            )
          })}
        </g>

        {/* ── lead-knee panel: separate scale, shared time axis ── */}
        <g transform={`translate(0 ${H_MAIN})`}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yKnee(0)} y2={yKnee(0)} stroke="#3f3f46" strokeWidth={1} />
          <text x={PAD_L - 6} y={yKnee(0) + 3} textAnchor="end" fontSize={9} fill="#52525b">0</text>
          <text x={PAD_L - 6} y={yKnee(maxKnee) + 8} textAnchor="end" fontSize={9} fill="#52525b">{Math.round(maxKnee)}</text>
          {eventMarks.map(([label, f]) => (
            <line key={label} x1={x(f)} x2={x(f)} y1={0} y2={H_KNEE - PAD_T} stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {showRaw && (
            <g clipPath="url(#ks-knee)">
              <path d={path(seq.knee, 'raw', yKnee)} fill="none" stroke={SERIES_COLOR.kneeExt} strokeWidth={1} opacity={0.3} />
            </g>
          )}
          <g clipPath="url(#ks-knee)">
            <path d={path(seq.knee, 'smooth', yKnee)} fill="none" stroke={SERIES_COLOR.kneeExt} strokeWidth={2} />
          </g>
          {/* What the report prints is a mean across FC→release, not the peak above it.
              Drawing both is the only honest way to show one curve and two numbers. */}
          {seq.knee.reportedValue != null && (
            <>
              <line x1={x(events.footContact)} x2={x(events.release)}
                y1={yKnee(seq.knee.reportedValue)} y2={yKnee(seq.knee.reportedValue)}
                stroke={SERIES_COLOR.kneeExt} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.85} />
              <text x={x(events.release) + 5} y={yKnee(seq.knee.reportedValue) + 3}
                fontSize={9} fill="#a1a1aa">
                report {Math.round(seq.knee.reportedValue)}°/s (mean)
              </text>
            </>
          )}
          <text x={PAD_L + 4} y={11} fontSize={9} fill="#71717a">lead knee extension °/s</text>
        </g>

        {/* time axis */}
        <text x={PAD_L} y={H_MAIN + H_KNEE - 2} fontSize={9} fill="#71717a">{ms(seq.startFrame).toFixed(0)}ms</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H_MAIN + H_KNEE - 2} fontSize={9} fill="#71717a" textAnchor="middle">
          ms from foot contact
        </text>
        <text x={W - PAD_R} y={H_MAIN + H_KNEE - 2} fontSize={9} fill="#71717a" textAnchor="end">+{ms(seq.endFrame).toFixed(0)}ms</text>

        {/* hover crosshair */}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H_MAIN + H_KNEE - 14} stroke="#a1a1aa" strokeWidth={1} opacity={0.6} />
        )}

        {/* playhead, driven imperatively */}
        <g ref={playheadRef}>
          <line x1={0} x2={0} y1={0} y2={H_MAIN + H_KNEE - 14} stroke="#38bdf8" strokeWidth={1.5} opacity={0.9} />
        </g>
      </svg>

      {hover != null && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-zinc-400 mt-1">
          <span className="tabular-nums text-zinc-500">{ms(hover) >= 0 ? '+' : ''}{ms(hover).toFixed(0)}ms</span>
          {[...seq.rotational, seq.knee].map(s => {
            const v = s.smooth[hover - seq.startFrame]
            return (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SERIES_COLOR[s.key] }} />
                {s.label} <span className="tabular-nums text-zinc-300">{Number.isFinite(v) ? Math.round(v) : '—'}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
