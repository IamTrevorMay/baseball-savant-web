import { Scene, SceneElement } from '@/lib/sceneTypes'
import { interpolateScene } from '@/lib/sceneInterpolation'
import { drawPitchFlightStatic } from './PitchFlightRenderer'

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

// ── Element renderers ────────────────────────────────────────────────────────

function drawStatCard(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el
  const pad = 20

  ctx.save()

  // Background
  if (p.variant === 'outline') {
    ctx.strokeStyle = p.color
    ctx.lineWidth = 2
    roundRect(ctx, x, y, w, h, 12)
    ctx.stroke()
  } else {
    ctx.fillStyle = p.variant === 'glass' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.7)'
    roundRect(ctx, x, y, w, h, 12)
    ctx.fill()

    // Accent bar
    ctx.fillStyle = p.color
    if (p.variant === 'glass') {
      ctx.fillRect(x, y + 10, 3, h - 20)
    } else {
      ctx.fillRect(x, y, w, 3)
    }
  }

  // Label
  const labelSize = Math.max(11, p.fontSize * 0.26)
  ctx.font = `600 ${labelSize}px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const labelY = y + pad
  ctx.fillText(p.label.toUpperCase(), x + pad, labelY)

  // Value
  ctx.font = `bold ${p.fontSize}px ${FONT}`
  ctx.fillStyle = p.color
  const valueY = labelY + labelSize + 6
  ctx.fillText(p.value, x + pad, valueY)

  // Sublabel
  if (p.sublabel) {
    const subSize = Math.max(11, p.fontSize * 0.28)
    ctx.font = `400 ${subSize}px ${FONT}`
    ctx.fillStyle = '#71717a'
    ctx.fillText(p.sublabel, x + pad, valueY + p.fontSize + 6)
  }

  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, el: SceneElement) {
  const p = el.props
  const { x, y, width: w, height: h } = el

  ctx.save()
  ctx.font = `${p.fontWeight} ${p.fontSize}px ${FONT}`
  ctx.fillStyle = p.color
  ctx.textBaseline = 'middle'

  let tx = x
  if (p.textAlign === 'center') { tx = x + w / 2; ctx.textAlign = 'center' }
  else if (p.textAlign === 'right') { tx = x + w; ctx.textAlign = 'right' }
  else { ctx.textAlign = 'left' }

  ctx.fillText(p.text, tx, y + h / 2)
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

  ctx.save()

  // Border
  ctx.strokeStyle = p.borderColor
  ctx.lineWidth = 2
  roundRect(ctx, x, y, w, imgH, 12)
  ctx.stroke()

  // Image
  if (p.playerId) {
    try {
      const imgUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
      const img = await loadImage(imgUrl)
      ctx.save()
      roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, 11)
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
      roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, 11)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#27272a'
    roundRect(ctx, x + 1, y + 1, w - 2, imgH - 2, 11)
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

  ctx.save()

  // Label
  ctx.font = `500 11px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(p.label, x, y)

  // Value
  if (p.showValue) {
    ctx.font = `bold 11px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText(String(p.value), x + w, y)
  }

  // Bar background
  const barY = y + 20
  const barH = Math.max(6, h - 26)
  ctx.fillStyle = '#27272a'
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

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportScenePNG(scene: Scene, filename: string): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = scene.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

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

  ctx.fillStyle = scene.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

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

    switch (el.type) {
      case 'stat-card': drawStatCard(ctx, el); break
      case 'text': drawText(ctx, el); break
      case 'shape': drawShape(ctx, el); break
      case 'player-image': await drawPlayerImage(ctx, el); break
      case 'comparison-bar': drawComparisonBar(ctx, el); break
      case 'pitch-flight': drawPitchFlightStatic(ctx, el); break
    }

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
