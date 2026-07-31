---
title: Motive vs Captury — The Marker-Based / Markerless Fork on OptiTrack Hardware
domain: biomechanics
tags:
  - motion-capture
  - optitrack
  - motive
  - captury
  - marker-based
  - markerless
  - natnet
  - visual3d
  - data-pipeline
  - triton-schema
sources_reviewed: 16
last_updated: 2026-07-31
---

# Motive vs Captury — The Marker-Based / Markerless Fork on OptiTrack Hardware

## TL;DR

- **This is the real Neptune decision.** OptiTrack PrimeX cameras ([13-optitrack-camera-systems.md](13-optitrack-camera-systems.md)) are the hardware; they feed **either Motive (marker-based) or Captury Live (markerless)**. Same cameras, two software paths, radically different labor/fidelity/kinetics profiles. Do not confuse the camera buy with this choice. (context)
- **Motive is a *tracking/kinematics* engine, not a kinetics engine.** It reconstructs 3D markers and solves skeletons, and exports **CSV, C3D, FBX, BVH, TRC** in a **right-handed, Y-up, meters** coordinate system. But it does **not compute joint moments/torque**. Elbow varus torque — the injury currency (doc 06, doc 05) — requires exporting **C3D + synchronized force-plate analog** into **Visual3D or OpenSim** for inverse dynamics. Motive alone gives you angles and velocities, not Nm. (proven — this is how the pipeline works)
- **Motive real-time streaming is genuinely low-latency.** The **NatNet SDK** (UDP unicast/multicast) streams 3D markers, rigid bodies, skeletons, and trained marker sets; camera latency is **2.8 ms @ 360 Hz** (PrimeX 22) and NatNet conversion adds only **~0.2 ms**. Total glass-to-client latency is single-digit ms — good enough to drive live biofeedback. SDK samples ship for C/C++, .NET/C#, MATLAB, Unity. (manufacturer spec, credible)
- **Captury Live is markerless, and it runs on OptiTrack cameras.** Officially documented integration: calibrate in Motive → export `.mcal` → import to Captury. **Duplex mode** (preferred) needs **PrimeX/SlimX/VersaX cameras + Motive 3.3+ Body/Unlimited license + an NVIDIA 4090-class GPU**; **MJPEG mode** works on more cameras (incl. Flex/Prime) at reduced resolution/throughput. Up to **3 actors**, tested at **60 fps**. Captury and Motive **cannot run at once on the same PC**. (proven — OptiTrack docs)
- **Captury exports FBX, BVH, C3D, CSV** and streams via VRPN/OSC/ROS/OSVR/BVH/BoB/VIZRT with an SDK for custom plugins (Unreal/Unity/MotionBuilder). Captury *Studio* is the cheaper post-processing sibling and adds **AMTI/Bertec force-plate integration** → the markerless route to kinetics. (proven — vendor docs)
- **Grade the accuracy honestly.** Captury's independent validation is **gait/general-movement, not high-speed pitching.** Captury-vs-Vicon (14 children, squats/jumps): knee-flexion RMSE **11.8°**, hip **17.6°**, ankle **7.2°**; general markerless-vs-Vicon gait RMSE ~**6.4–7.7°**. This is the same tier as the markerless numbers already in the brain (Theia3D MPJPE **52 mm**, Hawk-Eye **56.6 mm**, pitchAI shoulder-ER RMSE up to **20.8°**). **No published Captury *baseball-pitching* validation exists — treat Captury pitching kinematics as *promising for gross/rotational, plausible for arm-slot, and not a validated torque source*.** (promising → plausible; see grading below)
- **The right Neptune answer is a hybrid weighted to markerless throughput**, with a marker-capable ring kept for the deep-dive/kinetics tier — and a Triton schema whose `capture_system` tag encodes *software path*, not just camera. (recommendation)

## 1. The Fork: One Ring, Two Software Paths

The mental model that makes this simple:

