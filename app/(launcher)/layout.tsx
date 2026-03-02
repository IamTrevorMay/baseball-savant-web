export default function LauncherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 pb-20 md:pb-0">
      {children}
    </div>
  )
}
