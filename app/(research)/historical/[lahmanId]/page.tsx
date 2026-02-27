'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ResearchNav from '@/components/ResearchNav'
import PlayerBadges from '@/components/PlayerBadges'
import HistoricalOverviewTab from '@/components/dashboard/HistoricalOverviewTab'
import type { LahmanPlayerData } from '@/lib/lahman-stats'
import { modernTeamCode } from '@/lib/lahman-stats'

const TEAM_COLORS: Record<string, string> = {
  ARI:'#A71930',ATH:'#003831',ATL:'#CE1141',BAL:'#DF4601',BOS:'#BD3039',
  CHC:'#0E3386',CIN:'#C6011F',CLE:'#00385D',COL:'#333366',CWS:'#27251F',
  DET:'#0C2340',HOU:'#002D62',KC:'#004687',LAA:'#BA0021',LAD:'#005A9C',
  MIA:'#00A3E0',MIL:'#FFC52F',MIN:'#002B5C',NYM:'#002D72',NYY:'#003087',
  OAK:'#003831',PHI:'#E81828',PIT:'#27251F',SD:'#2F241D',SEA:'#0C2C56',
  SF:'#FD5A1E',STL:'#C41E3A',TB:'#092C5C',TEX:'#003278',TOR:'#134A8E',
  WSH:'#AB0003',
}

export default function HistoricalPlayerPage() {
  const params = useParams()
  const router = useRouter()
  const lahmanId = params.lahmanId as string

  const [data, setData] = useState<LahmanPlayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadPlayer() }, [lahmanId])

  async function loadPlayer() {
    setLoading(true)
    try {
      const res = await fetch(`/api/lahman/player?lahman_id=${lahmanId}`)
      if (res.ok) {
        const d = await res.json()
        if (d.player) {
          // If player has an MLB ID with Statcast data, redirect to modern page
          if (d.player.mlb_id) {
            const isPitcher = d.pitching.length > d.batting.length
            router.replace(isPitcher ? `/player/${d.player.mlb_id}` : `/hitter/${d.player.mlb_id}`)
            return
          }
          setData(d)
        }
      }
    } catch (e) {
      console.error('Failed to load historical player:', e)
    }
    setLoading(false)
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    try {
      const res = await fetch(`/api/lahman/search?q=${encodeURIComponent(value.trim())}&limit=6`)
      const d = await res.json()
      setSearchResults(d.results || [])
      setShowSearch(true)
    } catch {}
  }

  if (loading || !data) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-500 text-sm">Loading historical data...</p>
      </div>
    </div>
  )

  const p = data.player
  const fullName = `${p.name_last}, ${p.name_first}`
  const lastTeam = data.batting.length > 0
    ? modernTeamCode(data.batting[0].team_id)
    : data.pitching.length > 0
      ? modernTeamCode(data.pitching[0].team_id)
      : ''
  const years = `${p.debut || p.birth_year || '?'} — ${p.final_game || (p.death_year ? `d.${p.death_year}` : '?')}`

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/leaders">
        <div className="relative ml-4 hidden sm:block">
          <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setShowSearch(true)}
            placeholder="Search player..."
            className="w-64 pl-3 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
              {searchResults.map((r: any) => (
                <div key={r.lahman_id}
                  onClick={() => {
                    if (r.has_statcast && r.mlb_id) router.push(`/player/${r.mlb_id}`)
                    else router.push(`/historical/${r.lahman_id}`)
                    setShowSearch(false); setSearchQuery('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer flex justify-between">
                  <span className="text-white">{r.name_last}, {r.name_first}</span>
                  <span className="text-zinc-500 text-xs">{r.debut?.slice(0,4) || r.birth_year || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ResearchNav>

      {/* Player Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
            style={{ backgroundColor: TEAM_COLORS[lastTeam] || '#52525b' }}>
            {lastTeam || '?'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{fullName}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mt-1">
              <span>{years}</span>
              {p.bats && <span>Bats: {p.bats}</span>}
              {p.throws && <span>Throws: {p.throws}</span>}
              {p.birth_country && <span>{p.birth_city ? `${p.birth_city}, ` : ''}{p.birth_state ? `${p.birth_state}, ` : ''}{p.birth_country}</span>}
            </div>
            <PlayerBadges awards={data.awards} allstars={data.allstars} hof={data.hof} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <HistoricalOverviewTab batting={data.batting} pitching={data.pitching} />
        </div>
      </div>
    </div>
  )
}
