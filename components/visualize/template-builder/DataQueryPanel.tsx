'use client'

import { DataQueryConfig, TemplateInputField } from '@/lib/sceneTypes'

const DATA_SOURCE_TYPES: { value: DataQueryConfig['type']; label: string; endpoint: string; description: string }[] = [
  { value: 'leaderboard', label: 'Leaderboard', endpoint: '/api/scene-stats', description: 'Top N players by metric' },
  { value: 'outing', label: 'Pitcher Outing', endpoint: '/api/pitcher-outing', description: 'Single game outing data' },
  { value: 'starter-card', label: 'Starter Card', endpoint: '/api/starter-card', description: 'Detailed starter breakdown' },
  { value: 'player-stats', label: 'Player Stats', endpoint: '/api/scene-stats', description: 'Individual player metric values' },
]

interface Props {
  config: DataQueryConfig | null
  inputFields: TemplateInputField[]
  onChange: (config: DataQueryConfig | null) => void
}

export default function DataQueryPanel({ config, inputFields, onChange }: Props) {
  const selectedType = config ? DATA_SOURCE_TYPES.find(d => d.value === config.type) : null

  function selectType(type: DataQueryConfig['type']) {
    const source = DATA_SOURCE_TYPES.find(d => d.value === type)!
    onChange({
      type,
      endpoint: source.endpoint,
      paramMapping: {},
    })
  }

  function clearDataSource() {
    onChange(null)
  }

  function updateParamMapping(paramKey: string, fieldId: string) {
    if (!config) return
    onChange({
      ...config,
      paramMapping: { ...config.paramMapping, [paramKey]: fieldId },
    })
  }

  // Suggested param keys based on data source type
  function getParamKeys(): string[] {
    if (!config) return []
    switch (config.type) {
      case 'leaderboard':
        return ['metric', 'playerType', 'gameYear', 'limit', 'sortDir', 'pitchType']
      case 'outing':
        return ['pitcherId', 'gamePk', 'season']
      case 'starter-card':
        return ['pitcherId', 'gamePk', 'season']
      case 'player-stats':
        return ['playerId', 'metrics', 'gameYear', 'pitchType']
      default:
        return []
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Data Source</label>
          {config && (
            <button
              onClick={clearDataSource}
              className="text-[10px] text-zinc-600 hover:text-red-400 transition"
            >
              Remove
            </button>
          )}
        </div>

        {!config ? (
          <div className="space-y-1.5">
            <p className="text-[10px] text-zinc-600 mb-2">Optional: connect a data source to auto-populate template values.</p>
            {DATA_SOURCE_TYPES.map(source => (
              <button
                key={source.value}
                onClick={() => selectType(source.value)}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/60 hover:border-cyan-600/40 hover:bg-zinc-800 transition group"
              >
                <div className="text-[11px] font-medium text-zinc-300 group-hover:text-white transition">{source.label}</div>
                <div className="text-[10px] text-zinc-600">{source.description}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="px-3 py-2 bg-cyan-900/10 border border-cyan-800/30 rounded-lg">
              <div className="text-[11px] font-medium text-cyan-300">{selectedType?.label}</div>
              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{config.endpoint}</div>
            </div>

            {/* Param Mapping */}
            <div>
              <label className="text-[11px] text-zinc-400 uppercase tracking-wider mb-2 block font-medium">
                Parameter Mapping
              </label>
              <p className="text-[10px] text-zinc-600 mb-2">Map API parameters to your input fields.</p>

              {inputFields.length === 0 ? (
                <p className="text-[10px] text-zinc-600 italic">Define input fields in the previous step first.</p>
              ) : (
                <div className="space-y-1.5">
                  {getParamKeys().map(paramKey => (
                    <div key={paramKey} className="flex items-center gap-2">
                      <code className="text-[10px] text-zinc-400 font-mono w-24 shrink-0 truncate">{paramKey}</code>
                      <span className="text-zinc-600 text-[10px]">{'\u2192'}</span>
                      <select
                        value={config.paramMapping[paramKey] || ''}
                        onChange={e => updateParamMapping(paramKey, e.target.value)}
                        className="flex-1 h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-cyan-500/50"
                      >
                        <option value="">-- none --</option>
                        {inputFields.map(f => (
                          <option key={f.id} value={f.id}>{f.label} ({f.type})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
