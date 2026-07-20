// Server-side PDF render of a biomech report via jsPDF. Produces the archival
// six-section document (compete_reports.pdf_url). Percentile bars are drawn as
// rectangles; the interactive tile view (BiomechReport.tsx) is the richer surface.

import { jsPDF } from 'jspdf'
import { METRIC_DEF_BY_KEY, bandFor } from './norms'
import { REPORT_BUCKETS, type BiomechReportPayload } from './reportPayload'
import type { MetricPercentile } from './types'

const INK = { r: 24, g: 24, b: 27 }
const MUTED = { r: 113, g: 113, b: 122 }
const BLUE = { r: 59, g: 130, b: 246 }

function statusRGB(p: MetricPercentile) {
  const favorable = p.higherIsBetter ? p.percentile : 100 - p.percentile
  if (favorable >= 55) return { r: 16, g: 185, b: 129 }   // emerald
  if (favorable >= 30) return { r: 245, g: 158, b: 11 }   // amber
  return { r: 244, g: 63, b: 94 }                          // rose
}

const fmt = (v: number, unit: string) =>
  !Number.isFinite(v) ? '—' : unit === 's' ? v.toFixed(3) : Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1)

export function buildReportPdf(payload: BiomechReportPayload): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40
  let y = M

  const line = (txt: string, size: number, color = INK, gap = 14) => {
    doc.setFontSize(size); doc.setTextColor(color.r, color.g, color.b); doc.text(txt, M, y); y += gap
  }
  const pageBreak = (need = 80) => { if (y + need > doc.internal.pageSize.getHeight() - M) { doc.addPage(); y = M } }

  // ── header ──
  doc.setFillColor(BLUE.r, BLUE.g, BLUE.b); doc.rect(0, 0, W, 6, 'F')
  line('BIOMECHANICS ASSESSMENT', 9, BLUE, 16)
  line(payload.athleteName ?? 'Athlete', 20, INK, 20)
  line(`${payload.captureDate ?? '—'}  ·  ${payload.level.toUpperCase()}  ·  ${payload.veloContext ?? 'context n/a'}  ·  ${payload.system}`, 9, MUTED, 22)
  doc.setFontSize(30); doc.setTextColor(BLUE.r, BLUE.g, BLUE.b)
  doc.text(`Movement Grade ${payload.movementGrade}`, M, y); y += 26

  // ── flags ──
  if (payload.flags.length) {
    pageBreak(); line('PRIORITY FLAGS → PRESCRIPTIONS', 11, INK, 16)
    for (const f of payload.flags) {
      pageBreak(70)
      line(`• ${f.intervention.title}  (${f.percentile}th pct · ${f.label})`, 10, { r: 190, g: 40, b: 60 }, 13)
      line(`  ${f.intervention.rationale}`, 8.5, MUTED, 12)
      line(`  Cue: ${f.intervention.cue}   Drills: ${f.intervention.drills.join(', ')}`, 8.5, INK, 16)
    }
  }

  // ── buckets ──
  const byKey = new Map(payload.percentiles.map(p => [p.key, p]))
  for (const bucket of REPORT_BUCKETS) {
    const rows = bucket.metrics.map(m => byKey.get(m)).filter(Boolean) as MetricPercentile[]
    if (!rows.length) continue
    pageBreak(40 + rows.length * 22)
    y += 6; line(bucket.title.toUpperCase(), 11, BLUE, 16)
    for (const p of rows) {
      const def = METRIC_DEF_BY_KEY[p.key]
      const band = def ? bandFor(def, payload.level) : null
      // label + value
      doc.setFontSize(9); doc.setTextColor(INK.r, INK.g, INK.b)
      doc.text(`${def?.label ?? p.key}${p.directional ? '  (directional)' : ''}`, M, y)
      doc.text(`${fmt(p.value, def?.unit ?? '')} ${def?.unit ?? ''}`, W - M, y, { align: 'right' })
      y += 6
      // bar track
      const bx = M, bw = W - 2 * M, bh = 5
      doc.setFillColor(228, 228, 231); doc.rect(bx, y, bw, bh, 'F')
      doc.setFillColor(200, 200, 205); doc.rect(bx + bw * 0.25, y, bw * 0.5, bh, 'F')  // p25–75
      const s = statusRGB(p)
      const mx = bx + bw * Math.min(0.98, Math.max(0.02, p.percentile / 100))
      doc.setFillColor(s.r, s.g, s.b); doc.rect(mx - 2, y - 1, 4, bh + 2, 'F')
      // scale ticks
      doc.setFontSize(7); doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      if (band) {
        doc.text(fmt(band.p10, ''), bx, y + 12)
        doc.text(`${p.percentile}th`, bx + bw / 2, y + 12, { align: 'center' })
        doc.text(fmt(band.p90, ''), bx + bw, y + 12, { align: 'right' })
      }
      y += 20
    }
  }

  // ── kinetics placeholder ──
  pageBreak(50); y += 6
  line('KINETICS (TORQUE)', 11, MUTED, 14)
  line('Pending force plates + inverse dynamics (v2). Captury is kinematics-only —', 8.5, MUTED, 11)
  line('no validated N·m reported. Rotational-shoulder metrics are directional proxies.', 8.5, MUTED, 14)

  return doc.output('arraybuffer')
}
