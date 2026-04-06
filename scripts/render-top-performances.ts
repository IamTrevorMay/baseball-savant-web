/**
 * render-top-performances.ts — Render "Top Performances" from daily brief to PNG.
 * Fetches the latest brief from Supabase, parses the HTML table rows,
 * and renders a 1080x1350 IG Portrait graphic.
 *
 * Usage: npx tsx scripts/render-top-performances.ts
 */
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

// ── Types ──────────────────────────────────────────────────────────────
interface PerfEntry {
  name: string
  team: string
  stats: string
}

// ── Parse HTML table rows into structured data ─────────────────────────
function parsePerformancesHtml(html: string): PerfEntry[] {
  const entries: PerfEntry[] = []
  // Match each <tr>...</tr>
  const trRegex = /<tr>([\s\S]*?)<\/tr>/gi
  let trMatch
  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1]
    // Extract player name from <span style="font-weight:600...">Name</span>
    const nameMatch = rowHtml.match(/font-weight:\s*600[^>]*>([^<]+)</)
    // Extract team from the small span after name
    const teamMatch = rowHtml.match(/font-size:\s*11px[^>]*>([^<]+)</)
    // Extract stats from the second <td>
    const tds = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)
    let stats = ''
    if (tds && tds.length >= 2) {
      stats = tds[1].replace(/<[^>]+>/g, '').trim()
    }
    if (nameMatch) {
      entries.push({
        name: nameMatch[1].trim(),
        team: teamMatch ? teamMatch[1].trim() : '??',
        stats: stats || '—',
      })
    }
  }
  return entries
}

// ── Canvas helpers ──────────────────────────────────────────────────────
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ── Render ──────────────────────────────────────────────────────────────
function render(entries: PerfEntry[], dateStr: string) {
  const W = 1080, H = 1350
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.font = `800 60px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('TOP PERFORMANCES', W / 2, 70)

  // Date subtitle
  ctx.font = `400 25px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(dateStr, W / 2, 120)

  // Accent colors for rank badges
  const rankColors = [
    '#f59e0b', '#f59e0b', '#f59e0b', // gold top 3
    '#10b981', '#10b981', '#10b981', '#10b981', '#10b981', // emerald rest
    '#10b981', '#10b981',
  ]

  const maxEntries = Math.min(entries.length, 10)
  const contentH = H - 200 // space for title + watermark
  const rowH = Math.min(110, contentH / maxEntries)
  const startY = 160
  const rowX = 40
  const rowW = W - 80

  for (let i = 0; i < maxEntries; i++) {
    const entry = entries[i]
    const ry = startY + i * rowH
    const rowCenterX = W / 2

    // Row background (subtle)
    roundRect(ctx, rowX, ry, rowW, rowH - 8, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fill()

    // Rank number (left of name, offset from center)
    const rankColor = rankColors[i] || '#10b981'
    ctx.font = `800 42px ${FONT}`
    ctx.fillStyle = rankColor
    ctx.textAlign = 'center'

    // Measure name + team to center the whole group
    ctx.font = `700 40px ${FONT}`
    const nameW = ctx.measureText(entry.name).width
    ctx.font = `600 18px ${FONT}`
    const teamW = ctx.measureText(entry.team).width + 16
    const rankW = 50 // rank number width
    const gap = 14
    const totalW = rankW + gap + nameW + gap + teamW
    const groupX = rowCenterX - totalW / 2

    // Rank number
    ctx.font = `800 42px ${FONT}`
    ctx.fillStyle = rankColor
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), groupX + rankW / 2, ry + 40)

    // Player name
    ctx.font = `700 40px ${FONT}`
    ctx.fillStyle = '#e4e4e7'
    ctx.textAlign = 'left'
    ctx.fillText(entry.name, groupX + rankW + gap, ry + 40)

    // Team badge
    const teamX = groupX + rankW + gap + nameW + gap
    ctx.font = `600 18px ${FONT}`
    roundRect(ctx, teamX, ry + 24, teamW, 26, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
    ctx.fillStyle = '#a1a1aa'
    ctx.textAlign = 'center'
    ctx.fillText(entry.team, teamX + teamW / 2, ry + 38)

    // Stats line (centered)
    ctx.font = `400 26px ${FONT}`
    ctx.fillStyle = '#71717a'
    ctx.textAlign = 'center'
    ctx.fillText(entry.stats, rowCenterX, ry + 78)
  }

  // Watermark
  ctx.font = `400 18px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.textAlign = 'center'
  ctx.fillText('Powered by Mayday Media', W / 2, H - 30)

  return canvas
}

// ── Sample data ─────────────────────────────────────────────────────────
const SAMPLE_ENTRIES: PerfEntry[] = [
  { name: 'Aaron Judge', team: 'NYY', stats: '3-for-4, 2 HR, 5 RBI, BB' },
  { name: 'Paul Skenes', team: 'PIT', stats: '7.0 IP, 2 H, 0 ER, 12 K' },
  { name: 'Shohei Ohtani', team: 'LAD', stats: '4-for-5, HR, 3B, 4 RBI' },
  { name: 'Tarik Skubal', team: 'DET', stats: '8.0 IP, 3 H, 1 ER, 11 K' },
  { name: 'Bobby Witt Jr.', team: 'KC', stats: '3-for-4, HR, 2B, 3 RBI, SB' },
  { name: 'Corbin Carroll', team: 'ARI', stats: '4-for-5, 2 2B, 3 R, 2 RBI' },
  { name: 'Gerrit Cole', team: 'NYY', stats: '7.0 IP, 4 H, 2 ER, 9 K, W' },
  { name: 'Mookie Betts', team: 'LAD', stats: '2-for-3, HR, 3 BB, 3 R' },
  { name: 'Elly De La Cruz', team: 'CIN', stats: '3-for-5, HR, 2 SB, 3 RBI' },
  { name: 'Spencer Strider', team: 'ATL', stats: '6.2 IP, 5 H, 1 ER, 10 K' },
]

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  let entries: PerfEntry[] = SAMPLE_ENTRIES
  let dateStr = 'Saturday, Apr 5'

  // Try fetching from Supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && key) {
    try {
      console.log('Fetching latest brief from Supabase...')
      const supabase = createClient(url, key)
      const { data } = await supabase
        .from('briefs')
        .select('date, metadata')
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (data?.metadata?.claude_sections?.topPerformances) {
        const parsed = parsePerformancesHtml(data.metadata.claude_sections.topPerformances)
        if (parsed.length > 0) {
          entries = parsed
          const d = new Date(data.date + 'T12:00:00')
          dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          console.log(`Got ${entries.length} performances from ${data.date}`)
        } else {
          console.log('No performances parsed, using sample data')
        }
      } else {
        console.log('No topPerformances in brief, using sample data')
      }
    } catch (err) {
      console.log('Could not fetch brief, using sample data:', (err as Error).message)
    }
  } else {
    console.log('No Supabase credentials, using sample data')
  }

  const canvas = render(entries, dateStr)
  const buf = canvas.toBuffer('image/png')
  const outPath = join('/Users/trevor/Desktop', 'top-performances.png')
  writeFileSync(outPath, buf)
  console.log(`Saved to ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
