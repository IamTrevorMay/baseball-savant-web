import type { SlideshowTransitionType } from './broadcastTypes'

export function generateSlideshowTransitionCSS(type: SlideshowTransitionType, durationMs: number) {
  const id = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const oldName = `${id}-old`
  const newName = `${id}-new`
  let keyframes = ''

  switch (type) {
    case 'crossfade':
      keyframes = `
        @keyframes ${oldName} { from { opacity: 1; } to { opacity: 0; } }
        @keyframes ${newName} { from { opacity: 0; } to { opacity: 1; } }`
      break
    case 'slide-left':
      keyframes = `
        @keyframes ${oldName} { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        @keyframes ${newName} { from { transform: translateX(100%); } to { transform: translateX(0); } }`
      break
    case 'slide-right':
      keyframes = `
        @keyframes ${oldName} { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @keyframes ${newName} { from { transform: translateX(-100%); } to { transform: translateX(0); } }`
      break
    case 'slide-up':
      keyframes = `
        @keyframes ${oldName} { from { transform: translateY(0); } to { transform: translateY(-100%); } }
        @keyframes ${newName} { from { transform: translateY(100%); } to { transform: translateY(0); } }`
      break
    case 'slide-down':
      keyframes = `
        @keyframes ${oldName} { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes ${newName} { from { transform: translateY(-100%); } to { transform: translateY(0); } }`
      break
    case 'zoom':
      keyframes = `
        @keyframes ${oldName} { from { transform: scale(1); opacity: 1; } to { transform: scale(0.7); opacity: 0; } }
        @keyframes ${newName} { from { transform: scale(1.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }`
      break
    case 'flip':
      keyframes = `
        @keyframes ${oldName} { from { transform: perspective(800px) rotateY(0deg); opacity: 1; } to { transform: perspective(800px) rotateY(90deg); opacity: 0; } }
        @keyframes ${newName} { from { transform: perspective(800px) rotateY(-90deg); opacity: 0; } to { transform: perspective(800px) rotateY(0deg); opacity: 1; } }`
      break
    case 'wipe':
      keyframes = `
        @keyframes ${oldName} { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 0 100%); } }
        @keyframes ${newName} { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`
      break
    default:
      return null
  }

  const easing = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
  return {
    oldAnimation: `${oldName} ${durationMs}ms ${easing} forwards`,
    newAnimation: `${newName} ${durationMs}ms ${easing} forwards`,
    keyframes,
  }
}
