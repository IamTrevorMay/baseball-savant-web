# MEchanics — Biomechanics Lab

Captury / OptiTrack pitching capture → kinematic assessment → athlete Compete profile.
Kinematics-only v1 (kinetics/torque deferred to force plates + inverse dynamics).

> **Capturing a session at the lab?** Follow `docs/mechanics-capture-sop.md` — the operator manual
> for shooting a Captury bullpen that drops cleanly into this pipeline (export config: **C3D, Z-up,
> mm, MotionBuilder/HIK naming**; 3-phase protocol; TrackMan sync; upload + QC loop).

## Pipeline

```
Captury C3D export
   │  (server-side parse — binary + heavy)
   ▼
lib/mechanics/c3d.ts        parse C3D (Intel float/int) → marker trajectories
lib/mechanics/captureSchema.ts  Captury/BVH labels → canonical joints (JointKey)
lib/mechanics/events.ts     segment throws + detect foot-contact / MER / release
lib/mechanics/metrics.ts    six Driveline buckets per throw; session = median
lib/mechanics/percentile.ts rank vs assessment_norms (per level)
lib/mechanics/flags.ts      top 2–3 by divergence × velo-correlation → interventions
lib/mechanics/reportPayload.ts  assemble report + movement grade
lib/mechanics/pdf.ts        jsPDF archival render
   │
   ▼
compete_reports (subject_type='biomech', metadata=payload, pdf_url)
   + athlete_notifications  → shows in /compete/reports automatically
```

`lib/mechanics/process.ts` chains the whole thing: `processC3D(buf, opts)` (raw upload)
or `processCanonical(cap, opts)` (already-canonical / tests / seed).

## The six buckets (metric registry)

`lib/mechanics/norms.ts` `METRIC_DEFS` is the single source for every metric: label,
unit, direction, velocity correlation, markerless-directional flag, and the p10–p90
norm band. Change a metric here and percentile + flags + report tiles all follow.

| Bucket | Metrics | Event |
|---|---|---|
| Arm Action | shoulder abduction, scap load (horiz abd), elbow flexion | foot contact |
| Lower Body / Trunk | stride %, pelvis rotation, lead-knee flexion FC/release + ext velocity, trunk fwd/lat tilt | FC → release |
| Kinematic Velocities | pelvis / trunk / elbow-ext / shoulder-IR peak angular velocity | full throw |
| Sequencing | pelvis→trunk timing gap | full throw |
| Hip–Shoulder Separation | max separation | FC → release |
| Outcome | max external rotation (layback), rel speed | MER |

Rotational-shoulder metrics (`shoulderIrVelocity`, `maxExternalRotation`,
`horizontalAbduction`) are tagged **directional** — markerless proxies, not absolute
(see `Soto/biomechanics/07-motion-capture-technology.md`). Kinetics tile is a v1
placeholder; Captury reports no validated torque.

## Data model

- `biomech_captures` — one row per capture session (mirrors `compete_pitch_sessions`)
- `biomech_throws` — per-throw events + extracted `metrics` jsonb
- `assessment_norms` — percentile bands, metric × level (youth/hs/college/pro), seeded
  from the OpenBiomechanics stand-in in `METRIC_DEFS`
- Reports reuse `compete_reports`; PDFs in the public `biomech-reports` bucket; raw C3D
  in the private `biomech-captures` bucket.

DDL: `scripts/create-biomech-captures.sql`. RLS: admins/owners see all, athletes see
their own via `owns_athlete_profile()`.

## Capture reviewer (3D skeleton)

`components/mechanics/SkeletonViewer.tsx`, mounted on the Mechanics Lab capture-detail
page above the report preview. Admin only, dynamically imported (`ssr: false`) so
three.js stays out of the initial bundle.

The raw C3D is fetched through a 5-minute signed URL
(`GET /api/mechanics/captures/[id]/raw`) and parsed **in the browser with the same
`parseC3D` + `mapCapturyToCanonical` the ingest route runs** — so the skeleton on screen
is the geometry the metrics were computed from, not a re-interpretation. If the capture
looks wrong here, the report is wrong.

- `lib/mechanics/skeleton.ts` — bone topology, per-limb colours (throwing arm and lead
  leg are highlighted, and flip for a LHP), the measurement overlays, and `toScene()`,
  the single Z-up-mm → Y-up-metres conversion every position passes through.
- Playback never touches React state: a frame ref is advanced in `useFrame` and the
  geometry buffers are mutated in place, so scrubbing 240 fps data re-renders nothing.
- **Event snapping** — jump to foot contact / MER / release (frame numbers straight off
  `biomech_throws`), ±1-frame stepping, per-throw selector, and the detector's
  confidence badge. This is the QC loop: it is how you check the detectors fired on the
  right frames.
