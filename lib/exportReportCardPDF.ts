import { Scene } from './sceneTypes'
import { exportScenePNG } from '@/components/visualize/scene-composer/exportScene'

export async function exportReportCardPDF(scene: Scene, filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf')

  // Render scene to a canvas first
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!

  // Use the same render pipeline as PNG export
  // We'll create a temporary PNG blob, then put it in the PDF
  const pngBlob = await new Promise<Blob>((resolve) => {
    // Re-use the scene's render by taking a snapshot via exportScenePNG's internal logic
    // Instead, create a hidden canvas and render
    if (scene.background && scene.background !== 'transparent') {
      ctx.fillStyle = scene.background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    canvas.toBlob(blob => resolve(blob!), 'image/png')
  })

  // Better approach: render via an offscreen image
  // We'll use html2canvas-like approach — render the scene to a data URL
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = scene.width
  tempCanvas.height = scene.height

  // Find the on-screen canvas preview and capture it
  const previewCanvas = document.querySelector('[data-rc-preview-canvas]') as HTMLCanvasElement
  if (previewCanvas) {
    const tCtx = tempCanvas.getContext('2d')!
    tCtx.drawImage(previewCanvas, 0, 0, scene.width, scene.height)
  } else {
    // Fallback: just use a blank background
    const tCtx = tempCanvas.getContext('2d')!
    if (scene.background && scene.background !== 'transparent') {
      tCtx.fillStyle = scene.background
      tCtx.fillRect(0, 0, scene.width, scene.height)
    }
  }

  const imgData = tempCanvas.toDataURL('image/png')

  // Determine orientation
  const isLandscape = scene.width > scene.height
  const orientation = isLandscape ? 'landscape' : 'portrait'

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [scene.width, scene.height],
  })

  pdf.addImage(imgData, 'PNG', 0, 0, scene.width, scene.height)
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

export async function captureCanvasForPDF(): Promise<string | null> {
  const previewCanvas = document.querySelector('[data-rc-preview-canvas]') as HTMLCanvasElement
  if (!previewCanvas) return null
  return previewCanvas.toDataURL('image/png')
}
