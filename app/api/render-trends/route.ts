import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderCardToPNG } from '@/lib/serverRenderCard'

export const maxDuration = 60

type El = { type: string; x: number; y: number; width: number; height: number; props: Record<string, any> }
const el = (type: string, x: number, y: number, w: number, h: number, props: Record<string, any>): El =>
  ({ type, x, y, width: w, height: h, props })

function fmtVal(key: string, val: number): string {
  if (key === 'xwoba') return val.toFixed(3)
  if (key === 'spin') return String(Math.round(val))
  if (key === 'velo' || key === 'ev') return val.toFixed(1)
  return val.toFixed(1) + '%'
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = new Date().getFullYear()
  const month = new Date().getMonth() + 1
  const minPitches = month <= 4 ? 50 : 500
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000'

  // Fetch trends for both pitchers and hitters
  const [pRes, hRes] = await Promise.all([
    fetch(`${siteUrl}/api/trends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: year, playerType: 'pitcher', minPitches }),
    }),
    fetch(`${siteUrl}/api/trends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: year, playerType: 'hitter', minPitches }),
    }),
  ])

  const [pd, hd] = await Promise.all([pRes.json(), hRes.json()])
  const all = [...(pd.rows || []), ...(hd.rows || [])]

  const pickUnique = (list: any[], n: number) => {
    const seen = new Set<number>()
    const result: any[] = []
    for (const item of list) {
      if (!seen.has(item.player_id)) { seen.add(item.player_id); result.push(item) }
      if (result.length >= n) break
    }
    return result
  }

  const surges = pickUnique(
    all.filter((a: any) => a.sentiment === 'good').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma)), 5)
  const concerns = pickUnique(
    all.filter((a: any) => a.sentiment === 'bad').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma)), 5)

  const latestDate = pd.latestDate || hd.latestDate || 'today'

  // Build scene
  const W = 1920, H = 1080
  const elements: El[] = []

  elements.push(el('text', 80, 35, 1760, 60, { text: 'DAILY TREND REPORT', fontSize: 44, fontWeight: 800, color: '#ffffff', textAlign: 'left' }))
  elements.push(el('text', 80, 95, 1760, 28, { text: `Through ${latestDate}  •  Pitchers & Hitters`, fontSize: 18, fontWeight: 400, color: '#71717a', textAlign: 'left' }))
  elements.push(el('shape', 80, 135, 1760, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }))

  // Surges header
  elements.push(el('shape', 80, 150, 12, 32, { shape: 'rect', fill: '#10b981', stroke: 'transparent', strokeWidth: 0, borderRadius: 3 }))
  elements.push(el('text', 105, 152, 300, 32, { text: 'SURGES', fontSize: 22, fontWeight: 800, color: '#10b981', textAlign: 'left' }))
  elements.push(el('text', 350, 156, 400, 24, { text: 'Top performing trends', fontSize: 14, fontWeight: 400, color: '#52525b', textAlign: 'left' }))

  const colX = { rank: 80, name: 120, metric: 480, season: 720, recent: 880, delta: 1040, sigma: 1220 }
  const headers = ['PLAYER', 'METRIC', 'SEASON', 'RECENT', 'DELTA', 'SIGMA']
  const headerXs = [colX.name, colX.metric, colX.season, colX.recent, colX.delta, colX.sigma]
  const headerAligns = ['left', 'left', 'center', 'center', 'center', 'center']

  // Surge column headers
  for (let j = 0; j < headers.length; j++) {
    elements.push(el('text', headerXs[j], 195, j < 2 ? 340 : 140, 22, { text: headers[j], fontSize: 12, fontWeight: 700, color: '#52525b', textAlign: headerAligns[j] }))
  }

  const rowH = 72
  const surgeStartY = 225

  function addRow(items: any[], startY: number, color: string, bgColor: string) {
    for (let i = 0; i < 5; i++) {
      const s = items[i]
      const y = startY + i * rowH
      if (i % 2 === 1) {
        elements.push(el('shape', 60, y - 4, 1800, rowH - 4, { shape: 'rect', fill: bgColor, stroke: 'transparent', strokeWidth: 0, borderRadius: 6 }))
      }
      if (!s) continue
      elements.push(el('text', colX.rank, y + 8, 30, 40, { text: String(i + 1), fontSize: 28, fontWeight: 800, color, textAlign: 'center' }))
      elements.push(el('player-image', 120, y + 2, 48, 52, { playerId: s.player_id, playerName: s.player_name, borderColor: '#27272a', showLabel: false, bgColor: 'transparent' }))
      elements.push(el('text', 180, y + 8, 280, 28, { text: s.player_name, fontSize: 20, fontWeight: 700, color: '#ffffff', textAlign: 'left' }))
      elements.push(el('text', 180, y + 36, 280, 18, { text: s.metric_label, fontSize: 13, fontWeight: 400, color: '#71717a', textAlign: 'left' }))
      elements.push(el('text', colX.metric, y + 12, 220, 32, { text: s.metric_label, fontSize: 18, fontWeight: 600, color: '#a1a1aa', textAlign: 'left' }))
      elements.push(el('text', colX.season, y + 12, 140, 32, { text: fmtVal(s.metric, s.season_val), fontSize: 20, fontWeight: 600, color: '#71717a', textAlign: 'center', fontFamily: 'monospace' }))
      elements.push(el('text', colX.recent, y + 12, 140, 32, { text: fmtVal(s.metric, s.recent_val), fontSize: 20, fontWeight: 700, color, textAlign: 'center', fontFamily: 'monospace' }))
      elements.push(el('text', colX.delta, y + 12, 140, 32, { text: (s.delta >= 0 ? '+' : '') + fmtVal(s.metric, s.delta), fontSize: 20, fontWeight: 700, color, textAlign: 'center', fontFamily: 'monospace' }))
      elements.push(el('text', colX.sigma, y + 8, 140, 40, { text: 'σ' + Math.abs(s.sigma).toFixed(1), fontSize: 24, fontWeight: 800, color, textAlign: 'center' }))
    }
  }

  addRow(surges, surgeStartY, '#10b981', 'rgba(16,185,129,0.04)')

  // Divider
  const divY = surgeStartY + 5 * rowH + 15
  elements.push(el('shape', 80, divY, 1760, 2, { shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }))

  // Concerns header
  const cLabelY = divY + 15
  elements.push(el('shape', 80, cLabelY, 12, 32, { shape: 'rect', fill: '#ef4444', stroke: 'transparent', strokeWidth: 0, borderRadius: 3 }))
  elements.push(el('text', 105, cLabelY + 2, 300, 32, { text: 'CONCERNS', fontSize: 22, fontWeight: 800, color: '#ef4444', textAlign: 'left' }))
  elements.push(el('text', 350, cLabelY + 6, 400, 24, { text: 'Notable declines to watch', fontSize: 14, fontWeight: 400, color: '#52525b', textAlign: 'left' }))

  // Concern column headers
  const cHeaderY = cLabelY + 42
  for (let j = 0; j < headers.length; j++) {
    elements.push(el('text', headerXs[j], cHeaderY, j < 2 ? 340 : 140, 22, { text: headers[j], fontSize: 12, fontWeight: 700, color: '#52525b', textAlign: headerAligns[j] }))
  }

  addRow(concerns, cHeaderY + 30, '#ef4444', 'rgba(239,68,68,0.04)')

  // Footer
  elements.push(el('text', 80, H - 45, 1760, 24, { text: 'Data: Statcast via Triton Apex  •  tritonapex.io', fontSize: 13, fontWeight: 400, color: '#3f3f46', textAlign: 'center' }))

  const scene = { id: 'trend-report', name: 'Daily Trend Report', width: W, height: H, background: '#09090b', elements }

  // Return PNG or JSON scene based on format param
  const format = req.nextUrl.searchParams.get('format')
  if (format === 'json') {
    return NextResponse.json({ scene, surges: surges.length, concerns: concerns.length, date: latestDate })
  }

  const png = await renderCardToPNG(scene as any)
  return new NextResponse(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
  })
}
