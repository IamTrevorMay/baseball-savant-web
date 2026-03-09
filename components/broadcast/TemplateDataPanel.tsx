'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset, TemplateDataValues } from '@/lib/broadcastTypes'
import { InputSection, CustomTemplateRecord, SectionInputKey } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import { createCustomRebuild } from '@/lib/customTemplateRebuild'
import PlayerPicker from '@/components/visualize/PlayerPicker'

const PITCH_TYPES = [
  { value: '', label: 'All' },
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

const YEARS = Array.from({ length: 11 }, (_, i) => 2025 - i)

interface Props {
  asset: BroadcastAsset
}

export default function TemplateDataPanel({ asset }: Props) {
  const { updateAsset, visibleAssetIds, sendEvent } = useBroadcast()
  const [template, setTemplate] = useState<CustomTemplateRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [sectionData, setSectionData] = useState<TemplateDataValues['sections']>(
    asset.template_data?.sections || {}
  )

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
  }, [asset.id])

  const updateSection = useCallback((sectionId: string, updates: Record<string, any>) => {
    setSectionData(prev => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], ...updates },
    }))
  }, [])

  function has(section: InputSection, key: SectionInputKey): boolean {
    return section.enabledInputs.includes(key)
  }

  async function handleApply() {
    if (!template || !asset.template_id) return
    setApplying(true)

    try {
      // 1. Re-fetch latest template design
      const tmplRes = await fetch(`/api/custom-templates/${asset.template_id}`)
      const tmplData = await tmplRes.json()
      const latestTemplate: CustomTemplateRecord = tmplData.template
      if (!latestTemplate) throw new Error('Template not found')

      setTemplate(latestTemplate)

      // 2. Fetch stats for each section and build data for template rebuild
      const sections = latestTemplate.inputSections || []
      let resolvedData: any = null

      // Use the first section with a player for stats fetching
      const primarySection = sections[0]
      const primaryData = sectionData[primarySection?.id] || {}

      if (latestTemplate.schemaType === 'leaderboard') {
        // Leaderboard mode: fetch from scene-stats API
        const params = new URLSearchParams({ leaderboard: 'true' })
        params.set('metric', primaryData.primaryStat || 'avg_velo')
        params.set('playerType', primaryData.playerType || primarySection?.playerType || 'pitcher')
        if (primaryData.gameYear) params.set('gameYear', String(primaryData.gameYear))
        if (primaryData.pitchType) params.set('pitchType', primaryData.pitchType)
        if (primaryData.secondaryStat) params.set('secondaryMetric', primaryData.secondaryStat)
        if (primaryData.tertiaryStat) params.set('tertiaryMetric', primaryData.tertiaryStat)
        if (primaryData.sortDir) params.set('sortDir', primaryData.sortDir)
        if (primaryData.count) params.set('limit', String(primaryData.count))
        if (primaryData.minSample) params.set('minSample', String(primaryData.minSample))
        if (primaryData.dateRange?.type === 'custom') {
          params.set('dateFrom', primaryData.dateRange.from)
          params.set('dateTo', primaryData.dateRange.to)
        }

        const statsRes = await fetch(`/api/scene-stats?${params.toString()}`)
        const statsData = await statsRes.json()
        resolvedData = statsData.leaderboard || []
      } else if (primaryData.playerId) {
        // Single-player modes (outing, starter-card, generic, percentile)
        const params = new URLSearchParams({
          playerId: String(primaryData.playerId),
          playerType: primaryData.playerType || primarySection?.playerType || 'pitcher',
          metrics: [primaryData.primaryStat, primaryData.secondaryStat, primaryData.tertiaryStat].filter(Boolean).join(',') || 'avg_velo',
        })
        if (primaryData.gameYear) params.set('gameYear', String(primaryData.gameYear))
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
      const rebuild = createCustomRebuild(latestTemplate)
      const config = {
        templateId: latestTemplate.id,
        playerType: (primaryData.playerType || primarySection?.playerType || 'pitcher') as 'pitcher' | 'batter',
        primaryStat: primaryData.primaryStat || 'avg_velo',
        secondaryStat: primaryData.secondaryStat,
        tertiaryStat: primaryData.tertiaryStat,
        dateRange: primaryData.dateRange || { type: 'season' as const, year: primaryData.gameYear || 2025 },
        pitchType: primaryData.pitchType,
        title: primaryData.title,
        sortDir: primaryData.sortDir,
        count: primaryData.count,
        minSample: primaryData.minSample,
        playerId: primaryData.playerId,
        playerName: primaryData.playerName,
      }
      const resolvedScene = rebuild(config, resolvedData || [])

      // 4. Build new scene_config
      const newSceneConfig = {
        width: resolvedScene.width,
        height: resolvedScene.height,
        background: resolvedScene.background,
        elements: resolvedScene.elements,
      }

      // 5. Update local state + persist
      const templateDataPayload: TemplateDataValues = { sections: sectionData }
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

  return (
    <div className="border-b border-zinc-800">
      <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
        <div className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">Template Data</div>
        <p className="text-[11px] text-zinc-500 mt-0.5">{template.name}</p>
      </div>

      <div className="px-4 py-3 space-y-4">
        {sections.map(section => {
          const data = sectionData[section.id] || {}
          return (
            <div key={section.id} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">{section.label}</div>

              {/* Player Picker */}
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

              {/* Player Type */}
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

              {/* Season */}
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

              {/* Pitch Type */}
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

              {/* Title */}
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

              {/* Primary Stat */}
              {has(section, 'primaryStat') && (
                <MetricSelect
                  label="Primary Stat"
                  value={data.primaryStat}
                  onChange={v => updateSection(section.id, { primaryStat: v })}
                />
              )}

              {/* Secondary Stat */}
              {has(section, 'secondaryStat') && (
                <MetricSelect
                  label="Secondary Stat"
                  value={data.secondaryStat}
                  onChange={v => updateSection(section.id, { secondaryStat: v })}
                />
              )}

              {/* Tertiary Stat */}
              {has(section, 'tertiaryStat') && (
                <MetricSelect
                  label="Tertiary Stat"
                  value={data.tertiaryStat}
                  onChange={v => updateSection(section.id, { tertiaryStat: v })}
                />
              )}

              {/* Date Range */}
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

              {/* Sort Direction */}
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

              {/* Count */}
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

              {/* Min Sample */}
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
            </div>
          )
        })}

        {/* Apply Button */}
        <button
          onClick={handleApply}
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
