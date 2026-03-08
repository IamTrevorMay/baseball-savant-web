'use client'

import { useState, useEffect } from 'react'
import { TemplateConfig, InputFieldType } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import { supabase } from '@/lib/supabase'

const PITCH_TYPES = [
  { value: '', label: 'All Pitch Types' },
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

const YEARS = Array.from({ length: 11 }, (_, i) => 2025 - i)

const BATTER_METRICS = new Set([
  'ba', 'obp', 'slg', 'ops',
  'avg_xba', 'avg_xwoba', 'avg_xslg', 'avg_woba', 'total_re24',
  'avg_ev', 'max_ev', 'avg_la', 'avg_dist', 'hard_hit_pct', 'barrel_pct', 'gb_pct', 'fb_pct', 'ld_pct', 'pu_pct',
  'avg_bat_speed', 'avg_swing_length',
  'k_pct', 'bb_pct', 'chase_pct', 'contact_pct', 'whiff_pct', 'z_swing_pct', 'o_contact_pct',
  'hr_count', 'h', 'doubles', 'triples', 'bb_count', 'k_count', 'hbp_count', 'pa', 'games',
])
const PITCHER_METRICS = new Set([
  'avg_velo', 'max_velo', 'avg_spin', 'avg_hbreak_in', 'avg_ivb_in', 'avg_ext', 'avg_arm_angle',
  'whiff_pct', 'k_pct', 'bb_pct', 'k_minus_bb', 'csw_pct', 'swstr_pct', 'zone_pct', 'chase_pct', 'contact_pct', 'z_swing_pct', 'o_contact_pct',
  'ba', 'obp', 'slg', 'ops',
  'avg_xba', 'avg_xwoba', 'avg_xslg', 'avg_woba', 'total_re24',
  'avg_ev', 'max_ev', 'avg_la', 'hard_hit_pct', 'barrel_pct', 'gb_pct', 'fb_pct', 'ld_pct', 'pu_pct',
  'pitches', 'pa', 'games', 'k_count', 'bb_count', 'hr_count', 'h', 'usage_pct',
  'avg_brink', 'avg_cluster', 'avg_hdev', 'avg_vdev', 'avg_missfire', 'close_pct', 'waste_pct',
  'cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus', 'hdev_plus', 'vdev_plus', 'missfire_plus', 'close_pct_plus',
  'deception_score', 'unique_score', 'xdeception_score',
  'era', 'fip', 'xera',
])

interface Props {
  config: TemplateConfig
  inputFields: InputFieldType[]
  templateName: string
  onUpdateConfig: (updates: Partial<TemplateConfig>) => void
  onRefresh: () => void
  loading: boolean
}

export default function CustomTemplateConfigPanel({ config, inputFields, templateName, onUpdateConfig, onRefresh, loading }: Props) {
  const [showSecondary, setShowSecondary] = useState(!!config.secondaryStat)
  const [showTertiary, setShowTertiary] = useState(!!config.tertiaryStat)

  // Player search state (for playerPicker field)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [focused, setFocused] = useState(false)

  const has = (f: InputFieldType) => inputFields.includes(f)

  const relevantSet = config.playerType === 'batter' ? BATTER_METRICS : PITCHER_METRICS
  const filteredMetrics = SCENE_METRICS.filter(m => relevantSet.has(m.value))

  const groupedMetrics: { group: string; metrics: typeof filteredMetrics }[] = []
  const seen = new Set<string>()
  for (const m of filteredMetrics) {
    const g = m.group || 'Other'
    if (!seen.has(g)) { seen.add(g); groupedMetrics.push({ group: g, metrics: [] }) }
    groupedMetrics.find(gm => gm.group === g)!.metrics.push(m)
  }

  // Player search
  useEffect(() => {
    if (!has('playerPicker') || !query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_players', {
        search_term: query.trim(),
        result_limit: 8,
      })
      if (data) setResults(data)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function selectPlayer(p: any) {
    const id = p.pitcher || p.batter
    onUpdateConfig({ playerId: id, playerName: p.player_name })
    setQuery('')
    setResults([])
  }

  if (inputFields.length === 0) {
    return (
      <div className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Template Settings</div>
        <div className="text-[12px] text-cyan-400 font-semibold mb-3">{templateName}</div>
        <div className="h-px bg-zinc-800 mb-3" />
        <p className="text-[11px] text-zinc-600 text-center py-4">
          No configurable fields for this template.
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="w-full py-2 rounded-lg bg-emerald-600/20 border border-emerald-600/50 text-emerald-300 text-[12px] font-semibold hover:bg-emerald-600/30 transition disabled:opacity-50 disabled:cursor-default"
        >
          {loading ? 'Loading...' : 'Refresh Data'}
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Template Settings</div>
        <div className="text-[12px] text-cyan-400 font-semibold">{templateName}</div>
      </div>

      <div className="h-px bg-zinc-800" />

      {/* Title */}
      {has('title') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Title (optional)</label>
          <input
            type="text"
            value={config.title || ''}
            onChange={e => onUpdateConfig({ title: e.target.value || undefined })}
            placeholder="Auto-generated"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-600 outline-none"
          />
        </div>
      )}

      {/* Player Type */}
      {has('playerType') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1.5">Player Type</label>
          <div className="flex gap-1">
            {(['pitcher', 'batter'] as const).map(pt => (
              <button
                key={pt}
                onClick={() => onUpdateConfig({ playerType: pt })}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition border ${
                  config.playerType === pt
                    ? 'bg-emerald-600/20 border-emerald-600/50 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {pt === 'pitcher' ? 'Pitcher' : 'Batter'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Player Picker */}
      {has('playerPicker') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Player</label>
          {config.playerId && config.playerName ? (
            <div className="flex items-center gap-2 h-8 px-2.5 bg-zinc-800 rounded border border-zinc-700">
              <span className="text-[11px] text-white flex-1 truncate">{config.playerName}</span>
              <button
                onClick={() => onUpdateConfig({ playerId: undefined, playerName: undefined })}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >&#x2715;</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 200)}
                placeholder="Search player..."
                className="w-full h-8 px-2.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
              {focused && results.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-auto">
                  {results.map((p: any) => (
                    <button
                      key={p.pitcher || p.batter || p.player_name}
                      onMouseDown={e => { e.preventDefault(); selectPlayer(p) }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-700 flex items-center gap-2"
                    >
                      <span className="text-[11px] text-white">{p.player_name}</span>
                      <span className="text-[9px] text-zinc-500">{p.team}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Primary Stat */}
      {has('primaryStat') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Primary Stat</label>
          <select
            value={config.primaryStat}
            onChange={e => onUpdateConfig({ primaryStat: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
          >
            {groupedMetrics.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.metrics.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {/* Sort Direction */}
      {has('sortDir') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1.5">Sort</label>
          <div className="flex gap-1">
            {(['desc', 'asc'] as const).map(dir => (
              <button
                key={dir}
                onClick={() => onUpdateConfig({ sortDir: dir })}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition border ${
                  (config.sortDir || 'desc') === dir
                    ? 'bg-emerald-600/20 border-emerald-600/50 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {dir === 'desc' ? 'Descending' : 'Ascending'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date Range */}
      {has('dateRange') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1.5">Date Range</label>
          <div className="flex gap-1 mb-2">
            {(['season', 'custom'] as const).map(dt => (
              <button
                key={dt}
                onClick={() => {
                  if (dt === 'season') onUpdateConfig({ dateRange: { type: 'season', year: 2025 } })
                  else onUpdateConfig({ dateRange: { type: 'custom', from: '2025-03-27', to: '2025-09-28' } })
                }}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition border ${
                  config.dateRange.type === dt
                    ? 'bg-emerald-600/20 border-emerald-600/50 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {dt === 'season' ? 'Season' : 'Custom'}
              </button>
            ))}
          </div>
          {config.dateRange.type === 'season' ? (
            <select
              value={config.dateRange.year}
              onChange={e => onUpdateConfig({ dateRange: { type: 'season', year: Number(e.target.value) } })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
            >
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          ) : (
            <div className="space-y-1.5">
              <input
                type="date"
                value={config.dateRange.from}
                onChange={e => onUpdateConfig({ dateRange: { ...config.dateRange as { type: 'custom'; from: string; to: string }, from: e.target.value } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
              />
              <input
                type="date"
                value={config.dateRange.to}
                onChange={e => onUpdateConfig({ dateRange: { ...config.dateRange as { type: 'custom'; from: string; to: string }, to: e.target.value } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Pitch Type */}
      {has('pitchType') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Pitch Type (optional)</label>
          <select
            value={config.pitchType || ''}
            onChange={e => onUpdateConfig({ pitchType: e.target.value || undefined })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
          >
            {PITCH_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Count */}
      {has('count') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Count</label>
          <input
            type="number"
            value={config.count ?? 5}
            onChange={e => onUpdateConfig({ count: Math.max(1, parseInt(e.target.value) || 5) })}
            min={1}
            max={50}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
          />
        </div>
      )}

      {/* Min Sample */}
      {has('minSample') && (
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Min Pitches (qualifier)</label>
          <input
            type="number"
            value={config.minSample ?? (config.playerType === 'batter' ? 150 : 300)}
            onChange={e => onUpdateConfig({ minSample: Math.max(0, parseInt(e.target.value) || 0) })}
            min={0}
            step={50}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
          />
        </div>
      )}

      {/* Secondary Stat */}
      {has('secondaryStat') && (
        <>
          <div className="h-px bg-zinc-800" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-zinc-500">Secondary Stat</label>
              <button
                onClick={() => {
                  setShowSecondary(p => !p)
                  if (showSecondary) onUpdateConfig({ secondaryStat: undefined })
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition border ${
                  showSecondary
                    ? 'bg-purple-600/20 border-purple-600/40 text-purple-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {showSecondary ? 'ON' : 'OFF'}
              </button>
            </div>
            {showSecondary && (
              <select
                value={config.secondaryStat || ''}
                onChange={e => onUpdateConfig({ secondaryStat: e.target.value || undefined })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-purple-600 outline-none"
              >
                <option value="">Select...</option>
                {filteredMetrics.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}
          </div>
        </>
      )}

      {/* Tertiary Stat */}
      {has('tertiaryStat') && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-zinc-500">Tertiary Stat</label>
            <button
              onClick={() => {
                setShowTertiary(p => !p)
                if (showTertiary) onUpdateConfig({ tertiaryStat: undefined })
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition border ${
                showTertiary
                  ? 'bg-amber-600/20 border-amber-600/40 text-amber-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {showTertiary ? 'ON' : 'OFF'}
            </button>
          </div>
          {showTertiary && (
            <select
              value={config.tertiaryStat || ''}
              onChange={e => onUpdateConfig({ tertiaryStat: e.target.value || undefined })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-600 outline-none"
            >
              <option value="">Select...</option>
              {filteredMetrics.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="h-px bg-zinc-800" />

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="w-full py-2 rounded-lg bg-emerald-600/20 border border-emerald-600/50 text-emerald-300 text-[12px] font-semibold hover:bg-emerald-600/30 transition disabled:opacity-50 disabled:cursor-default"
      >
        {loading ? 'Loading...' : 'Refresh Data'}
      </button>

      <p className="text-[10px] text-zinc-600 text-center">
        Click any element to edit individually
      </p>
    </div>
  )
}
