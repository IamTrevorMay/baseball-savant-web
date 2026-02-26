'use client'

import { useEffect, useRef, RefObject } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'
import { computeTrajectory, projectToScreen, TrajectoryPoint, Camera } from '@/lib/trajectoryPhysics'
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default broadcast-style camera: behind and above home plate, looking toward mound */
const DEFAULT_CAMERA: Camera = { x: 0, y: -5, z: 4, fov: 60 }

/** The camera orbits around this world-space focus point (mid-mound area) */
const FOCUS_POINT = { x: 0, y: 30, z: 2.5 }

/** Total animation loop duration in seconds */
const LOOP_DURATION = 0.5

/** Y intervals for the ground plane grid lines (feet from plate) */
const GRID_Y_STEPS = [0, 10, 20, 30, 40, 50, 60]

/** Ground plane X extents */
const GRID_X_MIN = -5
const GRID_X_MAX = 5

/** Strike zone extents (feet, Statcast convention) */
const STRIKE_ZONE_X_MIN = -17 / 24 // -(17/2)/12 ≈ -0.708 ft
const STRIKE_ZONE_X_MAX = 17 / 24
const STRIKE_ZONE_Z_BOTTOM = 1.5  // typical bottom
const STRIKE_ZONE_Z_TOP = 3.5     // typical top
const STRIKE_ZONE_Y = 17 / 12     // front of plate

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return trajectory steps count based on quality preset.
 */
function trajectorySteps(quality: QualityPreset): number {
  switch (quality.id) {
    case 'draft': return 50
    case 'standard': return 100
    case 'high': return 150
    case 'ultra': return 200
  }
}

/**
 * Return line width based on quality preset.
 */
function lineWidth(quality: QualityPreset): number {
  switch (quality.id) {
    case 'draft': return 1
    case 'standard': return 1.5
    case 'high': return 2
    case 'ultra': return 2
  }
}

/**
 * Apply an orbital rotation to a camera position around a focus point.
 * deltaTheta = horizontal orbit angle change (radians)
 * deltaPhi   = vertical orbit angle change (radians)
 */
function orbitCamera(camera: Camera, deltaTheta: number, deltaPhi: number): Camera {
  // Convert camera position to offset from focus
  const dx = camera.x - FOCUS_POINT.x
  const dy = camera.y - FOCUS_POINT.y
  const dz = camera.z - FOCUS_POINT.z

  const r = Math.sqrt(dx * dx + dy * dy + dz * dz)

  // Current spherical angles
  const theta = Math.atan2(dx, dy)               // horizontal
  const phi = Math.asin(Math.max(-1, Math.min(1, dz / r))) // vertical

  const newTheta = theta + deltaTheta
  const newPhi = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, phi + deltaPhi))

  return {
    x: FOCUS_POINT.x + r * Math.sin(newTheta) * Math.cos(newPhi),
    y: FOCUS_POINT.y + r * Math.cos(newTheta) * Math.cos(newPhi),
    z: FOCUS_POINT.z + r * Math.sin(newPhi),
    fov: camera.fov,
  }
}

// ---------------------------------------------------------------------------
// PitchFlight3D component
// ---------------------------------------------------------------------------

