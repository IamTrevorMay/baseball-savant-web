'use client'
import { useEffect, useRef, useMemo, useState, RefObject } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'
import { computeTrajectory, TrajectoryPoint } from '@/lib/trajectoryPhysics'
import { getPitchColor } from '@/components/chartConfig'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// Camera (catcher's POV, same as IncomingPitchView)
const CAMERA_FOV_DEG = 50
const CAMERA_Y = 0
const CAMERA_Z = 2.5
const SZ_LEFT = -17 / 24
const SZ_RIGHT = 17 / 24
const SZ_BOTTOM = 1.5
const SZ_TOP = 3.5
const SZ_Y = 17 / 12

function worldToCanvas(wx: number, wy: number, wz: number, f: number, cx: number, cy: number) {
  const dy = Math.max(wy - CAMERA_Y, 0.01)
  return { x: cx + (wx / dy) * f, y: cy - ((wz - CAMERA_Z) / dy) * f }
}

function ballRadius(wy: number, f: number): number {
  const dy = Math.max(wy - CAMERA_Y, 0.01)
  return Math.max(2, Math.min(22, (0.121 / dy) * f))
}

/**
 * Compute average trajectory for a group of pitches.
 */
function averageTrajectory(pitches: any[], steps: number): TrajectoryPoint[] {
  const trajectories = pitches
    .map(p => {
      try {
        if (p.vx0 == null || p.vy0 == null || p.vz0 == null ||
            p.ax == null || p.ay == null || p.az == null ||
            p.release_pos_x == null || p.release_pos_z == null ||
            p.release_extension == null) return null
        return computeTrajectory(p, steps)
      } catch { return null }
    })
    .filter((t): t is TrajectoryPoint[] => t != null && t.length > 2)

  if (!trajectories.length) return []

  // Average point-by-point (all trajectories have same step count)
  const minLen = Math.min(...trajectories.map(t => t.length))
  const avg: TrajectoryPoint[] = []
  for (let i = 0; i < minLen; i++) {
    let sx = 0, sy = 0, sz = 0, st = 0
    for (const traj of trajectories) {
      sx += traj[i].x; sy += traj[i].y; sz += traj[i].z; st += traj[i].t
    }
    const n = trajectories.length
    avg.push({ x: sx / n, y: sy / n, z: sz / n, t: st / n })
  }
  return avg
}

