import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdminLong } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

PERFORMANCE — the pitches table has 7.4M+ rows and queries time out at 120s:
- ALWAYS filter by game_year (indexed) — never scan all years unless asked
- Use pitcher (indexed) or game_date (indexed) in WHERE clauses
- For aggregations, GROUP BY with COUNT/AVG is fast; avoid window functions on large sets
- Prefer pitcher_season_command or player_summary for pre-aggregated data
- Keep JOINs simple — avoid self-joins on pitches
- If a question spans all years, aggregate per year first, then combine

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
  try {
    const { question, history, confirmed, sql: confirmedSql, viz_config: confirmedViz } = await req.json()

    if (confirmed && confirmedSql) {
      // Execute the confirmed SQL
      const sqlLower = confirmedSql.toLowerCase().trim()
      if (!sqlLower.startsWith('select') && !sqlLower.startsWith('with')) {
        return NextResponse.json({ error: 'Only SELECT queries are allowed.' }, { status: 400 })
      }

      const { data, error } = await supabaseAdminLong.rpc('run_query', { query_text: confirmedSql })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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
