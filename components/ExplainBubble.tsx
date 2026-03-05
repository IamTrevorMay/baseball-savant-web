'use client'
import { useState, useEffect, useRef } from 'react'

interface Props {
  playerName: string
  metricLabel: string
  value: string
  prompt: string
  onClose: () => void
}

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

function renderMarkdown(text: string) {
  const blocks: any[] = []
  let blockIdx = 0
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push(<h3 key={blockIdx++} className="text-sm font-bold text-white mt-3 mb-1">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={blockIdx++} className="text-sm font-bold text-white mt-3 mb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('**') && line.endsWith('**')) {
      blocks.push(<div key={blockIdx++} className="font-semibold text-white mt-2 mb-1">{line.slice(2, -2)}</div>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push(<div key={blockIdx++} className="ml-3 flex gap-1.5"><span className="text-emerald-500">•</span><span>{formatInline(line.slice(2))}</span></div>)
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)![1]
      blocks.push(<div key={blockIdx++} className="ml-3 flex gap-1.5"><span className="text-emerald-500 font-mono text-[11px]">{num}.</span><span>{formatInline(line.replace(/^\d+\.\s/, ''))}</span></div>)
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]); i++
      }
      blocks.push(
        <pre key={blockIdx++} className="bg-zinc-950 border border-zinc-800 rounded p-2 my-1 overflow-x-auto text-[11px] font-mono text-zinc-300">
          {codeLines.join('\n')}
        </pre>
      )
    } else if (line.trim() === '') {
      blocks.push(<div key={blockIdx++} className="h-1.5" />)
    } else {
      blocks.push(<p key={blockIdx++} className="leading-relaxed">{formatInline(line)}</p>)
    }
  }

  return blocks
}

export default function ExplainBubble({ playerName, metricLabel, value, prompt, onClose }: Props) {
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchExplanation() {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        if (cancelled) return
        const data = await res.json()
        if (cancelled) return
        if (data.error) {
          setError(data.error)
        } else {
          setResponse(data.response || '')
        }
      } catch {
        if (!cancelled) setError('Failed to get explanation')
      }
      if (!cancelled) setLoading(false)
    }
    fetchExplanation()
    return () => { cancelled = true }
  }, [prompt])

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div ref={ref}
      className="fixed bottom-4 right-4 z-50 w-[420px] max-h-[340px] flex flex-col bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] text-zinc-500 truncate">{playerName}</div>
          <div className="text-[13px] font-semibold text-white truncate">{metricLabel}: <span className="text-emerald-400">{value}</span></div>
        </div>
        <button onClick={onClose} className="ml-3 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-3 text-[12px] text-zinc-300 leading-relaxed">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 py-4">
            <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
            <span>Analyzing...</span>
          </div>
        ) : error ? (
          <div className="text-red-400 text-[12px]">{error}</div>
        ) : (
          renderMarkdown(response)
        )}
      </div>
    </div>
  )
}
