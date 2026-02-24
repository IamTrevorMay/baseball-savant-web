/**
 * stylePresets — Global style customization system for the Visualize tool.
 *
 * Provides style settings, palettes, and helpers that all templates consume
 * to render with user-customized colors, fonts, and layout options.
 */

import { getPitchColor, COLORS, BASE_LAYOUT } from '@/components/chartConfig'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StyleSettings {
  // Colors
  paletteId: string
  pitchColorOverrides: Record<string, string>
  backgroundColor: string

  // Rendering
  trailLength: number      // 0-20
  trailOpacity: number     // 0-1
  trailWidth: number       // 1-5
  ballSize: number         // 0.5-3x multiplier
  glowEnabled: boolean

  // Animation
  playbackSpeed: number    // 0.25-4x
  batchSize: number        // 1-20
  maxPitchOverride: number // 0 = use quality preset

  // Display
  titleOverride: string
  subtitleText: string
  watermarkText: string
  fontScale: number        // 0.75-2x
  showLegend: boolean
  showAxisLabels: boolean
  showGridLines: boolean
  showStatCallouts: boolean
}

export interface PalettePreset {
  id: string
  name: string
  colors: Record<string, string>
  backgroundColor: string
}

// ---------------------------------------------------------------------------
// Default style
// ---------------------------------------------------------------------------

export const DEFAULT_STYLE: StyleSettings = {
  paletteId: 'default',
  pitchColorOverrides: {},
  backgroundColor: '',

  trailLength: 6,
  trailOpacity: 0.4,
  trailWidth: 2,
  ballSize: 1,
  glowEnabled: true,

  playbackSpeed: 1,
  batchSize: 5,
  maxPitchOverride: 0,

  titleOverride: '',
  subtitleText: '',
  watermarkText: '',
  fontScale: 1,
  showLegend: true,
  showAxisLabels: true,
  showGridLines: true,
  showStatCallouts: true,
}

// ---------------------------------------------------------------------------
// Palette presets
// ---------------------------------------------------------------------------

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'default',
    name: 'Default',
    colors: {},
    backgroundColor: '',
  },
  {
    id: 'broadcast',
    name: 'Broadcast',
    colors: {
      '4-Seam Fastball': '#ff3b3b', 'Sinker': '#ff8c42', 'Cutter': '#ffd166',
      'Slider': '#3a86ff', 'Sweeper': '#48bfe3', 'Changeup': '#06d6a0',
      'Splitter': '#2dc653', 'Curveball': '#9b5de5', 'Knuckle Curve': '#7b2cbf',
    },
    backgroundColor: '#0a0e1a',
  },
  {
    id: 'print',
    name: 'Print',
    colors: {
      '4-Seam Fastball': '#c1272d', 'Sinker': '#d4621b', 'Cutter': '#b5892e',
      'Slider': '#2b5ea7', 'Sweeper': '#3a7ca5', 'Changeup': '#2d8659',
      'Splitter': '#3b7a57', 'Curveball': '#6b3fa0', 'Knuckle Curve': '#553285',
    },
    backgroundColor: '#f5f5f0',
  },
  {
    id: 'colorblind',
    name: 'Colorblind Safe',
    colors: {
      '4-Seam Fastball': '#d55e00', 'Sinker': '#e69f00', 'Cutter': '#f0e442',
      'Slider': '#0072b2', 'Sweeper': '#56b4e9', 'Changeup': '#009e73',
      'Splitter': '#cc79a7', 'Curveball': '#000000', 'Knuckle Curve': '#666666',
    },
    backgroundColor: '',
  },
  {
    id: 'neon',
    name: 'Neon',
    colors: {
      '4-Seam Fastball': '#ff0040', 'Sinker': '#ff6600', 'Cutter': '#ffcc00',
      'Slider': '#00ccff', 'Sweeper': '#00ffcc', 'Changeup': '#00ff66',
      'Splitter': '#66ff00', 'Curveball': '#cc00ff', 'Knuckle Curve': '#ff00cc',
    },
    backgroundColor: '#050510',
  },
]

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get pitch color respecting style overrides, then palette, then default.
 */
export function getStyledPitchColor(pitchName: string, style: StyleSettings): string {
  // 1. Explicit user override
  if (style.pitchColorOverrides[pitchName]) {
    return style.pitchColorOverrides[pitchName]
  }

  // 2. Palette preset colors
  const palette = PALETTE_PRESETS.find(p => p.id === style.paletteId)
  if (palette && palette.colors[pitchName]) {
    return palette.colors[pitchName]
  }

  // 3. Default
  return getPitchColor(pitchName)
}

/**
 * Apply style settings to a Plotly layout object (mutates and returns).
 */
export function applyStyleToLayout(layout: any, style: StyleSettings): any {
  const patched = { ...layout }

  // Background
  const bg = style.backgroundColor ||
    PALETTE_PRESETS.find(p => p.id === style.paletteId)?.backgroundColor ||
    COLORS.bg
  const paper = style.paletteId === 'print' ? '#f5f5f0' : COLORS.paper

  patched.paper_bgcolor = paper
  patched.plot_bgcolor = bg

  // Font scale
  const baseSize = 11
  const titleSize = 14
  patched.font = {
    ...BASE_LAYOUT.font,
    size: Math.round(baseSize * style.fontScale),
  }

  // Title
  if (style.titleOverride || style.subtitleText) {
    const title = style.titleOverride || patched.title?.text || ''
    const sub = style.subtitleText ? `<br><span style="font-size:${Math.round(10 * style.fontScale)}px;color:${COLORS.text}">${style.subtitleText}</span>` : ''
    patched.title = {
      ...patched.title,
      text: title + sub,
      font: { size: Math.round(titleSize * style.fontScale), color: COLORS.textLight },
    }
  }

  // Grid
  if (!style.showGridLines) {
    patched.xaxis = { ...patched.xaxis, showgrid: false }
    patched.yaxis = { ...patched.yaxis, showgrid: false }
  }

  // Axis labels
  if (!style.showAxisLabels) {
    patched.xaxis = { ...patched.xaxis, title: '' }
    patched.yaxis = { ...patched.yaxis, title: '' }
  }

  // Legend
  patched.showlegend = style.showLegend

  return patched
}
