// Frame-fed H.264 → mp4 recorder, browser-only, no server and no ffmpeg.wasm.
//
// Drives a WebCodecs VideoEncoder one composited canvas frame at a time and
// muxes the encoded chunks into a real .mp4 with mp4-muxer. Because we feed
// frames explicitly (rather than capturing wall-clock via MediaRecorder), the
// output duration and fps are exact — the caller decides how many output
// frames each source frame occupies (that's how slow-mo export works).
//
// Requires WebCodecs (Chromium + secure context). Use webCodecsSupported()
// before offering export; a fallback (ffmpeg.wasm) is a later phase.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

export function webCodecsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder === 'function' &&
    typeof window.VideoFrame === 'function'
  )
}

export interface Mp4RecorderOptions {
  width: number
  height: number
  fps?: number
  bitrate?: number
}

export interface Mp4Recorder {
  /** Encode one frame from a canvas at output-frame position `index`. */
  addFrame(source: CanvasImageSource, index: number): Promise<void>
  /** Flush the encoder, finalize the mp4, and return the blob. */
  finish(): Promise<Blob>
  /** Abort without producing a file (frees encoder resources). */
  abort(): void
  readonly width: number
  readonly height: number
  readonly fps: number
}

// H.264 codec strings to try, most-capable first. Level is picked by the
// browser during isConfigSupported; we just need one the encoder accepts for
// these dimensions. High → Main → Baseline.
const AVC_CANDIDATES = [
  'avc1.640034', // High L5.2
  'avc1.640028', // High L4.0
  'avc1.4D0028', // Main L4.0
  'avc1.42E028', // Baseline L4.0
  'avc1.42E01F', // Baseline L3.1
]

async function pickCodec(cfgBase: {
  width: number
  height: number
  framerate: number
  bitrate: number
}): Promise<string> {
  for (const codec of AVC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, ...cfgBase })
      if (supported) return codec
    } catch {
      /* try next */
    }
  }
  // Last resort — let configure() throw a descriptive error if this fails too.
  return AVC_CANDIDATES[AVC_CANDIDATES.length - 1]
}

export async function createMp4Recorder(opts: Mp4RecorderOptions): Promise<Mp4Recorder> {
  if (!webCodecsSupported()) {
    throw new Error('Video export needs a Chromium browser (Chrome or Edge).')
  }

  const fps = opts.fps ?? 30
  const bitrate = opts.bitrate ?? 8_000_000
  // H.264 requires even dimensions.
  const width = Math.max(2, Math.floor(opts.width / 2) * 2)
  const height = Math.max(2, Math.floor(opts.height / 2) * 2)

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
  const keyEvery = Math.max(1, fps * 2) // keyframe every ~2s
  let finished = false

  async function drainTo(maxQueue: number) {
    // Bound memory: let the encoder catch up before queuing more frames.
    while (encoder.encodeQueueSize > maxQueue) {
      if (encodeError) throw encodeError
      await new Promise(r => setTimeout(r, 4))
    }
  }

  return {
    width,
    height,
    fps,
    async addFrame(source, index) {
      if (finished) throw new Error('Recorder already finished.')
      if (encodeError) throw encodeError
      await drainTo(12)
      const frame = new VideoFrame(source, {
        timestamp: index * frameDurUs,
        duration: frameDurUs,
      })
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
