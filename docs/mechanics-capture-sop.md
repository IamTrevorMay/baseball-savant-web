# MEchanics Capture SOP — Captury → Triton Pipeline

**Audience:** the operator running a pitching-assessment capture at the Neptune bay.
**Goal:** produce one Captury export per bullpen that drops into `POST /api/mechanics/upload`
and processes cleanly — every one of the 19 canonical joints mapped, throws auto-segmented,
foot-contact→MER→release detected, a stable session median, and a published Compete report.

This SOP is written **to the pipeline that already exists** — it does not invent a new contract.
Every "must" below traces to a line of real code, cited inline. Pair this with
`docs/mechanics.md` (pipeline overview) and `Soto/biomechanics/14-motive-captury-mocap-fork.md`
(the Motive/Captury export-config brain doc).

> **Two things determine whether a capture is usable at all. Get these right or the numbers are
> garbage:**
> 1. **Coordinate system = Z-up.** The pipeline hard-assumes it (see §1.3). No per-capture override exists today.
> 2. **Units = millimeters.** Positions are consumed as mm; height is converted mm (§1.4).
>
> Everything else degrades gracefully and is visible in the ingest QC response. These two do not.

---

## 0. The data contract in one screen

| What the pipeline needs | Where it's enforced | Consequence if wrong |
|---|---|---|
| C3D, Intel (little-endian), float or scaled-int point data | `lib/mechanics/c3d.ts:32-57` | parse throws → `422`, use CSV-curves fallback |
| Positions in **millimeters** | `lib/mechanics/metrics.ts:123-124` (stride ÷ height-mm) | stride %, tilt magnitudes nonsense; angles survive |
| **Z-up** coordinate system | `events.ts:50` default `'z'`, `metrics.ts:100` `?? 'z'`, never overridden by `process.ts` | foot-contact, tilt, all headings wrong |
| Skeleton labels matching the `ALIASES` map | `lib/mechanics/captureSchema.ts:14-34` | joint → all-null → metrics drop out; surfaced in `unmappedJoints` |
| 19 canonical joints tracked FC→release | `lib/mechanics/types.ts:15-30` | missing lower body → throw excluded from median |
| A pre-existing `athlete_profiles` row w/ `throws` + `height_in` | `app/api/mechanics/upload/route.ts:33-41` | `404 Athlete not found`; wrong hand/height |
| `capture_date` (NOT NULL in DB) | `scripts/create-biomech-captures.sql:20` | insert fails if left blank |

The pipeline is **kinematics-only**. There is no torque, and — read this now — **there is no
per-throw ball-velo join yet**: `metrics.ts:209` hardcodes `relSpeedMph: null`. TrackMan velo
enters today only as the free-text `velo_context` session label. See §5.4 and §8 for the honest state.

---

## 1. Captury setup for repeatability (save once, reuse every session)

### 1.1 Rig & frame rate

- **Cameras:** the OptiTrack PrimeX 22 ring (8–12 cams, ~4×4×2.5 m volume; occlusion, not range,
  is the constraint — `Soto/biomechanics/13-optitrack-camera-systems.md`). Calibrate in Motive,
  export `.mcal`, import into Captury Live (`File > Import > Import Calibration`). Duplex mode
  needs Motive 3.3+ (Body/Unlimited) and a 4090-class GPU. *(proven — OptiTrack Captury-Live integration docs.)*
- **Frame rate — capture as high as the markerless solve will hold, and verify the exported rate.**
  - *Rationale (proven, sampling theory):* release is `argmax` of throwing-hand speed via central
    difference (`events.ts:63-68`); MER is the deepest-layback frame (`events.ts:98-104`). Frame
    localization error is ±1 frame. At 60 fps that's ±16.7 ms; at 300 fps ±3.3 ms. Every `°/s`
    velocity peak is `Δangle × frameRate` (`metrics.ts:69`), so a higher **true** rate directly
    sharpens both event timing and the velocity metrics.
  - *Honest ceiling (graded):* PrimeX 22 cameras run to **360 Hz** (proven — spec sheet). But
    OptiTrack's own Captury-Live doc reports markerless tracking **"successfully at 60 fps, results
    may vary"** — so the markerless *solve* rate may sit well below camera capability *(plausible
    that higher is achievable on this GPU; verify empirically)*. **Recommendation:** push the rig to
    the highest stable rate Captury will export, target ≥120 fps if it holds, and **check the actual
    `frame_rate` written on the capture row** — it drives every deg/s number. If you need true
    ≥300 Hz event precision for a research-grade deep dive, that's the **marker-based Motive** path
    at native 360 Hz, trading throughput for fidelity (see brain doc 14 §5).

