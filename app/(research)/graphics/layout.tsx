import ResearchNav from '@/components/ResearchNav'

// Graphics (formerly Design's Imagine tool) lives inside Research now: the
// standard research gate from the (research) layout applies instead of the
// Design app's 'design' tool permission, and the Research nav sits on top.
export default function GraphicsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/graphics" />
      {children}
    </div>
  )
}
