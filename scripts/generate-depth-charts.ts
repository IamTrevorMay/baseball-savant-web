/**
 * Generate PNG depth chart images for all 30 MLB teams.
 * Uses the "Starting Rotation Depth Chart" custom template + @napi-rs/canvas.
 *
 * Usage: npx tsx scripts/generate-depth-charts.ts
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from '@napi-rs/canvas'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Config ──────────────────────────────────────────────────────────────────

const TEMPLATE_ID = '3c0c5fcb-b809-49c0-a88f-ccbe61eab605'
const OUTPUT_DIR = '/Users/trevor/Desktop/2026 MLB Depth Charts'
// Data pre-converted from .numbers to JSON via Python

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

interface SceneElement {
  id: string; type: string; x: number; y: number
  width: number; height: number; zIndex: number
  opacity?: number; rotation?: number
  props: Record<string, any>
  binding?: { field: string }
}

interface Scene {
  width: number; height: number; background: string
  elements: SceneElement[]
}

interface TeamData {
  abbrev: string
  teamName: string
  rotation: { name: string; playerId: number | null }[]
  depth: { name: string; playerId: number | null }[]
}

// ── Parse pre-converted JSON data ───────────────────────────────────────────

const DEPTH_JSON = '/tmp/depth_chart_data.json'

function parseDepthData(): Record<string, { rotation: string[]; depth: string[] }> {
  const raw = fs.readFileSync(DEPTH_JSON, 'utf8')
  return JSON.parse(raw)
}

// ── Resolve player names to IDs ─────────────────────────────────────────────

async function resolvePlayerIds(names: string[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>()
  if (names.length === 0) return result

  // Fetch all players from DB (paginated to get all)
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
  const data = allPlayers

  if (!data.length) return result

  // Strip accents for fuzzy matching
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Build lookup: normalize name -> id
  const lookup = new Map<string, number>()
  for (const p of data) {
    // DB format is "Last, First"
    lookup.set(normalize(p.name), p.id)
    // Also store "First Last" form
    const parts = p.name.split(', ')
    if (parts.length === 2) {
      lookup.set(normalize(`${parts[1]} ${parts[0]}`), p.id)
    }
  }

  for (const name of names) {
    const key = normalize(name)
    result.set(name, lookup.get(key) ?? null)
  }

  return result
}

// ── Font setup ──────────────────────────────────────────────────────────────

let _fontFamily = 'sans-serif'

async function ensureFont(): Promise<void> {
  try {
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
  } catch {}
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

async function fetchImage(url: string): Promise<Image | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf = Buffer.from(await resp.arrayBuffer())
    return await loadImage(buf)
  } catch { return null }
}

// ── Hex color helpers ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '')
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// ── Render a single team ────────────────────────────────────────────────────

async function renderTeam(template: Scene, team: TeamData, colors: { primary: string; secondary: string }): Promise<Buffer> {
  const canvas = createCanvas(template.width, template.height)
  const ctx = canvas.getContext('2d')

  // Background: dark version of team primary
  const [pr, pg, pb] = hexToRgb(colors.primary)
  ctx.fillStyle = `rgb(${Math.round(pr * 0.12)},${Math.round(pg * 0.12)},${Math.round(pb * 0.12)})`
  ctx.fillRect(0, 0, template.width, template.height)

  // Subtle gradient overlay with team color
  const grad = ctx.createLinearGradient(0, 0, 0, template.height)
  grad.addColorStop(0, `rgba(${pr},${pg},${pb},0.15)`)
  grad.addColorStop(0.5, `rgba(${pr},${pg},${pb},0.05)`)
  grad.addColorStop(1, `rgba(${pr},${pg},${pb},0.12)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, template.width, template.height)

  // Accent line at top
  ctx.fillStyle = colors.primary
  ctx.fillRect(0, 0, template.width, 4)

  // Sort elements by zIndex
  const sorted = [...template.elements].sort((a, b) => a.zIndex - b.zIndex)

  // Resolve bindings
  function resolveBinding(field: string): any {
    // teamName
    if (field === 'teamName') return team.teamName
    // rotation[N].playerName / rotation[N].playerImage
    const rotMatch = field.match(/^rotation\[(\d+)\]\.(\w+)$/)
    if (rotMatch) {
      const idx = parseInt(rotMatch[1])
      const prop = rotMatch[2]
      const pitcher = team.rotation[idx]
      if (!pitcher) return null
      if (prop === 'playerName') return pitcher.name
      if (prop === 'playerImage') return pitcher.playerId
    }
    // depth[N].playerName / depth[N].playerImage
    const depthMatch = field.match(/^depth\[(\d+)\]\.(\w+)$/)
    if (depthMatch) {
      const idx = parseInt(depthMatch[1])
      const prop = depthMatch[2]
      const pitcher = team.depth[idx]
      if (!pitcher) return null
      if (prop === 'playerName') return pitcher.name
      if (prop === 'playerImage') return pitcher.playerId
    }
    return null
  }

  for (const el of sorted) {
    ctx.save()
    ctx.globalAlpha = el.opacity ?? 1

    if (el.rotation) {
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(el.x + el.width / 2), -(el.y + el.height / 2))
    }

    const bindingField = el.binding?.field
    const boundValue = bindingField ? resolveBinding(bindingField) : null

    switch (el.type) {
      case 'text': {
        const p = el.props

        // Determine text to show
        let text = p.text || ''
        if (bindingField === 'teamName' && boundValue) {
          text = String(boundValue)
        } else if (bindingField?.includes('playerName') && boundValue) {
          text = String(boundValue)
        }

        // Apply team theme colors
        let color = p.color || '#ffffff'
        if (bindingField === 'teamName') {
          color = '#ffffff'  // Keep team name white
        } else if (p.color === '#10b981') {
          // Replace emerald accent with team primary
          color = colors.primary
        } else if (p.bgColor && p.bgColor.includes('16,185,129')) {
          // SP1-SP5 labels with emerald bg → team color bg
          color = colors.primary
        }

        // Background for SP labels
        if (p.bgColor && p.bgColor !== 'transparent') {
          let bgColor = p.bgColor
          if (p.bgColor.includes('16,185,129')) {
            // Replace emerald tint with team color tint
            bgColor = `rgba(${pr},${pg},${pb},0.15)`
          }
          ctx.fillStyle = bgColor
          const rad = p.borderRadius ?? 0
          roundRect(ctx, el.x, el.y, el.width, el.height, rad)
          ctx.fill()
        }

        // Text shadow
        if (p.textShadowBlur > 0) {
          ctx.shadowColor = p.textShadowColor || '#000000'
          ctx.shadowBlur = p.textShadowBlur
          ctx.shadowOffsetX = p.textShadowOffsetX || 0
          ctx.shadowOffsetY = p.textShadowOffsetY || 0
        }

        const weight = p.fontWeight || 400
        const size = p.fontSize || 16
        ctx.font = `${weight} ${size}px ${FONT()}`
        ctx.fillStyle = color

        let transform = p.textTransform || 'none'
        if (transform === 'uppercase') text = text.toUpperCase()

        const letterSpacing = p.letterSpacing || 0
        ctx.textBaseline = 'middle'

        let tx = el.x
        if (p.textAlign === 'center') { tx = el.x + el.width / 2; ctx.textAlign = 'center' }
        else if (p.textAlign === 'right') { tx = el.x + el.width; ctx.textAlign = 'right' }
        else { ctx.textAlign = 'left' }

        if (letterSpacing > 0) {
          ctx.letterSpacing = `${letterSpacing}px`
        }

        ctx.fillText(text, tx, el.y + el.height / 2)
        break
      }

      case 'player-image': {
        const p = el.props
        const playerId = boundValue
        const imgH = p.showLabel && p.playerName ? el.height - 28 : el.height
        const radius = p.borderRadius ?? 12

        // Border with team color
        ctx.strokeStyle = colors.primary
        ctx.lineWidth = 2
        roundRect(ctx, el.x, el.y, el.width, imgH, radius)
        ctx.stroke()

        if (playerId) {
          const imgUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
          const img = await fetchImage(imgUrl)
          if (img) {
            ctx.save()
            roundRect(ctx, el.x + 1, el.y + 1, el.width - 2, imgH - 2, Math.max(0, radius - 1))
            ctx.clip()
            const imgRatio = img.width / img.height
            const boxRatio = el.width / imgH
            let sx = 0, sy = 0, sw = img.width, sh = img.height
            if (imgRatio > boxRatio) { sw = img.height * boxRatio; sx = (img.width - sw) / 2 }
            else { sh = img.width / boxRatio; sy = (img.height - sh) / 2 }
            ctx.drawImage(img, sx, sy, sw, sh, el.x, el.y, el.width, imgH)
            ctx.restore()
          } else {
            ctx.fillStyle = '#27272a'
            roundRect(ctx, el.x + 1, el.y + 1, el.width - 2, imgH - 2, Math.max(0, radius - 1))
            ctx.fill()
          }
        } else {
          // Empty slot
          ctx.fillStyle = '#18181b'
          roundRect(ctx, el.x + 1, el.y + 1, el.width - 2, imgH - 2, Math.max(0, radius - 1))
          ctx.fill()
          ctx.fillStyle = '#3f3f46'
          ctx.font = `400 32px ${FONT()}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('?', el.x + el.width / 2, el.y + imgH / 2)
        }
        break
      }

      default:
        break
    }

    ctx.restore()
  }

  // Watermark
  ctx.save()
  ctx.font = `500 14px ${FONT()}`
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('tritontools.io', template.width - 20, template.height - 12)
  ctx.restore()

  return canvas.toBuffer('image/png')
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading font...')
  await ensureFont()

  console.log('Fetching template...')
  const { data: templateData, error } = await supabase
    .from('custom_templates')
    .select('*')
    .eq('id', TEMPLATE_ID)
    .single()

  if (error || !templateData) {
    console.error('Failed to fetch template:', error?.message)
    process.exit(1)
  }

  const template: Scene = {
    width: templateData.width,
    height: templateData.height,
    background: templateData.background,
    elements: templateData.elements || [],
  }

  console.log(`Template: ${templateData.name} (${template.width}x${template.height}, ${template.elements.length} elements)`)

  console.log('Parsing depth chart data...')
  const depthData = parseDepthData()
  const teamAbbrevs = Object.keys(depthData).filter(k => k && TEAMS[k])
  console.log(`Found ${teamAbbrevs.length} teams`)

  // Collect all player names for bulk ID lookup
  const allNames: string[] = []
  for (const abbrev of teamAbbrevs) {
    const td = depthData[abbrev]
    allNames.push(...td.rotation, ...td.depth)
  }
  const uniqueNames = [...new Set(allNames)]
  console.log(`Resolving ${uniqueNames.length} player IDs...`)
  const playerIds = await resolvePlayerIds(uniqueNames)

  // Count resolved
  const resolved = [...playerIds.values()].filter(Boolean).length
  console.log(`Resolved ${resolved}/${uniqueNames.length} players`)

  // Generate for each team
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const abbrev of teamAbbrevs) {
    const td = depthData[abbrev]
    const colors = TEAMS[abbrev]

    const teamData: TeamData = {
      abbrev,
      teamName: colors.name,
      rotation: td.rotation.slice(0, 5).map(name => ({
        name,
        playerId: playerIds.get(name) ?? null,
      })),
      depth: td.depth.slice(0, 3).map(name => ({
        name,
        playerId: playerIds.get(name) ?? null,
      })),
    }

    process.stdout.write(`  ${abbrev} (${colors.name})...`)
    const png = await renderTeam(template, teamData, colors)
    const outPath = path.join(OUTPUT_DIR, `${abbrev}_depth_chart.png`)
    fs.writeFileSync(outPath, png)
    console.log(` done (${Math.round(png.length / 1024)}KB)`)
  }

  console.log(`\nAll ${teamAbbrevs.length} depth charts saved to: ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
