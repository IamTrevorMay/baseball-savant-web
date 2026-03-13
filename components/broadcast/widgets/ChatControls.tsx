'use client'

import { useState, useRef, useEffect } from 'react'
import { useBroadcast } from '../BroadcastContext'
import type { ChatMessage } from '@/lib/widgetTypes'

export default function ChatControls() {
  const { widgetState, updateWidgetState, highlightChatMessage } = useBroadcast()
  const { chatMessages, twitchChannel, youtubeVideoId, chatConnected } = widgetState
  const [channelInput, setChannelInput] = useState(twitchChannel)
  const [ytInput, setYtInput] = useState(youtubeVideoId)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages.length])

  function handleConnect() {
    updateWidgetState({
      twitchChannel: channelInput.trim(),
      youtubeVideoId: ytInput.trim(),
      chatConnected: true,
    })
  }

  function handleDisconnect() {
    updateWidgetState({ chatConnected: false })
  }

  function getMessageColor(msg: ChatMessage): string {
    switch (msg.type) {
      case 'cheer': return '#88F4FF'
      case 'sub': case 'resub': case 'giftsub': return '#FF8200'
      case 'superchat': case 'membership': return '#00FF11'
      default: return msg.color
    }
  }

  // Show last ~20 messages
  const visibleMessages = chatMessages.slice(-20)

  return (
    <div className="space-y-2">
      {/* Connection inputs */}
      <div className="space-y-1">
        <div>
          <label className="text-[9px] text-zinc-600">Twitch Channel</label>
          <input
            value={channelInput}
            onChange={e => setChannelInput(e.target.value)}
            placeholder="channel_name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
          />
        </div>
        <div>
          <label className="text-[9px] text-zinc-600">YouTube Video ID</label>
          <input
            value={ytInput}
            onChange={e => setYtInput(e.target.value)}
            placeholder="dQw4w9WgXcQ"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
          />
        </div>
      </div>

      {/* Connect/Disconnect */}
      <div className="flex items-center gap-1.5">
        {!chatConnected ? (
          <button
            onClick={handleConnect}
            disabled={!channelInput.trim() && !ytInput.trim()}
            className="flex-1 px-2 py-1.5 text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 disabled:opacity-40 transition"
          >
            Connect
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="flex-1 px-2 py-1.5 text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition"
          >
            Disconnect
          </button>
        )}
        <div className={`w-2 h-2 rounded-full ${chatConnected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="max-h-48 overflow-y-auto space-y-0.5 bg-zinc-800/30 rounded p-1">
        {visibleMessages.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-zinc-600">No messages yet</div>
        ) : (
          visibleMessages.map(msg => (
            <div
              key={msg.id}
              className="flex items-start gap-1 px-1 py-0.5 rounded hover:bg-zinc-700/50 cursor-pointer transition"
              onClick={() => highlightChatMessage(msg)}
              title="Click to highlight as lower third"
            >
              <div
                className="w-0.5 h-3 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: getMessageColor(msg) }}
              />
              <span className="text-[10px] font-medium shrink-0" style={{ color: msg.color }}>
                {msg.displayName}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {msg.content.map((p, i) => p.type === 'text' ? p.text : '[emote]').join('')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
