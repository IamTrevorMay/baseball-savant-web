export default function ModelsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
      <div className="w-16 h-16 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11h3a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V20H5v-1.6A4 4 0 0 1 3 15a4 4 0 0 1 4-4h3V9.4A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Triton Models</h1>
      <p className="text-zinc-500 max-w-md">
        Event modeling and probability engines for tunneling, sequencing, and more. Coming soon.
      </p>
    </div>
  )
}
