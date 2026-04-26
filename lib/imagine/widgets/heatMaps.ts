/**
 * Heat Maps widget for Imagine.
 *
 * Up to 3 fully-independent strike-zone heatmaps in one card. Each map has
 * its own scope (a player or a team-side), its own filter set (full Reports
 * filter catalog), its own heatmap metric (frequency, BA, wOBA, EV, etc.),
 * and an optional custom title/subtitle (auto-generated when blank).
 *
 * Layout:
 *   1 map  → full canvas
 *   2 maps → side-by-side (landscape) / stacked (vertical)
 *   3 maps → 3 across (landscape) / 3 stacked (vertical)
 *
 * When two or more active maps share the same scope, the player/team
 * photo + name appears once in a deduped "scope header" row above the
 * map tiles, instead of being repeated per tile.
 *
 * NOTE: this file must stay server-safe. The widget's right-panel UI lives
 * in HeatMapsPanel.tsx (a 'use client' component) and is wired into the
 * Imagine page through lib/imagine/panelRegistry.ts.
 */
import type { Scene, SceneElement } from '@/lib/sceneTypes'
import type { Widget, SizePreset } from '@/lib/imagine/types'
// Pure (server-safe) re-exports — components/FilterEngine.tsx is 'use
// client' and can't be imported by the render API server route.
import type { ActiveFilter } from '@/lib/filterEngineCore'
import { applyFiltersToData } from '@/lib/filterEngineCore'

/* ── Types ─────────────────────────────────────────────────────────────── */

export type HeatmapMetric =
  | 'frequency' | 'ba' | 'slg' | 'woba' | 'xba' | 'xwoba' | 'xslg'
  | 'ev' | 'whiff_pct' | 'chase_pct'

export type HeatmapColorMode = 'rainbow' | 'hotcold'

export type PlayerScope = {
  type: 'player'
  playerId: number | null
  playerName: string
  /** Which side of the pitch table the player id should match. */
  col: 'pitcher' | 'batter'
}

export type TeamScope = {
  type: 'team'
  teamCode: string
  side: 'pitching' | 'hitting'
}

export type MapScope = PlayerScope | TeamScope

export type MapConfig = {
  active: boolean
  scope: MapScope
  /** Empty string = use the auto-generated value. */
  customTitle: string
  customSubtitle: string
  metric: HeatmapMetric
  /** 'rainbow' = full-spectrum (default); 'hotcold' = diverging blue→gray→red. */
  colorMode: HeatmapColorMode
  filters: ActiveFilter[]
}

