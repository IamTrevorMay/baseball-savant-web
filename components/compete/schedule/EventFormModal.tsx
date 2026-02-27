'use client'

import { useState } from 'react'
import { ScheduleEvent, ThrowingTemplate, WorkoutTemplate, ChecklistItem, Exercise } from '@/lib/compete/schedule-types'

interface Props {
  mode: 'throwing' | 'workout' | 'program'
  editingEvent?: ScheduleEvent | null
  defaultDate?: string
  throwingTemplates: ThrowingTemplate[]
  workoutTemplates: WorkoutTemplate[]
  onSave: (data: EventFormData) => void
  onSaveTemplate: (type: 'throwing' | 'workout', name: string, config: Record<string, unknown>) => void
  onClose: () => void
}

export interface EventFormData {
  mode: 'single' | 'program'
  event_type: 'throwing' | 'workout'
  event_date?: string
  // Single event fields
  throwing?: { throws?: number; distance_ft?: number; effort_pct?: number; notes?: string; checklist: ChecklistItem[] }
  workout?: { title?: string; description?: string; exercises: Exercise[]; checklist: ChecklistItem[] }
  // Program fields
  program?: { name: string; start_date: string; weeks: number; days: { day_of_week: number; throwing?: Record<string, unknown>; workout?: Record<string, unknown> }[] }
  // Editing
  editId?: string
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function EventFormModal({ mode, editingEvent, defaultDate, throwingTemplates, workoutTemplates, onSave, onSaveTemplate, onClose }: Props) {
  const isEditing = !!editingEvent
  const isProgram = mode === 'program'
  const eventType = mode === 'program' ? 'throwing' : mode

  // Single event state
  const [date, setDate] = useState(editingEvent?.event_date || defaultDate || new Date().toISOString().split('T')[0])
  const [throws, setThrows] = useState(editingEvent?.throwing_details?.throws ?? '')
  const [distanceFt, setDistanceFt] = useState(editingEvent?.throwing_details?.distance_ft ?? '')
  const [effortPct, setEffortPct] = useState(editingEvent?.throwing_details?.effort_pct ?? '')
  const [notes, setNotes] = useState(editingEvent?.throwing_details?.notes ?? '')
  const [workoutTitle, setWorkoutTitle] = useState(editingEvent?.workout_details?.title ?? '')
  const [workoutDesc, setWorkoutDesc] = useState(editingEvent?.workout_details?.description ?? '')
  const [exercises, setExercises] = useState<Exercise[]>(editingEvent?.workout_details?.exercises || [])
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    (eventType === 'throwing' ? editingEvent?.throwing_details?.checklist : editingEvent?.workout_details?.checklist) || []
  )

  // Program state
  const [programType, setProgramType] = useState<'throwing' | 'workout'>('throwing')
  const [programName, setProgramName] = useState('')
  const [programStart, setProgramStart] = useState(defaultDate || new Date().toISOString().split('T')[0])
  const [programWeeks, setProgramWeeks] = useState(4)
  const [programDays, setProgramDays] = useState<number[]>([])

  // Template state
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // Checklist management
  const [newCheckItem, setNewCheckItem] = useState('')
  const addCheckItem = () => {
    if (!newCheckItem.trim()) return
    setChecklist([...checklist, { id: crypto.randomUUID(), label: newCheckItem.trim(), checked: false }])
    setNewCheckItem('')
  }
  const removeCheckItem = (id: string) => setChecklist(checklist.filter(c => c.id !== id))

