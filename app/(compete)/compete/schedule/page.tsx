'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScheduleEvent, ThrowingTemplate, WorkoutTemplate, ViewMode } from '@/lib/compete/schedule-types'
import { WhoopCycleRow } from '@/lib/compete/whoop-types'
import CalendarMonth from '@/components/compete/schedule/CalendarMonth'
import CalendarWeek from '@/components/compete/schedule/CalendarWeek'
import EventDetail from '@/components/compete/schedule/EventDetail'
import EventFormModal, { EventFormData } from '@/components/compete/schedule/EventFormModal'
import CreateEventMenu from '@/components/compete/schedule/CreateEventMenu'

function getMonthRange(date: Date) {
  const y = date.getFullYear()
  const m = date.getMonth()
  // Include buffer for calendar grid overflow
  const from = new Date(y, m, -6).toISOString().split('T')[0]
  const to = new Date(y, m + 1, 7).toISOString().split('T')[0]
  return { from, to }
}

function getWeekRange(date: Date) {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function SchedulePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [templates, setTemplates] = useState<{ throwing: ThrowingTemplate[]; workout: WorkoutTemplate[] }>({ throwing: [], workout: [] })
  const [whoopRecovery, setWhoopRecovery] = useState<Map<string, WhoopCycleRow>>(new Map())
  const [loading, setLoading] = useState(true)

  // Interaction state
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [createModal, setCreateModal] = useState<'throwing' | 'workout' | 'program' | null>(null)
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null)

  const fetchEvents = useCallback(async () => {
    const range = viewMode === 'month' ? getMonthRange(currentDate) : getWeekRange(currentDate)
    const [schedRes, whoopRes] = await Promise.all([
      fetch(`/api/compete/schedule?from=${range.from}&to=${range.to}`),
      fetch(`/api/compete/whoop/data?from=${range.from}&to=${range.to}&type=cycles`),
    ])
    const schedData = await schedRes.json()
    setEvents(schedData.events || [])

    const whoopData = await whoopRes.json()
    if (whoopData.connected && whoopData.cycles) {
      const map = new Map<string, WhoopCycleRow>()
      for (const c of whoopData.cycles as WhoopCycleRow[]) {
        map.set(c.cycle_date, c)
      }
      setWhoopRecovery(map)
    }
    setLoading(false)
  }, [viewMode, currentDate])

  const fetchTemplates = useCallback(async () => {
    const res = await fetch('/api/compete/schedule/templates')
    const data = await res.json()
    setTemplates({ throwing: data.throwing || [], workout: data.workout || [] })
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  // Navigation
  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate)
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + dir)
    } else {
      d.setDate(d.getDate() + dir * 7)
    }
    setCurrentDate(d)
    setSelectedDate(null)
  }

  const goToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date().toISOString().split('T')[0])
  }

  // Checklist toggle (optimistic)
  const handleToggleChecklist = async (eventId: string, itemId: string, checked: boolean) => {
    // Optimistic update
    setEvents(prev => prev.map(evt => {
      if (evt.id !== eventId) return evt
      const details = evt.event_type === 'throwing' ? evt.throwing_details : evt.workout_details
      if (!details) return evt
      const newChecklist = details.checklist.map(item => item.id === itemId ? { ...item, checked } : item)
      const allChecked = newChecklist.length > 0 && newChecklist.every(item => item.checked)

      if (evt.event_type === 'throwing') {
        return { ...evt, completed: allChecked, throwing_details: { ...evt.throwing_details!, checklist: newChecklist } }
      }
      return { ...evt, completed: allChecked, workout_details: { ...evt.workout_details!, checklist: newChecklist } }
    }))

    // Background API call
    fetch('/api/compete/schedule/checklist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, checklist_item_id: itemId, checked }),
    })
  }

  // Save event (create or edit)
  const handleSave = async (data: EventFormData) => {
    if (data.mode === 'program' && data.program) {
      await fetch('/api/compete/schedule/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.program),
      })
    } else if (data.editId) {
      await fetch('/api/compete/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.editId, event_date: data.event_date, throwing: data.throwing, workout: data.workout }),
      })
    } else {
      await fetch('/api/compete/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: data.event_type, event_date: data.event_date, throwing: data.throwing, workout: data.workout }),
      })
    }

    setCreateModal(null)
    setEditingEvent(null)
    fetchEvents()
  }

  // Delete event
  const handleDelete = async (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId))
    await fetch('/api/compete/schedule', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: eventId }),
    })
  }

  // Save template
  const handleSaveTemplate = async (type: 'throwing' | 'workout', name: string, config: Record<string, unknown>) => {
    await fetch('/api/compete/schedule/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, config }),
    })
    fetchTemplates()
  }

  // Events for selected date (month view detail panel)
  const selectedEvents = selectedDate ? events.filter(e => e.event_date === selectedDate) : []

  const headerLabel = viewMode === 'month'
    ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : (() => {
        const start = new Date(currentDate)
        start.setDate(start.getDate() - start.getDay())
        const end = new Date(start)
        end.setDate(start.getDate() + 6)
        const fmt = (d: Date) => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`
        return `${fmt(start)} — ${fmt(end)}, ${end.getFullYear()}`
      })()

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{headerLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            {(['month', 'week'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  viewMode === m ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {m === 'month' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button onClick={goToday} className="px-2 py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition">Today</button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          <CreateEventMenu onSelect={type => setCreateModal(type)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Calendar */}
          {viewMode === 'month' ? (
            <div className="flex gap-5">
              <div className="flex-1">
                <CalendarMonth
                  currentDate={currentDate}
                  events={events}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  whoopRecovery={whoopRecovery}
                />
              </div>

              {/* Day detail sidebar */}
              <div className="w-72 shrink-0">
                {selectedDate ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </h3>
                      <button
                        onClick={() => { setCreateModal('throwing') }}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition"
                      >
                        + Add
                      </button>
                    </div>
                    {selectedEvents.length === 0 ? (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
                        <p className="text-zinc-600 text-xs">No events</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedEvents.map(evt => (
                          <EventDetail
                            key={evt.id}
                            event={evt}
                            onToggleChecklist={handleToggleChecklist}
                            onEdit={() => setEditingEvent(evt)}
                            onDelete={() => handleDelete(evt.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
                    <p className="text-zinc-600 text-xs">Select a day to view details</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <CalendarWeek
              currentDate={currentDate}
              events={events}
              onToggleChecklist={handleToggleChecklist}
              onEditEvent={setEditingEvent}
              onDeleteEvent={handleDelete}
              whoopRecovery={whoopRecovery}
            />
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-800/50">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] text-zinc-500">Throwing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-[10px] text-zinc-500">Workout</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[10px] text-zinc-500">Completed</span>
            </div>
            {whoopRecovery.size > 0 && (
              <div className="flex items-center gap-1.5">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <span className="text-[10px] text-zinc-500">Recovery</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {(createModal || editingEvent) && (
        <EventFormModal
          mode={createModal === 'program' ? 'program' : (editingEvent?.event_type || createModal || 'throwing') as 'throwing' | 'workout'}
          editingEvent={editingEvent}
          defaultDate={selectedDate || undefined}
          throwingTemplates={templates.throwing}
          workoutTemplates={templates.workout}
          onSave={handleSave}
          onSaveTemplate={handleSaveTemplate}
          onClose={() => { setCreateModal(null); setEditingEvent(null) }}
        />
      )}
    </div>
  )
}
