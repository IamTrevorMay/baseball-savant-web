'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

interface EmailPreviewFrameProps {
  html: string
  deviceMode?: 'desktop' | 'mobile'
}

export default function EmailPreviewFrame({
  html,
  deviceMode = 'desktop',
}: EmailPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [iframeHeight, setIframeHeight] = useState(600)

  // Reset loading state when HTML changes
  useEffect(() => {
    if (html) {
      setLoading(true)
    }
  }, [html])

  // Auto-resize iframe to content height
  const handleLoad = () => {
    setLoading(false)

    try {
      const iframe = iframeRef.current
      if (!iframe?.contentDocument?.body) return

      const body = iframe.contentDocument.body
      const height = body.scrollHeight
      if (height > 0) {
        setIframeHeight(height + 32) // small buffer
      }
    } catch {
      // Cross-origin or security error — use default height
    }
  }

  const isMobile = deviceMode === 'mobile'

  return (
    <div className="relative flex flex-col items-center w-full">
      {/* Device frame */}
      <div
        className={`
          relative bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden
          transition-all duration-300
          ${isMobile ? 'w-[375px]' : 'w-full max-w-[680px]'}
        `}
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              <span className="text-xs text-zinc-400">Rendering preview...</span>
            </div>
          </div>
        )}

        {/* Iframe */}
        {html ? (
          <iframe
            ref={iframeRef}
            srcDoc={html}
            onLoad={handleLoad}
            title="Email Preview"
            sandbox="allow-same-origin"
            className="w-full border-0 bg-white"
            style={{ height: `${iframeHeight}px` }}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
            No HTML to preview
          </div>
        )}
      </div>
    </div>
  )
}
