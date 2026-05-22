'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkGoals from '@/components/mobile/work/MobileWorkGoals'

type Goal = {
  id: string
  owner_id: string
  scope: 'personal' | 'team'
  title: string
  description: string | null
  target_value: number | null
  current_value: number | null
  unit: string | null
  target_date: string | null
  completed_at: string | null
}

export default function GoalsPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [tab, setTab] = useState<'personal' | 'team'>('personal')
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [draft, setDraft] = useState({ title: '', target_value: '', unit: '', target_date: '' })

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setLoading(false)
    const q = supabase.from('work_goals').select('*').eq('scope', tab).order('created_at', { ascending: false })
    if (tab === 'personal') q.eq('owner_id', user.id)
    const { data } = await q
    setGoals((data as Goal[]) || [])
    setLoading(false)
  }, [tab])

  useEffect(() => { reload() }, [reload])

  async function createGoal() {
    if (!draft.title.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('work_goals').insert({
      owner_id: user.id,
      scope: tab,
      title: draft.title.trim(),
      target_value: draft.target_value ? Number(draft.target_value) : null,
      unit: draft.unit.trim() || null,
      target_date: draft.target_date || null,
    })
    setDraft({ title: '', target_value: '', unit: '', target_date: '' })
    setShowNew(false)
    reload()
  }

  async function updateProgress(g: Goal, current: number) {
    const supabase = createClient()
    const patch: Partial<Goal> = { current_value: current }
    if (g.target_value && current >= g.target_value && !g.completed_at) {
      patch.completed_at = new Date().toISOString() as any
    } else if (g.completed_at && (!g.target_value || current < g.target_value)) {
      patch.completed_at = null
    }
    await supabase.from('work_goals').update(patch).eq('id', g.id)
    reload()
  }

  async function deleteGoal(id: string) {
    const supabase = createClient()
    await supabase.from('work_goals').delete().eq('id', id)
    reload()
  }

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkGoals />

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Goals</h1>
          <p className="text-sm text-zinc-500 mt-1">Quarterly and operational targets.</p>
        </div>
        <button onClick={() => setShowNew(s => !s)} className="px-3 py-1.5 text-sm rounded-md bg-sky-600 hover:bg-sky-500 text-white transition">+ New Goal</button>
      </header>

      <div className="flex gap-1 mb-4">
        {(['personal','team'] as const).map(s => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-3 py-1.5 text-sm rounded-md transition ${tab === s ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
          >{s === 'personal' ? 'Personal' : 'Team'}</button>
        ))}
      </div>

      {showNew && (
        <div className="mb-4 bg-zinc-900 border border-sky-700/50 rounded-lg p-3 space-y-2">
          <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} autoFocus placeholder="Goal title" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
          <div className="grid grid-cols-3 gap-2">
            <input value={draft.target_value} onChange={e => setDraft({ ...draft, target_value: e.target.value })} type="number" placeholder="Target #" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
            <input value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} placeholder="Unit (e.g. athletes)" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
            <input value={draft.target_date} onChange={e => setDraft({ ...draft, target_date: e.target.value })} type="date" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNew(false)} className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Cancel</button>
            <button onClick={createGoal} className="px-3 py-1 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white">Create</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : goals.length === 0 ? (
        <div className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">No goals yet.</div>
      ) : (
        <ul className="space-y-3">
          {goals.map(g => {
            const target = g.target_value || 0
            const current = g.current_value || 0
            const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0
            return (
              <li key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-medium ${g.completed_at ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>{g.title}</h3>
                      {g.completed_at && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Done</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-500">
                      {target ? <span>{current}{g.unit ? ` ${g.unit}` : ''} / {target}{g.unit ? ` ${g.unit}` : ''}</span> : null}
                      {g.target_date && <span>by {g.target_date}</span>}
                    </div>
                    {target ? (
                      <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {target ? (
                      <input
                        type="number"
                        defaultValue={current}
                        onBlur={e => updateProgress(g, Number(e.target.value))}
                        className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100 outline-none focus:border-sky-600"
                      />
                    ) : null}
                    <button onClick={() => deleteGoal(g.id)} className="opacity-0 group-hover:opacity-100 text-xs text-zinc-500 hover:text-red-400 transition">×</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
