'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import TridentLogo from '@/components/TridentLogo'

type NavLink = { label: string; href: string }
type NavGroup = { label: string; key: string; items: NavLink[] }
type NavEntry = NavLink | NavGroup

const isGroup = (e: NavEntry): e is NavGroup => 'items' in e

const NAV: NavEntry[] = [
  { label: 'Dashboard', href: '/compete' },
  { label: 'Messages', href: '/compete/messages' },
  { label: 'Schedule', href: '/compete/schedule' },
  {
    label: 'Review',
    key: 'review',
    items: [
      { label: 'Command', href: '/compete/review/command' },
      { label: 'Video', href: '/compete/review/video' },
      { label: 'My Data', href: '/compete/review/my-data' },
    ],
  },
  {
    label: 'Performance',
    key: 'performance',
    items: [
      { label: 'Health', href: '/compete/performance/health' },
      { label: 'Programming', href: '/compete/performance/programming' },
      { label: 'Scouting Reports', href: '/compete/performance/scouting-reports' },
    ],
  },
  {
    label: 'Reports',
    key: 'reports',
    items: [
      { label: 'Biomechanics', href: '/compete/reports/biomechanics' },
      { label: 'Command', href: '/compete/reports/command' },
      { label: 'Live ABs / Stress Test', href: '/compete/reports/live-abs' },
      { label: 'Bullpen', href: '/compete/reports/bullpen' },
    ],
  },
]

const STORAGE_KEY = 'compete-nav-groups'

function isActive(pathname: string, href: string) {
  return href === '/compete' ? pathname === '/compete' : pathname === href || pathname.startsWith(href + '/')
}

/** Left navigation for the Compete app: fixed sidebar on desktop, hamburger drawer on mobile. */
export default function CompeteSidebar({ athlete }: { athlete: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)

  // Groups start expanded so the first paint never hides anything; stored
  // preferences are applied after hydration to avoid a server/client mismatch.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCollapsed(JSON.parse(raw))
    } catch {
      // Corrupt or unavailable storage just means default-expanded.
    }
  }, [])

  // Navigating into a collapsed group (from a link outside the sidebar) opens it,
  // so the current page is always visible in the nav.
  useEffect(() => {
    const group = NAV.find(e => isGroup(e) && e.items.some(i => isActive(pathname, i.href)))
    if (group && isGroup(group)) {
      setCollapsed(prev => (prev[group.key] ? { ...prev, [group.key]: false } : prev))
    }
  }, [pathname])

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Preference just won't persist.
      }
      return next
    })
  }

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
    function itemLink(item: NavLink, indented: boolean) {
      const active = isActive(pathname, item.href)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`block py-2 rounded-lg text-sm transition ${indented ? 'pl-7 pr-3' : 'px-3'} ${
            active
              ? 'bg-amber-500/10 text-amber-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
          }`}
        >
          {item.label}
        </Link>
      )
    }

    return (
      <div className="flex flex-col h-full">
        <div className="h-12 flex items-center gap-2 px-5 border-b border-zinc-800 shrink-0">
          {brand}
          <span className="w-px h-3 bg-zinc-700 shrink-0" />
          <span className="font-[family-name:var(--font-bebas)] text-amber-400 tracking-wide text-sm shrink-0">Compete</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-4 space-y-0.5">
          {NAV.map(entry => {
            if (!isGroup(entry)) return itemLink(entry, false)

            const expanded = !collapsed[entry.key]
            const hasActiveChild = entry.items.some(i => isActive(pathname, i.href))
            return (
              <div key={entry.key}>
                <button
                  onClick={() => toggleGroup(entry.key)}
                  aria-expanded={expanded}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                    hasActiveChild ? 'text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                  }`}
                >
                  <span>{entry.label}</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 text-zinc-600 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {expanded && (
                  <div className="space-y-0.5">
                    {entry.items.map(item => itemLink(item, true))}
                  </div>
                )}
              </div>
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
