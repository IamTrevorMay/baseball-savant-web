/**
 * Heat Map Overlays widget for Imagine.
 *
 * Up to 3 fully-independent overlay heatmaps in one card. Each overlay
 * combines two players (player vs player) — each with their own role
 * (pitcher | hitter) and metric — into a single map by element-wise
 * multiplying the two players' normalized 16×16 grids. Brighter cells =
 * locations where both players concentrate. Same logic as the Reports
 * page's TileHeatmapOverlay.
 *
 * Each overlay shares one filter set (full Reports filter catalog),
 * applied identically to both sides. Custom title/subtitle and
 * rainbow/hot-cold color mode per overlay. League baseline does NOT
 * apply (the rendered value is the unitless [0,1] product of two
 * normalized grids — there's no metric mean to center on).
 *
 * Layout follows Heat Maps:
 *   1 overlay  → full canvas
 *   2 overlays → side-by-side / stacked
 *   3 overlays → 3 across / 3 stacked
 *
 * Header strip dedupes by player_id across ALL overlays — one photo per
 * unique player, regardless of which side or how many overlays they
 * appear in.
 *
 * NOTE: server-safe. The right-panel UI lives in HeatMapOverlaysPanel.tsx
 * (a 'use client' component) and is wired through panelRegistry.ts.
 */
import type { Scene, SceneElement } from '@/lib/sceneTypes'
import type { Widget, SizePreset } from '@/lib/imagine/types'
import type { ActiveFilter } from '@/lib/filterEngineCore'
import { applyFiltersToData } from '@/lib/filterEngineCore'
import {
  buildMetricGrid, normalizeGrid, multiplyGrids,
  HEATMAP_METRIC_LABELS, type HeatmapMetricKey,
} from '@/lib/imagine/heatmapMetrics'

/* ── Types ─────────────────────────────────────────────────────────────── */

export type OverlayRole = 'pitcher' | 'hitter'
export type OverlayColorMode = 'rainbow' | 'hotcold'

export type OverlayPlayer = {
  playerId: number | null
  playerName: string
  role: OverlayRole
  metric: HeatmapMetricKey
}

export type OverlayConfig = {
  active: boolean
  sideA: OverlayPlayer
  sideB: OverlayPlayer
  customTitle: string
  customSubtitle: string
  colorMode: OverlayColorMode
  /** Shared filter set, applied identically to both sides. */
  filters: ActiveFilter[]
}

