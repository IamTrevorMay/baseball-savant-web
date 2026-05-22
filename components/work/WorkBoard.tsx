'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import SprintGoals from './SprintGoals'
import SprintRetroModal from './SprintRetroModal'
import {
  SPRINT_COLUMNS, BUCKET_COLUMNS, POINT_COLORS,
  PRIORITY_LABEL, CATEGORY_LABEL, PRIORITY_POINTS,
  getSprintWeek, offsetWeek, fmtWeekRange, isCurrentWeek,
} from '@/lib/work/sprints'

type TaskStatus = 'inbox' | 'today' | 'this_week' | 'done' | 'backlog' | 'ready' | 'in_progress' | 'holding'

interface Task {
  id: string
  user_id: string
  title: string
  notes: string | null
  status: TaskStatus
  category: string | null
  priority: string
  due_date: string | null
  completed_at: string | null
  position: number
  athlete_id: string | null
  sprint_id: string | null
  created_at: string
  updated_at: string
}

interface Sprint {
  id: string
  user_id: string
  start_date: string
  end_date: string
  status: string
  velocity: number | null
}

interface Goal {
  id: string
  sprint_id: string
  text: string
  is_complete: boolean
  position: number
}

interface Props {
  onBoardChange?: () => void
  sprintVersion?: number
}

