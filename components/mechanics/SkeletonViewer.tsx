'use client'

// Capture reviewer — plays back the skeleton the metric engine actually measured.
//
// The raw C3D is fetched through a short-lived signed URL and parsed in the browser
// with the same `parseC3D` + `mapCapturyToCanonical` the ingest route runs, so what you
// watch is the geometry the numbers came from. If a capture looks wrong here, the
// report is wrong — there is no second interpretation step to blame.
//
// Playback never goes through React state: a frame ref is advanced in useFrame and the
// buffers are mutated in place, so scrubbing 240 fps data doesn't re-render the tree.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

import { parseC3D } from '@/lib/mechanics/c3d'
import { mapCapturyToCanonical } from '@/lib/mechanics/captureSchema'
import { BONES, OVERLAYS, SEGMENT_COLOR, toScene, type Overlay } from '@/lib/mechanics/skeleton'
import type { CanonicalCapture, JointKey } from '@/lib/mechanics/types'
import { JOINT_KEYS } from '@/lib/mechanics/types'
import type { Hand } from '@/lib/mechanics/events'
import KinematicSequence from './KinematicSequence'

// ── types ─────────────────────────────────────────────────────────────────────
export interface ViewerThrow {
  throw_no: number
  frame_foot_contact: number | null
  frame_mer: number | null
  frame_release: number | null
  event_confidence: number | null
  excluded?: boolean
}

interface Loaded { cap: CanonicalCapture; frameRate: number }

type Preset = 'side' | 'front' | 'top' | 'catcher'
type EventKey = 'footContact' | 'mer' | 'release'

const PAD_BEFORE = 72   // frames of run-up kept before foot contact (0.30 s @ 240)
const PAD_AFTER = 96    // follow-through kept after release (0.40 s @ 240)

// ── data loading ──────────────────────────────────────────────────────────────
async function loadCapture(captureId: string): Promise<Loaded> {
  const meta = await fetch(`/api/mechanics/captures/${captureId}/raw`).then(r => r.json())
  if (meta.error) throw new Error(meta.error)
  const buf = await fetch(meta.url).then(r => {
    if (!r.ok) throw new Error(`Could not download capture (${r.status})`)
    return r.arrayBuffer()
  })
  const c3d = parseC3D(buf)
  return { cap: mapCapturyToCanonical(c3d), frameRate: c3d.frameRate || 240 }
}

