import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

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
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)

  try {
    const fileStat = await stat(resolved)
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
        const stream = createReadStream(resolved, { start, end })
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

    const buffer = await readFile(resolved)
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
