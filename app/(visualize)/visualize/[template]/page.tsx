'use client'
import { useState, useEffect, useMemo, useRef, Suspense, RefObject } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { TEMPLATE_REGISTRY } from '@/components/visualize/TemplateRegistry'
import { QualityProvider, useQuality } from '@/components/visualize/QualityContext'
import QualitySelector from '@/components/visualize/QualitySelector'
import ExportToolbar from '@/components/visualize/ExportToolbar'
import FilterEngine, { ActiveFilter, applyFiltersToData } from '@/components/FilterEngine'
import { enrichData } from '@/lib/enrichData'
import { QualityPreset } from '@/lib/qualityPresets'

// ── Template component registry ──────────────────────────────────────────────
const TEMPLATE_COMPONENTS: Record<string, any> = {
  'velocity-animation': dynamic(() => import('@/components/visualize/templates/VelocityAnimation')),
  'pitch-flight-3d': dynamic(() => import('@/components/visualize/templates/PitchFlight3D')),
  'strike-zone-heatmap': dynamic(() => import('@/components/visualize/templates/StrikeZoneHeatmapViz')),
  'pitch-characteristics': dynamic(() => import('@/components/visualize/templates/PitchCharacteristics')),
  'incoming-pitch-view': dynamic(() => import('@/components/visualize/templates/IncomingPitchView')),
  'arsenal-overlay': dynamic(() => import('@/components/visualize/templates/ArsenalOverlay')),
}

// ── TemplateProps interface ───────────────────────────────────────────────────
interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

// ── Inner page (reads quality from context) ──────────────────────────────────
function TemplateWorkspaceInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const templateSlug = params.template as string
  const playerId = searchParams.get('playerId')
  const playerName = searchParams.get('playerName') ?? 'Unknown Player'

  const { quality } = useQuality()

  const containerRef = useRef<HTMLDivElement>(null!)

  const [allData, setAllData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [frameInfo, setFrameInfo] = useState<{ frame: number; total: number } | null>(null)

  // Resolve template entry
  const entry = TEMPLATE_REGISTRY.find(t => t.slug === templateSlug)
  const TemplateComponent = templateSlug ? TEMPLATE_COMPONENTS[templateSlug] : null

  // Fetch pitch data
  useEffect(() => {
    if (!playerId) return

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/player-data?id=${playerId}&col=pitcher`)
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const json = await res.json()
        const rows: any[] = json.rows ?? json.data ?? json ?? []

        const enriched = enrichData(rows)

        const buildOpts = (col: string) =>
          [...new Set(enriched.map((r: any) => r[col]).filter(Boolean))].map(String).sort()

        setOptionsCache({
          game_year: buildOpts('game_year').sort().reverse(),
          pitch_name: buildOpts('pitch_name'),
          pitch_type: buildOpts('pitch_type'),
          stand: buildOpts('stand'),
          p_throws: buildOpts('p_throws'),
          balls: ['0', '1', '2', '3'],
          strikes: ['0', '1', '2'],
          outs_when_up: ['0', '1', '2'],
          inning: Array.from({ length: 18 }, (_, i) => String(i + 1)),
          inning_topbot: ['Top', 'Bot'],
          type: buildOpts('type'),
          events: buildOpts('events'),
          description: buildOpts('description'),
          bb_type: buildOpts('bb_type'),
          game_type: buildOpts('game_type'),
          home_team: buildOpts('home_team'),
          away_team: buildOpts('away_team'),
          zone: Array.from({ length: 14 }, (_, i) => String(i + 1)),
          if_fielding_alignment: buildOpts('if_fielding_alignment'),
          of_fielding_alignment: buildOpts('of_fielding_alignment'),
          vs_team: buildOpts('vs_team'),
          batter_name: buildOpts('batter_name'),
        })

        setAllData(enriched)
      } catch (err) {
        console.error('TemplateWorkspace: data load error', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [playerId])

  // Client-side filter application
  const filteredData = useMemo(() => {
    if (activeFilters.length === 0) return allData
    return applyFiltersToData(allData, activeFilters)
  }, [allData, activeFilters])

  // ── Render: template not found ──────────────────────────────────────────────
  if (!entry || !TemplateComponent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-600 flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-1">Template not found</h2>
        <p className="text-sm text-zinc-500 mb-4">
          <code className="text-zinc-400">{templateSlug}</code> does not match any registered template.
        </p>
        <a href="/visualize" className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:text-white hover:border-zinc-600 transition">
          Back to Visualize
        </a>
      </div>
    )
  }

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Loading pitch data for {playerName}...</p>
        </div>
      </div>
    )
  }

  // ── Render: workspace ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      {/* Top bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/visualize" className="text-zinc-500 hover:text-zinc-300 transition shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </a>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white truncate">{entry.name}</h1>
              <span className={`
                shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide
                ${entry.isAnimated
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                  : 'bg-zinc-700/60 text-zinc-400 border border-zinc-700'
                }
              `}>
                {entry.isAnimated ? 'Animated' : 'Static'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 truncate">{playerName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <QualitySelector />
          <ExportToolbar
            containerRef={containerRef}
            isCanvas={entry.isCanvas}
            isAnimated={entry.isAnimated}
            quality={quality}
          />
        </div>
      </div>

      {/* Filter Engine */}
      <FilterEngine
        activeFilters={activeFilters}
        onFiltersChange={setActiveFilters}
        optionsCache={optionsCache}
      />

      {/* Visualization area */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div ref={containerRef} className="relative">
          <TemplateComponent
            data={filteredData}
            playerName={playerName}
            quality={quality}
            containerRef={containerRef}
            onFrameUpdate={(frame: number, total: number) => setFrameInfo({ frame, total })}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-6 py-2 flex items-center gap-4">
        <span className="text-[11px] text-zinc-500">
          {filteredData.length.toLocaleString()} pitch{filteredData.length !== 1 ? 'es' : ''}
          {activeFilters.length > 0 ? ' (filtered)' : ''}
        </span>
        {frameInfo && (
          <span className="text-[11px] text-zinc-600">
            Frame {frameInfo.frame} / {frameInfo.total}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Page with providers and Suspense boundary ────────────────────────────────
function TemplateWorkspacePage() {
  return (
    <QualityProvider>
      <TemplateWorkspaceInner />
    </QualityProvider>
  )
}

export default function TemplatePageWithSuspense() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-zinc-700 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    }>
      <TemplateWorkspacePage />
    </Suspense>
  )
}
