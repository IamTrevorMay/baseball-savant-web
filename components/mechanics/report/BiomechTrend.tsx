'use client'

// Longitudinal biomech trend — movement grade + a selectable metric across an
// athlete's capture history (6-week re-assessment cadence). Pulls the athlete's own
// biomech reports from /api/compete/reports and reads each report's stored payload.

import { useEffect, useMemo, useState } from 'react'
import { METRIC_DEFS, METRIC_DEF_BY_KEY } from '@/lib/mechanics/norms'
import type { BiomechReportPayload } from '@/lib/mechanics/reportPayload'

interface Point { date: string; grade: number; payload: BiomechReportPayload }

export default function BiomechTrend({ currentId }: { currentId: string }) {
  const [points, setPoints] = useState<Point[]>([])
  const [metricKey, setMetricKey] = useState('hipShoulderSep.maxSeparation')

  useEffect(() => {
    fetch('/api/compete/reports').then(r => r.json()).then(d => {
      const pts: Point[] = (d.reports ?? [])
        .filter((r: any) => r.subject_type === 'biomech' && r.metadata?.kind === 'biomech')
        .map((r: any) => ({ date: r.report_date, grade: r.metadata.movementGrade ?? 50, payload: r.metadata }))
        .sort((a: Point, b: Point) => a.date.localeCompare(b.date))
      setPoints(pts)
    })
  }, [currentId])

  const metricSeries = useMemo(() => points.map(p => {
    const pc = p.payload.percentiles?.find(x => x.key === metricKey)
    return { date: p.date, value: pc?.value ?? NaN, pct: pc?.percentile ?? NaN }
  }), [points, metricKey])

  if (points.length < 2) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-zinc-500">
        Trend appears after a second capture. One assessment is a data point, not a trend —
        re-test on a ~6-week cadence with velo held constant.
      </div>
    )
  }

  const def = METRIC_DEF_BY_KEY[metricKey]
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">Longitudinal Trend</h3>
        <select value={metricKey} onChange={e => setMetricKey(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white">
          {METRIC_DEFS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      <TrendLine label="Movement Grade" unit="" series={points.map(p => ({ date: p.date, value: p.grade }))} domain={[0, 100]} color="#3b82f6" />
      <TrendLine label={def?.label ?? metricKey} unit={def?.unit ?? ''} series={metricSeries} color="#10b981" />

      <table className="w-full text-sm mt-2">
        <thead className="text-zinc-500 text-[11px] uppercase">
          <tr><th className="text-left py-1">Date</th><th className="text-right py-1">Grade</th><th className="text-right py-1">Top Flag</th></tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {[...points].reverse().map((p, i) => (
            <tr key={i}>
              <td className="py-1.5 text-zinc-300">{p.date}</td>
              <td className="py-1.5 text-right tabular-nums text-white">{p.grade}</td>
              <td className="py-1.5 text-right text-zinc-400 text-[12px]">{p.payload.flags?.[0]?.intervention.title ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendLine({ label, unit, series, domain, color }: {
  label: string; unit: string; series: { date: string; value: number }[]; domain?: [number, number]; color: string
}) {
  const vals = series.map(s => s.value).filter(Number.isFinite)
  if (!vals.length) return null
  const lo = domain ? domain[0] : Math.min(...vals) * 0.95
  const hi = domain ? domain[1] : Math.max(...vals) * 1.05
  const W = 520, H = 90, pad = 24
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (W - 2 * pad)
  const y = (v: number) => H - pad - ((v - lo) / Math.max(1e-6, hi - lo)) * (H - 2 * pad)
  const pts = series.map((s, i) => Number.isFinite(s.value) ? `${x(i)},${y(s.value)}` : null).filter(Boolean).join(' ')
  const last = [...series].reverse().find(s => Number.isFinite(s.value))

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] text-zinc-400">{label}</span>
        <span className="text-[13px] tabular-nums text-white">{last ? last.value.toFixed(unit === 's' ? 3 : 1) : '—'}<span className="text-zinc-500 text-[11px] ml-0.5">{unit}</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 100 }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
        {series.map((s, i) => Number.isFinite(s.value) && (
          <circle key={i} cx={x(i)} cy={y(s.value)} r={3} fill={color} />
        ))}
      </svg>
    </div>
  )
}
