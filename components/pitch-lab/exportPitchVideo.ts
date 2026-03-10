import * as THREE from 'three'

interface ExportOptions {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
  totalDuration: number    // seconds at 1x speed
  fps?: number
  setProgress: (animationProgress: number) => void
  onProgress?: (pct: number) => void
}

/**
 * Export WebM using MediaRecorder (fast, browser-native).
 * Captures frames by imperatively rendering the R3F scene.
 */
export async function exportWebM(opts: ExportOptions): Promise<void> {
  const { gl, scene, camera, totalDuration, fps = 30, setProgress, onProgress } = opts
  const canvas = gl.domElement
  const totalFrames = Math.ceil(fps * totalDuration)

  const stream = canvas.captureStream(0)
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 8_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }

  const done = new Promise<void>(resolve => {
    recorder.onstop = () => resolve()
  })

  recorder.start()

  for (let f = 0; f <= totalFrames; f++) {
    const progress = f / totalFrames
    setProgress(progress)

    // Wait a tick for React to update, then render
    await new Promise(r => setTimeout(r, 16))
    gl.render(scene, camera)

    const track = stream.getVideoTracks()[0] as any
    if (track?.requestFrame) track.requestFrame()

    await new Promise(r => setTimeout(r, 1000 / fps))
    onProgress?.(((f + 1) / (totalFrames + 1)) * 100)
  }

  recorder.stop()
  await done

  const blob = new Blob(chunks, { type: 'video/webm' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pitch-lab.webm'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Export MP4 using FFmpeg WASM.
 * Renders each frame as PNG, encodes with H.264.
 */
export async function exportMP4(opts: ExportOptions): Promise<void> {
  const { gl, scene, camera, totalDuration, fps = 30, setProgress, onProgress } = opts
  const canvas = gl.domElement
  const totalFrames = Math.ceil(fps * totalDuration)

  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  await ffmpeg.load()

  for (let f = 0; f <= totalFrames; f++) {
    const progress = f / totalFrames
    setProgress(progress)

    await new Promise(r => setTimeout(r, 16))
    gl.render(scene, camera)

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/png')
    })
    const data = await fetchFile(blob)
    const padded = String(f).padStart(5, '0')
    await ffmpeg.writeFile(`frame_${padded}.png`, data)
    onProgress?.(((f + 1) / (totalFrames + 1)) * 80)
  }

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
  a.download = 'pitch-lab.mp4'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  ffmpeg.terminate()
  onProgress?.(100)
}
