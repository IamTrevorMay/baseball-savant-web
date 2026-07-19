---
title: Pitch Design Tech Workflow — TrackMan vs Rapsodo vs Hawk-Eye, Edgertronic, and the Facility Bullpen Pipeline
domain: pitch-design
tags:
  - trackman
  - rapsodo
  - hawkeye
  - spin-efficiency
  - edgertronic
  - seam-shifted-wake
  - bullpen-workflow
  - facility-tech
sources_reviewed: 22
last_updated: 2026-07-19
---

# Pitch Design Tech Workflow — TrackMan vs Rapsodo vs Hawk-Eye, Edgertronic, and the Facility Bullpen Pipeline

## TL;DR

- **The three systems measure spin fundamentally differently**: TrackMan (Doppler radar, ~$20–30K hardware + $475–600/yr B1 software) *infers* spin axis from ball movement; Rapsodo (camera+radar hybrid, PRO 3.0 at $8,500) *photographs* the ball near release and reads axis/seams optically; Hawk-Eye (MLB's 12-camera Statcast array since 2020 — five 8MP cameras at 100 fps for pitch tracking) directly *observes* the 3D spin vector in flight. A pitch's "spin efficiency" is not one number — it is a different measurement on each system (proven).
- **Accuracy is good enough for design work on all modern units, with known holes**: Rapsodo velocity vs Stalker Pro 2 radar shows a mean difference of 0.88 ± 0.55 mph, r = 0.979; TrackMan drops 90%+ of readings on true 12-6 curveballs and can't read very low-spin pitches (splitters/knuckleballs), which Rapsodo captures optically at ~100% in controlled tests (promising — practitioner validation, almost no peer-reviewed literature exists).
- **Seam-shifted wake is measurable and large**: comparing observed vs spin-inferred axis ("axis deviation") shows MLB sinkers gain ~3+ inches of arm-side run and ~4 inches of drop from non-Magnus forces; cutters ~3 inches glove-side and ~2 inches of drop; seam orientation alone can change break by up to ~8 inches on otherwise identical pitches (proven via Hawk-Eye + Utah State PIV lab work).
- **Edgertronic-class high-speed video (500–1,000 fps) is the causal layer**: ball-flight trackers tell you *what* changed; the release video tells you *why* (grip, finger pressure, seam orientation at release). SC1 runs 882 fps at 720p (~$5K); SC1+ hits 2,469 fps; the monochrome variants need 1/4 the light. Driveline's 2026 computer-vision system now auto-extracts spin axis and seam orientation from this video, closing the loop between video and TrackMan data (proven for the pairing; promising for the CV layer).
- **Live-feedback pitch design works and is the industry standard**: the Driveline/Tread model is target selection from movement data → 3–5 pitch blocks per grip/cue variant with immediate ball-flight feedback → high-speed video review between blocks → retest. Small grip changes produce measurable movement deltas within a single 20–40 pitch session (proven as practice; effect on game outcomes is promising).
- **Never mix devices in one athlete trendline without an offset model**: Rapsodo reads spin slightly lower than TrackMan (release-window vs flight-averaged measurement), early Rapsodo units showed 3–5 inch movement disagreements between units, and vertical plate-location differences of 7–8 inches between hardware generations. Tag every row with device + firmware and calibrate per-mound (proven).
- **For a training facility, the practical stack is one ball-flight tracker + one high-speed camera per design mound**: Rapsodo PRO 3.0 ($8,500, adds seam orientation + SSW break) or TrackMan B1 (portable, $475/yr pitching software) plus an Edgertronic SC1-class camera (~$5–6K with lens/lighting) covers 95% of what an MLB org's pitch-design room does (promising).

## 1. How Each System Actually Measures a Pitch

The single most important thing to internalize: **TrackMan, Rapsodo, and Hawk-Eye are not three brands of the same instrument.** They are three different physical measurement strategies, and every downstream disagreement in spin efficiency, movement, and axis traces back to this.

**TrackMan (Doppler radar).** The stadium/facility units use military-derived phased-array Doppler radar, tracking the ball across its entire flight and fitting a trajectory. Spin *rate* comes from radar signal modulation; spin *axis* is not observed — it is inferred from the movement the ball actually exhibited, run backward through a Magnus-force model (proven). This has two consequences: (1) any non-Magnus movement (seam effects) gets silently folded into the "inferred axis," and (2) pitches whose spin geometry defeats the radar fail entirely — Driveline's 2016 testing found TrackMan dropped 90%+ of readings on true 12-6 overspin curveballs and could not produce RPM on very low-spin pitches (splitters, forkballs, knuckleballs) (proven, small-sample controlled test). TrackMan's strengths are full-flight trajectory fidelity (it measures where the ball actually went, the thing hitters care about), an excellent reporting backend, and its status as the de facto standard: college and pro TrackMan CSVs are the lingua franca of player development.

**Rapsodo (optical + radar hybrid).** The Pitching 2.0 unit ($4,000–4,500 era hardware, launched from a ~$3,000 1.0 in 2016–17) and the PRO 3.0 ($8,500, launched June 2022, 3 cameras + 2 radars) sit on the ground ~15 feet in front of the plate and photograph the ball in a window shortly after release. Spin rate, spin axis, and gyro degree are read *directly from images of the ball's seams* — an observation, not an inference (proven). Movement is then computed two ways: "spin-based" (what the observed spin should produce via Magnus) and, on newer firmware, trajectory-informed estimates. Because it reads the ball optically near release, Rapsodo captures exactly the pitches TrackMan loses (12-6 curves, low-spin splitters — 100% capture in Driveline's 20-pitch adversarial test) and produces the gyro/efficiency numbers TrackMan physically cannot (proven). Weaknesses: it only sees a slice of flight, so its picture of *total* movement is partially modeled; detection rate was ~79% of pitches for the 2.0 (up from ~62% on 1.0); and unit-to-unit consistency has historically been the weak point — Driveline's 2019 beta validation found spin-based movement disagreements of roughly 3–5 inches per pitch between units, a consistent ~2-inch inflation of fastball vertical break (fixed in a firmware update), and vertical plate-location discrepancies of 7–8 inches between 1.0 and 2.0 hardware (proven, and a permanent caution).