### 1.2 Skeleton / subject template — the naming that maps

The mapper (`captureSchema.ts`) speaks **MotionBuilder / HumanIK / BVH** joint names. Save a Captury
**subject/skeleton export template** whose bone labels normalize (lowercase, strip `_ : . - space`)
to the `ALIASES` below. First exact match wins, then substring.

| Canonical joint | Accepted labels (any one) | Standard MB/HIK bone |
|---|---|---|
| `pelvis` | Hips / Pelvis / Root | **Hips** |
| `torso` | Spine3 / Spine2 / Chest / Thorax / Spine1 / Spine | **Spine2** (or Spine1/Spine) |
| `head` | Head / Neck | **Head** |
| `shoulder_r` / `_l` | Right/LeftArm · Right/LeftUpperArm · Right/LeftShoulder | **RightArm / LeftArm** |
| `elbow_r` / `_l` | Right/LeftForeArm · Right/LeftElbow | **RightForeArm / LeftForeArm** |
| `wrist_r` / `_l` | Right/LeftWrist · Right/LeftHand | **RightHand / LeftHand** |
| `hand_r` / `_l` | Right/LeftHandMiddle · …Index · …Hand · …Fingers | **RightHandMiddle** (fingertip) |
| `hip_r` / `_l` | Right/LeftUpLeg · Right/LeftThigh · Right/LeftHip | **RightUpLeg / LeftUpLeg** |
| `knee_r` / `_l` | Right/LeftLeg · Right/LeftKnee · Right/LeftShin | **RightLeg / LeftLeg** |
| `ankle_r` / `_l` | Right/LeftFoot · Right/LeftAnkle | **RightFoot / LeftFoot** |
| `foot_r` / `_l` | Right/LeftToeBase · …Toe · …Toes · (…Foot) | **RightToeBase / LeftToeBase** |

Notes on the map, so you know what's fine and what isn't:
- **Collisions are by design.** `RightArm`→shoulder, `RightForeArm`→elbow, `RightHand`→wrist — that's
  BVH bone-origin semantics, not a bug (`captureSchema.ts:11-13` comment). If your skeleton has no
  finger bones, `hand_r` falls back to `RightHand` (same point as wrist) — acceptable, just slightly
  softer release detection. Enabling **finger export** gives `hand_r` a true fingertip → marginally
  better release peak.
