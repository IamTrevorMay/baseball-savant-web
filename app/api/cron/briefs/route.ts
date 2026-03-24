import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'

export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Triton Baseball News Aggregator' },
})

const maydaySupabase = createClient(
  process.env.MAYDAY_SUPABASE_URL!,
  process.env.MAYDAY_SUPABASE_ANON_KEY!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders })
}

function json(body: any, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Compute yesterday's date in ET
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() - 1)
  const briefDate = et.toISOString().slice(0, 10)

  // Skip offseason (Dec, Jan)
  const month = et.getMonth() + 1
  if (month === 12 || month === 1) {
    return json({ ok: true, skipped: true, reason: 'offseason' })
  }

  // Force regeneration: delete existing brief for this date
  const force = req.nextUrl.searchParams.get('force') === 'true'
  if (force) {
    await supabaseAdmin.from('briefs').delete().eq('date', briefDate)
  }

  // Idempotency: skip if brief already exists
  const { data: existing } = await supabaseAdmin
    .from('briefs')
    .select('id')
    .eq('date', briefDate)
    .maybeSingle()

  if (existing) {
    return json({ ok: true, skipped: true, reason: 'already_exists', date: briefDate })
  }

  try {
    // Fetch games, news, transactions, and daily highlights in parallel
    const [gamesData, newsItems, transactions, dailyHighlights] = await Promise.all([
      fetchGamesWithLinescores(briefDate),
      fetchNews(),
      fetchTransactions(briefDate),
      fetchDailyHighlights(briefDate),
    ])

    // Fetch full box scores for finished games (batched)
    const finishedGames = gamesData.filter((g: any) => g.state === 'Final')
    const boxScores: any[] = []
    for (let i = 0; i < finishedGames.length; i += 5) {
      const batch = finishedGames.slice(i, i + 5)
      const results = await Promise.allSettled(
        batch.map((g: any) => fetchFullBoxScore(g.gamePk))
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) boxScores.push(r.value)
      }
    }

    const isOffDay = finishedGames.length === 0

    // Build player name → ID lookup from box score data (early, for box score HTML)
    const playerNameToIdEarly: Record<string, number> = {}
    for (const bs of boxScores) {
      for (const b of [...(bs.away.batters || []), ...(bs.home.batters || [])]) {
        if (b.name && b.id) playerNameToIdEarly[b.name] = b.id
      }
      for (const p of [...(bs.away.pitchers || []), ...(bs.home.pitchers || [])]) {
        if (p.name && p.id) playerNameToIdEarly[p.name] = p.id
      }
    }

    // Build box scores HTML (deterministic — no Claude needed)
    const boxScoresHtml = buildBoxScoresHtml(boxScores, playerNameToIdEarly)

    // Build news HTML (deterministic)
    // Ensure at least 8 headlines; show up to 12
    const topNews = newsItems.slice(0, Math.max(8, Math.min(newsItems.length, 12)))
    const newsHtml = buildNewsHtml(topNews)

    // Build news headlines for Claude context
    const newsHeadlines = newsItems.slice(0, 20).map(a => `${a.title} [${a.source}]`).join('\n')

    // Ask Claude for: title, summary, day rundown, performances, injuries
    const performanceData = boxScores.map(bs => ({
      away: bs.away.team.abbrev,
      home: bs.home.team.abbrev,
      awayScore: bs.totals.away.runs,
      homeScore: bs.totals.home.runs,
      awayBatters: bs.away.batters,
      homeBatters: bs.home.batters,
      awayPitchers: bs.away.pitchers,
      homePitchers: bs.home.pitchers,
    }))

    const claudePrompt = isOffDay
      ? `Generate a brief MLB daily recap for ${briefDate} (off-day / no games). Return JSON with { title, summary, dayRundown, aroundBaseball, topPerformances, worstPerformances, injuries, transactions }. dayRundown, aroundBaseball, topPerformances, and worstPerformances should be empty strings. For injuries and transactions, return empty strings.`
      : `Analyze these ${briefDate} MLB box scores, news headlines, and transaction data. Return JSON with exactly 8 fields:
- "title": Catchy headline (e.g., "Yankees Cruise, Dodgers Walk Off — March 11 Recap")
- "summary": 1-2 sentence summary of the day.
- "dayRundown": A narrative recap of the day's action, under 500 words. Tell the story of the day — the big wins, comebacks, dominant pitching performances, offensive explosions, and any notable storylines. Write it like a sportswriter's column, flowing naturally from game to game. Use HTML paragraphs with inline styles. Player names should be bold.
- "aroundBaseball": If notable non-MLB baseball news appears in the headlines (minor leagues, college, high school, international), write a brief HTML paragraph or two covering it. If no non-MLB baseball news is present, return an empty string.
- "topPerformances": HTML section of the 8-10 best individual performances (hitters and pitchers). Use a styled list with player names, teams, and key stats.
- "worstPerformances": HTML section of the 4-5 worst individual performances. Same format.
- "injuries": HTML section for possible in-game injuries — players who may have left games early based on box score anomalies (starter with unusually few AB, pitcher pulled early). Use color:#fbbf24 accent. If none detected, return an empty string.
- "transactions": HTML section for IL placements and IL activations from the transaction data. Use red accent (#f87171) for placements and green accent (#34d399) for activations. If no transaction data, return an empty string.

Box score data:\n${JSON.stringify(performanceData)}

News headlines:\n${newsHeadlines}

IL/Transaction data:\n${JSON.stringify(transactions)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 6144,
      messages: [{ role: 'user', content: claudePrompt }],
      system: `You are a baseball analyst writing a daily brief for a professional scouting platform.

Return JSON with exactly these fields: title, summary, dayRundown, aroundBaseball, topPerformances, worstPerformances, injuries, transactions.

For dayRundown, write a narrative recap of the day under 500 words. Use HTML with inline styles. Format as 3-5 paragraphs wrapped in <p> tags with style="margin-bottom:14px;color:#d4d4d8;font-size:14px;line-height:1.7;". Bold player names using <strong style="color:#f0f0f0">Player Name</strong>. Tell the story of the day like a sportswriter — weave together the biggest moments, comebacks, dominant performances, and storylines.

