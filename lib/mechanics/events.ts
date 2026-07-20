// Event detection — find the three canonical pitching frames per throw.
//
//   foot contact → max external rotation (MER) → release
//
// The window foot-contact→release contains 100% of the injurious peak loads, so
// every downstream metric is measured relative to these frames. Detectors operate on
// canonical joint trajectories and are assumption-light: they key off throwing
// handedness and a configurable up-axis, and report a confidence that gates whether
// the throw counts toward the session median.

import type { CanonicalCapture, EventFrames, JointKey, ThrowWindow, Vec3 } from './types'

export type UpAxis = 'x' | 'y' | 'z'
export type Hand = 'R' | 'L'

const up = (v: Vec3, axis: UpAxis) => v[axis]

/** Central-difference speed (mm/frame) of a trajectory; 0 where samples missing. */
function speed(traj: (Vec3 | null)[], f: number): number {
  const a = traj[f - 1], b = traj[f + 1]
  if (!a || !b) return 0
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  return Math.hypot(dx, dy, dz) / 2
}

function vertVelocity(traj: (Vec3 | null)[], f: number, axis: UpAxis): number {
  const a = traj[f - 1], b = traj[f + 1]
  if (!a || !b) return 0
  return (up(b, axis) - up(a, axis)) / 2
}

function firstValid(traj: (Vec3 | null)[], from: number, to: number): Vec3 | null {
  for (let i = from; i <= to; i++) if (traj[i]) return traj[i]
  return null
}

/**
 * Detect foot-contact / MER / release for one throw window.
 *
 * - release: peak linear speed of the throwing hand (ball-out proxy, no ball marker)
 * - foot contact: lead ankle plant — vertical velocity crosses ~0 after descending,
 *   searched in the pre-release stride window
 * - MER: max layback — the throwing hand's most-posterior point before it whips
 *   forward, in the window between foot contact and release
 */
export function detectEvents(
  capture: CanonicalCapture,
  window: ThrowWindow,
  hand: Hand,
  upAxis: UpAxis = 'z',
): EventFrames {
  const throwHand: JointKey = hand === 'R' ? 'hand_r' : 'hand_l'
  const leadAnkle: JointKey = hand === 'R' ? 'ankle_l' : 'ankle_r'   // RHP strides w/ left leg
  const shoulder: JointKey = hand === 'R' ? 'shoulder_r' : 'shoulder_l'

  const handTraj = capture.joints[throwHand]
  const ankleTraj = capture.joints[leadAnkle]
  const shoulderTraj = capture.joints[shoulder]

  const s = Math.max(window.startFrame + 1, 1)
  const e = Math.min(window.endFrame - 1, capture.frameCount - 2)

  // ── release: argmax hand speed ──
  let release = s, maxSpeed = -1
  for (let f = s; f <= e; f++) {
    const sp = speed(handTraj, f)
    if (sp > maxSpeed) { maxSpeed = sp; release = f }
  }

  // ── foot contact: lead-ankle plant before release ──
  // Scan back from release; find where vertical velocity settles near zero after the
  // ankle has descended (stride foot landing). Fall back to 55% into the window.
  let footContact = s + Math.round((release - s) * 0.55)
  let bestPlant = Infinity
  const plantSearchStart = s + Math.round((release - s) * 0.25)
  for (let f = plantSearchStart; f < release; f++) {
    const vv = Math.abs(vertVelocity(ankleTraj, f, upAxis))
    const height = ankleTraj[f] ? up(ankleTraj[f]!, upAxis) : Infinity
    // prefer low vertical velocity AND low height (foot down)
    const score = vv + Math.max(0, height) * 0.01
    if (score < bestPlant) { bestPlant = score; footContact = f }
  }

  // ── MER: max layback — hand most posterior relative to shoulder before release ──
  // Posterior = away from the target. Approximate target direction as pelvis travel;
  // use hand-minus-shoulder projection onto that axis, minimized (deepest layback).
  const pelvis = capture.joints.pelvis
  const pStart = firstValid(pelvis, s, e)
  const pEnd = firstValid(pelvis, release, e) || firstValid(pelvis, s, e)
  let dir = { x: 1, y: 0, z: 0 }
  if (pStart && pEnd) {
    const dvec = { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y, z: pEnd.z - pStart.z }
    // zero out the up component — target direction is horizontal
    ;(dvec as any)[upAxis] = 0
    const mag = Math.hypot(dvec.x, dvec.y, dvec.z) || 1
    dir = { x: dvec.x / mag, y: dvec.y / mag, z: dvec.z / mag }
  }
  let mer = Math.round((footContact + release) / 2), minProj = Infinity
  for (let f = footContact; f <= release; f++) {
    const h = handTraj[f], sh = shoulderTraj[f]
    if (!h || !sh) continue
    const proj = (h.x - sh.x) * dir.x + (h.y - sh.y) * dir.y + (h.z - sh.z) * dir.z
    if (proj < minProj) { minProj = proj; mer = f }
  }

  // ── confidence: ordering sanity + data completeness ──
  const ordered = footContact < mer && mer < release
  const validFrac = countValid(handTraj, s, e) / Math.max(1, e - s)
  const confidence = (ordered ? 0.6 : 0.2) + 0.4 * validFrac

  return { footContact, maxExternalRotation: mer, release, confidence }
}

function countValid(traj: (Vec3 | null)[], from: number, to: number): number {
  let n = 0
  for (let i = from; i <= to; i++) if (traj[i]) n++
  return n
}

/**
 * Segment a full session capture into individual throw windows.
 * Throws are separated by low-motion gaps in the throwing hand: a throw is a burst of
 * hand speed above a threshold, bracketed by quiet frames.
 */
export function segmentThrows(capture: CanonicalCapture, hand: Hand, minGapFrames = 30): ThrowWindow[] {
  const throwHand: JointKey = hand === 'R' ? 'hand_r' : 'hand_l'
  const traj = capture.joints[throwHand]
  const n = capture.frameCount
  const sp: number[] = []
  for (let f = 0; f < n; f++) sp.push(speed(traj, f))

  const peak = Math.max(...sp, 0)
  if (peak <= 0) return [{ throwNo: 1, startFrame: 0, endFrame: n - 1 }]
  const active = peak * 0.25    // hand is "throwing" above 25% of peak speed

  const windows: ThrowWindow[] = []
  let inThrow = false, start = 0, quiet = 0, throwNo = 0
  for (let f = 0; f < n; f++) {
    if (sp[f] > active) {
      if (!inThrow) { inThrow = true; start = f; throwNo++ }
      quiet = 0
    } else if (inThrow) {
      quiet++
      if (quiet >= minGapFrames) {
        windows.push({ throwNo, startFrame: Math.max(0, start - 60), endFrame: f })
        inThrow = false
      }
    }
  }
  if (inThrow) windows.push({ throwNo, startFrame: Math.max(0, start - 60), endFrame: n - 1 })
  return windows.length ? windows : [{ throwNo: 1, startFrame: 0, endFrame: n - 1 }]
}
