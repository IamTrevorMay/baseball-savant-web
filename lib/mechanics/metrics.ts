// Metric extraction — compute the six Driveline report buckets from canonical
// trajectories at the detected event frames. Per-throw values are extracted here;
// the session value is the median across qualifying (non-excluded) throws, which
// defeats throw-to-throw kinematic noise.
//
// Geometry is best-effort from marker positions. Rotational-shoulder metrics are
// approximations and are tagged directional (markerless caveat) — never presented
// as absolute. Kinetics (torque) is a v1 placeholder; the capture is kinematics-only.

import type {
  CanonicalCapture, EventFrames, JointKey, MetricBuckets, ThrowMetrics, Vec3,
} from './types'
import type { Hand, UpAxis } from './events'

// ── vector helpers ──
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const mag = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const deg = (r: number) => (r * 180) / Math.PI

/** Angle (deg) between two vectors; NaN if either is degenerate. */
function angle(a: Vec3, b: Vec3): number {
  const m = mag(a) * mag(b)
  if (m === 0) return NaN
  return deg(Math.acos(Math.min(1, Math.max(-1, dot(a, b) / m))))
}

/** Horizontal heading (deg) of a vector, ignoring the up component. */
function heading(v: Vec3, upAxis: UpAxis): number {
  const horiz = upAxis === 'z' ? [v.x, v.y] : upAxis === 'y' ? [v.x, v.z] : [v.y, v.z]
  return deg(Math.atan2(horiz[1], horiz[0]))
}

/** Up-axis unit vector. */
function upVec(upAxis: UpAxis): Vec3 {
  return { x: upAxis === 'x' ? 1 : 0, y: upAxis === 'y' ? 1 : 0, z: upAxis === 'z' ? 1 : 0 }
}