For topPerformances and worstPerformances, generate HTML using INLINE STYLES (no CSS classes). Each performance entry should be a table row in this exact format:

<tr>
  <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
    <span style="font-weight:600;color:#f0f0f0">Player Name</span>
    <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">TEA</span>
  </td>
  <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
    3-for-4, 2 HR, 5 RBI
  </td>
</tr>

Wrap all rows in: <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>...</tbody></table>

For worst performances, use color:#f87171 on the stats td instead of the default.

For top performances, highlight dominant pitching (lots of K, low ER, deep outings) and big offensive games (multi-hit, HR, high RBI).
For worst performances, highlight blown starts (short outings, high ER), 0-for with multiple K, etc.

For injuries, generate HTML using the same table format for possible in-game injuries only — players who may have left games early based on box score anomalies (early exit, unusually low AB for a starter, pitcher pulled after few pitches). Use color:#fbbf24 for these entries. Each entry: player name (bold), team abbreviation, and description. If no possible injuries detected, return an empty string.

For transactions, generate HTML using the same table format for IL moves:
1. "IL Placements" — players placed on the injured list (use color:#f87171 for the status label)
2. "Activated" — players activated from the injured list (use color:#34d399 for the status label)
Each entry: player name (bold), team abbreviation, and description. If no transaction data exists, return an empty string.

Return ONLY valid JSON, no markdown fences.`,
    })

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    let parsed: { title: string; summary: string; dayRundown: string; aroundBaseball: string; topPerformances: string; worstPerformances: string; injuries: string; transactions: string }
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      const cleaned = jsonMatch ? jsonMatch[0] : textContent.trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: 'Failed to parse Claude response', raw: textContent.slice(0, 500) }, { status: 500 })
    }

    // Assemble final HTML
    const finalHtml = assembleBriefHtml({
      dayRundown: parsed.dayRundown,
      aroundBaseball: parsed.aroundBaseball,
      boxScoresHtml,
      topPerformances: parsed.topPerformances,
      worstPerformances: parsed.worstPerformances,
      injuries: parsed.injuries,
      transactions: parsed.transactions,
      newsHtml,
      isOffDay,
      playerNameToId: playerNameToIdEarly,
      dailyHighlights,
    })

    // Insert into briefs table
    const { error: insertError } = await supabaseAdmin
      .from('briefs')
      .insert({
        date: briefDate,
        title: parsed.title,
        content: finalHtml,
        summary: parsed.summary,
        metadata: {
          games_count: gamesData.length,
          finished_count: finishedGames.length,
          is_off_day: isOffDay,
        },
      })

    if (insertError) {
      return json({ error: insertError.message }, { status: 500 })
    }

    return json({ ok: true, date: briefDate, title: parsed.title })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, { status: 500 })
  }
}

/* ─── HTML Builders ─── */

const S = {
  // Layout
  wrap: 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#d4d4d8;line-height:1.5;',
  section: 'margin-bottom:40px;',
  sectionTitle: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);',
  // Box score cards
  cardGrid: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;',
  card: 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;',
  cardHeader: 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);',
  teamRow: 'display:flex;align-items:center;gap:8px;',
  teamAbbrev: 'font-size:13px;font-weight:700;width:36px;',
  teamScore: 'font-size:20px;font-weight:800;',
  scoreWin: 'color:#ffffff;',
  scoreLose: 'color:rgba(255,255,255,0.35);',
  atSymbol: 'color:rgba(255,255,255,0.2);font-size:11px;font-weight:400;margin:0 4px;',
  // Linescore
  linescoreWrap: 'padding:0 16px 10px;overflow-x:auto;',
  linescoreTable: 'width:100%;border-collapse:collapse;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;font-size:10px;',
  lsHeader: 'color:rgba(255,255,255,0.25);font-weight:500;padding:4px 0;text-align:center;',
  lsHeaderTeam: 'color:rgba(255,255,255,0.25);font-weight:500;padding:4px 0;text-align:left;width:36px;',
  lsCell: 'padding:3px 0;text-align:center;min-width:18px;',
  lsCellScored: 'color:#ffffff;font-weight:600;',
  lsCellEmpty: 'color:rgba(255,255,255,0.2);',
  lsTotalR: 'font-weight:700;padding:3px 4px;text-align:center;border-left:1px solid rgba(255,255,255,0.08);',
  lsTotalHE: 'color:rgba(255,255,255,0.4);padding:3px 4px;text-align:center;',
  // Decisions
  decRow: 'padding:6px 16px 10px;font-size:11px;color:rgba(255,255,255,0.4);display:flex;gap:12px;flex-wrap:wrap;',
  decW: 'color:#34d399;',
  decL: 'color:#f87171;',
  decS: 'color:#38bdf8;',
  // Expanded box
  expandToggle: 'display:block;width:100%;padding:6px 16px;background:rgba(255,255,255,0.02);border:none;border-top:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.3);font-size:10px;font-family:inherit;cursor:pointer;text-align:center;',
  detailsInner: 'padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);',
  detailLabel: 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.3);margin:12px 0 4px;',
  detailTable: 'width:100%;border-collapse:collapse;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;font-size:10px;',
  dtHead: 'color:rgba(255,255,255,0.25);font-weight:500;padding:3px 0;text-align:center;',
  dtHeadLeft: 'color:rgba(255,255,255,0.25);font-weight:500;padding:3px 0;text-align:left;',
  dtCell: 'padding:2px 0;text-align:center;color:rgba(255,255,255,0.55);border-bottom:1px solid rgba(255,255,255,0.04);',
  dtCellName: 'padding:2px 0;text-align:left;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.04);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;',
  dtCellHi: 'font-weight:600;color:#ffffff;',
  dtCellHr: 'font-weight:700;color:#fbbf24;',
  dtCellRbi: 'color:#34d399;',
  dtCellK: 'color:rgba(248,113,113,0.6);',
  dtCellSo: 'color:#34d399;',
  // Performances
  perfWrap: 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;',
  // News
  newsItem: 'display:flex;align-items:start;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);',
  newsTitle: 'font-size:13px;font-weight:500;color:#e2e8f0;line-height:1.4;text-decoration:none;',
  newsDesc: 'font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px;line-height:1.4;',
  newsBadge: 'flex-shrink:0;font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.35);white-space:nowrap;margin-top:1px;',
}

interface DailyHighlightsData {
  date: string
  stuff_starter: { player_id: number; player_name: string; team: string; pitch_name: string; stuff_plus: number; velo: number | null; hbreak_in: number | null; ivb_in: number | null } | null
  stuff_reliever: { player_id: number; player_name: string; team: string; pitch_name: string; stuff_plus: number; velo: number | null; hbreak_in: number | null; ivb_in: number | null } | null
  cmd_starter: { player_id: number; player_name: string; team: string; cmd_plus: number; pitches: number } | null
  cmd_reliever: { player_id: number; player_name: string; team: string; cmd_plus: number; pitches: number } | null
  new_pitches: Array<{
    player_id: number; player_name: string; team: string; pitch_name: string; count: number
    avg_hbreak: number | null; avg_ivb: number | null; avg_stuff_plus: number | null
    avg_brink: number | null; avg_cluster: number | null; avg_missfire: number | null; cmd_plus: number | null
  }>
}

function plusColorHex(val: number): string {
  if (val >= 130) return '#34d399'
  if (val >= 115) return '#6ee7b7'
  if (val >= 100) return '#d4d4d8'
  if (val >= 85) return '#fb923c'
  return '#f87171'
}

function buildDailyHighlightsHtml(data: DailyHighlightsData | null): string {
  if (!data) return ''
  const hasStuff = data.stuff_starter || data.stuff_reliever
  const hasCmd = data.cmd_starter || data.cmd_reliever
  const hasNew = data.new_pitches.length > 0
  if (!hasStuff && !hasCmd && !hasNew) return ''

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'
  const headshot = (id: number) =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_100,q_auto:best/v1/people/${id}/headshot/67/current`

  const cardStyle = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 16px;text-decoration:none;display:block;color:inherit;'
  const labelStyle = 'font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:10px;'
  const nameStyle = 'font-size:13px;font-weight:600;color:#f0f0f0;'
  const subStyle = 'font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;'
  const valStyle = (c: string) => `font-size:22px;font-weight:800;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;color:${c};`
  const imgStyle = 'width:44px;height:44px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,0.05);'

  const stuffCard = (label: string, accentLabel: string, d: typeof data.stuff_starter) => {
    if (!d) return ''
    return `
    <a href="${siteUrl}/player/${d.player_id}" style="${cardStyle}">
      <div style="${labelStyle}"><span style="color:#fbbf24">${accentLabel}</span> ${label}</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${headshot(d.player_id)}" alt="" style="${imgStyle}" />
        <div style="flex:1;min-width:0;">
          <div style="${nameStyle}">${escapeHtml(d.player_name)}</div>
          <div style="${subStyle}">${escapeHtml(d.team)} · ${escapeHtml(d.pitch_name)}</div>
        </div>
        <div style="text-align:right;">
          <div style="${valStyle(plusColorHex(d.stuff_plus))}">${d.stuff_plus}</div>
          ${d.velo ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:1px;">${d.velo} mph</div>` : ''}
        </div>
      </div>
    </a>`
  }

  const cmdCard = (label: string, accentLabel: string, d: typeof data.cmd_starter) => {
    if (!d) return ''
    return `
    <a href="${siteUrl}/player/${d.player_id}" style="${cardStyle}">
      <div style="${labelStyle}"><span style="color:#38bdf8">${accentLabel}</span> ${label}</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${headshot(d.player_id)}" alt="" style="${imgStyle}" />
        <div style="flex:1;min-width:0;">
          <div style="${nameStyle}">${escapeHtml(d.player_name)}</div>
          <div style="${subStyle}">${escapeHtml(d.team)} · ${d.pitches} pitches</div>
        </div>
        <div style="${valStyle(plusColorHex(d.cmd_plus))}">${d.cmd_plus}</div>
      </div>
    </a>`
  }

  // Top row: 4 cards in 2x2 grid
  const topCards = [
    stuffCard('Starter', 'Stuff+', data.stuff_starter),
    stuffCard('Reliever', 'Stuff+', data.stuff_reliever),
    cmdCard('Starter', 'Cmd+', data.cmd_starter),
    cmdCard('Reliever', 'Cmd+', data.cmd_reliever),
  ].filter(Boolean)

  let html = ''

  if (topCards.length > 0) {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">${topCards.join('')}</div>`
  }

  // New pitch alerts table
  if (hasNew) {
    const thStyle = 'padding:5px 8px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid rgba(255,255,255,0.08);'
    const tdStyle = 'padding:5px 8px;font-size:11px;color:rgba(255,255,255,0.55);border-bottom:1px solid rgba(255,255,255,0.04);font-family:"SF Mono",SFMono-Regular,Menlo,monospace;'
    const tdNameStyle = 'padding:5px 8px;font-size:11px;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.04);white-space:nowrap;'

    const rows = data.new_pitches.map(np => {
      const pLink = `<a href="${siteUrl}/player/${np.player_id}" style="color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:2px;">${escapeHtml(np.player_name)}</a>`
      const stuffColor = np.avg_stuff_plus != null ? plusColorHex(np.avg_stuff_plus) : 'rgba(255,255,255,0.3)'
      const cmdColor = np.cmd_plus != null ? plusColorHex(np.cmd_plus) : 'rgba(255,255,255,0.3)'
      return `<tr>
        <td style="${tdNameStyle}">${pLink} <span style="font-size:9px;color:rgba(255,255,255,0.25)">${escapeHtml(np.team)}</span></td>
        <td style="${tdStyle}color:#fb923c;font-weight:600;">${escapeHtml(np.pitch_name)}</td>
        <td style="${tdStyle}text-align:right;">${np.count}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_hbreak != null ? np.avg_hbreak + '"' : '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_ivb != null ? np.avg_ivb + '"' : '—'}</td>
        <td style="${tdStyle}text-align:right;color:${stuffColor};font-weight:600;">${np.avg_stuff_plus ?? '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_brink != null ? np.avg_brink.toFixed(1) : '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_cluster != null ? np.avg_cluster.toFixed(1) : '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_missfire != null ? np.avg_missfire.toFixed(1) : '—'}</td>
        <td style="${tdStyle}text-align:right;color:${cmdColor};font-weight:600;">${np.cmd_plus ?? '—'}</td>
      </tr>`
    }).join('')

    html += `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(251,146,60,0.15);border-radius:10px;overflow:hidden;">
      <div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:10px;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.08em;">
        New Pitch Alerts
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${thStyle}text-align:left;">Pitcher</th>
          <th style="${thStyle}text-align:left;">Pitch</th>
          <th style="${thStyle}text-align:right;">N</th>
          <th style="${thStyle}text-align:right;">HBreak</th>
          <th style="${thStyle}text-align:right;">IVB</th>
          <th style="${thStyle}text-align:right;">Stuff+</th>
          <th style="${thStyle}text-align:right;">Brink</th>
          <th style="${thStyle}text-align:right;">Cluster</th>
          <th style="${thStyle}text-align:right;">Missfire</th>
          <th style="${thStyle}text-align:right;">Cmd+</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }

  return html
}

function assembleBriefHtml(parts: {
  dayRundown: string
  aroundBaseball: string
  boxScoresHtml: string
  topPerformances: string
  worstPerformances: string
  injuries: string
  transactions: string
  newsHtml: string
  isOffDay: boolean
  playerNameToId: Record<string, number>
  dailyHighlights: DailyHighlightsData | null
}) {
  const sections: string[] = []
  const halfGrid = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;'
  const noData = '<p style="color:rgba(255,255,255,0.4);font-size:13px">Nothing to report today.</p>'

  // Yesterday's Standouts — daily highlights (always first)
  const highlightsHtml = buildDailyHighlightsHtml(parts.dailyHighlights)
  if (highlightsHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Yesterday's Standouts</div>
  ${highlightsHtml}
</div>`)
  }

  // The Day in Baseball — narrative + Around Baseball ("In Other News...") inside
  if (parts.dayRundown || parts.aroundBaseball) {
    const aroundBlock = parts.aroundBaseball
      ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:10px;font-style:italic;">In Other News...</div>
          ${parts.aroundBaseball}
        </div>`
      : ''
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">The Day in Baseball</div>
  <div style="${S.perfWrap}">${parts.dayRundown ? linkifyPlayerNames(parts.dayRundown, parts.playerNameToId) : ''}${aroundBlock}</div>
</div>`)
  }

  if (!parts.isOffDay && parts.boxScoresHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Box Scores</div>
  <div style="${S.cardGrid}">${parts.boxScoresHtml}</div>
</div>`)
  }

  // Top Performances + Rough Outings side by side
  if (parts.topPerformances || parts.worstPerformances) {
    sections.push(`
<div style="${S.section}">
  <div style="${halfGrid}">
    <div>
      <div style="${S.sectionTitle}">Top Performances</div>
      <div style="${S.perfWrap}">${parts.topPerformances ? linkifyPlayerNames(parts.topPerformances, parts.playerNameToId) : noData}</div>
    </div>
    <div>
      <div style="${S.sectionTitle}">Rough Outings</div>
      <div style="${S.perfWrap}">${parts.worstPerformances ? linkifyPlayerNames(parts.worstPerformances, parts.playerNameToId) : noData}</div>
    </div>
  </div>
</div>`)
  }

  // Injuries + Transactions side by side
  sections.push(`
<div style="${S.section}">
  <div style="${halfGrid}">
    <div>
      <div style="${S.sectionTitle}">Injuries</div>
      <div style="${S.perfWrap}">${parts.injuries ? linkifyPlayerNames(parts.injuries, parts.playerNameToId) : noData}</div>
    </div>
    <div>
      <div style="${S.sectionTitle}">Transactions</div>
      <div style="${S.perfWrap}">${parts.transactions ? linkifyPlayerNames(parts.transactions, parts.playerNameToId) : noData}</div>
    </div>
  </div>
</div>`)

  if (parts.newsHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Headlines</div>
  <div>${parts.newsHtml}</div>
</div>`)
  }

  return `<div style="${S.wrap}">${sections.join('')}</div>`
}

