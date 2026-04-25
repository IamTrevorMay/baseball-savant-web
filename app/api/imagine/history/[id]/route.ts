/**
 * DELETE /api/imagine/history/[id]
 *
 * Removes one history row owned by the current user. Best-effort cleanup of the
 * thumbnail file; if the storage delete fails, the row is still removed.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'imagine-thumbnails'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  const { data: row } = await supabase
    .from('imagine_history')
    .select('thumbnail_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { error: delErr } = await supabase
    .from('imagine_history')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Best-effort thumbnail cleanup. Path is stored as the public URL, so derive
  // the object key from the bucket prefix.
  if (row?.thumbnail_url) {
    const marker = `/${BUCKET}/`
    const idx = row.thumbnail_url.indexOf(marker)
    if (idx >= 0) {
      const objectPath = row.thumbnail_url.slice(idx + marker.length)
      await supabase.storage.from(BUCKET).remove([objectPath])
    }
  }

  return NextResponse.json({ ok: true })
}
