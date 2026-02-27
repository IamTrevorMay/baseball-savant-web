export interface ChecklistItem {
  id: string
  label: string
  checked: boolean
}

export interface Exercise {
  id: string
  name: string
  reps: string
  weight: string
}

export interface ThrowingDetails {
  id: string
  event_id: string
  throws: number | null
  distance_ft: number | null
  effort_pct: number | null
  notes: string | null
  checklist: ChecklistItem[]
}

export interface WorkoutDetails {
  id: string
  event_id: string
  title: string | null
  description: string | null
  exercises: Exercise[]
  checklist: ChecklistItem[]
}

export interface ScheduleEvent {
  id: string
  athlete_id: string
  program_id: string | null
  event_type: 'throwing' | 'workout'
  event_date: string
  completed: boolean
  created_at: string
  updated_at: string
  throwing_details?: ThrowingDetails | null
  workout_details?: WorkoutDetails | null
}

export interface ScheduleProgram {
  id: string
  athlete_id: string
  name: string
  type: 'throwing' | 'workout'
  start_date: string
  weeks: number
  created_at: string
  updated_at: string
}

export interface ThrowingTemplate {
  id: string
  athlete_id: string
  name: string
  config: {
    throws?: number
    distance_ft?: number
    effort_pct?: number
    notes?: string
    checklist?: ChecklistItem[]
  }
}

export interface WorkoutTemplate {
  id: string
  athlete_id: string
  name: string
  config: {
    title?: string
    description?: string
    exercises?: Exercise[]
    checklist?: ChecklistItem[]
  }
}

export type ViewMode = 'month' | 'week'
