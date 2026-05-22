'use client'

import type { PanelContent } from '@/lib/producerTypes'
import PanelContentRenderer from './PanelContent'

interface Props {
  content: PanelContent
  animating: 'entering' | 'exiting' | null
}

const ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'
const EXIT_EASING = 'cubic-bezier(0.7, 0, 0.84, 0)'

export default function LowerBarPanel({ content, animating }: Props) {
  const transform = animating === 'entering'
    ? 'translateY(100%)'
    : animating === 'exiting'
    ? 'translateY(100%)'
    : 'translateY(0)'

  const animation = animating === 'entering'
    ? `slideUpIn 400ms ${ENTER_EASING} forwards`
    : animating === 'exiting'
    ? `slideDownOut 350ms ${EXIT_EASING} forwards`
    : undefined

  return (
    <>
      <style>{`
        @keyframes slideUpIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideDownOut {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 140,
          animation,
          transform: animating ? undefined : 'translateY(0)',
          willChange: 'transform',
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(180deg, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.98) 100%)',
            borderTop: '1px solid rgba(63,63,70,0.5)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 48px',
          }}
        >
          <PanelContentRenderer content={content} position="lower-bar" />
        </div>
      </div>
    </>
  )
}