export type HeatMapOverlaysFilters = {
  title?: string
  overlays: OverlayConfig[]   // always length 3
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const SIZE_PRESETS: SizePreset[] = [
  { label: '1920×1080 (16:9)', width: 1920, height: 1080 },
  { label: '1080×1920 (9:16 Story)', width: 1080, height: 1920 },
  { label: '1080×1080 (1:1 Square)', width: 1080, height: 1080 },
  { label: '1080×1350 (4:5 IG Portrait)', width: 1080, height: 1350 },
  { label: '1200×630 (Twitter/OG)', width: 1200, height: 630 },
]

const BG_COLOR = '#09090b'

export const HEATMAP_OVERLAY_METRIC_OPTIONS: { value: HeatmapMetricKey; label: string }[] =
  (Object.keys(HEATMAP_METRIC_LABELS) as HeatmapMetricKey[])
    .map(v => ({ value: v, label: HEATMAP_METRIC_LABELS[v] }))

/* ── Helpers ───────────────────────────────────────────────────────────── */

function emptyPlayer(role: OverlayRole = 'pitcher'): OverlayPlayer {
  return { playerId: null, playerName: '', role, metric: 'frequency' }
}

function defaultOverlay(active: boolean): OverlayConfig {
  return {
    active,
    sideA: emptyPlayer('pitcher'),
    sideB: emptyPlayer('hitter'),
    customTitle: '',
    customSubtitle: '',
    colorMode: 'rainbow',
    filters: [],
  }
}

/** Identity key for one side — used to dedupe pitch fetches. */
function sideKey(p: OverlayPlayer): string {
  return `p:${p.playerId ?? 'none'}:${p.role === 'hitter' ? 'batter' : 'pitcher'}`
}

function isPlayerReady(p: OverlayPlayer): boolean {
  return p.playerId != null
}

function isOverlayReady(c: OverlayConfig): boolean {
  return isPlayerReady(c.sideA) && isPlayerReady(c.sideB)
}

function overlayLabel(c: OverlayConfig): string {
  const a = c.sideA.playerName || 'Player A'
  const b = c.sideB.playerName || 'Player B'
  return `${a} × ${b}`
}

function autoOverlaySubtitle(c: OverlayConfig): string {
  const ma = HEATMAP_METRIC_LABELS[c.sideA.metric] || c.sideA.metric
  const mb = HEATMAP_METRIC_LABELS[c.sideB.metric] || c.sideB.metric
  // Same metric on both sides → say it once.
  const metricPart = ma === mb ? ma : `${ma} × ${mb}`
  const filterCount = c.filters.length
  if (filterCount > 0) return `${metricPart} · ${filterCount} filter${filterCount > 1 ? 's' : ''}`
  return metricPart
}

function buildAutoTitle(f: HeatMapOverlaysFilters): string {
  // Only ready overlays contribute. Otherwise empty tabs read as
  // "Player A × Player B" garbage.
  const ready = f.overlays.filter(c => c.active && isOverlayReady(c))
  if (ready.length === 0) return 'Heat Map Overlays'
  if (ready.length === 1) return `${overlayLabel(ready[0])} — Overlay`
  return ready.map(overlayLabel).join(' / ')
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'overlay'
}

function buildAutoFilename(f: HeatMapOverlaysFilters): string {
  const parts: string[] = ['heatmap-overlays']
  for (const c of f.overlays.filter(o => o.active && isOverlayReady(o))) {
    parts.push(slug(`${c.sideA.playerName}-x-${c.sideB.playerName}`))
  }
  return parts.join('-')
}

/* ── Data fetch helpers ────────────────────────────────────────────────── */

async function fetchSidePitches(p: OverlayPlayer, origin: string): Promise<any[]> {
  if (!isPlayerReady(p)) return []
  const params = new URLSearchParams()
  params.set('scope', 'player')
  params.set('id', String(p.playerId))
  params.set('col', p.role === 'hitter' ? 'batter' : 'pitcher')
  const res = await fetch(`${origin}/api/imagine/heatmap-data?${params}`, {
    headers: { 'cache-control': 'no-store' },
  })
  if (!res.ok) throw new Error(`heatmap-data fetch failed: ${res.status}`)
  const json = await res.json()
  return json.rows || []
}

/* ── Layout primitives ─────────────────────────────────────────────────── */

function makeEl(
  z: { current: number },
  type: SceneElement['type'],
  x: number, y: number, w: number, h: number,
  props: Record<string, any>,
): SceneElement {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    x: Math.round(x), y: Math.round(y),
    width: Math.round(w), height: Math.round(h),
    rotation: 0, opacity: 1,
    zIndex: ++z.current,
    locked: false,
    props,
  }
}

/* ── Scene builder ─────────────────────────────────────────────────────── */

type OverlayResult = {
  index: number
  ready: boolean
  sideA: OverlayPlayer
  sideB: OverlayPlayer
  customTitle: string
  customSubtitle: string
  colorMode: OverlayColorMode
  filterSummary: string
  /** Precomputed [0,1] 16×16 overlay grid. Null when the overlay isn't ready. */
  gridZ: number[][] | null
}

