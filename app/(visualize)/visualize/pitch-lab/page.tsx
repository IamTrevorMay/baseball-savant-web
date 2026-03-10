'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { PitchLabSceneHandle, AnnotationFlags } from '@/components/pitch-lab/PitchLabScene'
import PitchLabControls from '@/components/pitch-lab/PitchLabControls'
import { PitchKinematics } from '@/lib/trajectoryPhysics'
import { getPitchColor } from '@/components/chartConfig'
import { exportWebM, exportMP4 } from '@/components/pitch-lab/exportPitchVideo'

// Dynamic import to avoid SSR for Three.js
const PitchLabScene = dynamic(() => import('@/components/pitch-lab/PitchLabScene'), { ssr: false })

interface KinematicsRow {
  pitch_type: string
  pitch_name: string
  vx0: number; vy0: number; vz0: number
  ax: number; ay: number; az: number
  release_pos_x: number; release_pos_z: number
  release_extension: number
  avg_velo: number
  pitches: number
}

export default function PitchLabPage() {
  const router = useRouter()
  const sceneRef = useRef<PitchLabSceneHandle>(null)

  // Player state
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [pitchTypes, setPitchTypes] = useState<KinematicsRow[]>([])
  const [selectedPitchType, setSelectedPitchType] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Animation state
  const [animationProgress, setAnimationProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(0.25)
  const animFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  // Camera & annotations
  const [cameraPreset, setCameraPreset] = useState('catcher')
  const [annotations, setAnnotations] = useState<AnnotationFlags>({
    showVAA: false,
    showHAA: false,
    showMovement: false,
    showGhostBall: false,
  })

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)

  // Derived kinematics for selected pitch
  const selectedKinematics: PitchKinematics | null = (() => {
    const row = pitchTypes.find(p => p.pitch_type === selectedPitchType)
    if (!row) return null
    return {
      vx0: Number(row.vx0), vy0: Number(row.vy0), vz0: Number(row.vz0),
      ax: Number(row.ax), ay: Number(row.ay), az: Number(row.az),
      release_pos_x: Number(row.release_pos_x),
      release_pos_z: Number(row.release_pos_z),
      release_extension: Number(row.release_extension),
    }
  })()

  const pitchColor = selectedPitchType ? getPitchColor(selectedPitchType) : '#71717a'

  // Total animation duration: delivery ~1.5s + flight ~0.4s, scaled by speed
  const DELIVERY_DURATION = 1.5
  const FLIGHT_DURATION = 0.4
  const totalDuration = (DELIVERY_DURATION + FLIGHT_DURATION) / speed

  // Fetch kinematics when player changes
  useEffect(() => {
    if (!playerId) return
    setLoading(true)
    fetch(`/api/scene-stats?playerId=${playerId}&kinematics=true`)
      .then(r => r.json())
      .then(data => {
        const rows: KinematicsRow[] = data.kinematics || []
        setPitchTypes(rows)
        if (rows.length > 0) setSelectedPitchType(rows[0].pitch_type)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [playerId])

  // Animation loop
  useEffect(() => {
    if (!playing) return
    lastTimeRef.current = performance.now()

    function tick(now: number) {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      setAnimationProgress(prev => {
        const next = prev + dt / totalDuration
        if (next >= 1) {
          setPlaying(false)
          return 1
        }
        return next
      })
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [playing, totalDuration])

  const handlePlay = useCallback(() => {
    if (animationProgress >= 1) setAnimationProgress(0)
    setPlaying(true)
  }, [animationProgress])

  const handlePause = useCallback(() => {
    setPlaying(false)
  }, [])

  const handleSelectPlayer = useCallback((id: number, name: string) => {
    setPlayerId(id)
    setPlayerName(name)
    setAnimationProgress(0)
    setPlaying(false)
    setSelectedPitchType(null)
    setPitchTypes([])
  }, [])

  const handleSelectPitchType = useCallback((pt: string) => {
    setSelectedPitchType(pt)
    setAnimationProgress(0)
    setPlaying(false)
  }, [])

  const handleExport = useCallback(async (format: 'webm' | 'mp4') => {
    const handle = sceneRef.current
    if (!handle) return
    setExporting(true)
    setExportProgress(0)

    const opts = {
      gl: handle.gl,
      scene: handle.scene,
      camera: handle.camera,
      totalDuration,
      fps: 30,
      setProgress: setAnimationProgress,
      onProgress: setExportProgress,
    }

    try {
      if (format === 'webm') await exportWebM(opts)
      else await exportMP4(opts)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
      setExportProgress(0)
    }
  }, [totalDuration])

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <button
          onClick={() => router.push('/visualize')}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          &larr; Back
        </button>
        <h1 className="text-sm font-semibold text-zinc-100">Pitch Lab</h1>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/20 uppercase tracking-wide font-medium">
          3D
        </span>
        {loading && (
          <div className="ml-2 w-3 h-3 border-2 border-zinc-600 border-t-amber-400 rounded-full animate-spin" />
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <PitchLabControls
          playerName={playerName}
          pitchTypes={pitchTypes}
          selectedPitchType={selectedPitchType}
          onSelectPlayer={handleSelectPlayer}
          onSelectPitchType={handleSelectPitchType}
          cameraPreset={cameraPreset}
          onCameraPreset={setCameraPreset}
          annotations={annotations}
          onAnnotations={setAnnotations}
          speed={speed}
          onSpeed={setSpeed}
          exporting={exporting}
          exportProgress={exportProgress}
          onExport={handleExport}
        />

        {/* 3D Canvas */}
        <div className="flex-1 relative">
          <PitchLabScene
            ref={sceneRef}
            kinematics={selectedKinematics}
            animationProgress={animationProgress}
            pitchColor={pitchColor}
            cameraPreset={cameraPreset}
            annotations={annotations}
          />

          {/* Empty state */}
          {!selectedKinematics && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-zinc-600">
                {!playerId ? 'Select a player to begin' : 'Select a pitch type'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom transport bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-zinc-800 bg-zinc-900/80">
        {/* Play/Pause button */}
        <button
          onClick={playing ? handlePause : handlePlay}
          disabled={!selectedKinematics}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {playing ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Progress scrubber */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={animationProgress}
          onChange={e => {
            setPlaying(false)
            setAnimationProgress(parseFloat(e.target.value))
          }}
          className="flex-1 accent-amber-500 h-1"
        />

        {/* Speed indicator */}
        <span className="text-[10px] text-zinc-500 font-mono w-12 text-right">
          {speed}x
        </span>

        {/* Progress percentage */}
        <span className="text-[10px] text-zinc-600 font-mono w-10 text-right">
          {Math.round(animationProgress * 100)}%
        </span>
      </div>
    </div>
  )
}
