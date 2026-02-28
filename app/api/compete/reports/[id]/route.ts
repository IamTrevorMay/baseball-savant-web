import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get athlete profile for this user
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: report, error } = await supabaseAdmin
    .from('compete_reports')
    .select('*')
    .eq('id', id)
    .eq('athlete_id', athlete.id)
    .single()

  if (error || !report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ report })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify ownership before deleting
  const { data: report } = await supabaseAdmin
    .from('compete_reports')
    .select('id')
    .eq('id', id)
    .eq('athlete_id', athlete.id)
    .single()

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('compete_reports')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
