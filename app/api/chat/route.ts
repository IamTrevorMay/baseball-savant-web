import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── MLB Stats API helpers ──────────────────────────────────────────
const MLB_API = 'https://statsapi.mlb.com/api/v1'

const TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113,
  CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133, PHI: 143,
  PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140,
  TOR: 141, WSH: 120,
}

const TEAM_NAMES: Record<string, string> = {
  diamondbacks: 'ARI', dbacks: 'ARI', braves: 'ATL', orioles: 'BAL',
  'red sox': 'BOS', redsox: 'BOS', cubs: 'CHC', 'white sox': 'CWS',
  whitesox: 'CWS', reds: 'CIN', guardians: 'CLE', indians: 'CLE',
  rockies: 'COL', tigers: 'DET', astros: 'HOU', royals: 'KC',
  angels: 'LAA', dodgers: 'LAD', marlins: 'MIA', brewers: 'MIL',
  twins: 'MIN', mets: 'NYM', yankees: 'NYY', athletics: 'OAK',
  'a\'s': 'OAK', phillies: 'PHI', pirates: 'PIT', padres: 'SD',
  giants: 'SF', mariners: 'SEA', cardinals: 'STL', rays: 'TB',
  rangers: 'TEX', 'blue jays': 'TOR', bluejays: 'TOR', nationals: 'WSH',
  arizona: 'ARI', atlanta: 'ATL', baltimore: 'BAL', boston: 'BOS',
  chicago: 'CHC', cincinnati: 'CIN', cleveland: 'CLE', colorado: 'COL',
  detroit: 'DET', houston: 'HOU', 'kansas city': 'KC', 'los angeles': 'LAD',
  miami: 'MIA', milwaukee: 'MIL', minnesota: 'MIN', 'new york': 'NYY',
  oakland: 'OAK', philadelphia: 'PHI', pittsburgh: 'PIT', 'san diego': 'SD',
  'san francisco': 'SF', seattle: 'SEA', 'st. louis': 'STL', 'st louis': 'STL',
  'tampa bay': 'TB', texas: 'TEX', toronto: 'TOR', washington: 'WSH',
}

function resolveTeamAbbrev(input: string): string | null {
  const upper = input.trim().toUpperCase()
  if (TEAM_IDS[upper]) return upper
  const lower = input.trim().toLowerCase()
  return TEAM_NAMES[lower] || null
}

