import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * Pitch video archive API — search and resolve archived Savant pitch clips.
 *
 * Auth: Authorization: Bearer <key>, checked against PITCH_VIDEO_API_KEYS
 * (comma-separated). Intended consumers: Mayday Studio, broadcast tools.
 *
 * Modes:
 *   Single resolve — ?play_id=<uuid>  OR  ?game_pk=&ab=&pitch=
 *   Search        — any combination of the filter params below; returns a
 *                   JSON list of pitch metadata + playable URLs.
 *
 * Every row carries:
 *   video_url  — Mayday Cloud stream URL (null unless status=downloaded)
 *   savant_url — Savant sporty-videos page (always present; fallback player)
 *   status     — pending | downloaded | failed | missing
 *
 * On-demand cache: a single-resolve miss for a pitch not yet indexed resolves
 * the play_id live from the Savant game feed, inserts a pending row (so the
 * download worker archives it), and returns the savant_url immediately.
 *
 * Full spec + examples: docs/pitch-video-api.md
 */

const MAYDAY_API = process.env.MAYDAY_CLOUD_API_URL || 'https://cloud-api.maydaystudio.net'
const MAYDAY_TOKEN = process.env.MAYDAY_PITCH_VIDEO_TOKEN || ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const WORD_RE = /^[a-z_]+$/
const PITCH_TYPE_RE = /^[A-Z]{1,3}$/
const TEAM_RE = /^[A-Z]{2,3}$/

const META_COLS = `p.game_pk, p.game_date, p.game_year, p.pitcher, p.player_name, p.batter,
  pl.name AS batter_name, p.stand, p.p_throws, p.pitch_type, p.pitch_name,
  p.release_speed, p.release_spin_rate, p.pfx_x, p.pfx_z, p.plate_x, p.plate_z, p.zone,
  p.events, p.description, p.balls, p.strikes, p.outs_when_up, p.inning, p.inning_topbot,
  p.home_team, p.away_team, p.launch_speed, p.launch_angle,
  p.at_bat_number, p.pitch_number,
  v.play_id, v.status, v.file_path`

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

function authorized(req: NextRequest): boolean {
  const keys = (process.env.PITCH_VIDEO_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)
  if (keys.length === 0) return false
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return token.length > 0 && keys.includes(token)
}

function toVideoRow(r: any) {
  const { file_path, ...rest } = r
  return {
    ...rest,
    video_url:
      r.status === 'downloaded' && file_path && MAYDAY_TOKEN
        ? `${MAYDAY_API}/api/nas/stream?path=${encodeURIComponent(file_path)}&token=${MAYDAY_TOKEN}`
        : null,
    savant_url: r.play_id
      ? `https://baseballsavant.mlb.com/sporty-videos?playId=${r.play_id}`
      : null,
  }
}

