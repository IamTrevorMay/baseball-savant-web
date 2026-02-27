'use client'

import { useState, useEffect, useCallback } from 'react'
import { WhoopCycleRow, WhoopSleepRow, WhoopWorkoutRow } from '@/lib/compete/whoop-types'
import WhoopConnect from '@/components/compete/whoop/WhoopConnect'
import RecoveryCard from '@/components/compete/whoop/RecoveryCard'
import RecoveryTrend from '@/components/compete/whoop/RecoveryTrend'
import SleepCard from '@/components/compete/whoop/SleepCard'
import StrainCard from '@/components/compete/whoop/StrainCard'

type RangeOption = 7 | 14 | 30 | 90

export default function WhoopPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [range, setRange] = useState<RangeOption>(30)
  const [cycles, setCycles] = useState<WhoopCycleRow[]>([])
  const [sleep, setSleep] = useState<WhoopSleepRow[]>([])
  const [workouts, setWorkouts] = useState<WhoopWorkoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchData = useCallback(async () => {
    const to = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - range * 86_400_000).toISOString().split('T')[0]
    const res = await fetch(`/api/compete/whoop/data?from=${from}&to=${to}&type=all`)
    const data = await res.json()
    setConnected(data.connected)
    setCycles(data.cycles || [])
    setSleep(data.sleep || [])
    setWorkouts(data.workouts || [])
    setLoading(false)
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-sync if data is stale (>1 hour since latest cycle)
  useEffect(() => {
    if (!connected || cycles.length === 0) return
    const latest = cycles[cycles.length - 1]
    const age = Date.now() - new Date(latest.created_at).getTime()
    if (age > 3_600_000) {
      handleSync()
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/compete/whoop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: range }),
      })
      await fetchData()
    } catch {
      // ignore
    }
    setSyncing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="max-w-lg mx-auto px-6 py-16">
        <WhoopConnect
          connected={false}
          onConnected={() => { setConnected(true); fetchData() }}
        />
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const todayCycle = cycles.find(c => c.cycle_date === today) || cycles[cycles.length - 1] || null

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">WHOOP</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Recovery, sleep & strain tracking</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Range selector */}
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            {([7, 14, 30, 90] as RangeOption[]).map(d => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  range === d ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-white transition disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Refresh'}
          </button>

          <WhoopConnect
            connected={true}
            onDisconnected={() => {
              setConnected(false)
              setCycles([])
              setSleep([])
              setWorkouts([])
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {/* Today's metrics */}
        <RecoveryCard cycle={todayCycle} />

        {/* Recovery trend chart */}
        <RecoveryTrend cycles={cycles} />

        {/* Sleep & Strain side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SleepCard sleepData={sleep} />
          <StrainCard cycles={cycles} workouts={workouts} />
        </div>
      </div>
    </div>
  )
}
