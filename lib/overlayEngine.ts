import type { ActiveFilter, FilterDef } from '@/components/FilterEngine'
import { FILTER_CATALOG } from '@/components/FilterEngine'

// ── Types ────────────────────────────────────────────────────────────────────

export interface StuffProfile {
  [pitchName: string]: {
    avgVelo: number
    avgIVB: number
    avgHB: number
    avgSpin: number | null
    avgVAA: number | null
    avgExt: number | null
    count: number
  }
}

export interface OverlayRule {
  id: string
  condition: {
    field: string       // "pitch_name" or "pitch_type"
    operator: 'equals' | 'in'
    values: string[]
  }
  filters: {
    field: string       // "release_speed", "pfx_z_in", "pfx_x_in", etc.
    metric: 'avg'
    offset: number      // +/- range
  }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function findFilterDef(key: string): FilterDef {
  return FILTER_CATALOG.find(f => f.key === key) || { key, label: key, category: 'Other', type: 'range' }
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Groups pitcher data by pitch_name, computes average velocity, IVB, HB per type.
 * Returns a StuffProfile keyed by pitch name.
 */
export function computeStuffProfile(pitcherData: any[]): StuffProfile {
  const groups: Record<string, any[]> = {}
  pitcherData.forEach(d => {
    if (d.pitch_name) {
      if (!groups[d.pitch_name]) groups[d.pitch_name] = []
      groups[d.pitch_name].push(d)
    }
  })

  const profile: StuffProfile = {}
  for (const [name, pitches] of Object.entries(groups)) {
    const velos = pitches.map(p => p.release_speed).filter((v): v is number => v != null)
    const ivbs = pitches.map(p => p.pfx_z_in).filter((v): v is number => v != null)
    const hbs = pitches.map(p => p.pfx_x_in).filter((v): v is number => v != null)
    const spins = pitches.map(p => p.release_spin_rate).filter((v): v is number => v != null)
    const vaas = pitches.map(p => p.vaa).filter((v): v is number => v != null)
    const exts = pitches.map(p => p.release_extension).filter((v): v is number => v != null)

    const avgVelo = avg(velos)
    const avgIVB = avg(ivbs)
    const avgHB = avg(hbs)

    if (avgVelo != null && avgIVB != null && avgHB != null) {
      profile[name] = {
        avgVelo,
        avgIVB,
        avgHB,
        avgSpin: avg(spins),
        avgVAA: avg(vaas),
        avgExt: avg(exts),
        count: pitches.length,
      }
    }
  }

  return profile
}

/**
 * For each tile that has pitch_name or pitch_type filters,
 * generates overlay ActiveFilter[] with velocity/IVB/HB ranges from the stuff profile.
 * Default offset is ±2 for velocity, ±2 inches for movement.
 */
export function generateSimilarStuffFilters(
  stuffProfile: StuffProfile,
  tiles: { id: string; filters: ActiveFilter[] }[],
  offset: number = 2
): { tileId: string; overlayFilters: ActiveFilter[] }[] {
  return tiles.map(tile => {
    const pitchFilter = tile.filters.find(f => f.def.key === 'pitch_name' || f.def.key === 'pitch_type')
    const pitchNames = pitchFilter?.values || []

    const overlayFilters: ActiveFilter[] = []

    // If no pitch filter on the tile, generate for all pitch types
    const targetNames = pitchNames.length > 0 ? pitchNames : Object.keys(stuffProfile)

    // Collect all relevant averages across targeted pitch types
    const allVelos: number[] = []
    const allIVBs: number[] = []
    const allHBs: number[] = []

    for (const name of targetNames) {
      const p = stuffProfile[name]
      if (p) {
        allVelos.push(p.avgVelo)
        allIVBs.push(p.avgIVB)
        allHBs.push(p.avgHB)
      }
    }

    if (allVelos.length > 0) {
      const minVelo = Math.min(...allVelos) - offset
      const maxVelo = Math.max(...allVelos) + offset
      overlayFilters.push({
        def: findFilterDef('release_speed'),
        min: minVelo.toFixed(1),
        max: maxVelo.toFixed(1),
        readonly: true,
      })
    }

    if (allIVBs.length > 0) {
      const minIVB = Math.min(...allIVBs) - offset
      const maxIVB = Math.max(...allIVBs) + offset
      overlayFilters.push({
        def: findFilterDef('pfx_z_in'),
        min: minIVB.toFixed(1),
        max: maxIVB.toFixed(1),
        readonly: true,
      })
    }

    if (allHBs.length > 0) {
      const minHB = Math.min(...allHBs) - offset
      const maxHB = Math.max(...allHBs) + offset
      overlayFilters.push({
        def: findFilterDef('pfx_x_in'),
        min: minHB.toFixed(1),
        max: maxHB.toFixed(1),
        readonly: true,
      })
    }

    return { tileId: tile.id, overlayFilters }
  })
}

/**
 * Generic version: evaluates overlay rules against pitcher data,
 * computes metric averages, generates range filters with specified offsets.
 */
export function applyOverlayRules(
  rules: OverlayRule[],
  pitcherData: any[],
  tiles: { id: string; filters: ActiveFilter[] }[]
): { tileId: string; overlayFilters: ActiveFilter[] }[] {
  return tiles.map(tile => {
    const overlayFilters: ActiveFilter[] = []

    for (const rule of rules) {
      // Check if tile has matching condition
      const pitchFilter = tile.filters.find(f => f.def.key === rule.condition.field)
      const pitchValues = pitchFilter?.values || []

      // Determine which pitches match the rule condition
      let matchingPitches: any[]
      if (rule.condition.operator === 'equals') {
        matchingPitches = pitcherData.filter(d => rule.condition.values.includes(String(d[rule.condition.field])))
      } else {
        matchingPitches = pitcherData.filter(d => rule.condition.values.includes(String(d[rule.condition.field])))
      }

      // If tile has a pitch filter, further narrow to tile's targeted pitches
      if (pitchValues.length > 0) {
        matchingPitches = matchingPitches.filter(d =>
          pitchValues.includes(String(d[rule.condition.field]))
        )
      }

      if (matchingPitches.length === 0) continue

      // Generate range filters from rule's filter definitions
      for (const rf of rule.filters) {
        const vals = matchingPitches.map(d => d[rf.field]).filter((v): v is number => v != null)
        const avgVal = avg(vals)
        if (avgVal == null) continue

        overlayFilters.push({
          def: findFilterDef(rf.field),
          min: (avgVal - rf.offset).toFixed(1),
          max: (avgVal + rf.offset).toFixed(1),
          readonly: true,
        })
      }
    }

    return { tileId: tile.id, overlayFilters }
  })
}
