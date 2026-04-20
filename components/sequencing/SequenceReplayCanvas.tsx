'use client'

import {
  useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, useMemo,
} from 'react'
import {
  computeTrajectory, projectToScreen, type PitchKinematics, type Camera, type TrajectoryPoint,
} from '@/lib/trajectoryPhysics'
import { PITCH_COLORS } from '@/components/chartConfig'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReplayPitch {
  pitch_number: number
  pitch_name: string
  pitch_type: string
  release_speed: number
  plate_x: number
  plate_z: number
  description: string
  events: string | null
  balls: number
  strikes: number
  vx0: number; vy0: number; vz0: number
  ax: number; ay: number; az: number
  release_pos_x: number; release_pos_z: number; release_extension: number
}

export interface SequenceReplayHandle {
  renderFrameAt: (timeMs: number) => HTMLCanvasElement
  totalDurationMs: number
}

interface Props {
  pitches: ReplayPitch[]
  width?: number
  height?: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5

const CAM: Camera = { x: 0, y: -4, z: 2.5, fov: 45 }

const FLIGHT_MS = 800
const HOLD_MS = 500
const FINAL_HOLD_MS = 2000

const SPEEDS = [0.5, 1, 2]

// ── Helpers ────────────────────────────────────────────────────────────────

function pitchColor(name: string): string {
  return PITCH_COLORS[name] || '#888888'
}

function shortName(name: string): string {
  return name
    .replace('4-Seam Fastball', 'FF')
    .replace('Sinker', 'SI')
    .replace('Cutter', 'FC')
    .replace('Slider', 'SL')
    .replace('Sweeper', 'SW')
    .replace('Curveball', 'CU')
    .replace('Changeup', 'CH')
    .replace('Split-Finger', 'FS')
    .replace('Knuckle Curve', 'KC')
    .replace('Slurve', 'SV')
}

function countString(balls: number, strikes: number): string {
  return `${balls}-${strikes}`
}

function resultText(desc: string, events: string | null): string {
  if (events) return events.replace(/_/g, ' ')
  if (desc?.includes('called_strike')) return 'Called Strike'
  if (desc?.includes('swinging_strike')) return 'Swinging Strike'
  if (desc?.includes('ball')) return 'Ball'
  if (desc?.includes('foul')) return 'Foul'
  if (desc?.includes('hit_into_play')) return 'In Play'
  return desc?.replace(/_/g, ' ') || ''
}

// ── Component ──────────────────────────────────────────────────────────────

const SequenceReplayCanvas = forwardRef<SequenceReplayHandle, Props>(
  function SequenceReplayCanvas({ pitches, width = 540, height = 480 }, ref) {

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animRef = useRef<number>(0)
    const startRef = useRef<number>(0)
    const pausedAtRef = useRef<number>(0)

    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [progress, setProgress] = useState(0) // 0-1

    // Precompute trajectories
    const trajectories = useMemo(() => {
      return pitches.map(p => {
        const kin: PitchKinematics = {
          vx0: p.vx0, vy0: p.vy0, vz0: p.vz0,
          ax: p.ax, ay: p.ay, az: p.az,
          release_pos_x: p.release_pos_x,
          release_pos_z: p.release_pos_z,
          release_extension: p.release_extension,
        }
        return computeTrajectory(kin, 60)
      })
    }, [pitches])

    // Total duration
    const totalDuration = useMemo(() => {
      if (pitches.length === 0) return 0
      return pitches.length * (FLIGHT_MS + HOLD_MS) - HOLD_MS + FINAL_HOLD_MS
    }, [pitches.length])

    // ── Drawing ────────────────────────────────────────────────────────────

    const drawFrame = useCallback((
      ctx: CanvasRenderingContext2D,
      w: number, h: number,
      timeMs: number,
      forExport = false,
    ) => {
      // Background
      ctx.fillStyle = '#09090b'
      ctx.fillRect(0, 0, w, h)

      if (pitches.length === 0) return

      // Strike zone
      const zoneCorners = [
        { x: ZONE_LEFT, y: 17 / 12, z: ZONE_BOT },
        { x: ZONE_RIGHT, y: 17 / 12, z: ZONE_BOT },
        { x: ZONE_RIGHT, y: 17 / 12, z: ZONE_TOP },
        { x: ZONE_LEFT, y: 17 / 12, z: ZONE_TOP },
      ].map(pt => projectToScreen(pt, CAM, w, h))

      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(zoneCorners[0].x, zoneCorners[0].y)
      for (let i = 1; i < zoneCorners.length; i++) ctx.lineTo(zoneCorners[i].x, zoneCorners[i].y)
      ctx.closePath()
      ctx.stroke()

      // Inner zone grid (3x3)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      const zoneW = ZONE_RIGHT - ZONE_LEFT
      const zoneH = ZONE_TOP - ZONE_BOT
      for (let i = 1; i <= 2; i++) {
        const vx = ZONE_LEFT + (zoneW * i) / 3
        const a = projectToScreen({ x: vx, y: 17 / 12, z: ZONE_BOT }, CAM, w, h)
        const b = projectToScreen({ x: vx, y: 17 / 12, z: ZONE_TOP }, CAM, w, h)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()

        const hz = ZONE_BOT + (zoneH * i) / 3
        const c = projectToScreen({ x: ZONE_LEFT, y: 17 / 12, z: hz }, CAM, w, h)
        const d = projectToScreen({ x: ZONE_RIGHT, y: 17 / 12, z: hz }, CAM, w, h)
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke()
      }

      // Determine which pitch is animating
      const pitchStepMs = FLIGHT_MS + HOLD_MS
      const clampedTime = Math.min(timeMs, totalDuration)
      let activePitchIdx = Math.floor(clampedTime / pitchStepMs)
      let withinPitchMs = clampedTime - activePitchIdx * pitchStepMs

      if (activePitchIdx >= pitches.length) {
        activePitchIdx = pitches.length - 1
        withinPitchMs = FLIGHT_MS + HOLD_MS // fully complete
      }

      // Draw completed pitches as dots
      for (let i = 0; i < activePitchIdx; i++) {
        const traj = trajectories[i]
        if (!traj || traj.length === 0) continue
        const lastPt = traj[traj.length - 1]
        const sp = projectToScreen(lastPt, CAM, w, h)
        const col = pitchColor(pitches[i].pitch_name)
        const r = Math.max(4, 6 * sp.scale / 40)

        ctx.beginPath()
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()

        // Outline
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Draw current pitch animation
      const traj = trajectories[activePitchIdx]
      if (traj && traj.length > 0) {
        const col = pitchColor(pitches[activePitchIdx].pitch_name)
        const flightProgress = Math.min(1, withinPitchMs / FLIGHT_MS)

        // Interpolate position along trajectory
        const idx = flightProgress * (traj.length - 1)
        const lo = Math.floor(idx)
        const hi = Math.min(lo + 1, traj.length - 1)
        const frac = idx - lo
        const ballPt = {
          x: traj[lo].x + (traj[hi].x - traj[lo].x) * frac,
          y: traj[lo].y + (traj[hi].y - traj[lo].y) * frac,
          z: traj[lo].z + (traj[hi].z - traj[lo].z) * frac,
        }

        // Trail (draw from start to current position)
        const trailEnd = Math.ceil(idx)
        if (trailEnd > 0) {
          ctx.strokeStyle = col
          ctx.lineWidth = 2
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          const sp0 = projectToScreen(traj[0], CAM, w, h)
          ctx.moveTo(sp0.x, sp0.y)
          for (let j = 1; j <= trailEnd; j++) {
            const sp = projectToScreen(traj[j], CAM, w, h)
            ctx.lineTo(sp.x, sp.y)
          }
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        // Ball
        const ballSp = projectToScreen(ballPt, CAM, w, h)
        const ballR = Math.max(5, 8 * ballSp.scale / 40)

        // Glow
        const glow = ctx.createRadialGradient(ballSp.x, ballSp.y, 0, ballSp.x, ballSp.y, ballR * 3)
        glow.addColorStop(0, col + '60')
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(ballSp.x, ballSp.y, ballR * 3, 0, Math.PI * 2)
        ctx.fill()

        // Ball solid
        ctx.beginPath()
        ctx.arc(ballSp.x, ballSp.y, ballR, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.stroke()

        // If in hold phase, also draw as completed dot (already drawn as ball)
      }

      // ── HUD (canvas text for export, also used for interactive) ──────

      const activePitch = pitches[activePitchIdx]
      const isLastPitch = activePitchIdx === pitches.length - 1
      const showResult = isLastPitch && withinPitchMs >= FLIGHT_MS

      // Count
      ctx.font = 'bold 20px -apple-system, system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(countString(activePitch.balls, activePitch.strikes), 16, 16)

      // Pitch type + velo
      const typeStr = `${activePitch.pitch_name} — ${activePitch.release_speed} mph`
      ctx.font = '14px -apple-system, system-ui, sans-serif'
      ctx.fillStyle = pitchColor(activePitch.pitch_name)
      ctx.fillText(typeStr, 16, 42)

      // Pitch counter
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '12px -apple-system, system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`Pitch ${activePitchIdx + 1} of ${pitches.length}`, w - 16, 16)

      // Result (after final pitch lands)
      if (showResult) {
        const result = resultText(activePitch.description, activePitch.events)
        if (result) {
          ctx.font = 'bold 16px -apple-system, system-ui, sans-serif'
          ctx.fillStyle = '#10b981'
          ctx.textAlign = 'center'
          ctx.fillText(result, w / 2, h - 32)
        }
      }

      // Legend (bottom-left)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      const legendY = h - 12
      let legendX = 16
      const seenTypes = new Set<string>()
      for (const p of pitches) {
        if (seenTypes.has(p.pitch_name)) continue
        seenTypes.add(p.pitch_name)
        const c = pitchColor(p.pitch_name)
        ctx.fillStyle = c
        ctx.beginPath()
        ctx.arc(legendX + 5, legendY - 4, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '10px -apple-system, system-ui, sans-serif'
        ctx.fillText(shortName(p.pitch_name), legendX + 13, legendY)
        legendX += ctx.measureText(shortName(p.pitch_name)).width + 22
      }

    }, [pitches, trajectories, totalDuration])

    // ── Animation loop ─────────────────────────────────────────────────

    const tick = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const elapsed = (performance.now() - startRef.current) * speed
      const timeMs = pausedAtRef.current + elapsed

      if (timeMs >= totalDuration) {
        drawFrame(ctx, width, height, totalDuration)
        setProgress(1)
        setPlaying(false)
        return
      }

      drawFrame(ctx, width, height, timeMs)
      setProgress(timeMs / totalDuration)
      animRef.current = requestAnimationFrame(tick)
    }, [drawFrame, width, height, totalDuration, speed])

    useEffect(() => {
      if (playing) {
        startRef.current = performance.now()
        animRef.current = requestAnimationFrame(tick)
      }
      return () => cancelAnimationFrame(animRef.current)
    }, [playing, tick])

    // Draw initial frame
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawFrame(ctx, width, height, 0)
      setProgress(0)
      pausedAtRef.current = 0
    }, [drawFrame, width, height])

    // ── Controls ───────────────────────────────────────────────────────

    const play = useCallback(() => {
      if (progress >= 1) {
        pausedAtRef.current = 0
        setProgress(0)
      }
      setPlaying(true)
    }, [progress])

    const pause = useCallback(() => {
      cancelAnimationFrame(animRef.current)
      const elapsed = (performance.now() - startRef.current) * speed
      pausedAtRef.current = Math.min(pausedAtRef.current + elapsed, totalDuration)
      setPlaying(false)
    }, [speed, totalDuration])

    const stepForward = useCallback(() => {
      if (playing) pause()
      const pitchStepMs = FLIGHT_MS + HOLD_MS
      const currentIdx = Math.floor(pausedAtRef.current / pitchStepMs)
      const nextTime = Math.min((currentIdx + 1) * pitchStepMs, totalDuration)
      pausedAtRef.current = nextTime
      setProgress(nextTime / totalDuration)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) drawFrame(ctx, width, height, nextTime)
      }
    }, [playing, pause, drawFrame, width, height, totalDuration])

