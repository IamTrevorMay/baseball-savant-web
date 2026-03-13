import { Scene, SceneElement } from '@/lib/sceneTypes'
import { interpolateScene } from '@/lib/sceneInterpolation'
import { drawPitchFlightStatic } from './PitchFlightRenderer'
import { drawStadiumStatic } from './StadiumRenderer'

// ── Canvas helpers ───────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

function getFontStack(family?: string): string {
  if (!family) return FONT
  return `"${family}", ${FONT}`
}

const _loadedFonts = new Set<string>()

async function ensureGoogleFont(family: string): Promise<void> {
  if (!family || _loadedFonts.has(family)) return
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700;800;900&display=swap`
    const resp = await fetch(url)
    const css = await resp.text()
    // Extract font-face URLs and load via FontFace API
    const urlMatch = css.match(/url\(([^)]+)\)/g)
    if (urlMatch) {
      for (const u of urlMatch.slice(0, 3)) {
        const src = u.slice(4, -1).replace(/'/g, '')
        try {
          const face = new FontFace(family, `url(${src})`)
          const loaded = await face.load()
          ;(document.fonts as any).add(loaded)
        } catch { /* skip variant */ }
      }
    }
    _loadedFonts.add(family)
  } catch { /* font load failed, fall back to system */ }
}

function applyTextTransform(text: string, transform?: string): string {
  if (!transform || transform === 'none') return text
  switch (transform) {
    case 'uppercase': return text.toUpperCase()
    case 'lowercase': return text.toLowerCase()
    case 'capitalize': return text.replace(/\b\w/g, c => c.toUpperCase())
    default: return text
  }
}

function applyUniversalShadow(ctx: CanvasRenderingContext2D, p: Record<string, any>) {
  if (p.shadowBlur > 0) {
    ctx.shadowColor = p.shadowColor || '#000000'
    ctx.shadowBlur = p.shadowBlur
    ctx.shadowOffsetX = p.shadowOffsetX || 0
    ctx.shadowOffsetY = p.shadowOffsetY || 0
  }
}

function resetShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

function drawUniversalBorder(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  if (p.borderWidth > 0) {
    ctx.strokeStyle = p.borderColor || '#06b6d4'
    ctx.lineWidth = p.borderWidth
    const r = p.borderRadius ?? 12
    roundRect(ctx, el.x, el.y, el.width, el.height, r)
    ctx.stroke()
  }
}

function drawUniversalBg(ctx: CanvasRenderingContext2D, el: SceneElement) {
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

// ── Blend mode mapping ──────────────────────────────────────────────────────

const BLEND_MAP: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay',
  darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn',
  'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion',
}

// ── Effects helper ──────────────────────────────────────────────────────────

function applyEffects(ctx: CanvasRenderingContext2D, effects: any[] | undefined, drawFn: () => void) {
  if (!effects || effects.length === 0) { drawFn(); return }
  for (const e of effects) {
    ctx.save()
    const a = e.opacity ?? 1
    const color = e.color || '#000000'
    // Parse hex to rgba
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16) || 0
    const g = parseInt(hex.substring(2, 4), 16) || 0
    const b = parseInt(hex.substring(4, 6), 16) || 0
    ctx.shadowColor = `rgba(${r},${g},${b},${a})`
    ctx.shadowBlur = e.blur || 0
    if (e.type === 'outer-glow' || e.type === 'inner-glow') {
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    } else {
      ctx.shadowOffsetX = e.offsetX || 0
      ctx.shadowOffsetY = e.offsetY || 0
    }
    drawFn()
    ctx.restore()
  }
  // Final draw without shadow for the element itself
  ctx.save()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  drawFn()
  ctx.restore()
}

// ── Path drawing helper ─────────────────────────────────────────────────────

function drawPath(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const pathData = p.pathData || ''
  if (!pathData) return

  ctx.save()
  ctx.translate(el.x, el.y)

  const path = new Path2D(pathData)

  if (p.fill && p.fill !== 'transparent') {
    ctx.fillStyle = p.fill
    ctx.fill(path)
  }
  if (p.strokeWidth > 0 && p.stroke && p.stroke !== 'transparent') {
    ctx.strokeStyle = p.stroke
    ctx.lineWidth = p.strokeWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke(path)
  }

  ctx.restore()
}

// ── Curved text drawing helper ──────────────────────────────────────────────

function drawCurvedText(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const text = applyTextTransform(p.text || 'Curved Text', p.textTransform)
  const radius = p.radius || 120
  const arc = p.arc || 180
  const startAngle = p.startAngle || 0
  const font = getFontStack(p.fontFamily)

  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2

  ctx.save()
  ctx.font = `${p.fontWeight || 600} ${p.fontSize || 24}px ${font}`
  ctx.fillStyle = p.color || '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const arcRad = (arc * Math.PI) / 180
  const startRad = ((startAngle - 90) * Math.PI) / 180

  // Measure total text width to center it on the arc
  const totalWidth = ctx.measureText(text).width
  const totalAngle = totalWidth / radius
  const offset = startRad - totalAngle / 2

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const charW = ctx.measureText(char).width
    const charsBefore = ctx.measureText(text.substring(0, i)).width
    const charAngle = offset + (charsBefore + charW / 2) / radius

    const x = cx + radius * Math.cos(charAngle)
    const y = cy + radius * Math.sin(charAngle)

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(charAngle + Math.PI / 2)
    ctx.fillText(char, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

// ── Clip mask helper ────────────────────────────────────────────────────────

function applyClipMask(ctx: CanvasRenderingContext2D, maskEl: SceneElement) {
  ctx.beginPath()
  if (maskEl.type === 'shape' && maskEl.props.shape === 'circle') {
    ctx.ellipse(
      maskEl.x + maskEl.width / 2, maskEl.y + maskEl.height / 2,
      maskEl.width / 2, maskEl.height / 2, 0, 0, Math.PI * 2
    )
  } else if (maskEl.type === 'path' && maskEl.props.pathData) {
    ctx.save()
    ctx.translate(maskEl.x, maskEl.y)
    const p = new Path2D(maskEl.props.pathData)
    ctx.restore()
    // Use Path2D clip — translate manually
    const p2 = new Path2D()
    const m = new DOMMatrix().translate(maskEl.x, maskEl.y)
    p2.addPath(new Path2D(maskEl.props.pathData), m)
    ctx.clip(p2)
    return
  } else {
    const r = maskEl.props.borderRadius || 0
    roundRect(ctx, maskEl.x, maskEl.y, maskEl.width, maskEl.height, r)
  }
  ctx.clip()
}

// ── Element renderers ────────────────────────────────────────────────────────

function drawStatCard(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const pad = 20
  const radius = p.borderRadius ?? 12
  const font = getFontStack(p.fontFamily)

  ctx.save()

  // Background — use bgColor if set, otherwise variant defaults
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
    roundRect(ctx, x, y, w, h, radius)
    ctx.fill()
    // Accent bar
    ctx.fillStyle = p.color
    if (p.variant === 'glass') ctx.fillRect(x, y + 10, 3, h - 20)
    else if (p.variant !== 'outline') ctx.fillRect(x, y, w, 3)
  } else if (p.variant === 'outline') {
    ctx.strokeStyle = p.color
    ctx.lineWidth = 2
    roundRect(ctx, x, y, w, h, radius)
    ctx.stroke()
  } else {
    ctx.fillStyle = p.variant === 'glass' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.7)'
    roundRect(ctx, x, y, w, h, radius)
    ctx.fill()

    // Accent bar
    ctx.fillStyle = p.color
    if (p.variant === 'glass') {
      ctx.fillRect(x, y + 10, 3, h - 20)
    } else {
      ctx.fillRect(x, y, w, 3)
    }
  }

  // Text shadow helper
  const applyTxtShadow = () => {
    if (p.textShadowBlur > 0) {
      ctx.shadowColor = p.textShadowColor || '#06b6d4'
      ctx.shadowBlur = p.textShadowBlur
      ctx.shadowOffsetX = p.textShadowOffsetX || 0
      ctx.shadowOffsetY = p.textShadowOffsetY || 0
    }
  }

  // Label
  const labelSize = Math.max(11, p.fontSize * 0.26)
  ctx.font = `600 ${labelSize}px ${font}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const labelY = y + pad
  applyTxtShadow()
  ctx.fillText(applyTextTransform(p.label.toUpperCase(), p.textTransform), x + pad, labelY)

  // Value
  ctx.font = `bold ${p.fontSize}px ${font}`
  ctx.fillStyle = p.color
  const valueY = labelY + labelSize + 6
  ctx.fillText(applyTextTransform(p.value, p.textTransform), x + pad, valueY)

  // Sublabel
  if (p.sublabel) {
    const subSize = Math.max(11, p.fontSize * 0.28)
    ctx.font = `400 ${subSize}px ${font}`
    ctx.fillStyle = '#71717a'
    ctx.fillText(applyTextTransform(p.sublabel, p.textTransform), x + pad, valueY + p.fontSize + 6)
  }

  resetShadow(ctx)
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const font = getFontStack(p.fontFamily)

  ctx.save()
  ctx.font = `${p.fontWeight} ${p.fontSize}px ${font}`
  ctx.fillStyle = p.color
  ctx.textBaseline = 'middle'

  let tx = x
  if (p.textAlign === 'center') { tx = x + w / 2; ctx.textAlign = 'center' }
  else if (p.textAlign === 'right') { tx = x + w; ctx.textAlign = 'right' }
  else { ctx.textAlign = 'left' }

  // Text shadow
  if (p.textShadowBlur > 0) {
    ctx.shadowColor = p.textShadowColor || '#06b6d4'
    ctx.shadowBlur = p.textShadowBlur
    ctx.shadowOffsetX = p.textShadowOffsetX || 0
    ctx.shadowOffsetY = p.textShadowOffsetY || 0
  }

  const text = applyTextTransform(p.text, p.textTransform)
  const letterSpacing = p.letterSpacing || 0
  if (letterSpacing > 0) {
    // Draw char-by-char for letter spacing
    const chars = text.split('')
    let cx = tx
    if (p.textAlign === 'center' || p.textAlign === 'right') {
      let totalW = 0
      for (const ch of chars) totalW += ctx.measureText(ch).width + letterSpacing
      totalW -= letterSpacing
      if (p.textAlign === 'center') cx -= totalW / 2
      else cx -= totalW
    }
    ctx.textAlign = 'left'
    for (const ch of chars) {
      ctx.fillText(ch, cx, y + h / 2)
      cx += ctx.measureText(ch).width + letterSpacing
    }
  } else {
    ctx.fillText(text, tx, y + h / 2)
  }
  resetShadow(ctx)
  ctx.restore()
}

