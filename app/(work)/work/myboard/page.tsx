'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import MobileWorkMyBoard from '@/components/mobile/work/MobileWorkMyBoard'
import { STATUS_LABEL, CATEGORY_LABEL, PRIORITY_LABEL } from '@/lib/work/sprints'

type Task = {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: 'inbox' | 'today' | 'this_week' | 'done' | 'backlog'
  category: string | null
  priority: '1' | '3' | '6' | '10' | '15'
  due_date: string | null
  completed_at: string | null
  position: number
  athlete_id: string | null
}

const COLUMNS: Task['status'][] = ['inbox', 'today', 'this_week', 'done', 'backlog']

export default function MyBoardPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [draftCol, setDraftCol] = useState<Task['status'] | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return setLoading(false)
    const { data } = await supabase
      .from('work_tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
    setTasks((data as Task[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const creatingRef = useRef(false)
  async function createTask(status: Task['status']) {
    const title = draftTitle.trim()
    if (!title) { setDraftCol(null); return }
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('work_tasks').insert({
        user_id: user.id, title, status, priority: '3',
      })
      setDraftTitle('')
      setDraftCol(null)
      reload()
    } finally { creatingRef.current = false }
  }

  async function moveTask(t: Task, status: Task['status']) {
    const supabase = createClient()
    const patch: Partial<Task> = { status }
    if (status === 'done' && !t.completed_at) patch.completed_at = new Date().toISOString() as any
    if (status !== 'done' && t.completed_at) patch.completed_at = null
    await supabase.from('work_tasks').update(patch).eq('id', t.id)
    reload()
  }

  async function toggleDone(t: Task) {
    moveTask(t, t.status === 'done' ? 'inbox' : 'done')
  }

  async function deleteTask(id: string) {
    const supabase = createClient()
    await supabase.from('work_tasks').delete().eq('id', id)
    reload()
  }

  if (deviceLoading) return null
  if (isMobile) return <MobileWorkMyBoard />

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Board</h1>
          <p className="text-sm text-zinc-500 mt-1">Personal task surface. Drag from Inbox → Today → Done.</p>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {COLUMNS.map(col => {
            const items = tasks.filter(t => t.status === col)
            return (
              <div key={col} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 min-h-[60vh]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs uppercase tracking-wider text-zinc-400">{STATUS_LABEL[col]}</h3>
                  <span className="text-[10px] text-zinc-500">{items.length}</span>
                </div>

                <div className="space-y-2">
                  {items.map(t => (
                    <article key={t.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 hover:border-zinc-700 transition group">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={t.status === 'done'}
                          onChange={() => toggleDone(t)}
                          className="mt-0.5 accent-sky-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${t.status === 'done' ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>{t.title}</div>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {t.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{CATEGORY_LABEL[t.category] || t.category}</span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300">{PRIORITY_LABEL[t.priority]}</span>
                            {t.due_date && (
                              <span className="text-[10px] text-zinc-500">{t.due_date}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteTask(t.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-500 hover:text-red-400 transition"
                        >×</button>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {COLUMNS.filter(c => c !== t.status).map(c => (
                          <button
                            key={c}
                            onClick={() => moveTask(t, c)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                          >→ {STATUS_LABEL[c]}</button>
                        ))}
                      </div>
                    </article>
                  ))}

                  {draftCol === col ? (
                    <div className="bg-zinc-950 border border-sky-700 rounded-lg p-2">
                      <input
                        autoFocus
                        value={draftTitle}
                        onChange={e => setDraftTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') createTask(col)
                          if (e.key === 'Escape') { setDraftCol(null); setDraftTitle('') }
                        }}
                        onBlur={() => createTask(col)}
                        placeholder="Task title…"
                        className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setDraftCol(col); setDraftTitle('') }}
                      className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 rounded-lg hover:bg-zinc-800/50 transition"
                    >+ Add task</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
