# MEchanics — Biomechanics Lab

Captury / OptiTrack pitching capture → kinematic assessment → athlete Compete profile.
Kinematics-only v1 (kinetics/torque deferred to force plates + inverse dynamics).

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

`npx tsx scripts/seed-mechanics-demo.ts` — idempotent; seeds Trevor May (pro) + EJ
(college) with a 3-session improving arc (grade 43→58, flags 3→0, velo held/rising),
real percentile/flag/grade logic, and rendered PDFs. Bypasses only C3D parse + event
geometry.

## v2 (deferred)

Force-plate ingest + inverse-dynamics kinetics, regression torque estimate, PULSE
workload / A:C ratio, `mph-per-normalized-torque` efficiency index.
