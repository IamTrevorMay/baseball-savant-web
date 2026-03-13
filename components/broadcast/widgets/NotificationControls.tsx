'use client'

import { useBroadcast } from '../BroadcastContext'

export default function NotificationControls() {
  const { widgetState, updateWidgetState } = useBroadcast()
  const { notifications } = widgetState

  function clearNotifications() {
    updateWidgetState({ notifications: [] })
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'cheer': return '#88F4FF'
      case 'sub': case 'resub': case 'giftsub': return '#FF8200'
      case 'superchat': case 'membership': return '#00FF11'
      default: return '#FFFFFF'
    }
  }

  return (
    <div className="space-y-2">
      <div className="max-h-40 overflow-y-auto space-y-0.5 bg-zinc-800/30 rounded p-1">
        {notifications.length === 0 ? (
          <div className="text-center py-3 text-[10px] text-zinc-600">No notifications</div>
        ) : (
          notifications.slice(-20).reverse().map(n => (
            <div key={n.id} className="flex items-center gap-1.5 px-1 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getTypeColor(n.type) }} />
              <span className="text-[10px] text-zinc-300 font-medium">{n.displayName}</span>
              <span className="text-[9px] text-zinc-500 uppercase">{n.type}</span>
              {n.amount && <span className="text-[9px] text-cyan-400">{n.amount}</span>}
              {n.months && n.months > 1 && <span className="text-[9px] text-amber-400">{n.months}mo</span>}
            </div>
          ))
        )}
      </div>
      <button
        onClick={clearNotifications}
        disabled={notifications.length === 0}
        className="w-full px-2 py-1 text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-40 transition"
      >
        Clear
      </button>
    </div>
  )
}
