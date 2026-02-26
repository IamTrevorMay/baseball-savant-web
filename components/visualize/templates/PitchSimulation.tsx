'use client'
import { useEffect, useRef, useState, useCallback, RefObject } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'
import { useStyle } from '@/components/visualize/StyleContext'
import { getStyledPitchColor, StyleSettings } from '@/lib/stylePresets'
import { downloadBlob } from '@/lib/exportUtils'
import {
  SimulatedPitch,
  simulatedPitchToKinematics,
  tunnelPitchKinematics,
  computeTrajectory,
  TrajectoryPoint,
  PitchKinematics,
} from '@/lib/trajectoryPhysics'
import { getPitchColor } from '@/components/chartConfig'
import { supabase } from '@/lib/supabase'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// ── Types ──────────────────────────────────────────────────────────────────

type ViewMode = 'catcher' | 'pitcher' | '3d'

interface Camera3D {
  pos: { x: number; y: number; z: number }
  lookAt: { x: number; y: number; z: number }
  fov: number
  flipX?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────

const SZ_LEFT = -17 / 24
const SZ_RIGHT = 17 / 24
const SZ_BOTTOM = 1.5
const SZ_TOP = 3.5
const SZ_Y = 17 / 12

const CAMERAS: Record<string, Camera3D> = {
  catcher: { pos: { x: 0, y: -4, z: 2.5 }, lookAt: { x: 0, y: 30, z: 2.5 }, fov: 50 },
  pitcher: { pos: { x: 0, y: -4, z: 2.5 }, lookAt: { x: 0, y: 30, z: 2.5 }, fov: 50, flipX: true },
}

// ── 3D Orbit Camera ────────────────────────────────────────────────────────

const ORBIT_CENTER = { x: 0, y: 25, z: 3 }
const ORBIT_INIT = { azimuth: 1.454, elevation: 0.538, distance: 29.3 }

function getOrbitCamera(orbit: { azimuth: number; elevation: number; distance: number }): Camera3D {
  const { azimuth, elevation, distance } = orbit
  const cosE = Math.cos(elevation)
  return {
    pos: {
      x: ORBIT_CENTER.x + distance * cosE * Math.sin(azimuth),
      y: ORBIT_CENTER.y - distance * cosE * Math.cos(azimuth),
      z: ORBIT_CENTER.z + distance * Math.sin(elevation),
    },
    lookAt: ORBIT_CENTER,
    fov: 50,
  }
}

// ── General 3D → 2D projection (lookAt camera) ────────────────────────────

function project3D(
  wx: number, wy: number, wz: number,
  cam: Camera3D,
  canvasW: number, canvasH: number,
): { x: number; y: number; scale: number; depth: number } {
  let fx = cam.lookAt.x - cam.pos.x
  let fy = cam.lookAt.y - cam.pos.y
  let fz = cam.lookAt.z - cam.pos.z
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz)
  fx /= fl; fy /= fl; fz /= fl

  let rx = fy, ry = -fx, rz = 0
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
  if (rl > 0.0001) { rx /= rl; ry /= rl; rz /= rl }

  const ux = ry * fz - rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy - ry * fx

  const dx = wx - cam.pos.x
  const dy = wy - cam.pos.y
  const dz = wz - cam.pos.z

  const camX = rx * dx + ry * dy + rz * dz
  const camY = ux * dx + uy * dy + uz * dz
  const camZ = fx * dx + fy * dy + fz * dz

  const depth = Math.max(camZ, 0.01)
  const fovRad = (cam.fov * Math.PI) / 180
  const focalLength = (canvasH / 2) / Math.tan(fovRad / 2)
  const scale = focalLength / depth

  const flipMult = cam.flipX ? -1 : 1
  return { x: canvasW / 2 + flipMult * camX * scale, y: canvasH / 2 - camY * scale, scale, depth }
}

function unprojectToPlane(
  screenX: number, screenY: number,
  cam: Camera3D,
  canvasW: number, canvasH: number,
  planeY: number,
): { x: number; z: number } | null {
  let fx = cam.lookAt.x - cam.pos.x, fy = cam.lookAt.y - cam.pos.y, fz = cam.lookAt.z - cam.pos.z
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz)
  fx /= fl; fy /= fl; fz /= fl

  let rx = fy, ry = -fx, rz = 0
  const rl = Math.sqrt(rx * rx + ry * ry)
  if (rl > 0.0001) { rx /= rl; ry /= rl }

  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
  const fovRad = (cam.fov * Math.PI) / 180
  const focalLen = (canvasH / 2) / Math.tan(fovRad / 2)

  const flipMult = cam.flipX ? -1 : 1
  const ndcX = flipMult * (screenX - canvasW / 2) / focalLen
  const ndcY = -(screenY - canvasH / 2) / focalLen

  const rdx = fx + ndcX * rx + ndcY * ux
  const rdy = fy + ndcX * ry + ndcY * uy
  const rdz = fz + ndcX * rz + ndcY * uz

  if (Math.abs(rdy) < 0.0001) return null
  const t = (planeY - cam.pos.y) / rdy
  if (t <= 0) return null

  return { x: cam.pos.x + t * rdx, z: cam.pos.z + t * rdz }
}

