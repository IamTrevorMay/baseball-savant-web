'use client'
import { useRouter } from 'next/navigation'
import { TEMPLATE_REGISTRY, TemplateEntry } from '@/components/visualize/TemplateRegistry'

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Visualize</h1>
        <p className="text-sm text-zinc-500 mt-1">Interactive pitch visualization toolkit</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Search a Player card */}
        <button
          onClick={() => router.push('/visualize/search')}
          className="
            group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
            hover:border-cyan-600/50 hover:bg-zinc-800/60 transition
            flex flex-col gap-2
          "
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-100 group-hover:text-cyan-300 transition leading-snug">
              Search a Player
            </span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
              Browse
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">Search for a pitcher to browse all available visualization templates and create custom graphics.</p>
          <div className="mt-auto pt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              All Templates
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-cyan-500/60 transition">
              Open &rarr;
            </span>
          </div>
        </button>

        {/* Scene Composer card */}
        <button
          onClick={() => router.push('/visualize/scene-composer')}
          className="
            group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
            hover:border-emerald-600/50 hover:bg-zinc-800/60 transition
            flex flex-col gap-2
          "
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-300 transition leading-snug">
              Scene Composer
            </span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              New
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">Compose broadcast-quality stat graphics with drag-and-drop elements. Export PNG or JSON for After Effects.</p>
          <div className="mt-auto pt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              Multi-element
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-emerald-500/60 transition">
              Open &rarr;
            </span>
          </div>
        </button>

        {/* Template Builder card */}
        <button
          onClick={() => router.push('/visualize/template-builder')}
          className="
            group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
            hover:border-emerald-600/50 hover:bg-zinc-800/60 transition
            flex flex-col gap-2
          "
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-300 transition leading-snug">
              Template Builder
            </span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              New
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">Design custom data-driven templates with visual binding. Create leaderboards, outing cards, and more.</p>
          <div className="mt-auto pt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              WYSIWYG
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-emerald-500/60 transition">
              Open &rarr;
            </span>
          </div>
        </button>

        {/* Pitch Lab card */}
        <button
          onClick={() => router.push('/visualize/pitch-lab')}
          className="
            group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
            hover:border-orange-600/50 hover:bg-zinc-800/60 transition
            flex flex-col gap-2
          "
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-100 group-hover:text-orange-300 transition leading-snug">
              Pitch Lab
            </span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-orange-500/15 text-orange-400 border border-orange-500/20">
              3D
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">3D pitch delivery and ball flight with arm model, annotations, and MP4 export.</p>
          <div className="mt-auto pt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              Three.js
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-orange-500/60 transition">
              Open &rarr;
            </span>
          </div>
        </button>

        {/* No-data-required templates */}
        {TEMPLATE_REGISTRY.filter(e => e.requiresData === false).map(entry => (
          <TemplateCard
            key={entry.slug}
            entry={entry}
            onSelect={() => router.push(`/visualize/${entry.slug}`)}
          />
        ))}
      </div>
    </div>
  )
}
