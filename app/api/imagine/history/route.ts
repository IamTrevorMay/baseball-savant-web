/**
 * /api/imagine/history
 *
 * GET   — list current user's saved renders (newest first, capped at 100).
 * POST  — save a new render. Body: { widget_id, title, filters, size, thumbnail_data_url }.
 *         Uploads the thumbnail to the `imagine-thumbnails` storage bucket
 *         and writes a row to `imagine_history`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'imagine-thumbnails'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('imagine_history')
    .select('id, widget_id, title, filters, size, thumbnail_url, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { widget_id, title, filters, size, thumbnail_data_url } = body || {}
  if (!widget_id || !title || !filters || !size || !thumbnail_data_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Decode data URL → bytes.
  let pngBytes: Buffer
  try {
    const match = String(thumbnail_data_url).match(/^data:image\/png;base64,(.+)$/)
    if (!match) throw new Error('Expected data:image/png;base64,…')
    pngBytes = Buffer.from(match[1], 'base64')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Bad thumbnail_data_url', detail: msg }, { status: 400 })
  }

  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, pngBytes, { contentType: 'image/png', upsert: false })

  if (upErr) return NextResponse.json({ error: 'Thumbnail upload failed', detail: upErr.message }, { status: 500 })

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const thumbnail_url = pub.publicUrl

  const { data: row, error: insErr } = await supabase
    .from('imagine_history')
    .insert({
      user_id: user.id,
      widget_id,
      title,
      filters,
      size,
      thumbnail_url,
    })
    .select('id, widget_id, title, filters, size, thumbnail_url, created_at')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ row })
}
