'use client'
import { useState, useEffect, useRef } from 'react'

const NAV_LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/pitchers', label: 'Pitchers' },
  { href: '/hitters', label: 'Hitters' },
  { href: '/reports', label: 'Reports' },
  { href: '/umpire', label: 'Umpires' },
  { href: '/explore', label: 'Explore' },
  { href: '/analyst', label: 'Analyst' },
]

interface Props {
  active?: string
  children?: React.ReactNode
  rightContent?: React.ReactNode
}

export default function ResearchNav({ active, children, rightContent }: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 md:px-6 relative shrink-0" ref={menuRef}>
      {/* Brand */}
      <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">TRITON APEX</a>
      <a href="/home" className="font-[family-name:var(--font-bebas)] text-emerald-400 tracking-wide text-sm hover:text-emerald-300 transition ml-4 hidden sm:inline">Research</a>

      {/* Injected content (search bars etc) */}
      {children}

      {/* Desktop nav links — centered */}
      <div className="hidden md:flex flex-1 justify-center">
        <div className="flex gap-4 text-xs text-zinc-500">
          {NAV_LINKS.map(link => (
            <a key={link.href} href={link.href}
              className={active === link.href ? 'text-emerald-400' : 'hover:text-zinc-300 transition'}>
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Right content — desktop only */}
      {rightContent && <div className="hidden md:flex items-center">{rightContent}</div>}

      {/* Spacer for mobile when no right content */}
      <div className="flex-1 md:hidden" />

      {/* Hamburger — mobile only */}
      <button onClick={() => setOpen(!open)} className="md:hidden ml-2 p-2 text-zinc-400 hover:text-white transition">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          }
        </svg>
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 bg-zinc-900 border-b border-zinc-700 shadow-xl z-50 md:hidden">
          {NAV_LINKS.map(link => (
            <a key={link.href} href={link.href}
              className={`block px-6 py-3 text-sm border-t border-zinc-800/50 transition ${
                active === link.href ? 'text-emerald-400 bg-zinc-800/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
              }`}>
              {link.label}
            </a>
          ))}
          {rightContent && (
            <div className="px-6 py-3 border-t border-zinc-800/50">{rightContent}</div>
          )}
        </div>
      )}
    </nav>
  )
}
