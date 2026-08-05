// Canonical joints → a Captury/OptiTrack HIK marker set.
//
// The inverse of lib/mechanics/captureSchema.ts. Emitting real MotionBuilder joint
// names (rather than the canonical keys) is the point: it means the demo files
// exercise the alias table an actual Captury export has to survive.

import type { CanonicalCapture, JointKey, Vec3 } from '../../lib/mechanics/types'

const lerp = (a: Vec3, b: Vec3, u: number): Vec3 => ({
  x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u,
})

/** HIK joint name → how to derive it from the canonical model. */
type Derive = (j: Record<JointKey, Vec3>) => Vec3

export const MARKERS: Array<{ label: string; from: Derive }> = [
  { label: 'Hips', from: j => j.pelvis },
  { label: 'Spine', from: j => lerp(j.pelvis, j.torso, 0.33) },
  { label: 'Spine1', from: j => lerp(j.pelvis, j.torso, 0.66) },
  { label: 'Spine2', from: j => j.torso },
  { label: 'Neck', from: j => lerp(j.torso, j.head, 0.45) },
  { label: 'Head', from: j => j.head },
  // HIK's *Shoulder joint is the clavicle; *Arm is the glenohumeral joint, which is
  // what captureSchema maps to shoulder_r/shoulder_l.
  { label: 'LeftShoulder', from: j => lerp(j.torso, j.shoulder_l, 0.55) },
  { label: 'LeftArm', from: j => j.shoulder_l },
  { label: 'LeftForeArm', from: j => j.elbow_l },
  { label: 'LeftHand', from: j => j.wrist_l },
  { label: 'LeftHandMiddle1', from: j => j.hand_l },
  { label: 'RightShoulder', from: j => lerp(j.torso, j.shoulder_r, 0.55) },
  { label: 'RightArm', from: j => j.shoulder_r },
  { label: 'RightForeArm', from: j => j.elbow_r },
  { label: 'RightHand', from: j => j.wrist_r },
  { label: 'RightHandMiddle1', from: j => j.hand_r },
  { label: 'LeftUpLeg', from: j => j.hip_l },
  { label: 'LeftLeg', from: j => j.knee_l },
  { label: 'LeftFoot', from: j => j.ankle_l },
  { label: 'LeftToeBase', from: j => j.foot_l },
  { label: 'RightUpLeg', from: j => j.hip_r },
  { label: 'RightLeg', from: j => j.knee_r },
  { label: 'RightFoot', from: j => j.ankle_r },
  { label: 'RightToeBase', from: j => j.foot_r },
]

export const MARKER_LABELS = MARKERS.map(m => m.label)

/** Project a canonical capture onto the HIK marker set, ready for the C3D writer. */
export function toMarkerTrajectories(cap: CanonicalCapture): Array<Array<readonly [number, number, number]>> {
  return MARKERS.map(m => {
    const out: Array<readonly [number, number, number]> = []
    for (let f = 0; f < cap.frameCount; f++) {
      const j = {} as Record<JointKey, Vec3>
      for (const k of Object.keys(cap.joints) as JointKey[]) {
        j[k] = cap.joints[k][f] ?? { x: 0, y: 0, z: 0 }
      }
      const v = m.from(j)
      out.push([v.x, v.y, v.z] as const)
    }
    return out
  })
}
