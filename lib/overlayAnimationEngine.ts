import { TRANSITIONS } from './transitions'
import { SceneElement } from './sceneTypes'
import { TransitionConfig } from './broadcastTypes'

export interface AnimationState {
  assetId: string
  phase: 'entering' | 'visible' | 'exiting' | 'hidden'
  progress: number // 0..1
  startTime: number
  durationMs: number
  transitionId: string | null
}

// Convert frames to milliseconds at given FPS
function framesToMs(frames: number, fps: number = 30): number {
  return (frames / fps) * 1000
}

// CSS easing from transition category
function getEasing(category: 'enter' | 'exit'): string {
  return category === 'enter' ? 'cubic-bezier(0.25, 0.1, 0.25, 1)' : 'cubic-bezier(0.55, 0.06, 0.68, 0.19)'
}

// Generate CSS keyframe animation for an asset wrapper
export function generateCSSAnimation(
  transitionConfig: TransitionConfig | null,
  phase: 'enter' | 'exit',
  canvasWidth: number,
  canvasHeight: number,
  canvasX: number,
  canvasY: number,
  fps: number = 30,
): { animation: string; keyframes: string } | null {
  if (!transitionConfig) return null

  const preset = TRANSITIONS.find(t => t.id === transitionConfig.presetId)
  if (!preset) return null

  const durationMs = framesToMs(transitionConfig.durationFrames, fps)
  const easing = getEasing(phase)

  // Generate a unique animation name
  const animName = `broadcast-${phase}-${Date.now()}`

  // Build CSS keyframes based on preset type
  let keyframesCSS = ''

  switch (transitionConfig.presetId) {
    case 'fade-in':
      keyframesCSS = `@keyframes ${animName} { from { opacity: 0; } to { opacity: 1; } }`
      break
    case 'fade-out':
      keyframesCSS = `@keyframes ${animName} { from { opacity: 1; } to { opacity: 0; } }`
      break
    case 'slide-in-left':
      keyframesCSS = `@keyframes ${animName} { from { transform: translateX(-${canvasX + canvasWidth}px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`
      break
    case 'slide-in-right':
      keyframesCSS = `@keyframes ${animName} { from { transform: translateX(${1920 - canvasX + 200}px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`
      break
    case 'slide-in-top':
      keyframesCSS = `@keyframes ${animName} { from { transform: translateY(-${canvasY + canvasHeight}px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`
      break
    case 'slide-in-bottom':
      keyframesCSS = `@keyframes ${animName} { from { transform: translateY(${1080 - canvasY + 200}px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`
      break
    case 'slide-out-left':
      keyframesCSS = `@keyframes ${animName} { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-${canvasX + canvasWidth}px); opacity: 0; } }`
      break
    case 'slide-out-right':
      keyframesCSS = `@keyframes ${animName} { from { transform: translateX(0); opacity: 1; } to { transform: translateX(${1920 - canvasX + 200}px); opacity: 0; } }`
      break
    case 'scale-up':
      keyframesCSS = `@keyframes ${animName} { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }`
      break
    case 'scale-down':
      keyframesCSS = `@keyframes ${animName} { from { transform: scale(1); opacity: 1; } to { transform: scale(0.3); opacity: 0; } }`
      break
    case 'pop':
      keyframesCSS = `@keyframes ${animName} { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }`
      break
    case 'rotate-in':
      keyframesCSS = `@keyframes ${animName} { from { transform: rotate(-90deg); opacity: 0; } to { transform: rotate(0deg); opacity: 1; } }`
      break
    // Broadcast-specific presets
    case 'wipe-left':
      keyframesCSS = `@keyframes ${animName} { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`
      break
    case 'wipe-right':
      keyframesCSS = `@keyframes ${animName} { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }`
      break
    case 'drop-in':
      keyframesCSS = `@keyframes ${animName} { 0% { transform: translateY(-100%) scale(0.8); opacity: 0; } 60% { transform: translateY(5%) scale(1.02); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }`
      break
    default:
      keyframesCSS = `@keyframes ${animName} { from { opacity: ${phase === 'enter' ? 0 : 1}; } to { opacity: ${phase === 'enter' ? 1 : 0}; } }`
  }

  return {
    animation: `${animName} ${durationMs}ms ${easing} both`,
    keyframes: keyframesCSS,
  }
}

// Inject CSS keyframes into document
export function injectKeyframes(css: string): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  return style
}

// Clean up injected style
export function removeKeyframes(style: HTMLStyleElement): void {
  style.remove()
}
