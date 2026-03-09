import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('project_id') as string | null

    if (!file || !projectId) {
      return NextResponse.json({ error: 'file and project_id required' }, { status: 400 })
    }

    // Verify project ownership
    const { data: project } = await supabaseAdmin
      .from('broadcast_projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

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
