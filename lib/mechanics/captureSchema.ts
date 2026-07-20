// Capture mapper — Captury/OptiTrack marker labels → canonical joint model.
//
// Isolates Captury's naming (MotionBuilder/BVH-style: Hips, RightArm, RightForeArm…)
// from the rest of the pipeline, exactly as lib/compete/pitchSchema maps TrackMan's
// column names. Everything downstream speaks JointKey, never a Captury label.

import type { C3DResult } from './c3d'
import { JOINT_KEYS, type CanonicalCapture, type JointKey, type Trajectory, type Vec3 } from './types'

const norm = (s: string) => s.toLowerCase().replace(/[\s_:.\-]/g, '')

// Priority-ordered aliases per canonical joint. First match wins; sharing a label
// across joints (e.g. wrist≈hand when only RightHand exists) is acceptable.
const ALIASES: Record<JointKey, string[]> = {
  pelvis: ['hips', 'pelvis', 'root'],
  torso: ['spine3', 'spine2', 'chest', 'thorax', 'spine1', 'spine'],
  head: ['head', 'neck'],
  shoulder_r: ['rightarm', 'rightupperarm', 'rightshoulder', 'rshoulder'],
  shoulder_l: ['leftarm', 'leftupperarm', 'leftshoulder', 'lshoulder'],
  elbow_r: ['rightforearm', 'rightelbow', 'relbow'],
  elbow_l: ['leftforearm', 'leftelbow', 'lelbow'],
  wrist_r: ['rightwrist', 'righthand', 'rwrist'],
  wrist_l: ['leftwrist', 'lefthand', 'lwrist'],
  hand_r: ['righthandmiddle', 'righthandindex', 'righthand', 'rightfingers'],
  hand_l: ['lefthandmiddle', 'lefthandindex', 'lefthand', 'leftfingers'],
  hip_r: ['rightupleg', 'rightthigh', 'righthip', 'rhip'],
  hip_l: ['leftupleg', 'leftthigh', 'lefthip', 'lhip'],
  knee_r: ['rightleg', 'rightknee', 'rightshin', 'rknee'],
  knee_l: ['leftleg', 'leftknee', 'leftshin', 'lknee'],
  ankle_r: ['rightfoot', 'rightankle', 'rankle'],
  ankle_l: ['leftfoot', 'leftankle', 'lankle'],
  foot_r: ['righttoebase', 'righttoe', 'righttoes', 'rightfoot'],
  foot_l: ['lefttoebase', 'lefttoe', 'lefttoes', 'leftfoot'],
}

/** Find the label index best matching a canonical joint, or -1. */
function matchLabel(labels: string[], aliases: string[]): number {
  const normed = labels.map(norm)
  // exact normalized match first (by alias priority), then substring
  for (const a of aliases) {
    const i = normed.indexOf(a)
    if (i >= 0) return i
  }
  for (const a of aliases) {
    const i = normed.findIndex(l => l.includes(a))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Reduce a parsed C3D to the canonical joints the metric engine consumes.
 * Missing joints become all-null trajectories (metrics guard against nulls).
 */
export function mapCapturyToCanonical(c3d: C3DResult): CanonicalCapture {
  const empty = (): Trajectory => new Array(c3d.frameCount).fill(null)
  const joints = {} as Record<JointKey, Trajectory>
  const matched: Record<string, string> = {}

  for (const key of JOINT_KEYS) {
    const idx = matchLabel(c3d.labels, ALIASES[key])
    if (idx < 0) { joints[key] = empty(); continue }
    matched[key] = c3d.labels[idx]
    joints[key] = c3d.trajectories[idx].map(p =>
      p ? ({ x: p[0], y: p[1], z: p[2] } as Vec3) : null,
    )
  }

  return { frameRate: c3d.frameRate, frameCount: c3d.frameCount, joints }
}

/** Which canonical joints failed to map — for QC surfacing in the ingest response. */
export function unmappedJoints(c3d: C3DResult): JointKey[] {
  return JOINT_KEYS.filter(k => matchLabel(c3d.labels, ALIASES[k]) < 0)
}