/** Replace player names in HTML with clickable links to their Triton research page. */
function linkifyPlayerNames(html: string, nameToId: Record<string, number>): string {
  // Sort by name length descending to match longer names first (e.g., "J.D. Martinez" before "Martinez")
  const names = Object.keys(nameToId).sort((a, b) => b.length - a.length)
  const linkStyle = 'color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:2px;'
  let result = html
  for (const name of names) {
    if (!name || name.length < 4) continue // skip very short names to avoid false matches
    const id = nameToId[name]
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Replace name inside <strong> tags: <strong>Name</strong> → <strong><a>Name</a></strong>
    result = result.replace(
      new RegExp(`(<strong[^>]*>)(${escapedName})(</strong>)`, 'g'),
      `$1<a href="https://www.tritonapex.io/player/${id}" target="_blank" rel="noopener" style="${linkStyle}">$2</a>$3`
    )
    // Replace name inside <span> with font-weight:600 (performance tables): <span style="...">Name</span>
    result = result.replace(
      new RegExp(`(<span[^>]*font-weight:600[^>]*>)(${escapedName})(</span>)`, 'g'),
      `$1<a href="https://www.tritonapex.io/player/${id}" target="_blank" rel="noopener" style="${linkStyle}">$2</a>$3`
    )
  }
  return result
}

