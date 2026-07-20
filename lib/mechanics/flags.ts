// Flag engine — surface the 2–3 metrics most worth acting on.
//
// Rank by (divergence-from-norm × velocity-correlation), so a metric only rises if it
// is both off-center AND matters to this athlete's velocity/stress ceiling. Each flag
// carries its intervention. Directional (markerless-proxy) metrics are down-weighted
// so a noisy rotational estimate can't dominate the list.

import type { Flag, MetricPercentile } from './types'
import { METRIC_DEF_BY_KEY } from './norms'
import { interventionFor } from './interventions'
import { labelOf } from './percentile'

/** Divergence in [0,1]: how far the percentile sits from the 50th, scaled. */
function divergence(p: MetricPercentile): number {
  return Math.min(1, Math.abs(p.percentile - 50) / 50)
}

/**
 * Rank flags. A metric fires when its percentile is beyond a band edge (default 25/75)
 * on the "worse" side per higherIsBetter. Returns top `limit` by score.
 */
export function computeFlags(percentiles: MetricPercentile[], limit = 3): Flag[] {
  const flags: Flag[] = []
  for (const p of percentiles) {
    const def = METRIC_DEF_BY_KEY[p.key]
    if (!def) continue

    // Which tail is "worse"? higherIsBetter → low percentile is bad; else high is bad.
    const worseLow = def.higherIsBetter
    const isWorse = worseLow ? p.percentile <= 30 : p.percentile >= 70
    if (!isWorse) continue

    const direction: 'high' | 'low' = worseLow ? 'low' : 'high'
    const div = divergence(p)
    const dirPenalty = p.directional ? 0.7 : 1     // down-weight proxy metrics
    const score = div * def.corr * dirPenalty

    flags.push({
      key: p.key,
      label: labelOf(p.key),
      value: p.value,
      percentile: p.percentile,
      divergence: div,
      veloCorrelation: def.corr,
      score,
      direction,
      intervention: interventionFor(p.key, direction, labelOf(p.key)),
    })
  }
  return flags.sort((a, b) => b.score - a.score).slice(0, limit)
}
