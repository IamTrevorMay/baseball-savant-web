/**
 * Email block → HTML renderers.
 *
 * All output is table-based with inline styles for email client compatibility.
 * Patterns extracted from lib/newsletterHtml.ts.
 */

import type { EmailBlock, ProductBranding, TemplateSettings } from '@/lib/emailTypes'

// ─── Color constants (matching newsletterHtml.ts) ─────────────────────

const BG      = '#09090b'
const CARD_BG = '#18181b'
const BORDER  = '#27272a'
const TEXT     = '#d4d4d8'
const TEXT_MUTED = '#71717a'
const TEXT_BRIGHT = '#f0f0f0'
const EMERALD = '#34d399'
const RED     = '#f87171'
const AMBER   = '#fbbf24'
const BLUE    = '#38bdf8'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'

// ─── Helpers ──────────────────────────────────────────────────────────

export function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function plusColorHex(val: number): string {
  if (val >= 130) return EMERALD
  if (val >= 115) return '#6ee7b7'
  if (val >= 100) return TEXT
  if (val >= 85)  return '#fb923c'
  return RED
}

function headshot(playerId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_80,q_auto:best/v1/people/${playerId}/headshot/67/current`
}

function padStr(p?: { top: number; right: number; bottom: number; left: number }): string {
  if (!p) return '0'
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
}

// ─── Block renderers ──────────────────────────────────────────────────

type BlockData = Record<string, unknown>

function renderHeader(block: EmailBlock, _data: BlockData, branding: ProductBranding): string {
  const c = block.config as Record<string, string | boolean>
  const style = c.style || branding.headerStyle || 'banner'
  const color = branding.primaryColor || EMERALD

  if (style === 'banner' && (c.bannerUrl || branding.logoUrl)) {
    const url = (c.bannerUrl || branding.logoUrl) as string
    return `<tr><td style="padding:24px 0 16px;text-align:center;">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(c.title as string || branding.fromName)}" width="640" style="width:100%;max-width:640px;height:auto;display:block;margin:0 auto;" />
      ${c.showDate !== false ? `<p style="margin:12px 0 0;font-size:12px;color:${TEXT_MUTED};letter-spacing:0.06em;text-transform:uppercase;">{{date_formatted}}</p>` : ''}
    </td></tr>`
  }

  if (style === 'logo' && (c.logoUrl || branding.logoUrl)) {
    return `<tr><td style="padding:24px 0 16px;text-align:center;">
      <img src="${escapeHtml((c.logoUrl || branding.logoUrl) as string)}" alt="" width="120" style="width:120px;height:auto;display:block;margin:0 auto;" />
      ${c.title ? `<p style="margin:12px 0 0;font-size:18px;font-weight:700;color:${TEXT_BRIGHT};">${escapeHtml(c.title as string)}</p>` : ''}
      ${c.subtitle ? `<p style="margin:4px 0 0;font-size:12px;color:${TEXT_MUTED};">${escapeHtml(c.subtitle as string)}</p>` : ''}
    </td></tr>`
  }

  // Text style
  return `<tr><td style="padding:24px 0 16px;text-align:center;">
    <p style="margin:0;font-size:22px;font-weight:800;color:${color};letter-spacing:-0.02em;">${escapeHtml(c.title as string || branding.fromName)}</p>
    ${c.subtitle ? `<p style="margin:4px 0 0;font-size:12px;color:${TEXT_MUTED};">${escapeHtml(c.subtitle as string)}</p>` : ''}
    ${c.showDate !== false ? `<p style="margin:8px 0 0;font-size:12px;color:${TEXT_MUTED};letter-spacing:0.06em;text-transform:uppercase;">{{date_formatted}}</p>` : ''}
  </td></tr>`
}

function renderFooter(block: EmailBlock, _data: BlockData, branding: ProductBranding): string {
  const c = block.config as Record<string, string | boolean>
  return `<tr><td style="border-top:1px solid ${BORDER};"></td></tr>
  <tr><td style="padding:24px 0;text-align:center;">
    ${c.text ? `<p style="margin:0 0 8px;font-size:11px;color:${TEXT_MUTED};">${escapeHtml(c.text as string)}</p>` : ''}
    ${c.showBranding !== false ? `<p style="margin:0;font-size:11px;color:${TEXT_MUTED};">${escapeHtml(branding.fromName)} by <a href="${SITE_URL}" style="color:${branding.primaryColor || EMERALD};text-decoration:none;">Triton Apex</a></p>` : ''}
    ${c.showUnsubscribe !== false ? `<p style="margin:8px 0 0;font-size:10px;color:${TEXT_MUTED};"><a href="{{unsubscribe_url}}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a></p>` : ''}
  </td></tr>`
}

function renderDivider(block: EmailBlock): string {
  const c = block.config as Record<string, string | number>
  return `<tr><td style="padding:${padStr(block.padding)};"><hr style="border:none;border-top:${c.thickness || 1}px ${c.style || 'solid'} ${c.color || BORDER};margin:0;" /></td></tr>`
}

function renderSpacer(block: EmailBlock): string {
  const h = (block.config as Record<string, number>).height || 24
  return `<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`
}

function renderRichText(block: EmailBlock, data: BlockData): string {
  const html = (data?.html as string) || (block.config as Record<string, string>).html || ''
  return `<tr><td style="padding:${padStr(block.padding)};">${html}</td></tr>`
}

function renderImage(block: EmailBlock): string {
  const c = block.config as Record<string, string | number>
  const img = `<img src="${escapeHtml(c.src as string)}" alt="${escapeHtml(c.alt as string)}" width="640" style="width:${c.width || '100%'};max-width:640px;height:auto;display:block;margin:0 auto;${c.borderRadius ? `border-radius:${c.borderRadius}px;` : ''}" />`
  const wrapped = c.linkUrl ? `<a href="${escapeHtml(c.linkUrl as string)}" target="_blank" rel="noopener" style="display:block;">${img}</a>` : img
  return `<tr><td style="padding:${padStr(block.padding)};text-align:center;">${wrapped}</td></tr>`
}

function renderButton(block: EmailBlock): string {
  const c = block.config as Record<string, string | number | boolean>
  const bg = (c.bgColor as string) || EMERALD
  const tc = (c.textColor as string) || BG
  const align = (c.align as string) || 'center'
  const radius = c.borderRadius || 6
  const widthStyle = c.fullWidth ? 'display:block;width:100%;' : 'display:inline-block;'

  return `<tr><td style="padding:${padStr(block.padding)};text-align:${align};">
    <a href="${escapeHtml(c.url as string)}" target="_blank" rel="noopener" style="${widthStyle}background:${bg};color:${tc};font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:${radius}px;text-align:center;">
      ${escapeHtml(c.text as string)}
    </a>
  </td></tr>`
}

function renderSocialLinks(block: EmailBlock): string {
  const c = block.config as Record<string, unknown>
  const links = (c.links as { platform: string; url: string }[]) || []
  const align = (c.align as string) || 'center'
  const size = (c.iconSize as number) || 24

  const icons = links.map(l => {
    const label = l.platform.charAt(0).toUpperCase() + l.platform.slice(1)
    return `<td style="padding:0 6px;">
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" style="color:${TEXT_MUTED};text-decoration:none;font-size:${size - 8}px;font-weight:600;">
        ${escapeHtml(label)}
      </a>
    </td>`
  }).join('')

  return `<tr><td style="padding:${padStr(block.padding)};text-align:${align};">
    <table cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:0 auto;"><tr>${icons}</tr></table>
  </td></tr>`
}

function renderCustomHtml(block: EmailBlock): string {
  const html = (block.config as Record<string, string>).html || ''
  return `<tr><td style="padding:${padStr(block.padding)};">${html}</td></tr>`
}

function renderScores(_block: EmailBlock, data: BlockData): string {
  const scores = (data?.scores as Array<Record<string, unknown>>) || []
  if (scores.length === 0) return ''

  function buildScoreCard(g: Record<string, unknown>): string {
    const awayWon = (g.awayScore as number) > (g.homeScore as number)
    const winColor = TEXT_BRIGHT
    const loseColor = TEXT_MUTED

    const decParts: string[] = []
    if (g.winner) decParts.push(`<span style="color:${EMERALD};font-weight:600;">W</span> ${escapeHtml(g.winner as string)}`)
    if (g.loser) decParts.push(`<span style="color:${RED};font-weight:600;">L</span> ${escapeHtml(g.loser as string)}`)
    if (g.save) decParts.push(`<span style="color:${BLUE};font-weight:600;">SV</span> ${escapeHtml(g.save as string)}`)

    return `<td width="25%" valign="top" style="padding:3px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;">
        <tr><td class="card-pad" style="padding:8px 10px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td></td>
              <td align="right" width="18" style="font-size:9px;font-weight:600;color:${TEXT_MUTED};padding-bottom:2px;">R</td>
              <td align="right" width="18" style="font-size:9px;font-weight:600;color:${TEXT_MUTED};padding-bottom:2px;">H</td>
              <td align="right" width="18" style="font-size:9px;font-weight:600;color:${TEXT_MUTED};padding-bottom:2px;">E</td>
            </tr>
            <tr>
              <td style="font-size:11px;font-weight:700;color:${awayWon ? winColor : loseColor};">${escapeHtml(g.away as string)}</td>
              <td align="right" style="font-size:13px;font-weight:800;color:${awayWon ? winColor : loseColor};">${g.awayScore}</td>
              <td align="right" style="font-size:11px;color:${TEXT_MUTED};">${g.awayHits ?? '—'}</td>
              <td align="right" style="font-size:11px;color:${TEXT_MUTED};">${g.awayErrors ?? '—'}</td>
            </tr>
            <tr>
              <td style="font-size:11px;font-weight:700;color:${!awayWon ? winColor : loseColor};">${escapeHtml(g.home as string)}</td>
              <td align="right" style="font-size:13px;font-weight:800;color:${!awayWon ? winColor : loseColor};">${g.homeScore}</td>
              <td align="right" style="font-size:11px;color:${TEXT_MUTED};">${g.homeHits ?? '—'}</td>
              <td align="right" style="font-size:11px;color:${TEXT_MUTED};">${g.homeErrors ?? '—'}</td>
            </tr>
          </table>
          ${decParts.length > 0 ? `<p style="margin:4px 0 0;font-size:9px;color:${TEXT_MUTED};line-height:1.4;">${decParts.join(' &middot; ')}</p>` : ''}
        </td></tr>
      </table>
    </td>`
  }

  const rows: string[] = []
  for (let i = 0; i < scores.length; i += 4) {
    const cells = scores.slice(i, i + 4).map(g => buildScoreCard(g))
    while (cells.length < 4) cells.push(`<td width="25%" style="padding:3px;"></td>`)
    rows.push(`<tr class="scores-row">${cells.join('')}</tr>`)
  }

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">Scores</p></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0" border="0" width="100%">${rows.join('')}</table></td></tr>
    </table>
  </td></tr>`
}

