import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ notifications: [] })

  const { data: notifications } = await supabaseAdmin
    .from('athlete_notifications')
    .select('*')
    .eq('athlete_id', athlete.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ notifications: notifications || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ error: 'No athlete profile' }, { status: 404 })

  const body = await req.json()

  if (body.mark_all) {
    await supabaseAdmin
      .from('athlete_notifications')
      .update({ read: true })
      .eq('athlete_id', athlete.id)
      .eq('read', false)
    return NextResponse.json({ success: true })
  }

  if (body.ids && Array.isArray(body.ids)) {
    await supabaseAdmin
      .from('athlete_notifications')
      .update({ read: true })
      .eq('athlete_id', athlete.id)
      .in('id', body.ids)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Provide ids or mark_all' }, { status: 400 })
}