    const stepBack = useCallback(() => {
      if (playing) pause()
      const pitchStepMs = FLIGHT_MS + HOLD_MS
      const currentIdx = Math.floor(pausedAtRef.current / pitchStepMs)
      const prevTime = Math.max((currentIdx - 1) * pitchStepMs, 0)
      pausedAtRef.current = prevTime
      setProgress(prevTime / totalDuration)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) drawFrame(ctx, width, height, prevTime)
      }
    }, [playing, pause, drawFrame, width, height, totalDuration])

    const seekTo = useCallback((pct: number) => {
      if (playing) pause()
      const timeMs = pct * totalDuration
      pausedAtRef.current = timeMs
      setProgress(pct)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) drawFrame(ctx, width, height, timeMs)
      }
    }, [playing, pause, drawFrame, width, height, totalDuration])

    // ── Export handle ──────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      renderFrameAt(timeMs: number): HTMLCanvasElement {
        const offscreen = document.createElement('canvas')
        offscreen.width = width
        offscreen.height = height
        const ctx = offscreen.getContext('2d')!
        drawFrame(ctx, width, height, timeMs, true)
        return offscreen
      },
      totalDurationMs: totalDuration,
    }), [drawFrame, width, height, totalDuration])

    // ── Render ─────────────────────────────────────────────────────────

    if (pitches.length === 0) return null

    return (
      <div className="flex flex-col gap-2">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="rounded-lg border border-zinc-800"
          style={{ width, height }}
        />

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Step back */}
          <button
            onClick={stepBack}
            className="h-8 w-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"
            title="Previous pitch"
          >
            ⏮
          </button>

          {/* Play/Pause */}
          <button
            onClick={playing ? pause : play}
            className="h-8 w-8 flex items-center justify-center rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm transition"
          >
            {playing ? '⏸' : '▶'}
          </button>

          {/* Step forward */}
          <button
            onClick={stepForward}
            className="h-8 w-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"
            title="Next pitch"
          >
            ⏭
          </button>

          {/* Speed */}
          <div className="flex gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700 ml-2">
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-[10px] rounded transition ${
                  speed === s ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Progress bar */}
          <div className="flex-1 ml-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={e => seekTo(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>
    )
  }
)

export default SequenceReplayCanvas
