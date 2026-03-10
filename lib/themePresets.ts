/**
 * themePresets — Curated visual theme presets for Scene Composer / Template Builder.
 * Each preset transforms colors, fonts, borders, shadows, glass effects, and backgrounds.
 */

import { Scene, SceneElement } from './sceneTypes'
import { TeamPalette } from './teamColors'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ShadowPreset {
  blur: number
  offsetX: number
  offsetY: number
  color: string
}

export interface GlassEffect {
  blurAmount: number
  bgOpacity: number
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  background: string
  primary: string
  secondary: string
  accent: string
  textColor: string
  headingFont: string
  bodyFont: string
  statCard: { variant: 'glass' | 'solid' | 'outline'; fontSize: number }
  shapeStrokeWidth: number
  borderRadius: number
  borderColor: string
  borderWidth: number
  shadow: ShadowPreset
  glass: GlassEffect
}

// ── 12 Preset Definitions ───────────────────────────────────────────────────

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'miami-vice',
    name: 'Miami Vice',
    description: 'Neon pink & cyan with glass effects',
    background: '#0d001a',
    primary: '#ff2d78',
    secondary: '#00ffe7',
    accent: '#b44fff',
    textColor: '#ffffff',
    headingFont: 'Righteous',
    bodyFont: 'Inter',
    statCard: { variant: 'glass', fontSize: 18 },
    shapeStrokeWidth: 2,
    borderRadius: 12,
    borderColor: '#ff2d7840',
    borderWidth: 1,
    shadow: { blur: 20, offsetX: 0, offsetY: 4, color: '#ff2d7860' },
    glass: { blurAmount: 12, bgOpacity: 0.15 },
  },
  {
    id: '8-bit',
    name: '8-Bit',
    description: 'Retro pixel arcade style',
    background: '#000033',
    primary: '#ffff00',
    secondary: '#ff0000',
    accent: '#00ff00',
    textColor: '#ffffff',
    headingFont: 'Righteous',
    bodyFont: 'Source Code Pro',
    statCard: { variant: 'solid', fontSize: 16 },
    shapeStrokeWidth: 3,
    borderRadius: 0,
    borderColor: '#ffff00',
    borderWidth: 2,
    shadow: { blur: 0, offsetX: 4, offsetY: 4, color: '#00000080' },
    glass: { blurAmount: 0, bgOpacity: 0.9 },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Gold & teal film-grade look',
    background: '#0a0705',
    primary: '#d4a853',
    secondary: '#2d7d7d',
    accent: '#f5f0e8',
    textColor: '#f5f0e8',
    headingFont: 'Playfair Display',
    bodyFont: 'Montserrat',
    statCard: { variant: 'glass', fontSize: 18 },
    shapeStrokeWidth: 1,
    borderRadius: 8,
    borderColor: '#d4a85330',
    borderWidth: 1,
    shadow: { blur: 24, offsetX: 0, offsetY: 8, color: '#00000060' },
    glass: { blurAmount: 16, bgOpacity: 0.1 },
  },
  {
    id: 'classic-baseball',
    name: 'Classic Baseball',
    description: 'Warm leather & wood tones',
    background: '#1a1008',
    primary: '#b5651d',
    secondary: '#8b4513',
    accent: '#f5deb3',
    textColor: '#f5deb3',
    headingFont: 'Playfair Display',
    bodyFont: 'Playfair Display',
    statCard: { variant: 'solid', fontSize: 18 },
    shapeStrokeWidth: 2,
    borderRadius: 6,
    borderColor: '#b5651d60',
    borderWidth: 2,
    shadow: { blur: 12, offsetX: 2, offsetY: 4, color: '#00000050' },
    glass: { blurAmount: 0, bgOpacity: 0.85 },
  },
  {
    id: 'retro-scoreboard',
    name: 'Retro Scoreboard',
    description: 'Classic scoreboard gold & green',
    background: '#1a1200',
    primary: '#ffd700',
    secondary: '#228b22',
    accent: '#fff8dc',
    textColor: '#fff8dc',
    headingFont: 'Anton',
    bodyFont: 'Oswald',
    statCard: { variant: 'solid', fontSize: 20 },
    shapeStrokeWidth: 3,
    borderRadius: 4,
    borderColor: '#ffd70050',
    borderWidth: 2,
    shadow: { blur: 8, offsetX: 2, offsetY: 2, color: '#00000070' },
    glass: { blurAmount: 0, bgOpacity: 0.9 },
  },
  {
    id: 'neon-night',
    name: 'Neon Night',
    description: 'Electric neon outlines on dark',
    background: '#050510',
    primary: '#ff0090',
    secondary: '#00f5ff',
    accent: '#bf00ff',
    textColor: '#ffffff',
    headingFont: 'Righteous',
    bodyFont: 'Inter',
    statCard: { variant: 'outline', fontSize: 18 },
    shapeStrokeWidth: 2,
    borderRadius: 10,
    borderColor: '#ff009060',
    borderWidth: 2,
    shadow: { blur: 16, offsetX: 0, offsetY: 0, color: '#ff009050' },
    glass: { blurAmount: 8, bgOpacity: 0.05 },
  },
  {
    id: 'newsroom',
    name: 'Newsroom',
    description: 'Bold broadcast news style',
    background: '#0a0a0a',
    primary: '#cc0000',
    secondary: '#1a3a6b',
    accent: '#ffffff',
    textColor: '#ffffff',
    headingFont: 'Oswald',
    bodyFont: 'Roboto Condensed',
    statCard: { variant: 'solid', fontSize: 18 },
    shapeStrokeWidth: 2,
    borderRadius: 4,
    borderColor: '#cc000060',
    borderWidth: 2,
    shadow: { blur: 8, offsetX: 0, offsetY: 4, color: '#00000060' },
    glass: { blurAmount: 0, bgOpacity: 0.9 },
  },
  {
    id: 'vintage-card',
    name: 'Vintage Card',
    description: 'Classic trading card aesthetic',
    background: '#f5e6c8',
    primary: '#8b1a1a',
    secondary: '#2c4a1e',
    accent: '#d4a017',
    textColor: '#2c1810',
    headingFont: 'Playfair Display',
    bodyFont: 'Playfair Display',
    statCard: { variant: 'solid', fontSize: 17 },
    shapeStrokeWidth: 2,
    borderRadius: 6,
    borderColor: '#8b1a1a40',
    borderWidth: 2,
    shadow: { blur: 6, offsetX: 1, offsetY: 3, color: '#00000030' },
    glass: { blurAmount: 0, bgOpacity: 0.9 },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Clean black & white minimal',
    background: '#0a0a0a',
    primary: '#ffffff',
    secondary: '#666666',
    accent: '#cccccc',
    textColor: '#ffffff',
    headingFont: 'Oswald',
    bodyFont: 'Roboto Condensed',
    statCard: { variant: 'outline', fontSize: 18 },
    shapeStrokeWidth: 1,
    borderRadius: 6,
    borderColor: '#ffffff30',
    borderWidth: 1,
    shadow: { blur: 12, offsetX: 0, offsetY: 4, color: '#00000040' },
    glass: { blurAmount: 8, bgOpacity: 0.1 },
  },
  {
    id: 'pastel-modern',
    name: 'Pastel Modern',
    description: 'Soft pastel with clean lines',
    background: '#f8f6f2',
    primary: '#a8d8ea',
    secondary: '#f7cac9',
    accent: '#88b04b',
    textColor: '#2d2d2d',
    headingFont: 'Montserrat',
    bodyFont: 'Inter',
    statCard: { variant: 'glass', fontSize: 17 },
    shapeStrokeWidth: 1,
    borderRadius: 14,
    borderColor: '#a8d8ea40',
    borderWidth: 1,
    shadow: { blur: 16, offsetX: 0, offsetY: 6, color: '#00000015' },
    glass: { blurAmount: 12, bgOpacity: 0.3 },
  },
  {
    id: 'comic-book',
    name: 'Comic Book',
    description: 'Bold primary colors, hard shadows',
    background: '#fff200',
    primary: '#ff2800',
    secondary: '#0047ab',
    accent: '#000000',
    textColor: '#000000',
    headingFont: 'Anton',
    bodyFont: 'Anton',
    statCard: { variant: 'solid', fontSize: 20 },
    shapeStrokeWidth: 4,
    borderRadius: 2,
    borderColor: '#000000',
    borderWidth: 3,
    shadow: { blur: 0, offsetX: 5, offsetY: 5, color: '#00000080' },
    glass: { blurAmount: 0, bgOpacity: 1 },
  },
  {
    id: 'stadium-jumbotron',
    name: 'Stadium Jumbotron',
    description: 'High-contrast big-screen display',
    background: '#000000',
    primary: '#ffff00',
    secondary: '#ff6600',
    accent: '#00ffff',
    textColor: '#ffffff',
    headingFont: 'Bebas Neue',
    bodyFont: 'Oswald',
    statCard: { variant: 'solid', fontSize: 22 },
    shapeStrokeWidth: 3,
    borderRadius: 4,
    borderColor: '#ffff0040',
    borderWidth: 2,
    shadow: { blur: 12, offsetX: 0, offsetY: 0, color: '#ffff0030' },
    glass: { blurAmount: 0, bgOpacity: 0.9 },
  },
]

