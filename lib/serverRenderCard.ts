/**
 * Server-side card PNG renderer using @napi-rs/canvas.
 * Handles the element types used in the Test Starter Card template:
 *   player-image, rc-table, rc-stat-box, rc-bar-chart, rc-donut-chart, rc-movement-plot
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Canvas, type Image } from '@napi-rs/canvas'

// ── Types ───────────────────────────────────────────────────────────────────

interface SceneElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  opacity?: number
  rotation?: number
  props: Record<string, any>
  reportCardBinding?: Record<string, any>
}

interface Scene {
  id: string
  name: string
  width: number
  height: number
  background: string
  elements: SceneElement[]
}

// ── Font setup ──────────────────────────────────────────────────────────────

let _fontReady = false

async function ensureFont(): Promise<void> {
  if (_fontReady) return
  try {
    // Download Inter Regular + Bold from Google Fonts
    const weights = [
      { weight: '400', url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa2JL7W0Q5nw.woff2' },
      { weight: '600', url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa25L7W0Q5nw.woff2' },
      { weight: '700', url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa2JL7W0Q5nw.woff2' },
    ]
    for (const { url } of weights) {
      try {
        const resp = await fetch(url)
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer())
          GlobalFonts.register(buf, 'Inter')
        }
      } catch { /* skip */ }
    }
  } catch { /* fallback to system fonts */ }
  _fontReady = true
}

const FONT = 'Inter, sans-serif'

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
  } catch {
    return null
  }
}

// ── Pitch type colors ───────────────────────────────────────────────────────

const PITCH_COLORS: Record<string, string> = {
  '4-Seam Fastball': '#ef4444',
  'Fastball': '#ef4444',
  'Sinker': '#f97316',
  'Cutter': '#eab308',
  'Changeup': '#22c55e',
  'Split-Finger': '#14b8a6',
  'Splitter': '#14b8a6',
  'Slider': '#8b5cf6',
  'Sweeper': '#a855f7',
  'Curveball': '#3b82f6',
  'Knuckle Curve': '#60a5fa',
  'Slurve': '#818cf8',
  'Screwball': '#10b981',
  'Knuckleball': '#d946ef',
}

function pitchColor(name: string): string {
  return PITCH_COLORS[name] || '#a1a1aa'
}

// ── Element renderers ───────────────────────────────────────────────────────

async function drawPlayerImage(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const imgH = p.showLabel && p.playerName ? h - 28 : h
  const radius = p.borderRadius ?? 12

  ctx.save()

  // Border
  if (p.borderWidth > 0) {
    ctx.strokeStyle = p.borderColor || '#ffffff'
    ctx.lineWidth = p.borderWidth
    roundRect(ctx, x, y, w, imgH, radius)
    ctx.stroke()
  }

  // Image
  if (p.playerId) {
    const imgUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
    const img = await fetchImage(imgUrl)
    if (img) {
      ctx.save()
      roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, Math.max(0, radius - 1))
      ctx.clip()
      // Cover fit
      const imgRatio = img.width / img.height
      const boxRatio = w / imgH
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (imgRatio > boxRatio) {
        sw = img.height * boxRatio
        sx = (img.width - sw) / 2
      } else {
        sh = img.width / boxRatio
        sy = (img.height - sh) / 2
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, imgH)
      ctx.restore()
    } else {
      ctx.fillStyle = '#27272a'
      roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, Math.max(0, radius - 1))
      ctx.fill()
    }
  }

  // Name label
  if (p.showLabel && p.playerName) {
    ctx.font = `500 13px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.playerName, x + w / 2, y + imgH + 14)
  }

  ctx.restore()
}

function drawRCStatBox(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const radius = p.borderRadius ?? 12
  const color = p.color || '#06b6d4'
  const pad = 16

  ctx.save()
  ctx.fillStyle = p.bgColor || 'rgba(255,255,255,0.04)'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()
  // Accent bar
  ctx.fillStyle = color
  ctx.fillRect(x, y + 10, 3, h - 20)

  const labelSize = Math.max(10, (p.fontSize || 44) * 0.28)
  ctx.font = `600 ${labelSize}px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText((p.label || 'Stat').toUpperCase(), x + pad, y + pad)

  ctx.font = `bold ${p.fontSize || 44}px ${FONT}`
  ctx.fillStyle = color
  ctx.fillText(String(p.value ?? '--'), x + pad, y + pad + labelSize + 4)
  ctx.restore()
}

