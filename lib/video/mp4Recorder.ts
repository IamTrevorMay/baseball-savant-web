// Frame-fed H.264 → mp4 recorder, browser-only, no server and no ffmpeg.wasm.
//
// Bound to a single canvas: the caller draws each composited frame onto that
// canvas, then calls addFrame(index). We snapshot it into a WebCodecs
// VideoFrame, encode, and mux to a real .mp4 with mp4-muxer. Because frames are
// fed explicitly (not captured on wall-clock), output duration/fps are exact —
// slow-mo export = the caller feeding each source frame at several indexes.
//
// Requires WebCodecs (Chromium + secure context). See recorder.ts for the
// chooser that falls back to WebM where WebCodecs is missing.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import type { FrameRecorder, RecorderOptions } from './recorder'

export function webCodecsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder === 'function' &&
    typeof window.VideoFrame === 'function'
  )
}

// H.264 codec strings to try, most-capable first. Level is picked by the
// browser during isConfigSupported; we just need one it accepts.
const AVC_CANDIDATES = [
  'avc1.640034', 'avc1.640028', 'avc1.4D0028', 'avc1.42E028', 'avc1.42E01F',
]

async function pickCodec(cfgBase: {
  width: number; height: number; framerate: number; bitrate: number
}): Promise<string> {
  for (const codec of AVC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, ...cfgBase })
      if (supported) return codec
    } catch { /* try next */ }
  }
  return AVC_CANDIDATES[AVC_CANDIDATES.length - 1]
}

export async function createMp4Recorder(
  canvas: HTMLCanvasElement,
  opts: RecorderOptions = {},
): Promise<FrameRecorder> {
  if (!webCodecsSupported()) {
    throw new Error('Video export needs a Chromium browser (Chrome or Edge).')
  }

  const fps = opts.fps ?? 30
  const bitrate = opts.bitrate ?? 8_000_000
  const width = canvas.width
  const height = canvas.height
  if (width % 2 || height % 2) {
    throw new Error('mp4 export canvas must have even dimensions.')
  }

  const codec = await pickCodec({ width, height, framerate: fps, bitrate })
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
  })

  let encodeError: DOMException | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encodeError = e },
  })
  encoder.configure({ codec, width, height, framerate: fps, bitrate })

  const frameDurUs = Math.round(1_000_000 / fps)
  const keyEvery = Math.max(1, fps * 2)
  let finished = false

  async function drainTo(maxQueue: number) {
    while (encoder.encodeQueueSize > maxQueue) {
      if (encodeError) throw encodeError
      await new Promise(r => setTimeout(r, 4))
    }
  }

  return {
    ext: 'mp4',
    mime: 'video/mp4',
    async addFrame(index: number) {
      if (finished) throw new Error('Recorder already finished.')
      if (encodeError) throw encodeError
      await drainTo(12)
      const frame = new VideoFrame(canvas, { timestamp: index * frameDurUs, duration: frameDurUs })
      try {
        encoder.encode(frame, { keyFrame: index % keyEvery === 0 })
      } finally {
        frame.close()
      }
    },
    async finish() {
      if (finished) throw new Error('Recorder already finished.')
      finished = true
      await encoder.flush()
      if (encodeError) throw encodeError
      muxer.finalize()
      encoder.close()
      return new Blob([target.buffer], { type: 'video/mp4' })
    },
    abort() {
      if (finished) return
      finished = true
      try { encoder.close() } catch { /* already closed */ }
    },
  }
}

// Trigger a browser download for a produced blob.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
