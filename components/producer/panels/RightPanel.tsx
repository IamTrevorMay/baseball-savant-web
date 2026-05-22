'use client'

import type { PanelContent } from '@/lib/producerTypes'
import PanelContentRenderer from './PanelContent'

interface Props {
  content: PanelContent
  animating: 'entering' | 'exiting' | null
}

const ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'
const EXIT_EASING = 'cubic-bezier(0.7, 0, 0.84, 0)'

export default function RightPanel({ content, animating }: Props) {
  const animation = animating === 'entering'
    ? `slideLeftIn 400ms ${ENTER_EASING} forwards`
    : animating === 'exiting'
    ? `slideRightOut 350ms ${EXIT_EASING} forwards`
    : undefined

  return (
    <>
      <style>{`
        @keyframes slideLeftIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideRightOut {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          top: 80,
          right: 0,
          width: 460,
          bottom: 160,
          animation,
          transform: animating ? undefined : 'translateX(0)',
          willChange: 'transform',
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.98) 100%)',
            borderLeft: '1px solid rgba(63,63,70,0.5)',
            padding: '24px 28px',
            overflow: 'hidden',
          }}
        >
          <PanelContentRenderer content={content} position="right-panel" />
        </div>
      </div>
    </>
  )
}
