'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import { MOVEMENT_SCREEN_FIELDS, type MovementScreen } from '@/lib/work/movementScreen'

type AthleteRow = { id: string; name: string; position: string | null; level: string | null }

const emptyDraft = () => Object.fromEntries(MOVEMENT_SCREEN_FIELDS.map((f) => [f.key, '']))

export default function AssessmentsPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()

  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [athleteId, setAthleteId] = useState('')
  const [screens, setScreens] = useState<MovementScreen[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft)
  const [assessedAt, setAssessedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async (selected: string) => {
    const url = selected ? `/api/work/assessments?athleteId=${selected}` : '/api/work/assessments'
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Failed to load'); setLoading(false); return }
    setAthletes(json.athletes || [])
    setScreens(json.screens || [])
    setCanWrite(!!json.canWrite)
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => { reload(athleteId) }, [athleteId, reload])

  async function saveScreen() {
    if (!athleteId || saving) return
    setSaving(true)
    const res = await fetch('/api/work/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athleteProfileId: athleteId, assessedAt, responses: draft, notes }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error || 'Save failed'); return }
    setDraft(emptyDraft())
    setNotes('')
    setShowForm(false)
    reload(athleteId)
  }

  async function deleteScreen(id: string) {
    if (!confirm('Delete this screen? This cannot be undone.')) return
    const res = await fetch('/api/work/assessments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) reload(athleteId)
  }

  if (deviceLoading) return null

  const selectedAthlete = athletes.find((a) => a.id === athleteId)
  const inputCls = 'w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600'

  return (
    <div className={isMobile ? 'px-4 py-6' : 'max-w-5xl mx-auto px-6 py-8'}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">Assessments</h1>
        <p className="text-sm text-zinc-500 mt-1">Movement screening — results attach to the athlete&apos;s profile.</p>
      </header>

      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</div>}

      {/* Athlete picker */}
      <div className="mb-6 flex items-end gap-3 flex-wrap">
        <div className="min-w-[260px]">
          <label className="block text-xs text-zinc-500 mb-1">Athlete</label>
          <select value={athleteId} onChange={(e) => { setAthleteId(e.target.value); setShowForm(false) }} className={inputCls}>
            <option value="">Select an athlete…</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.position ? ` · ${a.position}` : ''}{a.level ? ` · ${a.level}` : ''}
              </option>
            ))}
          </select>
        </div>
        {athleteId && canWrite && (
          <button onClick={() => setShowForm((s) => !s)} className="px-3 py-1.5 text-sm rounded-md bg-sky-600 hover:bg-sky-500 text-white transition">
            {showForm ? 'Cancel' : '+ New Screen'}
          </button>
        )}
      </div>

      {/* New screen form */}
      {showForm && athleteId && (
        <div className="mb-6 bg-zinc-900 border border-sky-700/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-sm font-semibold text-zinc-200">
              Movement Screening — {selectedAthlete?.name}
            </div>
            <div>
              <label className="text-xs text-zinc-500 mr-2">Date</label>
              <input type="date" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-100 outline-none focus:border-sky-600" />
            </div>
          </div>
          <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {MOVEMENT_SCREEN_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
                <input
                  value={draft[f.key] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <label className="block text-xs text-zinc-500 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Cancel</button>
            <button onClick={saveScreen} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Screen'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {!athleteId ? (
        !loading && (
          <div className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            Select an athlete to view and record movement screens.
          </div>
        )
      ) : loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : screens.length === 0 ? (
        <div className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          No screens recorded for {selectedAthlete?.name || 'this athlete'} yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {screens.map((s) => (
            <li key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{s.assessed_at}</span>
                  {s.source === 'nbp' && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-700/50">NBP import</span>
                  )}
                </div>
                {canWrite && (
                  <button onClick={() => deleteScreen(s.id)} className="text-xs text-zinc-500 hover:text-red-400 transition">Delete</button>
                )}
              </div>
              <div className={`grid gap-x-6 gap-y-1.5 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {MOVEMENT_SCREEN_FIELDS.filter((f) => s.responses[f.key] != null).map((f) => (
                  <div key={f.key} className="flex items-baseline justify-between gap-3 text-sm border-b border-zinc-800/60 pb-1">
                    <span className="text-zinc-500 text-xs">{f.label}</span>
                    <span className="text-zinc-200 text-right">{s.responses[f.key]}</span>
                  </div>
                ))}
              </div>
              {s.notes && <p className="mt-3 text-xs text-zinc-400 whitespace-pre-wrap">{s.notes}</p>}
            </li>
          ))}
        </ul>
      )}

    </div>
  )
}
