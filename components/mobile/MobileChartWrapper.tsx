'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

const Plot: any = dynamic(() => import('react-plotly.js'), { ssr: false })

interface Props {
  data: any[]
  layout?: Record<string, any>
  config?: Record<string, any>
  title?: string
  height?: number
}

const MOBILE_DEFAULTS: Record<string, any> = {
  displayModeBar: false,
  responsive: true,
  staticPlot: false,
  scrollZoom: false,
}

const MOBILE_LAYOUT_DEFAULTS: Record<string, any> = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#a1a1aa', size: 11 },
  margin: { t: 30, r: 12, b: 40, l: 40 },
}

export default function MobileChartWrapper({ data, layout, config, title, height = 260 }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const handleLoad = useCallback(() => setLoaded(true), [])
  const handleExpand = useCallback(() => setFullscreen(true), [])
  const handleClose = useCallback(() => setFullscreen(false), [])

  const mergedLayout: Record<string, any> = {
    ...MOBILE_LAYOUT_DEFAULTS,
    ...layout,
    font: { ...MOBILE_LAYOUT_DEFAULTS.font, ...(layout?.font || {}) },
    margin: { ...MOBILE_LAYOUT_DEFAULTS.margin, ...(layout?.margin || {}) },
    height,
    width: undefined,
    autosize: true,
  }

  const mergedConfig: Record<string, any> = {
    ...MOBILE_DEFAULTS,
    ...config,
  }

  // Tap-to-load placeholder
  if (!loaded) {
    return (
      <button
        onClick={handleLoad}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 flex flex-col items-center justify-center gap-2 active:bg-zinc-800/80 transition"
        style={{ height }}
      >
        <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <span className="text-xs text-zinc-500">Tap to load chart</span>
        {title && <span className="text-[10px] text-zinc-600">{title}</span>}
      </button>
    )
  }

  // Fullscreen modal
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 h-11 border-b border-zinc-800 shrink-0">
          {title && <span className="text-sm font-medium text-white truncate">{title}</span>}
          <button
            onClick={handleClose}
            className="p-1.5 -mr-1.5 text-zinc-400 hover:text-white transition"
            aria-label="Close fullscreen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Chart filling remaining space */}
        <div className="flex-1 min-h-0 p-2">
          <Plot
            data={data}
            layout={{
              ...mergedLayout,
              height: undefined,
              autosize: true,
              font: { ...(mergedLayout.font || {}), size: 13 },
              margin: { t: 30, r: 16, b: 50, l: 50 },
            }}
            config={mergedConfig}
            useResizeHandler={true}
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    )
  }

  // Normal inline view
  return (
    <div className="relative w-full">
      <Plot
        data={data}
        layout={mergedLayout}
        config={mergedConfig}
        useResizeHandler={true}
        className="w-full"
        style={{ width: '100%', height }}
      />
      {/* Expand button */}
      <button
        onClick={handleExpand}
        className="absolute top-1 right-1 p-1.5 rounded bg-zinc-800/80 text-zinc-400 hover:text-white transition"
        aria-label="Expand chart"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      </button>
    </div>
  )
}