export type HeatMapsFilters = {
  /** Optional overall card title (auto when blank). */
  title?: string
  maps: MapConfig[]   // always length 3
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const CURRENT_YEAR = new Date().getFullYear()

const HEATMAP_METRIC_LABELS: Record<HeatmapMetric, string> = {
  frequency: 'Frequency',
  ba: 'BA',
  slg: 'SLG',
  woba: 'wOBA',
  xba: 'xBA',
  xwoba: 'xwOBA',
  xslg: 'xSLG',
  ev: 'Exit Velo',
  whiff_pct: 'Whiff %',
  chase_pct: 'Chase %',
}

export const HEATMAP_METRIC_OPTIONS: { value: HeatmapMetric; label: string }[] =
  (Object.keys(HEATMAP_METRIC_LABELS) as HeatmapMetric[]).map(v => ({ value: v, label: HEATMAP_METRIC_LABELS[v] }))

const SIZE_PRESETS: SizePreset[] = [
  { label: '1920×1080 (16:9)', width: 1920, height: 1080 },
  { label: '1080×1920 (9:16 Story)', width: 1080, height: 1920 },
  { label: '1080×1080 (1:1 Square)', width: 1080, height: 1080 },
  { label: '1080×1350 (4:5 IG Portrait)', width: 1080, height: 1350 },
  { label: '1200×630 (Twitter/OG)', width: 1200, height: 630 },
]

const BG_COLOR = '#09090b'

/* ── Helpers ───────────────────────────────────────────────────────────── */

function emptyPlayerScope(col: 'pitcher' | 'batter' = 'pitcher'): PlayerScope {
  return { type: 'player', playerId: null, playerName: '', col }
}

function defaultMap(active: boolean): MapConfig {
  return {
    active,
    scope: emptyPlayerScope('pitcher'),
    customTitle: '',
    customSubtitle: '',
    metric: 'frequency',
    colorMode: 'rainbow',
    filters: [],
  }
}

/** Identity key for a scope — used to dedupe fetches and dedupe display. */
export function scopeKey(s: MapScope): string {
  if (s.type === 'player') return `p:${s.playerId ?? 'none'}:${s.col}`
  return `t:${s.teamCode || 'none'}:${s.side}`
}

/** Display label for a scope (used in auto-titles + scope header). */
export function scopeLabel(s: MapScope): string {
  if (s.type === 'player') return s.playerName || 'Player'
  return `${s.teamCode || '—'} ${s.side === 'pitching' ? 'Pitching' : 'Hitting'}`
}

function isScopeReady(s: MapScope): boolean {
  if (s.type === 'player') return !!s.playerId
  return !!s.teamCode
}

/** Auto-title for a map: scope label + metric. */
function autoMapTitle(m: MapConfig): string {
  return scopeLabel(m.scope)
}

/** Auto-subtitle: heatmap metric label + a short filter summary. */
function autoMapSubtitle(m: MapConfig): string {
  const parts: string[] = [HEATMAP_METRIC_LABELS[m.metric]]
  // Inline a short filter summary (first 2 active filters) so the user
  // can tell two same-scope maps apart at a glance.
  const summarized = m.filters
    .map(f => filterSummary(f))
    .filter(Boolean)
    .slice(0, 2)
  if (summarized.length) parts.push(summarized.join(' · '))
  return parts.join(' · ')
}

function filterSummary(f: ActiveFilter): string {
  if (f.def.type === 'multi' && f.values && f.values.length) {
    return `${f.def.label}: ${f.values.slice(0, 3).join(',')}${f.values.length > 3 ? '…' : ''}`
  }
  if (f.def.type === 'range' && (f.min || f.max)) {
    return `${f.def.label} ${f.min || ''}–${f.max || ''}`
  }
  if (f.def.type === 'date' && (f.startDate || f.endDate)) {
    return `${f.startDate || ''} – ${f.endDate || ''}`
  }
  return ''
}

function buildAutoTitle(f: HeatMapsFilters): string {
  // Only ready scopes contribute to the auto-title — otherwise empty tabs
  // would render as "Skenes vs Player vs Player".
  const active = f.maps.filter(m => m.active && isScopeReady(m.scope))
  const labels = active.map(m => scopeLabel(m.scope)).filter(Boolean)
  const unique = Array.from(new Set(labels))
  if (unique.length === 0) return 'Heat Maps'
  if (unique.length === 1) return `${unique[0]} — Heat Maps`
  return `${unique.join(' vs ')}`
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'heatmaps'
}

function buildAutoFilename(f: HeatMapsFilters): string {
  const parts: string[] = ['heatmaps']
  const active = f.maps.filter(m => m.active && isScopeReady(m.scope))
  for (const m of active) parts.push(slug(scopeLabel(m.scope)))
  return parts.join('-')
}

/* ── Data fetch helpers ────────────────────────────────────────────────── */

/** Map a scope onto the role used by league_averages. */
function scopeRole(scope: MapScope): 'hitter' | 'pitching' {
  if (scope.type === 'player') return scope.col === 'batter' ? 'hitter' : 'pitching'
  return scope.side === 'hitting' ? 'hitter' : 'pitching'
}

async function fetchLeagueBaseline(
  origin: string,
  season: number,
  scope: MapScope,
  metric: HeatmapMetric,
): Promise<{ zMid: number; zSpan: number } | null> {
  // Frequency has no league baseline — fall through to data range.
  if (metric === 'frequency') return null
  const params = new URLSearchParams({
    season: String(season),
    level: 'MLB',
    role: scopeRole(scope),
    metric,
  })
  try {
    const res = await fetch(`${origin}/api/league-baseline?${params}`, {
      headers: { 'cache-control': 'no-store' },
    })
    if (!res.ok) return null
    const json = await res.json()
    const b = json?.baseline
    if (!b || b.value == null || b.stddev == null) return null
    return { zMid: Number(b.value), zSpan: 3 * Number(b.stddev) }
  } catch {
    return null
  }
}

async function fetchScope(scope: MapScope, origin: string): Promise<any[]> {
  if (!isScopeReady(scope)) return []
  const params = new URLSearchParams()
  if (scope.type === 'player') {
    params.set('scope', 'player')
    params.set('id', String(scope.playerId))
    params.set('col', scope.col)
  } else {
    params.set('scope', 'team')
    params.set('team', scope.teamCode)
    params.set('side', scope.side)
  }
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

type MapResult = {
  mapIndex: number
  scope: MapScope
  pitches: any[]
  metric: HeatmapMetric
  colorMode: HeatmapColorMode
  customTitle: string
  customSubtitle: string
  /** League baseline for this (scope, metric) — drives the spectrum
   *  midpoint and ±3σ extremes. Null when no baseline is available
   *  (e.g. metric='frequency' or no league row populated yet); the
   *  renderer falls back to data range in that case. */
  zMid: number | null
  zSpan: number | null
}

function buildSceneInternal(
  filters: HeatMapsFilters,
  data: { mapResults: MapResult[] },
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

  // ── Card title ──
  elements.push(makeEl(z, 'text', padX, titleY, width - padX * 2, titleH, {
    text: title, fontSize: titleFs, fontWeight: 800, color: '#ffffff', textAlign: 'center', bgColor: 'transparent',
  }))

  const results = data?.mapResults || []
  if (results.length === 0) {
    return finalize(elements, title, size)
  }

  // ── Deduped scope header row ──
  // Group by scopeKey so the same player/team appears once even if used
  // by multiple maps. Photo + name once per unique scope.
  const seen = new Set<string>()
  const uniqueScopes: MapScope[] = []
  for (const r of results) {
    if (!isScopeReady(r.scope)) continue
    const k = scopeKey(r.scope)
    if (seen.has(k)) continue
    seen.add(k)
    uniqueScopes.push(r.scope)
  }

  const headerTop = titleY + titleH + Math.round(height * 0.014)
  const headerH = uniqueScopes.length > 0 ? Math.round(height * (isLandscape ? 0.18 : 0.10)) : 0

  if (uniqueScopes.length > 0) {
    const slotW = Math.floor((width - padX * 2) / uniqueScopes.length)
    const photoH = Math.round(headerH * 0.78)
    const photoW = Math.round(photoH * 0.83)
    const labelFs = Math.max(13, Math.round(headerH * 0.16))

    uniqueScopes.forEach((s, i) => {
      const slotX = padX + i * slotW
      const groupX = slotX + Math.round((slotW - (photoW + Math.round(slotW * 0.02) + slotW * 0.4)) / 2)
      const photoX = groupX
      const photoY = headerTop

      if (s.type === 'player' && s.playerId) {
        elements.push(makeEl(z, 'player-image', photoX, photoY, photoW, photoH, {
          playerId: s.playerId, playerName: s.playerName,
          borderColor: '#27272a', borderRadius: 8, showLabel: false, bgColor: 'transparent',
        }))
      }

      // Name (and side hint for team scope) sits to the right of the photo.
      const labelX = photoX + photoW + Math.round(slotW * 0.025)
      const labelW = (slotX + slotW) - labelX
      elements.push(makeEl(z, 'text', labelX, photoY + Math.round(photoH * 0.20), labelW, labelFs * 1.5, {
        text: s.type === 'player' ? (s.playerName || 'Player') : (s.teamCode || '—'),
        fontSize: labelFs, fontWeight: 700, color: '#ffffff', textAlign: 'left', bgColor: 'transparent',
      }))
      elements.push(makeEl(z, 'text', labelX, photoY + Math.round(photoH * 0.50), labelW, labelFs * 1.4, {
        text: s.type === 'player' ? (s.col === 'batter' ? 'Hitting' : 'Pitching') : (s.side === 'pitching' ? 'Pitching' : 'Hitting'),
        fontSize: Math.round(labelFs * 0.78), fontWeight: 500, color: '#71717a', textAlign: 'left', bgColor: 'transparent',
      }))
    })
  }

  // ── Map tiles ──
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

  // Each tile: caption (top) + heatmap (rest).
  const captionH = Math.max(36, Math.round(tileH * 0.13))
  const captionFs = Math.max(13, Math.round(captionH * 0.42))
  const sublineFs = Math.max(10, Math.round(captionH * 0.26))

  for (let i = 0; i < N; i++) {
    const r = results[i]
    const ready = isScopeReady(r.scope)
    const col = i % cols
    const row = Math.floor(i / cols)
    const tileX = padX + col * (tileW + gutter)
    const tileY = tilesTop + row * (tileH + gutter)

    let captionTitle: string
    let captionSubtitle: string
    if (ready) {
      const synthMap: MapConfig = { active: true, scope: r.scope, metric: r.metric, colorMode: r.colorMode, customTitle: '', customSubtitle: '', filters: [] }
      captionTitle = (r.customTitle.trim() || autoMapTitle(synthMap))
      captionSubtitle = (r.customSubtitle.trim() || autoMapSubtitle(synthMap))
    } else {
      captionTitle = `Map ${r.mapIndex + 1}`
      captionSubtitle = 'Pick a player or team'
    }

    // Caption block
    elements.push(makeEl(z, 'text', tileX, tileY, tileW, Math.round(captionFs * 1.5), {
      text: captionTitle, fontSize: captionFs, fontWeight: 700,
      color: ready ? '#ffffff' : '#52525b',
      textAlign: 'center', bgColor: 'transparent',
    }))
    elements.push(makeEl(z, 'text', tileX, tileY + Math.round(captionFs * 1.5) + 2, tileW, Math.round(sublineFs * 1.6), {
      text: captionSubtitle, fontSize: sublineFs, fontWeight: 500,
      color: ready ? '#71717a' : '#3f3f46',
      textAlign: 'center', bgColor: 'transparent',
    }))

    // Heatmap element. Not-ready scopes render an empty tile — the strike-
    // zone outline still draws (placeholder) and the legend is hidden so
    // there's no garbage 0–1 scale under it.
    const mapTop = tileY + captionH
    const mapH = tileH - captionH
    elements.push(makeEl(z, 'rc-heatmap', tileX, mapTop, tileW, mapH, {
      locations: ready ? r.pitches.map((p: any) => ({
        plate_x: p.plate_x, plate_z: p.plate_z,
        // metric calc fields (used by the extended drawRCHeatmap)
        events: p.events, description: p.description, type: p.type, zone: p.zone,
        launch_speed: p.launch_speed,
        estimated_ba_using_speedangle: p.estimated_ba_using_speedangle,
        estimated_woba_using_speedangle: p.estimated_woba_using_speedangle,
        estimated_slg_using_speedangle: p.estimated_slg_using_speedangle,
        woba_value: p.woba_value, game_year: p.game_year,
      })) : [],
      metric: r.metric,
      colorMode: r.colorMode,
      // League baseline drives spectrum midpoint + ±3σ extremes. When
      // null, the renderer falls back to data range.
      zMid: r.zMid,
      zSpan: r.zSpan,
      bgColor: '#0f0f12',
      borderRadius: 10,
      showZone: true,
      showLegend: ready,
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

const heatMaps: Widget<HeatMapsFilters> = {
  id: 'heat-maps',
  name: 'Heat Maps',
  description: 'Up to 3 strike-zone heatmaps, each with its own scope and filters.',

  // The Heat Maps panel is rendered via the client-only PANEL_REGISTRY in
  // lib/imagine/panelRegistry.ts (HeatMapsPanel.tsx). filterSchema stays
  // empty here so the standard FilterPanel is never used for this widget.
  filterSchema: [],

  defaultFilters: {
    title: '',
    maps: [defaultMap(true), defaultMap(false), defaultMap(false)],
  },

  sizePresets: SIZE_PRESETS,
  defaultSize: SIZE_PRESETS[0],

  autoTitle: buildAutoTitle,
  autoFilename: buildAutoFilename,

  async fetchData(filters, origin) {
    // Every active map gets a tile in the output, even if its scope isn't
    // ready yet — the panel and preview need to stay in sync so the user
    // can see *which* tabs they activated. Only the ready ones actually
    // fetch pitch data and league baselines; the rest render as
    // placeholder tiles in buildSceneInternal.
    const active = filters.maps.map((m, i) => ({ m, i })).filter(({ m }) => m.active)
    if (active.length === 0) return { mapResults: [] }
    const ready = active.filter(({ m }) => isScopeReady(m.scope))

    // Dedupe scopes so we fetch each unique one exactly once.
    const fetchByKey = new Map<string, Promise<any[]>>()
    for (const { m } of ready) {
      const k = scopeKey(m.scope)
      if (!fetchByKey.has(k)) fetchByKey.set(k, fetchScope(m.scope, origin))
    }
    const resolved = new Map<string, any[]>()
    await Promise.all(Array.from(fetchByKey.entries()).map(async ([k, p]) => {
      try { resolved.set(k, await p) } catch { resolved.set(k, []) }
    }))

    // League baseline lookup, deduped by (role, metric) — heatmap-relevant
    // metrics (BA / wOBA / EV / whiff% / etc.) center on the league mean,
    // with hot/cold extremes at ±3σ. Frequency has no baseline.
    const season = CURRENT_YEAR
    const baselineKey = (s: MapScope, metric: string) => `${scopeRole(s)}:${metric}`
    const baselineFetches = new Map<string, Promise<{ zMid: number; zSpan: number } | null>>()
    for (const { m } of ready) {
      const k = baselineKey(m.scope, m.metric)
      if (!baselineFetches.has(k)) {
        baselineFetches.set(k, fetchLeagueBaseline(origin, season, m.scope, m.metric))
      }
    }
    const baselines = new Map<string, { zMid: number; zSpan: number } | null>()
    await Promise.all(Array.from(baselineFetches.entries()).map(async ([k, p]) => {
      baselines.set(k, await p)
    }))

    const mapResults: MapResult[] = active.map(({ m, i }) => {
      const isReady = isScopeReady(m.scope)
      const k = scopeKey(m.scope)
      const raw = isReady ? (resolved.get(k) || []) : []
      const filtered = isReady && m.filters.length ? applyFiltersToData(raw, m.filters) : raw
      const baseline = isReady ? (baselines.get(baselineKey(m.scope, m.metric)) || null) : null
      return {
        mapIndex: i,
        scope: m.scope,
        pitches: filtered,
        metric: m.metric,
        colorMode: m.colorMode || 'rainbow',
        customTitle: m.customTitle,
        customSubtitle: m.customSubtitle,
        zMid: baseline?.zMid ?? null,
        zSpan: baseline?.zSpan ?? null,
      }
    })
    return { mapResults }
  },

  buildScene(filters, data, size) {
    return buildSceneInternal(filters, data || { mapResults: [] }, size)
  },
}

export default heatMaps
