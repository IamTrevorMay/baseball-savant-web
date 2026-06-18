'use client'
import { useState, useEffect, useCallback } from 'react'
import ResearchNav from '@/components/ResearchNav'

const SEASONS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015']

interface StreakRow {
  pitcher: number
  name: string
  team: string
  outings: number
  outs: number
  ip: string
  start_date: string
  end_date: string
  active: boolean
}

interface HotData {
  year: number
  latestDate: string
  active: StreakRow[]
  completed: StreakRow[]
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`
}

function StreakTable({ rows, title, subtitle }: { rows: StreakRow[]; title: string; subtitle: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <th className="px-2 py-2 text-right w-8">#</th>
              <th className="px-2 py-2 text-left">Pitcher</th>
              <th className="px-2 py-2 text-left w-12">Tm</th>
              <th className="px-2 py-2 text-right w-14">IP</th>
              <th className="px-2 py-2 text-right w-12">G</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Span</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-600">No streaks found.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.pitcher}-${r.start_date}`} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                <td className="px-2 py-1.5 text-right text-zinc-600">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <a href={`/player/${r.pitcher}`} className="text-emerald-400 hover:text-emerald-300 transition">{r.name}</a>
                  {r.active && <span className="ml-1.5 text-[10px] text-orange-400">●</span>}
                </td>
                <td className="px-2 py-1.5 text-zinc-400">{r.team}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-white tabular-nums">{r.ip}</td>
                <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{r.outings}</td>
                <td className="px-2 py-1.5 text-right text-zinc-500 text-xs whitespace-nowrap tabular-nums">
                  {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function HotPage() {
  const [year, setYear] = useState('2026')
  const [data, setData] = useState<HotData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((y: string) => {
    setLoading(true)
    setError(null)
    fetch(`/api/hot?year=${y}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setData(null) }
        else setData(d)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  useEffect(() => { load(year) }, [year, load])

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <ResearchNav active="/hot" />
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🔥 Hot
            <span className="text-sm font-normal text-zinc-500">Relief pitcher scoreless streaks</span>
          </h1>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Season</label>
            <select
              value={year}
              onChange={e => setYear(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-zinc-600 mb-5">
          Consecutive scoreless appearances (any run breaks the streak). RP = fewer than 3 games of 50+ pitches. Regular season only.
          <span className="text-orange-400 ml-2">●</span> = streak still unbroken (last outing scoreless). League data through {data?.latestDate ? fmtDate(data.latestDate) : '…'}.
        </p>

        {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}
        {loading && <div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>}

        {!loading && data && (
          <div className="flex flex-col lg:flex-row gap-8">
            <StreakTable
              rows={data.active}
              title="Active Streaks"
              subtitle="Currently running, ranked by scoreless IP"
            />
            <StreakTable
              rows={data.completed}
              title={`Longest Completed — ${data.year}`}
              subtitle="Longest streak per pitcher this season"
            />
          </div>
        )}
      </div>
    </div>
  )
}
