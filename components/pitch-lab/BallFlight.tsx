'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { computeTrajectory, PitchKinematics, TrajectoryPoint } from '@/lib/trajectoryPhysics'

interface Props {
  kinematics: PitchKinematics | null
  progress: number        // 0-1 overall animation progress
  color: string
  handPosition: THREE.Vector3 | null  // from ArmModel during delivery phase
}

const RELEASE_PROGRESS = 0.63
const RELEASE_BLEND_END = 0.65
const BALL_RADIUS = 0.121 // baseball radius in feet (2.9" / 2 / 12)

export default function BallFlight({ kinematics, progress, color, handPosition }: Props) {
  const trajectory = useMemo<TrajectoryPoint[]>(() => {
    if (!kinematics) return []
    return computeTrajectory(kinematics, 60)
  }, [kinematics])

  const ballPosition = useMemo(() => {
    if (!kinematics) return null

    // Pre-release: follow hand
    if (progress < RELEASE_PROGRESS) {
      return handPosition
    }

    if (trajectory.length === 0) return null

    // Release blend (brief lerp from hand to first trajectory point)
    if (progress < RELEASE_BLEND_END && handPosition) {
      const blendT = (progress - RELEASE_PROGRESS) / (RELEASE_BLEND_END - RELEASE_PROGRESS)
      const first = trajectory[0]
      return new THREE.Vector3(
        THREE.MathUtils.lerp(handPosition.x, first.x, blendT),
        THREE.MathUtils.lerp(handPosition.y, first.y, blendT),
        THREE.MathUtils.lerp(handPosition.z, first.z, blendT),
      )
    }

    // Flight phase: interpolate along trajectory
    const flightProgress = (progress - RELEASE_BLEND_END) / (1 - RELEASE_BLEND_END)
    const idx = Math.min(flightProgress * (trajectory.length - 1), trajectory.length - 1)
    const i = Math.floor(idx)
    const frac = idx - i

    if (i >= trajectory.length - 1) {
      const last = trajectory[trajectory.length - 1]
      return new THREE.Vector3(last.x, last.y, last.z)
    }

    const a = trajectory[i]
    const b = trajectory[i + 1]
    return new THREE.Vector3(
      a.x + (b.x - a.x) * frac,
      a.y + (b.y - a.y) * frac,
      a.z + (b.z - a.z) * frac,
    )
  }, [kinematics, progress, trajectory, handPosition])

  // Trail: sample recent positions along trajectory
  const trailPoints = useMemo(() => {
    if (!trajectory.length || progress < RELEASE_BLEND_END) return []
    const flightProgress = (progress - RELEASE_BLEND_END) / (1 - RELEASE_BLEND_END)
    const currentIdx = Math.min(flightProgress * (trajectory.length - 1), trajectory.length - 1)
    const trailLength = 8
    const points: [number, number, number][] = []
    for (let i = Math.max(0, Math.floor(currentIdx) - trailLength); i <= Math.floor(currentIdx); i++) {
      const pt = trajectory[i]
      if (pt) points.push([pt.x, pt.y, pt.z])
    }
    if (ballPosition && points.length > 0) {
      points.push([ballPosition.x, ballPosition.y, ballPosition.z])
    }
    return points
  }, [trajectory, progress, ballPosition])

  if (!ballPosition) return null

  return (
    <group>
      {/* Baseball */}
      <mesh position={[ballPosition.x, ballPosition.y, ballPosition.z]}>
        <sphereGeometry args={[BALL_RADIUS, 16, 16]} />
        <meshStandardMaterial color="#f5f5f0" roughness={0.6} />
      </mesh>

      {/* Colored glow around ball */}
      <mesh position={[ballPosition.x, ballPosition.y, ballPosition.z]}>
        <sphereGeometry args={[BALL_RADIUS * 1.6, 12, 12]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} />
      </mesh>

      {/* Trail */}
      {trailPoints.length >= 2 && (
        <Line
          points={trailPoints}
          color={color}
          lineWidth={2}
          transparent
          opacity={0.5}
        />
      )}
    </group>
  )
}
