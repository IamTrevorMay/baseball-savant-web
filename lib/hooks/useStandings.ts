'use client'
import { useState, useEffect } from 'react'
import type { Division } from '@/components/standings/StandingsTypes'

const AL_ORDER = ['AL East','AL Central','AL West']
const NL_ORDER = ['NL East','NL Central','NL West']

export function useStandings() {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [standingsLoading, setStandingsLoading] = useState(true)
  const [season, setSeason] = useState(new Date().getFullYear())
  const [view, setView] = useState<'division'|'league'|'wildcard'>('division')
  const [standingsType, setStandingsType] = useState<'regular'|'spring'>('regular')

  const years = Array.from({length: new Date().getFullYear() - 2014}, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    setStandingsLoading(true)
    const typeParam = standingsType === 'spring' ? '&type=spring' : ''
    fetch(`/api/standings?season=${season}${typeParam}`)
      .then(r => r.json())
      .then(d => { if (d.divisions) setDivisions(d.divisions); setStandingsLoading(false) })
      .catch(() => setStandingsLoading(false))
  }, [season, standingsType])

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
