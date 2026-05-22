'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MobileWorkShell from './MobileWorkShell'
import { isoDate, weekStart, weekEnd } from '@/lib/work/sprints'

type Sprint = { id: string; start_date: string; end_date: string; status: string }
type Goal = { id: string; sprint_id: string; text: string; is_complete: boolean }

export default function MobileWorkSprints() {
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [draft, setDraft] = useState('')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    let { data: active } = await supabase.from('work_sprints').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle()
    if (!active) {
      const { data: created } = await supabase.from('work_sprints').insert({
        user_id: user.id, start_date: isoDate(weekStart()), end_date: isoDate(weekEnd()), status: 'active',
      }).select().single()
      active = created
    }
    setSprint(active as Sprint)
    if (active) {
      const { data: gs } = await supabase.from('work_sprint_goals').select('*').eq('sprint_id', active.id).order('position')
      setGoals((gs as Goal[]) || [])
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  async function add() {
    if (!sprint || !draft.trim() || goals.length >= 5) return
    const supabase = createClient()
    await supabase.from('work_sprint_goals').insert({ sprint_id: sprint.id, text: draft.trim(), position: goals.length })
    setDraft('')
    reload()
  }
  async function toggle(g: Goal) {
    const supabase = createClient()
    await supabase.from('work_sprint_goals').update({ is_complete: !g.is_complete }).eq('id', g.id)
    reload()
  }

  return (
    <MobileWorkShell title="Sprint">
      <div className="p-3 space-y-3">
        {sprint && <div className="text-xs text-zinc-500">{sprint.start_date} → {sprint.end_date}</div>}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">Goals (1–5)</h3>
          <ul className="space-y-2 mb-2">
            {goals.map(g => (
              <li key={g.id} className="flex items-center gap-2">
                <input type="checkbox" checked={g.is_complete} onChange={() => toggle(g)} className="accent-sky-500" />
                <span className={`text-sm flex-1 ${g.is_complete ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>{g.text}</span>
              </li>
            ))}
          </ul>
          {goals.length < 5 && (
            <div className="flex gap-2">
              <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="New goal" className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600" />
              <button onClick={add} className="px-3 py-1.5 text-sm rounded bg-sky-600 text-white">Add</button>
            </div>
          )}
        </div>
      </div>
    </MobileWorkShell>
  )
}
