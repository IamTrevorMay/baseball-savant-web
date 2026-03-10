/**
 * Upload a file to broadcast-media storage via signed URL.
 * Uses direct client→Supabase upload to bypass Vercel's 4.5MB body limit.
 * Returns the public URL on success, or null on failure.
 */
export async function uploadBroadcastMedia(
  file: File,
  projectId: string,
): Promise<{ url: string; path: string } | null> {
  try {
    // 1. Get a signed upload URL from our API
    const res = await fetch('/api/broadcast/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        file_name: file.name,
        file_type: file.type,
      }),
    })
    const data = await res.json()
    if (!data.signedUrl) {
      console.error('Failed to get signed URL:', data.error)
      return null
    }

    // 2. Upload directly to Supabase Storage using the signed URL
    const uploadRes = await fetch(data.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })

    if (!uploadRes.ok) {
      console.error('Direct upload failed:', uploadRes.status, await uploadRes.text())
      return null
    }

    return { url: data.publicUrl, path: data.path }
  } catch (err) {
    console.error('Upload error:', err)
    return null
  }
}