function renderStandouts(_block: EmailBlock, data: BlockData): string {
  const standouts = (data?.standouts as Array<Record<string, unknown>>) || []
  if (standouts.length === 0) return ''

  function buildCard(s: Record<string, unknown>): string {
    const gl = s.game_line as Record<string, unknown> | null
    const fmtLine = gl
      ? `<p style="margin:4px 0 0;font-size:10px;color:${TEXT_MUTED};font-family:monospace;">${gl.ip} IP, ${gl.h} H, ${gl.er} ER, ${gl.bb} BB, ${gl.k} K</p>`
      : ''

    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;margin-bottom:8px;">
      <tr><td style="padding:12px 14px;">
        <p style="margin:0 0 8px;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">
          <span style="color:${s.accent_color || AMBER};">${escapeHtml(s.plus_label as string)}</span> ${escapeHtml(s.role_label as string)}
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td width="40" valign="middle" style="padding-right:10px;">
            <img src="${headshot(s.player_id as number)}" alt="" width="40" height="40" style="border-radius:50%;display:block;" />
          </td>
          <td valign="middle">
            <p style="margin:0;font-size:13px;font-weight:600;color:${TEXT_BRIGHT};">${escapeHtml(s.player_name as string)}</p>
            <p style="margin:2px 0 0;font-size:10px;color:${TEXT_MUTED};">${escapeHtml(s.team as string)}</p>
          </td>
          <td width="60" align="right" valign="middle">
            <p style="margin:0;font-size:22px;font-weight:800;font-family:monospace;color:${plusColorHex(s.plus_value as number)};">${s.plus_value}</p>
          </td>
        </tr></table>
        ${fmtLine}
      </td></tr>
    </table>`
  }

  const pairs: string[] = []
  for (let i = 0; i < standouts.length; i += 2) {
    const left = buildCard(standouts[i])
    const right = standouts[i + 1] ? buildCard(standouts[i + 1]) : ''
    pairs.push(`<tr>
      <td width="50%" valign="top" style="padding-right:4px;">${left}</td>
      <td width="50%" valign="top" style="padding-left:4px;">${right}</td>
    </tr>`)
  }

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">Yesterday's Standouts</p></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col">${pairs.join('')}</table></td></tr>
    </table>
  </td></tr>`
}

function renderTrendAlerts(_block: EmailBlock, data: BlockData): string {
  const surges = (data?.surges as Array<Record<string, unknown>>) || []
  const concerns = (data?.concerns as Array<Record<string, unknown>>) || []
  if (surges.length === 0 && concerns.length === 0) return ''

  function buildList(alerts: Array<Record<string, unknown>>, type: 'surge' | 'concern'): string {
    if (alerts.length === 0) return `<p style="color:${TEXT_MUTED};font-size:12px;margin:0;">No ${type === 'surge' ? 'surges' : 'concerns'} detected.</p>`
    const badgeColor = type === 'surge' ? EMERALD : RED
    const rows = alerts.slice(0, 5).map((a, i) => {
      const sigmaText = Math.abs(a.sigma as number).toFixed(1) + '\u03c3'
      const arrow = a.direction === 'up' ? '\u2191' : '\u2193'
      return `<tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;" width="20">
          <span style="font-size:11px;color:${TEXT_MUTED};font-weight:600;">${i + 1}.</span>
        </td>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-weight:600;color:${TEXT_BRIGHT};font-size:13px;">${escapeHtml(a.player_name as string)}</span>
          <span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:${badgeColor};background:rgba(${type === 'surge' ? '52,211,153' : '248,113,113'},0.12);padding:1px 6px;border-radius:3px;">
            ${arrow} ${sigmaText}
          </span>
          <p style="margin:2px 0 0;font-size:11px;color:${TEXT_MUTED};">
            ${escapeHtml(a.metric_label as string)}: ${(a.season_val as number).toFixed(1)} &rarr; ${(a.recent_val as number).toFixed(1)} (${(a.delta as number) > 0 ? '+' : ''}${(a.delta as number).toFixed(1)})
          </p>
        </td>
      </tr>`
    }).join('')
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tbody>${rows}</tbody></table>`
  }

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col"><tr>
      <td width="50%" valign="top" style="padding-right:8px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">Surges</p></td></tr>
          <tr><td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">${buildList(surges, 'surge')}</td></tr>
        </table>
      </td>
      <td width="50%" valign="top" style="padding-left:8px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">Concerns</p></td></tr>
          <tr><td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;">${buildList(concerns, 'concern')}</td></tr>
        </table>
      </td>
    </tr></table>
  </td></tr>`
}

function renderStarterCard(_block: EmailBlock, data: BlockData): string {
  const date = (data?.date as string) || ''
  const cardType = 'ig-starter-card'
  const url = `${SITE_URL}/api/daily-graphics?date=${date}&type=${cardType}`

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">Start of the Day</p></td></tr>
      <tr><td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
        <a href="${url}" target="_blank" rel="noopener" style="display:block;">
          <img src="${url}" alt="Start of the Day" width="640" style="width:100%;height:auto;display:block;" />
        </a>
      </td></tr>
    </table>
  </td></tr>`
}

function renderStatsTable(_block: EmailBlock, data: BlockData): string {
  const rows = (data?.rows as Array<Record<string, unknown>>) || []
  const columns = (data?.columns as string[]) || []
  if (rows.length === 0 || columns.length === 0) return ''

  const headerCells = columns.map(c =>
    `<th style="padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${TEXT_MUTED};border-bottom:2px solid ${BORDER};text-align:left;">${escapeHtml(c)}</th>`
  ).join('')

  const bodyRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
    const cells = columns.map(c =>
      `<td style="padding:6px 8px;font-size:12px;color:${TEXT};border-bottom:1px solid ${BORDER};background:${bg};">${escapeHtml(String(row[c] ?? ''))}</td>`
    ).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </td></tr>`
}

function renderPlayerCard(_block: EmailBlock, data: BlockData): string {
  const p = data as Record<string, unknown>
  if (!p.player_name) return ''

  const stats = (p.stats as Array<{ label: string; value: number }>) || []
  const statCells = stats.map(s =>
    `<td align="center" style="padding:4px 8px;">
      <p style="margin:0;font-size:9px;text-transform:uppercase;color:${TEXT_MUTED};">${escapeHtml(s.label)}</p>
      <p style="margin:2px 0 0;font-size:18px;font-weight:800;font-family:monospace;color:${plusColorHex(s.value)};">${s.value}</p>
    </td>`
  ).join('')

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;">
      <tr><td style="padding:16px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td width="60" valign="middle" style="padding-right:14px;">
            <img src="${headshot(p.player_id as number)}" alt="" width="60" height="60" style="border-radius:50%;display:block;" />
          </td>
          <td valign="middle">
            <p style="margin:0;font-size:16px;font-weight:700;color:${TEXT_BRIGHT};">${escapeHtml(p.player_name as string)}</p>
            <p style="margin:2px 0 0;font-size:11px;color:${TEXT_MUTED};">${escapeHtml(p.team as string || '')}</p>
          </td>
        </tr></table>
        ${stats.length > 0 ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;"><tr>${statCells}</tr></table>` : ''}
      </td></tr>
    </table>
  </td></tr>`
}

function renderLeaderboard(_block: EmailBlock, data: BlockData): string {
  const leaders = (data?.leaders as Array<Record<string, unknown>>) || []
  if (leaders.length === 0) return ''
  const metric = (data?.metric_label as string) || 'Value'

  const rows = leaders.map((l, i) => {
    const val = l.value as number
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid ${BORDER};" width="30">
        <span style="font-size:12px;font-weight:700;color:${i < 3 ? EMERALD : TEXT_MUTED};">${i + 1}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
        <span style="font-size:13px;font-weight:600;color:${TEXT_BRIGHT};">${escapeHtml(l.player_name as string)}</span>
        <span style="margin-left:6px;font-size:10px;color:${TEXT_MUTED};">${escapeHtml(l.team as string || '')}</span>
      </td>
      <td align="right" style="padding:8px 10px;border-bottom:1px solid ${BORDER};">
        <span style="font-size:16px;font-weight:800;font-family:monospace;color:${plusColorHex(val)};">${val}</span>
      </td>
    </tr>`
  }).join('')

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">${escapeHtml(metric)} Leaders</p></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">${rows}</table></td></tr>
    </table>
  </td></tr>`
}

function renderRssCard(_block: EmailBlock, data: BlockData): string {
  const post = data as Record<string, unknown>
  if (!post.title) return ''

  return `<tr><td style="padding:0 0 24px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">Latest from Mayday</p></td></tr>
      <tr><td>
        <a href="${escapeHtml(post.link as string)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
            ${post.imageUrl ? `<tr><td style="padding:0;"><img src="${escapeHtml(post.imageUrl as string)}" alt="" width="640" style="width:100%;height:auto;display:block;border-radius:8px 8px 0 0;" /></td></tr>` : ''}
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:16px;font-weight:700;color:${TEXT_BRIGHT};line-height:1.4;">${escapeHtml(post.title as string)}</p>
              ${post.description ? `<p style="margin:6px 0 0;font-size:13px;color:${TEXT};line-height:1.5;">${escapeHtml(post.description as string)}</p>` : ''}
              ${post.author ? `<p style="margin:10px 0 0;font-size:11px;color:${TEXT_MUTED};">By ${escapeHtml(post.author as string)}</p>` : ''}
              <p style="margin:12px 0 0;"><span style="font-size:12px;font-weight:600;color:${EMERALD};">Read more &rarr;</span></p>
            </td></tr>
          </table>
        </a>
      </td></tr>
    </table>
  </td></tr>`
}

function renderPoll(block: EmailBlock): string {
  const c = block.config as Record<string, unknown>
  const question = (c.question as string) || ''
  const options = (c.options as { label: string; url: string }[]) || []

  const optionHtml = options.map(o =>
    `<tr><td style="padding:4px 0;">
      <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener" style="display:block;padding:10px 16px;background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;text-decoration:none;color:${TEXT_BRIGHT};font-size:13px;font-weight:500;">
        ${escapeHtml(o.label)}
      </a>
    </td></tr>`
  ).join('')

  return `<tr><td style="padding:${padStr(block.padding)};">
    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${TEXT_BRIGHT};">${escapeHtml(question)}</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${optionHtml}</table>
  </td></tr>`
}

function renderCountdown(block: EmailBlock): string {
  const c = block.config as Record<string, string>
  return `<tr><td style="padding:${padStr(block.padding)};text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">${escapeHtml(c.label)}</p>
    <p style="margin:0;font-size:11px;color:${TEXT_MUTED};">${escapeHtml(c.targetDate)}</p>
  </td></tr>`
}

function renderPersonalization(block: EmailBlock): string {
  const c = block.config as Record<string, string>
  const template = c.template || `Hey {{${c.field || 'name'}}},`
  return `<tr><td style="padding:${padStr(block.padding)};font-size:14px;color:${TEXT};">${escapeHtml(template)}</td></tr>`
}

function renderSection(block: EmailBlock, data: BlockData, branding: ProductBranding): string {
  const c = block.config as Record<string, string | boolean>
  const children = block.children || []
  const childHtml = children.map(child => renderBlockHtml(child, data, branding)).join('')

  let sectionTitle = ''
  if (c.showTitle !== false && c.title) {
    sectionTitle = `<tr><td style="padding:0 0 12px 0;"><p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};padding-bottom:8px;">${escapeHtml(c.title as string)}</p></td></tr>`
  }

  const bg = c.background ? `background:${c.background};` : ''

  return `<tr><td style="padding:${padStr(block.padding)};${bg}">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      ${sectionTitle}
      ${childHtml}
    </table>
  </td></tr>`
}