**Hawk-Eye (pure optical, MLB Statcast since 2020).** Twelve cameras per park: five 8-megapixel cameras at 100 fps dedicated to pitch/ball tracking, seven 11-megapixel at 50 fps for players, generating ~10 gigabits of data per second. It resolves seam patterns frame-by-frame, so it measures the full 3D spin vector *throughout flight* — including spin-axis orientation, spin decay, and the gap between observed spin and observed movement (proven). Positional accuracy: strike-zone location within ±0.25 inches; batted-ball landing points within ~1 foot vs ~15 feet under the radar era. This is why 2020 is a hard discontinuity in public data: Statcast "active spin" before 2020 was movement-inferred; from 2020 it is directly measured from the release spin vector (proven).

**For Soto:** Triton's `pitches` table spans the 2015–2019 TrackMan-Statcast era and the 2020+ Hawk-Eye era. Any spin-axis or active-spin feature built into Stuff+/deception models must treat 2020 as a measurement regime change, not a behavior change. The Compete pipeline ingests facility TrackMan CSVs — inferred-axis semantics — so a facility Rapsodo axis and a Compete TrackMan axis for the same pitch are *definitionally* different numbers.

## 2. Spin Efficiency: One Term, Three Measurements

Spin efficiency (a.k.a. active spin) = true/transverse spin ÷ total spin — the fraction of spin actually producing Magnus movement. Its complement is gyro spin; the mapping is efficiency 100% = gyro degree 0°, efficiency 0% = gyro 90° (proven, definitional).

- **Rapsodo**: optical read of the axis at/near release → direct efficiency and gyro degree. This is the number most facility athletes mean when they say "spin efficiency."
- **TrackMan**: no direct axis observation → efficiency must be *back-solved from movement*. Seam-shifted-wake movement contaminates it: a sinker that runs 3 extra inches from seam effects will look "more efficient" than its actual spin geometry (proven).
- **Hawk-Eye**: measures both — the observed axis *and* the movement — which is precisely what made seam-shifted wake quantifiable at scale (proven).

