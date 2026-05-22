'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/work',           label: 'Home',     icon: 'M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2v-9z' },
  { href: '/work/myboard',   label: 'Board',    icon: 'M4 4h6v16H4zM14 4h6v9h-6z' },
  { href: '/work/channels',  label: 'Chat',     icon: 'M4 9h16M4 15h16M10 3L8 21M16 3L14 21' },
  { href: '/work/sprints',   label: 'Sprint',   icon: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3' },
  { href: '/work/calendar',  label: 'Cal',      icon: 'M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 2v4M16 2v4' },
]

export default function MobileWorkShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="sticky top-0 z-30 h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-4">
        <h1 className="font-[family-name:var(--font-bebas)] text-sky-400 text-lg tracking-wide">{title}</h1>
      </header>
      <main className="pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around z-30">
        {TABS.map(t => {
          const active = t.href === '/work' ? pathname === '/work' : pathname?.startsWith(t.href)
          return (
            <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 px-2 ${active ? 'text-sky-300' : 'text-zinc-500'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              <span className="text-[10px]">{t.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
