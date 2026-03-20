/**
 * Shared outing-level command computation.
 * Extracted from pitcher-outing route so it can be reused by starter-card.
 */

import { ZONE_HALF_WIDTH } from '@/lib/constants-data'
import {
  getLeagueBaseline,
  getLeagueCentroid,
  computePlus,
  computeCommandPlus,
} from '@/lib/leagueStats'

const SWING_DESCRIPTIONS = new Set([
  'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
  'foul_bunt', 'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score',
  'missed_bunt',
])

export interface PitchRow {
  plate_x: number
  plate_z: number
  pitch_name: string
  sz_top: number
  sz_bot: number
  zone: number
  game_year: number
  description?: string
  stand?: string
}

export interface PitchTypeCommand {
  avg_missfire: number | null
  close_pct: number | null
  avg_brink: number | null
  avg_cluster: number | null
  avg_cluster_r: number | null
  avg_cluster_l: number | null
  cmd_plus: number | null
}

export function computeOutingCommand(pitches: PitchRow[]) {
  // Group by pitch type
  const groups: Record<string, PitchRow[]> = {}
  for (const p of pitches) {
    if (!p.pitch_name) continue
    if (!groups[p.pitch_name]) groups[p.pitch_name] = []
    groups[p.pitch_name].push(p)
  }

  const byPitch: Record<string, PitchTypeCommand> = {}

  // Aggregate accumulators for weighted overall command
  let totalPitches = 0
  let wasteTotal = 0, clusterTotal = 0, brinkTotal = 0
  let wasteN = 0, clusterN = 0, brinkN = 0
  let cmdPlusTotal = 0, cmdPlusN = 0

  for (const [pitchName, pts] of Object.entries(groups)) {
    const year = pts[0].game_year
    const centroid = getLeagueCentroid(pitchName, year)
    const centroidR = getLeagueCentroid(pitchName, year, 'R')
    const centroidL = getLeagueCentroid(pitchName, year, 'L')

    let brinkSum = 0, clusterSum = 0
    let validBrink = 0, validCluster = 0, wasteCount = 0
    let missfireSum = 0, missfireCount = 0, closeCount = 0, outsideCount = 0
    // R/L cluster accumulators
    let clusterRSum = 0, clusterRCount = 0
    let clusterLSum = 0, clusterLCount = 0

    for (const p of pts) {
      // Brink — signed distance to nearest zone edge (inches)
      const dLeft = p.plate_x + ZONE_HALF_WIDTH
      const dRight = ZONE_HALF_WIDTH - p.plate_x
      const dBot = p.plate_z - p.sz_bot
      const dTop = p.sz_top - p.plate_z
      const brink = Math.min(dLeft, dRight, dBot, dTop) * 12
      brinkSum += brink
      validBrink++

      // Cluster — distance from league centroid (inches)
      if (centroid) {
        const cluster = Math.sqrt((p.plate_x - centroid.cx) ** 2 + (p.plate_z - centroid.cz) ** 2) * 12
        clusterSum += cluster
        validCluster++
      }

      // ClusterR / ClusterL — distance from handedness-specific centroid
      if (p.stand === 'R' && centroidR) {
        const d = Math.sqrt((p.plate_x - centroidR.cx) ** 2 + (p.plate_z - centroidR.cz) ** 2) * 12
        clusterRSum += d
        clusterRCount++
      } else if (p.stand === 'L' && centroidL) {
        const d = Math.sqrt((p.plate_x - centroidL.cx) ** 2 + (p.plate_z - centroidL.cz) ** 2) * 12
        clusterLSum += d
        clusterLCount++
      }

      // Missfire — avg distance outside-zone pitches miss by (inches)
      // Close% — % of zone misses within 2 inches of edge
      // Only count pitches the batter did NOT swing at (swung-at pitches are chases, not command misses)
      const isInZone = p.zone >= 1 && p.zone <= 9
      const didSwing = p.description ? SWING_DESCRIPTIONS.has(p.description) : false
      if (!isInZone && !didSwing) {
        outsideCount++
        missfireSum += Math.abs(brink)
        missfireCount++
        if (brink > -2) closeCount++
      }

      // Waste — pitches > 10 inches outside zone
      if (brink < -10) wasteCount++
    }

    const avgBrink = validBrink > 0 ? brinkSum / validBrink : null
    const avgCluster = validCluster > 0 ? clusterSum / validCluster : null
    const avgClusterR = clusterRCount > 0 ? clusterRSum / clusterRCount : null
    const avgClusterL = clusterLCount > 0 ? clusterLSum / clusterLCount : null
    const avgMissfire = missfireCount > 0 ? missfireSum / missfireCount : null
    const closePct = outsideCount > 0 ? (closeCount / outsideCount) * 100 : null

    // Plus stats
    const brinkBl = getLeagueBaseline('brink', pitchName, year)
    const missfireBl = getLeagueBaseline('missfire', pitchName, year)
    const clusterRBl = getLeagueBaseline('cluster_r', pitchName, year)
    const clusterLBl = getLeagueBaseline('cluster_l', pitchName, year)

    const brinkPlus = avgBrink != null && brinkBl ? computePlus(avgBrink, brinkBl.mean, brinkBl.stddev) : null
    const missfirePlus = avgMissfire != null && missfireBl ? 100 - (computePlus(avgMissfire, missfireBl.mean, missfireBl.stddev) - 100) : null

    // Compute ClusterR+ and ClusterL+, then blend by actual R/L ratio
    const clusterRPlus = avgClusterR != null && clusterRBl ? 100 - (computePlus(avgClusterR, clusterRBl.mean, clusterRBl.stddev) - 100) : null
    const clusterLPlus = avgClusterL != null && clusterLBl ? 100 - (computePlus(avgClusterL, clusterLBl.mean, clusterLBl.stddev) - 100) : null

    // Blend cluster+ by R/L ratio faced
    let clusterPlus: number | null = null
    if (clusterRPlus != null && clusterLPlus != null) {
      clusterPlus = (clusterRPlus * clusterRCount + clusterLPlus * clusterLCount) / (clusterRCount + clusterLCount)
    } else if (clusterRPlus != null) {
      clusterPlus = clusterRPlus
    } else if (clusterLPlus != null) {
      clusterPlus = clusterLPlus
    } else {
      // Fallback to unsplit cluster if no stand data
      const clusterBl = getLeagueBaseline('cluster', pitchName, year)
      clusterPlus = avgCluster != null && clusterBl ? 100 - (computePlus(avgCluster, clusterBl.mean, clusterBl.stddev) - 100) : null
    }

    const cmdPlus = brinkPlus != null && clusterPlus != null && missfirePlus != null
      ? computeCommandPlus(brinkPlus, clusterPlus, missfirePlus)
      : null

    byPitch[pitchName] = {
      avg_missfire: avgMissfire != null ? +avgMissfire.toFixed(2) : null,
      close_pct: closePct != null ? +closePct.toFixed(2) : null,
      avg_brink: avgBrink != null ? +avgBrink.toFixed(2) : null,
      avg_cluster: avgCluster != null ? +avgCluster.toFixed(2) : null,
      avg_cluster_r: avgClusterR != null ? +avgClusterR.toFixed(2) : null,
      avg_cluster_l: avgClusterL != null ? +avgClusterL.toFixed(2) : null,
      cmd_plus: cmdPlus != null ? +cmdPlus.toFixed(1) : null,
    }

    // Accumulate for aggregate
    totalPitches += pts.length
    const wastePct = (wasteCount / pts.length) * 100
    wasteTotal += wastePct * pts.length; wasteN += pts.length
    if (avgCluster != null) { clusterTotal += avgCluster * pts.length; clusterN += pts.length }
    if (avgBrink != null) { brinkTotal += avgBrink * pts.length; brinkN += pts.length }
    if (cmdPlus != null) { cmdPlusTotal += cmdPlus * pts.length; cmdPlusN += pts.length }
  }

  return {
    byPitch,
    aggregate: {
      waste_pct: wasteN > 0 ? wasteTotal / wasteN : null,
      avg_cluster: clusterN > 0 ? clusterTotal / clusterN : null,
      avg_brink: brinkN > 0 ? brinkTotal / brinkN : null,
    },
    overall_cmd_plus: cmdPlusN > 0 ? cmdPlusTotal / cmdPlusN : null,
  }
}
