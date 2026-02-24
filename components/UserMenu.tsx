'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function UserMenu() {
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!user) return null

  const initial = (profile?.display_name || profile?.full_name || user.email || '?')[0].toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium flex items-center justify-center hover:bg-emerald-500/30 transition"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700">
            <p className="text-sm text-white font-medium truncate">
              {profile?.display_name || profile?.full_name || 'User'}
            </p>
            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2.5 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
