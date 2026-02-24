'use client'
import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const searchParams = useSearchParams()
  const router = useRouter()

  const redirectTo = searchParams.get('redirectTo') || '/'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const supabase = createClient()

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Check your email for a confirmation link.')
      }
      setLoading(false)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push(redirectTo)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-5">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-400">
          {success}
        </div>
      )}

      {mode === 'signup' && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition"
            placeholder="Your name"
          />
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

      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition"
          placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter password'}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition"
      >
        {loading
          ? (mode === 'signup' ? 'Creating account...' : 'Signing in...')
          : (mode === 'signup' ? 'Create Account' : 'Sign In')}
      </button>

      <p className="text-center text-xs text-zinc-500">
        {mode === 'login' ? (
          <>Don&apos;t have an account?{' '}
            <button type="button" onClick={() => { setMode('signup'); setError(''); setSuccess('') }} className="text-emerald-400 hover:text-emerald-300 transition">
              Sign Up
            </button>
          </>
        ) : (
          <>Already have an account?{' '}
            <button type="button" onClick={() => { setMode('login'); setError(''); setSuccess('') }} className="text-emerald-400 hover:text-emerald-300 transition">
              Sign In
            </button>
          </>
        )}
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="font-[family-name:var(--font-bebas)] text-5xl uppercase text-orange-500 tracking-widest">Triton Apex</h1>
        <p className="text-sm text-zinc-500 mt-1">Find the peak.</p>
      </div>
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
