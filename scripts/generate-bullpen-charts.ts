/**
 * Generate PNG bullpen depth chart images for all 30 MLB teams.
 * Layout: Closer (large, centered) → Setup (2 medium) → Middle Relief (up to 5 small).
 *
 * Usage: npx tsx scripts/generate-bullpen-charts.ts
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from '@napi-rs/canvas'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Config ──────────────────────────────────────────────────────────────────

const W = 1920
const H = 1080
const OUTPUT_DIR = '/Users/trevor/Desktop/2026 MLB Depth Charts'
const BULLPEN_JSON = '/tmp/bullpen_data.json'

// ── Team colors & full names ────────────────────────────────────────────────

const TEAMS: Record<string, { name: string; primary: string; secondary: string }> = {
  ARI: { name: 'Arizona Diamondbacks', primary: '#A71930', secondary: '#E3D4AD' },
  ATL: { name: 'Atlanta Braves', primary: '#CE1141', secondary: '#13274F' },
  BAL: { name: 'Baltimore Orioles', primary: '#DF4601', secondary: '#000000' },
  BOS: { name: 'Boston Red Sox', primary: '#BD3039', secondary: '#0C2340' },
  CHC: { name: 'Chicago Cubs', primary: '#0E3386', secondary: '#CC3433' },
  CIN: { name: 'Cincinnati Reds', primary: '#C6011F', secondary: '#000000' },
  CLE: { name: 'Cleveland Guardians', primary: '#00385D', secondary: '#E50022' },
  COL: { name: 'Colorado Rockies', primary: '#33006F', secondary: '#C4CED4' },
  CWS: { name: 'Chicago White Sox', primary: '#27251F', secondary: '#C4CED4' },
  DET: { name: 'Detroit Tigers', primary: '#0C2340', secondary: '#FA4616' },
  HOU: { name: 'Houston Astros', primary: '#002D62', secondary: '#EB6E1F' },
  KC:  { name: 'Kansas City Royals', primary: '#004687', secondary: '#BD9B60' },
  LAA: { name: 'Los Angeles Angels', primary: '#BA0021', secondary: '#003263' },
  LAD: { name: 'Los Angeles Dodgers', primary: '#005A9C', secondary: '#EF3E42' },
  MIA: { name: 'Miami Marlins', primary: '#00A3E0', secondary: '#EF3340' },
  MIL: { name: 'Milwaukee Brewers', primary: '#FFC52F', secondary: '#12284B' },
  MIN: { name: 'Minnesota Twins', primary: '#002B5C', secondary: '#D31145' },
  NYM: { name: 'New York Mets', primary: '#002D72', secondary: '#FF5910' },
  NYY: { name: 'New York Yankees', primary: '#003087', secondary: '#C4CED4' },
  OAK: { name: 'Oakland Athletics', primary: '#003831', secondary: '#EFB21E' },
  PHI: { name: 'Philadelphia Phillies', primary: '#E81828', secondary: '#002D72' },
  PIT: { name: 'Pittsburgh Pirates', primary: '#27251F', secondary: '#FDB827' },
  SD:  { name: 'San Diego Padres', primary: '#2F241D', secondary: '#FFC425' },
  SEA: { name: 'Seattle Mariners', primary: '#0C2C56', secondary: '#005C5C' },
  SF:  { name: 'San Francisco Giants', primary: '#FD5A1E', secondary: '#27251F' },
  STL: { name: 'St. Louis Cardinals', primary: '#C41E3A', secondary: '#0C2340' },
  TB:  { name: 'Tampa Bay Rays', primary: '#092C5C', secondary: '#8FBCE6' },
  TEX: { name: 'Texas Rangers', primary: '#003278', secondary: '#C0111F' },
  TOR: { name: 'Toronto Blue Jays', primary: '#134A8E', secondary: '#1D2D5C' },
  WSH: { name: 'Washington Nationals', primary: '#AB0003', secondary: '#14225A' },
}

// ── Env ─────────────────────────────────────────────────────────────────────

const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/)
  if (match) process.env[match[1]] = match[2]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ───────────────────────────────────────────────────────────────────

interface PlayerSlot { name: string; playerId: number | null }

interface BullpenData {
  abbrev: string
  teamName: string
  closer: PlayerSlot | null
  setup: PlayerSlot[]
  relief: PlayerSlot[]
}

// ── Parse bullpen JSON ──────────────────────────────────────────────────────

function parseBullpenData(): Record<string, { closer: string | null; setup: string[]; relief: string[] }> {
  const raw = fs.readFileSync(BULLPEN_JSON, 'utf8')
  return JSON.parse(raw)
}

// ── Resolve player names to IDs ─────────────────────────────────────────────

async function resolvePlayerIds(names: string[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>()
  if (names.length === 0) return result

  let allPlayers: { id: number; name: string }[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('players')
      .select('id, name')
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    allPlayers = allPlayers.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const lookup = new Map<string, number>()
  for (const p of allPlayers) {
    lookup.set(normalize(p.name), p.id)
    const parts = p.name.split(', ')
    if (parts.length === 2) {
      lookup.set(normalize(`${parts[1]} ${parts[0]}`), p.id)
    }
  }

  for (const name of names) {
    result.set(name, lookup.get(normalize(name)) ?? null)
  }

  return result
}

// ── Font setup ──────────────────────────────────────────────────────────────

let _fontFamily = 'sans-serif'

async function ensureFont(): Promise<void> {
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff2',
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-600-normal.woff2',
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff2',
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-800-normal.woff2',
  ]
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer())
        GlobalFonts.register(buf, 'Inter')
        _fontFamily = 'Inter'
      }
    } catch {}
  }
}

function FONT() { return _fontFamily }

// ── Canvas helpers ──────────────────────────────────────────────────────────

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '')
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ]
}

async function fetchImage(url: string): Promise<Image | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf = Buffer.from(await resp.arrayBuffer())
    return await loadImage(buf)
  } catch { return null }
}

function headshotUrl(playerId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
}

// ── Draw a player card (image + name below) ─────────────────────────────────

async function drawPlayerCard(
  ctx: SKRSContext2D,
  slot: PlayerSlot | null,
  cx: number,   // center X
  y: number,    // top Y
  cardW: number,
  cardH: number,
  nameSize: number,
  primaryColor: string,
) {
  const x = cx - cardW / 2
  const radius = 12

  // Card border
  ctx.strokeStyle = primaryColor
  ctx.lineWidth = 2
  roundRect(ctx, x, y, cardW, cardH, radius)
  ctx.stroke()

  if (slot?.playerId) {
    const img = await fetchImage(headshotUrl(slot.playerId))
    if (img) {
      ctx.save()
      roundRect(ctx, x + 1, y + 1, cardW - 2, cardH - 2, Math.max(0, radius - 1))
      ctx.clip()
      // Cover-fit
      const imgRatio = img.width / img.height
      const boxRatio = cardW / cardH
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (imgRatio > boxRatio) { sw = img.height * boxRatio; sx = (img.width - sw) / 2 }
      else { sh = img.width / boxRatio; sy = (img.height - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, cardW, cardH)
      ctx.restore()
    } else {
      ctx.fillStyle = '#27272a'
      roundRect(ctx, x + 1, y + 1, cardW - 2, cardH - 2, Math.max(0, radius - 1))
      ctx.fill()
    }
  } else {
    // Empty slot placeholder
    ctx.fillStyle = '#18181b'
    roundRect(ctx, x + 1, y + 1, cardW - 2, cardH - 2, Math.max(0, radius - 1))
    ctx.fill()
    ctx.fillStyle = '#3f3f46'
    ctx.font = `400 32px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', cx, y + cardH / 2)
  }

  // Name below card
  if (slot?.name) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${nameSize}px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(slot.name, cx, y + cardH + 8)
  }
}

// ── Render a single team ────────────────────────────────────────────────────

async function renderTeam(team: BullpenData, colors: { primary: string; secondary: string }): Promise<Buffer> {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const [pr, pg, pb] = hexToRgb(colors.primary)

  // Background: very dark tint of team primary
  ctx.fillStyle = `rgb(${Math.round(pr * 0.12)},${Math.round(pg * 0.12)},${Math.round(pb * 0.12)})`
  ctx.fillRect(0, 0, W, H)

  // Gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, `rgba(${pr},${pg},${pb},0.15)`)
  grad.addColorStop(0.5, `rgba(${pr},${pg},${pb},0.05)`)
  grad.addColorStop(1, `rgba(${pr},${pg},${pb},0.12)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Accent line at top
  ctx.fillStyle = colors.primary
  ctx.fillRect(0, 0, W, 4)

  const centerX = W / 2

  // ── Team Name ──
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 48px ${FONT()}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.shadowColor = '#000000'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2
  ctx.fillText(team.teamName.toUpperCase(), centerX, 24)
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // ── "BULLPEN DEPTH CHART" subtitle ──
  ctx.fillStyle = colors.primary
  ctx.font = `700 18px ${FONT()}`
  ctx.letterSpacing = '3px'
  ctx.fillText('BULLPEN DEPTH CHART', centerX, 80)
  ctx.letterSpacing = '0px'

  // ── CLOSER Section ──
  const closerLabelY = 115
  ctx.fillStyle = colors.primary
  ctx.font = `700 16px ${FONT()}`
  ctx.letterSpacing = '2px'
  ctx.textAlign = 'center'
  ctx.fillText('CLOSER', centerX, closerLabelY)
  ctx.letterSpacing = '0px'

  const closerCardW = 200
  const closerCardH = 260
  const closerY = closerLabelY + 28
  await drawPlayerCard(ctx, team.closer, centerX, closerY, closerCardW, closerCardH, 18, colors.primary)

  // ── SETUP Section ──
  const setupLabelY = closerY + closerCardH + 42
  ctx.fillStyle = colors.primary
  ctx.font = `700 16px ${FONT()}`
  ctx.letterSpacing = '2px'
  ctx.textAlign = 'center'
  ctx.fillText('SETUP', centerX, setupLabelY)
  ctx.letterSpacing = '0px'

  const setupCardW = 165
  const setupCardH = 210
  const setupY = setupLabelY + 28
  const setupGap = 40
  const setupCount = Math.max(team.setup.length, 2)
  const setupTotalW = setupCount * setupCardW + (setupCount - 1) * setupGap
  const setupStartX = centerX - setupTotalW / 2 + setupCardW / 2

  for (let i = 0; i < setupCount; i++) {
    const slot = team.setup[i] || null
    const cx = setupStartX + i * (setupCardW + setupGap)
    await drawPlayerCard(ctx, slot, cx, setupY, setupCardW, setupCardH, 16, colors.primary)
  }

  // ── MIDDLE RELIEF Section ──
  const reliefLabelY = setupY + setupCardH + 42
  ctx.fillStyle = colors.primary
  ctx.font = `700 16px ${FONT()}`
  ctx.letterSpacing = '2px'
  ctx.textAlign = 'center'
  ctx.fillText('MIDDLE RELIEF', centerX, reliefLabelY)
  ctx.letterSpacing = '0px'

  const reliefCardW = 130
  const reliefCardH = 165
  const reliefY = reliefLabelY + 28
  const reliefCount = Math.max(team.relief.length, 1)
  const reliefGap = 24
  const reliefTotalW = reliefCount * reliefCardW + (reliefCount - 1) * reliefGap
  const reliefStartX = centerX - reliefTotalW / 2 + reliefCardW / 2

  for (let i = 0; i < reliefCount; i++) {
    const slot = team.relief[i] || null
    const cx = reliefStartX + i * (reliefCardW + reliefGap)
    await drawPlayerCard(ctx, slot, cx, reliefY, reliefCardW, reliefCardH, 14, colors.primary)
  }

  // ── Watermark ──
  ctx.save()
  ctx.font = `500 14px ${FONT()}`
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('tritontools.io', W - 20, H - 12)
  ctx.restore()

  return canvas.toBuffer('image/png')
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading font...')
  await ensureFont()

  console.log('Parsing bullpen data...')
  const rawData = parseBullpenData()
  const teamAbbrevs = Object.keys(rawData).filter(k => k && TEAMS[k])
  console.log(`Found ${teamAbbrevs.length} teams`)

  // Collect all player names for bulk ID lookup
  const allNames: string[] = []
  for (const abbrev of teamAbbrevs) {
    const td = rawData[abbrev]
    if (td.closer) allNames.push(td.closer)
    allNames.push(...td.setup, ...td.relief)
  }
  const uniqueNames = [...new Set(allNames)]
  console.log(`Resolving ${uniqueNames.length} player IDs...`)
  const playerIds = await resolvePlayerIds(uniqueNames)

  const resolved = [...playerIds.values()].filter(Boolean).length
  console.log(`Resolved ${resolved}/${uniqueNames.length} players`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const abbrev of teamAbbrevs) {
    const td = rawData[abbrev]
    const colors = TEAMS[abbrev]

    const toSlot = (name: string): PlayerSlot => ({
      name,
      playerId: playerIds.get(name) ?? null,
    })

    const team: BullpenData = {
      abbrev,
      teamName: colors.name,
      closer: td.closer ? toSlot(td.closer) : null,
      setup: td.setup.slice(0, 2).map(toSlot),
      relief: td.relief.slice(0, 5).map(toSlot),
    }

    process.stdout.write(`  ${abbrev} (${colors.name})...`)
    const png = await renderTeam(team, colors)
    const outPath = path.join(OUTPUT_DIR, `${abbrev}_bullpen_chart.png`)
    fs.writeFileSync(outPath, png)
    console.log(` done (${Math.round(png.length / 1024)}KB)`)
  }

  console.log(`\nAll ${teamAbbrevs.length} bullpen charts saved to: ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
