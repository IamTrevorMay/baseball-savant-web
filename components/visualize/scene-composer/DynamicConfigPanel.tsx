'use client'

import { useState, useEffect } from 'react'
import { Scene, CustomTemplateRecord, TemplateInputField } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import { supabase } from '@/lib/supabase'

const YEARS = Array.from({ length: 11 }, (_, i) => 2025 - i)

const PITCH_TYPES = [
  { value: '', label: 'All Pitch Types' },
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

const TEAMS = [
  'ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET',
  'HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK',
  'PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH',
]

interface Props {
  template: CustomTemplateRecord
  scene: Scene
  onUpdateScene: (scene: Scene | ((prev: Scene) => Scene)) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

function replaceTokens(elements: any[], values: Record<string, any>): any[] {
  return elements.map(el => {
    const newProps = { ...el.props }
    for (const [key, val] of Object.entries(newProps)) {
      if (typeof val === 'string' && val.includes('{')) {
        let replaced = val
        for (const [token, replacement] of Object.entries(values)) {
          replaced = replaced.replace(new RegExp(`\\{${token}\\}`, 'g'), String(replacement ?? ''))
        }
        newProps[key] = replaced
      }
    }
    return { ...el, props: newProps }
  })
}

export default function DynamicConfigPanel({ template, scene, onUpdateScene, loading, setLoading }: Props) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    for (const field of template.input_fields) {
      init[field.id] = field.defaultValue ?? ''
    }
    return init
  })

  // Player search state
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<any[]>([])
  const [playerFocused, setPlayerFocused] = useState(false)
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})

  // Game list state
  const [games, setGames] = useState<any[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)

  // Debounced player search
  useEffect(() => {
    if (!playerQuery.trim()) { setPlayerResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_players', {
        search_term: playerQuery.trim(),
        result_limit: 8,
      })
      if (data) setPlayerResults(data)
    }, 200)
    return () => clearTimeout(t)
  }, [playerQuery])

  // Fetch games when player + season change
  useEffect(() => {
    const playerField = template.input_fields.find(f => f.type === 'player')
    const seasonField = template.input_fields.find(f => f.type === 'season')
    const gameField = template.input_fields.find(f => f.type === 'game')
    if (!gameField || !playerField) return
    const pid = values[playerField.id]
    const season = seasonField ? values[seasonField.id] : 2025
    if (!pid) { setGames([]); return }

    let cancelled = false
    setGamesLoading(true)
    fetch(`/api/pitcher-outing?games=true&pitcherId=${pid}&season=${season}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setGames(data.games || []) })
      .catch(() => { if (!cancelled) setGames([]) })
      .finally(() => { if (!cancelled) setGamesLoading(false) })
    return () => { cancelled = true }
  }, [values, template.input_fields])

  function updateValue(fieldId: string, val: any) {
    setValues(prev => ({ ...prev, [fieldId]: val }))
  }

  function selectPlayer(fieldId: string, p: any) {
    const id = p.pitcher || p.batter
    updateValue(fieldId, id)
    setPlayerNames(prev => ({ ...prev, [fieldId]: p.player_name }))
    setPlayerQuery('')
    setPlayerResults([])
  }

  async function handleApply() {
    if (!template.data_query) {
      // No data source — just replace tokens
      const tokenValues: Record<string, any> = {}
      for (const field of template.input_fields) {
        tokenValues[field.id] = values[field.id]
        if (field.type === 'player' && playerNames[field.id]) {
          tokenValues['player_name'] = playerNames[field.id]
        }
      }
      const newElements = replaceTokens(template.elements, tokenValues)
      onUpdateScene((prev: Scene) => ({ ...prev, elements: newElements }))
      return
    }

    // Has data source — call API
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const dq = template.data_query
      for (const [paramKey, fieldId] of Object.entries(dq.paramMapping)) {
        if (values[fieldId]) params.set(paramKey, String(values[fieldId]))
      }
      const res = await fetch(`${dq.endpoint}?${params}`)
      const data = await res.json()

      // Build token values from response
      const tokenValues: Record<string, any> = {}
      for (const field of template.input_fields) {
        tokenValues[field.id] = values[field.id]
        if (field.type === 'player' && playerNames[field.id]) {
          tokenValues['player_name'] = playerNames[field.id]
        }
      }
      // Flatten first-level data keys as tokens
      if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string' || typeof v === 'number') {
            tokenValues[k] = v
          }
        }
      }

      const newElements = replaceTokens(template.elements, tokenValues)
      onUpdateScene((prev: Scene) => ({ ...prev, elements: newElements }))
    } catch (err) {
      console.error('DynamicConfigPanel fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  function renderField(field: TemplateInputField) {
    switch (field.type) {
      case 'player':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{field.label}</label>
            {values[field.id] && playerNames[field.id] ? (
              <div className="flex items-center gap-2 h-8 px-2.5 bg-zinc-800 rounded border border-zinc-700">
                <span className="text-[11px] text-white flex-1 truncate">{playerNames[field.id]}</span>
                <button onClick={() => { updateValue(field.id, ''); setPlayerNames(prev => ({ ...prev, [field.id]: '' })) }} className="text-zinc-500 hover:text-zinc-300 text-xs">{'\u2715'}</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={playerQuery}
                  onChange={e => setPlayerQuery(e.target.value)}
                  onFocus={() => setPlayerFocused(true)}
                  onBlur={() => setTimeout(() => setPlayerFocused(false), 200)}
                  placeholder="Search player\u2026"
                  className="w-full h-8 px-2.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                />
                {playerFocused && playerResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-auto">
                    {playerResults.map((p: any) => (
                      <button
                        key={p.pitcher || p.player_name}
                        onMouseDown={e => { e.preventDefault(); selectPlayer(field.id, p) }}
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
        )

      case 'season':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{field.label}</label>
            <select
              value={values[field.id] || 2025}
              onChange={e => updateValue(field.id, Number(e.target.value))}
              className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )

      case 'game':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">
              {field.label} {gamesLoading && <span className="text-emerald-400 ml-1">loading&hellip;</span>}
            </label>
            <select
              value={values[field.id] || ''}
              onChange={e => updateValue(field.id, Number(e.target.value))}
              disabled={games.length === 0}
              className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
            >
              <option value="">Select game&hellip;</option>
              {games.map((g: any) => (
                <option key={g.game_pk} value={g.game_pk}>
                  {g.game_date} vs {g.opponent}
                </option>
              ))}
            </select>
          </div>
        )

      case 'team':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{field.label}</label>
            <select
              value={values[field.id] || ''}
              onChange={e => updateValue(field.id, e.target.value)}
              className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">Select team&hellip;</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )

      case 'date-range':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{field.label}</label>
            <div className="flex gap-1">
              <input
                type="date"
                value={values[field.id]?.from || ''}
                onChange={e => updateValue(field.id, { ...values[field.id], from: e.target.value })}
                className="flex-1 h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
              />
              <input
                type="date"
                value={values[field.id]?.to || ''}
                onChange={e => updateValue(field.id, { ...values[field.id], to: e.target.value })}
                className="flex-1 h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        )

      case 'metric':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{field.label}</label>
            <select
              value={values[field.id] || ''}
              onChange={e => updateValue(field.id, e.target.value)}
              className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">Select metric&hellip;</option>
              {SCENE_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        )

      case 'pitch-type':
        return (
          <div key={field.id}>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{field.label}</label>
            <select
              value={values[field.id] || ''}
              onChange={e => updateValue(field.id, e.target.value)}
              className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
            >
              {PITCH_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
            </select>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{template.name}</h3>
        <button
          onClick={handleApply}
          disabled={loading}
          className="text-[10px] px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40 transition"
        >
          {loading ? 'Loading\u2026' : 'Apply'}
        </button>
      </div>

      {template.description && (
        <p className="text-[10px] text-zinc-600 leading-relaxed">{template.description}</p>
      )}

      {template.input_fields.map(field => renderField(field))}
    </div>
  )
}
