import type {
  PAIEInput,
  PAIEOutput,
  PitchRecommendation,
  ZoneScore,
  PitchArsenal,
  BatterZone,
  ChaseRegion,
} from './types'

// ── Zone geometry (Statcast zones 1-14) ─────────────────────────────────────
// Zones 1-9 = strike zone grid (3x3), 11-14 = outside corners
const ZONE_LABELS: Record<number, string> = {
  1: 'Up-In', 2: 'Up-Mid', 3: 'Up-Away',
  4: 'Mid-In', 5: 'Middle', 6: 'Mid-Away',
  7: 'Low-In', 8: 'Low-Mid', 9: 'Low-Away',
  11: 'High-In', 12: 'High-Away', 13: 'Low-In (chase)', 14: 'Low-Away (chase)',
}

// Map pitch types to typical target quadrants for chase boost
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

function getTargetLabel(arsenal: PitchArsenal, zoneScores: ZoneScore[]): string {
  const cold = zoneScores.filter(z => z.label === 'cold')
  if (!cold.length) return 'Down and away'
  const best = cold.sort((a, b) => a.score - b.score)[0]
  return ZONE_LABELS[best.zone] || 'Down and away'
}

function getChaseBoost(pitchName: string, chaseProfile: ChaseRegion[]): number {
  const reachable = PITCH_CHASE_REACH[pitchName] || []
  let boost = 0
  for (const region of chaseProfile) {
    if (!reachable.includes(region.quadrant)) continue
    const swing = region.swing_pct ?? 0
    const whiff = region.whiff_pct ?? 0
    if (swing > 30 && whiff > 35) {
      boost += Math.min(20, Math.round((swing - 30) * 0.5 + (whiff - 35) * 0.5))
    }
  }
  return Math.min(20, boost)
}

// ── Main PAIE engine ────────────────────────────────────────────────────────

