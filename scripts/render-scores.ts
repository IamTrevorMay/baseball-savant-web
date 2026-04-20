/**
 * Standalone script to render "Yesterday's Scores" template to PNG.
 * Usage: npx tsx scripts/render-scores.ts [YYYY-MM-DD]
 */
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { TEAM_COLORS } from '../lib/constants'

// ── Fetch scores from MLB API ────────────────────────────────────────────
async function fetchScores(date: string) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore,decisions`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MLB API returned ${res.status}`)
  const data = await res.json()

  const allGames = data.dates?.[0]?.games || []
  const finalGames = allGames.filter((g: any) =>
    g.status?.abstractGameState === 'Final' || g.status?.detailedState === 'Final'
  )

  const fixAbbrev = (a: string) => {
    if (a === 'AZ') return 'ARI'
    if (a === 'WSN') return 'WSH'
    return a
  }

  const games = finalGames.map((g: any) => {
    const away = g.teams?.away
    const home = g.teams?.home
    return {
      awayAbbrev: fixAbbrev(away?.team?.abbreviation || '???'),
      homeAbbrev: fixAbbrev(home?.team?.abbreviation || '???'),
      awayScore: away?.score ?? 0,
      homeScore: home?.score ?? 0,
      winPitcher: g.decisions?.winner?.fullName?.split(', ').pop()?.split(' ').pop() || '',
      losePitcher: g.decisions?.loser?.fullName?.split(', ').pop()?.split(' ').pop() || '',
      savePitcher: g.decisions?.save?.fullName?.split(', ').pop()?.split(' ').pop() || '',
    }
  })

  const d = new Date(date + 'T12:00:00')
  const dateFormatted = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return { date, dateFormatted, games }
}

// ── Canvas helpers ───────────────────────────────────────────────────────
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

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

// ── Render ───────────────────────────────────────────────────────────────
async function render(scores: { date: string; dateFormatted: string; games: any[] }) {
  const W = 1080, H = 1350
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.font = `800 48px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText("YESTERDAY'S SCORES", W / 2, 70)

  // Date subtitle
  ctx.font = `400 22px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(scores.dateFormatted, W / 2, 120)

  const games = scores.games
  if (games.length === 0) {
    ctx.font = `400 24px ${FONT}`
    ctx.fillStyle = '#52525b'
    ctx.fillText('No games found for this date', W / 2, 600)
  } else {
    const cols = 2
    const pad = 28
    const gapX = 20
    const gapY = 16
    const cardW = Math.floor((W - pad * 2 - gapX * (cols - 1)) / cols)
    const startY = 155
    const rows = Math.ceil(games.length / cols)
    const availH = (H - 60) - startY
    const cardH = Math.min(160, Math.floor((availH - gapY * (rows - 1)) / rows))

    for (let i = 0; i < games.length; i++) {
      const g = games[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = pad + col * (cardW + gapX)
      const y = startY + row * (cardH + gapY)

      // Card bg
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      roundRect(ctx, x, y, cardW, cardH, 12)
      ctx.fill()
      ctx.strokeStyle = '#27272a'
      ctx.lineWidth = 1
      roundRect(ctx, x, y, cardW, cardH, 12)
      ctx.stroke()

      // Team color bars
      const awayColor = TEAM_COLORS[g.awayAbbrev] || '#52525b'
      const homeColor = TEAM_COLORS[g.homeAbbrev] || '#52525b'

      ctx.fillStyle = awayColor
      roundRect(ctx, x + 12, y + 14, 5, 24, 3)
      ctx.fill()

      ctx.fillStyle = homeColor
      roundRect(ctx, x + 12, y + 44, 5, 24, 3)
      ctx.fill()

      // Away team + score
      const awayWon = g.awayScore > g.homeScore
      const homeWon = g.homeScore > g.awayScore

      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = `${awayWon ? 800 : 500} 28px ${FONT}`
      ctx.fillStyle = awayWon ? '#ffffff' : '#71717a'
      ctx.fillText(g.awayAbbrev, x + 24, y + 28)

      ctx.textAlign = 'right'
      ctx.fillText(String(g.awayScore), x + cardW - 15, y + 28)

      // Home team + score
      ctx.textAlign = 'left'
      ctx.font = `${homeWon ? 800 : 500} 28px ${FONT}`
      ctx.fillStyle = homeWon ? '#ffffff' : '#71717a'
      ctx.fillText(g.homeAbbrev, x + 24, y + 62)

      ctx.textAlign = 'right'
      ctx.fillText(String(g.homeScore), x + cardW - 15, y + 62)

      // FINAL
      ctx.font = `600 13px ${FONT}`
      ctx.fillStyle = '#52525b'
      ctx.textAlign = 'right'
      ctx.fillText('FINAL', x + cardW - 15, y + 92)

      // Pitcher decisions
      const decisions: string[] = []
      if (g.winPitcher) decisions.push(`W: ${g.winPitcher}`)
      if (g.losePitcher) decisions.push(`L: ${g.losePitcher}`)
      if (g.savePitcher) decisions.push(`S: ${g.savePitcher}`)
      if (decisions.length > 0) {
        ctx.font = `500 14px ${FONT}`
        ctx.fillStyle = '#a1a1aa'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(decisions.join('  '), x + 12, y + cardH - 21)
      }
    }
  }

  // Watermark
  ctx.font = `400 16px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Powered by Mayday Media', W / 2, H - 30)

  return canvas
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const dateArg = process.argv[2]
  const date = dateArg || (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  console.log(`Fetching scores for ${date}...`)
  const scores = await fetchScores(date)
  console.log(`Found ${scores.games.length} final games`)

  const canvas = await render(scores)
  const buf = canvas.toBuffer('image/png')
  const outPath = join('/Users/trevor/Desktop', `yesterdays-scores-${date}.png`)
  writeFileSync(outPath, buf)
  console.log(`Saved to ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
