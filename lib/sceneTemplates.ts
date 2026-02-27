/**
 * sceneTemplates — Prebuilt Scene templates for the Scene Composer.
 * Each factory returns a fresh Scene with unique IDs.
 */

import { Scene, SceneElement } from './sceneTypes'

export interface SceneTemplate {
  id: string
  name: string
  category: 'pitcher' | 'batter' | 'comparison' | 'social' | 'overlay'
  description: string
  icon: string
  width: number
  height: number
  build: () => Scene
}

let _z = 100
function el(type: SceneElement['type'], x: number, y: number, w: number, h: number, props: Record<string, any>): SceneElement {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type, x, y, width: w, height: h,
    rotation: 0, opacity: 1, zIndex: ++_z, locked: false,
    props,
  }
}

function scene(name: string, w: number, h: number, bg: string, elements: SceneElement[]): Scene {
  _z = 100
  return {
    id: Math.random().toString(36).slice(2, 10),
    name, width: w, height: h, background: bg,
    elements, duration: 5, fps: 30,
  }
}

// ── Text Presets (reusable element factories) ────────────────────────────────

export interface TextPreset {
  name: string
  icon: string
  build: (cx: number, cy: number) => SceneElement
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    name: 'Title',
    icon: 'H1',
    build: (cx, cy) => el('text', cx - 300, cy - 40, 600, 80, {
      text: 'TITLE TEXT', fontSize: 64, fontWeight: 800, color: '#ffffff', textAlign: 'center',
    }),
  },
  {
    name: 'Subtitle',
    icon: 'H2',
    build: (cx, cy) => el('text', cx - 250, cy - 20, 500, 40, {
      text: 'Subtitle text here', fontSize: 28, fontWeight: 500, color: '#a1a1aa', textAlign: 'center',
    }),
  },
  {
    name: 'Lower Third',
    icon: 'LT',
    build: (cx, cy) => {
      // Returns a glass rect + name + stat line (use the rect as base)
      return el('shape', cx - 300, cy - 30, 600, 60, {
        shape: 'rect', fill: 'rgba(0,0,0,0.6)', stroke: '#06b6d4', strokeWidth: 1, borderRadius: 8,
      })
    },
  },
  {
    name: 'Big Number',
    icon: '##',
    build: (cx, cy) => el('stat-card', cx - 140, cy - 80, 280, 160, {
      label: 'STAT', value: '99.4', sublabel: 'Player Name', color: '#06b6d4', fontSize: 56, variant: 'glass',
    }),
  },
  {
    name: 'Caption',
    icon: 'Aa',
    build: (cx, cy) => el('text', cx - 200, cy - 12, 400, 24, {
      text: 'Caption text', fontSize: 16, fontWeight: 400, color: '#71717a', textAlign: 'center',
    }),
  },
]

// ── Element Presets (save/load) ──────────────────────────────────────────────

const ELEMENT_PRESETS_KEY = 'triton-element-presets'

export interface SavedElementPreset {
  id: string
  name: string
  element: Omit<SceneElement, 'id' | 'x' | 'y' | 'zIndex'>
  createdAt: string
}

