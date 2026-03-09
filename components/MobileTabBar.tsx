'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

const TABS = [
  {
    id: 'compete',
    label: 'Compete',
    href: '/compete',
    color: { active: 'text-amber-400', inactive: 'text-zinc-500' },
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V8a2 2 0 0 0-2-2H6v6.5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V6h-2a2 2 0 0 0-2 2v14" />
      </svg>
    ),
  },
  {
    id: 'research',
    label: 'Research',
    href: '/home',
    color: { active: 'text-emerald-400', inactive: 'text-zinc-500' },
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
      </svg>
    ),
  },
  {
    id: 'models',
    label: 'Models',
    href: '/models',
    color: { active: 'text-purple-400', inactive: 'text-zinc-500' },
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11h3a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V20H5v-1.6A4 4 0 0 1 3 15a4 4 0 0 1 4-4h3V9.4A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
      </svg>
    ),
  },
  {
    id: 'broadcast',
    label: 'Broadcast',
    href: '/broadcast',
    color: { active: 'text-red-400', inactive: 'text-zinc-500' },
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
      </svg>
    ),
  },
  {
    id: 'admin',
    label: 'Admin',
    href: '/admin',
    color: { active: 'text-red-400', inactive: 'text-zinc-500' },
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    adminOnly: true,
  },
]

const PREFIX_MAP: Record<string, string> = {
  '/compete': 'compete',
  '/home': 'research',
  '/player': 'research',
  '/reports': 'research',
  '/standings': 'research',
  '/analyst': 'research',
  '/glossary': 'research',
  '/models': 'models',
  '/broadcast': 'broadcast',
  '/admin': 'admin',
}

function getActiveTab(pathname: string): string | null {
  for (const [prefix, tabId] of Object.entries(PREFIX_MAP)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return tabId
    }
  }
  return null
}

export default function MobileTabBar() {
  const pathname = usePathname()
  const { user, profile, loading } = useAuth()

  if (loading || !user) return null

  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'
  const activeTab = getActiveTab(pathname)
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-14">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id
          const colorClass = isActive ? tab.color.active : tab.color.inactive
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full ${colorClass} transition-colors`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {tab.icon}
              <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
