import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

/**
 * GET /api/compete/review
 *
 * Mode A — Game list:
 *   ?games=true&pitcherId=X&season=Y
 *
 * Mode B — Pitch data:
 *   ?pitcherId=X&gamePk=Y
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const pitcherId = sp.get('pitcherId')

    if (!pitcherId) return NextResponse.json({ error: 'pitcherId required' }, { status: 400 })

    // ── Mode A: Game List ────────────────────────────────────────────────
    if (sp.get('games') === 'true') {
      const season = sp.get('season') || '2025'

      const sql = `
        SELECT
          game_pk,
          game_date::text AS game_date,
          MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) AS opponent,
          COUNT(*) AS pitches,
          ROUND(SUM(CASE WHEN COALESCE(events, '') != '' THEN 1 ELSE 0 END)::numeric / 3, 1) AS ip_est
        FROM pitches
        WHERE pitcher = ${pitcherId}
          AND game_year = ${season}
        GROUP BY game_pk, game_date
        ORDER BY game_date DESC
      `

      const { data, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const games = (data || []).map((r: any) => ({
        game_pk: r.game_pk,
        game_date: r.game_date,
        opponent: r.opponent || '??',
        pitches: Number(r.pitches),
        ip: String(r.ip_est ?? '?'),
      }))

      return NextResponse.json({ games })
    }

    // ── Mode B: Pitch Data ───────────────────────────────────────────────
    const gamePk = sp.get('gamePk')
    if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

    const sql = `
      SELECT
        p.plate_x, p.plate_z, p.pitch_name, p.pitch_type,
        p.balls, p.strikes, p.zone, p.at_bat_number, p.pitch_number,
        p.description, pl.name AS batter_name
      FROM pitches p
      LEFT JOIN players pl ON pl.id = p.batter
      WHERE p.pitcher = ${pitcherId} AND p.game_pk = ${gamePk}
        AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL
      ORDER BY p.at_bat_number ASC, p.pitch_number ASC
    `

    const { data, error } = await q(sql)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const pitches = (data || []).map((r: any) => ({
      plate_x: Number(r.plate_x),
      plate_z: Number(r.plate_z),
      pitch_name: r.pitch_name,
      pitch_type: r.pitch_type,
      balls: Number(r.balls ?? 0),
      strikes: Number(r.strikes ?? 0),
      zone: Number(r.zone ?? 0),
      batter_name: r.batter_name || 'Unknown',
      at_bat_number: Number(r.at_bat_number ?? 0),
      pitch_number: Number(r.pitch_number ?? 0),
    }))

    return NextResponse.json({ pitches })
  } catch (err: any) {
    console.error('compete/review error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
