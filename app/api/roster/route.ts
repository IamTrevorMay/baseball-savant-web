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
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster/active?season=2025`,
      { next: { revalidate: 3600 } }
    )
    const data = await res.json()
    const roster = (data.roster || [])
      .filter((p: any) => p.person && p.position)
      .map((p: any) => ({
        id: p.person.id,
        name: p.person.fullName,
        position: p.position.abbreviation,
        jerseyNumber: p.jerseyNumber,
      }))
      .sort((a: any, b: any) => {
        const posOrder: Record<string,number> = { SP: 1, RP: 2, C: 3, '1B': 4, '2B': 5, '3B': 6, SS: 7, LF: 8, CF: 9, RF: 10, DH: 11 }
        return (posOrder[a.position] || 99) - (posOrder[b.position] || 99)
      })

    return NextResponse.json({ roster })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
