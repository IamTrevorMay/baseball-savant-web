import type { BlockRegistryEntry, BlockType } from '@/lib/emailTypes'

/**
 * Block registry — defines every available block type with defaults,
 * metadata, and data-binding support.
 */

const registry: Record<BlockType, BlockRegistryEntry> = {
  // ─── Data blocks ────────────────────────────────────────────────────

  scores: {
    type: 'scores',
    label: 'Scores Grid',
    category: 'data',
    icon: 'LayoutGrid',
    description: 'Game scores in a 2/3/4-column grid',
    defaultConfig: { columns: 4, showRHE: true, showDecisions: true },
    defaultBinding: { source: 'briefs', path: 'metadata.scores' },
    supportsBinding: true,
  },

  standouts: {
    type: 'standouts',
    label: 'Standouts',
    category: 'data',
    icon: 'Star',
    description: 'Player cards with plus stats and headshots',
    defaultConfig: { columns: 2, maxCards: 4 },
    defaultBinding: { source: 'briefs', path: 'metadata.daily_highlights' },
    supportsBinding: true,
  },

  'trend-alerts': {
    type: 'trend-alerts',
    label: 'Trend Alerts',
    category: 'data',
    icon: 'TrendingUp',
    description: 'Surges and concerns side-by-side',
    defaultConfig: { maxItems: 5, showSigma: true },
    defaultBinding: { source: 'briefs', path: 'metadata.trend_alerts' },
    supportsBinding: true,
  },

  'starter-card': {
    type: 'starter-card',
    label: 'Starter Card',
    category: 'data',
    icon: 'Image',
    description: 'Start of the day image from daily_cards',
    defaultConfig: { cardType: 'ig-starter-card' },
    defaultBinding: { source: 'daily_cards' },
    supportsBinding: true,
  },

  'stats-table': {
    type: 'stats-table',
    label: 'Stats Table',
    category: 'data',
    icon: 'Table',
    description: 'Arbitrary stats table from SQL query',
    defaultConfig: { columns: [], maxRows: 10, showHeaders: true, striped: true },
    defaultBinding: { source: 'stats_query', query: '' },
    supportsBinding: true,
  },

  'player-card': {
    type: 'player-card',
    label: 'Player Card',
    category: 'data',
    icon: 'User',
    description: 'Single player card with configurable stats',
    defaultConfig: { playerId: null, stats: ['stuff_plus', 'cmd_plus', 'brink_plus'], showHeadshot: true },
    supportsBinding: true,
  },

  leaderboard: {
    type: 'leaderboard',
    label: 'Leaderboard',
    category: 'data',
    icon: 'Trophy',
    description: 'Top N players by metric',
    defaultConfig: { metric: 'stuff_plus', limit: 5, role: 'SP', showRank: true },
    defaultBinding: { source: 'stats_query' },
    supportsBinding: true,
  },

  'rss-card': {
    type: 'rss-card',
    label: 'RSS Card',
    category: 'data',
    icon: 'Rss',
    description: 'Latest post from any RSS feed',
    defaultConfig: { showImage: true, showAuthor: true, showDescription: true, ctaText: 'Read more →' },
    defaultBinding: { source: 'rss', rssUrl: '' },
    supportsBinding: true,
  },

  // ─── Content blocks ─────────────────────────────────────────────────

  'rich-text': {
    type: 'rich-text',
    label: 'Rich Text',
    category: 'content',
    icon: 'Type',
    description: 'WYSIWYG HTML content',
    defaultConfig: { html: '<p style="color:#d4d4d8;font-size:14px;margin:0;">Enter text here...</p>' },
    supportsBinding: true,
  },

  image: {
    type: 'image',
    label: 'Image',
    category: 'content',
    icon: 'ImageIcon',
    description: 'Full-width or constrained image',
    defaultConfig: { src: '', alt: '', width: '100%', linkUrl: '', borderRadius: 8 },
    supportsBinding: false,
  },

  button: {
    type: 'button',
    label: 'Button',
    category: 'content',
    icon: 'MousePointerClick',
    description: 'Call-to-action button',
    defaultConfig: {
      text: 'Click here',
      url: '',
      bgColor: '#34d399',
      textColor: '#09090b',
      align: 'center',
      borderRadius: 6,
      fullWidth: false,
    },
    supportsBinding: false,
  },

  divider: {
    type: 'divider',
    label: 'Divider',
    category: 'content',
    icon: 'Minus',
    description: 'Horizontal line separator',
    defaultConfig: { color: '#27272a', thickness: 1, style: 'solid' },
    supportsBinding: false,
  },

  spacer: {
    type: 'spacer',
    label: 'Spacer',
    category: 'content',
    icon: 'Space',
    description: 'Vertical spacing',
    defaultConfig: { height: 24 },
    supportsBinding: false,
  },

  'social-links': {
    type: 'social-links',
    label: 'Social Links',
    category: 'content',
    icon: 'Share2',
    description: 'Social media icon links',
    defaultConfig: {
      align: 'center',
      iconSize: 24,
      links: [
        { platform: 'twitter', url: '' },
        { platform: 'instagram', url: '' },
      ],
    },
    supportsBinding: false,
  },

  'custom-html': {
    type: 'custom-html',
    label: 'Custom HTML',
    category: 'content',
    icon: 'Code',
    description: 'Raw HTML for advanced customization',
    defaultConfig: { html: '' },
    supportsBinding: false,
  },

  header: {
    type: 'header',
    label: 'Header',
    category: 'content',
    icon: 'PanelTop',
    description: 'Email header with banner/logo/text',
    defaultConfig: {
      style: 'banner',
      bannerUrl: '',
      logoUrl: '',
      title: '',
      subtitle: '',
      showDate: true,
    },
    supportsBinding: false,
  },

  footer: {
    type: 'footer',
    label: 'Footer',
    category: 'content',
    icon: 'PanelBottom',
    description: 'Unsubscribe link + branding footer',
    defaultConfig: {
      text: '',
      showUnsubscribe: true,
      showBranding: true,
    },
    supportsBinding: false,
  },

  // ─── Interactive blocks ─────────────────────────────────────────────

  poll: {
    type: 'poll',
    label: 'Poll',
    category: 'interactive',
    icon: 'BarChart3',
    description: 'Link-based poll options',
    defaultConfig: {
      question: 'What do you think?',
      options: [
        { label: 'Option A', url: '' },
        { label: 'Option B', url: '' },
      ],
    },
    supportsBinding: false,
  },

  countdown: {
    type: 'countdown',
    label: 'Countdown',
    category: 'interactive',
    icon: 'Clock',
    description: 'Image-based countdown timer',
    defaultConfig: { targetDate: '', label: 'Time remaining', style: 'dark' },
    supportsBinding: false,
  },

  conditional: {
    type: 'conditional',
    label: 'Conditional',
    category: 'interactive',
    icon: 'GitBranch',
    description: 'Show/hide based on subscriber metadata',
    defaultConfig: { field: '', operator: 'equals', value: '' },
    supportsBinding: false,
    supportsChildren: true,
  },

  personalization: {
    type: 'personalization',
    label: 'Personalization',
    category: 'interactive',
    icon: 'UserCheck',
    description: 'Dynamic text from subscriber fields',
    defaultConfig: { field: 'name', fallback: 'there', template: 'Hey {{name}},' },
    supportsBinding: false,
  },

  // ─── Layout blocks ─────────────────────────────────────────────────

  columns: {
    type: 'columns',
    label: 'Columns',
    category: 'layout',
    icon: 'Columns',
    description: '2 or 3 column layout with nested blocks',
    defaultConfig: { columnCount: 2, gap: 16 },
    supportsBinding: false,
    supportsChildren: true,
  },

  section: {
    type: 'section',
    label: 'Section',
    category: 'layout',
    icon: 'SquareDashedBottom',
    description: 'Grouped section with optional title',
    defaultConfig: { title: '', showTitle: true, background: '' },
    supportsBinding: false,
    supportsChildren: true,
  },
}

export function getBlockDef(type: BlockType): BlockRegistryEntry {
  return registry[type]
}

export function getBlocksByCategory(category: BlockRegistryEntry['category']): BlockRegistryEntry[] {
  return Object.values(registry).filter(b => b.category === category)
}

export function getAllBlocks(): BlockRegistryEntry[] {
  return Object.values(registry)
}

export default registry
