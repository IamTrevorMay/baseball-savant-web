// Synthetic pitching-delivery model — parameterised forward kinematics that emits
// canonical joint trajectories indistinguishable in shape from a Captury export.
//
// Why forward kinematics rather than replaying recorded angles: every metric in
// lib/mechanics/metrics.ts is computed from *marker positions*, so the only way to
// exercise the real extraction path is to produce positions that a real geometry
// would produce. Pose is driven by anatomically meaningful generalised coordinates
// (pelvis translation + yaw, trunk lean, shoulder-line yaw, arm elevation/azimuth,
// elbow flexion, forearm roll); joints come out the far end by FK, never by writing
// a metric value directly.
//
// Frame convention (matches the Captury export SOP: Z-up, mm):
//   +Y = toward the target, +X = lateral, +Z = up. The pitcher strides along +Y.
//   `heading()` in metrics.ts is atan2(y, x), so a hip line square to the target
//   reads 0° and opens toward ±90° — which is what `pelvisRotation` expects.

import type { CanonicalCapture, JointKey, Trajectory, Vec3 } from '../../lib/mechanics/types'
import { JOINT_KEYS } from '../../lib/mechanics/types'

export const FPS = 240

// ── event timeline (seconds from the start of one throw) ──
export const T = {
  start: 0.0,
  liftApex: 0.45,
  footContact: 0.80,
  // Keyframes are placed where detectEvents() actually fires, not where a nominal
  // timeline would put them: MER is found as the hand's most-posterior frame and
  // release as peak hand speed, and both lead a naively-placed keyframe. Aligning them
  // means foreElevMER really does set elbow flexion *at the detected MER frame*.
  mer: 0.878,
  release: 0.928,
  end: 1.45,
  /** slow reset-to-the-rubber frames after each throw, so segmentThrows() can split them */
  rest: 1.00,
}

// ── anthropometry, as fractions of standing height (Winter/Dempster) ──
export interface Anthro {
  heightMm: number
  hipHalf: number; shHalf: number; torsoLen: number; headLen: number
  upperArm: number; foreArm: number; handLen: number
  thigh: number; shank: number; footLen: number; ankleHeight: number
}

/**
 * @param hipHeightFrac standing hip-joint-centre height as a fraction of stature.
 *   Dempster's population mean is 0.530; pitchers sit high in that distribution
 *   (long levers are selected for), so 0.545 is the default here. It matters because
 *   leg length is what caps `strideLengthPct` — that metric is an inter-ankle
 *   distance, so no pose can exceed what the legs can span.
 */
export function anthroFor(heightMm: number, hipHeightFrac = 0.545): Anthro {
  const H = heightMm
  const ankleHeight = 0.039 * H
  const legLen = hipHeightFrac * H - ankleHeight
  return {
    heightMm: H,
    hipHalf: 0.055 * H,
    shHalf: 0.105 * H,
    torsoLen: 0.29 * H,
    headLen: 0.13 * H,
    upperArm: 0.186 * H,
    foreArm: 0.146 * H,
    handLen: 0.05 * H,
    thigh: legLen * 0.499,
    shank: legLen * 0.501,
    footLen: 0.15 * H,
    ankleHeight,
  }
}

// ── interpolation ──────────────────────────────────────────────────────────────
// Keyframed tracks. Peak angular velocity of a smoothstep segment is (Δvalue / Δt) × 1.5,
// so keyframe spacing and amplitude are how the model controls peak-velocity metrics
// independently of total rotation.

export type Key = readonly [number, number]
const smoothstep = (u: number) => u * u * (3 - 2 * u)

/**
 * Cubic Hermite through the keys, tangents by finite difference.
 *
 * Preferred over `track()` for anything the hand is attached to. Smoothstep has zero
 * derivative at *every* keyframe, so a key at foot contact makes the hand come to a
 * dead stop there — which reads as a quiet gap and splits one delivery into two throw
 * windows. A Hermite spline carries velocity through interior keys.
 */
