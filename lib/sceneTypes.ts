export type ElementType = 'stat-card' | 'text' | 'shape' | 'player-image' | 'comparison-bar'

export interface SceneElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  zIndex: number
  locked: boolean
  props: Record<string, any>
}

export interface Scene {
  id: string
  name: string
  width: number
  height: number
  background: string
  elements: SceneElement[]
}

export const ELEMENT_CATALOG: { type: ElementType; name: string; desc: string; icon: string }[] = [
  { type: 'stat-card', name: 'Stat Card', desc: 'Bold stat with label', icon: '#' },
  { type: 'text', name: 'Text', desc: 'Custom text block', icon: 'T' },
  { type: 'shape', name: 'Shape', desc: 'Rectangle or circle', icon: '\u25a1' },
  { type: 'player-image', name: 'Player', desc: 'MLB headshot', icon: '\u25c9' },
  { type: 'comparison-bar', name: 'Stat Bar', desc: 'Horizontal bar', icon: '\u25ac' },
]

const DEFAULTS: Record<ElementType, { w: number; h: number; props: Record<string, any> }> = {
  'stat-card': {
    w: 280, h: 160,
    props: { label: 'ERA', value: '2.89', sublabel: '2024', color: '#06b6d4', fontSize: 48, variant: 'glass' },
  },
  'text': {
    w: 400, h: 80,
    props: { text: 'Title Text', fontSize: 36, fontWeight: 700, color: '#ffffff', textAlign: 'center' },
  },
  'shape': {
    w: 200, h: 200,
    props: { shape: 'rect', fill: '#18181b', stroke: '#06b6d4', strokeWidth: 1, borderRadius: 12 },
  },
  'player-image': {
    w: 180, h: 220,
    props: { playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true },
  },
  'comparison-bar': {
    w: 400, h: 48,
    props: { label: 'Fastball', value: 96.2, maxValue: 105, color: '#06b6d4', showValue: true },
  },
}

let zCounter = 100

export function createElement(type: ElementType, centerX: number, centerY: number): SceneElement {
  const d = DEFAULTS[type]
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    x: Math.round(centerX - d.w / 2),
    y: Math.round(centerY - d.h / 2),
    width: d.w,
    height: d.h,
    rotation: 0,
    opacity: 1,
    zIndex: ++zCounter,
    locked: false,
    props: { ...d.props },
  }
}

export function createDefaultScene(): Scene {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: 'Untitled Scene',
    width: 1920,
    height: 1080,
    background: '#09090b',
    elements: [],
  }
}

export const SCENE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1920\u00d71080 (16:9)', w: 1920, h: 1080 },
  { label: '1080\u00d71920 (9:16)', w: 1080, h: 1920 },
  { label: '1080\u00d71080 (1:1)', w: 1080, h: 1080 },
  { label: '3840\u00d72160 (4K)', w: 3840, h: 2160 },
]
