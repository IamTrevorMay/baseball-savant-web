import { SceneElement, Keyframe, EasingFunction } from './sceneTypes'

// ── Easing Functions ────────────────────────────────────────────────────────

const EASINGS: Record<EasingFunction, (t: number) => number> = {
  'linear': t => t,
  'ease-in': t => t * t,
  'ease-out': t => t * (2 - t),
  'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
}

function applyEasing(t: number, easing: EasingFunction): number {
  return EASINGS[easing]?.(t) ?? t
}

// ── Interpolation ───────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Interpolate an element's animated properties at a given frame.
 * Returns null if the element is outside its enter/exit range.
 */
export function interpolateElement(element: SceneElement, frame: number): SceneElement | null {
  const totalFrames = Infinity // scene sets the cap

  // Check enter/exit visibility
  if (element.enterFrame !== undefined && frame < element.enterFrame) return null
  if (element.exitFrame !== undefined && frame > element.exitFrame) return null

  // No keyframes — return element as-is
  if (!element.keyframes || element.keyframes.length === 0) return element

  const kfs = [...element.keyframes].sort((a, b) => a.frame - b.frame)

  // Before first keyframe — use element defaults (no interpolation)
  if (frame <= kfs[0].frame) {
    return applyKeyframeProps(element, kfs[0])
  }

  // After last keyframe — use last keyframe values
  if (frame >= kfs[kfs.length - 1].frame) {
    return applyKeyframeProps(element, kfs[kfs.length - 1])
  }

  // Find bracketing keyframes
  let prevKf = kfs[0]
  let nextKf = kfs[kfs.length - 1]
  for (let i = 0; i < kfs.length - 1; i++) {
    if (frame >= kfs[i].frame && frame <= kfs[i + 1].frame) {
      prevKf = kfs[i]
      nextKf = kfs[i + 1]
      break
    }
  }

  const range = nextKf.frame - prevKf.frame
  if (range === 0) return applyKeyframeProps(element, prevKf)

  const rawT = (frame - prevKf.frame) / range
  const t = applyEasing(rawT, nextKf.easing)

  // Interpolate between the two keyframes
  const result = { ...element }
  const animProps: (keyof Keyframe['props'])[] = ['x', 'y', 'width', 'height', 'opacity', 'rotation']

  for (const prop of animProps) {
    const prevVal = prevKf.props[prop]
    const nextVal = nextKf.props[prop]
    if (prevVal !== undefined && nextVal !== undefined) {
      (result as any)[prop] = lerp(prevVal, nextVal, t)
    } else if (prevVal !== undefined) {
      (result as any)[prop] = prevVal
    } else if (nextVal !== undefined) {
      (result as any)[prop] = nextVal
    }
  }

  return result
}

function applyKeyframeProps(element: SceneElement, kf: Keyframe): SceneElement {
  const result = { ...element }
  for (const [key, value] of Object.entries(kf.props)) {
    if (value !== undefined) (result as any)[key] = value
  }
  return result
}

/**
 * Interpolate all elements in a scene at a given frame.
 * Filters out elements that are not visible at the current frame.
 */
export function interpolateScene(elements: SceneElement[], frame: number): SceneElement[] {
  return elements
    .map(el => interpolateElement(el, frame))
    .filter((el): el is SceneElement => el !== null)
}