export function spline(keys: Key[], t: number): number {
  const n = keys.length
  if (t <= keys[0][0]) return keys[0][1]
  if (t >= keys[n - 1][0]) return keys[n - 1][1]
  const tangent = (i: number) => {
    const lo = Math.max(0, i - 1), hi = Math.min(n - 1, i + 1)
    const dt = keys[hi][0] - keys[lo][0]
    return dt === 0 ? 0 : (keys[hi][1] - keys[lo][1]) / dt
  }
  for (let i = 0; i < n - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1]
    if (t < t0 || t > t1) continue
    const h = t1 - t0
    const u = h === 0 ? 0 : (t - t0) / h
    const u2 = u * u, u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * v0
      + (u3 - 2 * u2 + u) * h * tangent(i)
      + (-2 * u3 + 3 * u2) * v1
      + (u3 - u2) * h * tangent(i + 1)
  }
  return keys[n - 1][1]
}

export function track(keys: Key[], t: number, ease: (u: number) => number = smoothstep): number {
  if (t <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (t >= last[0]) return last[1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1]
    if (t >= t0 && t <= t1) {
      const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
      return v0 + (v1 - v0) * ease(u)
    }
  }
  return last[1]
}

// ── vector helpers ──
const V = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const add = (a: Vec3, b: Vec3): Vec3 => V(a.x + b.x, a.y + b.y, a.z + b.z)
const sub = (a: Vec3, b: Vec3): Vec3 => V(a.x - b.x, a.y - b.y, a.z - b.z)
const scale = (a: Vec3, k: number): Vec3 => V(a.x * k, a.y * k, a.z * k)
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 =>
  V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const norm = (a: Vec3): Vec3 => {
  const m = Math.hypot(a.x, a.y, a.z) || 1
  return V(a.x / m, a.y / m, a.z / m)
}
const rad = (d: number) => (d * Math.PI) / 180

/** Any unit vector perpendicular to `d`. */
function perp(d: Vec3): Vec3 {
  const ref = Math.abs(d.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)
  return norm(cross(d, ref))
}

/**
 * Two-link IK: place the joint between `root` and `end`.
 * `bendDir` biases which way the joint buckles. If the target is out of reach the
 * chain straightens toward it (never NaN, never a broken pose).
 */
function ik2(root: Vec3, end: Vec3, a: number, b: number, bendDir: Vec3): Vec3 {
  const delta = sub(end, root)
  const d = Math.hypot(delta.x, delta.y, delta.z) || 1e-6
  const dir = scale(delta, 1 / d)
  if (d >= a + b - 1e-6) return add(root, scale(dir, a))          // straight
  // distance along root→end to the joint's projection, plus perpendicular offset
  const along = (d * d + a * a - b * b) / (2 * d)
  const h = Math.sqrt(Math.max(0, a * a - along * along))
  let side = sub(bendDir, scale(dir, dot(bendDir, dir)))          // orthogonalise
  if (Math.hypot(side.x, side.y, side.z) < 1e-6) side = perp(dir)
  return add(add(root, scale(dir, along)), scale(norm(side), h))
}

// ── model parameters ───────────────────────────────────────────────────────────
// Every field is a scalar so the calibrator can tune by key name. Values are the
// pose at a named event; the tracks below interpolate between them.

export interface DeliveryParams {
  leadAnkleY: number        // mm from the rubber where the lead foot plants
  pelvisYFC: number         // pelvis Y at foot contact
  pelvisZFC: number         // hip-joint-centre height at FC — drives lead-knee flexion
  pelvisYRel: number
  pelvisZRel: number
  rearAnkleY: number        // mm — where the drive foot sits at FC (it drags off the rubber)
  pelvisYawFC: number       // heading of the hip line at FC
  pelvisYawEnd: number
  pelvisRotT0: number       // s — window of the fast pelvis rotation (sets peak vel)
  pelvisRotT1: number
  shoulderYawFC: number
  shoulderYawEnd: number
  shoulderRotT0: number
  shoulderRotT1: number
  trunkTiltFC: number       // deg from vertical
  trunkTiltRel: number
  trunkAzFC: number         // deg — azimuth of the lean, sets the fwd/lateral split
  trunkAzRel: number
  armAbdFC: number          // deg of upper arm from the trunk's long axis
  armAbdMER: number
  armAbdRel: number
  armAzFC: number           // deg in the trunk transverse plane (+ = posterior/scap load)
  armAzMER: number
  armAzRel: number
  // Forearm direction, in the same trunk frame as the upper arm. Elbow flexion is the
  // angle between the two, so it is an *output* here rather than a dial — which is what
  // lets the hand sit deepest-posterior at MER (true layback) instead of at foot contact.
  foreElevFC: number        // deg from the trunk's long axis
  foreAzFC: number          // deg in the transverse plane (+ = posterior)
  foreElevMER: number
  foreAzMER: number
  foreElevRel: number
  foreAzRel: number
}

