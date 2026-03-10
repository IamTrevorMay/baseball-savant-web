'use client'
import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import { PitchKinematics, computeTrajectory, TrajectoryPoint } from '@/lib/trajectoryPhysics'

interface AnnotationFlags {
  showVAA: boolean
  showHAA: boolean
  showMovement: boolean
  showGhostBall: boolean
}

interface Props {
  kinematics: PitchKinematics | null
  annotations: AnnotationFlags
  progress: number
  pitchColor: string
}

const PLATE_FRONT_Y = 17 / 12

function computeVAA(k: PitchKinematics): number {
  const t = (-k.vy0 - Math.sqrt(k.vy0 * k.vy0 - 2 * k.ay * (50 - k.release_extension))) / k.ay
  const vzf = k.vz0 + k.az * t
  const vyf = k.vy0 + k.ay * t
  return Math.atan2(vzf, -vyf) * (180 / Math.PI)
}

function computeHAA(k: PitchKinematics): number {
  const t = (-k.vy0 - Math.sqrt(k.vy0 * k.vy0 - 2 * k.ay * (50 - k.release_extension))) / k.ay
  const vxf = k.vx0 + k.ax * t
  const vyf = k.vy0 + k.ay * t
  return Math.atan2(vxf, -vyf) * (180 / Math.PI)
}

export default function Annotations({ kinematics, annotations, progress, pitchColor }: Props) {
  const trajectory = useMemo<TrajectoryPoint[]>(() => {
    if (!kinematics) return []
    return computeTrajectory(kinematics, 60)
  }, [kinematics])

  // Ghost ball trajectory (gravity only, no spin-induced movement)
  const ghostTrajectory = useMemo<TrajectoryPoint[]>(() => {
    if (!kinematics || !annotations.showGhostBall) return []
    return computeTrajectory({
      ...kinematics,
      ax: 0,
      az: -32.174,
    }, 60)
  }, [kinematics, annotations.showGhostBall])

  if (!kinematics || trajectory.length === 0) return null

  const releasePoint = trajectory[0]
  const platePoint = trajectory[trajectory.length - 1]
  const midIdx = Math.floor(trajectory.length / 2)
  const midPoint = trajectory[midIdx]

  const vaa = computeVAA(kinematics)
  const haa = computeHAA(kinematics)

  // Movement: compute from acceleration differences vs gravity-only
  const totalTime = trajectory[trajectory.length - 1]?.t || 0.4
  const pfx_x = 0.5 * kinematics.ax * totalTime * totalTime  // horizontal movement (feet)
  const pfx_z = 0.5 * (kinematics.az + 32.174) * totalTime * totalTime  // induced vertical break (feet)
  const pfx_x_in = pfx_x * 12
  const pfx_z_in = pfx_z * 12

  // Ghost ball flight progress
  const ghostPos = (() => {
    if (!annotations.showGhostBall || ghostTrajectory.length === 0 || progress < 0.65) return null
    const flightProgress = (progress - 0.65) / 0.35
    const idx = Math.min(flightProgress * (ghostTrajectory.length - 1), ghostTrajectory.length - 1)
    const i = Math.floor(idx)
    const frac = idx - i
    if (i >= ghostTrajectory.length - 1) {
      const last = ghostTrajectory[ghostTrajectory.length - 1]
      return [last.x, last.y, last.z] as const
    }
    const a = ghostTrajectory[i]
    const b = ghostTrajectory[i + 1]
    return [
      a.x + (b.x - a.x) * frac,
      a.y + (b.y - a.y) * frac,
      a.z + (b.z - a.z) * frac,
    ] as const
  })()

  return (
    <group>
      {/* VAA line: release to plate in y-z plane */}
      {annotations.showVAA && (
        <group>
          <Line
            points={[
              [releasePoint.x, releasePoint.y, releasePoint.z],
              [releasePoint.x, PLATE_FRONT_Y, platePoint.z],
            ]}
            color="#fbbf24"
            lineWidth={1.5}
            transparent
            opacity={0.7}
            dashed
            dashSize={0.5}
            gapSize={0.3}
          />
          <Text
            position={[
              releasePoint.x - 0.8,
              (releasePoint.y + PLATE_FRONT_Y) / 2,
              (releasePoint.z + platePoint.z) / 2 + 0.3,
            ]}
            fontSize={0.4}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
          >
            {`VAA: ${vaa.toFixed(1)}°`}
          </Text>
        </group>
      )}

      {/* HAA line: release to plate in x-y plane */}
      {annotations.showHAA && (
        <group>
          <Line
            points={[
              [releasePoint.x, releasePoint.y, releasePoint.z],
              [platePoint.x, PLATE_FRONT_Y, releasePoint.z],
            ]}
            color="#38bdf8"
            lineWidth={1.5}
            transparent
            opacity={0.7}
            dashed
            dashSize={0.5}
            gapSize={0.3}
          />
          <Text
            position={[
              (releasePoint.x + platePoint.x) / 2,
              (releasePoint.y + PLATE_FRONT_Y) / 2,
              releasePoint.z + 0.5,
            ]}
            fontSize={0.4}
            color="#38bdf8"
            anchorX="center"
            anchorY="middle"
          >
            {`HAA: ${haa.toFixed(1)}°`}
          </Text>
        </group>
      )}

      {/* Movement arrows at trajectory midpoint */}
      {annotations.showMovement && (
        <group>
          {/* Horizontal break arrow */}
          <Line
            points={[
              [midPoint.x, midPoint.y, midPoint.z],
              [midPoint.x + pfx_x * 3, midPoint.y, midPoint.z],
            ]}
            color="#f87171"
            lineWidth={2}
          />
          <Text
            position={[midPoint.x + pfx_x * 3 + 0.3, midPoint.y, midPoint.z + 0.2]}
            fontSize={0.35}
            color="#f87171"
            anchorX="left"
            anchorY="middle"
          >
            {`HB: ${pfx_x_in.toFixed(1)} in`}
          </Text>

          {/* Induced vertical break arrow */}
          <Line
            points={[
              [midPoint.x, midPoint.y, midPoint.z],
              [midPoint.x, midPoint.y, midPoint.z + pfx_z * 3],
            ]}
            color="#34d399"
            lineWidth={2}
          />
          <Text
            position={[midPoint.x + 0.3, midPoint.y, midPoint.z + pfx_z * 3 + 0.2]}
            fontSize={0.35}
            color="#34d399"
            anchorX="left"
            anchorY="middle"
          >
            {`IVB: ${pfx_z_in.toFixed(1)} in`}
          </Text>
        </group>
      )}

      {/* Ghost ball (gravity only) */}
      {annotations.showGhostBall && ghostPos && (
        <mesh position={[ghostPos[0], ghostPos[1], ghostPos[2]]}>
          <sphereGeometry args={[0.121, 12, 12]} />
          <meshStandardMaterial transparent opacity={0.2} color="white" />
        </mesh>
      )}
    </group>
  )
}
