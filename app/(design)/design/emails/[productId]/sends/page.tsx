'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { EmailSend } from '@/lib/emailTypes'

interface SendDetails {
  send: EmailSend
  analytics: {
    event_counts: Record<string, number>
    top_links: { url: string; label: string | null; clicks: number }[]
    open_rate: number
    click_rate: number
    bounce_rate: number
  }
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

const STATUS_STYLES: Record<string, string> = {
  sent:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  sending: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  failed:  'bg-red-500/15 text-red-400 border-red-500/20',
  draft:   'bg-zinc-700/30 text-zinc-400 border-zinc-600/30',
}

export default function SendsPage() {
  const { productId } = useParams<{ productId: string }>()
  const router = useRouter()

  const [sends, setSends] = useState<EmailSend[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, SendDetails>>({})
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null)

  /* ── Fetch sends ────────────────────────────────────────────────── */
  const loadSends = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/emails/sends?product_id=${productId}&page=${page}&limit=20`)
      if (!res.ok) return
      const json = await res.json()
      setSends(json.sends || [])
      setPagination(json.pagination || { page: 1, limit: 20, total: 0, pages: 0 })
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => { loadSends() }, [loadSends])

  /* ── Expand send for details ────────────────────────────────────── */
  async function toggleExpand(sendId: string) {
    if (expandedId === sendId) {
      setExpandedId(null)
      return
    }
    setExpandedId(sendId)

    // Skip fetch if already cached
    if (details[sendId]) return

    setLoadingDetails(sendId)
    try {
      const res = await fetch(`/api/emails/sends/${sendId}`)
      if (res.ok) {
        const json = await res.json()
        setDetails(prev => ({ ...prev, [sendId]: json }))
      }
    } finally {
      setLoadingDetails(null)
    }
  }

  /* ── Pagination ─────────────────────────────────────────────────── */
  function goToPage(page: number) {
    if (page < 1 || page > pagination.pages) return
    loadSends(page)
    setExpandedId(null)
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push(`/design/emails/${productId}`)}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 transition rounded"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Send History</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{pagination.total} total send{pagination.total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto" />
        </div>
      ) : sends.length === 0 ? (
        <div className="text-center py-16 text-zinc-600 text-sm">
          No sends recorded yet.
        </div>
      ) : (
        <>
          {/* Sends list */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="w-8" />
                  <th className="px-4 py-3 text-left text-zinc-500 font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-zinc-500 font-medium">Subject</th>
                  <th className="px-4 py-3 text-center text-zinc-500 font-medium">Type</th>
                  <th className="px-4 py-3 text-center text-zinc-500 font-medium">Status</th>
                  <th className="px-4 py-3 text-right text-zinc-500 font-medium">Recipients</th>
                  <th className="px-4 py-3 text-right text-zinc-500 font-medium">Open</th>
                  <th className="px-4 py-3 text-right text-zinc-500 font-medium">Click</th>
                </tr>
              </thead>
              <tbody>
                {sends.map(send => {
                  const isExpanded = expandedId === send.id
                  const det = details[send.id]
                  const recipients = send.recipient_count || 0
                  const openRate = recipients > 0 ? (send.opened_count || 0) / recipients : 0
                  const clickRate = recipients > 0 ? (send.clicked_count || 0) / recipients : 0

                  return (
                    <SendRow
                      key={send.id}
                      send={send}
                      isExpanded={isExpanded}
                      openRate={openRate}
                      clickRate={clickRate}
                      details={det}
                      loadingDetails={loadingDetails === send.id}
                      onToggle={() => toggleExpand(send.id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                onClick={() => goToPage(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-xs text-zinc-500 tabular-nums">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                onClick={() => goToPage(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Send Row Component ───────────────────────────────────────────── */

function SendRow({
  send,
  isExpanded,
  openRate,
  clickRate,
  details,
  loadingDetails,
  onToggle,
}: {
  send: EmailSend
  isExpanded: boolean
  openRate: number
  clickRate: number
  details?: SendDetails
  loadingDetails: boolean
  onToggle: () => void
}) {
  const statusClass = STATUS_STYLES[send.status] || STATUS_STYLES.draft

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition cursor-pointer"
      >
        <td className="pl-3 py-3 text-zinc-500">
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </td>
        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
          {send.sent_at
            ? new Date(send.sent_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
            : send.date || '-'
          }
        </td>
        <td className="px-4 py-3 text-zinc-200 font-medium max-w-[200px] truncate">
          {send.subject || '(no subject)'}
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{send.send_type}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wide ${statusClass}`}>
            {send.status}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">
          {(send.recipient_count || 0).toLocaleString()}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          <span className={openRate >= 0.20 ? 'text-emerald-400' : 'text-zinc-400'}>
            {pct(openRate)}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          <span className={clickRate >= 0.03 ? 'text-emerald-400' : 'text-zinc-400'}>
            {pct(clickRate)}
          </span>
        </td>
      </tr>

      {/* Expanded details */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-zinc-950 border-b border-zinc-800">
            {loadingDetails ? (
              <div className="py-6 text-center">
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin mx-auto" />
              </div>
            ) : details ? (
              <div className="px-6 py-5 space-y-4">
                {/* Metrics row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <DetailMetric label="Delivered" value={(details.send.delivered_count || 0).toLocaleString()} />
                  <DetailMetric
                    label="Open Rate"
                    value={pct(details.analytics.open_rate)}
                    highlight={details.analytics.open_rate >= 0.20}
                  />
                  <DetailMetric
                    label="Click Rate"
                    value={pct(details.analytics.click_rate)}
                    highlight={details.analytics.click_rate >= 0.03}
                  />
                  <DetailMetric
                    label="Bounce Rate"
                    value={pct(details.analytics.bounce_rate)}
                    isNegative={details.analytics.bounce_rate > 0.05}
                  />
                </div>

                {/* Event counts */}
                {Object.keys(details.analytics.event_counts).length > 0 && (
                  <div>
                    <h4 className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium mb-2">Events</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(details.analytics.event_counts).map(([type, count]) => (
                        <span key={type} className="px-2 py-1 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
                          {type}: <span className="font-medium tabular-nums">{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top links */}
                {details.analytics.top_links.length > 0 && (
                  <div>
                    <h4 className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium mb-2">Top Links</h4>
                    <div className="space-y-1">
                      {details.analytics.top_links.slice(0, 5).map((link, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <ExternalLink className="w-3 h-3 text-zinc-600 shrink-0" />
                          <span className="text-zinc-300 truncate max-w-[300px]">
                            {link.label || link.url}
                          </span>
                          <span className="text-emerald-400 font-medium tabular-nums ml-auto">
                            {link.clicks} click{link.clicks !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error message */}
                {details.send.error && (
                  <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400">{details.send.error}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-zinc-600">
                Failed to load details.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* ─── Detail Metric ────────────────────────────────────────────────── */

function DetailMetric({
  label,
  value,
  highlight,
  isNegative,
}: {
  label: string
  value: string
  highlight?: boolean
  isNegative?: boolean
}) {
  let valueColor = 'text-zinc-200'
  if (highlight) valueColor = 'text-emerald-400'
  if (isNegative) valueColor = 'text-red-400'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  )
}
