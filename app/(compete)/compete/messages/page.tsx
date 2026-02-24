export default function MessagesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
      <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400/50 flex items-center justify-center mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Messages</h1>
      <p className="text-zinc-500 text-sm">Coming Soon</p>
    </div>
  )
}
