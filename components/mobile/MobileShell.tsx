'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import TridentLogo from '@/components/TridentLogo'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/lib/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [
  { href: '/scores', label: 'Scores', icon: 'scores' },
  { href: '/standings', label: 'Standings', icon: 'standings' },
  { href: '/players', label: 'Players', icon: 'players' },
  { href: '/explore', label: 'Explore', icon: 'explore' },
  { href: '/trends', label: 'Trends', icon: 'trends' },
  { href: '/abs', label: 'ABS', icon: 'abs' },
]

const SECONDARY_LINKS: { href: string; label: string }[] = [
]

const ADMIN_LINKS = [
  { href: '/admin', label: 'Admin' },
]

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const c = className || 'w-5 h-5'
  switch (icon) {
    case 'home':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
    case 'scores':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><path strokeLinecap="round" d="M3 9h18M9 3v18" /></svg>
    case 'standings':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-8 4 4 4-6" /></svg>
    case 'players':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
    case 'explore':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
    case 'trends':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
    case 'abs':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" /></svg>
    default:
      return null
  }
}

interface Props {
  title?: string
  children: React.ReactNode
}

export default function MobileShell({ title, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 dark:bg-zinc-950 bg-white">
      {/* Header bar */}
      <header
        className="sticky top-0 z-40 h-12 flex items-center justify-between px-4 bg-zinc-900 dark:bg-zinc-900 bg-white border-b border-zinc-800 dark:border-zinc-800 border-gray-200"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Link href="/scores" className="flex items-center gap-1.5">
          <TridentLogo className="w-5 h-5 text-emerald-400" />
          <span className="font-[family-name:var(--font-bebas)] text-orange-500 text-sm uppercase tracking-wider">
            TRITON
          </span>
        </Link>

        {title && (
          <h1 className="text-sm font-medium text-white dark:text-white text-zinc-900 absolute left-1/2 -translate-x-1/2 truncate max-w-[50%]">
            {title}
          </h1>
        )}

        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -mr-2 text-zinc-400 hover:text-white transition"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm cursor-pointer"
          onClick={() => setDrawerOpen(false)}
          onTouchEnd={(e) => { e.preventDefault(); setDrawerOpen(false) }}
          role="button"
          tabIndex={-1}
          aria-label="Close menu"
        />
      )}

      {/* Slide-out drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-[70] w-72 bg-zinc-900 dark:bg-zinc-900 bg-white border-l border-zinc-800 dark:border-zinc-800 border-gray-200 transform transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-zinc-800 dark:border-zinc-800 border-gray-200">
          <span className="text-sm font-semibold text-white dark:text-white text-zinc-900">Menu</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1 text-zinc-400 hover:text-white transition"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto py-2">
          {NAV_LINKS.map(link => {
            const active = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-5 py-3 text-sm transition ${
                  active
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <NavIcon icon={link.icon} className={`w-5 h-5 ${active ? 'text-emerald-400' : ''}`} />
                {link.label}
              </Link>
            )
          })}

          {isAdmin && (
            <>
              <div className="my-2 mx-5 border-t border-zinc-800 dark:border-zinc-800 border-gray-200" />
              {ADMIN_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-5 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition"
                >
                  {link.label}
                </Link>
              ))}
            </>
          )}
        </div>

        {/* Bottom section: theme toggle + user */}
        <div className="border-t border-zinc-800 dark:border-zinc-800 border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-5 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition"
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>

          {/* User info */}
          {user && (
            <div className="px-5 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-white dark:text-white text-zinc-900 truncate">
                  {profile?.display_name || profile?.full_name || user.email}
                </p>
                {profile?.role && (
                  <p className="text-[10px] text-zinc-500 capitalize">{profile.role}</p>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="text-xs text-zinc-500 hover:text-red-400 transition shrink-0 ml-3"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
