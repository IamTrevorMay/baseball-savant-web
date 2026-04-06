'use client'

import { useState } from 'react'

export default function NewsletterPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Something went wrong.')
        return
      }

      setStatus('success')
      setMessage("You're in. Check your inbox tomorrow morning.")
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  return (
    <main className="w-full max-w-md px-6 py-20 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
        MAYDAY DAILY
      </h1>
      <p className="text-zinc-400 mb-10">
        Scores, standouts, and trends — delivered every morning.
      </p>

      {status === 'success' ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-6 py-5">
          <p className="text-emerald-400 font-medium">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
          </button>
          {status === 'error' && (
            <p className="text-red-400 text-sm">{message}</p>
          )}
        </form>
      )}

      <p className="text-zinc-600 text-xs mt-8">
        Free. Unsubscribe anytime.
      </p>
    </main>
  )
}