- **Which presets FAIL** (labels won't substring-match → joints land in `unmappedJoints`):
  - **Blender / Rigify** naming (`upper_arm.R`, `forearm.R`, `thigh.R`, `shin.R`, `spine.001`) — *unmapped.*
  - **3ds Max Biped** (`Bip001 R UpperArm`) — *unmapped.*
  - Missing `POINT:LABELS` → parser synthesizes `M1…Mn` (`c3d.ts:104-105`) → **all 19 unmapped.**
  - **Maya / HumanIK-prefixed** (`Character1_RightArm`) — *maps* via substring. Fine.
- **Recommended preset:** the Captury export preset that yields **MotionBuilder/Maya-HIK humanoid
  naming**. *(plausible — I could not read Captury's export dialog from public docs; confirm with the
  §7 test capture and the `unmappedJoints` readout, which is the ground-truth validator.)*

### 1.3 Export coordinate system = **Z-up** (non-negotiable)

The pipeline never passes an up-axis: `process.ts:44-45` calls `detectEvents`/`extractThrowMetrics`
without `upAxis`, so both fall to their **`'z'`** default (`events.ts:50`, `metrics.ts:100`). There is
**no `up_axis` form field** on the upload route. Therefore the C3D **must be Z-up**.

- Native Captury/Motive is **Y-up right-handed**; biomech-standard C3D is **Z-up right-handed**
  *(proven — OptiTrack C3D export doc; the export "Axis Convention" setting offers a Visual3D/Motion
  Monitor Z-up default and a MotionBuilder preset).*
- **Tension to resolve at the rig:** the export preset that fixes **naming** and the one that fixes
  **axis** may differ (e.g. a Maya-named preset is Y-up; a Blender preset is Z-up but mis-names).
  Set **naming via the preset**, then force **Z-up + mm via the custom axis/units fields** so you get
  both. Lock this once and save it as the reusable export template. *(plausible; verify in §7.)*
- If Captury genuinely cannot emit Z-up: **do not ship a Y-up file and hope.** The correct fix is the
  one-line code change in §8 (accept `up_axis` on the upload route) — close that before session 1.

### 1.4 Export units = **millimeters**

`heightMm = height_in × 25.4` (`upload/route.ts:41`) and stride is `distance ÷ height-mm × 100`
(`metrics.ts:123-124`). If the file is in **meters**, stride% and tilt magnitudes come out ~1000×
wrong while angles (pure vector angles) look fine and **nothing errors** — a silent corruption. Set
export **Units = mm**. The C3D reader applies `POINT:SCALE` and treats the magnitudes as mm; it does
not read `POINT:UNITS` (`c3d.ts:81-85`).

### 1.5 Export recipe (the reusable template)

1. **Format: C3D** — canonical, biomech-standard, aligns with the OpenBiomechanics norm bands the
   report ranks against (`docs/mechanics.md` "Captury export"). Intel/little-endian, float **or**
   scaled-int point data both parse (`c3d.ts:49,79-86`).
2. **Coordinate system: Z-up, right-handed.** (§1.3)
3. **Units: millimeters.** (§1.4)
4. **Skeleton: full body incl. feet/toes and (ideally) fingers**, MB/HIK naming. (§1.2)
5. **One file per session take** (§3 — one continuous recording).
6. **Fallback: CSV-curves.** If a C3D ever fails to parse, the route tells you verbatim: *"Export
   Captury CSV-curves as a fallback"* (`upload/route.ts:80`; parser `c3d.ts:162`). That's the
   chart-panel CSV: first column frame/time, one column per named curve. Keep the CSV export template
   saved alongside the C3D one so you're not building it live.

**Save all of this as a named Captury export profile + subject template.** The whole point is that
session-to-session you press export and get an identical, pipeline-valid file.

---

## 2. Pre-session checklist

**Triton side (do the night before, or ≥10 min pre-capture):**
- [ ] Athlete has an `athlete_profiles` row with **name, `throws` (L/R), `height_in`**. The route
      404s without it and reads exactly these three fields (`upload/route.ts:33-38`). `throws`
      drives lead-leg/hand selection (`events.ts:52-54`); `height_in` drives stride% — **a wrong
      height silently biases stride.** Confirm both.
- [ ] Decide the **`level`** bucket now: `youth | hs | college | pro` (norm band + magnitude scaling,
      `lib/mechanics/norms.ts:31-33`). This is entered at upload but decide it here.

**Captury / bay side:**
- [ ] Load the saved **export template** (§1.5) and **subject/skeleton template** (§1.2).
- [ ] **Calibration & volume check:** wand-calibrate; confirm mean error acceptable; confirm the full
      throwing volume (mound → 6 ft past release, full stride length, glove-side arm) is covered by
      ≥2 cameras at every point to survive occlusion.
- [ ] **T-pose / neutral reference:** capture a few seconds of still T-pose or A-pose before the
      first throw. Captury uses it to fit/scale the subject skeleton; a clean neutral improves
      joint-center consistency for the whole take. *(plausible — standard markerless subject-fit
      practice; not a pipeline requirement but cheap insurance.)*
- [ ] **Name the Captury subject + session to mirror Triton identity** (§5.1) so upload mapping is unambiguous.
- [ ] **TrackMan armed and clock-synced** (§2.1).

### 2.1 TrackMan time-sync (so ball data pairs to throws)

A TrackMan unit runs in the bay alongside Captury. **Today the pairing is manual/analyst-side** —
there is no code that joins TrackMan rows to Captury throws (§5.4, §8). To make that join *possible*
now and *automatable* later:
- **Sync clocks.** Put the TrackMan host and the Captury/Motive PC on the **same NTP source** (or hand-set
  to the same second) before the first pitch. TrackMan stamps every pitch with `Date`/`Time`
  (`lib/compete/pitchSchema.ts:10-11`); Captury stamps the take. A shared clock lets you align the
  Nth TrackMan pitch to the Nth segmented throw by time order.
- **Match pitch order 1:1.** One continuous Captury take auto-segments into ordered throws
  (`throwNo`, `events.ts:125-151`); TrackMan emits ordered `PitchNo`. Keep them 1:1 — **no warm-up
  tosses that TrackMan sees but you don't want in the assessment, and no dry reps between tracked
  pitches.** Order is the join key until timestamps are wired.
- **Export TrackMan CSV** at session end (§5.4). Align its keys to the Compete schema
  (`pitchSchema.ts`): `PitcherId`/`Pitcher`, `PitchNo`, `TaggedPitchType`, `RelSpeed`,
  `PitchUID`, `SessionId` — the same fields the Compete ingest already understands.

---

## 3. The 3-phase capture protocol

**One continuous recording.** Start the Captury take before the warm-up progression and stop it
after the last secondary. The pipeline segments throws from bursts of throwing-hand speed above 25%
of peak, separated by ≥30 quiet frames (`events.ts:125-151`) — so **pause ~1.5–2 s between throws**
(at 120 fps, 30 frames = 0.25 s of quiet is the minimum; give margin) to guarantee clean cuts.

| Phase | Reps | Rest | Intent cue | Feeds |
|---|---|---|---|---|
| **1 — Warm-up progression** | 8–12, sub-max ramping | continuous | "Build to effort, don't muscle it" | Not the baseline — but they still segment. Keep them if clean; they mostly fail the median gate on their own via low velocities, and they give the athlete real reps on camera. |
| **2 — Max-effort fastballs (mechanics baseline)** | **5–8** four-seam, full effort | 20–30 s between | "Compete pitch. Same as a game FB." | **The session median.** Aim for **≥5 clean** reps (see §3.1). This is what the report grades. |
| **3 — Secondaries** | **2–3 each** (SL/CB/CH/etc., in a fixed order) | 20–30 s between | "Full commitment, real shape — no get-me-over." | Per-pitch context; today they pool into the same session median unless you split captures (see note). |

- **Set position, not windup, unless the athlete only games from the windup.** Consistency of the
  delivery you're assessing matters more than which one.
- **Fixed secondary order** (e.g. SL → CB → CH) so the TrackMan `TaggedPitchType` sequence lines up
  with throw order for pairing (§2.1).
- **Note (design honesty):** v1 aggregates the *whole take* into one session median across all
  qualifying throws (`process.ts:39-53`). It does **not** split the median by pitch type. If you want
  a pitch-type-specific mechanics profile now, run **separate takes/uploads per pitch type**. For a
  standard baseline, the fastball reps dominate and the mixed median is fine — but know that a
  wildly different breaking-ball delivery will pull the median.

### 3.1 What "one good rep" is, and how many you need

A rep counts toward the median when it is **not excluded** and **not missing lower body**
(`process.ts:50`):
- **Events order correctly** (foot-contact < MER < release): confidence base 0.6 when ordered, 0.2
  when not (`events.ts:107-109`). `excluded = confidence < 0.5` (`upload/route.ts:98`).
- **Data completeness** adds `0.4 × validFrac` of the throwing hand (`events.ts:108-109`). An ordered
  throw clears 0.5 automatically; an out-of-order throw needs ≥75% valid hand frames to survive.
- **Lower body visible at foot contact** so stride computes — otherwise the throw is flagged
  `missing_lower_body` and dropped from the median regardless of confidence (`metrics.ts:216`,
  `process.ts:50`).

So **one good rep = full-body, unoccluded, foot-contact-through-release**. The session value is a
per-metric **median** across the qualifying pool (`metrics.ts:244-280`), which is what defeats
throw-to-throw noise — **target `throwsUsed ≥ 5`** on the fastball baseline for a stable median.
Fewer than ~3 clean and the median is fragile; re-shoot.

---

## 4. During-capture QC

Watch the Captury live skeleton, not just the video:
- **Occlusion / dropout = gaps = nulls.** Invalid samples become `null` (`c3d.ts:88`) and every metric
  guards against them by skipping — a limb that drops out at release quietly stops contributing. The
  glove-side arm and the lead leg at plant are the usual casualties.
- **Keep all 19 joints solid through FC→release** — that window holds 100% of the peak loads
  (`events.ts:6-8`). Especially: **lead ankle** (foot-contact detection, `events.ts:70-82`),
  **throwing hand** (segmentation + release + confidence), **both hips and both shoulders**
  (pelvis/trunk velocity, hip-shoulder separation).
- **If the skeleton pops, swaps a limb, or loses the lower half — stop, reset the subject, re-throw.**
  A markerless limb-swap produces plausible-looking but wrong angles; it will not always trip a QC flag.
- **Minimum bar to walk away:** ≥5 clean fastballs + ≥2 clean of each secondary you intend to assess.
  If in doubt, throw more — reps are cheap, a re-visit is not.

---

## 5. Post-session: export, naming, organization

### 5.1 Naming convention (encode athlete + date + session)

Mirror Triton identity so the file is self-describing and the upload mapping is unambiguous. The
**athlete link is by dropdown selection at upload** (route reads `athlete_id`, not the filename), so
naming is for *human* provenance and matching the TrackMan CSV — make it rigorous anyway:

```
Captury subject name : <LastFirst>_<athlete_profile_id-short8>
Session / take name  : <LastFirst>_<YYYY-MM-DD>_<sessionType>
C3D file             : <LastFirst>_<YYYY-MM-DD>_<sessionType>_<level>.c3d
TrackMan CSV         : <LastFirst>_<YYYY-MM-DD>_<sessionType>_TM.csv
```

Example: `MayTrevor_2026-08-02_assessment_pro.c3d` + `MayTrevor_2026-08-02_assessment_TM.csv`.
`sessionType` ∈ `assessment | baseline | recheck | penX`. Using the short `athlete_profile_id` in the
subject name kills any two-athletes-same-name ambiguity.

### 5.2 Folder structure (local, before upload)

```
/Neptune-Captures/
  <LastFirst>_<athlete_profile_id-short8>/
    2026-08-02_assessment/
      raw/            <-- Captury project + original take (never edited)
      export/         <-- the .c3d and .csv you upload
      trackman/       <-- the TrackMan session CSV
```

One athlete folder, one dated subfolder per session. `raw/` is the archival Captury project (the
moat, §7); `export/` is what feeds Triton.

### 5.3 The C3D handoff to MEchanics upload

Uploader = an **admin/owner** (route enforces `role in (admin, owner)`, `upload/route.ts:15-18`).
In **Mechanics Lab → + New Capture** (`app/(mechanics)/mechanics/page.tsx`), enter:
- **Athlete** — dropdown (must pre-exist, §2).
- **Capture date** — **required** (DB `NOT NULL`; blank → insert fails). Enter it every time.
- **Level** — `youth | hs | college | pro`.
- **Velo context** — free text, defaults `max_effort`. Put the **session velo band here**
  (e.g. `max_effort 89-92`) — this is currently the *only* place ball velo lands (see §5.4). It
  prints on the report PDF header (`lib/mechanics/pdf.ts:39`).
- **File** — the `.c3d` from `export/`.
- *(`notes` is accepted by the API (`upload/route.ts:26`) but the current form doesn't send it; don't
  rely on it until the field is added.)*

The raw C3D is stored to the private `biomech-captures` bucket on upload (`upload/route.ts:46-49`) —
Triton keeps its own archival copy, but you keep the Captury project locally too (§7).

### 5.4 TrackMan pairing — the honest state

**Per-throw velo pairing is NOT implemented.** `outcome.relSpeedMph` is hardcoded `null`
(`metrics.ts:209`); `biomech_throws.rel_speed_mph` therefore stores `null` (`upload/route.ts:97`);
the schema comment "joined from TrackMan if paired" describes an *intended* feature with no code
behind it. So today:
- **Session-level velo** → the `velo_context` free-text field (§5.3). This is what shows up.
- **Per-throw ball data** (velo, pitch type per Captury throw) → **export the TrackMan CSV and keep it
  in `trackman/`**, ordered 1:1 with throws (§2.1). It is not consumed by the pipeline yet; it's the
  input for the join when it's built (§8). Aligning its columns to `pitchSchema.ts` now
  (`PitchNo`, `RelSpeed`, `TaggedPitchType`, `PitchUID`) means the future join is a small script,
  not a re-shoot.

Don't promise an athlete per-pitch velo *on the biomech report* until §8 lands.

---

## 6. Upload + verification loop

A healthy ingest response (`upload/route.ts:116-122`):

```json
{ "captureId": "...", "throwsDetected": 13, "throwsUsed": 8,
  "unmappedJoints": [], "flags": [ {"label":"Contralateral Trunk Tilt @ Rel","percentile":88}, ... ] }
```

Read it like a checklist:

| Signal | Healthy | If not |
|---|---|---|
| `unmappedJoints` | **`[]`** | **Stop.** Every listed joint = a label that didn't match `ALIASES`. Fix the export **naming preset** (§1.2), re-export the same take, re-upload. This is a config bug, not an athlete problem. |
| `throwsDetected` | ≈ your rep count | Too low → throws merged (increase inter-throw pause) or hand dropped out. Too high → noise/limb-swap segmented as throws. |
| `throwsUsed` | **≥5** on a FB baseline, close to detected | Big gap → many throws excluded. Check `biomech_throws.qc_flags` for `missing_lower_body` (lower-body occlusion) or `low_event_confidence` (out-of-order events, often a Z-up/units problem). |
| `flags` | 2–3, plausible | All-metrics-flagged or absurd magnitudes (e.g. stride 8% or 800%) → **units or axis wrong** (§1.3–1.4). Re-export Z-up/mm. |
| status `422` + "Export Captury CSV-curves as a fallback" | — | C3D didn't parse. Export the CSV-curves file (§1.5) and upload that. |

**When it's healthy:** open the capture detail, eyeball the live report preview (built client-side
from the stored throws via the same pure libs), then **Generate & Publish** (`POST
/api/mechanics/report`) to push the report + PDF to the athlete's Compete profile.

