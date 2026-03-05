/**
 * Export a pitch sequence replay animation as MP4 using FFmpeg WASM.
 * Follows the same pipeline as exportScene.ts:exportMP4.
 */

export async function exportSequenceReplayMP4(
  renderFrame: (timeMs: number) => HTMLCanvasElement,
  totalDurationMs: number,
  options?: { fps?: number; width?: number; height?: number; filename?: string },
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile } = await import('@ffmpeg/util')

  const fps = options?.fps || 30
  const filename = options?.filename || 'sequence-replay.mp4'

  const ffmpeg = new FFmpeg()
  await ffmpeg.load()

  const totalFrames = Math.ceil((totalDurationMs / 1000) * fps)

  // Render each frame as PNG into FFmpeg virtual FS
  for (let f = 0; f <= totalFrames; f++) {
    const timeMs = (f / fps) * 1000
    const canvas = renderFrame(timeMs)
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/png')
    })
    const data = await fetchFile(blob)
    const padded = String(f).padStart(5, '0')
    await ffmpeg.writeFile(`frame_${padded}.png`, data)
    onProgress?.(((f + 1) / (totalFrames + 1)) * 80)
  }

  // Encode H.264 MP4
  await ffmpeg.exec([
    '-framerate', String(fps),
    '-i', 'frame_%05d.png',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    '-movflags', '+faststart',
    'output.mp4',
  ])
  onProgress?.(95)

  const output = await ffmpeg.readFile('output.mp4') as Uint8Array
  const mp4Blob = new Blob(
    [new Uint8Array(output.buffer, output.byteOffset, output.byteLength).slice()],
    { type: 'video/mp4' },
  )

  const url = URL.createObjectURL(mp4Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  ffmpeg.terminate()
  onProgress?.(100)
}
