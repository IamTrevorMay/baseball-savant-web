'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkAthletes from '@/components/mobile/work/MobileWorkAthletes'
import { ATHLETE_STAGES } from '@/lib/work/sprints'

type Athlete = {
  id: string
  full_name: string
  position: string | null
  level: string | null
  age: number | null
  stage: 'lead' | 'intake' | 'assessment' | 'active' | 'reeval' | 'offboarded'
  primary_owner: string | null
  contact_email: string | null
  start_date: string | null
  next_touch: string | null
  notes: string | null
  archived_at: string | null
}

const STAGE_BG: Record<string, string> = {
  zinc: 'bg-zinc-500/10 border-zinc-700 text-zinc-300',
  blue: 'bg-blue-500/10 border-blue-700/40 text-blue-300',
  amber: 'bg-amber-500/10 border-amber-700/40 text-amber-300',
  emerald: 'bg-emerald-500/10 border-emerald-700/40 text-emerald-300',
  purple: 'bg-purple-500/10 border-purple-700/40 text-purple-300',
  rose: 'bg-rose-500/10 border-rose-700/40 text-rose-300',
}

export default function AthletesPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('work_athletes')
      .select('*')
      .is('archived_at', null)
      .order('position_idx', { ascending: true })
      .order('created_at', { ascending: false })
    setAthletes((data as Athlete[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function createAthlete() {
    const name = newName.trim()
    if (!name) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('work_athletes').insert({
      full_name: name,
      stage: 'lead',
      primary_owner: user.id,
      created_by: user.id,
    })
    setNewName('')
    setShowNew(false)
    reload()
  }

  async function moveStage(a: Athlete, stage: Athlete['stage']) {
    const supabase = createClient()
    await supabase.from('work_athletes').update({ stage }).eq('id', a.id)
    reload()
  }

  async function archive(id: string) {
    const supabase = createClient()
    await supabase.from('work_athletes').update({ archived_at: new Date().toISOString() }).eq('id', id)
    reload()
  }

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkAthletes />

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Athletes</h1>
          <p className="text-sm text-zinc-500 mt-1">Lifecycle pipeline. Drag athletes through stages.</p>
        </div>
        <button
          onClick={() => setShowNew(s => !s)}
          className="px-3 py-1.5 text-sm rounded-md bg-sky-600 hover:bg-sky-500 text-white transition"
        >+ New Athlete</button>
      </header>

      {showNew && (
        <div className="mb-4 bg-zinc-900 border border-sky-700/50 rounded-lg p-3 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createAthlete(); if (e.key === 'Escape') setShowNew(false) }}
            placeholder="Athlete full name…"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-sky-600"
          />
          <button onClick={createAthlete} className="px-3 py-1 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white">Create</button>
          <button onClick={() => setShowNew(false)} className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {ATHLETE_STAGES.map(stage => {
            const items = athletes.filter(a => a.stage === stage.id)
            return (
              <div key={stage.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 min-h-[60vh]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className={`text-xs uppercase tracking-wider px-1.5 py-0.5 rounded border ${STAGE_BG[stage.color]}`}>{stage.label}</h3>
                  <span className="text-[10px] text-zinc-500">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map(a => (
                    <article key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 hover:border-zinc-700 transition group">
                      <div className="text-sm text-zinc-100 font-medium">{a.full_name}</div>
                      <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-zinc-500">
                        {a.position && <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{a.position}</span>}
                        {a.level && <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{a.level}</span>}
                        {a.age && <span>{a.age} y/o</span>}
                      </div>
                      {a.next_touch && (
                        <div className="text-[10px] text-amber-300 mt-1">Next: {a.next_touch}</div>
                      )}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {ATHLETE_STAGES.filter(s => s.id !== a.stage).map(s => (
                          <button
                            key={s.id}
                            onClick={() => moveStage(a, s.id as Athlete['stage'])}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                          >→ {s.label}</button>
                        ))}
                        <button
                          onClick={() => archive(a.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded text-zinc-600 hover:text-red-400 ml-auto"
                        >archive</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
