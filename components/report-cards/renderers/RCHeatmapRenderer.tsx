'use client'

/**
 * Client-side preview of the rc-heatmap scene element. Mirrors the
 * server-side `drawRCHeatmap` in lib/serverRenderCard.ts so the report-
 * card editor preview matches the exported PNG.
 *
 * Two render modes:
 *   - metric === 'count' (or undefined) → legacy 5×5 cell-count rendering.
 *   - metric in {frequency, ba, slg, woba, xba, xwoba, xslg, ev,
 *     whiff_pct, chase_pct} → 16×16 spectrum heatmap with neighbor
 *     interpolation, bilinear smoothing via offscreen canvas, optional
 *     bottom legend bar.
 *
 * League baseline (zMid, zSpan = 3σ) takes precedence over the data
 * range when both are set on the element props — matches the Imagine
 * Heat Maps widget's coloring exactly.
 */
import { useEffect, useRef } from 'react'

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5

// Legacy 'count' mode bounds.
const LEGACY_X_MIN = -2.0, LEGACY_X_MAX = 2.0
const LEGACY_Z_MIN = 0.5,  LEGACY_Z_MAX = 4.5

// Spectrum mode bounds — match the Reports page heatmap.
const SPEC_X_MIN = -1.76, SPEC_X_MAX = 1.76
const SPEC_Z_MIN = 0.24,  SPEC_Z_MAX = 4.06
const SPEC_NB = 16
const SPEC_PLOT_ASPECT = (SPEC_X_MAX - SPEC_X_MIN) / (SPEC_Z_MAX - SPEC_Z_MIN)

const HEATMAP_SPECTRUM_RAINBOW: [number, [number, number, number]][] = [
  [0.00, [0x1a, 0x3d, 0x7c]], [0.05, [0x21, 0x66, 0xac]],
  [0.15, [0x33, 0x88, 0xb8]], [0.25, [0x4b, 0xa8, 0xc4]],
  [0.35, [0x6c, 0xc4, 0xa0]], [0.45, [0xc8, 0xe6, 0x4a]],
  [0.55, [0xf0, 0xe8, 0x30]], [0.65, [0xf5, 0xa0, 0x20]],
  [0.75, [0xe0, 0x60, 0x10]], [0.85, [0xc4, 0x2a, 0x0c]],
  [0.92, [0x9e, 0x00, 0x00]], [1.00, [0x7a, 0x00, 0x00]],
]
const HEATMAP_SPECTRUM_HOTCOLD: [number, [number, number, number]][] = [
  [0.00, [0x1a, 0x3d, 0x7c]], [0.20, [0x4b, 0x80, 0xb4]],
  [0.38, [0x9c, 0xae, 0xbe]], [0.50, [0x6b, 0x6b, 0x73]],
  [0.62, [0xbe, 0xa6, 0xa6]], [0.80, [0xc4, 0x4a, 0x2a]],
  [1.00, [0x7a, 0x00, 0x00]],
]

type ColorMode = 'rainbow' | 'hotcold'

function getSpectrum(mode: ColorMode): [number, [number, number, number]][] {
  return mode === 'hotcold' ? HEATMAP_SPECTRUM_HOTCOLD : HEATMAP_SPECTRUM_RAINBOW
}

function sampleSpectrumRGB(t: number, mode: ColorMode): [number, number, number] {
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
    case 'woba':  return avg(pitches.map(p => p.woba_value).filter((x: any) => x != null))
    case 'xba':   return avg(pitches.map(p => p.estimated_ba_using_speedangle).filter((x: any) => x != null))
    case 'xwoba': return avg(pitches.map(p => p.estimated_woba_using_speedangle).filter((x: any) => x != null))
    case 'xslg':  return avg(pitches.map(p => p.estimated_slg_using_speedangle).filter((x: any) => x != null))
    case 'ev':    return avg(pitches.map(p => p.launch_speed).filter((x: any) => x != null))
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
    if (Math.abs(v) >= 1) return v.toFixed(3)
    const sign = v < 0 ? '-' : ''
    const abs = Math.abs(v)
    return `${sign}.${Math.round(abs * 1000).toString().padStart(3, '0')}`
  }
  if (metric === 'ev') return `${v.toFixed(1)} mph`
  if (metric === 'whiff_pct' || metric === 'chase_pct') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(2)
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}
function interpolateColor(low: string, high: string, t: number): string {
  const [lr, lg, lb] = hexToRgb(low)
  const [hr, hg, hb] = hexToRgb(high)
  return `rgb(${Math.round(lr + (hr - lr) * t)},${Math.round(lg + (hg - lg) * t)},${Math.round(lb + (hb - lb) * t)})`
}

