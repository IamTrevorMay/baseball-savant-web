import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single()

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('*')
    .eq('profile_id', user.id)
    .single()

  return NextResponse.json({
    profile,
    athlete,
    needsSetup: !athlete,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const targetProfileId = body.profile_id || user.id

  // Only admins can create for others. Self-onboarding (target === self) is allowed
  // even before a profiles row exists, so we only fail closed on lookup error when
  // privilege escalation is actually being requested.
  if (targetProfileId !== user.id) {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileErr) {
      console.error('compete/profile POST: profile lookup failed', profileErr)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('athlete_profiles')
    .insert({
      profile_id: targetProfileId,
      player_id: body.player_id || null,
      height_in: body.height_in || null,
      weight_lbs: body.weight_lbs || null,
      position: body.position || null,
      current_team: body.current_team || null,
      birth_date: body.birth_date || null,
      throws: body.throws || null,
      bats: body.bats || null,
      jersey_number: body.jersey_number || null,
      bio: body.bio || null,
    })
    .select()
    .single()

  if (error) {
    console.error('compete/profile POST: athlete insert failed', error)
    return NextResponse.json({ error: 'Failed to create athlete profile' }, { status: 400 })
  }
  return NextResponse.json({ athlete: data })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const targetProfileId = body.profile_id || user.id

  // Only admins can update other users' profiles
  if (targetProfileId !== user.id) {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileErr) {
      console.error('compete/profile PUT: profile lookup failed', profileErr)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const allowedFields = [
    'height_in', 'weight_lbs', 'position', 'current_team', 'birth_date',
    'throws', 'bats', 'jersey_number', 'bio', 'photo_url', 'player_id',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabaseAdmin
    .from('athlete_profiles')
    .update(updates)
    .eq('profile_id', targetProfileId)
    .select()
    .single()

  if (error) {
    console.error('compete/profile PUT: athlete update failed', error)
    return NextResponse.json({ error: 'Failed to update athlete profile' }, { status: 400 })
  }
  return NextResponse.json({ athlete: data })
}
