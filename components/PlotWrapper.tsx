'use client'
import dynamic from 'next/dynamic'
import React, { useCallback, useRef } from 'react'

const PlotlyPlot = dynamic(() => import('react-plotly.js'), { ssr: false })

export default function Plot(props: any) {
  const plotRef = useRef<any>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Find the Plotly graph div inside the wrapper
    const el = (e.currentTarget as HTMLElement).querySelector('.js-plotly-plot') as any
    if (!el) return
    e.preventDefault()

    // Use Plotly's built-in toImage to download as PNG
    import('plotly.js').then((Plotly) => {
      Plotly.downloadImage(el, {
        format: 'png',
        width: el.offsetWidth * 2,
        height: el.offsetHeight * 2,
        scale: 2,
        filename: 'chart',
      })
    }).catch(() => {
      // Fallback: try window.Plotly
      const P = (window as any).Plotly
      if (P?.downloadImage) {
        P.downloadImage(el, {
          format: 'png',
          width: el.offsetWidth * 2,
          height: el.offsetHeight * 2,
          scale: 2,
          filename: 'chart',
        })
      }
    })
  }, [])

  // Ensure toImage is never in the remove list
  const config = { ...props.config }
  if (config.modeBarButtonsToRemove) {
    config.modeBarButtonsToRemove = config.modeBarButtonsToRemove.filter(
      (b: string) => b !== 'toImage'
    )
  }

  return (
    <div onContextMenu={handleContextMenu} style={{ width: '100%', height: '100%' }}>
      <PlotlyPlot
        {...props}
        ref={plotRef}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%', minHeight: '350px', ...props.style }}
        config={{ responsive: true, displayModeBar: 'hover', ...config }}
        layout={{
          ...props.layout,
          autosize: true,
        }}
      />
    </div>
  )
}
