'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene, StarterCardData } from '@/lib/sceneTypes'
import { populateReportCard } from '@/lib/reportCardPopulate'
import { exportScenePNG } from '@/components/visualize/scene-composer/exportScene'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import PlayerPicker from '@/components/visualize/PlayerPicker'

interface TemplateInfo {
  id: string
  name: string
  description: string
  width: number
  height: number
}

interface GameOption {
  game_pk: number
  game_date: string
  opponent: string
  pitches: number
  ip: string
}

export default function ReportCardGenerator() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const [populatedScene, setPopulatedScene] = useState<Scene | null>(null)

  // Inputs
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [season, setSeason] = useState('2026')
  const [games, setGames] = useState<GameOption[]>([])
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [title, setTitle] = useState('')

  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [zoom, setZoom] = useState(0.45)

  // Load templates
  useEffect(() => {
    fetch('/api/report-card-templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
  }, [])

  // Load template scene when selected
  useEffect(() => {
    if (!selectedTemplateId) { setScene(null); setPopulatedScene(null); return }
    fetch(`/api/report-card-templates/${selectedTemplateId}`)
      .then(r => r.json())
      .then(d => {
        const t = d.template
        setScene({
          id: t.id,
          name: t.name,
          width: t.width,
          height: t.height,
          background: t.background,
          elements: t.elements || [],
        })
        setPopulatedScene(null)
      })
      .catch(() => {})
  }, [selectedTemplateId])

  // Load games when player + season changes
  useEffect(() => {
    if (!playerId) { setGames([]); return }
    fetch(`/api/starter-card?pitcherId=${playerId}&games=true&season=${season}`)
      .then(r => r.json())
      .then(d => {
        setGames(d.games || [])
        setSelectedGamePk(null)
      })
      .catch(() => setGames([]))
  }, [playerId, season])

  const handleGenerate = useCallback(async () => {
    if (!scene || !playerId || !selectedGamePk) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/starter-card?pitcherId=${playerId}&gamePk=${selectedGamePk}`)
      const json = await res.json()
      const data: StarterCardData = json.data || json
      const populated = populateReportCard(scene, data, title || undefined)
      setPopulatedScene(populated)
    } catch (err) {
      console.error('Generate failed:', err)
    } finally {
      setGenerating(false)
    }
  }, [scene, playerId, selectedGamePk, title])

  const handleExportPNG = useCallback(async () => {
    if (!populatedScene) return
    setExporting(true)
    try {
      await exportScenePNG(populatedScene, `${populatedScene.name || 'report-card'}.png`)
    } finally {
      setExporting(false)
    }
  }, [populatedScene])

  const handleExportPDF = useCallback(async () => {
    if (!populatedScene) return
    setExporting(true)
    try {
      const { exportReportCardPDF } = await import('@/lib/exportReportCardPDF')
      await exportReportCardPDF(populatedScene, `${populatedScene.name || 'report-card'}.pdf`)
    } finally {
      setExporting(false)
    }
  }, [populatedScene])

  const handlePushToBroadcast = useCallback(() => {
    if (!populatedScene) return
    try {
      localStorage.setItem('triton-push-to-broadcast', JSON.stringify(populatedScene))
      alert('Pushed to broadcast! Open Scene Composer to load.')
    } catch {}
  }, [populatedScene])

  const displayScene = populatedScene || scene
  const noop = useCallback(() => {}, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Inputs */}
      <div className="w-72 shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
        {/* Template Picker */}
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Template</h3>
          {templates.length === 0 ? (
            <p className="text-xs text-zinc-600">No templates yet. Build one first.</p>
          ) : (
            <div className="space-y-1">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`
                    w-full text-left p-2 rounded-lg text-xs transition
                    ${selectedTemplateId === t.id
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                      : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
                    }
                  `}
                >
                  <span className="font-medium text-zinc-200 block">{t.name}</span>
                  {t.description && <span className="text-[10px] text-zinc-600">{t.description}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Player Picker */}
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Player</h3>
          <PlayerPicker
            label="Search pitcher..."
            playerType="pitcher"
            onSelect={(id, name) => { setPlayerId(id); setPlayerName(name) }}
          />
          {playerName && (
            <p className="text-xs text-cyan-400 mt-1">{playerName}</p>
          )}
        </div>

        {/* Season */}
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Season</h3>
          <select
            value={season}
            onChange={e => setSeason(e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
          >
            {Array.from({ length: 12 }, (_, i) => 2026 - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>

        {/* Game Picker */}
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Game</h3>
          {!playerId ? (
            <p className="text-[10px] text-zinc-600">Select a player first</p>
          ) : games.length === 0 ? (
            <p className="text-[10px] text-zinc-600">No games found for {season}</p>
          ) : (
            <select
              value={selectedGamePk || ''}
              onChange={e => setSelectedGamePk(Number(e.target.value) || null)}
              className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Select game...</option>
              {games.map(g => (
                <option key={g.game_pk} value={g.game_pk}>
                  {g.game_date} vs {g.opponent} ({g.pitches}P, {g.ip}IP)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Title */}
        <div className="p-3 border-b border-zinc-800">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Title</h3>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Optional title override"
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Actions */}
        <div className="p-3 space-y-2">
          <button
            onClick={handleGenerate}
            disabled={!scene || !playerId || !selectedGamePk || generating}
            className="
              w-full py-2 rounded-lg text-xs font-semibold transition
              bg-cyan-600 text-white hover:bg-cyan-500
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {generating ? 'Generating...' : 'Generate Report Card'}
          </button>

          {populatedScene && (
            <>
              <button
                onClick={handleExportPNG}
                disabled={exporting}
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-cyan-500/50 transition disabled:opacity-40"
              >
                Export PNG
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-cyan-500/50 transition disabled:opacity-40"
              >
                Export PDF
              </button>
              <button
                onClick={handlePushToBroadcast}
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 transition"
              >
                Push to Broadcast
              </button>
            </>
          )}
        </div>
      </div>

      {/* Center: Preview */}
      <div className="flex-1 relative overflow-hidden bg-zinc-950">
        {!displayScene ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-600">Select a template to preview</p>
          </div>
        ) : (
          <>
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
              <button onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} className="text-zinc-400 hover:text-white text-xs px-1">-</button>
              <span className="text-[10px] text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="text-zinc-400 hover:text-white text-xs px-1">+</button>
            </div>

            <SceneCanvas
              scene={displayScene}
              selectedId={null}
              zoom={zoom}
              onSelect={noop}
              onSelectMany={noop}
              onUpdateElement={noop}
              canvasRef={canvasRef}
              showGrid={false}
            />
          </>
        )}
      </div>
    </div>
  )
}
