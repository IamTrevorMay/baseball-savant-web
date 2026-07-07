import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchGamePlayIds } from '@/lib/pitchVideos'

/**
 * Internal video redirect for the Research UI (PitchLogTab play buttons).
 *
 * Archive-first: if the clip is in the pitch video archive (pitch_videos
 * status=downloaded), redirect to the Mayday Cloud stream. Otherwise resolve
 * the play_id (index row → live game feed), queue the pitch for the download
 * worker, and fall back to the Savant sporty-videos page.
 *
 * External consumers should use /api/pitch-video (Bearer-key auth, search +
 * JSON) instead — see docs/pitch-video-api.md.
 */

const MAYDAY_API = process.env.MAYDAY_CLOUD_API_URL || 'https://cloud-api.maydaystudio.net'
const MAYDAY_TOKEN = process.env.MAYDAY_PITCH_VIDEO_TOKEN || ''

export async function GET(req: NextRequest) {
  const gamePk = req.nextUrl.searchParams.get('game_pk')
  const ab = req.nextUrl.searchParams.get('ab')
  const pitch = req.nextUrl.searchParams.get('pitch')

  if (!gamePk || !ab || !pitch) {
    return NextResponse.json({ error: 'Missing game_pk, ab, or pitch' }, { status: 400 })
  }

  const gamePkNum = parseInt(gamePk)
  const abNum = parseInt(ab)
  const pitchNum = parseInt(pitch)
  if (isNaN(gamePkNum) || isNaN(abNum) || isNaN(pitchNum)) {
    return NextResponse.json({ error: 'Invalid game_pk, ab, or pitch' }, { status: 400 })
  }

  try {
    // Archive first
    const { data: rows } = await supabaseAdmin
      .from('pitch_videos')
      .select('play_id, status, file_path')
      .eq('game_pk', gamePkNum)
      .eq('at_bat_number', abNum)
      .eq('pitch_number', pitchNum)
      .limit(1)
    const indexed = rows?.[0]

    if (indexed?.status === 'downloaded' && indexed.file_path && MAYDAY_TOKEN) {
      return NextResponse.redirect(
        `${MAYDAY_API}/api/nas/stream?path=${encodeURIComponent(indexed.file_path)}&token=${MAYDAY_TOKEN}`
      )
    }

    let playId: string | null = indexed?.play_id ?? null

    // Not indexed — resolve live and queue for the download worker
    if (!playId) {
      const playIds = await fetchGamePlayIds(gamePkNum)
      playId = playIds.get(`${abNum}|${pitchNum}`) ?? null
      if (!playId) {
        return NextResponse.json({ error: 'Pitch not found in game feed' }, { status: 404 })
      }
      await supabaseAdmin
        .from('pitch_videos')
        .upsert(
          [{ game_pk: gamePkNum, at_bat_number: abNum, pitch_number: pitchNum, play_id: playId, status: 'pending' }],
          { onConflict: 'game_pk,at_bat_number,pitch_number', ignoreDuplicates: true }
        )
        .then(() => {}, () => {})
    }

    return NextResponse.redirect(
      `https://baseballsavant.mlb.com/sporty-videos?playId=${playId}`
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
