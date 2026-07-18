# Videos — Telestrator & Pitch Overlay (design)

Two new tools bolted onto the existing **Videos** page (`app/(research)/videos/page.tsx`).
Both operate on the same pitch clips the page already resolves: archived Mayday
NAS streams (`video_url`) or on-demand Savant CDN mp4s (`savant_mp4_url`).

Decisions locked with Trevor (2026-07-17):

| Question | Decision |
|---|---|
| Session goal | **Plan doc first** (this file), build after review |
| Telestrator "save" output | **Burned mp4/webm clip** (downloadable video, drawings composited in) |
| Overlay time-alignment | **Auto release-frame detect** (in-browser, manual nudge fallback) |
| "Make pitcher/ball visible" processing | **Browser blend + adjust** (opacity / blend modes / brightness-contrast / crop), no server |
| Export container | **.mp4 (H.264)** required (.mov acceptable but no reason to prefer). Browser-only via WebCodecs + mp4-muxer, §0.2 |

---

## 0. Shared foundation — the compositor + recorder

Both tools reduce to the same primitive: *draw one or more video frames plus
some overlay onto an offscreen `<canvas>`, every animation frame, and optionally
record that canvas to a downloadable file.* Build it once.

### 0.1 Clips must load as blob URLs (CORS / canvas-taint)

Drawing a **cross-origin** video into a canvas taints it, which kills
`canvas.captureStream()` and `toDataURL()` — i.e. no export. Both NAS and Savant
URLs are cross-origin.

Fix: never point a `<video>` (that we intend to capture) at the remote URL
directly. Fetch the clip **bytes** first, wrap in a `blob:` object URL, and feed
that to the video element. `blob:` is same-origin → canvas stays clean → export
works. The page already has the fetch-to-bytes path:
`fetchClipBytes(row)` (`page.tsx:518`) and `getPlayableUrl(row)` (`page.tsx:476`).
Factor a small `loadClipObjectURL(row): Promise<string>` helper that both tools
use.

### 0.2 Recorder — WebCodecs → mp4 (browser-only)

Export **must be `.mp4` (H.264)**. `MediaRecorder` (the `exportPitchVideo.ts`
`exportWebM` path) can only emit WebM, so it can't be reused for the container.
Instead encode canvas frames directly with **WebCodecs `VideoEncoder`** and mux
to fragmented mp4 with the **`mp4-muxer`** package. Real `.mp4`, H.264,
hardware-accelerated, no 30 MB `ffmpeg.wasm`, no server.

Sketch (`lib/video/mp4Recorder.ts`):
```ts
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
// muxer: avc, width/height from canvas, fps
const encoder = new VideoEncoder({
  output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  error: e => …,
})
encoder.configure({ codec: 'avc1.640028', width, height, framerate: fps,
                    bitrate: 8_000_000 })
// per composited frame f at time t:
const frame = new VideoFrame(canvas, { timestamp: (f * 1e6) / fps })
encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 })
frame.close()
// finish:
await encoder.flush(); muxer.finalize()
new Blob([target.buffer], { type: 'video/mp4' })
```

Why this shape:
- **Frame-fed, deterministic.** We drive the encoder one composited frame at a
  time, so export duration/fps are exact — no wall-clock capture, no slow-mo
  race. The earlier "real-time vs frame-stepped" split disappears: always
  frame-stepped, but fast (no `<video>` re-seeking; we render the compositor at
  each output timestamp). Slow-mo export = just lay the same source frames down
  at more output frames.
- **No audio.** WebCodecs video only; telestration/overlay clips silent by
  design. Note in UI.
