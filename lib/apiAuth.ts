import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Shared auth guards for API routes. The Next.js middleware exempts ALL `/api/*`
 * paths (see lib/supabase/middleware.ts), so every route must self-protect.
 *
 * - `checkMachineAuth`  — backend/admin-triggered jobs (cron, backfills, ingest).
 *   Accepts a CRON_SECRET or service-role Bearer token; localhost allowed in dev.
 * - `requireSessionAdmin` — UI actions restricted to owner/admin profiles.
 * - `requireSessionUser`  — UI actions that just need a logged-in user.
 *
 * Each guard returns a `NextResponse` (401/403) to return early, or `null`/the
 * user object when the request is authorized.
 */

/** Machine auth: CRON_SECRET or service-role Bearer, with a localhost dev bypass. */
export function checkMachineAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization') || ''
  const cronOk = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const svcOk = !!process.env.SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  const host = req.nextUrl.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  if (cronOk || svcOk || isLocal) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/** Session admin: logged-in user whose profile role is owner/admin. */
export async function requireSessionAdmin(): Promise<{ user: { id: string } } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { user }
}

/** Session auth: any logged-in user. */
export async function requireSessionUser(): Promise<{ user: { id: string } } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { user }
}
