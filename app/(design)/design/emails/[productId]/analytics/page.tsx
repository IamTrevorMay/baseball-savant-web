'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Send, Users, Eye, MousePointerClick, AlertTriangle } from 'lucide-react'

interface AnalyticsData {
  product_id: string
  total_sends: number
  total_recipients: number
  avg_open_rate: number
  avg_click_rate: number
  avg_bounce_rate: number
  recent_sends: {
    id: string
    subject: string
    sent_at: string
    recipient_count: number
    open_rate: number
    click_rate: number
    bounce_rate: number
  }[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

export default function AnalyticsPage() {
  const { productId } = useParams<{ productId: string }>()
  const router = useRouter()

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/emails/analytics?product_id=${productId}`)
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Failed to load analytics')
        return
      }
      const json = await res.json()
      setData(json)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

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
          <h1 className="text-xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Email performance overview</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <SummaryCard
          icon={<Send className="w-4 h-4" />}
          label="Total Sends"
          value={String(data?.total_sends ?? 0)}
          accent="text-zinc-200"
        />
        <SummaryCard
          icon={<Users className="w-4 h-4" />}
          label="Total Recipients"
          value={(data?.total_recipients ?? 0).toLocaleString()}
          accent="text-zinc-200"
        />
        <SummaryCard
          icon={<Eye className="w-4 h-4" />}
          label="Avg Open Rate"
          value={pct(data?.avg_open_rate ?? 0)}
          accent="text-emerald-400"
        />
        <SummaryCard
          icon={<MousePointerClick className="w-4 h-4" />}
          label="Avg Click Rate"
          value={pct(data?.avg_click_rate ?? 0)}
          accent="text-emerald-400"
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Avg Bounce Rate"
          value={pct(data?.avg_bounce_rate ?? 0)}
          accent={(data?.avg_bounce_rate ?? 0) > 0.05 ? 'text-red-400' : 'text-zinc-400'}
        />
      </div>

      {/* Recent Sends Table */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Recent Sends</h2>
        </div>

        {!data?.recent_sends || data.recent_sends.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-xs">
            No sends recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-5 py-3 text-left text-zinc-500 font-medium">Date</th>
                  <th className="px-5 py-3 text-left text-zinc-500 font-medium">Subject</th>
                  <th className="px-5 py-3 text-right text-zinc-500 font-medium">Recipients</th>
                  <th className="px-5 py-3 text-right text-zinc-500 font-medium">Open Rate</th>
                  <th className="px-5 py-3 text-right text-zinc-500 font-medium">Click Rate</th>
                  <th className="px-5 py-3 text-right text-zinc-500 font-medium">Bounce Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_sends.map(send => (
                  <tr key={send.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                    <td className="px-5 py-3 text-zinc-400 whitespace-nowrap">
                      {send.sent_at ? new Date(send.sent_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      }) : '-'}
                    </td>
                    <td className="px-5 py-3 text-zinc-200 font-medium max-w-[260px] truncate">
                      {send.subject}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 text-right tabular-nums">
                      {send.recipient_count.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={send.open_rate >= 0.20 ? 'text-emerald-400' : 'text-zinc-400'}>
                        {pct(send.open_rate)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={send.click_rate >= 0.03 ? 'text-emerald-400' : 'text-zinc-400'}>
                        {pct(send.click_rate)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={send.bounce_rate > 0.05 ? 'text-red-400' : 'text-zinc-500'}>
                        {pct(send.bounce_rate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ─── Summary Card Component ───────────────────────────────────────── */

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}
