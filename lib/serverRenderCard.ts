/**
 * Server-side card PNG renderer using @napi-rs/canvas.
 * Handles the element types used in the Test Starter Card template:
 *   player-image, rc-table, rc-stat-box, rc-bar-chart, rc-donut-chart, rc-movement-plot
 */
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Canvas, type Image } from '@napi-rs/canvas'
import { getPitchColor } from '@/components/chartConfig'

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
let _fontFamily = 'sans-serif'

async function ensureFont(): Promise<void> {
  if (_fontReady) return
  try {
    // Download Inter Variable from fontsource CDN (TTF works best with @napi-rs/canvas)
    const urls = [
      'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-600-normal.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff2',
    ]
    let registered = false
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer())
          GlobalFonts.register(buf, 'Inter')
          registered = true
        }
      } catch { /* skip */ }
    }
    if (registered) {
      _fontFamily = 'Inter'
    }
  } catch { /* fallback */ }

  // Check what fonts are available
  const families = GlobalFonts.families
  if (families && families.length > 0) {
    // If Inter was registered, use it; otherwise use first available
    const hasInter = families.some((f: { family: string }) => f.family === 'Inter')
    if (hasInter) {
      _fontFamily = 'Inter'
    } else if (_fontFamily === 'sans-serif') {
      // Use first available system font
      _fontFamily = families[0].family
    }
  }
  _fontReady = true
}

function FONT(): string {
  return _fontFamily
}

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

// ── Pitch type colors (canonical source: components/chartConfig.ts) ──────
const pitchColor = getPitchColor

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
    ctx.font = `500 13px ${FONT()}`
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
  ctx.font = `600 ${labelSize}px ${FONT()}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText((p.label || 'Stat').toUpperCase(), x + pad, y + pad)

  ctx.font = `bold ${p.fontSize || 44}px ${FONT()}`
  ctx.fillStyle = color
  ctx.fillText(String(p.value ?? '--'), x + pad, y + pad + labelSize + 4)
  ctx.restore()
}

// Scene Composer "stat-card" element. Similar to rc-stat-box but supports
// transparent backgrounds, an optional sublabel, and centered "glass" variant.
function drawStatCard(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const radius = p.borderRadius ?? 12
  const color = p.color || '#06b6d4'
  const bg = p.bgColor || 'transparent'
  const pad = 14

  ctx.save()
  if (bg && bg !== 'transparent') {
    ctx.fillStyle = bg
    roundRect(ctx, x, y, w, h, radius)
    ctx.fill()
  }
  if (p.borderWidth > 0) {
    ctx.strokeStyle = p.borderColor || color
    ctx.lineWidth = p.borderWidth
    roundRect(ctx, x, y, w, h, radius)
    ctx.stroke()
  }

  const valueSize = p.fontSize || 44
  const labelSize = Math.max(10, valueSize * 0.28)
  const sublabelSize = Math.max(10, valueSize * 0.24)
  const hasSublabel = !!p.sublabel

  // Stack: label (top) → value (middle) → sublabel (bottom)
  const valueText = String(p.value ?? '--')
  const labelText = (p.label || '').toUpperCase()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  ctx.font = `600 ${labelSize}px ${FONT()}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(labelText, x + pad, y + pad)

  ctx.font = `bold ${valueSize}px ${FONT()}`
  ctx.fillStyle = color
  ctx.fillText(valueText, x + pad, y + pad + labelSize + 4)

  if (hasSublabel) {
    ctx.font = `400 ${sublabelSize}px ${FONT()}`
    ctx.fillStyle = '#71717a'
    ctx.fillText(String(p.sublabel), x + pad, y + pad + labelSize + 4 + valueSize + 4)
  }

  ctx.restore()
}

