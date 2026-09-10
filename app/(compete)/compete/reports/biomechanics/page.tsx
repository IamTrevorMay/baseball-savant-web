'use client'

// Athlete-facing Biomechanics — the dedicated home for motion-capture reports.
//
// Reads the athlete's own biomech reports from /api/compete/reports (published
// there by the Mechanics Lab report route after each processed capture) and
// renders the stored BiomechReportPayload with the same components the staff
// preview uses (BiomechReport + BiomechTrend), so athlete and staff always see
// identical numbers. Session picker across capture history; latest first.

import { useEffect, useMemo, useState } from 'react'
import BiomechReport from '@/components/mechanics/report/BiomechReport'
import BiomechTrend from '@/components/mechanics/report/BiomechTrend'
import type { BiomechReportPayload } from '@/lib/mechanics/reportPayload'

interface BiomechReportRow {
  id: string
  report_date: string
  title: string | null
  pdf_url: string | null
  metadata: BiomechReportPayload
}

const fmtDate = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const gradeColor = (g: number) =>
  g >= 70 ? 'text-emerald-400' : g >= 45 ? 'text-amber-400' : 'text-red-400'

export default function BiomechanicsPage() {
  const [reports, setReports] = useState<BiomechReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/compete/reports')
      .then(r => r.json())
      .then(d => {
        const rows: BiomechReportRow[] = (d.reports ?? [])
          .filter((r: any) => r.subject_type === 'biomech' && r.metadata?.kind === 'biomech')
          .sort((a: any, b: any) => (b.report_date || '').localeCompare(a.report_date || ''))
        setReports(rows)
        if (rows.length) setSelectedId(rows[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const selected = useMemo(
    () => reports.find(r => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  )

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
      <h1 className="text-xl font-semibold text-white mb-1">Biomechanics</h1>
      <p className="text-sm text-zinc-500 mb-6">Motion-capture assessments from your Neptune sessions</p>

      {loading ? (
        <div className="text-sm text-zinc-500 py-10 text-center">Loading…</div>
      ) : error ? (
        <div className="bg-red-950/60 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>
      ) : !reports.length ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-sm text-zinc-400 mb-1">No biomechanics reports yet.</p>
          <p className="text-xs text-zinc-600">
            After your next motion-capture session at Neptune, your report will show up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Session picker + headline */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Movement Grade</div>
                  <div className={`text-4xl font-bold ${gradeColor(selected?.metadata.movementGrade ?? 0)}`}>
                    {Math.round(selected?.metadata.movementGrade ?? 0)}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  <div>{fmtDate(selected?.metadata.captureDate ?? selected?.report_date ?? null)}</div>
                  {selected?.metadata.veloContext && <div>{selected.metadata.veloContext}</div>}
                  <div>{selected?.metadata.qc.throwsUsed} of {selected?.metadata.qc.throwsDetected} throws used</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {reports.length > 1 && (
                  <select
                    value={selected?.id ?? ''}
                    onChange={e => setSelectedId(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  >
                    {reports.map(r => (
                      <option key={r.id} value={r.id}>
                        {fmtDate(r.metadata.captureDate ?? r.report_date)}
                      </option>
                    ))}
                  </select>
                )}
                {selected?.pdf_url && (
                  <a
                    href={`/api/compete/reports/${selected.id}/pdf`}
                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg transition"
                  >
                    PDF
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Full report (same renderer the staff preview uses) */}
          {selected && <BiomechReport payload={selected.metadata} />}

          {/* Longitudinal trend across captures */}
          {selected && <BiomechTrend currentId={selected.id} />}
        </div>
      )}
    </div>
  )
}
