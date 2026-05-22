'use client'

import { use } from 'react'
import { useProducerOverlay } from '@/lib/useProducerOverlay'
import LowerBarPanel from '@/components/producer/panels/LowerBarPanel'
import RightPanel from '@/components/producer/panels/RightPanel'

function ProducerPanelsInner({ sessionId }: { sessionId: string }) {
  const { session, connected, error, panels } = useProducerOverlay(sessionId)

  if (error) {
    return (
      <div style={{ width: 1920, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#ef4444', fontSize: 14 }}>Error: {error}</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ width: 1920, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#71717a', fontSize: 14 }}>Connecting...</div>
      </div>
    )
  }

  const lowerBar = panels['lower-bar']
  const rightPanel = panels['right-panel']

  return (
    <div
      style={{
        position: 'relative',
        width: 1920,
        height: 1080,
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* Lower Bar Panel */}
      {(lowerBar.visible || lowerBar.animating === 'exiting') && lowerBar.content && (
        <LowerBarPanel
          content={lowerBar.content}
          animating={lowerBar.animating}
        />
      )}

      {/* Right Panel */}
      {(rightPanel.visible || rightPanel.animating === 'exiting') && rightPanel.content && (
        <RightPanel
          content={rightPanel.content}
          animating={rightPanel.animating}
        />
      )}

      {/* Connection indicator */}
      {!connected && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#ef4444',
          }}
        />
      )}
    </div>
  )
}

export default function ProducerPanelsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  return <ProducerPanelsInner sessionId={sessionId} />
}
