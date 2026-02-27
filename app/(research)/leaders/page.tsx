'use client'
import { useState, useEffect, useCallback } from 'react'
import ResearchNav from '@/components/ResearchNav'
import LeaderboardControls from '@/components/leaderboards/LeaderboardControls'
import LeaderboardTable from '@/components/leaderboards/LeaderboardTable'

export default function LeadersPage() {
  const [type, setType] = useState<'career' | 'season'>('career')
  const [category, setCategory] = useState<'batting' | 'pitching'>('batting')
  const [stat, setStat] = useState('hr')
  const [minPA, setMinPA] = useState(3000)
  const [minIP, setMinIP] = useState(1000)
  const [startYear, setStartYear] = useState('')
  const [endYear, setEndYear] = useState('')
  const [league, setLeague] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [statLabel, setStatLabel] = useState('HR')

  // Adjust qualifiers when switching career/season
  useEffect(() => {
    if (type === 'season') {
      if (category === 'batting') setMinPA(502)
      else setMinIP(162)
    } else {
      if (category === 'batting') setMinPA(3000)
      else setMinIP(1000)
    }
  }, [type, category])

  const fetchLeaders = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      stat, type, category, limit: '50',
      ...(category === 'batting' && minPA > 0 ? { minPA: String(minPA) } : {}),
      ...(category === 'pitching' && minIP > 0 ? { minIP: String(minIP) } : {}),
      ...(startYear ? { startYear } : {}),
      ...(endYear ? { endYear } : {}),
      ...(league ? { league } : {}),
    })
    try {
      const res = await fetch(`/api/lahman/leaderboards?${params}`)
      const data = await res.json()
      setRows(data.rows || [])
      setStatLabel(data.label || stat.toUpperCase())
    } catch (e) {
      console.error('Leaderboard fetch error:', e)
      setRows([])
    }
    setLoading(false)
  }, [stat, type, category, minPA, minIP, startYear, endYear, league])

  useEffect(() => {
    const timer = setTimeout(fetchLeaders, 400)
    return () => clearTimeout(timer)
  }, [fetchLeaders])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/leaders" />

      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">All-Time Leaders</h1>
          <p className="text-sm text-zinc-400 mt-1">Career and single-season leaderboards from the Lahman database (1871–present)</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
          <LeaderboardControls
            type={type} category={category} stat={stat}
            minPA={minPA} minIP={minIP}
            startYear={startYear} endYear={endYear} league={league}
            onTypeChange={setType} onCategoryChange={setCategory} onStatChange={setStat}
            onMinPAChange={setMinPA} onMinIPChange={setMinIP}
            onStartYearChange={setStartYear} onEndYearChange={setEndYear}
            onLeagueChange={setLeague}
          />
          <LeaderboardTable rows={rows} type={type} category={category} statLabel={statLabel} loading={loading} />
        </div>
      </div>
    </div>
  )
}
