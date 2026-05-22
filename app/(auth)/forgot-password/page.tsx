'use client'
import { useState } from 'react'
import Link from 'next/link'
import TridentLogo from '@/components/TridentLogo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to send reset email')
      } else {
        setSent(true)
      }
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center mb-8">
        <TridentLogo className="w-16 h-20 text-orange-500 mb-3" />
        <h1 className="font-[family-name:var(--font-bebas)] text-5xl uppercase text-orange-500 tracking-widest">Triton Apex</h1>
        <p className="text-sm text-zinc-500 mt-1">Reset your password.</p>
      </div>

      {sent ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-400">
            If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent.
          </div>
          <Link href="/login" className="block text-center text-sm text-zinc-400 hover:text-emerald-400 transition">
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <Link href="/login" className="block text-center text-sm text-zinc-500 hover:text-emerald-400 transition">
            ← Back to sign in
          </Link>
        </form>
      )}
    </div>
  )
}
