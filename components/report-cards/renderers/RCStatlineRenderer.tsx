'use client'

interface Statline {
  ip: string
  h: number
  r: number
  k: number
  bb: number
  decision: string
  era: string
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

const STAT_LABELS = ['IP', 'H', 'R', 'SO', 'BB', 'W/L', 'ERA']

export default function RCStatlineRenderer({ props: p, width, height }: Props) {
  const statline: Statline = p.statline || { ip: '?', h: 0, r: 0, k: 0, bb: 0, decision: 'ND', era: '--' }
  const dynFont = Math.max(18, Math.min(36, Math.floor(height * 0.35)))
  const fontSize = p.fontSize && p.fontSize !== 18 ? p.fontSize : dynFont
  const color = p.color || '#ffffff'
  const headerColor = p.headerColor || '#a1a1aa'
  const bgColor = p.bgColor || 'rgba(255,255,255,0.04)'
  const borderRadius = p.borderRadius ?? 8
  const title = p.title || ''
  const fontFamily = p.fontFamily ? `"${p.fontFamily}", sans-serif` : undefined

  const values = [
    statline.ip,
    String(statline.h),
    String(statline.r),
    String(statline.k),
    String(statline.bb),
    statline.decision,
    statline.era,
  ]

  const titleHeight = title ? 22 : 0

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: bgColor, borderRadius, fontFamily }}
    >
      {title && (
        <div
          className="text-center font-semibold uppercase tracking-wider shrink-0 pt-1"
          style={{ fontSize: Math.max(11, fontSize * 0.5), color: headerColor }}
        >
          {title}
        </div>
      )}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-stretch" style={{ gap: 0 }}>
          {STAT_LABELS.map((label, i) => (
            <div key={label} className="flex items-stretch">
              {i > 0 && (
                <div className="w-px self-stretch my-1.5" style={{ background: 'rgba(255,255,255,0.1)' }} />
              )}
              <div className="flex flex-col items-center justify-center px-3">
                <div
                  className="uppercase tracking-wider font-medium"
                  style={{ fontSize: Math.max(10, fontSize * 0.5), color: headerColor, lineHeight: 1.2 }}
                >
                  {label}
                </div>
                <div
                  className="font-bold tabular-nums"
                  style={{ fontSize, color, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}
                >
                  {values[i]}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
