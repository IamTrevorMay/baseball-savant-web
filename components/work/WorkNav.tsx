'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/work',           label: 'Dashboard' },
  { href: '/work/myboard',   label: 'My Board' },
  { href: '/work/athletes',  label: 'Athletes' },
  { href: '/work/sprints',   label: 'Sprints' },
  { href: '/work/calendar',  label: 'Calendar' },
  { href: '/work/goals',     label: 'Goals' },
]

export default function WorkNav({ role }: { role: 'admin' | 'assistant' | 'member' }) {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 text-sm ml-2">
      {ITEMS.map(it => {
        const active = it.href === '/work'
          ? pathname === '/work'
          : pathname?.startsWith(it.href)
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-2.5 py-1 rounded-md transition ${
              active
                ? 'bg-sky-500/15 text-sky-300'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {it.label}
          </Link>
        )
      })}
      <span className="ml-auto pl-3 text-[10px] uppercase tracking-wider text-zinc-500">
        Role: <span className="text-zinc-300">{role}</span>
      </span>
    </div>
  )
}
