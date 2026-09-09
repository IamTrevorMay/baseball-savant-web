/**
 * Placeholder body for Compete pages that exist in the nav but aren't built yet.
 * Replace the whole page — not this component — when the real screen lands.
 */
export default function ComingSoon({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-white mb-6">{title}</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-600 flex items-center justify-center mx-auto mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
          </svg>
        </div>
        <p className="text-sm text-zinc-500">Coming soon</p>
        {blurb && <p className="text-[10px] text-zinc-600 mt-1">{blurb}</p>}
      </div>
    </div>
  )
}
