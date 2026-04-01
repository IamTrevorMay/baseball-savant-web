'use client'

import { useState, useRef, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  sceneSnapshot?: any
  createdAt: string
}

interface AutoChatPanelProps {
  messages: ChatMessage[]
  loading: boolean
  onSend: (message: string) => void
}

export default function AutoChatPanel({ messages, loading, onSend }: AutoChatPanelProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    onSend(trimmed)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <div className="text-zinc-600 text-xs mb-2">Auto Compose</div>
            <p className="text-zinc-500 text-[11px] leading-relaxed max-w-[280px] mx-auto">
              Describe the graphic you want to create. I&apos;ll query real Statcast data and build it on the canvas.
            </p>
            <div className="mt-4 space-y-1.5">
              {[
                'Top 5 velocity leaderboard for 2025',
                'Corbin Burnes pitch movement chart',
                'Yankees vs Dodgers matchup graphic',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus() }}
                  className="block w-full text-left px-3 py-1.5 bg-zinc-800/50 border border-zinc-800 rounded-lg text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-emerald-600/20 border border-emerald-600/30 text-emerald-100'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
            }`}>
              {msg.role === 'assistant' && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {[...new Set(msg.toolsUsed)].map((tool, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-[9px] text-zinc-500 font-mono">
                      {tool}
                    </span>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                <span className="text-[10px] text-zinc-500 ml-1">Building...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-zinc-800 p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a graphic..."
            rows={1}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-600/50 resize-none max-h-24 transition"
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="shrink-0 px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-[11px] font-medium text-emerald-300 hover:bg-emerald-600/30 transition disabled:opacity-30 disabled:cursor-default"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
