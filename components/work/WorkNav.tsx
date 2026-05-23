'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import TridentLogo from '@/components/TridentLogo'

const ITEMS = [
  { href: '/work',              label: 'Dashboard',       icon: 'grid' },
  { href: '/work/channels',     label: 'Channels',        icon: 'hash' },
  { href: '/work/messages',     label: 'Messages',        icon: 'message' },
  { href: '/work/calendar',     label: 'Calendar',        icon: 'calendar' },
  { href: '/work/goals',        label: 'Goals',           icon: 'target' },
  { href: '/work/resources',    label: 'Resources',       icon: 'folder' },
  { href: '/work/jobs',         label: 'Job Assignments', icon: 'briefcase' },
  { href: '/work/assessments',  label: 'Assessments',     icon: 'clipboard' },
]

function NavIcon({ type, className }: { type: string; className?: string }) {
  const cn = className || 'w-4 h-4'
  switch (type) {
    case 'grid':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'board':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      )
    case 'hash':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      )
    case 'message':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'sprint':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    case 'calendar':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    case 'target':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      )
    case 'folder':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'briefcase':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
        </svg>
      )
    default:
      return null
  }
}

export default function WorkNav({ role }: { role: 'admin' | 'assistant' | 'member' }) {
  const pathname = usePathname()

  return (
    <aside className="w-48 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Logo header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-zinc-800">
        <TridentLogo className="w-5 h-6 text-sky-400" />
        <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">
          TRITON
        </a>
        <span className="text-zinc-700">/</span>
        <span className="font-[family-name:var(--font-bebas)] text-sky-400 tracking-wide text-sm">Work</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
        {ITEMS.map(it => {
          const active = it.href === '/work'
            ? pathname === '/work'
            : pathname?.startsWith(it.href)
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
                active
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <NavIcon type={it.icon} className={`w-4 h-4 ${active ? 'text-sky-400' : 'text-zinc-500'}`} />
              {it.label}
            </Link>
          )
        })}
      </nav>

      {/* Role badge */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Role: <span className="text-zinc-300">{role}</span>
        </span>
      </div>
    </aside>
  )
}