function drawRCTable(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const cols: { key: string; label: string }[] = p.columns || []
  const rows: Record<string, any>[] = p.rows || []
  const fontSize = p.fontSize || 13
  const headerFontSize = p.headerFontSize || 11
  const radius = p.borderRadius ?? 12

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  if (cols.length === 0) { ctx.restore(); return }

  const colW = w / cols.length
  const rowH = Math.min(28, (h - 30) / Math.max(rows.length, 1))
  const headerY = y + 8

  // Header
  ctx.font = `600 ${headerFontSize}px ${FONT}`
  ctx.fillStyle = p.headerColor || '#a1a1aa'
  ctx.textBaseline = 'top'
  for (let i = 0; i < cols.length; i++) {
    ctx.textAlign = 'left'
    ctx.fillText(cols[i].label, x + i * colW + 10, headerY)
  }

  // Separator
  ctx.strokeStyle = '#27272a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + 8, headerY + headerFontSize + 6)
  ctx.lineTo(x + w - 8, headerY + headerFontSize + 6)
  ctx.stroke()

  // Rows
  const startY = headerY + headerFontSize + 12
  ctx.font = `400 ${fontSize}px ${FONT}`

  for (let r = 0; r < rows.length; r++) {
    const ry = startY + r * rowH
    if (ry + rowH > y + h) break
    for (let c = 0; c < cols.length; c++) {
      const val = rows[r][cols[c].key] ?? '--'
      ctx.fillStyle = cols[c].key === 'pitch_name' ? (rows[r]._color || '#e4e4e7') : '#e4e4e7'
      ctx.textAlign = 'left'
      ctx.fillText(String(val), x + c * colW + 10, ry)
    }
  }
  ctx.restore()
}

function drawRCBarChart(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const barData: { label: string; value: number; color?: string }[] = p.barData || []
  const fontSize = p.fontSize || 12
  const radius = p.borderRadius ?? 12

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  if (barData.length === 0) { ctx.restore(); return }

  const maxVal = Math.max(...barData.map(d => d.value), 1)
  const pad = { top: 15, right: 15, bottom: 15, left: 80 }
  const plotW = w - pad.left - pad.right
  const barH = Math.min(26, (h - pad.top - pad.bottom - (barData.length - 1) * 6) / barData.length)
  const totalH = barData.length * barH + (barData.length - 1) * 6
  const startY = y + pad.top + ((h - pad.top - pad.bottom) - totalH) / 2

  for (let i = 0; i < barData.length; i++) {
    const d = barData[i]
    const by = startY + i * (barH + 6)
    const bw = (d.value / maxVal) * plotW

    ctx.fillStyle = '#a1a1aa'
    ctx.font = `500 ${fontSize}px ${FONT}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(d.label, x + pad.left - 8, by + barH / 2)

    ctx.fillStyle = '#27272a'
    roundRect(ctx, x + pad.left, by, plotW, barH, 4)
    ctx.fill()

    ctx.fillStyle = d.color || '#06b6d4'
    roundRect(ctx, x + pad.left, by, Math.max(bw, 4), barH, 4)
    ctx.fill()

    if (p.showValues !== false) {
      ctx.fillStyle = '#e4e4e7'
      ctx.font = `600 ${fontSize}px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(d.value % 1 ? d.value.toFixed(1) : String(d.value), x + pad.left + Math.max(bw, 4) + 6, by + barH / 2)
    }
  }
  ctx.restore()
}

