/**
 * Standalone script to render "Trends" template to PNG.
 * Usage: npx tsx scripts/render-trends.ts
 */
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'fs'
import { join } from 'path'

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

// ── Fetch trends from local API ──────────────────────────────────────────
async function fetchTrends() {
  const season = new Date().getFullYear()
  const earlyMonth = new Date().getMonth() + 1 <= 4
  const minPitches = earlyMonth ? 50 : 500

  const [pitcherRes, hitterRes] = await Promise.all([
    fetch('http://localhost:3000/api/trends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, playerType: 'pitcher', minPitches }),
    }),
    fetch('http://localhost:3000/api/trends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, playerType: 'hitter', minPitches }),
    }),
  ])

  const [pd, hd] = await Promise.all([pitcherRes.json(), hitterRes.json()])
  const pitcherAlerts = (pd.rows || []).map((a: any) => ({ ...a, type: 'pitcher' }))
  const hitterAlerts = (hd.rows || []).map((a: any) => ({ ...a, type: 'hitter' }))
  const all = [...pitcherAlerts, ...hitterAlerts]

  const surgeAll = all.filter((a: any) => a.sentiment === 'good').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma))
  const concernAll = all.filter((a: any) => a.sentiment === 'bad').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma))

  const pickUnique = (list: any[], n: number) => {
    const seen = new Set<number>()
    const result: any[] = []
    for (const item of list) {
      if (seen.has(item.player_id)) continue
      seen.add(item.player_id)
      result.push(item)
      if (result.length >= n) break
    }
    return result
  }

  return {
    surges: pickUnique(surgeAll, 5),
    concerns: pickUnique(concernAll, 5),
  }
}

// ── Canvas helpers ───────────────────────────────────────────────────────
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

