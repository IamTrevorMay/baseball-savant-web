'use client'
import { useState, useEffect, useCallback } from 'react'
import ResearchNav from '@/components/ResearchNav'

interface Brief {
  id: string
  date: string
  title: string
  summary: string
  content?: string
  metadata?: { games_count?: number; finished_count?: number; is_off_day?: boolean }
  created_at?: string
}

export default function BriefsPage() {
  const [currentBrief, setCurrentBrief] = useState<Brief | null>(null)
  const [archive, setArchive] = useState<Brief[]>([])
  const [loading, setLoading] = useState(true)
  const [archiveLoading, setArchiveLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState<string | null>(null)

  // Fetch archive list
  useEffect(() => {
    fetch('/api/briefs')
      .then(r => r.json())
      .then(d => {
        setArchive(d.briefs || [])
        setArchiveLoading(false)
        // Load the most recent brief by default
        if (d.briefs?.length > 0 && !currentDate) {
          setCurrentDate(d.briefs[0].date)
        }
      })
      .catch(() => setArchiveLoading(false))
  }, [])

  // Fetch full brief when date changes
  const fetchBrief = useCallback((date: string) => {
    setLoading(true)
    fetch(`/api/briefs?date=${date}`)
      .then(r => r.json())
      .then(d => { setCurrentBrief(d.brief || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (currentDate) fetchBrief(currentDate)
  }, [currentDate, fetchBrief])

  // Date navigation
  const currentIndex = archive.findIndex(b => b.date === currentDate)
  const hasPrev = currentIndex < archive.length - 1
  const hasNext = currentIndex > 0

  const goToPrev = () => { if (hasPrev) setCurrentDate(archive[currentIndex + 1].date) }
  const goToNext = () => { if (hasNext) setCurrentDate(archive[currentIndex - 1].date) }

  // Export helpers
  const copyMarkdown = () => {
    if (!currentBrief?.content) return
    // Strip HTML to rough markdown
    const text = currentBrief.content
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    navigator.clipboard.writeText(`# ${currentBrief.title}\n\n${currentBrief.summary}\n\n${text}`)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/briefs" />

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Header with date navigation */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Daily Briefs</h1>
            <p className="text-sm text-zinc-500">
              {currentDate ? formatDate(currentDate) : 'MLB daily recaps'}
            </p>
          </div>
          {currentDate && (
            <div className="flex items-center gap-2">
              <button onClick={goToPrev} disabled={!hasPrev}
                className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous brief">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <input type="date" value={currentDate}
                onChange={e => { if (e.target.value) setCurrentDate(e.target.value) }}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-white focus:border-emerald-600 focus:outline-none [color-scheme:dark]" />
              <button onClick={goToNext} disabled={!hasNext}
                className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next brief">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* Export toolbar */}
        {currentBrief && (
          <div className="flex items-center gap-2 mb-4">
            <button onClick={copyMarkdown}
              className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Copy Markdown
            </button>
            <button onClick={() => window.print()}
              className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
          </div>
        )}

        {/* Current brief display */}
        {loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 animate-pulse">
            <div className="h-6 w-2/3 bg-zinc-800 rounded mb-4" />
            <div className="h-4 w-full bg-zinc-800 rounded mb-3" />
            <div className="h-4 w-5/6 bg-zinc-800 rounded mb-6" />
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-3 bg-zinc-800 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
              ))}
            </div>
          </div>
        ) : currentBrief ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-8 py-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-white mb-2">{currentBrief.title}</h2>
              <p className="text-sm text-zinc-400">{currentBrief.summary}</p>
              {currentBrief.metadata && (
                <div className="flex items-center gap-3 mt-3">
                  {currentBrief.metadata.games_count !== undefined && (
                    <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                      {currentBrief.metadata.finished_count || 0} games
                    </span>
                  )}
                  {currentBrief.metadata.is_off_day && (
                    <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                      Off Day
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="px-8 py-6 brief-content"
              dangerouslySetInnerHTML={{ __html: currentBrief.content || '' }} />
          </div>
        ) : currentDate ? (
          <div className="text-center py-16">
            <p className="text-zinc-500 text-sm">No brief available for this date.</p>
          </div>
        ) : null}

        {/* Archive list */}
        <div className="mt-10">
          <h3 className="text-lg font-bold text-white mb-4">Archive</h3>
          {archiveLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                  <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
                  <div className="h-4 w-3/4 bg-zinc-800 rounded mb-2" />
                  <div className="h-3 w-full bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : archive.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">No briefs yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {archive.map(brief => (
                <button key={brief.id} onClick={() => setCurrentDate(brief.date)}
                  className={`text-left bg-zinc-900 border rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition ${
                    brief.date === currentDate ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-zinc-800'
                  }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      {new Date(brief.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    {brief.metadata?.is_off_day && (
                      <span className="text-[9px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Off Day</span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1 line-clamp-1">{brief.title}</h4>
                  <p className="text-xs text-zinc-500 line-clamp-2">{brief.summary}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