function parseGradient(ctx: CanvasRenderingContext2D, gradient: string, x: number, y: number, w: number, h: number): CanvasGradient | null {
  // Parse linear-gradient(Xdeg, color1 pos1%, color2 pos2%, ...)
  const linearMatch = gradient.match(/^linear-gradient\(\s*(\d+)deg\s*,\s*(.+)\)$/)
  if (linearMatch) {
    const angle = parseFloat(linearMatch[1]) * Math.PI / 180
    const cx = x + w / 2, cy = y + h / 2
    const len = Math.max(w, h) / 2
    const dx = Math.sin(angle) * len, dy = -Math.cos(angle) * len
    const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    const stops = linearMatch[2].split(/,\s*(?=#|rgb|hsl)/)
    for (const stop of stops) {
      const parts = stop.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/)
      if (parts) grad.addColorStop(parseFloat(parts[2]) / 100, parts[1].trim())
    }
    return grad
  }
  // Parse radial-gradient(circle at X% Y%, color1 pos1%, ...)
  const radialMatch = gradient.match(/^radial-gradient\(\s*circle\s+at\s+(\d+)%\s+(\d+)%\s*,\s*(.+)\)$/)
  if (radialMatch) {
    const cx = x + w * parseFloat(radialMatch[1]) / 100
    const cy = y + h * parseFloat(radialMatch[2]) / 100
    const r = Math.max(w, h) / 2
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    const stops = radialMatch[3].split(/,\s*(?=#|rgb|hsl)/)
    for (const stop of stops) {
      const parts = stop.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/)
      if (parts) grad.addColorStop(parseFloat(parts[2]) / 100, parts[1].trim())
    }
    return grad
  }
  return null
}

function drawShape(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el

  ctx.save()
  if (p.shape === 'circle') {
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.closePath()
  } else {
    roundRect(ctx, x, y, w, h, p.borderRadius || 0)
  }

  if (p.gradient) {
    const grad = parseGradient(ctx, p.gradient, x, y, w, h)
    if (grad) {
      ctx.fillStyle = grad
      ctx.fill()
    }
  } else if (p.fill && p.fill !== 'transparent') {
    ctx.fillStyle = p.fill
    ctx.fill()
  }
  if (p.strokeWidth > 0 && p.stroke && p.stroke !== 'transparent') {
    ctx.strokeStyle = p.stroke
    ctx.lineWidth = p.strokeWidth
    ctx.stroke()
  }
  ctx.restore()
}

async function drawPlayerImage(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const imgH = p.showLabel && p.playerName ? h - 28 : h

  const borderW = p.borderWidth > 0 ? p.borderWidth : 2
  const radius = p.borderRadius ?? 12

  ctx.save()

  // Border
  ctx.strokeStyle = p.borderColor
  ctx.lineWidth = borderW
  roundRect(ctx, x, y, w, imgH, radius)
  ctx.stroke()

  // Image
  if (p.playerId) {
    try {
      const imgUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
      const img = await loadImage(imgUrl)
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
    } catch {
      // Placeholder
      ctx.fillStyle = '#27272a'
      roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, Math.max(0, radius - 1))
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#27272a'
    roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, Math.max(0, radius - 1))
    ctx.fill()
  }

  // Name label
  if (p.showLabel && p.playerName) {
    ctx.font = `500 13px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.playerName, x + w / 2, y + imgH + 14, w)
  }

  ctx.restore()
}

async function drawImage(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  if (!p.src) return
  try {
    const img = await loadImage(p.src)
    const fit = p.objectFit || 'cover'
    ctx.save()
    const rad = p.borderRadius ?? 0
    if (rad > 0) {
      roundRect(ctx, x, y, w, h, rad)
      ctx.clip()
    }
    if (fit === 'fill') {
      ctx.drawImage(img, x, y, w, h)
    } else if (fit === 'contain') {
      const imgR = img.width / img.height
      const boxR = w / h
      let dw: number, dh: number, dx: number, dy: number
      if (imgR > boxR) {
        dw = w; dh = w / imgR; dx = x; dy = y + (h - dh) / 2
      } else {
        dh = h; dw = h * imgR; dx = x + (w - dw) / 2; dy = y
      }
      ctx.drawImage(img, dx, dy, dw, dh)
    } else {
      // cover
      const imgR = img.width / img.height
      const boxR = w / h
      let sx = 0, sy = 0, sw = img.width, sh = img.height
      if (imgR > boxR) {
        sw = img.height * boxR; sx = (img.width - sw) / 2
      } else {
        sh = img.width / boxR; sy = (img.height - sh) / 2
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
    }
    ctx.restore()
  } catch { /* image failed to load */ }
}

function drawComparisonBar(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const pct = Math.min(1, Math.max(0, p.value / p.maxValue))
  const font = getFontStack(p.fontFamily)
  const barBg = p.barBgColor || '#27272a'

  ctx.save()

  // Text shadow
  if (p.textShadowBlur > 0) {
    ctx.shadowColor = p.textShadowColor || '#06b6d4'
    ctx.shadowBlur = p.textShadowBlur
    ctx.shadowOffsetX = p.textShadowOffsetX || 0
    ctx.shadowOffsetY = p.textShadowOffsetY || 0
  }

  // Label
  ctx.font = `500 11px ${font}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(applyTextTransform(p.label, p.textTransform), x, y)

  // Value
  if (p.showValue) {
    ctx.font = `bold 11px ${font}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText(applyTextTransform(String(p.value), p.textTransform), x + w, y)
  }

  resetShadow(ctx)

  // Bar background
  const barY = y + 20
  const barH = Math.max(6, h - 26)
  ctx.fillStyle = barBg
  roundRect(ctx, x, barY, w, barH, barH / 2)
  ctx.fill()

  // Bar fill
  if (pct > 0) {
    ctx.fillStyle = p.color
    roundRect(ctx, x, barY, w * pct, barH, barH / 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawTicker(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const font = getFontStack(p.fontFamily)

  ctx.save()

  // Background
  if (p.showBg !== false) {
    ctx.fillStyle = p.bgColor || '#09090b'
    ctx.fillRect(x, y, w, h)
  }

  // Text (render static for export — show first visible portion)
  const text = applyTextTransform(p.text || '', p.textTransform)
  const sep = p.separator || ' \u2022 '
  const fullText = `${text}${sep}${text}${sep}`
  ctx.font = `${p.fontWeight || 600} ${p.fontSize || 20}px ${font}`
  ctx.fillStyle = p.color || '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // Text shadow
  if (p.textShadowBlur > 0) {
    ctx.shadowColor = p.textShadowColor || '#06b6d4'
    ctx.shadowBlur = p.textShadowBlur
    ctx.shadowOffsetX = p.textShadowOffsetX || 0
    ctx.shadowOffsetY = p.textShadowOffsetY || 0
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillText(fullText, x + 8, y + h / 2)
  ctx.restore()

  resetShadow(ctx)
  ctx.restore()
}

// ── RC element draw functions ────────────────────────────────────────────────

function drawRCStatBox(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const radius = p.borderRadius ?? 12
  const font = getFontStack(p.fontFamily)
  const color = p.color || '#06b6d4'
  const pad = 16

  ctx.save()
  // Background
  ctx.fillStyle = p.bgColor || 'rgba(255,255,255,0.04)'
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()
  // Accent bar
  ctx.fillStyle = color
  ctx.fillRect(x, y + 10, 3, h - 20)

  const labelSize = Math.max(10, (p.fontSize || 44) * 0.28)
  ctx.font = `600 ${labelSize}px ${font}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText((p.label || 'Stat').toUpperCase(), x + pad, y + pad)

  ctx.font = `bold ${p.fontSize || 44}px ${font}`
  ctx.fillStyle = color
  ctx.fillText(String(p.value ?? '--'), x + pad, y + pad + labelSize + 4)
  ctx.restore()
}

function drawRCTable(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const font = getFontStack()
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
  ctx.font = `600 ${headerFontSize}px ${font}`
  ctx.fillStyle = '#a1a1aa'
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
  ctx.font = `400 ${fontSize}px ${font}`

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

function drawRCBarChart(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const font = getFontStack()
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
    ctx.font = `500 ${fontSize}px ${font}`
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
      ctx.font = `600 ${fontSize}px ${font}`
      ctx.textAlign = 'left'
      ctx.fillText(d.value % 1 ? d.value.toFixed(1) : String(d.value), x + pad.left + Math.max(bw, 4) + 6, by + barH / 2)
    }
  }
  ctx.restore()
}

function drawRCDonutChart(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const font = getFontStack()
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
      ctx.font = `500 ${fontSize}px ${font}`
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

function drawRCHeatmap(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x: ex, y: ey, width: w, height: h } = el
  const locations: { plate_x: number; plate_z: number }[] = p.locations || []
  const binsX = p.binsX || 5
  const binsY = p.binsY || 5
  const radius = p.borderRadius ?? 8

  ctx.save()
  ctx.fillStyle = p.bgColor || '#09090b'
  roundRect(ctx, ex, ey, w, h, radius)
  ctx.fill()

  const pad = 20
  const plotW = w - pad * 2
  const plotH = h - pad * 2

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
  const low = [24, 24, 27] // #18181b
  const high = [239, 68, 68] // #ef4444

  for (let row = 0; row < binsY; row++) {
    for (let col = 0; col < binsX; col++) {
      const count = bins[row][col]
      const t = maxCount > 0 ? count / maxCount : 0
      const r = Math.round(low[0] + (high[0] - low[0]) * t)
      const g = Math.round(low[1] + (high[1] - low[1]) * t)
      const b = Math.round(low[2] + (high[2] - low[2]) * t)
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.3, t)})`
      ctx.fillRect(ex + pad + col * cellW, ey + pad + row * cellH, cellW, cellH)

      if (count > 0) {
        ctx.fillStyle = t > 0.5 ? '#ffffff' : '#a1a1aa'
        ctx.font = '11px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(count), ex + pad + col * cellW + cellW / 2, ey + pad + row * cellH + cellH / 2)
      }
    }
  }

  // Zone outline
  if (p.showZone !== false) {
    const toX = (px: number) => ex + pad + ((px - VXM) / (VXX - VXM)) * plotW
    const toY = (pz: number) => ey + pad + ((VZX - pz) / (VZX - VZM)) * plotH
    ctx.strokeStyle = '#71717a'
    ctx.lineWidth = 2
    ctx.strokeRect(toX(-17 / 24), toY(3.5), toX(17 / 24) - toX(-17 / 24), toY(1.5) - toY(3.5))
  }

  ctx.restore()
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportScenePNG(scene: Scene, filename: string): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!

  // Pre-load Google Fonts
  const fontFamilies = new Set<string>()
  for (const el of scene.elements) {
    if (el.props.fontFamily) fontFamilies.add(el.props.fontFamily)
  }
  await Promise.all([...fontFamilies].map(f => ensureGoogleFont(f)))

  // Background
  if (scene.background && scene.background !== 'transparent') {
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Sort by zIndex and draw
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    if (el.type === 'group') continue // groups are transparent containers

    ctx.save()
    ctx.globalAlpha = el.opacity

    // Blend mode
    ctx.globalCompositeOperation = BLEND_MAP[el.blendMode || 'normal'] || 'source-over'

    if (el.rotation) {
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(el.x + el.width / 2), -(el.y + el.height / 2))
    }

    // Clip mask
    if (el.clipMaskId) {
      const maskEl = scene.elements.find(m => m.id === el.clipMaskId)
      if (maskEl) applyClipMask(ctx, maskEl)
    }

    // Draw with effects
    const drawElement = async () => {
      // Universal shadow (applied to the first fill/stroke of the element)
      applyUniversalShadow(ctx, el.props)

      // Universal background
      drawUniversalBg(ctx, el)
      resetShadow(ctx)

      // Re-apply shadow for element content
      applyUniversalShadow(ctx, el.props)

      switch (el.type) {
        case 'stat-card': drawStatCard(ctx, el); break
        case 'text': drawText(ctx, el); break
        case 'shape': drawShape(ctx, el); break
        case 'player-image': await drawPlayerImage(ctx, el); break
        case 'image': await drawImage(ctx, el); break
        case 'comparison-bar': drawComparisonBar(ctx, el); break
        case 'pitch-flight': drawPitchFlightStatic(ctx, el); break
        case 'stadium': await drawStadiumStatic(ctx, el); break
        case 'ticker': drawTicker(ctx, el); break
        case 'path': drawPath(ctx, el); break
        case 'curved-text': drawCurvedText(ctx, el); break
        case 'rc-stat-box': drawRCStatBox(ctx, el); break
        case 'rc-table': drawRCTable(ctx, el); break
        case 'rc-heatmap': drawRCHeatmap(ctx, el); break
        case 'rc-bar-chart': drawRCBarChart(ctx, el); break
        case 'rc-donut-chart': drawRCDonutChart(ctx, el); break
        // rc-zone-plot and rc-movement-plot share the same props as zone-plot/movement-plot
      }

      resetShadow(ctx)
      drawUniversalBorder(ctx, el)
    }

    if (el.effects && el.effects.length > 0) {
      applyEffects(ctx, el.effects, () => { /* shadow layers drawn by applyEffects */ })
      await drawElement()
    } else {
      await drawElement()
    }

    ctx.restore()
  }

  // Download
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// Export scene as JSON (for import into After Effects via Bodymovin or custom script)
export function exportSceneJSON(scene: Scene): string {
  return JSON.stringify(scene, null, 2)
}

// ── Render single frame (for animation export) ─────────────────────────────

async function renderFrame(scene: Scene, frame: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!

  if (scene.background && scene.background !== 'transparent') {
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const elements = interpolateScene(scene.elements, frame)
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    if (el.type === 'group') continue

    ctx.save()
    ctx.globalAlpha = el.opacity
    ctx.globalCompositeOperation = BLEND_MAP[el.blendMode || 'normal'] || 'source-over'

    if (el.rotation) {
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(el.x + el.width / 2), -(el.y + el.height / 2))
    }

    applyUniversalShadow(ctx, el.props)
    drawUniversalBg(ctx, el)
    resetShadow(ctx)
    applyUniversalShadow(ctx, el.props)

    switch (el.type) {
      case 'stat-card': drawStatCard(ctx, el); break
      case 'text': drawText(ctx, el); break
      case 'shape': drawShape(ctx, el); break
      case 'player-image': await drawPlayerImage(ctx, el); break
      case 'image': await drawImage(ctx, el); break
      case 'comparison-bar': drawComparisonBar(ctx, el); break
      case 'pitch-flight': drawPitchFlightStatic(ctx, el); break
      case 'stadium': await drawStadiumStatic(ctx, el); break
      case 'ticker': drawTicker(ctx, el); break
      case 'path': drawPath(ctx, el); break
      case 'curved-text': drawCurvedText(ctx, el); break
    }

    resetShadow(ctx)
    drawUniversalBorder(ctx, el)

    ctx.restore()
  }

  return canvas
}

// ── Image Sequence Export (ZIP) ─────────────────────────────────────────────

export async function exportImageSequence(
  scene: Scene,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const fps = scene.fps || 30
  const duration = scene.duration || 5
  const totalFrames = fps * duration

  for (let f = 0; f <= totalFrames; f++) {
    const canvas = await renderFrame(scene, f)
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/png')
    })
    const padded = String(f).padStart(5, '0')
    zip.file(`frame_${padded}.png`, blob)
    onProgress?.(((f + 1) / (totalFrames + 1)) * 100)
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `${scene.name.replace(/\s+/g, '-').toLowerCase()}-sequence.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── WebM Video Export ───────────────────────────────────────────────────────

export async function exportWebM(
  scene: Scene,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const fps = scene.fps || 30
  const duration = scene.duration || 5
  const totalFrames = fps * duration

  // Create a persistent canvas for the MediaRecorder
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!

  const stream = canvas.captureStream(0) // manual frame control
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 8_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }

  const done = new Promise<void>(resolve => {
    recorder.onstop = () => resolve()
  })

  recorder.start()

  for (let f = 0; f <= totalFrames; f++) {
    const frameCanvas = await renderFrame(scene, f)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(frameCanvas, 0, 0)

    // Request a frame from the stream
    const track = stream.getVideoTracks()[0] as any
    if (track?.requestFrame) track.requestFrame()

    // Wait for frame timing
    await new Promise(r => setTimeout(r, 1000 / fps))
    onProgress?.(((f + 1) / (totalFrames + 1)) * 100)
  }

  recorder.stop()
  await done

  const blob = new Blob(chunks, { type: 'video/webm' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${scene.name.replace(/\s+/g, '-').toLowerCase()}.webm`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── MP4 Video Export (FFmpeg WASM) ──────────────────────────────────────────

export async function exportMP4(
  scene: Scene,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  await ffmpeg.load()

  const fps = scene.fps || 30
  const duration = scene.duration || 5
  const totalFrames = fps * duration

  // Render frames and write as PNGs into FFmpeg's virtual FS
  for (let f = 0; f <= totalFrames; f++) {
    const canvas = await renderFrame(scene, f)
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/png')
    })
    const data = await fetchFile(blob)
    const padded = String(f).padStart(5, '0')
    await ffmpeg.writeFile(`frame_${padded}.png`, data)
    onProgress?.(((f + 1) / (totalFrames + 1)) * 80) // 0-80% for rendering
  }

  // Encode to MP4 using H.264
  await ffmpeg.exec([
    '-framerate', String(fps),
    '-i', 'frame_%05d.png',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    '-movflags', '+faststart',
    'output.mp4',
  ])
  onProgress?.(95)

  const output = await ffmpeg.readFile('output.mp4') as Uint8Array
  const mp4Blob = new Blob([new Uint8Array(output.buffer, output.byteOffset, output.byteLength).slice()], { type: 'video/mp4' })

  const url = URL.createObjectURL(mp4Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${scene.name.replace(/\s+/g, '-').toLowerCase()}.mp4`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  ffmpeg.terminate()
  onProgress?.(100)
}
