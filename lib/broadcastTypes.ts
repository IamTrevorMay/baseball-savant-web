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

export type BroadcastAssetType = 'scene' | 'image' | 'video' | 'slideshow' | 'advertisement'

export interface AdConfig {
  volume: number
}

export interface SlideshowSlide {
  id: string
  storage_path: string
  name: string
  type: 'image' | 'video'
}

export interface SlideshowConfig {
  slides: SlideshowSlide[]
  fit: 'cover' | 'contain'
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
  | 'slideshow:goto'
  | 'session:sync'

export interface BroadcastEvent {
  event: BroadcastEventType
  payload: {
    assetId?: string
    timestamp?: number
    elementUpdates?: Record<string, any>
    sceneConfig?: BroadcastAsset['scene_config']
    visibleAssets?: string[]
    videoPlaying?: string[]
  }
}