function drawRCDonutChart(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const usageData: { label: string; value: number; color?: string }[] = p.usageData || []
  const innerRadiusRatio = p.innerRadius ?? 0.55
  const fontSize = p.fontSize || 12
  const radius = p.borderRadius ?? 12

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  if (usageData.length === 0) { ctx.restore(); return }

  const total = usageData.reduce((s, d) => s + d.value, 0)
  if (total === 0) { ctx.restore(); return }

  const cx = x + w / 2
  const cy = y + h / 2
  const outerR = Math.min(w, h) / 2 - 30
  const innerR = outerR * innerRadiusRatio

  let angle = -Math.PI / 2

  for (const item of usageData) {
    const sliceAngle = (item.value / total) * Math.PI * 2

    ctx.beginPath()
    ctx.arc(cx, cy, outerR, angle, angle + sliceAngle)
    ctx.arc(cx, cy, innerR, angle + sliceAngle, angle, true)
    ctx.closePath()
    ctx.fillStyle = item.color || '#06b6d4'
    ctx.fill()
    ctx.strokeStyle = p.bgColor || '#09090b'
    ctx.lineWidth = 2
    ctx.stroke()

    if (p.showLabels !== false && sliceAngle > 0.15) {
      const midAngle = angle + sliceAngle / 2
      const labelR = outerR + 16
      const lx = cx + labelR * Math.cos(midAngle)
      const ly = cy + labelR * Math.sin(midAngle)
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `500 ${fontSize}px ${FONT}`
      ctx.textAlign = midAngle > Math.PI / 2 && midAngle < 3 * Math.PI / 2 ? 'right' : 'left'
      ctx.textBaseline = 'middle'
      const pct = ((item.value / total) * 100).toFixed(0)
      ctx.fillText(`${item.label} ${pct}%`, lx, ly)
    }

    angle += sliceAngle
  }

  // Center hole
  ctx.beginPath()
  ctx.arc(cx, cy, innerR - 1, 0, Math.PI * 2)
  ctx.fillStyle = p.bgColor || '#09090b'
  ctx.fill()

  ctx.restore()
}

