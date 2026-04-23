'use client'

import { TemplateConfig } from '@/lib/sceneTypes'

const MLB_TEAMS = [
  'ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET',
  'HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK',
  'PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH',
]

const YEARS = Array.from({ length: 12 }, (_, i) => 2026 - i)

interface Props {
  config: TemplateConfig
  onUpdateConfig: (updates: Partial<TemplateConfig>) => void
  onRefresh: () => void
  loading: boolean
}

export default function DepthChartConfigPanel({ config, onUpdateConfig, onRefresh, loading }: Props) {
  const year = config.dateRange.type === 'season' ? config.dateRange.year : 2025

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Depth Chart</h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-[10px] font-medium px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div>
        <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Team</label>
        <select
          className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-emerald-500"
          value={config.teamAbbrev || 'NYY'}
          onChange={(e) => onUpdateConfig({ teamAbbrev: e.target.value })}
        >
          {MLB_TEAMS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Season</label>
        <select
          className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-emerald-500"
          value={year}
          onChange={(e) => onUpdateConfig({ dateRange: { type: 'season', year: +e.target.value } })}
        >
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