- **Overlays** draw the exact lines metrics.ts takes its angles from — pelvis line,
  shoulder line, trunk axis vs a vertical reference, ankle-to-ankle stride, upper arm,
  forearm. They render at full brightness only within ±3 frames of the event the metric
  is sampled at; dim means "right geometry, wrong frame".
- **Ghost** overlays an earlier session for the same athlete, aligned at *foot contact*
  rather than elapsed time, since stride durations differ between sessions.
- **Camera presets** (side / catcher / front / top) are the measurement planes. A free
  camera makes tilt and separation easy to misjudge by eye.

### Kinematic sequence chart

`components/mechanics/KinematicSequence.tsx`, below the 3D view in the same card, with
a playhead driven off the shared frame ref so the curve and the skeleton stay in sync.
Series come from `lib/mechanics/sequence.ts`, which uses the **identical** heading-rate
computation as `peakAngVel` — including each metric's own search interval
(`shoulderIrVelocity` runs MER→release, not foot-contact→release) — so a marked peak is
bit-identical to the number the report prints. Verified: hips 744.5, chest 1136.7,
forearm/hand 6271.9 all match `extractThrowMetrics` exactly.

- Four rotational segments (hips, chest, upper arm, forearm/hand) share one °/s axis —
  never two y-scales on one plot. Lead-knee extension is an order of magnitude smaller
  and gets its own band beneath, sharing the time axis.
- Bold line is smoothed (twice-applied centred moving average, ±4 frames, zero-phase);
  the faint line behind it is the raw derivative the metrics run on. The gap between them
  is the point — see finding 3.
- Peak dots are drawn **only** for series that correspond to a reported metric. The upper
  arm has none and its raw peak is ~41% noise, so it is labelled "not a report metric"
  and left unmarked rather than implying a number that does not exist.
- The header states whether peaks occur proximal → distal, which a single
  `pelvisToTrunkGap` number cannot show.
- Lead knee draws **both** quantities: the instantaneous peak, and a dashed reference at
  the mean rate the report actually prints. On the demo capture those are ~660°/s and
  221°/s — finding 1 made visible in one line.

Colours are categorical slots 1–5 (dark steps), validated on the zinc-900 chart surface:
worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3, all ≥ 3:1 contrast.

Only captures ingested through the upload route can be replayed: rows created by
`seed-mechanics-demo.ts` have `raw_file_path = null` and the viewer says so explicitly
rather than rendering an empty scene.

Parsing is on the main thread — a 4704-frame, 24-marker capture (1.8 MB) parses in a
few milliseconds. A much longer session or a 50+ marker rig would justify a Web Worker.

## Routes

- `POST /api/mechanics/upload` — admin: store raw C3D, run pipeline, persist capture + throws
- `GET  /api/mechanics/captures[?athlete_id=]` — session browser list
- `GET  /api/mechanics/captures/[id]` — capture detail + throws + latest report
- `POST /api/mechanics/report` — admin: re-aggregate → rank → flag → PDF → publish to Compete

## UI

- `app/(mechanics)/mechanics/page.tsx` — Mechanics Lab: upload, session browser, capture
  detail with **live** report preview (built client-side from stored throws via the same
  pure libs) + Generate & Publish.
- `app/(compete)/compete/reports/[id]/page.tsx` — renders `subject_type='biomech'` with
  `BiomechReport` + `BiomechTrend` (movement grade + metric across capture history).

## Captury export

Export **C3D** (canonical: biomech standard, aligns with OpenBiomechanics norms). CSV
chart-panel curves are the fallback (`parseCsvCurves`). The parser targets Intel
little-endian, float or scaled-int point data. Label mapping in `captureSchema.ts`
handles MotionBuilder/BVH naming (Hips, RightArm, RightForeArm…).

## Norm refresh

`npx tsx scripts/seed-assessment-norms.ts` emits idempotent upsert SQL from `METRIC_DEFS`.
Swap the registry's `base` bands for in-house percentiles as the capture DB grows — same
pattern as `refresh_league_averages`.

## Demo data

Two generators, covering different halves of the pipeline.

**`npx tsx scripts/seed-mechanics-demo.ts`** — idempotent; seeds Trevor May (pro) + EJ
(college) with a 3-session improving arc (grade 43→58, flags 3→0, velo held/rising),
real percentile/flag/grade logic, and rendered PDFs. Bypasses C3D parse + event
geometry — it writes metric values straight to Supabase, so it exercises the report
half only.

**`npx tsx scripts/generate-mechanics-c3d.ts`** — writes six real `.c3d` bullpens to
`data/mechanics-demo/` (gitignored) plus a `MANIFEST.md` of upload settings. Upload
them at `/mechanics` to exercise the half nothing else covers: `parseC3D`, the
Captury→canonical label mapper, `segmentThrows`/`detectEvents`, then extraction.
Nothing is asserted into the database — every number in the resulting report is
computed by the pipeline from marker positions.

