import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Serve domain-specific favicon
  if (request.nextUrl.pathname === '/favicon.ico') {
    const host = request.headers.get('host') || ''
    const icon = host.includes('mayday.games') ? '/percentile-icon.png' : '/triton-icon.png'
    return NextResponse.rewrite(new URL(icon, request.url))
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/favicon.ico',
    '/((?!_next/static|_next/image|sw\\.js|manifest\\.json|icons/|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
