// ── Chat Types ─────────────────────────────────────────────────────────────

export interface ChatMessagePart {
  type: 'text' | 'emote'
  text?: string
  url?: string
}

export interface ChatMessage {
  id: string
  displayName: string
  content: ChatMessagePart[]
  provider: 'twitch' | 'youtube'
  type: 'message' | 'cheer' | 'sub' | 'resub' | 'giftsub' | 'superchat' | 'membership'
  color: string
  profileImageUrl?: string
  amount?: string
  months?: number
  plan?: string
  timestamp: number
}

// ── Topic Types ────────────────────────────────────────────────────────────

export interface Topic {
  id: string
  header: string
  body: string
  variant: 'default' | 'breakingNews'
}

// ── Countdown Types ────────────────────────────────────────────────────────

export interface CountdownState {
  running: boolean
  remaining: number // seconds
  total: number     // seconds
  startedAt?: string | null
}

// ── Lower Third Types ──────────────────────────────────────────────────────

export interface LowerThirdMessage {
  displayName: string
  content: ChatMessagePart[]
  provider: 'twitch' | 'youtube'
  color: string
  expiresAt: number // Date.now() + duration
}

// ── Notification Types ─────────────────────────────────────────────────────

export interface Notification {
  id: string
  type: 'sub' | 'resub' | 'giftsub' | 'cheer' | 'superchat' | 'membership'
  displayName: string
  amount?: string
  months?: number
  provider: 'twitch' | 'youtube'
  timestamp: number
}

// ── Widget Config (discriminated union by widget_type) ─────────────────────

export type WidgetType = 'chat' | 'lowerthird' | 'countdown' | 'topic' | 'notifications' | 'usernames'

export interface ChatWidgetConfig {
  widget_type: 'chat'
  maxVisibleMessages: number
  showTimestamps: boolean
  fontSize: number
  bgColor: string
  bgOpacity: number
}

export interface LowerThirdWidgetConfig {
  widget_type: 'lowerthird'
  autoClearSeconds: number
  logoUrl?: string
  bgColor: string
  accentColor: string
}

export interface CountdownWidgetConfig {
  widget_type: 'countdown'
  fontSize: number
  fontColor: string
  bgColor: string
  bgOpacity: number
  label?: string
  showLabel: boolean
}

export interface TopicWidgetConfig {
  widget_type: 'topic'
  fontSize: number
  bgColor: string
  bgOpacity: number
  accentColor: string
  breakingNewsColor: string
}

export interface NotificationsWidgetConfig {
  widget_type: 'notifications'
  maxVisible: number
  fontSize: number
  bgColor: string
  bgOpacity: number
}

export interface UsernameStackWidgetConfig {
  widget_type: 'usernames'
  maxVisible: number
  fontSize: number
  bgColor: string
  bgOpacity: number
  title: string
}

export type WidgetConfig =
  | ChatWidgetConfig
  | LowerThirdWidgetConfig
  | CountdownWidgetConfig
  | TopicWidgetConfig
  | NotificationsWidgetConfig
  | UsernameStackWidgetConfig

// ── Widget Runtime State ───────────────────────────────────────────────────

export interface WidgetState {
  chatMessages: ChatMessage[]
  topics: Topic[]
  activeTopicIndex: number
  countdown: CountdownState
  lowerThird: LowerThirdMessage | null
  lowerThirdVisible: boolean
  notifications: Notification[]
  usernameStack: string[]
  panelOrder: string[]
  twitchChannel: string
  youtubeVideoId: string
  chatConnected: boolean
}

export const DEFAULT_WIDGET_STATE: WidgetState = {
  chatMessages: [],
  topics: [],
  activeTopicIndex: -1,
  countdown: { running: false, remaining: 0, total: 0, startedAt: null },
  lowerThird: null,
  lowerThirdVisible: false,
  notifications: [],
  usernameStack: [],
  panelOrder: ['chat', 'topics', 'countdown', 'lowerthird', 'notifications', 'usernames'],
  twitchChannel: '',
  youtubeVideoId: '',
  chatConnected: false,
}

// ── Default widget configs ─────────────────────────────────────────────────

export const DEFAULT_WIDGET_CONFIGS: Record<WidgetType, WidgetConfig> = {
  chat: {
    widget_type: 'chat',
    maxVisibleMessages: 15,
    showTimestamps: false,
    fontSize: 14,
    bgColor: '#000000',
    bgOpacity: 0.6,
  },
  lowerthird: {
    widget_type: 'lowerthird',
    autoClearSeconds: 14,
    bgColor: '#18181b',
    accentColor: '#06b6d4',
  },
  countdown: {
    widget_type: 'countdown',
    fontSize: 64,
    fontColor: '#FFFFFF',
    bgColor: '#000000',
    bgOpacity: 0.7,
    showLabel: false,
  },
  topic: {
    widget_type: 'topic',
    fontSize: 32,
    bgColor: '#000000',
    bgOpacity: 0.8,
    accentColor: '#06b6d4',
    breakingNewsColor: '#f97316',
  },
  notifications: {
    widget_type: 'notifications',
    maxVisible: 10,
    fontSize: 13,
    bgColor: '#000000',
    bgOpacity: 0.6,
  },
  usernames: {
    widget_type: 'usernames',
    maxVisible: 20,
    fontSize: 13,
    bgColor: '#000000',
    bgOpacity: 0.6,
    title: 'Chat',
  },
}

// ── Default canvas dimensions per widget type ──────────────────────────────

export const WIDGET_DEFAULT_DIMENSIONS: Record<WidgetType, { w: number; h: number }> = {
  chat: { w: 500, h: 800 },
  lowerthird: { w: 1920, h: 200 },
  countdown: { w: 400, h: 150 },
  topic: { w: 1200, h: 200 },
  notifications: { w: 400, h: 600 },
  usernames: { w: 300, h: 500 },
}

export const WIDGET_LABELS: Record<WidgetType, string> = {
  chat: 'Chat',
  lowerthird: 'Lower Third',
  countdown: 'Countdown',
  topic: 'Topic',
  notifications: 'Notifications',
  usernames: 'Username Stack',
}