function buildSceneInternal(
  filters: HeatMapOverlaysFilters,
  data: { results: OverlayResult[] },
  size: SizePreset,
): Scene {
  const { width, height } = size
  const aspect = width / height
  const isLandscape = aspect >= 1.5

  const z = { current: 100 }
  const elements: SceneElement[] = []

  const userTitle = (filters.title || '').trim()
  const title = userTitle || buildAutoTitle(filters)

  const padX = Math.max(36, Math.round(width * 0.030))
  const titleY = Math.round(height * 0.022)
  const titleFs = Math.max(28, Math.round(Math.min(width, height * 1.5) * 0.038))
  const titleH = Math.round(titleFs * 1.3)

  // Card title
  elements.push(makeEl(z, 'text', padX, titleY, width - padX * 2, titleH, {
    text: title, fontSize: titleFs, fontWeight: 800, color: '#ffffff', textAlign: 'center', bgColor: 'transparent',
  }))

  const results = data?.results || []
  if (results.length === 0) return finalize(elements, title, size)

  // ── Deduped header: one photo per unique player across all overlays ──
  type UniqPlayer = { playerId: number; playerName: string; role: OverlayRole }
  const seen = new Set<number>()
  const uniquePlayers: UniqPlayer[] = []
  for (const r of results) {
    for (const side of [r.sideA, r.sideB]) {
      if (!isPlayerReady(side) || side.playerId == null) continue
      if (seen.has(side.playerId)) continue
      seen.add(side.playerId)
      uniquePlayers.push({ playerId: side.playerId, playerName: side.playerName, role: side.role })
    }
  }

  const headerTop = titleY + titleH + Math.round(height * 0.014)
  const headerH = uniquePlayers.length > 0 ? Math.round(height * (isLandscape ? 0.18 : 0.10)) : 0

  if (uniquePlayers.length > 0) {
    const slotW = Math.floor((width - padX * 2) / uniquePlayers.length)
    const photoH = Math.round(headerH * 0.78)
    const photoW = Math.round(photoH * 0.83)
    const labelFs = Math.max(13, Math.round(headerH * 0.16))
    const gap = Math.round(slotW * 0.025)

    uniquePlayers.forEach((u, i) => {
      const slotX = padX + i * slotW
      const photoY = headerTop

      const nameText = u.playerName || 'Player'
      const roleText = u.role === 'hitter' ? 'Hitting' : 'Pitching'
      const nameTextW = Math.ceil(nameText.length * labelFs * 0.55)
      const roleTextW = Math.ceil(roleText.length * labelFs * 0.78 * 0.55)
      const labelW = Math.max(nameTextW, roleTextW)

      const groupW = photoW + gap + labelW
      const photoX = slotX + Math.round((slotW - groupW) / 2)
      const labelX = photoX + photoW + gap

      elements.push(makeEl(z, 'player-image', photoX, photoY, photoW, photoH, {
        playerId: u.playerId, playerName: u.playerName,
        borderColor: '#27272a', borderRadius: 8, showLabel: false, bgColor: 'transparent',
      }))

      elements.push(makeEl(z, 'text', labelX, photoY + Math.round(photoH * 0.20), labelW, labelFs * 1.5, {
        text: nameText,
        fontSize: labelFs, fontWeight: 700, color: '#ffffff', textAlign: 'left', bgColor: 'transparent',
      }))
      elements.push(makeEl(z, 'text', labelX, photoY + Math.round(photoH * 0.50), labelW, labelFs * 1.4, {
        text: roleText,
        fontSize: Math.round(labelFs * 0.78), fontWeight: 500, color: '#71717a', textAlign: 'left', bgColor: 'transparent',
      }))
    })
  }

  // ── Overlay tiles ──
  const tilesTop = headerTop + headerH + Math.round(height * 0.018)
  const tilesBottom = height - Math.round(height * 0.025)
  const tilesAreaH = Math.max(160, tilesBottom - tilesTop)
  const tilesAreaW = width - padX * 2
  const N = results.length

  const cols = isLandscape ? N : 1
  const rows = isLandscape ? 1 : N
  const gutter = Math.max(14, Math.round(Math.min(width, height) * 0.014))
  const tileW = Math.floor((tilesAreaW - gutter * (cols - 1)) / cols)
  const tileH = Math.floor((tilesAreaH - gutter * (rows - 1)) / rows)

  const captionH = Math.max(36, Math.round(tileH * 0.13))
  const captionFs = Math.max(13, Math.round(captionH * 0.42))
  const sublineFs = Math.max(10, Math.round(captionH * 0.26))

  for (let i = 0; i < N; i++) {
    const r = results[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const tileX = padX + col * (tileW + gutter)
    const tileY = tilesTop + row * (tileH + gutter)

    let captionTitle: string
    let captionSubtitle: string
    if (r.ready) {
      const synthC: OverlayConfig = {
        active: true, sideA: r.sideA, sideB: r.sideB,
        customTitle: '', customSubtitle: '',
        colorMode: r.colorMode, filters: [],
      }
      captionTitle = (r.customTitle.trim() || overlayLabel(synthC))
      captionSubtitle = (r.customSubtitle.trim() || autoOverlaySubtitle({
        ...synthC, filters: [], // for the auto subtitle we just want metric x metric
      }) + (r.filterSummary ? ` · ${r.filterSummary}` : ''))
    } else {
      captionTitle = `Overlay ${r.index + 1}`
      captionSubtitle = 'Pick two players'
    }

    elements.push(makeEl(z, 'text', tileX, tileY, tileW, Math.round(captionFs * 1.5), {
      text: captionTitle, fontSize: captionFs, fontWeight: 700,
      color: r.ready ? '#ffffff' : '#52525b',
      textAlign: 'center', bgColor: 'transparent',
    }))
    elements.push(makeEl(z, 'text', tileX, tileY + Math.round(captionFs * 1.5) + 2, tileW, Math.round(sublineFs * 1.6), {
      text: captionSubtitle, fontSize: sublineFs, fontWeight: 500,
      color: r.ready ? '#71717a' : '#3f3f46',
      textAlign: 'center', bgColor: 'transparent',
    }))

    const mapTop = tileY + captionH
    const mapH = tileH - captionH
    elements.push(makeEl(z, 'rc-heatmap', tileX, mapTop, tileW, mapH, {
      // Empty locations — the renderer reads gridZ instead when present.
      locations: [],
      // 'overlap' is a sentinel metric that drives legend formatting; the
      // grid is a unitless [0,1] product, not a real metric value.
      metric: 'overlap',
      colorMode: r.colorMode,
      gridZ: r.gridZ,
      // No league baseline for overlays — fall back to data range.
      zMid: null, zSpan: null,
      bgColor: '#0f0f12',
      borderRadius: 10,
      showZone: true,
      showLegend: r.ready,
      title: '',
    }))
  }

  return finalize(elements, title, size)
}

function finalize(elements: SceneElement[], title: string, size: SizePreset): Scene {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: title,
    width: size.width,
    height: size.height,
    background: BG_COLOR,
    elements,
    duration: 5,
    fps: 30,
  }
}

