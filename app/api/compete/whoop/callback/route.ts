import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { exchangeWhoopCode, encrypt } from '@/lib/compete/whoop'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  if (!code || !state) {
    console.error('WHOOP callback: missing code or state')
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=invalid_request`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('WHOOP callback: user not authenticated')
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=unauthorized`)
  }

  // Get athlete profile and verify state from DB
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, oauth_state')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) {
    console.error('WHOOP callback: no athlete profile for user', user.id)
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=no_profile`)
  }

  if (athlete.oauth_state !== state) {
    console.error('WHOOP callback: state mismatch', { expected: !!athlete.oauth_state, got: !!state })
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=invalid_state`)
  }

  try {
    const tokens = await exchangeWhoopCode(code)

    // Upsert encrypted tokens
    const { error: upsertError } = await supabaseAdmin.from('whoop_tokens').upsert({
      athlete_id: athlete.id,
      whoop_user_id: tokens.whoop_user_id,
      encrypted_access_token: encrypt(tokens.access_token),
      encrypted_refresh_token: encrypt(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })

    if (upsertError) {
      console.error('WHOOP callback: token upsert failed', upsertError)
      return NextResponse.redirect(`${siteUrl}/compete/whoop?error=db_error`)
    }

    // Mark whoop_connected and clear oauth_state
    const { error: updateError } = await supabaseAdmin
      .from('athlete_profiles')
      .update({ whoop_connected: true, oauth_state: null })
      .eq('id', athlete.id)

    if (updateError) {
      console.error('WHOOP callback: profile update failed', updateError)
    }

    return NextResponse.redirect(`${siteUrl}/compete/whoop`)
  } catch (err) {
    console.error('WHOOP OAuth callback error:', err)
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=exchange_failed`)
  }
}
