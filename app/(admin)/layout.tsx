'use client'
import { useAuth } from '@/components/AuthProvider'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import UserMenu from '@/components/UserMenu'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/login?redirectTo=/admin')
      return
    }
    if (profile && profile.role !== 'owner' && profile.role !== 'admin') {
      router.push('/?denied=admin')
    }
  }, [user, profile, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-zinc-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user || !profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return null
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="font-[family-name:var(--font-bebas)] text-xl uppercase tracking-widest">
            <span className="text-orange-500">Triton Apex</span>
            <span className="text-zinc-600 mx-2">/</span>
            <span className="text-red-400">Admin</span>
          </h1>
        </div>
        <UserMenu />
      </header>
      <main>{children}</main>
    </div>
  )
}