// ── skeleton figure ───────────────────────────────────────────────────────────
function Figure({
  loaded, hand, frameRef, ghost, offsetRef,
}: {
  loaded: Loaded
  hand: Hand
  frameRef: React.MutableRefObject<number>
  ghost?: boolean
  /** ghost only: added to the live frame so both figures sit at the same event */
  offsetRef?: React.MutableRefObject<number>
}) {
  const lines = useRef<THREE.LineSegments>(null)
  const joints = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(BONES.length * 6)
    const col = new Float32Array(BONES.length * 6)
    const c = new THREE.Color()
    BONES.forEach((b, i) => {
      c.set(SEGMENT_COLOR[b.segment(hand)])
      if (ghost) c.multiplyScalar(0.42)
      for (let v = 0; v < 2; v++) {
        col[i * 6 + v * 3] = c.r; col[i * 6 + v * 3 + 1] = c.g; col[i * 6 + v * 3 + 2] = c.b
      }
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [hand, ghost])

  useEffect(() => () => geom.dispose(), [geom])

  useFrame(() => {
    const { cap } = loaded
    let f = Math.round(frameRef.current + (offsetRef?.current ?? 0))
    f = Math.max(0, Math.min(cap.frameCount - 1, f))

    const pos = geom.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    BONES.forEach((b, i) => {
      const a = cap.joints[b.a]?.[f], d = cap.joints[b.b]?.[f]
      if (!a || !d) {
        // Occluded sample — collapse to a degenerate segment rather than drawing a
        // bone to the origin, which reads as a limb shooting through the floor.
        arr.fill(0, i * 6, i * 6 + 6)
        return
      }
      const [ax, ay, az] = toScene(a), [bx, by, bz] = toScene(d)
      arr[i * 6] = ax; arr[i * 6 + 1] = ay; arr[i * 6 + 2] = az
      arr[i * 6 + 3] = bx; arr[i * 6 + 4] = by; arr[i * 6 + 5] = bz
    })
    pos.needsUpdate = true

    if (joints.current) {
      JOINT_KEYS.forEach((k: JointKey, i) => {
        const p = cap.joints[k]?.[f]
        if (!p) { dummy.position.set(0, -99, 0) } else { dummy.position.set(...toScene(p)) }
        dummy.updateMatrix()
        joints.current!.setMatrixAt(i, dummy.matrix)
      })
      joints.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <lineSegments ref={lines} geometry={geom}>
        <lineBasicMaterial vertexColors transparent opacity={ghost ? 0.5 : 1} />
      </lineSegments>
      <instancedMesh ref={joints} args={[undefined, undefined, JOINT_KEYS.length]}>
        <sphereGeometry args={[ghost ? 0.018 : 0.024, 10, 10]} />
        <meshStandardMaterial
          color={ghost ? '#3f3f46' : '#e4e4e7'}
          transparent opacity={ghost ? 0.5 : 1} roughness={0.6}
        />
      </instancedMesh>
    </group>
  )
}

// ── measurement overlays ──────────────────────────────────────────────────────
function OverlayLines({
  loaded, hand, frameRef, enabled, events,
}: {
  loaded: Loaded
  hand: Hand
  frameRef: React.MutableRefObject<number>
  enabled: Set<string>
  events: Record<EventKey, number>
}) {
  const active = useMemo(() => OVERLAYS.filter(o => enabled.has(o.key)), [enabled])

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(OVERLAYS.length * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(OVERLAYS.length * 6), 3))
    return g
  }, [])
  useEffect(() => () => geom.dispose(), [geom])

  useFrame(() => {
    const { cap } = loaded
    const f = Math.max(0, Math.min(cap.frameCount - 1, Math.round(frameRef.current)))
    const pos = geom.getAttribute('position') as THREE.BufferAttribute
    const col = geom.getAttribute('color') as THREE.BufferAttribute
    const pa = pos.array as Float32Array, ca = col.array as Float32Array
    const c = new THREE.Color()

    OVERLAYS.forEach((o: Overlay, i) => {
      const on = active.includes(o)
      const pts = on ? o.points(cap, f, hand) : null
      if (!pts) { pa.fill(0, i * 6, i * 6 + 6); return }
      const [a, b] = pts
      const [ax, ay, az] = toScene(a), [bx, by, bz] = toScene(b)
      pa[i * 6] = ax; pa[i * 6 + 1] = ay; pa[i * 6 + 2] = az
      pa[i * 6 + 3] = bx; pa[i * 6 + 4] = by; pa[i * 6 + 5] = bz

      // Full brightness only near the frame the metric is sampled at — a dim line means
      // "this is the right geometry, but not the frame the number came from".
      const evFrame = o.at === 'any' ? f : events[o.at as EventKey]
      const near = o.at === 'any' || Math.abs(f - evFrame) <= 3
      c.set(o.color).multiplyScalar(near ? 1 : 0.3)
      for (let v = 0; v < 2; v++) {
        ca[i * 6 + v * 3] = c.r; ca[i * 6 + v * 3 + 1] = c.g; ca[i * 6 + v * 3 + 2] = c.b
      }
    })
    pos.needsUpdate = true
    col.needsUpdate = true
  })

  return (
    <lineSegments geometry={geom} renderOrder={2}>
      <lineBasicMaterial vertexColors linewidth={2} depthTest={false} transparent />
    </lineSegments>
  )
}

// ── playback clock ────────────────────────────────────────────────────────────
function Clock({
  frameRef, playingRef, speedRef, fps, win, onTick,
}: {
  frameRef: React.MutableRefObject<number>
  playingRef: React.MutableRefObject<boolean>
  speedRef: React.MutableRefObject<number>
  fps: number
  win: { start: number; end: number }
  onTick: (f: number) => void
}) {
  useFrame((_, dt) => {
    if (playingRef.current) {
      frameRef.current += dt * fps * speedRef.current
      if (frameRef.current > win.end) frameRef.current = win.start
    }
    onTick(frameRef.current)
  })
  return null
}

