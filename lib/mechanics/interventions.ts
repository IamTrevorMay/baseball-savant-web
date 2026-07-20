// Flag → named training intervention map.
//
// Every auto-surfaced flag ties to a concrete prescription. A report that displays a
// divergent metric but names no drill is inert (Soto/biomechanics/08 §5). Prescription
// discipline: root cause before symptom, ROM → strength → movement application.
// `direction` is which tail of the metric the flag fires on.

import type { Intervention, MetricKey } from './types'

type Direction = 'high' | 'low'

const MAP: Record<MetricKey, Partial<Record<Direction, Intervention>>> = {
  'armAction.shoulderAbduction': {
    high: {
      title: 'Elbow Climb',
      cue: '"Elbow back and down"',
      drills: ['Pivot pickoffs', 'Scap-retraction throws', 'Wall posture holds'],
      rationale: 'Shoulder abduction >135° at foot contact climbs the elbow above the shoulder line, an inefficiency + stress flag.',
    },
    low: {
      title: 'Low Arm Slot Load',
      cue: '"Get the arm up to 90"',
      drills: ['Scap load drills', 'Connection ball throws'],
      rationale: 'Under-abducted arm at foot contact undercuts the arm-cocking position.',
    },
  },
  'armAction.horizontalAbduction': {
    low: {
      title: 'Poor Scap Retraction',
      cue: '"Pinch the shoulder blades"',
      drills: ['Scap-retraction throws', 'Band pull-aparts', 'Prone Y-T-W'],
      rationale: 'Low scap load reduces the elastic arm-action contribution.',
    },
  },
  'lowerBody.strideLengthPct': {
    low: {
      title: 'Short Stride',
      cue: '"Cover more ground down the mound"',
      drills: ['Walking windups', 'Hip-lead marches', 'Broad-jump plyos'],
      rationale: 'Stride well under ~85% of height truncates linear energy into the throw.',
    },
  },
  'lowerBody.trunkLateralTilt': {
    high: {
      title: 'Late Lateral Trunk Lean (Arm-Stress Flag)',
      cue: '"Stay stacked over the front leg"',
      drills: ['Posture/stack holds', 'Tall-spine med-ball rotations'],
      rationale: 'Each ~10° of contralateral tilt at release adds ~4 N·m of elbow varus moment — a health flag, not a velo lever.',
    },
  },
  'lowerBody.leadKneeFlexionRelease': {
    high: {
      title: 'Poor Lead-Leg Block',
      cue: '"Post and firm up the front leg"',
      drills: ['Front-leg iso work', 'Blocking-focused plyo transfer', 'Single-leg RDL'],
      rationale: 'A collapsing (over-flexed) lead knee at release bleeds off rotational power the block should return.',
    },
  },
  'lowerBody.leadKneeExtVelocity': {
    low: {
      title: 'Weak Lead-Leg Extension',
      cue: '"Push the ground away at release"',
      drills: ['Front-leg iso extension', 'Depth-drop to stick', 'Hip-hinge power work'],
      rationale: 'Lead-knee extension velocity is velocity-correlated; low values mean the block is not returning energy.',
    },
  },
  'hipShoulderSep.maxSeparation': {
    low: {
      title: 'Low Hip–Shoulder Separation',
      cue: '"Let the hips lead, keep the chest closed"',
      drills: ['Hip mobility', 'Thoracic-rotation work', 'Constraint/step-behind med-ball'],
      rationale: 'Address hip + thoracic ROM and core strength FIRST — do not cue more separation into a body that cannot rotate.',
    },
  },
  'lowerBody.trunkForwardTilt': {
    low: {
      title: 'Upright at Release',
      cue: '"Get the chest to the thigh"',
      drills: ['Hinge-and-throw drills', 'Posture progressions'],
      rationale: 'Insufficient forward trunk tilt at release shortens the effective release and leaks velocity.',
    },
  },
  'outcome.maxExternalRotation': {
    low: {
      title: 'Limited Layback',
      cue: '"Let the arm lay back"',
      drills: ['Sleeper-adjacent ROM (monitor GIRD)', 'Rhythm/connection throws'],
      rationale: 'Insufficient MER caps internal-rotation velocity and thus ball velocity — screen ROM before forcing it.',
    },
  },
}

/** Look up the intervention for a metric + firing direction; generic fallback if unmapped. */
export function interventionFor(key: MetricKey, direction: Direction, label: string): Intervention {
  const hit = MAP[key]?.[direction]
  if (hit) return hit
  return {
    title: `${direction === 'high' ? 'Elevated' : 'Low'} ${label}`,
    cue: 'Review with pitching coach',
    drills: ['Coach review'],
    rationale: `${label} diverges from the normative band; assess in context before prescribing.`,
  }
}
