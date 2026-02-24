/**
 * exportUtils — DOM-based export helpers for Plotly charts, canvases, and video.
 *
 * No external dependencies beyond Plotly (already bundled in the app) and the
 * native MediaRecorder / Canvas APIs available in modern browsers.
 *
 * Two API layers are provided:
 *
 *   High-level (used by ExportToolbar):
 *     exportToPng(container, quality)  — picks width/height from QualityPreset
 *     exportToSvg(container, quality)
 *     exportToWebm(container, quality) — drives duration from QualityPreset fps
 *
 *   Low-level (composable):
 *     exportPNG(element, filename, width, height)
 *     exportSVG(element, filename)
 *     exportVideo(canvas, filename, duration, fps)
 */

import type { QualityPreset } from './qualityPresets'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Trigger a file download for a Blob in the browser.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ---------------------------------------------------------------------------
// exportPNG
// ---------------------------------------------------------------------------

/**
 * Export a PNG image from a container element.
 *
 * Resolution strategy (in priority order):
 *   1. If the container contains a `.js-plotly-plot` div and `window.Plotly`
 *      is available, use `Plotly.toImage` for a crisp vector-rasterised export.
 *   2. If the container is (or contains) a `<canvas>`, use `canvas.toDataURL`.
 *
 * @param element   Container element (may be a Plotly div or a canvas wrapper)
 * @param filename  Download filename (should end in .png)
 * @param width     Desired export width in pixels
 * @param height    Desired export height in pixels
 */
export async function exportPNG(
  element: HTMLElement,
  filename: string,
  width: number,
  height: number
): Promise<void> {
  // --- Plotly path ---
  const plotlyDiv =
    element.classList.contains('js-plotly-plot')
      ? element
      : element.querySelector<HTMLElement>('.js-plotly-plot')

  if (plotlyDiv && typeof (window as any).Plotly !== 'undefined') {
    const Plotly = (window as any).Plotly
    const dataUrl: string = await Plotly.toImage(plotlyDiv, {
      format: 'png',
      width,
      height,
    })
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    downloadBlob(blob, filename.endsWith('.png') ? filename : `${filename}.png`)
    return
  }

  // --- Canvas path ---
  const canvas =
    element instanceof HTMLCanvasElement
      ? element
      : element.querySelector<HTMLCanvasElement>('canvas')

  if (canvas) {
    canvas.toBlob(
      (blob) => {
        if (blob) downloadBlob(blob, filename.endsWith('.png') ? filename : `${filename}.png`)
      },
      'image/png'
    )
    return
  }

  console.warn('exportPNG: no Plotly div or canvas found inside element')
}

// ---------------------------------------------------------------------------
// exportSVG
// ---------------------------------------------------------------------------

/**
 * Export an SVG from a Plotly chart container.
 *
 * @param element   Container element that holds (or is) a `.js-plotly-plot` div
 * @param filename  Download filename (should end in .svg)
 */
export async function exportSVG(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const plotlyDiv =
    element.classList.contains('js-plotly-plot')
      ? element
      : element.querySelector<HTMLElement>('.js-plotly-plot')

  if (!plotlyDiv || typeof (window as any).Plotly === 'undefined') {
    console.warn('exportSVG: Plotly not available or no .js-plotly-plot found')
    return
  }

  const Plotly = (window as any).Plotly
  const svgString: string = await Plotly.toImage(plotlyDiv, { format: 'svg' })

  // Plotly returns a data URI for SVG; strip the prefix to get raw SVG text
  const svgData = svgString.startsWith('data:image/svg+xml,')
    ? decodeURIComponent(svgString.slice('data:image/svg+xml,'.length))
    : atob(svgString.split(',')[1] ?? '')

  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`)
}

// ---------------------------------------------------------------------------
// exportVideo
// ---------------------------------------------------------------------------

/**
 * Record a canvas element for `duration` seconds and download as WebM (VP9).
 *
 * Uses the browser's `canvas.captureStream()` and `MediaRecorder` APIs.
 * The caller is responsible for driving any animation loop on the canvas
 * during the recording window.
 *
 * @param canvas    The canvas element to record
 * @param filename  Download filename (should end in .webm)
 * @param duration  Recording duration in seconds
 * @param fps       Desired capture frame rate
 * @returns         Promise that resolves once the download has been triggered
 */
export function exportVideo(
  canvas: HTMLCanvasElement,
  filename: string,
  duration: number,
  fps: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stream: MediaStream
    try {
      stream = canvas.captureStream(fps)
    } catch (err) {
      reject(new Error(`captureStream failed: ${(err as Error).message}`))
      return
    }

    const mimeType = 'video/webm;codecs=vp9'
    const mimeSupported = MediaRecorder.isTypeSupported(mimeType)
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeSupported ? mimeType : 'video/webm',
    })

    const chunks: BlobPart[] = []

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType })
      downloadBlob(blob, filename.endsWith('.webm') ? filename : `${filename}.webm`)
      resolve()
    }

    recorder.onerror = (e: Event) => {
      reject(new Error(`MediaRecorder error: ${(e as ErrorEvent).message ?? 'unknown'}`))
    }

    recorder.start()

    setTimeout(() => {
      recorder.stop()
    }, duration * 1000)
  })
}

// ---------------------------------------------------------------------------
// High-level exports (used by ExportToolbar)
// These accept a QualityPreset so callers don't need to manage dimensions.
// ---------------------------------------------------------------------------

/**
 * Export the contents of a container div as a PNG using preset dimensions.
 * Derives a filename from the current page title.
 */
export async function exportToPng(
  container: HTMLDivElement,
  quality: QualityPreset
): Promise<void> {
  const title = document.title.replace(/[^a-zA-Z0-9-_]/g, '_') || 'export'
  const filename = `${title}_${quality.id}.png`
  await exportPNG(container, filename, quality.exportWidth, quality.exportHeight)
}

/**
 * Export the contents of a container div as an SVG (Plotly charts only).
 */
export async function exportToSvg(
  container: HTMLDivElement,
  quality: QualityPreset
): Promise<void> {
  const title = document.title.replace(/[^a-zA-Z0-9-_]/g, '_') || 'export'
  const filename = `${title}_${quality.id}.svg`
  await exportSVG(container, filename)
}

/**
 * Record a WebM video from the first canvas found inside the container.
 * Duration is calculated as enough frames to show one full animation cycle
 * (defaults to 5 seconds if the preset doesn't carry a duration hint).
 */
export async function exportToWebm(
  container: HTMLDivElement,
  quality: QualityPreset
): Promise<void> {
  const canvas = container.querySelector<HTMLCanvasElement>('canvas')
  if (!canvas) {
    console.warn('exportToWebm: no canvas found inside container')
    return
  }
  const title = document.title.replace(/[^a-zA-Z0-9-_]/g, '_') || 'export'
  const filename = `${title}_${quality.id}.webm`
  // Record for 5 seconds by default; callers can extend via a higher-level wrapper
  const duration = 5
  await exportVideo(canvas, filename, duration, quality.fps)
}