// ── camera ────────────────────────────────────────────────────────────────────
function CameraRig({ preset, focus }: { preset: Preset; focus: [number, number, number] }) {
  const { camera } = useThree()
  const controls = useThree(s => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null

  useEffect(() => {
    const [fx, fy, fz] = focus
    // The metrics are plane-specific, so the presets are the planes: a free camera makes
    // it far too easy to misjudge tilt or separation by eye.
    const d: Record<Preset, [number, number, number]> = {
      side: [4.2, 0.5, 0],      // open side — frontal plane (tilt, separation)
      front: [0, 0.6, 4.2],     // from behind the pitcher, down the target line
      catcher: [0, 0.6, -4.6],  // from the plate, looking back
      top: [0.01, 5.2, 0],      // overhead — transverse plane (rotation, sequencing)
    }
    const [dx, dy, dz] = d[preset]
    camera.position.set(fx + dx, fy + dy, fz + dz)
    if (controls) { controls.target.set(fx, fy, fz); controls.update() }
    camera.lookAt(fx, fy, fz)
  }, [preset, focus, camera, controls])

  return null
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function SkeletonViewer({
  captureId, athleteProfileId, captureDate, hand, throws, hasRaw,
}: {
  captureId: string
  athleteProfileId: string
  captureDate: string | null
  hand: Hand
  throws: ViewerThrow[]
  hasRaw: boolean
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [throwIdx, setThrowIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(0.25)
  const [preset, setPreset] = useState<Preset>('side')
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(['hipLine', 'shoulderLine', 'trunkAxis', 'trunkVertical']),
  )

  // ghost
  const [ghostOptions, setGhostOptions] = useState<Array<{ id: string; captureDate: string | null }>>([])
  const [ghostId, setGhostId] = useState('')
  // Tagged with the id it was fetched for, so a stale response can never paint over a
  // newer selection — cheaper and less error-prone than clearing state on every change.
  const [ghostData, setGhostData] = useState<{ id: string; loaded: Loaded; events: ViewerThrow | null } | null>(null)

  const frameRef = useRef(0)
  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  const ghostOffsetRef = useRef(0)
  const scrubRef = useRef<HTMLInputElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)

  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { speedRef.current = speed }, [speed])

  const usable = useMemo(
    () => throws.filter(t => t.frame_release != null).sort((a, b) => a.throw_no - b.throw_no),
    [throws],
  )
  const current = usable[Math.min(throwIdx, Math.max(0, usable.length - 1))]

  const events: Record<EventKey, number> = useMemo(() => ({
    footContact: current?.frame_foot_contact ?? 0,
    mer: current?.frame_mer ?? 0,
    release: current?.frame_release ?? 0,
  }), [current])

  const win = useMemo(() => {
    const total = loaded?.cap.frameCount ?? 1
    return {
      start: Math.max(0, events.footContact - PAD_BEFORE),
      end: Math.min(total - 1, events.release + PAD_AFTER),
    }
  }, [events, loaded])

  // Load the capture. The component is keyed by captureId at the call site, so there is
  // no stale state to clear here and nothing is set synchronously.
  useEffect(() => {
    if (!hasRaw) return
    let dead = false
    loadCapture(captureId)
      .then(l => { if (!dead) { frameRef.current = 0; setLoaded(l) } })
      .catch(e => { if (!dead) setError(String(e?.message ?? e)) })
    return () => { dead = true }
  }, [captureId, hasRaw])

  const busy = hasRaw && !loaded && !error

  // candidate ghosts: same athlete, different capture, raw file present
  useEffect(() => {
    fetch(`/api/mechanics/captures?athlete_id=${athleteProfileId}`)
      .then(r => r.json())
      .then((d: { captures?: Array<{ id: string; captureDate: string | null; hasRaw: boolean }> }) =>
        setGhostOptions(
          (d.captures ?? [])
            .filter(c => c.id !== captureId && c.hasRaw)
            .map(c => ({ id: c.id, captureDate: c.captureDate })),
        ))
      .catch(() => setGhostOptions([]))
  }, [athleteProfileId, captureId])

  // load ghost + its event frames
  useEffect(() => {
    if (!ghostId) return
    let dead = false
    Promise.all([
      loadCapture(ghostId),
      fetch(`/api/mechanics/captures/${ghostId}`).then(r => r.json()),
    ]).then(([l, d]: [Loaded, { throws?: ViewerThrow[] }]) => {
      if (dead) return
      const t = (d.throws ?? []).filter(x => x.frame_release != null)
      setGhostData({ id: ghostId, loaded: l, events: t[0] ?? null })
    }).catch(() => { /* ghost is optional — leave the previous selection alone */ })
    return () => { dead = true }
  }, [ghostId])

  const ghostActive = ghostData && ghostData.id === ghostId ? ghostData : null
  const ghost = ghostActive?.loaded ?? null
  const ghostEvents = ghostActive?.events ?? null

  // Align the ghost at foot contact, so the two deliveries are compared at the same
  // phase rather than the same elapsed time — stride durations differ between sessions.
  const ghostOffset = useMemo(() => (
    ghostEvents?.frame_foot_contact != null ? ghostEvents.frame_foot_contact - events.footContact : 0
  ), [ghostEvents, events.footContact])
  useEffect(() => { ghostOffsetRef.current = ghostOffset }, [ghostOffset])

  // snap to a window start whenever the throw changes
  useEffect(() => { frameRef.current = win.start }, [win.start])

  const focus = useMemo((): [number, number, number] => {
    if (!loaded) return [0, 1, 0]
    const p = loaded.cap.joints.pelvis?.[events.footContact]
    if (!p) return [0, 1, 0]
    const [x, y, z] = toScene(p)
    return [x, Math.max(0.7, y), z]
  }, [loaded, events.footContact])

  const onTick = useCallback((f: number) => {
    if (scrubRef.current && document.activeElement !== scrubRef.current) {
      scrubRef.current.value = String(Math.round(f))
    }
    if (readoutRef.current && loaded) {
      const rel = Math.round(f) - events.footContact
      readoutRef.current.textContent =
        `f${Math.round(f)}  ${(rel / loaded.frameRate * 1000).toFixed(0)}ms from FC`
    }
  }, [events.footContact, loaded])

  const jump = (k: EventKey) => { frameRef.current = events[k]; setPlaying(false) }
  const step = (d: number) => {
    frameRef.current = Math.max(win.start, Math.min(win.end, frameRef.current + d))
    setPlaying(false)
  }
  const toggleOverlay = (k: string) => setEnabled(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  // ── states with nothing to render ──
  if (!hasRaw) {
    return (
      <Shell>
        <p className="text-sm text-zinc-400">
          This capture has no raw C3D to replay. It was seeded directly into the database by
          <code className="mx-1 text-zinc-300">seed-mechanics-demo.ts</code>, which writes metrics
          without a source file.
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Upload a capture through <span className="text-zinc-400">+ New Capture</span> to review it here.
        </p>
      </Shell>
    )
  }
  if (error) {
    return <Shell><p className="text-sm text-rose-300">{error}</p></Shell>
  }
  if (busy || !loaded || !current) {
    return <Shell><p className="text-sm text-zinc-400">{busy ? 'Loading capture…' : 'No throws with a detected release.'}</p></Shell>
  }

  const conf = current.event_confidence ?? 1

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">Capture Review</h3>
        <div className="flex items-center gap-2 text-[11px]">
          {(['side', 'catcher', 'front', 'top'] as Preset[]).map(p => (
            <button key={p} onClick={() => setPreset(p)}
              className={`px-2 py-1 rounded-md capitalize transition ${
                preset === p ? 'bg-blue-500/25 text-blue-200' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[420px] bg-zinc-950">
        <Canvas camera={{ fov: 32, position: [4.2, 1.4, 0], near: 0.05, far: 100 }} dpr={[1, 2]}>
          <Clock frameRef={frameRef} playingRef={playingRef} speedRef={speedRef}
            fps={loaded.frameRate} win={win} onTick={onTick} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[3, 6, 2]} intensity={1.1} />
          <Grid args={[14, 14]} cellSize={0.5} cellColor="#27272a" sectionSize={3}
            sectionColor="#3f3f46" fadeDistance={22} infiniteGrid position={[0, 0, 0]} />
          {ghost && <Figure loaded={ghost} hand={hand} frameRef={frameRef} ghost offsetRef={ghostOffsetRef} />}
          <Figure loaded={loaded} hand={hand} frameRef={frameRef} />
          <OverlayLines loaded={loaded} hand={hand} frameRef={frameRef} enabled={enabled} events={events} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
          <CameraRig preset={preset} focus={focus} />
        </Canvas>
      </div>

      {/* transport */}
      <div className="px-4 py-3 border-t border-zinc-800 space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setPlaying(p => !p)}
            className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 text-xs w-16 transition">
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={() => step(-1)} className="px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700">−1</button>
          <button onClick={() => step(1)} className="px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700">+1</button>
          <input ref={scrubRef} type="range" min={win.start} max={win.end} defaultValue={win.start}
            onChange={e => { frameRef.current = Number(e.target.value); setPlaying(false) }}
            className="flex-1 accent-blue-400" />
          <span ref={readoutRef} className="text-[11px] text-zinc-500 tabular-nums w-36 text-right" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide mr-1">Snap</span>
          {([['footContact', 'Foot contact'], ['mer', 'MER'], ['release', 'Release']] as Array<[EventKey, string]>).map(([k, label]) => (
            <button key={k} onClick={() => jump(k)}
              className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-[11px] transition">
              {label} <span className="text-zinc-500 tabular-nums">f{events[k]}</span>
            </button>
          ))}
          <span className={`text-[11px] px-2 py-0.5 rounded-full ml-1 ${
            conf >= 0.8 ? 'bg-emerald-500/15 text-emerald-300'
              : conf >= 0.6 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
            conf {conf.toFixed(2)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <select value={throwIdx} onChange={e => setThrowIdx(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-200">
              {usable.map((t, i) => (
                <option key={t.throw_no} value={i}>
                  Throw {t.throw_no}{t.excluded ? ' (excluded)' : ''}
                </option>
              ))}
            </select>
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-200">
              {[0.1, 0.25, 0.5, 1].map(s => <option key={s} value={s}>{s}×</option>)}
            </select>
          </div>
        </div>

        {/* overlays + ghost */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/60">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide mr-1 mt-1.5">Overlays</span>
          {OVERLAYS.map(o => (
            <button key={o.key} onClick={() => toggleOverlay(o.key)} title={o.metric ?? o.label}
              className={`mt-1.5 px-2 py-1 rounded-md text-[11px] border transition ${
                enabled.has(o.key)
                  ? 'border-transparent text-zinc-900 font-medium'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
              style={enabled.has(o.key) ? { backgroundColor: o.color } : undefined}>
              {o.label}
            </button>
          ))}
          <div className="ml-auto mt-1.5 flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wide">Ghost</span>
            <select value={ghostId} onChange={e => setGhostId(e.target.value)}
              disabled={!ghostOptions.length}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-200 disabled:opacity-40">
              <option value="">{ghostOptions.length ? 'None' : 'No other captures'}</option>
              {ghostOptions.map(g => (
                <option key={g.id} value={g.id}>{g.captureDate ?? g.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
        </div>

        {ghost && (
          <p className="text-[11px] text-zinc-500">
            Ghost aligned at foot contact ({ghostOffset >= 0 ? '+' : ''}{ghostOffset} frames),
            comparing the same phase rather than the same elapsed time. Current session {captureDate ?? ''} in colour.
          </p>
        )}
      </div>

      <KinematicSequence
        cap={loaded.cap}
        events={{ ...events, maxExternalRotation: events.mer, confidence: conf }}
        hand={hand}
        window={win}
        frameRef={frameRef}
      />
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-2">Capture Review</h3>
      {children}
    </div>
  )
}
