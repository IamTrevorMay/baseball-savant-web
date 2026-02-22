'use client'
import dynamic from 'next/dynamic'
import React from 'react'

const PlotlyPlot = dynamic(() => import('react-plotly.js'), { ssr: false })

export default function Plot(props: any) {
  return (
    <PlotlyPlot
      {...props}
      useResizeHandler={true}
      style={{ width: '100%', height: '100%', minHeight: '350px', ...props.style }}
      config={{ responsive: true, displayModeBar: false, ...props.config }}
      layout={{
        ...props.layout,
        autosize: true,
      }}
    />
  )
}
