'use client'
import { useEffect, useRef, useState, useCallback, RefObject } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'
import {
  SimulatedPitch,
  simulatedPitchToKinematics,
  computeTrajectory,
  TrajectoryPoint,
} from '@/lib/trajectoryPhysics'
import { getPitchColor } from '@/components/chartConfig'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// Camera constants (catcher's-eye)
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

const DEFAULT_PITCHES: SimulatedPitch[] = [
  { id: '1', name: '4-Seam Fastball', color: '#ef4444', velocity: 95, spinRate: 2300, spinAxis: 210, hBreak: -8, iVBreak: 16, releasePosX: -2, releasePosZ: 6 },
  { id: '2', name: 'Slider', color: '#0ea5e9', velocity: 87, spinRate: 2500, spinAxis: 45, hBreak: 3, iVBreak: -2, releasePosX: -2, releasePosZ: 5.8 },
]

let pitchIdCounter = 10

// Pitch editor field
function Field({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-14 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
      />
      <span className="text-[10px] text-zinc-400 tabular-nums w-16 text-right">{value} {unit}</span>
    </div>
  )
}

export default function PitchSimulation({ data, playerName, quality, containerRef, onFrameUpdate }: TemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(false)

  const [pitches, setPitches] = useState<SimulatedPitch[]>(DEFAULT_PITCHES)
  const [selectedPitchId, setSelectedPitchId] = useState<string>('1')
  const [targetX, setTargetX] = useState(0) // feet
  const [targetZ, setTargetZ] = useState(2.5) // feet
  const [isDraggingTarget, setIsDraggingTarget] = useState(false)

  // Playback state
  const [playing, setPlaying] = useState(true)
  const [scrubT, setScrubT] = useState(0) // 0-1 normalized time
  const playingRef = useRef(true)
  const scrubRef = useRef(0)

  // Keep refs in sync
  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { scrubRef.current = scrubT }, [scrubT])

  const updatePitch = useCallback((id: string, patch: Partial<SimulatedPitch>) => {
    setPitches(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }, [])

  const addPitch = useCallback(() => {
    const id = String(++pitchIdCounter)
    const newPitch: SimulatedPitch = {
      id, name: 'New Pitch', color: '#10b981',
      velocity: 90, spinRate: 2200, spinAxis: 180,
      hBreak: 0, iVBreak: 10, releasePosX: -2, releasePosZ: 6,
    }
    setPitches(prev => [...prev, newPitch])
    setSelectedPitchId(id)
  }, [])

  const removePitch = useCallback((id: string) => {
    setPitches(prev => {
      const next = prev.filter(p => p.id !== id)
      if (selectedPitchId === id && next.length > 0) setSelectedPitchId(next[0].id)
      return next
    })
  }, [selectedPitchId])

  // Import from player data
  const importFromPlayer = useCallback(() => {
    if (!data.length) return
    const typeMap = new Map<string, any[]>()
    for (const d of data) {
      if (!d.pitch_name) continue
      if (!typeMap.has(d.pitch_name)) typeMap.set(d.pitch_name, [])
      typeMap.get(d.pitch_name)!.push(d)
    }

    const imported: SimulatedPitch[] = []
    for (const [name, rows] of typeMap) {
      if (rows.length < 3) continue
      const avg = (field: string) => {
        const vals = rows.map((r: any) => r[field]).filter((v: any) => v != null) as number[]
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      imported.push({
        id: String(++pitchIdCounter),
        name,
        color: getPitchColor(name),
        velocity: Math.round(avg('release_speed')),
        spinRate: Math.round(avg('release_spin_rate')),
        spinAxis: Math.round(avg('spin_axis')),
        hBreak: Math.round(avg('pfx_x') * 12 * 10) / 10,
        iVBreak: Math.round(avg('pfx_z') * 12 * 10) / 10,
        releasePosX: Math.round(avg('release_pos_x') * 100) / 100,
        releasePosZ: Math.round(avg('release_pos_z') * 100) / 100,
      })
    }
    if (imported.length) {
      setPitches(imported)
      setSelectedPitchId(imported[0].id)
    }
  }, [data])

  // Canvas rendering — uses canvasContainerRef for sizing (not outer containerRef)
  useEffect(() => {
    mountedRef.current = true
    const canvas = canvasRef.current
    const container = canvasContainerRef.current
    if (!canvas || !container || !pitches.length) return

    function setupAndRun() {
      const dpr = quality.resolution
      const cssW = container!.clientWidth
      const cssH = container!.clientHeight
      if (cssW === 0 || cssH === 0) return

      canvas!.width = Math.round(cssW * dpr)
      canvas!.height = Math.round(cssH * dpr)
      canvas!.style.width = `${cssW}px`
      canvas!.style.height = `${cssH}px`

      const ctx = canvas!.getContext('2d')
      if (!ctx) return

      // Dynamic focal length from actual canvas size
      const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180
      const focalLength = (cssH / 2) / Math.tan(fovRad / 2)
      const centerX = cssW / 2
      const centerY = cssH * 0.42

      // Compute trajectories
      const steps = quality.id === 'draft' ? 40 : quality.id === 'standard' ? 80 : 120
      const allTrajectories: { pitch: SimulatedPitch; traj: TrajectoryPoint[] }[] = pitches.map(p => {
        try {
          const kin = simulatedPitchToKinematics(p, targetX, targetZ)
          return { pitch: p, traj: computeTrajectory(kin, steps) }
        } catch {
          return { pitch: p, traj: [] }
        }
      }).filter(t => t.traj.length > 2)

      const ANIM_DURATION = 1.0
      const PAUSE_DURATION = 1.0
      let startTs: number | null = null
      let frameCount = 0

      function drawFrame(t: number) {
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

        // Target crosshair
        const tgt = worldToCanvas(targetX, SZ_Y, targetZ, focalLength, centerX, centerY)
        ctx!.strokeStyle = 'rgba(255,255,0,0.6)'
        ctx!.lineWidth = 1.5
        const crossSize = 12
        ctx!.beginPath(); ctx!.moveTo(tgt.x - crossSize, tgt.y); ctx!.lineTo(tgt.x + crossSize, tgt.y); ctx!.stroke()
        ctx!.beginPath(); ctx!.moveTo(tgt.x, tgt.y - crossSize); ctx!.lineTo(tgt.x, tgt.y + crossSize); ctx!.stroke()
        ctx!.beginPath(); ctx!.arc(tgt.x, tgt.y, 6, 0, Math.PI * 2); ctx!.stroke()

        // Draw trajectories
        for (const { pitch, traj } of allTrajectories) {
          const maxTrajT = traj[traj.length - 1].t
          const currentT = t * maxTrajT

          let currentIdx = traj.length - 1
          for (let i = 0; i < traj.length - 1; i++) {
            if (traj[i + 1].t > currentT) { currentIdx = i; break }
          }

          // Trail
          ctx!.beginPath()
          ctx!.strokeStyle = pitch.color
          ctx!.lineWidth = 2
          ctx!.globalAlpha = 0.5
          let started = false
          for (let i = 0; i <= currentIdx; i++) {
            const sp = worldToCanvas(traj[i].x, traj[i].y, traj[i].z, focalLength, centerX, centerY)
            if (!started) { ctx!.moveTo(sp.x, sp.y); started = true }
            else ctx!.lineTo(sp.x, sp.y)
          }
          ctx!.stroke()
          ctx!.globalAlpha = 1

          // Ball
          const pt = traj[currentIdx]
          const sp = worldToCanvas(pt.x, pt.y, pt.z, focalLength, centerX, centerY)
          const r = ballRadius(pt.y, focalLength)

          // Glow
          const glow = ctx!.createRadialGradient(sp.x, sp.y, r * 0.2, sp.x, sp.y, r * 2)
          glow.addColorStop(0, pitch.color + 'aa')
          glow.addColorStop(1, pitch.color + '00')
          ctx!.beginPath(); ctx!.arc(sp.x, sp.y, r * 2, 0, Math.PI * 2)
          ctx!.fillStyle = glow; ctx!.fill()

          // Core
          ctx!.beginPath(); ctx!.arc(sp.x, sp.y, r, 0, Math.PI * 2)
          ctx!.fillStyle = pitch.color; ctx!.fill()

          // Landing dot + label
          if (t >= 1) {
            const lastPt = traj[traj.length - 1]
            const lastSp = worldToCanvas(lastPt.x, lastPt.y, lastPt.z, focalLength, centerX, centerY)
            ctx!.beginPath(); ctx!.arc(lastSp.x, lastSp.y, 5, 0, Math.PI * 2)
            ctx!.fillStyle = pitch.color
            ctx!.globalAlpha = 0.8; ctx!.fill(); ctx!.globalAlpha = 1

            ctx!.font = '10px Inter, system-ui, sans-serif'
            ctx!.fillStyle = pitch.color
            ctx!.fillText(pitch.name, lastSp.x + 8, lastSp.y + 4)
          }
        }

        // Tunnel point
        if (allTrajectories.length >= 2 && t >= 1) {
          const t1 = allTrajectories[0].traj
          const t2 = allTrajectories[1].traj
          const minLen = Math.min(t1.length, t2.length)
          for (let i = 0; i < minLen; i++) {
            const dist = Math.sqrt((t1[i].x - t2[i].x) ** 2 + (t1[i].z - t2[i].z) ** 2)
            if (dist > 1 / 12) {
              const tunnelDist = (t1[i].y - SZ_Y).toFixed(1)
              ctx!.font = '10px Inter, system-ui, sans-serif'
              ctx!.fillStyle = 'rgba(255,255,0,0.6)'
              ctx!.fillText(`Tunnel: ${tunnelDist}ft from plate`, 16, cssH - 34)
              break
            }
          }
        }

        // Title
        ctx!.font = `bold ${Math.max(12, Math.round(cssH * 0.028))}px Inter, system-ui, sans-serif`
        ctx!.fillStyle = 'rgba(255,255,255,0.9)'
        ctx!.fillText('Pitch Simulation', 16, 28)

        ctx!.font = `${Math.max(10, Math.round(cssH * 0.018))}px Inter, system-ui, sans-serif`
        ctx!.fillStyle = 'rgba(161,161,170,0.7)'
        ctx!.fillText(`${pitches.length} pitch${pitches.length !== 1 ? 'es' : ''} designed`, 16, cssH - 14)

        ctx!.restore()
      }

      function tick(timestamp: number) {
        if (!mountedRef.current) return

        let t: number
        if (playingRef.current) {
          if (startTs === null) startTs = timestamp
          const elapsed = (timestamp - startTs) / 1000
          const cycleT = elapsed % (ANIM_DURATION + PAUSE_DURATION)
          t = Math.min(cycleT / ANIM_DURATION, 1)
          // Sync scrub slider to current playback position
          scrubRef.current = t
        } else {
          // Paused: render at scrub position, reset startTs so resume is smooth
          startTs = null
          t = scrubRef.current
        }

        drawFrame(t)

        frameCount++
        onFrameUpdate?.(frameCount, Math.round((ANIM_DURATION + PAUSE_DURATION) * quality.fps))
        rafRef.current = requestAnimationFrame(tick)
      }

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }

    setupAndRun()

    const obs = new ResizeObserver(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      setupAndRun()
    })
    obs.observe(container)

    return () => {
      mountedRef.current = false
      obs.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [pitches, targetX, targetZ, quality, onFrameUpdate])

  // Target drag handler — uses canvasContainerRef for sizing
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    const container = canvasContainerRef.current
    if (!canvas || !container) return

    const rect = canvas.getBoundingClientRect()
    const cssW = container.clientWidth
    const cssH = container.clientHeight
    const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180
    const focalLength = (cssH / 2) / Math.tan(fovRad / 2)
    const centerX = cssW / 2
    const centerY = cssH * 0.42

    // Check if click is near target
    const tgt = worldToCanvas(targetX, SZ_Y, targetZ, focalLength, centerX, centerY)
    const dx = e.clientX - rect.left - tgt.x
    const dy = e.clientY - rect.top - tgt.y
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      setIsDraggingTarget(true)
      const onMove = (ev: PointerEvent) => {
        const mx = ev.clientX - rect.left
        const my = ev.clientY - rect.top
        const depth = Math.max(SZ_Y - CAMERA_Y, 0.01)
        const wx = ((mx - centerX) / focalLength) * depth
        const wz = CAMERA_Z - ((my - centerY) / focalLength) * depth
        setTargetX(Math.max(-1.5, Math.min(1.5, wx)))
        setTargetZ(Math.max(0.5, Math.min(4.5, wz)))
      }
      const onUp = () => {
        setIsDraggingTarget(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }, [targetX, targetZ])

  return (
    <div className="flex w-full h-full" style={{ background: '#09090b' }}>
      {/* Left panel: pitch builder */}
      <div className="w-64 shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden bg-zinc-900/50">
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold text-white uppercase tracking-wider">Pitches</span>
          <div className="flex gap-1">
            {data.length > 0 && (
              <button onClick={importFromPlayer}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 transition px-1.5 py-0.5 rounded border border-cyan-600/30 hover:border-cyan-500/50"
                title="Import averages from player data">
                Import
              </button>
            )}
            <button onClick={addPitch}
              className="text-[10px] text-zinc-400 hover:text-white transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600">
              + Add
            </button>
          </div>
        </div>

        {/* Pitch list */}
        <div className="flex-1 overflow-y-auto">
          {pitches.map(p => (
            <div key={p.id}>
              <button
                onClick={() => setSelectedPitchId(p.id)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left transition border-b border-zinc-800/50
                  ${selectedPitchId === p.id ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'}`}
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <input
                  type="text" value={p.name}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updatePitch(p.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-xs text-zinc-200 outline-none min-w-0"
                />
                {pitches.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); removePitch(p.id) }}
                    className="text-zinc-600 hover:text-red-400 transition text-xs shrink-0"
                  >&times;</button>
                )}
              </button>

              {selectedPitchId === p.id && (
                <div className="px-3 py-2 space-y-1.5 bg-zinc-800/20 border-b border-zinc-800">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-zinc-500">Color</span>
                    <input type="color" value={p.color}
                      onChange={e => updatePitch(p.id, { color: e.target.value })}
                      className="w-5 h-5 rounded border border-zinc-700 bg-transparent cursor-pointer
                        [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded" />
                  </div>
                  <Field label="Velo" value={p.velocity} min={60} max={105} step={1} unit="mph"
                    onChange={v => updatePitch(p.id, { velocity: v })} />
                  <Field label="Spin" value={p.spinRate} min={1000} max={3500} step={25} unit="rpm"
                    onChange={v => updatePitch(p.id, { spinRate: v })} />
                  <Field label="HB" value={p.hBreak} min={-25} max={25} step={0.5} unit="in"
                    onChange={v => updatePitch(p.id, { hBreak: v })} />
                  <Field label="IVB" value={p.iVBreak} min={-15} max={25} step={0.5} unit="in"
                    onChange={v => updatePitch(p.id, { iVBreak: v })} />
                  <Field label="Rel X" value={p.releasePosX} min={-4} max={4} step={0.1} unit="ft"
                    onChange={v => updatePitch(p.id, { releasePosX: v })} />
                  <Field label="Rel Z" value={p.releasePosZ} min={4} max={7} step={0.1} unit="ft"
                    onChange={v => updatePitch(p.id, { releasePosZ: v })} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Target controls */}
        <div className="px-3 py-2 border-t border-zinc-800 shrink-0 space-y-1.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Target</span>
          <Field label="X" value={Math.round(targetX * 100) / 100} min={-1.5} max={1.5} step={0.05} unit="ft"
            onChange={v => setTargetX(v)} />
          <Field label="Z" value={Math.round(targetZ * 100) / 100} min={0.5} max={4.5} step={0.05} unit="ft"
            onChange={v => setTargetZ(v)} />
          <span className="text-[9px] text-zinc-600 block">Drag crosshair on canvas to move target</span>
        </div>
      </div>

      {/* Right panel: canvas + playback */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Canvas area — this ref drives sizing */}
        <div ref={canvasContainerRef} className="flex-1 min-h-0 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            style={{ display: 'block', cursor: isDraggingTarget ? 'grabbing' : 'default' }}
            onPointerDown={handleCanvasPointerDown}
            aria-label="Pitch simulation visualization"
          />
        </div>

        {/* Playback controls */}
        <div className="shrink-0 bg-zinc-900/80 border-t border-zinc-800 px-4 py-2 flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={() => setPlaying(!playing)}
            className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 border border-zinc-700
              text-zinc-300 hover:text-white hover:border-zinc-600 transition"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Scrub slider */}
          <input
            type="range" min={0} max={1} step={0.005}
            value={scrubT}
            onChange={e => {
              const v = parseFloat(e.target.value)
              setScrubT(v)
              scrubRef.current = v
              if (playing) setPlaying(false)
            }}
            className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:cursor-pointer"
          />

          {/* Quick jump buttons */}
          <button
            onClick={() => { setScrubT(0); scrubRef.current = 0; setPlaying(false) }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600"
            title="Jump to start"
          >
            Start
          </button>
          <button
            onClick={() => { setScrubT(0.5); scrubRef.current = 0.5; setPlaying(false) }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600"
            title="Jump to mid-flight"
          >
            Mid
          </button>
          <button
            onClick={() => { setScrubT(1); scrubRef.current = 1; setPlaying(false) }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600"
            title="Jump to plate"
          >
            Plate
          </button>

          <span className="text-[10px] text-zinc-600 tabular-nums">
            {Math.round(scrubT * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}
