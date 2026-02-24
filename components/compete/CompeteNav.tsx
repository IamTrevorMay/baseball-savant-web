'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Dashboard', href: '/compete' },
  { label: 'Today', href: '/compete/today' },
  { label: 'Schedule', href: '/compete/schedule' },
  { label: 'Reports', href: '/compete/reports' },
  { label: 'Messages', href: '/compete/messages' },
]

export default function CompeteNav() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-4 ml-4">
      {TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-xs transition ${
              active
                ? 'text-amber-400 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
