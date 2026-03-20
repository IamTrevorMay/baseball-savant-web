import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPT = `You are a data export assistant for the Triton baseball analytics platform. Your job is to help users build custom CSV datasets from a Statcast database with 7.4M+ pitch records (2015-2025) and Lahman historical tables.

DATABASE SCHEMA - Table: pitches
Key columns:
- player_name (TEXT) - pitcher name "Last, First" format
- pitcher (INT) - MLB player ID
- batter (INT) - MLB batter ID
- game_date (DATE), game_year (INT), game_pk (INT)
- pitch_type (TEXT) - code like FF, SL, CH, CU, SI, FC, ST, FS, KC, KN
- pitch_name (TEXT) - full name like "4-Seam Fastball", "Slider"
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
- woba_value (REAL), babip_value (REAL), iso_value (REAL), delta_run_exp (REAL)
- bat_speed (REAL), swing_length (REAL)
- attack_angle (REAL), attack_direction (REAL), swing_path_tilt (REAL)
- home_team (TEXT), away_team (TEXT) - 3 letter codes
- home_score (INT), away_score (INT)
- n_thruorder_pitcher (REAL) - times through order
- zone (REAL) - strike zone region 1-14
- game_type (TEXT) - R (regular), P (postseason)
- age_pit (REAL), age_bat (REAL)
- stuff_plus (REAL) - stuff+ metric (100 = average)

Materialized view: player_summary
- player_name, pitcher, total_pitches, games, first_date, last_date, avg_velo, avg_spin, team, pitch_types (array), latest_season

LAHMAN HISTORICAL DATABASE (1871-present):
- lahman_people: lahman_id, mlb_id, name_first, name_last, birth_year, debut, final_game
- lahman_batting: lahman_id, year, team_id, g, ab, r, h, doubles, triples, hr, rbi, sb, bb, so
- lahman_pitching: lahman_id, year, team_id, w, l, g, gs, sv, ipouts, h, er, hr, bb, so, era
- lahman_batting_calc: Aggregated with pa, ba, obp, slg, ops
- lahman_pitching_calc: Aggregated with ip, era, whip, k9, bb9

YOUR WORKFLOW:
1. Have a conversation with the user to understand exactly what data they want
2. Ask clarifying questions: what columns, filters, grouping, sorting, time range, etc.
3. When the user says "Export" (or similar), use the build_csv tool to generate the data
4. The build_csv tool will execute the query and return CSV data

IMPORTANT:
- Do NOT run queries until the user confirms they want to export. Use the conversation to refine the request.
- When planning, describe the query you would run in plain English so the user can confirm
- For large exports, warn about row counts and suggest filters
- No LIMIT on export queries unless the user requests one — they want complete datasets
- When the user says "export", "build it", "generate", "download", or similar, use the build_csv tool
- Use the preview_query tool to show a small sample (10 rows) so the user can verify columns/format before full export
- Always ROUND numeric aggregations to reasonable precision (2-3 decimal places)
- player_name format is "Last, First" — suggest aliasing to cleaner format if aggregating`

const tools: Anthropic.Tool[] = [
  {
    name: 'preview_query',
    description: 'Run a preview of the export query, returning only 10 rows so the user can verify columns and format before the full export.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'The SQL SELECT query to preview (LIMIT 10 will be enforced).' },
        description: { type: 'string', description: 'Brief description of what this query produces.' },
      },
      required: ['sql', 'description'],
    },
  },
  {
    name: 'build_csv',
    description: 'Execute the final export query and return CSV data for download. Use this when the user confirms they want to export. No row limit unless specified by user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'The SQL SELECT query to execute for CSV export.' },
        filename: { type: 'string', description: 'Suggested filename for the CSV (without extension).' },
        description: { type: 'string', description: 'Brief description of the dataset.' },
      },
      required: ['sql', 'filename', 'description'],
    },
  },
  {
    name: 'search_players',
    description: 'Search for players by name to find IDs and metadata.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name or partial name.' },
      },
      required: ['name'],
    },
  },
]

function rowsToCsv(rows: Record<string, any>[]): string {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(','))
  }
  return lines.join('\n')
}

