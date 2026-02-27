import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getWhoopAuthUrl } from '@/lib/compete/whoop'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get athlete profile
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const state = crypto.randomBytes(16).toString('hex')

  // Store state in DB instead of a cookie (cookies get lost across OAuth redirects)
  await supabaseAdmin
    .from('athlete_profiles')
    .update({ oauth_state: state })
    .eq('id', athlete.id)

  const authUrl = getWhoopAuthUrl(state)
  return NextResponse.json({ url: authUrl })
}
