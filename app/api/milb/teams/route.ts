import { NextResponse } from 'next/server'

// Triple-A clubs for MiLB team reports. milb_pitches holds AAA only (2023+),
// so lower levels are left out — their rosters would render empty reports.
export async function GET() {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams?sportIds=11&season=${new Date().getFullYear()}`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return NextResponse.json({ error: `MLB API ${res.status}` }, { status: 502 })
    const data = await res.json()
    const teams = (data.teams || [])
      .map((t: any) => ({
        id: t.id,
        abbreviation: t.abbreviation,
        name: t.name,
        parentOrg: t.parentOrgName || null,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({ teams })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
