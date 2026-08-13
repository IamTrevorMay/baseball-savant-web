import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const BUCKET = 'biomech-reports'
const SIGNED_URL_TTL_SECONDS = 300

/**
 * Mint a short-lived signed URL for a report PDF.
 *
 * The `biomech-reports` bucket is private: report PDFs name a real athlete (often a minor),
 * so an unguessable path is not an access control. Access mirrors
 * `compete_reports_select_own_or_admin` in `scripts/enable-rls.sql` — the owning athlete, or
 * an admin/owner.
 *
 * `compete_reports.pdf_url` stores a **storage path**. Rows written before the bucket was made
 * private hold a full public URL; those are accepted and reduced to their path so old reports
 * keep working after the migration.
 */
function toStoragePath(stored: string): string | null {
  if (!stored) return null
  if (!/^https?:\/\//i.test(stored)) return stored.replace(/^\/+/, '')
  // Legacy: https://<project>.supabase.co/storage/v1/object/public/biomech-reports/<path>
  const marker = `/${BUCKET}/`
  const at = stored.indexOf(marker)
  if (at === -1) return null
  return stored.slice(at + marker.length).split('?')[0]
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: report } = await supabaseAdmin
    .from('compete_reports')
    .select('id, athlete_id, pdf_url')
    .eq('id', id)
    .single()

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: athlete }, { data: profile }] = await Promise.all([
    supabaseAdmin.from('athlete_profiles').select('id').eq('profile_id', user.id).maybeSingle(),
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])

  const isOwner = !!athlete && athlete.id === report.athlete_id
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  // 404 rather than 403 — an unauthorised caller should not learn the report exists.
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const path = toStoragePath(report.pdf_url ?? '')
  if (!path) return NextResponse.json({ error: 'No PDF for this report' }, { status: 404 })

  const { data: signed, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
