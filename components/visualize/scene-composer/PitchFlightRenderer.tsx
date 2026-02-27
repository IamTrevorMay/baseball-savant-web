'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  computeTrajectory,
  projectToScreen,
  simulatedPitchToKinematics,
  type PitchKinematics,
  type Camera,
  type TrajectoryPoint,
} from '@/lib/trajectoryPhysics'

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

// Strike zone dimensions in feet
const ZONE_LEFT = -17 / 24   // -8.5 inches from center
const ZONE_RIGHT = 17 / 24   // +8.5 inches from center
const ZONE_BOT = 1.5          // avg bottom of zone
const ZONE_TOP = 3.5          // avg top of zone
const PLATE_Y = 17 / 12       // front of home plate

const CATCHER_CAM: Camera = { x: 0, y: -4, z: 2.5, fov: 45 }
const PITCHER_CAM: Camera = { x: 0, y: 55, z: 6, fov: 30 }

// Default 4-seam kinematics for fallback
const DEFAULT_FF: PitchKinematics = {
  vx0: 3.5, vy0: -132, vz0: -6.2,
  ax: -8, ay: 28, az: -15,
  release_pos_x: -1.5, release_pos_z: 5.8, release_extension: 6.2,
}

export default function PitchFlightRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const rafRef = useRef<number>(0)
  const [kin, setKin] = useState<PitchKinematics | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch kinematics for player mode
  useEffect(() => {
    if (p.mode === 'custom' || !p.playerId) {
      setKin(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      playerId: String(p.playerId),
      kinematics: 'true',
      ...(p.pitchType && { pitchType: p.pitchType }),
    })
    fetch(`/api/scene-stats?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const rows = data.kinematics || []
        const match = rows.find((r: any) => r.pitch_type === p.pitchType) || rows[0]
        if (match) {
          setKin({
            vx0: Number(match.vx0), vy0: Number(match.vy0), vz0: Number(match.vz0),
            ax: Number(match.ax), ay: Number(match.ay), az: Number(match.az),
            release_pos_x: Number(match.release_pos_x), release_pos_z: Number(match.release_pos_z),
            release_extension: Number(match.release_extension),
          })
        } else {
          setKin(DEFAULT_FF)
        }
      })
      .catch(() => { if (!cancelled) setKin(DEFAULT_FF) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [p.playerId, p.pitchType, p.mode])

  const getKinematics = useCallback((): PitchKinematics => {
    if (p.mode === 'custom' && p.customPitch) {
      return simulatedPitchToKinematics(p.customPitch)
    }
    return kin || DEFAULT_FF
  }, [p.mode, p.customPitch, kin])

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = 2
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const camera = p.viewMode === 'pitcher' ? PITCHER_CAM : CATCHER_CAM
    const kinData = getKinematics()
    const trajectory = computeTrajectory(kinData, 60)
    const totalTime = trajectory.length > 0 ? trajectory[trajectory.length - 1].t : 0.4
    const loopDur = (p.loopDuration || 1.5) * 1000
    let lastTime = 0

    function draw(timestamp: number) {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = p.bgColor || '#09090b'
      ctx.fillRect(0, 0, width, height)

      // Grid
      if (p.showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 1
        for (let fy = 0; fy <= 55; fy += 5) {
          for (let fx = -3; fx <= 3; fx += 1) {
            const sp = projectToScreen({ x: fx, y: fy, z: 0 }, camera, width, height)
            if (sp.scale > 0) {
              ctx.beginPath()
              ctx.arc(sp.x, sp.y, 1, 0, Math.PI * 2)
              ctx.stroke()
            }
          }
        }
      }

      // Strike zone
      if (p.showZone) {
        const corners = [
          { x: ZONE_LEFT, y: PLATE_Y, z: ZONE_BOT },
          { x: ZONE_RIGHT, y: PLATE_Y, z: ZONE_BOT },
          { x: ZONE_RIGHT, y: PLATE_Y, z: ZONE_TOP },
          { x: ZONE_LEFT, y: PLATE_Y, z: ZONE_TOP },
        ].map(c => projectToScreen(c, camera, width, height))

        ctx.strokeStyle = 'rgba(255,255,255,0.2)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(corners[0].x, corners[0].y)
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y)
        ctx.closePath()
        ctx.stroke()
      }

      // Trajectory progress
      let progress = 1
      if (p.animate) {
        const elapsed = (timestamp - lastTime) % loopDur
        // Ball travels for totalTime ratio of the loop, then pause
        const travelPct = Math.min(1, totalTime / (loopDur / 1000))
        const phase = elapsed / loopDur
        if (phase < travelPct) {
          progress = phase / travelPct
        } else {
          progress = 1
        }
      }

      const endIdx = Math.floor(progress * (trajectory.length - 1))

      // Trail
      ctx.lineWidth = 2
      ctx.strokeStyle = p.pitchColor || '#06b6d4'
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      let started = false
      for (let i = 0; i <= endIdx; i++) {
        const pt = trajectory[i]
        const sp = projectToScreen(pt, camera, width, height)
        if (!started) { ctx.moveTo(sp.x, sp.y); started = true }
        else ctx.lineTo(sp.x, sp.y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1

      // Ball
      if (endIdx >= 0 && endIdx < trajectory.length) {
        const ballPt = trajectory[endIdx]
        const sp = projectToScreen(ballPt, camera, width, height)
        const ballR = Math.max(3, sp.scale * 0.12)

        // Glow
        const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, ballR * 3)
        grad.addColorStop(0, p.pitchColor || '#06b6d4')
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.globalAlpha = 0.4
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, ballR * 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // Ball solid
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, ballR, 0, Math.PI * 2)
        ctx.fill()
      }

      // Label
      if (p.playerName) {
        ctx.font = '500 11px -apple-system, system-ui, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(p.playerName, 8, 8)
      }

      if (p.animate) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    lastTime = performance.now()
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [width, height, p.viewMode, p.showZone, p.animate, p.showGrid, p.bgColor, p.pitchColor, p.loopDuration, p.playerName, p.mode, getKinematics])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: p.bgColor || '#09090b' }}>
        <div className="w-5 h-5 border-2 border-zinc-600 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
    />
  )
}

/**
 * Static render for PNG export — draws final frame of trajectory onto a canvas context.
 */
export function drawPitchFlightStatic(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; width: number; height: number; props: Record<string, any> },
  kinOverride?: PitchKinematics
) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const camera = p.viewMode === 'pitcher' ? PITCHER_CAM : CATCHER_CAM

  const kinData = kinOverride || DEFAULT_FF
  const trajectory = computeTrajectory(kinData, 60)

  ctx.save()

  // Background
  ctx.fillStyle = p.bgColor || '#09090b'
  ctx.fillRect(x, y, w, h)

  // Clip to element bounds
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  // Strike zone
  if (p.showZone) {
    const corners = [
      { x: ZONE_LEFT, y: PLATE_Y, z: ZONE_BOT },
      { x: ZONE_RIGHT, y: PLATE_Y, z: ZONE_BOT },
      { x: ZONE_RIGHT, y: PLATE_Y, z: ZONE_TOP },
      { x: ZONE_LEFT, y: PLATE_Y, z: ZONE_TOP },
    ].map(c => {
      const sp = projectToScreen(c, camera, w, h)
      return { x: sp.x + x, y: sp.y + y }
    })

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y)
    ctx.closePath()
    ctx.stroke()
  }

  // Full trail
  ctx.lineWidth = 2
  ctx.strokeStyle = p.pitchColor || '#06b6d4'
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  let started = false
  for (const pt of trajectory) {
    const sp = projectToScreen(pt, camera, w, h)
    if (!started) { ctx.moveTo(sp.x + x, sp.y + y); started = true }
    else ctx.lineTo(sp.x + x, sp.y + y)
  }
  ctx.stroke()
  ctx.globalAlpha = 1

  // Final ball position
  if (trajectory.length > 0) {
    const last = trajectory[trajectory.length - 1]
    const sp = projectToScreen(last, camera, w, h)
    const ballR = Math.max(4, sp.scale * 0.12)

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(sp.x + x, sp.y + y, ballR, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