export default function RCHeatmapRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const locations: any[] = p.locations || []
  const metric: string = p.metric || 'count'
  const colorMode: ColorMode = p.colorMode === 'hotcold' ? 'hotcold' : 'rainbow'
  const showZone = p.showZone !== false
  const showLegend = p.showLegend !== false
  const bgColor = p.bgColor || '#09090b'
  const title = p.title || ''
  const fontSize = p.fontSize || 12

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const dynFont = Math.max(12, Math.min(20, Math.floor(Math.min(width, height) * 0.055)))
    const effectiveFont = fontSize !== 12 ? fontSize : dynFont

    let titleOffset = 0
    if (title) titleOffset = effectiveFont + 12

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    if (title) {
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `600 ${effectiveFont}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(title, width / 2, 6)
    }

    if (metric === 'count') {
      drawLegacy(ctx, p, width, height, titleOffset, locations)
    } else {
      drawSpectrum(ctx, p, width, height, titleOffset, locations, metric, colorMode, showZone, showLegend, bgColor)
    }
  }, [locations, width, height, bgColor, title, fontSize, metric, colorMode, showZone, showLegend, p.binsX, p.binsY, p.colorLow, p.colorHigh, p.zMid, p.zSpan])

  return <canvas ref={canvasRef} style={{ width, height }} className="block" />
}

/* ── Legacy (count) — preserves existing report-card visuals ───────────── */
function drawLegacy(
  ctx: CanvasRenderingContext2D,
  p: Record<string, any>,
  width: number, height: number,
  titleOffset: number,
  locations: { plate_x: number; plate_z: number }[],
) {
  const binsX = p.binsX || 5
  const binsY = p.binsY || 5
  const colorLow = p.colorLow || '#18181b'
  const colorHigh = p.colorHigh || '#ef4444'
  const showZone = p.showZone !== false
  const fontSize = p.fontSize || 12
  const pad = 25
  const plotW = width - pad * 2
  const plotH = height - pad * 2 - titleOffset

  const bins: number[][] = Array.from({ length: binsY }, () => Array(binsX).fill(0))
  let maxCount = 0
  for (const loc of locations) {
    const bx = Math.floor(((loc.plate_x - LEGACY_X_MIN) / (LEGACY_X_MAX - LEGACY_X_MIN)) * binsX)
    const by = Math.floor(((LEGACY_Z_MAX - loc.plate_z) / (LEGACY_Z_MAX - LEGACY_Z_MIN)) * binsY)
    if (bx >= 0 && bx < binsX && by >= 0 && by < binsY) {
      bins[by][bx]++
      if (bins[by][bx] > maxCount) maxCount = bins[by][bx]
    }
  }
  const cellW = plotW / binsX
  const cellH = plotH / binsY
  for (let row = 0; row < binsY; row++) {
    for (let col = 0; col < binsX; col++) {
      const count = bins[row][col]
      const t = maxCount > 0 ? count / maxCount : 0
      ctx.fillStyle = interpolateColor(colorLow, colorHigh, t)
      ctx.globalAlpha = Math.max(0.3, t)
      ctx.fillRect(pad + col * cellW, pad + titleOffset + row * cellH, cellW, cellH)
      if (count > 0) {
        ctx.globalAlpha = 0.9
        ctx.fillStyle = t > 0.5 ? '#ffffff' : '#a1a1aa'
        const dynCellFont = Math.max(10, Math.min(18, Math.floor(Math.min(cellW, cellH) * 0.4)))
        const cellFont = fontSize !== 12 ? Math.max(8, fontSize - 2) : dynCellFont
        ctx.font = `${cellFont}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(count), pad + col * cellW + cellW / 2, pad + titleOffset + row * cellH + cellH / 2)
      }
    }
  }
  ctx.globalAlpha = 1
  if (showZone) {
    const toX = (x: number) => pad + ((x - LEGACY_X_MIN) / (LEGACY_X_MAX - LEGACY_X_MIN)) * plotW
    const toY = (z: number) => pad + titleOffset + ((LEGACY_Z_MAX - z) / (LEGACY_Z_MAX - LEGACY_Z_MIN)) * plotH
    ctx.strokeStyle = '#71717a'
    ctx.lineWidth = 2
    ctx.strokeRect(toX(ZONE_LEFT), toY(ZONE_TOP), toX(ZONE_RIGHT) - toX(ZONE_LEFT), toY(ZONE_BOT) - toY(ZONE_TOP))
  }
}

