'use client'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react'
import { QualityPreset } from '@/lib/qualityPresets'
import { COLORS } from '@/components/chartConfig'

interface Props {
  quality: QualityPreset
  onDraw: (ctx: CanvasRenderingContext2D, frame: number, time: number) => void
  animate?: boolean
  /** CSS width of the container; canvas fills parent when omitted. */
  width?: number
  /** CSS height of the container; canvas fills parent when omitted. */
  height?: number
  className?: string
}

export interface CanvasRendererHandle {
  canvas: HTMLCanvasElement | null
}

/**
 * CanvasRenderer
 *
 * Base canvas component for canvas-based Visualize templates.
 * - Scales the canvas by quality.resolution (device pixel ratio multiplier).
 * - When animate=true, runs a requestAnimationFrame loop passing (ctx, frame, time).
 * - When animate=false, calls onDraw once after mounting.
 * - Exposes the raw HTMLCanvasElement via forwardRef for export.
 * - Dark fill (#09090b) before every draw to match the platform background.
 */
const CanvasRenderer = forwardRef<CanvasRendererHandle, Props>(function CanvasRenderer(
  { quality, onDraw, animate = false, width, height, className = '' },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const mountedRef = useRef(false)

  useImperativeHandle(ref, () => ({
    get canvas() {
      return canvasRef.current
    },
  }))

  // Resize + draw setup
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = quality.resolution
    const cssW = width ?? container.clientWidth
    const cssH = height ?? container.clientHeight

    if (cssW === 0 || cssH === 0) return

    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)

    // Fill background before initial draw
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, cssW, cssH)

    // First draw / start loop
    if (animate) {
      startLoop(ctx, cssW, cssH, dpr)
    } else {
      onDraw(ctx, 0, 0)
    }
  }, [quality.resolution, width, height, animate, onDraw])

  function startLoop(
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    dpr: number,
  ) {
    // Cancel any existing loop
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    frameRef.current = 0

    function tick(time: number) {
      if (!mountedRef.current) return
      // Clear with dark background each frame
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = COLORS.bg
      ctx.fillRect(0, 0, cssW * dpr, cssH * dpr)
      ctx.restore()

      onDraw(ctx, frameRef.current, time)
      frameRef.current++
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  // Mount / unmount
  useEffect(() => {
    mountedRef.current = true
    setupCanvas()

    // ResizeObserver to react to container size changes
    const observer = new ResizeObserver(() => {
      // Reset scale transform before re-setup
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0)

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      frameRef.current = 0
      setupCanvas()
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      mountedRef.current = false
      observer.disconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [setupCanvas])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        width: width ? `${width}px` : '100%',
        height: height ? `${height}px` : '100%',
        background: COLORS.bg,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        aria-label="Visualization canvas"
      />
    </div>
  )
})

export default CanvasRenderer
