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

function drawRCHeatmap(ctx: SKRSContext2D, el: SceneElement) {
  const p = el.props
  const { x: ex, y: ey, width: w, height: h } = el
  const locations: { plate_x: number; plate_z: number }[] = p.locations || []
  const binsX = p.binsX || 5
  const binsY = p.binsY || 5
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

  ctx.restore()
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
        ctx.font = `${p.fontWeight || 400} ${p.fontSize || 16}px ${FONT()}`
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
