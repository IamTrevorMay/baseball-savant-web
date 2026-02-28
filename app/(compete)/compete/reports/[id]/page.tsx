'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { TileHeatmap, TileScatter, TileBar, TileStrikeZone, TileTable } from '@/components/reports/TileViz'
import type { TileConfig } from '@/components/reports/ReportTile'
import { applyFiltersToData, type ActiveFilter } from '@/components/FilterEngine'
import { enrichData } from '@/lib/enrichData'

interface Report {
  id: string
  title: string
  description: string | null
  player_name: string | null
  subject_type: string
  report_date: string
  metadata: {
    tiles?: TileConfig[]
    filters?: ActiveFilter[]
    player_id?: number
    columns?: number
  }
}

export default function CompeteReportViewer() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [pitchData, setPitchData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Fetch report
  useEffect(() => {
    fetch(`/api/compete/reports/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setReport(data.report)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load report'); setLoading(false) })
  }, [id])

  // Fetch pitch data when report loads
  useEffect(() => {
    if (!report?.metadata?.player_id) return
    const playerId = report.metadata.player_id
    const col = report.subject_type === 'hitting' ? 'batter' : 'pitcher'
    setDataLoading(true)
    fetch(`/api/player-data?id=${playerId}&col=${col}`)
      .then(r => r.json())
      .then(data => {
        const rows = data.rows || []
        enrichData(rows)
        setPitchData(rows)
        setDataLoading(false)
      })
      .catch(() => setDataLoading(false))
  }, [report])

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/compete/reports/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) { setDeleting(false); return }
      router.push('/compete/reports')
    } catch { setDeleting(false) }
  }

  async function exportPDF() {
    if (!gridRef.current || exporting) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(gridRef.current, { backgroundColor: '#09090b', scale: 2 })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      pdf.setFontSize(14)
      pdf.setTextColor(255, 255, 255)
      pdf.setFillColor(9, 9, 11)
      pdf.rect(0, 0, pageW, pageH, 'F')
      pdf.text(report?.title || 'Report', 10, 12)
      pdf.setFontSize(8)
      pdf.setTextColor(150, 150, 150)
      pdf.text(`${report?.player_name || ''} · ${report?.subject_type || ''} · Triton`, 10, 18)
      const marginTop = 22
      const availH = pageH - marginTop - 5
      const ratio = canvas.width / canvas.height
      let imgW = pageW - 10
      let imgH = imgW / ratio
      if (imgH > availH) { imgH = availH; imgW = imgH * ratio }
      pdf.addImage(imgData, 'PNG', 5, marginTop, imgW, imgH)
      pdf.save(`${(report?.title || 'report').replace(/\s+/g, '_')}.pdf`)
    } catch (e) { console.error('PDF export failed:', e) }
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-center">
        <p className="text-sm text-red-400 mb-4">{error || 'Report not found'}</p>
        <Link href="/compete/reports" className="text-xs text-amber-400 hover:text-amber-300">Back to Reports</Link>
      </div>
    )
  }

  const tiles = report.metadata?.tiles || []
  const globalFilters = report.metadata?.filters || []
  const cols = report.metadata?.columns || 4

  // Apply global filters
  const filteredData = globalFilters.length > 0 ? applyFiltersToData(pitchData, globalFilters) : pitchData

  const hasTiles = tiles.length > 0 && report.metadata?.player_id

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/compete/reports" className="text-xs text-zinc-500 hover:text-zinc-300 transition mb-2 inline-block">
            &larr; All Reports
          </Link>
          <h1 className="text-lg font-bold text-white">{report.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            {report.player_name && <span className="text-sm text-zinc-400">{report.player_name}</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              report.subject_type === 'pitching' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
            }`}>
              {report.subject_type}
            </span>
            <span className="text-[10px] text-zinc-600">{new Date(report.report_date).toLocaleDateString()}</span>
          </div>
          {report.description && <p className="text-xs text-zinc-500 mt-2 max-w-xl">{report.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {hasTiles && (
            <button onClick={exportPDF} disabled={exporting || dataLoading}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition disabled:opacity-50">
              {exporting ? 'Exporting...' : 'Download PDF'}
            </button>
          )}
          <button onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 bg-zinc-800 border border-red-900/50 rounded-lg text-xs text-red-400 hover:bg-red-900/30 hover:border-red-700/50 transition">
            Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-300">Are you sure you want to delete this report?</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={deleting}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition disabled:opacity-50">
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium rounded-lg transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tile Grid */}
      {hasTiles ? (
        dataLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin mr-3" />
            <span className="text-sm text-zinc-500">Loading pitch data...</span>
          </div>
        ) : (
          <div ref={gridRef} className={`grid gap-4 ${
            cols === 1 ? 'grid-cols-1' :
            cols === 2 ? 'grid-cols-1 md:grid-cols-2' :
            cols === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          }`}>
            {tiles.map((tile: TileConfig) => {
              if (tile.viz === 'empty') return null
              // Apply per-tile filters
              const tileData = tile.filters && tile.filters.length > 0
                ? applyFiltersToData(filteredData, tile.filters)
                : filteredData

              // Determine dominant batter stand
              const stands = tileData.map((d: any) => d.stand).filter(Boolean)
              const lCount = stands.filter((s: string) => s === 'L').length
              const rCount = stands.filter((s: string) => s === 'R').length
              const dominantStand = (lCount === 0 && rCount === 0) ? null : lCount > rCount ? 'L' as const : 'R' as const

              return (
                <div key={tile.id} className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col min-h-[320px] overflow-hidden">
                  {/* Tile Header */}
                  <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-800/30">
                    <div className="text-xs font-medium text-white text-center">{tile.title || tile.viz.replace('_', ' ')}</div>
                    {tile.subtitle && <div className="text-[9px] text-zinc-500 text-center">{tile.subtitle}</div>}
                  </div>
                  {/* Tile filters summary */}
                  {tile.filters && tile.filters.length > 0 && (
                    <div className="px-2 py-1 border-b border-zinc-800/50 flex flex-wrap gap-1">
                      {tile.filters.map((f, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-700/50 rounded text-emerald-300">
                          {f.def.label}: {f.values?.join(', ') || `${f.min || ''}–${f.max || ''}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Visualization */}
                  <div className="flex-1 p-1 min-h-0" style={{ minHeight: '280px' }}>
                    {tile.viz === 'heatmap' && <TileHeatmap data={tileData} metric={tile.metric || 'frequency'} stand={dominantStand} />}
                    {tile.viz === 'scatter' && <TileScatter data={tileData} mode={tile.scatterMode || 'location'} />}
                    {tile.viz === 'bar' && <TileBar data={tileData} metric={tile.barMetric || 'usage'} />}
                    {tile.viz === 'strike_zone' && <TileStrikeZone data={tileData} stand={dominantStand} />}
                    {tile.viz === 'table' && <TileTable data={tileData} mode={tile.tableMode || 'arsenal'} columns={tile.tableColumns} groupBy={tile.tableGroupBy} />}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* Fallback for reports without tile metadata (legacy) */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-500">This report does not contain viewable tile data.</p>
          <p className="text-[10px] text-zinc-600 mt-1">Reports pushed after this update will include full visualizations.</p>
        </div>
      )}
    </div>
  )
}
