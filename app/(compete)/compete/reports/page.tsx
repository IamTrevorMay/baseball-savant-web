'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/compete/reports')
      .then(r => r.json())
      .then(data => { setReports(data.reports || []); setLoading(false) })
  }, [])

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDeletingId(id)
    try {
      const res = await fetch(`/api/compete/reports/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.error) {
        setReports(r => r.filter(report => report.id !== id))
      }
    } catch {}
    setDeletingId(null)
    setConfirmDeleteId(null)
  }

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
            <Link key={report.id} href={`/compete/reports/${report.id}`}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-amber-500/30 transition group relative block">
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (confirmDeleteId === report.id) return
                  setConfirmDeleteId(report.id)
                }}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-500 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all text-xs z-10"
              >
                &times;
              </button>

              {/* Inline delete confirm */}
              {confirmDeleteId === report.id && (
                <div className="absolute inset-0 bg-zinc-950/90 z-20 flex flex-col items-center justify-center rounded-xl backdrop-blur-sm"
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                  <p className="text-xs text-white font-medium mb-3">Delete this report?</p>
                  <div className="flex gap-2">
                    <button onClick={(e) => handleDelete(report.id, e)} disabled={deletingId === report.id}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition disabled:opacity-50">
                      {deletingId === report.id ? 'Deleting...' : 'Delete'}
                    </button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null) }}
                      className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium rounded-lg transition">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

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
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
