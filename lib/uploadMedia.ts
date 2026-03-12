import { createClient } from './supabase/client'

const TUS_THRESHOLD = 50 * 1024 * 1024 // 50MB

/**
 * Upload a file to broadcast-media storage.
 * - Files < 50MB: signed URL PUT (fast, single request)
 * - Files >= 50MB: TUS resumable upload (chunked, handles large files)
 * Returns the public URL on success, or null on failure.
 */
export async function uploadBroadcastMedia(
  file: File,
  projectId: string,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; path: string } | null> {
  // Get upload metadata from API (path, signed URL, public URL)
  const meta = await getUploadMeta(file, projectId)
  if (!meta) return null

  if (file.size >= TUS_THRESHOLD) {
    return uploadViaTUS(file, meta, onProgress)
  }
  return uploadViaSignedUrl(file, meta)
}

interface UploadMeta {
  signedUrl: string
  token: string
  path: string
  publicUrl: string
}

async function getUploadMeta(file: File, projectId: string): Promise<UploadMeta | null> {
  try {
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
      console.error('Failed to get upload meta:', data.error)
      return null
    }
    return data as UploadMeta
  } catch (err) {
    console.error('Upload meta error:', err)
    return null
  }
}

async function uploadViaSignedUrl(
  file: File,
  meta: UploadMeta,
): Promise<{ url: string; path: string } | null> {
  try {
    const uploadRes = await fetch(meta.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })

    if (!uploadRes.ok) {
      console.error('Signed URL upload failed:', uploadRes.status, await uploadRes.text())
      return null
    }

    return { url: meta.publicUrl, path: meta.path }
  } catch (err) {
    console.error('Signed URL upload error:', err)
    return null
  }
}

async function uploadViaTUS(
  file: File,
  meta: UploadMeta,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; path: string } | null> {
  try {
    // Get user's access token for TUS auth
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      console.error('No auth session for TUS upload')
      return null
    }

    const { Upload } = await import('tus-js-client')

    return new Promise<{ url: string; path: string }>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: 'broadcast-media',
          objectName: meta.path,
          contentType: file.type,
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024, // 6MB chunks
        onError: (error) => {
          console.error('TUS upload failed:', error)
          reject(error)
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const pct = Math.round((bytesUploaded / bytesTotal) * 100)
          onProgress?.(pct)
        },
        onSuccess: () => {
          resolve({ url: meta.publicUrl, path: meta.path })
        },
      })

      // Check for previous uploads (resume support)
      upload.findPreviousUploads().then(previousUploads => {
        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
    })
  } catch (err) {
    console.error('TUS upload error:', err)
    return null
  }
}
