// Unified frame-fed recorder interface + chooser.
//
// The caller draws each composited frame onto a bound canvas, then calls
// addFrame(index). Preferred path is real mp4 via WebCodecs (Chromium); where
// that's missing we fall back to WebM via MediaRecorder so export still works
// everywhere. The recorder reports which container it produced via `ext`, so
// callers name the download correctly.

export interface RecorderOptions {
  fps?: number
  bitrate?: number
}

export interface FrameRecorder {
  addFrame(index: number): Promise<void>
  finish(): Promise<Blob>
  abort(): void
  readonly ext: 'mp4' | 'webm'
  readonly mime: string
}

import { createMp4Recorder, webCodecsSupported } from './mp4Recorder'
import { createWebmRecorder, mediaRecorderSupported } from './webmRecorder'

export { webCodecsSupported, downloadBlob } from './mp4Recorder'

// True if the browser can export at all (mp4 or, failing that, WebM).
export function canExportVideo(): boolean {
  return webCodecsSupported() || mediaRecorderSupported()
}

// The container the browser will actually produce, for UI copy.
export function exportFormat(): 'mp4' | 'webm' | 'none' {
  if (webCodecsSupported()) return 'mp4'
  if (mediaRecorderSupported()) return 'webm'
  return 'none'
}

export async function createRecorder(
  canvas: HTMLCanvasElement,
  opts: RecorderOptions = {},
): Promise<FrameRecorder> {
  if (webCodecsSupported()) return createMp4Recorder(canvas, opts)
  return createWebmRecorder(canvas, opts)
}
