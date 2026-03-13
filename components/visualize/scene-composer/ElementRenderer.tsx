'use client'

import { useRef, useState, useEffect } from 'react'
import { SceneElement } from '@/lib/sceneTypes'
import PitchFlightRenderer from './PitchFlightRenderer'
import StadiumRenderer from './StadiumRenderer'
import ZonePlotRenderer from './ZonePlotRenderer'
import MovementPlotRenderer from './MovementPlotRenderer'
import RCStatBoxRenderer from '@/components/report-cards/renderers/RCStatBoxRenderer'
import RCTableRenderer from '@/components/report-cards/renderers/RCTableRenderer'
import RCHeatmapRenderer from '@/components/report-cards/renderers/RCHeatmapRenderer'
import RCBarChartRenderer from '@/components/report-cards/renderers/RCBarChartRenderer'
import RCDonutChartRenderer from '@/components/report-cards/renderers/RCDonutChartRenderer'
import RCStatlineRenderer from '@/components/report-cards/renderers/RCStatlineRenderer'

// ── Ticker Renderer ──────────────────────────────────────────────────────────

function TickerRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const speed = (p.speed || 60) / 60
    const dir = p.direction === 'right' ? 1 : -1
    let last = 0

    function tick(ts: number) {
      if (!last) last = ts
      const dt = ts - last
      last = ts
      setOffset(prev => prev + dir * speed * (dt / 16.67))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [p.speed, p.direction])

  const text = p.text || 'Ticker text here'
  const doubled = `${text}${p.separator || ' \u2022 '}${text}${p.separator || ' \u2022 '}`

  const textStyle: React.CSSProperties = {}
  if (p.fontFamily) textStyle.fontFamily = `"${p.fontFamily}", sans-serif`
  if (p.textTransform && p.textTransform !== 'none') textStyle.textTransform = p.textTransform as any
  if (p.textShadowBlur > 0) {
    textStyle.textShadow = `${p.textShadowOffsetX || 0}px ${p.textShadowOffsetY || 0}px ${p.textShadowBlur}px ${p.textShadowColor || '#06b6d4'}`
  }

  return (
    <div
      className="w-full h-full overflow-hidden flex items-center"
      style={{ backgroundColor: p.showBg !== false ? (p.bgColor || '#09090b') : 'transparent' }}
    >
      <div
        ref={scrollRef}
        className="whitespace-nowrap"
        style={{
          fontSize: p.fontSize || 20,
          fontWeight: p.fontWeight || 600,
          color: p.color || '#ffffff',
          transform: `translateX(${offset % (width * 2)}px)`,
          ...textStyle,
        }}
      >
        {doubled}
      </div>
    </div>
  )
}

// ── Path Renderer ───────────────────────────────────────────────────────────

function PathRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <path
        d={p.pathData || ''}
        fill={p.fill || 'transparent'}
        stroke={p.stroke || '#06b6d4'}
        strokeWidth={p.strokeWidth || 2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Curved Text Renderer ────────────────────────────────────────────────────

function CurvedTextRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  const text = p.text || 'Curved Text'
  const radius = p.radius || 120
  const arc = p.arc || 180
  const startAngle = p.startAngle || 0
  const cx = width / 2
  const cy = height / 2

  // Build SVG arc path for textPath
  const arcRad = (arc * Math.PI) / 180
  const startRad = ((startAngle - 90) * Math.PI) / 180 - arcRad / 2
  const endRad = startRad + arcRad

  const x1 = cx + radius * Math.cos(startRad)
  const y1 = cy + radius * Math.sin(startRad)
  const x2 = cx + radius * Math.cos(endRad)
  const y2 = cy + radius * Math.sin(endRad)

  const largeArc = Math.abs(arc) > 180 ? 1 : 0
  const sweep = arc >= 0 ? 1 : 0

  const pathId = `curved-${Math.random().toString(36).slice(2, 8)}`
  const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`

  const fontFamily = p.fontFamily ? `"${p.fontFamily}", sans-serif` : 'inherit'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <defs>
        <path id={pathId} d={d} fill="none" />
      </defs>
      <text
        fill={p.color || '#ffffff'}
        fontSize={p.fontSize || 24}
        fontWeight={p.fontWeight || 600}
        fontFamily={fontFamily}
        textAnchor="middle"
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {text}
        </textPath>
      </text>
    </svg>
  )
}

// ── Group Renderer (transparent, children render independently) ─────────────

function GroupRenderer() {
  return null
}

// ── Element Renderers ──────────────────────────────────────────────────────────

function StatCardRenderer({ props: p }: { props: Record<string, any> }) {
  const variantStyles: Record<string, React.CSSProperties> = {
    glass: {
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: `3px solid ${p.color}`,
    },
    solid: {
      background: 'rgba(0,0,0,0.7)',
      borderTop: `3px solid ${p.color}`,
    },
    outline: {
      background: 'transparent',
      border: `2px solid ${p.color}`,
    },
  }
  const style = { ...(variantStyles[p.variant] || variantStyles.glass) }
  if (p.bgColor && p.bgColor !== 'transparent') {
    style.background = p.bgColor
  }
  const radius = p.borderRadius ?? 12

  const textStyle: React.CSSProperties = {}
  if (p.fontFamily) textStyle.fontFamily = `"${p.fontFamily}", sans-serif`
  if (p.textTransform && p.textTransform !== 'none') textStyle.textTransform = p.textTransform as any
  if (p.textShadowBlur > 0) {
    textStyle.textShadow = `${p.textShadowOffsetX || 0}px ${p.textShadowOffsetY || 0}px ${p.textShadowBlur}px ${p.textShadowColor || '#06b6d4'}`
  }

  return (
    <div className="w-full h-full flex flex-col justify-center px-5 overflow-hidden" style={{ ...style, borderRadius: radius }}>
      <div
        className="font-semibold uppercase tracking-wider text-zinc-400"
        style={{ fontSize: Math.max(10, p.fontSize * 0.26), ...textStyle }}
      >
        {p.label}
      </div>
      <div
        className="font-bold leading-none mt-1"
        style={{ fontSize: p.fontSize, color: p.color, fontVariantNumeric: 'tabular-nums', ...textStyle }}
      >
        {p.value}
      </div>
      {p.sublabel && (
        <div className="text-zinc-500 mt-1.5" style={{ fontSize: Math.max(10, p.fontSize * 0.28), ...textStyle }}>
          {p.sublabel}
        </div>
      )}
    </div>
  )
}

function TextRenderer({ props: p }: { props: Record<string, any> }) {
  const textStyle: React.CSSProperties = {}
  if (p.fontFamily) textStyle.fontFamily = `"${p.fontFamily}", sans-serif`
  if (p.textTransform && p.textTransform !== 'none') textStyle.textTransform = p.textTransform as any
  if (p.textShadowBlur > 0) {
    textStyle.textShadow = `${p.textShadowOffsetX || 0}px ${p.textShadowOffsetY || 0}px ${p.textShadowBlur}px ${p.textShadowColor || '#06b6d4'}`
  }

  return (
    <div
      className="w-full h-full flex items-center overflow-hidden"
      style={{
        justifyContent: p.textAlign === 'center' ? 'center' : p.textAlign === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          fontSize: p.fontSize,
          fontWeight: p.fontWeight,
          color: p.color,
          textAlign: p.textAlign,
          width: '100%',
          lineHeight: p.lineHeight || 1.2,
          letterSpacing: p.letterSpacing ? `${p.letterSpacing}px` : undefined,
          ...textStyle,
        }}
      >
        {p.text}
      </div>
    </div>
  )
}

function ShapeRenderer({ props: p }: { props: Record<string, any> }) {
  const bg = p.gradient ? p.gradient : p.fill
  const isGradient = p.gradient && p.gradient.length > 0
  return (
    <div
      className="w-full h-full"
      style={{
        ...(isGradient ? { background: bg } : { backgroundColor: bg }),
        border: p.strokeWidth > 0 ? `${p.strokeWidth}px solid ${p.stroke}` : undefined,
        borderRadius: p.shape === 'circle' ? '50%' : p.borderRadius,
      }}
    />
  )
}

function PlayerImageRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  const imgUrl = p.playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
    : null
  const imgH = p.showLabel && p.playerName ? height - 28 : height
  const imgBorderW = p.borderWidth > 0 ? p.borderWidth : 2
  const imgRadius = p.borderRadius ?? 12

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div
        className="flex-1 w-full flex items-center justify-center overflow-hidden"
        style={{ border: `${imgBorderW}px solid ${p.borderColor}`, height: imgH, borderRadius: imgRadius }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={p.playerName} className="w-full h-full object-cover" />
        ) : (
          <div className="text-zinc-600 text-4xl">{'\u25c9'}</div>
        )}
      </div>
      {p.showLabel && p.playerName && (
        <div className="text-xs font-medium text-white text-center truncate w-full mt-1">{p.playerName}</div>
      )}
    </div>
  )
}

function ComparisonBarRenderer({ props: p, height }: { props: Record<string, any>; height: number }) {
  const pct = Math.min(100, Math.max(0, (p.value / p.maxValue) * 100))
  const labelSize = p.fontSize > 0 ? p.fontSize : Math.max(10, Math.min(16, height * 0.28))
  const barH = Math.max(6, height * 0.35)
  const gap = Math.max(2, height * 0.06)
  const barBg = p.barBgColor || '#27272a'

  const textStyle: React.CSSProperties = {}
  if (p.fontFamily) textStyle.fontFamily = `"${p.fontFamily}", sans-serif`
  if (p.textTransform && p.textTransform !== 'none') textStyle.textTransform = p.textTransform as any
  if (p.textShadowBlur > 0) {
    textStyle.textShadow = `${p.textShadowOffsetX || 0}px ${p.textShadowOffsetY || 0}px ${p.textShadowBlur}px ${p.textShadowColor || '#06b6d4'}`
  }

  return (
    <div className="w-full h-full flex flex-col justify-center px-1" style={{ gap }}>
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 font-medium" style={{ fontSize: labelSize, ...textStyle }}>{p.label}</span>
        {p.showValue && (
          <span className="text-white font-bold" style={{ fontSize: labelSize, fontVariantNumeric: 'tabular-nums', ...textStyle }}>
            {p.value}
          </span>
        )}
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: barH, backgroundColor: barBg }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
      </div>
    </div>
  )
}

function ImageRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  const fit = p.objectFit || 'cover'
  if (!p.src) {
    return (
      <div className="w-full h-full bg-zinc-800/50 border border-dashed border-zinc-600 flex flex-col items-center justify-center text-zinc-500 gap-1">
        <span className="text-2xl">{'\u25a3'}</span>
        <span className="text-[10px]">No image</span>
      </div>
    )
  }
  return (
    <img
      src={p.src}
      alt=""
      className="w-full h-full"
      style={{ objectFit: fit as any }}
      draggable={false}
    />
  )
}

// ── Main Export ──────────────────────────────────────────────────────────────

export default function renderElementContent(el: SceneElement) {
  switch (el.type) {
    case 'stat-card':
      return <StatCardRenderer props={el.props} />
    case 'text':
      return <TextRenderer props={el.props} />
    case 'shape':
      return <ShapeRenderer props={el.props} />
    case 'player-image':
      return <PlayerImageRenderer props={el.props} width={el.width} height={el.height} />
    case 'image':
      return <ImageRenderer props={el.props} width={el.width} height={el.height} />
    case 'comparison-bar':
      return <ComparisonBarRenderer props={el.props} height={el.height} />
    case 'pitch-flight':
      return <PitchFlightRenderer props={el.props} width={el.width} height={el.height} />
    case 'stadium':
      return <StadiumRenderer props={el.props} width={el.width} height={el.height} />
    case 'ticker':
      return <TickerRenderer props={el.props} width={el.width} height={el.height} />
    case 'zone-plot':
      return <ZonePlotRenderer props={el.props} width={el.width} height={el.height} />
    case 'movement-plot':
      return <MovementPlotRenderer props={el.props} width={el.width} height={el.height} />
    case 'path':
      return <PathRenderer props={el.props} width={el.width} height={el.height} />
    case 'curved-text':
      return <CurvedTextRenderer props={el.props} width={el.width} height={el.height} />
    case 'group':
      return <GroupRenderer />
    case 'rc-stat-box':
      return <RCStatBoxRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-table':
      return <RCTableRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-heatmap':
      return <RCHeatmapRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-zone-plot':
      return <ZonePlotRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-movement-plot':
      return <MovementPlotRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-bar-chart':
      return <RCBarChartRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-donut-chart':
      return <RCDonutChartRenderer props={el.props} width={el.width} height={el.height} />
    case 'rc-statline':
      return <RCStatlineRenderer props={el.props} width={el.width} height={el.height} />
    default:
      return <div className="w-full h-full bg-zinc-800/50 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 text-xs">Unknown</div>
  }
}