function drawRCTable(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const cols: { key: string; label: string }[] = p.columns || []
  const rows: Record<string, any>[] = p.rows || []
  const fontSize = p.fontSize || 16
  const headerFontSize = p.headerFontSize || 13
  const radius = p.borderRadius ?? 12
  const title = p.title || ''

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  let titleOffset = 0
  if (title) {
    titleOffset = 22
    ctx.fillStyle = p.headerColor || '#a1a1aa'
    ctx.font = `600 ${Math.max(10, headerFontSize + 1)}px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title, x + w / 2, y + 6)
  }

  if (cols.length === 0) { ctx.restore(); return }

  const colW = w / cols.length
  const headerH = headerFontSize + 16 + 1
  const headerY = y + titleOffset
  const availableH = h - titleOffset - headerH
  const rowCount = Math.max(rows.length, 1)
  const rowH = Math.max(0, availableH / rowCount)

  // Header
  ctx.font = `600 ${headerFontSize}px ${FONT()}`
  ctx.fillStyle = p.headerColor || '#a1a1aa'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < cols.length; i++) {
    ctx.textAlign = 'left'
    ctx.fillText(cols[i].label, x + i * colW + 10, headerY + headerH / 2)
  }

  // Separator
  ctx.strokeStyle = '#27272a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + 8, headerY + headerH)
  ctx.lineTo(x + w - 8, headerY + headerH)
  ctx.stroke()

  // Rows
  const startY = headerY + headerH
  ctx.font = `400 ${fontSize}px ${FONT()}`

  const truncate = (text: string, maxW: number) => {
    if (ctx.measureText(text).width <= maxW) return text
    let t = text
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  for (let r = 0; r < rows.length; r++) {
    const ry = startY + r * rowH
    if (ry + rowH > y + h) break
    for (let c = 0; c < cols.length; c++) {
      const val = String(rows[r][cols[c].key] ?? '--')
      ctx.fillStyle = cols[c].key === 'pitch_name' ? (rows[r]._color || '#e4e4e7') : '#e4e4e7'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(truncate(val, colW - 14), x + c * colW + 10, ry + rowH / 2)
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
  const title = p.title || ''

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  let titleOffset = 0
  if (title) {
    titleOffset = 28
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `600 ${Math.max(10, fontSize)}px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title, x + w / 2, y + 8)
  }

  if (barData.length === 0) { ctx.restore(); return }

  const maxVal = Math.max(...barData.map(d => d.value), 1)
  const pad = { top: 15 + titleOffset, right: 15, bottom: 15, left: 80 }
  const plotW = w - pad.left - pad.right
  const plotH = h - pad.top - pad.bottom
  const gap = 6
  const barH = (plotH - (barData.length - 1) * gap) / barData.length
  const startY = y + pad.top

  for (let i = 0; i < barData.length; i++) {
    const d = barData[i]
    const by = startY + i * (barH + gap)
    const bw = (d.value / maxVal) * plotW

    ctx.fillStyle = '#a1a1aa'
    ctx.font = `500 ${fontSize}px ${FONT()}`
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
      ctx.font = `600 ${fontSize}px ${FONT()}`
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
  const title = p.title || ''

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  let titleOffset = 0
  if (title) {
    titleOffset = 24
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `600 ${Math.max(10, fontSize)}px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title, x + w / 2, y + 6)
  }

  if (usageData.length === 0) { ctx.restore(); return }

  const total = usageData.reduce((s, d) => s + d.value, 0)
  if (total === 0) { ctx.restore(); return }

  const cx = x + w / 2
  const cy = y + (h + titleOffset) / 2
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
      ctx.font = `500 ${fontSize}px ${FONT()}`
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
  ctx.font = `500 10px ${FONT()}`
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
  ctx.font = `400 9px ${FONT()}`
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
    ctx.font = `500 9px ${FONT()}`
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

function drawRCStatline(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const statline = p.statline || { ip: '?', h: 0, r: 0, k: 0, bb: 0, decision: 'ND', era: '--' }
  const fontSize = p.fontSize || 22
  const color = p.color || '#ffffff'
  const headerColor = p.headerColor || '#a1a1aa'
  const radius = p.borderRadius ?? 8
  const title = p.title || ''

  ctx.save()
  ctx.fillStyle = p.bgColor || 'rgba(255,255,255,0.04)'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()

  const labels = ['IP', 'H', 'R', 'SO', 'BB', 'W/L', 'ERA']
  const values = [statline.ip, String(statline.h), String(statline.r), String(statline.k), String(statline.bb), statline.decision, statline.era]
  const cellW = w / labels.length

  let contentY = y
  let contentH = h

  if (title) {
    const titleSize = Math.max(9, fontSize * 0.55)
    ctx.font = `600 ${titleSize}px ${FONT()}`
    ctx.fillStyle = headerColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title.toUpperCase(), x + w / 2, y + 4)
    contentY = y + titleSize + 8
    contentH = h - titleSize - 8
  }

  const labelSize = Math.max(8, fontSize * 0.55)
  const midY = contentY + contentH / 2

  for (let i = 0; i < labels.length; i++) {
    const cx = x + i * cellW + cellW / 2

    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + i * cellW, contentY + 6)
      ctx.lineTo(x + i * cellW, contentY + contentH - 6)
      ctx.stroke()
    }

    ctx.font = `500 ${labelSize}px ${FONT()}`
    ctx.fillStyle = headerColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(labels[i], cx, midY - 2)

    const maxValFont = Math.min(fontSize, cellW * 0.55)
    ctx.font = `700 ${maxValFont}px ${FONT()}`
    ctx.fillStyle = color
    ctx.textBaseline = 'top'
    ctx.fillText(values[i], cx, midY + 2)
  }

  ctx.restore()
}

/* ── Heatmap helpers (shared by both legacy count mode and spectrum mode) ── */

// Rainbow spectrum — matches components/reports/TileViz.tsx so Imagine
// output reads identically to the Reports page heatmap.
const HEATMAP_SPECTRUM_RAINBOW: [number, [number, number, number]][] = [
  [0.00, [0x1a, 0x3d, 0x7c]], [0.05, [0x21, 0x66, 0xac]],
  [0.15, [0x33, 0x88, 0xb8]], [0.25, [0x4b, 0xa8, 0xc4]],
  [0.35, [0x6c, 0xc4, 0xa0]], [0.45, [0xc8, 0xe6, 0x4a]],
  [0.55, [0xf0, 0xe8, 0x30]], [0.65, [0xf5, 0xa0, 0x20]],
  [0.75, [0xe0, 0x60, 0x10]], [0.85, [0xc4, 0x2a, 0x0c]],
  [0.92, [0x9e, 0x00, 0x00]], [1.00, [0x7a, 0x00, 0x00]],
]

// Diverging palette — deep blue at low, mid gray at the middle, deep red
// at high. Endpoints match the rainbow palette so the legend bar reads
// the same at both ends across modes.
const HEATMAP_SPECTRUM_HOTCOLD: [number, [number, number, number]][] = [
  [0.00, [0x1a, 0x3d, 0x7c]],
  [0.20, [0x4b, 0x80, 0xb4]],
  [0.38, [0x9c, 0xae, 0xbe]],
  [0.50, [0x6b, 0x6b, 0x73]],
  [0.62, [0xbe, 0xa6, 0xa6]],
  [0.80, [0xc4, 0x4a, 0x2a]],
  [1.00, [0x7a, 0x00, 0x00]],
]

type HeatmapColorMode = 'rainbow' | 'hotcold'

function getSpectrum(mode: HeatmapColorMode): [number, [number, number, number]][] {
  return mode === 'hotcold' ? HEATMAP_SPECTRUM_HOTCOLD : HEATMAP_SPECTRUM_RAINBOW
}

function sampleSpectrumRGB(t: number, mode: HeatmapColorMode = 'rainbow'): [number, number, number] {
  const stops = getSpectrum(mode)
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    const [s1, c1] = stops[i]
    if (x <= s1) {
      const [s0, c0] = stops[i - 1]
      const k = (x - s0) / (s1 - s0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ]
    }
  }
  const [, last] = stops[stops.length - 1]
  return last
}

function spectrumColor(t: number, mode: HeatmapColorMode = 'rainbow'): string {
  const [r, g, b] = sampleSpectrumRGB(t, mode)
  return `rgb(${r},${g},${b})`
}

const HM_HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const HM_NON_AB_EVENTS = new Set(['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'catcher_interf'])

function calcHeatmapMetric(pitches: any[], metric: string): number | null {
  if (!pitches.length) return null
  const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  const isSwing = (d: string) => d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
  switch (metric) {
    case 'frequency': return pitches.length
    case 'ba': {
      const ab = pitches.filter(p => p.events && !HM_NON_AB_EVENTS.has(p.events))
      const h = ab.filter(p => HM_HIT_EVENTS.has(p.events))
      return ab.length ? h.length / ab.length : null
    }
    case 'slg': {
      const ab = pitches.filter(p => p.events && !HM_NON_AB_EVENTS.has(p.events))
      if (!ab.length) return null
      const tb = ab.reduce((s, p) => s + (p.events === 'single' ? 1 : p.events === 'double' ? 2 : p.events === 'triple' ? 3 : p.events === 'home_run' ? 4 : 0), 0)
      return tb / ab.length
    }
    case 'woba': return avg(pitches.map(p => p.woba_value).filter((x: any) => x != null))
    case 'xba': return avg(pitches.map(p => p.estimated_ba_using_speedangle).filter((x: any) => x != null))
    case 'xwoba': return avg(pitches.map(p => p.estimated_woba_using_speedangle).filter((x: any) => x != null))
    case 'xslg': return avg(pitches.map(p => p.estimated_slg_using_speedangle).filter((x: any) => x != null))
    case 'ev': return avg(pitches.map(p => p.launch_speed).filter((x: any) => x != null))
    case 'whiff_pct': {
      const sw = pitches.filter(p => isSwing(((p.description || '') as string).toLowerCase()))
      const wh = pitches.filter(p => ((p.description || '') as string).toLowerCase().includes('swinging_strike'))
      return sw.length ? wh.length / sw.length : null
    }
    case 'chase_pct': {
      const oz = pitches.filter(p => p.zone > 9)
      const sw = oz.filter(p => {
        const s = ((p.description || '') as string).toLowerCase()
        return s.includes('swinging_strike') || s.includes('foul') || s.includes('hit_into_play')
      })
      return oz.length ? sw.length / oz.length : null
    }
    default: return null
  }
}

function fmtHeatmapValue(v: number, metric: string): string {
  if (metric === 'frequency') return String(Math.round(v))
  if (['ba', 'slg', 'woba', 'xba', 'xwoba', 'xslg'].includes(metric)) {
    // Baseball convention: ".300" rather than "0.300" when |v| < 1.
    if (Math.abs(v) >= 1) return v.toFixed(3)
    const sign = v < 0 ? '-' : ''
    const abs = Math.abs(v)
    return `${sign}.${Math.round(abs * 1000).toString().padStart(3, '0')}`
  }
  if (metric === 'ev') return `${v.toFixed(1)} mph`
  if (metric === 'whiff_pct' || metric === 'chase_pct') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(2)
}

function drawHeatmapLegend(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number,
  zMin: number, zMax: number, metric: string,
  colorMode: HeatmapColorMode = 'rainbow',
) {
  const labelW = 56
  const barX = x + labelW
  const barW = Math.max(20, w - labelW * 2)
  const barH = Math.min(h - 4, 8)
  const barY = y + (h - barH) / 2

  // Color bar
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
  for (const [stop, [r, g, b]] of getSpectrum(colorMode)) {
    grad.addColorStop(stop, `rgb(${r},${g},${b})`)
  }
  ctx.fillStyle = grad
  roundRect(ctx, barX, barY, barW, barH, barH / 2)
  ctx.fill()

  // Min / max labels
  ctx.fillStyle = '#a1a1aa'
  ctx.font = `400 10px ${FONT()}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillText(fmtHeatmapValue(zMin, metric), barX - 6, y + h / 2)
  ctx.textAlign = 'left'
  ctx.fillText(fmtHeatmapValue(zMax, metric), barX + barW + 6, y + h / 2)
}

function drawRCHeatmap(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x: ex, y: ey, width: w, height: h } = el
  const locations: any[] = p.locations || []
  const radius = p.borderRadius ?? 8
  const title = p.title || ''
  // metric:
  //   'count' (or undefined)  → legacy 5×5 cell-count rendering (preserves
  //                              existing report-card usages).
  //   'frequency' | 'ba' | 'slg' | 'woba' | 'xba' | 'xwoba' | 'xslg' |
  //   'ev' | 'whiff_pct' | 'chase_pct'  → 16×16 spectrum heatmap, neighbor-
  //                              interpolated, optional bottom legend.
  const metric: string = p.metric || 'count'
  // colorMode: 'rainbow' (default) or 'hotcold' (diverging blue→gray→red).
  const colorMode: HeatmapColorMode = p.colorMode === 'hotcold' ? 'hotcold' : 'rainbow'

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, ex, ey, w, h, radius)
  ctx.fill()

  let titleOffset = 0
  if (title) {
    titleOffset = 24
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `600 12px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title, ex + w / 2, ey + 6)
  }

  if (metric === 'count') {
    drawRCHeatmapLegacy(ctx, el, ex, ey, w, h, locations, titleOffset)
    ctx.restore()
    return
  }

  // Spectrum mode — 16×16 with neighbor interpolation.
  const showLegend = p.showLegend !== false
  const legendH = showLegend ? 22 : 0
  const pad = 16
  const availX = ex + pad
  const availY = ey + pad + titleOffset
  const availW = w - pad * 2
  const availH = h - pad * 2 - titleOffset - legendH

  // Plot bounds (feet): width = 3.52, height = 3.82 → natural aspect ~0.921.
  // We constrain the plot rect to that aspect inside the available area
  // and center it, so the strike zone never looks stretched. Mirrors the
  // Plotly `scaleanchor:'x'` behavior on the Reports page.
  const VXM = -1.76, VXX = 1.76, VZM = 0.24, VZX = 4.06
  const PLOT_ASPECT = (VXX - VXM) / (VZX - VZM)
  let plotW = availW
  let plotH = plotW / PLOT_ASPECT
  if (plotH > availH) {
    plotH = availH
    plotW = plotH * PLOT_ASPECT
  }
  const plotX = availX + (availW - plotW) / 2
  const plotY = availY + (availH - plotH) / 2

  const nb = 16
  const xS = (VXX - VXM) / nb
  const yS = (VZX - VZM) / nb

  // Bin pitches.
  const bins: any[][][] = Array.from({ length: nb }, () => Array.from({ length: nb }, () => []))
  for (const loc of locations) {
    if (loc?.plate_x == null || loc?.plate_z == null) continue
    const xi = Math.floor((loc.plate_x - VXM) / xS)
    const yi = Math.floor((VZX - loc.plate_z) / yS)
    if (xi >= 0 && xi < nb && yi >= 0 && yi < nb) bins[yi][xi].push(loc)
  }

  // Per-bin metric.
  const z: (number | null)[][] = bins.map(row => row.map(cell => calcHeatmapMetric(cell, metric)))

  // chase_pct: null inside the strike zone (no chase by definition).
  if (metric === 'chase_pct') {
    for (let r = 0; r < nb; r++) for (let c = 0; c < nb; c++) {
      const bx = VXM + (c + 0.5) * xS, by = VZX - (r + 0.5) * yS
      if (bx >= -0.708 && bx <= 0.708 && by >= 1.5 && by <= 3.5) z[r][c] = null
    }
  }

  // 2 passes of neighbor interpolation to smooth empty bins.
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < nb; r++) for (let c = 0; c < nb; c++) {
      if (z[r][c] !== null) continue
      if (metric === 'chase_pct') {
        const bx = VXM + (c + 0.5) * xS, by = VZX - (r + 0.5) * yS
        if (bx >= -0.708 && bx <= 0.708 && by >= 1.5 && by <= 3.5) continue
      }
      const neighbors: number[] = []
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < nb && nc >= 0 && nc < nb && z[nr][nc] !== null) neighbors.push(z[nr][nc] as number)
      }
      if (neighbors.length >= 2) z[r][c] = neighbors.reduce((a, b) => a + b, 0) / neighbors.length
    }
  }

  // zMin / zMax. League baseline (zMid + zSpan from league_averages,
  // span = 3σ) takes precedence — center spectrum on league mean, hot
  // and cold extremes at ±3σ. Falls back to data range when no league
  // row is available (e.g. metric='frequency' or unpopulated).
  let zMin = 0, zMax = 1
  const propMid = typeof p.zMid === 'number' && Number.isFinite(p.zMid) ? p.zMid : null
  const propSpan = typeof p.zSpan === 'number' && Number.isFinite(p.zSpan) && p.zSpan > 0 ? p.zSpan : null
  if (propMid != null && propSpan != null) {
    zMin = propMid - propSpan
    zMax = propMid + propSpan
  } else {
    const vals = z.flat().filter((v): v is number => v !== null)
    if (vals.length) {
      zMin = Math.min(...vals)
      zMax = Math.max(...vals)
    }
  }
  const zRange = zMax - zMin || 1

  // Per-pixel bilinear interpolation at the target plot resolution. Skia's
  // `imageSmoothingQuality: 'high'` uses a wide multi-tap filter (Mitchell/
  // Lanczos-ish) which over a 37× upscale reads like a heavy Gaussian
  // blur — too soft for our heatmap. Doing the bilinear ourselves and
  // drawing 1:1 with smoothing disabled keeps the segment blend but
  // keeps boundaries crisp.
  const targetW = Math.max(1, Math.round(plotW))
  const targetH = Math.max(1, Math.round(plotH))
  const off = createCanvas(targetW, targetH)
  const offCtx = off.getContext('2d')
  const imgData = offCtx.createImageData(targetW, targetH)
  const buf = imgData.data
  const xRange = VXX - VXM
  const zRangePlate = VZX - VZM
  for (let py = 0; py < targetH; py++) {
    const plate_z = VZX - ((py + 0.5) / targetH) * zRangePlate
    const gy = (VZX - plate_z) / yS - 0.5
    const iy0 = Math.floor(gy)
    const fy = gy - iy0
    const cy0 = iy0 < 0 ? 0 : iy0 >= nb ? nb - 1 : iy0
    const cy1 = (iy0 + 1) < 0 ? 0 : (iy0 + 1) >= nb ? nb - 1 : (iy0 + 1)
    for (let px = 0; px < targetW; px++) {
      const plate_x = VXM + ((px + 0.5) / targetW) * xRange
      const idx = (py * targetW + px) * 4
      if (metric === 'chase_pct' && plate_x >= -0.708 && plate_x <= 0.708 && plate_z >= 1.5 && plate_z <= 3.5) {
        buf[idx + 3] = 0
        continue
      }
      const gx = (plate_x - VXM) / xS - 0.5
      const ix0 = Math.floor(gx)
      const fx = gx - ix0
      const cx0 = ix0 < 0 ? 0 : ix0 >= nb ? nb - 1 : ix0
      const cx1 = (ix0 + 1) < 0 ? 0 : (ix0 + 1) >= nb ? nb - 1 : (ix0 + 1)
      const v00 = z[cy0][cx0], v10 = z[cy0][cx1], v01 = z[cy1][cx0], v11 = z[cy1][cx1]
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      let total = 0, weight = 0
      if (v00 !== null) { total += v00 * w00; weight += w00 }
      if (v10 !== null) { total += v10 * w10; weight += w10 }
      if (v01 !== null) { total += v01 * w01; weight += w01 }
      if (v11 !== null) { total += v11 * w11; weight += w11 }
      if (weight === 0) { buf[idx + 3] = 0; continue }
      const v = total / weight
      const t = (v - zMin) / zRange
      const [rr, gg, bb] = sampleSpectrumRGB(t, colorMode)
      buf[idx] = rr; buf[idx + 1] = gg; buf[idx + 2] = bb; buf[idx + 3] = 255
    }
  }
  offCtx.putImageData(imgData, 0, 0)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(off, Math.round(plotX), Math.round(plotY), targetW, targetH)
  ctx.restore()

  if (p.showZone !== false) {
    const toX = (px: number) => plotX + ((px - VXM) / (VXX - VXM)) * plotW
    const toY = (pz: number) => plotY + ((VZX - pz) / (VZX - VZM)) * plotH
    // chase_pct mask — fill the in-zone area with the tile bg so the
    // bilinear blend doesn't bleed colored pixels into the strike zone.
    if (metric === 'chase_pct') {
      ctx.fillStyle = p.bgColor || '#0f0f12'
      ctx.fillRect(toX(-0.708), toY(3.5), toX(0.708) - toX(-0.708), toY(1.5) - toY(3.5))
    }
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(toX(-17 / 24), toY(3.5), toX(17 / 24) - toX(-17 / 24), toY(1.5) - toY(3.5))
    // Home plate at the bottom for orientation.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(toX(-0.708), toY(0.15))
    ctx.lineTo(toX(0), toY(0))
    ctx.lineTo(toX(0.708), toY(0.15))
    ctx.stroke()
  }

  if (showLegend) {
    // Legend width matches the colored plot width — never wider than the
    // heatmap itself, so it sits flush under it instead of stretching to
    // the tile edges.
    drawHeatmapLegend(ctx, plotX, ey + h - legendH - 2, plotW, legendH, zMin, zMax, metric, colorMode)
  }

  ctx.restore()
}

/** Original cell-count rendering used by legacy report-card heatmaps. */
function drawRCHeatmapLegacy(
  ctx: SKRSContext2D,
  el: SceneElement,
  ex: number, ey: number, w: number, h: number,
  locations: { plate_x: number; plate_z: number }[],
  titleOffset: number,
) {
  const p = el.props
  const binsX = p.binsX || 5
  const binsY = p.binsY || 5
  const pad = 20
  const plotW = w - pad * 2
  const plotH = h - pad * 2 - titleOffset

  const bins: number[][] = Array.from({ length: binsY }, () => Array(binsX).fill(0))
  let maxCount = 0
  const VXM = -2, VXX = 2, VZM = 0.5, VZX = 4.5

  for (const loc of locations) {
    const bx = Math.floor(((loc.plate_x - VXM) / (VXX - VXM)) * binsX)
    const by = Math.floor(((VZX - loc.plate_z) / (VZX - VZM)) * binsY)
    if (bx >= 0 && bx < binsX && by >= 0 && by < binsY) {
      bins[by][bx]++
      if (bins[by][bx] > maxCount) maxCount = bins[by][bx]
    }
  }

  const cellW = plotW / binsX
  const cellH = plotH / binsY
  const low = [24, 24, 27]
  const high = [239, 68, 68]

  for (let row = 0; row < binsY; row++) {
    for (let col = 0; col < binsX; col++) {
      const count = bins[row][col]
      const t = maxCount > 0 ? count / maxCount : 0
      const r = Math.round(low[0] + (high[0] - low[0]) * t)
      const g = Math.round(low[1] + (high[1] - low[1]) * t)
      const b = Math.round(low[2] + (high[2] - low[2]) * t)
      ctx.globalAlpha = Math.max(0.3, t)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(ex + pad + col * cellW, ey + pad + titleOffset + row * cellH, cellW, cellH)

      if (count > 0) {
        ctx.globalAlpha = 0.9
        ctx.fillStyle = t > 0.5 ? '#ffffff' : '#a1a1aa'
        ctx.font = `400 11px ${FONT()}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(count), ex + pad + col * cellW + cellW / 2, ey + pad + titleOffset + row * cellH + cellH / 2)
      }
    }
  }
  ctx.globalAlpha = 1

  if (p.showZone !== false) {
    const toX = (px: number) => ex + pad + ((px - VXM) / (VXX - VXM)) * plotW
    const toY = (pz: number) => ey + pad + titleOffset + ((VZX - pz) / (VZX - VZM)) * plotH
    ctx.strokeStyle = '#71717a'
    ctx.lineWidth = 2
    ctx.strokeRect(toX(-17 / 24), toY(3.5), toX(17 / 24) - toX(-17 / 24), toY(1.5) - toY(3.5))
  }
}

