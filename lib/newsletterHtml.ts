/**
 * Mayday Daily Newsletter — Email HTML Builder
 *
 * Table-based layout for email client compatibility.
 * Dark theme matching the Triton platform.
 */

import Parser from 'rss-parser'

const SITE_URL = 'https://www.tritonapex.io'
const SUBSTACK_FEED_URL = 'https://www.mayday.show/feed'

// Colors
const BG = '#09090b'
const CARD_BG = '#18181b'
const BORDER = '#27272a'
const TEXT = '#d4d4d8'
const TEXT_MUTED = '#71717a'
const TEXT_BRIGHT = '#f0f0f0'
const EMERALD = '#34d399'
const RED = '#f87171'
const AMBER = '#fbbf24'
const BLUE = '#38bdf8'
const ORANGE = '#fb923c'

export function plusColorHex(val: number): string {
  if (val >= 130) return EMERALD
  if (val >= 115) return '#6ee7b7'
  if (val >= 100) return TEXT
  if (val >= 85) return ORANGE
  return RED
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface StandoutData {
  player_id: number
  player_name: string
  team: string
  plus_value: number
  plus_label: string
  accent_color: string
  role_label: string
  subtitle?: string
  game_line?: { ip: string; h: number; er: number; bb: number; k: number; decision: string } | null
}

interface TrendAlert {
  player_id: number
  player_name: string
  metric_label: string
  sigma: number
  direction: 'up' | 'down'
  sentiment: 'good' | 'bad'
  season_val: number
  recent_val: number
  delta: number
}

export interface GameScore {
  away: string
  home: string
  awayScore: number
  homeScore: number
  awayHits?: number
  homeHits?: number
  awayErrors?: number
  homeErrors?: number
  winner?: string | null
  loser?: string | null
  save?: string | null
}

export interface NewsletterData {
  date: string // YYYY-MM-DD
  title: string
  scores: GameScore[]
  topPerformances: string
  worstPerformances: string
  injuries: string
  transactions: string
  standouts: StandoutData[]
  surges: TrendAlert[]
  concerns: TrendAlert[]
  latestPost?: { title: string; link: string; description: string; author?: string; imageUrl?: string } | null
  unsubscribeUrl: string
}

function headshot(playerId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_80,q_auto:best/v1/people/${playerId}/headshot/67/current`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function decisionBadge(d: string): string {
  const colors: Record<string, string> = { W: EMERALD, L: RED, SV: BLUE, HLD: AMBER }
  const c = colors[d]
  return c ? `<span style="font-size:10px;font-weight:700;color:${c};margin-right:3px;">${escapeHtml(d)}</span>` : ''
}

function buildSectionTitle(text: string): string {
  return `<tr><td style="padding:0 0 12px 0;">
    <p class="section-title" style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">
      ${escapeHtml(text)}
    </p>
  </td></tr>`
}

function buildStandoutCard(s: StandoutData): string {
  const fmtLine = s.game_line
    ? `<p class="standout-line" style="margin:4px 0 0;font-size:10px;color:${TEXT_MUTED};font-family:monospace;">
        ${decisionBadge(s.game_line.decision)}${s.game_line.ip} IP, ${s.game_line.h} H, ${s.game_line.er} ER, ${s.game_line.bb} BB, ${s.game_line.k} K
      </p>`
    : ''

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;margin-bottom:8px;">
    <tr>
      <td class="card-pad" style="padding:12px 14px;">
        <p class="standout-label" style="margin:0 0 8px;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">
          <span style="color:${s.accent_color};">${escapeHtml(s.plus_label)}</span> ${escapeHtml(s.role_label)}
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="40" valign="middle" style="padding-right:10px;">
              <img src="${headshot(s.player_id)}" alt="" width="40" height="40" style="border-radius:50%;display:block;" />
            </td>
            <td valign="middle">
              <p class="standout-name" style="margin:0;font-size:13px;font-weight:600;color:${TEXT_BRIGHT};">${escapeHtml(s.player_name)}</p>
              <p class="standout-team" style="margin:2px 0 0;font-size:10px;color:${TEXT_MUTED};">${escapeHtml(s.team)}${s.subtitle ? ' &middot; ' + escapeHtml(s.subtitle) : ''}</p>
            </td>
            <td width="60" align="right" valign="middle">
              <p class="standout-plus" style="margin:0;font-size:22px;font-weight:800;font-family:monospace;color:${plusColorHex(s.plus_value)};">${s.plus_value}</p>
            </td>
          </tr>
        </table>
        ${fmtLine}
      </td>
    </tr>
  </table>`
}

function buildSurgesList(alerts: TrendAlert[], type: 'surge' | 'concern'): string {
  if (alerts.length === 0) return `<p style="color:${TEXT_MUTED};font-size:12px;margin:0;">No ${type === 'surge' ? 'surges' : 'concerns'} detected.</p>`

  const badgeColor = type === 'surge' ? EMERALD : RED
  const rows = alerts.slice(0, 5).map((a, i) => {
    const sigmaText = Math.abs(a.sigma).toFixed(1) + '\u03c3'
    const arrow = a.direction === 'up' ? '\u2191' : '\u2193'
    return `<tr>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;" width="20">
        <span style="font-size:11px;color:${TEXT_MUTED};font-weight:600;">${i + 1}.</span>
      </td>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span class="trend-name" style="font-weight:600;color:${TEXT_BRIGHT};font-size:13px;">${escapeHtml(a.player_name)}</span>
        <span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:${badgeColor};background:rgba(${type === 'surge' ? '52,211,153' : '248,113,113'},0.12);padding:1px 6px;border-radius:3px;">
          ${arrow} ${sigmaText}
        </span>
        <p class="trend-detail" style="margin:2px 0 0;font-size:11px;color:${TEXT_MUTED};">
          ${escapeHtml(a.metric_label)}: ${a.season_val.toFixed(1)} &rarr; ${a.recent_val.toFixed(1)} (${a.delta > 0 ? '+' : ''}${a.delta.toFixed(1)})
        </p>
      </td>
    </tr>`
  }).join('')

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tbody>${rows}</tbody></table>`
}

function buildScoreCard(game: GameScore): string {
  const awayWon = game.awayScore > game.homeScore
  const winColor = TEXT_BRIGHT
  const loseColor = TEXT_MUTED
  const hasExtras = game.awayHits !== undefined || game.homeHits !== undefined

  const decParts: string[] = []
  if (game.winner) decParts.push(`<span style="color:${EMERALD};font-weight:600;">W</span> ${escapeHtml(game.winner)}`)
  if (game.loser) decParts.push(`<span style="color:${RED};font-weight:600;">L</span> ${escapeHtml(game.loser)}`)
  if (game.save) decParts.push(`<span style="color:${BLUE};font-weight:600;">SV</span> ${escapeHtml(game.save)}`)

  return `<td width="25%" valign="top" style="padding:3px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;">
      <tr>
        <td class="card-pad" style="padding:8px 10px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td></td>
              <td align="right" width="18" class="score-rhe-header" style="font-size:9px;font-weight:600;color:${TEXT_MUTED};padding-bottom:2px;">R</td>
              ${hasExtras ? `<td align="right" width="18" class="score-rhe-header" style="font-size:9px;font-weight:600;color:${TEXT_MUTED};padding-bottom:2px;">H</td><td align="right" width="18" class="score-rhe-header" style="font-size:9px;font-weight:600;color:${TEXT_MUTED};padding-bottom:2px;">E</td>` : ''}
            </tr>
            <tr>
              <td class="score-team" style="font-size:11px;font-weight:700;color:${awayWon ? winColor : loseColor};">${escapeHtml(game.away)}</td>
              <td align="right" class="score-runs" style="font-size:13px;font-weight:800;color:${awayWon ? winColor : loseColor};">${game.awayScore}</td>
              ${hasExtras ? `<td align="right" class="score-rhe" style="font-size:11px;color:${TEXT_MUTED};">${game.awayHits ?? '—'}</td><td align="right" class="score-rhe" style="font-size:11px;color:${TEXT_MUTED};">${game.awayErrors ?? '—'}</td>` : ''}
            </tr>
            <tr>
              <td class="score-team" style="font-size:11px;font-weight:700;color:${!awayWon ? winColor : loseColor};">${escapeHtml(game.home)}</td>
              <td align="right" class="score-runs" style="font-size:13px;font-weight:800;color:${!awayWon ? winColor : loseColor};">${game.homeScore}</td>
              ${hasExtras ? `<td align="right" class="score-rhe" style="font-size:11px;color:${TEXT_MUTED};">${game.homeHits ?? '—'}</td><td align="right" class="score-rhe" style="font-size:11px;color:${TEXT_MUTED};">${game.homeErrors ?? '—'}</td>` : ''}
            </tr>
          </table>
          ${decParts.length > 0 ? `<p class="score-dec" style="margin:4px 0 0;font-size:9px;color:${TEXT_MUTED};line-height:1.4;">${decParts.join(' &middot; ')}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>`
}

function buildScoresSection(scores: GameScore[]): string {
  if (scores.length === 0) return ''

  // Build rows of 4 cards each
  const rows: string[] = []
  for (let i = 0; i < scores.length; i += 4) {
    const cells = scores.slice(i, i + 4).map(g => buildScoreCard(g))
    // Pad with empty cells if last row has fewer than 4
    while (cells.length < 4) {
      cells.push(`<td width="25%" style="padding:3px;"></td>`)
    }
    rows.push(`<tr class="scores-row">${cells.join('')}</tr>`)
  }

  return `<tr>
    <td style="padding:0 0 24px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        ${buildSectionTitle('Scores')}
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${rows.join('')}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

export function buildNewsletterHtml(data: NewsletterData): string {
  const dateFormatted = formatDate(data.date)

  // Build standout cards HTML (2-per-row grid, collapses to 1-col on mobile)
  let standoutsHtml = ''
  if (data.standouts.length > 0) {
    const pairs: string[] = []
    for (let i = 0; i < data.standouts.length; i += 2) {
      const left = buildStandoutCard(data.standouts[i])
      const right = data.standouts[i + 1] ? buildStandoutCard(data.standouts[i + 1]) : ''
      pairs.push(`<tr>
        <td width="50%" valign="top" style="padding-right:4px;">${left}</td>
        <td width="50%" valign="top" style="padding-left:4px;">${right}</td>
      </tr>`)
    }
    standoutsHtml = `<table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col">${pairs.join('')}</table>`
  }

  // Strip inline styles from Claude HTML that reference non-email-safe properties
  // and replace with email-safe inline styles
  const sanitizeClaudeHtml = (html: string) => {
    if (!html) return ''
    // The Claude HTML already uses inline styles and table-based layout,
    // so we can use it directly — just ensure links open in new tab
    return html.replace(/<a /g, '<a target="_blank" rel="noopener" ')
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Mayday Daily — ${escapeHtml(dateFormatted)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { margin: 0; padding: 0; background-color: ${BG}; }
    img { border: 0; display: block; }
    a { color: ${EMERALD}; }
    @media only screen and (max-width: 660px) {
      .email-container { width: 100% !important; }
      .two-col td { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
      /* Scores: 4-col → 2-col on mobile */
      .scores-row td { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; }
      /* Bump font sizes for readability */
      .score-team { font-size: 13px !important; }
      .score-runs { font-size: 15px !important; }
      .score-dec { font-size: 11px !important; }
      .score-rhe-header { font-size: 10px !important; }
      .score-rhe { font-size: 12px !important; }
      /* Standout cards */
      .standout-name { font-size: 15px !important; }
      .standout-team { font-size: 12px !important; }
      .standout-plus { font-size: 24px !important; }
      .standout-label { font-size: 10px !important; }
      .standout-line { font-size: 11px !important; }
      /* Surges / trends */
      .trend-name { font-size: 14px !important; }
      .trend-detail { font-size: 12px !important; }
      /* Section titles */
      .section-title { font-size: 12px !important; }
      /* General card padding */
      .card-pad { padding: 14px 16px !important; }
      /* Latest from Mayday */
      .post-title { font-size: 18px !important; }
      .post-desc { font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <center>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BG};">
      <tr>
        <td align="center" style="padding:20px 16px;">
          <!-- Main container -->
          <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;width:100%;background-color:${BG};">

            <!-- Header -->
            <tr>
              <td style="padding:24px 0 16px;text-align:center;">
                <img src="${SITE_URL}/mayday-daily-banner.png" alt="Mayday Daily" width="640" style="width:100%;max-width:640px;height:auto;display:block;margin:0 auto;" />
                <p style="margin:12px 0 0;font-size:12px;color:${TEXT_MUTED};letter-spacing:0.06em;text-transform:uppercase;">
                  ${escapeHtml(dateFormatted)}
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr><td style="border-bottom:1px solid ${BORDER};"></td></tr>

            ${data.scores.length > 0 ? `
            <!-- Scores -->
            <tr><td style="padding-top:24px;"></td></tr>
            ${buildScoresSection(data.scores)}
            ` : ''}

            ${standoutsHtml ? `
            <!-- Yesterday's Standouts — 2-per-row grid, collapses on mobile -->
            <tr>
              <td style="padding:0 0 24px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${buildSectionTitle("Yesterday's Standouts")}
                  <tr><td>${standoutsHtml}</td></tr>
                </table>
              </td>
            </tr>
            ` : ''}

            ${data.surges.length > 0 || data.concerns.length > 0 ? `
            <!-- Surges + Concerns -->
            <tr>
              <td style="padding:0 0 24px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col">
                  <tr>
                    <td width="50%" valign="top" style="padding-right:8px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${buildSectionTitle('Surges')}
                        <tr>
                          <td class="card-pad" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">
                            ${buildSurgesList(data.surges, 'surge')}
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding-left:8px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${buildSectionTitle('Concerns')}
                        <tr>
                          <td class="card-pad" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">
                            ${buildSurgesList(data.concerns, 'concern')}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ` : ''}

            <!-- START OF THE DAY — starter card image -->
            <tr>
              <td style="padding:0 0 24px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${buildSectionTitle('Start of the Day')}
                  <tr>
                    <td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
                      <a href="${SITE_URL}/api/daily-graphics?date=${data.date}&type=ig-starter-card" target="_blank" rel="noopener" style="display:block;">
                        <img src="${SITE_URL}/api/daily-graphics?date=${data.date}&type=ig-starter-card" alt="Start of the Day — Starter Card" width="640" style="width:100%;height:auto;display:block;" />
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${data.topPerformances || data.worstPerformances ? `
            <!-- Top Performances + Rough Outings — 2-column on desktop, single column on mobile -->
            <tr>
              <td style="padding:0 0 24px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col">
                  <tr>
                    ${data.topPerformances ? `
                    <td width="50%" valign="top" style="padding-right:${data.worstPerformances ? '8' : '0'}px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${buildSectionTitle('Top Performances')}
                        <tr>
                          <td class="card-pad" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">
                            ${sanitizeClaudeHtml(data.topPerformances)}
                          </td>
                        </tr>
                      </table>
                    </td>
                    ` : ''}
                    ${data.worstPerformances ? `
                    <td width="50%" valign="top" style="padding-left:${data.topPerformances ? '8' : '0'}px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${buildSectionTitle('Rough Outings')}
                        <tr>
                          <td class="card-pad" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">
                            ${sanitizeClaudeHtml(data.worstPerformances)}
                          </td>
                        </tr>
                      </table>
                    </td>
                    ` : ''}
                  </tr>
                </table>
              </td>
            </tr>
            ` : ''}

            ${data.injuries || data.transactions ? `
            <!-- Injuries + Transactions -->
            <tr>
              <td style="padding:0 0 24px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col">
                  <tr>
                    <td width="50%" valign="top" style="padding-right:8px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${buildSectionTitle('Injuries')}
                        <tr>
                          <td class="card-pad" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">
                            ${data.injuries ? sanitizeClaudeHtml(data.injuries) : `<p style="color:${TEXT_MUTED};font-size:12px;margin:0;">No injuries reported.</p>`}
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding-left:8px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        ${buildSectionTitle('Transactions')}
                        <tr>
                          <td class="card-pad" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">
                            ${data.transactions ? sanitizeClaudeHtml(data.transactions) : `<p style="color:${TEXT_MUTED};font-size:12px;margin:0;">No transactions reported.</p>`}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ` : ''}

            ${data.latestPost ? `
            <!-- Latest from Mayday -->
            <tr>
              <td style="padding:0 0 24px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${buildSectionTitle('Latest from Mayday')}
                  <tr>
                    <td>
                      <a href="${data.latestPost.link}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
                          ${data.latestPost.imageUrl ? `
                          <tr>
                            <td style="padding:0;">
                              <img src="${data.latestPost.imageUrl}" alt="" width="640" style="width:100%;height:auto;display:block;border-radius:8px 8px 0 0;" />
                            </td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td class="card-pad" style="padding:16px 20px;">
                              <p class="post-title" style="margin:0;font-size:16px;font-weight:700;color:${TEXT_BRIGHT};line-height:1.4;">
                                ${escapeHtml(data.latestPost.title)}
                              </p>
                              <p class="post-desc" style="margin:6px 0 0;font-size:13px;color:${TEXT};line-height:1.5;">
                                ${escapeHtml(data.latestPost.description)}
                              </p>
                              ${data.latestPost.author ? `
                              <p style="margin:10px 0 0;font-size:11px;color:${TEXT_MUTED};">
                                By ${escapeHtml(data.latestPost.author)}
                              </p>
                              ` : ''}
                              <p style="margin:12px 0 0;">
                                <span style="font-size:12px;font-weight:600;color:${EMERALD};">Read on Substack &rarr;</span>
                              </p>
                            </td>
                          </tr>
                        </table>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ` : ''}

            <!-- Divider -->
            <tr><td style="border-bottom:1px solid ${BORDER};"></td></tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 0;text-align:center;">
                <p style="margin:0;font-size:11px;color:${TEXT_MUTED};">
                  Mayday Daily by <a href="${SITE_URL}" style="color:${EMERALD};text-decoration:none;">Triton Apex</a>
                </p>
                <p style="margin:8px 0 0;font-size:10px;color:${TEXT_MUTED};">
                  <a href="${data.unsubscribeUrl}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`
}

/**
 * Transform daily_highlights from brief metadata into StandoutData array
 */
export function highlightsToStandouts(highlights: any): StandoutData[] {
  if (!highlights) return []
  const standouts: StandoutData[] = []

  if (highlights.stuff_starter) {
    const s = highlights.stuff_starter
    standouts.push({
      player_id: s.player_id,
      player_name: s.player_name,
      team: s.team,
      plus_value: s.stuff_plus,
      plus_label: 'Stuff+',
      accent_color: AMBER,
      role_label: 'Starter',
      subtitle: s.pitch_name,
      game_line: s.game_line,
    })
  }

  if (highlights.stuff_reliever) {
    const s = highlights.stuff_reliever
    standouts.push({
      player_id: s.player_id,
      player_name: s.player_name,
      team: s.team,
      plus_value: s.stuff_plus,
      plus_label: 'Stuff+',
      accent_color: AMBER,
      role_label: 'Reliever',
      subtitle: s.pitch_name,
      game_line: s.game_line,
    })
  }

  if (highlights.cmd_starter) {
    const s = highlights.cmd_starter
    standouts.push({
      player_id: s.player_id,
      player_name: s.player_name,
      team: s.team,
      plus_value: s.cmd_plus,
      plus_label: 'Cmd+',
      accent_color: BLUE,
      role_label: 'Starter',
      subtitle: `${s.pitches} pitches`,
      game_line: s.game_line,
    })
  }

  if (highlights.cmd_reliever) {
    const s = highlights.cmd_reliever
    standouts.push({
      player_id: s.player_id,
      player_name: s.player_name,
      team: s.team,
      plus_value: s.cmd_plus,
      plus_label: 'Cmd+',
      accent_color: BLUE,
      role_label: 'Reliever',
      subtitle: `${s.pitches} pitches`,
      game_line: s.game_line,
    })
  }

  return standouts
}

/**
 * Fetch the most recent post from the Mayday Substack RSS feed.
 */
export async function fetchLatestSubstackPost(): Promise<NewsletterData['latestPost']> {
  try {
    const parser = new Parser({ timeout: 10000 })
    const feed = await parser.parseURL(SUBSTACK_FEED_URL)
    const item = feed.items?.[0]
    if (!item) return null

    // Extract image from enclosure or content
    let imageUrl = (item.enclosure as any)?.url || null
    if (!imageUrl && item['content:encoded']) {
      const imgMatch = (item['content:encoded'] as string).match(/<img[^>]+src="([^"]+)"/)
      if (imgMatch) imageUrl = imgMatch[1]
    }

    return {
      title: item.title || '',
      link: item.link || '',
      description: (item.contentSnippet || '').slice(0, 200),
      author: item.creator || (item as any)['dc:creator'] || undefined,
      imageUrl,
    }
  } catch {
    return null
  }
}
