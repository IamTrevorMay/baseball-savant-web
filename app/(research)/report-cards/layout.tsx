import ResearchNav from '@/components/ResearchNav'

// Report Cards moved here from the Design app (2026-09-09) — it's a Research
// Media tool now, so the standard research gate and nav apply instead of the
// Design app's 'design' tool permission.
export default function ReportCardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/report-cards" />
      {children}
    </div>
  )
}
