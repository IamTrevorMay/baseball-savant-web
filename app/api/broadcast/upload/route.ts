import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess, canEdit } from '@/lib/broadcast/checkProjectAccess'

// POST with JSON body to get a signed upload URL (no file in body)
// POST with FormData to do a proxied upload (small files only, <4.5MB)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = req.headers.get('content-type') || ''

    // ── Signed URL mode (JSON body) ─────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await req.json()
      const { project_id, file_name, file_type } = body

      if (!project_id || !file_name || !file_type) {
        return NextResponse.json({ error: 'project_id, file_name, and file_type required' }, { status: 400 })
      }

      const level = await checkProjectAccess(project_id, user.id)
      if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const isVideo = file_type.startsWith('video/')
      const folder = isVideo ? 'videos' : 'images'
      const ext = file_name.split('.').pop() || 'bin'
      const fileName = `${crypto.randomUUID()}.${ext}`
      const storagePath = `${user.id}/${project_id}/${folder}/${fileName}`

      // Create signed upload URL (valid for 10 minutes)
      const { data: signedData, error: signedError } = await supabaseAdmin.storage
        .from('broadcast-media')
        .createSignedUploadUrl(storagePath)

      if (signedError) {
        return NextResponse.json({ error: signedError.message }, { status: 500 })
      }

      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('broadcast-media')
        .getPublicUrl(storagePath)

      return NextResponse.json({
        signedUrl: signedData.signedUrl,
        token: signedData.token,
        path: storagePath,
        publicUrl,
      })
    }

    // ── Legacy FormData mode (small files) ──────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('project_id') as string | null

    if (!file || !projectId) {
      return NextResponse.json({ error: 'file and project_id required' }, { status: 400 })
    }

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Determine folder
    const isVideo = file.type.startsWith('video/')
    const folder = isVideo ? 'videos' : 'images'
    const ext = file.name.split('.').pop() || 'bin'
    const fileName = `${crypto.randomUUID()}.${ext}`
    const storagePath = `${user.id}/${projectId}/${folder}/${fileName}`

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('broadcast-media')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('broadcast-media')
      .getPublicUrl(storagePath)

    return NextResponse.json({ url: publicUrl, path: storagePath })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