function renderColumns(block: EmailBlock, data: BlockData, branding: ProductBranding): string {
  const c = block.config as Record<string, number>
  const colCount = c.columnCount || 2
  const children = block.children || []
  const colWidth = Math.floor(100 / colCount)

  const cols = Array.from({ length: colCount }, (_, i) => {
    const child = children[i]
    const inner = child ? renderBlockHtml(child, data, branding) : ''
    return `<td width="${colWidth}%" valign="top" style="padding:0 ${i < colCount - 1 ? (c.gap || 16) / 2 : 0}px 0 ${i > 0 ? (c.gap || 16) / 2 : 0}px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">${inner}</table>
    </td>`
  }).join('')

  return `<tr><td style="padding:${padStr(block.padding)};">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" class="two-col"><tr>${cols}</tr></table>
  </td></tr>`
}

// Conditional and unsupported blocks render nothing or render children
function renderConditional(block: EmailBlock, data: BlockData, branding: ProductBranding): string {
  const children = block.children || []
  return children.map(child => renderBlockHtml(child, data, branding)).join('')
}

// ─── Block dispatcher ─────────────────────────────────────────────────

export function renderBlockHtml(block: EmailBlock, data: BlockData, branding: ProductBranding): string {
  if (block.visible === false) return ''

  switch (block.type) {
    case 'header':         return renderHeader(block, data, branding)
    case 'footer':         return renderFooter(block, data, branding)
    case 'divider':        return renderDivider(block)
    case 'spacer':         return renderSpacer(block)
    case 'rich-text':      return renderRichText(block, data)
    case 'image':          return renderImage(block)
    case 'button':         return renderButton(block)
    case 'social-links':   return renderSocialLinks(block)
    case 'custom-html':    return renderCustomHtml(block)
    case 'scores':         return renderScores(block, data)
    case 'standouts':      return renderStandouts(block, data)
    case 'trend-alerts':   return renderTrendAlerts(block, data)
    case 'starter-card':   return renderStarterCard(block, data)
    case 'stats-table':    return renderStatsTable(block, data)
    case 'player-card':    return renderPlayerCard(block, data)
    case 'leaderboard':    return renderLeaderboard(block, data)
    case 'rss-card':       return renderRssCard(block, data)
    case 'poll':           return renderPoll(block)
    case 'countdown':      return renderCountdown(block)
    case 'personalization': return renderPersonalization(block)
    case 'section':        return renderSection(block, data, branding)
    case 'columns':        return renderColumns(block, data, branding)
    case 'conditional':    return renderConditional(block, data, branding)
    default:               return ''
  }
}

