'use client'

// Compete Trends — map an athlete's historical data on one timeline to
// surface correlations. Filter sidebar on the left (athlete, bucket, range,
// and one multi-select dropdown per source: Wearable, Biomechanics, Pitch
// Level, Pro Ball Data); chart + Pearson correlation panel on the right.
//
// Athletes see their own data; owner/admin get an athlete picker (server
// enforces both).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { isAdminRole } from '@/lib/roles'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS } from '@/components/chartConfig'
import {
  COMPETE_TREND_METRICS, TREND_METRIC_BY_KEY, TREND_GROUPS, TREND_BUCKETS,
  MAX_COMPETE_TREND_METRICS, type TrendBucket, type TrendPoint, type TrendSeries,
} from '@/lib/compete/trendsCatalog'

const LINE_COLORS = [COLORS.emerald, COLORS.sky, COLORS.amber, COLORS.purple, COLORS.rose, COLORS.cyan]

const RANGES = [
  { key: '90d', label: 'Last 90 Days', days: 90 },
  { key: '1y', label: 'Last Year', days: 365 },
  { key: 'all', label: 'All Time', days: null as number | null },
]

/** Pearson r over bucket-aligned pairs (both metrics present in the bucket). */
function pearson(a: TrendPoint[], b: TrendPoint[]): { r: number | null; n: number } {
  const bByX = new Map(b.map(p => [p.x, p.value]))
  const pairs = a.filter(p => bByX.has(p.x)).map(p => [p.value, bByX.get(p.x)!] as const)
  const n = pairs.length
  if (n < 3) return { r: null, n }
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n
  const my = pairs.reduce((s, p) => s + p[1], 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2 }
  const den = Math.sqrt(sxx * syy)
  return { r: den === 0 ? null : sxy / den, n }
}

const rColor = (r: number) =>
  Math.abs(r) >= 0.7 ? (r > 0 ? 'text-emerald-400' : 'text-red-400')
  : Math.abs(r) >= 0.4 ? (r > 0 ? 'text-emerald-500/80' : 'text-red-400/80')
  : 'text-zinc-500'

interface AthleteOption { athleteId: string; name: string }

