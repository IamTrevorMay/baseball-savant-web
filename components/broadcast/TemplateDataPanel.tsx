'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset, TemplateDataValues } from '@/lib/broadcastTypes'
import { InputSection, CustomTemplateRecord, SectionInputKey, GlobalInputType, SceneElement, SectionBinding } from '@/lib/sceneTypes'
import { SCENE_METRICS, GAME_METRICS } from '@/lib/reportMetrics'
import { TEAM_COLORS, TEAM_COLOR_OPTIONS, TeamPalette } from '@/lib/teamColors'
import { THEME_PRESETS, THEME_PRESET_OPTIONS, applyThemeAndTeamColor } from '@/lib/themePresets'
import { createCustomRebuild } from '@/lib/customTemplateRebuild'
import { DATA_DRIVEN_TEMPLATES } from '@/lib/sceneTemplates'
import PlayerPicker from '@/components/visualize/PlayerPicker'

const PITCH_TYPES = [
  { value: '', label: 'All' },
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

const YEARS = Array.from({ length: 12 }, (_, i) => 2026 - i)

const ELEMENT_ICONS: Record<string, string> = {
  'stat-card': '#', 'text': 'T', 'shape': '\u25a1', 'player-image': '\u25c9',
  'image': '\u25a3', 'comparison-bar': '\u25ac', 'pitch-flight': '\u2312',
  'stadium': '\u26be', 'ticker': '\u21c4', 'zone-plot': '\u25ce', 'movement-plot': '\u25c8',
}

const GLOBAL_INPUT_TYPES: { value: GlobalInputType; label: string; icon: string }[] = [
  { value: 'player', label: 'Player', icon: '\u25c9' },
  { value: 'live-game', label: 'Live Game', icon: '\u26be' },
  { value: 'leaderboard', label: 'Leaderboard', icon: '\u2261' },
  { value: 'team', label: 'Team', icon: '\u25a3' },
]

type Tab = 'inputs' | 'elements' | 'theme'

interface GameInfo {
  gamePk: number
  state: string
  detailedState: string
  away: { abbrev: string; score: number | null }
  home: { abbrev: string; score: number | null }
  inningOrdinal: string | null
  inningHalf: string | null
}

interface Props {
  asset: BroadcastAsset
}

export default function TemplateDataPanel({ asset }: Props) {
  const { updateAsset, visibleAssetIds, sendEvent } = useBroadcast()
  const [template, setTemplate] = useState<CustomTemplateRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('inputs')
  const [sectionData, setSectionData] = useState<TemplateDataValues['sections']>(
    asset.template_data?.sections || {}
  )
  const [themeTeam, setThemeTeam] = useState(asset.template_data?.themeTeam || '')
  const [themePresetId, setThemePresetId] = useState(asset.template_data?.themePresetId || '')

  // Live game state
  const [gamesBySection, setGamesBySection] = useState<Record<string, GameInfo[]>>({})
  const [gamesLoading, setGamesLoading] = useState<string | null>(null)

  // Fetch the linked template (always latest)
  useEffect(() => {
    if (!asset.template_id) return
    setLoading(true)
    fetch(`/api/custom-templates/${asset.template_id}`)
      .then(r => r.json())
      .then(d => { if (d.template) setTemplate(d.template) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [asset.template_id])

  // Sync section data when asset changes externally
  useEffect(() => {
    setSectionData(asset.template_data?.sections || {})
    setThemeTeam(asset.template_data?.themeTeam || '')
    setThemePresetId(asset.template_data?.themePresetId || '')
  }, [asset.id])

  // Fetch games for live-game sections on mount
  useEffect(() => {
    if (!template) return
    for (const section of template.inputSections || []) {
      const data = sectionData[section.id]
      const gType = data?.globalInputType || section.globalInputType
      const gDate = data?.gameDate || section.gameDate
      if (gType === 'live-game' && gDate && !gamesBySection[section.id]) {
        fetchGamesForDate(section.id, gDate)
      }
    }
  }, [template])

  const updateSection = useCallback((sectionId: string, updates: Record<string, any>) => {
    setSectionData(prev => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], ...updates },
    }))
  }, [])

  function has(section: InputSection, key: SectionInputKey): boolean {
    return section.enabledInputs.includes(key)
  }

  async function fetchGamesForDate(sectionId: string, date: string) {
    setGamesLoading(sectionId)
    try {
      const res = await fetch(`/api/scores?date=${date}`)
      const data = await res.json()
      setGamesBySection(prev => ({ ...prev, [sectionId]: data.games || [] }))
    } catch (err) {
      console.error('Failed to fetch games:', err)
    } finally {
      setGamesLoading(null)
    }
  }

  async function handleApply() {
    if (!template || !asset.template_id) return
    setApplying(true)

    try {
      // 1. Re-fetch latest template design, but merge local sectionBindings
      const tmplRes = await fetch(`/api/custom-templates/${asset.template_id}`)
      const tmplData = await tmplRes.json()
      const latestTemplate: CustomTemplateRecord = tmplData.template
      if (!latestTemplate) throw new Error('Template not found')

      // Merge local element sectionBindings (from Elements tab edits) into the re-fetched template
      if (template?.elements) {
        const localBindings = new Map(template.elements.filter(e => e.sectionBinding).map(e => [e.id, e.sectionBinding]))
        if (localBindings.size > 0) {
          latestTemplate.elements = latestTemplate.elements.map(el => {
            const localBinding = localBindings.get(el.id)
            if (localBinding && !el.sectionBinding) {
              return { ...el, sectionBinding: localBinding }
            }
            return el
          })
        }
      }

      // Auto-bind unbound elements in sections (so user doesn't need to manually set every binding)
      const secs = latestTemplate.inputSections || []
      if (secs.length > 0) {
        const sectionElementIds = new Set(secs.flatMap(s => s.elementIds))
        latestTemplate.elements = latestTemplate.elements.map(el => {
          if (!sectionElementIds.has(el.id) || el.sectionBinding || el.templateBinding) return el
          const sectionId = secs.find(s => s.elementIds.includes(el.id))?.id || ''
          // Auto-assign __player__ for player-image elements
          if (el.type === 'player-image') {
            return { ...el, sectionBinding: { sectionId, metric: '__player__' } }
          }
          return el
        })
      }

      setTemplate(latestTemplate)

      // 2. Fetch stats for each section and build data for template rebuild
      const sections = latestTemplate.inputSections || []
      let resolvedData: any = null

      // Use the first section with a player for stats fetching
      const primarySection = sections[0]
      const primaryData = sectionData[primarySection?.id] || {}

      // Determine effective globalInputType: prefer globalFilter.type, fall back to section
      const gf = latestTemplate.globalFilter
      const effectiveType = gf?.type === 'single-player' ? 'player'
        : gf?.type === 'live-game' ? 'live-game'
        : gf?.type === 'leaderboard' ? 'leaderboard'
        : gf?.type === 'team' ? 'team'
        : gf?.type === 'matchup' ? 'player'
        : gf?.type === 'depth-chart' ? 'depth-chart'
        : primaryData.globalInputType || primarySection?.globalInputType

      // Derive gameYear from dateRange (globalInputType stores year in dateRange, not gameYear)
      const dr = primaryData.dateRange || primarySection?.dateRange
      const resolvedGameYear = primaryData.gameYear
        || (dr?.type === 'season' ? dr.year : undefined)
        || primarySection?.gameYear
        || 2025

      if (effectiveType === 'depth-chart') {
        // Depth chart mode: fetch rotation from MLB Stats API via scene-stats
        const team = gf?.teamAbbrev || 'NYY'
        const res = await fetch(`/api/scene-stats?depthChart=true&team=${team}&gameYear=${resolvedGameYear}`)
        const dcData = await res.json()
        resolvedData = dcData.depthChart || {}
      } else if (effectiveType === 'live-game') {
        // Live game mode: fetch from live-game API
        if (primaryData.gamePk) {
          const res = await fetch(`/api/live-game?gamePk=${primaryData.gamePk}`)
          const data = await res.json()
          resolvedData = data.game ? [data.game] : []
        }
      } else if (effectiveType === 'leaderboard' || (!effectiveType && latestTemplate.schemaType === 'leaderboard')) {
        // Leaderboard mode: fetch from scene-stats API
        const params = new URLSearchParams({ leaderboard: 'true' })
        params.set('metric', primaryData.primaryStat || primarySection?.primaryStat || 'avg_velo')
        params.set('playerType', primaryData.playerType || primarySection?.playerType || 'pitcher')
        params.set('gameYear', String(resolvedGameYear))
        if (primaryData.pitchType || primarySection?.pitchType) params.set('pitchType', (primaryData.pitchType || primarySection?.pitchType)!)
        if (primaryData.pitcherRole && primaryData.pitcherRole !== 'all') params.set('pitcherRole', primaryData.pitcherRole)
        if (primaryData.secondaryStat || primarySection?.secondaryStat) params.set('secondaryMetric', (primaryData.secondaryStat || primarySection?.secondaryStat)!)
        if (primaryData.tertiaryStat || primarySection?.tertiaryStat) params.set('tertiaryMetric', (primaryData.tertiaryStat || primarySection?.tertiaryStat)!)
        if (primaryData.sortDir || primarySection?.sortDir) params.set('sortDir', primaryData.sortDir || primarySection?.sortDir || 'desc')
        if (primaryData.count || primarySection?.count) params.set('limit', String(primaryData.count || primarySection?.count))
        if (primaryData.minSample || primarySection?.minSample) params.set('minSample', String(primaryData.minSample || primarySection?.minSample))
        if (dr?.type === 'custom') {
          params.set('dateFrom', dr.from)
          params.set('dateTo', dr.to)
        }

        const statsRes = await fetch(`/api/scene-stats?${params.toString()}`)
        const statsData = await statsRes.json()
        resolvedData = statsData.leaderboard || []
      } else if (primaryData.playerId) {
        // Single-player modes (outing, starter-card, generic, percentile)
        // Collect ALL metrics from element sectionBindings + panel selections
        const allBoundMetrics = new Set<string>()
        if (primaryData.primaryStat) allBoundMetrics.add(primaryData.primaryStat)
        if (primaryData.secondaryStat) allBoundMetrics.add(primaryData.secondaryStat)
        if (primaryData.tertiaryStat) allBoundMetrics.add(primaryData.tertiaryStat)
        for (const el of latestTemplate.elements) {
          const m = el.sectionBinding?.metric || el.templateBinding?.fieldPath
          if (m && m !== '__player__') allBoundMetrics.add(m)
        }

        const params = new URLSearchParams({
          playerId: String(primaryData.playerId),
          playerType: primaryData.playerType || primarySection?.playerType || 'pitcher',
          metrics: allBoundMetrics.size > 0 ? Array.from(allBoundMetrics).join(',') : 'avg_velo',
        })
        params.set('gameYear', String(resolvedGameYear))
        if (primaryData.pitchType) params.set('pitchType', primaryData.pitchType)

        const statsRes = await fetch(`/api/scene-stats?${params.toString()}`)
        const statsData = await statsRes.json()

        // Build a data row compatible with template bindings
        resolvedData = [{
          player_id: primaryData.playerId,
          player_name: primaryData.playerName || '',
          ...statsData.stats,
          primary_value: primaryData.primaryStat ? statsData.stats?.[primaryData.primaryStat] ?? null : null,
          secondary_value: primaryData.secondaryStat ? statsData.stats?.[primaryData.secondaryStat] ?? null : null,
          tertiary_value: primaryData.tertiaryStat ? statsData.stats?.[primaryData.tertiaryStat] ?? null : null,
        }]
      }

      // 3. Resolve template with data
      const config = {
        templateId: latestTemplate.id,
        playerType: (primaryData.playerType || primarySection?.playerType || 'pitcher') as 'pitcher' | 'batter',
        primaryStat: primaryData.primaryStat || 'avg_velo',
        secondaryStat: primaryData.secondaryStat,
        tertiaryStat: primaryData.tertiaryStat,
        dateRange: dr || { type: 'season' as const, year: resolvedGameYear },
        pitchType: primaryData.pitchType,
        title: primaryData.title,
        sortDir: primaryData.sortDir,
        count: primaryData.count,
        minSample: primaryData.minSample,
        playerId: primaryData.playerId,
        playerName: primaryData.playerName,
      }

      // Use built-in template's rebuild if this was forked from one
      const builtinTemplate = latestTemplate.base_template_id
        ? DATA_DRIVEN_TEMPLATES.find(t => t.id === latestTemplate.base_template_id)
        : null
      const resolvedScene = builtinTemplate
        ? builtinTemplate.rebuild(config, resolvedData || [])
        : createCustomRebuild(latestTemplate)(config, resolvedData || [])

      // 4. Build new scene_config — apply theme preset + team colors
      const preset = themePresetId ? THEME_PRESETS.find(t => t.id === themePresetId) ?? null : null
      const teamPalette = themeTeam ? TEAM_COLORS[themeTeam] ?? null : null
      const elements = applyThemeAndTeamColor(resolvedScene.elements, preset, teamPalette)
      const sceneBackground = preset ? preset.background : resolvedScene.background

      const newSceneConfig = {
        width: resolvedScene.width,
        height: resolvedScene.height,
        background: sceneBackground,
        elements,
      }

      // 5. Update local state + persist
      const templateDataPayload: TemplateDataValues = { sections: sectionData, themeTeam: themeTeam || undefined, themePresetId: themePresetId || undefined }
      updateAsset(asset.id, { scene_config: newSceneConfig, template_data: templateDataPayload })

      await fetch('/api/broadcast/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: asset.id,
          scene_config: newSceneConfig,
          template_data: templateDataPayload,
        }),
      })

      // 6. If visible, push live update via Realtime (seamless swap)
      if (visibleAssetIds.has(asset.id)) {
        sendEvent('asset:update', { assetId: asset.id, sceneConfig: newSceneConfig })
      }
    } catch (err) {
      console.error('Failed to apply template:', err)
    } finally {
      setApplying(false)
    }
  }

  async function handleSaveElementBindings() {
    if (!template || !asset.template_id) return
    setApplying(true)
    try {
      // Auto-set __player__ binding for player-image elements in sections
      const sectionElementIds = new Set((template.inputSections || []).flatMap(s => s.elementIds))
      const elementsToSave = template.elements.map(el => {
        if (el.type === 'player-image' && sectionElementIds.has(el.id) && !el.sectionBinding) {
          const sectionId = (template.inputSections || []).find(s => s.elementIds.includes(el.id))?.id || ''
          return { ...el, sectionBinding: { sectionId, metric: '__player__' } }
        }
        return el
      })

      // Save updated inputSections + element bindings back to the template
      await fetch(`/api/custom-templates/${asset.template_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaType: template.schemaType, inputSections: template.inputSections, elements: elementsToSave }),
      })
      // Then re-apply to rebuild with updated bindings
      await handleApply()
    } catch (err) {
      console.error('Failed to save element bindings:', err)
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
          <span className="text-[11px] text-zinc-500">Loading template...</span>
        </div>
      </div>
    )
  }

  if (!template) return null

  const sections = template.inputSections || []
  if (sections.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-[10px] uppercase tracking-wider text-amber-500 font-medium mb-1">Template</div>
        <p className="text-[11px] text-zinc-500">{template.name} — no input sections defined</p>
      </div>
    )
  }

  // All elements across all sections for theme tab
  const allElements = asset.scene_config?.elements || []

  return (
    <div className="border-b border-zinc-800">
      {/* Header */}
      <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
        <div className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">Template Data</div>
        <p className="text-[11px] text-zinc-500 mt-0.5">{template.name}</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {(['inputs', 'elements', 'theme'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition ${
              activeTab === tab
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3 space-y-4">
        {activeTab === 'inputs' && (
          <InputsTab
            sections={sections}
            sectionData={sectionData}
            updateSection={updateSection}
            has={has}
            gamesBySection={gamesBySection}
            gamesLoading={gamesLoading}
            fetchGamesForDate={fetchGamesForDate}
          />
        )}

        {activeTab === 'elements' && (
          <ElementsTab
            sections={sections}
            template={template}
            setTemplate={setTemplate}
            sectionData={sectionData}
          />
        )}

        {activeTab === 'theme' && (
          <ThemeTab
            themeTeam={themeTeam}
            setThemeTeam={setThemeTeam}
            themePresetId={themePresetId}
            setThemePresetId={setThemePresetId}
          />
        )}

        {/* Apply Button */}
        <button
          onClick={activeTab === 'elements' ? handleSaveElementBindings : handleApply}
          disabled={applying}
          className="w-full px-3 py-2 text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {applying ? (
            <>
              <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              Resolving...
            </>
          ) : (
            'Apply'
          )}
        </button>
      </div>
    </div>
  )
}

// ── Inputs Tab ──────────────────────────────────────────────────────────────

function InputsTab({
  sections,
  sectionData,
  updateSection,
  has,
  gamesBySection,
  gamesLoading,
  fetchGamesForDate,
}: {
  sections: InputSection[]
  sectionData: TemplateDataValues['sections']
  updateSection: (id: string, updates: Record<string, any>) => void
  has: (section: InputSection, key: SectionInputKey) => boolean
  gamesBySection: Record<string, GameInfo[]>
  gamesLoading: string | null
  fetchGamesForDate: (sectionId: string, date: string) => void
}) {
  return (
    <>
      {sections.map(section => {
        const data = sectionData[section.id] || {}
        // Effective type: section data can override, or fall back to template definition
        const effectiveType = data.globalInputType || section.globalInputType

        return (
          <div key={section.id} className="space-y-2">
            {/* Section header */}
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">{section.label}</div>
              {effectiveType && (
                <span className="text-[9px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  {GLOBAL_INPUT_TYPES.find(t => t.value === effectiveType)?.label || effectiveType}
                </span>
              )}
            </div>

            {/* globalInputType controls */}
            {effectiveType ? (
              <GlobalInputControls
                section={section}
                data={data}
                effectiveType={effectiveType}
                updateSection={updateSection}
                gamesBySection={gamesBySection}
                gamesLoading={gamesLoading}
                fetchGamesForDate={fetchGamesForDate}
              />
            ) : (
              /* Legacy: enabledInputs-based flat controls */
              <LegacyInputControls
                section={section}
                data={data}
                updateSection={updateSection}
                has={has}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Global Input Type Controls ──────────────────────────────────────────────

function GlobalInputControls({
  section,
  data,
  effectiveType,
  updateSection,
  gamesBySection,
  gamesLoading,
  fetchGamesForDate,
}: {
  section: InputSection
  data: Record<string, any>
  effectiveType: GlobalInputType
  updateSection: (id: string, updates: Record<string, any>) => void
  gamesBySection: Record<string, GameInfo[]>
  gamesLoading: string | null
  fetchGamesForDate: (sectionId: string, date: string) => void
}) {
  switch (effectiveType) {
    case 'player':
      return (
        <>
          <PlayerTypeToggle sectionId={section.id} value={data.playerType || section.playerType || 'pitcher'} updateSection={updateSection} />
          <div>
            <label className="text-[9px] text-zinc-600 block mb-0.5">Player</label>
            <PlayerPicker
              label={data.playerName || 'Search player...'}
              playerType={data.playerType === 'batter' ? 'hitter' : 'pitcher'}
              onSelect={(id, name) => updateSection(section.id, { playerId: id, playerName: name })}
            />
            {data.playerName && (
              <div className="text-[10px] text-amber-400 mt-0.5">{data.playerName}</div>
            )}
          </div>
          <DateRangeInputs sectionId={section.id} data={data} section={section} updateSection={updateSection} />
          <PitchTypeSelect sectionId={section.id} value={data.pitchType} updateSection={updateSection} />
        </>
      )

    case 'leaderboard':
      return (
        <>
          {/* Leaderboard type toggle */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-600 shrink-0">Leaderboard</span>
            <div className="flex rounded overflow-hidden border border-zinc-700">
              {(['players', 'team'] as const).map(lt => (
                <button
                  key={lt}
                  onClick={() => updateSection(section.id, { leaderboardType: lt })}
                  className={`px-2 py-0.5 text-[10px] transition ${
                    (data.leaderboardType || section.leaderboardType || 'players') === lt
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {lt === 'players' ? 'Players' : 'Team'}
                </button>
              ))}
            </div>
          </div>
          <PlayerTypeToggle sectionId={section.id} value={data.playerType || section.playerType || 'pitcher'} updateSection={updateSection} />
          {/* Pitcher Role filter (SP/RP) */}
          {(data.playerType || section.playerType || 'pitcher') === 'pitcher' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-zinc-600 shrink-0">Role</span>
              <div className="flex rounded overflow-hidden border border-zinc-700">
                {(['all', 'starter', 'reliever'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => updateSection(section.id, { pitcherRole: role === 'all' ? undefined : role })}
                    className={`px-2 py-0.5 text-[10px] transition ${
                      (data.pitcherRole || 'all') === role
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {role === 'all' ? 'All' : role === 'starter' ? 'SP' : 'RP'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DateRangeInputs sectionId={section.id} data={data} section={section} updateSection={updateSection} />
          <PitchTypeSelect sectionId={section.id} value={data.pitchType || section.pitchType} updateSection={updateSection} />
          <MetricSelect label="Primary Stat" value={data.primaryStat || section.primaryStat} onChange={v => updateSection(section.id, { primaryStat: v })} />
          <MetricSelect label="Secondary Stat" value={data.secondaryStat || section.secondaryStat} onChange={v => updateSection(section.id, { secondaryStat: v })} />
          <MetricSelect label="Tertiary Stat" value={data.tertiaryStat || section.tertiaryStat} onChange={v => updateSection(section.id, { tertiaryStat: v })} />
          {/* Sort */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-600 shrink-0">Sort</span>
            <div className="flex rounded overflow-hidden border border-zinc-700">
              {(['desc', 'asc'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => updateSection(section.id, { sortDir: dir })}
                  className={`px-2 py-0.5 text-[10px] transition ${
                    (data.sortDir || section.sortDir || 'desc') === dir
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {dir === 'desc' ? 'Desc' : 'Asc'}
                </button>
              ))}
            </div>
          </div>
          {/* Count */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-600 shrink-0">Count</span>
            <input
              type="number"
              value={data.count ?? section.count ?? 5}
              onChange={e => updateSection(section.id, { count: Math.max(1, parseInt(e.target.value) || 5) })}
              min={1} max={50}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
            />
          </div>
          {/* Min Sample */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-zinc-600 shrink-0">Min Sample</span>
            <input
              type="number"
              value={data.minSample ?? section.minSample ?? 300}
              onChange={e => updateSection(section.id, { minSample: Math.max(0, parseInt(e.target.value) || 0) })}
              min={0} step={50}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
            />
          </div>
        </>
      )

    case 'team':
      return <DateRangeInputs sectionId={section.id} data={data} section={section} updateSection={updateSection} />

    case 'live-game':
      return (
        <LiveGameInputs
          section={section}
          data={data}
          updateSection={updateSection}
          gamesBySection={gamesBySection}
          gamesLoading={gamesLoading}
          fetchGamesForDate={fetchGamesForDate}
        />
      )

    default:
      return null
  }
}

// ── Legacy Input Controls (enabledInputs-based) ────────────────────────────

function LegacyInputControls({
  section,
  data,
  updateSection,
  has,
}: {
  section: InputSection
  data: Record<string, any>
  updateSection: (id: string, updates: Record<string, any>) => void
  has: (section: InputSection, key: SectionInputKey) => boolean
}) {
  return (
    <>
      {has(section, 'playerPicker') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Player</label>
          <PlayerPicker
            label={data.playerName || 'Search player...'}
            playerType={data.playerType === 'batter' ? 'hitter' : 'pitcher'}
            onSelect={(id, name) => updateSection(section.id, { playerId: id, playerName: name })}
          />
          {data.playerName && (
            <div className="text-[10px] text-amber-400 mt-0.5">{data.playerName}</div>
          )}
        </div>
      )}

      {has(section, 'playerType') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Player Type</label>
          <select
            value={data.playerType || section.playerType || 'pitcher'}
            onChange={e => updateSection(section.id, { playerType: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          >
            <option value="pitcher">Pitcher</option>
            <option value="batter">Batter</option>
          </select>
        </div>
      )}

      {has(section, 'season') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Season</label>
          <select
            value={data.gameYear || section.gameYear || 2025}
            onChange={e => updateSection(section.id, { gameYear: parseInt(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {has(section, 'pitchType') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Pitch Type</label>
          <select
            value={data.pitchType || ''}
            onChange={e => updateSection(section.id, { pitchType: e.target.value || undefined })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          >
            {PITCH_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
          </select>
        </div>
      )}

      {has(section, 'title') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Title</label>
          <input
            value={data.title || ''}
            onChange={e => updateSection(section.id, { title: e.target.value })}
            placeholder="Custom title..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          />
        </div>
      )}

      {has(section, 'primaryStat') && (
        <MetricSelect label="Primary Stat" value={data.primaryStat} onChange={v => updateSection(section.id, { primaryStat: v })} />
      )}
      {has(section, 'secondaryStat') && (
        <MetricSelect label="Secondary Stat" value={data.secondaryStat} onChange={v => updateSection(section.id, { secondaryStat: v })} />
      )}
      {has(section, 'tertiaryStat') && (
        <MetricSelect label="Tertiary Stat" value={data.tertiaryStat} onChange={v => updateSection(section.id, { tertiaryStat: v })} />
      )}

      {has(section, 'dateRange') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Date Range</label>
          <select
            value={data.dateRange?.type || 'season'}
            onChange={e => {
              if (e.target.value === 'season') {
                updateSection(section.id, { dateRange: { type: 'season', year: data.gameYear || 2025 } })
              } else {
                updateSection(section.id, { dateRange: { type: 'custom', from: '', to: '' } })
              }
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none mb-1"
          >
            <option value="season">Full Season</option>
            <option value="custom">Custom Range</option>
          </select>
          {data.dateRange?.type === 'custom' && (
            <div className="grid grid-cols-2 gap-1">
              <input
                type="date"
                value={data.dateRange.from || ''}
                onChange={e => updateSection(section.id, { dateRange: { ...data.dateRange, from: e.target.value } })}
                className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none"
              />
              <input
                type="date"
                value={data.dateRange.to || ''}
                onChange={e => updateSection(section.id, { dateRange: { ...data.dateRange, to: e.target.value } })}
                className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none"
              />
            </div>
          )}
        </div>
      )}

      {has(section, 'sortDir') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Sort</label>
          <select
            value={data.sortDir || 'desc'}
            onChange={e => updateSection(section.id, { sortDir: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      )}

      {has(section, 'count') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Count</label>
          <input
            type="number"
            min={1}
            max={25}
            value={data.count || 5}
            onChange={e => updateSection(section.id, { count: parseInt(e.target.value) || 5 })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          />
        </div>
      )}

      {has(section, 'minSample') && (
        <div>
          <label className="text-[9px] text-zinc-600 block mb-0.5">Min Sample</label>
          <input
            type="number"
            min={1}
            value={data.minSample || 300}
            onChange={e => updateSection(section.id, { minSample: parseInt(e.target.value) || 300 })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
          />
        </div>
      )}
    </>
  )
}

// ── Elements Tab ────────────────────────────────────────────────────────────

function ElementsTab({
  sections,
  template,
  setTemplate,
  sectionData,
}: {
  sections: InputSection[]
  template: CustomTemplateRecord
  setTemplate: (t: CustomTemplateRecord) => void
  sectionData: TemplateDataValues['sections']
}) {
  function updateElementMetric(sectionId: string, elementId: string, metric: string) {
    const newSections = (template.inputSections || []).map(s => {
      if (s.id !== sectionId) return s
      return s // section itself unchanged, we update element bindings
    })
    // Update the element's sectionBinding in the template elements
    const newElements = template.elements.map(el => {
      if (el.id !== elementId) return el
      return {
        ...el,
        sectionBinding: el.sectionBinding
          ? { ...el.sectionBinding, metric }
          : { sectionId, metric },
      }
    })
    setTemplate({ ...template, elements: newElements })
  }

  return (
    <>
      {sections.map(section => {
        const data = sectionData[section.id] || {}
        const effectiveType = data.globalInputType || section.globalInputType
        const isLiveGame = effectiveType === 'live-game'
        const metricOptions = isLiveGame ? GAME_METRICS : SCENE_METRICS
        const sectionElements = template.elements.filter(e => section.elementIds.includes(e.id))

        if (sectionElements.length === 0) return null

        return (
          <div key={section.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">{section.label}</div>
              <span className="text-[9px] text-zinc-600">({sectionElements.length})</span>
            </div>
            <div className="space-y-1">
              {sectionElements.map(el => {
                const isPlayerImage = el.type === 'player-image' && !isLiveGame
                const binding = el.sectionBinding
                const defaultMetric = isLiveGame ? 'away_abbrev' : 'avg_velo'
                // Show a placeholder label for the element (use binding label or element label)
                const elLabel = el.props?.label || el.type

                return (
                  <div key={el.id} className="rounded bg-zinc-800/60 border border-zinc-700/50 px-2 py-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] text-zinc-500 w-4 text-center shrink-0">
                        {ELEMENT_ICONS[el.type] || '?'}
                      </span>
                      <span className="text-[10px] text-zinc-400 truncate flex-1">{elLabel}</span>
                    </div>
                    {isPlayerImage ? (
                      <div className="text-[9px] text-zinc-600 px-1">Auto: player image</div>
                    ) : (
                      <select
                        value={binding?.metric || defaultMetric}
                        onChange={e => updateElementMetric(section.id, el.id, e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 outline-none"
                      >
                        {!binding?.metric && (
                          <option value="" disabled>Select metric...</option>
                        )}
                        {metricOptions.map(m => (
                          <option key={m.value} value={m.value}>
                            {m.group ? `${m.group} \u2014 ` : ''}{m.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {sections.every(s => template.elements.filter(e => s.elementIds.includes(e.id)).length === 0) && (
        <p className="text-[11px] text-zinc-600 text-center py-2">No bound elements found</p>
      )}
    </>
  )
}

// ── Theme Tab ───────────────────────────────────────────────────────────────

function ThemeTab({
  themeTeam,
  setThemeTeam,
  themePresetId,
  setThemePresetId,
}: {
  themeTeam: string
  setThemeTeam: (v: string) => void
  themePresetId: string
  setThemePresetId: (v: string) => void
}) {
  const tc = themeTeam ? TEAM_COLORS[themeTeam] : null
  const preset = themePresetId ? THEME_PRESETS.find(t => t.id === themePresetId) : null

  return (
    <div className="space-y-3">
      {/* Style Theme */}
      <div>
        <label className="text-[9px] text-zinc-600 block mb-1">Style Theme</label>
        <select
          value={themePresetId}
          onChange={e => setThemePresetId(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-200 outline-none"
        >
          {THEME_PRESET_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Preset swatches preview */}
      {preset && (
        <div className="space-y-1.5">
          <div className="text-[9px] text-zinc-600">Theme Palette</div>
          <div className="flex gap-2">
            <Swatch label="Primary" color={preset.primary} />
            <Swatch label="Secondary" color={preset.secondary} />
            <Swatch label="Accent" color={preset.accent} />
          </div>
          <div className="flex gap-2 mt-1">
            <Swatch label="Background" color={preset.background} />
            <Swatch label="Text" color={preset.textColor} />
          </div>
          <div className="text-[9px] text-zinc-600 mt-1">
            {preset.headingFont} / {preset.bodyFont} &middot; {preset.statCard.variant}
          </div>
        </div>
      )}

      {/* Team Theme */}
      <div>
        <label className="text-[9px] text-zinc-600 block mb-1">Team Theme</label>
        <select
          value={themeTeam}
          onChange={e => setThemeTeam(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-200 outline-none"
        >
          {TEAM_COLOR_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Team color swatches preview */}
      {tc && (
        <div className="space-y-1.5">
          <div className="text-[9px] text-zinc-600">Team Palette</div>
          <div className="flex gap-2">
            <Swatch label="Primary" color={tc.primary} />
            <Swatch label="Secondary" color={tc.secondary} />
            <Swatch label="Accent" color={tc.accent} />
          </div>
          <div className="text-[9px] text-zinc-600 mt-1">
            Overrides accent colors on top of style theme
          </div>
        </div>
      )}
    </div>
  )
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex-1 text-center">
      <div
        className="w-full h-6 rounded border border-zinc-700"
        style={{ backgroundColor: color }}
      />
      <div className="text-[8px] text-zinc-600 mt-0.5">{label}</div>
      <div className="text-[8px] text-zinc-700 font-mono">{color}</div>
    </div>
  )
}

// ── Shared Compact Controls ─────────────────────────────────────────────────

function PlayerTypeToggle({
  sectionId,
  value,
  updateSection,
}: {
  sectionId: string
  value: string
  updateSection: (id: string, updates: Record<string, any>) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] text-zinc-600 shrink-0">Type</span>
      <div className="flex rounded overflow-hidden border border-zinc-700">
        {(['pitcher', 'batter'] as const).map(pt => (
          <button
            key={pt}
            onClick={() => updateSection(sectionId, { playerType: pt })}
            className={`px-2 py-0.5 text-[10px] transition ${
              value === pt
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {pt === 'pitcher' ? 'Pitcher' : 'Batter'}
          </button>
        ))}
      </div>
    </div>
  )
}

function DateRangeInputs({
  sectionId,
  data,
  section,
  updateSection,
}: {
  sectionId: string
  data: Record<string, any>
  section: InputSection
  updateSection: (id: string, updates: Record<string, any>) => void
}) {
  const dr = data.dateRange || section.dateRange || { type: 'season' as const, year: section.gameYear || 2025 }
  return (
    <div>
      <label className="text-[9px] text-zinc-600 block mb-0.5">Date Range</label>
      <div className="flex gap-1 mb-1">
        {(['season', 'custom'] as const).map(dt => (
          <button
            key={dt}
            onClick={() => {
              if (dt === 'season') updateSection(sectionId, { dateRange: { type: 'season', year: section.gameYear || 2025 } })
              else updateSection(sectionId, { dateRange: { type: 'custom', from: `${section.gameYear || 2025}-03-27`, to: `${section.gameYear || 2025}-09-28` } })
            }}
            className={`flex-1 px-2 py-0.5 rounded text-[10px] font-medium transition border ${
              dr.type === dt
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {dt === 'season' ? 'Season' : 'Custom'}
          </button>
        ))}
      </div>
      {dr.type === 'season' ? (
        <select
          value={dr.year}
          onChange={e => updateSection(sectionId, { dateRange: { type: 'season', year: Number(e.target.value) } })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          <input
            type="date"
            value={(dr as { type: 'custom'; from: string; to: string }).from}
            onChange={e => updateSection(sectionId, { dateRange: { ...dr as { type: 'custom'; from: string; to: string }, from: e.target.value } })}
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none"
          />
          <input
            type="date"
            value={(dr as { type: 'custom'; from: string; to: string }).to}
            onChange={e => updateSection(sectionId, { dateRange: { ...dr as { type: 'custom'; from: string; to: string }, to: e.target.value } })}
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none"
          />
        </div>
      )}
    </div>
  )
}

function PitchTypeSelect({
  sectionId,
  value,
  updateSection,
}: {
  sectionId: string
  value?: string
  updateSection: (id: string, updates: Record<string, any>) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] text-zinc-600 shrink-0">Pitch Type</span>
      <select
        value={value || ''}
        onChange={e => updateSection(sectionId, { pitchType: e.target.value || undefined })}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
      >
        {PITCH_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
      </select>
    </div>
  )
}

function LiveGameInputs({
  section,
  data,
  updateSection,
  gamesBySection,
  gamesLoading,
  fetchGamesForDate,
}: {
  section: InputSection
  data: Record<string, any>
  updateSection: (id: string, updates: Record<string, any>) => void
  gamesBySection: Record<string, GameInfo[]>
  gamesLoading: string | null
  fetchGamesForDate: (sectionId: string, date: string) => void
}) {
  const games = gamesBySection[section.id] || []
  const isLoading = gamesLoading === section.id
  const gameDate = data.gameDate || section.gameDate || ''
  const selectedPk = data.gamePk || section.gamePk

  return (
    <>
      <div>
        <label className="text-[9px] text-zinc-600 block mb-0.5">Game Date</label>
        <input
          type="date"
          value={gameDate}
          onChange={e => {
            const date = e.target.value
            updateSection(section.id, { gameDate: date, gamePk: undefined })
            if (date) fetchGamesForDate(section.id, date)
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
        />
      </div>

      {isLoading && (
        <div className="text-[10px] text-zinc-500 py-2 text-center">Loading games...</div>
      )}

      {!isLoading && gameDate && games.length === 0 && (
        <div className="text-[10px] text-zinc-600 py-2 text-center">No games found</div>
      )}

      {!isLoading && games.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {games.map(game => {
            const selected = selectedPk === game.gamePk
            return (
              <button
                key={game.gamePk}
                onClick={() => updateSection(section.id, { gamePk: game.gamePk })}
                className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition border ${
                  selected
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{game.away.abbrev} @ {game.home.abbrev}</span>
                  <span className={`text-[9px] ${
                    game.state === 'Live' ? 'text-red-400' :
                    game.state === 'Final' ? 'text-zinc-500' : 'text-zinc-600'
                  }`}>
                    {game.state === 'Live'
                      ? `${game.inningHalf === 'Top' ? '\u25b2' : '\u25bc'} ${game.inningOrdinal}`
                      : game.detailedState}
                  </span>
                </div>
                {game.state !== 'Preview' && game.away.score != null && (
                  <div className="text-[9px] text-zinc-600 mt-0.5">
                    {game.away.abbrev} {game.away.score} - {game.home.abbrev} {game.home.score}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function MetricSelect({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div>
      <label className="text-[9px] text-zinc-600 block mb-0.5">{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || undefined)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none"
      >
        <option value="">Select...</option>
        {SCENE_METRICS.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </div>
  )
}
