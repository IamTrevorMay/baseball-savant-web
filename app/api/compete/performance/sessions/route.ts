import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = me?.role === 'admin' || me?.role === 'owner'

  let query = supabaseAdmin
    .from('compete_pitch_sessions')
    .select('id, uploaded_by, uploaded_at, source, file_name, session_date, tm_session_id, pitch_count')
    .order('uploaded_at', { ascending: false })
    .limit(200)

  if (!isAdmin) query = query.eq('uploaded_by', user.id)

  const { data: sessions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Join uploader display name so the picker UI can show "who uploaded this".
  const uploaderIds = [...new Set((sessions || []).map(s => s.uploaded_by))]
  const { data: uploaders } = uploaderIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, display_name, email')
        .in('id', uploaderIds)
    : { data: [] }

  const nameById = new Map(
    (uploaders || []).map(p => [p.id, p.display_name || p.full_name || p.email || 'Unknown'])
  )

  const enriched = (sessions || []).map(s => ({
    ...s,
    uploader_name: nameById.get(s.uploaded_by) || 'Unknown',
  }))

  return NextResponse.json({ sessions: enriched, isAdmin })
}