async function mlbFetch(url: string): Promise<any> {
  const res = await fetch(url, { next: { revalidate: 60 } } as any)
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${res.statusText}`)
  return res.json()
}

const MODEL_BUILDER_SYSTEM_PROMPT = `You are a baseball analytics model builder embedded in the Triton app. You help users create custom metric formulas that can be deployed as computed columns on the pitches table.

DATABASE SCHEMA - Table: pitches
Key columns available for formulas:
- release_speed (REAL) - velocity mph
- release_spin_rate (REAL) - spin rpm
- spin_axis (REAL) - spin axis degrees
- pfx_x (REAL) - horizontal break feet (multiply by 12 for inches)
- pfx_z (REAL) - induced vertical break feet (multiply by 12 for inches)
- plate_x (REAL) - horizontal plate location ft
- plate_z (REAL) - vertical plate location ft
- release_extension (REAL) - extension ft
- release_pos_x/y/z (REAL) - release point ft
- arm_angle (REAL) - degrees
- launch_speed (REAL) - exit velocity mph
- launch_angle (REAL) - degrees
- estimated_ba_using_speedangle (REAL) - xBA
- estimated_woba_using_speedangle (REAL) - xwOBA
- woba_value (REAL), delta_run_exp (REAL)
- bat_speed (REAL), swing_length (REAL)
- vx0, vy0, vz0, ax, ay, az (REAL) - trajectory components
- zone (REAL) - strike zone region 1-14
- pitch_type (TEXT) - FF, SL, CH, CU, SI, FC, ST, FS, KC, KN
- description (TEXT) - pitch result

FORMULA RULES:
1. Formulas must be valid PostgreSQL expressions that reference columns from the pitches table
2. Use COALESCE for NULL handling: COALESCE(release_speed, 0)
3. Allowed SQL functions: ABS, SQRT, POWER, LN, LOG, EXP, GREATEST, LEAST, ROUND, CEIL, FLOOR, SIGN, COALESCE, NULLIF, CASE/WHEN/THEN/ELSE/END
4. Column names must use the model_ prefix convention (e.g., model_stuff_plus)
5. Formulas should produce REAL (numeric) output
6. Do NOT use subqueries, CTEs, or window functions — only scalar expressions

When you have a formula ready to render, output a FORMULA_UPDATE block like this:
FORMULA_UPDATE:{"formula":"ROUND((release_speed - 85) * 2 + (pfx_z * 12 - 10) * 1.5, 2)","name":"Stuff Plus","columnName":"model_stuff_plus","description":"Custom stuff metric based on velocity and movement"}

Use the test_formula tool to validate formulas against sample data. Analyze the results and suggest improvements.

Be collaborative — ask clarifying questions about what the user wants to measure, propose formulas, test them, and iterate.`

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

LAHMAN HISTORICAL DATABASE:
In addition to Statcast data, there is a Lahman database with historical baseball stats from 1871-present.
- lahman_people: ~20k players. Columns: lahman_id (PK), mlb_id (crosswalk), name_first, name_last, birth_year, debut, final_game, bats, throws
- lahman_batting: ~112k season batting records. Columns: lahman_id, year, stint, team_id, lg_id, g, ab, r, h, doubles, triples, hr, rbi, sb, cs, bb, so, ibb, hbp, sh, sf, gidp
- lahman_pitching: ~50k season pitching records. Columns: lahman_id, year, stint, team_id, lg_id, w, l, g, gs, cg, sho, sv, ipouts, h, er, hr, bb, so, era, ibb, wp, hbp, bk, bfp, gf, r
- lahman_batting_calc: View aggregating stints, includes pa, ba, obp, slg, ops
- lahman_pitching_calc: View aggregating stints, includes ip, era, whip, k9, bb9, hr9, k_pct, bb_pct
- lahman_awards: Award records (MVP, Cy Young, etc). Columns: lahman_id, award_id, year, lg_id
- lahman_allstars: All-Star selections. Columns: lahman_id, year, lg_id
- lahman_halloffame: HOF voting. Columns: lahman_id, year, voted_by, ballots, needed, votes, inducted, category

Use Lahman tables for historical/all-time questions (e.g., "most career HRs", "who won MVP in 1995"). Use Statcast pitches table for pitch-level analysis (2015+).

IMPORTANT QUERY GUIDELINES:
- Always use LIMIT to prevent huge results (max 100 rows for display)
- For aggregations, use GROUP BY with appropriate metrics
- player_name format is "Last, First" (e.g., "Burnes, Corbin")
- Whiff = description ILIKE '%swinging_strike%'
- Called strike = description = 'called_strike'
- Swing = description in swinging_strike variants + foul + hit_into_play
- Zone% = pitches where zone between 1 and 9 / total pitches
- For "best" or "nastiest" queries, define the metric clearly

MLB STATS API TOOLS:
You also have access to live MLB Stats API tools for real-time / official data:

- get_games: Today's scores, schedule, probable pitchers, or detailed box scores. Use for "who's pitching tonight?", "what's the score?", "how did [team] do yesterday?". For box score detail, first get the schedule to find the gamePk, then call again with gamePk + detail=true.
- get_standings: Current or historical division standings. Use for "what are the standings?", "who leads the AL East?".
- get_team_roster: Active 26-man roster for any team. Use for "who's on the Yankees roster?", "is [player] on the active roster?".
- get_player_info: Player bio and official career stats (year-by-year). Use for "what are [player]'s career stats?", "when did [player] debut?". Requires MLB player ID — use search_players first to find the ID.

WHEN TO USE WHICH:
- Live scores, schedule, rosters, standings → MLB API tools
- Official career stats (W-L, ERA, batting avg) → get_player_info OR Lahman tables
- Pitch-level Statcast analysis (velocity, movement, spin, whiff rate) → query_database on pitches table
- Historical all-time records (pre-2015) → query_database on Lahman tables

When responding:
- Be concise and analytical
- Use numbers and data to support points
- Format tables cleanly when showing results
- Suggest follow-up analysis when relevant
- Think like a pitching analyst / scout`

const tools: Anthropic.Tool[] = [
  {
    name: 'query_database',
    description: 'Execute a read-only SQL query against the database (Statcast pitches + Lahman historical tables). Use this for any data retrieval, aggregation, filtering, or analysis. Always include LIMIT clause (max 100 for row-level, 500 for aggregated). The pitches table has 7.4M+ rows so be specific with WHERE clauses. Lahman tables are available for historical queries.',
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
    description: 'Search for Statcast-era players by name. Returns player info including team, pitch types, total pitches, and avg velocity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name or partial name to search for.' }
      },
      required: ['name']
    }
  },
  {
    name: 'search_historical_players',
    description: 'Search for historical players in the Lahman database by name. Returns all-time players from 1871-present with their lahman_id and mlb_id (if available).',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name or partial name to search for.' }
      },
      required: ['name']
    }
  },
  {
    name: 'get_games',
    description: 'Get MLB game scores, schedule, and probable pitchers for a date, or a detailed box score for a specific game. Use for live scores, yesterday\'s results, upcoming matchups.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, or "today" or "yesterday". Defaults to today.' },
        gamePk: { type: 'number', description: 'Specific game ID for box score detail. Get this from a schedule call first.' },
        detail: { type: 'boolean', description: 'If true and gamePk provided, fetch full box score with batting/pitching lines.' },
      },
      required: []
    }
  },
  {
    name: 'get_standings',
    description: 'Get MLB division standings including W-L, pct, GB, streak, last 10, and run differential.',
    input_schema: {
      type: 'object' as const,
      properties: {
        season: { type: 'number', description: 'Season year. Defaults to current year.' },
        type: { type: 'string', enum: ['regular', 'spring'], description: 'Standings type. Defaults to regular season.' },
      },
      required: []
    }
  },
  {
    name: 'get_team_roster',
    description: 'Get the active roster for an MLB team. Accepts team abbreviation (NYY, LAD) or name (Yankees, Dodgers).',
    input_schema: {
      type: 'object' as const,
      properties: {
        team: { type: 'string', description: 'Team abbreviation (e.g. NYY) or name (e.g. Yankees).' },
        season: { type: 'number', description: 'Season year. Defaults to current year.' },
      },
      required: ['team']
    }
  },
  {
    name: 'get_player_info',
    description: 'Get player bio info and optionally career year-by-year stats from the MLB Stats API. Requires MLB player ID (use search_players first).',
    input_schema: {
      type: 'object' as const,
      properties: {
        playerId: { type: 'number', description: 'MLB player ID.' },
        includeStats: { type: 'boolean', description: 'Include year-by-year career stats. Defaults to true.' },
        statGroup: { type: 'string', enum: ['pitching', 'hitting'], description: 'Stat group to fetch. Defaults to pitching.' },
      },
      required: ['playerId']
    }
  },
]

