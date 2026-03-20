'use client'
import { useRouter } from 'next/navigation'

export default function DesignPage() {
  const router = useRouter()

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Design</h1>
        <p className="text-sm text-zinc-500 mt-1">Build broadcast-quality graphics, templates, and report cards</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Asset Designer card */}
        <button
          onClick={() => router.push('/design/asset-designer')}
          className="
            group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
            hover:border-purple-600/50 hover:bg-zinc-800/60 transition
            flex flex-col gap-2
          "
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-100 group-hover:text-purple-300 transition leading-snug">
              Asset Designer
            </span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-purple-500/15 text-purple-400 border border-purple-500/20">
              Design
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">Design logos, badges, lower thirds, and custom graphics. Push to Scene Composer or Template Builder.</p>
          <div className="mt-auto pt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              Canvas
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-purple-500/60 transition">
              Open &rarr;
            </span>
          </div>
        </button>

        {/* Scene Composer card */}
        <button
          onClick={() => router.push('/design/scene-composer')}
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

        {/* Report Cards card */}
        <button
          onClick={() => router.push('/design/report-cards')}
          className="
            group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5
            hover:border-amber-600/50 hover:bg-zinc-800/60 transition
            flex flex-col gap-2
          "
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-100 group-hover:text-amber-300 transition leading-snug">
              Report Cards
            </span>
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/20">
              New
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">Build data-driven report card templates. Auto-populate with player/game data and export as PNG or PDF.</p>
          <div className="mt-auto pt-1 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500">
              Canvas
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-amber-500/60 transition">
              Open &rarr;
            </span>
          </div>
        </button>

        {/* Template Builder card */}
        <button
          onClick={() => router.push('/design/template-builder')}
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
      </div>
    </div>
  )
}
