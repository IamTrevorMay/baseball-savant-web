/**
 * render-top-pitchers.ts — Render "Top Pitchers" template to PNG on Desktop.
 * Usage: npx tsx scripts/render-top-pitchers.ts
 */
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'fs'
import { join } from 'path'

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

const sampleData = {
  date: '2026-04-05',
  stuff_starter: {
    player_id: 694973, player_name: 'Skenes, Paul', team: 'PIT',
    pitch_name: 'Splinker', stuff_plus: 155, velo: 97.4,
    game_line: { ip: '6.0', h: 3, r: 1, er: 1, bb: 1, k: 8, pitches: 94, decision: 'W' },
  },
  stuff_reliever: {
    player_id: 677951, player_name: 'Bednar, David', team: 'PIT',
    pitch_name: 'Curveball', stuff_plus: 142, velo: 82.1,
    game_line: { ip: '1.0', h: 0, r: 0, er: 0, bb: 0, k: 2, pitches: 14, decision: 'SV' },
  },
  cmd_starter: {
    player_id: 543037, player_name: 'Cole, Gerrit', team: 'NYY',
    cmd_plus: 128, pitches: 97,
    game_line: { ip: '7.0', h: 4, r: 2, er: 2, bb: 1, k: 9, pitches: 97, decision: 'W' },
  },
  cmd_reliever: {
    player_id: 642585, player_name: 'Doval, Camilo', team: 'SF',
    cmd_plus: 118, pitches: 16,
    game_line: { ip: '1.0', h: 1, r: 0, er: 0, bb: 0, k: 1, pitches: 16, decision: 'HLD' },
  },
}

// ── Color helpers ──────────────────────────────────────────────────────
function plusColor(v: number | null | undefined): string {
  if (v == null) return '#ffffff'
  if (v >= 130) return '#10b981'
  if (v >= 115) return '#22c55e'
  if (v >= 100) return '#ffffff'
  if (v >= 85) return '#f97316'
  return '#ef4444'
}

function decisionColor(d: string): string {
  if (d === 'W') return '#22c55e'
  if (d === 'L') return '#ef4444'
  if (d === 'SV') return '#38bdf8'
  if (d === 'HLD') return '#f59e0b'
  return '#71717a'
}

// ── Canvas helpers ──────────────────────────────────────────────────────
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return hex + a
}

// ── Render ──────────────────────────────────────────────────────────────
function render(data: typeof sampleData) {
  const W = 1080, H = 1350
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.font = `800 60px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('TOP PITCHERS', W / 2, 70)

  // Date subtitle
  const dateStr = new Date(data.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
  ctx.font = `400 25px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(dateStr, W / 2, 120)

  // Card definitions
  const cards: { label: string; accent: string; key: string; isStuff: boolean }[] = [
    { label: 'STUFF+ STARTER',  accent: '#f59e0b', key: 'stuff_starter',  isStuff: true },
    { label: 'STUFF+ RELIEVER', accent: '#f59e0b', key: 'stuff_reliever', isStuff: true },
    { label: 'CMD+ STARTER',    accent: '#38bdf8', key: 'cmd_starter',    isStuff: false },
    { label: 'CMD+ RELIEVER',   accent: '#38bdf8', key: 'cmd_reliever',   isStuff: false },
  ]

  const cardH = 270
  const cardW = W - 80
  const cardX = 40
  let cardY = 155

  for (const card of cards) {
    const d = (data as any)[card.key] || null

    // Card background
    roundRect(ctx, cardX, cardY, cardW, cardH, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fill()
    ctx.strokeStyle = '#27272a'
    ctx.lineWidth = 1
    ctx.stroke()

    // Accent bar (left)
    roundRect(ctx, cardX, cardY, 6, cardH, 3)
    ctx.fillStyle = card.accent
    ctx.fill()

    // Card label
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = card.accent
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.label, cardX + 28, cardY + 30)

    if (!d) {
      ctx.font = `400 28px ${FONT}`
      ctx.fillStyle = '#3f3f46'
      ctx.textAlign = 'center'
      ctx.fillText('No data', cardX + cardW / 2, cardY + cardH / 2)
    } else {
      const playerName = d.player_name || '—'
      const displayName = playerName.includes(',')
        ? playerName.split(',').map((s: string) => s.trim()).reverse().join(' ')
        : playerName

      // Plus value (right side, big)
      const plusVal = card.isStuff ? d.stuff_plus : d.cmd_plus
      const plusStr = plusVal != null ? Math.round(plusVal).toString() : '—'
      ctx.font = `800 80px ${FONT}`
      ctx.fillStyle = plusColor(plusVal)
      ctx.textAlign = 'center'
      ctx.fillText(plusStr, cardX + cardW - 120, cardY + 110)

      // Player name (left, large)
      ctx.font = `700 48px ${FONT}`
      ctx.fillStyle = '#e4e4e7'
      ctx.textAlign = 'left'
      ctx.fillText(displayName, cardX + 28, cardY + 90)

      // Detail line
      const team = d.team || '??'
      const detailParts: string[] = [team]
      if (card.isStuff) {
        if (d.pitch_name) detailParts.push(d.pitch_name)
        if (d.velo != null) detailParts.push(`${d.velo} mph`)
      } else {
        if (d.pitches != null) detailParts.push(`${d.pitches} pitches`)
      }
      ctx.font = `400 26px ${FONT}`
      ctx.fillStyle = '#71717a'
      ctx.fillText(detailParts.join('  ·  '), cardX + 28, cardY + 130)

      // Game line
      const gl = d.game_line
      if (gl) {
        const lineY = cardY + 185
        const decision = gl.decision || 'ND'

        // Decision badge
        roundRect(ctx, cardX + 28, lineY, 52, 36, 8)
        ctx.fillStyle = hexAlpha(decisionColor(decision), 0.13)
        ctx.fill()
        ctx.strokeStyle = decisionColor(decision)
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.font = `700 20px ${FONT}`
        ctx.fillStyle = decisionColor(decision)
        ctx.textAlign = 'center'
        ctx.fillText(decision, cardX + 54, lineY + 19)

        // Game line stats
        const lineText = `${gl.ip} IP   ${gl.h}H   ${gl.er}ER   ${gl.bb}BB   ${gl.k}K`
        ctx.font = `500 24px ${FONT}`
        ctx.fillStyle = '#a1a1aa'
        ctx.textAlign = 'left'
        ctx.fillText(lineText, cardX + 92, lineY + 19)
      }
    }

    cardY += cardH + 12
  }

  // Watermark
  ctx.font = `400 18px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.textAlign = 'center'
  ctx.fillText('Powered by Mayday Media', W / 2, H - 30)

  return canvas
}

// ── Main ────────────────────────────────────────────────────────────────
const canvas = render(sampleData)
const buf = canvas.toBuffer('image/png')
const outPath = join('/Users/trevor/Desktop', 'top-pitchers.png')
writeFileSync(outPath, buf)
console.log(`Saved to ${outPath}`)