Practical benchmark ranges (practitioner consensus, promising rather than lab-proven as *targets*):
- **Four-seam fastball**: 85–100% efficiency; typical MLB four-seam 95–100%. Ride-oriented designs want axis near 12:00–12:45 (RHP) with high efficiency; a 1:00+ axis trades ride for run/sink.
- **Sinker/two-seam**: efficiency can stay high but the *movement* signature depends heavily on seam orientation (see §3).
- **Slider/gyro pitches**: deliberately low efficiency (often 0–40%); "cutting" a fastball unintentionally — adding gyro — is the most common efficiency leak when chasing velo (promising).
- **Changeup**: gyro degree tracks efficiency change through flight nearly 1:1, making it the most predictable pitch for efficiency manipulation (promising, Simple Sabermetrics flight-dynamics analysis).

Also note **spin efficiency changes during flight** (spin decay + axis reorientation); Hawk-Eye can see this, Rapsodo snapshots release, TrackMan integrates the whole flight. So a 92% Rapsodo release efficiency and an 88% flight-averaged figure can both be "correct" (proven).

**For Soto:** if Neptune athletes get a spin-efficiency KPI, define it explicitly as *device-specific release efficiency* and store `device`, `firmware`, and `measurement_basis` columns in `compete_pitches`-adjacent schema. Do not let a Rapsodo efficiency number silently populate a field that Compete TrackMan sessions also write.

## 3. Seam-Shifted Wake: Why Observed vs Inferred Axis Became the Central Pitch-Design Metric

The term was coined in 2019 by Andrew Smith working with Prof. Barton L. Smith's fluid-dynamics lab at Utah State, which used particle image velocimetry to show that seams positioned in specific orientations force asymmetric boundary-layer separation, deflecting the ball in ways spin cannot explain (proven, lab-level). Hawk-Eye's 2020 arrival let analysts compute **axis deviation** — inferred (movement-based) axis minus observed axis — as a public SSW detector (proven).

Magnitudes from Driveline's 2021 Hawk-Eye analysis (proven at MLB population level):
- **Sinkers**: ~3+ inches of extra arm-side run and nearly 4 inches of extra drop beyond Magnus; effective MLB sinkers essentially *require* seam effects.
- **Cutters**: ~3 inches extra glove-side, ~2 inches extra drop.
- **Changeups/splitters**: substantial extra drop.
- **Gyro-to-transverse conversion**: at most ~2 inches of glove-side movement even at extreme 2,500 rpm gyro spin.
- Park-to-park calibration error < 2°, so axis-deviation signals are real, not stadium noise.
- Rapsodo's own PRO 3.0 materials claim identical spin axis/rate/velo pitches can differ by up to **8 inches of break** from seam orientation alone (promising — vendor figure, directionally consistent with Driveline).

Design implications: SSW is a *grip and seam-orientation* lever, largely independent of the spin-rate/axis levers, and it is execution-sensitive — small seam-orientation misses produce dramatically different movement, which is why SSW sinkers/changeups have wider movement distributions than four-seams (promising). It can also hurt: Driveline showed SSW pushed some elite sinkers (Darvish, Woodruff, Burnes examples) toward "dead-zone" movement profiles that *lowered* modeled Stuff (promising).

**For Soto:** Triton already has 2020+ Statcast columns to compute axis deviation (spin_axis vs movement-inferred axis) — that is a cheap, high-value SSW feature for Stuff+ v2 and the deception model, and it directly explains why the current movement-Z formulation undervalues seam-effect sinkers. At the facility level, only Rapsodo PRO 3.0 (Jan/May 2023 software updates) reports seam orientation and SSW break on practice mounds; TrackMan B1 does not.

## 4. What the Accuracy Literature Actually Says (and Doesn't)

The honest headline: **there is essentially no peer-reviewed journal literature validating TrackMan vs Rapsodo for baseball pitch tracking.** Targeted searches of PubMed/Sports Biomechanics turn up golf launch-monitor validations (TrackMan 4, FlightScope Mevo+) but nothing equivalent for baseball units; validation lives in practitioner and vendor-adjacent studies (proven absence, as of mid-2026). Grade all cross-device claims accordingly.

