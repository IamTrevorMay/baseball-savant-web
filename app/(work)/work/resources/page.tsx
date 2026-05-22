'use client'

import { useDevice } from '@/lib/hooks/useDeviceContext'

export default function ResourcesPage() {
  const { isMobile, isLoading } = useDevice()
  if (isLoading) return null

  return (
    <div className={`${isMobile ? 'px-4 py-6' : 'max-w-[1000px] mx-auto px-6 py-10'}`}>
      <div className="flex flex-col items-center justify-center text-center py-20">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-zinc-700 mb-4">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <h1 className="text-xl font-semibold text-zinc-200 mb-2">Resources</h1>
        <p className="text-sm text-zinc-500 max-w-sm">
          Shared files, documents, and reference materials for the team. Coming soon.
        </p>
      </div>
    </div>
  )
}
