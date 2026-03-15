'use client'

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

export default function RCStatBoxRenderer({ props: p, width, height }: Props) {
  const fontSize = p.fontSize || 44
  const labelSize = Math.max(12, fontSize * 0.36)
  const color = p.color || '#06b6d4'
  const fontFamily = p.fontFamily || undefined
  const letterSpacing = p.letterSpacing ? `${p.letterSpacing}px` : undefined
  const lineHeight = p.lineHeight || undefined
  const textTransform = p.textTransform || undefined

  return (
    <div
      className="w-full h-full flex flex-col justify-center px-5 overflow-hidden"
      style={{
        background: p.bgColor || 'rgba(255,255,255,0.04)',
        borderRadius: p.borderRadius ?? 12,
        borderLeft: `3px solid ${color}`,
        fontFamily,
      }}
    >
      <div
        className="font-semibold uppercase tracking-wider text-zinc-400"
        style={{ fontSize: labelSize, letterSpacing, textTransform: textTransform as any }}
      >
        {p.label || 'Stat'}
      </div>
      <div
        className="font-bold leading-none mt-1"
        style={{ fontSize, color, fontVariantNumeric: 'tabular-nums', lineHeight, letterSpacing }}
      >
        {p.value ?? '--'}
      </div>
    </div>
  )
}
