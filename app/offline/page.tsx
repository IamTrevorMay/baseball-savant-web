export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="font-[family-name:var(--font-bebas)] text-4xl uppercase text-orange-500 tracking-widest mb-2">
          Offline
        </h1>
        <p className="text-sm text-zinc-500">
          You&apos;re offline. Check your connection and try again.
        </p>
      </div>
    </div>
  )
}
