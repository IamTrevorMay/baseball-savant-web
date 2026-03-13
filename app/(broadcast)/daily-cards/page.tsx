'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene } from '@/lib/sceneTypes'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import { exportScenePNG } from '@/components/visualize/scene-composer/exportScene'

interface DailyCard {
  id: string
  date: string
  pitcher_id: number
  pitcher_name: string
  game_pk: number
  game_info: string
  ip: number
  pitch_count: number
  scene: Scene
  rank: number
}

interface ArchiveEntry {
  date: string
  pitchers: { pitcher_name: string; game_info: string; ip: number; pitch_count: number; rank: number }[]
}

export default function DailyCardsPage() {
  const [cards, setCards] = useState<DailyCard[]>([])
  const [archive, setArchive] = useState<ArchiveEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [archiveLoading, setArchiveLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState<DailyCard | null>(null)
  const [exporting, setExporting] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const noop = useCallback(() => {}, [])

  // Fetch archive list
  useEffect(() => {
    fetch('/api/daily-cards')
      .then(r => r.json())
      .then(d => {
        setArchive(d.archive || [])
        setArchiveLoading(false)
        if (d.archive?.length > 0 && !currentDate) {
          setCurrentDate(d.archive[0].date)
        }
      })
      .catch(() => setArchiveLoading(false))
  }, [])

  // Fetch cards when date changes
  const fetchCards = useCallback((date: string) => {
    setLoading(true)
    setSelectedCard(null)
    fetch(`/api/daily-cards?date=${date}`)
      .then(r => r.json())
      .then(d => { setCards(d.cards || []); setLoading(false) })
      .catch(() => { setCards([]); setLoading(false) })
  }, [])

  useEffect(() => {
    if (currentDate) fetchCards(currentDate)
  }, [currentDate, fetchCards])

  // Date navigation
  const archiveDates = archive.map(a => a.date)
  const currentIndex = archiveDates.indexOf(currentDate || '')
  const hasPrev = currentIndex < archiveDates.length - 1
  const hasNext = currentIndex > 0

  const goToPrev = () => { if (hasPrev) setCurrentDate(archiveDates[currentIndex + 1]) }
  const goToNext = () => { if (hasNext) setCurrentDate(archiveDates[currentIndex - 1]) }

  const handleExportPNG = useCallback(async (card: DailyCard) => {
    setExporting(true)
    try {
      const filename = `${card.pitcher_name.replace(/\s+/g, '-')}-${card.date}.png`
      await exportScenePNG(card.scene, filename)
    } finally {
      setExporting(false)
    }
  }, [])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  const formatIp = (ip: number) => {
    const full = Math.floor(ip)
    const partial = Math.round((ip - full) * 3)
    return `${full}.${partial}`
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Header with date navigation */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Daily Cards</h1>
          <p className="text-sm text-zinc-500">
            {currentDate ? formatDate(currentDate) : 'Auto-generated starter report cards'}
          </p>
        </div>
        {currentDate && (
          <div className="flex items-center gap-2">
            <button onClick={goToPrev} disabled={!hasPrev}
              className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous day">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <input type="date" value={currentDate}
              onChange={e => { if (e.target.value) setCurrentDate(e.target.value) }}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none [color-scheme:dark]" />
            <button onClick={goToNext} disabled={!hasNext}
              className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next day">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Detail view — selected card */}
      {selectedCard && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setSelectedCard(null)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to grid
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">
                #{selectedCard.rank} — {selectedCard.pitcher_name} — {selectedCard.game_info}
              </span>
              <button
                onClick={() => handleExportPNG(selectedCard)}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition disabled:opacity-40 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {exporting ? 'Exporting...' : 'Download PNG'}
              </button>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex justify-center p-4">
            <div style={{ width: selectedCard.scene.width * 0.55, height: selectedCard.scene.height * 0.55 }}>
              <SceneCanvas
                scene={selectedCard.scene}
                selectedId={null}
                zoom={0.55}
                onSelect={noop}
                onSelectMany={noop}
                onUpdateElement={noop}
                canvasRef={canvasRef}
                showGrid={false}
                showGuides={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Grid view */}
      {!selectedCard && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                  <div className="aspect-[16/9] bg-zinc-800 rounded mb-3" />
                  <div className="h-4 w-2/3 bg-zinc-800 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : cards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map(card => (
                <button
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="text-left bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-600 transition group"
                >
                  {/* Thumbnail */}
                  <div className="relative overflow-hidden bg-zinc-950" style={{ height: 200 }}>
                    <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'scale(0.25)', transformOrigin: 'center center' }}>
                      <div style={{ width: card.scene.width, height: card.scene.height, pointerEvents: 'none' }}>
                        <SceneCanvas
                          scene={card.scene}
                          selectedId={null}
                          zoom={1}
                          onSelect={noop}
                          onSelectMany={noop}
                          onUpdateElement={noop}
                          canvasRef={{ current: null }}
                          showGrid={false}
                          showGuides={false}
                        />
                      </div>
                    </div>
                    {/* Rank badge */}
                    <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {card.rank}
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-white group-hover:text-red-400 transition">
                      {card.pitcher_name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {card.game_info} — {formatIp(card.ip)} IP, {card.pitch_count}P
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : currentDate ? (
            <div className="text-center py-16">
              <p className="text-zinc-500 text-sm">No cards available for this date.</p>
            </div>
          ) : null}
        </>
      )}

      {/* Archive */}
      <div className="mt-10">
        <h3 className="text-lg font-bold text-white mb-4">Archive</h3>
        {archiveLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
                <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
                <div className="h-4 w-3/4 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        ) : archive.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">No cards yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {archive.map(entry => (
              <button key={entry.date} onClick={() => { setCurrentDate(entry.date); setSelectedCard(null) }}
                className={`text-left bg-zinc-900 border rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition ${
                  entry.date === currentDate ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800'
                }`}>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-1">
                  {entry.pitchers.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-red-400 font-bold w-3">{p.rank}</span>
                      <span className="text-zinc-200">{p.pitcher_name}</span>
                      <span className="text-zinc-600">{p.game_info}</span>
                      <span className="text-zinc-500 ml-auto">{p.ip}IP</span>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
