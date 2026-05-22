'use client'

import { useState, useCallback } from 'react'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkDashboard from '@/components/mobile/work/MobileWorkDashboard'
import SprintPanel from '@/components/work/SprintPanel'
import WorkBoard from '@/components/work/WorkBoard'

export default function WorkDashboardPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [boardVersion, setBoardVersion] = useState(0)

  const handleBoardChange = useCallback(() => {
    setBoardVersion(v => v + 1)
  }, [])

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkDashboard />

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <SprintPanel boardVersion={boardVersion} />
      <WorkBoard onBoardChange={handleBoardChange} sprintVersion={boardVersion} />
    </div>
  )
}
