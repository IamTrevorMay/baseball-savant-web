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
  plateX?: number   // horizontal offset in feet (- = inside to RHH, + = outside)
  plateZ?: number   // vertical offset in feet (- = lower, + = higher)
  gameYear?: number
  dateFrom?: string
  dateTo?: string
  showInKey?: boolean // default true
}

const PITCH_TYPE_LABELS: Record<string, string> = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider',
  CU: 'Curve', CH: 'Changeup', FS: 'Splitter', KC: 'Knuckle Curve',
  ST: 'Sweeper', SV: 'Slurve',
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
    plateX: 0, plateZ: 0,
  }]
}

/** Apply plate offset: linearly interpolate offset from 0 at release to full at plate */
function applyPlateOffset(
  trajectory: { x: number; y: number; z: number; t: number }[],
  plateX: number,
  plateZ: number
): { x: number; y: number; z: number; t: number }[] {
  if (plateX === 0 && plateZ === 0) return trajectory
  if (trajectory.length < 2) return trajectory
  const totalT = trajectory[trajectory.length - 1].t
  if (totalT === 0) return trajectory
  return trajectory.map(pt => ({
    ...pt,
    x: pt.x + (pt.t / totalT) * plateX,
    z: pt.z + (pt.t / totalT) * plateZ,
  }))
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
          ...(pt.gameYear && { gameYear: String(pt.gameYear) }),
          ...(pt.dateFrom && { dateFrom: pt.dateFrom }),
          ...(pt.dateTo && { dateTo: pt.dateTo }),
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
  }, [JSON.stringify(pitches.map(pt => ({ id: pt.id, playerId: pt.playerId, pitchType: pt.pitchType, mode: pt.mode, gameYear: pt.gameYear, dateFrom: pt.dateFrom, dateTo: pt.dateTo })))])

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

    // Precompute trajectories for all pitches (with plate offset applied)
    const trajectories = pitches.map(pt => ({
      pitch: pt,
      trajectory: applyPlateOffset(
        computeTrajectory(getKinematics(pt), 60),
        pt.plateX || 0,
        pt.plateZ || 0
      ),
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

      // Key / Legend
      if (p.showKey !== false) {
        const keyPitches = pitches.filter(pt => pt.showInKey !== false)
        if (keyPitches.length > 0) {
          const fontSize = Math.max(10, Math.min(13, height * 0.035))
          const lineH = fontSize + 5
          const dotR = fontSize * 0.3
          const padX = 8
          const padY = 6
          const keyH = keyPitches.length * lineH + padY * 2
          const keyW = Math.min(width * 0.45, 200)

          // Background
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.globalAlpha = 0.8
          const rx = width - keyW - 8
          const ry = 8
          ctx.beginPath()
          ctx.roundRect(rx, ry, keyW, keyH, 6)
          ctx.fill()
          ctx.globalAlpha = 1

          // Entries
          ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          keyPitches.forEach((pt, i) => {
            const cy = ry + padY + i * lineH + lineH / 2
            // Color dot
            ctx.fillStyle = pt.pitchColor || '#06b6d4'
            ctx.beginPath()
            ctx.arc(rx + padX + dotR, cy, dotR, 0, Math.PI * 2)
            ctx.fill()
            // Label: "PlayerName — PitchType"
            const typeLabel = PITCH_TYPE_LABELS[pt.pitchType] || pt.pitchType
            const label = pt.playerName ? `${pt.playerName} — ${typeLabel}` : typeLabel
            ctx.fillStyle = 'rgba(255,255,255,0.8)'
            ctx.fillText(label, rx + padX + dotR * 2 + 6, cy, keyW - padX * 2 - dotR * 2 - 6)
          })
        }
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
    const trajectory = applyPlateOffset(computeTrajectory(kinData, 60), pt.plateX || 0, pt.plateZ || 0)
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

  // Key / Legend
  if (p.showKey !== false) {
    const keyPitches = pitches.filter(pt => pt.showInKey !== false)
    if (keyPitches.length > 0) {
      const fontSize = Math.max(10, Math.min(13, h * 0.035))
      const lineH = fontSize + 5
      const dotR = fontSize * 0.3
      const padX = 8
      const padY = 6
      const keyH = keyPitches.length * lineH + padY * 2
      const keyW = Math.min(w * 0.45, 200)

      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.globalAlpha = 0.8
      const rx = x + w - keyW - 8
      const ry = y + 8
      ctx.beginPath()
      ctx.roundRect(rx, ry, keyW, keyH, 6)
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      keyPitches.forEach((pt, i) => {
        const cy = ry + padY + i * lineH + lineH / 2
        ctx.fillStyle = pt.pitchColor || '#06b6d4'
        ctx.beginPath()
        ctx.arc(rx + padX + dotR, cy, dotR, 0, Math.PI * 2)
        ctx.fill()
        const typeLabel = PITCH_TYPE_LABELS[pt.pitchType] || pt.pitchType
        const label = pt.playerName ? `${pt.playerName} — ${typeLabel}` : typeLabel
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillText(label, rx + padX + dotR * 2 + 6, cy, keyW - padX * 2 - dotR * 2 - 6)
      })
    }
  }

  ctx.restore()
}