function drawRCMovementPlot(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const pitches: { plate_x?: number; pfx_x?: number; pfx_z?: number; pitch_name?: string; hb?: number; ivb?: number }[] = p.pitches || []
  const seasonShapes: { pitch_name: string; avg_hb: number; std_hb: number; avg_ivb: number; std_ivb: number }[] = p.seasonShapes || []
  const maxRange = p.maxRange || 24
  const dotSize = p.dotSize || 10
  const radius = p.borderRadius ?? 8

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  const pad = 35
  const plotX = x + pad
  const plotY = y + pad
  const plotW = w - pad * 2
  const plotH = h - pad * 2

  // Coordinate transform: HB on x-axis, IVB on y-axis
  const toCanvasX = (hb: number) => plotX + ((hb + maxRange) / (maxRange * 2)) * plotW
  const toCanvasY = (ivb: number) => plotY + ((maxRange - ivb) / (maxRange * 2)) * plotH

  // Grid lines
  ctx.strokeStyle = '#27272a'
  ctx.lineWidth = 1
  // Center lines
  ctx.beginPath()
  ctx.moveTo(toCanvasX(0), plotY)
  ctx.lineTo(toCanvasX(0), plotY + plotH)
  ctx.moveTo(plotX, toCanvasY(0))
  ctx.lineTo(plotX + plotW, toCanvasY(0))
  ctx.stroke()

  // Axis labels
  ctx.fillStyle = '#71717a'
  ctx.font = `500 10px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('HB (in)', x + w / 2, y + h - 14)
  ctx.save()
  ctx.translate(x + 12, y + h / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('IVB (in)', 0, 0)
  ctx.restore()

  // Tick marks
  ctx.fillStyle = '#52525b'
  ctx.font = `400 9px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let v = -20; v <= 20; v += 10) {
    if (Math.abs(v) <= maxRange) {
      ctx.fillText(String(v), toCanvasX(v), plotY + plotH + 4)
    }
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let v = -20; v <= 20; v += 10) {
    if (Math.abs(v) <= maxRange) {
      ctx.fillText(String(v), plotX - 6, toCanvasY(v))
    }
  }

  // Season shapes (ellipses)
  if (p.showSeasonShapes !== false && seasonShapes.length > 0) {
    for (const shape of seasonShapes) {
      const cx = toCanvasX(shape.avg_hb)
      const cy = toCanvasY(shape.avg_ivb)
      const rx = (shape.std_hb / (maxRange * 2)) * plotW
      const ry = (shape.std_ivb / (maxRange * 2)) * plotH
      const color = pitchColor(shape.pitch_name)

      ctx.save()
      ctx.globalAlpha = 0.2
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Individual pitch dots
  if (pitches.length > 0) {
    const dotAlpha = p.dotOpacity ?? 0.85
    for (const pitch of pitches) {
      const hb = pitch.hb ?? pitch.pfx_x ?? 0
      const ivb = pitch.ivb ?? pitch.pfx_z ?? 0
      const cx = toCanvasX(hb)
      const cy = toCanvasY(ivb)
      const color = pitchColor(pitch.pitch_name || '')

      ctx.save()
      ctx.globalAlpha = dotAlpha
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // Legend (bottom-right corner of plot)
  const uniquePitches = Array.from(new Set([
    ...seasonShapes.map(s => s.pitch_name),
    ...pitches.map(p => p.pitch_name).filter(Boolean),
  ]))
  if (uniquePitches.length > 0) {
    const legendX = plotX + plotW - 10
    let legendY = plotY + 8
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = `500 9px ${FONT}`
    for (const name of uniquePitches) {
      const color = pitchColor(name || '')
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(legendX + 2, legendY, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#a1a1aa'
      ctx.fillText(name || '', legendX - 8, legendY)
      legendY += 14
    }
  }

  ctx.restore()
}

// Universal background helper
function drawUniversalBg(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  if (p.bgColor && p.bgColor !== 'transparent') {
    const opacity = p.bgOpacity ?? 1
    if (opacity < 1) {
      const hex = p.bgColor.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16) || 0
      const g = parseInt(hex.substring(2, 4), 16) || 0
      const b = parseInt(hex.substring(4, 6), 16) || 0
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`
    } else {
      ctx.fillStyle = p.bgColor
    }
    const rad = p.borderRadius ?? 12
    roundRect(ctx, el.x, el.y, el.width, el.height, rad)
    ctx.fill()
  }
}

function drawUniversalBorder(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  if (p.borderWidth > 0) {
    ctx.strokeStyle = p.borderColor || '#06b6d4'
    ctx.lineWidth = p.borderWidth
    const r = p.borderRadius ?? 12
    roundRect(ctx, el.x, el.y, el.width, el.height, r)
    ctx.stroke()
  }
}

// ── Main render function ────────────────────────────────────────────────────

export async function renderCardToPNG(scene: Scene): Promise<Buffer> {
  await ensureFont()

  const canvas = createCanvas(scene.width, scene.height)
  const ctx = canvas.getContext('2d')

  // Background
  if (scene.background && scene.background !== 'transparent') {
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, scene.width, scene.height)
  }

  // Sort by zIndex and draw
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    if (el.type === 'group') continue

    ctx.save()
    ctx.globalAlpha = el.opacity ?? 1

    if (el.rotation) {
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(el.x + el.width / 2), -(el.y + el.height / 2))
    }

    // Shadow
    if (el.props.shadowBlur > 0) {
      ctx.shadowColor = el.props.shadowColor || '#000000'
      ctx.shadowBlur = el.props.shadowBlur
      ctx.shadowOffsetX = el.props.shadowOffsetX || 0
      ctx.shadowOffsetY = el.props.shadowOffsetY || 0
    }

    switch (el.type) {
      case 'player-image':
        await drawPlayerImage(ctx, el)
        break
      case 'rc-stat-box':
        drawRCStatBox(ctx, el)
        break
      case 'rc-table':
        drawRCTable(ctx, el)
        break
      case 'rc-bar-chart':
        drawRCBarChart(ctx, el)
        break
      case 'rc-donut-chart':
        drawRCDonutChart(ctx, el)
        break
      case 'rc-movement-plot':
        drawRCMovementPlot(ctx, el)
        break
      case 'shape':
        drawUniversalBg(ctx, el)
        break
      case 'text': {
        const p = el.props
        ctx.font = `${p.fontWeight || 400} ${p.fontSize || 16}px ${FONT}`
        ctx.fillStyle = p.color || '#ffffff'
        ctx.textBaseline = 'middle'
        let tx = el.x
        if (p.textAlign === 'center') { tx = el.x + el.width / 2; ctx.textAlign = 'center' }
        else if (p.textAlign === 'right') { tx = el.x + el.width; ctx.textAlign = 'right' }
        else { ctx.textAlign = 'left' }
        ctx.fillText(p.text || '', tx, el.y + el.height / 2)
        break
      }
      default:
        // Fallback: draw bg if present
        drawUniversalBg(ctx, el)
        break
    }

    // Reset shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

    drawUniversalBorder(ctx, el)

    ctx.restore()
  }

  return canvas.toBuffer('image/png')
}
