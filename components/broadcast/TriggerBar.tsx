'use client'

import { useState } from 'react'
import { useBroadcast } from './BroadcastContext'

export default function TriggerBar() {
  const { session, goLive, endSession } = useBroadcast()
  const [goingLive, setGoingLive] = useState(false)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGoLive() {
    setGoingLive(true)
    const sessionId = await goLive()
    if (sessionId) {
      const url = `${window.location.origin}/overlay/${sessionId}`
      setOverlayUrl(url)
    }
    setGoingLive(false)
  }

  async function handleEndSession() {
    await endSession()
    setOverlayUrl(null)
  }

  function copyUrl() {
    if (!overlayUrl) return
    navigator.clipboard.writeText(overlayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-10 bg-zinc-900 border-t border-zinc-800 flex items-center justify-end px-4 gap-3">
      {/* Session status */}
      {session && (
        <div className="flex items-center gap-1.5 mr-auto">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-zinc-400 font-medium">LIVE</span>
        </div>
      )}

      {/* Overlay URL */}
      {overlayUrl && (
        <button
          onClick={copyUrl}
          className="px-2.5 py-1 text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition"
        >
          {copied ? 'Copied!' : 'Copy OBS URL'}
        </button>
      )}

      {/* Go Live / End */}
      {!session ? (
        <button
          onClick={handleGoLive}
          disabled={goingLive}
          className="px-4 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
        >
          <div className="w-2 h-2 rounded-full bg-white" />
          {goingLive ? 'Starting...' : 'Go Live'}
        </button>
      ) : (
        <button
          onClick={handleEndSession}
          className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold rounded-lg transition"
        >
          End Session
        </button>
      )}
    </div>
  )
}