```
                    OptiTrack PrimeX cameras (the ring)
                                 │
              ┌──────────────────┴───────────────────┐
              ▼                                        ▼
      MOTIVE (marker-based)                    CAPTURY LIVE (markerless)
   reflective markers on the body        deep-learning pose from camera images
   ~39–47 markers, ~30 min prep/athlete   no markers, seconds of prep
   highest kinematic fidelity             good gross kinematics, softer on arm
   kinetics ONLY via export→Visual3D      kinetics via Captury Studio + force plates
   NatNet real-time streaming             VRPN/OSC/ROS/BVH streaming + SDK
              │                                        │
              └──────────────► (Duplex/MJPEG) ◄────────┘
                    Captury can run ON the OptiTrack cameras,
                    reusing Motive's calibration (.mcal)
```

The non-obvious, decision-changing fact: **Captury is not a separate camera system you buy instead of OptiTrack — it is software that can consume the OptiTrack camera stream.** OptiTrack publishes a Captury Live integration guide. So a facility that owns a PrimeX ring can run marker-based Motive for a research-grade deep dive *and* markerless Captury for fast roster-scale intake **on the same hardware** (just not simultaneously on one PC). That converts the old capital decision ("marker lab OR markerless") into a software/workflow decision made per-session.

Caveat on "hybrid": you cannot get *marker-based-accurate kinetics* and *markerless-fast throughput* out of the *same pitch* — Captury and Motive can't co-run on one PC, and Duplex mode is Captury consuming the cameras, not a simultaneous dual solve. The hybrid is at the *program* level (which tier a given athlete/session gets), not the single-capture level.

## 2. Motive — The Marker-Based Path

### 2.1 Workflow, end to end

1. **Calibration.** Wave a calibration wand (e.g. CW-500) through the volume; Motive computes each camera's position/orientation and lens distortion, then set the ground plane/origin with an L-frame. Modern Motive adds **Continuous Calibration** (calibration self-maintains and "no longer degrades over time with temperature/building movement") and **one-click subject calibration**. Calibration is exportable as **`.cal`/`.mcal`** files (camera poses in 3D) and re-importable across sessions — and, critically, this is the file Captury reuses (§3.2).
2. **Marker set / subject prep.** Glue ~**39–47 retroreflective markers** to bony landmarks (ASMI baseball set = 39). Create a **Skeleton asset** from a labeled marker set (Motive ships marker-set templates: Baseline/Conventional/Rizzoli, etc.).
3. **Capture.** Record a **Take** at the chosen rate (240–360 Hz). Cameras do on-board 2D centroiding; Motive triangulates the 3D point cloud.
4. **Labeling / cleanup.** Auto-label markers to the skeleton; fix swaps/mislabels. This is the labor tax of marker-based.
5. **Gap-filling.** Occluded markers leave gaps; fill via interpolation (linear/cubic/pattern-based) or let the **precision solver** infer hidden markers. `CTRL+R` reboots the skeleton solve if tracking dropped.
6. **Solve + export.** Ensure all rigid bodies/skeletons are solved, then **File → Export Assets**.

### 2.2 Outputs and formats

Motive exports reconstructed 3D tracking data as **CSV, C3D, FBX, BVH, TRC**:
- **C3D** — the biomechanics-standard binary; carries 3D markers + analog channels (force plates, EMG). **This is the export you want for a kinetics pipeline.**
- **TRC** — marker trajectories, the native input to **OpenSim**.
- **CSV** — flat per-frame marker/joint columns; easiest to ingest into a database directly.
- **FBX / BVH** — skeletal animation formats (BVH = joint hierarchy + rotations; FBX = richer), aimed at animation/game engines more than biomech.

### 2.3 Coordinate system and units

Motive uses a **right-handed coordinate system, Y-up by default** (X right, Z toward the user; configurable, and export dialogs can convert axis/handedness for the target tool), with a user-defined origin set at calibration. **Default distance unit is meters** (mm selectable). Every downstream join/merge must know the axis convention and units of the file — a Y-up meters Motive export and a Z-up mm Visual3D model will silently disagree if you don't reconcile them.

