import { NextRequest, NextResponse } from 'next/server'

const TEAM_IDS: Record<string, number> = {
  AZ:109,ATL:144,BAL:110,BOS:111,CHC:112,CWS:145,CIN:113,CLE:114,COL:115,DET:116,
  HOU:117,KC:118,LAA:108,LAD:119,MIA:146,MIL:158,MIN:142,NYM:121,NYY:147,OAK:133,
  PHI:143,PIT:134,SD:135,SF:137,SEA:136,STL:138,TB:139,TEX:140,TOR:141,WSH:120,
}

export async function GET(req: NextRequest) {
  const team = req.nextUrl.searchParams.get('team') || ''
  const teamId = TEAM_IDS[team.toUpperCase()]
  if (!teamId) return NextResponse.json({ error: 'Unknown team' }, { status: 400 })

  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster/depthChart`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()

    const posOrder: Record<string, number> = {
      SP: 1, RP: 2, CL: 3, C: 4, '1B': 5, '2B': 6, '3B': 7, SS: 8,
      LF: 9, CF: 10, RF: 11, DH: 12, UTIL: 13,
    }

    const depthChart: Record<string, { id: number; name: string; jerseyNumber: string }[]> = {}

    for (const entry of data.roster || []) {
      if (!entry.person || !entry.position) continue
      const pos = entry.position.abbreviation
      if (!depthChart[pos]) depthChart[pos] = []
      depthChart[pos].push({
        id: entry.person.id,
        name: entry.person.fullName,
        jerseyNumber: entry.jerseyNumber || '',
      })
    }

    // Sort positions by conventional order
    const sorted = Object.entries(depthChart)
      .sort(([a], [b]) => (posOrder[a] || 99) - (posOrder[b] || 99))
      .reduce<Record<string, typeof depthChart[string]>>((acc, [pos, players]) => {
        acc[pos] = players
        return acc
      }, {})

    return NextResponse.json({ depthChart: sorted })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
