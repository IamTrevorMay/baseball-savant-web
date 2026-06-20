import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat, realpath } from 'fs/promises'
import path from 'path'
import os from 'os'

// Containment: only files under an allowlisted root may be served. Without this,
// `?path=` is an unauthenticated arbitrary-file read (limited to media extensions).
// Operators can set LOCAL_MEDIA_ROOTS (colon-separated absolute dirs); default to
// the server user's home + cwd so the broadcast operator's own media keeps working
// while system dirs and other users' files are blocked. (Overlay/OBS reads are
// cookie-less, so auth isn't an option here — containment is the fix.)
const MEDIA_ROOTS = (process.env.LOCAL_MEDIA_ROOTS
  ? process.env.LOCAL_MEDIA_ROOTS.split(':')
  : [os.homedir(), process.cwd()]
).map(r => path.resolve(r.trim())).filter(Boolean)

function isInsideAllowedRoot(target: string): boolean {
  return MEDIA_ROOTS.some(root => {
    const rel = path.relative(root, target)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
}

const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.webm', '.mkv', '.avi',
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif',
])

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  // Validate extension
  const ext = path.extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 403 })
  }

  // Resolve to absolute path (support both absolute and relative paths)
  const resolved = path.resolve(filePath)

  try {
    // Canonicalize (resolves symlinks) then enforce root containment before any read.
    let real: string
    try {
      real = await realpath(resolved)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    if (!isInsideAllowedRoot(real)) {
      return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
    }

    const fileStat = await stat(real)
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 })
    }

    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    // Support Range requests for video seeking
    const rangeHeader = req.headers.get('range')
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1])
        const end = match[2] ? parseInt(match[2]) : fileStat.size - 1
        const chunkSize = end - start + 1

        // Read the specific byte range
        const { createReadStream } = await import('fs')
        const stream = createReadStream(real, { start, end })
        const chunks: Uint8Array[] = []
        for await (const chunk of stream) {
          chunks.push(chunk)
        }
        const buffer = Buffer.concat(chunks)

        return new NextResponse(buffer, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
            'Content-Length': String(chunkSize),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    }

    const buffer = await readFile(real)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileStat.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
  }
}