The best available evidence:
- **Driveline 2016** (controlled bullpens, ~30 pitches per pitch type + 20-pitch adversarial set): Rapsodo velocity initially read significantly low vs TrackMan (later fixed and validated against Stalker Pro 2); Rapsodo spin slightly lower than TrackMan (expected — release-window vs flight-averaged with spin decay); TrackMan lost 12-6 curves and low-spin pitches, Rapsodo caught all of them (promising — careful but small-N, pre-2.0 hardware).
- **Driveline 2019, Rapsodo 2.0 beta (Jan–May 2019)**: detection rate 79% vs 62% (1.0); inter-unit spin-based movement disagreement ~3–5 inches/pitch, improved ~1 inch by March with raw-spin/efficiency/location errors "nearly halved"; fastball vertical break inflated ~2 inches until a firmware fix; 9-parameter-fit trajectory metrics still occasionally misread; the lift kit is mandatory for calibration (proven for those units; treat magnitudes as era-specific).
- **Tufts Baseball Analysis Club / Hardball Times** (4 pitchers, 2 bullpens): Rapsodo velocity comparable to Stalker; spin "reliable and precise"; ~100 rpm session-to-session true-spin drift on one fastball shows why single-session spin numbers shouldn't be over-read (promising, tiny N).
- **Samford sports-analytics pitchLogic validation**: Rapsodo velo vs Stalker mean diff 0.88 ± 0.547 mph, correlation 0.979; pitchLogic mean diff 0.932 mph (95% CI 0.012–1.852) with a consistent 1–4 mph high read (promising).
- **Hawk-Eye system claims** (MLB/Kagan): ±0.25 in strike-zone accuracy, ±1 ft landing accuracy, direct per-component spin measurement, spin-decay detection (promising — vendor/league figures, but consistent with downstream data quality).

Working conclusions (promising): modern units agree on **velocity to within ~1 mph** and **spin rate to within ~1–3%**, diverge most on **movement and derived efficiency** (different measurement bases), and the largest practical error source in a facility is not the sensor — it's setup: unlevel units, wrong mound calibration, mixed ball types (raised-seam vs flat-seam balls change both spin reads and SSW behavior), and firmware drift.

**For Soto:** this is the evidence-grading posture Trevor expects — device numbers are precise enough to steer a session, not precise enough to compare across devices, eras, or firmware without an offset model. A 30–50 pitch paired-capture (Rapsodo + TrackMan on the same bullpen) per mound, refreshed after firmware updates, yields the per-device offsets to store in Triton and apply at query time.

## 5. Edgertronic and the Video Layer: Seeing the Cause

Ball-flight data is outcome; high-speed release video is mechanism. Driveline's pairing of Edgertronic cameras with TrackMan ballistics circa 2015–2016 *is* the origin of modern pitch design, and by 2019 the combination had spread to essentially every MLB org (Astros pitch development, Verlander's slider tweaks, Bauer's slider build being the famous cases) (proven as adoption history).

Hardware and settings that matter:
- **Edgertronic SC1**: 882 fps at 720p, originally ~$5,000. **SC1+**: 2,469 fps at 720p. **SC2+**: 5,134 fps. For pitching, **500–1,000 fps is sufficient** — you're resolving fingertip-ball interaction and first rotations, not impact physics (proven, vendor + practitioner consensus).
- **Monochrome over color**: needs ~1/4 the light and yields sharper seams — significant because lighting is the real constraint indoors. Edgertronic's own baseball guidance recommends the SC1+ monochrome 16GB as the best baseball choice.
- **Lens**: medium zoom (e.g., 80–200mm f/2.8, $50–1,200 used) from behind/beside the mound, framed tight on the release window.
- **Trigger/workflow**: post-trigger capture with a remote button; CAMAPI enables auto-named background saves and HTTP download — a couple of seconds after release, the pitcher is watching his own 1,000 fps release (proven).

