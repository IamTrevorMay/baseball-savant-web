/**
 * Pure heatmap metric / grid helpers — server-safe.
 *
 * Mirrors the metric logic used by the Reports page (TileViz.tsx
 * calcMetric) and the server canvas renderer (serverRenderCard.ts
 * calcHeatmapMetric). Lives here so that the Heat Map Overlays widget's
 * server-side fetchData can compute its 16×16 grid (bin → metric →
 * neighbor-interp → normalize → multiply) without dragging in either
 * a 'use client' module or @napi-rs/canvas.
 *
 * Strike-zone plot bounds are hard-coded the same way as the rest of
 * the app: x ∈ [-1.76, 1.76], z ∈ [0.24, 4.06].
 */

export type HeatmapMetricKey =
  | 'frequency' | 'ba' | 'slg' | 'woba' | 'xba' | 'xwoba' | 'xslg'
  | 'ev' | 'la' | 'whiff_pct' | 'chase_pct' | 'swing_pct'

export const HEATMAP_METRIC_LABELS: Record<HeatmapMetricKey, string> = {
  frequency: 'Frequency',
  ba: 'BA', slg: 'SLG', woba: 'wOBA',
  xba: 'xBA', xwoba: 'xwOBA', xslg: 'xSLG',
  ev: 'Exit Velo', la: 'Launch Angle',
  whiff_pct: 'Whiff %', chase_pct: 'Chase %', swing_pct: 'Swing %',
}

export const HEATMAP_NB = 16
export const HEATMAP_VXM = -1.76
export const HEATMAP_VXX = 1.76
export const HEATMAP_VZM = 0.24
export const HEATMAP_VZX = 4.06

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const NON_AB_EVENTS = new Set(['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'catcher_interf'])

function isSwingDesc(d: string): boolean {
  return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
}

/** Per-cell metric value. Returns null when the cell has no data. */
export function calcHeatmapMetricCell(pitches: any[], metric: HeatmapMetricKey): number | null {
  if (!pitches.length) return null
  const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  switch (metric) {
    case 'frequency': return pitches.length
    case 'ba': {
      const ab = pitches.filter(p => p.events && !NON_AB_EVENTS.has(p.events))
      const h = ab.filter(p => HIT_EVENTS.has(p.events))
      return ab.length ? h.length / ab.length : null
    }
    case 'slg': {
      const ab = pitches.filter(p => p.events && !NON_AB_EVENTS.has(p.events))
      if (!ab.length) return null
      const tb = ab.reduce((s, p) => s + (p.events === 'single' ? 1 : p.events === 'double' ? 2 : p.events === 'triple' ? 3 : p.events === 'home_run' ? 4 : 0), 0)
      return tb / ab.length
    }
    case 'woba': return avg(pitches.map(p => p.woba_value).filter((x: any) => x != null))
    case 'xba':  return avg(pitches.map(p => p.estimated_ba_using_speedangle).filter((x: any) => x != null))
    case 'xwoba':return avg(pitches.map(p => p.estimated_woba_using_speedangle).filter((x: any) => x != null))
    case 'xslg': return avg(pitches.map(p => p.estimated_slg_using_speedangle).filter((x: any) => x != null))
    case 'ev':   return avg(pitches.map(p => p.launch_speed).filter((x: any) => x != null))
    case 'la':   return avg(pitches.map(p => p.launch_angle).filter((x: any) => x != null))
    case 'whiff_pct': {
      const sw = pitches.filter(p => isSwingDesc(((p.description || '') as string).toLowerCase()))
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
    case 'swing_pct': {
      const sw = pitches.filter(p => isSwingDesc(((p.description || '') as string).toLowerCase()))
      return pitches.length ? sw.length / pitches.length : null
    }
    default: return null
  }
}

/** Bin pitches into a 16×16 grid keyed by plate_x / plate_z. */
export function binPitches(pitches: any[]): any[][][] {
  const xS = (HEATMAP_VXX - HEATMAP_VXM) / HEATMAP_NB
  const yS = (HEATMAP_VZX - HEATMAP_VZM) / HEATMAP_NB
  const bins: any[][][] = Array.from({ length: HEATMAP_NB }, () =>
    Array.from({ length: HEATMAP_NB }, () => []))
  for (const p of pitches) {
    if (p?.plate_x == null || p?.plate_z == null) continue
    const xi = Math.min(Math.max(Math.floor((p.plate_x - HEATMAP_VXM) / xS), 0), HEATMAP_NB - 1)
    const yi = Math.min(Math.max(Math.floor((HEATMAP_VZX - p.plate_z) / yS), 0), HEATMAP_NB - 1)
    bins[yi][xi].push(p)
  }
  return bins
}

/** 2-pass neighbor interpolation — fills nulls when ≥2 neighbors exist. */
export function neighborInterp(z: (number | null)[][]): (number | null)[][] {
  const out = z.map(row => row.slice())
  const nb = HEATMAP_NB
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < nb; r++) for (let c = 0; c < nb; c++) {
      if (out[r][c] !== null) continue
      const neighbors: number[] = []
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < nb && nc >= 0 && nc < nb && out[nr][nc] !== null)
          neighbors.push(out[nr][nc] as number)
      }
      if (neighbors.length >= 2) out[r][c] = neighbors.reduce((a, b) => a + b, 0) / neighbors.length
    }
  }
  return out
}

/** Min-max normalize a grid into [0, 1]. Nulls become 0. Empty grids return all-zeros. */
export function normalizeGrid(z: (number | null)[][]): number[][] {
  const flat = z.flat().filter((v): v is number => v !== null)
  if (!flat.length) return z.map(row => row.map(() => 0))
  const min = Math.min(...flat)
  const max = Math.max(...flat)
  const range = max - min || 1
  return z.map(row => row.map(v => v === null ? 0 : (v - min) / range))
}

/** Build a (binned, metric, neighbor-interp'd) 16×16 grid for one set of pitches. */
export function buildMetricGrid(pitches: any[], metric: HeatmapMetricKey): (number | null)[][] {
  const bins = binPitches(pitches)
  const z = bins.map(row => row.map(cell => calcHeatmapMetricCell(cell, metric)))
  return neighborInterp(z)
}

/** Element-wise multiply of two equally-sized grids (used by overlay widget). */
export function multiplyGrids(a: number[][], b: number[][]): number[][] {
  return a.map((row, r) => row.map((v, c) => v * b[r][c]))
}
