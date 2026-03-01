'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ResearchNav from '@/components/ResearchNav'
import ModelBuilder from '@/components/model-builder/ModelBuilder'
import ConversationSidebar from '@/components/ConversationSidebar'
import { useAuth } from '@/components/AuthProvider'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ConversationSummary {
  id: string
  title: string
  updated_at: string
}

const SUGGESTIONS = [
  "Who has the highest whiff rate on sliders in 2024?",
  "Show me Trevor May's complete pitch arsenal breakdown",
  "Compare Corbin Burnes and Gerrit Cole's fastballs",
  "What pitchers throw the hardest changeups?",
  "Which relievers have the best stuff metrics in 2025?",
  "Build me a scouting report on Paul Skenes",
  "What's the average spin rate by pitch type league-wide in 2024?",
  "Show me the top 10 pitchers by K% in 2025",
]

export default function AnalystPage() {
  const { user } = useAuth()
  const [mode, setMode] = useState<'chat' | 'model-builder'>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  // Conversation state
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(false)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Load conversation list on mount
  const fetchConversations = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      if (data.conversations) setConversations(data.conversations)
    } catch {}
  }, [user])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Load a specific conversation
  async function loadConversation(id: string) {
    setLoadingConversations(true)
    try {
      const res = await fetch(`/api/conversations/${id}`)
      const data = await res.json()
      if (data.messages) {
        setMessages(data.messages)
        setActiveConversationId(id)
      }
    } catch {}
    setLoadingConversations(false)
  }

  // Start a new chat
  function handleNewChat() {
    setMessages([])
    setActiveConversationId(null)
    inputRef.current?.focus()
  }

  // Delete a conversation
  async function handleDelete(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConversationId === id) {
      setMessages([])
      setActiveConversationId(null)
    }
  }

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    const userMsg: Message = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Create conversation if needed
    let convId = activeConversationId
    if (!convId && user) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = await res.json()
        if (data.conversation) {
          convId = data.conversation.id
          setActiveConversationId(convId)
        }
      } catch {}
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      const assistantMsg: Message = data.error
        ? { role: 'assistant', content: `Error: ${data.error}` }
        : { role: 'assistant', content: data.response }

      setMessages([...newMessages, assistantMsg])

      // Save messages to conversation
      if (convId && user) {
        try {
          const saveRes = await fetch(`/api/conversations/${convId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [userMsg, assistantMsg] }),
          })
          const saveData = await saveRes.json()
          // If auto-titled, update sidebar
          if (saveData.title) {
            setConversations((prev) =>
              prev.map((c) => (c.id === convId ? { ...c, title: saveData.title } : c))
            )
          }
        } catch {}
        fetchConversations()
      }
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${e.message}` }])
    }
    setLoading(false)
  }

  function renderContent(text: string) {
    const blocks: any[] = []
    let currentTable: string[] = []
    let blockIdx = 0

    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Table detection
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        currentTable.push(line)
        continue
      } else if (currentTable.length > 0) {
        blocks.push(renderTable(currentTable, blockIdx++))
        currentTable = []
      }

      // Headers
      if (line.startsWith('### ')) {
        blocks.push(<h3 key={blockIdx++} className="text-base font-bold text-white mt-4 mb-2">{line.slice(4)}</h3>)
      } else if (line.startsWith('## ')) {
        blocks.push(<h2 key={blockIdx++} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(3)}</h2>)
      } else if (line.startsWith('# ')) {
        blocks.push(<h1 key={blockIdx++} className="text-xl font-bold text-white mt-4 mb-3">{line.slice(2)}</h1>)
      }
      // Bold lines
      else if (line.startsWith('**') && line.endsWith('**')) {
        blocks.push(<div key={blockIdx++} className="font-semibold text-white mt-3 mb-1">{line.slice(2, -2)}</div>)
      }
      // Bullet points
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push(<div key={blockIdx++} className="ml-4 flex gap-2"><span className="text-emerald-500">•</span><span>{formatInline(line.slice(2))}</span></div>)
      }
      // Numbered list
      else if (/^\d+\.\s/.test(line)) {
        const num = line.match(/^(\d+)\.\s/)![1]
        blocks.push(<div key={blockIdx++} className="ml-4 flex gap-2"><span className="text-emerald-500 font-mono text-sm">{num}.</span><span>{formatInline(line.replace(/^\d+\.\s/, ''))}</span></div>)
      }
      // Code block
      else if (line.startsWith('```')) {
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]); i++
        }
        blocks.push(
          <pre key={blockIdx++} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 my-2 overflow-x-auto text-[12px] font-mono text-zinc-300">
            {codeLines.join('\n')}
          </pre>
        )
      }
      // Empty line
      else if (line.trim() === '') {
        blocks.push(<div key={blockIdx++} className="h-2" />)
      }
      // Normal text
      else {
        blocks.push(<p key={blockIdx++} className="leading-relaxed">{formatInline(line)}</p>)
      }
    }

    if (currentTable.length > 0) {
      blocks.push(renderTable(currentTable, blockIdx++))
    }

    return blocks
  }

  function formatInline(text: string) {
    // Handle **bold** and `code` inline
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="bg-zinc-800 px-1.5 py-0.5 rounded text-emerald-400 text-[12px] font-mono">{part.slice(1, -1)}</code>
      }
      return part
    })
  }

  function renderTable(tableLines: string[], key: number) {
    // Parse markdown table
    const rows = tableLines.filter(l => !l.match(/^\|[\s-:|]+\|$/)) // Remove separator rows
    if (rows.length === 0) return null

    const parseRow = (line: string) => line.split('|').slice(1, -1).map(c => c.trim())
    const headers = parseRow(rows[0])
    const dataRows = rows.slice(1).map(parseRow)

    return (
      <div key={key} className="my-3 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="bg-zinc-800 px-3 py-2 text-left text-zinc-400 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, i) => (
              <tr key={i} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition">
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-1.5 whitespace-nowrap ${
                    j === 0 ? 'text-white font-medium' :
                    /^\d+\.?\d*%?$/.test(cell) ? 'text-emerald-400 font-mono' :
                    'text-zinc-300 font-mono'
                  }`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const showSuggestions = messages.length === 0 && !activeConversationId

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Nav */}
      <ResearchNav active="/analyst" />

      {/* Mode Toggle */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-2">
        <div className="max-w-5xl mx-auto flex items-center gap-1">
          <button onClick={() => setMode('chat')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              mode === 'chat' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}>
            Chat
          </button>
          <button onClick={() => setMode('model-builder')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              mode === 'model-builder' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}>
            Model Builder
          </button>
          {mode === 'chat' && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
              title="Toggle conversation history"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {mode === 'model-builder' ? (
        <ModelBuilder />
      ) : (
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={loadConversation}
          onNew={handleNewChat}
          onDelete={handleDelete}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {showSuggestions && (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-4">⚾</div>
                  <h1 className="text-2xl font-bold text-white mb-2">Triton Analyst</h1>
                  <p className="text-zinc-500 mb-8 max-w-md mx-auto">
                    Ask anything about the Statcast database. I can query 7.4M+ pitches, build reports, compare players, and find trends.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">
                    {SUGGESTIONS.map((s, i) => (
                      <button key={i} onClick={() => send(s)}
                        className="text-left px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loadingConversations && (
                <div className="py-16 text-center text-zinc-500">Loading conversation...</div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-4 py-3 ${
                    m.role === 'user'
                      ? 'bg-emerald-700/30 border border-emerald-700/40 text-emerald-100'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 text-[13px]'
                  }`}>
                    {m.role === 'assistant' ? renderContent(m.content) : <p>{m.content}</p>}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                      </div>
                      <span>Analyzing...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 bg-zinc-900/50 px-4 py-4 shrink-0">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end">
                <textarea ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Ask about the data..."
                  rows={1}
                  className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none resize-none"
                  style={{ minHeight: '48px', maxHeight: '120px' }} />
                <button onClick={() => send()} disabled={loading || !input.trim()}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl text-sm font-medium transition shrink-0">
                  Send
                </button>
              </div>
              <p className="text-[11px] text-zinc-600 mt-2 text-center">Powered by Claude · Queries 7.4M+ Statcast pitches</p>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