export function loadElementPresets(): SavedElementPreset[] {
  try {
    const raw = localStorage.getItem(ELEMENT_PRESETS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveElementPreset(name: string, element: SceneElement): SavedElementPreset {
  const preset: SavedElementPreset = {
    id: Math.random().toString(36).slice(2, 10),
    name,
    element: {
      type: element.type,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      opacity: element.opacity,
      locked: false,
      props: { ...element.props },
    },
    createdAt: new Date().toISOString(),
  }
  const presets = loadElementPresets()
  presets.push(preset)
  localStorage.setItem(ELEMENT_PRESETS_KEY, JSON.stringify(presets))
  return preset
}

export function deleteElementPreset(id: string) {
  const presets = loadElementPresets().filter(p => p.id !== id)
  localStorage.setItem(ELEMENT_PRESETS_KEY, JSON.stringify(presets))
}

export function instantiatePreset(preset: SavedElementPreset, cx: number, cy: number): SceneElement {
  return {
    ...preset.element,
    id: Math.random().toString(36).slice(2, 10),
    x: cx - preset.element.width / 2,
    y: cy - preset.element.height / 2,
    zIndex: 100 + Math.floor(Math.random() * 100),
  } as SceneElement
}

// ── Scene Templates ──────────────────────────────────────────────────────────

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'pitcher-profile',
    name: 'Pitcher Profile',
    category: 'pitcher',
    description: 'Headshot + pitch flight + key stats',
    icon: '\u26be',
    width: 1920, height: 1080,
    build: () => scene('Pitcher Profile', 1920, 1080, '#09090b', [
      el('player-image', 60, 120, 320, 400, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 60, 540, 320, 50, { text: 'PITCHER NAME', fontSize: 32, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 60, 590, 320, 30, { text: '2024 Season', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('pitch-flight', 440, 80, 700, 520, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'SL', pitchColor: '#3b82f6', mode: 'player', showInKey: true },
          { id: 'p3', playerId: null, playerName: '', pitchType: 'CH', pitchColor: '#22c55e', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 1.5, showKey: true,
      }),
      el('stat-card', 1200, 80, 320, 140, { label: 'AVG VELO', value: '96.2', sublabel: 'mph', color: '#ef4444', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1540, 80, 320, 140, { label: 'WHIFF%', value: '32.1', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1200, 240, 320, 140, { label: 'K%', value: '28.5', sublabel: '', color: '#a855f7', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1540, 240, 320, 140, { label: 'ERA', value: '2.89', sublabel: '', color: '#06b6d4', fontSize: 48, variant: 'glass' }),
      el('comparison-bar', 1200, 420, 660, 44, { label: 'Fastball', value: 96.2, maxValue: 105, color: '#ef4444', showValue: true }),
      el('comparison-bar', 1200, 480, 660, 44, { label: 'Slider', value: 87.4, maxValue: 105, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 1200, 540, 660, 44, { label: 'Changeup', value: 84.1, maxValue: 105, color: '#22c55e', showValue: true }),
    ]),
  },
  {
    id: 'batter-spray',
    name: 'Batter Spray Chart',
    category: 'batter',
    description: 'Stadium spray chart + hitting stats',
    icon: '\ud83c\udfdf\ufe0f',
    width: 1920, height: 1080,
    build: () => scene('Batter Spray Chart', 1920, 1080, '#09090b', [
      el('stadium', 60, 60, 900, 720, {
        hits: [{ id: 'h1', batterId: null, batterName: '', eventFilter: '', bbTypeFilter: '', color: '#06b6d4', showInKey: true }],
        viewMode: 'overhead', park: 'generic', animate: false, showKey: true, bgColor: '#09090b', showWall: true, showField: true, loopDuration: 3, animMode: 'simultaneous', displayMode: 'all', singleHitIndex: 0,
      }),
      el('text', 60, 800, 500, 50, { text: 'BATTER NAME', fontSize: 40, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 60, 855, 500, 30, { text: '2024 Spray Chart — All Batted Balls', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('player-image', 1020, 60, 280, 360, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('stat-card', 1340, 60, 260, 140, { label: 'AVG', value: '.312', sublabel: '', color: '#22c55e', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1620, 60, 260, 140, { label: 'HR', value: '42', sublabel: '', color: '#ef4444', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1340, 220, 260, 140, { label: 'OPS', value: '.985', sublabel: '', color: '#f97316', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1620, 220, 260, 140, { label: 'SLG', value: '.621', sublabel: '', color: '#a855f7', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1020, 460, 860, 140, { label: 'EXIT VELOCITY', value: '95.8 mph', sublabel: 'avg', color: '#06b6d4', fontSize: 48, variant: 'solid' }),
    ]),
  },
  {
    id: 'matchup',
    name: 'Player Comparison',
    category: 'comparison',
    description: 'Head-to-head stat comparison',
    icon: 'VS',
    width: 1920, height: 1080,
    build: () => scene('Player Comparison', 1920, 1080, '#09090b', [
      el('player-image', 120, 80, 280, 360, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 120, 460, 280, 40, { text: 'PLAYER A', fontSize: 28, fontWeight: 700, color: '#06b6d4', textAlign: 'center' }),
      el('player-image', 1520, 80, 280, 360, { playerId: null, playerName: '', borderColor: '#f97316', showLabel: true }),
      el('text', 1520, 460, 280, 40, { text: 'PLAYER B', fontSize: 28, fontWeight: 700, color: '#f97316', textAlign: 'center' }),
      el('text', 660, 120, 600, 60, { text: 'VS', fontSize: 80, fontWeight: 900, color: '#27272a', textAlign: 'center' }),
      el('comparison-bar', 500, 300, 920, 52, { label: 'Fastball Velo', value: 96.2, maxValue: 105, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 500, 380, 920, 52, { label: 'Whiff Rate', value: 32.1, maxValue: 50, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 500, 460, 920, 52, { label: 'K Rate', value: 28.5, maxValue: 40, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 500, 540, 920, 52, { label: 'ERA', value: 2.89, maxValue: 5, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 500, 620, 920, 52, { label: 'WAR', value: 5.2, maxValue: 10, color: '#06b6d4', showValue: true }),
      el('shape', 0, 950, 1920, 130, { shape: 'rect', fill: 'rgba(0,0,0,0.5)', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 60, 975, 1800, 40, { text: '2024 Season Comparison', fontSize: 24, fontWeight: 500, color: '#71717a', textAlign: 'center' }),
    ]),
  },
  {
    id: 'pitching-arsenal',
    name: 'Pitching Arsenal',
    category: 'pitcher',
    description: 'All pitch types with trajectories',
    icon: '\u2312',
    width: 1920, height: 1080,
    build: () => scene('Pitching Arsenal', 1920, 1080, '#09090b', [
      el('pitch-flight', 160, 60, 1600, 900, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'SI', pitchColor: '#f97316', mode: 'player', showInKey: true },
          { id: 'p3', playerId: null, playerName: '', pitchType: 'SL', pitchColor: '#3b82f6', mode: 'player', showInKey: true },
          { id: 'p4', playerId: null, playerName: '', pitchType: 'CH', pitchColor: '#22c55e', mode: 'player', showInKey: true },
          { id: 'p5', playerId: null, playerName: '', pitchType: 'CU', pitchColor: '#a855f7', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 2, showKey: true,
      }),
      el('text', 160, 970, 600, 40, { text: 'PITCHER NAME — Arsenal', fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'left' }),
    ]),
  },
  {
    id: 'hr-showcase',
    name: 'Home Run Showcase',
    category: 'batter',
    description: 'Animated HR trajectories on stadium',
    icon: '\ud83d\udca5',
    width: 1920, height: 1080,
    build: () => scene('Home Run Showcase', 1920, 1080, '#09090b', [
      el('stadium', 210, 30, 1500, 900, {
        hits: [{ id: 'h1', batterId: null, batterName: '', eventFilter: 'home_run', bbTypeFilter: '', color: '#ef4444', showInKey: true }],
        viewMode: 'broadcast', park: 'generic', animate: true, showKey: true, bgColor: '#09090b', showWall: true, showField: true, loopDuration: 4, animMode: 'sequential', displayMode: 'all', singleHitIndex: 0,
      }),
      el('text', 60, 950, 800, 50, { text: 'HOME RUN TRACKER', fontSize: 40, fontWeight: 800, color: '#ef4444', textAlign: 'left' }),
      el('text', 60, 1005, 600, 30, { text: '2024 Season', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
    ]),
  },
  {
    id: 'youtube-thumb',
    name: 'YouTube Thumbnail',
    category: 'social',
    description: 'Bold text + player for thumbnails',
    icon: 'YT',
    width: 1920, height: 1080,
    build: () => scene('YouTube Thumbnail', 1920, 1080, '#0f172a', [
      el('shape', 0, 0, 1920, 1080, { shape: 'rect', fill: 'rgba(0,0,0,0.3)', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('player-image', 1200, 100, 600, 800, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: false }),
      el('text', 80, 200, 1000, 120, { text: 'BOLD TITLE', fontSize: 96, fontWeight: 900, color: '#ffffff', textAlign: 'left' }),
      el('text', 80, 340, 800, 80, { text: 'SUBTITLE LINE', fontSize: 56, fontWeight: 800, color: '#ef4444', textAlign: 'left' }),
      el('stat-card', 80, 500, 400, 180, { label: 'KEY STAT', value: '99.9', sublabel: 'Description', color: '#06b6d4', fontSize: 72, variant: 'outline' }),
    ]),
  },
  {
    id: 'lower-third',
    name: 'Lower Third',
    category: 'overlay',
    description: 'Broadcast-style name/stat bar',
    icon: 'LT',
    width: 1920, height: 200,
    build: () => scene('Lower Third', 1920, 200, 'transparent', [
      el('shape', 0, 0, 1920, 200, { shape: 'rect', fill: 'rgba(9,9,11,0.85)', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('shape', 0, 0, 6, 200, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 30, 20, 600, 50, { text: 'PLAYER NAME', fontSize: 36, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 30, 75, 400, 30, { text: 'Position | Team', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('stat-card', 700, 20, 220, 120, { label: 'ERA', value: '2.89', sublabel: '', color: '#06b6d4', fontSize: 42, variant: 'glass' }),
      el('stat-card', 940, 20, 220, 120, { label: 'K/9', value: '11.2', sublabel: '', color: '#a855f7', fontSize: 42, variant: 'glass' }),
      el('stat-card', 1180, 20, 220, 120, { label: 'WHIP', value: '0.98', sublabel: '', color: '#22c55e', fontSize: 42, variant: 'glass' }),
      el('text', 1480, 80, 400, 24, { text: '@YourChannel', fontSize: 18, fontWeight: 500, color: '#52525b', textAlign: 'right' }),
    ]),
  },
  {
    id: 'ig-square',
    name: 'Instagram Post',
    category: 'social',
    description: '1080x1080 stat card layout',
    icon: 'IG',
    width: 1080, height: 1080,
    build: () => scene('Instagram Post', 1080, 1080, '#09090b', [
      el('player-image', 340, 40, 400, 480, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 40, 550, 1000, 50, { text: 'PLAYER NAME', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('stat-card', 40, 640, 320, 140, { label: 'AVG', value: '.312', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 380, 640, 320, 140, { label: 'HR', value: '42', sublabel: '', color: '#ef4444', fontSize: 48, variant: 'glass' }),
      el('stat-card', 720, 640, 320, 140, { label: 'RBI', value: '118', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 40, 800, 1000, 120, { label: 'OPS', value: '.985', sublabel: '2024 Season', color: '#06b6d4', fontSize: 52, variant: 'solid' }),
      el('text', 40, 960, 1000, 24, { text: '@YourChannel', fontSize: 16, fontWeight: 500, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'vertical-reel',
    name: 'Vertical Reel',
    category: 'social',
    description: '9:16 for Shorts/Reels/TikTok',
    icon: '\ud83d\udcf1',
    width: 1080, height: 1920,
    build: () => scene('Vertical Reel', 1080, 1920, '#09090b', [
      el('player-image', 240, 80, 600, 720, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 40, 840, 1000, 60, { text: 'PLAYER NAME', fontSize: 52, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 40, 910, 1000, 30, { text: 'Position | Team', fontSize: 22, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('stat-card', 40, 980, 490, 160, { label: 'VELO', value: '98.2', sublabel: 'mph', color: '#ef4444', fontSize: 52, variant: 'glass' }),
      el('stat-card', 550, 980, 490, 160, { label: 'K%', value: '32.1', sublabel: '', color: '#a855f7', fontSize: 52, variant: 'glass' }),
      el('stat-card', 40, 1160, 490, 160, { label: 'ERA', value: '2.45', sublabel: '', color: '#06b6d4', fontSize: 52, variant: 'glass' }),
      el('stat-card', 550, 1160, 490, 160, { label: 'WAR', value: '6.8', sublabel: '', color: '#22c55e', fontSize: 52, variant: 'glass' }),
      el('pitch-flight', 40, 1380, 1000, 480, {
        pitches: [{ id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true }],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: false, loopDuration: 1.5, showKey: false,
      }),
    ]),
  },
  {
    id: 'stat-spotlight',
    name: 'Stat Spotlight',
    category: 'social',
    description: 'Single dramatic stat highlight',
    icon: '\u2605',
    width: 1920, height: 1080,
    build: () => scene('Stat Spotlight', 1920, 1080, '#09090b', [
      el('shape', 0, 0, 1920, 1080, { shape: 'rect', fill: '#09090b', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('player-image', 1300, 100, 500, 640, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: false }),
      el('text', 100, 180, 1100, 60, { text: 'DID YOU KNOW?', fontSize: 28, fontWeight: 600, color: '#06b6d4', textAlign: 'left' }),
      el('text', 100, 260, 1100, 180, { text: '99.4', fontSize: 160, fontWeight: 900, color: '#ffffff', textAlign: 'left' }),
      el('text', 100, 460, 1100, 50, { text: 'MILES PER HOUR', fontSize: 36, fontWeight: 700, color: '#71717a', textAlign: 'left' }),
      el('text', 100, 540, 1000, 80, { text: 'The hardest pitch thrown this season, by Player Name on June 15th.', fontSize: 24, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
      el('shape', 100, 680, 200, 4, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 2 }),
      el('text', 100, 720, 500, 30, { text: '@YourChannel', fontSize: 20, fontWeight: 500, color: '#52525b', textAlign: 'left' }),
    ]),
  },
]
