'use client'

import { useDevice } from '@/lib/hooks/useDeviceContext'

export default function JobAssignmentsPage() {
  const { isMobile, isLoading } = useDevice()
  if (isLoading) return null

  return (
    <div className={`${isMobile ? 'px-4 py-6' : 'max-w-[1000px] mx-auto px-6 py-10'}`}>
      <div className="flex flex-col items-center justify-center text-center py-20">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-zinc-700 mb-4">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
        <h1 className="text-xl font-semibold text-zinc-200 mb-2">Job Assignments</h1>
        <p className="text-sm text-zinc-500 max-w-sm">
          Assign and track work across team members. Task delegation, role-based assignments, and workload tracking. Coming soon.
        </p>
      </div>
    </div>
  )
}
