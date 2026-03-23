import type { GlobalFilterType, GlobalFilter, ElementType } from './sceneTypes'

/* ── Starter element definition ─────────────────────────────────────────────
   These are *blueprints*, not SceneElements. The template builder creates
   real SceneElements from these defs at instantiation time.               */

export interface StarterElementDef {
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  bindingField?: string
  props?: Record<string, any>
}

export interface StarterTemplate {
  id: string
  name: string
  description: string
  filterType: GlobalFilterType
  defaultFilter: GlobalFilter
  canvasWidth: number
  canvasHeight: number
  background: string
  elements: StarterElementDef[]
}

/* ── Shared prop snippets ───────────────────────────────────────────────── */

const WHITE = '#ffffff'
const DIM = '#a1a1aa'   // zinc-400
const CARD_BG = 'rgba(255,255,255,0.04)'
const TRANSPARENT = 'transparent'
const EMERALD = '#10b981'

/* ── 1  Top-5 Leaderboard ──────────────────────────────────────────────── */

const top5Leaderboard: StarterTemplate = {
  id: 'top-5-leaderboard',
  name: 'Top-5 Leaderboard',
  description: 'Ranked list with player images, names, and two key stats per row.',
  filterType: 'leaderboard',
  defaultFilter: {
    type: 'leaderboard',
    playerType: 'pitcher',
    count: 5,
    repeaterDirection: 'vertical',
    repeaterOffset: 160,
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#18181b',
  elements: [
    // Title
    { type: 'text', x: 60, y: 40, width: 600, height: 60, props: { text: 'Leaderboard', fontSize: 48, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT } },
    // Subtitle
    { type: 'text', x: 60, y: 110, width: 400, height: 36, props: { text: 'Top 5 Pitchers', fontSize: 24, fontWeight: 400, color: DIM, bgColor: TRANSPARENT } },
    // Row template (y=200 is first row; repeater clones downward)
    { type: 'text', x: 60, y: 200, width: 40, height: 40, bindingField: 'rank', props: { text: '#1', fontSize: 28, fontWeight: 700, color: EMERALD, bgColor: TRANSPARENT, textAlign: 'center' } },
    { type: 'player-image', x: 110, y: 200, width: 120, height: 150, bindingField: 'playerImage', props: { bgColor: TRANSPARENT } },
    { type: 'text', x: 250, y: 220, width: 300, height: 40, bindingField: 'playerName', props: { text: 'Player Name', fontSize: 28, fontWeight: 600, color: WHITE, bgColor: TRANSPARENT } },
    { type: 'stat-card', x: 580, y: 210, width: 180, height: 100, bindingField: 'stat1', props: { label: 'Stat 1', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 780, y: 210, width: 180, height: 100, bindingField: 'stat2', props: { label: 'Stat 2', value: '—', bgColor: CARD_BG, color: WHITE } },
  ],
}

/* ── 2  Player Spotlight ───────────────────────────────────────────────── */

const playerSpotlight: StarterTemplate = {
  id: 'player-spotlight',
  name: 'Player Spotlight',
  description: 'Large player image with name and a 2x3 stat grid.',
  filterType: 'single-player',
  defaultFilter: { type: 'single-player', playerType: 'pitcher' },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#18181b',
  elements: [
    // Player image (left)
    { type: 'player-image', x: 80, y: 200, width: 300, height: 370, bindingField: 'playerImage', props: { bgColor: TRANSPARENT } },
    // Name (upper right)
    { type: 'text', x: 480, y: 200, width: 500, height: 60, bindingField: 'playerName', props: { text: 'Player Name', fontSize: 44, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT } },
    // Bg shape behind stats
    { type: 'shape', x: 460, y: 280, width: 680, height: 400, props: { bgColor: 'rgba(255,255,255,0.03)', borderRadius: 16 } },
    // 2x3 stat grid
    { type: 'stat-card', x: 480, y: 300, width: 200, height: 120, bindingField: 'stat1', props: { label: 'Stat 1', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 700, y: 300, width: 200, height: 120, bindingField: 'stat2', props: { label: 'Stat 2', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 920, y: 300, width: 200, height: 120, bindingField: 'stat3', props: { label: 'Stat 3', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 480, y: 440, width: 200, height: 120, bindingField: 'stat4', props: { label: 'Stat 4', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 700, y: 440, width: 200, height: 120, bindingField: 'stat5', props: { label: 'Stat 5', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 920, y: 440, width: 200, height: 120, bindingField: 'stat6', props: { label: 'Stat 6', value: '—', bgColor: CARD_BG, color: WHITE } },
  ],
}

/* ── 3  Pitcher Outing ─────────────────────────────────────────────────── */

const pitcherOuting: StarterTemplate = {
  id: 'pitcher-outing',
  name: 'Pitcher Outing',
  description: 'Game-line stat boxes for a single start: IP, K, BB, H, ER, Pitches, ERA.',
  filterType: 'single-player',
  defaultFilter: { type: 'single-player', playerType: 'pitcher' },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#18181b',
  elements: [
    // Name (top-left)
    { type: 'text', x: 60, y: 50, width: 500, height: 50, bindingField: 'playerName', props: { text: 'Player Name', fontSize: 40, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT } },
    // Date (top-right)
    { type: 'text', x: 1400, y: 50, width: 300, height: 40, bindingField: 'gameDate', props: { text: 'Date', fontSize: 24, fontWeight: 400, color: DIM, bgColor: TRANSPARENT, textAlign: 'right' } },
    // Opponent
    { type: 'text', x: 60, y: 110, width: 300, height: 36, bindingField: 'opponent', props: { text: 'vs OPP', fontSize: 22, fontWeight: 400, color: DIM, bgColor: TRANSPARENT } },
    // Player image (small)
    { type: 'player-image', x: 60, y: 200, width: 150, height: 180, bindingField: 'playerImage', props: { bgColor: TRANSPARENT } },
    // Game-line stat boxes (7 across)
    { type: 'stat-card', x: 260, y: 220, width: 140, height: 90, bindingField: 'ip', props: { label: 'IP', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 420, y: 220, width: 140, height: 90, bindingField: 'k', props: { label: 'K', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 580, y: 220, width: 140, height: 90, bindingField: 'bb', props: { label: 'BB', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 740, y: 220, width: 140, height: 90, bindingField: 'h', props: { label: 'H', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 900, y: 220, width: 140, height: 90, bindingField: 'er', props: { label: 'ER', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 1060, y: 220, width: 140, height: 90, bindingField: 'pitches', props: { label: 'Pitches', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 1220, y: 220, width: 140, height: 90, bindingField: 'era', props: { label: 'ERA', value: '—', bgColor: CARD_BG, color: WHITE } },
  ],
}

/* ── 4  Starter Card ───────────────────────────────────────────────────── */

const starterCard: StarterTemplate = {
  id: 'starter-card',
  name: 'Starter Card',
  description: 'Pitcher info with stuff, command, and overall grades.',
  filterType: 'single-player',
  defaultFilter: { type: 'single-player', playerType: 'pitcher' },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#18181b',
  elements: [
    // Pitcher info block
    { type: 'text', x: 80, y: 100, width: 500, height: 56, bindingField: 'playerName', props: { text: 'Player Name', fontSize: 44, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT } },
    { type: 'text', x: 80, y: 170, width: 200, height: 32, bindingField: 'throws', props: { text: 'RHP', fontSize: 22, fontWeight: 400, color: DIM, bgColor: TRANSPARENT } },
    { type: 'text', x: 280, y: 170, width: 200, height: 32, bindingField: 'team', props: { text: 'Team', fontSize: 22, fontWeight: 400, color: DIM, bgColor: TRANSPARENT } },
    // Grade cards (2x2)
    { type: 'stat-card', x: 80, y: 260, width: 220, height: 130, bindingField: 'startGrade', props: { label: 'Start', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 320, y: 260, width: 220, height: 130, bindingField: 'stuffGrade', props: { label: 'Stuff', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 80, y: 410, width: 220, height: 130, bindingField: 'commandGrade', props: { label: 'Command', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 320, y: 410, width: 220, height: 130, bindingField: 'tritonGrade', props: { label: 'Triton', value: '—', bgColor: CARD_BG, color: WHITE } },
    // Player image (right side)
    { type: 'player-image', x: 700, y: 100, width: 350, height: 440, bindingField: 'playerImage', props: { bgColor: TRANSPARENT } },
  ],
}

/* ── 5  Live Scorebug ──────────────────────────────────────────────────── */

const liveScorebug: StarterTemplate = {
  id: 'live-scorebug',
  name: 'Live Scorebug',
  description: 'Compact in-game scorebug with scores, inning, bases, and outs.',
  filterType: 'live-game',
  defaultFilter: { type: 'live-game' },
  canvasWidth: 1920,
  canvasHeight: 200,
  background: '#09090b',
  elements: [
    // Away abbrev
    { type: 'text', x: 40, y: 40, width: 100, height: 44, bindingField: 'awayAbbrev', props: { text: 'AWY', fontSize: 32, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Away score
    { type: 'text', x: 150, y: 40, width: 80, height: 44, bindingField: 'awayScore', props: { text: '0', fontSize: 36, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Home abbrev
    { type: 'text', x: 40, y: 100, width: 100, height: 44, bindingField: 'homeAbbrev', props: { text: 'HME', fontSize: 32, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Home score
    { type: 'text', x: 150, y: 100, width: 80, height: 44, bindingField: 'homeScore', props: { text: '0', fontSize: 36, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Inning
    { type: 'text', x: 280, y: 60, width: 120, height: 40, bindingField: 'inning', props: { text: 'Top 1', fontSize: 22, fontWeight: 600, color: EMERALD, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Bases (diamond arrangement: 2B top-center, 3B left, 1B right)
    { type: 'text', x: 450, y: 30, width: 32, height: 32, bindingField: 'base2', props: { text: '\u25C7', fontSize: 26, color: DIM, bgColor: TRANSPARENT, textAlign: 'center' } },
    { type: 'text', x: 420, y: 70, width: 32, height: 32, bindingField: 'base3', props: { text: '\u25C7', fontSize: 26, color: DIM, bgColor: TRANSPARENT, textAlign: 'center' } },
    { type: 'text', x: 480, y: 70, width: 32, height: 32, bindingField: 'base1', props: { text: '\u25C7', fontSize: 26, color: DIM, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Outs
    { type: 'text', x: 430, y: 120, width: 80, height: 30, bindingField: 'outs', props: { text: '0 Out', fontSize: 18, fontWeight: 400, color: DIM, bgColor: TRANSPARENT, textAlign: 'center' } },
  ],
}

/* ── 6  Team Overview ──────────────────────────────────────────────────── */

const teamOverview: StarterTemplate = {
  id: 'team-overview',
  name: 'Team Overview',
  description: 'Team name header with an 2x4 grid of key stats.',
  filterType: 'team',
  defaultFilter: { type: 'team', playerType: 'pitcher' },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#18181b',
  elements: [
    // Team name
    { type: 'text', x: 60, y: 60, width: 700, height: 60, bindingField: 'teamName', props: { text: 'Team Name', fontSize: 48, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT } },
    // 2x4 stat grid
    { type: 'stat-card', x: 60,  y: 180, width: 200, height: 120, bindingField: 'stat1', props: { label: 'Stat 1', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 280, y: 180, width: 200, height: 120, bindingField: 'stat2', props: { label: 'Stat 2', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 500, y: 180, width: 200, height: 120, bindingField: 'stat3', props: { label: 'Stat 3', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 720, y: 180, width: 200, height: 120, bindingField: 'stat4', props: { label: 'Stat 4', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 60,  y: 320, width: 200, height: 120, bindingField: 'stat5', props: { label: 'Stat 5', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 280, y: 320, width: 200, height: 120, bindingField: 'stat6', props: { label: 'Stat 6', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 500, y: 320, width: 200, height: 120, bindingField: 'stat7', props: { label: 'Stat 7', value: '—', bgColor: CARD_BG, color: WHITE } },
    { type: 'stat-card', x: 720, y: 320, width: 200, height: 120, bindingField: 'stat8', props: { label: 'Stat 8', value: '—', bgColor: CARD_BG, color: WHITE } },
  ],
}

/* ── 7  Head to Head ───────────────────────────────────────────────────── */

const headToHead: StarterTemplate = {
  id: 'head-to-head',
  name: 'Head to Head',
  description: 'Side-by-side player comparison with stat bars in the middle.',
  filterType: 'matchup',
  defaultFilter: { type: 'matchup' },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#18181b',
  elements: [
    // Player A image (left)
    { type: 'player-image', x: 100, y: 200, width: 280, height: 340, bindingField: 'playerAImage', props: { bgColor: TRANSPARENT } },
    // Player A name
    { type: 'text', x: 100, y: 560, width: 280, height: 44, bindingField: 'playerAName', props: { text: 'Player A', fontSize: 28, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT, textAlign: 'center' } },
    // Comparison bars (center)
    { type: 'comparison-bar', x: 500, y: 240, width: 500, height: 80, bindingField: 'compare1', props: { label: 'Stat 1', bgColor: CARD_BG, color: WHITE } },
    { type: 'comparison-bar', x: 500, y: 340, width: 500, height: 80, bindingField: 'compare2', props: { label: 'Stat 2', bgColor: CARD_BG, color: WHITE } },
    { type: 'comparison-bar', x: 500, y: 440, width: 500, height: 80, bindingField: 'compare3', props: { label: 'Stat 3', bgColor: CARD_BG, color: WHITE } },
    { type: 'comparison-bar', x: 500, y: 540, width: 500, height: 80, bindingField: 'compare4', props: { label: 'Stat 4', bgColor: CARD_BG, color: WHITE } },
    // Player B image (right)
    { type: 'player-image', x: 1120, y: 200, width: 280, height: 340, bindingField: 'playerBImage', props: { bgColor: TRANSPARENT } },
    // Player B name
    { type: 'text', x: 1120, y: 560, width: 280, height: 44, bindingField: 'playerBName', props: { text: 'Player B', fontSize: 28, fontWeight: 700, color: WHITE, bgColor: TRANSPARENT, textAlign: 'center' } },
  ],
}

/* ── Export ──────────────────────────────────────────────────────────────── */

/* ── 8  Rotation Depth Chart ──────────────────────────────────────────── */

const rotationDepthChart: StarterTemplate = {
  id: 'rotation-depth-chart',
  name: 'Rotation Depth Chart',
  description: 'Team starting rotation with player headshots, plus depth arms below.',
  filterType: 'depth-chart',
  defaultFilter: {
    type: 'depth-chart',
    teamAbbrev: 'NYY',
    dateRange: { type: 'season', year: new Date().getFullYear() },
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: '#09090b',
  elements: [
    // Header
    { type: 'text', x: 60, y: 28, width: 1200, height: 60, bindingField: 'teamName', props: { text: 'Team Name', fontSize: 48, fontWeight: 800, color: WHITE, bgColor: TRANSPARENT } },
    { type: 'text', x: 60, y: 85, width: 400, height: 28, props: { text: 'STARTING ROTATION', fontSize: 18, fontWeight: 600, color: EMERALD, bgColor: TRANSPARENT, letterSpacing: 3 } },
    // Rotation placeholders (5)
    ...Array.from({ length: 5 }, (_, i) => {
      const cx = 160 + i * 320 + 160
      return [
        { type: 'text' as ElementType, x: cx - 25, y: 150, width: 50, height: 30, props: { text: `SP${i + 1}`, fontSize: 14, fontWeight: 700, color: EMERALD, textAlign: 'center', bgColor: 'rgba(16,185,129,0.12)' } },
        { type: 'player-image' as ElementType, x: cx - 90, y: 190, width: 180, height: 225, bindingField: `rotation[${i}].playerImage`, props: { playerId: null, playerName: '', borderColor: '#27272a', showLabel: false, bgColor: TRANSPARENT } },
        { type: 'text' as ElementType, x: cx - 140, y: 425, width: 280, height: 32, bindingField: `rotation[${i}].playerName`, props: { text: '—', fontSize: 22, fontWeight: 700, color: WHITE, textAlign: 'center', bgColor: TRANSPARENT } },
      ]
    }).flat(),
    // Depth placeholders (3)
    ...Array.from({ length: 3 }, (_, j) => {
      const cx = 460 + j * 300 + 150
      return [
        { type: 'player-image' as ElementType, x: cx - 65, y: 590, width: 130, height: 162, bindingField: `depth[${j}].playerImage`, props: { playerId: null, playerName: '', borderColor: '#27272a', showLabel: false, bgColor: TRANSPARENT } },
        { type: 'text' as ElementType, x: cx - 120, y: 760, width: 240, height: 28, bindingField: `depth[${j}].playerName`, props: { text: '—', fontSize: 18, fontWeight: 600, color: DIM, textAlign: 'center', bgColor: TRANSPARENT } },
      ]
    }).flat(),
  ],
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  top5Leaderboard,
  playerSpotlight,
  pitcherOuting,
  starterCard,
  liveScorebug,
  teamOverview,
  headToHead,
  rotationDepthChart,
]