function playerLink(name: string, id: number | undefined): string {
  if (!id) return escapeHtml(name)
  const style = 'color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:2px;'
  return `<a href="https://www.tritonapex.io/player/${id}" target="_blank" rel="noopener" style="${style}">${escapeHtml(name)}</a>`
}

function buildBoxScoresHtml(boxScores: any[], nameToId: Record<string, number>): string {
  return boxScores.map(bs => {
    const { away, home, innings, totals, decisions } = bs
    const numInnings = Math.max(innings.length, 9)
    const awayWon = totals.away.runs > totals.home.runs

    // Linescore header
    const innHeaders = Array.from({ length: numInnings }, (_, i) =>
      `<th style="${S.lsHeader}">${i + 1}</th>`
    ).join('')

    // Inning cells
    const makeInningCells = (side: 'away' | 'home') =>
      Array.from({ length: numInnings }, (_, i) => {
        const val = innings[i]?.[side]?.runs
        const scored = val != null && val > 0
        return `<td style="${S.lsCell}${scored ? S.lsCellScored : S.lsCellEmpty}">${val ?? '-'}</td>`
      }).join('')

    // Decisions
    const decParts: string[] = []
    if (decisions.winner) decParts.push(`<span><span style="${S.decW}">W</span> ${playerLink(decisions.winner, nameToId[decisions.winner])}</span>`)
    if (decisions.loser) decParts.push(`<span><span style="${S.decL}">L</span> ${playerLink(decisions.loser, nameToId[decisions.loser])}</span>`)
    if (decisions.save) decParts.push(`<span><span style="${S.decS}">S</span> ${playerLink(decisions.save, nameToId[decisions.save])}</span>`)

    // Expanded batting/pitching tables
    const makeBatterRows = (batters: any[]) => batters.map((b: any) =>
      `<tr>
        <td style="${S.dtCellName}">${playerLink(b.name, b.id || nameToId[b.name])}</td>
        <td style="${S.dtCell}">${b.ab}</td>
        <td style="${S.dtCell}">${b.r}</td>
        <td style="${S.dtCell}${b.h > 0 ? S.dtCellHi : ''}">${b.h}</td>
        <td style="${S.dtCell}${b.rbi > 0 ? S.dtCellRbi : ''}">${b.rbi}</td>
        <td style="${S.dtCell}${b.hr > 0 ? S.dtCellHr : ''}">${b.hr}</td>
        <td style="${S.dtCell}">${b.bb}</td>
        <td style="${S.dtCell}${b.so > 0 ? S.dtCellK : ''}">${b.so}</td>
      </tr>`
    ).join('')

    const makePitcherRows = (pitchers: any[]) => pitchers.map((p: any) =>
      `<tr>
        <td style="${S.dtCellName}">${playerLink(p.name, p.id || nameToId[p.name])}</td>
        <td style="${S.dtCell}">${p.ip}</td>
        <td style="${S.dtCell}">${p.h}</td>
        <td style="${S.dtCell}">${p.r}</td>
        <td style="${S.dtCell}">${p.er}</td>
        <td style="${S.dtCell}">${p.bb}</td>
        <td style="${S.dtCell}${p.so > 0 ? S.dtCellSo : ''}">${p.so}</td>
        <td style="${S.dtCell};color:rgba(255,255,255,0.25)">${p.pitches}</td>
      </tr>`
    ).join('')

    const batHeader = `<tr>
      <th style="${S.dtHeadLeft}">Batter</th>
      <th style="${S.dtHead}">AB</th><th style="${S.dtHead}">R</th><th style="${S.dtHead}">H</th>
      <th style="${S.dtHead}">RBI</th><th style="${S.dtHead}">HR</th><th style="${S.dtHead}">BB</th><th style="${S.dtHead}">SO</th>
    </tr>`

    const pitHeader = `<tr>
      <th style="${S.dtHeadLeft}">Pitcher</th>
      <th style="${S.dtHead}">IP</th><th style="${S.dtHead}">H</th><th style="${S.dtHead}">R</th>
      <th style="${S.dtHead}">ER</th><th style="${S.dtHead}">BB</th><th style="${S.dtHead}">SO</th><th style="${S.dtHead}">NP</th>
    </tr>`

    return `
<div style="${S.card}">
  <!-- Score header -->
  <div style="${S.cardHeader}">
    <div style="${S.teamRow}">
      <span style="${S.teamAbbrev}${awayWon ? S.scoreWin : S.scoreLose}">${away.team.abbrev}</span>
      <span style="${S.teamScore}${awayWon ? S.scoreWin : S.scoreLose}">${totals.away.runs}</span>
    </div>
    <span style="${S.atSymbol}">@</span>
    <div style="${S.teamRow}">
      <span style="${S.teamScore}${!awayWon ? S.scoreWin : S.scoreLose}">${totals.home.runs}</span>
      <span style="${S.teamAbbrev}${!awayWon ? S.scoreWin : S.scoreLose}">${home.team.abbrev}</span>
    </div>
  </div>
  <!-- Linescore -->
  <div style="${S.linescoreWrap}">
    <table style="${S.linescoreTable}">
      <thead><tr><th style="${S.lsHeaderTeam}"></th>${innHeaders}<th style="${S.lsHeader};border-left:1px solid rgba(255,255,255,0.08)">R</th><th style="${S.lsHeader}">H</th><th style="${S.lsHeader}">E</th></tr></thead>
      <tbody>
        <tr style="${awayWon ? 'color:#fff' : 'color:rgba(255,255,255,0.4)'}">
          <td style="text-align:left;font-weight:700;padding:3px 0;font-size:11px">${away.team.abbrev}</td>
          ${makeInningCells('away')}
          <td style="${S.lsTotalR}">${totals.away.runs}</td>
          <td style="${S.lsTotalHE}">${totals.away.hits}</td>
          <td style="${S.lsTotalHE}">${totals.away.errors}</td>
        </tr>
        <tr style="${!awayWon ? 'color:#fff' : 'color:rgba(255,255,255,0.4)'}">
          <td style="text-align:left;font-weight:700;padding:3px 0;font-size:11px">${home.team.abbrev}</td>
          ${makeInningCells('home')}
          <td style="${S.lsTotalR}">${totals.home.runs}</td>
          <td style="${S.lsTotalHE}">${totals.home.hits}</td>
          <td style="${S.lsTotalHE}">${totals.home.errors}</td>
        </tr>
      </tbody>
    </table>
  </div>
  ${decParts.length > 0 ? `<div style="${S.decRow}">${decParts.join('')}</div>` : ''}
  <!-- Expandable details -->
  <details>
    <summary style="${S.expandToggle}">Full Box Score</summary>
    <div style="${S.detailsInner}">
      <div style="${S.detailLabel}">${away.team.abbrev} Batting</div>
      <table style="${S.detailTable}">${batHeader}${makeBatterRows(away.batters || [])}</table>
      <div style="${S.detailLabel}">${away.team.abbrev} Pitching</div>
      <table style="${S.detailTable}">${pitHeader}${makePitcherRows(away.pitchers || [])}</table>
      <div style="${S.detailLabel};margin-top:16px">${home.team.abbrev} Batting</div>
      <table style="${S.detailTable}">${batHeader}${makeBatterRows(home.batters || [])}</table>
      <div style="${S.detailLabel}">${home.team.abbrev} Pitching</div>
      <table style="${S.detailTable}">${pitHeader}${makePitcherRows(home.pitchers || [])}</table>
    </div>
  </details>
</div>`
  }).join('')
}

