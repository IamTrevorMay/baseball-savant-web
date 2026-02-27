'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  computeTrajectory,
  projectToScreen,
  simulatedPitchToKinematics,
  type PitchKinematics,
  type Camera,
} from '@/lib/trajectoryPhysics'

interface PitchEntry {
  id: string
  playerId: number | null
  playerName: string
  pitchType: string
  pitchColor: string
  mode: 'player' | 'custom'
  customPitch?: any
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

// Strike zone dimensions in feet
const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5
const PLATE_Y = 17 / 12

const CATCHER_CAM: Camera = { x: 0, y: -4, z: 2.5, fov: 45 }
const PITCHER_CAM: Camera = { x: 0, y: 55, z: 6, fov: 30 }

const DEFAULT_FF: PitchKinematics = {
  vx0: 3.5, vy0: -132, vz0: -6.2,
  ax: -8, ay: 28, az: -15,
  release_pos_x: -1.5, release_pos_z: 5.8, release_extension: 6.2,
}

/** Normalize legacy single-pitch props into pitches array */
function normalizePitches(p: Record<string, any>): PitchEntry[] {
  if (p.pitches && Array.isArray(p.pitches) && p.pitches.length > 0) return p.pitches
  // Legacy: single pitch props at top level
  return [{
    id: 'legacy',
    playerId: p.playerId ?? null,
    playerName: p.playerName ?? '',
    pitchType: p.pitchType ?? 'FF',
    pitchColor: p.pitchColor ?? '#06b6d4',
    mode: p.mode ?? 'player',
    customPitch: p.customPitch ?? null,
  }]
}

export default function PitchFlightRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [kinMap, setKinMap] = useState<Record<string, PitchKinematics>>({})
  const [loading, setLoading] = useState(false)

  const pitches = normalizePitches(p)

  // Fetch kinematics for all player-mode pitches
  useEffect(() => {
    const playerPitches = pitches.filter(pt => pt.mode !== 'custom' && pt.playerId)
    if (playerPitches.length === 0) {
      setKinMap({})
      return
    }
    let cancelled = false
    setLoading(true)

    Promise.all(
      playerPitches.map(async (pt) => {
        const params = new URLSearchParams({
          playerId: String(pt.playerId),
          kinematics: 'true',
          ...(pt.pitchType && { pitchType: pt.pitchType }),
        })
        try {
          const r = await fetch(`/api/scene-stats?${params}`)
          const data = await r.json()
          const rows = data.kinematics || []
          const match = rows.find((r: any) => r.pitch_type === pt.pitchType) || rows[0]
          if (match) {
            return [pt.id, {
              vx0: Number(match.vx0), vy0: Number(match.vy0), vz0: Number(match.vz0),
              ax: Number(match.ax), ay: Number(match.ay), az: Number(match.az),
              release_pos_x: Number(match.release_pos_x), release_pos_z: Number(match.release_pos_z),
              release_extension: Number(match.release_extension),
            }] as [string, PitchKinematics]
          }
        } catch {}
        return [pt.id, DEFAULT_FF] as [string, PitchKinematics]
      })
    ).then(entries => {
      if (!cancelled) setKinMap(Object.fromEntries(entries))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pitches.map(pt => ({ id: pt.id, playerId: pt.playerId, pitchType: pt.pitchType, mode: pt.mode })))])

  const getKinematics = useCallback((pt: PitchEntry): PitchKinematics => {
    if (pt.mode === 'custom' && pt.customPitch) {
      return simulatedPitchToKinematics(pt.customPitch)
    }
    return kinMap[pt.id] || DEFAULT_FF
  }, [kinMap])

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
    const loopDur = (p.loopDuration || 1.5) * 1000

    // Precompute trajectories for all pitches
    const trajectories = pitches.map(pt => ({
      pitch: pt,
      trajectory: computeTrajectory(getKinematics(pt), 60),
    }))

    const maxTotalTime = Math.max(
      ...trajectories.map(t => t.trajectory.length > 0 ? t.trajectory[t.trajectory.length - 1].t : 0.4)
    )

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

      // Animation progress
      let progress = 1
      if (p.animate) {
        const elapsed = (timestamp - lastTime) % loopDur
        const travelPct = Math.min(1, maxTotalTime / (loopDur / 1000))
        const phase = elapsed / loopDur
        progress = phase < travelPct ? phase / travelPct : 1
      }

      // Draw each pitch trajectory
      for (const { pitch: pt, trajectory } of trajectories) {
        const endIdx = Math.floor(progress * (trajectory.length - 1))
        const color = pt.pitchColor || '#06b6d4'

        // Trail
        ctx.lineWidth = 2
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        let started = false
        for (let i = 0; i <= endIdx; i++) {
          const sp = projectToScreen(trajectory[i], camera, width, height)
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
          grad.addColorStop(0, color)
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
      }

      // Labels — show all pitcher names
      const names = pitches
        .filter(pt => pt.playerName)
        .map(pt => pt.playerName)
      if (names.length > 0) {
        ctx.font = '500 11px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        names.forEach((name, i) => {
          ctx.fillStyle = pitches[i]?.pitchColor || 'rgba(255,255,255,0.5)'
          ctx.globalAlpha = 0.7
          ctx.fillText(name, 8, 8 + i * 16)
        })
        ctx.globalAlpha = 1
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, p.viewMode, p.showZone, p.animate, p.showGrid, p.bgColor, p.loopDuration, JSON.stringify(pitches), getKinematics])

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
 * Static render for PNG export — draws all pitch trajectories onto a canvas context.
 */
export function drawPitchFlightStatic(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; width: number; height: number; props: Record<string, any> },
  kinOverrides?: Record<string, PitchKinematics>
) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const camera = p.viewMode === 'pitcher' ? PITCHER_CAM : CATCHER_CAM
  const pitches = normalizePitches(p)

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

  // Draw each pitch
  for (const pt of pitches) {
    const kinData = kinOverrides?.[pt.id] || DEFAULT_FF
    const trajectory = computeTrajectory(kinData, 60)
    const color = pt.pitchColor || '#06b6d4'

    // Full trail
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    let started = false
    for (const point of trajectory) {
      const sp = projectToScreen(point, camera, w, h)
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
  }

  ctx.restore()
}
