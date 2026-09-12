'use client'
import { useState, useEffect } from 'react'
import type { ActiveFilter } from '@/components/FilterEngine'
import type { TileConfig } from '@/components/reports/ReportTile'

interface Props {
  playerName: string
  playerId: number | null
  subjectType: 'hitting' | 'pitching'
  tiles: TileConfig[]
  /** Everything that scopes the data — Compete re-applies these to the player's rows. */
  filters: ActiveFilter[]
  columns: number
  onClose: () => void
}

export default function PushToCompeteModal({ playerName, playerId, subjectType, tiles, filters, columns, onClose }: Props) {
  const [athletes, setAthletes] = useState<any[]>([])
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState(playerName ? `${playerName} Report` : 'Scouting Report')
  const [desc, setDesc] = useState('')
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/compete/athletes')
      .then(r => r.json())
      .then(data => setAthletes(data.athletes || []))
      .catch(() => setAthletes([]))
  }, [])

  async function push() {
    if (!target || !title.trim()) return
    setPushing(true)
    setError('')
    try {
      const res = await fetch('/api/compete/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athlete_id: target,
          title: title.trim(),
          description: desc.trim() || null,
          player_name: playerName || null,
          subject_type: subjectType,
          metadata: { tiles, filters, player_id: playerId, columns },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setPushing(false); return }
      onClose()
    } catch { setError('Failed to push report') }
    setPushing(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 md:p-6 w-[90vw] max-w-96 mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-3">Push to Compete</h3>
        <p className="text-[11px] text-zinc-500 mb-4">Share this report with an athlete on Compete.</p>
        {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-zinc-500 mb-1 block">Athlete</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-amber-500 focus:outline-none">
              <option value="">Select athlete...</option>
              {athletes.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.profiles?.full_name || a.profiles?.email || 'Unknown'} {a.position ? `(${a.position})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 mb-1 block">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 mb-1 block">Description (optional)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded text-xs hover:text-white transition">Cancel</button>
          <button onClick={push} disabled={!target || !title.trim() || pushing}
            className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs hover:bg-amber-500 transition disabled:opacity-50">
            {pushing ? 'Pushing...' : 'Push Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
