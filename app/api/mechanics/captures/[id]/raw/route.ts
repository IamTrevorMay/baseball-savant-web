import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Short-lived signed URL for a capture's raw C3D, so the reviewer can parse it in the
// browser with the same parseC3D the pipeline used. Admin only — `biomech-captures` is
// a private bucket and the raw capture is the moat.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: capture } = await supabaseAdmin
    .from('biomech_captures')
    .select('id, raw_file_path, athlete_profile_id, capture_date, raw_meta')
    .eq('id', id)
    .single()
  if (!capture) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Captures created by the synthetic seeder have no raw file — say so plainly rather
  // than 404ing, so the viewer can explain why there is nothing to render.
  if (!capture.raw_file_path) {
    return NextResponse.json(
      { error: 'This capture has no raw C3D (seeded directly, not ingested from a file).', code: 'no_raw_file' },
      { status: 409 },
    )
  }

  const { data: signed, error } = await supabaseAdmin.storage
    .from('biomech-captures')
    .createSignedUrl(capture.raw_file_path, 300)
  if (error || !signed) {
    return NextResponse.json({ error: `Could not sign raw capture: ${error?.message}` }, { status: 500 })
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expiresIn: 300,
    upAxis: (capture.raw_meta as Record<string, unknown> | null)?.up_axis ?? 'z',
  })
}
