/**
 * Batter silhouette overlay for plate-location charts.
 *
 * RHB image positioned on the LEFT of the zone (toward 1B in pitcher perspective).
 * LHB image positioned on the RIGHT (toward 3B).
 * Only shown when ALL visible data has the same batter handedness.
 */

// ── detectStand ──────────────────────────────────────────────────────────────

/**
 * Returns 'L' or 'R' when every pitch in `data` has the same batter stand,
 * or when `activeStandFilter` is a single value. Returns null for mixed/empty.
 */
export function detectStand(
  data: any[],
  activeStandFilter?: string[],
): 'L' | 'R' | null {
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
  return first as 'L' | 'R'
}

// ── Plotly image overlay ─────────────────────────────────────────────────────

interface SilhouetteOpts {
  opacity?: number
}

/**
 * Returns a Plotly `layout.images` array that positions the batter silhouette
 * in data coordinates. RHB appears on the left (x ~ -1.6), LHB on the right.
 */
export function batterSilhouetteImages(
  stand: 'L' | 'R' | null,
  opts?: SilhouetteOpts,
): any[] {
  if (!stand) return []

  const opacity = opts?.opacity ?? 0.18
  const src = stand === 'R'
    ? '/batter-silhouette.png'
    : '/batter-silhouette-lhb.png'

  // Position in data coordinates (feet).
  // RHB stands to the left of the zone (1B side in pitcher-view).
  // LHB stands to the right (3B side in pitcher-view).
  const xCenter = stand === 'R' ? -1.6 : 1.6
  const sizex = 1.8  // width in data units
  const sizey = 3.6  // height in data units
  const yBottom = 0.4

  return [{
    source: src,
    xref: 'x',
    yref: 'y',
    x: xCenter - sizex / 2,
    y: yBottom + sizey,
    sizex,
    sizey,
    xanchor: 'left',
    yanchor: 'top',
    layer: 'below',
    opacity,
    sizing: 'stretch',
  }]
}

// ── Canvas drawing ───────────────────────────────────────────────────────────

let _cachedImg: HTMLImageElement | null = null
let _imgLoading = false

/**
 * Preloads the batter silhouette image so canvas renderers can draw immediately.
 * Safe to call multiple times — only loads once.
 */
export function preloadBatterSilhouette(): void {
  if (_cachedImg || _imgLoading) return
  _imgLoading = true
  const img = new Image()
  img.src = '/batter-silhouette.png'
  img.onload = () => { _cachedImg = img }
  img.onerror = () => { _imgLoading = false }
}

/**
 * Draws the batter silhouette onto a 2D canvas context.
 *
 * @param ctx       Canvas rendering context
 * @param stand     'L' or 'R' (null = no-op)
 * @param toCanvasX Converts plate-x (ft) to canvas x pixel
 * @param toCanvasY Converts plate-z (ft) to canvas y pixel
 * @param opacity   0–1, default 0.18
 */
export function drawBatterSilhouette(
  ctx: CanvasRenderingContext2D,
  stand: 'L' | 'R' | null,
  toCanvasX: (ft: number) => number,
  toCanvasY: (ft: number) => number,
  opacity = 0.18,
): void {
  if (!stand || !_cachedImg) return

  const xCenter = stand === 'R' ? -1.6 : 1.6
  const halfW = 0.9
  const yBottom = 0.4
  const yTop = 4.0

  const cx1 = toCanvasX(xCenter - halfW)
  const cx2 = toCanvasX(xCenter + halfW)
  const cy1 = toCanvasY(yTop)
  const cy2 = toCanvasY(yBottom)
  const drawW = cx2 - cx1
  const drawH = cy2 - cy1

  ctx.save()
  ctx.globalAlpha = opacity

  if (stand === 'L') {
    // Flip horizontally: translate to right edge, scale -1 on x
    ctx.translate(cx1 + drawW, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(_cachedImg, 0, cy1, drawW, drawH)
  } else {
    ctx.drawImage(_cachedImg, cx1, cy1, drawW, drawH)
  }

  ctx.restore()
}