function drawRCZonePlot(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x: ex, y: ey, width: w, height: h } = el
  const pitches: { plate_x: number; plate_z: number; pitch_name: string }[] = p.pitches || []
  const dotSize = p.dotSize || 8
  const dotOpacity = p.dotOpacity ?? 0.85
  const radius = p.borderRadius ?? 8
  const title = p.title || ''

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, ex, ey, w, h, radius)
  ctx.fill()

  let titleOffset = 0
  if (title) {
    titleOffset = 24
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `600 12px ${FONT()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title, ex + w / 2, ey + 6)
  }

  const VXM = -2.5, VXX = 2.5, VZM = 0, VZX = 5
  const pad = 25
  const plotW = w - pad * 2
  const plotH = h - pad * 2 - titleOffset

  const toX = (px: number) => ex + pad + ((px - VXM) / (VXX - VXM)) * plotW
  const toY = (pz: number) => ey + pad + titleOffset + ((VZX - pz) / (VZX - VZM)) * plotH

  // Strike zone
  if (p.showZone !== false) {
    ctx.strokeStyle = p.zoneColor || '#52525b'
    ctx.lineWidth = p.zoneLineWidth || 2
    ctx.strokeRect(toX(-17 / 24), toY(3.5), toX(17 / 24) - toX(-17 / 24), toY(1.5) - toY(3.5))
  }

  // Dots
  for (const pitch of pitches) {
    const cx = toX(pitch.plate_x)
    const cy = toY(pitch.plate_z)
    const color = pitchColor(pitch.pitch_name)
    ctx.globalAlpha = dotOpacity
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

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
      case 'stat-card':
        drawStatCard(ctx, el)
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
      case 'rc-statline':
        drawRCStatline(ctx, el)
        break
      case 'rc-heatmap':
        drawRCHeatmap(ctx, el)
        break
      case 'rc-zone-plot':
        drawRCZonePlot(ctx, el)
        break
      case 'shape':
        drawUniversalBg(ctx, el)
        break
      case 'text': {
        const p = el.props
        // Apply textTransform
        let displayText = p.text || ''
        if (p.textTransform === 'uppercase') displayText = displayText.toUpperCase()
        else if (p.textTransform === 'lowercase') displayText = displayText.toLowerCase()

        const baseFontSize = p.fontSize || 16
        const lineHeightMul = p.lineHeight || 1.2
        ctx.fillStyle = p.color || '#ffffff'
        ctx.textBaseline = 'middle'

        // Word-wrap with auto-shrink to fit element bounds
        let fontSize = baseFontSize
        let lines: string[] = []
        while (fontSize >= 12) {
          ctx.font = `${p.fontWeight || 400} ${fontSize}px ${p.fontFamily || FONT()}`
          // Split into lines that fit el.width
          const words = displayText.split(' ')
          lines = []
          let cur = ''
          for (const w of words) {
            const test = cur ? `${cur} ${w}` : w
            if (ctx.measureText(test).width > el.width && cur) {
              lines.push(cur)
              cur = w
            } else {
              cur = test
            }
          }
          if (cur) lines.push(cur)
          const totalH = lines.length * fontSize * lineHeightMul
          if (totalH <= el.height + fontSize * lineHeightMul * 0.3) break
          fontSize -= 2
        }

        ctx.font = `${p.fontWeight || 400} ${fontSize}px ${p.fontFamily || FONT()}`
        const lh = fontSize * lineHeightMul
        const totalH = lines.length * lh
        const startY = el.y + (el.height - totalH) / 2 + lh / 2

        let tx = el.x
        if (p.textAlign === 'center') { tx = el.x + el.width / 2; ctx.textAlign = 'center' }
        else if (p.textAlign === 'right') { tx = el.x + el.width; ctx.textAlign = 'right' }
        else { ctx.textAlign = 'left' }

        // Text shadow
        if (p.textShadowBlur > 0 || p.textShadowOffsetX || p.textShadowOffsetY) {
          ctx.save()
          ctx.fillStyle = p.textShadowColor || '#000000'
          ctx.shadowColor = p.textShadowColor || '#000000'
          ctx.shadowBlur = p.textShadowBlur || 0
          ctx.shadowOffsetX = p.textShadowOffsetX || 0
          ctx.shadowOffsetY = p.textShadowOffsetY || 0
          for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tx, startY + i * lh)
          }
          ctx.restore()
          ctx.fillStyle = p.color || '#ffffff'
          ctx.font = `${p.fontWeight || 400} ${fontSize}px ${p.fontFamily || FONT()}`
          if (p.textAlign === 'center') ctx.textAlign = 'center'
          else if (p.textAlign === 'right') ctx.textAlign = 'right'
          else ctx.textAlign = 'left'
        }

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], tx, startY + i * lh)
        }
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
