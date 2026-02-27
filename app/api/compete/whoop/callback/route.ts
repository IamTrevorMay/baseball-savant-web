import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { exchangeWhoopCode, encrypt } from '@/lib/compete/whoop'

function fail(siteUrl: string, error: string, detail?: string) {
  const params = new URLSearchParams({ error })
  if (detail) params.set('detail', detail)
  return NextResponse.redirect(`${siteUrl}/compete/whoop?${params.toString()}`)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  if (!code || !state) {
    return fail(siteUrl, 'missing_code_or_state')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return fail(siteUrl, 'unauthorized')
  }

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, oauth_state')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) {
    return fail(siteUrl, 'no_profile')
  }

  if (athlete.oauth_state !== state) {
    return fail(siteUrl, 'invalid_state', `db=${!!athlete.oauth_state}_url=${!!state}`)
  }

  try {
    const tokens = await exchangeWhoopCode(code)

    const { error: upsertError } = await supabaseAdmin.from('whoop_tokens').upsert({
      athlete_id: athlete.id,
      whoop_user_id: tokens.whoop_user_id,
      encrypted_access_token: encrypt(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })

    if (upsertError) {
      return fail(siteUrl, 'db_upsert', upsertError.message)
    }

    const { error: updateError } = await supabaseAdmin
      .from('athlete_profiles')
      .update({ whoop_connected: true, oauth_state: null })
      .eq('id', athlete.id)

    if (updateError) {
      return fail(siteUrl, 'db_update', updateError.message)
    }

    return NextResponse.redirect(`${siteUrl}/compete/whoop?success=1`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(siteUrl, 'exchange_failed', msg.slice(0, 200))
  }
}
