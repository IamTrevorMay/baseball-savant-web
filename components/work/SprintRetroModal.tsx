'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  sprint: { id: string; start_date: string; end_date: string }
  completedCount: number
  completedPoints: number
  rolledBackCount: number
  onClose: () => void
  onSaved: () => void
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SprintRetroModal({ sprint, completedCount, completedPoints, rolledBackCount, onClose, onSaved }: Props) {
  const [wentWell, setWentWell] = useState('')
  const [toImprove, setToImprove] = useState('')
  const [saving, setSaving] = useState(false)

  const dateRange = `${fmtDate(sprint.start_date)} – ${fmtDate(sprint.end_date)}`

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('work_sprint_retros').insert({
      sprint_id: sprint.id,
      went_well: wentWell.trim(),
      to_improve: toImprove.trim(),
    })
    setSaving(false)
    if (!error) onSaved()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[480px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-white">Sprint Complete</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg px-2 transition">
            ✕
          </button>
        </div>

        {/* Summary */}
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3.5 mb-4">
          <div className="text-xs text-zinc-500 mb-1.5">{dateRange}</div>
          <div className="flex gap-4">
            <div>
              <span className="text-2xl font-bold text-emerald-400">{completedPoints || completedCount}</span>
              <span className="text-xs text-zinc-500 ml-1">{completedPoints ? 'pts' : 'completed'}</span>
              {completedPoints > 0 && (
                <span className="text-[11px] text-zinc-600 ml-1.5">({completedCount} tasks)</span>
              )}
            </div>
            {rolledBackCount > 0 && (
              <div>
                <span className="text-2xl font-bold text-amber-400">{rolledBackCount}</span>
                <span className="text-xs text-zinc-500 ml-1">→ backlog</span>
              </div>
            )}
          </div>
        </div>

        {/* Retro fields */}
        <div className="mb-3">
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
            What went well?
          </label>
          <textarea
            value={wentWell}
            onChange={e => setWentWell(e.target.value)}
            rows={3}
            placeholder="Wins, good habits, things to keep doing..."
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white placeholder-zinc-600 outline-none resize-y"
          />
        </div>
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
            What to improve?
          </label>
          <textarea
            value={toImprove}
            onChange={e => setToImprove(e.target.value)}
            rows={3}
            placeholder="Blockers, distractions, process changes..."
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white placeholder-zinc-600 outline-none resize-y"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onSaved}
            className="bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-4 py-2 text-[13px] hover:text-zinc-200 transition"
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-500 text-white rounded-lg px-5 py-2 text-[13px] font-semibold hover:bg-sky-400 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Save Retro'}
          </button>
        </div>
      </div>
    </div>
  )
}
