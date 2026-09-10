'use client'

// Trends Visualizer — line charts of how a pitcher's stuff, usage, and
// results move over time. Media-group cousin of Trend Alerts: that page
// surfaces who changed recently; this one lets you draw the change for a
// chosen player, over any window, as a presentable chart.
//
// Two series modes: "By Pitch Type" plots one metric with a color-coded line
// per pitch (the pitch-usage story), "By Metric" plots several metrics as
// player-level lines, with a second Y axis when their units differ. Buckets
// are calendar months or individual appearances; appearance-level noise can
// be tamed with a trailing rolling average drawn over the faded raw line.
//
// Data comes from /api/trends-viz (server-side SQL over `pitches`,
// regular-season only). Hitters are planned as a follow-up once this shell
// is proven.

import { useState, useEffect, useMemo } from 'react'
import ResearchNav from '@/components/ResearchNav'
import PlayerSearchInput from '@/components/PlayerSearchInput'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '@/components/chartConfig'
import {
  TREND_METRICS, TREND_METRIC_GROUPS, MAX_TREND_METRICS, MIN_PITCHES_PER_LINE,
  type TrendsMode, type TrendsRow, type TrendsScope, type TrendsXUnit,
} from '@/lib/trendsViz'
import type { PlayerResult } from '@/lib/types'

const CURRENT_SEASON = 2026
const SEASONS = Array.from({ length: CURRENT_SEASON - 2014 }, (_, i) => CURRENT_SEASON - i)

const METRIC_LINE_COLORS = [
  COLORS.emerald, COLORS.sky, COLORS.amber, COLORS.purple, COLORS.rose, COLORS.cyan,
]

const ROLLING_WINDOWS = [3, 5, 10] as const

