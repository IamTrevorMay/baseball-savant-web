'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import ResearchNav from '@/components/ResearchNav'
import { useAuth } from '@/components/AuthProvider'

interface Message {
  role: 'user' | 'assistant'
  content: string
  exports?: CsvExport[]
}

interface CsvExport {
  id: string          // database row ID (used for download)
  filename: string
  description: string
  row_count: number
  created_at: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  created_at: Date
}

export default function DataExportPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [allExports, setAllExports] = useState<CsvExport[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [status, setStatus] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Track the activeId at send time to avoid stale closure issues
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  // Load saved exports on mount
  useEffect(() => {
    async function loadExports() {
      try {
        const res = await fetch('/api/data-export')
        const data = await res.json()
        if (data.exports) setAllExports(data.exports)
      } catch {}
    }
    if (user) loadExports()
  }, [user])

  function startNewChat() {
    const id = Date.now().toString()
    const conv: Conversation = { id, title: 'New Export', messages: [], created_at: new Date() }
    setConversations(prev => [conv, ...prev])
    setActiveId(id)
    activeIdRef.current = id
    setMessages([])
    inputRef.current?.focus()
  }

  function selectConversation(id: string) {
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      setActiveId(id)
      activeIdRef.current = id
      setMessages(conv.messages)
    }
  }

  function deleteConversation(id: string) {
    // Remove any exports from this conversation
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      const convExportIds = new Set(conv.messages.flatMap(m => m.exports?.map(e => e.id) || []))
      setAllExports(prev => prev.filter(e => !convExportIds.has(e.id)))
    }
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeId === id) {
      setActiveId(null)
      activeIdRef.current = null
      setMessages([])
    }
  }

  function downloadCsv(exp: CsvExport) {
    const a = document.createElement('a')
    a.href = `/api/data-export?id=${exp.id}`
    a.download = `${exp.filename}.csv`
    a.click()
  }

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return

    // Auto-create conversation if none active
    let convId = activeIdRef.current
    if (!convId) {
      const id = Date.now().toString()
      const conv: Conversation = { id, title: msg.slice(0, 50), messages: [], created_at: new Date() }
      setConversations(prev => [conv, ...prev])
      setActiveId(id)
      activeIdRef.current = id
      convId = id
    }

    const userMsg: Message = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setStreamingText('')
    setStatus('')

    try {
      const res = await fetch('/api/data-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        const errMsg: Message = { role: 'assistant', content: `Error: ${err.error || res.statusText}` }
        const updated = [...newMessages, errMsg]
        setMessages(updated)
        syncConversation(convId, updated, msg)
        setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder()

      let accumulated = ''
      let pendingExports: CsvExport[] = []
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // Each event is a single JSON line terminated by \n
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.type === 'text') {
              accumulated += data.text
              setStreamingText(accumulated)
            } else if (data.type === 'status') {
              setStatus(data.status)
            } else if (data.type === 'export') {
              const exp: CsvExport = {
                id: data.exportId,
                filename: data.filename,
                description: data.description,
                row_count: data.row_count,
                created_at: new Date().toISOString(),
              }
              pendingExports.push(exp)
              setAllExports(prev => [...prev, exp])
            } else if (data.type === 'error') {
              accumulated += `\n\nError: ${data.error}`
              setStreamingText(accumulated)
            }
          } catch {
            // Incomplete JSON line — will be completed in next chunk via buffer
          }
        }
      }

      // Finalize message
      const assistantMsg: Message = {
        role: 'assistant',
        content: accumulated,
        exports: pendingExports.length > 0 ? pendingExports : undefined,
      }
      const updatedMessages = [...newMessages, assistantMsg]
      setMessages(updatedMessages)
      setStreamingText('')
      setStatus('')
      syncConversation(convId, updatedMessages, msg)
    } catch (e: any) {
      const errMsg: Message = { role: 'assistant', content: `Error: ${e.message}` }
      const updated = [...newMessages, errMsg]
      setMessages(updated)
      syncConversation(convId, updated, msg)
    }
    setLoading(false)
  }

  function syncConversation(convId: string, msgs: Message[], firstMsg?: string) {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c
      return {
        ...c,
        title: c.title === 'New Export' && firstMsg ? firstMsg.slice(0, 50) : c.title,
        messages: msgs,
      }
    }))
  }

  // Markdown rendering
  function formatInline(text: string) {
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

  function renderContent(text: string, msgExports?: CsvExport[]) {
    const blocks: any[] = []
    let currentTable: string[] = []
    let blockIdx = 0
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        currentTable.push(line); continue
      } else if (currentTable.length > 0) {
        blocks.push(renderTable(currentTable, blockIdx++)); currentTable = []
      }
      if (line.startsWith('### ')) blocks.push(<h3 key={blockIdx++} className="text-base font-bold text-white mt-4 mb-2">{line.slice(4)}</h3>)
      else if (line.startsWith('## ')) blocks.push(<h2 key={blockIdx++} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(3)}</h2>)
      else if (line.startsWith('# ')) blocks.push(<h1 key={blockIdx++} className="text-xl font-bold text-white mt-4 mb-3">{line.slice(2)}</h1>)
      else if (line.startsWith('**') && line.endsWith('**')) blocks.push(<div key={blockIdx++} className="font-semibold text-white mt-3 mb-1">{line.slice(2, -2)}</div>)
      else if (line.startsWith('- ') || line.startsWith('* ')) blocks.push(<div key={blockIdx++} className="ml-4 flex gap-2"><span className="text-emerald-500">-</span><span>{formatInline(line.slice(2))}</span></div>)
      else if (/^\d+\.\s/.test(line)) {
        const num = line.match(/^(\d+)\.\s/)![1]
        blocks.push(<div key={blockIdx++} className="ml-4 flex gap-2"><span className="text-emerald-500 font-mono text-sm">{num}.</span><span>{formatInline(line.replace(/^\d+\.\s/, ''))}</span></div>)
      }
      else if (line.startsWith('```')) {
        const codeLines: string[] = []; i++
        while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
        blocks.push(<pre key={blockIdx++} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 my-2 overflow-x-auto text-[12px] font-mono text-zinc-300">{codeLines.join('\n')}</pre>)
      }
      else if (line.trim() === '') blocks.push(<div key={blockIdx++} className="h-2" />)
      else blocks.push(<p key={blockIdx++} className="leading-relaxed">{formatInline(line)}</p>)
    }
    if (currentTable.length > 0) blocks.push(renderTable(currentTable, blockIdx++))

    // Inline download buttons for any exports attached to this message
    if (msgExports && msgExports.length > 0) {
      blocks.push(
        <div key={blockIdx++} className="mt-3 flex flex-col gap-2">
          {msgExports.map(exp => (
            <button
              key={exp.id}
              onClick={() => downloadCsv(exp)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-sm font-medium rounded-lg border border-emerald-600/30 transition w-fit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download {exp.filename}.csv
              <span className="text-emerald-500/60 text-xs">({exp.row_count.toLocaleString()} rows)</span>
            </button>
          ))}
        </div>
      )
    }

    return blocks
  }

  function renderTable(tableLines: string[], key: number) {
    const rows = tableLines.filter(l => !l.match(/^\|[\s-:|]+\|$/))
    if (rows.length === 0) return null
    const parseRow = (line: string) => line.split('|').slice(1, -1).map(c => c.trim())
    const headers = parseRow(rows[0])
    const dataRows = rows.slice(1).map(parseRow)
    return (
      <div key={key} className="my-3 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-[12px]">
          <thead><tr>{headers.map((h, i) => <th key={i} className="bg-zinc-800 px-3 py-2 text-left text-zinc-400 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{dataRows.map((row, i) => (
            <tr key={i} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition">
              {row.map((cell, j) => <td key={j} className={`px-3 py-1.5 whitespace-nowrap ${j === 0 ? 'text-white font-medium' : /^\d+\.?\d*%?$/.test(cell) ? 'text-emerald-400 font-mono' : 'text-zinc-300 font-mono'}`}>{cell}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    )
  }

  const showWelcome = messages.length === 0

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/data-export" />

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — Conversation history */}
        <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-zinc-800">
            <button
              onClick={startNewChat}
              className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Export
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {conversations.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-8 px-4">No conversations yet. Start a new export to begin.</p>
            )}
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition ${
                  activeId === conv.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
                onClick={() => selectConversation(conv.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{conv.title}</p>
                  {conv.messages.some(m => m.exports?.length) && (
                    <p className="text-[10px] text-emerald-500 mt-0.5">
                      {conv.messages.reduce((n, m) => n + (m.exports?.length || 0), 0)} export{conv.messages.reduce((n, m) => n + (m.exports?.length || 0), 0) !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center — Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {showWelcome && (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-4">
                    <svg className="w-12 h-12 mx-auto text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">Data Export</h1>
                  <p className="text-zinc-500 mb-8 max-w-md mx-auto">
                    Describe the dataset you need and I&apos;ll build a custom CSV for you. We&apos;ll iterate until it&apos;s exactly right, then just say &quot;Export&quot;.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">
                    {[
                      "All fastball averages by pitcher for 2024 — velo, spin, movement",
                      "Every strikeout pitch from the 2024 postseason with batter info",
                      "Pitch-level data for Spencer Strider's slider in 2023",
                      "Leaderboard of highest average exit velocity against by pitcher, 2024",
                    ].map((s, i) => (
                      <button key={i} onClick={() => send(s)}
                        className="text-left px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-4 py-3 ${
                    m.role === 'user'
                      ? 'bg-emerald-700/30 border border-emerald-700/40 text-emerald-100'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 text-[13px]'
                  }`}>
                    {m.role === 'assistant' ? renderContent(m.content, m.exports) : <p>{m.content}</p>}
                  </div>
                </div>
              ))}

              {/* Streaming response */}
              {loading && streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-xl px-4 py-3 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[13px]">
                    {renderContent(streamingText)}
                  </div>
                </div>
              )}

              {/* Loading indicator */}
              {loading && !streamingText && (
                <div className="flex justify-start">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Status indicator during tool execution */}
              {loading && status && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-zinc-500 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-emerald-500/40 border-t-emerald-500 rounded-full animate-spin" />
                    {status}
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 bg-zinc-900/50 px-4 py-4 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-3 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder='Describe the data you need, or say "Export" to build...'
                  rows={1}
                  className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none resize-none"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl text-sm font-medium transition shrink-0"
                >
                  Send
                </button>
              </div>
              <p className="text-[11px] text-zinc-600 mt-2 text-center">Describe your data needs, iterate, then say &quot;Export&quot; to generate CSV</p>
            </div>
          </div>
        </div>

        {/* Right sidebar — Export history */}
        <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex-col shrink-0 hidden md:flex">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-300">Exports</h2>
            <p className="text-[11px] text-zinc-600 mt-0.5">Generated CSV files</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {allExports.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-8 px-4">
                No exports yet. Chat to define your data, then say &quot;Export&quot; to generate.
              </p>
            )}
            {[...allExports].reverse().map(exp => (
              <div key={exp.id} className="mx-2 mb-2 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{exp.filename}.csv</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{exp.row_count.toLocaleString()} rows</p>
                    {exp.description && (
                      <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2">{exp.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => downloadCsv(exp)}
                  className="w-full px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium rounded-md border border-emerald-600/30 transition flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
