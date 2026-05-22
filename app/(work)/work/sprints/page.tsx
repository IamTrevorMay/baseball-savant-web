'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkSprints from '@/components/mobile/work/MobileWorkSprints'
import { isoDate, weekStart, weekEnd, PRIORITY_POINTS } from '@/lib/work/sprints'

type Sprint = {
  id: string
  user_id: string
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'planning'
  velocity: number | null
}
type SprintGoal = { id: string; sprint_id: string; text: string; is_complete: boolean; position: number }
type Retro = { id: string; sprint_id: string; went_well: string; to_improve: string }

export default function SprintsPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [goals, setGoals] = useState<SprintGoal[]>([])
  const [retro, setRetro] = useState<Retro | null>(null)
  const [history, setHistory] = useState<Sprint[]>([])
  const [points, setPoints] = useState({ done: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [goalDraft, setGoalDraft] = useState('')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setLoading(false)

    // Active sprint or create one for the current week
    const ws = isoDate(weekStart()), we = isoDate(weekEnd())
    let { data: active } = await supabase
      .from('work_sprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!active) {
      const { data: created } = await supabase
        .from('work_sprints')
        .insert({ user_id: user.id, start_date: ws, end_date: we, status: 'active' })
        .select()
        .single()
      active = created
    }
    setSprint(active as Sprint)

    if (active) {
      const [{ data: gs }, { data: r }, taskPts] = await Promise.all([
        supabase.from('work_sprint_goals').select('*').eq('sprint_id', active.id).order('position', { ascending: true }),
        supabase.from('work_sprint_retros').select('*').eq('sprint_id', active.id).maybeSingle(),
        supabase.from('work_tasks').select('priority, status').eq('sprint_id', active.id),
      ])
      setGoals((gs as SprintGoal[]) || [])
      setRetro((r as Retro) || null)
      const tp = (taskPts.data as { priority: string; status: string }[] | null) || []
      const total = tp.reduce((acc, t) => acc + (PRIORITY_POINTS[t.priority] || 0), 0)
      const done = tp.filter(t => t.status === 'done').reduce((acc, t) => acc + (PRIORITY_POINTS[t.priority] || 0), 0)
      setPoints({ done, total })
    }

    const { data: past } = await supabase
      .from('work_sprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('start_date', { ascending: false })
      .limit(8)
    setHistory((past as Sprint[]) || [])

    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function addGoal() {
    if (!sprint || !goalDraft.trim() || goals.length >= 5) return
    const supabase = createClient()
    await supabase.from('work_sprint_goals').insert({
      sprint_id: sprint.id, text: goalDraft.trim(), position: goals.length,
    })
    setGoalDraft('')
    reload()
  }
  async function toggleGoal(g: SprintGoal) {
    const supabase = createClient()
    await supabase.from('work_sprint_goals').update({ is_complete: !g.is_complete }).eq('id', g.id)
    reload()
  }
  async function deleteGoal(id: string) {
    const supabase = createClient()
    await supabase.from('work_sprint_goals').delete().eq('id', id)
    reload()
  }

  async function saveRetro(field: 'went_well' | 'to_improve', value: string) {
    if (!sprint) return
    const supabase = createClient()
    if (retro) {
      await supabase.from('work_sprint_retros').update({ [field]: value }).eq('id', retro.id)
    } else {
      await supabase.from('work_sprint_retros').insert({ sprint_id: sprint.id, [field]: value })
    }
    reload()
  }

  async function completeSprint() {
    if (!sprint) return
    const supabase = createClient()
    await supabase.from('work_sprints').update({ status: 'completed', velocity: points.done }).eq('id', sprint.id)
    reload()
  }

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkSprints />

  const pct = points.total ? Math.round((points.done / points.total) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sprint</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {sprint ? `${sprint.start_date} → ${sprint.end_date}` : 'Loading…'}
          </p>
        </div>
        {sprint && (
          <button
            onClick={completeSprint}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition"
          >Close sprint</button>
        )}
      </header>

      {loading ? <div className="text-sm text-zinc-500">Loading…</div> : (
        <>
          {/* Velocity */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-100">Velocity</h2>
              <span className="text-xs text-zinc-500">{points.done} / {points.total} pts</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </section>

          {/* Sprint goals */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-100 mb-3">Sprint Goals (1–5)</h2>
            <ul className="space-y-2 mb-3">
              {goals.map(g => (
                <li key={g.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={g.is_complete} onChange={() => toggleGoal(g)} className="accent-sky-500" />
                  <span className={`text-sm flex-1 ${g.is_complete ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>{g.text}</span>
                  <button onClick={() => deleteGoal(g.id)} className="opacity-0 group-hover:opacity-100 text-xs text-zinc-500 hover:text-red-400">remove</button>
                </li>
              ))}
            </ul>
            {goals.length < 5 && (
              <div className="flex gap-2">
                <input
                  value={goalDraft}
                  onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addGoal() }}
                  placeholder="What's the most important outcome this week?"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-sky-600"
                />
                <button onClick={addGoal} className="px-3 py-1.5 text-sm rounded bg-sky-600 hover:bg-sky-500 text-white">Add</button>
              </div>
            )}
          </section>

          {/* Retro */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-100 mb-3">Retro</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RetroField label="What went well" value={retro?.went_well || ''} onSave={v => saveRetro('went_well', v)} />
              <RetroField label="What to improve" value={retro?.to_improve || ''} onSave={v => saveRetro('to_improve', v)} />
            </div>
          </section>

          {/* History */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-100 mb-3">Recent sprints</h2>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-500">No completed sprints yet.</p>
            ) : (
              <div className="space-y-1">
                {history.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-300">{s.start_date} → {s.end_date}</span>
                    <span className="text-zinc-500 text-xs">{s.velocity ?? 0} pts</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function RetroField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <textarea
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        rows={4}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-sky-600 resize-none"
        placeholder="Notes…"
      />
    </div>
  )
}
