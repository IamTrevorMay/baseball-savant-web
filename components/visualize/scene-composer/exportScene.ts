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
  ctx.fillText(text, tx, y + h / 2)
  resetShadow(ctx)
  ctx.restore()
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

  if (p.fill && p.fill !== 'transparent') {
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
    ctx.save()
    ctx.globalAlpha = el.opacity

    if (el.rotation) {
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(el.x + el.width / 2), -(el.y + el.height / 2))
    }

    // Universal shadow (applied to the first fill/stroke of the element)
    applyUniversalShadow(ctx, el.props)

    // Universal background
    drawUniversalBg(ctx, el)
    resetShadow(ctx)

    // Re-apply shadow for element content
    applyUniversalShadow(ctx, el.props)

    switch (el.type) {
      case 'stat-card':
        drawStatCard(ctx, el)
        break
      case 'text':
        drawText(ctx, el)
        break
      case 'shape':
        drawShape(ctx, el)
        break
      case 'player-image':
        await drawPlayerImage(ctx, el)
        break
      case 'comparison-bar':
        drawComparisonBar(ctx, el)
        break
      case 'pitch-flight':
        drawPitchFlightStatic(ctx, el)
        break
      case 'stadium':
        await drawStadiumStatic(ctx, el)
        break
      case 'ticker':
        drawTicker(ctx, el)
        break
    }

    resetShadow(ctx)

    // Universal border (drawn last, on top)
    drawUniversalBorder(ctx, el)

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
    ctx.save()
    ctx.globalAlpha = el.opacity

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
      case 'comparison-bar': drawComparisonBar(ctx, el); break
      case 'pitch-flight': drawPitchFlightStatic(ctx, el); break
      case 'stadium': await drawStadiumStatic(ctx, el); break
      case 'ticker': drawTicker(ctx, el); break
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
