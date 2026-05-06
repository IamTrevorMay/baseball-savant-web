'use client'

import { useState, useEffect } from 'react'
import { Loader2, Users, AlertCircle } from 'lucide-react'
import type { EmailAudience } from '@/lib/emailTypes'

interface AudienceSelectorProps {
  productId?: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export default function AudienceSelector({
  productId,
  selectedIds,
  onChange,
}: AudienceSelectorProps) {
  const [audiences, setAudiences] = useState<EmailAudience[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchAudiences() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams()
        if (productId) params.set('product_id', productId)

        const res = await fetch(`/api/emails/audiences?${params.toString()}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Failed to load audiences (${res.status})`)
        }

        const data = await res.json()
        setAudiences(data.audiences ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audiences')
      } finally {
        setLoading(false)
      }
    }

    fetchAudiences()
  }, [productId])

  function toggleAudience(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(a => a !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Loading audiences...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <span className="text-xs text-red-300">{error}</span>
      </div>
    )
  }

  if (audiences.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <Users className="w-5 h-5 text-zinc-600 mb-1.5" />
        <p className="text-xs text-zinc-500">No audiences found</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">
          Create an audience first before sending
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-zinc-800 divide-y divide-zinc-800 max-h-52 overflow-y-auto">
      {audiences.map(audience => {
        const isSelected = selectedIds.includes(audience.id)

        return (
          <label
            key={audience.id}
            className={`
              flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
              ${isSelected ? 'bg-emerald-500/5' : 'hover:bg-zinc-800/50'}
            `}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleAudience(audience.id)}
              className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800
                         text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0
                         cursor-pointer accent-emerald-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-zinc-200 truncate">
                {audience.name}
              </div>
              {audience.source && (
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {audience.source}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Users className="w-3 h-3 text-zinc-600" />
              <span className="text-[10px] text-zinc-500 tabular-nums">
                {audience.subscriber_count.toLocaleString()}
              </span>
            </div>
          </label>
        )
      })}
    </div>
  )
}