// ── Default pitches ────────────────────────────────────────────────────────

const DEFAULT_PITCHES: SimulatedPitch[] = [
  { id: '1', name: '4-Seam Fastball', color: '#ef4444', velocity: 95, spinRate: 2300, spinAxis: 210, hBreak: -8, iVBreak: 16, releasePosX: -2, releasePosZ: 6 },
  { id: '2', name: 'Slider', color: '#0ea5e9', velocity: 87, spinRate: 2500, spinAxis: 45, hBreak: 3, iVBreak: -2, releasePosX: -2, releasePosZ: 5.8 },
]

let pitchIdCounter = 10

// ── Field slider sub-component ─────────────────────────────────────────────

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

// ── Toggle button sub-component ────────────────────────────────────────────

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 text-[10px] py-1 rounded border transition font-medium
        ${active ? 'bg-cyan-600/20 text-cyan-300 border-cyan-600/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'}`}
    >{label}</button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PitchSimulation({ data, playerName, quality, containerRef, onFrameUpdate }: TemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const { style } = useStyle()

  const [pitches, setPitches] = useState<SimulatedPitch[]>(DEFAULT_PITCHES)
  const [selectedPitchId, setSelectedPitchId] = useState<string>('1')
  const [targetX, setTargetX] = useState(0)
  const [targetZ, setTargetZ] = useState(2.5)
  const [isDraggingTarget, setIsDraggingTarget] = useState(false)
  const [playing, setPlaying] = useState(false) // start paused
  const [scrubT, setScrubT] = useState(1) // start at end
  const [tunnelMode, setTunnelMode] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('catcher')
  const [referencePitchId, setReferencePitchId] = useState('1')
  const [isOrbiting, setIsOrbiting] = useState(false)
  const [lockRelease, setLockRelease] = useState(false)
  const orbitRef = useRef({ ...ORBIT_INIT })

  // Pitcher search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [selectedPitcher, setSelectedPitcher] = useState<{ id: number; name: string } | null>(null)
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([])
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([])
  const [simulating, setSimulating] = useState(false)
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false)

  // Video export state
  const [exporting, setExporting] = useState(false)

  // Mutable refs for the rAF loop
  const pitchesRef = useRef(pitches)
  const targetXRef = useRef(targetX)
  const targetZRef = useRef(targetZ)
  const playingRef = useRef(playing)
  const scrubRef = useRef(scrubT)
  const qualityRef = useRef(quality)
  const tunnelModeRef = useRef(tunnelMode)
  const viewModeRef = useRef(viewMode)
  const referencePitchIdRef = useRef(referencePitchId)
  const setScrubTRef = useRef(setScrubT)
  const styleRef = useRef(style)

  // Sync refs
  pitchesRef.current = pitches
  targetXRef.current = targetX
  targetZRef.current = targetZ
  playingRef.current = playing
  qualityRef.current = quality
  tunnelModeRef.current = tunnelMode
  viewModeRef.current = viewMode
  referencePitchIdRef.current = referencePitchId
  setScrubTRef.current = setScrubT
  styleRef.current = style

  // ── Pitcher search ──────────────────────────────────────────────────────

  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); setShowSearchDropdown(false); return }
    const { data } = await supabase.rpc('search_players', { search_term: value.trim(), result_limit: 6 })
    setSearchResults(data || [])
    setShowSearchDropdown(true)
  }

  async function selectPitcher(pitcher: { pitcher: number; player_name: string }) {
    setSelectedPitcher({ id: pitcher.pitcher, name: pitcher.player_name })
    setSearchQuery(pitcher.player_name)
    setShowSearchDropdown(false)

    // Fetch available seasons
    const { data } = await supabase.rpc('run_query', {
      query_text: `SELECT DISTINCT game_year FROM pitches WHERE pitcher = ${pitcher.pitcher} ORDER BY game_year DESC`
    })
    if (data) {
      const seasons = data.map((r: any) => r.game_year).filter(Boolean)
      setAvailableSeasons(seasons)
      setSelectedSeasons(seasons.length > 0 ? [seasons[0]] : [])
    }
  }

  function toggleSeason(season: number) {
    setSelectedSeasons(prev =>
      prev.includes(season) ? prev.filter(s => s !== season) : [...prev, season].sort((a, b) => b - a)
    )
  }

  async function simulate() {
    if (!selectedPitcher || selectedSeasons.length === 0) return
    setSimulating(true)
    try {
      const seasonFilter = selectedSeasons.map(s => String(s)).join(',')
      const sql = `SELECT pitch_name, AVG(release_speed) AS avg_velo, AVG(release_spin_rate) AS avg_spin, AVG(spin_axis) AS avg_axis, AVG(pfx_x) AS avg_hb, AVG(pfx_z) AS avg_ivb, AVG(release_pos_x) AS avg_rel_x, AVG(release_pos_z) AS avg_rel_z, COUNT(*) AS cnt FROM pitches WHERE pitcher = ${selectedPitcher.id} AND game_year IN (${seasonFilter}) AND pitch_name IS NOT NULL GROUP BY pitch_name HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC`
      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
      if (error || !data || !data.length) { setSimulating(false); return }

      const imported: SimulatedPitch[] = []
      let maxVelo = 0
      let maxVeloId = ''
      for (const row of data) {
        const id = String(++pitchIdCounter)
        const velo = Math.round(Number(row.avg_velo))
        if (velo > maxVelo) { maxVelo = velo; maxVeloId = id }
        imported.push({
          id,
          name: row.pitch_name,
          color: getPitchColor(row.pitch_name),
          velocity: velo,
          spinRate: Math.round(Number(row.avg_spin)),
          spinAxis: Math.round(Number(row.avg_axis)),
          hBreak: Math.round(Number(row.avg_hb) * 12 * 10) / 10,
          iVBreak: Math.round(Number(row.avg_ivb) * 12 * 10) / 10,
          releasePosX: Math.round(Number(row.avg_rel_x) * 100) / 100,
          releasePosZ: Math.round(Number(row.avg_rel_z) * 100) / 100,
        })
      }
      if (imported.length) {
        setPitches(imported)
        setSelectedPitchId(imported[0].id)
        setReferencePitchId(maxVeloId || imported[0].id)
        // Reset to end frame paused
        setScrubT(1)
        scrubRef.current = 1
        setPlaying(false)
      }
    } catch (e) {
      console.error('Simulation failed:', e)
    }
    setSimulating(false)
  }

  // ── Callbacks ──────────────────────────────────────────────────────────

  const updatePitch = useCallback((id: string, patch: Partial<SimulatedPitch>) => {
    setPitches(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...patch } : p)
      if (lockRelease && (patch.releasePosX !== undefined || patch.releasePosZ !== undefined)) {
        const src = updated.find(p => p.id === id)!
        return updated.map(p => ({
          ...p,
          releasePosX: patch.releasePosX !== undefined ? src.releasePosX : p.releasePosX,
          releasePosZ: patch.releasePosZ !== undefined ? src.releasePosZ : p.releasePosZ,
        }))
      }
      return updated
    })
  }, [lockRelease])

  const addPitch = useCallback(() => {
    const id = String(++pitchIdCounter)
    setPitches(prev => [...prev, {
      id, name: 'New Pitch', color: '#10b981',
      velocity: 90, spinRate: 2200, spinAxis: 180,
      hBreak: 0, iVBreak: 10, releasePosX: -2, releasePosZ: 6,
    }])
    setSelectedPitchId(id)
  }, [])

  const removePitch = useCallback((id: string) => {
    setPitches(prev => {
      const next = prev.filter(p => p.id !== id)
      if (selectedPitchId === id && next.length > 0) setSelectedPitchId(next[0].id)
      if (referencePitchId === id && next.length > 0) setReferencePitchId(next[0].id)
      return next
    })
  }, [selectedPitchId, referencePitchId])

  const importFromPlayer = useCallback(() => {
    if (!data.length) return
    const typeMap = new Map<string, any[]>()
    for (const d of data) {
      if (!d.pitch_name) continue
      if (!typeMap.has(d.pitch_name)) typeMap.set(d.pitch_name, [])
      typeMap.get(d.pitch_name)!.push(d)
    }
    const imported: SimulatedPitch[] = []
    let maxVelo = 0
    let maxVeloId = ''
    for (const [name, rows] of typeMap) {
      if (rows.length < 3) continue
      const avg = (field: string) => {
        const vals = rows.map((r: any) => r[field]).filter((v: any) => v != null) as number[]
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      const id = String(++pitchIdCounter)
      const velo = Math.round(avg('release_speed'))
      if (velo > maxVelo) { maxVelo = velo; maxVeloId = id }
      imported.push({
        id, name, color: getPitchColor(name),
        velocity: velo,
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
      setReferencePitchId(maxVeloId || imported[0].id)
    }
  }, [data])

  // ── Video export (WebM — universally supported) ─────────────────────────

  const exportVideo = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || exporting) return
    setExporting(true)
    try {
      // Play full animation from 0 to 1 over 2 seconds, then hold 1 second
      const fps = 60
      const totalDuration = 3 // seconds
      const stream = canvas.captureStream(fps)
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunks.push(e.data) }

      // Drive animation from start to finish
      setPlaying(true)
      setScrubT(0)
      scrubRef.current = 0

      await new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType })
          const name = selectedPitcher?.name || playerName || 'pitch-simulation'
          const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_')
          downloadBlob(blob, `${safeName}.webm`)
          resolve()
        }
        recorder.start()
        setTimeout(() => {
          recorder.stop()
          setPlaying(false)
          setScrubT(1)
          scrubRef.current = 1
        }, totalDuration * 1000)
      })
    } catch (e) {
      console.error('Video export failed:', e)
    }
    setExporting(false)
  }, [exporting, selectedPitcher, playerName])

  // ── Animation loop ─────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    const canvas = canvasRef.current
    if (!canvas) return

    const ANIM_DURATION = 1.0
    const PAUSE_DURATION = 1.0
    let startTs: number | null = null
    let frameCount = 0

    function tick(timestamp: number) {
      if (!mountedRef.current) return

      const parent = canvas!.parentElement
      if (!parent) { rafRef.current = requestAnimationFrame(tick); return }
      const cssW = parent.clientWidth
      const cssH = parent.clientHeight
      if (cssW <= 0 || cssH <= 0) { rafRef.current = requestAnimationFrame(tick); return }

      const q = qualityRef.current
      const dpr = q.resolution

      const needW = Math.round(cssW * dpr)
      const needH = Math.round(cssH * dpr)
      if (canvas!.width !== needW || canvas!.height !== needH) {
        canvas!.width = needW
        canvas!.height = needH
        canvas!.style.width = `${cssW}px`
        canvas!.style.height = `${cssH}px`
      }

      const ctx = canvas!.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return }

      // Read style settings
      const s = styleRef.current

      // Animation time
      let t: number
      if (playingRef.current) {
        if (startTs === null) startTs = timestamp
        const elapsed = ((timestamp - startTs) / 1000) * s.playbackSpeed
        const cycleT = elapsed % (ANIM_DURATION + PAUSE_DURATION)
        t = Math.min(cycleT / ANIM_DURATION, 1)
        scrubRef.current = t
        frameCount++
        if (frameCount % 6 === 0) setScrubTRef.current(t)
      } else {
        startTs = null
        t = scrubRef.current
      }

      // Read latest state from refs
      const view = viewModeRef.current
      const cam = view === '3d' ? getOrbitCamera(orbitRef.current) : CAMERAS[view]
      const isTunnel = tunnelModeRef.current
      const refId = referencePitchIdRef.current
      const currentPitches = pitchesRef.current
      const tx = targetXRef.current
      const tz = targetZRef.current
      const steps = q.id === 'draft' ? 40 : q.id === 'standard' ? 80 : 120

      const proj = (wx: number, wy: number, wz: number) => project3D(wx, wy, wz, cam, cssW, cssH)

      // ── Compute trajectories ─────────────────────────────────────────
      const refPitch = currentPitches.find(p => p.id === refId) || currentPitches[0]
      let refKin: PitchKinematics | null = null
      if (isTunnel && refPitch) {
        try { refKin = simulatedPitchToKinematics(refPitch, tx, tz) } catch { /* skip */ }
      }

      const allTrajectories: { pitch: SimulatedPitch; traj: TrajectoryPoint[]; isRef: boolean }[] = []
      for (const p of currentPitches) {
        try {
          let kin: PitchKinematics
          if (isTunnel && refKin && p.id !== refId) {
            kin = tunnelPitchKinematics(p, refKin)
          } else {
            kin = simulatedPitchToKinematics(p, tx, tz)
          }
          const traj = computeTrajectory(kin, steps)
          if (traj.length > 2) allTrajectories.push({ pitch: p, traj, isRef: p.id === (refPitch?.id ?? '') })
        } catch { /* skip invalid */ }
      }

      // ── Draw ─────────────────────────────────────────────────────────
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background — use style background color
      const bgColor = s.backgroundColor || '#09090b'
      const grad = ctx.createLinearGradient(0, 0, 0, cssH)
      grad.addColorStop(0, bgColor === '#09090b' ? '#0c1118' : bgColor)
      grad.addColorStop(1, bgColor)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, cssW, cssH)

      // Ground reference lines for 3D view
      if (view === '3d' && s.showGridLines) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 0.5
        for (const yy of [0, 10, 20, 30, 40, 50, 60]) {
          const a = proj(-10, yy, 0)
          const b = proj(10, yy, 0)
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
        for (const xx of [-10, -5, 0, 5, 10]) {
          const a = proj(xx, 0, 0)
          const b = proj(xx, 60, 0)
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }

      // Home plate (3D view only)
      if (view === '3d') {
        const hpPts = [
          proj(-8.5 / 12, 0, 0), proj(8.5 / 12, 0, 0),
          proj(8.5 / 12, 8.5 / 12, 0), proj(0, 17 / 12, 0), proj(-8.5 / 12, 8.5 / 12, 0),
        ]
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'
        ctx.lineWidth = 1
        ctx.beginPath()
        hpPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
        ctx.closePath(); ctx.stroke()
      }

      // Pitcher's rubber (3D view only)
      if (view === '3d') {
        const rubL = proj(-1, 60.5, 0.83)
        const rubR = proj(1, 60.5, 0.83)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(rubL.x, rubL.y); ctx.lineTo(rubR.x, rubR.y); ctx.stroke()
      }

      // Strike zone
      const szCorners = [
        proj(SZ_LEFT, SZ_Y, SZ_TOP), proj(SZ_RIGHT, SZ_Y, SZ_TOP),
        proj(SZ_RIGHT, SZ_Y, SZ_BOTTOM), proj(SZ_LEFT, SZ_Y, SZ_BOTTOM),
      ]
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.beginPath()
      szCorners.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      ctx.closePath(); ctx.fill()

      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      szCorners.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      ctx.closePath(); ctx.stroke()

      // Strike zone 3x3 grid
      if (s.showGridLines) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 0.75
        const szWidthWorld = SZ_RIGHT - SZ_LEFT
        const szHeightWorld = SZ_TOP - SZ_BOTTOM
        for (let i = 1; i <= 2; i++) {
          const xLine = SZ_LEFT + (szWidthWorld / 3) * i
          const top = proj(xLine, SZ_Y, SZ_TOP)
          const bot = proj(xLine, SZ_Y, SZ_BOTTOM)
          ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke()

          const zLine = SZ_BOTTOM + (szHeightWorld / 3) * i
          const left = proj(SZ_LEFT, SZ_Y, zLine)
          const right = proj(SZ_RIGHT, SZ_Y, zLine)
          ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke()
        }
      }

      // Directional labels
      if (view !== '3d' && s.showAxisLabels) {
        const fontSize = Math.round(9 * s.fontScale)
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
        ctx.fillStyle = 'rgba(161,161,170,0.35)'
        const labelY = szCorners[2].y + 14
        if (view === 'catcher') {
          ctx.textAlign = 'left'
          ctx.fillText('3B \u2190', szCorners[3].x, labelY)
          ctx.textAlign = 'right'
          ctx.fillText('\u2192 1B', szCorners[2].x, labelY)
        } else {
          ctx.textAlign = 'left'
          ctx.fillText('1B \u2190', szCorners[3].x, labelY)
          ctx.textAlign = 'right'
          ctx.fillText('\u2192 3B', szCorners[2].x, labelY)
        }
        ctx.textAlign = 'left'
      }

      // Target crosshair
      const tgt = proj(tx, SZ_Y, tz)
      ctx.strokeStyle = 'rgba(255,255,0,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(tgt.x - 12, tgt.y); ctx.lineTo(tgt.x + 12, tgt.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(tgt.x, tgt.y - 12); ctx.lineTo(tgt.x, tgt.y + 12); ctx.stroke()
      ctx.beginPath(); ctx.arc(tgt.x, tgt.y, 6, 0, Math.PI * 2); ctx.stroke()

      // Trajectories — apply style settings
      for (const { pitch, traj, isRef } of allTrajectories) {
        const maxTrajT = traj[traj.length - 1].t
        const currentT = t * maxTrajT
        let currentIdx = traj.length - 1
        for (let i = 0; i < traj.length - 1; i++) {
          if (traj[i + 1].t > currentT) { currentIdx = i; break }
        }

        // Trail line — use style trail settings
        ctx.beginPath()
        ctx.strokeStyle = pitch.color
        ctx.lineWidth = (isTunnel && isRef) ? s.trailWidth + 1 : s.trailWidth
        ctx.globalAlpha = s.trailOpacity
        const trailStart = Math.max(0, currentIdx - s.trailLength * 3)
        for (let i = trailStart; i <= currentIdx; i++) {
          const sp = proj(traj[i].x, traj[i].y, traj[i].z)
          if (i === trailStart) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y)
        }
        ctx.stroke()
        ctx.globalAlpha = 1

        // Ball — use style ball size and glow
        const pt = traj[currentIdx]
        const sp = proj(pt.x, pt.y, pt.z)
        const r = Math.max(2, Math.min(22, 0.121 * sp.scale)) * s.ballSize

        if (s.glowEnabled) {
          const glow = ctx.createRadialGradient(sp.x, sp.y, r * 0.2, sp.x, sp.y, r * 2)
          glow.addColorStop(0, pitch.color + 'aa')
          glow.addColorStop(1, pitch.color + '00')
          ctx.beginPath(); ctx.arc(sp.x, sp.y, r * 2, 0, Math.PI * 2)
          ctx.fillStyle = glow; ctx.fill()
        }

        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2)
        ctx.fillStyle = pitch.color; ctx.fill()

        // REF badge in tunnel mode
        if (isTunnel && isRef && t < 0.3) {
          const fontSize = Math.round(8 * s.fontScale)
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
          ctx.fillStyle = 'rgba(255,255,0,0.5)'
          ctx.fillText('REF', sp.x + r + 4, sp.y - 4)
        }

        // Landing dot + label at completion
        if (t >= 1) {
          const lp = traj[traj.length - 1]
          const ls = proj(lp.x, lp.y, lp.z)
          ctx.globalAlpha = 0.8
          ctx.beginPath(); ctx.arc(ls.x, ls.y, 5 * s.ballSize, 0, Math.PI * 2)
          ctx.fillStyle = pitch.color; ctx.fill()
          ctx.globalAlpha = 1
          if (s.showLegend) {
            const fontSize = Math.round(10 * s.fontScale)
            ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
            ctx.fillStyle = pitch.color
            ctx.fillText(pitch.name, ls.x + 8, ls.y + 4)
          }
        }
      }

      // Tunnel divergence info (bottom-left)
      let infoY = cssH - 14
      if (isTunnel && s.showStatCallouts && allTrajectories.length >= 2 && t >= 1) {
        const refTraj = allTrajectories.find(a => a.isRef)
        if (refTraj) {
          for (const other of allTrajectories) {
            if (other.isRef) continue
            const t1 = refTraj.traj
            const t2 = other.traj
            const minLen = Math.min(t1.length, t2.length)
            for (let i = 0; i < minLen; i++) {
              const dist = Math.sqrt((t1[i].x - t2[i].x) ** 2 + (t1[i].z - t2[i].z) ** 2)
              if (dist > 1 / 12) {
                const fontSize = Math.round(10 * s.fontScale)
                ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
                ctx.fillStyle = other.pitch.color
                ctx.fillText(
                  `${other.pitch.name}: tunnel ${(t1[i].y - SZ_Y).toFixed(1)}ft from plate`,
                  16, infoY,
                )
                infoY -= 16
                break
              }
            }
          }
        }
      }

      // Pitch count
      const infoFontSize = Math.max(10, Math.round(cssH * 0.018 * s.fontScale))
      ctx.font = `${infoFontSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle = 'rgba(161,161,170,0.5)'
      ctx.fillText(`${currentPitches.length} pitch${currentPitches.length !== 1 ? 'es' : ''}`, 16, infoY)

      // Title/watermark from style
      if (s.titleOverride) {
        const titleSize = Math.round(14 * s.fontScale)
        ctx.font = `bold ${titleSize}px Inter, system-ui, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.textAlign = 'left'
        ctx.fillText(s.titleOverride, 16, 24)
      }
      if (s.subtitleText) {
        const subSize = Math.round(11 * s.fontScale)
        ctx.font = `${subSize}px Inter, system-ui, sans-serif`
        ctx.fillStyle = 'rgba(161,161,170,0.5)'
        ctx.textAlign = 'left'
        ctx.fillText(s.subtitleText, 16, s.titleOverride ? 42 : 24)
      }
      if (s.watermarkText) {
        const wmSize = Math.round(10 * s.fontScale)
        ctx.font = `${wmSize}px Inter, system-ui, sans-serif`
        ctx.fillStyle = 'rgba(161,161,170,0.2)'
        ctx.textAlign = 'right'
        ctx.fillText(s.watermarkText, cssW - 16, cssH - 8)
        ctx.textAlign = 'left'
      }

      // Mode + view label (top-right)
      const labelSize = Math.round(10 * s.fontScale)
      ctx.font = `${labelSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle = 'rgba(161,161,170,0.35)'
      const modeLabel = isTunnel ? 'Tunnel Mode' : 'Anti-Tunnel Mode'
      const viewLabel = view === 'catcher' ? 'Catcher View (+x \u2192 1B)' : view === 'pitcher' ? 'Pitcher View (+x \u2192 3B)' : '3D (drag to orbit)'
      ctx.textAlign = 'right'
      ctx.fillText(`${modeLabel}  \u00b7  ${viewLabel}`, cssW - 16, s.titleOverride || s.subtitleText ? 24 : 20)
      ctx.textAlign = 'left'

      ctx.restore()
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      mountedRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Scroll wheel zoom for 3D orbit ──────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handler = (e: WheelEvent) => {
      if (viewModeRef.current !== '3d') return
      e.preventDefault()
      orbitRef.current = {
        ...orbitRef.current,
        distance: Math.max(10, Math.min(80, orbitRef.current.distance + e.deltaY * 0.05)),
      }
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, [])

  // ── Target & orbit drag ────────────────────────────────────────────────

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas || !canvas.parentElement) return

    const rect = canvas.getBoundingClientRect()
    const cssW = canvas.parentElement.clientWidth
    const cssH = canvas.parentElement.clientHeight
    const view = viewModeRef.current
    const cam = view === '3d' ? getOrbitCamera(orbitRef.current) : CAMERAS[view]

    const tgt = project3D(targetXRef.current, SZ_Y, targetZRef.current, cam, cssW, cssH)
    const dx = e.clientX - rect.left - tgt.x
    const dy = e.clientY - rect.top - tgt.y

    if (Math.sqrt(dx * dx + dy * dy) < 24) {
      setIsDraggingTarget(true)
      const onMove = (ev: PointerEvent) => {
        const mx = ev.clientX - rect.left
        const my = ev.clientY - rect.top
        const activeCam = view === '3d' ? getOrbitCamera(orbitRef.current) : CAMERAS[view]
        const hit = unprojectToPlane(mx, my, activeCam, cssW, cssH, SZ_Y)
        if (hit) {
          setTargetX(Math.max(-1.5, Math.min(1.5, hit.x)))
          setTargetZ(Math.max(0.5, Math.min(4.5, hit.z)))
        }
      }
      const onUp = () => {
        setIsDraggingTarget(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    } else if (view === '3d') {
      setIsOrbiting(true)
      let lastX = e.clientX
      let lastY = e.clientY
      const onMove = (ev: PointerEvent) => {
        const moveX = ev.clientX - lastX
        const moveY = ev.clientY - lastY
        lastX = ev.clientX
        lastY = ev.clientY
        orbitRef.current = {
          ...orbitRef.current,
          azimuth: orbitRef.current.azimuth - moveX * 0.005,
          elevation: Math.max(-0.3, Math.min(1.45, orbitRef.current.elevation + moveY * 0.005)),
        }
      }
      const onUp = () => {
        setIsOrbiting(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: '#09090b' }}>
      {/* Top bar — pitcher search + season + simulate + export */}
      <div className="shrink-0 bg-zinc-900/80 border-b border-zinc-800 px-3 py-2 flex items-center gap-2 flex-wrap z-10">
        {/* Pitcher search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => { if (searchResults.length) setShowSearchDropdown(true) }}
            placeholder="Search pitcher..."
            className="w-48 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] text-white placeholder-zinc-600 focus:border-cyan-600 focus:outline-none"
          />
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
              {searchResults.map((p: any) => (
                <button key={p.pitcher} onClick={() => selectPitcher(p)}
                  className="w-full px-3 py-1.5 text-[11px] hover:bg-zinc-700 cursor-pointer flex justify-between text-left">
                  <span className="text-white">{p.player_name}</span>
                  <span className="text-zinc-500">{p.team}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Season selector */}
        {selectedPitcher && availableSeasons.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
              className="px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] text-zinc-300 hover:border-zinc-600 transition flex items-center gap-1.5"
            >
              <span>{selectedSeasons.length > 0 ? selectedSeasons.join(', ') : 'Select seasons'}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`transition-transform ${showSeasonDropdown ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showSeasonDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[120px] p-2">
                {availableSeasons.map(s => (
                  <label key={s} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-700 rounded cursor-pointer">
                    <input type="checkbox" checked={selectedSeasons.includes(s)}
                      onChange={() => toggleSeason(s)}
                      className="rounded border-zinc-600 bg-zinc-900 text-cyan-500 w-3 h-3" />
                    <span className={`text-[11px] ${selectedSeasons.includes(s) ? 'text-white' : 'text-zinc-400'}`}>{s}</span>
                  </label>
                ))}
                <div className="border-t border-zinc-700 mt-1 pt-1 flex gap-1">
                  <button onClick={() => setSelectedSeasons([...availableSeasons])}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1">All</button>
                  <button onClick={() => setSelectedSeasons([])}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1">None</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Simulate button */}
        {selectedPitcher && selectedSeasons.length > 0 && (
          <button onClick={simulate} disabled={simulating}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1.5">
            {simulating ? (
              <><div className="w-3 h-3 border-2 border-zinc-400 border-t-white rounded-full animate-spin" /> Loading...</>
            ) : 'Simulate'}
          </button>
        )}

        <div className="flex-1" />

        {/* Video export */}
        <button onClick={exportVideo} disabled={exporting}
          className="px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] text-zinc-300 hover:bg-zinc-700 hover:border-cyan-600/60 hover:text-cyan-300 disabled:opacity-40 transition font-medium">
          {exporting ? 'Recording...' : 'Export Video'}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex">
        {/* Left panel */}
        <div className="w-64 shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden bg-zinc-900/50">
          {/* Mode toggle */}
          <div className="px-3 py-2 border-b border-zinc-800 flex gap-1 shrink-0">
            <ToggleBtn label="Tunnel" active={tunnelMode} onClick={() => setTunnelMode(true)} />
            <ToggleBtn label="Anti-Tunnel" active={!tunnelMode} onClick={() => setTunnelMode(false)} />
          </div>

          {/* View toggle */}
          <div className="px-3 py-2 border-b border-zinc-800 flex gap-1 shrink-0">
            <ToggleBtn label="Catcher" active={viewMode === 'catcher'} onClick={() => setViewMode('catcher')} />
            <ToggleBtn label="Pitcher" active={viewMode === 'pitcher'} onClick={() => setViewMode('pitcher')} />
            <ToggleBtn label="3D" active={viewMode === '3d'} onClick={() => setViewMode('3d')} />
          </div>

          {/* Pitch header */}
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">Pitches</span>
            <div className="flex gap-1">
              {data.length > 0 && (
                <button onClick={importFromPlayer}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 transition px-1.5 py-0.5 rounded border border-cyan-600/30 hover:border-cyan-500/50">
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
                  <input type="text" value={p.name}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updatePitch(p.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-xs text-zinc-200 outline-none min-w-0" />
                  {tunnelMode && (
                    <button
                      onClick={e => { e.stopPropagation(); setReferencePitchId(p.id) }}
                      className={`text-[11px] shrink-0 transition ${referencePitchId === p.id ? 'text-yellow-400' : 'text-zinc-600 hover:text-yellow-400/60'}`}
                      title={referencePitchId === p.id ? 'Reference pitch (hits target)' : 'Set as reference'}
                    >{referencePitchId === p.id ? '\u2605' : '\u2606'}</button>
                  )}
                  {pitches.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); removePitch(p.id) }}
                      className="text-zinc-600 hover:text-red-400 transition text-xs shrink-0">&times;</button>
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
                    <span className="text-[8px] text-zinc-600 pl-14">&minus;3B / +1B (catcher view)</span>
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

          {/* Release point lock */}
          <div className="px-3 py-2 border-t border-zinc-800 shrink-0">
            <button
              onClick={() => {
                const next = !lockRelease
                setLockRelease(next)
                if (next && pitches.length > 1) {
                  const src = pitches[0]
                  setPitches(prev => prev.map(p => ({ ...p, releasePosX: src.releasePosX, releasePosZ: src.releasePosZ })))
                }
              }}
              className={`w-full text-[10px] py-1.5 rounded border transition font-medium
                ${lockRelease
                  ? 'bg-cyan-600/20 text-cyan-300 border-cyan-600/50'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'}`}
            >
              {lockRelease ? 'Release Point Locked' : 'Lock Release Points'}
            </button>
          </div>

          {/* Target controls */}
          <div className="px-3 py-2 border-t border-zinc-800 shrink-0 space-y-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              Target {tunnelMode && <span className="normal-case text-zinc-600">(ref pitch lands here)</span>}
            </span>
            <Field label="X" value={Math.round(targetX * 100) / 100} min={-1.5} max={1.5} step={0.05} unit="ft"
              onChange={v => setTargetX(v)} />
            <Field label="Z" value={Math.round(targetZ * 100) / 100} min={0.5} max={4.5} step={0.05} unit="ft"
              onChange={v => setTargetZ(v)} />
            <span className="text-[9px] text-zinc-600 block">Drag crosshair on canvas to move target</span>
          </div>
        </div>

        {/* Right panel: canvas + playback */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <canvas ref={canvasRef}
              style={{ display: 'block', cursor: isDraggingTarget || isOrbiting ? 'grabbing' : viewMode === '3d' ? 'grab' : 'default' }}
              onPointerDown={handleCanvasPointerDown}
              aria-label="Pitch simulation visualization" />
          </div>

          {/* Playback controls */}
          <div className="shrink-0 bg-zinc-900/80 border-t border-zinc-800 px-4 py-2 flex items-center gap-3"
            style={{ height: 40 }}>
            <button onClick={() => setPlaying(!playing)}
              className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 border border-zinc-700
                text-zinc-300 hover:text-white hover:border-zinc-600 transition"
              title={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <input type="range" min={0} max={1} step={0.005}
              value={playing ? scrubRef.current : scrubT}
              onChange={e => { const v = parseFloat(e.target.value); setScrubT(v); scrubRef.current = v; if (playing) setPlaying(false) }}
              className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400" />
            <button onClick={() => { setScrubT(0); scrubRef.current = 0; setPlaying(false) }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600">Start</button>
            <button onClick={() => { setScrubT(0.5); scrubRef.current = 0.5; setPlaying(false) }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600">Mid</button>
            <button onClick={() => { setScrubT(1); scrubRef.current = 1; setPlaying(false) }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-600">Plate</button>
            <span className="text-[10px] text-zinc-600 tabular-nums">{Math.round(scrubT * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
