import { SceneElement } from './sceneTypes'

// ── Broadcast Project ───────────────────────────────────────────────────────

export interface BroadcastProjectSettings {
  fps: number
  defaultTransitionDuration: number // frames
}

export interface BroadcastProject {
  id: string
  user_id: string
  name: string
  description: string
  settings: BroadcastProjectSettings
  created_at: string
  updated_at: string
}

// ── Broadcast Asset ─────────────────────────────────────────────────────────

export type BroadcastAssetType = 'scene' | 'image' | 'video'

export interface TransitionConfig {
  presetId: string
  durationFrames: number
}

export interface BroadcastAsset {
  id: string
  project_id: string
  name: string
  asset_type: BroadcastAssetType
  scene_config: {
    width: number
    height: number
    background: string
    elements: SceneElement[]
  } | null
  storage_path: string | null
  canvas_x: number
  canvas_y: number
  canvas_width: number
  canvas_height: number
  layer: number
  enter_transition: TransitionConfig | null
  exit_transition: TransitionConfig | null
  hotkey_label: string
  hotkey_color: string
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Broadcast Session ───────────────────────────────────────────────────────

export interface ActiveState {
  visibleAssets: string[] // asset IDs currently shown
}

export interface BroadcastSession {
  id: string
  project_id: string
  user_id: string
  channel_name: string
  is_live: boolean
  active_state: ActiveState
  started_at: string
  ended_at: string | null
}

// ── Realtime Events ─────────────────────────────────────────────────────────

export type BroadcastEventType =
  | 'asset:show'
  | 'asset:hide'
  | 'asset:update'
  | 'video:play'
  | 'video:stop'
  | 'session:sync'

export interface BroadcastEvent {
  event: BroadcastEventType
  payload: {
    assetId?: string
    timestamp?: number
    elementUpdates?: Record<string, any>
    visibleAssets?: string[]
    videoPlaying?: string[]
  }
}
