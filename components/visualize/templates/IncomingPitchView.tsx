'use client'

import { useEffect, useRef, RefObject } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'
import { computeTrajectory, TrajectoryPoint } from '@/lib/trajectoryPhysics'
import { getPitchColor } from '@/components/chartConfig'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

interface AccumulatedDot {
  /** Plate-space x (feet), already converted to canvas px by caller */
  cx: number
  /** Plate-space z (feet), already converted to canvas px by caller */
  cy: number
  color: string
  /** Opacity fades slightly for older dots */
  alpha: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Catcher POV camera — behind home plate, looking toward mound.
 * Focal length is derived from fov + canvas height; we keep it separate here.
 */
const CAMERA_FOV_DEG = 50
const CAMERA_Y = 0        // at home plate
const CAMERA_Z = 2.5      // average strike zone center height (feet)

/** How many pitches to animate simultaneously in a batch */
const BATCH_SIZE = 5

/** Duration of one pitch's travel animation (seconds real time) */
const PITCH_ANIM_DURATION = 0.5

/** How long the plate-dot lingers before the next pitch batch starts (seconds) */
const BATCH_PAUSE = 0.25

/** Strike zone boundaries (feet, catcher's POV) */
const SZ_LEFT   = -17 / 24   // -(8.5 in) = -0.708 ft
const SZ_RIGHT  =  17 / 24
const SZ_BOTTOM =  1.5        // typical sz_bot
const SZ_TOP    =  3.5        // typical sz_top

/** Max accumulated dots kept on screen before loop reset */
const MAX_DOTS_PER_QUALITY: Record<QualityPreset['id'], number> = {
  draft:    30,
  standard: 80,
  high:     150,
  ultra:    300,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert Statcast world-space feet to canvas pixel coords using a simplified
 * perspective projection from the catcher's POV.
 *
 * The camera is at (0, CAMERA_Y, CAMERA_Z) looking toward +y.
 * For a world point (wx, wy, wz):
 *   dx = wx - 0        (horizontal offset from center)
 *   dy = wy - CAMERA_Y (depth — distance in front of camera)
 *   dz = wz - CAMERA_Z (vertical offset)
 *
 * focal = (cssH / 2) / tan(fov/2)
 * screenX = centerX + (dx / dy) * focal
 * screenY = centerY - (dz / dy) * focal   (canvas y is inverted)
 */
function worldToCanvas(
  wx: number, wy: number, wz: number,
  focalLength: number,
  centerX: number, centerY: number,
): { x: number; y: number } {
  const dy = Math.max(wy - CAMERA_Y, 0.01)
  const dx = wx
  const dz = wz - CAMERA_Z
  return {
    x: centerX + (dx / dy) * focalLength,
    y: centerY - (dz / dy) * focalLength,
  }
}

/**
 * Compute the approximate radius of the ball in pixels at a given y-depth,
 * using perspective scaling.  A baseball is 1.45 in radius = 0.121 ft.
 */
function ballRadius(wy: number, focalLength: number, quality: QualityPreset): number {
  const dy = Math.max(wy - CAMERA_Y, 0.01)
  const baseR = (0.121 / dy) * focalLength
  // Clamp to reasonable screen sizes
  const minR = quality.id === 'draft' ? 2 : 3
  const maxR = quality.id === 'draft' ? 22 : 28
  return Math.max(minR, Math.min(maxR, baseR))
}

/**
 * Trajectory steps based on quality.
 */
function trajectorySteps(quality: QualityPreset): number {
  switch (quality.id) {
    case 'draft': return 40
    case 'standard': return 80
    case 'high': return 120
    case 'ultra': return 200
  }
}

/**
 * Trail length (number of past trajectory points to draw as fading tail).
 */
function trailLength(quality: QualityPreset): number {
  switch (quality.id) {
    case 'draft': return 0
    case 'standard': return 4
    case 'high': return 8
    case 'ultra': return 14
  }
}

// ---------------------------------------------------------------------------
// IncomingPitchView component
// ---------------------------------------------------------------------------

export default function IncomingPitchView({
  data,
  playerName,
  quality,
  containerRef,
  onFrameUpdate,
}: TemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(false)

  // Animation state stored in refs (mutated inside rAF loop without triggers)
  const batchIndexRef   = useRef(0)   // which batch of pitches we're on
  const batchTimeRef    = useRef(0)   // elapsed time within current batch (s)
  const lastTsRef       = useRef<number | null>(null)
  const frameRef        = useRef(0)
  const dotsRef         = useRef<AccumulatedDot[]>([])
  const pausingRef      = useRef(false)
  const pauseTimeRef    = useRef(0)

  // ---------------------------------------------------------------------------
  // Draw one frame
  // ---------------------------------------------------------------------------
  function draw(
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    focalLength: number,
    centerX: number,
    centerY: number,
    pitches: any[],
    allTrajectories: TrajectoryPoint[][],
    batchIndex: number,
    batchT: number,  // 0..1 normalized
  ) {
    // Background gradient — dark sky feel
    const grad = ctx.createLinearGradient(0, 0, 0, cssH)
    grad.addColorStop(0, '#0c1118')
    grad.addColorStop(1, '#09090b')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, cssW, cssH)

    // -----------------------------------------------------------------------
    // Strike zone
    // -----------------------------------------------------------------------
    const szTL = worldToCanvas(SZ_LEFT,  STRIKE_ZONE_Y_WORLD, SZ_TOP,    focalLength, centerX, centerY)
    const szBR = worldToCanvas(SZ_RIGHT, STRIKE_ZONE_Y_WORLD, SZ_BOTTOM, focalLength, centerX, centerY)
    const szW  = szBR.x - szTL.x
    const szH  = szBR.y - szTL.y

    // Subtle fill
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fillRect(szTL.x, szTL.y, szW, szH)

    // Grid inside strike zone (3x3 quadrant lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 0.75
    for (let i = 1; i <= 2; i++) {
      const xOff = szTL.x + (szW / 3) * i
      ctx.beginPath(); ctx.moveTo(xOff, szTL.y); ctx.lineTo(xOff, szBR.y); ctx.stroke()
      const yOff = szTL.y + (szH / 3) * i
      ctx.beginPath(); ctx.moveTo(szTL.x, yOff); ctx.lineTo(szBR.x, yOff); ctx.stroke()
    }

    // Outer border
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(szTL.x, szTL.y, szW, szH)

    // -----------------------------------------------------------------------
    // Home plate pentagon (screen-space near bottom-center)
    // -----------------------------------------------------------------------
    const plateY_world = 17 / 12 // front edge
    const plW = 17 / 24
    const plD = 0.708
    const plateVerts = [
      worldToCanvas(-plW, plateY_world,        0, focalLength, centerX, centerY),
      worldToCanvas( plW, plateY_world,        0, focalLength, centerX, centerY),
      worldToCanvas( plW, plateY_world - plD,  0, focalLength, centerX, centerY),
      worldToCanvas(   0, plateY_world - plD - 0.2, 0, focalLength, centerX, centerY),
      worldToCanvas(-plW, plateY_world - plD,  0, focalLength, centerX, centerY),
    ]
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(plateVerts[0].x, plateVerts[0].y)
    for (let i = 1; i < plateVerts.length; i++) ctx.lineTo(plateVerts[i].x, plateVerts[i].y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // -----------------------------------------------------------------------
    // Accumulated dots from previous pitches
    // -----------------------------------------------------------------------
    const maxDots = MAX_DOTS_PER_QUALITY[quality.id]
    for (const dot of dotsRef.current) {
      ctx.globalAlpha = dot.alpha
      ctx.beginPath()
      ctx.arc(dot.cx, dot.cy, 4, 0, Math.PI * 2)
      ctx.fillStyle = dot.color
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // -----------------------------------------------------------------------
    // Active pitches in this batch
    // -----------------------------------------------------------------------
    const startIdx = batchIndex * BATCH_SIZE
    const endIdx = Math.min(startIdx + BATCH_SIZE, pitches.length)

    for (let pi = startIdx; pi < endIdx; pi++) {
      const pitch = pitches[pi]
      const traj = allTrajectories[pi]
      if (!traj || traj.length < 2) continue

      const color = getPitchColor(pitch.pitch_name || pitch.pitch_type || '')
      const maxT = traj[traj.length - 1].t

      // Find trajectory point at current time
      const currentT = batchT * maxT
      let currentIdx = traj.length - 1
      for (let i = 0; i < traj.length - 1; i++) {
        if (traj[i + 1].t > currentT) {
          currentIdx = i
          break
        }
      }

      const pt = traj[currentIdx]
      const sp = worldToCanvas(pt.x, pt.y, pt.z, focalLength, centerX, centerY)
      const r  = ballRadius(pt.y, focalLength, quality)

      // Trail
      const trail = trailLength(quality)
      if (trail > 0) {
        for (let ti = Math.max(0, currentIdx - trail); ti < currentIdx; ti++) {
          const tPt = traj[ti]
          const tSp = worldToCanvas(tPt.x, tPt.y, tPt.z, focalLength, centerX, centerY)
          const tR  = ballRadius(tPt.y, focalLength, quality)
          const age = (currentIdx - ti) / trail
          ctx.globalAlpha = (1 - age) * 0.35
          ctx.beginPath()
          ctx.arc(tSp.x, tSp.y, Math.max(1, tR * 0.6), 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // Ball glow
      const glowR = r * 2.2
      const glow = ctx.createRadialGradient(sp.x, sp.y, r * 0.2, sp.x, sp.y, glowR)
      glow.addColorStop(0, color + 'aa')
      glow.addColorStop(1, color + '00')
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.fill()

      // Ball core
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Seam hint (white arc overlay at high quality)
      if (quality.id === 'high' || quality.id === 'ultra') {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = Math.max(0.5, r * 0.15)
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, r * 0.7, 0.3, 1.8)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1

    // -----------------------------------------------------------------------
    // Title overlay
    // -----------------------------------------------------------------------
    ctx.font = `bold ${Math.max(12, Math.round(cssH * 0.028))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`${playerName} — Catcher's View`, 16, 28)

    ctx.font = `${Math.max(10, Math.round(cssH * 0.018))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(161,161,170,0.7)'
    const shown = Math.min((batchIndex + 1) * BATCH_SIZE, pitches.length)
    ctx.fillText(`${shown} / ${pitches.length} pitches`, 16, cssH - 14)
  }

  // World y-coordinate used for the strike zone front face (front of plate)
  const STRIKE_ZONE_Y_WORLD = 17 / 12

  // ---------------------------------------------------------------------------
  // Start animation loop
  // ---------------------------------------------------------------------------
  function startAnimation(
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
  ) {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const steps = trajectorySteps(quality)
    const pitches = data.slice(-quality.maxPitches)
    const totalBatches = Math.ceil(pitches.length / BATCH_SIZE)

    // Pre-compute all trajectories
    const allTrajectories: TrajectoryPoint[][] = pitches.map(p => {
      try {
        if (
          p.vx0 == null || p.vy0 == null || p.vz0 == null ||
          p.ax  == null || p.ay  == null || p.az  == null ||
          p.release_pos_x == null || p.release_pos_z == null ||
          p.release_extension == null
        ) return []
        return computeTrajectory(p, steps)
      } catch {
        return []
      }
    })

    // Focal length: derived from fov and canvas height
    const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180
    const focalLength = (cssH / 2) / Math.tan(fovRad / 2)
    const centerX = cssW / 2
    // centerY maps CAMERA_Z (2.5 ft) to vertical center of screen
    // We position the screen center at the middle of the strike zone:
    const szMidZ = (SZ_TOP + SZ_BOTTOM) / 2
    // Where does szMidZ project? We want it near vertical center.
    // Use cssH * 0.42 (slightly above center) as the strike zone center
    const centerY = cssH * 0.42

    batchIndexRef.current  = 0
    batchTimeRef.current   = 0
    pausingRef.current     = false
    pauseTimeRef.current   = 0
    lastTsRef.current      = null
    frameRef.current       = 0
    dotsRef.current        = []

    const maxDots = MAX_DOTS_PER_QUALITY[quality.id]

    function tick(timestamp: number) {
      if (!mountedRef.current) return

      const last = lastTsRef.current
      const delta = last === null ? 0 : Math.min((timestamp - last) / 1000, 0.05)
      lastTsRef.current = timestamp

      const batchIndex = batchIndexRef.current

      // Detect loop reset
      if (batchIndex >= totalBatches) {
        batchIndexRef.current = 0
        batchTimeRef.current  = 0
        pausingRef.current    = false
        pauseTimeRef.current  = 0
        dotsRef.current       = []
      }

      if (pausingRef.current) {
        pauseTimeRef.current += delta
        if (pauseTimeRef.current >= BATCH_PAUSE) {
          pausingRef.current   = false
          pauseTimeRef.current = 0
          batchIndexRef.current++
          batchTimeRef.current = 0
        }
      } else {
        batchTimeRef.current += delta / PITCH_ANIM_DURATION
        if (batchTimeRef.current >= 1) {
          batchTimeRef.current = 1

          // Freeze at plate: capture final dot positions for this batch
          const startIdx = batchIndex * BATCH_SIZE
          const endIdx = Math.min(startIdx + BATCH_SIZE, pitches.length)
          for (let pi = startIdx; pi < endIdx; pi++) {
            const pitch = pitches[pi]
            const traj  = allTrajectories[pi]
            if (!traj || traj.length < 2) continue

            const lastPt = traj[traj.length - 1]
            const sp = worldToCanvas(lastPt.x, lastPt.y, lastPt.z, focalLength, centerX, centerY)
            const color = getPitchColor(pitch.pitch_name || pitch.pitch_type || '')

            dotsRef.current.push({ cx: sp.x, cy: sp.y, color, alpha: 0.85 })

            // Fade older dots slightly
            dotsRef.current.forEach((d, i) => {
              d.alpha = Math.max(0.2, 0.85 - ((dotsRef.current.length - 1 - i) * 0.03))
            })

            // Trim to max
            if (dotsRef.current.length > maxDots) {
              dotsRef.current = dotsRef.current.slice(-maxDots)
            }
          }

          pausingRef.current   = true
          pauseTimeRef.current = 0
        }
      }

      // Draw frame
      ctx.save()
      ctx.setTransform(quality.resolution, 0, 0, quality.resolution, 0, 0)
      draw(
        ctx, cssW, cssH,
        focalLength, centerX, centerY,
        pitches, allTrajectories,
        batchIndexRef.current,
        Math.min(batchTimeRef.current, 1),
      )
      ctx.restore()

      frameRef.current++
      const totalFrames = Math.round(
        totalBatches * (PITCH_ANIM_DURATION + BATCH_PAUSE) * quality.fps,
      )
      onFrameUpdate?.(frameRef.current, totalFrames)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  // ---------------------------------------------------------------------------
  // Canvas sizing
  // ---------------------------------------------------------------------------
  function setupCanvas() {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = quality.resolution
    const cssW = container.clientWidth
    const cssH = container.clientHeight
    if (cssW === 0 || cssH === 0) return

    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width  = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    startAnimation(ctx, cssW, cssH)
  }

  // ---------------------------------------------------------------------------
  // Mount / unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true
    setupCanvas()

    const observer = new ResizeObserver(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setupCanvas()
    })
    const container = containerRef.current
    if (container) observer.observe(container)

    return () => {
      mountedRef.current = false
      observer.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, playerName, quality])

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#09090b' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        aria-label="Incoming Pitch catcher's view visualization"
      />
    </div>
  )
}
