/**
 * Batter-side indicator for plate-location charts: a silhouette in the
 * batter's box plus a "vs LHH" / "vs RHH" badge.
 *
 * Only shown when ALL visible data has the same batter handedness (or an
 * explicit single-value stand filter is active). Mixed data → nothing.
 *
 * Orientation matters. Statcast `plate_x` is catcher's view: negative is the
 * 3B side, where a RHB stands. Most charts negate x via `toPitcherX()` so the
 * 3B side (and the RHB) lands on the RIGHT. Pass `orientation` to match the
 * chart:
 *   'pitcher' (default) — x negated via toPitcherX: RHB right, LHB left
 *   'catcher'           — raw plate_x:              RHB left,  LHB right
 *
 * Two PNGs: `/batter-silhouette.png` faces right (batter stands on the left of
 * the zone), `/batter-silhouette-lhb.png` faces left. Which file is used
 * depends on the side the batter ends up on, not on handedness.
 */

export type Stand = 'L' | 'R'
export type ZoneOrientation = 'pitcher' | 'catcher'

export const SILHOUETTE_OPACITY = 0.32

const SRC_FACING_RIGHT = '/batter-silhouette.png'
const SRC_FACING_LEFT = '/batter-silhouette-lhb.png'

// ── detectStand ──────────────────────────────────────────────────────────────

/**
 * Returns 'L' or 'R' when every pitch in `data` has the same batter stand,
 * or when `activeStandFilter` is a single value. Returns null for mixed/empty.
 */
export function detectStand(
  data: any[],
  activeStandFilter?: string[],
): Stand | null {
  // Explicit single-value filter wins
  if (activeStandFilter && activeStandFilter.length === 1) {
    const v = activeStandFilter[0]
    if (v === 'L' || v === 'R') return v
  }

  // Scan data — all must match
  const stands = data.map(d => d.stand).filter(Boolean) as string[]
  if (!stands.length) return null
  const first = stands[0]
  if (first !== 'L' && first !== 'R') return null
  for (let i = 1; i < stands.length; i++) {
    if (stands[i] !== first) return null
  }
  return first as Stand
}

