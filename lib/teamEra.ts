/**
 * Real team ERA from the MLB Stats API.
 *
 * Earned runs are not derivable from Statcast, so anywhere the platform
 * shows team-level ERA it must come from here (or show null). Before
 * 2026-09-10 scene-stats silently returned FIP under the 'era' key — that
 * contract is dead: era is real or absent, FIP/xERA are labeled as
 * themselves.
 *
 * Season numbers are regular-season only, so callers with date ranges,
 * SP/RP splits, or spring/postseason filters should skip this and surface
 * era: null.
 *
 * Season level is also as fine-grained as real team ERA gets: the API's
 * team/league byMonth endpoints return errors or empty splits (verified
 * 2026-09-10), and person-level byMonth loses team attribution after
 * trades — so monthly team ERA cannot be assembled honestly. Anything
 * needing a monthly run-prevention trend should use FIP/xERA, labeled as
 * such.
 */
import { MLB_TEAMS } from './trendsViz'

export const MLB_TEAM_ID_TO_ABBREV: Record<number, string> =
  Object.fromEntries(MLB_TEAMS.map(t => [t.id, t.abbrev]))

/** Season team ERA for all 30 teams, keyed by abbrev. Empty map on failure. */
export async function fetchRealTeamERA(season: number): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/stats?season=${season}&group=pitching&stats=season&sportIds=1`,
      { signal: AbortSignal.timeout(10000), next: { revalidate: 1800 } }
    )
    if (!res.ok) return out
    const data = await res.json()
    for (const split of data.stats?.[0]?.splits || []) {
      const abbrev = MLB_TEAM_ID_TO_ABBREV[split.team?.id]
      const era = Number(split.stat?.era)
      if (abbrev && isFinite(era)) out.set(abbrev, era)
    }
  } catch { /* map stays empty → era renders null, never a wrong number */ }
  return out
}