/** Trailing rolling mean; null anchors stay null so real gaps stay gaps. */
function rollingMean(ys: (number | null)[], window: number): (number | null)[] {
  return ys.map((y, i) => {
    if (y == null) return null
    const slice = ys.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/** Month buckets plot mid-month so points sit inside their month band. */
const bucketDate = (x: string) => (x.length === 7 ? `${x}-15` : x)

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
    on ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
  }`

const smallChip = (on: boolean, disabled = false) =>
  `px-2 py-1 rounded text-[11px] font-medium transition ${
    on ? 'bg-emerald-600 text-white'
    : disabled ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
  }`

export default function TrendsVisualizerPage() {
  const [player, setPlayer] = useState<PlayerResult | null>(null)
  const [scope, setScope] = useState<TrendsScope>('seasons')
  const [seasons, setSeasons] = useState<number[]>([CURRENT_SEASON])
  const [startDate, setStartDate] = useState(`${CURRENT_SEASON}-04-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [xUnit, setXUnit] = useState<TrendsXUnit>('month')
  const [mode, setMode] = useState<TrendsMode>('pitch')
  const [pitchMetric, setPitchMetric] = useState('usage_pct')
  const [metricKeys, setMetricKeys] = useState<string[]>(['avg_velo'])
  const [smooth, setSmooth] = useState(false)
  const [smoothWindow, setSmoothWindow] = useState<number>(5)

  const [rows, setRows] = useState<TrendsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const playerId = player?.pitcher ?? null
  const activeMetrics = mode === 'pitch' ? [pitchMetric] : metricKeys

  useEffect(() => {
    if (!playerId || !activeMetrics.length) { setRows([]); return }
    if (scope === 'seasons' && !seasons.length) return
    if (scope === 'custom' && (!startDate || !endDate)) return

    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/trends-viz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            playerId, scope, seasons, startDate, endDate, xUnit, mode,
            metrics: activeMetrics,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
        setRows(json.rows)
      } catch (e: any) {
        if (e.name !== 'AbortError') { setError(e.message); setRows([]) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(t); controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, scope, seasons.join(','), startDate, endDate, xUnit, mode, activeMetrics.join(',')])

  const { traces, needY2, leftUnit, rightUnit } = useMemo(() => {
    const empty = { traces: [] as any[], needY2: false, leftUnit: '', rightUnit: '' }
    if (!rows.length) return empty

    // Bucket key includes game_pk so doubleheader appearances stay distinct.
    const bucketKey = (r: TrendsRow) => (r.game_pk != null ? `${r.x}|${r.game_pk}` : r.x)
    const buckets: { key: string; x: string }[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      const k = bucketKey(r)
      if (!seen.has(k)) { seen.add(k); buckets.push({ key: k, x: r.x }) }
    }

    const addSeries = (name: string, color: string, ys: (number | null)[], ns: (number | null)[], yaxis: 'y' | 'y2', unit: string) => {
      const base = {
        x: buckets.map(b => bucketDate(b.x)),
        customdata: ns,
        mode: 'lines+markers',
        connectgaps: false,
        yaxis,
        hovertemplate: `%{y}${unit === '%' ? '%' : ''} <span style="color:#71717a">(%{customdata} pitches)</span><extra>${name}</extra>`,
      }
      const out: any[] = []
      if (smooth) {
        out.push({
          ...base, y: ys, name, showlegend: false, hoverinfo: 'skip', hovertemplate: undefined,
          line: { color, width: 1 }, marker: { size: 3, color }, opacity: 0.25,
        })
        out.push({
          ...base, y: rollingMean(ys, smoothWindow), name,
          line: { color, width: 2.5, shape: 'spline', smoothing: 0.6 }, marker: { size: 4, color },
        })
      } else {
        out.push({ ...base, y: ys, name, line: { color, width: 2 }, marker: { size: 5, color } })
      }
      return out
    }

    if (mode === 'pitch') {
      const unit = TREND_METRICS[pitchMetric]?.unit ?? ''
      const byPitch = new Map<string, Map<string, TrendsRow>>()
      for (const r of rows) {
        const p = r.pitch_name || 'Unknown'
        if (!byPitch.has(p)) byPitch.set(p, new Map())
        byPitch.get(p)!.set(bucketKey(r), r)
      }
      const pitches = [...byPitch.entries()]
        .map(([name, m]) => ({ name, m, total: [...m.values()].reduce((a, r) => a + Number(r.n || 0), 0) }))
        .filter(p => p.total >= MIN_PITCHES_PER_LINE)
        .sort((a, b) => b.total - a.total)

      const traces = pitches.flatMap(({ name, m }) => {
        // A missing bucket means the pitch wasn't thrown: 0% usage, but a
        // genuine gap (not zero velo/spin/whiff) for every other metric.
        const ys = buckets.map(b => {
          const r = m.get(b.key)
          if (!r) return pitchMetric === 'usage_pct' ? 0 : null
          return num(r[pitchMetric])
        })
        const ns = buckets.map(b => num(m.get(b.key)?.n) ?? 0)
        return addSeries(name, getPitchColor(name), ys, ns, 'y', unit)
      })
      return { traces, needY2: false, leftUnit: unit, rightUnit: '' }
    }

    // Metric mode — one line per metric, second axis for the second unit.
    const units: string[] = []
    for (const k of metricKeys) {
      const u = TREND_METRICS[k]?.unit ?? ''
      if (!units.includes(u)) units.push(u)
    }
    const byKey = new Map(rows.map(r => [bucketKey(r), r]))
    const traces = metricKeys.flatMap((k, i) => {
      const def = TREND_METRICS[k]
      if (!def) return []
      const ys = buckets.map(b => num(byKey.get(b.key)?.[k]))
      const ns = buckets.map(b => num(byKey.get(b.key)?.n) ?? 0)
      const yaxis = def.unit === units[0] ? 'y' as const : 'y2' as const
      return addSeries(def.label, METRIC_LINE_COLORS[i % METRIC_LINE_COLORS.length], ys, ns, yaxis, def.unit)
    })
    return { traces, needY2: units.length > 1, leftUnit: units[0] ?? '', rightUnit: units[1] ?? '' }
  }, [rows, mode, pitchMetric, metricKeys, smooth, smoothWindow])

  const layout = useMemo(() => ({
    ...BASE_LAYOUT,
    margin: { t: 48, r: needY2 ? 55 : 25, b: 45, l: 55 },
    hovermode: 'x unified',
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      type: 'date',
      hoverformat: xUnit === 'month' ? '%b %Y' : '%b %-d, %Y',
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: { text: leftUnit, font: { size: 10 } },
      ticksuffix: leftUnit === '%' ? '%' : '',
      rangemode: mode === 'pitch' && pitchMetric === 'usage_pct' ? 'tozero' : 'normal',
    },
    ...(needY2 ? {
      yaxis2: {
        ...BASE_LAYOUT.yaxis,
        title: { text: rightUnit, font: { size: 10 } },
        ticksuffix: rightUnit === '%' ? '%' : '',
        overlaying: 'y', side: 'right', gridcolor: 'rgba(0,0,0,0)',
      },
    } : {}),
    legend: { ...BASE_LAYOUT.legend, orientation: 'h', y: 1.1 },
  }), [needY2, leftUnit, rightUnit, xUnit, mode, pitchMetric])

  const toggleSeason = (y: number) =>
    setSeasons(prev => prev.includes(y)
      ? (prev.length > 1 ? prev.filter(s => s !== y) : prev)
      : [...prev, y].sort())

  const toggleMetric = (k: string) =>
    setMetricKeys(prev => prev.includes(k)
      ? (prev.length > 1 ? prev.filter(m => m !== k) : prev)
      : prev.length < MAX_TREND_METRICS ? [...prev, k] : prev)

  const metricModeGroups = TREND_METRIC_GROUPS
    .map(g => ({ g, keys: Object.keys(TREND_METRICS).filter(k => TREND_METRICS[k].group === g && !TREND_METRICS[k].pitchModeOnly) }))
    .filter(({ keys }) => keys.length)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/trends-visualizer" />
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6">
        <h1 className="text-lg font-semibold text-white mb-1">Trends Visualizer</h1>
        <p className="text-xs text-zinc-500 mb-4">Chart how a pitcher&apos;s usage, stuff, and results change over time · regular season</p>

        {/* Controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <PlayerSearchInput
              type="pitcher"
              value={player}
              onSelect={setPlayer}
              onClear={() => setPlayer(null)}
              label="Pitcher"
              placeholder="Search pitchers…"
            />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Time Range</div>
              <div className="flex gap-1">
                {([['career', 'Career'], ['seasons', 'Seasons'], ['custom', 'Custom']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setScope(key)} className={chip(scope === key)}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">X Axis</div>
              <div className="flex gap-1">
                {([['month', 'Months'], ['appearance', 'Appearances']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setXUnit(key)} className={chip(xUnit === key)}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Series</div>
              <div className="flex gap-1">
                {([['pitch', 'By Pitch Type'], ['metric', 'By Metric']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setMode(key)} className={chip(mode === key)}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {scope === 'seasons' && (
            <div className="flex flex-wrap gap-1">
              {SEASONS.map(y => (
                <button key={y} onClick={() => toggleSeason(y)} className={smallChip(seasons.includes(y))}>{y}</button>
              ))}
            </div>
          )}
          {scope === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 [color-scheme:dark]" />
              <span className="text-xs text-zinc-500">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 [color-scheme:dark]" />
            </div>
          )}

          <div className="flex flex-wrap items-start gap-4 pt-1 border-t border-zinc-800/60">
            {mode === 'pitch' ? (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 mt-2">Metric</div>
                <select value={pitchMetric} onChange={e => setPitchMetric(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200">
                  {TREND_METRIC_GROUPS.map(g => (
                    <optgroup key={g} label={g}>
                      {Object.keys(TREND_METRICS).filter(k => TREND_METRICS[k].group === g).map(k => (
                        <option key={k} value={k}>{TREND_METRICS[k].label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex-1 min-w-[280px]">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 mt-2">
                  Metrics <span className="text-zinc-600 normal-case">({metricKeys.length}/{MAX_TREND_METRICS})</span>
                </div>
                <div className="space-y-1.5">
                  {metricModeGroups.map(({ g, keys }) => (
                    <div key={g} className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-zinc-600 w-24">{g}</span>
                      {keys.map(k => (
                        <button key={k} onClick={() => toggleMetric(k)}
                          className={smallChip(metricKeys.includes(k), !metricKeys.includes(k) && metricKeys.length >= MAX_TREND_METRICS)}>
                          {TREND_METRICS[k].label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 mt-2">Smoothing</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setSmooth(!smooth)} className={smallChip(smooth)}>Rolling Avg</button>
                {smooth && ROLLING_WINDOWS.map(w => (
                  <button key={w} onClick={() => setSmoothWindow(w)} className={smallChip(smoothWindow === w)}>{w}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        {!player ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center text-sm text-zinc-500">
            Search for a pitcher above to start charting trends.
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 relative">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/50 rounded-lg">
                <div className="text-xs text-zinc-400 animate-pulse">Crunching pitches…</div>
              </div>
            )}
            {error ? (
              <div className="p-10 text-center text-sm text-red-400">{error}</div>
            ) : !loading && !traces.length ? (
              <div className="p-10 text-center text-sm text-zinc-500">No pitches found for this selection.</div>
            ) : (
              <div style={{ height: 520 }}>
                <Plot data={traces} layout={layout} config={{ displaylogo: false }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
