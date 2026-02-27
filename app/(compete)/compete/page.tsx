'use client'
import { useState, useEffect } from 'react'
import { WhoopCycleRow } from '@/lib/compete/whoop-types'

interface AthleteProfile {
  id: string
  profile_id: string
  player_id: number | null
  height_in: number | null
  weight_lbs: number | null
  position: string | null
  current_team: string | null
  birth_date: string | null
  throws: string | null
  bats: string | null
  jersey_number: number | null
  bio: string | null
  whoop_connected: boolean
  photo_url: string | null
}

interface Notification {
  id: string
  title: string
  body: string | null
  type: string
  read: boolean
  created_at: string
}

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
}

function formatHeight(inches: number | null) {
  if (!inches) return '—'
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

function computeAge(birthDate: string | null) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export default function CompeteDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [whoopCycle, setWhoopCycle] = useState<WhoopCycleRow | null>(null)
  const [loading, setLoading] = useState(true)

  // Onboarding form
  const [form, setForm] = useState({
    position: '', current_team: '', height_in: '', weight_lbs: '',
    birth_date: '', throws: '', bats: '', jersey_number: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/compete/profile').then(r => r.json()),
      fetch('/api/compete/notifications').then(r => r.json()),
    ]).then(([profileRes, notifRes]) => {
      setProfile(profileRes.profile)
      setAthlete(profileRes.athlete)
      setNeedsSetup(profileRes.needsSetup)
      setNotifications(notifRes.notifications || [])
      setLoading(false)

      // Fetch today's WHOOP data if connected
      if (profileRes.athlete?.whoop_connected) {
        const today = new Date().toISOString().split('T')[0]
        fetch(`/api/compete/whoop/data?from=${today}&to=${today}&type=cycles`)
          .then(r => r.json())
          .then(data => {
            const cycles = data.cycles || []
            if (cycles.length > 0) setWhoopCycle(cycles[cycles.length - 1])
          })
      }
    })
  }, [])

  async function createProfile() {
    setSaving(true)
    const body: Record<string, unknown> = {}
    if (form.position) body.position = form.position
    if (form.current_team) body.current_team = form.current_team
    if (form.height_in) body.height_in = Number(form.height_in)
    if (form.weight_lbs) body.weight_lbs = Number(form.weight_lbs)
    if (form.birth_date) body.birth_date = form.birth_date
    if (form.throws) body.throws = form.throws
    if (form.bats) body.bats = form.bats
    if (form.jersey_number) body.jersey_number = Number(form.jersey_number)

    const res = await fetch('/api/compete/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (data.athlete) {
      setAthlete(data.athlete)
      setNeedsSetup(false)
    }
    setSaving(false)
  }

  async function markAllRead() {
    await fetch('/api/compete/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark_all: true }) })
    setNotifications(n => n.map(x => ({ ...x, read: true })))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-3 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Onboarding
  if (needsSetup) {
    return (
      <div className="max-w-lg mx-auto py-16 px-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4 mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white text-center mb-1">Set Up Your Profile</h2>
          <p className="text-sm text-zinc-500 text-center mb-6">Fill in your info to get started with Compete.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Position</label>
                <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  placeholder="RHP, C, SS..." className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Team</label>
                <input value={form.current_team} onChange={e => setForm(f => ({ ...f, current_team: e.target.value }))}
                  placeholder="Team name" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Height (inches)</label>
                <input type="number" value={form.height_in} onChange={e => setForm(f => ({ ...f, height_in: e.target.value }))}
                  placeholder="73" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Weight (lbs)</label>
                <input type="number" value={form.weight_lbs} onChange={e => setForm(f => ({ ...f, weight_lbs: e.target.value }))}
                  placeholder="195" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Throws</label>
                <select value={form.throws} onChange={e => setForm(f => ({ ...f, throws: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-amber-500 focus:outline-none">
                  <option value="">—</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                  <option value="S">Switch</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Bats</label>
                <select value={form.bats} onChange={e => setForm(f => ({ ...f, bats: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-amber-500 focus:outline-none">
                  <option value="">—</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                  <option value="S">Switch</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Date of Birth</label>
                <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Jersey #</label>
                <input type="number" value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))}
                  placeholder="27" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
              </div>
            </div>
          </div>
          <button onClick={createProfile} disabled={saving}
            className="mt-6 w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition disabled:opacity-50 text-sm">
            {saving ? 'Creating...' : 'Create Profile'}
          </button>
        </div>
      </div>
    )
  }

  const age = computeAge(athlete?.birth_date ?? null)
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Player Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-xl font-bold">
              {athlete?.jersey_number ? `#${athlete.jersey_number}` : profile?.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{profile?.full_name || 'Athlete'}</h2>
              <p className="text-xs text-zinc-500">
                {[athlete?.position, athlete?.current_team].filter(Boolean).join(' · ') || 'No team info'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-zinc-800/50 rounded-lg py-2">
              <div className="text-xs text-zinc-500">Height</div>
              <div className="text-sm font-semibold text-white">{formatHeight(athlete?.height_in ?? null)}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg py-2">
              <div className="text-xs text-zinc-500">Weight</div>
              <div className="text-sm font-semibold text-white">{athlete?.weight_lbs ? `${athlete.weight_lbs} lbs` : '—'}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg py-2">
              <div className="text-xs text-zinc-500">Age</div>
              <div className="text-sm font-semibold text-white">{age ?? '—'}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2 text-[11px]">
            {athlete?.throws && <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">Throws {athlete.throws}</span>}
            {athlete?.bats && <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">Bats {athlete.bats}</span>}
          </div>
        </div>

        {/* Whoop Recovery Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recovery</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">WHOOP</span>
          </div>
          {athlete?.whoop_connected && whoopCycle ? (
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg p-3 text-center ${
                whoopCycle.recovery_state === 'green' ? 'bg-green-500/10' :
                whoopCycle.recovery_state === 'yellow' ? 'bg-yellow-500/10' : 'bg-red-500/10'
              }`}>
                <div className={`text-2xl font-bold ${
                  whoopCycle.recovery_state === 'green' ? 'text-green-400' :
                  whoopCycle.recovery_state === 'yellow' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {whoopCycle.recovery_score !== null ? `${Math.round(whoopCycle.recovery_score)}%` : '—'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Recovery</div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {whoopCycle.hrv_rmssd !== null ? Math.round(whoopCycle.hrv_rmssd) : '—'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">HRV (ms)</div>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {whoopCycle.strain_score !== null ? whoopCycle.strain_score.toFixed(1) : '—'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Strain</div>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {whoopCycle.resting_heart_rate !== null ? Math.round(whoopCycle.resting_heart_rate) : '—'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">RHR (bpm)</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-600 flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <p className="text-xs text-zinc-500 mb-3">Connect WHOOP to see recovery data</p>
              <button
                onClick={async () => {
                  const res = await fetch('/api/compete/whoop/connect')
                  const data = await res.json()
                  if (data.url) window.location.href = data.url
                }}
                className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-400 hover:text-white transition"
              >
                Connect WHOOP
              </button>
            </div>
          )}
        </div>

        {/* Quick Stats Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Quick Stats</h3>
          {athlete?.player_id ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className="text-xs text-zinc-500">Stats linked to player ID {athlete.player_id}</p>
              <p className="text-[10px] text-zinc-600 mt-1">Full stat integration coming soon</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-600 flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/>
                </svg>
              </div>
              <p className="text-xs text-zinc-500 mb-1">No player profile linked</p>
              <p className="text-[10px] text-zinc-600">Ask your coach to link your Statcast data</p>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold">{unreadCount}</span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-zinc-500 hover:text-amber-400 transition">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">No notifications yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.map(n => (
                <div key={n.id} className={`flex items-start gap-3 px-3 py-2 rounded-lg ${n.read ? 'bg-zinc-800/30' : 'bg-amber-500/5 border border-amber-500/10'}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? 'bg-zinc-700' : 'bg-amber-400'}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-zinc-500 truncate">{n.body}</p>}
                    <p className="text-[10px] text-zinc-600 mt-0.5">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
