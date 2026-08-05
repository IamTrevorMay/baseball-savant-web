import { readFileSync } from 'node:fs'
import { parseC3D } from '../../lib/mechanics/c3d'
import { mapCapturyToCanonical } from '../../lib/mechanics/captureSchema'
import { segmentThrows, detectEvents } from '../../lib/mechanics/events'
import { extractThrowMetrics } from '../../lib/mechanics/metrics'

const file = process.argv[2]
const b = readFileSync(file)
const c3d = parseC3D(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
const cap = mapCapturyToCanonical(c3d)
const wins = segmentThrows(cap, 'R')
console.log(`${file}\nframes ${cap.frameCount}  windows ${wins.length}\n`)
console.log(' # start   end    fc   mer   rel  conf | elbExtV  irVel  trunkAV pelvAV  hss  gap')
for (const w of wins) {
  const ev = detectEvents(cap, w, 'R', 'z')
  const m = extractThrowMetrics(cap, ev, { hand: 'R', heightMm: 77 * 25.4 }).metrics
  console.log(
    String(w.throwNo).padStart(2), String(w.startFrame).padStart(6), String(w.endFrame).padStart(5),
    String(ev.footContact).padStart(5), String(ev.maxExternalRotation).padStart(5), String(ev.release).padStart(5),
    ev.confidence.toFixed(2).padStart(5), '|',
    m.velocities.elbowExtVelocity.toFixed(0).padStart(7),
    m.velocities.shoulderIrVelocity.toFixed(0).padStart(6),
    m.velocities.trunkAngVel.toFixed(0).padStart(8),
    m.velocities.pelvisAngVel.toFixed(0).padStart(6),
    m.hipShoulderSep.maxSeparation.toFixed(0).padStart(4),
    m.sequencing.pelvisToTrunkGap.toFixed(3).padStart(6),
  )
}
