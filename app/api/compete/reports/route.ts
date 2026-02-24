import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get athlete profile for this user
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ reports: [] })

  const { data: reports } = await supabaseAdmin
    .from('compete_reports')
    .select('*')
    .eq('athlete_id', athlete.id)
    .order('report_date', { ascending: false })

  return NextResponse.json({ reports: reports || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin only
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { athlete_id, title, description, player_name, subject_type, pdf_url, metadata } = body

  if (!athlete_id || !title || !subject_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: report, error } = await supabaseAdmin
    .from('compete_reports')
    .insert({
      athlete_id,
      title,
      description: description || null,
      player_name: player_name || null,
      subject_type,
      created_by: user.id,
      pdf_url: pdf_url || null,
      metadata: metadata || {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Insert notification for athlete
  await supabaseAdmin.from('athlete_notifications').insert({
    athlete_id,
    title: `New report: ${title}`,
    body: description || `A new ${subject_type} report has been shared with you.`,
    type: 'report',
  })

  return NextResponse.json({ report })
}
