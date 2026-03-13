'use client'

import { getPitchColor } from '@/components/chartConfig'

interface Column {
  key: string
  label: string
  format?: string
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

export default function RCTableRenderer({ props: p, width, height }: Props) {
  const columns: Column[] = p.columns || []
  const rows: Record<string, any>[] = p.rows || []
  const headerColor = p.headerColor || '#a1a1aa'
  const textColor = p.textColor || '#e4e4e7'
  const fontSize = p.fontSize || 13
  const headerFontSize = p.headerFontSize || 11
  const fontFamily = p.fontFamily || undefined
  const letterSpacing = p.letterSpacing ? `${p.letterSpacing}px` : undefined
  const lineHeight = p.lineHeight || undefined
  const textTransform = p.textTransform || undefined

  const title = p.title || ''

  if (columns.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
        Configure table columns
      </div>
    )
  }

  // Compute dynamic row height to fill bounding box
  const titleH = title ? Math.max(10, headerFontSize + 1) + 12 : 0
  const headerH = headerFontSize + 16 + 1 // header row + border
  const availableH = height - titleH - headerH
  const rowCount = Math.max(rows.length, 1)
  const rowH = Math.max(0, availableH / rowCount)

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col"
      style={{ borderRadius: p.borderRadius ?? 12, background: p.bgColor || '#09090b', fontFamily }}
    >
      {title && (
        <div
          className="text-center font-semibold uppercase tracking-wider px-2.5 shrink-0"
          style={{ color: headerColor, fontSize: Math.max(10, headerFontSize + 1), paddingTop: 6, paddingBottom: 4 }}
        >
          {title}
        </div>
      )}
      <table className="w-full border-collapse flex-1" style={{ fontSize, letterSpacing, lineHeight }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className="text-left px-2.5 font-semibold uppercase tracking-wider border-b border-zinc-800"
                style={{ color: headerColor, fontSize: headerFontSize, textTransform: textTransform as any, height: headerH }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-zinc-600 text-xs" style={{ height: rowH }}>
                No data — generate to populate
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 last:border-b-0">
                {columns.map(col => (
                  <td key={col.key} className="px-2.5" style={{ color: textColor, height: rowH }}>
                    <span className="flex items-center gap-1.5">
                      {col.key === 'pitch_name' && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: row._color || getPitchColor(row.pitch_name) }}
                        />
                      )}
                      {row[col.key] ?? '--'}
                    </span>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