// Dropdown options for select menus
export const THEME_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No Theme' },
  ...THEME_PRESETS.map(t => ({ value: t.id, label: t.name })),
]

// ── Transform Functions ─────────────────────────────────────────────────────

/** Apply theme to an entire scene (background + all elements). */
export function applyThemeToScene(scene: Scene, theme: ThemePreset): Scene {
  return {
    ...scene,
    background: theme.background,
    elements: applyThemeToElements(scene.elements, theme),
  }
}

/** Apply theme preset to all elements based on element type. */
export function applyThemeToElements(elements: SceneElement[], theme: ThemePreset): SceneElement[] {
  return elements.map(el => {
    const p = { ...el.props }

    switch (el.type) {
      case 'stat-card':
        p.color = theme.primary
        p.bgColor = theme.secondary
        p.variant = theme.statCard.variant
        p.fontSize = theme.statCard.fontSize
        p.fontFamily = theme.headingFont
        p.borderRadius = theme.borderRadius
        p.borderColor = theme.borderColor
        p.borderWidth = theme.borderWidth
        p.shadowBlur = theme.shadow.blur
        p.shadowOffsetX = theme.shadow.offsetX
        p.shadowOffsetY = theme.shadow.offsetY
        p.shadowColor = theme.shadow.color
        p.glassBlur = theme.glass.blurAmount
        p.glassBgOpacity = theme.glass.bgOpacity
        break

      case 'text':
        p.color = theme.textColor
        p.fontFamily = theme.bodyFont
        p.shadowBlur = theme.shadow.blur
        p.shadowOffsetX = theme.shadow.offsetX
        p.shadowOffsetY = theme.shadow.offsetY
        p.shadowColor = theme.shadow.color
        p.borderRadius = theme.borderRadius
        p.borderColor = theme.borderColor
        p.borderWidth = theme.borderWidth
        break

      case 'shape':
        p.fill = theme.secondary
        p.stroke = theme.primary
        p.strokeWidth = theme.shapeStrokeWidth
        p.borderRadius = theme.borderRadius
        p.shadowBlur = theme.shadow.blur
        p.shadowOffsetX = theme.shadow.offsetX
        p.shadowOffsetY = theme.shadow.offsetY
        p.shadowColor = theme.shadow.color
        break

      case 'player-image':
        p.borderColor = theme.primary
        p.borderWidth = Math.max(theme.borderWidth, 2)
        p.borderRadius = theme.borderRadius
        p.shadowBlur = theme.shadow.blur
        p.shadowOffsetX = theme.shadow.offsetX
        p.shadowOffsetY = theme.shadow.offsetY
        p.shadowColor = theme.shadow.color
        break

      case 'comparison-bar':
        p.color = theme.primary
        p.barBgColor = theme.secondary
        p.fontFamily = theme.bodyFont
        break

      case 'ticker':
        p.color = theme.accent
        p.bgColor = theme.primary
        p.fontFamily = theme.headingFont
        break

      case 'image':
        p.borderColor = theme.borderColor
        p.borderWidth = theme.borderWidth
        p.borderRadius = theme.borderRadius
        break

      case 'pitch-flight':
      case 'zone-plot':
      case 'movement-plot':
      case 'stadium':
        // Preserve data-driven colors — only update background
        p.bgColor = theme.background
        break
    }

    return { ...el, props: p }
  })
}

