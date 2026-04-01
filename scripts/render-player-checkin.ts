/**
 * Render "Player Check In" graphics from CSV data.
 * Matches the exact design from the reference image.
 * Usage: npx tsx scripts/render-player-checkin.ts
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from '@napi-rs/canvas'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const CSV_PATH = '/Users/trevor/Desktop/4.1 Show/2026_hitting_stats.csv'
const OUTPUT_DIR = '/Users/trevor/Desktop/4.1 Show'
const FONT_PATH = path.resolve(__dirname, '../public/fonts/Inter-Variable.ttf')
const FONT = () => 'Inter'
const W = 1920, H = 1080

// ── Colors from reference image ──
const STAT_COLORS = ['#f59e0b', '#2dd4bf', '#34d399', '#71717a', '#fbbf24', '#ef4444', '#38bdf8', '#e4e4e7']
const RANK_COLORS = ['#f59e0b', '#2dd4bf', '#34d399', '#71717a', '#a78bfa']
const HEADER_LABELS = ['AVG', 'SLG', 'OPS', 'HR', 'RBI', 'K', 'BB', 'EV']

// ── Column centers — 1.2x scale, uniform 150px spacing ──
const COL_CX = [540, 690, 840, 990, 1140, 1290, 1440, 1590]

// ── Layout per player count — 1.2x scale of reference image ──
interface RowPos { imgY: number; centerY: number; nameY: number; subY: number }
interface Layout {
  rows: RowPos[]; imgW: number; imgH: number; imgR: number
  imgX: number; nameX: number; rankX: number
  titleSize: number; subtitleSize: number
  headerSize: number; headerY: number
  nameSize: number; subSize: number; rankSize: number; statSize: number
  showRank: boolean
  // Solo cards: name rendered as separate section above headshot+stats
  nameAbove: boolean; aboveNameY: number; aboveSubY: number
  // Centered solo layout
  soloCenter: boolean
  colCenters?: number[]
  playerNameY?: number; seasonLabelY?: number
}

function buildRows(count: number): Layout {
  const shared = { titleSize: 53, subtitleSize: 19 }

  if (count === 1) {
    // Solo centered — large headshot centered, name below, stats below
    return {
      ...shared,
      headerSize: 22, headerY: 745,
      nameSize: 48, subSize: 22,
      rankSize: 0, statSize: 60,
      imgW: 280, imgH: 420, imgR: 16,
      imgX: (W - 280) / 2, nameX: W / 2, rankX: 0,
      showRank: false,
      nameAbove: false, aboveNameY: 0, aboveSubY: 0,
      soloCenter: true,
      colCenters: [435, 585, 735, 885, 1035, 1185, 1335, 1485],
      playerNameY: 610, seasonLabelY: 668,
      rows: [{ imgY: 165, centerY: 815, nameY: 610, subY: 668 }],
    }
  }

  const multi = {
    ...shared,
    nameAbove: false, aboveNameY: 0, aboveSubY: 0,
    soloCenter: false,
  }

  if (count <= 4) {
    // 4-player — 1.2x of reference (145px → 174px row spacing)
    const topCY = 275, spacing = 174
    const rows = Array.from({ length: count }, (_, i) => {
      const cy = topCY + i * spacing
      return { imgY: cy - 54, centerY: cy, nameY: cy - 22, subY: cy + 12 }
    })
    return {
      ...multi,
      headerSize: 18, headerY: 172,
      nameSize: 26, subSize: 16,
      rankSize: 53, statSize: 46,
      imgW: 84, imgH: 108, imgR: 10,
      imgX: 130, nameX: 240, rankX: 86,
      showRank: true, rows,
    }
  }

  // 5-player — compressed to fit
  const topCY = 270, spacing = 148
  const rows = Array.from({ length: count }, (_, i) => {
    const cy = topCY + i * spacing
    return { imgY: cy - 48, centerY: cy, nameY: cy - 19, subY: cy + 10 }
  })
  return {
    ...multi,
    headerSize: 18, headerY: 172,
    nameSize: 24, subSize: 14,
    rankSize: 46, statSize: 42,
    imgW: 76, imgH: 98, imgR: 8,
    imgX: 125, nameX: 225, rankX: 82,
    showRank: true, rows,
  }
}

// ── Player data ──
interface PlayerStats {
  name: string; playerId: number
  avg: string; slg: string; ops: string; hr: number; rbi: number; k: number; bb: number; ev: string
}

const PLAYER_IDS: Record<string, number> = {
  'Bo Bichette': 666182, 'Cal Raleigh': 663728, 'Julio Rodriguez': 677594,
  'Randy Arozarena': 668227, 'Josh Naylor': 647304, 'Kevin McGonigle': 805808,
  'Carson Benge': 701807, 'Sal Stewart': 701398, 'Chase DeLauter': 800050,
  'JJ Wetherholt': 802139, 'Mike Trout': 545361,
}

const RBIS: Record<string, number> = {
  'Bo Bichette': 12, 'Cal Raleigh': 10, 'Julio Rodriguez': 7, 'Randy Arozarena': 9,
  'Josh Naylor': 2, 'Kevin McGonigle': 11, 'Carson Benge': 6, 'Sal Stewart': 11,
  'Chase DeLauter': 16, 'JJ Wetherholt': 11, 'Mike Trout': 6,
}

// ── Helpers ──
async function ensureFont() {
  if (fs.existsSync(FONT_PATH)) GlobalFonts.registerFromPath(FONT_PATH, 'Inter')
}

async function fetchImage(url: string): Promise<Image | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) { console.log(`    Image fetch failed: ${resp.status}`); return null }
    const buf = Buffer.from(await resp.arrayBuffer())
    return await loadImage(buf)
  } catch (e: any) { console.log(`    Image fetch error: ${e.message}`); return null }
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

// Format batting average style: "0.143" -> ".143"
function fmtAvg(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  if (n >= 1) return n.toFixed(3)
  return '.' + n.toFixed(3).split('.')[1]
}

// ── Render ──
async function renderGraphic(title: string, subtitle: string, players: PlayerStats[], filename: string) {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, W, H)

  const L = buildRows(players.length)

  const colCenters = L.colCenters || COL_CX

  // Title + subtitle (skip for soloCenter — headshot fills the top)
  if (!L.soloCenter) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 ${L.titleSize}px ${FONT()}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(title, 78, 50)

    ctx.fillStyle = '#71717a'
    ctx.font = `400 ${L.subtitleSize}px ${FONT()}`
    ctx.fillText(subtitle, 78, 112)
  }

  // Solo cards: player name + "2026 Season" as standalone section above stats
  if (L.nameAbove && players.length > 0) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${L.nameSize}px ${FONT()}`
    ctx.fillText(players[0].name, 78, L.aboveNameY)
    ctx.fillStyle = '#52525b'
    ctx.font = `400 ${L.subSize}px ${FONT()}`
    ctx.fillText('2026 Season', 78, L.aboveSubY)
  }

  // Column headers — muted gray, small, 600 weight
  ctx.fillStyle = '#52525b'
  ctx.font = `600 ${L.headerSize}px ${FONT()}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let i = 0; i < 8; i++) {
    ctx.fillText(HEADER_LABELS[i], colCenters[i], L.headerY)
  }

  // Player rows
  for (let i = 0; i < players.length && i < 5; i++) {
    const p = players[i]
    const row = L.rows[i]

    // Rank number
    if (L.showRank) {
      ctx.fillStyle = RANK_COLORS[i]
      ctx.font = `800 ${L.rankSize}px ${FONT()}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), L.rankX, row.centerY)
    }

    // Player headshot
    const imgUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
    console.log(`    Fetching headshot for ${p.name} (${p.playerId})...`)
    const img = await fetchImage(imgUrl)

    const headX = L.soloCenter ? (W - L.imgW) / 2 : L.imgX

    if (img) {
      ctx.save()
      roundRect(ctx, headX, row.imgY, L.imgW, L.imgH, L.imgR)
      ctx.clip()
      const imgRatio = img.width / img.height
      const boxRatio = L.imgW / L.imgH
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (imgRatio > boxRatio) { sw = img.height * boxRatio; sx = (img.width - sw) / 2 }
      else { sh = img.width / boxRatio; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, headX, row.imgY, L.imgW, L.imgH)
      ctx.restore()
      console.log(`    -> headshot loaded (${img.width}x${img.height})`)
    } else {
      ctx.fillStyle = '#27272a'
      roundRect(ctx, headX, row.imgY, L.imgW, L.imgH, L.imgR)
      ctx.fill()
      console.log('    -> headshot FAILED, using placeholder')
    }

    // Solo centered: player name + season label below headshot
    if (L.soloCenter) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${L.nameSize}px ${FONT()}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(p.name, W / 2, L.playerNameY!)
      ctx.fillStyle = '#52525b'
      ctx.font = `400 ${L.subSize}px ${FONT()}`
      ctx.fillText(subtitle, W / 2, L.seasonLabelY!)
    } else if (!L.nameAbove) {
      // Player name + subtitle (inline, multi-player cards only)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${L.nameSize}px ${FONT()}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(p.name, L.nameX, row.nameY)

      ctx.fillStyle = '#52525b'
      ctx.font = `400 ${L.subSize}px ${FONT()}`
      ctx.fillText('2026 Season', L.nameX, row.subY)
    }

    // Stat values — each column gets its own color
    const stats = [fmtAvg(p.avg), fmtAvg(p.slg), fmtAvg(p.ops), String(p.hr), String(p.rbi), String(p.k), String(p.bb), p.ev]
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${L.statSize}px ${FONT()}`
    for (let j = 0; j < stats.length; j++) {
      ctx.fillStyle = STAT_COLORS[j]
      ctx.fillText(stats[j], colCenters[j], row.centerY)
    }
  }

  // Watermark
  ctx.fillStyle = '#3f3f46'
  ctx.font = `400 16px ${FONT()}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Data: Statcast via Triton Apex  •  tritonapex.io', W / 2, L.soloCenter ? 1050 : H - 20)

  const outPath = path.join(OUTPUT_DIR, filename)
  const png = canvas.toBuffer('image/png')
  fs.writeFileSync(outPath, png)
  console.log(`  -> ${filename} (${Math.round(png.length / 1024)}KB)`)
}

async function main() {
  await ensureFont()

  const csv = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n')
  const header = csv[0].split(',')
  const rows = csv.slice(1).map(line => {
    const vals = line.split(',')
    const obj: Record<string, string> = {}
    header.forEach((h, i) => obj[h] = vals[i])
    return obj
  })

  function toPlayer(row: Record<string, string>): PlayerStats {
    const name = row['Player']
    return {
      name, playerId: PLAYER_IDS[name] || 0,
      avg: row['AVG'], slg: row['SLG'], ops: row['OPS'],
      hr: parseInt(row['HR']) || 0, rbi: RBIS[name] || 0,
      k: parseInt(row['K']) || 0, bb: parseInt(row['BB']) || 0, ev: row['EV'] || '0.0',
    }
  }

  console.log('Rendering Bo Bichette...')
  await renderGraphic('BO BICHETTE', 'Regular Season  •  2026 Season Check In',
    [toPlayer(rows[0])], 'bichette_checkin.png')

  console.log('Rendering Mariners...')
  await renderGraphic('SEATTLE MARINERS', 'Regular Season  •  2026 Season Check In',
    [toPlayer(rows[1]), toPlayer(rows[2]), toPlayer(rows[3]), toPlayer(rows[4])], 'mariners_checkin.png')

  console.log('Rendering rookies...')
  await renderGraphic('ROOKIE CHECK IN', 'Regular Season  •  2026 Season Check In',
    [toPlayer(rows[5]), toPlayer(rows[6]), toPlayer(rows[7]), toPlayer(rows[8]), toPlayer(rows[9])], 'rookies_checkin.png')

  console.log('Rendering Mike Trout...')
  await renderGraphic('MIKE TROUT', 'Regular Season  •  2026 Season Check In',
    [toPlayer(rows[10])], 'trout_checkin.png')

  // Mike Trout last 162 games (2024-04-01 → 2026-03-31)
  console.log('Rendering Mike Trout last 162 games...')
  await renderGraphic('MIKE TROUT', 'Last 162 Games  •  Regular Season',
    [{
      name: 'Mike Trout', playerId: 545361,
      avg: '0.232', slg: '0.461', ops: '0.811',
      hr: 37, rbi: 80, k: 206, bb: 112, ev: '82.8',
    }], 'trout_last162_checkin.png')

  console.log('Done!')
}

main().catch(e => { console.error(e); process.exit(1) })
