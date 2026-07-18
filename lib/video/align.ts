// Auto release-frame alignment for the pitch overlay — pure browser, no CV
// libraries. Absolute release detection on broadcast footage is unreliable, so
// instead we align by RELATIVE motion:
//
//   1. Sample each clip's frames coarsely, downscale to a tiny canvas, and
//      compute per-frame "motion energy" (mean absolute pixel delta vs the
//      previous sampled frame). The pitching delivery is a big hump.
//   2. Cross-correlate the two energy curves to find the lag that best aligns
//      the deliveries. That lag is the A→B time offset.
//
// The overlay model is: B_time = A_time − Δ. A positive correlation lag of L
// samples means a-sample i matches b-sample (i−L), i.e. b_time = a_time − L·dt,
// so Δ = L·dt.

import { seekTo } from './seek'

export interface EnergyCurve {
  energy: number[] // normalized 0..1, one per sampled frame
  dt: number       // seconds between samples
  peakIndex: number
}

export interface AlignResult {
  deltaSeconds: number
  deltaFrames: number
  confidence: number // normalized cross-correlation at the chosen lag, -1..1
  peakA: number      // seconds — clip A motion peak (≈ release/contact)
  peakB: number
}

export interface MotionEnergyOptions {
  sampleFps?: number // how many frames/sec to sample (default 15)
  width?: number     // downscaled analysis width (default 64)
}

export async function motionEnergy(
  v: HTMLVideoElement,
  opts: MotionEnergyOptions = {},
): Promise<EnergyCurve> {
  const sampleFps = opts.sampleFps ?? 15
  const w = opts.width ?? 64
  const aspect = v.videoHeight && v.videoWidth ? v.videoHeight / v.videoWidth : 9 / 16
  const h = Math.max(2, Math.round(w * aspect))
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!

  const dur = v.duration || 0
  const dt = 1 / sampleFps
  const n = Math.max(2, Math.floor(dur * sampleFps))
  const energy: number[] = []
  let prev: Uint8ClampedArray | null = null
  const wasTime = v.currentTime
  v.pause()

  for (let i = 0; i < n; i++) {
    await seekTo(v, Math.min(dur, i * dt))
    ctx.drawImage(v, 0, 0, w, h)
    const cur = ctx.getImageData(0, 0, w, h).data // fresh array each call
    if (prev) {
      let s = 0
      for (let p = 0; p < cur.length; p += 4) {
        s += Math.abs(cur[p] - prev[p]) + Math.abs(cur[p + 1] - prev[p + 1]) + Math.abs(cur[p + 2] - prev[p + 2])
      }
      energy.push(s / ((cur.length / 4) * 3 * 255))
    } else {
      energy.push(0)
    }
    prev = cur
  }
  v.currentTime = wasTime

  let peakIndex = 0
  for (let i = 1; i < energy.length; i++) if (energy[i] > energy[peakIndex]) peakIndex = i
  return { energy, dt, peakIndex }
}

// Best integer lag (in samples) aligning a[i] with b[i-lag], by normalized
// cross-correlation. Returns the lag and its correlation score.
export function bestLag(a: number[], b: number[], maxLag: number): { lag: number; score: number } {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / (x.length || 1)
  const am = mean(a), bm = mean(b)
  const A = a.map(x => x - am), B = b.map(x => x - bm)
  let best = { lag: 0, score: -Infinity }
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let num = 0, ca = 0, cb = 0, cnt = 0
    for (let i = 0; i < A.length; i++) {
      const j = i - lag
      if (j < 0 || j >= B.length) continue
      num += A[i] * B[j]; ca += A[i] * A[i]; cb += B[j] * B[j]; cnt++
    }
    if (cnt < 4) continue
    const denom = Math.sqrt(ca * cb) || 1
    const score = num / denom
    if (score > best.score) best = { lag, score }
  }
  return best
}

export async function alignClips(
  vA: HTMLVideoElement,
  vB: HTMLVideoElement,
  srcFps = 30,
): Promise<AlignResult> {
  const [ca, cb] = [await motionEnergy(vA), await motionEnergy(vB)]
  const dt = ca.dt
  // Search up to ~2s of offset either way (or the shorter curve).
  const maxLag = Math.min(
    Math.max(ca.energy.length, cb.energy.length) - 2,
    Math.round(2.0 / dt),
  )
  const { lag, score } = bestLag(ca.energy, cb.energy, Math.max(1, maxLag))
  const deltaSeconds = lag * dt
  return {
    deltaSeconds,
    deltaFrames: Math.round(deltaSeconds * srcFps),
    confidence: score,
    peakA: ca.peakIndex * ca.dt,
    peakB: cb.peakIndex * cb.dt,
  }
}
