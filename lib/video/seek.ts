// Await an exact seek on a <video>. Used by the frame-by-frame export paths
// (telestrator, overlay) where each output frame needs the source parked on a
// specific time before it's drawn to canvas.
//
// Guards two quirks: seeking to (near) the current time never fires 'seeked',
// and some browsers skip the event on sub-frame deltas — so a timeout resolves.

export function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) { resolve(); return }
    let done = false
    const finish = () => { if (done) return; done = true; v.removeEventListener('seeked', finish); resolve() }
    v.addEventListener('seeked', finish)
    try { v.currentTime = t } catch { finish(); return }
    setTimeout(finish, 800)
  })
}
