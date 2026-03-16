'use client'

import { useEffect, useRef } from 'react'
import { getPitchColor } from '@/components/chartConfig'

interface BarDataItem {
  label: string
  value: number
  color?: string
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

export default function RCBarChartRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barData: BarDataItem[] = p.barData || []
  const orientation = p.orientation || 'horizontal'
  const showValues = p.showValues !== false
  const fontSize = p.fontSize || 12
  const bgColor = p.bgColor || '#09090b'
  const title = p.title || ''

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    // Title
    let titleOffset = 0
    if (title) {
      const titleFont = Math.max(12, Math.min(20, Math.floor(Math.min(width, height) * 0.06)))
      titleOffset = titleFont + 14
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `600 ${titleFont}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(title, width / 2, 8)
    }

    if (barData.length === 0) {
      ctx.fillStyle = '#52525b'
      ctx.font = '12px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No data — generate to populate', width / 2, height / 2)
      return
    }

    // Dynamically scale font size based on container
    const dynFont = Math.max(11, Math.min(22, Math.floor(Math.min(width, height) * 0.055)))
    const effectiveFont = fontSize !== 12 ? fontSize : dynFont

    const maxVal = Math.max(...barData.map(d => d.value), 1)

    // Measure longest label to size left padding dynamically
    ctx.font = `500 ${effectiveFont}px Inter, system-ui, sans-serif`
    let maxLabelW = 80
    if (orientation === 'horizontal') {
      for (const d of barData) {
        const w = ctx.measureText(d.label).width
        if (w > maxLabelW) maxLabelW = w
      }
      maxLabelW += 14 // padding after label
    }

    const pad = { top: 15 + titleOffset, right: 15, bottom: 15, left: orientation === 'horizontal' ? maxLabelW : 30 }
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom

    if (orientation === 'horizontal') {
      const gap = 6
      const barH = (plotH - (barData.length - 1) * gap) / barData.length
      const startY = pad.top

      for (let i = 0; i < barData.length; i++) {
        const d = barData[i]
        const y = startY + i * (barH + gap)
        const barW = (d.value / maxVal) * plotW
        const color = d.color || getPitchColor(d.label)

        // Label — wrap long text to multiple lines if needed
        ctx.fillStyle = '#a1a1aa'
        ctx.font = `500 ${effectiveFont}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        const labelMaxW = pad.left - 14
        const labelW = ctx.measureText(d.label).width
        if (labelW > labelMaxW && d.label.includes(' ')) {
          // Split into two lines
          const words = d.label.split(' ')
          const mid = Math.ceil(words.length / 2)
          const line1 = words.slice(0, mid).join(' ')
          const line2 = words.slice(mid).join(' ')
          const lineH = effectiveFont * 1.15
          ctx.fillText(line1, pad.left - 8, y + barH / 2 - lineH / 2)
          ctx.fillText(line2, pad.left - 8, y + barH / 2 + lineH / 2)
        } else {
          ctx.fillText(d.label, pad.left - 8, y + barH / 2)
        }

        // Bar bg
        ctx.fillStyle = '#27272a'
        ctx.beginPath()
        ctx.roundRect(pad.left, y, plotW, barH, 4)
        ctx.fill()

        // Bar fill
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(pad.left, y, Math.max(barW, 4), barH, 4)
        ctx.fill()

        // Value — inside the bar, right-aligned near the end
        if (showValues) {
          const valText = typeof d.value === 'number' ? (d.value % 1 ? d.value.toFixed(1) : String(d.value)) : String(d.value)
          ctx.fillStyle = '#ffffff'
          ctx.font = `600 ${effectiveFont}px Inter, system-ui, sans-serif`
          ctx.textAlign = 'right'
          ctx.fillText(
            valText,
            pad.left + Math.max(barW, 4) - 8,
            y + barH / 2
          )
        }
      }
    } else {
      // Vertical bars
      const vLabelFont = Math.max(10, effectiveFont - 2)
      const labelH = vLabelFont * 2.4 // space for up to 2 wrapped lines
      const vGap = 8
      const vPad = { ...pad, bottom: 10 + labelH }
      const vPlotH = height - vPad.top - vPad.bottom
      const barW = (plotW - (barData.length - 1) * vGap) / barData.length
      const startX = vPad.left

      for (let i = 0; i < barData.length; i++) {
        const d = barData[i]
        const x = startX + i * (barW + vGap)
        const barH = (d.value / maxVal) * vPlotH
        const color = d.color || getPitchColor(d.label)

        // Bar bg
        ctx.fillStyle = '#27272a'
        ctx.beginPath()
        ctx.roundRect(x, vPad.top, barW, vPlotH, 4)
        ctx.fill()

        // Bar fill
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(x, vPad.top + vPlotH - barH, barW, Math.max(barH, 4), 4)
        ctx.fill()

        // Label — wrap to two lines if needed
        ctx.fillStyle = '#a1a1aa'
        ctx.font = `500 ${vLabelFont}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const lblW = ctx.measureText(d.label).width
        if (lblW > barW + vGap && d.label.includes(' ')) {
          const words = d.label.split(' ')
          const mid = Math.ceil(words.length / 2)
          const line1 = words.slice(0, mid).join(' ')
          const line2 = words.slice(mid).join(' ')
          const lineH = vLabelFont * 1.15
          ctx.fillText(line1, x + barW / 2, vPad.top + vPlotH + 4)
          ctx.fillText(line2, x + barW / 2, vPad.top + vPlotH + 4 + lineH)
        } else {
          ctx.fillText(d.label, x + barW / 2, vPad.top + vPlotH + 4)
        }

        // Value — inside the bar, near the top
        if (showValues) {
          const valText = typeof d.value === 'number' ? (d.value % 1 ? d.value.toFixed(1) : String(d.value)) : String(d.value)
          ctx.fillStyle = '#ffffff'
          ctx.font = `600 ${effectiveFont}px Inter, system-ui, sans-serif`
          ctx.textBaseline = 'top'
          ctx.fillText(
            valText,
            x + barW / 2,
            vPad.top + vPlotH - barH + 6
          )
        }
      }
    }
  }, [barData, width, height, orientation, showValues, fontSize, bgColor, title])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  )
}
