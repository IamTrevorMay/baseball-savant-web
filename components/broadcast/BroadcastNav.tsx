'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Projects', href: '/broadcast' },
  { label: 'Cards', href: '/daily-cards' },
]

export default function BroadcastNav() {
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
                ? 'text-red-400 font-semibold'
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