/** Badge text: "vs LHH" / "vs RHH". */
export function standLabel(stand: Stand): string {
  return stand === 'L' ? 'vs LHH' : 'vs RHH'
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface SilhouetteGeometry {
  side: 'left' | 'right'
  /** Image whose batter faces the zone from `side`. */
  src: string
  /** Horizontal extent in feet (chart data coords). */
  x0: number
  x1: number
  /** Vertical extent in feet. */
  yBottom: number
  yTop: number
}

/** Which side of the zone the batter stands on for this chart orientation. */
export function standSide(stand: Stand, orientation: ZoneOrientation = 'pitcher'): 'left' | 'right' {
  if (orientation === 'catcher') return stand === 'R' ? 'left' : 'right'
  return stand === 'R' ? 'right' : 'left'
}

/** Silhouette box in data coordinates (feet) for the given chart orientation. */
export function silhouetteGeometry(stand: Stand, orientation: ZoneOrientation = 'pitcher'): SilhouetteGeometry {
  const side = standSide(stand, orientation)
  const xCenter = side === 'left' ? -1.6 : 1.6
  const halfW = 0.9
  return {
    side,
    src: side === 'left' ? SRC_FACING_RIGHT : SRC_FACING_LEFT,
    x0: xCenter - halfW,
    x1: xCenter + halfW,
    yBottom: 0.4,
    yTop: 4.0,
  }
}

// ── Plotly ───────────────────────────────────────────────────────────────────

interface PlotlyOpts {
  opacity?: number
  orientation?: ZoneOrientation
  /** Badge font size in px (default 10). */
  labelSize?: number
}

/**
 * Returns a Plotly `layout.images` array that positions the batter silhouette
 * in data coordinates.
 */
export function batterSilhouetteImages(
  stand: Stand | null,
  opts?: PlotlyOpts,
): any[] {
  if (!stand) return []
  const g = silhouetteGeometry(stand, opts?.orientation)
  return [{
    source: g.src,
    xref: 'x',
    yref: 'y',
    x: g.x0,
    y: g.yTop,
    sizex: g.x1 - g.x0,
    sizey: g.yTop - g.yBottom,
    xanchor: 'left',
    yanchor: 'top',
    layer: 'below',
    opacity: opts?.opacity ?? SILHOUETTE_OPACITY,
    sizing: 'stretch',
  }]
}

/**
 * Returns a Plotly `layout.annotations` entry: a "vs LHH" / "vs RHH" badge in
 * the top corner of the plot area on the batter's side.
 */
export function batterStandAnnotation(
  stand: Stand | null,
  opts?: PlotlyOpts,
): any[] {
  if (!stand) return []
  const side = standSide(stand, opts?.orientation)
  return [{
    text: standLabel(stand),
    xref: 'paper',
    yref: 'paper',
    x: side === 'left' ? 0.02 : 0.98,
    y: 0.98,
    xanchor: side,
    yanchor: 'top',
    showarrow: false,
    font: { size: opts?.labelSize ?? 10, color: '#e4e4e7', family: 'Inter, system-ui, sans-serif' },
    bgcolor: 'rgba(9,9,11,0.8)',
    bordercolor: 'rgba(255,255,255,0.18)',
    borderwidth: 1,
    borderpad: 3,
  }]
}

/**
 * Silhouette + badge together. Spread into a Plotly layout:
 *   `layout={{ ..., ...batterStandLayout(stand) }}`
 * Layouts that already carry `annotations` should concat instead.
 */
export function batterStandLayout(
  stand: Stand | null,
  opts?: PlotlyOpts,
): { images: any[]; annotations: any[] } {
  return {
    images: batterSilhouetteImages(stand, opts),
    annotations: batterStandAnnotation(stand, opts),
  }
}

// ── Canvas ───────────────────────────────────────────────────────────────────

/**
 * Minimal 2D-context surface used by the canvas helpers, so both the browser
 * `CanvasRenderingContext2D` and @napi-rs/canvas's `SKRSContext2D` fit.
 */
export interface Ctx2D {
  save(): void
  restore(): void
  font: string
  fillStyle: any
  strokeStyle: any
  lineWidth: number
  globalAlpha: number
  textAlign: any
  textBaseline: any
  measureText(text: string): { width: number }
  fillText(text: string, x: number, y: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
  closePath(): void
  fill(): void
  stroke(): void
}

const SRCS = [SRC_FACING_RIGHT, SRC_FACING_LEFT]
const _imgs: Partial<Record<string, HTMLImageElement>> = {}
const _loading = new Set<string>()
const _onLoad = new Set<() => void>()

/**
 * Preloads both silhouette images so canvas renderers can draw immediately.
 * Safe to call multiple times — each file only loads once. Browser-only.
 *
 * `onLoad` fires once, after both images are ready — canvas renderers use it
 * to redraw when the first paint happened before the PNGs arrived. It is a
 * no-op (never stored) once the images are already loaded.
 */
export function preloadBatterSilhouette(onLoad?: () => void): void {
  if (typeof window === 'undefined') return
  const pending = SRCS.filter(s => !_imgs[s])
  if (!pending.length) return
  if (onLoad) _onLoad.add(onLoad)
  for (const src of pending) {
    if (_loading.has(src)) continue
    _loading.add(src)
    const img = new Image()
    img.src = src
    img.onload = () => {
      _imgs[src] = img
      if (SRCS.every(s => _imgs[s])) {
        const fns = [..._onLoad]
        _onLoad.clear()
        fns.forEach(fn => fn())
      }
    }
    img.onerror = () => { _loading.delete(src) }
  }
}

interface CanvasOpts {
  opacity?: number
  orientation?: ZoneOrientation
}

/**
 * Draws the batter silhouette onto a 2D canvas context.
 *
 * @param ctx       Canvas rendering context
 * @param stand     'L' or 'R' (null = no-op)
 * @param toCanvasX Converts plate-x (ft, in the chart's orientation) to canvas x pixel
 * @param toCanvasY Converts plate-z (ft) to canvas y pixel
 * @param opts      opacity (default SILHOUETTE_OPACITY), orientation (default 'pitcher')
 */
export function drawBatterSilhouette(
  ctx: CanvasRenderingContext2D,
  stand: Stand | null,
  toCanvasX: (ft: number) => number,
  toCanvasY: (ft: number) => number,
  opts?: CanvasOpts | number,
): void {
  if (!stand) return
  const o: CanvasOpts = typeof opts === 'number' ? { opacity: opts } : (opts || {})
  const g = silhouetteGeometry(stand, o.orientation)
  const img = _imgs[g.src]
  if (!img) { preloadBatterSilhouette(); return }

  const cx1 = toCanvasX(g.x0)
  const cx2 = toCanvasX(g.x1)
  const cy1 = toCanvasY(g.yTop)
  const cy2 = toCanvasY(g.yBottom)

  ctx.save()
  ctx.globalAlpha = o.opacity ?? SILHOUETTE_OPACITY
  ctx.drawImage(img, Math.min(cx1, cx2), cy1, Math.abs(cx2 - cx1), cy2 - cy1)
  ctx.restore()
}

interface LabelOpts {
  orientation?: ZoneOrientation
  /** Font size in px (default 11). */
  fontPx?: number
  /** Inset from the plot-rect corner in px (default 6). */
  inset?: number
}

/**
 * Draws the "vs LHH" / "vs RHH" pill in the top corner of `rect` on the
 * batter's side. `rect` is the plot area in canvas pixels.
 */
export function drawBatterStandLabel(
  ctx: Ctx2D,
  stand: Stand | null,
  rect: { x: number; y: number; w: number; h: number },
  opts?: LabelOpts,
): void {
  if (!stand) return
  const side = standSide(stand, opts?.orientation)
  const fontPx = opts?.fontPx ?? 11
  const inset = opts?.inset ?? 6
  const padX = Math.round(fontPx * 0.6)
  const padY = Math.round(fontPx * 0.3)
  const text = standLabel(stand)

  ctx.save()
  ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`
  const tw = ctx.measureText(text).width
  const bw = tw + padX * 2
  const bh = fontPx + padY * 2
  const bx = side === 'left' ? rect.x + inset : rect.x + rect.w - inset - bw
  const by = rect.y + inset
  const r = bh / 2

  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.moveTo(bx + r, by)
  ctx.lineTo(bx + bw - r, by)
  ctx.arcTo(bx + bw, by, bx + bw, by + r, r)
  ctx.lineTo(bx + bw, by + bh - r)
  ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r)
  ctx.lineTo(bx + r, by + bh)
  ctx.arcTo(bx, by + bh, bx, by + bh - r, r)
  ctx.lineTo(bx, by + r)
  ctx.arcTo(bx, by, bx + r, by, r)
  ctx.closePath()
  ctx.fillStyle = 'rgba(9,9,11,0.8)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#e4e4e7'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, bx + padX, by + bh / 2)
  ctx.restore()
}
