import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { parseCSVLine } from '@/lib/csv'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface LeaderboardConfig {
  urlTemplate: (year: number) => string
  table: string
  mapper: (row: Record<string, string>, year: number) => Record<string, any> | null
}

function num(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === '' || v === 'null') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function str(v: string | undefined | null): string | null {
  if (v === undefined || v === null || v === '' || v === 'null') return null
  return v
}

function resolveName(row: Record<string, string>): string | null {
  // Different leaderboards use different name columns
  if (row['last_name, first_name']) {
    return row['last_name, first_name'].split(', ').reverse().join(' ')
  }
  if (row['fielder_name']) return row['fielder_name']
  if (row['catcher_name']) return row['catcher_name']
  if (row['player_name']) return row['player_name']
  if (row['name']) return row['name']
  // Try constructing from first + last
  if (row['first_name'] && row['last_name']) {
    return `${row['first_name']} ${row['last_name']}`
  }
  return null
}

function resolvePlayerId(row: Record<string, string>): number | null {
  const raw = row['player_id'] || row['fielder_id'] || row['catcher_id'] || row['id']
  return raw ? num(raw) : null
}

const CONFIGS: Record<string, LeaderboardConfig> = {
  oaa: {
    urlTemplate: (y) => `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&min=q&year=${y}&csv=true`,
    table: 'defensive_oaa',
    mapper: (row, year) => {
      const pid = resolvePlayerId(row)
      if (!pid) return null
      return {
        season: year,
        player_id: pid,
        player_name: resolveName(row),
        team: str(row['team_name'] || row['team']),
        position: str(row['primary_pos'] || row['pos'] || row['position']),
        fielding_runs_prevented: num(row['fielding_runs_prevented'] || row['frp']),
        outs_above_average: num(row['outs_above_average'] || row['oaa']),
        oaa_infront: num(row['oaa_infront']),
        oaa_lateral_3b: num(row['oaa_lateral_toward_3b'] || row['oaa_lateral_3b']),
        oaa_lateral_1b: num(row['oaa_lateral_toward_1b'] || row['oaa_lateral_1b']),
        oaa_behind: num(row['oaa_behind']),
        oaa_rhh: num(row['oaa_rhh']),
        oaa_lhh: num(row['oaa_lhh']),
        actual_success_rate: num(row['actual_success_rate'] || row['actual_success_rate_formatted']),
        estimated_success_rate: num(row['estimated_success_rate'] || row['estimated_success_rate_formatted']),
        diff_success_rate: num(row['diff_success_rate'] || row['diff_success_rate_formatted']),
      }
    },
  },
  outfield_oaa: {
    urlTemplate: (y) => `https://baseballsavant.mlb.com/leaderboard/outfield_directional_outs_above_average?year=${y}&min=q&csv=true`,
    table: 'defensive_oaa_outfield',
    mapper: (row, year) => {
      const pid = resolvePlayerId(row)
      if (!pid) return null
      return {
        season: year,
        player_id: pid,
        player_name: resolveName(row),
        attempts: num(row['attempts'] || row['n']),
        oaa: num(row['outs_above_average'] || row['oaa']),
        oaa_back_left: num(row['oaa_back_left']),
        oaa_back: num(row['oaa_back']),
        oaa_back_right: num(row['oaa_back_right']),
        oaa_back_all: num(row['oaa_back_all']),
        oaa_in_left: num(row['oaa_in_left']),
        oaa_in: num(row['oaa_in']),
        oaa_in_right: num(row['oaa_in_right']),
        oaa_in_all: num(row['oaa_in_all']),
      }
    },
  },
  catch_probability: {
    urlTemplate: (y) => `https://baseballsavant.mlb.com/leaderboard/catch_probability?year=${y}&min=q&csv=true`,
    table: 'defensive_catch_probability',
    mapper: (row, year) => {
      const pid = resolvePlayerId(row)
      if (!pid) return null
      return {
        season: year,
        player_id: pid,
        player_name: resolveName(row),
        oaa: num(row['outs_above_average'] || row['oaa']),
        five_star_plays: num(row['five_star_plays'] || row['5_star_plays']),
        five_star_opps: num(row['five_star_opps'] || row['5_star_opps']),
        five_star_pct: num(row['five_star_pct'] || row['5_star_pct']),
        four_star_plays: num(row['four_star_plays'] || row['4_star_plays']),
        four_star_opps: num(row['four_star_opps'] || row['4_star_opps']),
        four_star_pct: num(row['four_star_pct'] || row['4_star_pct']),
        three_star_plays: num(row['three_star_plays'] || row['3_star_plays']),
        three_star_opps: num(row['three_star_opps'] || row['3_star_opps']),
        three_star_pct: num(row['three_star_pct'] || row['3_star_pct']),
        two_star_plays: num(row['two_star_plays'] || row['2_star_plays']),
        two_star_opps: num(row['two_star_opps'] || row['2_star_opps']),
        two_star_pct: num(row['two_star_pct'] || row['2_star_pct']),
        one_star_plays: num(row['one_star_plays'] || row['1_star_plays']),
        one_star_opps: num(row['one_star_opps'] || row['1_star_opps']),
        one_star_pct: num(row['one_star_pct'] || row['1_star_pct']),
      }
    },
  },
  arm_strength: {
    urlTemplate: (y) => `https://baseballsavant.mlb.com/leaderboard/arm-strength?year=${y}&pos=&min=q&csv=true`,
    table: 'defensive_arm_strength',
    mapper: (row, year) => {
      const pid = resolvePlayerId(row)
      if (!pid) return null
      return {
        season: year,
        player_id: pid,
        player_name: resolveName(row),
        team: str(row['team_name'] || row['team']),
        position: str(row['primary_pos'] || row['pos'] || row['position']),
        total_throws: num(row['total_throws'] || row['n_throws']),
        max_arm_strength: num(row['max_arm_strength'] || row['arm_strength']),
        arm_1b: num(row['arm_1b']),
        arm_2b: num(row['arm_2b']),
        arm_3b: num(row['arm_3b']),
        arm_ss: num(row['arm_ss']),
        arm_lf: num(row['arm_lf']),
        arm_cf: num(row['arm_cf']),
        arm_rf: num(row['arm_rf']),
        arm_inf: num(row['arm_inf']),
        arm_of: num(row['arm_of']),
        arm_overall: num(row['arm_overall']),
      }
    },
  },
  run_value: {
    urlTemplate: (y) => `https://baseballsavant.mlb.com/leaderboard/fielding-run-value?year=${y}&csv=true`,
    table: 'defensive_run_value',
    mapper: (row, year) => {
      const pid = resolvePlayerId(row)
      if (!pid) return null
      return {
        season: year,
        player_id: pid,
        player_name: resolveName(row),
        team: str(row['team_name'] || row['team']),
        n_teams: num(row['n_teams']),
        total_runs: num(row['total_runs'] || row['fielding_runs_total']),
        inf_of_runs: num(row['inf_of_runs'] || row['fielding_runs_inf_of']),
        range_runs: num(row['range_runs'] || row['fielding_runs_range']),
        arm_runs: num(row['arm_runs'] || row['fielding_runs_arm']),
        dp_runs: num(row['dp_runs'] || row['fielding_runs_dp']),
        catching_runs: num(row['catching_runs'] || row['fielding_runs_catching']),
        framing_runs: num(row['framing_runs'] || row['fielding_runs_framing']),
        throwing_runs: num(row['throwing_runs'] || row['fielding_runs_throwing']),
        blocking_runs: num(row['blocking_runs'] || row['fielding_runs_blocking']),
        outs_total: num(row['outs_total']),
        tot_pa: num(row['tot_pa']),
      }
    },
  },
  catcher_framing: {
    urlTemplate: (y) => `https://baseballsavant.mlb.com/leaderboard/catcher_framing?year=${y}&min=q&csv=true`,
    table: 'defensive_catcher_framing',
    mapper: (row, year) => {
      const pid = resolvePlayerId(row)
      if (!pid) return null
      return {
        season: year,
        player_id: pid,
        player_name: resolveName(row),
        team: str(row['team_name'] || row['team']),
        pitches: num(row['pitches'] || row['n_pitches']),
        pitches_shadow: num(row['pitches_shadow'] || row['n_pitches_shadow']),
        rv_total: num(row['rv_total'] || row['runs_extra_strikes']),
        pct_total: num(row['pct_total'] || row['strike_rate']),
      }
    },
  },
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { leaderboard, season } = body as { leaderboard?: string; season?: number }

    const keys = leaderboard ? [leaderboard] : Object.keys(CONFIGS)
    const results: Record<string, { inserted: number; errors: string[] }> = {}

    for (const key of keys) {
      const config = CONFIGS[key]
      if (!config) {
        results[key] = { inserted: 0, errors: [`Unknown leaderboard: ${key}`] }
        continue
      }

      let totalInserted = 0
      const errors: string[] = []
      const minYear = season || 2016
      const maxYear = season || 2025

      for (let yr = minYear; yr <= maxYear; yr++) {
        try {
          const url = config.urlTemplate(yr)
          const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
          if (!resp.ok) { errors.push(`${yr}: HTTP ${resp.status}`); continue }

          const csv = (await resp.text()).replace(/^\uFEFF/, '')
          if (csv.length < 50) { errors.push(`${yr}: empty CSV`); continue }

          const lines = csv.split('\n').filter(l => l.trim())
          const headers = parseCSVLine(lines[0])

          const rows: Record<string, any>[] = []
          for (let i = 1; i < lines.length; i++) {
            const vals = parseCSVLine(lines[i])
            if (vals.length !== headers.length) continue

            const raw: Record<string, string> = {}
            headers.forEach((h, j) => {
              raw[h.trim()] = vals[j]
            })

            const mapped = config.mapper(raw, yr)
            if (mapped) rows.push(mapped)
          }

          if (rows.length === 0) continue

          const batchSize = 500
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize)
            const { error } = await supabase
              .from(config.table)
              .upsert(batch, { onConflict: 'season,player_id' })
            if (error) errors.push(`${yr} batch: ${error.message}`)
          }

          totalInserted += rows.length
        } catch (e: any) {
          errors.push(`${yr}: ${e.message}`)
        }
      }

      results[key] = { inserted: totalInserted, errors }
    }

    return NextResponse.json({ results })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
