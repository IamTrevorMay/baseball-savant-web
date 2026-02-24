import type {
  HAIEInput,
  HAIEOutput,
  ApproachMode,
  SitOnZone,
  ChaseWarning,
  TwoStrikeMode,
  HitterZoneScore,
  CountAdvantageInfo,
  BatterZone,
  ChaseRegion,
  PitchArsenal,
} from './types'

// ── Zone labels (same as PAIE) ──────────────────────────────────────────────
const ZONE_LABELS: Record<number, string> = {
  1: 'Up-In', 2: 'Up-Mid', 3: 'Up-Away',
  4: 'Mid-In', 5: 'Middle', 6: 'Mid-Away',
  7: 'Low-In', 8: 'Low-Mid', 9: 'Low-Away',
  11: 'High-In', 12: 'High-Away', 13: 'Low-In (chase)', 14: 'Low-Away (chase)',
}

// Reverse lookup: which pitcher pitches exploit each chase quadrant
const PITCH_CHASE_REACH: Record<string, string[]> = {
  'Slider': ['down-right', 'down-left'],
  'SL': ['down-right', 'down-left'],
  'Sweeper': ['down-right', 'down-left'],
  'ST': ['down-right', 'down-left'],
  'Curveball': ['down-left', 'down-right'],
  'CU': ['down-left', 'down-right'],
  'Changeup': ['down-left', 'down-right'],
  'CH': ['down-left', 'down-right'],
  'Splitter': ['down-left', 'down-right'],
  'FS': ['down-left', 'down-right'],
  'Cutter': ['down-right', 'up-right'],
  'FC': ['down-right', 'up-right'],
  '4-Seam Fastball': ['up-left', 'up-right'],
  'FF': ['up-left', 'up-right'],
  'Sinker': ['down-left', 'down-right'],
  'SI': ['down-left', 'down-right'],
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function scoreBatterZone(z: BatterZone): number {
  const ev = z.avg_ev ?? 80
  const barrel = z.barrel_pct ?? 0
  const xwoba = z.xwoba ?? 0.250
  return (ev * 0.3) + (barrel * 0.4) + (xwoba * 300 * 0.3)
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function getApproachMode(balls: number, strikes: number): ApproachMode {
  const count = `${balls}-${strikes}`
  const aggressive = ['1-0', '2-0', '2-1', '3-0', '3-1']
  const protective = ['0-1', '0-2', '1-2', '2-2', '3-2']
  if (aggressive.includes(count)) return 'aggressive'
  if (protective.includes(count)) return 'protective'
  return 'neutral'
}

function isFastball(pitchName: string): boolean {
  return ['4-Seam Fastball', 'FF', 'Sinker', 'SI', 'Fastball', 'FA'].includes(pitchName)
}

// Find which pitcher pitches can reach a given quadrant
function pitchesExploitingQuadrant(quadrant: string, arsenal: PitchArsenal[]): string[] {
  const result: string[] = []
  for (const p of arsenal) {
    const reach = PITCH_CHASE_REACH[p.pitch_name] || []
    if (reach.includes(quadrant)) result.push(p.pitch_name)
  }
  return result
}

// ── Main HAIE engine ────────────────────────────────────────────────────────

export function computeHAIE(input: HAIEInput): HAIEOutput {
  const { arsenal, veloTrend, batterZones, chaseProfile, countProfile, h2h, count } = input
  const { balls, strikes } = count

  // ── Approach mode ───────────────────────────────────────────────────────
  const approachMode = getApproachMode(balls, strikes)

  // ── Detect fatigue ──────────────────────────────────────────────────────
  const seasonVelos = veloTrend.map(v => v.avg_velo).filter(v => v > 0)
  const seasonBaseline = seasonVelos.length ? seasonVelos.reduce((a, b) => a + b, 0) / seasonVelos.length : null
  const recent3 = veloTrend.slice(-3).map(v => v.avg_velo).filter(v => v > 0)
  const recentAvg = recent3.length ? recent3.reduce((a, b) => a + b, 0) / recent3.length : null
  const fatigueDetected = seasonBaseline !== null && recentAvg !== null && (seasonBaseline - recentAvg) > 1
  const veloDrop = fatigueDetected ? seasonBaseline! - recentAvg! : 0
  const fatigueMessage = fatigueDetected
    ? `Pitcher velo down ${veloDrop.toFixed(1)} mph — sit fastball, expect location mistakes.`
    : null

  // ── Score batter zones (hitter perspective: high = attack) ──────────────
  const rawZoneScores = batterZones.map(z => ({
    zone: z.zone,
    score: scoreBatterZone(z),
  }))
  const allScores = rawZoneScores.map(z => z.score)
  const p70 = allScores.length ? percentile(allScores, 70) : 50
  const p30 = allScores.length ? percentile(allScores, 30) : 30
  const hitterZoneScores: HitterZoneScore[] = rawZoneScores.map(z => ({
    zone: z.zone,
    score: z.score,
    label: z.score >= p70 ? 'attack' : z.score <= p30 ? 'avoid' : 'neutral',
  }))

  // ── Sit-on zones (top 3 attack zones) ──────────────────────────────────
  const attackZones = hitterZoneScores
    .filter(z => z.label === 'attack')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  const sitOnZones: SitOnZone[] = attackZones.map(z => {
    const bz = batterZones.find(b => b.zone === z.zone)
    return {
      zone: z.zone,
      zoneName: ZONE_LABELS[z.zone] || `Zone ${z.zone}`,
      avg_ev: bz?.avg_ev ?? null,
      barrel_pct: bz?.barrel_pct ?? null,
      xwoba: bz?.xwoba ?? null,
      score: z.score,
    }
  })

  // ── Sit-on pitch ───────────────────────────────────────────────────────
  let sitOnPitch: string
  if (fatigueDetected) {
    sitOnPitch = 'Fastball'
  } else if (approachMode === 'aggressive') {
    sitOnPitch = 'Fastball'
  } else if (approachMode === 'protective') {
    sitOnPitch = 'Any in zone'
  } else {
    // Neutral: sit pitcher's most-used pitch
    const sorted = [...arsenal].sort((a, b) => b.usage_pct - a.usage_pct)
    sitOnPitch = sorted.length ? sorted[0].pitch_name : 'Fastball'
  }

  // ── Take-until rule ────────────────────────────────────────────────────
  const countStr = `${balls}-${strikes}`
  const zoneNames = sitOnZones.slice(0, 3).map(z => z.zoneName).join('/')
  let takeUntilRule: string
  if (countStr === '3-0' || countStr === '3-1') {
    takeUntilRule = `Green light — sit ${sitOnPitch} in ${zoneNames || 'damage zone'}, take everything else`
  } else if (approachMode === 'aggressive') {
    takeUntilRule = `Look for ${sitOnPitch} in ${zoneNames || 'damage zone'} — take if it's not there`
  } else if (strikes === 2) {
    takeUntilRule = 'Expand zone, protect the plate — fight off tough pitches'
  } else if (countStr === '3-2') {
    takeUntilRule = 'Full count — shorten up, anything close put in play'
  } else if (approachMode === 'neutral') {
    takeUntilRule = `Hunt ${sitOnPitch} in ${zoneNames || 'zones'} — take borderline pitches`
  } else {
    takeUntilRule = 'Expand zone, protect the plate — fight off tough pitches'
  }

  // ── Chase avoidance warnings ───────────────────────────────────────────
  const chaseWarnings: ChaseWarning[] = chaseProfile
    .map(r => {
      const swing = r.swing_pct ?? 0
      const whiff = r.whiff_pct ?? 0
      const severity = swing * whiff / 100 // composite severity
      const exploitedBy = pitchesExploitingQuadrant(r.quadrant, arsenal)
      let tip: string
      if (r.quadrant.startsWith('down')) {
        tip = `Lay off pitches below the zone ${r.quadrant.includes('right') ? 'away' : 'inside'} — pitcher has ${exploitedBy.join(', ') || 'offspeed'} to exploit this`
      } else {
        tip = `Don't chase elevated pitches ${r.quadrant.includes('right') ? 'away' : 'inside'} — spit on ${exploitedBy.join(', ') || 'fastballs'} up there`
      }
      return {
        quadrant: r.quadrant,
        swing_pct: swing,
        whiff_pct: whiff,
        severity,
        exploitedBy,
        tip,
      }
    })
    .filter(w => w.swing_pct > 25 && w.whiff_pct > 30)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)

  // ── Two-strike mode (only when strikes === 2) ─────────────────────────
  let twoStrikeMode: TwoStrikeMode | null = null
  if (strikes === 2) {
    const byWhiff = [...arsenal].sort((a, b) => (b.whiff_pct ?? 0) - (a.whiff_pct ?? 0))
    const expectPitch = byWhiff.length ? byWhiff[0].pitch_name : 'Breaking ball'
    const offspeed = arsenal.filter(p => !isFastball(p.pitch_name)).sort((a, b) => b.usage_pct - a.usage_pct)
    const protectAgainst = offspeed.length ? offspeed[0].pitch_name : 'Offspeed'
    twoStrikeMode = {
      expectPitch,
      protectAgainst,
      strategy: `Expect ${expectPitch}, protect against ${protectAgainst}, shorten swing, put ball in play`,
    }
  }

  // ── Count advantage info ──────────────────────────────────────────────
  const currentCount = countProfile.find(c => c.balls === balls && c.strikes === strikes)
  const countXwoba = currentCount?.xwoba ?? null
  const countLabel: CountAdvantageInfo['label'] = countXwoba === null ? 'neutral'
    : countXwoba > 0.340 ? 'hitter'
    : countXwoba < 0.280 ? 'pitcher'
    : 'neutral'
  const countAdvantage: CountAdvantageInfo = {
    count: countStr,
    xwoba: countXwoba,
    label: countLabel,
  }

  // ── Confidence scoring ────────────────────────────────────────────────
  let confidence = 50
  const adjustments: { rule: string; delta: number }[] = []
  const rationale: string[] = []

  // Attack zone boosts
  for (const z of sitOnZones) {
    const bz = batterZones.find(b => b.zone === z.zone)
    if (bz) {
      if ((bz.avg_ev ?? 0) > 90) {
        confidence += 5
        adjustments.push({ rule: `Zone ${z.zone} EV`, delta: +5 })
      }
      if ((bz.barrel_pct ?? 0) > 10) {
        confidence += 3
        adjustments.push({ rule: `Zone ${z.zone} barrel`, delta: +3 })
      }
      if ((bz.xwoba ?? 0) > 0.400) {
        confidence += 4
        adjustments.push({ rule: `Zone ${z.zone} xwOBA`, delta: +4 })
      }
    }
  }

  // Chase tendency penalties
  for (const w of chaseWarnings) {
    if (w.severity > 15) {
      confidence -= 8
      adjustments.push({ rule: `Chase ${w.quadrant}`, delta: -8 })
    } else {
      confidence -= 4
      adjustments.push({ rule: `Chase ${w.quadrant}`, delta: -4 })
    }
  }

  // Count adjustments
  if (approachMode === 'aggressive') {
    confidence += 10
    adjustments.push({ rule: 'Hitter count', delta: +10 })
    rationale.push(`Hitter's count (${countStr}) — sit on pitch and drive it`)
  } else if (approachMode === 'protective') {
    confidence -= 10
    adjustments.push({ rule: 'Pitcher count', delta: -10 })
    rationale.push(`Pitcher's count (${countStr}) — protect the plate`)
  } else {
    rationale.push(`Neutral count (${countStr}) — hunt the right pitch`)
  }

  // Fatigue boost
  if (fatigueDetected) {
    confidence += 10
    adjustments.push({ rule: 'Fatigue exploit', delta: +10 })
    rationale.push(`Pitcher velo down ${veloDrop.toFixed(1)} mph — sit fastball`)
  }

  // H2H xwOBA
  const totalH2HPitches = h2h.reduce((s, r) => s + r.pitches, 0)
  if (totalH2HPitches > 0) {
    const weightedXwoba = h2h.reduce((s, r) => s + (r.xwoba ?? 0) * r.pitches, 0) / totalH2HPitches
    if (weightedXwoba > 0.370) {
      confidence += 8
      adjustments.push({ rule: 'H2H advantage', delta: +8 })
      rationale.push(`H2H xwOBA ${weightedXwoba.toFixed(3)} — hitter owns this pitcher`)
    } else if (weightedXwoba < 0.250) {
      confidence -= 8
      adjustments.push({ rule: 'H2H disadvantage', delta: -8 })
      rationale.push(`H2H xwOBA ${weightedXwoba.toFixed(3)} — pitcher dominates this matchup`)
    }
  }

  // Count-specific xwOBA
  if (countXwoba !== null) {
    if (countXwoba > 0.370) {
      confidence += 5
      adjustments.push({ rule: 'Count xwOBA', delta: +5 })
    } else if (countXwoba < 0.250) {
      confidence -= 5
      adjustments.push({ rule: 'Count xwOBA', delta: -5 })
    }
  }

  // Sit-on zone rationale
  if (sitOnZones.length > 0) {
    rationale.push(`${sitOnZones.length} attack zone${sitOnZones.length > 1 ? 's' : ''}: ${sitOnZones.map(z => z.zoneName).join(', ')}`)
  }
  if (chaseWarnings.length > 0) {
    rationale.push(`${chaseWarnings.length} chase weakness${chaseWarnings.length > 1 ? 'es' : ''} to avoid`)
  }

  confidence = Math.max(0, Math.min(100, Math.round(confidence)))

  return {
    approachMode,
    confidence,
    sitOnPitch,
    sitOnZones,
    takeUntilRule,
    chaseWarnings,
    twoStrikeMode,
    hitterZoneScores,
    rationale,
    fatigueDetected,
    fatigueMessage,
    seasonBaselineVelo: seasonBaseline,
    recentVelo: recentAvg,
    countAdvantage,
    adjustments,
  }
}
