'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { STADIUMS, getWallAtAngle, type StadiumDef } from '@/lib/stadiumData'
import { computeBattedBallTrajectory, sprayAngleFromHC, type TrajectoryPoint } from '@/lib/trajectoryPhysics'

// ── Types ────────────────────────────────────────────────────────────────────

interface HitGroup {
  id: string
  batterId: number | null
  batterName: string
  eventFilter: string   // comma-sep or empty
  bbTypeFilter: string  // comma-sep or empty
  color: string
  showInKey: boolean
  gameYear?: number
  dateFrom?: string
  dateTo?: string
}

interface BattedBallRow {
  launch_speed: number
  launch_angle: number
  hc_x: number
  hc_y: number
  hit_distance_sc: number
  events: string
  bb_type: string
  home_team: string
  game_date: string
  spray_angle: number
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

type ViewMode = 'overhead' | 'broadcast' | 'centerfield'

// ── Coordinate Transforms ────────────────────────────────────────────────────

/** Convert field coords (x=lateral ft, y=depth ft) to canvas coords for overhead view */
function fieldToOverhead(
  fx: number, fy: number,
  cw: number, ch: number,
  scale: number, ox: number, oy: number,
): { x: number; y: number } {
  // Home plate at bottom center, outfield toward top
  return {
    x: cw / 2 + fx * scale + ox,
    y: ch - 40 - fy * scale + oy,
  }
}

/** Simple perspective projection for broadcast/CF views */
function fieldTo3D(
  fx: number, fy: number, fz: number,
  camX: number, camY: number, camZ: number,
  fov: number, cw: number, ch: number,
): { x: number; y: number; scale: number } {
  const dx = fx - camX
  const dy = fy - camY
  const dz = fz - camZ
  const depth = Math.max(dy, 0.5)
  const fovRad = (fov * Math.PI) / 180
  const focal = ch / 2 / Math.tan(fovRad / 2)
  const s = focal / depth
  return {
    x: cw / 2 + dx * s,
    y: ch / 2 - dz * s,
    scale: s,
  }
}

// ── Drawing Helpers ──────────────────────────────────────────────────────────

function drawFieldOverhead(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  stadium: StadiumDef,
  showField: boolean, showWall: boolean,
  scale: number, ox: number, oy: number,
) {
  const toC = (fx: number, fy: number) => fieldToOverhead(fx, fy, w, h, scale, ox, oy)

  if (showField) {
    // Grass fill (outfield arc)
    ctx.fillStyle = 'rgba(34,100,34,0.25)'
    ctx.beginPath()
    const wallPts = stadium.wallPoints
    const first = toC(
      wallPts[0].distance * Math.sin((wallPts[0].angle - 90) * Math.PI / 180),
      wallPts[0].distance * Math.cos((wallPts[0].angle - 90) * Math.PI / 180),
    )
    ctx.moveTo(first.x, first.y)
    for (const wp of wallPts) {
      const rad = (wp.angle - 90) * Math.PI / 180
      const p = toC(wp.distance * Math.sin(rad), wp.distance * Math.cos(rad))
      ctx.lineTo(p.x, p.y)
    }
    // Close back through home plate
    const home = toC(0, 0)
    ctx.lineTo(home.x, home.y)
    ctx.closePath()
    ctx.fill()

    // Infield dirt
    ctx.fillStyle = 'rgba(139,90,43,0.2)'
    ctx.beginPath()
    const infieldR = 95 * scale
    const hp = toC(0, 0)
    const infieldCenter = toC(0, 60)
    ctx.arc(infieldCenter.x, infieldCenter.y, infieldR, 0, Math.PI * 2)
    ctx.fill()

    // Foul lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    const lfAngle = (45 - 90) * Math.PI / 180
    const rfAngle = (135 - 90) * Math.PI / 180
    const lfEnd = toC(400 * Math.sin(lfAngle), 400 * Math.cos(lfAngle))
    const rfEnd = toC(400 * Math.sin(rfAngle), 400 * Math.cos(rfAngle))
    ctx.beginPath()
    ctx.moveTo(hp.x, hp.y)
    ctx.lineTo(lfEnd.x, lfEnd.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(hp.x, hp.y)
    ctx.lineTo(rfEnd.x, rfEnd.y)
    ctx.stroke()

    // Bases
    const bases = [
      { x: 0, y: 0 },      // Home
      { x: 63.64, y: 63.64 },   // 1B
      { x: 0, y: 127.28 },  // 2B
      { x: -63.64, y: 63.64 },  // 3B
    ]
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (const b of bases) {
      const bp = toC(b.x, b.y)
      ctx.beginPath()
      ctx.save()
      ctx.translate(bp.x, bp.y)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-3, -3, 6, 6)
      ctx.restore()
    }
  }

  if (showWall) {
    // Outfield wall
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    for (const wp of stadium.wallPoints) {
      const rad = (wp.angle - 90) * Math.PI / 180
      const p = toC(wp.distance * Math.sin(rad), wp.distance * Math.cos(rad))
      if (!started) { ctx.moveTo(p.x, p.y); started = true }
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()

    // Distance labels at key angles
    for (const angle of [45, 70, 90, 110, 135]) {
      const wall = getWallAtAngle(stadium, angle)
      const rad = (angle - 90) * Math.PI / 180
      const p = toC(wall.distance * Math.sin(rad), wall.distance * Math.cos(rad))
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = `500 ${Math.max(8, w * 0.018)}px -apple-system, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`${Math.round(wall.distance)}'`, p.x, p.y - 4)
    }
  }
}

function drawField3D(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  stadium: StadiumDef,
  showField: boolean, showWall: boolean,
  camX: number, camY: number, camZ: number, fov: number,
) {
  const to3D = (fx: number, fy: number, fz: number) => fieldTo3D(fx, fy, fz, camX, camY, camZ, fov, w, h)

  if (showField) {
    // Foul lines
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    const hp = to3D(0, 0, 0)
    const lfAngle = (45 - 90) * Math.PI / 180
    const rfAngle = (135 - 90) * Math.PI / 180
    const lfEnd = to3D(400 * Math.sin(lfAngle), 400 * Math.cos(lfAngle), 0)
    const rfEnd = to3D(400 * Math.sin(rfAngle), 400 * Math.cos(rfAngle), 0)
    ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(lfEnd.x, lfEnd.y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(rfEnd.x, rfEnd.y); ctx.stroke()

    // Bases
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    const bases = [
      { x: 0, y: 0 }, { x: 63.64, y: 63.64 },
      { x: 0, y: 127.28 }, { x: -63.64, y: 63.64 },
    ]
    for (const b of bases) {
      const bp = to3D(b.x, b.y, 0)
      const sz = Math.max(2, bp.scale * 1)
      ctx.fillRect(bp.x - sz, bp.y - sz, sz * 2, sz * 2)
    }
  }

  if (showWall) {
    // Wall as connected line segments with height
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.5

    // Wall base
    ctx.beginPath()
    let started = false
    for (const wp of stadium.wallPoints) {
      const rad = (wp.angle - 90) * Math.PI / 180
      const p = to3D(wp.distance * Math.sin(rad), wp.distance * Math.cos(rad), 0)
      if (!started) { ctx.moveTo(p.x, p.y); started = true }
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()

    // Wall top
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath()
    started = false
    for (const wp of stadium.wallPoints) {
      const rad = (wp.angle - 90) * Math.PI / 180
      const p = to3D(wp.distance * Math.sin(rad), wp.distance * Math.cos(rad), wp.height)
      if (!started) { ctx.moveTo(p.x, p.y); started = true }
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()

    // Vertical wall segments at endpoints
    for (const wp of [stadium.wallPoints[0], stadium.wallPoints[stadium.wallPoints.length - 1]]) {
      const rad = (wp.angle - 90) * Math.PI / 180
      const base = to3D(wp.distance * Math.sin(rad), wp.distance * Math.cos(rad), 0)
      const top = to3D(wp.distance * Math.sin(rad), wp.distance * Math.cos(rad), wp.height)
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke()
    }
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function StadiumRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [hitDataMap, setHitDataMap] = useState<Record<string, BattedBallRow[]>>({})
  const [loading, setLoading] = useState(false)

  const hits: HitGroup[] = p.hits || []
  const viewMode: ViewMode = p.viewMode || 'overhead'
  const park = p.park || 'generic'
  const stadium = STADIUMS[park] || STADIUMS.generic

  // Fetch batted ball data for each hit group
  useEffect(() => {
    const groups = hits.filter(h => h.batterId)
    if (groups.length === 0) {
      setHitDataMap({})
      return
    }
    let cancelled = false
    setLoading(true)

    Promise.all(
      groups.map(async (h) => {
        const params = new URLSearchParams({
          playerId: String(h.batterId),
          batterId: String(h.batterId),
          battedBalls: 'true',
          ...(h.eventFilter && { events: h.eventFilter }),
          ...(h.bbTypeFilter && { bbType: h.bbTypeFilter }),
          ...(h.gameYear && { gameYear: String(h.gameYear) }),
          ...(h.dateFrom && { dateFrom: h.dateFrom }),
          ...(h.dateTo && { dateTo: h.dateTo }),
        })
        try {
          const r = await fetch(`/api/scene-stats?${params}`)
          const data = await r.json()
          return [h.id, data.battedBalls || []] as [string, BattedBallRow[]]
        } catch {
          return [h.id, []] as [string, BattedBallRow[]]
        }
      })
    ).then(entries => {
      if (!cancelled) setHitDataMap(Object.fromEntries(entries))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(hits.map(h => ({
    id: h.id, batterId: h.batterId, eventFilter: h.eventFilter,
    bbTypeFilter: h.bbTypeFilter, gameYear: h.gameYear,
    dateFrom: h.dateFrom, dateTo: h.dateTo,
  })))])

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

    const loopDur = (p.loopDuration || 3) * 1000
    const animMode = p.animMode || 'simultaneous'
    const displayMode = p.displayMode || 'all'
    const singleIdx = p.singleHitIndex || 0

    // Compute scale for overhead view (fit widest wall point)
    const maxDist = Math.max(...stadium.wallPoints.map(wp => wp.distance))
    const overheadScale = Math.min(width, height - 60) / (maxDist * 1.15)

    // Precompute trajectories for all hits
    const allTrajectories: { group: HitGroup; row: BattedBallRow; traj: TrajectoryPoint[]; globalIdx: number }[] = []
    let gIdx = 0
    for (const h of hits) {
      const rows = hitDataMap[h.id] || []
      for (const row of rows) {
        if (row.launch_speed && row.launch_angle) {
          const traj = computeBattedBallTrajectory({
            launchSpeed: row.launch_speed,
            launchAngle: row.launch_angle,
            sprayAngle: Number(row.spray_angle) || sprayAngleFromHC(row.hc_x, row.hc_y),
          })
          allTrajectories.push({ group: h, row, traj, globalIdx: gIdx++ })
        }
      }
    }

    let startTime = 0

    function draw(timestamp: number) {
      if (!ctx || !canvas) return
      if (!startTime) startTime = timestamp

      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = p.bgColor || '#09090b'
      ctx.fillRect(0, 0, width, height)

      // Draw field
      if (viewMode === 'overhead') {
        drawFieldOverhead(ctx, width, height, stadium, p.showField !== false, p.showWall !== false, overheadScale, 0, 0)
      } else {
        // Camera positions
        let camX: number, camY: number, camZ: number, fov: number
        if (viewMode === 'broadcast') {
          camX = 0; camY = -20; camZ = 80; fov = 50
        } else {
          // centerfield
          camX = 0; camY = 450; camZ = 60; fov = 45
        }
        drawField3D(ctx, width, height, stadium, p.showField !== false, p.showWall !== false, camX, camY, camZ, fov)
      }

      // Animation progress
      const elapsed = timestamp - startTime
      const loopProgress = (elapsed % loopDur) / loopDur

      // Draw trajectories
      const visibleTrajectories = displayMode === 'single'
        ? allTrajectories.filter(t => t.globalIdx === singleIdx)
        : allTrajectories

      for (const { group, row, traj, globalIdx } of visibleTrajectories) {
        const color = group.color || '#06b6d4'

        // Per-trajectory animation offset
        let progress = 1
        if (p.animate) {
          if (animMode === 'sequential' && allTrajectories.length > 1) {
            const slot = globalIdx / allTrajectories.length
            const slotDur = 1 / allTrajectories.length
            const localT = (loopProgress - slot) / slotDur
            progress = Math.max(0, Math.min(1, localT))
          } else {
            progress = loopProgress
          }
        }

        const endIdx = Math.floor(progress * (traj.length - 1))

        if (viewMode === 'overhead') {
          // Landing dot (always visible in 'all' mode)
          if (displayMode === 'all' || progress >= 1) {
            const last = traj[traj.length - 1]
            const lp = fieldToOverhead(last.x, last.y, width, height, overheadScale, 0, 0)
            ctx.globalAlpha = 0.7
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(lp.x, lp.y, Math.max(2.5, width * 0.006), 0, Math.PI * 2)
            ctx.fill()
            ctx.globalAlpha = 1
          }

          // Arc trail (when animating or single mode)
          if (displayMode === 'single' || (p.animate && progress < 1)) {
            ctx.strokeStyle = color
            ctx.lineWidth = 1.5
            ctx.globalAlpha = 0.5
            ctx.beginPath()
            let started = false
            for (let i = 0; i <= endIdx; i++) {
              const sp = fieldToOverhead(traj[i].x, traj[i].y, width, height, overheadScale, 0, 0)
              if (!started) { ctx.moveTo(sp.x, sp.y); started = true }
              else ctx.lineTo(sp.x, sp.y)
            }
            ctx.stroke()
            ctx.globalAlpha = 1

            // Ball
            if (endIdx >= 0 && endIdx < traj.length && progress < 1) {
              const ballPt = traj[endIdx]
              const sp = fieldToOverhead(ballPt.x, ballPt.y, width, height, overheadScale, 0, 0)
              const ballR = Math.max(3, 2 + ballPt.z * overheadScale * 0.3)
              ctx.fillStyle = '#ffffff'
              ctx.beginPath()
              ctx.arc(sp.x, sp.y, ballR, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        } else {
          // 3D views (broadcast / centerfield)
          let camX: number, camY: number, camZ: number, fov: number
          if (viewMode === 'broadcast') {
            camX = 0; camY = -20; camZ = 80; fov = 50
          } else {
            // centerfield: looking back toward home from CF
            camX = 0; camY = 450; camZ = 60; fov = 45
          }

          // For centerfield, flip coordinates so we look from CF toward home
          const transformPt = (fx: number, fy: number, fz: number) => {
            if (viewMode === 'centerfield') {
              return fieldTo3D(-fx, -fy + 400, fz, camX, camY, camZ, fov, width, height)
            }
            return fieldTo3D(fx, fy, fz, camX, camY, camZ, fov, width, height)
          }

          // Trail
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          let started = false
          for (let i = 0; i <= endIdx; i++) {
            const sp = transformPt(traj[i].x, traj[i].y, traj[i].z)
            if (sp.scale > 0) {
              if (!started) { ctx.moveTo(sp.x, sp.y); started = true }
              else ctx.lineTo(sp.x, sp.y)
            }
          }
          ctx.stroke()
          ctx.globalAlpha = 1

          // Ball
          if (endIdx >= 0 && endIdx < traj.length && progress < 1) {
            const ballPt = traj[endIdx]
            const sp = transformPt(ballPt.x, ballPt.y, ballPt.z)
            const ballR = Math.max(2.5, sp.scale * 0.8)

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

            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.arc(sp.x, sp.y, ballR, 0, Math.PI * 2)
            ctx.fill()
          }

          // Landing dot
          if (displayMode === 'all' || progress >= 1) {
            const last = traj[traj.length - 1]
            const lp = transformPt(last.x, last.y, 0)
            ctx.globalAlpha = 0.6
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(lp.x, lp.y, Math.max(2, lp.scale * 0.5), 0, Math.PI * 2)
            ctx.fill()
            ctx.globalAlpha = 1
          }
        }

        // Single mode: overlay stats
        if (displayMode === 'single' && visibleTrajectories.length === 1) {
          const fontSize = Math.max(10, Math.min(14, height * 0.035))
          ctx.font = `600 ${fontSize}px -apple-system, system-ui, sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          const lines = [
            `${row.events?.replace(/_/g, ' ').toUpperCase() || 'HIT'}`,
            `EV: ${row.launch_speed?.toFixed(1) || '?'} mph`,
            `Dist: ${row.hit_distance_sc || '?'} ft`,
            `LA: ${row.launch_angle?.toFixed(0) || '?'}°`,
          ]
          const pad = 10
          lines.forEach((line, i) => {
            ctx.fillText(line, pad, pad + i * (fontSize + 4))
          })
        }
      }

      // Key / Legend
      if (p.showKey !== false) {
        const keyHits = hits.filter(h => h.showInKey !== false && h.batterName)
        if (keyHits.length > 0) {
          const fontSize = Math.max(10, Math.min(13, height * 0.035))
          const lineH = fontSize + 5
          const dotR = fontSize * 0.3
          const padX = 8
          const padY = 6
          const keyH = keyHits.length * lineH + padY * 2
          const keyW = Math.min(width * 0.45, 200)

          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.globalAlpha = 0.8
          const rx = width - keyW - 8
          const ry = 8
          ctx.beginPath()
          ctx.roundRect(rx, ry, keyW, keyH, 6)
          ctx.fill()
          ctx.globalAlpha = 1

          ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          keyHits.forEach((h, i) => {
            const cy = ry + padY + i * lineH + lineH / 2
            ctx.fillStyle = h.color || '#06b6d4'
            ctx.beginPath()
            ctx.arc(rx + padX + dotR, cy, dotR, 0, Math.PI * 2)
            ctx.fill()
            const count = (hitDataMap[h.id] || []).length
            const label = `${h.batterName}${count ? ` (${count})` : ''}`
            ctx.fillStyle = 'rgba(255,255,255,0.8)'
            ctx.fillText(label, rx + padX + dotR * 2 + 6, cy, keyW - padX * 2 - dotR * 2 - 6)
          })
        }
      }

      if (p.animate) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    startTime = 0
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, viewMode, park, p.animate, p.showWall, p.showField, p.showKey,
      p.bgColor, p.loopDuration, p.animMode, p.displayMode, p.singleHitIndex,
      JSON.stringify(hits), JSON.stringify(hitDataMap)])

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

// ── Static Export ─────────────────────────────────────────────────────────────

export async function drawStadiumStatic(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; width: number; height: number; props: Record<string, any> },
) {
  const p = el.props
  const { x, y, width: w, height: elH } = el
  const hits: HitGroup[] = p.hits || []
  const park = p.park || 'generic'
  const stadium = STADIUMS[park] || STADIUMS.generic
  const viewMode: ViewMode = p.viewMode || 'overhead'

  ctx.save()

  // Background
  ctx.fillStyle = p.bgColor || '#09090b'
  ctx.fillRect(x, y, w, elH)

  // Clip to element bounds
  ctx.beginPath()
  ctx.rect(x, y, w, elH)
  ctx.clip()

  // Translate context to element position
  ctx.translate(x, y)

  const maxDist = Math.max(...stadium.wallPoints.map(wp => wp.distance))
  const overheadScale = Math.min(w, elH - 60) / (maxDist * 1.15)

  // Draw field
  if (viewMode === 'overhead') {
    drawFieldOverhead(ctx, w, elH, stadium, p.showField !== false, p.showWall !== false, overheadScale, 0, 0)
  } else {
    let camX: number, camY: number, camZ: number, fov: number
    if (viewMode === 'broadcast') {
      camX = 0; camY = -20; camZ = 80; fov = 50
    } else {
      camX = 0; camY = 450; camZ = 60; fov = 45
    }
    drawField3D(ctx, w, elH, stadium, p.showField !== false, p.showWall !== false, camX, camY, camZ, fov)
  }

  // Fetch data for static export
  const hitDataMap: Record<string, BattedBallRow[]> = {}
  for (const hg of hits) {
    if (!hg.batterId) continue
    try {
      const params = new URLSearchParams({
        playerId: String(hg.batterId),
        batterId: String(hg.batterId),
        battedBalls: 'true',
        ...(hg.eventFilter && { events: hg.eventFilter }),
        ...(hg.bbTypeFilter && { bbType: hg.bbTypeFilter }),
        ...(hg.gameYear && { gameYear: String(hg.gameYear) }),
        ...(hg.dateFrom && { dateFrom: hg.dateFrom }),
        ...(hg.dateTo && { dateTo: hg.dateTo }),
      })
      const r = await fetch(`/api/scene-stats?${params}`)
      const data = await r.json()
      hitDataMap[hg.id] = data.battedBalls || []
    } catch {
      hitDataMap[hg.id] = []
    }
  }

  // Draw all landing dots
  for (const hg of hits) {
    const rows = hitDataMap[hg.id] || []
    const color = hg.color || '#06b6d4'

    for (const row of rows) {
      if (!row.launch_speed || !row.launch_angle) continue
      const traj = computeBattedBallTrajectory({
        launchSpeed: row.launch_speed,
        launchAngle: row.launch_angle,
        sprayAngle: Number(row.spray_angle) || sprayAngleFromHC(row.hc_x, row.hc_y),
      })
      const last = traj[traj.length - 1]

      if (viewMode === 'overhead') {
        const lp = fieldToOverhead(last.x, last.y, w, elH, overheadScale, 0, 0)
        ctx.globalAlpha = 0.7
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(lp.x, lp.y, Math.max(2.5, w * 0.006), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else {
        let camX: number, camY: number, camZ: number, fov: number
        if (viewMode === 'broadcast') {
          camX = 0; camY = -20; camZ = 80; fov = 50
        } else {
          camX = 0; camY = 450; camZ = 60; fov = 45
        }
        const transformPt = (fx: number, fy: number, fz: number) => {
          if (viewMode === 'centerfield') {
            return fieldTo3D(-fx, -fy + 400, fz, camX, camY, camZ, fov, w, elH)
          }
          return fieldTo3D(fx, fy, fz, camX, camY, camZ, fov, w, elH)
        }

        // Trail
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.4
        ctx.beginPath()
        let started = false
        for (const pt of traj) {
          const sp = transformPt(pt.x, pt.y, pt.z)
          if (sp.scale > 0) {
            if (!started) { ctx.moveTo(sp.x, sp.y); started = true }
            else ctx.lineTo(sp.x, sp.y)
          }
        }
        ctx.stroke()
        ctx.globalAlpha = 1

        // Landing dot
        const lp = transformPt(last.x, last.y, 0)
        ctx.globalAlpha = 0.6
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(lp.x, lp.y, Math.max(2, lp.scale * 0.5), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
  }

  // Key / Legend
  if (p.showKey !== false) {
    const keyHits = hits.filter(hg => hg.showInKey !== false && hg.batterName)
    if (keyHits.length > 0) {
      const fontSize = Math.max(10, Math.min(13, elH * 0.035))
      const lineH = fontSize + 5
      const dotR = fontSize * 0.3
      const padX = 8
      const padY = 6
      const keyH = keyHits.length * lineH + padY * 2
      const keyW = Math.min(w * 0.45, 200)

      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.globalAlpha = 0.8
      const rx = w - keyW - 8
      const ry = 8
      ctx.beginPath()
      ctx.roundRect(rx, ry, keyW, keyH, 6)
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      keyHits.forEach((hg, i) => {
        const cy = ry + padY + i * lineH + lineH / 2
        ctx.fillStyle = hg.color || '#06b6d4'
        ctx.beginPath()
        ctx.arc(rx + padX + dotR, cy, dotR, 0, Math.PI * 2)
        ctx.fill()
        const count = (hitDataMap[hg.id] || []).length
        const label = `${hg.batterName}${count ? ` (${count})` : ''}`
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillText(label, rx + padX + dotR * 2 + 6, cy, keyW - padX * 2 - dotR * 2 - 6)
      })
    }
  }

  ctx.restore()
}
