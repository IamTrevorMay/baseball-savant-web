/**
 * Baseball Savant Validation Test Suite
 *
 * Fetches live Savant CSV data for Corbin Burnes 2024 Regular Season
 * (pitcher ID 669203) and compares against Supabase data + computed metrics.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { fetchSavantCsv } from '@/lib/savantCsv'
import { enrichDerivedFields } from '@/lib/enrichDerivedFields'
import { calcTraditionalByYear, calcAdvancedByYear, calcArsenal } from '@/lib/pitcherStats'

// ── Config ───────────────────────────────────────────────────────────────────

const PITCHER_ID = 669203  // Corbin Burnes
const SEASON = 2024
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasEnv = !!(SUPABASE_URL && SUPABASE_KEY)

// ── Shared state ─────────────────────────────────────────────────────────────

let savantRows: any[] = []
let supabaseRows: any[] = []
let savantFailed = false

// Computed stats from each source
let savantTrad: any = null
let supabaseTrad: any = null
let savantAdv: any = null
let supabaseAdv: any = null
let savantArsenal: any[] = []
let supabaseArsenal: any[] = []

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!hasEnv)('Savant Validation — Corbin Burnes 2024', () => {
  beforeAll(async () => {
    // 1) Fetch Savant CSV
    try {
      savantRows = await fetchSavantCsv({
        pitcherId: PITCHER_ID,
        season: SEASON,
        gameType: 'R',
        timeoutMs: 90_000,
      })
    } catch (e) {
      console.warn('Savant fetch failed:', e)
      savantFailed = true
      return
    }

    // 2) Query Supabase via run_query_long RPC
    const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!)
    const { data, error } = await sb.rpc('run_query_long', {
      query_text: `
        SELECT *
        FROM pitches
        WHERE pitcher = ${PITCHER_ID}
          AND game_year = ${SEASON}
          AND game_type = 'R'
        ORDER BY game_date, game_pk, at_bat_number, pitch_number
      `,
    })
    if (error) throw new Error(`Supabase RPC error: ${error.message}`)
    supabaseRows = data || []

    // 3) Enrich Supabase data with derived fields
    enrichDerivedFields(supabaseRows)

    // Also enrich Savant rows so arsenal computations work
    enrichDerivedFields(savantRows)

    // 4) Filter out PO/IN like the dashboard does
    const cleanSavant = savantRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
    const cleanSupabase = supabaseRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')

    // 5) Compute stats from both sources
    const savantTradArr = calcTraditionalByYear(cleanSavant)
    const supabaseTradArr = calcTraditionalByYear(cleanSupabase)
    savantTrad = savantTradArr.find(r => r.year === SEASON) ?? null
    supabaseTrad = supabaseTradArr.find(r => r.year === SEASON) ?? null

    const savantAdvArr = calcAdvancedByYear(cleanSavant)
    const supabaseAdvArr = calcAdvancedByYear(cleanSupabase)
    savantAdv = savantAdvArr.find(r => r.year === SEASON) ?? null
    supabaseAdv = supabaseAdvArr.find(r => r.year === SEASON) ?? null

    savantArsenal = calcArsenal(cleanSavant)
    supabaseArsenal = calcArsenal(cleanSupabase)
  }, 90_000)

  // ── Helper: skip if savant failed ────────────────────────────────────────

  function skipIfSavantFailed() {
    if (savantFailed) {
      console.warn('  ⚠ Skipping — Savant fetch failed')
      return true
    }
    return false
  }

  // ── Helper: parse formatted stat string to number ────────────────────────

  function num(v: any): number {
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      if (v === '—') return NaN
      return parseFloat(v)
    }
    return NaN
  }

  // ── Helper: comparison summary logger ────────────────────────────────────

  function compare(
    label: string,
    savantVal: any,
    supabaseVal: any,
    tolerance: number,
    isAbsolute = true,
  ) {
    const sv = num(savantVal)
    const db = num(supabaseVal)
    // Round to 10 decimal places to avoid IEEE 754 edge cases (e.g. 0.493 - 0.488 = 0.005000000000000000044)
    const diff = Math.round(Math.abs(sv - db) * 1e10) / 1e10
    const pass = diff <= tolerance
    console.log(
      `  ${pass ? '✓' : '✗'} ${label.padEnd(16)} Savant: ${String(savantVal).padStart(8)}  DB: ${String(supabaseVal).padStart(8)}  Δ=${diff.toFixed(4)}  tol=${tolerance}`,
    )
    return { sv, db, diff, pass }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DATA COMPLETENESS
  // ════════════════════════════════════════════════════════════════════════════

  describe('Data Completeness', () => {
    it('pitch count matches within 0.5%', () => {
      if (skipIfSavantFailed()) return
      const diff = Math.abs(savantRows.length - supabaseRows.length)
      const pct = diff / savantRows.length
      console.log(`  Savant pitches: ${savantRows.length}  Supabase pitches: ${supabaseRows.length}  diff: ${diff} (${(pct * 100).toFixed(2)}%)`)
      expect(pct).toBeLessThanOrEqual(0.005)
    })

    it('all game_pk values from Savant exist in Supabase', () => {
      if (skipIfSavantFailed()) return
      const savantGamePks = new Set(savantRows.map(r => r.game_pk))
      const supabaseGamePks = new Set(supabaseRows.map(r => r.game_pk))
      const missing = [...savantGamePks].filter(pk => !supabaseGamePks.has(pk))
      if (missing.length > 0) console.warn(`  Missing game_pks: ${missing.join(', ')}`)
      expect(missing.length).toBe(0)
    })

    it('per-pitch-type counts match', () => {
      if (skipIfSavantFailed()) return
      const savantCounts: Record<string, number> = {}
      const supabaseCounts: Record<string, number> = {}
      savantRows.forEach(r => { if (r.pitch_type) savantCounts[r.pitch_type] = (savantCounts[r.pitch_type] || 0) + 1 })
      supabaseRows.forEach(r => { if (r.pitch_type) supabaseCounts[r.pitch_type] = (supabaseCounts[r.pitch_type] || 0) + 1 })

      const allTypes = new Set([...Object.keys(savantCounts), ...Object.keys(supabaseCounts)])
      for (const pt of allTypes) {
        const sc = savantCounts[pt] || 0
        const dc = supabaseCounts[pt] || 0
        const diff = Math.abs(sc - dc)
        console.log(`  ${pt.padEnd(4)} Savant: ${sc}  DB: ${dc}  diff: ${diff}`)
        // Allow small variance per type
        expect(diff).toBeLessThanOrEqual(Math.max(2, sc * 0.005))
      }
    })

    it('no duplicate pitches in Supabase (game_pk + at_bat_number + pitch_number)', () => {
      const seen = new Set<string>()
      const dupes: string[] = []
      supabaseRows.forEach(r => {
        const key = `${r.game_pk}-${r.at_bat_number}-${r.pitch_number}`
        if (seen.has(key)) dupes.push(key)
        seen.add(key)
      })
      if (dupes.length > 0) console.warn(`  ${dupes.length} duplicate keys found`)
      expect(dupes.length).toBe(0)
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  //  TRADITIONAL STATS
  // ════════════════════════════════════════════════════════════════════════════

  describe('Traditional Stats', () => {
    it('PA, K, BB, H, HR, HBP: exact match', () => {
      if (skipIfSavantFailed()) return
      expect(savantTrad).not.toBeNull()
      expect(supabaseTrad).not.toBeNull()
      for (const key of ['pa', 'k', 'bb', 'h', 'hr', 'hbp'] as const) {
        compare(key.toUpperCase(), savantTrad[key], supabaseTrad[key], 0)
        expect(savantTrad[key]).toBe(supabaseTrad[key])
      }
    })

    it('IP within ±0.1 (1-out tolerance)', () => {
      if (skipIfSavantFailed()) return
      const sIP = parseFloat(savantTrad.ip)
      const dIP = parseFloat(supabaseTrad.ip)
      compare('IP', savantTrad.ip, supabaseTrad.ip, 0.1)
      expect(Math.abs(sIP - dIP)).toBeLessThanOrEqual(0.1)
    })

    it('BA, OBP, SLG within ±0.005', () => {
      if (skipIfSavantFailed()) return
      for (const key of ['ba', 'obp', 'slg'] as const) {
        const { diff } = compare(key.toUpperCase(), savantTrad[key], supabaseTrad[key], 0.005)
        expect(diff).toBeLessThanOrEqual(0.005)
      }
    })

    it('K%, BB% within ±0.5 pp', () => {
      if (skipIfSavantFailed()) return
      for (const key of ['kPct', 'bbPct'] as const) {
        const { diff } = compare(key, savantTrad[key], supabaseTrad[key], 0.5)
        expect(diff).toBeLessThanOrEqual(0.5)
      }
    })

    it('Whiff%, CSt% within ±0.5 pp', () => {
      if (skipIfSavantFailed()) return
      for (const key of ['whiffPct', 'csPct'] as const) {
        const { diff } = compare(key, savantTrad[key], supabaseTrad[key], 0.5)
        expect(diff).toBeLessThanOrEqual(0.5)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  //  ADVANCED STATS
  // ════════════════════════════════════════════════════════════════════════════

  describe('Advanced Stats', () => {
    it('SwStr%, Zone%, FPS% within ±0.5 pp', () => {
      if (skipIfSavantFailed()) return
      expect(savantAdv).not.toBeNull()
      expect(supabaseAdv).not.toBeNull()
      for (const key of ['swStrPct', 'zonePct', 'fpsPct'] as const) {
        const { diff } = compare(key, savantAdv[key], supabaseAdv[key], 0.5)
        expect(diff).toBeLessThanOrEqual(0.5)
      }
    })

    it('Avg EV within ±0.2 mph', () => {
      if (skipIfSavantFailed()) return
      const { diff } = compare('avgEV', savantAdv.avgEV, supabaseAdv.avgEV, 0.2)
      expect(diff).toBeLessThanOrEqual(0.2)
    })

    it('GB%, FB%, LD% within ±0.5 pp', () => {
      if (skipIfSavantFailed()) return
      for (const key of ['gbPct', 'fbPct', 'ldPct'] as const) {
        const { diff } = compare(key, savantAdv[key], supabaseAdv[key], 0.5)
        expect(diff).toBeLessThanOrEqual(0.5)
      }
    })

    it('xBA, xwOBA, xSLG within ±0.005', () => {
      if (skipIfSavantFailed()) return
      for (const key of ['xBA', 'xwOBA', 'xSLG'] as const) {
        const { diff } = compare(key, savantAdv[key], supabaseAdv[key], 0.005)
        expect(diff).toBeLessThanOrEqual(0.005)
      }
    })

    it('FIP within ±0.15', () => {
      if (skipIfSavantFailed()) return
      const { diff } = compare('FIP', savantAdv.fip, supabaseAdv.fip, 0.15)
      expect(diff).toBeLessThanOrEqual(0.15)
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  //  ARSENAL (per pitch type)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Arsenal', () => {
    it('pitch type names match between sources', () => {
      if (skipIfSavantFailed()) return
      const savantNames = new Set(savantArsenal.map(r => r.name))
      const supabaseNames = new Set(supabaseArsenal.map(r => r.name))
      const missingSavant = [...savantNames].filter(n => !supabaseNames.has(n))
      const missingSupabase = [...supabaseNames].filter(n => !savantNames.has(n))
      if (missingSavant.length) console.warn(`  Savant-only types: ${missingSavant.join(', ')}`)
      if (missingSupabase.length) console.warn(`  Supabase-only types: ${missingSupabase.join(', ')}`)
      expect(missingSavant.length).toBe(0)
      expect(missingSupabase.length).toBe(0)
    })

    it('usage % within ±0.5 pp per pitch type', () => {
      if (skipIfSavantFailed()) return
      for (const sRow of savantArsenal) {
        const dRow = supabaseArsenal.find(r => r.name === sRow.name)
        if (!dRow) continue
        const { diff } = compare(`${sRow.name} usage%`, sRow.usagePct, dRow.usagePct, 0.5)
        expect(diff).toBeLessThanOrEqual(0.5)
      }
    })

    it('avg velo within ±0.2 mph per pitch type', () => {
      if (skipIfSavantFailed()) return
      for (const sRow of savantArsenal) {
        const dRow = supabaseArsenal.find(r => r.name === sRow.name)
        if (!dRow) continue
        const { diff } = compare(`${sRow.name} velo`, sRow.avgVelo, dRow.avgVelo, 0.2)
        expect(diff).toBeLessThanOrEqual(0.2)
      }
    })

    it('avg spin within ±5 rpm per pitch type', () => {
      if (skipIfSavantFailed()) return
      for (const sRow of savantArsenal) {
        const dRow = supabaseArsenal.find(r => r.name === sRow.name)
        if (!dRow) continue
        const { diff } = compare(`${sRow.name} spin`, sRow.avgSpin, dRow.avgSpin, 5)
        expect(diff).toBeLessThanOrEqual(5)
      }
    })

    it('H-break, V-break within ±0.3 inches per pitch type', () => {
      if (skipIfSavantFailed()) return
      for (const sRow of savantArsenal) {
        const dRow = supabaseArsenal.find(r => r.name === sRow.name)
        if (!dRow) continue
        const { diff: hDiff } = compare(`${sRow.name} hBreak`, sRow.hBreak, dRow.hBreak, 0.3)
        expect(hDiff).toBeLessThanOrEqual(0.3)
        const { diff: vDiff } = compare(`${sRow.name} vBreak`, sRow.vBreak, dRow.vBreak, 0.3)
        expect(vDiff).toBeLessThanOrEqual(0.3)
      }
    })

    it('per-pitch whiff% within ±1.0 pp', () => {
      if (skipIfSavantFailed()) return
      for (const sRow of savantArsenal) {
        const dRow = supabaseArsenal.find(r => r.name === sRow.name)
        if (!dRow) continue
        const { diff } = compare(`${sRow.name} whiff%`, sRow.whiffPct, dRow.whiffPct, 1.0)
        expect(diff).toBeLessThanOrEqual(1.0)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  //  DERIVED FIELDS (Supabase data only)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Derived Fields', () => {
    it('pfx_x_in === pfx_x * 12 for all rows with pfx_x', () => {
      const withPfxX = supabaseRows.filter(r => r.pfx_x != null && r.pfx_x_in != null)
      expect(withPfxX.length).toBeGreaterThan(0)
      for (const r of withPfxX) {
        const expected = +(r.pfx_x * 12).toFixed(1)
        expect(r.pfx_x_in).toBe(expected)
      }
    })

    it('pfx_z_in === pfx_z * 12 for all rows with pfx_z', () => {
      const withPfxZ = supabaseRows.filter(r => r.pfx_z != null && r.pfx_z_in != null)
      expect(withPfxZ.length).toBeGreaterThan(0)
      for (const r of withPfxZ) {
        const expected = +(r.pfx_z * 12).toFixed(1)
        expect(r.pfx_z_in).toBe(expected)
      }
    })

    it('VAA computed for rows with trajectory data', () => {
      const withTrajectory = supabaseRows.filter(
        r => r.vx0 != null && r.vy0 != null && r.vz0 != null && r.ax != null && r.ay != null && r.az != null && r.release_extension != null,
      )
      expect(withTrajectory.length).toBeGreaterThan(0)
      const withVAA = withTrajectory.filter(r => r.vaa != null)
      console.log(`  Rows with trajectory: ${withTrajectory.length}  VAA computed: ${withVAA.length}`)
      // All rows with trajectory should have VAA
      expect(withVAA.length).toBe(withTrajectory.length)
      // VAA should be in reasonable range (-10 to 0 for most pitches)
      for (const r of withVAA) {
        expect(r.vaa).toBeGreaterThan(-15)
        expect(r.vaa).toBeLessThan(5)
      }
    })

    it('Brink computed for rows with plate_x, plate_z, sz_top, sz_bot', () => {
      const withZone = supabaseRows.filter(
        r => r.plate_x != null && r.plate_z != null && r.sz_top != null && r.sz_bot != null,
      )
      expect(withZone.length).toBeGreaterThan(0)
      const withBrink = withZone.filter(r => r.brink != null)
      console.log(`  Rows with zone data: ${withZone.length}  Brink computed: ${withBrink.length}`)
      expect(withBrink.length).toBe(withZone.length)
      // Brink values in reasonable range (roughly -30 to +10 inches)
      for (const r of withBrink) {
        expect(r.brink).toBeGreaterThan(-40)
        expect(r.brink).toBeLessThan(15)
      }
    })
  })
})
