import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPT = `You are a baseball analytics assistant embedded in the Triton app. You have access to a Supabase database with 7.4 million+ Statcast pitch records from 2015-2025.

You are talking to Trevor May, a former MLB pitcher who uses this platform for YouTube content and media analysis. He understands advanced pitching metrics deeply.

DATABASE SCHEMA - Table: pitches
Key columns:
- player_name (TEXT) - pitcher name "Last, First" format
- pitcher (INT) - MLB player ID
- game_date (DATE), game_year (INT), game_pk (INT)
- pitch_type (TEXT) - code like FF, SL, CH, CU, SI, FC, ST, FS, KC, KN
- pitch_name (TEXT) - full name like "4-Seam Fastball", "Slider", "Changeup"
- release_speed (REAL) - velocity mph
- release_spin_rate (REAL) - spin rpm
- spin_axis (REAL) - spin axis degrees
- pfx_x (REAL) - horizontal break inches
- pfx_z (REAL) - induced vertical break inches
- plate_x (REAL) - horizontal plate location ft
- plate_z (REAL) - vertical plate location ft
- release_extension (REAL) - extension ft
- release_pos_x/y/z (REAL) - release point ft
- arm_angle (REAL) - degrees
- api_break_x_arm (REAL) - arm-side break inches
- api_break_z_with_gravity (REAL) - total vertical break inches
- stand (TEXT) - batter side L/R
- p_throws (TEXT) - pitcher hand L/R
- balls (INT), strikes (INT), outs_when_up (INT), inning (INT)
- inning_topbot (TEXT) - Top/Bot
- description (TEXT) - pitch result like "called_strike", "swinging_strike", "ball", "foul", "hit_into_play"
- type (TEXT) - B/S/X (ball/strike/in play)
- events (TEXT) - play result like "strikeout", "single", "home_run", "field_out", "walk"
- launch_speed (REAL) - exit velocity mph
- launch_angle (REAL) - degrees
- hit_distance_sc (REAL) - ft
- bb_type (TEXT) - ground_ball, fly_ball, line_drive, popup
- estimated_ba_using_speedangle (REAL) - xBA
- estimated_woba_using_speedangle (REAL) - xwOBA
- estimated_slg_using_speedangle (REAL) - xSLG
- woba_value (REAL), babip_value (REAL), iso_value (REAL)
- bat_speed (REAL), swing_length (REAL)
- home_team (TEXT), away_team (TEXT) - 3 letter codes
- home_score (INT), away_score (INT)
- delta_run_exp (REAL), delta_home_win_exp (REAL)
- n_thruorder_pitcher (REAL) - times through order
- zone (REAL) - strike zone region 1-14
- game_type (TEXT) - R (regular), P (postseason), etc.
- age_pit (REAL), age_bat (REAL)

There is also a materialized view: player_summary
- player_name, pitcher, total_pitches, games, first_date, last_date, avg_velo, avg_spin, team, pitch_types (array), latest_season

IMPORTANT QUERY GUIDELINES:
- Always use LIMIT to prevent huge results (max 100 rows for display)
- For aggregations, use GROUP BY with appropriate metrics
- player_name format is "Last, First" (e.g., "Burnes, Corbin")
- Whiff = description ILIKE '%swinging_strike%'
- Called strike = description = 'called_strike'
- Swing = description in swinging_strike variants + foul + hit_into_play
- Zone% = pitches where zone between 1 and 9 / total pitches
- For "best" or "nastiest" queries, define the metric clearly

When responding:
- Be concise and analytical
- Use numbers and data to support points
- Format tables cleanly when showing results
- Suggest follow-up analysis when relevant
- Think like a pitching analyst / scout`

const tools: Anthropic.Tool[] = [
  {
    name: 'query_database',
    description: 'Execute a read-only SQL query against the Statcast pitches database. Use this for any data retrieval, aggregation, filtering, or analysis. Always include LIMIT clause (max 100 for row-level, 500 for aggregated). The database has 7.4M+ rows so be specific with WHERE clauses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'The SQL SELECT query to execute. Must be read-only (no INSERT/UPDATE/DELETE).' },
        explanation: { type: 'string', description: 'Brief explanation of what this query does (shown to user).' }
      },
      required: ['sql', 'explanation']
    }
  },
  {
    name: 'search_players',
    description: 'Search for players by name. Returns player info including team, pitch types, total pitches, and avg velocity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name or partial name to search for.' }
      },
      required: ['name']
    }
  }
]

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    let currentMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }))

    // Loop for tool use
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages: currentMessages,
    })

    // Handle tool calls iteratively
    while (response.stop_reason === 'tool_use') {
      const assistantContent = response.content
      currentMessages.push({ role: 'assistant', content: assistantContent })

      const toolResults: any[] = []

      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          let result: string

          if (block.name === 'query_database') {
            const input = block.input as { sql: string; explanation: string }
            // Safety check
            const sqlLower = input.sql.toLowerCase().trim()
            if (!sqlLower.startsWith('select') && !sqlLower.startsWith('with')) {
              result = JSON.stringify({ error: 'Only SELECT queries are allowed.' })
            } else {
              const { data, error } = await supabase.rpc('run_query', { query_text: input.sql })
              if (error) {
                // Try direct query as fallback
                const { data: d2, error: e2 } = await supabase.from('pitches').select('*').limit(1)
                result = JSON.stringify({ error: error.message, hint: 'Try simplifying the query.' })
              } else {
                result = JSON.stringify({ explanation: input.explanation, data, row_count: Array.isArray(data) ? data.length : 0 })
              }
            }
          } else if (block.name === 'search_players') {
            const input = block.input as { name: string }
            const { data, error } = await supabase.rpc('search_players', { search_term: input.name, result_limit: 5 })
            result = JSON.stringify(error ? { error: error.message } : { players: data })
          } else {
            result = JSON.stringify({ error: 'Unknown tool' })
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          })
        }
      }

      currentMessages.push({ role: 'user', content: toolResults })

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages: currentMessages,
      })
    }

    // Extract text response
    const textContent = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

    return NextResponse.json({ response: textContent })
  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 })
  }
}