### 2.4 Real-time streaming — NatNet

The **NatNet SDK** is Motive's real-time streaming protocol: **client/server over UDP** (unicast or multicast), streaming reconstructed 3D markers, **rigid bodies, skeletons, and trained marker sets** to any number of clients (same PC or across the network). Latency budget: **camera latency 2.8 ms @ 360 Hz** (5.56 ms @ ≤180 Hz, 2.0 ms @ 500 Hz — inversely scales with frame rate), plus solver latency (reported live in Motive's Status Panel), plus **~0.2 ms for the NatNet conversion**. SDK sample clients exist for **C/C++, .NET/C#, MATLAB, and Unity**; timestamps (`TransmitTimestamp` / `SecondsSinceHostTimestamp`) let a client measure its own transmission latency. This is the API a live-biofeedback or auto-ingest bridge would target.

### 2.5 Kinematics vs kinetics — the critical limitation

**Motive computes kinematics only** — marker positions, joint angles, segment velocities. It does **not** run inverse dynamics; it produces **no joint moments, no elbow varus torque, no shoulder IR torque.** To get the kinetic numbers that the arm-health story depends on (doc 05, doc 06), you must:

1. Capture in Motive **with synchronized force plates** (Motive records analog force-plate channels into the C3D).
2. **Export C3D (or TRC + forces)** into a **biomechanical modeling package — Visual3D (C-Motion) or OpenSim** — which builds a linked-segment model and runs **inverse dynamics** to compute joint moments/powers.

