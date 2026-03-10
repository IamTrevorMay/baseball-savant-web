'use client'
import { useMemo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PitchKinematics } from '@/lib/trajectoryPhysics'

interface Props {
  kinematics: PitchKinematics | null
  progress: number // 0-1
  onHandPosition: (pos: THREE.Vector3) => void
}

const SKIN_COLOR = '#d4a574'

// Keyframe arm poses (progress → relative joint positions)
// Each keyframe defines elbow offset from shoulder, and hand offset from elbow
interface ArmPose {
  progress: number
  elbow: THREE.Vector3  // offset from shoulder
  hand: THREE.Vector3   // offset from elbow
}

function getArmKeyframes(releaseX: number, releaseY: number, releaseZ: number, shoulderPos: THREE.Vector3): ArmPose[] {
  // Offsets are relative to shoulder
  return [
    { // 0.0 - Cocking: arm raised behind, elbow high
      progress: 0,
      elbow: new THREE.Vector3(0.3, 0.4, 0.8),
      hand: new THREE.Vector3(0.1, 0.6, 0.3),
    },
    { // 0.15 - Leg lift / early cocking
      progress: 0.15,
      elbow: new THREE.Vector3(0.3, 0.3, 1.0),
      hand: new THREE.Vector3(0.15, 0.5, 0.5),
    },
    { // 0.3 - Max external rotation: arm back, forearm vertical
      progress: 0.3,
      elbow: new THREE.Vector3(0.4, 0.1, 0.7),
      hand: new THREE.Vector3(0.2, 0.3, 1.0),
    },
    { // 0.5 - Acceleration: arm whipping forward
      progress: 0.5,
      elbow: new THREE.Vector3(0.2, -0.5, 0.5),
      hand: new THREE.Vector3(0.1, -0.3, 0.6),
    },
    { // 0.63 - Release: hand at release point
      progress: 0.63,
      elbow: new THREE.Vector3(
        (releaseX - shoulderPos.x) * 0.5,
        (releaseY - shoulderPos.y) * 0.5,
        (releaseZ - shoulderPos.z) * 0.5 + 0.3,
      ),
      hand: new THREE.Vector3(
        (releaseX - shoulderPos.x) * 0.5,
        (releaseY - shoulderPos.y) * 0.5,
        (releaseZ - shoulderPos.z) * 0.5 - 0.3,
      ),
    },
    { // 0.75 - Follow-through start
      progress: 0.75,
      elbow: new THREE.Vector3(-0.1, -0.8, 0.0),
      hand: new THREE.Vector3(-0.1, -0.5, -0.5),
    },
    { // 1.0 - Follow-through complete
      progress: 1.0,
      elbow: new THREE.Vector3(-0.2, -0.6, -0.3),
      hand: new THREE.Vector3(-0.2, -0.4, -0.8),
    },
  ]
}

function interpolatePose(keyframes: ArmPose[], progress: number): { elbow: THREE.Vector3; hand: THREE.Vector3 } {
  const clampedP = Math.max(0, Math.min(1, progress))

  // Find surrounding keyframes
  let i = 0
  for (; i < keyframes.length - 1; i++) {
    if (keyframes[i + 1].progress >= clampedP) break
  }
  if (i >= keyframes.length - 1) i = keyframes.length - 2

  const a = keyframes[i]
  const b = keyframes[i + 1]
  const range = b.progress - a.progress
  const t = range > 0 ? (clampedP - a.progress) / range : 0

  // Smooth ease-in-out
  const eased = t * t * (3 - 2 * t)

  return {
    elbow: new THREE.Vector3().lerpVectors(a.elbow, b.elbow, eased),
    hand: new THREE.Vector3().lerpVectors(a.hand, b.hand, eased),
  }
}

/** Compute rotation quaternion to align a cylinder along a direction vector */
function alignCylinder(from: THREE.Vector3, to: THREE.Vector3): THREE.Euler {
  const dir = new THREE.Vector3().subVectors(to, from).normalize()
  // Cylinder default axis is Y; rotate to align with direction
  const quat = new THREE.Quaternion()
  quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  return new THREE.Euler().setFromQuaternion(quat)
}

export default function ArmModel({ kinematics, progress, onHandPosition }: Props) {
  const lastHandPos = useRef<THREE.Vector3>(new THREE.Vector3())

  const { shoulderPos, elbowPos, handPos } = useMemo(() => {
    if (!kinematics) {
      const def = new THREE.Vector3(0, 55, 5.5)
      return { shoulderPos: def, elbowPos: def.clone(), handPos: def.clone() }
    }

    const shoulder = new THREE.Vector3(
      kinematics.release_pos_x,
      50 - kinematics.release_extension + 2,
      kinematics.release_pos_z + 0.5,
    )

    const releaseX = kinematics.release_pos_x
    const releaseY = 50 - kinematics.release_extension
    const releaseZ = kinematics.release_pos_z

    const keyframes = getArmKeyframes(releaseX, releaseY, releaseZ, shoulder)
    const pose = interpolatePose(keyframes, progress)

    const elbow = shoulder.clone().add(pose.elbow)
    const hand = elbow.clone().add(pose.hand)

    return { shoulderPos: shoulder, elbowPos: elbow, handPos: hand }
  }, [kinematics, progress])

  // Report hand position to parent for ball tracking
  useEffect(() => {
    if (!handPos.equals(lastHandPos.current)) {
      lastHandPos.current.copy(handPos)
      onHandPosition(handPos.clone())
    }
  }, [handPos, onHandPosition])

  if (!kinematics) return null

  // Cylinder midpoints and lengths
  const upperMid = new THREE.Vector3().addVectors(shoulderPos, elbowPos).multiplyScalar(0.5)
  const upperLen = shoulderPos.distanceTo(elbowPos)
  const upperRot = alignCylinder(shoulderPos, elbowPos)

  const forearmMid = new THREE.Vector3().addVectors(elbowPos, handPos).multiplyScalar(0.5)
  const forearmLen = elbowPos.distanceTo(handPos)
  const forearmRot = alignCylinder(elbowPos, handPos)

  return (
    <group>
      {/* Shoulder joint */}
      <mesh position={shoulderPos}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} />
      </mesh>

      {/* Upper arm */}
      <mesh position={upperMid} rotation={upperRot}>
        <cylinderGeometry args={[0.08, 0.08, upperLen, 8]} />
        <meshStandardMaterial color={SKIN_COLOR} />
      </mesh>

      {/* Elbow joint */}
      <mesh position={elbowPos}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} />
      </mesh>

      {/* Forearm */}
      <mesh position={forearmMid} rotation={forearmRot}>
        <cylinderGeometry args={[0.06, 0.06, forearmLen, 8]} />
        <meshStandardMaterial color={SKIN_COLOR} />
      </mesh>

      {/* Hand */}
      <mesh position={handPos}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} />
      </mesh>
    </group>
  )
}
