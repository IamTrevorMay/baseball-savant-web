import { SEASON_CONSTANTS } from './constants-data'

interface PitcherSeasonStats {
  year: number
  k: number
  bb: number
  hbp: number
  hr: number
  ip: number        // decimal IP (e.g. 6.333 for 6.1)
  fb: number        // fly balls
  gb: number        // ground balls
  ld: number        // line drives
  pu: number        // popups
  pa: number        // plate appearances
  xwOBA: number | null  // avg xwOBA-against (from Statcast)
}

function getConstants(year: number) {
  return SEASON_CONSTANTS[year] || SEASON_CONSTANTS[2025]
}

/** Parse IP display string "6.2" → 6.667 decimal innings */
export function parseIP(ipStr: string): number {
  const parts = String(ipStr).split('.')
  const full = parseInt(parts[0]) || 0
  const partial = parseInt(parts[1] || '0') || 0
  return full + partial / 3
}

/**
 * FIP — Fielding Independent Pitching
 * ((13×HR + 3×(BB+HBP) − 2×K) / IP) + cFIP
 */
export function calcFIP(s: PitcherSeasonStats): number | null {
  if (s.ip <= 0) return null
  const c = getConstants(s.year)
  return ((13 * s.hr + 3 * (s.bb + s.hbp) - 2 * s.k) / s.ip) + c.cfip
}

/**
 * xFIP — Expected FIP
 * Same as FIP but replaces actual HR with expected HR (FB × league HR/FB rate)
 */
export function calcXFIP(s: PitcherSeasonStats): number | null {
  if (s.ip <= 0 || s.fb <= 0) return null
  const c = getConstants(s.year)
  const expectedHR = s.fb * c.lg_hr_fb
  return ((13 * expectedHR + 3 * (s.bb + s.hbp) - 2 * s.k) / s.ip) + c.cfip
}

/**
 * xERA — Expected ERA from Statcast xwOBA
 * Converts pitcher's xwOBA-against to an ERA estimate using FanGraphs run-value scaling.
 * xERA = ((xwOBA - lgwOBA) / wOBA_scale) × (PA/IP) × 9 + lgERA
 */
export function calcXERA(s: PitcherSeasonStats): number | null {
  if (s.ip <= 0 || s.xwOBA == null || s.pa <= 0) return null
  const c = getConstants(s.year)
  const runsAboveAvgPerPA = (s.xwOBA - c.woba) / c.woba_scale
  return runsAboveAvgPerPA * (s.pa / s.ip) * 9 + c.lg_era
}

/**
 * SIERA — Skill-Interactive ERA
 * Uses K%, BB%, and batted-ball profile to estimate ERA independent of sequencing and defense.
 *
 * Based on the published Swartz model coefficients:
 * SIERA = 6.145 − 16.986×(K/PA) + 11.434×(BB/PA) − 1.858×((GB−FB−PU)/PA)
 *       + 7.653×(K/PA)² + 6.664×((GB−FB−PU)/PA)²
 *       + 10.130×(K/PA)×((GB−FB−PU)/PA) − 5.195×(BB/PA)×((GB−FB−PU)/PA)
 *       − 0.986×ln(IP)
 */
export function calcSIERA(s: PitcherSeasonStats): number | null {
  if (s.ip <= 0 || s.pa <= 0) return null
  const kRate = s.k / s.pa
  const bbRate = s.bb / s.pa
  const netGB = (s.gb - s.fb - s.pu) / s.pa

  return 6.145
    - 16.986 * kRate
    + 11.434 * bbRate
    - 1.858 * netGB
    + 7.653 * kRate * kRate
    + 6.664 * netGB * netGB
    + 10.130 * kRate * netGB
    - 5.195 * bbRate * netGB
    - 0.986 * Math.log(Math.max(s.ip, 1))
}
