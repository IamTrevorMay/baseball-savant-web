'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PlayerPicker from '@/components/visualize/PlayerPicker'
import { TEMPLATE_REGISTRY, TemplateEntry } from '@/components/visualize/TemplateRegistry'

interface SelectedPlayer {
  id: number
  name: string
}

function TemplateCard({ entry, onSelect }: { entry: TemplateEntry; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="
        group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
        hover:border-cyan-600/50 hover:bg-zinc-800/60 transition
        flex flex-col gap-2
      "
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-100 group-hover:text-cyan-300 transition leading-snug">
          {entry.name}
        </span>
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
      <p className="text-xs text-zinc-500 leading-relaxed">{entry.description}</p>
      <div className="mt-auto pt-1 flex items-center gap-1.5">
        {entry.isCanvas && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
            Canvas
          </span>
        )}
        <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-cyan-500/60 transition">
          Open &rarr;
        </span>
      </div>
    </button>
  )
}

export default function VisualizePage() {
  const router = useRouter()
  const [selected, setSelected] = useState<SelectedPlayer | null>(null)

  function handleSelect(id: number, name: string) {
    setSelected({ id, name })
  }

  function handleTemplateSelect(entry: TemplateEntry) {
    if (!selected) return
    router.push(`/visualize/${entry.slug}?playerId=${selected.id}&playerName=${encodeURIComponent(selected.name)}`)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Visualize</h1>
        <p className="text-sm text-zinc-500 mt-1">Interactive pitch visualization toolkit</p>
      </div>

      {/* Player Search */}
      <div className="mb-8 max-w-sm">
        <label className="block text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
          Select Player
        </label>
        <PlayerPicker label="Search for a pitcher..." onSelect={handleSelect} />
        {selected && (
          <p className="mt-2 text-xs text-cyan-400/80">
            Selected: <span className="font-medium text-cyan-300">{selected.name}</span>
          </p>
        )}
      </div>

      {/* Template Grid or Empty State */}
      {selected ? (
        <>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Choose a Template
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATE_REGISTRY.map(entry => (
              <TemplateCard
                key={entry.slug}
                entry={entry}
                onSelect={() => handleTemplateSelect(entry)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-cyan-500/10 text-cyan-400/60 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <p className="text-zinc-400 text-sm font-medium mb-1">Search for a player to get started</p>
          <p className="text-zinc-600 text-xs max-w-xs">
            Select a pitcher above to browse the available visualization templates
          </p>
        </div>
      )}
    </div>
  )
}