/** Resolve a play_id live from the Savant game feed (on-demand cache path). */
async function resolvePlayIdLive(gamePk: number, ab: number, pitch: number): Promise<string | null> {
  const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const feed = await res.json()
  for (const team of [feed.team_home, feed.team_away]) {
    if (!Array.isArray(team)) continue
    for (const p of team) {
      if (p.ab_number === ab && p.pitch_number === pitch && p.play_id && UUID_RE.test(p.play_id)) {
        return p.play_id
      }
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const intParam = (name: string): number | null => {
    const v = sp.get(name)
    if (v == null) return null
    const n = parseInt(v)
    return isNaN(n) ? NaN as any : n
  }
  const floatParam = (name: string): number | null => {
    const v = sp.get(name)
    if (v == null) return null
    const n = parseFloat(v)
    return isNaN(n) ? NaN as any : n
  }

  try {
    // ── Mode 1: single resolve ──
    const playId = sp.get('play_id')
    const gamePk = intParam('game_pk')
    const ab = intParam('ab')
    const pitch = intParam('pitch')

    if (playId || (gamePk != null && ab != null && pitch != null)) {
      let where: string
      if (playId) {
        if (!UUID_RE.test(playId)) return NextResponse.json({ error: 'Invalid play_id' }, { status: 400 })
        where = `v.play_id = '${playId}'`
      } else {
        if ([gamePk, ab, pitch].some(n => n == null || isNaN(n as number))) {
          return NextResponse.json({ error: 'Invalid game_pk/ab/pitch' }, { status: 400 })
        }
        where = `v.game_pk = ${gamePk} AND v.at_bat_number = ${ab} AND v.pitch_number = ${pitch}`
      }

      const { data, error } = await supabase.rpc('run_query', {
        query_text: `SELECT ${META_COLS} FROM pitch_videos v
          LEFT JOIN pitches p ON p.game_pk = v.game_pk
            AND p.at_bat_number = v.at_bat_number AND p.pitch_number = v.pitch_number
          LEFT JOIN players pl ON pl.id = p.batter
          WHERE ${where} LIMIT 1`,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      if (data && data.length > 0) {
        return NextResponse.json({ row: toVideoRow(data[0]) })
      }

      // On-demand cache: not indexed yet — resolve live, queue for the worker
      if (gamePk != null && !isNaN(gamePk) && ab != null && pitch != null) {
        const livePlayId = await resolvePlayIdLive(gamePk, ab as number, pitch as number)
        if (!livePlayId) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
        await supabase.from('pitch_videos').upsert(
          [{ game_pk: gamePk, at_bat_number: ab, pitch_number: pitch, play_id: livePlayId, status: 'pending' }],
          { onConflict: 'game_pk,at_bat_number,pitch_number', ignoreDuplicates: true }
        )
        return NextResponse.json({
          row: {
            game_pk: gamePk, at_bat_number: ab, pitch_number: pitch,
            play_id: livePlayId, status: 'pending', video_url: null,
            savant_url: `https://baseballsavant.mlb.com/sporty-videos?playId=${livePlayId}`,
          },
          queued: true,
        })
      }
      return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })
    }

    // ── Mode 2: search ──
    const conds: string[] = []

    const pitcher = intParam('pitcher')
    if (pitcher != null) { if (isNaN(pitcher)) return NextResponse.json({ error: 'Invalid pitcher' }, { status: 400 }); conds.push(`p.pitcher = ${pitcher}`) }
    const batter = intParam('batter')
    if (batter != null) { if (isNaN(batter)) return NextResponse.json({ error: 'Invalid batter' }, { status: 400 }); conds.push(`p.batter = ${batter}`) }
    const gameYear = intParam('game_year')
    if (gameYear != null) { if (isNaN(gameYear)) return NextResponse.json({ error: 'Invalid game_year' }, { status: 400 }); conds.push(`p.game_year = ${gameYear}`) }
    const inning = intParam('inning')
    if (inning != null) { if (isNaN(inning)) return NextResponse.json({ error: 'Invalid inning' }, { status: 400 }); conds.push(`p.inning = ${inning}`) }
    const balls = intParam('balls')
    if (balls != null) { if (isNaN(balls)) return NextResponse.json({ error: 'Invalid balls' }, { status: 400 }); conds.push(`p.balls = ${balls}`) }
    const strikes = intParam('strikes')
    if (strikes != null) { if (isNaN(strikes)) return NextResponse.json({ error: 'Invalid strikes' }, { status: 400 }); conds.push(`p.strikes = ${strikes}`) }
    const zone = intParam('zone')
    if (zone != null) { if (isNaN(zone)) return NextResponse.json({ error: 'Invalid zone' }, { status: 400 }); conds.push(`p.zone = ${zone}`) }

    const veloMin = floatParam('velo_min')
    if (veloMin != null) { if (isNaN(veloMin)) return NextResponse.json({ error: 'Invalid velo_min' }, { status: 400 }); conds.push(`p.release_speed >= ${veloMin}`) }
    const veloMax = floatParam('velo_max')
    if (veloMax != null) { if (isNaN(veloMax)) return NextResponse.json({ error: 'Invalid velo_max' }, { status: 400 }); conds.push(`p.release_speed <= ${veloMax}`) }

    const dateFrom = sp.get('date_from')
    if (dateFrom) { if (!DATE_RE.test(dateFrom)) return NextResponse.json({ error: 'Invalid date_from' }, { status: 400 }); conds.push(`p.game_date >= '${dateFrom}'`) }
    const dateTo = sp.get('date_to')
    if (dateTo) { if (!DATE_RE.test(dateTo)) return NextResponse.json({ error: 'Invalid date_to' }, { status: 400 }); conds.push(`p.game_date <= '${dateTo}'`) }

    const pitcherName = sp.get('pitcher_name')
    if (pitcherName) conds.push(`p.player_name ILIKE '%${esc(pitcherName)}%'`)
    const batterName = sp.get('batter_name')
    if (batterName) conds.push(`pl.name ILIKE '%${esc(batterName)}%'`)

    const stand = sp.get('stand')
    if (stand) { if (!['L', 'R'].includes(stand)) return NextResponse.json({ error: 'Invalid stand' }, { status: 400 }); conds.push(`p.stand = '${stand}'`) }
    const pThrows = sp.get('p_throws')
    if (pThrows) { if (!['L', 'R'].includes(pThrows)) return NextResponse.json({ error: 'Invalid p_throws' }, { status: 400 }); conds.push(`p.p_throws = '${pThrows}'`) }

    const team = sp.get('team')
    if (team) { if (!TEAM_RE.test(team)) return NextResponse.json({ error: 'Invalid team' }, { status: 400 }); conds.push(`(p.home_team = '${team}' OR p.away_team = '${team}')`) }

    const pitchTypes = sp.get('pitch_type')
    if (pitchTypes) {
      const list = pitchTypes.split(',').map(t => t.trim())
      if (!list.every(t => PITCH_TYPE_RE.test(t))) return NextResponse.json({ error: 'Invalid pitch_type' }, { status: 400 })
      conds.push(`p.pitch_type IN (${list.map(t => `'${t}'`).join(',')})`)
    }
    const events = sp.get('event')
    if (events) {
      const list = events.split(',').map(e => e.trim())
      if (!list.every(e => WORD_RE.test(e))) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
      conds.push(`p.events IN (${list.map(e => `'${e}'`).join(',')})`)
    }
    const descriptions = sp.get('description')
    if (descriptions) {
      const list = descriptions.split(',').map(d => d.trim())
      if (!list.every(d => WORD_RE.test(d))) return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
      conds.push(`p.description IN (${list.map(d => `'${d}'`).join(',')})`)
    }

    const status = sp.get('status')
    if (status) {
      if (!['pending', 'downloaded', 'failed', 'missing'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      conds.push(`v.status = '${status}'`)
    }
    if (sp.get('only_archived') === 'true') conds.push(`v.status = 'downloaded'`)

    if (conds.length === 0) {
      return NextResponse.json({ error: 'At least one filter required for search' }, { status: 400 })
    }

    const limit = Math.min(Math.max(intParam('limit') || 50, 1), 500)
    const offset = Math.max(intParam('offset') || 0, 0)

    const sql = `SELECT ${META_COLS} FROM pitches p
      JOIN pitch_videos v ON v.game_pk = p.game_pk
        AND v.at_bat_number = p.at_bat_number AND v.pitch_number = p.pitch_number
      LEFT JOIN players pl ON pl.id = p.batter
      WHERE ${conds.join(' AND ')}
      ORDER BY p.game_date DESC, p.game_pk, p.at_bat_number, p.pitch_number
      LIMIT ${limit} OFFSET ${offset}`

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ rows: (data || []).map(toVideoRow), count: (data || []).length, limit, offset })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