export const BASE_PARAMS: DeliveryParams = {
  leadAnkleY: 1560,
  pelvisYFC: 940,
  pelvisZFC: 560,
  pelvisYRel: 1010,
  pelvisZRel: 830,
  rearAnkleY: 210,
  pelvisYawFC: 35,
  pelvisYawEnd: 92,
  pelvisRotT0: 0.775,
  pelvisRotT1: 0.925,
  shoulderYawFC: -12,
  shoulderYawEnd: 86,
  shoulderRotT0: 0.815,
  shoulderRotT1: 0.955,
  trunkTiltFC: 16,
  trunkTiltRel: 55,
  trunkAzFC: 74,
  trunkAzRel: 61,
  armAbdFC: 90,
  armAbdMER: 96,
  armAbdRel: 99,
  armAzFC: 50,
  armAzMER: 52,
  armAzRel: -34,
  // Forearm vertical at foot contact (so it adds no posterior offset there) swinging to
  // laid-back horizontal at MER — the swing is what makes the hand deepest at MER.
  foreElevFC: 12,
  foreAzFC: 60,
  foreElevMER: 105,
  foreAzMER: 118,
  foreElevRel: 76,
  foreAzRel: -30,
}

// ── the model ──────────────────────────────────────────────────────────────────

export type Hand = 'R' | 'L'

/** Pelvis centre + hip joint centres at time `t`. Split out so foot-plant positions
 *  can be resolved against the hips at foot contact before the full pose is built. */
function hipsAt(t: number, p: DeliveryParams, a: Anthro, mirror: number) {
  const pelvisY = spline([
    [T.start, 0], [T.liftApex, 40], [T.footContact, p.pelvisYFC],
    [T.release, p.pelvisYRel], [T.end, p.pelvisYRel + 260],
  ], t)
  const standZ = 0.53 * a.heightMm
  const pelvisZ = spline([
    [T.start, standZ], [T.liftApex, standZ - 30], [T.footContact, p.pelvisZFC],
    [T.release, p.pelvisZRel], [T.end, p.pelvisZRel - 90],
  ], t)
  const P = V(0, pelvisY, pelvisZ)

  // Slow rotation into foot contact, then the fast segment whose width sets peak
  // pelvis angular velocity.
  const yaw = spline([
    [T.start, -34], [p.pelvisRotT0, p.pelvisYawFC - 6], [p.pelvisRotT1, p.pelvisYawEnd],
    [T.end, p.pelvisYawEnd + 12],
  ], t) * mirror
  const uHip = V(Math.cos(rad(yaw)), Math.sin(rad(yaw)), 0)
  return { P, uHip, hip_r: add(P, scale(uHip, a.hipHalf)), hip_l: sub(P, scale(uHip, a.hipHalf)) }
}

/**
 * Where a foot can actually be planted: the requested spot, pulled back along the
 * line from the hip if it is beyond the leg's reach. Without this, asking for a long
 * stride silently stretches the shank and the knee-flexion metric reads a pose the
 * skeleton could never hold.
 */
function plantAt(hip: Vec3, want: Vec3, a: Anthro): Vec3 {
  const maxSpan = (a.thigh + a.shank) * 0.995
  const d = sub(want, hip)
  const m = Math.hypot(d.x, d.y, d.z)
  return m <= maxSpan ? want : add(hip, scale(scale(d, 1 / m), maxSpan))
}

/** Resolved foot-plant positions at foot contact (constant from FC onward). */
export function plantPoints(p: DeliveryParams, a: Anthro, hand: Hand) {
  const mirror = hand === 'R' ? 1 : -1
  const h = hipsAt(T.footContact, p, a, mirror)
  const leadHip = hand === 'R' ? h.hip_l : h.hip_r
  const rearHip = hand === 'R' ? h.hip_r : h.hip_l
  return {
    lead: plantAt(leadHip, V(mirror * 60, p.leadAnkleY, a.ankleHeight), a),
    rear: plantAt(rearHip, V(mirror * -45, p.rearAnkleY, a.ankleHeight), a),
  }
}

