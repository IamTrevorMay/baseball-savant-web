'use client'
import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import StrikeZone3D from './StrikeZone3D'
import ArmModel from './ArmModel'
import BallFlight from './BallFlight'
import Annotations from './Annotations'
import { PitchKinematics } from '@/lib/trajectoryPhysics'

export interface AnnotationFlags {
  showVAA: boolean
  showHAA: boolean
  showMovement: boolean
  showGhostBall: boolean
}

// Camera preset positions in Statcast coords (before z-up → y-up rotation)
const CAMERA_PRESETS: Record<string, { position: [number, number, number]; lookAt: [number, number, number] }> = {
  catcher:   { position: [0, -5, 3],     lookAt: [0, 30, 4] },
  pitcher:   { position: [0, 55, 7],     lookAt: [0, 25, 3] },
  side:      { position: [-15, 25, 5],   lookAt: [0, 25, 3] },
  broadcast: { position: [8, -2, 12],    lookAt: [0, 30, 4] },
}

// Convert Statcast coords (x,y,z where z=up) to R3F world (x,y,z where y=up)
// This matches the group rotation={[-Math.PI/2, 0, 0]}
function statcastToWorld(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

function CameraController({ preset }: { preset: string }) {
  const { camera } = useThree()

  useEffect(() => {
    if (preset === 'orbit') return
    const cfg = CAMERA_PRESETS[preset]
    if (!cfg) return

    const pos = statcastToWorld(...cfg.position)
    const look = statcastToWorld(...cfg.lookAt)

    camera.position.set(pos[0], pos[1], pos[2])
    camera.lookAt(new THREE.Vector3(look[0], look[1], look[2]))
    camera.updateProjectionMatrix()
  }, [preset, camera])

  if (preset === 'orbit') {
    return <OrbitControls target={statcastToWorld(0, 25, 3) as unknown as THREE.Vector3} />
  }

  return null
}

export interface PitchLabSceneHandle {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
}

interface Props {
  kinematics: PitchKinematics | null
  animationProgress: number
  pitchColor: string
  cameraPreset: string
  annotations: AnnotationFlags
}

const PitchLabScene = forwardRef<PitchLabSceneHandle, Props>(function PitchLabScene(
  { kinematics, animationProgress, pitchColor, cameraPreset, annotations },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [handPosition, setHandPosition] = useState<THREE.Vector3 | null>(null)

  const handleHandPosition = useCallback((pos: THREE.Vector3) => {
    setHandPosition(pos)
  }, [])

  return (
    <Canvas
      ref={canvasRef}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ fov: 50, near: 0.1, far: 500 }}
      style={{ background: '#0a0a0a' }}
      onCreated={({ gl, scene, camera }) => {
        // Expose renderer internals via ref for video export
        if (ref && typeof ref === 'object') {
          (ref as any).current = { gl, scene, camera }
        }
      }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 8]} intensity={1} castShadow />
      <pointLight position={[-3, 30, 6]} intensity={0.6} />

      {/* z-up → y-up conversion: all children use Statcast coordinates */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <StrikeZone3D />
        <ArmModel
          kinematics={kinematics}
          progress={animationProgress}
          onHandPosition={handleHandPosition}
        />
        <BallFlight
          kinematics={kinematics}
          progress={animationProgress}
          color={pitchColor}
          handPosition={handPosition}
        />
        <Annotations
          kinematics={kinematics}
          annotations={annotations}
          progress={animationProgress}
          pitchColor={pitchColor}
        />
      </group>

      <CameraController preset={cameraPreset} />
    </Canvas>
  )
})

export default PitchLabScene
