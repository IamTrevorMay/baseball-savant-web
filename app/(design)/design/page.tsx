'use client'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import TridentLogo from '@/components/TridentLogo'
import {
  ExploreLineChart, ExploreBarChart, ExploreScatterPlot, ExploreHeatmap,
  ExploreDataTable, InsightCard,
} from '@/components/design/ExploreCharts'

// ── Types ──────────────────────────────────────────────────────────────────
interface VizConfig {
  type: 'line' | 'bar' | 'scatter' | 'heatmap' | 'table'
  title: string
  description?: string
  x: string
  y: string
  groupBy?: string
}

interface Insight {
  title: string
  value: string
  description: string
  sentiment: 'positive' | 'negative' | 'neutral'
}

interface ConversationEntry {
  id: string
  question: string
  queryPlan: string | null
  sql: string | null
  vizConfig: VizConfig[]
  clarification: string | null
  status: 'pending' | 'confirmed' | 'loaded' | 'error'
  rows: any[] | null
  insights: Insight[] | null
  narrative: string | null
  storyAngles: string[] | null
  error: string | null
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function DesignPage() {
  const [entries, setEntries] = useState<ConversationEntry[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeEntry, setActiveEntry] = useState<string | null>(null)
  const vizRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const updateEntry = useCallback((id: string, patch: Partial<ConversationEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  // Submit a question
  const handleSubmit = useCallback(async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)

    const id = Date.now().toString()
    const entry: ConversationEntry = {
      id, question: q, queryPlan: null, sql: null, vizConfig: [],
      clarification: null, status: 'pending', rows: null,
      insights: null, narrative: null, storyAngles: null, error: null,
    }
    setEntries(prev => [...prev, entry])

    try {
      const res = await fetch('/api/explore/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: [], confirmed: false }),
      })
      const data = await res.json()
      if (data.error) {
        updateEntry(id, { status: 'error', error: data.error })
      } else {
        updateEntry(id, {
          queryPlan: data.query_plan,
          sql: data.sql,
          vizConfig: data.viz_config || [],
          clarification: data.clarification,
          status: data.sql ? 'pending' : 'error',
          error: !data.sql ? (data.clarification || 'No query generated') : null,
        })
      }
    } catch (err: any) {
      updateEntry(id, { status: 'error', error: err.message })
    } finally {
      setLoading(false)
    }
  }, [input, loading, updateEntry])