/** Pose the full skeleton at one instant `t` (seconds into the throw). */
function poseAt(t: number, p: DeliveryParams, a: Anthro, hand: Hand): Record<JointKey, Vec3> {
  const lead: 'l' | 'r' = hand === 'R' ? 'l' : 'r'
  const mirror = hand === 'R' ? 1 : -1   // flips lateral geometry for a LHP

  let { P, hip_r, hip_l } = hipsAt(t, p, a, mirror)

  // Keep the pelvis within leg reach of the planted lead foot. Without this the pelvis
  // track can rise past what the leg allows; ik2 then straightens and the *shank*
  // silently stretches, so the skeleton is no longer a rigid body and the knee-flexion
  // metrics read a pose no skeleton could hold.
  const plant = plantPoints(p, a, hand)
  const maxLeg = (a.thigh + a.shank) * 0.995
  if (t >= T.footContact) {
    const leadHip = hand === 'R' ? hip_l : hip_r
    const d = Math.hypot(leadHip.x - plant.lead.x, leadHip.y - plant.lead.y, leadHip.z - plant.lead.z)
    if (d > maxLeg) {
      const k = maxLeg / d
      const pulled = add(plant.lead, scale(sub(leadHip, plant.lead), k))
      const shift = sub(pulled, leadHip)
      P = add(P, shift); hip_r = add(hip_r, shift); hip_l = add(hip_l, shift)
    }
  }

  // ── trunk: lean magnitude from vertical + azimuth of the lean ──
  const tilt = spline([
    [T.start, 6], [T.liftApex, 8], [T.footContact, p.trunkTiltFC],
    [T.release, p.trunkTiltRel], [T.end, p.trunkTiltRel + 12],
  ], t)
  const az = spline([
    [T.start, 100], [T.footContact, p.trunkAzFC], [T.release, p.trunkAzRel], [T.end, p.trunkAzRel],
  ], t) * mirror
  const trunkDir = norm(V(
    Math.sin(rad(tilt)) * Math.cos(rad(az)),
    Math.sin(rad(tilt)) * Math.sin(rad(az)),
    Math.cos(rad(tilt)),
  ))
  const torso = add(P, scale(trunkDir, a.torsoLen))
  const head = add(torso, scale(trunkDir, a.headLen))

  // ── shoulder line: lags the pelvis (that lag is hip–shoulder separation) ──
  const shYaw = spline([
    [T.start, -46], [p.shoulderRotT0, p.shoulderYawFC], [p.shoulderRotT1, p.shoulderYawEnd],
    [T.end, p.shoulderYawEnd + 10],
  ], t) * mirror
  const uSh = V(Math.cos(rad(shYaw)), Math.sin(rad(shYaw)), 0)
  const shoulder_r = add(torso, scale(uSh, a.shHalf))
  const shoulder_l = sub(torso, scale(uSh, a.shHalf))

  // ── throwing arm, built in a trunk-local frame ──
  // e3 = up the trunk, e1 = along the shoulder line toward the throwing side,
  // e2 = e1 × e3, which points *posteriorly* — so a positive azimuth means "behind the
  // shoulder plane", the direction scap load and layback actually go. Elevation from e3
  // is exactly what metrics.ts reads as shoulder abduction.
  const e3 = trunkDir
  const e1raw = hand === 'R' ? uSh : scale(uSh, -1)
  const e1 = norm(sub(e1raw, scale(e3, dot(e1raw, e3))))
  const e2 = norm(cross(e1, e3))

  // The hand-break/swing is spread across the whole lift+stride so its speed stays
  // well under segmentThrows()' 25%-of-peak activity threshold — otherwise the swing
  // reads as a throw of its own and the session splits into phantom windows.
  const abd = spline([
    [T.start, 22], [0.30, 54], [T.liftApex, 70], [T.footContact, p.armAbdFC],
    [T.mer, p.armAbdMER], [T.release, p.armAbdRel], [T.end, 56],
  ], t)
  const armAz = spline([
    [T.start, 82], [0.30, 70], [T.liftApex, 62], [T.footContact, p.armAzFC],
    [T.mer, p.armAzMER], [T.release, p.armAzRel], [T.end, -104],
  ], t)

  const shoulderJ = hand === 'R' ? shoulder_r : shoulder_l
  const armDir = norm(add(
    scale(e3, Math.cos(rad(abd))),
    scale(add(scale(e1, Math.cos(rad(armAz))), scale(e2, Math.sin(rad(armAz)))), Math.sin(rad(abd))),
  ))
  const elbow = add(shoulderJ, scale(armDir, a.upperArm))

  // Forearm, aimed in the same trunk frame as the upper arm. External rotation is the
  // forearm swinging from up-ish at foot contact to laid-back-and-horizontal at MER —
  // which is what puts the hand at its most posterior point there, and therefore what
  // makes detectEvents() find MER where the model actually puts it. The fast azimuth
  // sweep from MER to release is the internal rotation the IR-velocity proxy reads.
  const foreElev = spline([
    [T.start, 30], [T.liftApex, 36], [T.footContact, p.foreElevFC],
    [T.mer, p.foreElevMER], [T.release, p.foreElevRel], [T.end, 96],
  ], t)
  const foreAz = spline([
    [T.start, 64], [T.liftApex, 72], [T.footContact, p.foreAzFC],
    [T.mer, p.foreAzMER], [T.release, p.foreAzRel], [T.end, -96],
  ], t)
  const foreDir = norm(add(
    scale(e3, Math.cos(rad(foreElev))),
    scale(add(scale(e1, Math.cos(rad(foreAz))), scale(e2, Math.sin(rad(foreAz)))), Math.sin(rad(foreElev))),
  ))
  const wrist = add(elbow, scale(foreDir, a.foreArm))
  const handPt = add(wrist, scale(foreDir, a.handLen))

  // ── legs ──
  // Both feet are planted at fixed world points from foot contact onward. A planted
  // foot really is motionless, and that stillness is exactly what the foot-contact
  // detector keys on — so the plant must not drift with the pelvis.
  const leadY = track([
    [T.start, -120], [T.liftApex, -40], [T.footContact, plant.lead.y], [T.end, plant.lead.y],
  ], t)
  const leadZ = track([
    [T.start, a.ankleHeight], [T.liftApex, 0.31 * a.heightMm],
    [T.footContact, a.ankleHeight], [T.end, a.ankleHeight],
  ], t)
  const leadAnkle = t >= T.footContact ? plant.lead : V(plant.lead.x, leadY, leadZ)

  // Drive foot: on the rubber, dragging forward through the stride, then peeling off
  // the ground after release.
  const rearAnkle = t <= T.footContact
    ? V(plant.rear.x, track([[T.start, 0], [T.footContact, plant.rear.y]], t), a.ankleHeight)
    : V(
        plant.rear.x,
        track([[T.footContact, plant.rear.y], [T.end, plant.rear.y + 380]], t),
        track([[T.footContact, a.ankleHeight], [T.release, a.ankleHeight], [T.end, 0.22 * a.heightMm]], t),
      )

  // The trail foot is driven by its own track once it peels off the ground, so it also
  // has to be clamped to what the leg can actually reach.
  const rearHipNow = hand === 'R' ? hip_r : hip_l
  const rearClamped = plantAt(rearHipNow, rearAnkle, a)

  const ankle_l = lead === 'l' ? leadAnkle : rearClamped
  const ankle_r = lead === 'l' ? rearClamped : leadAnkle

  // knees by IK, buckling forward (+Y) and slightly outward
  const bend = V(mirror * 0.25, 1, 0)
  const knee_l = ik2(hip_l, ankle_l, a.thigh, a.shank, bend)
  const knee_r = ik2(hip_r, ankle_r, a.thigh, a.shank, bend)
  const toe = (ankle: Vec3) => add(ankle, V(0, a.footLen * 0.8, -a.ankleHeight * 0.55))

  return {
    pelvis: P, torso, head,
    shoulder_r, shoulder_l,
    elbow_r: hand === 'R' ? elbow : add(shoulder_l, V(mirror * -180, -120, -a.upperArm * 0.9)),
    elbow_l: hand === 'L' ? elbow : add(shoulder_l, V(mirror * -140, 150, -a.upperArm * 0.85)),
    wrist_r: hand === 'R' ? wrist : add(shoulder_l, V(mirror * -200, -60, -a.upperArm * 1.6)),
    wrist_l: hand === 'L' ? wrist : add(shoulder_l, V(mirror * -150, 320, -a.upperArm * 1.3)),
    hand_r: hand === 'R' ? handPt : add(shoulder_l, V(mirror * -210, -40, -a.upperArm * 1.8)),
    hand_l: hand === 'L' ? handPt : add(shoulder_l, V(mirror * -155, 380, -a.upperArm * 1.4)),
    hip_r, hip_l, knee_r, knee_l, ankle_r, ankle_l,
    foot_r: toe(ankle_r), foot_l: toe(ankle_l),
  }
}

