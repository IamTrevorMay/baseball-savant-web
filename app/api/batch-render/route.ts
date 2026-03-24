import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { renderCardToPNG } from '@/lib/serverRenderCard'
import * as fs from 'fs'
import * as path from 'path'

export const maxDuration = 300

/**
 * POST /api/batch-render
 *
 * Batch-render PNGs from a custom template with per-card text substitutions.
 *
 * Body:
 * {
 *   templateId: string,           // custom_templates UUID
 *   cards: Array<Record<string, string>>,  // each card maps element text content → replacement
 *                                          // keys match element props.text values (case-insensitive)
 *   outputDir?: string,           // local filesystem path to save PNGs (optional)
 *   filenamePrefix?: string,      // default: "card"
 * }
 *
 * Keys in each card object are matched to template text elements by their
 * current `props.text` value (case-insensitive). For example, if a text element
 * has props.text = "body", a card key of "body" will replace it.
 *
 * Returns: { ok: true, count, files: string[] } or ZIP download if no outputDir.
 */
export async function POST(req: NextRequest) {
  try {
    const { templateId, cards, outputDir, filenamePrefix = 'card' } = await req.json()

    if (!templateId) return NextResponse.json({ error: 'templateId required' }, { status: 400 })
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: 'cards array required' }, { status: 400 })
    }

    // Load template
    const { data: template, error: tErr } = await supabaseAdmin
      .from('custom_templates')
      .select('width, height, background, elements')
      .eq('id', templateId)
      .maybeSingle()

    if (tErr || !template) {
      return NextResponse.json({ error: tErr?.message || 'Template not found' }, { status: 404 })
    }

    const baseElements: any[] = template.elements || []

    // Ensure output directory
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const files: string[] = []
    const buffers: Buffer[] = []

    for (let i = 0; i < cards.length; i++) {
      const cardData = cards[i]

      // Clone elements and substitute text
      const elements = baseElements.map((el: any) => {
        if (el.type !== 'text') return el
        const currentText = (el.props?.text || '').toLowerCase()
        // Find matching key in cardData (case-insensitive match against element's text)
        const matchKey = Object.keys(cardData).find(k => k.toLowerCase() === currentText)
        if (!matchKey) return el
        return {
          ...el,
          props: { ...el.props, text: cardData[matchKey] },
        }
      })

      const scene = {
        id: `batch-${i}`,
        name: `Card ${i + 1}`,
        width: template.width,
        height: template.height,
        background: template.background,
        elements,
      }

      const png = await renderCardToPNG(scene)

      if (outputDir) {
        const filename = `${filenamePrefix}-${String(i + 1).padStart(2, '0')}.png`
        const outPath = path.join(outputDir, filename)
        fs.writeFileSync(outPath, png)
        files.push(filename)
      } else {
        buffers.push(png)
      }
    }

    // If outputDir specified, return file list
    if (outputDir) {
      return NextResponse.json({ ok: true, count: files.length, files, outputDir })
    }

    // Otherwise return a ZIP (or single PNG for 1 card)
    if (buffers.length === 1) {
      return new NextResponse(buffers[0], {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${filenamePrefix}-01.png"`,
        },
      })
    }

    // Multiple cards without outputDir: return JSON with base64
    const encoded = buffers.map((b, i) => ({
      filename: `${filenamePrefix}-${String(i + 1).padStart(2, '0')}.png`,
      base64: b.toString('base64'),
    }))
    return NextResponse.json({ ok: true, count: encoded.length, cards: encoded })
  } catch (err: any) {
    console.error('batch-render error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
