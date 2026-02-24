export default function CompetePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V8a2 2 0 0 0-2-2H6v6.5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V6h-2a2 2 0 0 0-2 2v14" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Triton Compete</h1>
      <p className="text-zinc-500 max-w-md">
        Player portal for accessing data and communicating with the coaching team. Coming soon.
      </p>
    </div>
  )
}