/**
 * Apply team color accent override on top of themed elements.
 * Team colors narrow-override primary/secondary/accent props only.
 */
function applyTeamColorOverlay(elements: SceneElement[], tc: TeamPalette): SceneElement[] {
  return elements.map(el => {
    const p = { ...el.props }
    switch (el.type) {
      case 'stat-card':
        p.color = tc.primary
        break
      case 'text':
        p.color = tc.primary
        break
      case 'shape':
        p.fill = tc.secondary
        p.stroke = tc.primary
        break
      case 'player-image':
        p.borderColor = tc.primary
        break
      case 'comparison-bar':
        p.color = tc.primary
        break
      case 'ticker':
        p.color = tc.accent
        p.bgColor = tc.primary
        break
    }
    return { ...el, props: p }
  })
}

/**
 * Combined transform: apply theme preset first (full visual), then team colors on top (accent override).
 * Used in the broadcast pipeline where both may be active.
 */
export function applyThemeAndTeamColor(
  elements: SceneElement[],
  theme: ThemePreset | null,
  teamPalette: TeamPalette | null,
): SceneElement[] {
  let result = elements
  if (theme) result = applyThemeToElements(result, theme)
  if (teamPalette) result = applyTeamColorOverlay(result, teamPalette)
  return result
}

// ── Font Loading ────────────────────────────────────────────────────────────

const loadedFonts = new Set<string>()

/** Dynamically load Google Fonts for a theme's heading + body fonts. */
export async function ensureThemeFontsLoaded(theme: ThemePreset): Promise<void> {
  const fonts = [theme.headingFont, theme.bodyFont].filter(f => !loadedFonts.has(f))
  if (fonts.length === 0) return

  for (const font of fonts) {
    const id = `theme-font-${font.replace(/\s+/g, '-').toLowerCase()}`
    if (document.getElementById(id)) {
      loadedFonts.add(font)
      continue
    }
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;700&display=swap`
    document.head.appendChild(link)
    loadedFonts.add(font)
  }

  // Wait briefly for fonts to start loading
  await new Promise(resolve => setTimeout(resolve, 100))
}
