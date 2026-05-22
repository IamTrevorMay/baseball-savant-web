'use client'

import { useDevice } from '@/lib/hooks/useDeviceContext'

export default function AssessmentsPage() {
  const { isMobile, isLoading } = useDevice()
  if (isLoading) return null

  return (
    <div className={`${isMobile ? 'px-4 py-6' : 'max-w-[1000px] mx-auto px-6 py-10'}`}>
      <div className="flex flex-col items-center justify-center text-center py-20">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-zinc-700 mb-4">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
        </svg>
        <h1 className="text-xl font-semibold text-zinc-200 mb-2">Assessments</h1>
        <p className="text-sm text-zinc-500 max-w-sm">
          Player evaluations, scouting assessments, and performance reviews. Coming soon.
        </p>
      </div>
    </div>
  )
}