  // Confirm and execute
  const handleConfirm = useCallback(async (id: string) => {
    const entry = entries.find(e => e.id === id)
    if (!entry?.sql) return
    updateEntry(id, { status: 'confirmed' })

    try {
      const res = await fetch('/api/explore/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true, sql: entry.sql, viz_config: entry.vizConfig }),
      })
      const data = await res.json()
      if (data.error) {
        updateEntry(id, { status: 'error', error: `${data.error}${data.sql ? '\n\nSQL: ' + data.sql : ''}` })
        return
      }
      updateEntry(id, { status: 'loaded', rows: data.rows })
      setActiveEntry(id)

      // Fetch insights in background
      fetch('/api/explore/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data.rows, question: entry.question, viz_config: entry.vizConfig }),
      })
        .then(r => r.json())
        .then(ins => updateEntry(id, {
          insights: ins.insights || [],
          narrative: ins.narrative || null,
          storyAngles: ins.story_angles || [],
        }))
        .catch(() => {})

      // Scroll to viz
      setTimeout(() => vizRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err: any) {
      updateEntry(id, { status: 'error', error: err.message })
    }
  }, [entries, updateEntry])

  const active = entries.find(e => e.id === activeEntry)

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <TridentLogo className="w-5 h-6 text-rose-500" />
          <span className="font-[family-name:var(--font-bebas)] text-sm uppercase tracking-wider text-zinc-500">
            Triton Apex / <span className="text-rose-400">Design</span>
          </span>
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-53px)]">
        {/* Left panel — conversation */}
        <div className="w-full lg:w-[420px] border-r border-zinc-800 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {entries.length === 0 && (
              <div className="text-center py-20">
                <div className="text-zinc-600 text-sm">Ask a question about the data</div>
                <div className="text-zinc-700 text-xs mt-2">e.g. &quot;Show me average fastball velocity by team in 2024&quot;</div>
              </div>
            )}
            {entries.map(entry => (
              <div key={entry.id} className="space-y-2">
                {/* User question */}
                <div className="flex justify-end">
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 max-w-[85%]">
                    <p className="text-sm text-zinc-200">{entry.question}</p>
                  </div>
                </div>

                {/* Assistant response */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                  {entry.status === 'pending' && !entry.queryPlan && (
                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                      <div className="w-4 h-4 border-2 border-zinc-700 border-t-rose-500 rounded-full animate-spin" />
                      Thinking...
                    </div>
                  )}

                  {entry.clarification && (
                    <p className="text-sm text-amber-400">{entry.clarification}</p>
                  )}

                  {entry.queryPlan && (
                    <details className="group">
                      <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition">
                        Query Plan
                      </summary>
                      <p className="text-sm text-zinc-400 mt-1">{entry.queryPlan}</p>
                      {entry.sql && (
                        <pre className="mt-2 text-[11px] bg-zinc-950 rounded p-2 overflow-x-auto text-zinc-500 font-mono">
                          {entry.sql}
                        </pre>
                      )}
                    </details>
                  )}

                  {entry.error && (
                    <p className="text-sm text-red-400">{entry.error}</p>
                  )}

                  {/* Actions */}
                  {entry.status === 'pending' && entry.sql && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleConfirm(entry.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-rose-600 text-white hover:bg-rose-500 transition"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => updateEntry(entry.id, { status: 'error', error: 'Cancelled' })}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {entry.status === 'confirmed' && (
                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                      <div className="w-4 h-4 border-2 border-zinc-700 border-t-rose-500 rounded-full animate-spin" />
                      Running query...
                    </div>
                  )}

                  {entry.status === 'loaded' && (
                    <button
                      onClick={() => { setActiveEntry(entry.id); vizRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
                      className="text-xs text-rose-400 hover:text-rose-300 transition"
                    >
                      View Results ({entry.rows?.length ?? 0} rows) →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="Ask about the data..."
                rows={1}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-rose-500/40 transition"
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !input.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Ask
              </button>
            </div>
          </div>
        </div>

        {/* Right panel — visualization */}
        <div ref={vizRef} className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4" style={{ background: '#0a0a0a' }}>
          {!active && (
            <div className="flex items-center justify-center h-full text-zinc-700 text-sm">
              Results will appear here
            </div>
          )}

          {active && active.rows && (
            <>
              {/* Insight cards */}
              {active.insights && active.insights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {active.insights.map((ins, i) => (
                    <InsightCard key={i} {...ins} />
                  ))}
                </div>
              )}

              {/* Narrative */}
              {active.narrative && (
                <p className="text-sm text-zinc-400 px-1">{active.narrative}</p>
              )}

              {/* Story angles */}
              {active.storyAngles && active.storyAngles.length > 0 && (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-600 mb-2">Story Angles</div>
                  <ul className="space-y-1">
                    {active.storyAngles.map((a, i) => (
                      <li key={i} className="text-sm text-zinc-400 flex gap-2">
                        <span className="text-rose-500">•</span> {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Charts */}
              <div className="space-y-4">
                {active.vizConfig.map((viz, i) => {
                  const key = `${active.id}-${i}`
                  switch (viz.type) {
                    case 'line':
                      return <ExploreLineChart key={key} data={active.rows!} x={viz.x} y={viz.y} groupBy={viz.groupBy} title={viz.title} description={viz.description} />
                    case 'bar':
                      return <ExploreBarChart key={key} data={active.rows!} x={viz.x} y={viz.y} title={viz.title} description={viz.description} />
                    case 'scatter':
                      return <ExploreScatterPlot key={key} data={active.rows!} x={viz.x} y={viz.y} groupBy={viz.groupBy} title={viz.title} description={viz.description} />
                    case 'heatmap':
                      return <ExploreHeatmap key={key} data={active.rows!} x={viz.x} y={viz.y} value={viz.y} title={viz.title} description={viz.description} />
                    default:
                      return null
                  }
                })}

                {/* Always show data table */}
                <ExploreDataTable data={active.rows!} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
