'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      if (data.error) {
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${data.error}` }])
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.response }])
      }
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${e.message}` }])
    }
    setLoading(false)
  }

  function formatContent(text: string) {
    // Basic markdown-like formatting
    return text.split('\n').map((line, i) => {
      if (line.startsWith('|') && line.endsWith('|')) {
        return <div key={i} className="font-mono text-[11px] whitespace-pre">{line}</div>
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <div key={i} className="font-semibold text-white mt-2">{line.slice(2, -2)}</div>
      }
      if (line.startsWith('- ')) {
        return <div key={i} className="ml-3">• {line.slice(2)}</div>
      }
      if (line.trim() === '') return <div key={i} className="h-2" />
      return <div key={i}>{line}</div>
    })
  }

  return (
    <>
      {/* Toggle button */}
      <button onClick={() => setOpen(!open)}
        className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
          open ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-emerald-600 hover:bg-emerald-500'
        }`}>
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[420px] h-[600px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-white">BSA Analyst</h3>
              <p className="text-[11px] text-zinc-500">Ask anything about the data</p>
            </div>
            <button onClick={() => { setMessages([]); }}
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition">Clear</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-zinc-500 text-sm mb-4">Try asking:</p>
                <div className="space-y-2">
                  {[
                    "Who has the highest whiff rate on sliders in 2024?",
                    "Show me Trevor May's pitch arsenal breakdown",
                    "Compare Corbin Burnes and Gerrit Cole's fastballs",
                    "What pitchers throw the hardest changeups?",
                  ].map((q, i) => (
                    <button key={i} onClick={() => { setInput(q) }}
                      className="block w-full text-left px-3 py-2 bg-zinc-800 rounded-lg text-[12px] text-zinc-400 hover:text-white hover:bg-zinc-750 transition">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-emerald-700/40 text-emerald-100'
                    : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {m.role === 'assistant' ? formatContent(m.content) : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 px-3 py-2 rounded-lg">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                    <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                    <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-zinc-800 shrink-0">
            <div className="flex gap-2">
              <input type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask about the data..."
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
              <button onClick={send} disabled={loading || !input.trim()}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