So the honest pipeline is **Motive → Visual3D/OpenSim → torque**, not "Motive → torque." This is why a real pitching-kinetics lab is *cameras + force plates + a biomechanist running Visual3D*, and why torque, not just video, is the expensive part. (This matches the brain's existing point that markerless torque is only trend-grade — even *marker-based* torque needs a second software layer and force plates.)

### 2.6 Versions and licensing

- **Motive 3.x** is current (3.0 shipped 2021; 3.2/3.3 current-generation; Captury Duplex needs **3.3+**). Perpetual license tied to a hardware/USB security key or software activation.
- **License tiers:** **Tracker** (real-time rigid-body tracking only), **Body** (skeleton tracking, up to 3 live skeletons), **Body Unlimited** (10+ skeletons / 300+ rigid bodies), **Edit** / **Edit Unlimited** (post-processing only, no live capture).
- **Pricing:** Motive:Body ≈ **€5,499 (~$6,000)** per seat (EU reseller list); other tiers quote-separately. A biomech skeleton workflow needs at least **Body**.

## 3. Captury — The Markerless Path

### 3.1 What it is

**Captury** (The Captury GmbH) is a markerless mocap company. Products: **Captury Live** (real-time markerless from multi-camera video), **Captury Studio** (post-processing, cheaper entry price), **CapturyDome** and **CapturyInGame** (many-camera / many-person variants). Method: multi-view **visual-hull + background subtraction + deep-learning pose estimation** — no markers, no suit. Tracks **full body including all finger joints**, plus optional facial capture, and **multiple people simultaneously** ("as many as are visible in the volume"). Prep is seconds (athlete walks in), vs ~30 min of marker gluing.

### 3.2 Cameras it runs on — including OptiTrack

Captury is camera-flexible: it runs on **GigE machine-vision cameras (Basler, XIMEA), and grayscale/IR cameras — explicitly including Qualisys and OptiTrack** — as well as GoPros (used in validation studies) and HDMI/SDI sources. **Scalable 4 to 12+ cameras.** The OptiTrack integration specifically:

- **Duplex mode (preferred):** requires **PrimeX, SlimX, or VersaX** cameras (NOT older Prime/Slim/Flex), **Motive 3.3+** with a **Body or Unlimited** license, and an **NVIDIA 4090-class GPU minimum**. Captury reuses the camera-native stream.
- **MJPEG mode:** broader compatibility (Flex/Slim/Prime/PrimeX/SlimX/VersaX; not Duo 3/Trio 3 bars) — Captury pulls compressed video; older cameras drop resolution and Flex hits USB throughput limits.
- **Setup:** calibrate the full system **in Motive**, export **`.mcal`**, import into Captury Live, enable Motive initialization. **Captury and Motive cannot run at the same time on one PC.**
- **Tested envelope:** **up to 3 actors**; **60 fps** achieved; **>12 PrimeX 41 cameras + 3 people** hit performance issues. Data volume is heavy: **8× PrimeX 22 → 2.1 GB/min**; **12× PrimeX 41 → 3.7 GB/min** (markerless keeps *video*, unlike Motive's coordinate stream — a storage-planning fact).
- Multi-PC rigs need **eSync** hardware to avoid frame-sync strobing.

### 3.3 Calibration, real-time output

Captury's own calibration (when not reusing Motive's) is a **3-step process — camera focus, lens-distortion, volume — in 5–10 minutes.** Real-time output is a full skeleton (all primary bones/joints + fingers). Because it's markerless there is no labeling/gap-filling labor — the tradeoff for lower joint-center precision.

### 3.4 Exports and streaming (the integration surface)

- **Export:** **FBX, BVH, C3D, CSV** (Studio and Live). C3D again is the biomech-standard path.
- **Streaming:** **VRPN, OSC, ROS, OSVR, BVH, BoB, VIZRT**; plugins for **Unreal, Unity, MotionBuilder**; and an **SDK** to build custom plugins / let a third-party app talk to Captury Live in real time. Note: Captury does **not** speak NatNet — its real-time API is its own SDK/VRPN/BVH stream, so a Triton ingest bridge needs a *different* client than the Motive/NatNet one.
- **Kinetics:** Captury **Studio integrates AMTI and Bertec force plates**, so markerless inverse-dynamics-style kinetics is possible in Studio — but inherits markerless joint-center error, so grade any Captury torque as trend-only, exactly like the IMU/markerless caveats in doc 07 §5–6.

### 3.5 Accuracy and validation — graded

The honest state of Captury validation, and where it sits against numbers already in the brain:

- **General movement / gait (independent):** Captury-vs-Vicon on 14 preschool children (squats, broad jumps) — knee-flexion RMSE **11.8°**, hip-flexion **17.6°**, ankle-dorsiflexion **7.2°**. A GoPro-based Captury rig reported image error **1.3–2.7 mm** (that's 2D image error, *not* 3D joint error — don't confuse the two). General markerless-vs-Vicon gait literature: RMSE ~**6.4–7.7°** across hip/knee/ankle. **Grade: promising for gross/lower-body kinematics; RMSE in the high-single-to-mid-teen degrees on individual joints.**
- **High-speed baseball pitching (Captury-specific):** **none found.** There is no published Captury pitching-kinetics or arm-slot validation. **Grade: plausible only** — extrapolating from (a) Captury's general accuracy and (b) the well-documented fact that *all* markerless systems degrade most on the fast, occluded throwing shoulder (Theia3D/Hawk-Eye MPJPE 52–57 mm; pitchAI shoulder-ER RMSE up to 20.8°, doc 07). Treat Captury pitching output as directional for arm slot and untrustworthy for absolute torque until Neptune validates it against its own marker-based captures.

**Reliability ≠ validity (the recurring brain theme):** like every markerless/IMU tool, Captury will likely be *repeatable* on the same athlete (good for tracking change) while carrying a systematic offset vs marker-based (bad for cross-system benchmarking). Design analytics around within-athlete change, one system per athlete-timeline.

### 3.6 Licensing / pricing

**Activation-based license, validated against a license server, with an annual renewal fee that is "not low"** (vendor-acknowledged); no public price sheet. Captury Studio is the cheaper post-processing entry; Captury Live (real-time) is the premium tier. Budget for a recurring annual software cost on top of the OptiTrack hardware.

## 4. Head-to-Head: Which Path, and the Tradeoffs

| Dimension | Motive (marker-based) | Captury Live (markerless) |
|---|---|---|
| Athlete prep | ~30 min marker placement (skilled) | seconds — walk in |
| Post-capture labor | labeling + gap-fill + solve | minimal (no markers to label) |
| Kinematic fidelity | highest (±0.2 mm marker recon) | promising; softest on throwing shoulder |
| Kinetics (torque) | via export → Visual3D/OpenSim + force plates | via Captury Studio + AMTI/Bertec (trend-grade) |
| Throughput (athletes/day) | low | high |
| Real-time API | **NatNet** (UDP, low-ms, C/C++/.NET/MATLAB/Unity) | Captury SDK / VRPN / OSC / BVH (not NatNet) |
| Exports | CSV, C3D, FBX, BVH, TRC | FBX, BVH, C3D, CSV |
| Storage | light (coordinate streams) | heavy (video; ~2–4 GB/min) |
| Runs on OptiTrack PrimeX? | native | yes (Duplex/MJPEG; needs 3.3+, GPU) |
| Software cost | Motive:Body ~€5.5k/seat perpetual | activation + non-trivial annual renewal |
| Best for | research-grade deep dive, kinetics, top-of-pyramid | roster-scale intake, youth, progress tracking, content |

The tradeoff is the same **fidelity ↔ throughput** axis the brain already frames (doc 07 §7): marker-based wins fidelity and loses throughput; markerless wins throughput and loses fidelity. Neither gives you *validated single-pitch torque without force plates and a modeling package* — that's a property of the *kinetics pipeline*, not the capture method.

## 5. Which Path for Neptune

**Hybrid, weighted markerless — but only if an optical ring is bought at all.** Sequencing against the brain's existing buy-order (doc 07 §7, which puts PULSE workload + phone/tablet markerless first):

1. **Default markerless for throughput.** A development-lab business model is throughput (many athletes, recurring). Captury (or the cheaper phone/tablet markerless already recommended in doc 07) is the intake/progress/content engine. If Neptune has bought a PrimeX ring, Captury Live on that ring is a fidelity step up from phones without marker labor.
2. **Keep the ring marker-capable for a deep-dive tier.** The one thing markerless cannot credibly deliver is validated **kinetics** — and Trevor's TJ history makes the arm-health/torque story the facility's most authentic differentiator. A marker-based Motive capture + force plates + a Visual3D pass is the "premium biomechanics assessment" that commands development-lab pricing and produces real velocity-torque-efficiency numbers (doc 06 §7).
3. **Don't try to co-run them on one pitch.** The hybrid is program-level: markerless for the many, marker-based+kinetics for the few (paid deep dives, pro clients, research).
4. **If choosing only one and budget is tight:** the brain's standing advice (phone/tablet markerless + PULSE) still beats a half-built OptiTrack ring for a facility. OptiTrack+Captury/Motive is the upgrade when the "development lab" positioning and pro-client volume justify six figures.

## 6. Triton Schema Implications (bias toward the eventual Workflow)

This data has to land in Triton. Concrete design consequences:

- **`capture_system` must encode the software path, not just the camera.** Minimum granularity: `optitrack_motive_marker`, `optitrack_captury_markerless`, `kinatrax`, `theia3d`, `pitchai`, `pulse_imu`. Coordinate frames, joint-center definitions, and validation universe differ by **software**, so camera model alone is insufficient provenance (extends doc 07 §3 and doc 06 §5).
- **Store the coordinate convention + units as columns/metadata**, because Motive is right-handed Y-up meters by default and Visual3D/OpenSim models are typically Z-up — a session record should carry `axis_up`, `handedness`, `length_units` so a query can never silently mix frames.
- **Two ingest bridges, not one.** Real-time from Motive = a **NatNet UDP client**; real-time from Captury = its **SDK/VRPN/BVH** stream. File-based ingest is cleaner and format-common: **C3D** is exported by *both* and is the biomech standard — a C3D → parquet/Postgres loader is the single highest-leverage ingest to build (it also reads OpenBiomechanics files directly, doc 06 §2).
- **Persist derived POI scalars + fPCA scores in Postgres; keep raw C3D/video in object storage** (doc 06 §7). Markerless video is 2–4 GB/min — it does not belong in a relational table.
- **A `neptune_pitch_biomech` table** keyed by athlete × session × pitch, columns = OpenBiomechanics-style **79 POI variables** + a small set of fPCA scores + `capture_system` + normalized torque + velocity-torque efficiency + coordinate metadata. Adopting the OBP POI column names keeps external research directly comparable (doc 06 §2, §7).
- **Kinetics fields must be nullable and provenance-flagged.** A Captury or IMU capture has no validated torque; a Motive+force-plate+Visual3D capture does. The schema should let a pitch have kinematics without kinetics, and never present a markerless "torque" next to a marker-based one on the same leaderboard.

## 7. For Soto / Neptune

- **The camera and the method are separate purchases; the method is a per-session choice.** OptiTrack PrimeX → Motive (markers, fidelity, kinetics-via-Visual3D) *or* Captury (markerless, throughput) *or* both at the program level. This is the reframing that should drive the Biomechanics Workflow design.
- **Motive gives you angles; torque needs Motive → Visual3D/OpenSim + force plates.** Never promise elbow-varus-torque from cameras alone — that's the single most over-claimed thing in facility mocap marketing, and Trevor will spot it.
- **Grade Captury pitching output as promising-for-gross / plausible-for-arm-slot / not-a-validated-torque-source** until you validate it on your own marker captures. No published Captury baseball validation exists.
- **Build the C3D ingest first.** It's the one format both Motive and Captury (and OpenBiomechanics) share, and it carries markers + force-plate analog in one file — the natural spine of the Triton Biomechanics Workflow.

## 8. The Exact Captury Export Config That Satisfies Triton's MEchanics Pipeline

Hard contract, read from the real code (`lib/mechanics/*`, `app/api/mechanics/upload/route.ts`).
The full operator SOP is `docs/mechanics-capture-sop.md`; this is the durable config kernel:

- **Format: C3D** (Intel/little-endian, float or scaled-int point data — `c3d.ts` parses both).
  CSV-curves is the documented fallback the route names on a parse failure.
- **Coordinate system: Z-up, right-handed — non-negotiable.** `process.ts` never passes an up-axis,
  so `detectEvents`/`extractThrowMetrics` fall to their `'z'` default and there is **no `up_axis`
  override on the upload route.** Native Captury/Motive is **Y-up**; biomech-standard C3D is **Z-up**
  (OptiTrack C3D "Axis Convention" offers a Visual3D/Motion-Monitor Z-up default + a MotionBuilder
  preset — *proven*). A Y-up file silently corrupts foot-contact, trunk tilt, and every heading-based
  metric (headings are computed in the plane orthogonal to up).
- **Units: millimeters.** Height is `height_in × 25.4` mm and stride = distance ÷ height-mm; a meters
  export makes stride/tilt ~1000× wrong while angles look fine and nothing errors (silent corruption).
- **Skeleton naming: MotionBuilder / HumanIK / BVH.** The `ALIASES` map wants `Hips`, `Spine/Spine1-3`,
  `Head/Neck`, `RightArm`→shoulder, `RightForeArm`→elbow, `RightHand`→wrist, `RightHandMiddle`→hand,
  `RightUpLeg`→hip, `RightLeg`→knee, `RightFoot`→ankle, `RightToeBase`→foot (+ left). Substring match
  means Maya-HIK `Character1_`-prefixed names still map; **Blender/Rigify (`upper_arm.R`) and 3ds Max
  Biped (`Bip001 R UpperArm`) do NOT** → joints land in the ingest `unmappedJoints` array.
- **The tension:** the preset that fixes *naming* and the one that fixes *axis* may differ (Maya=Y-up,
  Blender=Z-up-but-misnamed). Set naming via preset, force Z-up+mm via custom axis/units fields, save
  as one reusable template. *(plausible — Captury's export dialog isn't in public docs; the ingest
  `unmappedJoints` readout + sane stride/tilt magnitudes on a test capture is the ground-truth validator.)*
- **Frame rate:** PrimeX 22 → 360 Hz native (marker/Motive path); Captury markerless on OptiTrack
  Duplex is documented "successfully at 60 fps, results may vary" — so markerless output rate may sit
  far below camera capability. Higher **true** rate sharpens release/MER localization (±1 frame) and
  every `°/s` peak (`Δangle × frameRate`). Verify the exported `frame_rate` — it drives all velocity metrics.
- **Two unbuilt gaps to know:** (1) `outcome.relSpeedMph` is hardcoded `null` — **no TrackMan→throw
  join exists**; velo enters only as the free-text `velo_context` session label. (2) No `up_axis`
  override — the one-line close is to accept it on the upload route if Captury can't emit Z-up.

## Sources

1. OptiTrack — Motive In Depth (calibration, solver, one-click subject calibration). https://www.optitrack.com/software/motive
2. OptiTrack Docs — Motive Data Export (CSV, C3D, FBX, BVH, TRC). https://docs.optitrack.com/motive/data-export
3. OptiTrack Docs — Skeleton Tracking (marker sets, precision solver, CTRL+R). https://docs.optitrack.com/motive/skeleton-tracking
4. OptiTrack Docs — Data Streaming / NatNet (UDP, markers/rigid bodies/skeletons). https://docs.optitrack.com/motive/data-streaming
5. OptiTrack — NatNet SDK (C/C++/.NET/MATLAB/Unity samples). https://www.optitrack.com/software/natnet-sdk
6. OptiTrack Docs — NatNet Latency Measurements (camera latency by frame rate; ~0.2 ms conversion). https://docs.optitrack.com/developer-tools/natnet-sdk/latency-measurements
7. OptiTrack Docs — Captury Live Integration (Duplex/MJPEG, PrimeX/SlimX/VersaX, Motive 3.3+, 3 actors, 60 fps, .mcal, data volumes). https://docs.optitrack.com/plugins/external-plugins/captury-live-integration
8. OptiTrack — Motive installation & license activation (Tracker/Body/Body-Unlimited/Edit tiers). https://docs.optitrack.com/motive/installation-and-activation
9. B&H — Motive Body / Body Unlimited / Tracker / Edit 3.x license SKUs. https://www.bhphotovideo.com/c/product/1803338-REG/optitrack_mtv_ultd_motive_body_unlimited_3_x_license.html
10. Cornershop-Immersion (EU reseller) — Motive:Body 3.x list price (€5,499). https://cornershop-immersion.com/en/software/226--licence-optitrack-motive-body-3x.html
11. Captury — Real-Time Processing (CapturyLive, 4–12+ cameras, calibration, skeleton). https://captury.com/real-time-processing/
12. Captury — Post-Processing (CapturyStudio: FBX/BVH/C3D/CSV, AMTI/Bertec force plates, streaming). https://captury.com/post-processing/
13. Target3D — The Captury Studio (camera compatibility: GigE/HDMI/SDI, Qualisys/OptiTrack IR, XIMEA; export/streaming). https://www.target3d.co.uk/products/the-captury-studio
14. Captury-vs-Vicon concurrent validity (children squats/jumps; RMSE knee 11.8°/hip 17.6°/ankle 7.2°). https://pmc.ncbi.nlm.nih.gov/articles/PMC6689331/
15. C-Motion Visual3D — inverse dynamics / joint moments from C3D + force plates. http://www2.c-motion.com/products/visual3d
16. BASSDRUM — Technical Director's review of Captury (licensing/renewal, export/streaming, SDK). https://note.bassdrum.org/n/n0586d32fcfc7?hl=en

</content>