/** Dropdown multi-select: button with a selected-count badge, checkbox panel. */
function MultiSelectMenu({ label, options, selected, onToggle, disabledReason, atCap }: {
  label: string
  options: { key: string; label: string; pending?: string }[]
  selected: string[]
  onToggle: (key: string) => void
  disabledReason: (key: string) => string | null
  atCap: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const count = options.filter(o => selected.includes(o.key)).length

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition ${
          count > 0 ? 'border-amber-500/40 bg-amber-500/5 text-zinc-100' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-zinc-100'
        }`}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] font-semibold bg-amber-500/90 text-zinc-950 rounded-full px-1.5 py-0.5">{count}</span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1">
          {options.map(o => {
            const on = selected.includes(o.key)
            const reason = disabledReason(o.key)
            const blocked = !!reason || (!on && atCap)
            return (
              <button
                key={o.key}
                onClick={() => !blocked && onToggle(o.key)}
                title={reason || (!on && atCap ? `Max ${MAX_COMPETE_TREND_METRICS} metrics` : undefined)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition ${
                  blocked ? 'text-zinc-600 cursor-not-allowed' : on ? 'text-amber-300' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                  on ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'
                }`}>
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="4"
                      strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CompeteTrendsPage() {
  const { profile } = useAuth()
  const admin = isAdminRole(profile?.role)

  const [athletes, setAthletes] = useState<AthleteOption[]>([])
  const [athleteId, setAthleteId] = useState<string>('')
  const [selected, setSelected] = useState<string[]>(['whoop.recovery'])
  const [bucket, setBucket] = useState<TrendBucket>('day')
  const [range, setRange] = useState('1y')
  const [series, setSeries] = useState<TrendSeries>({})
  const [hasProLink, setHasProLink] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Admin: load roster for the picker
  useEffect(() => {
    if (!admin) return
    fetch('/api/compete/admin/athletes').then(r => r.json()).then(d => {
      const rows = (d.athletes || []).map((a: any) => ({ athleteId: a.athleteId, name: a.name }))
      setAthletes(rows)
      if (rows.length && !athleteId) setAthleteId(rows[0].athleteId)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  useEffect(() => {
    if (!selected.length || (admin && !athleteId)) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true); setError(null)
      try {
        const days = RANGES.find(r => r.key === range)?.days
        const params = new URLSearchParams({ metrics: selected.join(','), bucket })
        if (days) params.set('start', new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10))
        if (admin && athleteId) params.set('athleteId', athleteId)
        const res = await fetch(`/api/compete/trends?${params}`, { signal: controller.signal })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
        setSeries(json.series)
        setHasProLink(json.hasProLink)
      } catch (e: any) {
        if (e.name !== 'AbortError') { setError(e.message); setSeries({}) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(t); controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(','), bucket, range, athleteId, admin])

  const toggle = (k: string) =>
    setSelected(prev => prev.includes(k)
      ? prev.filter(m => m !== k)
      : prev.length < MAX_COMPETE_TREND_METRICS ? [...prev, k] : prev)

  const disabledReason = (k: string): string | null => {
    const m = TREND_METRIC_BY_KEY.get(k)
    if (m?.pending) return m.pending
    if (k.startsWith('pro.') && !hasProLink) return 'No MLBAM player link on this athlete profile'
    return null
  }

  const { traces, needY2, leftUnit, rightUnit } = useMemo(() => {
    const units: string[] = []
    for (const k of selected) {
      const u = TREND_METRIC_BY_KEY.get(k)?.unit ?? ''
      if (!units.includes(u)) units.push(u)
    }
    const traces = selected.flatMap((k, i) => {
      const def = TREND_METRIC_BY_KEY.get(k)
      const pts = series[k] || []
      if (!def || !pts.length) return []
      const sparse = pts.length <= 12
      return [{
        x: pts.map(p => p.x),
        y: pts.map(p => p.value),
        customdata: pts.map(p => p.n),
        name: def.label,
        mode: 'lines+markers',
        line: { color: LINE_COLORS[i % LINE_COLORS.length], width: 2 },
        marker: { size: sparse ? 7 : 4, color: LINE_COLORS[i % LINE_COLORS.length] },
        connectgaps: true,
        yaxis: def.unit === units[0] ? 'y' : 'y2',
        hovertemplate: `%{y:.2f} ${def.unit} <span style="color:#71717a">(n=%{customdata})</span><extra>${def.label}</extra>`,
      }]
    })
    return { traces, needY2: units.length > 1, leftUnit: units[0] ?? '', rightUnit: units[1] ?? '' }
  }, [series, selected])

  const layout = useMemo(() => ({
    ...BASE_LAYOUT,
    margin: { t: 48, r: needY2 ? 55 : 25, b: 45, l: 55 },
    hovermode: 'x unified',
    xaxis: { ...BASE_LAYOUT.xaxis, type: 'date' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: { text: leftUnit, font: { size: 10 } } },
    ...(needY2 ? {
      yaxis2: { ...BASE_LAYOUT.yaxis, title: { text: rightUnit, font: { size: 10 } }, overlaying: 'y', side: 'right', gridcolor: 'rgba(0,0,0,0)' },
    } : {}),
    legend: { ...BASE_LAYOUT.legend, orientation: 'h', y: 1.12 },
  }), [needY2, leftUnit, rightUnit])

  // Correlation matrix over selected metrics with data
  const corr = useMemo(() => {
    const keys = selected.filter(k => (series[k] || []).length >= 3)
    if (keys.length < 2) return null
    const cells: { a: string; b: string; r: number | null; n: number }[] = []
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++)
        cells.push({ a: keys[i], b: keys[j], ...pearson(series[keys[i]], series[keys[j]]) })
    return cells
  }, [series, selected])

  const sidebarSelect = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200'

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      <h1 className="text-xl font-semibold text-white mb-1">Trends</h1>
      <p className="text-sm text-zinc-500 mb-6">Overlay your history — recovery, sleep, mechanics, and ball data — to see what moves together.</p>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Filter sidebar */}
        <aside className="w-full md:w-64 shrink-0 space-y-4 md:sticky md:top-6">
          {admin && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Athlete</div>
              <select value={athleteId} onChange={e => setAthleteId(e.target.value)} className={sidebarSelect}>
                {athletes.map(a => <option key={a.athleteId} value={a.athleteId}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Time Range</div>
            <select value={range} onChange={e => setRange(e.target.value)} className={sidebarSelect}>
              {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Grouping</div>
            <select value={bucket} onChange={e => setBucket(e.target.value as TrendBucket)} className={sidebarSelect}>
              {TREND_BUCKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Metrics</div>
              <span className="text-[10px] text-zinc-600">{selected.length}/{MAX_COMPETE_TREND_METRICS}</span>
            </div>
            {TREND_GROUPS.map(g => (
              <MultiSelectMenu
                key={g}
                label={g}
                options={COMPETE_TREND_METRICS.filter(m => m.group === g)}
                selected={selected}
                onToggle={toggle}
                disabledReason={disabledReason}
                atCap={selected.length >= MAX_COMPETE_TREND_METRICS}
              />
            ))}
            {selected.length > 0 && (
              <button onClick={() => setSelected([])}
                className="w-full text-[11px] text-zinc-500 hover:text-zinc-300 transition text-left px-1">
                Clear all
              </button>
            )}
          </div>
        </aside>

        {/* Chart + correlation */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/50 rounded-xl">
                <div className="text-xs text-zinc-400 animate-pulse">Loading…</div>
              </div>
            )}
            {error ? (
              <div className="p-10 text-center text-sm text-red-400">{error}</div>
            ) : !selected.length ? (
              <div className="p-10 text-center text-sm text-zinc-500">Pick metrics from the menus on the left to start charting.</div>
            ) : !loading && !traces.length ? (
              <div className="p-10 text-center text-sm text-zinc-500">
                No data for this selection yet — data appears as it's collected (Whoop syncs nightly; mocap after each Neptune session).
              </div>
            ) : (
              <div style={{ height: 480 }}>
                <Plot data={traces} layout={layout} config={{ displaylogo: false }} />
              </div>
            )}
          </div>

          {corr && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-1">Correlation</h2>
              <p className="text-[11px] text-zinc-600 mb-3">
                Pearson r over {TREND_BUCKETS.find(b => b.value === bucket)?.label.toLowerCase()} buckets where both metrics have data. Correlation is a lead, not a conclusion — small n especially.
              </p>
              <div className="space-y-1">
                {corr.map(c => (
                  <div key={`${c.a}|${c.b}`} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-300 w-72 truncate">
                      {TREND_METRIC_BY_KEY.get(c.a)?.label} × {TREND_METRIC_BY_KEY.get(c.b)?.label}
                    </span>
                    {c.r == null ? (
                      <span className="text-zinc-600 text-xs">not enough overlap (n={c.n})</span>
                    ) : (
                      <>
                        <span className={`font-mono font-semibold ${rColor(c.r)}`}>{c.r >= 0 ? '+' : ''}{c.r.toFixed(2)}</span>
                        <span className="text-[11px] text-zinc-600">n={c.n}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
