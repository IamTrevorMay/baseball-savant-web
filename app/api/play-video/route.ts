import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const gamePk = req.nextUrl.searchParams.get('game_pk')
  const ab = req.nextUrl.searchParams.get('ab')
  const pitch = req.nextUrl.searchParams.get('pitch')

  if (!gamePk || !ab || !pitch) {
    return NextResponse.json({ error: 'Missing game_pk, ab, or pitch' }, { status: 400 })
  }

  const abNum = parseInt(ab)
  const pitchNum = parseInt(pitch)
  if (isNaN(abNum) || isNaN(pitchNum)) {
    return NextResponse.json({ error: 'Invalid ab or pitch' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://baseballsavant.mlb.com/gf?game_pk=${encodeURIComponent(gamePk)}`,
      { next: { revalidate: 3600 } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch game feed' }, { status: 502 })
    }

    const feed = await res.json()

    let playId: string | null = null
    for (const team of [feed.team_home, feed.team_away]) {
      if (!Array.isArray(team)) continue
      for (const pitch of team) {
        if (pitch.ab_number === abNum && pitch.pitch_number === pitchNum) {
          playId = pitch.play_id
          break
        }
      }
      if (playId) break
    }

    if (!playId) {
      return NextResponse.json({ error: 'Pitch not found in game feed' }, { status: 404 })
    }

    return NextResponse.redirect(
      `https://baseballsavant.mlb.com/sporty-videos?playId=${playId}`
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
