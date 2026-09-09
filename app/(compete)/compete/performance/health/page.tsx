'use client'

import { useState, useEffect, useCallback } from 'react'
import { WhoopCycleRow, WhoopSleepRow, WhoopWorkoutRow } from '@/lib/compete/whoop-types'
import { ScheduleEvent } from '@/lib/compete/schedule-types'
import WhoopConnect from '@/components/compete/whoop/WhoopConnect'
import OverviewTab from '@/components/compete/whoop/OverviewTab'
import DataTab from '@/components/compete/whoop/DataTab'
import GraphsTab from '@/components/compete/whoop/GraphsTab'

type RangeOption = 7 | 14 | 30 | 90
type ActiveTab = 'overview' | 'data' | 'graphs'

export default function WhoopPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [range, setRange] = useState<RangeOption>(30)
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [cycles, setCycles] = useState<WhoopCycleRow[]>([])
  const [sleep, setSleep] = useState<WhoopSleepRow[]>([])
  const [workouts, setWorkouts] = useState<WhoopWorkoutRow[]>([])
  const [todayEvents, setTodayEvents] = useState<ScheduleEvent[]>([])
  const [selectedGraph, setSelectedGraph] = useState('recovery')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)

  const fetchData = useCallback(async () => {
    const to = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - range * 86_400_000).toISOString().split('T')[0]

    const whoopRes = await fetch(`/api/compete/whoop/data?from=${from}&to=${to}&type=all`)
    const data = await whoopRes.json()
    setConnected(data.connected)
    setCycles(data.cycles || [])
    setSleep(data.sleep || [])
    setWorkouts(data.workouts || [])

    setLoading(false)
  }, [range])

  // Fetch schedule events whenever selectedDate changes
  const fetchSchedule = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/compete/schedule?from=${date}&to=${date}`)
      if (res.ok) {
        const data = await res.json()
        setTodayEvents(data.events || [])
      } else {
        setTodayEvents([])
      }
    } catch {
      setTodayEvents([])
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchSchedule(selectedDate) }, [selectedDate, fetchSchedule])

  // Auto-sync if data is stale (>1 hour since latest cycle)
  useEffect(() => {
    if (!connected || cycles.length === 0) return
    const latest = cycles[cycles.length - 1]
    const age = Date.now() - new Date(latest.created_at).getTime()
    if (age > 3_600_000) {
      handleSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/compete/whoop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 365 }),
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

  const todayCycle = cycles.find(c => c.cycle_date === selectedDate) || null
  const todaySleep = sleep.find(s => s.sleep_date === selectedDate) || null

  // Available dates from cycles for prev/next navigation
  const cycleDates = cycles.map(c => c.cycle_date).sort()

  function handlePrevDay() {
    const idx = cycleDates.indexOf(selectedDate)
    if (idx > 0) {
      setSelectedDate(cycleDates[idx - 1])
    } else if (idx === -1 && cycleDates.length > 0) {
      // selectedDate not in cycles — find the closest earlier date
      const earlier = cycleDates.filter(d => d < selectedDate)
      if (earlier.length > 0) setSelectedDate(earlier[earlier.length - 1])
    }
  }

  function handleNextDay() {
    const idx = cycleDates.indexOf(selectedDate)
    if (idx >= 0 && idx < cycleDates.length - 1) {
      setSelectedDate(cycleDates[idx + 1])
    } else if (idx === -1 && cycleDates.length > 0) {
      const later = cycleDates.filter(d => d > selectedDate)
      if (later.length > 0) setSelectedDate(later[0])
    }
  }

  const hasPrev = cycleDates.length > 0 && cycleDates[0] < selectedDate
  const hasNext = cycleDates.length > 0 && cycleDates[cycleDates.length - 1] > selectedDate

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Monitor</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Recovery, sleep & strain tracking</p>
          </div>
          {/* Tab toggle */}
          <div className="flex bg-zinc-800 rounded-lg p-0.5 ml-2">
            {(['overview', 'graphs', 'data'] as ActiveTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${
                  activeTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
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

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <OverviewTab
          cycles={cycles}
          sleep={sleep}
          workouts={workouts}
          todayCycle={todayCycle}
          todaySleep={todaySleep}
          todayEvents={todayEvents}
          selectedDate={selectedDate}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrevDay={handlePrevDay}
          onNextDay={handleNextDay}
          onGraphClick={(key) => { setSelectedGraph(key); setActiveTab('graphs') }}
        />
      ) : activeTab === 'graphs' ? (
        <GraphsTab
          cycles={cycles}
          sleep={sleep}
          selectedGraph={selectedGraph}
          onSelectGraph={setSelectedGraph}
        />
      ) : (
        <DataTab
          cycles={cycles}
          sleep={sleep}
          workouts={workouts}
        />
      )}
    </div>
  )
}