- **Secure context + browser.** WebCodecs needs https (Vercel ✓) and
  Chromium (Chrome/Edge ✓ — the team's browsers, same as OBS/broadcast stack).
  Safari/Firefox coverage is partial.

**Fallback** if `window.VideoEncoder` is undefined: transcode via `ffmpeg.wasm`
(render → WebM through `MediaRecorder` → wasm remux to mp4). Heavier (~30 MB
lazy-loaded, slower) but keeps it browser-only and still yields `.mp4`. Detect
at runtime; prefer WebCodecs. If neither is available, disable export with a
"use Chrome/Edge to export" note rather than silently shipping WebM.

New module: `lib/video/mp4Recorder.ts` — `createRecorder({ width, height, fps })`
→ `{ addFrame(canvas, index), finish(): Promise<Blob> }`. Both tools share it.
Add dep: `mp4-muxer` (and lazy `@ffmpeg/ffmpeg` for the fallback).

### 0.3 Filenames

Reuse `clipFilename(row)` (`page.tsx:150`), keep the `.mp4` extension:
`[Pitcher] to [Hitter] [Pitch] [Count] [Outcome] (telestrated).mp4`
and `… (overlay).mp4`.

---

## 1. Telestrator

Mark up a pitch clip with drawings and export a burned-in video.

### 1.1 UX

Add a **"Telestrate"** action to a clip — a button in the review modal
(`page.tsx:1084`) and a per-row action. Opens a full-width telestrator view
(new component, not the tiny modal).

Layout:
- Center: the video with a transparent drawing `<canvas>` layered exactly on
  top (same box, `position:absolute`, pointer events on the canvas).
- Bottom: transport (reuse the `PlaylistPlayer` chrome — play/pause, frame-step
  ‹｜ ｜›, speed ¼×/½×/1×/2×, scrubber).
- Left or top toolbar: drawing tools.

### 1.2 Drawing tools (v1)

- **Freehand pen**
- **Straight line**
- **Arrow** (line + arrowhead) — the workhorse for showing movement/direction
- **Ellipse / circle** (highlight a location, e.g. glove-side miss)
- **Spotlight** — dim everything except a dragged circle/ellipse (dark overlay
  with a "hole"); great for isolating the ball or release
- **Text label**
- Per-tool **color** (8 swatches) + **stroke width** (S/M/L)
- **Undo / redo**, **Clear**
- **Eraser** (v2)

### 1.3 Annotation model — two modes

Drawings can be either:
- **Static** — always visible for the whole clip (default; simplest, matches a
  freeze-frame telestration feel), or
- **Timed** — each stroke has `[tStart, tEnd]` and only renders while the
  playhead is in range. Enables "draw an arrow that appears exactly when the
  ball breaks."

v1 ships **static** (a global on/off + a "freeze frame" toggle that pauses
playback while drawing). Timed strokes are v2 — the data model should carry
optional `tStart/tEnd` from day one so v2 is additive.

```ts
type Stroke =
  | { kind: 'pen'; pts: [number, number][]; color: string; width: number; tStart?: number; tEnd?: number }
  | { kind: 'line' | 'arrow'; a: [number, number]; b: [number, number]; color; width; tStart?; tEnd? }
  | { kind: 'ellipse'; c: [number, number]; rx: number; ry: number; color; width; tStart?; tEnd? }
  | { kind: 'spotlight'; c: [number, number]; rx: number; ry: number; dim: number; tStart?; tEnd? }
  | { kind: 'text'; at: [number, number]; text: string; color; size: number; tStart?; tEnd? }
```

Coordinates stored **normalized** (0–1 of video box) so they survive resize and
map cleanly onto the export canvas at native resolution.

### 1.4 Render loop

`requestAnimationFrame` loop while the view is open:
1. `ctx.drawImage(videoEl, 0, 0, w, h)` — current video frame.
2. For each visible stroke, draw it (scaled from normalized coords).
3. That same canvas is what the recorder captures.

Two canvases in the DOM:
- an **interaction canvas** over the live `<video>` for authoring (only draws
  strokes, video shows through), and
- an **export canvas** (offscreen or hidden) that draws *video + strokes*, used
  only during record.

Or one canvas that always composites both — simpler, and lets the user preview
exactly the burned result. Prefer the single-composite canvas; the `<video>`
element itself is `visibility:hidden` (still decodes frames).

### 1.5 Export flow

1. User clicks **Export clip**.
2. Choose export speed (1× / ½× / ¼×) — ½× is the popular "analysis" export.
   Speed = how many output frames each source frame occupies (deterministic;
   §0.2), not wall-clock capture.
3. `createRecorder({ width, height, fps: 30 })`; walk the clip start→end, render
   the compositor at each output timestamp, `addFrame(canvas, i)`.
4. `finish()` → mp4 Blob → download with `(telestrated).mp4` name.
5. Progress UI (encoding… frame i / total).

Also offer **Export frame (PNG)** — cheap freebie: `canvas.toBlob()` of the
current composited frame. Not the primary ask but nearly free once the canvas
exists.

### 1.6 Persistence (optional, v2)

Save the `Stroke[]` + `row_key` to a `pitch_telestrations` table (RLS
owner-only, mirrors `pitch_playlists`) so a markup can be reopened/re-edited.
Not required for v1 (export-and-done).

### 1.7 New files

- `components/videos/Telestrator.tsx` — the view + toolbar + canvas.
- `lib/video/strokes.ts` — `Stroke` types + draw functions (`drawStroke(ctx, s, w, h)`).
- `lib/video/canvasRecorder.ts` — shared recorder (§0.2).
- `lib/video/loadClip.ts` — `loadClipObjectURL(row)` (§0.1).
- Wire a "Telestrate" button into `page.tsx` (modal + row).

---

## 2. Pitch Overlay

Stack two clips to compare movement / release / deception.

### 2.1 UX

- New **"Overlay"** view alongside `search` / `playlist` in the header toggle
  (`page.tsx:795`).
- Pick **Clip A** and **Clip B** — either from the current search selection
  (2 selected rows → "Overlay these"), from a playlist, or via mini-search.
- Center: one canvas showing both clips composited.
- Controls:
  - **Opacity** of the top clip (0–100).
  - **Blend mode**: `normal` / `screen` / `lighten` / `difference` /
    `multiply`. `screen`/`lighten` make bright objects (ball, lit jersey) from
    the top clip punch through dark background; `difference` highlights whatever
    *moved* between the two — good for showing divergent ball paths.
  - Per-clip **brightness / contrast** and **tint** (helps the two clips read as
    two colors, e.g. A warm / B cool).
  - Per-clip **transform**: scale, x/y offset, optional crop — manual
    registration so the two mounds/rubbers line up (camera angles differ).
  - **Swap A/B**, **solo A / solo B** toggles.

### 2.2 Time alignment — auto release-frame detect (in-browser)

Absolute release detection on broadcast footage is unreliable. Instead align by
**relative motion**, which is robust and pure-browser:

1. For each clip, walk frames at a coarse step (e.g. every ~1/15 s), draw each
   to a tiny scratch canvas (say 64×36), read pixels, compute **motion energy** =
   mean absolute pixel difference vs the previous sampled frame. Result: a 1-D
   `energy[t]` curve per clip. The pitching delivery is a big hump.
2. **Cross-correlate** the two energy curves to find the lag `Δ` that best
   aligns the deliveries (argmax of normalized correlation). That `Δ` is the
   start-offset between clip A and clip B.
3. Apply `Δ`: when the playhead is at `t` in A, B plays at `t − Δ` (clamped).
4. **Manual nudge**: a ± slider (in frames, 1/30 s) so the user can fine-tune,
   plus a "sync to current frames" button (freeze both on the visually-matched
   frame, set `Δ` from that). Auto is the starting guess, never the final word.

This runs once, up front, off the two `blob:` clips (already decoded for
compositing). It's a few hundred `drawImage`+`getImageData` calls — fast enough
to do on load with a small "aligning…" spinner. If it misfires the user nudges;
if clips are wildly different lengths/angles the correlation confidence is low →
fall back to Δ=0 and tell the user to align manually.

Precomputing `energy[]` also gives us a free **"jump to release"** button
(seek both clips to their energy peak).

### 2.3 Playback engine

- Two `<video>` elements (hidden, `blob:` sourced), one canvas.
- A single rAF loop drives both: keep B's `currentTime` at `A.currentTime − Δ`
  (nudge B if it drifts > ~1 frame — seeking every frame is too slow, so only
  correct on drift).
- Transport reuses `PlaylistPlayer` chrome: play/pause, frame-step (steps both),
  speed (½× is the default for overlay analysis), scrubber over the *A*
  timeline.
- Loop toggle (overlays are usually watched on repeat).

### 2.4 Compositing (browser blend + adjust)

Per frame, on the export/preview canvas:
```
ctx.filter = `brightness(${bA}) contrast(${cA})`
ctx.globalAlpha = 1
ctx.globalCompositeOperation = 'source-over'
drawTransformed(videoA, transformA)        // bottom clip

ctx.filter = `brightness(${bB}) contrast(${cB})`
ctx.globalAlpha = opacityB
ctx.globalCompositeOperation = blendMode   // screen / lighten / difference / …
drawTransformed(videoB, transformB)        // top clip
```
`ctx.filter` (brightness/contrast) is well supported in Chrome/Edge — fine for
this repo's stack. Tint = draw the clip, then a same-shape colored rect with
`globalCompositeOperation:'multiply'` clipped to it, or just a CSS-style hue via
an intermediate canvas (v2 refinement).

**Honest scope note:** blend + adjust is strong on **tight, relatively static**
angles (high-home, center-field lock). On **wide, panning broadcast** shots the
two backgrounds won't cancel and it'll look busy — `difference` mode + the
per-clip transform registration is the best we can do without a server
stabilization/segmentation pass. The architecture leaves a clean seam to add
that later (a processed `blob:` swapped in for the raw one), but it is **out of
scope** for this build. Set that expectation in the UI copy.

### 2.5 Export

Same recorder (§0.2). Encode the composite canvas frames → download
`… (overlay).mp4`.

### 2.6 New files

- `components/videos/PitchOverlay.tsx` — the view, clip pickers, controls, canvas.
- `lib/video/align.ts` — `motionEnergy(video)` + `crossCorrelate(a, b)` → `Δ`.
- Reuse `lib/video/canvasRecorder.ts`, `lib/video/loadClip.ts`.
- Add `'overlay'` to the view toggle in `page.tsx`.

---

## 3. Build phasing

1. **Foundation** — `loadClip.ts` (blob URLs) + `mp4Recorder.ts` (WebCodecs→mp4,
   §0.2), verified by a trivial "encode the playing clip to mp4" throwaway.
   Unblocks both tools; de-risk the encoder first since it's the newest piece.
2. **Telestrator v1** — static strokes (pen/line/arrow/ellipse/spotlight/text),
   undo/clear, PNG + WebM export. Most self-contained; ship first.
3. **Overlay v1** — two-clip compositor, manual transform + blend + opacity,
   manual Δ slider, WebM export.
4. **Overlay auto-align** — motion-energy cross-correlation + "jump to release".
5. **v2 polish** — timed strokes, telestration persistence, `ffmpeg.wasm`
   export fallback for non-Chromium browsers, (stretch) server CV pass for
   subject isolation.

## 4. Open risks

- **Export browser support.** mp4 export relies on WebCodecs (Chromium/https).
  Firefox/Safari fall back to `ffmpeg.wasm` (slower, ~30 MB) or lose export
  (§0.2). Team is on Chrome/Edge, so low risk — but non-Chromium users get a
  degraded path.
- **Broadcast camera motion** limits how clean blended overlays look (§2.4).
- **Long clips / low-end machines**: rAF compositing of two 720p videos + record
  is fine on a laptop but watch CPU; cap export resolution to the source.
- **Savant clip availability**: overlay needs both clips resolvable to bytes;
  gate the picker on `video_url || resolvable savant mp4`.