export default function PitchFlight3D({
  data,
  playerName,
  quality,
  containerRef,
  onFrameUpdate,
}: TemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<Camera>({ ...DEFAULT_CAMERA })
  const rafRef = useRef<number | null>(null)
  const animTimeRef = useRef(0)
  const lastTimestampRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const mountedRef = useRef(false)

  // Mouse drag state (stored in refs to avoid re-renders)
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })

  // ---------------------------------------------------------------------------
  // Core draw function — called every animation frame
  // ---------------------------------------------------------------------------
  function draw(
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    pitches: any[],
    allTrajectories: TrajectoryPoint[][],
    maxFlightTime: number,
    animTime: number,
  ) {
    const camera = cameraRef.current
    const lw = lineWidth(quality)

    // Background
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, cssW, cssH)

    // -----------------------------------------------------------------------
    // Ground plane grid
    // -----------------------------------------------------------------------
    ctx.strokeStyle = 'rgba(63,63,70,0.6)'
    ctx.lineWidth = 0.5

    for (const y of GRID_Y_STEPS) {
      const leftPt = projectToScreen({ x: GRID_X_MIN, y, z: 0 }, camera, cssW, cssH)
      const rightPt = projectToScreen({ x: GRID_X_MAX, y, z: 0 }, camera, cssW, cssH)
      ctx.beginPath()
      ctx.moveTo(leftPt.x, leftPt.y)
      ctx.lineTo(rightPt.x, rightPt.y)
      ctx.stroke()
    }
    // Longitudinal lines
    for (const x of [GRID_X_MIN, -2.5, 0, 2.5, GRID_X_MAX]) {
      const nearPt = projectToScreen({ x, y: 0, z: 0 }, camera, cssW, cssH)
      const farPt = projectToScreen({ x, y: 60, z: 0 }, camera, cssW, cssH)
      ctx.beginPath()
      ctx.moveTo(nearPt.x, nearPt.y)
      ctx.lineTo(farPt.x, farPt.y)
      ctx.stroke()
    }

    // -----------------------------------------------------------------------
    // Strike zone rectangle at y = STRIKE_ZONE_Y (front of plate)
    // -----------------------------------------------------------------------
    const szCorners = [
      { x: STRIKE_ZONE_X_MIN, y: STRIKE_ZONE_Y, z: STRIKE_ZONE_Z_BOTTOM },
      { x: STRIKE_ZONE_X_MAX, y: STRIKE_ZONE_Y, z: STRIKE_ZONE_Z_BOTTOM },
      { x: STRIKE_ZONE_X_MAX, y: STRIKE_ZONE_Y, z: STRIKE_ZONE_Z_TOP },
      { x: STRIKE_ZONE_X_MIN, y: STRIKE_ZONE_Y, z: STRIKE_ZONE_Z_TOP },
    ].map(p => projectToScreen(p, camera, cssW, cssH))

    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(szCorners[0].x, szCorners[0].y)
    for (let i = 1; i < szCorners.length; i++) ctx.lineTo(szCorners[i].x, szCorners[i].y)
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])

    // Home plate marker (pentagon footprint)
    const plateY = STRIKE_ZONE_Y
    const plateW = 17 / 24
    const plateD = 0.708 // approx depth
    const platePoints = [
      { x: -plateW, y: plateY, z: 0 },
      { x:  plateW, y: plateY, z: 0 },
      { x:  plateW, y: plateY - plateD, z: 0 },
      { x:  0,      y: plateY - plateD - 0.2, z: 0 },
      { x: -plateW, y: plateY - plateD, z: 0 },
    ].map(p => projectToScreen(p, camera, cssW, cssH))

    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(platePoints[0].x, platePoints[0].y)
    for (let i = 1; i < platePoints.length; i++) ctx.lineTo(platePoints[i].x, platePoints[i].y)
    ctx.closePath()
    ctx.stroke()

    // -----------------------------------------------------------------------
    // Pitch trajectories
    // -----------------------------------------------------------------------
    for (let pi = 0; pi < pitches.length; pi++) {
      const pitch = pitches[pi]
      const traj = allTrajectories[pi]
      if (!traj || traj.length < 2) continue

      const color = getPitchColor(pitch.pitch_name || pitch.pitch_type || '')

      // Find how far to draw based on current animation time
      // We draw points up to animTime
      ctx.strokeStyle = color
      ctx.lineWidth = lw
      ctx.globalAlpha = 0.85
      ctx.beginPath()

      let drawn = false
      let currentBallPt: { x: number; y: number } | null = null

      for (let i = 0; i < traj.length; i++) {
        const pt = traj[i]
        if (pt.t > animTime) break

        const sp = projectToScreen({ x: pt.x, y: pt.y, z: pt.z }, camera, cssW, cssH)

        if (!drawn) {
          ctx.moveTo(sp.x, sp.y)
          drawn = true
        } else {
          ctx.lineTo(sp.x, sp.y)
        }
        currentBallPt = { x: sp.x, y: sp.y }
      }

      if (drawn) {
        ctx.stroke()
      }

      // Draw ball circle at current position
      if (currentBallPt) {
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(currentBallPt.x, currentBallPt.y, lw * 2.5 + 1, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1

    // -----------------------------------------------------------------------
    // Title overlay
    // -----------------------------------------------------------------------
    ctx.font = `bold ${Math.max(12, Math.round(cssH * 0.028))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`${playerName} — 3D Pitch Flight`, 16, 28)

    // Subtle camera hint + coordinate reference
    ctx.font = `${Math.max(10, Math.round(cssH * 0.018))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(161,161,170,0.7)'
    ctx.fillText('Drag to rotate', 16, cssH - 14)
    ctx.fillStyle = 'rgba(161,161,170,0.35)'
    ctx.textAlign = 'right'
    ctx.fillText('+x = toward 1B (catcher view)', cssW - 16, cssH - 14)
    ctx.textAlign = 'left'
  }

  // ---------------------------------------------------------------------------
  // Main animation loop setup
  // ---------------------------------------------------------------------------
  function startAnimation(
    canvas: HTMLCanvasElement,
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

    // Pre-compute all trajectories
    const allTrajectories: TrajectoryPoint[][] = pitches.map(p => {
      try {
        if (
          p.vx0 == null || p.vy0 == null || p.vz0 == null ||
          p.ax == null || p.ay == null || p.az == null ||
          p.release_pos_x == null || p.release_pos_z == null ||
          p.release_extension == null
        ) return []
        return computeTrajectory(p, steps)
      } catch {
        return []
      }
    })

    // Max flight time across all trajectories
    let maxFlightTime = 0
    for (const traj of allTrajectories) {
      if (traj.length > 0) {
        maxFlightTime = Math.max(maxFlightTime, traj[traj.length - 1].t)
      }
    }
    if (maxFlightTime < 0.01) maxFlightTime = 0.45

    animTimeRef.current = 0
    lastTimestampRef.current = null
    frameRef.current = 0

    function tick(timestamp: number) {
      if (!mountedRef.current) return

      const last = lastTimestampRef.current
      const delta = last === null ? 0 : (timestamp - last) / 1000
      lastTimestampRef.current = timestamp

      animTimeRef.current += delta

      // Loop at LOOP_DURATION (add a small pause at end before restart)
      const loopTotal = maxFlightTime + 0.3
      if (animTimeRef.current > loopTotal) {
        animTimeRef.current = 0
      }

      const animTime = Math.min(animTimeRef.current, maxFlightTime)

      // Re-apply scale transform in case canvas was resized
      ctx.save()
      ctx.setTransform(quality.resolution, 0, 0, quality.resolution, 0, 0)
      draw(ctx, cssW, cssH, pitches, allTrajectories, maxFlightTime, animTime)
      ctx.restore()

      frameRef.current++
      onFrameUpdate?.(frameRef.current, Math.round(loopTotal * quality.fps))

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
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    startAnimation(canvas, ctx, cssW, cssH)
  }

  // ---------------------------------------------------------------------------
  // Mouse / drag handlers for camera orbit
  // ---------------------------------------------------------------------------
  function handleMouseDown(e: MouseEvent) {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.lastX
    const dy = e.clientY - dragRef.current.lastY
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY

    // Scale sensitivity
    const sensitivity = 0.005
    cameraRef.current = orbitCamera(cameraRef.current, dx * sensitivity, -dy * sensitivity)
  }

  function handleMouseUp() {
    dragRef.current.active = false
  }

  // Touch equivalents
  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY }
    }
  }
  function handleTouchMove(e: TouchEvent) {
    if (!dragRef.current.active || e.touches.length !== 1) return
    e.preventDefault()
    const dx = e.touches[0].clientX - dragRef.current.lastX
    const dy = e.touches[0].clientY - dragRef.current.lastY
    dragRef.current.lastX = e.touches[0].clientX
    dragRef.current.lastY = e.touches[0].clientY
    cameraRef.current = orbitCamera(cameraRef.current, dx * 0.005, -dy * 0.005)
  }
  function handleTouchEnd() {
    dragRef.current.active = false
  }

  // ---------------------------------------------------------------------------
  // Mount / unmount effect
  // ---------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true
    cameraRef.current = { ...DEFAULT_CAMERA }

    setupCanvas()

    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('mousedown', handleMouseDown)
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
      canvas.addEventListener('touchend', handleTouchEnd)
    }

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
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown)
        canvas.removeEventListener('touchstart', handleTouchStart)
        canvas.removeEventListener('touchmove', handleTouchMove)
        canvas.removeEventListener('touchend', handleTouchEnd)
      }
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, playerName, quality])

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#09090b' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab' }}
        aria-label="3D Pitch Flight visualization"
      />
    </div>
  )
}
