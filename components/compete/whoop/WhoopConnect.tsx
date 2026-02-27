'use client'

import { useState } from 'react'

interface Props {
  onConnected?: () => void
  onDisconnected?: () => void
  connected: boolean
}

export default function WhoopConnect({ onConnected, onDisconnected, connected }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    try {
      const res = await fetch('/api/compete/whoop/connect')
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect WHOOP? This will remove all cached recovery data.')) return
    setLoading(true)
    try {
      await fetch('/api/compete/whoop/disconnect', { method: 'POST' })
      onDisconnected?.()
    } catch {
      // ignore
    }
    setLoading(false)
  }

  if (connected) {
    return (
      <button
        onClick={handleDisconnect}
        disabled={loading}
        className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition disabled:opacity-50"
      >
        {loading ? 'Disconnecting...' : 'Disconnect WHOOP'}
      </button>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center mb-4 mx-auto">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      </div>
      <h3 className="text-base font-semibold text-white mb-1">Connect WHOOP</h3>
      <p className="text-xs text-zinc-500 mb-5 max-w-xs mx-auto">
        Link your WHOOP account to track recovery, sleep, and strain data alongside your training schedule.
      </p>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition text-sm disabled:opacity-50"
      >
        {loading ? 'Connecting...' : 'Connect WHOOP Account'}
      </button>
    </div>
  )
}
