/**
 * Email system type definitions.
 *
 * Covers products, templates, blocks, audiences, sends, events, and analytics.
 */

// ─── Block Types ──────────────────────────────────────────────────────

export type BlockType =
  // Data blocks
  | 'scores'
  | 'standouts'
  | 'trend-alerts'
  | 'starter-card'
  | 'stats-table'
  | 'player-card'
  | 'leaderboard'
  | 'rss-card'
  // Content blocks
  | 'rich-text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'social-links'
  | 'custom-html'
  | 'header'
  | 'footer'
  // Interactive blocks
  | 'poll'
  | 'countdown'
  | 'conditional'
  | 'personalization'
  // Layout blocks
  | 'columns'
  | 'section'

export type BlockCategory = 'data' | 'content' | 'interactive' | 'layout'

export interface DataBinding {
  source: 'briefs' | 'daily_cards' | 'stats_query' | 'rss' | 'static' | 'claude'
  path?: string       // JSON path, e.g. "metadata.scores"
  query?: string      // SQL for stats_query
  rssUrl?: string
  claudeField?: string // field name in brief AI sections
}

export interface EmailBlock {
  id: string
  type: BlockType
  config: Record<string, unknown>
  binding?: DataBinding
  padding?: { top: number; right: number; bottom: number; left: number }
  background?: string
  visible?: boolean
  // For layout blocks that contain children
  children?: EmailBlock[]
}

// ─── Branding ─────────────────────────────────────────────────────────

export interface ProductBranding {
  primaryColor: string
  logoUrl?: string
  headerStyle: 'banner' | 'logo' | 'text'
  fromName: string
  fromEmail: string
  replyTo?: string
}

// ─── Schedule ─────────────────────────────────────────────────────────

export interface ProductSchedule {
  cron: string        // e.g. "0 15 * * *"
  timezone: string    // e.g. "America/New_York"
  skipMonths?: number[] // 1-based months to skip (e.g. [12, 1] for offseason)
}

// ─── Landing Config ───────────────────────────────────────────────────

export interface LandingConfig {
  heroText?: string
  description?: string
  socialLinks?: { platform: string; url: string }[]
}

// ─── Template Settings ────────────────────────────────────────────────

export interface TemplateSettings {
  maxWidth: number       // default 640
  bodyBg: string         // default #09090b
  contentBg: string      // default #09090b
  fontFamily: string     // default sans-serif
}

// ─── Database Row Types ───────────────────────────────────────────────

export interface EmailProduct {
  id: string
  user_id: string | null
  name: string
  slug: string
  product_type: 'recurring' | 'campaign'
  branding: ProductBranding
  schedule: ProductSchedule | null
  landing_enabled: boolean
  landing_config: LandingConfig
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EmailTemplate {
  id: string
  product_id: string
  name: string
  version: number
  is_active: boolean
  blocks: EmailBlock[]
  settings: TemplateSettings
  subject_template: string
  preheader_template: string
  created_at: string
  updated_at: string
}

export interface EmailSend {
  id: string
  product_id: string
  template_id: string | null
  send_type: 'recurring' | 'campaign' | 'test'
  subject: string
  date: string | null
  rendered_html: string | null
  recipient_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  audience_ids: string[]
  status: 'draft' | 'sending' | 'sent' | 'failed'
  sent_at: string | null
  error: string | null
  created_at: string
}

export interface EmailAudience {
  id: string
  name: string
  product_id: string | null
  source: string
  subscriber_count: number
  created_at: string
  updated_at: string
}

export interface EmailSubscriber {
  id: string
  encrypted_email: string
  email_hash: string
  encrypted_name: string | null
  source: string
  metadata: Record<string, unknown>
  unsubscribe_token: string
  created_at: string
  updated_at: string
}

export interface EmailAudienceMember {
  audience_id: string
  subscriber_id: string
  is_active: boolean
  subscribed_at: string
  unsubscribed_at: string | null
}

export interface EmailEvent {
  id: string
  send_id: string
  subscriber_id: string | null
  event_type: 'open' | 'click' | 'bounce' | 'complaint' | 'delivered'
  link_url: string | null
  link_label: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface EmailBlockLibraryItem {
  id: string
  user_id: string | null
  name: string
  category: string
  block_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Block Registry Entry ─────────────────────────────────────────────

export interface BlockRegistryEntry {
  type: BlockType
  label: string
  category: BlockCategory
  icon: string          // Lucide icon name
  description: string
  defaultConfig: Record<string, unknown>
  defaultBinding?: DataBinding
  supportsBinding: boolean
  supportsChildren?: boolean
}

// ─── Editor State ─────────────────────────────────────────────────────

export interface EmailEditorState {
  product: EmailProduct | null
  template: EmailTemplate | null
  blocks: EmailBlock[]
  selectedBlockId: string | null
  isDirty: boolean
  previewMode: 'edit' | 'preview'
  deviceMode: 'desktop' | 'mobile'
  undoStack: EmailBlock[][]
  redoStack: EmailBlock[][]
}

// ─── Analytics ────────────────────────────────────────────────────────

export interface SendAnalytics {
  send_id: string
  subject: string
  sent_at: string
  recipient_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  open_rate: number
  click_rate: number
  bounce_rate: number
  top_links: { url: string; label: string | null; clicks: number }[]
}

export interface ProductAnalytics {
  product_id: string
  total_sends: number
  total_recipients: number
  avg_open_rate: number
  avg_click_rate: number
  avg_bounce_rate: number
  subscriber_count: number
  subscriber_growth: { date: string; count: number }[]
  send_history: { date: string; open_rate: number; click_rate: number }[]
}

// ─── API Payloads ─────────────────────────────────────────────────────

export interface CreateProductPayload {
  name: string
  slug: string
  product_type: 'recurring' | 'campaign'
  branding?: Partial<ProductBranding>
  schedule?: ProductSchedule
}

export interface UpdateProductPayload {
  name?: string
  slug?: string
  branding?: Partial<ProductBranding>
  schedule?: ProductSchedule | null
  landing_enabled?: boolean
  landing_config?: Partial<LandingConfig>
  is_active?: boolean
}

export interface CreateTemplatePayload {
  product_id: string
  name?: string
  blocks?: EmailBlock[]
  settings?: Partial<TemplateSettings>
  subject_template?: string
  preheader_template?: string
}

export interface UpdateTemplatePayload {
  name?: string
  blocks?: EmailBlock[]
  settings?: Partial<TemplateSettings>
  subject_template?: string
  preheader_template?: string
  is_active?: boolean
}

export interface SendEmailPayload {
  product_id: string
  template_id: string
  send_type: 'campaign' | 'test'
  audience_ids?: string[]
  test_emails?: string[]
  subject_override?: string
}