// ── session synthesis ──────────────────────────────────────────────────────────

export interface ThrowPlan {
  params: DeliveryParams
  /** marker jitter sigma in mm (markerless systems are noisier than marker-based) */
  noiseMm: number
  seed: number
}

function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Box–Muller, so jitter is Gaussian rather than uniform. */
function gauss(rnd: () => number) {
  const u = Math.max(1e-9, rnd())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

/** Frame indices, within a single throw, of the three canonical events. */
export const throwFrames = () => ({
  footContact: Math.round(T.footContact * FPS),
  mer: Math.round(T.mer * FPS),
  release: Math.round(T.release * FPS),
  length: Math.round(T.end * FPS),
  rest: Math.round(T.rest * FPS),
})

/** Build a capture holding exactly one throw — the calibrator's evaluation unit. */
export function synthesizeThrow(params: DeliveryParams, a: Anthro, hand: Hand, noiseMm = 0, seed = 1): CanonicalCapture {
  return synthesizeSession([{ params, noiseMm, seed }], a, hand)
}

/** Build a full bullpen capture: N throws separated by near-still rest frames. */
export function synthesizeSession(plans: ThrowPlan[], a: Anthro, hand: Hand): CanonicalCapture {
  const f = throwFrames()
  const joints = {} as Record<JointKey, Trajectory>
  for (const k of JOINT_KEYS) joints[k] = []

  plans.forEach((plan, pi, all) => {
    const rnd = mulberry32(plan.seed * 7919 + pi * 104729 + 13)
    const total = f.length + f.rest
    const endPose = poseAt(T.end, plan.params, a, hand)
    // The next throw's set-up pose, so the reset lands exactly where the following
    // throw begins — a positional discontinuity at the seam would read as an
    // enormous hand velocity and hijack release detection.
    const nextPose = poseAt(T.start, (all[pi + 1] ?? plan).params, a, hand)

    for (let fr = 0; fr < total; fr++) {
      const inThrow = fr <= f.length
      // Reset is a slow straight-line walk back in Cartesian space rather than the
      // delivery run backwards, which would whip the arm and spoil segmentation.
      const pose = inThrow
        ? poseAt(fr / FPS, plan.params, a, hand)
        : (() => {
            const u = smoothstep(Math.min(1, (fr - f.length) / Math.max(1, f.rest)))
            const blended = {} as Record<JointKey, Vec3>
            for (const k of JOINT_KEYS) blended[k] = add(endPose[k], scale(sub(nextPose[k], endPose[k]), u))
            return blended
          })()
      const planted = fr >= f.footContact && fr <= f.length
      for (const k of JOINT_KEYS) {
        const v = pose[k]
        // A planted foot is genuinely motionless; jittering it would fabricate the
        // vertical-velocity signal the foot-contact detector is looking for.
        const still = planted && (k === (hand === 'R' ? 'ankle_l' : 'ankle_r') || k === (hand === 'R' ? 'foot_l' : 'foot_r'))
        const s = still ? 0 : plan.noiseMm
        joints[k].push(s === 0 ? { ...v } : {
          x: v.x + gauss(rnd) * s, y: v.y + gauss(rnd) * s, z: v.z + gauss(rnd) * s,
        })
      }
    }
  })

  const frameCount = joints.pelvis.length
  return { frameRate: FPS, frameCount, joints }
}
