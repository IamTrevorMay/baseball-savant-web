'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MobileWorkShell from './MobileWorkShell'
import { STATUS_LABEL } from '@/lib/work/sprints'

type Task = {
  id: string; title: string; status: 'inbox'|'today'|'this_week'|'done'|'backlog';
  priority: '1'|'3'|'6'|'10'|'15'; due_date: string|null; completed_at: string|null;
}
const COLUMNS: Task['status'][] = ['today','this_week','inbox','backlog','done']

export default function MobileWorkMyBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [active, setActive] = useState<Task['status']>('today')
  const [newTitle, setNewTitle] = useState('')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('work_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setTasks((data as Task[]) || [])
  }, [])

  useEffect(() => { reload() }, [reload])

  async function add() {
    if (!newTitle.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('work_tasks').insert({ user_id: user.id, title: newTitle.trim(), status: active, priority: '3' })
    setNewTitle('')
    reload()
  }
  async function toggle(t: Task) {
    const supabase = createClient()
    const newStatus = t.status === 'done' ? 'inbox' : 'done'
    await supabase.from('work_tasks').update({
      status: newStatus,
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
    }).eq('id', t.id)
    reload()
  }
  async function move(t: Task, status: Task['status']) {
    const supabase = createClient()
    await supabase.from('work_tasks').update({ status }).eq('id', t.id)
    reload()
  }

  const items = tasks.filter(t => t.status === active)

  return (
    <MobileWorkShell title="My Board">
      <div className="px-3 pt-3">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {COLUMNS.map(c => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${active === c ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}
            >{STATUS_LABEL[c]} <span className="text-zinc-500">{tasks.filter(t => t.status === c).length}</span></button>
          ))}
        </div>
      </div>

      <div className="px-3 space-y-2 mt-2">
        <div className="flex gap-2">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Add task…" className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-600" />
          <button onClick={add} className="px-3 py-2 text-sm rounded bg-sky-600 text-white">Add</button>
        </div>
        {items.map(t => (
          <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-start gap-3">
            <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} className="accent-sky-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${t.status === 'done' ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>{t.title}</div>
              <select value={t.status} onChange={e => move(t, e.target.value as Task['status'])} className="mt-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 outline-none">
                {COLUMNS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">Nothing here.</div>}
      </div>
    </MobileWorkShell>
  )
}
