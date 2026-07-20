// Canonical data model for the MEchanics biomechanics pipeline.
//
// Capture (Captury/OptiTrack C3D) → throws → event frames → extracted metrics →
// percentiles + flags → report. Every stage speaks these types so Captury's raw
// naming stays isolated in the ingest mapper and nothing downstream depends on it.

/** A single 3D point sample (mm) for one marker at one frame. null = dropped/occluded. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Canonical joint/marker keys the metric engine needs. Captury labels map onto these. */
export type JointKey =
  | 'pelvis' | 'torso' | 'head'
  | 'shoulder_r' | 'shoulder_l'
  | 'elbow_r' | 'elbow_l'
  | 'wrist_r' | 'wrist_l'
  | 'hand_r' | 'hand_l'
  | 'hip_r' | 'hip_l'
  | 'knee_r' | 'knee_l'
  | 'ankle_r' | 'ankle_l'
  | 'foot_r' | 'foot_l'

export const JOINT_KEYS: JointKey[] = [
  'pelvis', 'torso', 'head',
  'shoulder_r', 'shoulder_l', 'elbow_r', 'elbow_l', 'wrist_r', 'wrist_l', 'hand_r', 'hand_l',
  'hip_r', 'hip_l', 'knee_r', 'knee_l', 'ankle_r', 'ankle_l', 'foot_r', 'foot_l',
]

/** Per-frame trajectory for one joint. Index = frame number. */
export type Trajectory = (Vec3 | null)[]

/** A parsed capture reduced to the canonical joints the pipeline consumes. */
export interface CanonicalCapture {
  frameRate: number
  frameCount: number
  /** joint → per-frame position (mm) */
  joints: Record<JointKey, Trajectory>
}

/** One throw window inside a session capture. */
export interface ThrowWindow {
  throwNo: number
  startFrame: number
  endFrame: number
}

/** The three canonical event frames (foot-contact → ball-release holds the peak loads). */
export interface EventFrames {
  footContact: number
  maxExternalRotation: number
  release: number
  /** 0–1 detector confidence; low → excluded from the session median. */
  confidence: number
}

/** Six Driveline report buckets. Kinetics is a v1 placeholder (kinematics-only capture). */
export interface MetricBuckets {
  armAction: {
    shoulderAbduction: number       // deg, at foot contact (>135 = elbow-climb flag)
    horizontalAbduction: number     // deg, scap load
    elbowFlexion: number            // deg, at foot contact
  }
  lowerBody: {
    strideLengthPct: number         // % of athlete height
    trunkForwardTilt: number        // deg at release
    trunkLateralTilt: number        // deg at release (contralateral, arm-stress driver)
    leadKneeFlexionFC: number       // deg at foot contact
    leadKneeFlexionRelease: number  // deg at release
    leadKneeExtVelocity: number     // deg/s
    pelvisRotation: number          // deg toward target at foot contact
  }
  velocities: {
    pelvisAngVel: number            // deg/s peak
    trunkAngVel: number             // deg/s peak
    elbowExtVelocity: number        // deg/s peak
    shoulderIrVelocity: number      // deg/s peak (fastest human joint motion)
  }
  sequencing: {
    pelvisPeakTime: number          // s, relative to foot contact
    trunkPeakTime: number
    armPeakTime: number
    pelvisToTrunkGap: number        // s (~0.03–0.05 healthy proximal→distal)
  }
  hipShoulderSep: {
    maxSeparation: number           // deg
  }
  outcome: {
    maxExternalRotation: number     // deg (layback)
    relSpeedMph: number | null      // joined from TrackMan if paired, else null
  }
  kinetics: {
    status: 'pending_force_plates'
    note: string
  }
}

/** Metrics for a single throw plus its detected events. */
export interface ThrowMetrics {
  throwNo: number
  events: EventFrames
  metrics: MetricBuckets
  /** metrics judged directional-not-absolute (markerless rotational-shoulder caveat). */
  directionalKeys: string[]
  qcFlags: string[]
}

/** Flattened metric leaf keyed for percentile/flagging: "bucket.metric". */
export type MetricKey = string

/** Percentile position of a metric vs assessment_norms. */
export interface MetricPercentile {
  key: MetricKey
  value: number
  percentile: number         // 0–100
  norm50: number
  higherIsBetter: boolean
  directional: boolean
}

/** An auto-surfaced flag tied to a named training intervention. */
export interface Flag {
  key: MetricKey
  label: string
  value: number
  percentile: number
  divergence: number         // |value − norm50| normalized
  veloCorrelation: number
  score: number              // divergence × veloCorrelation (ranking)
  direction: 'high' | 'low'
  intervention: Intervention
}

export interface Intervention {
  title: string
  cue: string
  drills: string[]
  rationale: string
}

export type AthleteLevel = 'youth' | 'hs' | 'college' | 'pro'
