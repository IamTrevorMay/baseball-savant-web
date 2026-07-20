// Minimal C3D reader for Captury/OptiTrack exports.
//
// C3D is a documented binary spec (Motion Lab Systems). This reader targets the
// common case Captury emits: Intel (little-endian) processor, 3D point section with
// either IEEE float or scaled-int storage. It extracts per-marker trajectories keyed
// by the POINT:LABELS parameter, which is all the metric engine needs.
//
// Not a full implementation — analog channels, DEC/MIPS float formats, and event
// parameters are intentionally skipped. If a file fails here, the ingest route falls
// back to Captury's CSV-curves export (see parseCsvCurves).

export interface C3DResult {
  frameRate: number
  firstFrame: number
  lastFrame: number
  frameCount: number
  pointCount: number
  labels: string[]
  /** labels[i] → per-frame [x,y,z] in mm (null when residual < 0 = invalid). */
  trajectories: (readonly [number, number, number] | null)[][]
}

// ── little-endian primitives ──
function u16(dv: DataView, off: number) { return dv.getUint16(off, true) }
function i16(dv: DataView, off: number) { return dv.getInt16(off, true) }
function f32(dv: DataView, off: number) { return dv.getFloat32(off, true) }

/**
 * Parse a C3D file buffer into marker trajectories.
 * @throws if the magic byte is wrong or the processor type is unsupported.
 */
export function parseC3D(buf: ArrayBuffer): C3DResult {
  const dv = new DataView(buf)

  // ── Header (512-byte block, 16-bit words) ──
  const paramBlock = dv.getUint8(0)            // first block of parameter section
  const magic = dv.getUint8(1)
  if (magic !== 0x50) throw new Error('Not a C3D file (missing 0x50 magic)')

  const pointCount = u16(dv, 2)                // NPOINTS (word 2)
  const analogPerFrame = u16(dv, 4)            // word 3
  const firstFrame = u16(dv, 6)                // word 4
  const lastFrame = u16(dv, 8)                 // word 5
  const scale = f32(dv, 12)                    // word 7–8: <0 → float storage
  const dataBlock = u16(dv, 16)                // word 9: DATA_START block (1-indexed)
  const analogSamplesPerFrame = u16(dv, 18)    // word 10
  const frameRate = f32(dv, 20)                // word 11–12

  const isFloat = scale < 0
  const pointScale = Math.abs(scale)

  // ── Processor type (parameter section, block header byte 4) ──
  const paramStart = (paramBlock - 1) * 512
  const proc = dv.getUint8(paramStart + 3)     // 84=Intel, 85=DEC, 86=MIPS
  if (proc !== 84) {
    throw new Error(`Unsupported C3D processor type ${proc} (only Intel/84 supported)`)
  }

  // ── POINT:LABELS from the parameter section ──
  const labels = readPointLabels(dv, paramStart, pointCount)

  // ── 3D point data ──
  const frameCount = lastFrame - firstFrame + 1
  const dataStart = (dataBlock - 1) * 512
  const trajectories: (readonly [number, number, number] | null)[][] =
    Array.from({ length: pointCount }, () => [])

  // words per frame: points × 4 (X,Y,Z,residual) + analog block, in float or int16
  const wordBytes = isFloat ? 4 : 2
  const pointStride = pointCount * 4 * wordBytes
  const analogStride = analogPerFrame * analogSamplesPerFrame * wordBytes
  const frameStride = pointStride + analogStride

  for (let f = 0; f < frameCount; f++) {
    const frameOff = dataStart + f * frameStride
    for (let p = 0; p < pointCount; p++) {
      const off = frameOff + p * 4 * wordBytes
      let x: number, y: number, z: number, residual: number
      if (isFloat) {
        x = f32(dv, off); y = f32(dv, off + 4); z = f32(dv, off + 8); residual = f32(dv, off + 12)
      } else {
        x = i16(dv, off) * pointScale
        y = i16(dv, off + 2) * pointScale
        z = i16(dv, off + 4) * pointScale
        residual = i16(dv, off + 6)
      }
      // negative residual = invalid/occluded sample
      trajectories[p].push(residual < 0 ? null : [x, y, z] as const)
    }
  }

  return {
    frameRate: frameRate || 240,
    firstFrame, lastFrame, frameCount, pointCount,
    labels,
    trajectories,
  }
}

/**
 * Walk the parameter section groups/params to pull POINT:LABELS (character array).
 * Returns synthesized names ("M1"…) if the parameter is absent.
 */
function readPointLabels(dv: DataView, paramStart: number, pointCount: number): string[] {
  const fallback = Array.from({ length: pointCount }, (_, i) => `M${i + 1}`)
  try {
    // Parameter section: byte 3 of the block header = number of parameter blocks.
    let off = paramStart + 4  // skip 4-byte block header
    const end = paramStart + 512 * 10  // cap the walk defensively

    while (off < end) {
      const nameLen = dv.getInt8(off)          // <0 = locked, magnitude = name length
      const groupId = dv.getInt8(off + 1)      // <0 = group, >0 = parameter (group id)
      if (nameLen === 0 && groupId === 0) break
      const absLen = Math.abs(nameLen)
      const nameBytes: number[] = []
      for (let i = 0; i < absLen; i++) nameBytes.push(dv.getUint8(off + 2 + i))
      const name = String.fromCharCode(...nameBytes).toUpperCase()
      const afterName = off + 2 + absLen
      const nextOffset = u16(dv, afterName)     // bytes to next group/param entry
      const dataOff = afterName + 2

      if (groupId > 0 && name === 'LABELS') {
        // parameter data: [dtype:int8][ndims:uint8][dims...][data]
        const ndims = dv.getUint8(dataOff + 1)
        let d = dataOff + 2
        const dims: number[] = []
        for (let i = 0; i < ndims; i++) dims.push(dv.getUint8(d + i))
        d += ndims
        const strLen = dims[0] || 0
        const nStr = dims[1] || 0
        const labels: string[] = []
        for (let s = 0; s < nStr; s++) {
          const chars: number[] = []
          for (let c = 0; c < strLen; c++) chars.push(dv.getUint8(d + s * strLen + c))
          labels.push(String.fromCharCode(...chars).trim())
        }
        if (labels.length) return labels
      }

      if (nextOffset <= 0) break
      off = afterName + nextOffset
    }
  } catch {
    // malformed parameter section — fall back to synthetic names
  }
  return fallback
}

// ── CSV-curves fallback ──────────────────────────────────────────────────────
// Captury's chart-panel CSV: first column = frame/time, remaining columns = named
// joint-angle or position curves. This is the escape hatch when C3D parsing fails.

export interface CsvCurves {
  frameRate: number
  frameCount: number
  columns: string[]
  /** column name → per-frame value */
  curves: Record<string, number[]>
}

export function parseCsvCurves(text: string, frameRate = 240): CsvCurves {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return { frameRate, frameCount: 0, columns: [], curves: {} }
  const header = lines[0].split(',').map(h => h.trim())
  const curves: Record<string, number[]> = {}
  header.forEach(h => { curves[h] = [] })
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    header.forEach((h, c) => {
      const v = parseFloat(cells[c])
      curves[h].push(Number.isFinite(v) ? v : NaN)
    })
  }
  return { frameRate, frameCount: lines.length - 1, columns: header, curves }
}