export default function PitchTunneling({ data, playerName, quality, containerRef, onFrameUpdate }: TemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const [divergeThreshold, setDivergeThreshold] = useState(2.0) // inches

  // Compute average trajectories per pitch type
  const pitchTypes = useMemo(() => {
    const steps = quality.id === 'draft' ? 40 : quality.id === 'standard' ? 80 : 120
    const typeMap = new Map<string, any[]>()
    for (const d of data) {
      if (!d.pitch_name) continue
      const key = d.pitch_name as string
      if (!typeMap.has(key)) typeMap.set(key, [])
      typeMap.get(key)!.push(d)
    }

    return [...typeMap.entries()]
      .filter(([, pitches]) => pitches.length >= 5)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, pitches]) => ({
        name,
        color: getPitchColor(name),
        count: pitches.length,
        avgTrajectory: averageTrajectory(pitches.slice(-quality.maxPitches), steps),
      }))
      .filter(pt => pt.avgTrajectory.length > 2)
  }, [data, quality])

  useEffect(() => {
    mountedRef.current = true
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !pitchTypes.length) return

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

    const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180
    const focalLength = (cssH / 2) / Math.tan(fovRad / 2)
    const centerX = cssW / 2
    const centerY = cssH * 0.42

    // Find max time across all average trajectories
    const maxTime = Math.max(...pitchTypes.map(pt => pt.avgTrajectory[pt.avgTrajectory.length - 1]?.t || 0))

    // Find tunnel divergence point: first y-distance where any pair diverges by >threshold inches
    let tunnelY: number | null = null
    const threshFt = divergeThreshold / 12
    if (pitchTypes.length >= 2) {
      const minLen = Math.min(...pitchTypes.map(pt => pt.avgTrajectory.length))
      for (let i = 0; i < minLen; i++) {
        let maxDiff = 0
        for (let a = 0; a < pitchTypes.length; a++) {
          for (let b = a + 1; b < pitchTypes.length; b++) {
            const pa = pitchTypes[a].avgTrajectory[i]
            const pb = pitchTypes[b].avgTrajectory[i]
            const dist = Math.sqrt((pa.x - pb.x) ** 2 + (pa.z - pb.z) ** 2)
            maxDiff = Math.max(maxDiff, dist)
          }
        }
        if (maxDiff > threshFt && tunnelY === null) {
          tunnelY = pitchTypes[0].avgTrajectory[i].y
          break
        }
      }
    }

    let frameCount = 0
    let startTs: number | null = null
    const ANIM_DURATION = 1.2 // seconds
    const PAUSE_DURATION = 0.8

    function tick(timestamp: number) {
      if (!mountedRef.current) return
      if (startTs === null) startTs = timestamp

      const elapsed = (timestamp - startTs) / 1000
      const cycleDuration = ANIM_DURATION + PAUSE_DURATION
      const cycleT = elapsed % cycleDuration
      const t = Math.min(cycleT / ANIM_DURATION, 1)

      ctx!.save()
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx!.createLinearGradient(0, 0, 0, cssH)
      grad.addColorStop(0, '#0c1118')
      grad.addColorStop(1, '#09090b')
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, cssW, cssH)

      // Strike zone
      const szTL = worldToCanvas(SZ_LEFT, SZ_Y, SZ_TOP, focalLength, centerX, centerY)
      const szBR = worldToCanvas(SZ_RIGHT, SZ_Y, SZ_BOTTOM, focalLength, centerX, centerY)
      const szW = szBR.x - szTL.x
      const szH = szBR.y - szTL.y

      ctx!.fillStyle = 'rgba(255,255,255,0.03)'
      ctx!.fillRect(szTL.x, szTL.y, szW, szH)
      ctx!.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx!.lineWidth = 1.5
      ctx!.strokeRect(szTL.x, szTL.y, szW, szH)

      // Grid
      ctx!.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx!.lineWidth = 0.75
      for (let i = 1; i <= 2; i++) {
        const xOff = szTL.x + (szW / 3) * i
        ctx!.beginPath(); ctx!.moveTo(xOff, szTL.y); ctx!.lineTo(xOff, szBR.y); ctx!.stroke()
        const yOff = szTL.y + (szH / 3) * i
        ctx!.beginPath(); ctx!.moveTo(szTL.x, yOff); ctx!.lineTo(szBR.x, yOff); ctx!.stroke()
      }

      // Tunnel divergence line
      if (tunnelY != null) {
        const lineLeft = worldToCanvas(SZ_LEFT - 1, tunnelY, SZ_BOTTOM - 0.5, focalLength, centerX, centerY)
        const lineRight = worldToCanvas(SZ_RIGHT + 1, tunnelY, SZ_BOTTOM - 0.5, focalLength, centerX, centerY)
        ctx!.setLineDash([4, 4])
        ctx!.strokeStyle = 'rgba(255,255,0,0.3)'
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.moveTo(lineLeft.x, lineLeft.y)
        ctx!.lineTo(lineRight.x, lineRight.y)
        ctx!.stroke()
        ctx!.setLineDash([])

        // Label
        ctx!.font = `${Math.max(9, Math.round(cssH * 0.016))}px Inter, system-ui, sans-serif`
        ctx!.fillStyle = 'rgba(255,255,0,0.5)'
        const distFromPlate = (tunnelY - SZ_Y).toFixed(1)
        ctx!.fillText(`Tunnel point: ${distFromPlate}ft from plate`, lineRight.x + 8, lineRight.y)
      }

      // Draw trajectories
      for (const pt of pitchTypes) {
        const traj = pt.avgTrajectory
        if (!traj.length) continue

        const maxTrajT = traj[traj.length - 1].t
        const currentT = t * maxTrajT

        // Find current index
        let currentIdx = traj.length - 1
        for (let i = 0; i < traj.length - 1; i++) {
          if (traj[i + 1].t > currentT) { currentIdx = i; break }
        }

        // Trail line
        ctx!.beginPath()
        ctx!.strokeStyle = pt.color
        ctx!.lineWidth = 2
        ctx!.globalAlpha = 0.6
        let started = false
        for (let i = 0; i <= currentIdx; i++) {
          const sp = worldToCanvas(traj[i].x, traj[i].y, traj[i].z, focalLength, centerX, centerY)
          if (!started) { ctx!.moveTo(sp.x, sp.y); started = true }
          else ctx!.lineTo(sp.x, sp.y)
        }
        ctx!.stroke()
        ctx!.globalAlpha = 1

        // Ball
        const point = traj[currentIdx]
        const sp = worldToCanvas(point.x, point.y, point.z, focalLength, centerX, centerY)
        const r = ballRadius(point.y, focalLength)

        // Glow
        const glow = ctx!.createRadialGradient(sp.x, sp.y, r * 0.2, sp.x, sp.y, r * 2.2)
        glow.addColorStop(0, pt.color + 'aa')
        glow.addColorStop(1, pt.color + '00')
        ctx!.beginPath()
        ctx!.arc(sp.x, sp.y, r * 2.2, 0, Math.PI * 2)
        ctx!.fillStyle = glow
        ctx!.fill()

        // Core
        ctx!.beginPath()
        ctx!.arc(sp.x, sp.y, r, 0, Math.PI * 2)
        ctx!.fillStyle = pt.color
        ctx!.fill()

        // Landing dot when animation complete
        if (t >= 1) {
          const lastPt = traj[traj.length - 1]
          const lastSp = worldToCanvas(lastPt.x, lastPt.y, lastPt.z, focalLength, centerX, centerY)
          ctx!.beginPath()
          ctx!.arc(lastSp.x, lastSp.y, 5, 0, Math.PI * 2)
          ctx!.fillStyle = pt.color
          ctx!.globalAlpha = 0.8
          ctx!.fill()
          ctx!.globalAlpha = 1
        }
      }

      // Title
      ctx!.font = `bold ${Math.max(12, Math.round(cssH * 0.028))}px Inter, system-ui, sans-serif`
      ctx!.fillStyle = 'rgba(255,255,255,0.9)'
      ctx!.fillText(`${playerName} — Pitch Tunneling (Catcher View)`, 16, 28)

      // Legend
      ctx!.font = `${Math.max(10, Math.round(cssH * 0.017))}px Inter, system-ui, sans-serif`
      let ly = 52
      for (const pt of pitchTypes) {
        ctx!.fillStyle = pt.color
        ctx!.beginPath()
        ctx!.arc(26, ly, 4, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.fillStyle = 'rgba(228,228,231,0.7)'
        ctx!.fillText(`${pt.name} (${pt.count})`, 36, ly + 4)
        ly += 18
      }

      // Threshold info
      ctx!.font = `${Math.max(9, Math.round(cssH * 0.015))}px Inter, system-ui, sans-serif`
      ctx!.fillStyle = 'rgba(161,161,170,0.6)'
      ctx!.fillText(`Divergence threshold: ${divergeThreshold.toFixed(1)} in`, 16, cssH - 14)

      ctx!.restore()

      frameCount++
      const totalFrames = Math.round((ANIM_DURATION + PAUSE_DURATION) * quality.fps)
      onFrameUpdate?.(frameCount, totalFrames)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    const obs = new ResizeObserver(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      startTs = null
      frameCount = 0
      // Will re-render via useEffect dependency on quality
    })
    obs.observe(container)

    return () => {
      mountedRef.current = false
      obs.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [data, playerName, quality, pitchTypes, divergeThreshold, containerRef, onFrameUpdate])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#09090b' }}>
      {/* Threshold control */}
      <div className="absolute bottom-8 left-4 z-10 flex items-center gap-2 pointer-events-auto">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Threshold</span>
        <input
          type="range" min={0.5} max={6} step={0.25} value={divergeThreshold}
          onChange={e => setDivergeThreshold(parseFloat(e.target.value))}
          className="w-24 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
        />
        <span className="text-[10px] text-zinc-400 tabular-nums">{divergeThreshold.toFixed(1)} in</span>
      </div>

      <canvas ref={canvasRef} style={{ display: 'block' }} aria-label="Pitch tunneling visualization" />
    </div>
  )
}
