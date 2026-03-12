'use client'

import { use } from 'react'
import { useOverlaySession } from '@/lib/useOverlaySession'
import OverlayAssetRenderer from '@/components/overlay/OverlayAssetRenderer'
import StingerPlayer from '@/components/overlay/StingerPlayer'

function OverlayInner({ sessionId }: { sessionId: string }) {
  const { session, assets, visibleAssetIds, animatingAssets, slideshowIndexes, connected, error, hideAsset, notifyAdEnded, stinger, segmentOverrides, clearStinger, obsActive } = useOverlaySession(sessionId)

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

  // Render visible assets + assets in exit animation
  const renderedAssetIds = new Set([...visibleAssetIds])
  for (const [id, phase] of animatingAssets) {
    if (phase === 'exiting') renderedAssetIds.add(id)
  }

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
      {assets
        .filter(a => renderedAssetIds.has(a.id))
        .sort((a, b) => a.layer - b.layer)
        .map(asset => (
          <OverlayAssetRenderer
            key={asset.id}
            asset={asset}
            animationPhase={animatingAssets.get(asset.id) || null}
            fps={session.project_id ? 30 : 30}
            slideshowIndex={slideshowIndexes.get(asset.id) || 0}
            onVideoEnded={asset.asset_type === 'advertisement' ? () => { hideAsset(asset.id); notifyAdEnded(asset.id) } : undefined}
            overrides={segmentOverrides[asset.id]}
            obsActive={obsActive}
          />
        ))}

      {/* Stinger video overlay */}
      {stinger?.playing && (
        <StingerPlayer
          videoUrl={stinger.videoUrl}
          onStingerEnded={stinger.swapCallback}
          onComplete={clearStinger}
          enterTransition={stinger.enterTransition}
        />
      )}

      {/* Connection indicator — hidden in OBS, useful for debugging */}
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

export default function OverlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  return <OverlayInner sessionId={sessionId} />
}
