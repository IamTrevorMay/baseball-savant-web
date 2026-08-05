// Minimal C3D writer — the mirror of lib/mechanics/c3d.ts.
//
// Emits what Captury/OptiTrack exports look like on the happy path: Intel
// (little-endian) processor, IEEE-float 3D point data, POINT:LABELS carrying
// MotionBuilder/HIK joint names. Files written here are real C3D and open in
// Mokka/ezc3d, not a private format the parser happens to accept.
//
// Layout: [header block][parameter section][3D point data], all 512-byte blocks.

export interface C3DWriteInput {
  frameRate: number
  labels: string[]
  /** labels[i] → per-frame [x, y, z] in mm */
  trajectories: Array<Array<readonly [number, number, number]>>
}

const BLOCK = 512
const LABEL_WIDTH = 20

// ── parameter-section entry encoding ───────────────────────────────────────────
// Group:     [int8 -len][int8 -id][name][int16 next][uint8 descLen][desc]
// Parameter: [int8  len][int8  id][name][int16 next][int8 dtype][uint8 ndims][dims][data][uint8 descLen][desc]
// `next` is the byte distance from the int16 itself to the following entry — which is
// exactly how the reader walks it (`off = afterName + nextOffset`).

const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0) & 0xff)

function groupEntry(id: number, name: string, desc: string): number[] {
  const body = [...ascii(desc)]
  const tail = [desc.length, ...body]
  const head = [-name.length & 0xff, -id & 0xff, ...ascii(name)]
  const next = 2 + tail.length
  return [...head, next & 0xff, (next >> 8) & 0xff, ...tail]
}

function paramEntry(groupId: number, name: string, dtype: number, dims: number[], data: number[]): number[] {
  const tail = [dtype & 0xff, dims.length, ...dims, ...data, 0 /* no description */]
  const head = [name.length, groupId, ...ascii(name)]
  const next = 2 + tail.length
  return [...head, next & 0xff, (next >> 8) & 0xff, ...tail]
}

const f32bytes = (v: number) => {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setFloat32(0, v, true)
  return Array.from(b)
}
const i16bytes = (v: number) => [v & 0xff, (v >> 8) & 0xff]

export function writeC3D(input: C3DWriteInput): Buffer {
  const { frameRate, labels, trajectories } = input
  const pointCount = labels.length
  const frameCount = trajectories[0]?.length ?? 0
  if (trajectories.some(t => t.length !== frameCount)) {
    throw new Error('every trajectory must have the same frame count')
  }
  if (frameCount > 65535) throw new Error(`frameCount ${frameCount} exceeds the 16-bit header field`)

  // ── parameter section ──
  const labelChars: number[] = []
  for (const l of labels) {
    const padded = l.length >= LABEL_WIDTH ? l.slice(0, LABEL_WIDTH) : l.padEnd(LABEL_WIDTH, ' ')
    labelChars.push(...ascii(padded))
  }

  const params: number[] = [
    ...groupEntry(1, 'POINT', '3D point parameters'),
    ...paramEntry(1, 'USED', 2, [], i16bytes(pointCount)),
    ...paramEntry(1, 'FRAMES', 2, [], i16bytes(frameCount)),
    ...paramEntry(1, 'RATE', 4, [], f32bytes(frameRate)),
    ...paramEntry(1, 'SCALE', 4, [], f32bytes(-1)),        // negative ⇒ float storage
    ...paramEntry(1, 'UNITS', -1, [2, 1], ascii('mm')),
    ...paramEntry(1, 'LABELS', -1, [LABEL_WIDTH, pointCount], labelChars),
    ...groupEntry(2, 'ANALOG', 'analog parameters'),
    ...paramEntry(2, 'USED', 2, [], i16bytes(0)),
  ]
  // POINT:DATA_START can only be filled in once the parameter section's own length is
  // known (adding it can itself push the section over a block boundary), so reserve the
  // entry now and patch the value in below. Value sits after
  // [nameLen][groupId][name][next:2][dtype][ndims] — dims is empty for a scalar.
  const DATA_START = 'DATA_START'
  const dataStartValueOffset = 4 + params.length + 2 + DATA_START.length + 2 + 1 + 1
  params.push(...paramEntry(1, DATA_START, 2, [], i16bytes(0)))

  // +4 leaves room for the end-of-parameters sentinel written below.
  const paramBlocks = Math.ceil((4 + params.length + 4) / BLOCK)
  const paramSection = Buffer.alloc(paramBlocks * BLOCK)
  paramSection[0] = 1          // reserved
  paramSection[1] = 0x50       // reserved
  paramSection[2] = paramBlocks
  paramSection[3] = 84         // processor type: Intel
  Buffer.from(params).copy(paramSection, 4)
  // explicit end-of-parameters sentinel (nameLen = 0, groupId = 0)
  paramSection[4 + params.length] = 0
  paramSection[5 + params.length] = 0

  const dataBlock = 1 + paramBlocks + 1   // 1-indexed: header block + parameter blocks
  paramSection.writeUInt16LE(dataBlock, dataStartValueOffset)

  // ── header ──
  const header = Buffer.alloc(BLOCK)
  header[0] = 2                // parameter section starts at block 2
  header[1] = 0x50             // magic
  header.writeUInt16LE(pointCount, 2)
  header.writeUInt16LE(0, 4)                    // analog measurements per frame
  header.writeUInt16LE(1, 6)                    // first frame
  header.writeUInt16LE(frameCount, 8)           // last frame
  header.writeUInt16LE(10, 10)                  // max interpolation gap
  header.writeFloatLE(-1, 12)                   // scale < 0 ⇒ float point data
  header.writeUInt16LE(dataBlock, 16)
  header.writeUInt16LE(0, 18)                   // analog samples per frame
  header.writeFloatLE(frameRate, 20)

  // ── 3D point data: x, y, z, residual per point per frame ──
  const data = Buffer.alloc(frameCount * pointCount * 4 * 4)
  let o = 0
  for (let f = 0; f < frameCount; f++) {
    for (let p = 0; p < pointCount; p++) {
      const s = trajectories[p][f]
      data.writeFloatLE(s[0], o); data.writeFloatLE(s[1], o + 4); data.writeFloatLE(s[2], o + 8)
      data.writeFloatLE(0, o + 12)   // residual ≥ 0 ⇒ valid sample
      o += 16
    }
  }

  const pad = Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK)
  return Buffer.concat([header, paramSection, data, pad])
}