// ─── Full email renderer ──────────────────────────────────────────────

export interface RenderEmailOptions {
  blocks: EmailBlock[]
  branding: ProductBranding
  settings: TemplateSettings
  data: Record<string, BlockData>  // keyed by block.id
  subject: string
  date?: string
  unsubscribeUrl?: string
}

export function renderEmail(opts: RenderEmailOptions): string {
  const { blocks, branding, settings, data, subject, date, unsubscribeUrl } = opts
  const maxWidth = settings.maxWidth || 640
  const bodyBg = settings.bodyBg || BG
  const fontFamily = settings.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  const primary = branding.primaryColor || EMERALD

  const dateFormatted = date
    ? new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  const blocksHtml = blocks.map(block => {
    const blockData = data[block.id] || {}
    return renderBlockHtml(block, blockData, branding)
  }).join('\n')

  // Replace template vars
  const processedHtml = blocksHtml
    .replace(/\{\{date_formatted\}\}/g, escapeHtml(dateFormatted))
    .replace(/\{\{date\}\}/g, escapeHtml(date || ''))
    .replace(/\{\{unsubscribe_url\}\}/g, escapeHtml(unsubscribeUrl || ''))

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body, table, td { font-family: ${fontFamily}; }
    body { margin: 0; padding: 0; background-color: ${bodyBg}; }
    img { border: 0; display: block; }
    a { color: ${primary}; }
    @media only screen and (max-width: 660px) {
      .email-container { width: 100% !important; }
      .two-col td { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
      .scores-row td { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; }
      .card-pad { padding: 14px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${bodyBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <center>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${bodyBg};">
      <tr>
        <td align="center" style="padding:20px 16px;">
          <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" border="0" width="${maxWidth}" style="max-width:${maxWidth}px;width:100%;background-color:${bodyBg};">
            ${processedHtml}
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`
}
