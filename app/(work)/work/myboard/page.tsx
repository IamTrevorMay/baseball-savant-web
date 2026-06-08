'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import { useToast } from '@/components/ui/Toast'
import MobileWorkMyBoard from '@/components/mobile/work/MobileWorkMyBoard'
import { STATUS_LABEL, CATEGORY_LABEL, PRIORITY_LABEL, POINT_COLORS } from '@/lib/work/sprints'

type TaskStatus = 'inbox' | 'today' | 'this_week' | 'done' | 'backlog'

type Task = {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: TaskStatus
  category: string | null
  priority: '1' | '3' | '6' | '10' | '15'
  due_date: string | null
  completed_at: string | null
  position: number
  athlete_id: string | null
}

const COLUMNS: TaskStatus[] = ['inbox', 'today', 'this_week', 'done', 'backlog']

const COL_COLORS: Record<TaskStatus, string> = {
  inbox: '#a78bfa',
  today: '#38bdf8',
  this_week: '#f59e0b',
  done: '#22c55e',
  backlog: '#f97316',
}

export default function MyBoardPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const { toast } = useToast()
  const [tasks, _setTasks] = useState<Task[]>([])
  const tasksRef = useRef(tasks)
  const setTasks = useCallback((update: Task[] | ((prev: Task[]) => Task[])) => {
    _setTasks(prev => {
      const next = typeof update === 'function' ? update(prev) : update
      tasksRef.current = next
      return next
    })
  }, [])
  const [loading, setLoading] = useState(true)
  const [draftCol, setDraftCol] = useState<TaskStatus | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const creatingRef = useRef(false)

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
  }, [setTasks])

  useEffect(() => { reload() }, [reload])

  async function createTask(status: TaskStatus) {
    if (creatingRef.current) return
    const title = draftTitle.trim()
    if (!title) { setDraftCol(null); setDraftTitle(''); return }
    creatingRef.current = true
    setDraftTitle('')
    setDraftCol(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { creatingRef.current = false; return }
    const { error } = await supabase.from('work_tasks').insert({
      user_id: user.id, title, status, priority: '3',
    })
    creatingRef.current = false
    if (error) {
      toast('Failed to create task', 'error')
    } else {
      reload()
    }
  }

  async function moveTask(id: string, status: TaskStatus) {
    const snapshot = tasksRef.current.find(t => t.id === id)
    if (!snapshot) return
    const patch: Partial<Task> = { status }
    if (status === 'done' && !snapshot.completed_at) patch.completed_at = new Date().toISOString() as any
    if (status !== 'done' && snapshot.completed_at) patch.completed_at = null
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
    const supabase = createClient()
    const { error } = await supabase.from('work_tasks').update(patch).eq('id', id)
    if (error) {
      setTasks(ts => ts.map(t => t.id === id ? snapshot : t))
      toast('Failed to move task', 'error')
    }
  }

  async function toggleDone(t: Task) {
    moveTask(t.id, t.status === 'done' ? 'inbox' : 'done')
  }

  async function deleteTask(id: string) {
    const snapshot = tasksRef.current.find(t => t.id === id)
    setTasks(ts => ts.filter(t => t.id !== id))
    const supabase = createClient()
    const { error } = await supabase.from('work_tasks').delete().eq('id', id)
    if (error && snapshot) {
      setTasks(ts => [...ts, snapshot])
      toast('Failed to delete task', 'error')
    }
  }

  // ── Drag-and-drop ──
  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const newStatus = destination.droppableId as TaskStatus
    const currentTasks = tasksRef.current
    const task = currentTasks.find(t => t.id === draggableId)
    if (!task) return

    // Reindex destination column
    const destTasks = currentTasks
      .filter(t => t.status === newStatus && t.id !== draggableId)
      .sort((a, b) => a.position - b.position)
    destTasks.splice(destination.index, 0, task)
    const reindexed = destTasks.map((t, i) => ({ id: t.id, position: (i + 1) * 10 }))
    const draggedPosition = reindexed.find(r => r.id === draggableId)!.position

    const patch: Partial<Task> = {
      status: newStatus,
      position: draggedPosition,
      ...(newStatus === 'done' && !task.completed_at ? { completed_at: new Date().toISOString() } : {}),
      ...(newStatus !== 'done' ? { completed_at: null } : {}),
    }

    // Optimistic update
    setTasks(ts => ts.map(t => {
      const ri = reindexed.find(r => r.id === t.id)
      if (t.id === draggableId) return { ...t, ...patch }
      if (ri) return { ...t, position: ri.position }
      return t
    }))

    const supabase = createClient()
    try {
      await supabase.from('work_tasks').update(patch).eq('id', draggableId)
      const siblings = reindexed.filter(r => r.id !== draggableId)
      if (siblings.length > 0) {
        await Promise.all(siblings.map(r =>
          supabase.from('work_tasks').update({ position: r.position }).eq('id', r.id)
        ))
      }
    } catch {
      reload()
    }
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
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {COLUMNS.map(col => {
              const items = tasks.filter(t => t.status === col).sort((a, b) => a.position - b.position)
              const color = COL_COLORS[col]
              return (
                <Droppable droppableId={col} key={col}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="rounded-xl border min-h-[60vh] flex flex-col"
                      style={{
                        background: snapshot.isDraggingOver ? 'rgba(56,189,248,0.04)' : 'rgba(24,24,27,1)',
                        borderColor: snapshot.isDraggingOver ? 'rgba(56,189,248,0.2)' : 'rgba(39,39,42,1)',
                      }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{STATUS_LABEL[col]}</h3>
                        <span className="text-[10px] text-zinc-500 ml-auto">{items.length}</span>
                      </div>

                      <div className="flex-1 flex flex-col gap-1.5 px-2 pb-2">
                        {items.map((t, i) => (
                          <Draggable draggableId={t.id} index={i} key={t.id}>
                            {(dragProvided, dragSnapshot) => (
                              <article
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className="rounded-lg p-2.5 transition group"
                                style={{
                                  background: dragSnapshot.isDragging ? 'rgba(56,189,248,0.08)' : 'rgba(9,9,11,1)',
                                  border: dragSnapshot.isDragging ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(39,39,42,1)',
                                  borderLeft: t.priority ? `3px solid ${POINT_COLORS[t.priority] || 'transparent'}` : '3px solid transparent',
                                  ...dragProvided.draggableProps.style,
                                }}
                              >
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
                                    onClick={e => { e.stopPropagation(); deleteTask(t.id) }}
                                    className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-500 hover:text-red-400 transition"
                                  >×</button>
                                </div>
                              </article>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}

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
                  )}
                </Droppable>
              )
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  )
}