const median = (xs: number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return NaN
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

interface ExtractOpts {
  hand: Hand
  upAxis?: UpAxis
  heightMm?: number
}

/** Joint at a frame or null. */
const at = (cap: CanonicalCapture, j: JointKey, f: number): Vec3 | null =>
  (cap.joints[j] && cap.joints[j][f]) || null

/** Peak |angular velocity about up-axis| (deg/s) of a body line over [s,e]. */
function peakAngVel(
  cap: CanonicalCapture, jA: JointKey, jB: JointKey, s: number, e: number, upAxis: UpAxis,
): number {
  const fps = cap.frameRate
  let peak = 0
  for (let f = s + 1; f < e; f++) {
    const a0 = at(cap, jA, f - 1), b0 = at(cap, jB, f - 1)
    const a1 = at(cap, jA, f + 1), b1 = at(cap, jB, f + 1)
    if (!a0 || !b0 || !a1 || !b1) continue
    let dh = heading(sub(a1, b1), upAxis) - heading(sub(a0, b0), upAxis)
    while (dh > 180) dh -= 360
    while (dh < -180) dh += 360
    const angVel = Math.abs(dh) * (fps / 2)
    if (angVel > peak) peak = angVel
  }
  return peak
}

/** Elbow flexion (deg) at a frame: 0 = straight arm, 180 = fully folded. */
function elbowFlexion(cap: CanonicalCapture, hand: Hand, f: number): number {
  const sh = at(cap, hand === 'R' ? 'shoulder_r' : 'shoulder_l', f)
  const el = at(cap, hand === 'R' ? 'elbow_r' : 'elbow_l', f)
  const wr = at(cap, hand === 'R' ? 'wrist_r' : 'wrist_l', f)
  if (!sh || !el || !wr) return NaN
  return 180 - angle(sub(sh, el), sub(wr, el))
}

/** Lead-knee flexion (deg): 0 = straight, higher = more bent. */
function kneeFlexion(cap: CanonicalCapture, lead: 'l' | 'r', f: number): number {
  const hip = at(cap, `hip_${lead}` as JointKey, f)
  const knee = at(cap, `knee_${lead}` as JointKey, f)
  const ankle = at(cap, `ankle_${lead}` as JointKey, f)
  if (!hip || !knee || !ankle) return NaN
  return 180 - angle(sub(hip, knee), sub(ankle, knee))
}

/**
 * Extract all six buckets for a single throw. `events` supplies the canonical frames.
 */
export function extractThrowMetrics(
  cap: CanonicalCapture, events: EventFrames, opts: ExtractOpts,
): ThrowMetrics {
  const hand = opts.hand
  const upAxis = opts.upAxis ?? 'z'
  const height = opts.heightMm ?? 1830
  const fc = events.footContact, mer = events.maxExternalRotation, rel = events.release
  const lead: 'l' | 'r' = hand === 'R' ? 'l' : 'r'
  const shoulderJ: JointKey = hand === 'R' ? 'shoulder_r' : 'shoulder_l'
  const elbowJ: JointKey = hand === 'R' ? 'elbow_r' : 'elbow_l'

  // arm action (at foot contact)
  const sh = at(cap, shoulderJ, fc), el = at(cap, elbowJ, fc)
  const torso = at(cap, 'torso', fc), pelvis = at(cap, 'pelvis', fc)
  let shoulderAbduction = NaN, horizontalAbduction = NaN
  if (sh && el && torso && pelvis) {
    const upperArm = sub(el, sh)
    const trunkDown = sub(pelvis, torso)          // down the spine
    shoulderAbduction = 180 - angle(upperArm, trunkDown)
    // horizontal abduction: upper-arm deviation in transverse plane from shoulder line
    const shOther = at(cap, hand === 'R' ? 'shoulder_l' : 'shoulder_r', fc)
    if (shOther) horizontalAbduction = Math.abs(90 - angle(upperArm, sub(shOther, sh)))
  }

  // lower body / trunk
  const leadAnkleFC = at(cap, `ankle_${lead}` as JointKey, fc)
  const driveAnkleFC = at(cap, `ankle_${lead === 'l' ? 'r' : 'l'}` as JointKey, fc)
  const strideLengthPct = leadAnkleFC && driveAnkleFC
    ? (mag(sub(leadAnkleFC, driveAnkleFC)) / height) * 100 : NaN

  const torsoRel = at(cap, 'torso', rel), pelvisRel = at(cap, 'pelvis', rel)
  let trunkForwardTilt = NaN, trunkLateralTilt = NaN
  if (torsoRel && pelvisRel) {
    const trunk = sub(torsoRel, pelvisRel)
    const vert = upVec(upAxis)
    const tiltFromVert = angle(trunk, vert)
    // split into forward (sagittal) and lateral (frontal) using target direction
    const pFc = at(cap, 'pelvis', fc)
    if (pFc) {
      const target = sub(pelvisRel, pFc); (target as any)[upAxis] = 0
      const tMag = mag(target) || 1
      const fwd = { x: target.x / tMag, y: target.y / tMag, z: target.z / tMag }
      const trunkH = { ...trunk }; (trunkH as any)[upAxis] = 0
      const fwdComp = Math.abs(dot(trunkH, fwd))
      const latComp = Math.sqrt(Math.max(0, mag(trunkH) ** 2 - fwdComp ** 2))
      const total = fwdComp + latComp || 1
      trunkForwardTilt = tiltFromVert * (fwdComp / total)
      trunkLateralTilt = tiltFromVert * (latComp / total)
    } else {
      trunkForwardTilt = tiltFromVert
      trunkLateralTilt = 0
    }
  }

  const leadKneeFlexionFC = kneeFlexion(cap, lead, fc)
  const leadKneeFlexionRelease = kneeFlexion(cap, lead, rel)
  const dtSec = Math.max(1, rel - fc) / cap.frameRate
  const leadKneeExtVelocity = Number.isFinite(leadKneeFlexionFC) && Number.isFinite(leadKneeFlexionRelease)
    ? (leadKneeFlexionFC - leadKneeFlexionRelease) / dtSec : NaN

  // pelvis rotation toward target at foot contact (hip line heading vs target)
  const hipR = at(cap, 'hip_r', fc), hipL = at(cap, 'hip_l', fc)
  let pelvisRotation = NaN
  if (hipR && hipL) pelvisRotation = Math.abs(heading(sub(hipR, hipL), upAxis))

  // velocities (peaks over foot-contact → release)
  const pelvisAngVel = peakAngVel(cap, 'hip_r', 'hip_l', fc, rel, upAxis)
  const trunkAngVel = peakAngVel(cap, 'shoulder_r', 'shoulder_l', fc, rel, upAxis)
  // elbow extension velocity: peak rate of flexion decrease near release
  let elbowExtVelocity = 0
  for (let f = mer; f < rel; f++) {
    const a = elbowFlexion(cap, hand, f), b = elbowFlexion(cap, hand, f + 1)
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const v = (a - b) * cap.frameRate
      if (v > elbowExtVelocity) elbowExtVelocity = v
    }
  }
  // shoulder IR velocity proxy: peak forearm rotation rate (directional, not absolute)
  const shoulderIrVelocity = peakAngVel(cap, elbowJ, hand === 'R' ? 'wrist_r' : 'wrist_l', mer, rel, upAxis)

  // sequencing: peak-velocity timing relative to foot contact (s)
  const pelvisPeakTime = peakTime(cap, 'hip_r', 'hip_l', fc, rel, upAxis)
  const trunkPeakTime = peakTime(cap, 'shoulder_r', 'shoulder_l', fc, rel, upAxis)
  const armPeakTime = peakTime(cap, elbowJ, hand === 'R' ? 'wrist_r' : 'wrist_l', fc, rel, upAxis)
  const pelvisToTrunkGap = Number.isFinite(pelvisPeakTime) && Number.isFinite(trunkPeakTime)
    ? trunkPeakTime - pelvisPeakTime : NaN

  // hip-shoulder separation: max transverse angle between hip line and shoulder line
  let maxSeparation = 0
  for (let f = fc; f <= rel; f++) {
    const hr = at(cap, 'hip_r', f), hl = at(cap, 'hip_l', f)
    const sr = at(cap, 'shoulder_r', f), sl = at(cap, 'shoulder_l', f)
    if (!hr || !hl || !sr || !sl) continue
    let sep = Math.abs(heading(sub(sr, sl), upAxis) - heading(sub(hr, hl), upAxis))
    if (sep > 180) sep = 360 - sep
    if (sep > maxSeparation) maxSeparation = sep
  }

  // outcome: MER (layback) at the MER frame — upper-arm vs forearm angle proxy
  const shM = at(cap, shoulderJ, mer), elM = at(cap, elbowJ, mer)
  const wrM = at(cap, hand === 'R' ? 'wrist_r' : 'wrist_l', mer)
  let maxExternalRotation = NaN
  if (shM && elM && wrM) maxExternalRotation = 90 + (180 - angle(sub(shM, elM), sub(wrM, elM)))

  const metrics: MetricBuckets = {
    armAction: { shoulderAbduction, horizontalAbduction, elbowFlexion: elbowFlexion(cap, hand, fc) },
    lowerBody: {
      strideLengthPct, trunkForwardTilt, trunkLateralTilt,
      leadKneeFlexionFC, leadKneeFlexionRelease, leadKneeExtVelocity, pelvisRotation,
    },
    velocities: { pelvisAngVel, trunkAngVel, elbowExtVelocity, shoulderIrVelocity },
    sequencing: { pelvisPeakTime, trunkPeakTime, armPeakTime, pelvisToTrunkGap },
    hipShoulderSep: { maxSeparation },
    outcome: { maxExternalRotation, relSpeedMph: null },
    kinetics: { status: 'pending_force_plates', note: 'Torque requires force plates + inverse dynamics (v2).' },
  }

  const directionalKeys = ['velocities.shoulderIrVelocity', 'outcome.maxExternalRotation', 'armAction.horizontalAbduction']
  const qcFlags: string[] = []
  if (events.confidence < 0.6) qcFlags.push('low_event_confidence')
  if (!Number.isFinite(strideLengthPct)) qcFlags.push('missing_lower_body')

  return { throwNo: 0, events, metrics, directionalKeys, qcFlags }
}

