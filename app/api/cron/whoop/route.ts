import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { trackCronRun } from '@/lib/cronTracker'
import { syncWhoopData } from '@/lib/compete/whoop'

/**
 * GET /api/cron/whoop
 * Nightly cron (17:00 UTC — most US athletes are awake and phone-synced, so
 * the morning's recovery score has usually posted) — pulls Whoop data for
 * EVERY connected athlete server-side via their stored refresh token, so
 * collection no longer depends on athletes opening Compete.
 *
 * A 7-day window per athlete: small enough to stay fast, wide enough that
 * late-posting recovery scores and a few missed nights self-heal (upserts
 * are idempotent on (athlete_id, whoop_id)). Athletes are synced
 * sequentially with per-athlete error isolation — one revoked token must
 * not block the rest of the roster.
 */
export const maxDuration = 300

const SYNC_DAYS = 7

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await trackCronRun('whoop', async () => {
      const { data: athletes, error } = await supabaseAdmin
        .from('athlete_profiles')
        .select('id, profiles:profile_id (full_name)')
        .eq('whoop_connected', true)
      if (error) throw new Error(error.message)

      const synced: { athleteId: string; name: string; counts: unknown }[] = []
      const failed: { athleteId: string; name: string; error: string }[] = []

      for (const a of athletes || []) {
        const name = (a as any).profiles?.full_name || a.id
        try {
          const counts = await syncWhoopData(a.id, SYNC_DAYS)
          synced.push({ athleteId: a.id, name, counts })
        } catch (e) {
          // Isolate: a revoked/expired token for one athlete must not stop the rest
          failed.push({ athleteId: a.id, name, error: e instanceof Error ? e.message : String(e) })
        }
      }

      return {
        result: {
          ok: failed.length === 0,
          connected: (athletes || []).length,
          synced: synced.length,
          failed,
        },
        counts: {
          connected: (athletes || []).length,
          synced: synced.length,
          failed: failed.length,
        },
      }
    })
    return NextResponse.json(payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('whoop cron error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
