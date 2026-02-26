'use client'
import { useState } from 'react'
import { colName } from '@/lib/glossary'

const DISPLAY_COLS = [
  'game_date','inning','inning_topbot','balls','strikes','outs_when_up',
  'pitch_name','release_speed','release_spin_rate','pfx_x','pfx_z',
  'plate_x','plate_z','zone','description','events',
  'launch_speed','launch_angle','hit_distance_sc','bb_type',
  'estimated_ba_using_speedangle','estimated_woba_using_speedangle',
  'bat_speed','swing_length','stand'
]

type SortDir = 'asc' | 'desc'

export default function PitchLogTab({ data }: { data: any[] }) {
  const [sortCol, setSortCol] = useState('game_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const perPage = 50

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
    setPage(0)
  }

  const sorted = [...data].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const pageData = sorted.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.ceil(sorted.length / perPage)

  function fmt(val: any): string {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'number' && !Number.isInteger(val)) return val.toFixed(2)
    return String(val)
  }

  const descColor = (desc: string | null) => {
    if (!desc) return 'text-zinc-500'
    const d = desc.toLowerCase()
    if (d.includes('swinging_strike')) return 'text-emerald-400'
    if (d.includes('called_strike')) return 'text-emerald-400/70'
    if (d.includes('foul')) return 'text-yellow-400'
    if (d.includes('ball')) return 'text-red-400'
    if (d.includes('in play')) return 'text-sky-400'
    return 'text-zinc-400'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">{data.length.toLocaleString()} pitches · Sorted by {colName(sortCol)} {sortDir === 'desc' ? '↓' : '↑'}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-400 disabled:opacity-30">← Prev</button>
          <span className="text-[11px] text-zinc-500">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-400 disabled:opacity-30">Next →</button>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr>
              <th className="bg-zinc-800 px-2 py-2 text-left text-zinc-500 font-medium sticky left-0 z-10">#</th>
              {DISPLAY_COLS.map(col => (
                <th key={col} onClick={() => handleSort(col)}
                  className={`bg-zinc-800 px-2 py-2 text-right font-medium whitespace-nowrap cursor-pointer hover:text-zinc-200 transition ${
                    sortCol === col ? 'text-emerald-400' : 'text-zinc-500'
                  }`}>
                  {colName(col)} {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
              ))}
              <th className="bg-zinc-800 px-2 py-2 text-center text-zinc-500 font-medium">Vid</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition">
                <td className="px-2 py-1.5 text-zinc-600 font-mono sticky left-0 bg-zinc-900">{page * perPage + i + 1}</td>
                {DISPLAY_COLS.map(col => (
                  <td key={col} className={`px-2 py-1.5 whitespace-nowrap font-mono text-right ${
                    col === 'pitch_name' ? 'text-white font-sans font-medium' :
                    col === 'release_speed' ? 'text-amber-400' :
                    col === 'launch_speed' ? 'text-sky-400' :
                    col === 'description' ? descColor(row[col]) + ' font-sans' :
                    col === 'events' && row[col] ? 'text-emerald-400 font-sans' :
                    typeof row[col] === 'number' ? 'text-zinc-300' : 'text-zinc-500 font-sans'
                  }`}>
                    {fmt(row[col])}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  {row.game_pk && row.at_bat_number && row.pitch_number ? (
                    <button
                      onClick={() => window.open(`/api/play-video?game_pk=${row.game_pk}&ab=${row.at_bat_number}&pitch=${row.pitch_number}`, '_blank')}
                      className="text-zinc-600 hover:text-emerald-400 transition"
                      title="Watch pitch video"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z" />
                      </svg>
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