What you read off the video: grip and finger pressure at last contact, which finger the ball leaves last, seam orientation at release (the SSW lever), wrist orientation (cut/supination vs pronation), and true release height/slot to sanity-check tracker extension numbers.

The 2024–2026 development: **computer vision on the video itself**. Driveline's 2026 system (built by manually labeling thousands of pitch videos) auto-extracts spin axis and seam orientation from Edgertronic footage — data scientist Jack Lambert used it to replicate Tatsuya Imai's outlier slider in ~50 throws, with CV-derived seam/axis targets guiding grip changes between blocks; pitching director Connor White's summary was that "the speed of analysis" is the point — video-derived seam data at bullpen pace without MLB Hawk-Eye access (promising — new, single-shop, but the direction of travel is clear). Rapsodo PRO 3.0 also supports Edgertronic integration for synchronized capture.

**For Soto:** Neptune does not need CV at open; it needs the *capture discipline* — every design pitch gets a synchronized video + tracker row with shared pitch IDs, so the CV layer (or manual seam annotation in Triton) can be added later over an already-clean archive. Trevor's own content engine benefits: 1,000 fps release footage is also premium media material.

## 6. Designing Sessions With Live Data: The Modern Template

The converged industry process (Driveline "Pitch Design 1.0," Tread's remote variant, MLB org practice) (proven as standard practice; game-outcome effect sizes remain promising):

1. **Target selection from data, not vibes.** Plot the athlete's arsenal in movement space against level-appropriate league distributions; find the gap (e.g., "everything runs arm-side; needs a glove-side or depth pitch"), then pick a target *shape* — often cloned from a same-slot MLB comp. Driveline's remote case study (Justin Silva): baseline session graded the slider above-average, flagged the platoon hole vs LHH, A/B-tested cutter vs changeup grips, and kept the changeup because it showed the "considerably higher ceiling" on data.
2. **One variable per block.** Blocks of 3–5 pitches per grip/cue/seam-orientation variant. Ball-flight numbers reviewed after each block (seconds), video reviewed between blocks or next-day. Change grip *or* cue *or* intent — never all three at once.
3. **Intent stays game-like.** Design throws at 85–100% intensity; movement profiles at 70% effort don't transfer (practitioner consensus, promising).
4. **Session dosage**: typically 20–40 total pitches of design work inside a normal bullpen, 1–2×/week during a design phase, layered on top of (not replacing) the athlete's throwing program. Expect a usable new shape in 2–6 weeks; expect command of it to lag shape by months (promising).
5. **Kill criteria.** If 2–3 sessions of grip iterations can't move the shape without wrecking velocity or command, the constraint is usually mechanical (slot, wrist orientation, supination ability) — route to mechanics work or pick a different pitch. Tread's remote model shows the loop even works on video + data submission alone (one documented athlete made 90% of a 9 mph gain, 89→98, remotely in ~10 months — velocity program, but the same feedback architecture) (promising, promotional single cases).
6. **Retest under pressure**: the pitch graduates via live at-bats / pitch-tracked competition, not bullpen aesthetics.

**For Soto:** this is an app spec. A Compete "Design Session" mode needs: target shape overlay on the movement plot, per-block tagging (grip variant as a first-class field), instant block-vs-block deltas (HB/VB/velo/spin/efficiency), and a session report that writes to the athlete's longitudinal record. That's the differentiated software layer commodity facilities don't have.

## 7. The Neptune Bullpen Data Workflow (Practical Spec)

**Stack per design mound** (choose one tracker tier):
- *Tier 1 (recommended start)*: Rapsodo PRO 3.0 — $8,500 + team membership (up to 5 devices/150 profiles tier; pricing by quote). Gets seam orientation, SSW break, gyro degree, Edgertronic sync, hitting on the same unit.
- *Tier 2*: TrackMan B1 portable — hardware by quote, software $475/yr (pitching) or $600/yr (pitching+hitting); full-radar TrackMan (facility installs run ~$19–30K) buys pro-standard trajectory data and CSVs that drop straight into the existing Compete ingest.
- *Video*: Edgertronic SC1/SC1+ monochrome (~$5–6.5K with lens; Driveline sells a baseball kit), 500–1,000 fps, remote trigger, tripod behind-and-beside release. Budget alternative for younger tiers: 240 fps phone slo-mo — grip yes, seam orientation no (promising).
- *Redundancy*: a Stalker/Pocket Radar as the velocity ground truth for periodic device audits (0.88 mph Rapsodo agreement is good; verify it stays that way).

**Standing procedure:**
1. **Calibration ritual** (weekly + after any move/firmware update): level/lift-kit check, plate-distance verification, 5-pitch known-athlete sanity set; log firmware versions.
2. **Ball control**: one ball model per session type; note it — seam profile changes both spin reads and SSW behavior.
3. **Session capture**: every pitch tagged (pitch type, grip variant, intent %); misreads flagged, not deleted; video and tracker rows share a pitch ID and timestamp.
4. **Ingest**: session CSV → Compete pipeline same-day (`compete_pitch_sessions` / `compete_pitches`), with device/firmware/ball columns added to schema.
5. **Report**: auto-generated movement plot vs target + block deltas + Stuff-style grade; coach annotates in under 5 minutes; athlete gets it in-app.
6. **Longitudinal QA**: monthly per-device drift review (velo vs radar gun, spin vs historical athlete baselines); paired-capture offset refresh whenever a second device is available.

**Assessment → programming → monitoring fit**: intake bullpen (all pitches, 15–25 throws, full capture) → design phase targets → in-season/lesson-block monitoring where every bullpen quietly extends the athlete's dataset. The dataset itself — years of tracked development — becomes Neptune's moat and Triton's training data.

**For Soto:** the 3–10x facility pricing premium Carl's research identified is *earned* exactly here: commodity cages sell reps; Neptune sells a measured feedback loop with a persistent data record. Every element above is shippable incrementally on the existing Compete tables, and Trevor's own pitch-design sessions are the ideal pilot data (plus content).

## 8. Cross-Device Data Hygiene Rules (Non-Negotiable)

1. **Device is part of the datum.** Store device model + firmware + install/calibration date on every row (proven necessity given documented 3–5 inch inter-unit movement spreads).
2. **Never trend across devices raw.** Rapsodo↔TrackMan comparisons require a paired-capture offset model per metric; velocity transfers cleanly (~1 mph), movement and efficiency do not (proven).
3. **2020 is a wall in MLB data.** Pre-2020 spin axis = inferred; 2020+ = observed. Axis-deviation/SSW features exist only post-2020 (proven).
4. **Efficiency numbers must carry their basis** (release-optical vs movement-inferred vs flight-averaged) or they will be misused (proven).
5. **Prefer trajectory truth for outcomes, optical truth for causes.** Grade a pitch's quality on where/how it actually moved (TrackMan/Hawk-Eye lineage); diagnose and adjust it with release-side observation (Rapsodo axis/seams + Edgertronic) (promising as a doctrine, but it resolves every apparent inter-device "contradiction" cleanly).

## Sources

1. Driveline Baseball — Rapsodo, Trackman, and Pitch Tracking Technologies: Where We Stand (2016): https://www.drivelinebaseball.com/2016/11/rapsodo-trackman-pitch-tracking-technologies-stand/
2. Driveline Baseball — Validating Rapsodo 2.0: Pitch Design Made Easier (2019): https://www.drivelinebaseball.com/2019/07/validating-rapsodo-2-0-pitch-design-made-easier/
3. The Hardball Times — Comparing the Rapsodo Baseball Device to Other Pitch Trackers: https://tht.fangraphs.com/comparing-the-rapsodo-baseball-device-to-other-pitch-trackers/
4. Samford University Center for Sports Analytics — Validating pitchLogic: Assessing the New "Smart" Baseball (2020): https://www.samford.edu/sports-analytics/fans/2020/Validating-pitchLogic-Assessing-the-New-Smart-Baseball
5. The Hardball Times (David Kagan) — There's Lots of Physics To Do Now That Hawk-Eye Is Up and Running: https://tht.fangraphs.com/theres-lots-of-physics-to-do-now-that-hawk-eye-is-up-and-running/
6. Driveline Baseball — An Introduction to Seam-Shifted Wakes and their Effect on Sinkers (2020): https://www.drivelinebaseball.com/2020/11/more-than-what-it-seams-an-introduction-to-seam-shifted-wakes-and-their-effect-on-sinkers/
7. Driveline Baseball — The Impact of Seam-Shifted Wakes on Pitch Quality (2021): https://www.drivelinebaseball.com/2021/03/the-impact-of-seam-shifted-wakes-on-pitch-quality/
8. Pitching.Dev — Seam Shifted Wake: https://pitching.dev/seam-shifted-wake
9. Wikipedia — Seam-shifted wake (Barton L. Smith / Andrew Smith, Utah State): https://en.wikipedia.org/wiki/Seam-shifted_wake
10. MLB.com — New Statcast tool measures pitch spin direction: https://www.mlb.com/news/new-statcast-tool-measures-pitch-spin-direction
11. Baseball Savant — Statcast Active Spin Leaderboard (measured vs inferred active spin methodology): https://baseballsavant.mlb.com/leaderboard/active-spin
12. Driveline Baseball — Mastering the Axis of Rotation: A Thorough Review of Spin Axis in Three Dimensions (2019): https://www.drivelinebaseball.com/2019/09/mastering-the-axis-of-rotation-a-thorough-review-of-spin-axis-in-three-dimensions/
13. Rapsodo — PRO 3.0 Baseball Flight Monitor (specs and $8,500 pricing): https://rapsodo.com/products/rapsodo-pro-3-ball-flight-monitor
14. GlobeNewswire — Rapsodo PRO 3.0 Software Update: Seam Orientation and Seam-Shifted Wake Break (Jan 2023): https://www.globenewswire.com/news-release/2023/01/26/2596110/0/en/Rapsodo-s-PRO-3-0-Software-Update-Includes-New-Analytics-That-Track-Seam-Orientation-and-Seam-Shifted-Wake-Break.html
15. Rapsodo — Understanding Rapsodo Pitching Data: Spin Rate & Efficiency Profile (Fastball): https://rapsodo.com/blogs/baseball/understanding-rapsodo-pitching-data-spin-rate-efficiency-profile-fastball
16. Rapsodo — Understanding Gyro Spin & Gyro Degree: https://rapsodo.com/blogs/baseball/understanding-gyro-spin-gyro-degree-the-hidden-forces-behind-pitch-movement
17. Simple Sabermetrics — Spin Efficiency, More Than Just a Number (Part 2): https://simplesabermetrics.com/blogs/simple-sabermetrics-blog/spin-efficiency-more-than-just-a-number-part-2
18. Driveline Baseball — Investigating a Mystery Pitch: A Test Case for a New (Computer) Vision for Pitch Design (April 2026): https://www.drivelinebaseball.com/2026/04/investigating-a-mystery-pitch-computer-vision-pitch-design/
19. Edgertronic Wiki — Case Study: Baseball (camera settings, models, workflow): https://wiki.edgertronic.com/wiki/Case_Study_-_Baseball
20. Edgertronic — Our Cameras / Specifications (SC1/SC1+/SC2+ frame rates): https://wiki.edgertronic.com/wiki/Specification
21. TrackMan — Portable B1 product and software subscription pages ($475–600/yr): https://www.trackman.com/baseball/Portable-B1 and https://shop.trackmangolf.com/products/software-subscription-b1-baseball-only
22. Driveline Baseball — Executing a Remote Pitch Design with Online Training (2023): https://www.drivelinebaseball.com/2023/01/executing-a-remote-pitch-design-with-online-training/
23. Baseball America — High-Speed Cameras Spread Quickly Around Baseball: https://www.baseballamerica.com/stories/high-speed-cameras-spread-quickly-around-baseball/
24. Sports Illustrated — From Trackman to Edgertronic to Rapsodo, the Tech Boom Is Fundamentally Altering Baseball (2019): https://www.si.com/mlb/2019/03/29/technology-revolution-baseball-trackman-edgertronic-rapsodo
25. Tread Athletics — Remote pitching development model: https://treadathletics.com/pro-v1/
