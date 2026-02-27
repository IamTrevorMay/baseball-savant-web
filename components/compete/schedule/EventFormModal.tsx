'use client'

import { useState } from 'react'
import { ScheduleEvent, ThrowingTemplate, WorkoutTemplate, Exercise, ProgramWeekConfig, ProgramDayConfig } from '@/lib/compete/schedule-types'

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
  throwing?: { throws?: number; distance_ft?: number; effort_pct?: number; notes?: string }
  workout?: { title?: string; description?: string; exercises: Exercise[] }
  program?: { name: string; start_date: string; weeks: ProgramWeekConfig[] }
  editId?: string
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function makeEmptyDayConfig(): ProgramDayConfig {
  return { event_type: 'rest' }
}

function makeDefaultWeekConfigs(count: number): ProgramWeekConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    week_number: i + 1,
    days: Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, makeEmptyDayConfig()])),
  }))
}

// Compact inline form for a single day's config
function DayConfigForm({
  dayConfig,
  onChange,
  throwingTemplates,
  workoutTemplates,
}: {
  dayConfig: ProgramDayConfig
  onChange: (config: ProgramDayConfig) => void
  throwingTemplates: ThrowingTemplate[]
  workoutTemplates: WorkoutTemplate[]
}) {
  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600'

  const setType = (event_type: ProgramDayConfig['event_type']) => {
    if (event_type === 'rest') {
      onChange({ event_type: 'rest' })
    } else if (event_type === 'throwing') {
      onChange({ event_type: 'throwing', throwing: dayConfig.throwing || {} })
    } else {
      onChange({ event_type: 'workout', workout: dayConfig.workout || {} })
    }
  }

  const applyTemplate = (templateId: string) => {
    if (dayConfig.event_type === 'throwing') {
      const t = throwingTemplates.find(t => t.id === templateId)
      if (t) onChange({ event_type: 'throwing', throwing: { throws: t.config.throws, distance_ft: t.config.distance_ft, effort_pct: t.config.effort_pct, notes: t.config.notes } })
    } else if (dayConfig.event_type === 'workout') {
      const t = workoutTemplates.find(t => t.id === templateId)
      if (t) onChange({ event_type: 'workout', workout: { title: t.config.title, description: t.config.description, exercises: t.config.exercises || [] } })
    }
  }

  const templates = dayConfig.event_type === 'throwing' ? throwingTemplates : dayConfig.event_type === 'workout' ? workoutTemplates : []

  return (
    <div className="space-y-2">
      <select
        className={inputCls}
        value={dayConfig.event_type}
        onChange={e => setType(e.target.value as ProgramDayConfig['event_type'])}
      >
        <option value="rest">Rest</option>
        <option value="throwing">Throwing</option>
        <option value="workout">Workout</option>
        {throwingTemplates.map(t => <option key={`tt-${t.id}`} value={`template-throwing-${t.id}`}>{t.name} (throwing)</option>)}
        {workoutTemplates.map(t => <option key={`wt-${t.id}`} value={`template-workout-${t.id}`}>{t.name} (workout)</option>)}
      </select>

      {templates.length > 0 && dayConfig.event_type !== 'rest' && (
        <select className={inputCls} defaultValue="" onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}>
          <option value="">Apply template...</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      {dayConfig.event_type === 'throwing' && (
        <div className="grid grid-cols-3 gap-1.5">
          <input type="number" className={inputCls} placeholder="Throws" value={dayConfig.throwing?.throws ?? ''} onChange={e => onChange({ ...dayConfig, throwing: { ...dayConfig.throwing, throws: e.target.value ? Number(e.target.value) : undefined } })} />
          <input type="number" className={inputCls} placeholder="Dist (ft)" value={dayConfig.throwing?.distance_ft ?? ''} onChange={e => onChange({ ...dayConfig, throwing: { ...dayConfig.throwing, distance_ft: e.target.value ? Number(e.target.value) : undefined } })} />
          <input type="number" className={inputCls} placeholder="Effort %" value={dayConfig.throwing?.effort_pct ?? ''} onChange={e => onChange({ ...dayConfig, throwing: { ...dayConfig.throwing, effort_pct: e.target.value ? Number(e.target.value) : undefined } })} />
        </div>
      )}

      {dayConfig.event_type === 'workout' && (
        <input className={inputCls} placeholder="Workout title" value={dayConfig.workout?.title ?? ''} onChange={e => onChange({ ...dayConfig, workout: { ...dayConfig.workout, title: e.target.value || undefined } })} />
      )}
    </div>
  )
}

function ProgramWeekSection({
  week,
  onChange,
  throwingTemplates,
  workoutTemplates,
}: {
  week: ProgramWeekConfig
  onChange: (week: ProgramWeekConfig) => void
  throwingTemplates: ThrowingTemplate[]
  workoutTemplates: WorkoutTemplate[]
}) {
  const [expanded, setExpanded] = useState(week.week_number === 1)

  const updateDay = (dow: number, config: ProgramDayConfig) => {
    onChange({ ...week, days: { ...week.days, [dow]: config } })
  }

  const nonRestCount = Object.values(week.days).filter(d => d.event_type !== 'rest').length

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 transition text-left"
      >
        <span className="text-xs font-semibold text-zinc-300">Week {week.week_number}</span>
        <span className="text-[10px] text-zinc-500">
          {nonRestCount} day{nonRestCount !== 1 ? 's' : ''} active
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`inline ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
      {expanded && (
        <div className="p-3 space-y-3">
          {DOW_LABELS.map((label, dow) => (
            <div key={dow}>
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
              <DayConfigForm
                dayConfig={week.days[dow] || makeEmptyDayConfig()}
                onChange={config => updateDay(dow, config)}
                throwingTemplates={throwingTemplates}
                workoutTemplates={workoutTemplates}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const [exercises, setExercises] = useState<Exercise[]>(
    (editingEvent?.workout_details?.exercises || []).map(ex => ({ ...ex, checked: ex.checked ?? false }))
  )

  // Program state
  const [programName, setProgramName] = useState('')
  const [programStart, setProgramStart] = useState(defaultDate || new Date().toISOString().split('T')[0])
  const [programWeeks, setProgramWeeks] = useState(4)
  const [weekConfigs, setWeekConfigs] = useState<ProgramWeekConfig[]>(makeDefaultWeekConfigs(4))

  // Update week configs when week count changes
  const handleWeeksChange = (count: number) => {
    const clamped = Math.max(1, Math.min(8, count))
    setProgramWeeks(clamped)
    setWeekConfigs(prev => {
      if (clamped > prev.length) {
        return [...prev, ...makeDefaultWeekConfigs(clamped - prev.length).map((w, i) => ({ ...w, week_number: prev.length + i + 1 }))]
      }
      return prev.slice(0, clamped)
    })
  }

  // Template state
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // Exercise management
  const [newExName, setNewExName] = useState('')
  const addExercise = () => {
    if (!newExName.trim()) return
    setExercises([...exercises, { id: crypto.randomUUID(), name: newExName.trim(), reps: '', weight: '', checked: false }])
    setNewExName('')
  }
  const updateExercise = (id: string, field: keyof Exercise, value: string | boolean) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex))
  }
  const removeExercise = (id: string) => setExercises(exercises.filter(e => e.id !== id))

  // Apply template (single event)
  const applyTemplate = (templateId: string) => {
    if (eventType === 'throwing') {
      const t = throwingTemplates.find(t => t.id === templateId)
      if (!t) return
      setThrows(t.config.throws ?? '')
      setDistanceFt(t.config.distance_ft ?? '')
      setEffortPct(t.config.effort_pct ?? '')
      setNotes(t.config.notes ?? '')
    } else {
      const t = workoutTemplates.find(t => t.id === templateId)
      if (!t) return
      setWorkoutTitle(t.config.title ?? '')
      setWorkoutDesc(t.config.description ?? '')
      setExercises((t.config.exercises || []).map(ex => ({ ...ex, checked: false })))
    }
  }

  const handleSubmit = () => {
    if (isProgram) {
      if (!programName.trim()) return
      onSave({
        mode: 'program',
        event_type: 'throwing', // not used for program
        program: { name: programName, start_date: programStart, weeks: weekConfigs },
      })
    } else {
      const data: EventFormData = {
        mode: 'single',
        event_type: eventType,
        event_date: date,
        editId: editingEvent?.id,
      }
      if (eventType === 'throwing') {
        data.throwing = { throws: throws ? Number(throws) : undefined, distance_ft: distanceFt ? Number(distanceFt) : undefined, effort_pct: effortPct ? Number(effortPct) : undefined, notes: notes || undefined }
      } else {
        data.workout = { title: workoutTitle || undefined, description: workoutDesc || undefined, exercises }
      }
      onSave(data)
    }
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return
    if (eventType === 'throwing') {
      onSaveTemplate('throwing', templateName, { throws: throws ? Number(throws) : undefined, distance_ft: distanceFt ? Number(distanceFt) : undefined, effort_pct: effortPct ? Number(effortPct) : undefined, notes: notes || undefined })
    } else {
      onSaveTemplate('workout', templateName, { title: workoutTitle || undefined, description: workoutDesc || undefined, exercises })
    }
    setTemplateName('')
    setShowSaveTemplate(false)
  }

  const templates = eventType === 'throwing' ? throwingTemplates : workoutTemplates

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
          {/* Program builder */}
          {isProgram && (
            <>
              <div>
                <label className={labelCls}>Program Name</label>
                <input className={inputCls} value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g. Spring Throwing Program" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input type="date" className={inputCls} value={programStart} onChange={e => setProgramStart(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Weeks (max 8)</label>
                  <input type="number" min={1} max={8} className={inputCls} value={programWeeks} onChange={e => handleWeeksChange(Number(e.target.value))} />
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <p className="text-[11px] text-zinc-500 mb-3">Configure each day per week. Set each day to Rest, Throwing, or Workout.</p>
                <div className="space-y-2">
                  {weekConfigs.map((week, i) => (
                    <ProgramWeekSection
                      key={i}
                      week={week}
                      onChange={updated => setWeekConfigs(prev => prev.map((w, j) => j === i ? updated : w))}
                      throwingTemplates={throwingTemplates}
                      workoutTemplates={workoutTemplates}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Single event form */}
          {!isProgram && (
            <>
              {/* Date */}
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
              </div>

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
              {eventType === 'throwing' && (
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
              {eventType === 'workout' && (
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
            </>
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
