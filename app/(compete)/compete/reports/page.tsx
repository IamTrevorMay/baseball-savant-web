'use client'
import { useState, useEffect } from 'react'

interface Report {
  id: string
  title: string
  description: string | null
  player_name: string | null
  subject_type: string
  report_date: string
  pdf_url: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export default function CompeteReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/compete/reports')
      .then(r => r.json())
      .then(data => { setReports(data.reports || []); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-white mb-6">Reports</h1>

      {reports.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-600 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <p className="text-sm text-zinc-500">No reports yet</p>
          <p className="text-[10px] text-zinc-600 mt-1">Reports shared by your coaching staff will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(report => (
            <div key={report.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-amber-500/30 transition group">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  report.subject_type === 'pitching' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
                }`}>
                  {report.subject_type}
                </span>
                <span className="text-[10px] text-zinc-600">{new Date(report.report_date).toLocaleDateString()}</span>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-400 transition">{report.title}</h3>
              {report.player_name && <p className="text-xs text-zinc-400 mb-1">{report.player_name}</p>}
              {report.description && <p className="text-xs text-zinc-500 line-clamp-2">{report.description}</p>}
              {report.pdf_url && (
                <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  View PDF
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
