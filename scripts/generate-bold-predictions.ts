/**
 * Generate 11 "Bold Predictions" PNG cards using the "Text Only Card" template.
 * Usage: npx tsx scripts/generate-bold-predictions.ts
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import * as fs from 'fs'
import * as path from 'path'

const OUTPUT_DIR = '/Volumes/Mayday!/Shows/3.25 - 3.27.26/Bold Predictions'

const PREDICTIONS = [
  'There will be 10 pitchers that throw over 190 innings this season',
  'The Athletics will be top 3 in all of baseball in Runs Scored & Shea Langeliers will hit 40 homers',
  'The Pirates will make the post season',
  'Mason Miller first reliever Cy Young since Eric Gagne',
  'There will be at LEAST three 100 game winners this year and the Mets will be one of them',
  'Kevin McGonigle gets AL MVP votes',
  'The Rays make postseason despite loaded AL East',
  'The Diamondbacks will trade Ketel Marte at the deadline',
  'The Milwaukee Brewers will have the longest win streak this year at 12',
  'The Los Angeles Dodgers will three-peat for the first time since the Yankees did it from 1998-2000',
  'There will be a lockout',
]

// Template specs from the "Text Only Card" custom template
const W = 1920
const H = 1080
const BG = '#09090b'

// Number element: x=10, y=20, w=386, h=268, fontSize=80, weight=700, center
// Body element: x=602, y=226, w=716, h=380, fontSize=108, weight=700, center, lowercase

// ── Font setup ──────────────────────────────────────────────────────────────

let fontFamily = 'sans-serif'

async function ensureFont() {
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff2',
    'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff2',
  ]
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer())
        GlobalFonts.register(buf, 'Inter')
        fontFamily = 'Inter'
      }
    } catch { /* skip */ }
  }
}

// ── Word-wrap text into lines that fit maxWidth ─────────────────────────────

function wrapText(
  ctx: any,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    const m = ctx.measureText(test)
    if (m.width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── Render a single card ────────────────────────────────────────────────────

function renderCard(index: number, prediction: string): Buffer {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // Number element
  const numText = `#${index + 1}`
  ctx.font = `700 80px ${fontFamily}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(numText, 10 + 386 / 2, 20 + 268 / 2)

  // Body element — word-wrapped, centered vertically and horizontally
  const bodyX = 124
  const bodyY = 242
  const bodyW = 1672
  const bodyH = 596

  // Start with template fontSize, shrink if needed to fit
  let fontSize = 108
  let lines: string[] = []
  const bodyText = prediction.toUpperCase()

  while (fontSize >= 24) {
    ctx.font = `700 ${fontSize}px ${fontFamily}`
    lines = wrapText(ctx, bodyText, bodyW)
    const lineHeight = fontSize * 1.2
    const totalHeight = lines.length * lineHeight
    if (totalHeight <= bodyH + lineHeight * 0.5) break // fits with a little tolerance
    fontSize -= 4
  }

  const lineHeight = fontSize * 1.2
  const totalHeight = lines.length * lineHeight
  const startY = bodyY + (bodyH - totalHeight) / 2 + lineHeight / 2

  ctx.font = `700 ${fontSize}px ${fontFamily}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bodyX + bodyW / 2, startY + i * lineHeight)
  }

  return canvas.toBuffer('image/png')
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await ensureFont()

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  for (let i = 0; i < PREDICTIONS.length; i++) {
    const buf = renderCard(i, PREDICTIONS[i])
    const filename = `bold-prediction-${String(i + 1).padStart(2, '0')}.png`
    const outPath = path.join(OUTPUT_DIR, filename)
    fs.writeFileSync(outPath, buf)
    console.log(`✓ ${filename} — #${i + 1}`)
  }

  console.log(`\nDone! ${PREDICTIONS.length} cards saved to ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