// ── Render ───────────────────────────────────────────────────────────────
function render(trends: { surges: any[]; concerns: any[] }) {
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
  ctx.fillText('TRENDS', W / 2, 70)

  // Subtitle
  ctx.font = `400 25px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText('Rolling averages over the last 30 days', W / 2, 120)

  const sectionX = 40
  const sectionW = W - 80
  const rowH = 90
  const maxRows = 5
  const colNameW = 340
  const colChangeW = 340
  const colSeasonW = sectionW - colNameW - colChangeW

  function fmtVal(metric: string, val: number): string {
    if (metric === 'xwoba') return val.toFixed(3)
    if (metric === 'spin') return String(Math.round(val))
    if (metric === 'velo' || metric === 'ev') return val.toFixed(1)
    return val.toFixed(1)
  }

  function fmtChange(metric: string, recent: number, season: number): string {
    const diff = recent - season
    const sign = diff >= 0 ? '+' : ''
    if (metric === 'xwoba') return `${sign}${diff.toFixed(3)}`
    if (metric === 'spin') return `${sign}${Math.round(diff)}`
    return `${sign}${diff.toFixed(1)}`
  }

  function drawSection(label: string, labelColor: string, accentColor: string, bgColor: string, items: any[], startY: number) {
    // Section background
    const sectionH = 40 + 36 + maxRows * rowH + 20
    roundRect(ctx, sectionX - 16, startY - 12, sectionW + 32, sectionH, 16)
    ctx.fillStyle = bgColor
    ctx.fill()

    // Section header
    ctx.font = `700 23px ${FONT}`
    ctx.fillStyle = labelColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, sectionX, startY + 16)

    // Column headers
    const headerY = startY + 40
    ctx.font = `600 15px ${FONT}`
    ctx.fillStyle = '#71717a'
    ctx.textAlign = 'center'
    ctx.fillText('PLAYER', sectionX + colNameW / 2, headerY + 11)
    ctx.fillText('CHANGE', sectionX + colNameW + colChangeW / 2, headerY + 11)
    ctx.fillText('SEASON', sectionX + colNameW + colChangeW + colSeasonW / 2, headerY + 11)

    // Divider
    ctx.fillStyle = '#27272a'
    ctx.fillRect(sectionX, headerY + 28, sectionW, 1)

    const rowStartY = headerY + 36

    for (let i = 0; i < maxRows; i++) {
      const item = items[i]
      const ry = rowStartY + i * rowH

      if (!item) {
        ctx.font = `400 25px ${FONT}`
        ctx.fillStyle = '#27272a'
        ctx.textAlign = 'center'
        ctx.fillText('—', sectionX + colNameW / 2, ry + 35)
        continue
      }

      const playerName = item.player_name || '—'
      const displayName = playerName.includes(',')
        ? playerName.split(',').map((s: string) => s.trim()).reverse().join(' ')
        : playerName
      const typeTag = item.type === 'hitter' ? 'H' : 'P'

      // Player name (centered)
      ctx.font = `600 28px ${FONT}`
      ctx.fillStyle = '#e4e4e7'
      ctx.textAlign = 'center'
      ctx.fillText(displayName, sectionX + colNameW / 2, ry + 23)

      // Type + metric (centered)
      ctx.font = `400 17px ${FONT}`
      ctx.fillStyle = '#71717a'
      ctx.fillText(`${typeTag}  •  ${item.metric_label}`, sectionX + colNameW / 2, ry + 53)

      // Change (big, centered, colored)
      const changeText = fmtChange(item.metric, item.recent_val, item.season_val)
      ctx.font = `800 41px ${FONT}`
      ctx.fillStyle = accentColor
      ctx.textAlign = 'center'
      ctx.fillText(changeText, sectionX + colNameW + colChangeW / 2, ry + 32)

      // Unit under change
      const unit = item.metric === 'velo' || item.metric === 'ev' ? 'mph'
        : item.metric === 'spin' ? 'rpm'
        : item.metric === 'xwoba' ? ''
        : '%'
      if (unit) {
        ctx.font = `500 15px ${FONT}`
        ctx.fillStyle = '#52525b'
        ctx.fillText(unit, sectionX + colNameW + colChangeW / 2, ry + 63)
      }

      // Season value
      ctx.font = `600 32px ${FONT}`
      ctx.fillStyle = '#a1a1aa'
      ctx.fillText(fmtVal(item.metric, item.season_val), sectionX + colNameW + colChangeW + colSeasonW / 2, ry + 33)

      // Row divider
      if (i < maxRows - 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(sectionX, ry + rowH - 4, sectionW, 1)
      }
    }
  }

  // Surges
  drawSection('SURGES', '#10b981', '#10b981', 'rgba(16, 185, 129, 0.08)', trends.surges, 155)

  // Concerns
  const concernsY = 155 + 40 + 36 + maxRows * rowH + 40
  drawSection('CONCERNS', '#ef4444', '#ef4444', 'rgba(239, 68, 68, 0.08)', trends.concerns, concernsY)

  // Watermark
  ctx.font = `400 18px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.textAlign = 'center'
  ctx.fillText('Powered by Mayday Media', W / 2, H - 30)

  return canvas
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching trends data...')
  let trends: { surges: any[]; concerns: any[] }
  try {
    trends = await fetchTrends()
    console.log(`Got ${trends.surges.length} surges, ${trends.concerns.length} concerns`)
  } catch (err) {
    console.log('Dev server not running, using sample data...')
    trends = {
      surges: [
        { player_id: 1, player_name: 'Paul Skenes', type: 'pitcher', metric: 'velo', metric_label: 'Avg Velo', season_val: 97.2, recent_val: 99.1, delta: 1.9, sigma: 2.5 },
        { player_id: 2, player_name: 'Shohei Ohtani', type: 'hitter', metric: 'ev', metric_label: 'Avg EV', season_val: 91.3, recent_val: 94.1, delta: 2.8, sigma: 2.2 },
        { player_id: 3, player_name: 'Bobby Witt Jr.', type: 'hitter', metric: 'hard_hit', metric_label: 'Hard Hit%', season_val: 38.2, recent_val: 52.1, delta: 13.9, sigma: 2.0 },
        { player_id: 4, player_name: 'Tarik Skubal', type: 'pitcher', metric: 'whiff', metric_label: 'Whiff%', season_val: 31.5, recent_val: 38.2, delta: 6.7, sigma: 1.8 },
        { player_id: 5, player_name: 'Gunnar Henderson', type: 'hitter', metric: 'xwoba', metric_label: 'xwOBA', season_val: 0.352, recent_val: 0.421, delta: 0.069, sigma: 1.7 },
      ],
      concerns: [
        { player_id: 6, player_name: 'Gerrit Cole', type: 'pitcher', metric: 'velo', metric_label: 'Avg Velo', season_val: 96.1, recent_val: 94.3, delta: -1.8, sigma: -2.1 },
        { player_id: 7, player_name: 'Marcus Semien', type: 'hitter', metric: 'k_pct', metric_label: 'K%', season_val: 18.5, recent_val: 28.3, delta: 9.8, sigma: -1.9 },
        { player_id: 8, player_name: 'Corbin Burnes', type: 'pitcher', metric: 'xwoba', metric_label: 'xwOBA', season_val: 0.298, recent_val: 0.358, delta: 0.060, sigma: -1.8 },
        { player_id: 9, player_name: 'Pete Alonso', type: 'hitter', metric: 'ev', metric_label: 'Avg EV', season_val: 90.8, recent_val: 87.2, delta: -3.6, sigma: -1.7 },
      ],
    }
  }

  const canvas = render(trends)
  const buf = canvas.toBuffer('image/png')
  const outPath = join('/Users/trevor/Desktop', 'trends.png')
  writeFileSync(outPath, buf)
  console.log(`Saved to ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