**Golden rule:** the first upload of any new athlete/export-template combo is a **config test**, not a
result. `unmappedJoints == []` + sane stride/tilt magnitudes = the template is locked; only then trust
the numbers.

---

## 7. Data-organization best practices (as the roster grows)

- **One athlete → many captures over time = the trend.** The Compete report renders `BiomechTrend`
  (movement grade + each metric across capture history, `docs/mechanics.md` "UI"). The value is the
  *slope*, so cadence matters: baseline → re-check every ~6 weeks (matches the assessment re-test
  cadence in `Soto/biomechanics/08-biomechanical-assessment.md`). Keep `level` and the export template
  **constant** across an athlete's timeline so change is real, not a config artifact.
- **Retain raw C3D — the database is the moat** (`upload/route.ts:45-49`). Triton archives the C3D to
  `biomech-captures`; **you also keep the full Captury project** (`raw/`, §5.2). Never overwrite the
  raw take — re-processing improvements (better event detection, future kinetics) re-run on raw, and
  markerless video/projects are 2–4 GB/min (brain doc 14 §3.2), so plan storage.
- **Provenance is fixed and honest.** Every capture row is tagged `capture_system =
  'captury_optitrack'` (markerless; `create-biomech-captures.sql:21`). Rotational-shoulder metrics
  (`shoulderIrVelocity`, `maxExternalRotation`, `horizontalAbduction`) are stored as **directional,
  not absolute** (`metrics.ts:213`) — a validated markerless caveat (brain doc 14 §3.5: no published
  Captury *pitching* validation exists; grade **promising for gross/rotational, plausible for
  arm-slot, not a torque source**). Design analytics around **within-athlete change on one system**,
  never cross-system leaderboards.