  // Exercise management
  const [newExName, setNewExName] = useState('')
  const addExercise = () => {
    if (!newExName.trim()) return
    setExercises([...exercises, { id: crypto.randomUUID(), name: newExName.trim(), reps: '', weight: '' }])
    setNewExName('')
  }
  const updateExercise = (id: string, field: keyof Exercise, value: string) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex))
  }
  const removeExercise = (id: string) => setExercises(exercises.filter(e => e.id !== id))

  // Apply template
  const applyTemplate = (templateId: string) => {
    const actualType = isProgram ? programType : eventType
    if (actualType === 'throwing') {
      const t = throwingTemplates.find(t => t.id === templateId)
      if (!t) return
      setThrows(t.config.throws ?? '')
      setDistanceFt(t.config.distance_ft ?? '')
      setEffortPct(t.config.effort_pct ?? '')
      setNotes(t.config.notes ?? '')
      setChecklist(t.config.checklist || [])
    } else {
      const t = workoutTemplates.find(t => t.id === templateId)
      if (!t) return
      setWorkoutTitle(t.config.title ?? '')
      setWorkoutDesc(t.config.description ?? '')
      setExercises(t.config.exercises || [])
      setChecklist(t.config.checklist || [])
    }
  }

  const handleSubmit = () => {
    if (isProgram) {
      if (!programName.trim() || programDays.length === 0) return
      const days = programDays.map(dow => {
        if (programType === 'throwing') {
          return {
            day_of_week: dow,
            throwing: { throws: throws ? Number(throws) : undefined, distance_ft: distanceFt ? Number(distanceFt) : undefined, effort_pct: effortPct ? Number(effortPct) : undefined, notes: notes || undefined, checklist },
          }
        }
        return {
          day_of_week: dow,
          workout: { title: workoutTitle || undefined, description: workoutDesc || undefined, exercises, checklist },
        }
      })
      onSave({
        mode: 'program',
        event_type: programType,
        program: { name: programName, start_date: programStart, weeks: programWeeks, days },
      })
    } else {
      const data: EventFormData = {
        mode: 'single',
        event_type: eventType,
        event_date: date,
        editId: editingEvent?.id,
      }
      if (eventType === 'throwing') {
        data.throwing = { throws: throws ? Number(throws) : undefined, distance_ft: distanceFt ? Number(distanceFt) : undefined, effort_pct: effortPct ? Number(effortPct) : undefined, notes: notes || undefined, checklist }
      } else {
        data.workout = { title: workoutTitle || undefined, description: workoutDesc || undefined, exercises, checklist }
      }
      onSave(data)
    }
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return
    const actualType = isProgram ? programType : eventType
    if (actualType === 'throwing') {
      onSaveTemplate('throwing', templateName, { throws: throws ? Number(throws) : undefined, distance_ft: distanceFt ? Number(distanceFt) : undefined, effort_pct: effortPct ? Number(effortPct) : undefined, notes: notes || undefined, checklist })
    } else {
      onSaveTemplate('workout', templateName, { title: workoutTitle || undefined, description: workoutDesc || undefined, exercises, checklist })
    }
    setTemplateName('')
    setShowSaveTemplate(false)
  }

  const actualType = isProgram ? programType : eventType
  const templates = actualType === 'throwing' ? throwingTemplates : workoutTemplates

  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600'
  const labelCls = 'text-[11px] font-medium text-zinc-500 uppercase tracking-wider'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">
            {isEditing ? 'Edit Event' : isProgram ? 'Create Program' : `Add ${eventType === 'throwing' ? 'Throwing' : 'Workout'} Day`}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Program-specific fields */}
          {isProgram && (
            <>
              <div>
                <label className={labelCls}>Program Name</label>
                <input className={inputCls} value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g. Spring Throwing Program" />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <div className="flex gap-2 mt-1">
                  {(['throwing', 'workout'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setProgramType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        programType === t
                          ? t === 'throwing' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {t === 'throwing' ? 'Throwing' : 'Workout'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input type="date" className={inputCls} value={programStart} onChange={e => setProgramStart(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Weeks</label>
                  <input type="number" min={1} max={12} className={inputCls} value={programWeeks} onChange={e => setProgramWeeks(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Days of Week</label>
                <div className="flex gap-1.5 mt-1">
                  {DOW_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => setProgramDays(programDays.includes(i) ? programDays.filter(d => d !== i) : [...programDays, i])}
                      className={`w-9 h-9 rounded-lg text-[11px] font-medium transition ${
                        programDays.includes(i)
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-zinc-800 text-zinc-600 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <p className="text-[11px] text-zinc-500 mb-2">Configure each day&apos;s details below (applied to all selected days):</p>
              </div>
            </>
          )}

          {/* Date (single event only) */}
          {!isProgram && (
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          )}

          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <label className={labelCls}>Load Template</label>
              <select className={inputCls} defaultValue="" onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}>
                <option value="">Choose a template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Throwing fields */}
          {actualType === 'throwing' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Throws</label>
                  <input type="number" className={inputCls} value={throws} onChange={e => setThrows(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Distance (ft)</label>
                  <input type="number" className={inputCls} value={distanceFt} onChange={e => setDistanceFt(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Effort %</label>
                  <input type="number" min={0} max={100} className={inputCls} value={effortPct} onChange={e => setEffortPct(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={`${inputCls} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Session notes..." />
              </div>
            </>
          )}

          {/* Workout fields */}
          {actualType === 'workout' && (
            <>
              <div>
                <label className={labelCls}>Title</label>
                <input className={inputCls} value={workoutTitle} onChange={e => setWorkoutTitle(e.target.value)} placeholder="e.g. Upper Body Strength" />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea className={`${inputCls} resize-none`} rows={2} value={workoutDesc} onChange={e => setWorkoutDesc(e.target.value)} placeholder="Workout description..." />
              </div>
              <div>
                <label className={labelCls}>Exercises</label>
                <div className="space-y-2 mt-1">
                  {exercises.map(ex => (
                    <div key={ex.id} className="flex items-center gap-2">
                      <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300" value={ex.name} onChange={e => updateExercise(ex.id, 'name', e.target.value)} />
                      <input className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Reps" value={ex.reps} onChange={e => updateExercise(ex.id, 'reps', e.target.value)} />
                      <input className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300" placeholder="Weight" value={ex.weight} onChange={e => updateExercise(ex.id, 'weight', e.target.value)} />
                      <button onClick={() => removeExercise(ex.id)} className="text-zinc-600 hover:text-red-400 transition">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600" placeholder="Add exercise..." value={newExName} onChange={e => setNewExName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExercise()} />
                    <button onClick={addExercise} className="text-zinc-500 hover:text-zinc-300 text-xs">+ Add</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Checklist */}
          <div>
            <label className={labelCls}>Checklist</label>
            <div className="space-y-1.5 mt-1">
              {checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <span className="text-xs text-zinc-400 flex-1">{item.label}</span>
                  <button onClick={() => removeCheckItem(item.id)} className="text-zinc-700 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600"
                  placeholder="Add checklist item..."
                  value={newCheckItem}
                  onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                />
                <button onClick={addCheckItem} className="text-zinc-500 hover:text-zinc-300 text-xs">+ Add</button>
              </div>
            </div>
          </div>

          {/* Save as template */}
          {!isEditing && (
            <div className="border-t border-zinc-800 pt-3">
              {showSaveTemplate ? (
                <div className="flex items-center gap-2">
                  <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600" placeholder="Template name..." value={templateName} onChange={e => setTemplateName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()} />
                  <button onClick={handleSaveTemplate} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Save</button>
                  <button onClick={() => setShowSaveTemplate(false)} className="text-xs text-zinc-600 hover:text-zinc-400">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowSaveTemplate(true)} className="text-[11px] text-zinc-600 hover:text-zinc-400 transition">
                  Save as Template
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-300 transition">Cancel</button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg text-xs font-semibold transition"
          >
            {isEditing ? 'Update' : isProgram ? 'Create Program' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  )
}
