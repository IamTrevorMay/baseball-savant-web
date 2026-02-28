'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/')
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="font-[family-name:var(--font-bebas)] text-5xl uppercase text-orange-500 tracking-widest">Triton Apex</h1>
        <p className="text-sm text-zinc-500 mt-1">Set your password to get started.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">New Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition"
            placeholder="Min 6 characters"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition"
            placeholder="Re-enter password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition"
        >
          {loading ? 'Setting password...' : 'Set Password'}
        </button>
      </form>
    </div>
  )
}