// ─── TaskCard ──────────────────────────────────────────────
function TaskCard({ task, index, onClick, readOnly }: { task: Task; index: number; onClick: (t: Task) => void; readOnly: boolean }) {
  const priorityColor = task.priority ? POINT_COLORS[task.priority] : null

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={readOnly}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => !readOnly && onClick(task)}
          className={`rounded-lg p-2.5 transition ${readOnly ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-zinc-700/30'}`}
          style={{
            background: snapshot.isDragging ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
            border: snapshot.isDragging ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(255,255,255,0.06)',
            borderLeft: priorityColor ? `3px solid ${priorityColor}` : '3px solid transparent',
            ...provided.draggableProps.style,
          }}
        >
          <div className="flex justify-between items-start gap-1.5">
            <div className="text-[13px] text-zinc-200 leading-snug break-words flex-1">
              {task.title}
            </div>
            {task.priority && (
              <span className="text-[10px] font-bold shrink-0 leading-snug" style={{ color: POINT_COLORS[task.priority] }}>
                {task.priority}pt
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {task.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                {CATEGORY_LABEL[task.category] || task.category}
              </span>
            )}
            {task.due_date && (
              <span className="text-[10px] text-zinc-500">
                {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ─── TaskDetailModal ──────────────────────────────────────
function TaskDetailModal({ task, onClose, onSave, onDelete, activeSprint }: {
  task: Task
  onClose: () => void
  onSave: (id: string, updates: Partial<Task>) => void
  onDelete: (id: string) => void
  activeSprint: Sprint | null
}) {
  const [form, setForm] = useState({
    title: task.title,
    notes: task.notes || '',
    category: task.category || '',
    priority: task.priority || '3',
    due_date: task.due_date || '',
  })

  function handleSave() {
    onSave(task.id, {
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      category: form.category || null,
      priority: form.priority || '3',
      due_date: form.due_date || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-white">{task.title ? 'Edit Task' : 'New Task'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg px-2 transition">✕</button>
        </div>

        <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Title</label>
        <input
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white outline-none mb-3"
          autoFocus
        />

        <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })}
          rows={3}
          className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white outline-none resize-y mb-3"
        />

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white outline-none">
              <option value="">None</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Priority</label>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white outline-none">
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v} ({k}pt)</option>)}
            </select>
          </div>
        </div>

        <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Due Date</label>
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-[13px] text-white outline-none mb-3" />

        {/* Sprint controls */}
        <div className="flex gap-2 mt-1 mb-3 flex-wrap">
          {activeSprint && !task.sprint_id && (
            <button
              onClick={() => { onSave(task.id, { sprint_id: activeSprint.id, status: 'ready' as TaskStatus }); onClose() }}
              className="bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
            >
              Add to Sprint
            </button>
          )}
          {activeSprint && task.sprint_id === activeSprint.id && (
            <span className="text-[10px] px-2.5 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 font-semibold flex items-center gap-1">
              In Sprint
              <button
                onClick={() => { onSave(task.id, { sprint_id: null, status: 'backlog' as TaskStatus }); onClose() }}
                className="text-zinc-500 hover:text-zinc-300 text-xs ml-1"
              >
                ×
              </button>
            </span>
          )}
        </div>

        <div className="flex justify-between mt-3">
          <button onClick={() => { onDelete(task.id); onClose() }} className="bg-red-500/15 text-red-400 border border-red-500/20 rounded-lg px-4 py-2 text-[13px] hover:bg-red-500/25 transition">
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-4 py-2 text-[13px] hover:text-zinc-200 transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.title.trim()}
              className="bg-sky-500 text-white rounded-lg px-5 py-2 text-[13px] font-semibold hover:bg-sky-400 disabled:opacity-40 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WorkBoard (main export) ─────────────────────────────
export default function WorkBoard({ onBoardChange, sprintVersion = 0 }: Props) {
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
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const isNewTaskRef = useRef(false)
  const [showAllDone, setShowAllDone] = useState(false)

  // Sprint state
  const [selectedWeek, setSelectedWeek] = useState(getSprintWeek)
  const [sprintForWeek, setSprintForWeek] = useState<Sprint | null>(null)
  const [sprintLoading, setSprintLoading] = useState(true)

  // Plan a Sprint state
  const [planExpanded, setPlanExpanded] = useState(false)
  const [planWeek, setPlanWeek] = useState(() => offsetWeek(getSprintWeek().start, 1))
  const [planSprint, setPlanSprint] = useState<Sprint | null>(null)
  const [planGoals, setPlanGoals] = useState<Goal[]>([])

  // Retro modal
  const [showRetro, setShowRetro] = useState(false)
  const [closeResult, setCloseResult] = useState<{ completedCount: number; completedPoints: number; rolledBackCount: number; sprint: Sprint } | null>(null)

  const isViewingCurrentWeek = isCurrentWeek(selectedWeek.start)
  const isArchived = sprintForWeek?.status === 'completed'
  const activeSprint = sprintForWeek?.status === 'active' ? sprintForWeek : null

  // ── Fetch sprint for selected week ──
  const fetchSprintForWeek = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSprintLoading(true)
    const { data } = await supabase
      .from('work_sprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('start_date', selectedWeek.start)
      .maybeSingle()
    setSprintForWeek(data)
    setSprintLoading(false)
  }, [selectedWeek.start])

  const fetchPlanSprint = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('work_sprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('start_date', planWeek.start)
      .maybeSingle()
    setPlanSprint(data)
  }, [planWeek.start])

  const fetchPlanGoals = useCallback(async () => {
    if (!planSprint) { setPlanGoals([]); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('work_sprint_goals')
      .select('*')
      .eq('sprint_id', planSprint.id)
      .order('position')
    setPlanGoals((data as Goal[]) || [])
  }, [planSprint])

  // ── Fetch tasks ──
  const fetchTasks = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('work_tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
    setTasks((data as Task[]) || [])
    setLoading(false)
  }, [setTasks])

  useEffect(() => { fetchTasks() }, [fetchTasks, sprintVersion])
  useEffect(() => { fetchSprintForWeek() }, [fetchSprintForWeek])
  useEffect(() => { fetchPlanSprint() }, [fetchPlanSprint])
  useEffect(() => { fetchPlanGoals() }, [fetchPlanGoals])

  // ── Week navigation ──
  function navigateWeek(offset: number) {
    setSelectedWeek(prev => offsetWeek(prev.start, offset))
  }

  // ── Start sprint ──
  async function startSprint(week: { start: string; end: string }) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Close stale active sprints from previous weeks
    const { data: staleSprints } = await supabase
      .from('work_sprints')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .neq('start_date', week.start)

    for (const stale of (staleSprints || [])) {
      const { data: staleTasks } = await supabase
        .from('work_tasks')
        .select('id, status, priority')
        .eq('sprint_id', stale.id)
      const pts = (t: any) => parseInt(t.priority) || 0
      const vel = (staleTasks || [])
        .filter(t => t.status === 'done')
        .reduce((sum, t) => sum + pts(t), 0)
      await supabase
        .from('work_sprints')
        .update({ status: 'completed', velocity: vel, updated_at: new Date().toISOString() })
        .eq('id', stale.id)
    }

    const { data: newSprint, error } = await supabase.from('work_sprints').insert({
      user_id: user.id,
      start_date: week.start,
      end_date: week.end,
      status: 'active',
    }).select('id').single()

    if (error) {
      fetchSprintForWeek()
      fetchPlanSprint()
      return
    }

    // Carry over incomplete tasks from previous sprint
    if (newSprint) {
      const { data: prevSprint } = await supabase
        .from('work_sprints')
        .select('id')
        .eq('user_id', user.id)
        .neq('id', newSprint.id)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (prevSprint) {
        await supabase
          .from('work_tasks')
          .update({ sprint_id: newSprint.id, updated_at: new Date().toISOString() })
          .eq('sprint_id', prevSprint.id)
          .eq('user_id', user.id)
          .neq('status', 'done')
      }

      // Adopt orphaned sprint-status tasks
      await supabase
        .from('work_tasks')
        .update({ sprint_id: newSprint.id, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('sprint_id', null)
        .in('status', ['ready', 'in_progress', 'holding'])
    }

    if (week.start === selectedWeek.start) fetchSprintForWeek()
    if (week.start === planWeek.start) { fetchPlanSprint(); setPlanExpanded(false) }
    fetchTasks()
    onBoardChange?.()
  }

  // ── Complete sprint ──
  async function completeSprint() {
    if (!activeSprint) return
    const supabase = createClient()
    const { data: sprintTasks } = await supabase
      .from('work_tasks')
      .select('id, status, priority')
      .eq('sprint_id', activeSprint.id)

    const pts = (t: any) => parseInt(t.priority) || 0
    const completedTasks = (sprintTasks || []).filter(t => t.status === 'done')
    const completedPoints = completedTasks.reduce((sum, t) => sum + pts(t), 0)
    const incompleteTasks = (sprintTasks || []).filter(t => t.status !== 'done')

    await supabase
      .from('work_sprints')
      .update({ status: 'completed', velocity: completedPoints, updated_at: new Date().toISOString() })
      .eq('id', activeSprint.id)

    if (incompleteTasks.length > 0) {
      await supabase
        .from('work_tasks')
        .update({ sprint_id: null, status: 'backlog', updated_at: new Date().toISOString() })
        .in('id', incompleteTasks.map(t => t.id))
    }

    setCloseResult({ completedCount: completedTasks.length, completedPoints, rolledBackCount: incompleteTasks.length, sprint: { ...activeSprint } })
    setShowRetro(true)
  }

  function handleRetroSaved() {
    setShowRetro(false)
    setCloseResult(null)
    fetchSprintForWeek()
    fetchTasks()
    onBoardChange?.()
  }

  // ── Quick capture ──
  async function addTask() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const inboxTasks = tasks.filter(t => t.status === 'inbox')
    const minPos = inboxTasks.length > 0 ? Math.min(...inboxTasks.map(t => t.position)) : 10
    const { data, error } = await supabase.from('work_tasks').insert({
      user_id: user.id,
      title: '',
      status: 'inbox',
      position: minPos - 10,
      priority: '3',
    }).select().single()
    if (!error && data) {
      setTasks(prev => [...prev, data as Task])
      setEditingTask(data as Task)
      isNewTaskRef.current = true
    }
  }

  // ── Update task ──
  async function updateTask(id: string, updates: Partial<Task>) {
    const snapshot = tasksRef.current.find(t => t.id === id)
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t))
    const supabase = createClient()
    const { error } = await supabase
      .from('work_tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error && snapshot) {
      setTasks(ts => ts.map(t => t.id === id ? snapshot : t))
    }
  }

  // ── Delete task ──
  async function deleteTask(id: string) {
    const snapshot = tasksRef.current.find(t => t.id === id)
    setTasks(ts => ts.filter(t => t.id !== id))
    const supabase = createClient()
    const { error } = await supabase.from('work_tasks').delete().eq('id', id)
    if (error && snapshot) {
      setTasks(ts => [...ts, snapshot])
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

    const isSprint = ['ready', 'in_progress', 'holding', 'done'].includes(newStatus)

    const destTasks = currentTasks
      .filter(t => t.status === newStatus && t.id !== draggableId)
      .sort((a, b) => a.position - b.position)
    destTasks.splice(destination.index, 0, task)
    const reindexed = destTasks.map((t, i) => ({ id: t.id, position: (i + 1) * 10 }))
    const draggedPosition = reindexed.find(r => r.id === draggableId)!.position

    const taskUpdates: Partial<Task> = {
      status: newStatus,
      position: draggedPosition,
      ...(newStatus === 'done' && !task.completed_at ? { completed_at: new Date().toISOString() } : {}),
      ...(newStatus !== 'done' ? { completed_at: null } : {}),
      ...(isSprint && activeSprint && !task.sprint_id ? { sprint_id: activeSprint.id } : {}),
      ...(!isSprint && task.sprint_id ? { sprint_id: null } : {}),
    }

    setTasks(ts => ts.map(t => {
      const ri = reindexed.find(r => r.id === t.id)
      if (t.id === draggableId) return { ...t, ...taskUpdates, updated_at: new Date().toISOString() }
      if (ri) return { ...t, position: ri.position }
      return t
    }))

    const supabase = createClient()
    try {
      await supabase
        .from('work_tasks')
        .update({ ...taskUpdates, updated_at: new Date().toISOString() })
        .eq('id', draggableId)

      const siblings = reindexed.filter(r => r.id !== draggableId)
      if (siblings.length > 0) {
        await Promise.all(siblings.map(r =>
          supabase.from('work_tasks').update({ position: r.position }).eq('id', r.id)
        ))
      }
    } catch {
      fetchTasks()
    }

    onBoardChange?.()
  }

  // ── Get visible tasks for a column ──
  function getVisibleTasks(columnId: string) {
    let colTasks = tasks.filter(t => t.status === columnId).sort((a, b) => a.position - b.position)

    if (['ready', 'in_progress', 'holding', 'done'].includes(columnId) && sprintForWeek) {
      colTasks = colTasks.filter(t => t.sprint_id === sprintForWeek.id)
    }

    if (columnId !== 'done' || showAllDone) return colTasks
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return colTasks.filter(t => !t.completed_at || new Date(t.completed_at) >= sevenDaysAgo)
  }

  function getDoneHiddenCount() {
    const allDone = tasks.filter(t => t.status === 'done' && (!sprintForWeek || t.sprint_id === sprintForWeek.id))
    const visible = getVisibleTasks('done')
    return allDone.length - visible.length
  }

  // ── Sprint task points for progress bar ──
  const sprintTaskPoints = (() => {
    if (!sprintForWeek) return { total: 0, completed: 0 }
    const sTasks = tasks.filter(t => t.sprint_id === sprintForWeek.id)
    const pts = (t: Task) => parseInt(t.priority) || 0
    return {
      total: sTasks.reduce((sum, t) => sum + pts(t), 0),
      completed: sTasks.filter(t => t.status === 'done').reduce((sum, t) => sum + pts(t), 0),
    }
  })()

  if (loading) {
    return <div className="text-sm text-zinc-500">Loading...</div>
  }

  return (
    <div>
      {/* ── Header: Sprint title + week selector ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isArchived && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 font-semibold uppercase tracking-wide">
              Archived
            </span>
          )}
          {activeSprint && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 font-semibold uppercase tracking-wide">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigateWeek(-1)} className="bg-zinc-800 border border-zinc-700 rounded-md text-zinc-500 text-sm px-2.5 py-1 hover:text-zinc-300 transition">
            ←
          </button>
          <span className="text-[13px] text-zinc-400 font-medium min-w-[140px] text-center">
            {fmtWeekRange(selectedWeek.start, selectedWeek.end)}
          </span>
          <button onClick={() => navigateWeek(1)} className="bg-zinc-800 border border-zinc-700 rounded-md text-zinc-500 text-sm px-2.5 py-1 hover:text-zinc-300 transition">
            →
          </button>
          {!isViewingCurrentWeek && (
            <button onClick={() => setSelectedWeek(getSprintWeek())} className="bg-zinc-800 border border-zinc-700 rounded-md text-zinc-500 text-[11px] px-2.5 py-1 hover:text-zinc-300 transition">
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── Sprint progress bar ── */}
      {sprintForWeek && (
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-300"
              style={{ width: sprintTaskPoints.total > 0 ? `${(sprintTaskPoints.completed / sprintTaskPoints.total) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-zinc-500 whitespace-nowrap">
            {sprintTaskPoints.completed}/{sprintTaskPoints.total} pts
          </span>
          {activeSprint && (
            <button onClick={completeSprint} className="bg-emerald-500/12 text-emerald-400 border border-emerald-500/20 rounded-lg px-3.5 py-1.5 text-[11px] font-semibold whitespace-nowrap hover:bg-emerald-500/20 transition">
              Complete Sprint
            </button>
          )}
          {isArchived && sprintForWeek.velocity != null && (
            <span className="text-[11px] text-zinc-500">Velocity: {sprintForWeek.velocity} pts</span>
          )}
        </div>
      )}

      {/* ── No sprint CTA ── */}
      {!sprintLoading && !sprintForWeek && isViewingCurrentWeek && (
        <div className="text-center py-4 mb-3">
          <button onClick={() => startSprint(selectedWeek)} className="bg-sky-500 text-white rounded-lg px-5 py-2 text-xs font-semibold hover:bg-sky-400 transition">
            Start Sprint for This Week
          </button>
        </div>
      )}

      {/* ── Kanban ── */}
      <DragDropContext onDragEnd={onDragEnd}>
        {/* Sprint columns (4-column grid) */}
        <div className="grid grid-cols-4 gap-3">
          {SPRINT_COLUMNS.map(col => {
            const colTasks = getVisibleTasks(col.id)
            const hiddenCount = col.id === 'done' ? getDoneHiddenCount() : 0
            return (
              <Droppable droppableId={col.id} key={col.id} isDropDisabled={!!isArchived}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-xl border min-h-[200px] flex flex-col ${isArchived ? 'opacity-70' : ''}`}
                    style={{
                      background: snapshot.isDraggingOver ? 'rgba(56,189,248,0.04)' : 'rgba(255,255,255,0.02)',
                      borderColor: snapshot.isDraggingOver ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: col.color }}>
                        {col.label}
                      </span>
                      <span className="text-[11px] text-zinc-600 ml-auto">{colTasks.length}</span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 px-2 pb-2">
                      {colTasks.map((task, i) => (
                        <TaskCard key={task.id} task={task} index={i} onClick={setEditingTask} readOnly={!!isArchived} />
                      ))}
                      {provided.placeholder}
                      {col.id === 'done' && hiddenCount > 0 && (
                        <button onClick={() => setShowAllDone(!showAllDone)} className="text-[11px] text-zinc-600 hover:text-zinc-400 py-1.5 text-center transition">
                          {showAllDone ? 'Show recent only' : `Show ${hiddenCount} older`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>

        {/* ── Plan a Sprint ── */}
        <div className="my-4">
          <button
            onClick={() => setPlanExpanded(!planExpanded)}
            className="w-full bg-transparent border border-zinc-800 rounded-lg text-zinc-500 text-xs font-semibold py-2 flex items-center justify-center gap-1.5 hover:text-zinc-300 hover:border-zinc-700 transition"
          >
            <span className={`inline-block transition-transform ${planExpanded ? 'rotate-90' : ''}`}>▶</span>
            Plan a Sprint
          </button>
          {planExpanded && (
            <div className="mt-3 p-4 bg-zinc-800/30 border border-zinc-800 rounded-2xl">
              <div className="flex items-center justify-center gap-2 mb-3.5">
                <button onClick={() => setPlanWeek(prev => offsetWeek(prev.start, -1))} className="bg-zinc-800 border border-zinc-700 rounded-md text-zinc-500 text-sm px-2.5 py-1 hover:text-zinc-300 transition">←</button>
                <span className="text-[13px] text-zinc-400 font-medium min-w-[140px] text-center">
                  {fmtWeekRange(planWeek.start, planWeek.end)}
                </span>
                <button onClick={() => setPlanWeek(prev => offsetWeek(prev.start, 1))} className="bg-zinc-800 border border-zinc-700 rounded-md text-zinc-500 text-sm px-2.5 py-1 hover:text-zinc-300 transition">→</button>
              </div>
              {planSprint ? (
                <div>
                  <div className="text-xs text-zinc-500 text-center mb-2.5">
                    Sprint already {planSprint.status === 'active' ? 'active' : 'exists'} for this week.
                  </div>
                  {planSprint.status !== 'completed' && (
                    <SprintGoals goals={planGoals} sprintId={planSprint.id} onUpdate={fetchPlanGoals} />
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-zinc-500 mb-3">No sprint planned for this week yet.</p>
                  <button onClick={() => startSprint(planWeek)} className="bg-sky-500 text-white rounded-lg px-5 py-2 text-xs font-semibold hover:bg-sky-400 transition">
                    Start Sprint
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick capture */}
        <div className="mb-4">
          <button onClick={addTask} className="bg-sky-500 text-white rounded-xl px-5 py-2.5 text-[13px] font-semibold hover:bg-sky-400 transition">
            + New Task
          </button>
        </div>

        {/* ── Bucket columns (Inbox + Backlog) ── */}
        <div className="grid grid-cols-2 gap-3">
          {BUCKET_COLUMNS.map(col => {
            const colTasks = getVisibleTasks(col.id)
            return (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="rounded-xl border min-h-[120px] flex flex-col"
                    style={{
                      background: snapshot.isDraggingOver ? 'rgba(56,189,248,0.04)' : 'rgba(255,255,255,0.02)',
                      borderColor: snapshot.isDraggingOver ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: col.color }}>
                        {col.label}
                      </span>
                      <span className="text-[11px] text-zinc-600 ml-auto">{colTasks.length}</span>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-1.5 px-2 pb-2">
                      {colTasks.map((task, i) => (
                        <TaskCard key={task.id} task={task} index={i} onClick={setEditingTask} readOnly={false} />
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {/* Detail modal */}
      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          onClose={() => {
            if (isNewTaskRef.current) {
              isNewTaskRef.current = false
              const current = tasksRef.current.find(t => t.id === editingTask.id)
              if (current && !current.title?.trim()) deleteTask(editingTask.id)
            }
            setEditingTask(null)
          }}
          onSave={(id, updates) => { isNewTaskRef.current = false; updateTask(id, updates) }}
          onDelete={(id) => { isNewTaskRef.current = false; deleteTask(id) }}
          activeSprint={activeSprint}
        />
      )}

      {/* Retro modal */}
      {showRetro && closeResult && (
        <SprintRetroModal
          sprint={closeResult.sprint}
          completedCount={closeResult.completedCount}
          completedPoints={closeResult.completedPoints}
          rolledBackCount={closeResult.rolledBackCount}
          onClose={handleRetroSaved}
          onSaved={handleRetroSaved}
        />
      )}
    </div>
  )
}
