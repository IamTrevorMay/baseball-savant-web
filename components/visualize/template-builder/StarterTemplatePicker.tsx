'use client'

import React from 'react'
import { STARTER_TEMPLATES, type StarterTemplate } from '@/lib/starterTemplates'
import type { GlobalFilterType } from '@/lib/sceneTypes'

interface Props {
  onSelect: (template: StarterTemplate) => void
  onBlank: () => void
  onClose: () => void
}

const FILTER_LABELS: Record<GlobalFilterType, string> = {
  'single-player': 'Single Player',
  team: 'Team',
  leaderboard: 'Leaderboard',
  'live-game': 'Live Game',
  matchup: 'Matchup',
  'depth-chart': 'Depth Chart',
  'bullpen-depth-chart': 'Depth Chart',
}

const BADGE_COLORS: Record<GlobalFilterType, string> = {
  'single-player': 'bg-emerald-500/20 text-emerald-400',
  team: 'bg-sky-500/20 text-sky-400',
  leaderboard: 'bg-amber-500/20 text-amber-400',
  'live-game': 'bg-rose-500/20 text-rose-400',
  matchup: 'bg-violet-500/20 text-violet-400',
  'depth-chart': 'bg-cyan-500/20 text-cyan-400',
  'bullpen-depth-chart': 'bg-cyan-500/20 text-cyan-400',
}

/* Group templates by filter type, preserving order */
function grouped(): { label: string; type: GlobalFilterType; templates: StarterTemplate[] }[] {
  const order: GlobalFilterType[] = ['single-player', 'leaderboard', 'team', 'depth-chart', 'live-game', 'matchup']
  const map = new Map<GlobalFilterType, StarterTemplate[]>()
  for (const t of STARTER_TEMPLATES) {
    // Group bullpen under depth-chart heading
    const group = t.filterType === 'bullpen-depth-chart' ? 'depth-chart' as GlobalFilterType : t.filterType
    if (!map.has(group)) map.set(group, [])
    map.get(group)!.push(t)
  }
  return order
    .filter((ft) => map.has(ft))
    .map((ft) => ({ label: FILTER_LABELS[ft], type: ft, templates: map.get(ft)! }))
}

export default function StarterTemplatePicker({ onSelect, onBlank, onClose }: Props) {
  const groups = grouped()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Choose a Starting Point</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Blank canvas option */}
        <button
          onClick={onBlank}
          className="w-full mb-6 rounded-xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 bg-zinc-800/40 hover:bg-zinc-800 transition-all p-5 text-left group"
        >
          <span className="text-white font-medium group-hover:text-emerald-400 transition-colors">
            Blank Canvas
          </span>
          <span className="block text-sm text-zinc-500 mt-1">
            Start from scratch with an empty 1920&times;1080 canvas.
          </span>
        </button>

        {/* Grouped templates */}
        {groups.map((g) => (
          <div key={g.type} className="mb-6">
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">
              {g.label}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {g.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className="rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 hover:border-emerald-500/40 transition-all p-4 text-left group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">
                      {t.name}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${BADGE_COLORS[t.filterType]}`}
                    >
                      {FILTER_LABELS[t.filterType]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{t.description}</p>
                  {(t.canvasWidth !== 1920 || t.canvasHeight !== 1080) && (
                    <p className="text-[10px] text-zinc-600 mt-2">
                      {t.canvasWidth}&times;{t.canvasHeight}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