/** Frame time (s from foot contact) of peak angular velocity for a body line. */
function peakTime(
  cap: CanonicalCapture, jA: JointKey, jB: JointKey, s: number, e: number, upAxis: UpAxis,
): number {
  const fps = cap.frameRate
  let peak = 0, peakF = s
  for (let f = s + 1; f < e; f++) {
    const a0 = at(cap, jA, f - 1), b0 = at(cap, jB, f - 1)
    const a1 = at(cap, jA, f + 1), b1 = at(cap, jB, f + 1)
    if (!a0 || !b0 || !a1 || !b1) continue
    let dh = heading(sub(a1, b1), upAxis) - heading(sub(a0, b0), upAxis)
    while (dh > 180) dh -= 360
    while (dh < -180) dh += 360
    const angVel = Math.abs(dh) * (fps / 2)
    if (angVel > peak) { peak = angVel; peakF = f }
  }
  return (peakF - s) / fps
}

/**
 * Aggregate qualifying throws into a session-level MetricBuckets (per-metric median).
 * Excluded/low-confidence throws are dropped by the caller before this.
 */
export function aggregateSession(throws: ThrowMetrics[]): MetricBuckets {
  const pick = (f: (m: MetricBuckets) => number) => median(throws.map(t => f(t.metrics)))
  return {
    armAction: {
      shoulderAbduction: pick(m => m.armAction.shoulderAbduction),
      horizontalAbduction: pick(m => m.armAction.horizontalAbduction),
      elbowFlexion: pick(m => m.armAction.elbowFlexion),
    },
    lowerBody: {
      strideLengthPct: pick(m => m.lowerBody.strideLengthPct),
      trunkForwardTilt: pick(m => m.lowerBody.trunkForwardTilt),
      trunkLateralTilt: pick(m => m.lowerBody.trunkLateralTilt),
      leadKneeFlexionFC: pick(m => m.lowerBody.leadKneeFlexionFC),
      leadKneeFlexionRelease: pick(m => m.lowerBody.leadKneeFlexionRelease),
      leadKneeExtVelocity: pick(m => m.lowerBody.leadKneeExtVelocity),
      pelvisRotation: pick(m => m.lowerBody.pelvisRotation),
    },
    velocities: {
      pelvisAngVel: pick(m => m.velocities.pelvisAngVel),
      trunkAngVel: pick(m => m.velocities.trunkAngVel),
      elbowExtVelocity: pick(m => m.velocities.elbowExtVelocity),
      shoulderIrVelocity: pick(m => m.velocities.shoulderIrVelocity),
    },
    sequencing: {
      pelvisPeakTime: pick(m => m.sequencing.pelvisPeakTime),
      trunkPeakTime: pick(m => m.sequencing.trunkPeakTime),
      armPeakTime: pick(m => m.sequencing.armPeakTime),
      pelvisToTrunkGap: pick(m => m.sequencing.pelvisToTrunkGap),
    },
    hipShoulderSep: { maxSeparation: pick(m => m.hipShoulderSep.maxSeparation) },
    outcome: {
      maxExternalRotation: pick(m => m.outcome.maxExternalRotation),
      relSpeedMph: median(throws.map(t => t.metrics.outcome.relSpeedMph ?? NaN)) || null,
    },
    kinetics: { status: 'pending_force_plates', note: 'Torque requires force plates + inverse dynamics (v2).' },
  }
}
