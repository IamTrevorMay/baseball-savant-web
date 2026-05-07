'use client'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  pinned?: boolean
  format?: (val: any) => string
  colorFn?: (val: any) => string
}

interface Props {
  columns: Column[]
  rows: any[]
  onRowClick?: (row: any) => void
}

export default function MobileDataTable({ columns, rows, onRowClick }: Props) {
  const pinnedCols = columns.filter(c => c.pinned)
  const scrollCols = columns.filter(c => !c.pinned)

  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-800 dark:border-zinc-800 border-gray-200 bg-zinc-900 dark:bg-zinc-900 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-zinc-800/50 dark:bg-zinc-800/50 bg-gray-100">
              {pinnedCols.map(col => (
                <th key={col.key} className="sticky left-0 z-10 bg-zinc-800 dark:bg-zinc-800 bg-gray-100 text-left px-3 py-2 text-zinc-500 font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {scrollCols.map(col => (
                <th key={col.key} className={`px-3 py-2 text-zinc-500 font-medium whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={`border-t border-zinc-800/50 dark:border-zinc-800/50 border-gray-100 ${onRowClick ? 'cursor-pointer active:bg-zinc-800/50' : ''}`}
              >
                {pinnedCols.map(col => (
                  <td key={col.key} className="sticky left-0 z-10 bg-zinc-900 dark:bg-zinc-900 bg-white px-3 py-2 text-white dark:text-white text-zinc-900 font-medium whitespace-nowrap">
                    {col.format ? col.format(row[col.key]) : row[col.key]}
                  </td>
                ))}
                {scrollCols.map(col => {
                  const val = row[col.key]
                  const color = col.colorFn?.(val) || 'text-zinc-300 dark:text-zinc-300 text-zinc-700'
                  return (
                    <td key={col.key} className={`px-3 py-2 font-mono whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${color}`}>
                      {col.format ? col.format(val) : val ?? '\u2014'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
