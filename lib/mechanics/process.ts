// Processing orchestrator — the full capture → report-inputs pipeline in one call.
//
//   C3D buffer → canonical joints → throw windows → per-throw events + metrics →
//   session medians → percentiles → flags
//
// Used by the ingest route (raw upload) and reusable anywhere a CanonicalCapture is
// already in hand (e.g. synthetic-data seeding, tests).

import { parseC3D } from './c3d'
import { mapCapturyToCanonical, unmappedJoints } from './captureSchema'
import { segmentThrows, detectEvents, type Hand, type UpAxis } from './events'
import { extractThrowMetrics, aggregateSession } from './metrics'
import { rankSession } from './percentile'
import { computeFlags } from './flags'
import type {
  AthleteLevel, CanonicalCapture, Flag, MetricBuckets, MetricPercentile, ThrowMetrics,
} from './types'

export interface ProcessOptions {
  hand: Hand
  level: AthleteLevel
  upAxis?: UpAxis
  heightMm?: number
  /** exclude throws below this event confidence from the session median */
  minConfidence?: number
}

export interface ProcessedCapture {
  frameRate: number
  frameCount: number
  throws: ThrowMetrics[]
  sessionMetrics: MetricBuckets
  percentiles: MetricPercentile[]
  flags: Flag[]
  qc: { unmappedJoints: string[]; throwsDetected: number; throwsUsed: number }
}

/** Run the pipeline over an already-canonical capture. */
export function processCanonical(cap: CanonicalCapture, opts: ProcessOptions): ProcessedCapture {
  const minConf = opts.minConfidence ?? 0.5
  const windows = segmentThrows(cap, opts.hand)

  const throws: ThrowMetrics[] = windows.map(w => {
    const events = detectEvents(cap, w, opts.hand, opts.upAxis)
    const tm = extractThrowMetrics(cap, events, { hand: opts.hand, upAxis: opts.upAxis, heightMm: opts.heightMm })
    tm.throwNo = w.throwNo
    return tm
  })

  const used = throws.filter(t => t.events.confidence >= minConf && !t.qcFlags.includes('missing_lower_body'))
  const pool = used.length ? used : throws  // never end up with zero
  const sessionMetrics = aggregateSession(pool)
  const percentiles = rankSession(sessionMetrics, opts.level)
  const flags = computeFlags(percentiles)

  return {
    frameRate: cap.frameRate,
    frameCount: cap.frameCount,
    throws,
    sessionMetrics,
    percentiles,
    flags,
    qc: { unmappedJoints: [], throwsDetected: windows.length, throwsUsed: pool.length },
  }
}

/** Parse a raw C3D buffer and run the full pipeline. */
export function processC3D(buf: ArrayBuffer, opts: ProcessOptions): ProcessedCapture {
  const c3d = parseC3D(buf)
  const cap = mapCapturyToCanonical(c3d)
  const result = processCanonical(cap, opts)
  result.qc.unmappedJoints = unmappedJoints(c3d)
  return result
}
