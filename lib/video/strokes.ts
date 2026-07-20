// Telestrator stroke model + canvas drawing.
//
// Coordinates are stored NORMALIZED (0..1 of the video box) so they survive
// resize and map cleanly onto both the on-screen author canvas and the native
// export canvas. Stroke widths / text sizes are authored against a 1280px-wide
// reference and scaled by the target canvas width, so a line looks the same
// thickness on a 640-wide Savant clip and a 1280-wide broadcast clip.
//
// Every stroke carries optional tStart/tEnd (seconds). v1 authors them as
// undefined (always visible); phase 5 uses them for timed strokes. Draw code
// already respects them via visibleAt().

export type Point = [number, number] // normalized 0..1

export interface BaseStroke {
  color: string
  width: number // S/M/L px @1280 reference
  tStart?: number
  tEnd?: number
}

export type Stroke =
  | (BaseStroke & { kind: 'pen'; pts: Point[] })
  | (BaseStroke & { kind: 'line'; a: Point; b: Point })
  | (BaseStroke & { kind: 'arrow'; a: Point; b: Point })
  | (BaseStroke & { kind: 'ellipse'; c: Point; rx: number; ry: number })
  | (BaseStroke & { kind: 'spotlight'; c: Point; rx: number; ry: number; dim: number })
  | (BaseStroke & { kind: 'text'; at: Point; text: string; size: number })

export const STROKE_WIDTHS: Record<'S' | 'M' | 'L', number> = { S: 3, M: 6, L: 10 }
export const STROKE_COLORS = [
  '#f8fafc', '#facc15', '#f97316', '#ef4444',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
]
export const REF_WIDTH = 1280

export function visibleAt(s: Stroke, t: number | undefined): boolean {
  if (t == null) return true
  if (s.tStart == null && s.tEnd == null) return true
  return t >= (s.tStart ?? -Infinity) && t <= (s.tEnd ?? Infinity)
}

function px(p: Point, W: number, H: number): [number, number] {
  return [p[0] * W, p[1] * H]
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, W: number, H: number) {
  const sc = Math.max(0.4, W / REF_WIDTH)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.width * sc

  switch (s.kind) {
    case 'pen': {
      if (s.pts.length < 2) {
        if (s.pts.length === 1) {
          const [x, y] = px(s.pts[0], W, H)
          ctx.beginPath(); ctx.arc(x, y, (s.width * sc) / 2, 0, Math.PI * 2); ctx.fill()
        }
        break
      }
      ctx.beginPath()
      s.pts.forEach((p, i) => {
        const [x, y] = px(p, W, H)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      break
    }
    case 'line': {
      const [ax, ay] = px(s.a, W, H)
      const [bx, by] = px(s.b, W, H)
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
      break
    }
    case 'arrow': {
      const [ax, ay] = px(s.a, W, H)
      const [bx, by] = px(s.b, W, H)
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
      const ang = Math.atan2(by - ay, bx - ax)
      const head = Math.max(10, s.width * 2.6) * sc
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx - head * Math.cos(ang - Math.PI / 6), by - head * Math.sin(ang - Math.PI / 6))
      ctx.lineTo(bx - head * Math.cos(ang + Math.PI / 6), by - head * Math.sin(ang + Math.PI / 6))
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'ellipse': {
      const [cx, cy] = px(s.c, W, H)
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.abs(s.rx) * W, Math.abs(s.ry) * H, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'spotlight': {
      const [cx, cy] = px(s.c, W, H)
      // Dim the whole frame, then punch a soft hole over the target.
      ctx.fillStyle = `rgba(0,0,0,${s.dim})`
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'destination-out'
      const rx = Math.abs(s.rx) * W
      const ry = Math.abs(s.ry) * H
      const grad = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.6, cx, cy, Math.max(rx, ry))
      grad.addColorStop(0, 'rgba(0,0,0,1)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'text': {
      const [x, y] = px(s.at, W, H)
      const size = s.size * sc
      ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`
      ctx.textBaseline = 'top'
      // readable on any background: dark halo behind the fill
      ctx.lineWidth = Math.max(2, size / 8)
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.lineJoin = 'round'
      ctx.strokeText(s.text, x, y)
      ctx.fillStyle = s.color
      ctx.fillText(s.text, x, y)
      break
    }
  }
  ctx.restore()
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  W: number,
  H: number,
  t?: number,
) {
  for (const s of strokes) if (visibleAt(s, t)) drawStroke(ctx, s, W, H)
}