/* ── Spectrum mode — matches drawRCHeatmap server renderer ─────────────── */
function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  p: Record<string, any>,
  width: number, height: number,
  titleOffset: number,
  locations: any[],
  metric: string,
  colorMode: ColorMode,
  showZone: boolean,
  showLegend: boolean,
  bgColor: string,
) {
  const legendH = showLegend ? 22 : 0
  const pad = 16
  const availX = pad
  const availY = pad + titleOffset
  const availW = width - pad * 2
  const availH = height - pad * 2 - titleOffset - legendH

  // Constrain plot rect to natural strike-zone aspect, center inside available area.
  let plotW = availW
  let plotH = plotW / SPEC_PLOT_ASPECT
  if (plotH > availH) {
    plotH = availH
    plotW = plotH * SPEC_PLOT_ASPECT
  }
  const plotX = availX + (availW - plotW) / 2
  const plotY = availY + (availH - plotH) / 2

  const xS = (SPEC_X_MAX - SPEC_X_MIN) / SPEC_NB
  const yS = (SPEC_Z_MAX - SPEC_Z_MIN) / SPEC_NB

  const bins: any[][][] = Array.from({ length: SPEC_NB }, () => Array.from({ length: SPEC_NB }, () => []))
  for (const loc of locations) {
    if (loc?.plate_x == null || loc?.plate_z == null) continue
    const xi = Math.floor((loc.plate_x - SPEC_X_MIN) / xS)
    const yi = Math.floor((SPEC_Z_MAX - loc.plate_z) / yS)
    if (xi >= 0 && xi < SPEC_NB && yi >= 0 && yi < SPEC_NB) bins[yi][xi].push(loc)
  }

  const z: (number | null)[][] = bins.map(row => row.map(cell => calcHeatmapMetric(cell, metric)))

  if (metric === 'chase_pct') {
    for (let r = 0; r < SPEC_NB; r++) for (let c = 0; c < SPEC_NB; c++) {
      const bx = SPEC_X_MIN + (c + 0.5) * xS, by = SPEC_Z_MAX - (r + 0.5) * yS
      if (bx >= -0.708 && bx <= 0.708 && by >= 1.5 && by <= 3.5) z[r][c] = null
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < SPEC_NB; r++) for (let c = 0; c < SPEC_NB; c++) {
      if (z[r][c] !== null) continue
      if (metric === 'chase_pct') {
        const bx = SPEC_X_MIN + (c + 0.5) * xS, by = SPEC_Z_MAX - (r + 0.5) * yS
        if (bx >= -0.708 && bx <= 0.708 && by >= 1.5 && by <= 3.5) continue
      }
      const neighbors: number[] = []
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < SPEC_NB && nc >= 0 && nc < SPEC_NB && z[nr][nc] !== null) neighbors.push(z[nr][nc] as number)
      }
      if (neighbors.length >= 2) z[r][c] = neighbors.reduce((a, b) => a + b, 0) / neighbors.length
    }
  }

  // zMin / zMax from league baseline (zMid + zSpan from props) when available, else data range.
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

  // Render cells via offscreen ImageData + drawImage with smoothing for bilinear blend.
  const off = document.createElement('canvas')
  off.width = SPEC_NB
  off.height = SPEC_NB
  const offCtx = off.getContext('2d')
  if (offCtx) {
    const imgData = offCtx.createImageData(SPEC_NB, SPEC_NB)
    const buf = imgData.data
    for (let r = 0; r < SPEC_NB; r++) for (let c = 0; c < SPEC_NB; c++) {
      const v = z[r][c]
      const idx = (r * SPEC_NB + c) * 4
      if (v === null) { buf[idx + 3] = 0; continue }
      const t = (v - zMin) / zRange
      const [rr, gg, bb] = sampleSpectrumRGB(t, colorMode)
      buf[idx] = rr; buf[idx + 1] = gg; buf[idx + 2] = bb; buf[idx + 3] = 255
    }
    offCtx.putImageData(imgData, 0, 0)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ;(ctx as any).imageSmoothingQuality = 'high'
    ctx.drawImage(off, plotX, plotY, plotW, plotH)
    ctx.restore()
  }

  if (showZone) {
    const toX = (x: number) => plotX + ((x - SPEC_X_MIN) / (SPEC_X_MAX - SPEC_X_MIN)) * plotW
    const toY = (zCoord: number) => plotY + ((SPEC_Z_MAX - zCoord) / (SPEC_Z_MAX - SPEC_Z_MIN)) * plotH
    if (metric === 'chase_pct') {
      ctx.fillStyle = bgColor
      ctx.fillRect(toX(-0.708), toY(3.5), toX(0.708) - toX(-0.708), toY(1.5) - toY(3.5))
    }
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(toX(ZONE_LEFT), toY(ZONE_TOP), toX(ZONE_RIGHT) - toX(ZONE_LEFT), toY(ZONE_BOT) - toY(ZONE_TOP))
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(toX(-0.708), toY(0.15))
    ctx.lineTo(toX(0), toY(0))
    ctx.lineTo(toX(0.708), toY(0.15))
    ctx.stroke()
  }

  if (showLegend) {
    drawLegend(ctx, plotX, height - legendH - 2, plotW, legendH, zMin, zMax, metric, colorMode)
  }
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  zMin: number, zMax: number, metric: string, colorMode: ColorMode,
) {
  const labelW = 56
  const barX = x + labelW
  const barW = Math.max(20, w - labelW * 2)
  const barH = Math.min(h - 4, 8)
  const barY = y + (h - barH) / 2

  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
  for (const [stop, [r, g, b]] of getSpectrum(colorMode)) {
    grad.addColorStop(stop, `rgb(${r},${g},${b})`)
  }
  ctx.fillStyle = grad
  ctx.beginPath()
  // Pill: rounded rect.
  const radius = barH / 2
  ctx.moveTo(barX + radius, barY)
  ctx.lineTo(barX + barW - radius, barY)
  ctx.arcTo(barX + barW, barY, barX + barW, barY + radius, radius)
  ctx.lineTo(barX + barW, barY + barH - radius)
  ctx.arcTo(barX + barW, barY + barH, barX + barW - radius, barY + barH, radius)
  ctx.lineTo(barX + radius, barY + barH)
  ctx.arcTo(barX, barY + barH, barX, barY + barH - radius, radius)
  ctx.lineTo(barX, barY + radius)
  ctx.arcTo(barX, barY, barX + radius, barY, radius)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#a1a1aa'
  ctx.font = '400 10px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillText(fmtHeatmapValue(zMin, metric), barX - 6, y + h / 2)
  ctx.textAlign = 'left'
  ctx.fillText(fmtHeatmapValue(zMax, metric), barX + barW + 6, y + h / 2)
}
