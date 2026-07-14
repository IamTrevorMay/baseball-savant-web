'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import TridentLogo from '@/components/TridentLogo'

const TABS = [
  { label: 'Dashboard', href: '/compete' },
  { label: 'Schedule', href: '/compete/schedule' },
  { label: 'Monitor', href: '/compete/whoop' },
  { label: 'Performance', href: '/compete/performance' },
  { label: 'Video', href: '/compete/video' },
  { label: 'Reports', href: '/compete/reports' },
  { label: 'Review', href: '/compete/review' },
  { label: 'Messages', href: '/compete/messages' },
]

function isActive(pathname: string, href: string) {
  return href === '/compete' ? pathname === '/compete' : pathname === href || pathname.startsWith(href + '/')
}

/** Left navigation for the Compete app: fixed sidebar on desktop, hamburger drawer on mobile. */
export default function CompeteSidebar({ athlete }: { athlete: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  const name = profile?.display_name || profile?.full_name || user?.email || 'Athlete'

  const brand = (
    <div className="flex items-center gap-2">
      <TridentLogo className="w-5 h-6 text-amber-400" />
      {athlete ? (
        // Athletes have no launcher / app menu — the wordmark is not a link out.
        <span className="font-[family-name:var(--font-bebas)] text-orange-500 text-sm uppercase tracking-wider">Triton Apex</span>
      ) : (
        <Link href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">Triton Apex</Link>
      )}
    </div>
  )

  // Shared inner content for both the desktop sidebar and the mobile drawer.
  function Panel({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-12 flex items-center px-5 border-b border-zinc-800 shrink-0">
          {brand}
        </div>
        <div className="px-5 pt-4 pb-2">
          <span className="font-[family-name:var(--font-bebas)] text-amber-400 tracking-wide text-sm">Compete</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {TABS.map(tab => {
            const active = isActive(pathname, tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={onNavigate}
                className={`block px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? 'bg-amber-500/10 text-amber-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-zinc-800 p-3 shrink-0">
          <div className="px-2 py-1.5">
            <p className="text-sm text-white truncate">{name}</p>
            {user?.email && <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>}
          </div>
          <button
            onClick={signOut}
            className="mt-1 w-full px-2 py-1.5 text-left text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg transition"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-56 bg-zinc-900 border-r border-zinc-800 z-30">
        <Panel />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-3">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-zinc-400 hover:text-white transition">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {brand}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-zinc-900 border-r border-zinc-800 shadow-xl">
            <Panel onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  )
}