async function executeTool(block: any, userId: string): Promise<{ result: string; csvExport?: any }> {
  let result: string
  let csvExport: any = undefined

  if (block.name === 'preview_query') {
    const input = block.input as { sql: string; description: string }
    let sql = input.sql.replace(/\bLIMIT\s+\d+/i, 'LIMIT 10')
    if (!/\bLIMIT\b/i.test(sql)) sql += ' LIMIT 10'
    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) {
      result = JSON.stringify({ error: error.message })
    } else {
      result = JSON.stringify({ description: input.description, preview: data, row_count: Array.isArray(data) ? data.length : 0 })
    }
  } else if (block.name === 'build_csv') {
    const input = block.input as { sql: string; filename: string; description: string }
    const sqlLower = input.sql.toLowerCase().trim()
    if (!sqlLower.startsWith('select') && !sqlLower.startsWith('with')) {
      result = JSON.stringify({ error: 'Only SELECT queries are allowed.' })
    } else {
      const { data, error } = await supabase.rpc('run_query', { query_text: input.sql })
      if (error) {
        result = JSON.stringify({ error: error.message })
      } else {
        const rows = Array.isArray(data) ? data : []
        const csv = rowsToCsv(rows)
        // Save to database
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('data_exports')
          .insert({ user_id: userId, filename: input.filename, description: input.description, row_count: rows.length, csv })
          .select('id')
          .single()
        const exportId = inserted?.id || 'error'
        if (insertErr) console.error('Failed to save export:', insertErr.message)
        csvExport = { exportId, filename: input.filename, description: input.description, row_count: rows.length }
        result = JSON.stringify({ description: input.description, filename: input.filename, row_count: rows.length, exportId })
      }
    }
  } else if (block.name === 'search_players') {
    const input = block.input as { name: string }
    const { data, error } = await supabase.rpc('search_players', { search_term: input.name, result_limit: 5 })
    result = JSON.stringify(error ? { error: error.message } : { players: data })
  } else {
    result = JSON.stringify({ error: `Unknown tool: ${block.name}` })
  }

  return { result, csvExport }
}

export async function POST(req: NextRequest) {
  // Authenticate
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await req.json()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: Record<string, any>) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      try {
        let currentMessages = messages.map((m: any) => ({ role: m.role, content: m.content }))
        const pendingExports: any[] = []

        let finished = false
        while (!finished) {
          const apiStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools,
            messages: currentMessages,
          })

          apiStream.on('text', (text) => {
            send({ type: 'text', text })
          })

          const finalMessage = await apiStream.finalMessage()

          if (finalMessage.stop_reason === 'tool_use') {
            currentMessages.push({ role: 'assistant', content: finalMessage.content })
            const toolResults: any[] = []

            for (const block of finalMessage.content) {
              if (block.type !== 'tool_use') continue

              const label = block.name === 'build_csv' ? 'export query' : block.name === 'preview_query' ? 'preview' : 'search'
              send({ type: 'status', status: `Running ${label}...` })

              const { result, csvExport } = await executeTool(block, user.id)

              if (csvExport) {
                pendingExports.push(csvExport)
              }

              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
            }

            currentMessages.push({ role: 'user', content: toolResults })
          } else {
            finished = true
          }
        }

        for (const exp of pendingExports) {
          send({ type: 'export', ...exp })
        }

        send({ type: 'done' })
        controller.close()
      } catch (e: any) {
        send({ type: 'error', error: e.message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// GET /api/data-export?id=xxx — download a specific CSV
// GET /api/data-export — list all exports for the current user
export async function GET(req: NextRequest) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    // Download a specific export
    const { data, error } = await supabaseAdmin
      .from('data_exports')
      .select('csv, filename, user_id')
      .eq('id', id)
      .single()

    if (error || !data) return new Response('Export not found', { status: 404 })
    if (data.user_id !== user.id) return new Response('Forbidden', { status: 403 })

    return new Response(data.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${data.filename}.csv"`,
      },
    })
  }

  // List all exports for this user
  const { data, error } = await supabaseAdmin
    .from('data_exports')
    .select('id, filename, description, row_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exports: data })
}
