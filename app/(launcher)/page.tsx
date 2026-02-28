'use client'
import { Suspense } from 'react'
import { useAuth } from '@/components/AuthProvider'
import UserMenu from '@/components/UserMenu'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const TOOLS = [
  {
    id: 'research',
    name: 'Research',
    description: 'Stats, scouting reports, and pitch-level analysis',
    href: '/home',
    color: 'emerald',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
      </svg>
    ),
    available: true,
  },
  {
    id: 'mechanics',
    name: 'Mechanics',
    description: 'Biomechanics research and motion analysis',
    href: '/mechanics',
    color: 'blue',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    available: false,
  },
  {
    id: 'models',
    name: 'Models',
    description: 'Event modeling and probability engines',
    href: '/models',
    color: 'purple',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11h3a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V20H5v-1.6A4 4 0 0 1 3 15a4 4 0 0 1 4-4h3V9.4A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
      </svg>
    ),
    available: false,
  },
  {
    id: 'compete',
    name: 'Compete',
    description: 'Player portal and competitive tools',
    href: '/compete',
    color: 'amber',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V8a2 2 0 0 0-2-2H6v6.5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V6h-2a2 2 0 0 0-2 2v14" />
      </svg>
    ),
    available: true,
  },
  {
    id: 'visualize',
    name: 'Visualize',
    description: 'Interactive pitch visualization toolkit',
    href: '/visualize',
    color: 'cyan',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    available: true,
  },
]

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  emerald: { bg: 'hover:bg-emerald-500/5', text: 'text-emerald-400', border: 'hover:border-emerald-500/40', iconBg: 'bg-emerald-500/15' },
  blue:    { bg: 'hover:bg-blue-500/5',    text: 'text-blue-400',    border: 'hover:border-blue-500/40',    iconBg: 'bg-blue-500/15' },
  purple:  { bg: 'hover:bg-purple-500/5',  text: 'text-purple-400',  border: 'hover:border-purple-500/40',  iconBg: 'bg-purple-500/15' },
  amber:   { bg: 'hover:bg-amber-500/5',   text: 'text-amber-400',   border: 'hover:border-amber-500/40',   iconBg: 'bg-amber-500/15' },
  cyan:    { bg: 'hover:bg-cyan-500/5',   text: 'text-cyan-400',   border: 'hover:border-cyan-500/40',   iconBg: 'bg-cyan-500/15' },
  red:     { bg: 'hover:bg-red-500/5',    text: 'text-red-400',    border: 'hover:border-red-500/40',    iconBg: 'bg-red-500/15' },
}

const ADMIN_TOOL = {
  id: 'admin',
  name: 'Admin',
  description: 'Platform settings and user management',
  href: '/admin',
  color: 'red',
  icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  available: true,
}

function LauncherContent() {
  const { user, profile, permissions, loading } = useAuth()
  const searchParams = useSearchParams()
  const denied = searchParams.get('denied')
  // If no user session (preview mode or not logged in), show all tools as accessible
  const effectivePermissions = user ? permissions : ['research', 'mechanics', 'models', 'compete', 'visualize']
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'
  const visibleTools = isAdmin ? [...TOOLS, ADMIN_TOOL] : TOOLS

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex flex-col items-center mb-12 relative">
        <div className="absolute right-0 top-0"><UserMenu /></div>
        <h1 className="font-[family-name:var(--font-bebas)] text-5xl uppercase text-orange-500 tracking-widest">Triton Apex</h1>
        <p className="text-sm text-zinc-500 mt-1">Find Your Peak.</p>
      </div>

      {/* Denied alert */}
      {denied && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          You don&apos;t have access to Triton {denied.charAt(0).toUpperCase() + denied.slice(1)}. Contact an admin for access.
        </div>
      )}

      {/* Tool Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visibleTools.map(tool => {
          const hasAccess = tool.id === 'admin' || effectivePermissions.includes(tool.id)
          const colors = COLOR_MAP[tool.color]
          const locked = !hasAccess && tool.available

          return (
            <Link
              key={tool.id}
              href={hasAccess ? tool.href : '#'}
              onClick={e => { if (!hasAccess) e.preventDefault() }}
              className={`group block bg-zinc-900 border border-zinc-800 rounded-xl p-6 transition-all ${
                hasAccess ? `cursor-pointer ${colors.bg} ${colors.border}` : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full ${colors.iconBg} ${colors.text} flex items-center justify-center shrink-0`}>
                  {tool.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-[family-name:var(--font-bebas)] text-xl uppercase text-white tracking-wider">{tool.name}</h2>
                    {!tool.available && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-medium">
                        Coming Soon
                      </span>
                    )}
                    {locked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500 mt-1">{tool.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default function NeptuneLauncher() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    }>
      <LauncherContent />
    </Suspense>
  )
}
