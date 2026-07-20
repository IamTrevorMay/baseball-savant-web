// WebM fallback recorder — same frame-fed interface as the mp4 recorder, for
// browsers without WebCodecs (Firefox / Safari). Uses MediaRecorder over a
// canvas.captureStream(0), manually pushing one frame per addFrame() via
// requestFrame (same trick as components/pitch-lab/exportPitchVideo.ts).
//
// No SharedArrayBuffer / cross-origin isolation needed (unlike ffmpeg.wasm), so
// it adds zero app-wide infra. Trade-off: WebM (VP9/VP8), not mp4, and it
// records on a paced wall-clock rather than exact frames.

import type { FrameRecorder, RecorderOptions } from './recorder'

export function mediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  )
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

export function createWebmRecorder(
  canvas: HTMLCanvasElement,
  opts: RecorderOptions = {},
): FrameRecorder {
  if (!mediaRecorderSupported()) {
    throw new Error('This browser cannot export video.')
  }
  const fps = opts.fps ?? 30
  const bitrate = opts.bitrate ?? 8_000_000
  const mime = pickMime()

  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate })
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise<void>(resolve => { rec.onstop = () => resolve() })
  rec.start()
  let finished = false

  return {
    ext: 'webm',
    mime,
    async addFrame() {
      if (finished) throw new Error('Recorder already finished.')
      // Caller has already drawn this frame onto the canvas.
      track.requestFrame?.()
      // Pace so each requested frame is registered as a distinct sample.
      await new Promise(r => setTimeout(r, 1000 / fps))
    },
    async finish() {
      if (finished) throw new Error('Recorder already finished.')
      finished = true
      rec.stop()
      await stopped
      return new Blob(chunks, { type: mime })
    },
    abort() {
      if (finished) return
      finished = true
      try { rec.stop() } catch { /* already stopped */ }
    },
  }
}
