/**
 * sceneTemplates — Prebuilt Scene templates for the Scene Composer.
 * Each factory returns a fresh Scene with unique IDs.
 */

import { Scene, SceneElement } from './sceneTypes'

export interface SceneTemplate {
  id: string
  name: string
  category: 'pitcher' | 'batter' | 'comparison' | 'team' | 'social' | 'broadcast' | 'advanced'
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
    category: 'broadcast',
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
    category: 'advanced',
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

  // ── NEW PITCHER TEMPLATES ─────────────────────────────────────────────────

  {
    id: 'pitch-mix', name: 'Pitch Mix Breakdown', category: 'pitcher',
    description: 'Usage % bars for each pitch type', icon: '%',
    width: 1920, height: 1080,
    build: () => scene('Pitch Mix Breakdown', 1920, 1080, '#09090b', [
      el('player-image', 80, 100, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 80, 500, 300, 50, { text: 'PITCHER NAME', fontSize: 28, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 480, 80, 600, 50, { text: 'PITCH MIX', fontSize: 40, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 480, 130, 600, 30, { text: '2024 Season Usage Rates', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('comparison-bar', 480, 200, 1360, 56, { label: 'Four-Seam (FF)', value: 42, maxValue: 100, color: '#ef4444', showValue: true }),
      el('comparison-bar', 480, 280, 1360, 56, { label: 'Slider (SL)', value: 24, maxValue: 100, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 480, 360, 1360, 56, { label: 'Changeup (CH)', value: 18, maxValue: 100, color: '#22c55e', showValue: true }),
      el('comparison-bar', 480, 440, 1360, 56, { label: 'Curveball (CU)', value: 12, maxValue: 100, color: '#a855f7', showValue: true }),
      el('comparison-bar', 480, 520, 1360, 56, { label: 'Sinker (SI)', value: 4, maxValue: 100, color: '#f97316', showValue: true }),
      el('pitch-flight', 480, 620, 700, 400, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'SL', pitchColor: '#3b82f6', mode: 'player', showInKey: true },
          { id: 'p3', playerId: null, playerName: '', pitchType: 'CH', pitchColor: '#22c55e', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: false, loopDuration: 1.5, showKey: true,
      }),
      el('stat-card', 1220, 640, 280, 130, { label: 'K%', value: '28.5', sublabel: '', color: '#a855f7', fontSize: 44, variant: 'glass' }),
      el('stat-card', 1540, 640, 280, 130, { label: 'WHIFF%', value: '32.1', sublabel: '', color: '#f97316', fontSize: 44, variant: 'glass' }),
    ]),
  },
  {
    id: 'pitch-tunneling', name: 'Pitch Tunneling', category: 'pitcher',
    description: 'Overlay two pitch trajectories', icon: '\u2261',
    width: 1920, height: 1080,
    build: () => scene('Pitch Tunneling', 1920, 1080, '#09090b', [
      el('pitch-flight', 160, 40, 1600, 860, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'CH', pitchColor: '#22c55e', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 2, showKey: true,
      }),
      el('text', 160, 920, 800, 50, { text: 'PITCH TUNNELING', fontSize: 40, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 160, 975, 800, 30, { text: 'Fastball vs Changeup — Same tunnel, different break', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('stat-card', 1200, 920, 320, 120, { label: 'TUNNEL DIST', value: '3.2"', sublabel: 'inches at tunnel', color: '#06b6d4', fontSize: 42, variant: 'glass' }),
      el('stat-card', 1540, 920, 320, 120, { label: 'VELO DIFF', value: '10.4', sublabel: 'mph gap', color: '#f97316', fontSize: 42, variant: 'glass' }),
    ]),
  },
  {
    id: 'game-log', name: 'Game Log Card', category: 'pitcher',
    description: 'Single start stat line', icon: '\ud83d\udccb',
    width: 1920, height: 1080,
    build: () => scene('Game Log Card', 1920, 1080, '#09090b', [
      el('player-image', 80, 140, 340, 420, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 80, 580, 340, 50, { text: 'PITCHER NAME', fontSize: 30, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 80, 635, 340, 30, { text: 'vs. OPP — June 15, 2024', fontSize: 16, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('text', 520, 120, 1320, 60, { text: 'GAME LOG', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('shape', 520, 190, 1320, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('stat-card', 520, 220, 300, 160, { label: 'IP', value: '7.0', sublabel: '', color: '#06b6d4', fontSize: 56, variant: 'glass' }),
      el('stat-card', 840, 220, 300, 160, { label: 'K', value: '11', sublabel: '', color: '#a855f7', fontSize: 56, variant: 'glass' }),
      el('stat-card', 1160, 220, 300, 160, { label: 'BB', value: '1', sublabel: '', color: '#f97316', fontSize: 56, variant: 'glass' }),
      el('stat-card', 1480, 220, 360, 160, { label: 'ERA', value: '2.89', sublabel: '', color: '#22c55e', fontSize: 56, variant: 'glass' }),
      el('stat-card', 520, 420, 300, 140, { label: 'PITCHES', value: '98', sublabel: '', color: '#71717a', fontSize: 48, variant: 'solid' }),
      el('stat-card', 840, 420, 300, 140, { label: 'STRIKES', value: '67', sublabel: '68%', color: '#ef4444', fontSize: 48, variant: 'solid' }),
      el('stat-card', 1160, 420, 300, 140, { label: 'CSW%', value: '32.1', sublabel: '', color: '#06b6d4', fontSize: 48, variant: 'solid' }),
      el('stat-card', 1480, 420, 360, 140, { label: 'WHIFF%', value: '28.5', sublabel: '', color: '#eab308', fontSize: 48, variant: 'solid' }),
      el('pitch-flight', 520, 600, 700, 420, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'SL', pitchColor: '#3b82f6', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: false, loopDuration: 1.5, showKey: true,
      }),
    ]),
  },
  {
    id: 'velo-tracker', name: 'Velocity Tracker', category: 'pitcher',
    description: 'Velocity bars by pitch type', icon: '\ud83d\udcc8',
    width: 1920, height: 1080,
    build: () => scene('Velocity Tracker', 1920, 1080, '#09090b', [
      el('text', 100, 60, 800, 60, { text: 'VELOCITY TRACKER', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 100, 125, 800, 30, { text: 'Pitcher Name — 2024 Average Velocities', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('comparison-bar', 100, 200, 1720, 70, { label: 'Four-Seam Fastball', value: 96.8, maxValue: 105, color: '#ef4444', showValue: true }),
      el('comparison-bar', 100, 300, 1720, 70, { label: 'Sinker', value: 95.2, maxValue: 105, color: '#f97316', showValue: true }),
      el('comparison-bar', 100, 400, 1720, 70, { label: 'Cutter', value: 89.4, maxValue: 105, color: '#eab308', showValue: true }),
      el('comparison-bar', 100, 500, 1720, 70, { label: 'Slider', value: 87.6, maxValue: 105, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 100, 600, 1720, 70, { label: 'Changeup', value: 85.1, maxValue: 105, color: '#22c55e', showValue: true }),
      el('comparison-bar', 100, 700, 1720, 70, { label: 'Curveball', value: 80.3, maxValue: 105, color: '#a855f7', showValue: true }),
      el('stat-card', 100, 830, 400, 140, { label: 'MAX VELO', value: '101.4', sublabel: 'mph', color: '#ef4444', fontSize: 52, variant: 'outline' }),
      el('stat-card', 540, 830, 400, 140, { label: 'AVG VELO', value: '96.8', sublabel: 'mph', color: '#06b6d4', fontSize: 52, variant: 'outline' }),
      el('player-image', 1560, 830, 180, 200, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
    ]),
  },
  {
    id: 'pitcher-split', name: 'Pitcher Split', category: 'pitcher',
    description: 'Side-by-side pitch flights', icon: '\u2016',
    width: 1920, height: 1080,
    build: () => scene('Pitcher Comparison Split', 1920, 1080, '#09090b', [
      el('pitch-flight', 40, 80, 900, 700, {
        pitches: [{ id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#06b6d4', mode: 'player', showInKey: true }],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 1.5, showKey: true,
      }),
      el('pitch-flight', 980, 80, 900, 700, {
        pitches: [{ id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#f97316', mode: 'player', showInKey: true }],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 1.5, showKey: true,
      }),
      el('shape', 958, 60, 4, 740, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('player-image', 80, 820, 160, 200, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 260, 860, 400, 40, { text: 'PITCHER A', fontSize: 28, fontWeight: 700, color: '#06b6d4', textAlign: 'left' }),
      el('player-image', 1020, 820, 160, 200, { playerId: null, playerName: '', borderColor: '#f97316', showLabel: true }),
      el('text', 1200, 860, 400, 40, { text: 'PITCHER B', fontSize: 28, fontWeight: 700, color: '#f97316', textAlign: 'left' }),
    ]),
  },
  {
    id: 'scouting-report', name: 'Scouting Report', category: 'pitcher',
    description: '20-80 grade scale for pitches', icon: '\ud83d\udcdd',
    width: 1920, height: 1080,
    build: () => scene('Scouting Report Card', 1920, 1080, '#09090b', [
      el('player-image', 80, 80, 320, 400, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 80, 500, 320, 50, { text: 'PITCHER NAME', fontSize: 28, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 480, 60, 800, 60, { text: 'SCOUTING REPORT', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 480, 120, 800, 30, { text: '20-80 Scale Grades', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('comparison-bar', 480, 190, 1360, 60, { label: 'Fastball', value: 70, maxValue: 80, color: '#ef4444', showValue: true }),
      el('comparison-bar', 480, 270, 1360, 60, { label: 'Slider', value: 65, maxValue: 80, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 480, 350, 1360, 60, { label: 'Changeup', value: 55, maxValue: 80, color: '#22c55e', showValue: true }),
      el('comparison-bar', 480, 430, 1360, 60, { label: 'Curveball', value: 50, maxValue: 80, color: '#a855f7', showValue: true }),
      el('comparison-bar', 480, 510, 1360, 60, { label: 'Command', value: 60, maxValue: 80, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 480, 590, 1360, 60, { label: 'Stamina', value: 55, maxValue: 80, color: '#f97316', showValue: true }),
      el('shape', 480, 680, 1360, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 480, 700, 1360, 80, { text: 'Plus fastball with elite spin rate. Slider flashes plus. Changeup developing. Projectable arm with clean mechanics.', fontSize: 18, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
      el('stat-card', 480, 820, 300, 140, { label: 'OVR GRADE', value: '60', sublabel: 'Above Average', color: '#22c55e', fontSize: 52, variant: 'outline' }),
      el('stat-card', 800, 820, 300, 140, { label: 'ETA', value: '2025', sublabel: '', color: '#06b6d4', fontSize: 44, variant: 'glass' }),
    ]),
  },
  {
    id: 'bullpen-card', name: 'Bullpen Card', category: 'pitcher',
    description: 'Relief pitcher leverage stats', icon: '\ud83d\udcaa',
    width: 1920, height: 1080,
    build: () => scene('Bullpen Card', 1920, 1080, '#09090b', [
      el('player-image', 80, 100, 300, 380, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: true }),
      el('text', 80, 500, 300, 50, { text: 'RELIEVER NAME', fontSize: 26, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 80, 550, 300, 30, { text: 'Setup / Closer', fontSize: 16, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('text', 480, 80, 800, 50, { text: 'BULLPEN CARD', fontSize: 40, fontWeight: 800, color: '#ef4444', textAlign: 'left' }),
      el('stat-card', 480, 170, 280, 140, { label: 'ERA', value: '1.85', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 780, 170, 280, 140, { label: 'SAVES', value: '38', sublabel: '', color: '#ef4444', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1080, 170, 280, 140, { label: 'HOLDS', value: '12', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1380, 170, 280, 140, { label: 'K/9', value: '12.8', sublabel: '', color: '#a855f7', fontSize: 48, variant: 'glass' }),
      el('comparison-bar', 480, 360, 1360, 56, { label: 'High Leverage', value: 85, maxValue: 100, color: '#ef4444', showValue: true }),
      el('comparison-bar', 480, 440, 1360, 56, { label: 'Inherited Scored%', value: 18, maxValue: 100, color: '#f97316', showValue: true }),
      el('comparison-bar', 480, 520, 1360, 56, { label: 'Save%', value: 92, maxValue: 100, color: '#22c55e', showValue: true }),
      el('pitch-flight', 480, 620, 700, 400, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'SL', pitchColor: '#3b82f6', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: false, loopDuration: 1.5, showKey: true,
      }),
    ]),
  },
  {
    id: 'k-reel', name: 'K Reel', category: 'pitcher',
    description: 'Strikeout highlight card', icon: 'K',
    width: 1920, height: 1080,
    build: () => scene('K Reel', 1920, 1080, '#09090b', [
      el('text', 100, 80, 400, 120, { text: 'K', fontSize: 160, fontWeight: 900, color: '#ef4444', textAlign: 'left' }),
      el('text', 300, 100, 800, 80, { text: 'STRIKEOUT', fontSize: 72, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 300, 180, 600, 30, { text: 'Pitch sequence breakdown', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('player-image', 1500, 60, 340, 420, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: true }),
      el('pitch-flight', 100, 260, 1300, 700, {
        pitches: [
          { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: true },
          { id: 'p2', playerId: null, playerName: '', pitchType: 'SL', pitchColor: '#3b82f6', mode: 'player', showInKey: true },
        ],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 2, showKey: true,
      }),
      el('stat-card', 1500, 520, 340, 140, { label: 'VELO', value: '99.2', sublabel: 'mph', color: '#ef4444', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1500, 680, 340, 140, { label: 'SPIN', value: '2,541', sublabel: 'rpm', color: '#a855f7', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1500, 840, 340, 140, { label: 'WHIFF%', value: '42.1', sublabel: 'on slider', color: '#3b82f6', fontSize: 44, variant: 'glass' }),
    ]),
  },

  // ── NEW BATTER TEMPLATES ──────────────────────────────────────────────────

  {
    id: 'hot-cold-zone', name: 'Hot/Cold Zone', category: 'batter',
    description: 'Strike zone heatmap by zone', icon: '\ud83d\udd25',
    width: 1920, height: 1080,
    build: () => {
      const zoneColors = ['#ef4444','#f97316','#71717a','#3b82f6','#22c55e','#ef4444','#71717a','#3b82f6','#22c55e']
      const zoneVals = ['.342','.298','.215','.267','.312','.356','.198','.245','.289']
      const zones: SceneElement[] = []
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const i = r * 3 + c
          zones.push(el('shape', 600 + c * 220, 180 + r * 220, 210, 210, { shape: 'rect', fill: zoneColors[i] + '30', stroke: zoneColors[i], strokeWidth: 2, borderRadius: 8 }))
          zones.push(el('text', 600 + c * 220, 250 + r * 220, 210, 60, { text: zoneVals[i], fontSize: 36, fontWeight: 800, color: zoneColors[i], textAlign: 'center' }))
        }
      }
      return scene('Hot/Cold Zone', 1920, 1080, '#09090b', [
        el('text', 100, 80, 800, 60, { text: 'HOT / COLD ZONES', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
        el('text', 100, 145, 400, 30, { text: 'Batting Average by Zone', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
        el('player-image', 100, 220, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
        ...zones,
        el('text', 600, 860, 660, 30, { text: 'Strike Zone — Batter Perspective', fontSize: 16, fontWeight: 400, color: '#52525b', textAlign: 'center' }),
        el('stat-card', 1400, 200, 420, 160, { label: 'AVG', value: '.312', sublabel: 'Overall', color: '#22c55e', fontSize: 56, variant: 'glass' }),
        el('stat-card', 1400, 400, 420, 160, { label: 'SLUG', value: '.621', sublabel: '', color: '#f97316', fontSize: 56, variant: 'glass' }),
        el('stat-card', 1400, 600, 420, 160, { label: 'wOBA', value: '.412', sublabel: '', color: '#06b6d4', fontSize: 56, variant: 'glass' }),
      ])
    },
  },
  {
    id: 'swing-decision', name: 'Swing Decision', category: 'batter',
    description: 'Chase, whiff, barrel rate gauges', icon: '\ud83c\udfaf',
    width: 1920, height: 1080,
    build: () => scene('Swing Decision Card', 1920, 1080, '#09090b', [
      el('player-image', 80, 100, 320, 400, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 80, 520, 320, 50, { text: 'BATTER NAME', fontSize: 28, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 500, 60, 800, 60, { text: 'SWING DECISIONS', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 500, 125, 600, 30, { text: '2024 Plate Discipline Metrics', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('stat-card', 500, 200, 380, 180, { label: 'CHASE RATE', value: '22.1%', sublabel: 'MLB avg: 28%', color: '#22c55e', fontSize: 52, variant: 'glass' }),
      el('stat-card', 920, 200, 380, 180, { label: 'WHIFF RATE', value: '18.4%', sublabel: 'MLB avg: 25%', color: '#3b82f6', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1340, 200, 380, 180, { label: 'BARREL%', value: '14.2%', sublabel: 'MLB avg: 7%', color: '#ef4444', fontSize: 52, variant: 'glass' }),
      el('comparison-bar', 500, 440, 1220, 56, { label: 'Zone Contact%', value: 89, maxValue: 100, color: '#22c55e', showValue: true }),
      el('comparison-bar', 500, 520, 1220, 56, { label: 'Chase Contact%', value: 62, maxValue: 100, color: '#f97316', showValue: true }),
      el('comparison-bar', 500, 600, 1220, 56, { label: 'First Pitch Swing%', value: 34, maxValue: 100, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 500, 680, 1220, 56, { label: 'Called Strike%', value: 15, maxValue: 100, color: '#a855f7', showValue: true }),
      el('stat-card', 500, 800, 420, 160, { label: 'xwOBA', value: '.388', sublabel: '', color: '#06b6d4', fontSize: 56, variant: 'outline' }),
      el('stat-card', 960, 800, 420, 160, { label: 'HARD HIT%', value: '48.2', sublabel: '95+ mph', color: '#ef4444', fontSize: 56, variant: 'outline' }),
    ]),
  },
  {
    id: 'ev-leaderboard', name: 'Exit Velo Leaders', category: 'batter',
    description: 'Ranked bars of top exit velocities', icon: '\ud83c\udfc6',
    width: 1920, height: 1080,
    build: () => scene('Exit Velo Leaderboard', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1200, 60, { text: 'EXIT VELOCITY LEADERBOARD', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 100, 125, 800, 30, { text: '2024 Season — Max Exit Velocity', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('comparison-bar', 100, 200, 1720, 64, { label: '1. Player One', value: 119.8, maxValue: 125, color: '#ef4444', showValue: true }),
      el('comparison-bar', 100, 290, 1720, 64, { label: '2. Player Two', value: 118.4, maxValue: 125, color: '#f97316', showValue: true }),
      el('comparison-bar', 100, 380, 1720, 64, { label: '3. Player Three', value: 117.9, maxValue: 125, color: '#eab308', showValue: true }),
      el('comparison-bar', 100, 470, 1720, 64, { label: '4. Player Four', value: 116.5, maxValue: 125, color: '#22c55e', showValue: true }),
      el('comparison-bar', 100, 560, 1720, 64, { label: '5. Player Five', value: 115.8, maxValue: 125, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 100, 650, 1720, 64, { label: '6. Player Six', value: 115.2, maxValue: 125, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 100, 740, 1720, 64, { label: '7. Player Seven', value: 114.7, maxValue: 125, color: '#a855f7', showValue: true }),
      el('comparison-bar', 100, 830, 1720, 64, { label: '8. Player Eight', value: 114.1, maxValue: 125, color: '#ec4899', showValue: true }),
      el('text', 100, 940, 600, 24, { text: 'Source: Statcast', fontSize: 14, fontWeight: 400, color: '#52525b', textAlign: 'left' }),
    ]),
  },
  {
    id: 'batted-ball', name: 'Batted Ball Profile', category: 'batter',
    description: 'Launch angle + exit velo stats', icon: '\u2197',
    width: 1920, height: 1080,
    build: () => scene('Batted Ball Profile', 1920, 1080, '#09090b', [
      el('text', 100, 60, 800, 60, { text: 'BATTED BALL PROFILE', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('player-image', 1560, 60, 280, 360, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('stat-card', 100, 180, 340, 180, { label: 'AVG EXIT VELO', value: '92.4', sublabel: 'mph', color: '#ef4444', fontSize: 56, variant: 'glass' }),
      el('stat-card', 460, 180, 340, 180, { label: 'MAX EXIT VELO', value: '114.8', sublabel: 'mph', color: '#f97316', fontSize: 56, variant: 'glass' }),
      el('stat-card', 820, 180, 340, 180, { label: 'LAUNCH ANGLE', value: '14.2°', sublabel: 'avg', color: '#3b82f6', fontSize: 56, variant: 'glass' }),
      el('stat-card', 1180, 180, 340, 180, { label: 'BARREL%', value: '12.8', sublabel: '', color: '#a855f7', fontSize: 56, variant: 'glass' }),
      el('comparison-bar', 100, 420, 1720, 60, { label: 'Fly Ball%', value: 38, maxValue: 100, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 100, 500, 1720, 60, { label: 'Line Drive%', value: 24, maxValue: 100, color: '#22c55e', showValue: true }),
      el('comparison-bar', 100, 580, 1720, 60, { label: 'Ground Ball%', value: 38, maxValue: 100, color: '#f97316', showValue: true }),
      el('comparison-bar', 100, 660, 1720, 60, { label: 'Hard Hit%', value: 45, maxValue: 100, color: '#ef4444', showValue: true }),
      el('stadium', 100, 760, 800, 280, {
        hits: [{ id: 'h1', batterId: null, batterName: '', eventFilter: '', bbTypeFilter: '', color: '#06b6d4', showInKey: false }],
        viewMode: 'overhead', park: 'generic', animate: false, showKey: false, bgColor: '#09090b', showWall: true, showField: true, loopDuration: 3, animMode: 'simultaneous', displayMode: 'all', singleHitIndex: 0,
      }),
    ]),
  },
  {
    id: 'plate-discipline', name: 'Plate Discipline', category: 'batter',
    description: 'O-Swing%, Z-Contact% metrics', icon: '\ud83d\udc41',
    width: 1920, height: 1080,
    build: () => scene('Plate Discipline Card', 1920, 1080, '#09090b', [
      el('player-image', 80, 100, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 80, 500, 300, 50, { text: 'BATTER NAME', fontSize: 28, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 480, 60, 800, 60, { text: 'PLATE DISCIPLINE', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('stat-card', 480, 160, 420, 160, { label: 'O-SWING%', value: '28.4', sublabel: 'Out of Zone Swing', color: '#ef4444', fontSize: 52, variant: 'glass' }),
      el('stat-card', 940, 160, 420, 160, { label: 'Z-SWING%', value: '68.2', sublabel: 'In Zone Swing', color: '#22c55e', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1400, 160, 420, 160, { label: 'SWING%', value: '46.8', sublabel: 'Overall', color: '#06b6d4', fontSize: 52, variant: 'glass' }),
      el('stat-card', 480, 360, 420, 160, { label: 'O-CONTACT%', value: '58.1', sublabel: 'Out of Zone Contact', color: '#f97316', fontSize: 52, variant: 'glass' }),
      el('stat-card', 940, 360, 420, 160, { label: 'Z-CONTACT%', value: '88.4', sublabel: 'In Zone Contact', color: '#3b82f6', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1400, 360, 420, 160, { label: 'CONTACT%', value: '76.2', sublabel: 'Overall', color: '#a855f7', fontSize: 52, variant: 'glass' }),
      el('comparison-bar', 480, 580, 1340, 56, { label: 'BB%', value: 12.4, maxValue: 20, color: '#22c55e', showValue: true }),
      el('comparison-bar', 480, 660, 1340, 56, { label: 'K%', value: 18.2, maxValue: 40, color: '#ef4444', showValue: true }),
      el('stat-card', 480, 780, 600, 160, { label: 'BB/K', value: '0.68', sublabel: 'Elite plate discipline', color: '#06b6d4', fontSize: 56, variant: 'outline' }),
    ]),
  },
  {
    id: 'hr-derby', name: 'HR Derby Card', category: 'batter',
    description: 'Distance, EV, launch angle per HR', icon: '\ud83c\udf86',
    width: 1920, height: 1080,
    build: () => scene('Home Run Derby Card', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1000, 80, { text: 'HOME RUN DERBY', fontSize: 64, fontWeight: 900, color: '#ef4444', textAlign: 'left' }),
      el('player-image', 1520, 60, 320, 400, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: true }),
      el('stat-card', 100, 200, 400, 200, { label: 'TOTAL HRS', value: '42', sublabel: '2024 Season', color: '#ef4444', fontSize: 72, variant: 'outline' }),
      el('stat-card', 540, 200, 300, 160, { label: 'AVG DIST', value: '412', sublabel: 'feet', color: '#f97316', fontSize: 52, variant: 'glass' }),
      el('stat-card', 860, 200, 300, 160, { label: 'AVG EV', value: '108.4', sublabel: 'mph', color: '#06b6d4', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1180, 200, 300, 160, { label: 'AVG LA', value: '28.4°', sublabel: '', color: '#a855f7', fontSize: 48, variant: 'glass' }),
      el('stadium', 100, 460, 1200, 560, {
        hits: [{ id: 'h1', batterId: null, batterName: '', eventFilter: 'home_run', bbTypeFilter: '', color: '#ef4444', showInKey: true }],
        viewMode: 'broadcast', park: 'generic', animate: true, showKey: false, bgColor: '#09090b', showWall: true, showField: true, loopDuration: 4, animMode: 'sequential', displayMode: 'all', singleHitIndex: 0,
      }),
      el('stat-card', 1360, 500, 480, 160, { label: 'LONGEST HR', value: '468 ft', sublabel: 'vs NYY — July 4', color: '#ef4444', fontSize: 48, variant: 'solid' }),
      el('stat-card', 1360, 700, 480, 160, { label: 'HARDEST HR', value: '118.2', sublabel: 'mph exit velo', color: '#f97316', fontSize: 48, variant: 'solid' }),
    ]),
  },
  {
    id: 'walkoff', name: 'Walk-Off Card', category: 'batter',
    description: 'Dramatic moment highlight', icon: '\ud83d\udca5',
    width: 1920, height: 1080,
    build: () => scene('Walk-Off Card', 1920, 1080, '#0f172a', [
      el('shape', 0, 0, 1920, 1080, { shape: 'rect', fill: 'rgba(239,68,68,0.08)', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 100, 80, 1720, 100, { text: 'WALK-OFF', fontSize: 120, fontWeight: 900, color: '#ef4444', textAlign: 'center' }),
      el('player-image', 710, 220, 500, 600, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: false }),
      el('text', 100, 850, 1720, 60, { text: 'PLAYER NAME', fontSize: 52, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 920, 1720, 40, { text: 'Walk-off home run — 3-run shot to right field', fontSize: 24, fontWeight: 400, color: '#a1a1aa', textAlign: 'center' }),
      el('stat-card', 300, 980, 300, 80, { label: 'EXIT VELO', value: '112.4', sublabel: '', color: '#ef4444', fontSize: 36, variant: 'glass' }),
      el('stat-card', 660, 980, 300, 80, { label: 'DISTANCE', value: '425 ft', sublabel: '', color: '#f97316', fontSize: 36, variant: 'glass' }),
      el('stat-card', 1020, 980, 300, 80, { label: 'WPA', value: '+.642', sublabel: '', color: '#22c55e', fontSize: 36, variant: 'glass' }),
    ]),
  },

  // ── NEW COMPARISON TEMPLATES ──────────────────────────────────────────────

  {
    id: 'trade-comp', name: 'Trade Comparison', category: 'comparison',
    description: 'Before/after stats for traded player', icon: '\u21c4',
    width: 1920, height: 1080,
    build: () => scene('Trade Comparison', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1720, 60, { text: 'TRADE IMPACT', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('player-image', 810, 140, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 100, 560, 860, 40, { text: 'BEFORE TRADE', fontSize: 28, fontWeight: 700, color: '#3b82f6', textAlign: 'center' }),
      el('text', 960, 560, 860, 40, { text: 'AFTER TRADE', fontSize: 28, fontWeight: 700, color: '#22c55e', textAlign: 'center' }),
      el('shape', 958, 540, 4, 500, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('stat-card', 100, 620, 380, 140, { label: 'AVG', value: '.245', sublabel: '', color: '#3b82f6', fontSize: 48, variant: 'glass' }),
      el('stat-card', 500, 620, 380, 140, { label: 'OPS', value: '.712', sublabel: '', color: '#3b82f6', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1000, 620, 380, 140, { label: 'AVG', value: '.312', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1400, 620, 380, 140, { label: 'OPS', value: '.945', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 100, 800, 380, 140, { label: 'HR', value: '8', sublabel: '', color: '#3b82f6', fontSize: 48, variant: 'solid' }),
      el('stat-card', 500, 800, 380, 140, { label: 'RBI', value: '32', sublabel: '', color: '#3b82f6', fontSize: 48, variant: 'solid' }),
      el('stat-card', 1000, 800, 380, 140, { label: 'HR', value: '18', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'solid' }),
      el('stat-card', 1400, 800, 380, 140, { label: 'RBI', value: '54', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'solid' }),
    ]),
  },
  {
    id: 'draft-class', name: 'Draft Class', category: 'comparison',
    description: '4 prospects side by side', icon: '\ud83c\udf93',
    width: 1920, height: 1080,
    build: () => scene('Draft Class Card', 1920, 1080, '#09090b', [
      el('text', 100, 40, 1720, 60, { text: 'DRAFT CLASS 2024', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      ...[0,1,2,3].flatMap(i => {
        const x = 60 + i * 460
        const colors = ['#ef4444','#3b82f6','#22c55e','#f97316']
        return [
          el('player-image', x, 140, 420, 320, { playerId: null, playerName: '', borderColor: colors[i], showLabel: true }),
          el('text', x, 480, 420, 35, { text: `PROSPECT ${i + 1}`, fontSize: 24, fontWeight: 700, color: colors[i], textAlign: 'center' }),
          el('text', x, 515, 420, 25, { text: 'RHP | College', fontSize: 16, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
          el('comparison-bar', x + 20, 560, 380, 44, { label: 'Fastball', value: 60 + Math.floor(Math.random() * 15), maxValue: 80, color: colors[i], showValue: true }),
          el('comparison-bar', x + 20, 620, 380, 44, { label: 'Slider', value: 45 + Math.floor(Math.random() * 20), maxValue: 80, color: colors[i], showValue: true }),
          el('comparison-bar', x + 20, 680, 380, 44, { label: 'Command', value: 40 + Math.floor(Math.random() * 25), maxValue: 80, color: colors[i], showValue: true }),
          el('stat-card', x, 760, 420, 120, { label: 'OVR GRADE', value: String(50 + i * 5), sublabel: '', color: colors[i], fontSize: 44, variant: 'outline' }),
        ]
      }),
    ]),
  },
  {
    id: 'rotation-ranking', name: 'Rotation Ranking', category: 'comparison',
    description: 'Staff ERA/K% bars for 5 starters', icon: '\u2116',
    width: 1920, height: 1080,
    build: () => scene('Rotation Ranking', 1920, 1080, '#09090b', [
      el('text', 100, 50, 1200, 60, { text: 'ROTATION RANKINGS', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 100, 115, 600, 30, { text: 'Team Name — 2024 Starting Pitchers', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      ...[0,1,2,3,4].flatMap(i => {
        const y = 180 + i * 170
        const colors = ['#ef4444','#3b82f6','#22c55e','#f97316','#a855f7']
        return [
          el('player-image', 100, y, 120, 150, { playerId: null, playerName: '', borderColor: colors[i], showLabel: false }),
          el('text', 240, y + 10, 300, 35, { text: `Starter ${i + 1}`, fontSize: 24, fontWeight: 700, color: '#ffffff', textAlign: 'left' }),
          el('text', 240, y + 50, 300, 24, { text: 'RHP | 32 GS', fontSize: 14, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
          el('stat-card', 560, y, 240, 130, { label: 'ERA', value: (2.5 + i * 0.4).toFixed(2), sublabel: '', color: colors[i], fontSize: 42, variant: 'glass' }),
          el('comparison-bar', 840, y + 20, 1000, 44, { label: 'K%', value: 32 - i * 3, maxValue: 40, color: colors[i], showValue: true }),
          el('comparison-bar', 840, y + 80, 1000, 44, { label: 'ERA', value: 5 - (2.5 + i * 0.4), maxValue: 5, color: colors[i], showValue: true }),
        ]
      }),
    ]),
  },
  {
    id: 'lineup-card', name: 'Lineup Card', category: 'comparison',
    description: 'Full 9-man batting order', icon: '\ud83d\udccb',
    width: 1920, height: 1080,
    build: () => scene('Lineup Card', 1920, 1080, '#09090b', [
      el('text', 100, 30, 1720, 60, { text: 'STARTING LINEUP', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 90, 1720, 30, { text: 'Team Name — vs Opponent | June 15, 2024', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      ...[0,1,2,3,4,5,6,7,8].flatMap(i => {
        const y = 140 + i * 100
        const pos = ['CF','SS','1B','DH','RF','3B','LF','C','2B']
        return [
          el('text', 80, y + 20, 50, 50, { text: `${i + 1}`, fontSize: 32, fontWeight: 800, color: '#52525b', textAlign: 'center' }),
          el('text', 150, y + 15, 140, 30, { text: pos[i], fontSize: 16, fontWeight: 600, color: '#06b6d4', textAlign: 'center' }),
          el('text', 310, y + 10, 500, 35, { text: `Player ${i + 1}`, fontSize: 24, fontWeight: 700, color: '#ffffff', textAlign: 'left' }),
          el('text', 310, y + 50, 300, 24, { text: '.298 / 24 HR / 78 RBI', fontSize: 13, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
          el('comparison-bar', 850, y + 20, 990, 50, { label: 'OPS', value: 0.85 - i * 0.03, maxValue: 1.2, color: '#06b6d4', showValue: true }),
          el('shape', 80, y + 95, 1760, 1, { shape: 'rect', fill: '#1a1a1e', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
        ]
      }),
    ]),
  },
  {
    id: 'gen-comp', name: 'Generational Comp', category: 'comparison',
    description: 'Modern vs legend stat overlay', icon: '\u231b',
    width: 1920, height: 1080,
    build: () => scene('Generational Comp', 1920, 1080, '#09090b', [
      el('text', 100, 40, 1720, 60, { text: 'GENERATIONAL COMPARISON', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('player-image', 160, 140, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 160, 540, 300, 40, { text: 'MODERN', fontSize: 24, fontWeight: 700, color: '#06b6d4', textAlign: 'center' }),
      el('player-image', 1460, 140, 300, 380, { playerId: null, playerName: '', borderColor: '#f97316', showLabel: true }),
      el('text', 1460, 540, 300, 40, { text: 'LEGEND', fontSize: 24, fontWeight: 700, color: '#f97316', textAlign: 'center' }),
      el('text', 560, 180, 800, 50, { text: 'Age 25 Season', fontSize: 32, fontWeight: 600, color: '#71717a', textAlign: 'center' }),
      el('comparison-bar', 560, 260, 800, 56, { label: 'AVG', value: 0.312, maxValue: 0.4, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 560, 340, 800, 56, { label: 'HR', value: 42, maxValue: 60, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 560, 420, 800, 56, { label: 'RBI', value: 118, maxValue: 160, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 560, 500, 800, 56, { label: 'OPS', value: 0.985, maxValue: 1.2, color: '#06b6d4', showValue: true }),
      el('stat-card', 200, 640, 660, 160, { label: 'WAR', value: '8.4', sublabel: 'Through age 25', color: '#06b6d4', fontSize: 56, variant: 'outline' }),
      el('stat-card', 1060, 640, 660, 160, { label: 'WAR', value: '7.8', sublabel: 'Through age 25', color: '#f97316', fontSize: 56, variant: 'outline' }),
    ]),
  },

  // ── TEAM TEMPLATES ────────────────────────────────────────────────────────

  {
    id: 'standings-ticker', name: 'Standings Ticker', category: 'team',
    description: 'Division standings in crawl format', icon: '\u21c4',
    width: 1920, height: 80,
    build: () => scene('Standings Ticker', 1920, 80, 'transparent', [
      el('ticker', 0, 0, 1920, 80, {
        text: 'AL East: NYY 62-40 | BAL 60-42 | TB 55-47 | TOR 50-52 | BOS 48-54 \u2022 AL Central: CLE 58-44 | MIN 55-47 | DET 50-52 | KC 48-54 | CWS 30-72',
        fontSize: 24, fontWeight: 600, color: '#ffffff', bgColor: '#09090b', speed: 50, direction: 'left', separator: ' \u2022 ', showBg: true,
      }),
    ]),
  },
  {
    id: 'team-record', name: 'Team Record Card', category: 'team',
    description: 'W-L, run diff, streak', icon: '\ud83c\udfc5',
    width: 1920, height: 1080,
    build: () => scene('Team Record Card', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1720, 80, { text: 'TEAM NAME', fontSize: 64, fontWeight: 900, color: '#06b6d4', textAlign: 'center' }),
      el('text', 100, 150, 1720, 40, { text: '2024 Season Record', fontSize: 24, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('stat-card', 160, 260, 480, 240, { label: 'RECORD', value: '62-40', sublabel: '.608 WIN%', color: '#22c55e', fontSize: 72, variant: 'glass' }),
      el('stat-card', 720, 260, 480, 240, { label: 'RUN DIFF', value: '+142', sublabel: '', color: '#06b6d4', fontSize: 72, variant: 'glass' }),
      el('stat-card', 1280, 260, 480, 240, { label: 'STREAK', value: 'W7', sublabel: '', color: '#ef4444', fontSize: 72, variant: 'glass' }),
      el('stat-card', 160, 560, 360, 160, { label: 'HOME', value: '35-16', sublabel: '', color: '#a855f7', fontSize: 48, variant: 'solid' }),
      el('stat-card', 560, 560, 360, 160, { label: 'AWAY', value: '27-24', sublabel: '', color: '#3b82f6', fontSize: 48, variant: 'solid' }),
      el('stat-card', 960, 560, 360, 160, { label: 'VS .500+', value: '28-18', sublabel: '', color: '#f97316', fontSize: 48, variant: 'solid' }),
      el('stat-card', 1360, 560, 400, 160, { label: '1-RUN GAMES', value: '18-12', sublabel: '', color: '#eab308', fontSize: 48, variant: 'solid' }),
      el('comparison-bar', 160, 780, 1600, 56, { label: 'Runs Scored/Game', value: 5.2, maxValue: 7, color: '#22c55e', showValue: true }),
      el('comparison-bar', 160, 860, 1600, 56, { label: 'Runs Allowed/Game', value: 3.4, maxValue: 7, color: '#ef4444', showValue: true }),
      el('comparison-bar', 160, 940, 1600, 56, { label: 'Pythagorean Win%', value: 0.632, maxValue: 1, color: '#06b6d4', showValue: true }),
    ]),
  },
  {
    id: 'wildcard-race', name: 'Wild Card Race', category: 'team',
    description: 'Teams with games back', icon: '\ud83c\udfc1',
    width: 1920, height: 1080,
    build: () => scene('Wild Card Race', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1720, 60, { text: 'WILD CARD RACE', fontSize: 52, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 125, 1720, 30, { text: 'American League — As of September 1', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('shape', 100, 170, 1720, 2, { shape: 'rect', fill: '#22c55e', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 100, 180, 300, 30, { text: 'IN PLAYOFF POSITION', fontSize: 14, fontWeight: 600, color: '#22c55e', textAlign: 'left' }),
      ...[0,1,2].map(i => el('comparison-bar', 100, 220 + i * 80, 1720, 64, { label: `WC${i + 1}: Team ${i + 1}`, value: 62 - i * 3, maxValue: 80, color: '#22c55e', showValue: true })),
      el('shape', 100, 480, 1720, 2, { shape: 'rect', fill: '#ef4444', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 100, 490, 300, 30, { text: 'CHASING', fontSize: 14, fontWeight: 600, color: '#ef4444', textAlign: 'left' }),
      ...[0,1,2,3].map(i => el('comparison-bar', 100, 530 + i * 80, 1720, 64, { label: `${i + 4}. Team ${i + 4} (${i + 1} GB)`, value: 58 - i * 2, maxValue: 80, color: '#f97316', showValue: true })),
    ]),
  },
  {
    id: 'power-rankings', name: 'Power Rankings', category: 'team',
    description: 'Numbered list with arrows', icon: '\u2191',
    width: 1920, height: 1080,
    build: () => scene('Power Rankings', 1920, 1080, '#09090b', [
      el('text', 100, 40, 1720, 60, { text: 'POWER RANKINGS', fontSize: 52, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 105, 1720, 30, { text: 'Week of September 1, 2024', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      ...[0,1,2,3,4,5,6,7,8,9].flatMap(i => {
        const y = 160 + i * 88
        const arrows = ['\u2014','\u2191 2','\u2193 1','\u2191 3','\u2014','\u2193 2','\u2191 1','\u2014','\u2191 4','\u2193 3']
        const arrowColors = ['#71717a','#22c55e','#ef4444','#22c55e','#71717a','#ef4444','#22c55e','#71717a','#22c55e','#ef4444']
        return [
          el('text', 80, y + 15, 60, 50, { text: `${i + 1}`, fontSize: 32, fontWeight: 800, color: '#52525b', textAlign: 'center' }),
          el('text', 160, y + 15, 500, 40, { text: `Team ${i + 1}`, fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'left' }),
          el('text', 160, y + 55, 300, 24, { text: `${62 - i * 2}-${40 + i * 2}`, fontSize: 14, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
          el('text', 700, y + 20, 100, 40, { text: arrows[i], fontSize: 16, fontWeight: 700, color: arrowColors[i], textAlign: 'center' }),
          el('comparison-bar', 850, y + 20, 990, 50, { label: '', value: 100 - i * 8, maxValue: 100, color: i < 3 ? '#22c55e' : i < 7 ? '#06b6d4' : '#f97316', showValue: false }),
          el('shape', 80, y + 85, 1760, 1, { shape: 'rect', fill: '#1a1a1e', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
        ]
      }),
    ]),
  },
  {
    id: 'team-staff', name: 'Team Pitching Staff', category: 'team',
    description: '5 starters in a row', icon: '\u2605',
    width: 1920, height: 1080,
    build: () => scene('Team Pitching Staff', 1920, 1080, '#09090b', [
      el('text', 100, 40, 1720, 60, { text: 'STARTING ROTATION', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 100, 1720, 30, { text: 'Team Name — 2024', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      ...[0,1,2,3,4].flatMap(i => {
        const x = 40 + i * 376
        const colors = ['#ef4444','#3b82f6','#22c55e','#f97316','#a855f7']
        return [
          el('player-image', x, 160, 356, 360, { playerId: null, playerName: '', borderColor: colors[i], showLabel: true }),
          el('stat-card', x, 540, 356, 120, { label: 'ERA', value: (2.5 + i * 0.5).toFixed(2), sublabel: '', color: colors[i], fontSize: 42, variant: 'glass' }),
          el('stat-card', x, 680, 170, 100, { label: 'W-L', value: `${14 - i * 2}-${5 + i}`, sublabel: '', color: colors[i], fontSize: 28, variant: 'solid' }),
          el('stat-card', x + 186, 680, 170, 100, { label: 'K', value: `${220 - i * 20}`, sublabel: '', color: colors[i], fontSize: 28, variant: 'solid' }),
          el('comparison-bar', x, 810, 356, 44, { label: 'K%', value: 30 - i * 2, maxValue: 40, color: colors[i], showValue: true }),
          el('comparison-bar', x, 870, 356, 44, { label: 'BB%', value: 5 + i, maxValue: 15, color: colors[i], showValue: true }),
        ]
      }),
    ]),
  },

  // ── NEW SOCIAL TEMPLATES ──────────────────────────────────────────────────

  {
    id: 'twitter-card', name: 'Twitter/X Card', category: 'social',
    description: '1200x628 stat + take', icon: '\ud835\udd4f',
    width: 1200, height: 628,
    build: () => scene('Twitter/X Card', 1200, 628, '#09090b', [
      el('player-image', 840, 40, 320, 400, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 40, 40, 760, 60, { text: 'HOT TAKE HEADLINE', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 40, 110, 760, 60, { text: 'HERE GOES', fontSize: 44, fontWeight: 800, color: '#06b6d4', textAlign: 'left' }),
      el('stat-card', 40, 200, 340, 140, { label: 'KEY STAT', value: '99.9', sublabel: '', color: '#ef4444', fontSize: 52, variant: 'glass' }),
      el('stat-card', 400, 200, 340, 140, { label: 'ANOTHER', value: '42', sublabel: '', color: '#22c55e', fontSize: 52, variant: 'glass' }),
      el('text', 40, 380, 760, 80, { text: 'Supporting context and analysis goes here in a sentence or two.', fontSize: 20, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
      el('shape', 40, 490, 200, 3, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 510, 400, 24, { text: '@YourHandle', fontSize: 16, fontWeight: 500, color: '#52525b', textAlign: 'left' }),
    ]),
  },
  {
    id: 'story-poll', name: 'Story Poll', category: 'social',
    description: '"Who\'s better?" A vs B', icon: 'VS',
    width: 1080, height: 1920,
    build: () => scene('Story Poll', 1080, 1920, '#09090b', [
      el('text', 40, 80, 1000, 80, { text: 'WHO\'S BETTER?', fontSize: 56, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('player-image', 140, 220, 340, 420, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('player-image', 600, 220, 340, 420, { playerId: null, playerName: '', borderColor: '#f97316', showLabel: true }),
      el('text', 490, 380, 100, 60, { text: 'VS', fontSize: 48, fontWeight: 900, color: '#27272a', textAlign: 'center' }),
      el('stat-card', 40, 700, 490, 140, { label: 'AVG', value: '.312', sublabel: '', color: '#06b6d4', fontSize: 48, variant: 'glass' }),
      el('stat-card', 550, 700, 490, 140, { label: 'AVG', value: '.298', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 40, 860, 490, 140, { label: 'HR', value: '42', sublabel: '', color: '#06b6d4', fontSize: 48, variant: 'glass' }),
      el('stat-card', 550, 860, 490, 140, { label: 'HR', value: '38', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 40, 1020, 490, 140, { label: 'WAR', value: '7.2', sublabel: '', color: '#06b6d4', fontSize: 48, variant: 'glass' }),
      el('stat-card', 550, 1020, 490, 140, { label: 'WAR', value: '6.8', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('text', 40, 1240, 1000, 60, { text: 'TAP TO VOTE', fontSize: 36, fontWeight: 700, color: '#71717a', textAlign: 'center' }),
      el('shape', 40, 1340, 490, 200, { shape: 'rect', fill: 'rgba(6,182,212,0.1)', stroke: '#06b6d4', strokeWidth: 2, borderRadius: 16 }),
      el('text', 40, 1410, 490, 50, { text: 'PLAYER A', fontSize: 32, fontWeight: 700, color: '#06b6d4', textAlign: 'center' }),
      el('shape', 550, 1340, 490, 200, { shape: 'rect', fill: 'rgba(249,115,22,0.1)', stroke: '#f97316', strokeWidth: 2, borderRadius: 16 }),
      el('text', 550, 1410, 490, 50, { text: 'PLAYER B', fontSize: 32, fontWeight: 700, color: '#f97316', textAlign: 'center' }),
    ]),
  },
  {
    id: 'carousel-slide', name: 'Carousel Slide', category: 'social',
    description: 'Numbered 1080x1080 slide', icon: '1/',
    width: 1080, height: 1080,
    build: () => scene('Carousel Slide', 1080, 1080, '#09090b', [
      el('text', 900, 40, 140, 40, { text: '1 / 5', fontSize: 18, fontWeight: 600, color: '#52525b', textAlign: 'right' }),
      el('shape', 40, 40, 60, 4, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 60, 1000, 80, { text: 'SLIDE TITLE', fontSize: 52, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 40, 150, 1000, 40, { text: 'Subtitle or context line', fontSize: 22, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('player-image', 340, 220, 400, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('stat-card', 40, 650, 490, 160, { label: 'STAT', value: '99.9', sublabel: 'Description', color: '#06b6d4', fontSize: 56, variant: 'glass' }),
      el('stat-card', 550, 650, 490, 160, { label: 'STAT', value: '42', sublabel: 'Description', color: '#ef4444', fontSize: 56, variant: 'glass' }),
      el('text', 40, 860, 1000, 80, { text: 'Key insight or analysis text goes here.', fontSize: 20, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
      el('text', 40, 1000, 1000, 30, { text: 'Swipe for more \u2192', fontSize: 16, fontWeight: 500, color: '#06b6d4', textAlign: 'center' }),
    ]),
  },
  {
    id: 'quote-card', name: 'Quote Card', category: 'social',
    description: 'Player/manager quote', icon: '\u201c',
    width: 1080, height: 1080,
    build: () => scene('Quote Card', 1080, 1080, '#09090b', [
      el('shape', 0, 0, 1080, 1080, { shape: 'rect', fill: '#0f172a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 80, 100, 80, 100, { text: '\u201c', fontSize: 120, fontWeight: 300, color: '#06b6d4', textAlign: 'left' }),
      el('text', 80, 220, 920, 320, { text: 'I felt like every pitch had a purpose tonight. The slider was really working and I was commanding the fastball well.', fontSize: 32, fontWeight: 500, color: '#ffffff', textAlign: 'left' }),
      el('shape', 80, 580, 120, 3, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('player-image', 80, 620, 180, 220, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: false }),
      el('text', 290, 660, 700, 40, { text: 'PLAYER NAME', fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'left' }),
      el('text', 290, 710, 700, 30, { text: 'Post-game interview — June 15, 2024', fontSize: 16, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('text', 80, 960, 920, 24, { text: '@YourChannel', fontSize: 16, fontWeight: 500, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'breaking-news', name: 'Breaking News', category: 'social',
    description: 'Red banner + urgent headline', icon: '\ud83d\udea8',
    width: 1920, height: 1080,
    build: () => scene('Breaking News', 1920, 1080, '#09090b', [
      el('shape', 0, 0, 1920, 80, { shape: 'rect', fill: '#ef4444', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 60, 15, 600, 50, { text: 'BREAKING NEWS', fontSize: 36, fontWeight: 900, color: '#ffffff', textAlign: 'left' }),
      el('player-image', 1400, 120, 440, 540, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: true }),
      el('text', 80, 140, 1260, 100, { text: 'MAJOR HEADLINE', fontSize: 72, fontWeight: 900, color: '#ffffff', textAlign: 'left' }),
      el('text', 80, 260, 1260, 80, { text: 'GOES HERE', fontSize: 72, fontWeight: 900, color: '#ef4444', textAlign: 'left' }),
      el('shape', 80, 370, 200, 4, { shape: 'rect', fill: '#ef4444', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 80, 400, 1260, 120, { text: 'Supporting details and context for the breaking news story. Include key stats and reaction.', fontSize: 28, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
      el('stat-card', 80, 580, 380, 160, { label: 'KEY STAT', value: '10yr', sublabel: '$350M', color: '#ef4444', fontSize: 52, variant: 'outline' }),
      el('stat-card', 500, 580, 380, 160, { label: 'AAV', value: '$35M', sublabel: 'per year', color: '#f97316', fontSize: 48, variant: 'outline' }),
      el('ticker', 0, 1000, 1920, 80, {
        text: 'BREAKING: Player signs historic contract extension \u2022 Full details coming soon \u2022 Largest deal in franchise history',
        fontSize: 22, fontWeight: 600, color: '#ffffff', bgColor: '#18181b', speed: 60, direction: 'left', separator: ' \u2022 ', showBg: true,
      }),
    ]),
  },
  {
    id: 'countdown', name: 'Countdown Card', category: 'social',
    description: '"X days until" with context', icon: '\u23f3',
    width: 1080, height: 1080,
    build: () => scene('Countdown Card', 1080, 1080, '#09090b', [
      el('text', 40, 120, 1000, 40, { text: 'ONLY', fontSize: 28, fontWeight: 600, color: '#71717a', textAlign: 'center' }),
      el('text', 40, 200, 1000, 300, { text: '42', fontSize: 280, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('text', 40, 520, 1000, 60, { text: 'DAYS UNTIL', fontSize: 32, fontWeight: 600, color: '#71717a', textAlign: 'center' }),
      el('text', 40, 600, 1000, 80, { text: 'OPENING DAY', fontSize: 64, fontWeight: 900, color: '#06b6d4', textAlign: 'center' }),
      el('shape', 440, 720, 200, 4, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 760, 1000, 40, { text: 'March 27, 2025', fontSize: 24, fontWeight: 400, color: '#52525b', textAlign: 'center' }),
      el('text', 40, 960, 1000, 24, { text: '@YourChannel', fontSize: 16, fontWeight: 500, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'trivia-card', name: 'Trivia Card', category: 'social',
    description: 'Question layout for engagement', icon: '?',
    width: 1080, height: 1080,
    build: () => scene('Trivia Card', 1080, 1080, '#09090b', [
      el('shape', 0, 0, 1080, 120, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 30, 1000, 60, { text: 'TRIVIA TIME', fontSize: 40, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('text', 60, 180, 960, 200, { text: 'Which pitcher holds the record for most strikeouts in a single season?', fontSize: 36, fontWeight: 700, color: '#ffffff', textAlign: 'center' }),
      el('shape', 60, 440, 960, 100, { shape: 'rect', fill: 'rgba(255,255,255,0.05)', stroke: '#27272a', strokeWidth: 1, borderRadius: 12 }),
      el('text', 60, 465, 960, 50, { text: 'A) Nolan Ryan', fontSize: 24, fontWeight: 600, color: '#a1a1aa', textAlign: 'center' }),
      el('shape', 60, 560, 960, 100, { shape: 'rect', fill: 'rgba(255,255,255,0.05)', stroke: '#27272a', strokeWidth: 1, borderRadius: 12 }),
      el('text', 60, 585, 960, 50, { text: 'B) Sandy Koufax', fontSize: 24, fontWeight: 600, color: '#a1a1aa', textAlign: 'center' }),
      el('shape', 60, 680, 960, 100, { shape: 'rect', fill: 'rgba(255,255,255,0.05)', stroke: '#27272a', strokeWidth: 1, borderRadius: 12 }),
      el('text', 60, 705, 960, 50, { text: 'C) Randy Johnson', fontSize: 24, fontWeight: 600, color: '#a1a1aa', textAlign: 'center' }),
      el('shape', 60, 800, 960, 100, { shape: 'rect', fill: 'rgba(255,255,255,0.05)', stroke: '#27272a', strokeWidth: 1, borderRadius: 12 }),
      el('text', 60, 825, 960, 50, { text: 'D) Pedro Martinez', fontSize: 24, fontWeight: 600, color: '#a1a1aa', textAlign: 'center' }),
      el('text', 60, 960, 960, 30, { text: 'Answer in the comments!', fontSize: 18, fontWeight: 500, color: '#52525b', textAlign: 'center' }),
    ]),
  },

  // ── BROADCAST TEMPLATES ───────────────────────────────────────────────────

  {
    id: 'score-bug', name: 'Score Bug', category: 'broadcast',
    description: 'Live game score overlay', icon: '\u25a3',
    width: 400, height: 120,
    build: () => scene('Score Bug', 400, 120, 'transparent', [
      el('shape', 0, 0, 400, 120, { shape: 'rect', fill: 'rgba(9,9,11,0.9)', stroke: '#27272a', strokeWidth: 1, borderRadius: 8 }),
      el('text', 15, 10, 180, 30, { text: 'NYY', fontSize: 22, fontWeight: 700, color: '#ffffff', textAlign: 'left' }),
      el('text', 300, 10, 80, 30, { text: '5', fontSize: 24, fontWeight: 800, color: '#ffffff', textAlign: 'right' }),
      el('shape', 15, 48, 370, 1, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 15, 55, 180, 30, { text: 'BOS', fontSize: 22, fontWeight: 700, color: '#a1a1aa', textAlign: 'left' }),
      el('text', 300, 55, 80, 30, { text: '3', fontSize: 24, fontWeight: 800, color: '#a1a1aa', textAlign: 'right' }),
      el('text', 15, 92, 370, 20, { text: 'BOT 7 \u2022 2 OUT', fontSize: 12, fontWeight: 500, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'fullscreen-stat', name: 'Full-Screen Stat', category: 'broadcast',
    description: 'Single dramatic number', icon: '#',
    width: 1920, height: 1080,
    build: () => scene('Full-Screen Stat', 1920, 1080, '#09090b', [
      el('text', 100, 200, 1720, 400, { text: '104.2', fontSize: 320, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 600, 1720, 80, { text: 'MILES PER HOUR', fontSize: 56, fontWeight: 700, color: '#06b6d4', textAlign: 'center' }),
      el('text', 100, 700, 1720, 50, { text: 'Fastest pitch of the 2024 season', fontSize: 28, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('shape', 860, 790, 200, 4, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 100, 830, 1720, 40, { text: 'Player Name — June 15 vs. Team', fontSize: 22, fontWeight: 400, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'side-panel', name: 'Side Panel', category: 'broadcast',
    description: 'Vertical sidebar for PiP', icon: '\u258c',
    width: 400, height: 1080,
    build: () => scene('Side Panel', 400, 1080, 'transparent', [
      el('shape', 0, 0, 400, 1080, { shape: 'rect', fill: 'rgba(9,9,11,0.92)', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('shape', 0, 0, 4, 1080, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('player-image', 80, 40, 240, 300, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('stat-card', 30, 380, 340, 110, { label: 'ERA', value: '2.89', sublabel: '', color: '#06b6d4', fontSize: 40, variant: 'glass' }),
      el('stat-card', 30, 510, 340, 110, { label: 'K', value: '218', sublabel: '', color: '#a855f7', fontSize: 40, variant: 'glass' }),
      el('stat-card', 30, 640, 340, 110, { label: 'WHIP', value: '0.98', sublabel: '', color: '#22c55e', fontSize: 40, variant: 'glass' }),
      el('stat-card', 30, 770, 340, 110, { label: 'AVG VELO', value: '96.8', sublabel: '', color: '#ef4444', fontSize: 40, variant: 'glass' }),
      el('text', 30, 920, 340, 30, { text: 'Tonight: 7 IP, 11 K', fontSize: 16, fontWeight: 500, color: '#71717a', textAlign: 'center' }),
    ]),
  },
  {
    id: 'pitching-change', name: 'Pitching Change', category: 'broadcast',
    description: 'Incoming pitcher overlay', icon: '\u21bb',
    width: 1920, height: 300,
    build: () => scene('Pitching Change', 1920, 300, 'transparent', [
      el('shape', 0, 0, 1920, 300, { shape: 'rect', fill: 'rgba(9,9,11,0.9)', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('shape', 0, 0, 6, 300, { shape: 'rect', fill: '#ef4444', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 30, 15, 400, 40, { text: 'PITCHING CHANGE', fontSize: 18, fontWeight: 700, color: '#ef4444', textAlign: 'left' }),
      el('player-image', 30, 60, 200, 220, { playerId: null, playerName: '', borderColor: '#ef4444', showLabel: false }),
      el('text', 260, 60, 500, 45, { text: 'PITCHER NAME', fontSize: 36, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 260, 110, 400, 30, { text: 'RHP | Closer', fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('stat-card', 800, 60, 240, 110, { label: 'ERA', value: '1.85', sublabel: '', color: '#22c55e', fontSize: 38, variant: 'glass' }),
      el('stat-card', 1060, 60, 240, 110, { label: 'K/9', value: '12.8', sublabel: '', color: '#a855f7', fontSize: 38, variant: 'glass' }),
      el('stat-card', 1320, 60, 240, 110, { label: 'SAVES', value: '38', sublabel: '', color: '#ef4444', fontSize: 38, variant: 'glass' }),
      el('stat-card', 1580, 60, 280, 110, { label: 'WHIP', value: '0.92', sublabel: '', color: '#06b6d4', fontSize: 38, variant: 'glass' }),
      el('comparison-bar', 800, 200, 1060, 44, { label: 'Save Conversion', value: 92, maxValue: 100, color: '#22c55e', showValue: true }),
    ]),
  },
  {
    id: 'k-counter', name: 'K Counter', category: 'broadcast',
    description: 'Strikeout count overlay', icon: 'K',
    width: 500, height: 200,
    build: () => scene('K Counter', 500, 200, 'transparent', [
      el('shape', 0, 0, 500, 200, { shape: 'rect', fill: 'rgba(9,9,11,0.9)', stroke: '#ef4444', strokeWidth: 2, borderRadius: 12 }),
      el('text', 20, 10, 460, 40, { text: 'STRIKEOUTS', fontSize: 16, fontWeight: 700, color: '#ef4444', textAlign: 'center' }),
      el('text', 20, 50, 460, 120, { text: '11', fontSize: 96, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('text', 20, 160, 460, 24, { text: 'Pitcher Name — Tonight', fontSize: 14, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
    ]),
  },
  {
    id: 'postgame-wrap', name: 'Post-Game Wrap', category: 'broadcast',
    description: 'Final score + player of game', icon: '\u2713',
    width: 1920, height: 1080,
    build: () => scene('Post-Game Wrap', 1920, 1080, '#09090b', [
      el('text', 100, 40, 1720, 50, { text: 'FINAL', fontSize: 32, fontWeight: 700, color: '#ef4444', textAlign: 'center' }),
      el('text', 100, 100, 800, 120, { text: 'NYY  7', fontSize: 96, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('text', 1020, 100, 800, 120, { text: 'BOS  3', fontSize: 96, fontWeight: 900, color: '#71717a', textAlign: 'center' }),
      el('shape', 100, 250, 1720, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 100, 280, 1720, 50, { text: 'PLAYER OF THE GAME', fontSize: 24, fontWeight: 700, color: '#06b6d4', textAlign: 'center' }),
      el('player-image', 760, 340, 400, 420, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('stat-card', 160, 800, 360, 140, { label: 'IP', value: '7.0', sublabel: '', color: '#06b6d4', fontSize: 48, variant: 'glass' }),
      el('stat-card', 560, 800, 360, 140, { label: 'K', value: '11', sublabel: '', color: '#a855f7', fontSize: 48, variant: 'glass' }),
      el('stat-card', 960, 800, 360, 140, { label: 'H', value: '3', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1360, 800, 400, 140, { label: 'ERA', value: '2.89', sublabel: 'Season', color: '#ef4444', fontSize: 48, variant: 'glass' }),
    ]),
  },
  {
    id: 'win-prob', name: 'Win Probability', category: 'broadcast',
    description: 'Large % with team context', icon: '%',
    width: 1920, height: 1080,
    build: () => scene('Win Probability', 1920, 1080, '#09090b', [
      el('text', 100, 80, 1720, 50, { text: 'WIN PROBABILITY', fontSize: 28, fontWeight: 700, color: '#71717a', textAlign: 'center' }),
      el('text', 100, 180, 1720, 400, { text: '94.2%', fontSize: 280, fontWeight: 900, color: '#22c55e', textAlign: 'center' }),
      el('text', 100, 580, 1720, 60, { text: 'TEAM NAME', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('text', 100, 660, 1720, 40, { text: 'Leading 5-1 | Bottom 8th | 2 Outs', fontSize: 24, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('comparison-bar', 200, 760, 1520, 64, { label: 'Home Team', value: 94.2, maxValue: 100, color: '#22c55e', showValue: true }),
      el('comparison-bar', 200, 850, 1520, 64, { label: 'Away Team', value: 5.8, maxValue: 100, color: '#ef4444', showValue: true }),
    ]),
  },

  // ── ADVANCED TEMPLATES ────────────────────────────────────────────────────

  {
    id: 'infographic', name: 'Infographic Long', category: 'advanced',
    description: 'Tall scrolling infographic', icon: '\ud83d\udcc4',
    width: 1080, height: 3240,
    build: () => scene('Infographic Long', 1080, 3240, '#09090b', [
      el('text', 40, 60, 1000, 80, { text: 'SEASON IN REVIEW', fontSize: 56, fontWeight: 900, color: '#ffffff', textAlign: 'center' }),
      el('text', 40, 150, 1000, 40, { text: 'Player Name — 2024', fontSize: 24, fontWeight: 400, color: '#71717a', textAlign: 'center' }),
      el('player-image', 340, 220, 400, 480, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: false }),
      el('stat-card', 40, 740, 490, 160, { label: 'AVG', value: '.312', sublabel: '', color: '#22c55e', fontSize: 56, variant: 'glass' }),
      el('stat-card', 550, 740, 490, 160, { label: 'HR', value: '42', sublabel: '', color: '#ef4444', fontSize: 56, variant: 'glass' }),
      el('stat-card', 40, 920, 490, 160, { label: 'RBI', value: '118', sublabel: '', color: '#f97316', fontSize: 56, variant: 'glass' }),
      el('stat-card', 550, 920, 490, 160, { label: 'WAR', value: '7.2', sublabel: '', color: '#06b6d4', fontSize: 56, variant: 'glass' }),
      el('shape', 40, 1140, 1000, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 1170, 1000, 50, { text: 'BATTED BALL PROFILE', fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'center' }),
      el('comparison-bar', 40, 1240, 1000, 56, { label: 'Barrel%', value: 14.2, maxValue: 20, color: '#ef4444', showValue: true }),
      el('comparison-bar', 40, 1320, 1000, 56, { label: 'Hard Hit%', value: 48.2, maxValue: 60, color: '#f97316', showValue: true }),
      el('comparison-bar', 40, 1400, 1000, 56, { label: 'Avg EV', value: 92.4, maxValue: 100, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 40, 1480, 1000, 56, { label: 'Max EV', value: 114.8, maxValue: 120, color: '#a855f7', showValue: true }),
      el('shape', 40, 1600, 1000, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 1630, 1000, 50, { text: 'SPRAY CHART', fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'center' }),
      el('stadium', 40, 1700, 1000, 600, {
        hits: [{ id: 'h1', batterId: null, batterName: '', eventFilter: '', bbTypeFilter: '', color: '#06b6d4', showInKey: false }],
        viewMode: 'overhead', park: 'generic', animate: false, showKey: false, bgColor: '#09090b', showWall: true, showField: true, loopDuration: 3, animMode: 'simultaneous', displayMode: 'all', singleHitIndex: 0,
      }),
      el('shape', 40, 2360, 1000, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 40, 2390, 1000, 50, { text: 'PLATE DISCIPLINE', fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'center' }),
      el('stat-card', 40, 2460, 490, 140, { label: 'BB%', value: '12.4', sublabel: '', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 550, 2460, 490, 140, { label: 'K%', value: '18.2', sublabel: '', color: '#ef4444', fontSize: 48, variant: 'glass' }),
      el('stat-card', 40, 2620, 490, 140, { label: 'CHASE%', value: '22.1', sublabel: '', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 550, 2620, 490, 140, { label: 'WHIFF%', value: '18.4', sublabel: '', color: '#3b82f6', fontSize: 48, variant: 'glass' }),
      el('text', 40, 2840, 1000, 60, { text: 'AWARDS & MILESTONES', fontSize: 28, fontWeight: 700, color: '#ffffff', textAlign: 'center' }),
      el('text', 40, 2920, 1000, 80, { text: '\u2022 All-Star Selection\n\u2022 Silver Slugger\n\u2022 40-HR Club', fontSize: 22, fontWeight: 500, color: '#a1a1aa', textAlign: 'center' }),
      el('text', 40, 3140, 1000, 30, { text: '@YourChannel', fontSize: 16, fontWeight: 500, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'baseball-card', name: 'Baseball Card', category: 'advanced',
    description: 'Classic retro card layout', icon: '\ud83c\udccf',
    width: 750, height: 1050,
    build: () => scene('Baseball Card', 750, 1050, '#1e3a5f', [
      el('shape', 20, 20, 710, 1010, { shape: 'rect', fill: '#0f2440', stroke: '#eab308', strokeWidth: 4, borderRadius: 16 }),
      el('shape', 40, 40, 670, 520, { shape: 'rect', fill: '#27272a', stroke: '#eab308', strokeWidth: 2, borderRadius: 12 }),
      el('player-image', 175, 50, 400, 500, { playerId: null, playerName: '', borderColor: '#eab308', showLabel: false }),
      el('text', 40, 580, 670, 60, { text: 'PLAYER NAME', fontSize: 36, fontWeight: 900, color: '#eab308', textAlign: 'center' }),
      el('text', 40, 640, 670, 30, { text: 'Team Name \u2022 Position', fontSize: 18, fontWeight: 500, color: '#a1a1aa', textAlign: 'center' }),
      el('shape', 100, 685, 550, 2, { shape: 'rect', fill: '#eab308', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('stat-card', 50, 710, 200, 100, { label: 'AVG', value: '.312', sublabel: '', color: '#eab308', fontSize: 36, variant: 'outline' }),
      el('stat-card', 275, 710, 200, 100, { label: 'HR', value: '42', sublabel: '', color: '#eab308', fontSize: 36, variant: 'outline' }),
      el('stat-card', 500, 710, 200, 100, { label: 'RBI', value: '118', sublabel: '', color: '#eab308', fontSize: 36, variant: 'outline' }),
      el('stat-card', 50, 830, 310, 100, { label: 'OPS', value: '.985', sublabel: '', color: '#eab308', fontSize: 36, variant: 'outline' }),
      el('stat-card', 390, 830, 310, 100, { label: 'WAR', value: '7.2', sublabel: '', color: '#eab308', fontSize: 36, variant: 'outline' }),
      el('text', 40, 960, 670, 24, { text: '2024 SEASON STATS', fontSize: 14, fontWeight: 600, color: '#52525b', textAlign: 'center' }),
    ]),
  },
  {
    id: 'stat-of-day', name: 'Stat of the Day', category: 'advanced',
    description: 'Clean minimal single stat', icon: '\u2606',
    width: 1920, height: 1080,
    build: () => scene('Stat of the Day', 1920, 1080, '#09090b', [
      el('text', 100, 160, 400, 30, { text: 'STAT OF THE DAY', fontSize: 18, fontWeight: 700, color: '#06b6d4', textAlign: 'left' }),
      el('shape', 100, 200, 80, 4, { shape: 'rect', fill: '#06b6d4', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }),
      el('text', 100, 260, 1200, 200, { text: '42', fontSize: 200, fontWeight: 900, color: '#ffffff', textAlign: 'left' }),
      el('text', 100, 480, 1200, 60, { text: 'HOME RUNS', fontSize: 48, fontWeight: 700, color: '#71717a', textAlign: 'left' }),
      el('text', 100, 560, 1200, 80, { text: 'Player Name has hit 42 home runs this season, the most in the American League and 3rd most in MLB.', fontSize: 24, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
      el('player-image', 1440, 200, 380, 480, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 100, 900, 600, 24, { text: 'Source: Statcast | @YourChannel', fontSize: 14, fontWeight: 400, color: '#52525b', textAlign: 'left' }),
    ]),
  },
  {
    id: 'percentile-ranks', name: 'Percentile Rankings', category: 'advanced',
    description: 'MLB-style percentile bars', icon: '\ud83d\udcca',
    width: 1920, height: 1080,
    build: () => scene('Percentile Rankings', 1920, 1080, '#09090b', [
      el('text', 100, 40, 1720, 60, { text: 'PERCENTILE RANKINGS', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('player-image', 100, 140, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('text', 100, 540, 300, 40, { text: 'PLAYER NAME', fontSize: 24, fontWeight: 700, color: '#ffffff', textAlign: 'center' }),
      el('comparison-bar', 500, 160, 1340, 56, { label: 'Exit Velocity (92nd)', value: 92, maxValue: 100, color: '#ef4444', showValue: true }),
      el('comparison-bar', 500, 240, 1340, 56, { label: 'Barrel% (88th)', value: 88, maxValue: 100, color: '#ef4444', showValue: true }),
      el('comparison-bar', 500, 320, 1340, 56, { label: 'Hard Hit% (85th)', value: 85, maxValue: 100, color: '#f97316', showValue: true }),
      el('comparison-bar', 500, 400, 1340, 56, { label: 'xwOBA (78th)', value: 78, maxValue: 100, color: '#f97316', showValue: true }),
      el('comparison-bar', 500, 480, 1340, 56, { label: 'xBA (72nd)', value: 72, maxValue: 100, color: '#eab308', showValue: true }),
      el('comparison-bar', 500, 560, 1340, 56, { label: 'K% (65th)', value: 65, maxValue: 100, color: '#eab308', showValue: true }),
      el('comparison-bar', 500, 640, 1340, 56, { label: 'BB% (58th)', value: 58, maxValue: 100, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 500, 720, 1340, 56, { label: 'Sprint Speed (45th)', value: 45, maxValue: 100, color: '#3b82f6', showValue: true }),
      el('comparison-bar', 500, 800, 1340, 56, { label: 'Chase Rate (82nd)', value: 82, maxValue: 100, color: '#f97316', showValue: true }),
      el('comparison-bar', 500, 880, 1340, 56, { label: 'Whiff% (55th)', value: 55, maxValue: 100, color: '#06b6d4', showValue: true }),
      el('text', 500, 960, 1340, 24, { text: 'Source: Baseball Savant | Percentile vs. MLB hitters', fontSize: 14, fontWeight: 400, color: '#52525b', textAlign: 'left' }),
    ]),
  },
  {
    id: 'pitch-design', name: 'Pitch Design Card', category: 'advanced',
    description: 'Spin rate, axis, efficiency', icon: '\u2699',
    width: 1920, height: 1080,
    build: () => scene('Pitch Design Card', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1200, 60, { text: 'PITCH DESIGN', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'left' }),
      el('text', 100, 125, 800, 30, { text: 'Four-Seam Fastball — Pitcher Name', fontSize: 20, fontWeight: 400, color: '#71717a', textAlign: 'left' }),
      el('pitch-flight', 100, 200, 800, 600, {
        pitches: [{ id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#ef4444', mode: 'player', showInKey: false }],
        viewMode: 'catcher', showZone: true, animate: true, bgColor: '#09090b', showGrid: true, loopDuration: 1.5, showKey: false,
      }),
      el('stat-card', 960, 200, 420, 160, { label: 'VELOCITY', value: '96.8', sublabel: 'mph avg', color: '#ef4444', fontSize: 56, variant: 'glass' }),
      el('stat-card', 1420, 200, 420, 160, { label: 'SPIN RATE', value: '2,412', sublabel: 'rpm', color: '#a855f7', fontSize: 52, variant: 'glass' }),
      el('stat-card', 960, 400, 420, 160, { label: 'SPIN EFF', value: '94.2%', sublabel: '', color: '#06b6d4', fontSize: 52, variant: 'glass' }),
      el('stat-card', 1420, 400, 420, 160, { label: 'SPIN AXIS', value: '11:45', sublabel: 'clock face', color: '#f97316', fontSize: 48, variant: 'glass' }),
      el('stat-card', 960, 600, 420, 160, { label: 'IVB', value: '18.2"', sublabel: 'induced vertical', color: '#22c55e', fontSize: 48, variant: 'glass' }),
      el('stat-card', 1420, 600, 420, 160, { label: 'HB', value: '-8.4"', sublabel: 'glove side', color: '#3b82f6', fontSize: 48, variant: 'glass' }),
      el('comparison-bar', 960, 810, 880, 56, { label: 'Whiff%', value: 28.4, maxValue: 40, color: '#ef4444', showValue: true }),
      el('comparison-bar', 960, 890, 880, 56, { label: 'CSW%', value: 32.1, maxValue: 40, color: '#06b6d4', showValue: true }),
    ]),
  },
  {
    id: 'war-breakdown', name: 'WAR Breakdown', category: 'advanced',
    description: 'Offense/defense/baserunning bars', icon: '\u2211',
    width: 1920, height: 1080,
    build: () => scene('WAR Breakdown', 1920, 1080, '#09090b', [
      el('text', 100, 60, 1720, 60, { text: 'WAR BREAKDOWN', fontSize: 48, fontWeight: 800, color: '#ffffff', textAlign: 'center' }),
      el('player-image', 100, 180, 300, 380, { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true }),
      el('stat-card', 100, 600, 300, 200, { label: 'TOTAL WAR', value: '7.2', sublabel: '2024 Season', color: '#06b6d4', fontSize: 72, variant: 'outline' }),
      el('text', 500, 180, 1340, 40, { text: 'COMPONENTS', fontSize: 24, fontWeight: 700, color: '#71717a', textAlign: 'left' }),
      el('comparison-bar', 500, 240, 1340, 80, { label: 'Batting Runs', value: 38, maxValue: 50, color: '#22c55e', showValue: true }),
      el('comparison-bar', 500, 350, 1340, 80, { label: 'Baserunning Runs', value: 4.2, maxValue: 10, color: '#06b6d4', showValue: true }),
      el('comparison-bar', 500, 460, 1340, 80, { label: 'Fielding Runs', value: 12, maxValue: 20, color: '#a855f7', showValue: true }),
      el('comparison-bar', 500, 570, 1340, 80, { label: 'Positional Adj', value: 2.5, maxValue: 10, color: '#f97316', showValue: true }),
      el('comparison-bar', 500, 680, 1340, 80, { label: 'Replacement Runs', value: 21, maxValue: 25, color: '#71717a', showValue: true }),
      el('text', 500, 800, 1340, 80, { text: 'Player Name ranks 3rd in MLB in total WAR, combining elite offense with above-average defense at a premium position.', fontSize: 20, fontWeight: 400, color: '#a1a1aa', textAlign: 'left' }),
    ]),
  },
]