function buildNewsHtml(articles: any[]): string {
  if (articles.length === 0) return ''
  return articles.map((a, i) => `
<a href="${a.link}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;display:block;">
  <div style="${S.newsItem}${i === articles.length - 1 ? 'border-bottom:none;' : ''}">
    <div style="flex:1;min-width:0;">
      <div style="${S.newsTitle}">${escapeHtml(a.title)}</div>
      ${a.description ? `<div style="${S.newsDesc}">${escapeHtml(a.description)}</div>` : ''}
    </div>
    <span style="${S.newsBadge}">${escapeHtml(a.source)}</span>
  </div>
</a>`).join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ─── Data Fetchers ─── */

async function fetchGamesWithLinescores(date: string) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore,decisions`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  const dateEntry = data?.dates?.[0]
  if (!dateEntry) return []

  return (dateEntry.games || []).map((g: any) => {
    const status = g.status || {}
    const away = g.teams?.away || {}
    const home = g.teams?.home || {}
    return {
      gamePk: g.gamePk,
      state: status.abstractGameState,
      detailedState: status.detailedState,
      away: { name: away.team?.name || '', abbrev: away.team?.abbreviation || '', score: away.score ?? null },
      home: { name: home.team?.name || '', abbrev: home.team?.abbreviation || '', score: home.score ?? null },
    }
  })
}

async function fetchFullBoxScore(gamePk: number) {
  const [boxRes, lineRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`),
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`),
  ])
  if (!boxRes.ok || !lineRes.ok) return null

  const box = await boxRes.json()
  const line = await lineRes.json()

  function parseTeam(side: any) {
    const players = side.players || {}
    const battingOrder = (side.battingOrder || []) as number[]
    const pitcherIds = (side.pitchers || []) as number[]

    const batters = battingOrder.map((id: number) => {
      const p = players[`ID${id}`]
      if (!p) return null
      const s = p.stats?.batting || {}
      return {
        id, name: p.person?.fullName || '',
        ab: s.atBats ?? 0, r: s.runs ?? 0, h: s.hits ?? 0,
        rbi: s.rbi ?? 0, hr: s.homeRuns ?? 0, bb: s.baseOnBalls ?? 0, so: s.strikeOuts ?? 0,
      }
    }).filter(Boolean)

    const pitchers = pitcherIds.map((id: number) => {
      const p = players[`ID${id}`]
      if (!p) return null
      const s = p.stats?.pitching || {}
      return {
        id, name: p.person?.fullName || '',
        ip: s.inningsPitched || '0.0', h: s.hits ?? 0, r: s.runs ?? 0,
        er: s.earnedRuns ?? 0, so: s.strikeOuts ?? 0, bb: s.baseOnBalls ?? 0,
        pitches: s.numberOfPitches ?? 0,
      }
    }).filter(Boolean)

    return {
      team: { name: side.team?.name || '', abbrev: side.team?.abbreviation || '' },
      batters,
      pitchers,
    }
  }

  // Parse innings
  const innings = (line.innings || []).map((inn: any) => ({
    num: inn.num,
    away: { runs: inn.away?.runs ?? null },
    home: { runs: inn.home?.runs ?? null },
  }))

  // Totals with errors
  const totals = {
    away: { runs: line.teams?.away?.runs ?? 0, hits: line.teams?.away?.hits ?? 0, errors: line.teams?.away?.errors ?? 0 },
    home: { runs: line.teams?.home?.runs ?? 0, hits: line.teams?.home?.hits ?? 0, errors: line.teams?.home?.errors ?? 0 },
  }

  // Decisions (W/L/S)
  const dec = box.info?.find((i: any) => i.label === 'Decisions') || {}
  const decisions: { winner?: string; loser?: string; save?: string } = {}

  // Try to get decisions from the game endpoint
  const awayPlayers = box.teams?.away?.players || {}
  const homePlayers = box.teams?.home?.players || {}
  const allPlayers = { ...awayPlayers, ...homePlayers }

  // Check each pitcher for W/L/S note
  for (const key of Object.keys(allPlayers)) {
    const p = allPlayers[key]
    const note = p.stats?.pitching?.note
    if (!note) continue
    const name = p.person?.fullName || ''
    if (note.includes('W,') || note === 'W') decisions.winner = name
    if (note.includes('L,') || note === 'L') decisions.loser = name
    if (note.includes('S,') || note === 'S' || note.includes('SV')) decisions.save = name
  }

  return {
    gamePk,
    away: parseTeam(box.teams?.away || {}),
    home: parseTeam(box.teams?.home || {}),
    innings,
    totals,
    decisions,
  }
}

async function fetchFeedUrls(): Promise<{ name: string; url: string }[]> {
  const { data } = await maydaySupabase
    .from('research_feeds')
    .select('name, url')
    .eq('enabled', true)
  const feeds = (data || []).map((f: any) => ({ name: f.name, url: f.url }))
  // Always include NYT Baseball (not in research_feeds)
  feeds.push({ name: 'NYT Baseball', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Baseball.xml' })
  return feeds
}

const BASEBALL_KEYWORDS = /\b(mlb|baseball|pitcher|batting|homer|home run|strikeout|innings?|bullpen|roster|free agent|trade|minor league|spring training|world series|playoffs|postseason|mound|dugout|umpire|outfield|infield|shortstop|catcher|lineup|standings|wild card|no-hitter|perfect game|grand slam|double play|triple play|farm system|draft|arbitration|injured list|disabled list|designated hitter|pinch hit|relief pitcher|closer|starter|rotation|pitch clock|milb|college baseball|ncaa baseball|little league|wbc|world baseball)\b/i

async function fetchNews() {
  const feeds = await fetchFeedUrls()
  const results = await Promise.allSettled(
    feeds.map(async (source) => {
      const feed = await rssParser.parseURL(source.url)
      return (feed.items || []).slice(0, 8).map(item => ({
        title: item.title || '',
        link: item.link || '',
        source: source.name,
        description: (item.contentSnippet || '').slice(0, 150).replace(/<[^>]*>/g, ''),
        isGeneralFeed: source.name === 'NYT Baseball',
      }))
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(item => item.title && item.link)
    // Only filter general feeds (NYT Baseball) for baseball keywords;
    // baseball-specific feeds (ESPN MLB, FanGraphs, etc.) pass through
    .filter(item => !item.isGeneralFeed || BASEBALL_KEYWORDS.test(item.title) || BASEBALL_KEYWORDS.test(item.description))
}

const qAdmin = (sql: string) => supabaseAdmin.rpc('run_query', { query_text: sql.trim() })

async function fetchDailyHighlights(briefDate: string): Promise<DailyHighlightsData | null> {
  try {
    // Determine if regular season has started — if so, exclude Spring Training
    const briefYear = new Date(briefDate).getFullYear()
    const regCheck = await qAdmin(`SELECT 1 FROM pitches WHERE game_year = ${briefYear} AND game_type = 'R' LIMIT 1`)
    const hasRS = (regCheck.data || []).length > 0
    const gtFilter = hasRS ? "AND game_type = 'R'" : ''

    // Find the most recent game date on or before briefDate
    const dateRes = await qAdmin(`
      SELECT MAX(game_date::text) AS gd FROM pitches
      WHERE game_date <= '${briefDate}' AND game_year = ${briefYear} ${gtFilter}
    `)
    const prevDay = dateRes.data?.[0]?.gd
    if (!prevDay) return null

    // Best Stuff+ pitch (starter vs reliever)
    const stuffRes = await qAdmin(`
      WITH starters AS (
        SELECT DISTINCT pitcher, game_pk FROM pitches
        WHERE game_date = '${prevDay}' AND inning = 1
      ),
      ranked AS (
        SELECT p.pitcher AS player_id, pl.name AS player_name, pl.team,
               p.pitch_name, p.stuff_plus,
               ROUND(p.pfx_x * 12, 1) AS hbreak_in,
               ROUND(p.pfx_z * 12, 1) AS ivb_in,
               ROUND(p.release_speed::numeric, 1) AS velo,
               CASE WHEN s.pitcher IS NOT NULL THEN 'starter' ELSE 'reliever' END AS role,
               ROW_NUMBER() OVER (
                 PARTITION BY CASE WHEN s.pitcher IS NOT NULL THEN 'starter' ELSE 'reliever' END
                 ORDER BY p.stuff_plus DESC NULLS LAST
               ) AS rn
        FROM pitches p
        JOIN players pl ON pl.id = p.pitcher
        LEFT JOIN starters s ON s.pitcher = p.pitcher AND s.game_pk = p.game_pk
        WHERE p.game_date = '${prevDay}' AND p.stuff_plus IS NOT NULL AND p.pitch_name IS NOT NULL
      )
      SELECT * FROM ranked WHERE rn = 1
    `)

    // Fetch all pitches for Cmd+ computation
    const [outingPitchesRes, outingPlayerRes] = await Promise.all([
      qAdmin(`
        SELECT p.pitcher AS player_id, p.game_pk,
               p.plate_x, p.plate_z, p.pitch_name, p.sz_top, p.sz_bot,
               p.zone, p.game_year, p.description, p.stand, p.inning
        FROM pitches p
        WHERE p.game_date = '${prevDay}' AND p.pitch_name IS NOT NULL
          AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL
      `),
      qAdmin(`
        SELECT DISTINCT p.pitcher AS player_id, pl.name AS player_name, pl.team
        FROM pitches p JOIN players pl ON pl.id = p.pitcher
        WHERE p.game_date = '${prevDay}'
      `),
    ])

    const playerMap: Record<number, { name: string; team: string }> = {}
    for (const r of (outingPlayerRes.data || [])) {
      playerMap[r.player_id] = { name: r.player_name, team: r.team }
    }

    // Group pitches by pitcher+game_pk
    const outingGroups: Record<string, { playerId: number; gamePk: number; pitches: PitchRow[]; isStarter: boolean }> = {}
    for (const r of (outingPitchesRes.data || [])) {
      const key = `${r.player_id}-${r.game_pk}`
      if (!outingGroups[key]) {
        outingGroups[key] = { playerId: r.player_id, gamePk: r.game_pk, pitches: [], isStarter: false }
      }
      outingGroups[key].pitches.push({
        plate_x: Number(r.plate_x), plate_z: Number(r.plate_z),
        pitch_name: r.pitch_name, sz_top: Number(r.sz_top), sz_bot: Number(r.sz_bot),
        zone: Number(r.zone), game_year: Number(r.game_year),
        description: r.description || '', stand: r.stand || '',
      })
      if (Number(r.inning) === 1) outingGroups[key].isStarter = true
    }

    // Best Cmd+ outing
    let bestCmdStarter: DailyHighlightsData['cmd_starter'] = null
    let bestCmdReliever: DailyHighlightsData['cmd_reliever'] = null
    for (const outing of Object.values(outingGroups)) {
      if (outing.pitches.length < 15) continue
      const cmd = computeOutingCommand(outing.pitches)
      const cmdPlus = cmd.overall_cmd_plus
      if (cmdPlus == null) continue
      const info = playerMap[outing.playerId]
      const entry = {
        player_id: outing.playerId,
        player_name: info?.name || 'Unknown',
        team: info?.team || '??',
        cmd_plus: +cmdPlus.toFixed(1),
        pitches: outing.pitches.length,
      }
      if (outing.isStarter) {
        if (!bestCmdStarter || cmdPlus > bestCmdStarter.cmd_plus) bestCmdStarter = entry
      } else {
        if (!bestCmdReliever || cmdPlus > bestCmdReliever.cmd_plus) bestCmdReliever = entry
      }
    }

    // New pitch alerts
    const newPitchRes = await qAdmin(`
      WITH today_types AS (
        SELECT pitcher, pitch_name, COUNT(*) AS count,
               ROUND(AVG(pfx_x * 12)::numeric, 1) AS avg_hbreak,
               ROUND(AVG(pfx_z * 12)::numeric, 1) AS avg_ivb,
               ROUND(AVG(stuff_plus)::numeric, 1) AS avg_stuff_plus
        FROM pitches WHERE game_date = '${prevDay}' AND pitch_name IS NOT NULL
        GROUP BY pitcher, pitch_name
      ),
      prior_types AS (
        SELECT DISTINCT pitcher, pitch_name FROM pitches
        WHERE game_date < '${prevDay}' AND pitch_name IS NOT NULL
          AND pitcher IN (SELECT DISTINCT pitcher FROM pitches WHERE game_date = '${prevDay}')
      )
      SELECT t.pitcher AS player_id, pl.name AS player_name, pl.team,
             t.pitch_name, t.count, t.avg_hbreak, t.avg_ivb, t.avg_stuff_plus
      FROM today_types t
      JOIN players pl ON pl.id = t.pitcher
      LEFT JOIN prior_types pr ON pr.pitcher = t.pitcher AND pr.pitch_name = t.pitch_name
      WHERE pr.pitcher IS NULL AND t.count >= 3
      ORDER BY t.count DESC
    `)

    const newPitches: DailyHighlightsData['new_pitches'] = []
    for (const r of (newPitchRes.data || [])) {
      let cmdData: { avg_brink?: number | null; avg_cluster?: number | null; avg_missfire?: number | null; cmd_plus?: number | null } = {}
      const outingKey = Object.keys(outingGroups).find(k => k.startsWith(`${r.player_id}-`))
      if (outingKey) {
        const cmd = computeOutingCommand(outingGroups[outingKey].pitches)
        const ptCmd = cmd.byPitch[r.pitch_name]
        if (ptCmd) cmdData = { avg_brink: ptCmd.avg_brink, avg_cluster: ptCmd.avg_cluster, avg_missfire: ptCmd.avg_missfire, cmd_plus: ptCmd.cmd_plus }
      }
      newPitches.push({
        player_id: r.player_id, player_name: r.player_name, team: r.team,
        pitch_name: r.pitch_name, count: Number(r.count),
        avg_hbreak: r.avg_hbreak != null ? Number(r.avg_hbreak) : null,
        avg_ivb: r.avg_ivb != null ? Number(r.avg_ivb) : null,
        avg_stuff_plus: r.avg_stuff_plus != null ? Number(r.avg_stuff_plus) : null,
        ...cmdData as any,
      })
    }

    const stuffStarter = (stuffRes.data || []).find((r: any) => r.role === 'starter')
    const stuffReliever = (stuffRes.data || []).find((r: any) => r.role === 'reliever')

    const mapStuff = (r: any) => r ? {
      player_id: r.player_id, player_name: r.player_name, team: r.team,
      pitch_name: r.pitch_name, stuff_plus: Number(r.stuff_plus),
      velo: r.velo != null ? Number(r.velo) : null,
      hbreak_in: r.hbreak_in != null ? Number(r.hbreak_in) : null,
      ivb_in: r.ivb_in != null ? Number(r.ivb_in) : null,
    } : null

    return {
      date: prevDay,
      stuff_starter: mapStuff(stuffStarter),
      stuff_reliever: mapStuff(stuffReliever),
      cmd_starter: bestCmdStarter,
      cmd_reliever: bestCmdReliever,
      new_pitches: newPitches,
    }
  } catch (err) {
    console.error('fetchDailyHighlights error:', err)
    return null
  }
}

async function fetchTransactions(date: string) {
  const d = new Date(date)
  const formatted = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
  const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${formatted}&endDate=${formatted}&sportId=1`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return { ilPlacements: [], ilActivations: [] }
    const data = await resp.json()
    const txns = data?.transactions || []

    const ilPlacements: { player: string; team: string; description: string }[] = []
    const ilActivations: { player: string; team: string; description: string }[] = []

    for (const tx of txns) {
      if (tx.typeCode !== 'SC') continue
      const desc: string = tx.description || ''
      const descLower = desc.toLowerCase()
      const player = tx.person?.fullName || ''
      const team = tx.toTeam?.name || tx.fromTeam?.name || ''

      if (descLower.includes('placed on') && descLower.includes('injured list')) {
        ilPlacements.push({ player, team, description: desc })
      } else if (descLower.includes('activated') && descLower.includes('injured list')) {
        ilActivations.push({ player, team, description: desc })
      }
    }

    return { ilPlacements, ilActivations }
  } catch {
    return { ilPlacements: [], ilActivations: [] }
  }
}