- **Within-athlete consistency > cross-athlete precision.** Markerless is reliable (repeatable) more
  than valid (accurate). Same rig, same template, same level bucket per athlete-timeline. That's how
  the trend stays clean at 10 athletes and at 200.

---

## 8. Fastest path to a test capture tomorrow + the gap to close first

**Fastest path (do this before any athlete shows up):** create/verify one `athlete_profiles` row for
your test subject (name, `throws`, `height_in`). Calibrate the ring in Motive and import `.mcal` into
Captury. Build **one** saved export template: **C3D, Z-up, millimeters, MotionBuilder/HIK skeleton
naming, full body**. Record a single 60-second take of ~6 max-effort fastballs (≥1.5 s between reps),
export the C3D, and upload it in Mechanics Lab with the date and level filled in. **The response's
`unmappedJoints` and stride/tilt magnitudes tell you in one shot whether the template is right** —
iterate the export preset until `unmappedJoints == []` and stride reads ~75–95% and trunk tilts read
in the tens of degrees. That closes the config loop empirically, which is faster and more certain than
any doc — including this one.

**The single highest-leverage gap to close before session 1:** the pipeline **hard-assumes Z-up + mm
with no per-capture override** (`process.ts:44-45` never passes `upAxis`; upload route has no
`up_axis`/`units` field), yet I could not confirm from public Captury docs that Captury's export will
emit **Z-up** (its presets lean Y-up/Maya or Z-up/Blender, and the Z-up preset mis-names joints —
§1.2–1.3). **Action:** in the test capture, verify a Captury export can be forced to **Z-up + mm +
HIK naming simultaneously**. If it can — no code change, just save the template. If it can't, add a
one-line `up_axis` (and optional `units`) form field to `upload/route.ts` passed into
`processC3D(..., { upAxis })`, so a Y-up file is corrected at ingest instead of silently producing
wrong foot-contact, tilt, and separation numbers. Everything downstream — the whole report — depends
on getting that one axis right.

*(Secondary, non-blocking gap: per-throw TrackMan velo → `relSpeedMph` is unbuilt (§5.4). The session
still produces valid kinematics without it; wire the order/timestamp join when you want per-pitch velo
on the biomech report.)*