export function computePAIE(input: PAIEInput): PAIEOutput {
  const { arsenal, veloTrend, batterZones, chaseProfile, countProfile, h2h, count, tto } = input

  if (!arsenal.length) {
    const empty: PitchRecommendation = {
      pitch_name: 'N/A',
      confidence: 0,
      target: 'N/A',
      rationale: ['No arsenal data available'],
      adjustments: [],
    }
    return {
      primary: empty,
      secondary: empty,
      avoid: [],
      zoneScores: [],
      allPitches: [],
      fatigueDetected: false,
      seasonBaselineVelo: null,
      recentVelo: null,
    }
  }

  // ── Score batter zones ──────────────────────────────────────────────────
  const rawZoneScores = batterZones.map(z => ({
    zone: z.zone,
    score: scoreBatterZone(z),
  }))
  const allScores = rawZoneScores.map(z => z.score)
  const p70 = allScores.length ? percentile(allScores, 70) : 50
  const p30 = allScores.length ? percentile(allScores, 30) : 30
  const zoneScores: ZoneScore[] = rawZoneScores.map(z => ({
    zone: z.zone,
    score: z.score,
    label: z.score >= p70 ? 'danger' : z.score <= p30 ? 'cold' : 'neutral',
  }))

  // ── Detect fatigue ──────────────────────────────────────────────────────
  const seasonVelos = veloTrend.map(v => v.avg_velo).filter(v => v > 0)
  const seasonBaseline = seasonVelos.length ? seasonVelos.reduce((a, b) => a + b, 0) / seasonVelos.length : null
  const recent3 = veloTrend.slice(-3).map(v => v.avg_velo).filter(v => v > 0)
  const recentAvg = recent3.length ? recent3.reduce((a, b) => a + b, 0) / recent3.length : null
  const fatigueDetected = seasonBaseline !== null && recentAvg !== null && (seasonBaseline - recentAvg) > 1

  // ── Score each pitch ────────────────────────────────────────────────────
  const pitchScores: PitchRecommendation[] = arsenal.map(p => {
    const whiff = p.whiff_pct ?? 0
    const avgDamage = batterZones.length
      ? batterZones.reduce((s, z) => s + scoreBatterZone(z), 0) / batterZones.length
      : 50
    const usage = p.usage_pct ?? 0

    // Base score
    let confidence = (whiff * 0.4) + ((100 - avgDamage / 1.5) * 0.3) + (usage * 0.3)
    confidence = Math.max(0, Math.min(100, confidence))
    const adjustments: { rule: string; delta: number }[] = []
    const rationale: string[] = []

    const isFastball = ['4-Seam Fastball', 'FF', 'Sinker', 'SI', 'Fastball', 'FA'].includes(p.pitch_name)
    const isOffspeed = !isFastball

    // Rule 1: Fatigue
    if (fatigueDetected) {
      if (isFastball) {
        confidence -= 15
        adjustments.push({ rule: 'Fatigue', delta: -15 })
        rationale.push(`Velo down ${(seasonBaseline! - recentAvg!).toFixed(1)} mph vs season avg`)
      } else {
        confidence += 10
        adjustments.push({ rule: 'Fatigue', delta: +10 })
        rationale.push('Offspeed favored due to velo decline')
      }
    }

    // Rule 2: Damage zone penalty/boost
    const dangerZones = zoneScores.filter(z => z.label === 'danger')
    const coldZones = zoneScores.filter(z => z.label === 'cold')
    if (coldZones.length > 0) {
      rationale.push(`${coldZones.length} cold zones available to target`)
    }
    if (dangerZones.length > 3) {
      rationale.push(`${dangerZones.length} danger zones — locate carefully`)
    }

    // Rule 3: Chase zone boost
    const chaseBoost = getChaseBoost(p.pitch_name, chaseProfile)
    if (chaseBoost > 0) {
      confidence += chaseBoost
      adjustments.push({ rule: 'Chase zones', delta: chaseBoost })
      const regions = PITCH_CHASE_REACH[p.pitch_name] || []
      const matchingRegions = chaseProfile.filter(
        r => regions.includes(r.quadrant) && (r.swing_pct ?? 0) > 30 && (r.whiff_pct ?? 0) > 35
      )
      if (matchingRegions.length) {
        const best = matchingRegions[0]
        rationale.push(
          `Chases ${best.quadrant} at ${best.swing_pct?.toFixed(0)}% swing, ${best.whiff_pct?.toFixed(0)}% whiff`
        )
      }
    }

    // Rule 4: Exposure penalty (TTO >= 3)
    if (tto >= 3) {
      const primaryPitch = [...arsenal].sort((a, b) => b.usage_pct - a.usage_pct)[0]
      if (p.pitch_name === primaryPitch.pitch_name) {
        confidence -= 10
        adjustments.push({ rule: 'Exposure (3rd TTO)', delta: -10 })
        rationale.push('Primary pitch penalized — 3rd time through')
      } else {
        confidence += 5
        adjustments.push({ rule: 'Exposure (3rd TTO)', delta: +5 })
      }
      // Check H2H xwOBA for this pitch
      const matchup = h2h.find(r => r.pitch_name === p.pitch_name)
      if (matchup && matchup.xwoba !== null && matchup.xwoba > 0.380) {
        confidence -= 15
        adjustments.push({ rule: 'H2H damage', delta: -15 })
        rationale.push(`H2H xwOBA ${matchup.xwoba.toFixed(3)} — batter owns this pitch`)
      }
    }

    // Rule 5: Count adjustments
    const isHitterCount = (count.balls >= 2 && count.strikes <= 1) || (count.balls === 3)
    const isPitcherCount = count.strikes === 2 && count.balls <= 1
    if (isHitterCount) {
      if (isFastball) {
        confidence -= 10
        adjustments.push({ rule: 'Hitter count', delta: -10 })
        rationale.push('Hitter count — batter sitting fastball')
      } else {
        confidence += 10
        adjustments.push({ rule: 'Hitter count', delta: +10 })
        rationale.push('Hitter count — offspeed has advantage')
      }
    }
    if (isPitcherCount) {
      // Boost highest whiff pitch
      const maxWhiff = Math.max(...arsenal.map(a => a.whiff_pct ?? 0))
      if ((p.whiff_pct ?? 0) === maxWhiff && maxWhiff > 0) {
        confidence += 10
        adjustments.push({ rule: 'Pitcher count', delta: +10 })
        rationale.push(`Best whiff pitch at ${whiff.toFixed(0)}% — put-away count`)
      }
    }

    // Whiff rate context
    if (whiff > 30) {
      rationale.push(`${whiff.toFixed(0)}% whiff rate`)
    }

    confidence = Math.max(0, Math.min(100, confidence))

    return {
      pitch_name: p.pitch_name,
      confidence: Math.round(confidence),
      target: getTargetLabel(p, zoneScores),
      rationale,
      adjustments,
    }
  })

  // Sort by confidence
  pitchScores.sort((a, b) => b.confidence - a.confidence)
  const primary = pitchScores[0]
  const secondary = pitchScores.length > 1 ? pitchScores[1] : primary

  // Build avoid list: pitches in batter hot zones
  const avoid: PAIEOutput['avoid'] = []
  for (const p of arsenal) {
    for (const z of dangerZonesFromScores(zoneScores)) {
      const bz = batterZones.find(bz => bz.zone === z.zone)
      if (bz && (bz.avg_ev ?? 0) > 90) {
        avoid.push({
          pitch_name: p.pitch_name,
          zone: ZONE_LABELS[z.zone] || `Zone ${z.zone}`,
          reason: `EV: ${bz.avg_ev?.toFixed(1)}, Barrel: ${bz.barrel_pct?.toFixed(0)}%`,
        })
      }
    }
  }
  // Deduplicate by zone
  const seenZones = new Set<string>()
  const uniqueAvoid = avoid.filter(a => {
    const key = a.zone
    if (seenZones.has(key)) return false
    seenZones.add(key)
    return true
  })

  return {
    primary,
    secondary,
    avoid: uniqueAvoid.slice(0, 4),
    zoneScores,
    allPitches: pitchScores,
    fatigueDetected,
    seasonBaselineVelo: seasonBaseline,
    recentVelo: recentAvg,
  }
}

function dangerZonesFromScores(zs: ZoneScore[]): ZoneScore[] {
  return zs.filter(z => z.label === 'danger')
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
