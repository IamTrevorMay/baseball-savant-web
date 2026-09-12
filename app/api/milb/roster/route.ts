import { NextRequest, NextResponse } from 'next/server'

// Active roster for one MiLB club (ids from /api/milb/teams). Same row shape as /api/roster.
export async function GET(req: NextRequest) {
  const teamId = parseInt(req.nextUrl.searchParams.get('teamId') || '')
  if (isNaN(teamId)) return NextResponse.json({ error: 'Invalid teamId' }, { status: 400 })

  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster/active?season=${new Date().getFullYear()}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return NextResponse.json({ error: `MLB API ${res.status}` }, { status: 502 })
    const data = await res.json()
    const roster = (data.roster || [])
      .filter((p: any) => p.person && p.position)
      .map((p: any) => ({
        id: p.person.id,
        name: p.person.fullName,
        position: p.position.abbreviation,
        jerseyNumber: p.jerseyNumber,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({ roster })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
