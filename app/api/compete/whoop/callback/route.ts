import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { exchangeWhoopCode, encrypt } from '@/lib/compete/whoop'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const storedState = req.cookies.get('whoop_oauth_state')?.value

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  if (!code || !state || state !== storedState) {
    console.error('WHOOP callback: state validation failed', { code: !!code, state: !!state, storedState: !!storedState, match: state === storedState })
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=invalid_state`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('WHOOP callback: user not authenticated')
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=unauthorized`)
  }

  // Get athlete profile
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) {
    console.error('WHOOP callback: no athlete profile for user', user.id)
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=no_profile`)
  }

  try {
    const tokens = await exchangeWhoopCode(code)

    // Upsert encrypted tokens
    await supabaseAdmin.from('whoop_tokens').upsert({
      athlete_id: athlete.id,
      whoop_user_id: tokens.whoop_user_id,
      encrypted_access_token: encrypt(tokens.access_token),
      encrypted_refresh_token: encrypt(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })

    // Mark whoop_connected on athlete profile
    await supabaseAdmin.from('athlete_profiles').update({ whoop_connected: true }).eq('id', athlete.id)

    const response = NextResponse.redirect(`${siteUrl}/compete/whoop`)
    response.cookies.delete('whoop_oauth_state')
    return response
  } catch (err) {
    console.error('WHOOP OAuth callback error:', err)
    return NextResponse.redirect(`${siteUrl}/compete/whoop?error=exchange_failed`)
  }
}
