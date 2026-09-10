'use client'

// Compete Admin — create and manage athlete accounts.
//
// "Add Athlete" opens a modal; creation invites the email (branded mail →
// set password → straight into Compete, athlete role = Compete-only). The
// created athlete_profiles row is the canonical Athlete ID that every
// integration (Whoop, TrackMan, mocap) keys to. Deleting an athlete removes
// the auth account and cascades through profile → athlete data (pitch rows
// survive unattributed). Access enforced server-side by the API.

import { useCallback, useEffect, useState } from 'react'

const LEVELS = [
  { value: 'youth', label: 'Youth' },
  { value: 'hs', label: 'High School' },
  { value: 'college', label: 'College' },
  { value: 'indy', label: 'Indy Ball' },
  { value: 'pro', label: 'Pro' },
]
const levelLabel = (v: string | null) => LEVELS.find(l => l.value === v)?.label || '—'

interface AthleteRow {
  athleteId: string
  name: string
  email: string
  heightIn: number | null
  weightLbs: number | null
  level: string | null
  createdAt: string
  status: 'invited' | 'active'
}

const EMPTY_FORM = { firstName: '', lastName: '', email: '', heightIn: '', weightLbs: '', level: 'hs' }

export default function CompeteAdminPage() {
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AthleteRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/compete/admin/athletes')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load athletes')
      setAthletes(json.athletes)
    } catch (e: any) {
      setNotice({ kind: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function createAthlete(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/compete/admin/athletes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName, email: form.email,
          heightIn: form.heightIn ? Number(form.heightIn) : null,
          weightLbs: form.weightLbs ? Number(form.weightLbs) : null,
          level: form.level,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create athlete')
      setNotice({ kind: 'ok', text: `Invite sent to ${form.email}` })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      load()
    } catch (e: any) {
      setNotice({ kind: 'err', text: e.message })
      setShowCreate(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function resendInvite(athleteId: string, email: string) {
    setResending(athleteId)
    setNotice(null)
    try {
      const res = await fetch('/api/compete/admin/athletes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to resend')
      setNotice({ kind: 'ok', text: `Fresh link sent to ${email}` })
    } catch (e: any) {
      setNotice({ kind: 'err', text: e.message })
    } finally {
      setResending(null)
    }
  }

  async function deleteAthlete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await fetch('/api/compete/admin/athletes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId: confirmDelete.athleteId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete')
      setNotice({ kind: 'ok', text: `${confirmDelete.name}'s account was deleted` })
      setConfirmDelete(null)
      load()
    } catch (e: any) {
      setNotice({ kind: 'err', text: e.message })
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const input = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-600'

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-white">Accounts</h1>
        <button onClick={() => { setNotice(null); setShowCreate(true) }}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + Add Athlete
        </button>
      </div>

      {notice && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${notice.kind === 'ok' ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-red-950/60 border border-red-800 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      {/* Roster */}
      {loading ? (
        <div className="text-sm text-zinc-500 py-8 text-center">Loading…</div>
      ) : !athletes.length ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-500">
          No athletes yet — press “Add Athlete” to create the first one.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                <th className="px-4 py-3">Athlete</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Ht / Wt</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Athlete ID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {athletes.map(a => (
                <tr key={a.athleteId} className="border-b border-zinc-800/40 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-zinc-100 font-medium">{a.name}</div>
                    <div className="text-xs text-zinc-500">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{levelLabel(a.level)}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {a.heightIn ? `${Math.floor(a.heightIn / 12)}'${a.heightIn % 12}"` : '—'} / {a.weightLbs ? `${a.weightLbs}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${a.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {a.status === 'active' ? 'Active' : 'Invited'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigator.clipboard?.writeText(a.athleteId)}
                      title={`${a.athleteId} — click to copy`}
                      className="font-mono text-xs text-zinc-500 hover:text-zinc-300 transition">
                      {a.athleteId.slice(0, 8)}…
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {a.status === 'invited' && (
                      <button onClick={() => resendInvite(a.athleteId, a.email)} disabled={resending === a.athleteId}
                        className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50 transition mr-3">
                        {resending === a.athleteId ? 'Sending…' : 'Resend Invite'}
                      </button>
                    )}
                    <button onClick={() => setConfirmDelete(a)}
                      className="text-xs text-red-400/80 hover:text-red-300 transition">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Athlete modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => !submitting && setShowCreate(false)}>
          <form onSubmit={createAthlete} onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">New Athlete</h2>
              <button type="button" onClick={() => setShowCreate(false)} disabled={submitting}
                className="text-zinc-500 hover:text-zinc-300 transition">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input required autoFocus placeholder="First name" value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={input} />
              <input required placeholder="Last name" value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={input} />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <input type="number" min={40} max={90} placeholder="Height (in)" value={form.heightIn}
                onChange={e => setForm(f => ({ ...f, heightIn: e.target.value }))} className={input} />
              <input type="number" min={40} max={400} placeholder="Weight (lbs)" value={form.weightLbs}
                onChange={e => setForm(f => ({ ...f, weightLbs: e.target.value }))} className={input} />
              <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} className={input}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <input required type="email" placeholder="Email address" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={`${input} mb-5`} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 transition">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                {submitting ? 'Creating…' : 'Create & Invite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => !deleting && setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-zinc-900 border border-red-900/60 rounded-xl p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-2">Delete {confirmDelete.name}?</h2>
            <p className="text-sm text-zinc-400 leading-relaxed mb-1">
              This permanently deletes their login and athlete profile, <span className="text-red-300">including connected Whoop and motion-capture data</span>.
            </p>
            <p className="text-xs text-zinc-500 mb-5">Pitch data they uploaded is kept but unlinked. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 transition">
                Cancel
              </button>
              <button onClick={deleteAthlete} disabled={deleting}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
