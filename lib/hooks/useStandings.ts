'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import type { Division } from '@/components/standings/StandingsTypes'

const AL_ORDER = ['AL East','AL Central','AL West']
const NL_ORDER = ['NL East','NL Central','NL West']

export function useStandings() {
  const [season, setSeason] = useState(new Date().getFullYear())
  const [view, setView] = useState<'division'|'league'|'wildcard'>('division')
  const [standingsType, setStandingsType] = useState<'regular'|'spring'>('regular')

  const years = Array.from({length: new Date().getFullYear() - 2014}, (_, i) => new Date().getFullYear() - i)

  const { data: divisions = [], isLoading: standingsLoading } = useQuery({
    queryKey: queryKeys.standings(season, standingsType),
    queryFn: async () => {
      const typeParam = standingsType === 'spring' ? '&type=spring' : ''
      const res = await fetch(`/api/standings?season=${season}${typeParam}`)
      const d = await res.json()
      return (d.divisions || []) as Division[]
    },
    staleTime: season < new Date().getFullYear() ? Infinity : 5 * 60 * 1000,
  })

  function getDivisions(league: string) {
    const order = league === 'AL' ? AL_ORDER : NL_ORDER
    return order.map(name => {
      return divisions.find(d => d.league === league && (d.divisionAbbrev === name || d.division === name)) || null
    }).filter(Boolean) as Division[]
  }

  function getWildCard(league: string) {
    const leagueDivs = divisions.filter(d => d.league === league)
    const allTeams = leagueDivs.flatMap(d => d.teams)
    const divLeaders = leagueDivs.map(d => d.teams[0]?.abbrev).filter(Boolean)
    return allTeams.filter(t => !divLeaders.includes(t.abbrev)).sort((a, b) => b.w - a.w || a.l - b.l)
  }

  return {
    divisions, standingsLoading, season, setSeason, view, setView,
    standingsType, setStandingsType, years, getDivisions, getWildCard,
  }
}