- `scripts/mechanics-demo/deliveryModel.ts` — parameterised forward kinematics
  (pelvis translation + yaw, trunk lean, shoulder-line yaw, arm elevation/azimuth,
  forearm direction) → canonical joint trajectories. 8 throws/session at 240 Hz.
- `scripts/mechanics-demo/calibrate.ts` — pairs each parameter with the metric it
  dominates and bisects **against the real extractor** until the session lands on
  target percentiles. Metrics can only be requested, never asserted.
- `scripts/mechanics-demo/c3dWriter.ts` — Intel-float C3D with `POINT:LABELS`; the
  mirror of `lib/mechanics/c3d.ts`. Output verified against the independent Python
  `c3d` library (24 points, 240 Hz, mm, 4704 frames).
- `scripts/mechanics-demo/markers.ts` — canonical joints → MotionBuilder/HIK marker
  names (`Hips`, `RightArm`, `RightForeArm`…), the inverse of `captureSchema.ts`.
- `scripts/mechanics-demo/inspect.ts` — dump per-throw windows, event frames and
  metrics for any `.c3d`. Useful on real Captury exports too.

### Known metric-definition conflicts surfaced by the generator

Calibrating against real geometry made three norm/implementation mismatches visible.
All three are in `METRIC_DEFS` vs `metrics.ts`, not in the demo data.

1. **`lowerBody.leadKneeExtVelocity` is a mean, not a peak.** metrics.ts computes
   `(flexion@FC − flexion@release) / (release − FC)` — an average rate over ~0.12 s —
   but the p10–p90 band (180–520°/s) is literature *peak* lead-knee extension
   velocity. Hitting both knee-flexion norms (45° @ FC, 30° @ release) mathematically
   forces ~125°/s, which sits below p10. EJ's captures show this: both flexion
   metrics land near p40 and extension velocity flags at p8 every session.
2. **`lowerBody.strideLengthPct` can't reach its norm.** It measures the instantaneous
   ankle-to-ankle distance at foot contact, which is capped by leg length; 85% of
   height requires both knees essentially straight. Achievable ceiling is ~83% (p40),
   and pushing past ~p20 collapses lead-knee flexion. The literature 85% figure is
   lead-ankle *displacement*, a different quantity.
3. **No smoothing before differentiation.** `peakAngVel` central-differences raw marker
   positions and takes a max, so noise inflates it monotonically. Measured percentile
   drift on an otherwise identical session:

   | marker noise | 0 mm | 1.5 mm | 3 mm | 6 mm |
   | --- | --- | --- | --- | --- |
   | Peak Pelvis Rotation Vel | p50 | p83 | p91 | p95 |
   | Peak Trunk Rotation Vel | p50 | p60 | p72 | p90 |

   Real Captury joint-centre noise is 3–8 mm, so on live captures these read near the
   top of the band regardless of the athlete. A 4th-order low-pass (~12–15 Hz) before
   differentiation is the standard fix. `sequencing.pelvisToTrunkGap` is affected too —
   it differences two noisy argmax frame indices.

4. **Trunk tilt is split along L1, not by projection.** metrics.ts divides the total
   lean between forward and lateral in proportion to their horizontal components, so
   `trunkForwardTilt + trunkLateralTilt === tiltFromVertical` exactly. True anatomical
   angles combine in quadrature instead. A pitcher with a textbook 35° forward / 20°
   lateral lean has a total tilt of 38.3°, and is reported as:

   | | true | reported |
   | --- | --- | --- |
   | Forward tilt @ release | 35.0° | **25.2°** (≈ p18 — flags low) |
   | Contralateral tilt @ release | 20.0° | **13.1°** (≈ p22 — reads as good) |

   Both are understated, and because lower is better for lateral tilt the error flatters
   the athlete on the arm-stress metric while penalising them on forward tilt. This also
   forces the demo generator into an exaggerated ~55° lean to hit the published p50s.
5. **`shoulderIrVelocity` is ill-conditioned.** It is the horizontal *heading* rate of
   the elbow→wrist vector, so it spikes as the forearm passes vertical (an `atan2`
   near-singularity) and is not monotone in how far the forearm actually rotates —
   sweeping the forearm further can lower the measured value. The norm band
   (5500–7800°/s) describes true 3D internal-rotation angular velocity, a different
   quantity. It is already tagged `directional`, but the caveat is stronger than
   "not absolute": it is not reliably ordinal either.

Also worth knowing: with standard HIK naming, `hand_r`/`hand_l` resolve to the same
marker as `wrist_r`/`wrist_l`, because `captureSchema.ts` tries the exact alias
`righthand` before the substring match for `righthandmiddle`. Harmless today (both are
only used for speed/release detection) but surprising.

## v2 (deferred)

Force-plate ingest + inverse-dynamics kinetics, regression torque estimate, PULSE
workload / A:C ratio, `mph-per-normalized-torque` efficiency index.
