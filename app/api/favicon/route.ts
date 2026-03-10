import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const isGame = host.includes('mayday.games')

  const filename = isGame ? 'percentile-icon.png' : 'triton-icon.png'
  const filePath = join(process.cwd(), 'public', filename)
  const buffer = await readFile(filePath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
