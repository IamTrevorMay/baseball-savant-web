/**
 * transitions — Preset animation transitions for Scene Composer elements.
 *
 * Each transition generates keyframes that animate an element in or out.
 * Apply a transition → it creates keyframes on the element automatically.
 */

import { Keyframe, EasingFunction, SceneElement } from './sceneTypes'

export interface TransitionPreset {
  id: string
  name: string
  category: 'enter' | 'exit' | 'emphasis'
  icon: string
  /** Generate keyframes for the given element. startFrame is when the animation begins. */
  generate: (el: SceneElement, startFrame: number, durationFrames: number) => Keyframe[]
}

// ── Enter Transitions ────────────────────────────────────────────────────────

export const TRANSITIONS: TransitionPreset[] = [
  // Entrances
  {
    id: 'fade-in',
    name: 'Fade In',
    category: 'enter',
    icon: '\u25cc',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: el.y, width: el.width, height: el.height, opacity: 0, rotation: el.rotation }, easing: 'ease-out' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, width: el.width, height: el.height, opacity: 1, rotation: el.rotation }, easing: 'ease-out' as EasingFunction },
    ],
  },
  {
    id: 'slide-in-left',
    name: 'Slide In Left',
    category: 'enter',
    icon: '\u2192',
    generate: (el, start, dur) => [
      { frame: start, props: { x: -el.width, y: el.y, opacity: 0 }, easing: 'ease-out' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-out' as EasingFunction },
    ],
  },
  {
    id: 'slide-in-right',
    name: 'Slide In Right',
    category: 'enter',
    icon: '\u2190',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x + el.width + 200, y: el.y, opacity: 0 }, easing: 'ease-out' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-out' as EasingFunction },
    ],
  },
  {
    id: 'slide-in-top',
    name: 'Slide In Top',
    category: 'enter',
    icon: '\u2193',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: -el.height, opacity: 0 }, easing: 'ease-out' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-out' as EasingFunction },
    ],
  },
  {
    id: 'slide-in-bottom',
    name: 'Slide In Bottom',
    category: 'enter',
    icon: '\u2191',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: el.y + el.height + 200, opacity: 0 }, easing: 'ease-out' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-out' as EasingFunction },
    ],
  },
  {
    id: 'scale-up',
    name: 'Scale Up',
    category: 'enter',
    icon: '\u2922',
    generate: (el, start, dur) => {
      const shrink = 0.5
      const dw = el.width * (1 - shrink) / 2
      const dh = el.height * (1 - shrink) / 2
      return [
        { frame: start, props: { x: el.x + dw, y: el.y + dh, width: el.width * shrink, height: el.height * shrink, opacity: 0 }, easing: 'ease-out' as EasingFunction },
        { frame: start + dur, props: { x: el.x, y: el.y, width: el.width, height: el.height, opacity: 1 }, easing: 'ease-out' as EasingFunction },
      ]
    },
  },
  {
    id: 'pop',
    name: 'Pop',
    category: 'enter',
    icon: '\u2b24',
    generate: (el, start, dur) => {
      const overshoot = 1.1
      const dw = el.width * (1 - overshoot) / 2
      const dh = el.height * (1 - overshoot) / 2
      return [
        { frame: start, props: { x: el.x + el.width * 0.25, y: el.y + el.height * 0.25, width: el.width * 0.5, height: el.height * 0.5, opacity: 0 }, easing: 'ease-out' as EasingFunction },
        { frame: start + Math.floor(dur * 0.7), props: { x: el.x + dw, y: el.y + dh, width: el.width * overshoot, height: el.height * overshoot, opacity: 1 }, easing: 'ease-out' as EasingFunction },
        { frame: start + dur, props: { x: el.x, y: el.y, width: el.width, height: el.height, opacity: 1 }, easing: 'ease-in-out' as EasingFunction },
      ]
    },
  },
  {
    id: 'rotate-in',
    name: 'Rotate In',
    category: 'enter',
    icon: '\u21bb',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: el.y, opacity: 0, rotation: -90 }, easing: 'ease-out' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, opacity: 1, rotation: 0 }, easing: 'ease-out' as EasingFunction },
    ],
  },

  // Exits
  {
    id: 'fade-out',
    name: 'Fade Out',
    category: 'exit',
    icon: '\u25cc',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-in' as EasingFunction },
      { frame: start + dur, props: { x: el.x, y: el.y, opacity: 0 }, easing: 'ease-in' as EasingFunction },
    ],
  },
  {
    id: 'slide-out-left',
    name: 'Slide Out Left',
    category: 'exit',
    icon: '\u2190',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-in' as EasingFunction },
      { frame: start + dur, props: { x: -el.width, y: el.y, opacity: 0 }, easing: 'ease-in' as EasingFunction },
    ],
  },
  {
    id: 'slide-out-right',
    name: 'Slide Out Right',
    category: 'exit',
    icon: '\u2192',
    generate: (el, start, dur) => [
      { frame: start, props: { x: el.x, y: el.y, opacity: 1 }, easing: 'ease-in' as EasingFunction },
      { frame: start + dur, props: { x: el.x + el.width + 200, y: el.y, opacity: 0 }, easing: 'ease-in' as EasingFunction },
    ],
  },
  {
    id: 'scale-down',
    name: 'Scale Down',
    category: 'exit',
    icon: '\u2923',
    generate: (el, start, dur) => {
      const shrink = 0.3
      const dw = el.width * (1 - shrink) / 2
      const dh = el.height * (1 - shrink) / 2
      return [
        { frame: start, props: { x: el.x, y: el.y, width: el.width, height: el.height, opacity: 1 }, easing: 'ease-in' as EasingFunction },
        { frame: start + dur, props: { x: el.x + dw, y: el.y + dh, width: el.width * shrink, height: el.height * shrink, opacity: 0 }, easing: 'ease-in' as EasingFunction },
      ]
    },
  },

  // Emphasis
  {
    id: 'pulse',
    name: 'Pulse',
    category: 'emphasis',
    icon: '\u2764',
    generate: (el, start, dur) => {
      const half = Math.floor(dur / 2)
      const grow = 1.08
      const dw = el.width * (1 - grow) / 2
      const dh = el.height * (1 - grow) / 2
      return [
        { frame: start, props: { x: el.x, y: el.y, width: el.width, height: el.height }, easing: 'ease-in-out' as EasingFunction },
        { frame: start + half, props: { x: el.x + dw, y: el.y + dh, width: el.width * grow, height: el.height * grow }, easing: 'ease-in-out' as EasingFunction },
        { frame: start + dur, props: { x: el.x, y: el.y, width: el.width, height: el.height }, easing: 'ease-in-out' as EasingFunction },
      ]
    },
  },
  {
    id: 'shake',
    name: 'Shake',
    category: 'emphasis',
    icon: '\u21c4',
    generate: (el, start, dur) => {
      const step = Math.max(2, Math.floor(dur / 6))
      const offset = 12
      return [
        { frame: start, props: { x: el.x }, easing: 'linear' as EasingFunction },
        { frame: start + step, props: { x: el.x - offset }, easing: 'linear' as EasingFunction },
        { frame: start + step * 2, props: { x: el.x + offset }, easing: 'linear' as EasingFunction },
        { frame: start + step * 3, props: { x: el.x - offset * 0.6 }, easing: 'linear' as EasingFunction },
        { frame: start + step * 4, props: { x: el.x + offset * 0.3 }, easing: 'linear' as EasingFunction },
        { frame: start + dur, props: { x: el.x }, easing: 'ease-out' as EasingFunction },
      ]
    },
  },
  {
    id: 'bounce',
    name: 'Bounce',
    category: 'emphasis',
    icon: '\u2195',
    generate: (el, start, dur) => {
      const step = Math.max(2, Math.floor(dur / 4))
      return [
        { frame: start, props: { y: el.y }, easing: 'ease-out' as EasingFunction },
        { frame: start + step, props: { y: el.y - 30 }, easing: 'ease-out' as EasingFunction },
        { frame: start + step * 2, props: { y: el.y }, easing: 'ease-in' as EasingFunction },
        { frame: start + step * 3, props: { y: el.y - 12 }, easing: 'ease-out' as EasingFunction },
        { frame: start + dur, props: { y: el.y }, easing: 'ease-in' as EasingFunction },
      ]
    },
  },
]

/** Get transitions by category */
export function getTransitions(category?: 'enter' | 'exit' | 'emphasis'): TransitionPreset[] {
  return category ? TRANSITIONS.filter(t => t.category === category) : TRANSITIONS
}

/** Apply a transition to an element, returning the new keyframes array */
export function applyTransition(
  el: SceneElement,
  transitionId: string,
  startFrame: number,
  durationFrames: number,
): Keyframe[] {
  const preset = TRANSITIONS.find(t => t.id === transitionId)
  if (!preset) return el.keyframes || []

  const newKfs = preset.generate(el, startFrame, durationFrames)

  // Merge with existing keyframes: remove any in the transition range, then add new ones
  const existing = (el.keyframes || []).filter(
    kf => kf.frame < startFrame || kf.frame > startFrame + durationFrames
  )

  return [...existing, ...newKfs].sort((a, b) => a.frame - b.frame)
}
