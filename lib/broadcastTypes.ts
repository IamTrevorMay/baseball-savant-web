import { SceneElement } from './sceneTypes'

// ── OBS WebSocket ──────────────────────────────────────────────────────────

export interface OBSConnectionConfig {
  host: string    // default '127.0.0.1'
  port: number    // default 4455
  password: string
}

// ── Broadcast Project ───────────────────────────────────────────────────────

export interface BroadcastProjectSettings {
  fps: number
  defaultTransitionDuration: number // frames
  referenceImage?: string
  obsConfig?: OBSConnectionConfig
  obsMediaDir?: string        // local folder where video/ad files live
  obsSceneName?: string       // OBS scene to use (default: current)
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

export type BroadcastAssetType = 'scene' | 'image' | 'video' | 'slideshow' | 'advertisement'

export interface AdConfig {
  volume: number
  source_filename?: string  // original filename for OBS native playback
}

export const SLIDESHOW_TRANSITIONS = [
  { id: 'none', name: 'None (Cut)' },
  { id: 'crossfade', name: 'Crossfade' },
  { id: 'slide-left', name: 'Slide Left' },
  { id: 'slide-right', name: 'Slide Right' },
  { id: 'slide-up', name: 'Slide Up' },
  { id: 'slide-down', name: 'Slide Down' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'flip', name: 'Flip' },
  { id: 'wipe', name: 'Wipe' },
] as const

export type SlideshowTransitionType = typeof SLIDESHOW_TRANSITIONS[number]['id']

export interface SlideshowSlide {
  id: string
  storage_path: string
  name: string
  type: 'image' | 'video'
  transition?: SlideshowTransitionType
}

export interface SlideshowConfig {
  slides: SlideshowSlide[]
  fit: 'cover' | 'contain'
  transition?: SlideshowTransitionType
  transitionDuration?: number
}

export interface TransitionConfig {
  presetId: string
  durationFrames: number
}

export interface TemplateDataValues {
  sections: Record<string, {
    playerId?: number
    playerName?: string
    playerType?: 'pitcher' | 'batter'
    gameYear?: number
    pitchType?: string
    primaryStat?: string
    secondaryStat?: string
    tertiaryStat?: string
    dateRange?: { type: 'season'; year: number } | { type: 'custom'; from: string; to: string }
    sortDir?: 'asc' | 'desc'
    count?: number
    minSample?: number
    title?: string
    globalInputType?: 'player' | 'live-game' | 'leaderboard' | 'team'
    leaderboardType?: 'players' | 'team'
    gameDate?: string
    gamePk?: number
  }>
  themeTeam?: string
  themePresetId?: string
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
  template_id?: string
  template_data?: TemplateDataValues
  slideshow_config?: SlideshowConfig
  ad_config?: AdConfig
  canvas_x: number
  canvas_y: number
  canvas_width: number
  canvas_height: number
  layer: number
  enter_transition: TransitionConfig | null
  exit_transition: TransitionConfig | null
  opacity: number
  trigger_mode: 'toggle' | 'flash' | 'show' | 'hide'
  trigger_duration: number
  hotkey_key: string | null
  hotkey_label: string
  hotkey_color: string
  stinger_enabled?: boolean
  stinger_video_url?: string | null
  stinger_cut_point?: number
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Broadcast Segment (DB: broadcast_scenes) ────────────────────────────────

export interface BroadcastSegment {
  id: string
  project_id: string
  name: string
  sort_order: number
  stinger_video_url: string | null
  stinger_storage_path: string | null
  stinger_enabled: boolean
  stinger_cut_point: number
  transition_override: TransitionConfig | null
  enter_transition: TransitionConfig | null
  exit_transition: TransitionConfig | null
  hotkey_key: string | null
  hotkey_color: string
  created_at: string
  updated_at: string
}

export interface BroadcastSegmentAsset {
  id: string
  scene_id: string
  asset_id: string
  override_x: number | null
  override_y: number | null
  override_width: number | null
  override_height: number | null
  override_layer: number | null
  override_opacity: number | null
  is_visible: boolean
}

// ── Broadcast Session ───────────────────────────────────────────────────────

export interface ActiveState {
  visibleAssets: string[] // asset IDs currently shown
  slideshowIndexes?: Record<string, number> // assetId → current slide index
  activeSegmentId?: string | null
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
  | 'slideshow:goto'
  | 'session:sync'
  | 'segment:switch'
  | 'obs:status'

export interface BroadcastEvent {
  event: BroadcastEventType
  payload: {
    assetId?: string
    timestamp?: number
    elementUpdates?: Record<string, any>
    sceneConfig?: BroadcastAsset['scene_config']
    visibleAssets?: string[]
    videoPlaying?: string[]
    segmentId?: string
    stingerUrl?: string
    stingerCutPoint?: number
    stingerEnterTransition?: TransitionConfig | null
    stingerExitTransition?: TransitionConfig | null
    // Per-asset stinger (for scenes/ads)
    assetStingerUrl?: string
    assetStingerCutPoint?: number
    assetsToHide?: string[]
    assetsToShow?: string[]
    overrides?: Record<string, Partial<{ x: number; y: number; width: number; height: number; layer: number; opacity: number }>>
  }
}
