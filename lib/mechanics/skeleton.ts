// Skeleton topology + measurement overlays for the capture reviewer.
//
// The canonical joint model is a bag of points; nothing in the pipeline needs to know
// which points connect, because every metric is computed from positions. A viewer does.
// This is the only place that knows, and it is pure so the athlete-facing renderer can
// share it later.
//
// The overlays matter more than the bones: they draw the exact lines metrics.ts takes
// its angles from, so a number and the picture either agree or visibly don't.

import type { CanonicalCapture, JointKey, Vec3 } from './types'
import type { Hand } from './events'

/** Which limb a bone belongs to — drives colour, so the throwing side reads at a glance. */
export type Segment = 'trunk' | 'throwArm' | 'gloveArm' | 'leadLeg' | 'driveLeg'

export interface Bone {
  a: JointKey
  b: JointKey
  /** resolved per-handedness, since "throwing arm" flips for a LHP */
  segment: (hand: Hand) => Segment
}

const trunk = () => 'trunk' as const
const rightArm = (h: Hand): Segment => (h === 'R' ? 'throwArm' : 'gloveArm')
const leftArm = (h: Hand): Segment => (h === 'R' ? 'gloveArm' : 'throwArm')
// A RHP strides with the left leg, so left is the lead leg for a righty.
const rightLeg = (h: Hand): Segment => (h === 'R' ? 'driveLeg' : 'leadLeg')
const leftLeg = (h: Hand): Segment => (h === 'R' ? 'leadLeg' : 'driveLeg')

export const BONES: Bone[] = [
  { a: 'pelvis', b: 'torso', segment: trunk },
  { a: 'torso', b: 'head', segment: trunk },
  { a: 'hip_r', b: 'hip_l', segment: trunk },
  { a: 'shoulder_r', b: 'shoulder_l', segment: trunk },
  { a: 'torso', b: 'shoulder_r', segment: trunk },
  { a: 'torso', b: 'shoulder_l', segment: trunk },
  { a: 'pelvis', b: 'hip_r', segment: trunk },
  { a: 'pelvis', b: 'hip_l', segment: trunk },

  { a: 'shoulder_r', b: 'elbow_r', segment: rightArm },
  { a: 'elbow_r', b: 'wrist_r', segment: rightArm },
  { a: 'wrist_r', b: 'hand_r', segment: rightArm },
  { a: 'shoulder_l', b: 'elbow_l', segment: leftArm },
  { a: 'elbow_l', b: 'wrist_l', segment: leftArm },
  { a: 'wrist_l', b: 'hand_l', segment: leftArm },

  { a: 'hip_r', b: 'knee_r', segment: rightLeg },
  { a: 'knee_r', b: 'ankle_r', segment: rightLeg },
  { a: 'ankle_r', b: 'foot_r', segment: rightLeg },
  { a: 'hip_l', b: 'knee_l', segment: leftLeg },
  { a: 'knee_l', b: 'ankle_l', segment: leftLeg },
  { a: 'ankle_l', b: 'foot_l', segment: leftLeg },
]

export const SEGMENT_COLOR: Record<Segment, string> = {
  trunk: '#64748b',      // slate
  throwArm: '#38bdf8',   // sky — the side the report is about
  gloveArm: '#475569',
  leadLeg: '#a78bfa',    // violet — blocks and transfers
  driveLeg: '#475569',
}

// ── measurement overlays ───────────────────────────────────────────────────────
// Each draws a line the metric engine actually uses. `at` restricts the overlay to the
// event frame the metric is sampled at, so nothing is shown at a frame where the
// corresponding number was never measured.

export type EventName = 'footContact' | 'mer' | 'release' | 'any'

export interface Overlay {
  key: string
  label: string
  color: string
  /** the metric this line is the geometry behind */
  metric?: string
  at: EventName
  /** endpoints in canonical space, or null when the joints are missing that frame */
  points: (cap: CanonicalCapture, frame: number, hand: Hand) => [Vec3, Vec3] | null
}

const j = (cap: CanonicalCapture, k: JointKey, f: number): Vec3 | null => cap.joints[k]?.[f] ?? null
const pair = (a: Vec3 | null, b: Vec3 | null): [Vec3, Vec3] | null => (a && b ? [a, b] : null)

export const OVERLAYS: Overlay[] = [
  {
    key: 'hipLine',
    label: 'Pelvis line',
    color: '#f59e0b',
    metric: 'lowerBody.pelvisRotation',
    at: 'any',
    points: (c, f) => pair(j(c, 'hip_r', f), j(c, 'hip_l', f)),
  },
  {
    key: 'shoulderLine',
    label: 'Shoulder line',
    color: '#22d3ee',
    metric: 'hipShoulderSep.maxSeparation',
    at: 'any',
    points: (c, f) => pair(j(c, 'shoulder_r', f), j(c, 'shoulder_l', f)),
  },
  {
    key: 'trunkAxis',
    label: 'Trunk axis',
    color: '#f472b6',
    metric: 'lowerBody.trunkLateralTilt',
    at: 'release',
    points: (c, f) => pair(j(c, 'pelvis', f), j(c, 'torso', f)),
  },
  {
    key: 'trunkVertical',
    label: 'Vertical reference',
    color: '#3f3f46',
    at: 'release',
    points: (c, f) => {
      const p = j(c, 'pelvis', f), t = j(c, 'torso', f)
      if (!p || !t) return null
      const len = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z)
      return [p, { x: p.x, y: p.y, z: p.z + len }]
    },
  },
  {
    key: 'stride',
    label: 'Stride (ankle→ankle)',
    color: '#34d399',
    metric: 'lowerBody.strideLengthPct',
    at: 'footContact',
    points: (c, f) => pair(j(c, 'ankle_l', f), j(c, 'ankle_r', f)),
  },
  {
    key: 'upperArm',
    label: 'Upper arm',
    color: '#fbbf24',
    metric: 'armAction.shoulderAbduction',
    at: 'footContact',
    points: (c, f, h) =>
      pair(j(c, h === 'R' ? 'shoulder_r' : 'shoulder_l', f), j(c, h === 'R' ? 'elbow_r' : 'elbow_l', f)),
  },
  {
    key: 'forearm',
    label: 'Forearm (layback)',
    color: '#fb7185',
    metric: 'outcome.maxExternalRotation',
    at: 'mer',
    points: (c, f, h) =>
      pair(j(c, h === 'R' ? 'elbow_r' : 'elbow_l', f), j(c, h === 'R' ? 'wrist_r' : 'wrist_l', f)),
  },
]

/**
 * A capture is Z-up in millimetres; three.js is Y-up in metres, and the pitcher should
 * stride away from a default camera. Every position crosses this one function.
 */
export function toScene(v: Vec3): [number, number, number] {
  return [v.x / 1000, v.z / 1000, -v.y / 1000]
}

/** Ground-plane centre of the delivery, so the camera can frame any capture. */
export function sceneFocus(cap: CanonicalCapture, frame: number): [number, number, number] {
  const p = cap.joints.pelvis?.[frame]
  if (!p) return [0, 1, 0]
  const [x, y, z] = toScene(p)
  return [x, Math.max(0.6, y), z]
}
