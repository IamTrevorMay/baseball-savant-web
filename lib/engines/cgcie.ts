import type {
  CGCIEInput,
  CGCIEOutput,
  SequenceRecommendation,
  SequenceInsight,
  PitchArsenal,
  BatterZone,
  TransitionRow,
  RecentABRow,
} from './types'

// ── Tunnel groups ───────────────────────────────────────────────────────────

const TUNNEL_GROUPS: Record<string, string> = {
  '4-Seam Fastball': 'high', 'Sinker': 'high',
  'Cutter': 'high', 'Slider': 'low',
  'Sweeper': 'low', 'Curveball': 'drop',
  'Knuckle Curve': 'drop', 'Changeup': 'low',
  'Splitter': 'low',
}

// ── Zone labels (from PAIE) ─────────────────────────────────────────────────

const ZONE_LABELS: Record<number, string> = {
  1: 'Up-In', 2: 'Up-Mid', 3: 'Up-Away',
  4: 'Mid-In', 5: 'Middle', 6: 'Mid-Away',
  7: 'Low-In', 8: 'Low-Mid', 9: 'Low-Away',
  11: 'High-In', 12: 'High-Away', 13: 'Low-In (chase)', 14: 'Low-Away (chase)',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function scoreBatterZone(z: BatterZone): number {
  const ev = z.avg_ev ?? 80
  const barrel = z.barrel_pct ?? 0
  const xwoba = z.xwoba ?? 0.250
  return (ev * 0.3) + (barrel * 0.4) + (xwoba * 300 * 0.3)
}

function getColdTarget(zones: BatterZone[]): string {
  if (!zones.length) return 'Down and away'
  const scored = zones.map(z => ({ zone: z.zone, score: scoreBatterZone(z) }))
  scored.sort((a, b) => a.score - b.score)
  return ZONE_LABELS[scored[0].zone] || 'Down and away'
}

function groupABs(rows: RecentABRow[]): { game_pk: number; at_bat_number: number; pitches: RecentABRow[] }[] {
  const map = new Map<string, RecentABRow[]>()
  for (const r of rows) {
    const key = `${r.game_pk}-${r.at_bat_number}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries()).map(([, pitches]) => ({
    game_pk: pitches[0].game_pk,
    at_bat_number: pitches[0].at_bat_number,
    pitches: pitches.sort((a, b) => a.pitch_number - b.pitch_number),
  }))
}

// ── Main CGCIE engine ───────────────────────────────────────────────────────

export function computeCGCIE(input: CGCIEInput): CGCIEOutput {
  const { arsenal, batterZones, h2h, transitions, currentSequence, count, recentABs } = input

  if (!arsenal.length) {
    const empty: SequenceRecommendation = {
      pitch_name: 'N/A', confidence: 0, target: 'N/A',
      rationale: ['No arsenal data available'], adjustments: [],
    }
    return { recommended: empty, secondary: empty, allPitches: [], insights: [], adjustments: [] }
  }

  const insights: SequenceInsight[] = []
  const globalAdj: { rule: string; delta: number }[] = []
  const lastPitch = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : null
  const secondLast = currentSequence.length > 1 ? currentSequence[currentSequence.length - 2] : null
  const abGroups = groupABs(recentABs)
  const target = getColdTarget(batterZones)

  // Build velo lookup from arsenal
  const veloMap = new Map<string, number>()
  for (const p of arsenal) {
    if (p.avg_velo) veloMap.set(p.pitch_name, p.avg_velo)
  }

  const avgDamage = batterZones.length
    ? batterZones.reduce((s, z) => s + scoreBatterZone(z), 0) / batterZones.length
    : 50

  // Score each pitch
  const pitchScores: SequenceRecommendation[] = arsenal.map(p => {
    const whiff = p.whiff_pct ?? 0
    const usage = p.usage_pct ?? 0

    // Baseline (PAIE-like)
    let confidence = (whiff * 0.4) + ((100 - avgDamage / 1.5) * 0.3) + (usage * 0.3)
    confidence = Math.max(0, Math.min(100, confidence))
    const adjustments: { rule: string; delta: number }[] = []
    const rationale: string[] = []

    // ── Rule 1: Repetition penalty (same as last) ───────────────────────
    if (lastPitch && p.pitch_name === lastPitch) {
      const delta = -12
      confidence += delta
      adjustments.push({ rule: 'Repetition', delta })
      rationale.push('Same pitch as last thrown — batter adjusts')
    }

    // ── Rule 2: Double repetition ───────────────────────────────────────
    if (lastPitch && secondLast && p.pitch_name === lastPitch && p.pitch_name === secondLast) {
      const delta = -25
      confidence += delta
      adjustments.push({ rule: 'Double repetition', delta })
      rationale.push('3rd consecutive — highly predictable')
    }

    // ── Rule 3: Recency discount ────────────────────────────────────────
    if (currentSequence.length > 0) {
      const occurrences = currentSequence.filter(s => s === p.pitch_name).length
      if (occurrences > 0) {
        const delta = -5 * occurrences
        confidence += delta
        adjustments.push({ rule: 'Recency', delta })
        rationale.push(`Thrown ${occurrences}x already this AB`)
      }
    }

    // ── Rule 4: Speed differential boost ────────────────────────────────
    if (lastPitch && veloMap.has(lastPitch) && veloMap.has(p.pitch_name)) {
      const lastVelo = veloMap.get(lastPitch)!
      const thisVelo = veloMap.get(p.pitch_name)!
      const gap = Math.abs(lastVelo - thisVelo)
      if (gap > 8) {
        const delta = gap > 12 ? 15 : Math.round(8 + (gap - 8) * 1.75)
        confidence += delta
        adjustments.push({ rule: 'Speed diff', delta })
        rationale.push(`${gap.toFixed(0)} mph gap from ${lastPitch}`)
      }
    }

    // ── Rule 5: Tunneling boost ─────────────────────────────────────────
    if (lastPitch) {
      const lastGroup = TUNNEL_GROUPS[lastPitch]
      const thisGroup = TUNNEL_GROUPS[p.pitch_name]
      if (lastGroup && thisGroup && lastGroup !== thisGroup) {
        const delta = 8
        confidence += delta
        adjustments.push({ rule: 'Tunnel', delta })
        rationale.push(`Different break trajectory from ${lastPitch}`)
      }
    }

    // ── Rule 6: Transition effectiveness (whiff) ────────────────────────
    if (lastPitch) {
      const trans = transitions.find(t => t.from_pitch === lastPitch && t.to_pitch === p.pitch_name)
      if (trans && trans.whiff_pct !== null && trans.whiff_pct > 25) {
        const delta = Math.min(12, Math.round(5 + (trans.whiff_pct - 25) * 0.35))
        confidence += delta
        adjustments.push({ rule: 'Transition whiff', delta })
        rationale.push(`${lastPitch} → ${p.pitch_name} has ${trans.whiff_pct}% whiff rate`)
      }
    }

    // ── Rule 7: Transition xwOBA penalty ────────────────────────────────
    if (lastPitch) {
      const trans = transitions.find(t => t.from_pitch === lastPitch && t.to_pitch === p.pitch_name)
      if (trans && trans.xwoba !== null && trans.xwoba > 0.380) {
        const delta = -10
        confidence += delta
        adjustments.push({ rule: 'Transition damage', delta })
        rationale.push(`${lastPitch} → ${p.pitch_name} xwOBA ${trans.xwoba.toFixed(3)}`)
      }
    }

    // ── Rule 8: Pattern disruption ──────────────────────────────────────
    if (abGroups.length >= 3 && currentSequence.length < 3) {
      const pitchNum = currentSequence.length + 1
      const matchingPitches = abGroups
        .map(ab => ab.pitches.find(pp => pp.pitch_number === pitchNum))
        .filter(Boolean)
        .map(pp => pp!.pitch_name)
      if (matchingPitches.length >= 3) {
        const counts = new Map<string, number>()
        for (const pn of matchingPitches) counts.set(pn, (counts.get(pn) || 0) + 1)
        for (const [pitchName, ct] of counts) {
          const pct = ct / matchingPitches.length
          if (pct > 0.6 && p.pitch_name !== pitchName) {
            const delta = 8
            confidence += delta
            adjustments.push({ rule: 'Pattern break', delta })
            rationale.push(`Breaks pattern — usually ${pitchName} here`)
          }
        }
      }
    }

    // ── Rule 9: First-pitch tendencies ──────────────────────────────────
    if (currentSequence.length === 0 && usage > 60) {
      const delta = -8
      confidence += delta
      adjustments.push({ rule: '1st pitch predictable', delta })
      rationale.push(`${usage.toFixed(0)}% usage — too predictable as opener`)
    }

    // ── Rule 10: H2H damage ─────────────────────────────────────────────
    const h2hMatch = h2h.find(r => r.pitch_name === p.pitch_name)
    if (h2hMatch && h2hMatch.xwoba !== null && h2hMatch.xwoba > 0.380) {
      const delta = -12
      confidence += delta
      adjustments.push({ rule: 'H2H damage', delta })
      rationale.push(`Batter xwOBA ${h2hMatch.xwoba.toFixed(3)} vs ${p.pitch_name}`)
    }

    // ── Rule 11: H2H whiff exploit ──────────────────────────────────────
    if (h2hMatch && h2hMatch.whiff_pct !== null && h2hMatch.whiff_pct > 30) {
      const delta = 8
      confidence += delta
      adjustments.push({ rule: 'H2H whiff', delta })
      rationale.push(`Batter whiffs ${h2hMatch.whiff_pct.toFixed(0)}% vs ${p.pitch_name}`)
    }

    // ── Rule 12: Put-away count boost ───────────────────────────────────
    const isPitcherCount = (count.strikes === 2 && count.balls <= 1)
    if (isPitcherCount) {
      const maxWhiff = Math.max(...arsenal.map(a => a.whiff_pct ?? 0))
      if ((p.whiff_pct ?? 0) === maxWhiff && maxWhiff > 0) {
        const delta = 10
        confidence += delta
        adjustments.push({ rule: 'Put-away count', delta })
        rationale.push(`Best whiff pitch at ${whiff.toFixed(0)}% — 2-strike count`)
      }
    }

    // ── Rule 13: Hitter count penalty ───────────────────────────────────
    const isFastball = ['4-Seam Fastball', 'Sinker', 'Fastball'].includes(p.pitch_name)
    const isHitterCount = (count.balls >= 2 && count.strikes <= 1) || count.balls === 3
    if (isHitterCount && isFastball) {
      const delta = -8
      confidence += delta
      adjustments.push({ rule: 'Hitter count', delta })
      rationale.push('Hitter count — batter sitting fastball')
    }

    confidence = Math.max(0, Math.min(100, Math.round(confidence)))

    return {
      pitch_name: p.pitch_name,
      confidence,
      target,
      rationale,
      adjustments,
    }
  })

  // ── Generate insights ───────────────────────────────────────────────────

  // Repetition warning
  if (lastPitch && secondLast && lastPitch === secondLast) {
    insights.push({
      type: 'repetition',
      level: 'warning',
      message: `Repetition warning: 2 consecutive ${lastPitch}s — batter timing likely adjusted`,
    })
  } else if (lastPitch && currentSequence.filter(s => s === lastPitch).length >= 2) {
    insights.push({
      type: 'repetition',
      level: 'info',
      message: `${lastPitch} thrown ${currentSequence.filter(s => s === lastPitch).length}x this AB`,
    })
  }

  // Tunnel opportunities
  if (lastPitch) {
    const lastGroup = TUNNEL_GROUPS[lastPitch]
    if (lastGroup) {
      const tunnelOpts = arsenal.filter(p => {
        const g = TUNNEL_GROUPS[p.pitch_name]
        return g && g !== lastGroup && p.pitch_name !== lastPitch
      })
      if (tunnelOpts.length > 0) {
        const best = tunnelOpts.sort((a, b) => (b.whiff_pct ?? 0) - (a.whiff_pct ?? 0))[0]
        insights.push({
          type: 'tunnel',
          level: 'info',
          message: `Tunnel opportunity: ${best.pitch_name} after ${lastPitch} exploits similar release trajectory`,
        })
      }
    }
  }

  // Speed differential
  if (lastPitch && veloMap.has(lastPitch)) {
    const lastVelo = veloMap.get(lastPitch)!
    const bigGaps = arsenal
      .filter(p => veloMap.has(p.pitch_name) && Math.abs(veloMap.get(p.pitch_name)! - lastVelo) > 10)
      .sort((a, b) => Math.abs(veloMap.get(b.pitch_name)! - lastVelo) - Math.abs(veloMap.get(a.pitch_name)! - lastVelo))
    if (bigGaps.length > 0) {
      const best = bigGaps[0]
      const gap = Math.abs(veloMap.get(best.pitch_name)! - lastVelo)
      insights.push({
        type: 'speed-diff',
        level: 'info',
        message: `Speed differential: ${gap.toFixed(0)} mph gap from ${lastPitch} (${lastVelo.toFixed(0)}) → ${best.pitch_name} (${veloMap.get(best.pitch_name)!.toFixed(0)})`,
      })
    }
  }

  // Pattern alert
  if (abGroups.length >= 4 && currentSequence.length === 0) {
    const firstPitches = abGroups
      .map(ab => ab.pitches.find(p => p.pitch_number === 1))
      .filter(Boolean)
      .map(p => p!.pitch_name)
    const counts = new Map<string, number>()
    for (const pn of firstPitches) counts.set(pn, (counts.get(pn) || 0) + 1)
    for (const [pitchName, ct] of counts) {
      if (ct / firstPitches.length >= 0.75) {
        insights.push({
          type: 'pattern',
          level: 'warning',
          message: `Pattern alert: First-pitch ${pitchName} in ${ct} of last ${firstPitches.length} ABs vs this batter`,
        })
      }
    }
  }

  // Transition insight (best combo available)
  if (lastPitch) {
    const bestTrans = transitions
      .filter(t => t.from_pitch === lastPitch && t.whiff_pct !== null && t.whiff_pct > 30)
      .sort((a, b) => (b.whiff_pct ?? 0) - (a.whiff_pct ?? 0))
    if (bestTrans.length > 0) {
      const t = bestTrans[0]
      insights.push({
        type: 'transition',
        level: 'info',
        message: `Strong transition: ${t.from_pitch} → ${t.to_pitch} generates ${t.whiff_pct}% whiff rate (${t.freq} occurrences)`,
      })
    }
  }

  // Sort by confidence
  pitchScores.sort((a, b) => b.confidence - a.confidence)
  const recommended = pitchScores[0]
  const secondary = pitchScores.length > 1 ? pitchScores[1] : recommended

  return {
    recommended,
    secondary,
    allPitches: pitchScores,
    insights,
    adjustments: globalAdj,
  }
}