const modelBuilderTools: Anthropic.Tool[] = [
  ...tools,
  {
    name: 'test_formula',
    description: 'Test a formula against sample pitches data. Returns 200 sample rows with the formula computed, plus aggregate stats (mean, stddev, min, max). Use this to validate formulas and analyze distributions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        formula: { type: 'string', description: 'The PostgreSQL expression to test as a formula.' }
      },
      required: ['formula']
    }
  }
]

async function handleTestFormula(formula: string): Promise<string> {
  const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i
  const DANGEROUS = /(--|;)/
  if (FORBIDDEN.test(formula) || DANGEROUS.test(formula)) {
    return JSON.stringify({ error: 'Formula contains forbidden SQL keywords' })
  }
  try {
    const sampleSql = `SELECT player_name, pitch_name, game_date, release_speed, (${formula}) AS model_value FROM pitches WHERE release_speed IS NOT NULL AND pitch_type NOT IN ('PO', 'IN') ORDER BY random() LIMIT 200`
    const { data: sampleRows, error: sampleErr } = await supabase.rpc('run_query', { query_text: sampleSql })
    if (sampleErr) return JSON.stringify({ error: sampleErr.message })

    const statsSql = `SELECT AVG((${formula})::numeric) AS mean, STDDEV((${formula})::numeric) AS stddev, MIN((${formula})::numeric) AS min, MAX((${formula})::numeric) AS max FROM (SELECT * FROM pitches WHERE release_speed IS NOT NULL AND pitch_type NOT IN ('PO', 'IN') ORDER BY random() LIMIT 10000) sub`
    const { data: statsData, error: statsErr } = await supabase.rpc('run_query', { query_text: statsSql })
    if (statsErr) return JSON.stringify({ error: statsErr.message })

    const stats = Array.isArray(statsData) && statsData.length > 0 ? statsData[0] : {}
    return JSON.stringify({ sampleRows: (sampleRows || []).slice(0, 20), stats, totalSampleRows: (sampleRows || []).length })
  } catch (e: any) {
    return JSON.stringify({ error: e.message })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, mode } = await req.json()
    const isModelBuilder = mode === 'model-builder'
    const systemPrompt = isModelBuilder ? MODEL_BUILDER_SYSTEM_PROMPT : SYSTEM_PROMPT
    const activeTools = isModelBuilder ? modelBuilderTools : tools

    let currentMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }))

    // Loop for tool use
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      tools: activeTools,
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
                result = JSON.stringify({ error: error.message, hint: 'Try simplifying the query.' })
              } else {
                result = JSON.stringify({ explanation: input.explanation, data, row_count: Array.isArray(data) ? data.length : 0 })
              }
            }
          } else if (block.name === 'search_players') {
            const input = block.input as { name: string }
            const { data, error } = await supabase.rpc('search_players', { search_term: input.name, result_limit: 5 })
            result = JSON.stringify(error ? { error: error.message } : { players: data })
          } else if (block.name === 'search_historical_players') {
            const input = block.input as { name: string }
            const safeName = input.name.replace(/'/g, "''")
            const searchSql = `SELECT lahman_id, mlb_id, name_first, name_last, birth_year, debut, final_game, bats, throws FROM lahman_people WHERE (name_last || ', ' || name_first) % '${safeName}' OR LOWER(name_last) LIKE LOWER('${safeName}%') OR LOWER(name_first || ' ' || name_last) LIKE LOWER('%${safeName}%') ORDER BY similarity(name_last || ', ' || name_first, '${safeName}') DESC LIMIT 10`
            const { data, error } = await supabase.rpc('run_query', { query_text: searchSql })
            result = JSON.stringify(error ? { error: error.message } : { players: data })
          } else if (block.name === 'test_formula') {
            const input = block.input as { formula: string }
            result = await handleTestFormula(input.formula)
          } else if (block.name === 'get_games') {
            const input = block.input as { date?: string; gamePk?: number; detail?: boolean }
            try {
              if (input.gamePk && input.detail) {
                // Box score mode
                const [box, line] = await Promise.all([
                  mlbFetch(`${MLB_API}/game/${input.gamePk}/boxscore`),
                  mlbFetch(`${MLB_API}/game/${input.gamePk}/linescore`),
                ])
                const fmt = (side: any) => {
                  const batters = (side.batters || []).slice(0, 12).map((id: number) => {
                    const p = side.players?.[`ID${id}`]
                    if (!p) return null
                    const s = p.stats?.batting || {}
                    return { name: p.person?.fullName, pos: p.position?.abbreviation, ab: s.atBats, r: s.runs, h: s.hits, rbi: s.rbi, hr: s.homeRuns, bb: s.baseOnBalls, k: s.strikeOuts, avg: s.avg }
                  }).filter(Boolean)
                  const pitchers = (side.pitchers || []).map((id: number) => {
                    const p = side.players?.[`ID${id}`]
                    if (!p) return null
                    const s = p.stats?.pitching || {}
                    return { name: p.person?.fullName, ip: s.inningsPitched, h: s.hits, r: s.runs, er: s.earnedRuns, bb: s.baseOnBalls, k: s.strikeOuts, pitches: s.numberOfPitches }
                  }).filter(Boolean)
                  return { batters, pitchers }
                }
                const innings = (line.innings || []).map((inn: any) => ({ inning: inn.num, away: inn.away?.runs ?? '-', home: inn.home?.runs ?? '-' }))
                result = JSON.stringify({
                  away: { team: box.teams?.away?.team?.abbreviation, ...fmt(box.teams?.away) },
                  home: { team: box.teams?.home?.team?.abbreviation, ...fmt(box.teams?.home) },
                  innings,
                  score: { away: line.teams?.away?.runs, home: line.teams?.home?.runs },
                })
              } else {
                // Schedule mode
                let dateStr = input.date || 'today'
                if (dateStr === 'today') dateStr = new Date().toISOString().slice(0, 10)
                else if (dateStr === 'yesterday') {
                  const d = new Date(); d.setDate(d.getDate() - 1)
                  dateStr = d.toISOString().slice(0, 10)
                }
                const data = await mlbFetch(`${MLB_API}/schedule?date=${dateStr}&sportId=1&hydrate=team,linescore,probablePitcher`)
                const games = (data.dates?.[0]?.games || []).map((g: any) => ({
                  gamePk: g.gamePk,
                  state: g.status?.detailedState,
                  away: g.teams?.away?.team?.abbreviation,
                  home: g.teams?.home?.team?.abbreviation,
                  awayScore: g.teams?.away?.score,
                  homeScore: g.teams?.home?.score,
                  awayProbable: g.teams?.away?.probablePitcher?.fullName || null,
                  homeProbable: g.teams?.home?.probablePitcher?.fullName || null,
                  inning: g.linescore?.currentInningOrdinal || null,
                  inningState: g.linescore?.inningHalf || null,
                }))
                result = JSON.stringify({ date: dateStr, games, gameCount: games.length })
              }
            } catch (e: any) {
              result = JSON.stringify({ error: e.message })
            }
          } else if (block.name === 'get_standings') {
            const input = block.input as { season?: number; type?: string }
            try {
              const season = input.season || new Date().getFullYear()
              const standingsType = input.type === 'spring' ? 'springTraining' : 'regularSeason'
              const data = await mlbFetch(`${MLB_API}/standings?leagueId=103,104&season=${season}&standingsTypes=${standingsType}&hydrate=team`)
              const divisions = (data.records || []).map((div: any) => ({
                division: div.division?.name,
                teams: (div.teamRecords || []).map((t: any) => ({
                  team: t.team?.abbreviation,
                  w: t.wins, l: t.losses,
                  pct: t.winningPercentage,
                  gb: t.gamesBack,
                  streak: t.streak?.streakCode,
                  l10: `${t.records?.splitRecords?.find((r: any) => r.type === 'lastTen')?.wins || '-'}-${t.records?.splitRecords?.find((r: any) => r.type === 'lastTen')?.losses || '-'}`,
                  runDiff: t.runDifferential,
                }))
              }))
              result = JSON.stringify({ season, type: standingsType, divisions })
            } catch (e: any) {
              result = JSON.stringify({ error: e.message })
            }
          } else if (block.name === 'get_team_roster') {
            const input = block.input as { team: string; season?: number }
            try {
              const abbrev = resolveTeamAbbrev(input.team)
              if (!abbrev) throw new Error(`Could not resolve team: "${input.team}". Use abbreviation (NYY) or name (Yankees).`)
              const teamId = TEAM_IDS[abbrev]
              const season = input.season || new Date().getFullYear()
              const data = await mlbFetch(`${MLB_API}/teams/${teamId}/roster/active?season=${season}`)
              const roster = (data.roster || []).map((p: any) => ({
                name: p.person?.fullName,
                id: p.person?.id,
                position: p.position?.abbreviation,
                number: p.jerseyNumber,
                bats: p.person?.batSide?.code,
                throws: p.person?.pitchHand?.code,
              }))
              result = JSON.stringify({ team: abbrev, season, roster, count: roster.length })
            } catch (e: any) {
              result = JSON.stringify({ error: e.message })
            }
          } else if (block.name === 'get_player_info') {
            const input = block.input as { playerId: number; includeStats?: boolean; statGroup?: string }
            try {
              const data = await mlbFetch(`${MLB_API}/people/${input.playerId}`)
              const person = data.people?.[0]
              const bio = {
                name: person?.fullName,
                id: person?.id,
                position: person?.primaryPosition?.abbreviation,
                bats: person?.batSide?.code,
                throws: person?.pitchHand?.code,
                birthDate: person?.birthDate,
                age: person?.currentAge,
                height: person?.height,
                weight: person?.weight,
                debut: person?.mlbDebutDate,
                team: person?.currentTeam?.name,
              }
              let stats = null
              if (input.includeStats !== false) {
                const group = input.statGroup || 'pitching'
                const statsData = await mlbFetch(`${MLB_API}/people/${input.playerId}/stats?stats=yearByYear&group=${group}`)
                const splits = statsData.stats?.[0]?.splits || []
                stats = splits.filter((s: any) => s.sport?.id === 1).map((s: any) => ({
                  season: s.season,
                  team: s.team?.abbreviation,
                  ...s.stat,
                }))
              }
              result = JSON.stringify({ bio, stats })
            } catch (e: any) {
              result = JSON.stringify({ error: e.message })
            }
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
        system: systemPrompt,
        tools: activeTools,
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
