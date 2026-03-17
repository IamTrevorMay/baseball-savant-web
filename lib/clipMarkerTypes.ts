// ── Clip Marker Types ──────────────────────────────────────────────────────

export interface ClipMarker {
  id: string
  session_id: string
  project_id: string
  start_time: number | null
  end_time: number | null
  title: string
  clip_type: 'short' | 'long'
  assignee: string
  time_sensitive: boolean
  post_by_date: string | null
  notes: string
  status: 'open' | 'closed'
  sort_order: number
  created_at: string
  updated_at: string
}

export interface OBSRecordingState {
  isRecording: boolean
  isPaused: boolean
  recordingStartedAt: number | null   // Date.now() when recording started
  totalPausedMs: number
  lastPauseAt: number | null
  outputPath: string | null
}

export const DEFAULT_RECORDING_STATE: OBSRecordingState = {
  isRecording: false,
  isPaused: false,
  recordingStartedAt: null,
  totalPausedMs: 0,
  lastPauseAt: null,
  outputPath: null,
}

// ── Export Format ──────────────────────────────────────────────────────────

export interface ClipMarkerExportEntry {
  id: string
  title: string
  start_time: string  // HH:MM:SS
  end_time: string    // HH:MM:SS
  clip_type: 'short' | 'long'
  assignee: string
  time_sensitive: boolean
  post_by_date: string | null
  notes: string
}

export interface ClipMarkerExport {
  version: 1
  session_id: string
  project_id: string
  show_date: string
  recording_filename: string | null
  markers: ClipMarkerExportEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function formatMarkerTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function getRecordingElapsed(state: OBSRecordingState): number {
  if (!state.isRecording || !state.recordingStartedAt) return 0
  const now = Date.now()
  let paused = state.totalPausedMs
  if (state.isPaused && state.lastPauseAt) {
    paused += now - state.lastPauseAt
  }
  return Math.floor((now - state.recordingStartedAt - paused) / 1000)
}