/* ── Widget definition ─────────────────────────────────────────────────── */

const heatMapOverlays: Widget<HeatMapOverlaysFilters> = {
  id: 'heat-map-overlays',
  name: 'Heat Map Overlays',
  description: 'Up to 3 player-vs-player overlay heatmaps — element-wise overlap of two players.',

  filterSchema: [],

  defaultFilters: {
    title: '',
    overlays: [defaultOverlay(true), defaultOverlay(false), defaultOverlay(false)],
  },

  sizePresets: SIZE_PRESETS,
  defaultSize: SIZE_PRESETS[0],

  autoTitle: buildAutoTitle,
  autoFilename: buildAutoFilename,

  async fetchData(filters, origin) {
    const active = filters.overlays
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.active)
    if (active.length === 0) return { results: [] }

    // Dedupe pitch fetches by (playerId, role) across all sides of all
    // active overlays — same player on both sides of the same overlay,
    // or shared between overlays, only fetches once.
    const fetchByKey = new Map<string, Promise<any[]>>()
    for (const { c } of active) {
      for (const side of [c.sideA, c.sideB]) {
        if (!isPlayerReady(side)) continue
        const k = sideKey(side)
        if (!fetchByKey.has(k)) fetchByKey.set(k, fetchSidePitches(side, origin))
      }
    }
    const resolved = new Map<string, any[]>()
    await Promise.all(Array.from(fetchByKey.entries()).map(async ([k, p]) => {
      try { resolved.set(k, await p) } catch { resolved.set(k, []) }
    }))

    const results: OverlayResult[] = active.map(({ c, i }) => {
      const ready = isOverlayReady(c)
      let gridZ: number[][] | null = null
      if (ready) {
        const aRaw = resolved.get(sideKey(c.sideA)) || []
        const bRaw = resolved.get(sideKey(c.sideB)) || []
        // Shared filter set applied to both sides identically (matches
        // the Reports overlay tile semantics).
        const aFiltered = c.filters.length ? applyFiltersToData(aRaw, c.filters) : aRaw
        const bFiltered = c.filters.length ? applyFiltersToData(bRaw, c.filters) : bRaw
        const zA = buildMetricGrid(aFiltered, c.sideA.metric)
        const zB = buildMetricGrid(bFiltered, c.sideB.metric)
        const nA = normalizeGrid(zA)
        const nB = normalizeGrid(zB)
        gridZ = multiplyGrids(nA, nB)
      }
      const filterSummary = c.filters.length
        ? `${c.filters.length} filter${c.filters.length > 1 ? 's' : ''}`
        : ''
      return {
        index: i,
        ready,
        sideA: c.sideA,
        sideB: c.sideB,
        customTitle: c.customTitle,
        customSubtitle: c.customSubtitle,
        colorMode: c.colorMode || 'rainbow',
        filterSummary,
        gridZ,
      }
    })
    return { results }
  },

  buildScene(filters, data, size) {
    return buildSceneInternal(filters, data || { results: [] }, size)
  },
}

export default heatMapOverlays
