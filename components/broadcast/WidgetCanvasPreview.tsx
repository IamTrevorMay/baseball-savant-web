'use client'

import { BroadcastAsset } from '@/lib/broadcastTypes'
import type { WidgetConfig } from '@/lib/widgetTypes'

export default function WidgetCanvasPreview({ asset, isVisible }: { asset: BroadcastAsset; isVisible: boolean }) {
  const config = asset.widget_config as WidgetConfig | undefined
  const dimmedOpacity = isVisible ? (asset.opacity ?? 1) : (asset.opacity ?? 1) * 0.3
  const widgetType = config?.widget_type || 'chat'

  function renderContent() {
    switch (widgetType) {
      case 'chat':
        return (
          <div className="p-2 space-y-1">
            <div className="text-[9px] text-cyan-400 font-medium mb-1">CHAT</div>
            {['UserA: Hello everyone!', 'UserB: Let\'s go!', 'UserC: GG'].map((msg, i) => (
              <div key={i} className="text-[8px] text-zinc-400 truncate">{msg}</div>
            ))}
          </div>
        )
      case 'lowerthird':
        return (
          <div className="flex items-center h-full">
            <div className="w-12 h-full bg-cyan-500/20 flex items-center justify-center">
              <div className="w-6 h-6 bg-cyan-500/30 rounded" />
            </div>
            <div className="flex-1 px-3">
              <div className="text-[10px] text-cyan-400 font-medium">Username</div>
              <div className="text-[8px] text-zinc-400">Message content here...</div>
            </div>
          </div>
        )
      case 'countdown':
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-2xl font-mono font-bold text-white">05:00</span>
          </div>
        )
      case 'topic':
        return (
          <div className="flex items-center h-full px-4">
            <div className="flex-1">
              <div className="text-[10px] text-cyan-400 font-medium mb-0.5">TOPIC</div>
              <div className="text-[14px] text-white font-semibold">Topic Header</div>
              <div className="text-[10px] text-zinc-400">Topic body text...</div>
            </div>
          </div>
        )
      case 'notifications':
        return (
          <div className="p-2 space-y-1">
            <div className="text-[9px] text-amber-400 font-medium mb-1">NOTIFICATIONS</div>
            {['Sub: UserX', 'Cheer: UserY 500'].map((n, i) => (
              <div key={i} className="text-[8px] text-zinc-400">{n}</div>
            ))}
          </div>
        )
      case 'usernames':
        return (
          <div className="p-2 space-y-0.5">
            <div className="text-[9px] text-amber-400 font-medium mb-1">USERNAMES</div>
            {['User1', 'User2', 'User3'].map((n, i) => (
              <div key={i} className="text-[8px] text-zinc-400">{n}</div>
            ))}
          </div>
        )
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-zinc-500">Widget</span>
          </div>
        )
    }
  }

  return (
    <div
      className="w-full h-full overflow-hidden relative"
      style={{
        opacity: dimmedOpacity,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 4,
      }}
    >
      {renderContent()}
      <div className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-cyan-500/20 rounded text-[7px] text-cyan-400 font-bold">
        W
      </div>
    </div>
  )
}
