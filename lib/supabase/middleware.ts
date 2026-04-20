import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const GAME_HOSTS = ['mayday.games', 'www.mayday.games']
const DAILY_HOSTS = ['daily.mayday.show', 'www.daily.mayday.show']

export async function updateSession(request: NextRequest) {
  const host = request.headers.get('host')?.replace(/:\d+$/, '') ?? ''
  const pathname = request.nextUrl.pathname

  // Game-only domain: rewrite root → /game, allow /api/game, block everything else
  if (GAME_HOSTS.includes(host)) {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/game', request.url))
    }
    if (pathname.startsWith('/game') || pathname.startsWith('/api/game')) {
      return NextResponse.next()
    }
    // Block all other routes — redirect to game root
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Newsletter domain: rewrite root → /newsletter, allow /api/newsletter, block rest
  if (DAILY_HOSTS.includes(host)) {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/newsletter', request.url))
    }
    if (pathname.startsWith('/newsletter') || pathname.startsWith('/api/newsletter')) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Public paths and API routes skip auth entirely — no cookie manipulation
  const publicPaths = ['/login', '/auth/callback', '/set-password', '/game', '/overlay', '/newsletter']
  const isPublicPath = publicPaths.some(p => pathname.startsWith(p))
  const isApiRoute = pathname.startsWith('/api/')

  if (isPublicPath || isApiRoute) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
