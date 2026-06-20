import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdminLong } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser } from '@/lib/apiAuth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Tables the explore tool is allowed to read. The route runs arbitrary confirmed
// SQL via run_query_long, so without this any logged-in user could SELECT from
// sensitive tables (profiles, email_subscribers, auth.*, …). Restrict to the
// analytics surface the AI is prompted to use.
const ALLOWED_TABLES = new Set([
  'pitches', 'milb_pitches', 'players', 'player_summary', 'batter_summary',
  'pitcher_season_command', 'pitcher_season_deception', 'league_averages', 'league_percentiles',
  'glossary', 'pitch_baselines', 'sos_scores', 'park_factors',
  'bat_tracking_swing_miss', 'bat_tracking_swing_miss_latest',
  'mv_batter_season_stats', 'mv_pitcher_season_stats',
  'retro_events', 'retro_games', 'retro_people', 'retro_parks', 'retro_rosters',
  'retro_id_map', 'retro_id_map_conflicts', 'retro_starter_outings', 'retro_ingest_runs',
])

/** Validate a confirmed SELECT before execution. Read-only, single-statement, analytics tables only. */
function validateExploreSql(raw: string): { ok: true } | { ok: false; error: string } {
  const sql = raw.trim().replace(/;+\s*$/, '') // tolerate a single trailing semicolon
  const lower = sql.toLowerCase()

  if (!lower.startsWith('select') && !lower.startsWith('with')) {
    return { ok: false, error: 'Only SELECT queries are allowed.' }
  }
  if (sql.includes(';')) {
    return { ok: false, error: 'Multiple statements are not allowed.' }
  }
  // Block writes/DDL even nested in CTEs or function bodies.
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|do)\b/i.test(sql)) {
    return { ok: false, error: 'Only read-only SELECT queries are allowed.' }
  }
  // Block system catalogs / non-public schemas.
  if (/\b(pg_catalog|pg_|information_schema|auth|storage|vault|pgsodium|extensions)\s*\./i.test(sql)) {
    return { ok: false, error: 'Access to system schemas is not allowed.' }
  }
  // Collect CTE names so they don't trip the table allowlist.
  const cteNames = new Set<string>()
  for (const m of sql.matchAll(/(?:with|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/gi)) {
    cteNames.add(m[1].toLowerCase())
  }
  // Every relation referenced after FROM/JOIN must be allowlisted (or a CTE).
  for (const m of sql.matchAll(/\b(?:from|join)\s+("?)([a-z_][a-z0-9_.]*)\1/gi)) {
    let ref = m[2].toLowerCase()
    if (ref.startsWith('public.')) ref = ref.slice('public.'.length)
    if (ref.includes('.')) return { ok: false, error: `Table not allowed: ${m[2]}` }
    if (!ALLOWED_TABLES.has(ref) && !cteNames.has(ref)) {
      return { ok: false, error: `Table not allowed: ${ref}` }
    }
  }
  return { ok: true }
}

const SYSTEM_PROMPT = `You are a baseball data analyst embedded in the Triton analytics platform. You help users explore Statcast pitch-level data by generating SQL queries and visualization configurations.

DATABASE SCHEMA — Table: pitches (7.4M+ rows, 2015–2025)
Key columns:
- player_name (TEXT) — pitcher name "Last, First"
- pitcher (INT) — MLB player ID
- batter_name (TEXT) — derived batter name
- game_date (DATE), game_year (INT), game_pk (INT)
- pitch_type (TEXT) — FF, SL, CH, CU, SI, FC, ST, FS, KC, KN
- pitch_name (TEXT) — "4-Seam Fastball", "Slider", "Changeup", etc.
- release_speed (REAL) — velocity mph
- release_spin_rate (REAL) — spin rpm
- spin_axis (REAL) — degrees
- pfx_x (REAL) — horizontal break feet (×12 for inches)
- pfx_z (REAL) — induced vertical break feet (×12 for inches)
- plate_x (REAL) — horizontal plate location ft
- plate_z (REAL) — vertical plate location ft
- sz_top (REAL), sz_bot (REAL) — batter strike zone boundaries ft
- release_extension (REAL) — ft
- release_pos_x/y/z (REAL) — release point ft
- arm_angle (REAL) — degrees
- stand (TEXT) — batter side L/R
- p_throws (TEXT) — pitcher hand L/R
- balls (INT), strikes (INT), outs_when_up (INT), inning (INT)
- inning_topbot (TEXT) — Top/Bot
- description (TEXT) — "called_strike", "swinging_strike", "ball", "foul", "hit_into_play"
- type (TEXT) — B/S/X
- events (TEXT) — "strikeout", "single", "home_run", "field_out", "walk"
- launch_speed (REAL), launch_angle (REAL), hit_distance_sc (REAL)
- bb_type (TEXT) — ground_ball, fly_ball, line_drive, popup
- estimated_ba_using_speedangle (REAL), estimated_woba_using_speedangle (REAL)
- woba_value (REAL), delta_run_exp (REAL)
- bat_speed (REAL), swing_length (REAL), attack_angle (REAL)
- home_team (TEXT), away_team (TEXT)
- zone (REAL) — strike zone region 1-14
- game_type (TEXT) — R/P/S
- stuff_plus (REAL) — pre-computed stuff grade

Derived fields (computed client-side, NOT in DB):
- vaa (vertical approach angle), haa (horizontal approach angle)
- pfx_x_in / pfx_z_in (movement in inches)
- brink (distance to zone edge, inches)
- cluster / cluster_r / cluster_l (distance from centroid, inches)

Other tables:
- pitcher_season_command: pre-computed command metrics per pitcher/year/pitch_type
  (avg_brink, avg_cluster, avg_cluster_r, avg_cluster_l, avg_missfire, cmd_plus, rpcom_plus, stuff_plus, etc.)
- players: id, name, position
- player_summary (materialized view): player_name, pitcher, total_pitches, games, avg_velo, avg_spin, team, pitch_types

QUERY RULES:
- SELECT only — no mutations
- Always include LIMIT (max 5000)
- player_name is "Last, First" format
- Use game_year for season filtering, not EXTRACT(YEAR FROM game_date)
- Whiff = description ILIKE '%swinging_strike%'
- Zone 1-9 = in strike zone, zone > 9 = outside
- Exclude pitch_type IN ('PO','IN') for valid pitch analysis
- For pitch movement, multiply pfx_x/pfx_z by 12 for inches

PERFORMANCE — the pitches table has 7.4M+ rows. Queries WILL time out if not careful:
- DEFAULT TO game_year = 2025 (current season) unless the user explicitly asks for other years
- If multi-year is needed, use game_year = SPECIFIC_YEAR (not >=), or query one year at a time
- NEVER use game_year >= or BETWEEN on more than 2 years — it scans too many rows
- Use pitcher (indexed) or game_date (indexed) in WHERE clauses
- For aggregations, GROUP BY with COUNT/AVG is fast; avoid window functions on large sets
- Prefer pitcher_season_command or player_summary for pre-aggregated data when possible
- Keep JOINs simple — avoid self-joins on pitches
- ROUND() requires numeric type — always cast: ROUND(value::numeric, 2), not ROUND(value, 2)
- Every non-aggregated column in SELECT must appear in GROUP BY — no exceptions
- When grouping, wrap value columns in AVG(), COUNT(), SUM(), etc. — never SELECT a raw column that isn't in GROUP BY

You MUST respond with a JSON object (no markdown fences, pure JSON) with these fields:
{
  "query_plan": "Plain English description of what you'll query and why",
  "sql": "The SELECT query to execute",
  "viz_config": [
    {
      "type": "line" | "bar" | "scatter" | "heatmap" | "table",
      "title": "Chart title",
      "description": "What this chart shows",
      "x": "column name for x-axis",
      "y": "column name for y-axis",
      "groupBy": "optional column for series grouping"
    }
  ],
  "clarification": "optional — only if the question is ambiguous"
}`

export async function POST(req: NextRequest) {
  const auth = await requireSessionUser()
  if (auth instanceof NextResponse) return auth
  try {
    const { question, history, confirmed, sql: confirmedSql, viz_config: confirmedViz } = await req.json()

    if (confirmed && confirmedSql) {
      // Validate before execution: read-only, single-statement, analytics tables only.
      const check = validateExploreSql(String(confirmedSql))
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 })
      }

      console.log('[explore] Executing SQL:', confirmedSql.slice(0, 500))
      const { data, error } = await supabaseAdminLong.rpc('run_query_long', { query_text: confirmedSql })
      if (error) {
        console.error('[explore] SQL error:', error.message)
        return NextResponse.json({ error: error.message, sql: confirmedSql }, { status: 500 })
      }

      const rows = (data || []).slice(0, 5000)
      return NextResponse.json({ rows, count: rows.length, viz_config: confirmedViz })
    }

    // Generate query plan via Claude
    const messages: Anthropic.MessageParam[] = [
      ...(history || []).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: question },
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    })

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')

    // Parse the JSON response
    let parsed
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({
        query_plan: text,
        sql: null,
        viz_config: [],
        clarification: 'I had trouble structuring my response. Could you rephrase your question?',
      })
    }

    return NextResponse.json({
      query_plan: parsed.query_plan || '',
      sql: parsed.sql || null,
      viz_config: parsed.viz_config || [],
      clarification: parsed.clarification || null,
    })
  } catch (error: any) {
    console.error('Explore query error:', error)
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 })
  }
}
