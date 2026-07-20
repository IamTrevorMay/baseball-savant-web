---
title: Physics of Pitch Flight — Magnus, Drag, Seam-Shifted Wake, and the Tracking Vocabulary
domain: pitch-design
tags:
  - pitch-flight-physics
  - magnus-effect
  - seam-shifted-wake
  - spin-efficiency
  - gyro-degree
  - trackman-rapsodo-statcast
  - environmental-effects
  - movement-metrics
sources_reviewed: 22
last_updated: 2026-07-19
---

# Physics of Pitch Flight — Magnus, Drag, Seam-Shifted Wake, and the Tracking Vocabulary

## TL;DR

- **Three forces act on every pitch: gravity, drag, and lift (Magnus + seam effects).** Drag on a ~95 mph fastball is roughly the ball's own weight and strips ~9–10% of release velocity by the plate (~8% at Coors); the Magnus lift coefficient is roughly constant at C_L ≈ 0.22 across normal pitch spin (spin parameter S = 0.10–0.25), while drag coefficient C_D runs ~0.30–0.45 depending on seams and speed (proven).
- **Only transverse spin moves the ball; gyro spin does nothing aerodynamically.** Spin efficiency = transverse ÷ total spin = cos(gyro degree) — so a 45° gyro pitch still keeps ~71% efficiency, not 50%. Efficiency is nonlinear and can *rise 8–10% in flight* on gyro-heavy breaking balls as the axis re-orients relative to the flight path (proven).
- **Seam-shifted wake (SSW) is a real, separate, non-Magnus force** (Barton Smith / Andrew Smith, Utah State, term coined 2019). League-average 2020 sinker picked up **>3 in of extra run and ~4 in of extra depth** from non-Magnus effects; cutters ~3 in glove-side + 2 in drop; extremes reach ~9 in. Detected as "axis deviation" between observed (Hawk-Eye) and movement-inferred spin axes — sinker league average ≈ 17.6° in 2020 (proven).
- **"Observed" vs "inferred" is the central measurement distinction.** Pre-2020 Statcast (TrackMan radar) *inferred* spin axis from movement; since 2020 Hawk-Eye (12 cameras, up to 300 fps) *observes* axis and seam orientation directly. The gap between the two is how SSW is quantified. Standard movement math ("Technique 1") also has physics flaws: it overestimates fastball IVB and underestimates curveball movement by ~25%, making a true-100%-efficiency curve read ~75% (Nathan) (proven).
- **Environment moves the needle by inches, not decimals.** Coors air density is ~82% of sea level → 4-seam IVB drops ~3–4 in (2024 Rockies: 13.0 in home vs 16.4 in road), curveballs lose ~4 in of drop, fly balls carry ~5% farther. Rule of thumb: ~1 in of Magnus movement lost per 1,000 ft of altitude; each +10°F adds ~3 ft of batted-ball carry; humidity is nearly irrelevant to movement (~⅛ in per 20% RH) (proven).
- **The ball itself is a variable.** A 0.01 change in league-mean C_D (~3%) moves a typical HR fly ball 4–5 ft and HR probability 10–12%; mean C_D explains over half of year-to-year HR/FB variance. Ball-to-ball σ(C_D) ≈ 0.012 (≈5 ft of carry). All 30 parks store balls in humidors (70°F/57% RH) since 2022; Statcast published a public drag dashboard in 2023 (proven).
- **Benchmarks:** average four-seam spin ≈ 1,977 rpm (HS), ≈ 2,148 (college), ≈ 2,256 (MLB); MLB Bauer Units (rpm ÷ mph) ≈ 24. 2024 MLB averages: +16 in IVB four-seam, −10 in IVB curveball. Use Bauer Units, not raw rpm, when comparing across levels (proven).
- **2024–2026 developments:** Statcast arm angle released late 2024; sweeper league share grew 2.28% (2021) → 7.5% (2025) on the back of SSW-aware design; kick-change and "death ball" propagated facility-to-majors in 2024–25; first CFD studies of the sweeper published 2025 (promising).

## 1. The Force Budget: Gravity, Drag, Magnus

A pitched baseball in flight feels exactly three things: gravity (constant, 32.2 ft/s² down), aerodynamic drag (opposing the velocity vector), and aerodynamic lift (perpendicular to velocity — the Magnus force plus any seam-driven force). Everything in pitch design is manipulation of the lift vector's direction and magnitude.

Standard force forms (Nathan, *The Effect of Spin on the Flight of a Baseball*, Am. J. Phys. 2008):

- Drag: F_D = ½ ρ A C_D v²
- Lift/Magnus: F_L = ½ ρ A C_L v²

where ρ is air density, A is ball cross-section (~0.0426 ft², 2.9 in diameter), v is speed. Nathan's lab work (pitching machine + high-speed motion capture, speeds 50–110 mph, spins 1,500–4,500 rpm) found the lift coefficient nearly constant, **C_L ≈ 0.22, across the spin-parameter range of real pitches (S = Rω/v between 0.10 and 0.25)** — i.e., Magnus force scales close to linearly with spin rate at fixed velocity (proven). Drag coefficient for MLB balls at pitch speeds spans **~0.30–0.45**; Nathan adopted C_D ≈ 0.40 from PITCHf/x-era analysis, and Statcast-era seasonal means run lower (~0.33–0.35 on the public drag dashboard) because seam height and surface finish vary by production run (proven).

Magnitudes worth memorizing:

- **Drag on a mid-90s fastball is comparable to the ball's weight (~5.125 oz)**; the ball loses roughly **9–10% of its release speed** by the front of the plate at sea level. That is why "perceived velocity" and plate-crossing velo differ from release velo by 8–9 mph (proven).
- **Magnus force peaks around a third of ball weight** for high-spin pitches — enough to hold a 2024 MLB-average four-seamer to **+16 in of induced vertical break** (it still drops, just ~16 in less than a spinless ball would) and to give an average curveball **−10 in IVB** (proven).
- Both forces scale with ρv²: everything aerodynamic weakens identically in thin air, and Magnus movement accrues disproportionately late in flight (force is per-unit-time; displacement integrates twice), which is why break "looks late" even though the force is continuous (proven).

**For Soto:** Triton's Stuff+ (100 + veloZ·4.5 + moveZ·3.5 + extZ·2.0) implicitly assumes movement is measured in a common air mass. Any pitch-level movement z-score computed from raw Statcast `pfx_x/pfx_z` mixes Denver pitches with sea-level pitches — see §6 for the correction case.

## 2. Spin Rate, Spin Axis, and the Geometry of Movement

Total spin is a 3-D vector. Decompose it relative to the flight path:

- **Transverse (active/useful) spin** — the component perpendicular to the velocity vector. This is the only part that generates Magnus force (proven).
- **Gyro spin** — the component along the velocity vector (football spiral / bullet spin). It produces **zero Magnus movement** by itself (proven), though it matters for SSW (§4) and for in-flight efficiency change.

The direction of the transverse component is reported as **spin direction / tilt**, on a clock face from the catcher/pitcher convention of the vendor: 12:00 = pure backspin (ride), 6:00 = pure topspin (curveball drop), 3:00/9:00 = pure sidespin. Degree ↔ clock conversion (Driveline convention): 180° = 12:00, 270° = 3:00, 90° = 9:00; **each clock hour = 30°, each minute = 0.5°** (proven). Movement is (to first order) perpendicular to the spin axis, in the direction the front of the ball turns — a RHP four-seamer at 1:00 tilt rides and runs; a RHP slider near-gyro at 9:00-ish with low efficiency sweeps modestly.

Spin rate itself is the least manipulable input. Practitioner consensus and Driveline's early work treat raw rpm at a given velocity as close to a fixed athlete trait ("spin is a skill you're mostly born with, sticky stuff excepted") — velocity-normalized spin (**Bauer Units = rpm ÷ mph; MLB average ≈ 23.9–24.0**) is stable within an athlete across velo changes (promising). What *is* trainable is axis (grip/wrist orientation), efficiency (staying behind or around the ball), and seam presentation (grip orientation for SSW) (proven, as the operating basis of the entire pitch-design industry).

**For Soto:** Bauer Units belong in Compete's session summaries. Neptune's HS athletes throwing 82 will post ~1,900 rpm; flagging them "low spin" against an MLB 2,256-rpm anchor is a level error. Store rpm/velo and compare within-level (see §8 benchmarks).

## 3. Spin Efficiency, Gyro Degree, and Active Spin — the Math and the Ranges

Definitions (all three vendors agree on the physics, not the naming — see §7):

- **Spin efficiency** = transverse spin ÷ total spin, 0–100%.
- **Gyro degree** = angle between the total spin axis and the plane perpendicular to velocity; 0° = pure transverse, 90° = pure bullet spin.
- **Relationship: efficiency = cos(gyro degree).** This is the single most misused equation in pitch design — it is *not linear*. 45° of gyro still leaves 70.7% efficiency; you must reach ~60° gyro to fall to 50% efficiency (proven).

Two consequences of the cosine:

1. **Sensitivity is asymmetric.** Near 0° gyro (fastballs), large axis changes barely move efficiency — a fastball needs ~28° of gyro change to move efficiency 20%. Near high gyro (sliders), ~11° of change swings efficiency 20% (Driveline). So slider shape is knife-edge sensitive to release; four-seam ride is robust (proven).
2. **Efficiency changes during flight.** The ball's spin axis is roughly fixed in space (gyroscopic stability), but the velocity vector bends downward ~8–10° from release to plate. A pitch released with meaningful gyro re-orients *relative to the flight path*: Driveline measured breaking balls with 1,500+ rpm of gyro spin **gaining ~8–10% spin efficiency mid-flight** ("gyro-to-transverse conversion") — which adds real, late glove-side movement to sliders/cutters (median ~0.75 in of extra glove-side break) (proven).

Typical release efficiencies by pitch type (Rapsodo/Driveline practitioner ranges; treat as descriptive, not prescriptive) (promising):

| Pitch | Typical spin efficiency | Typical gyro degree |
|---|---|---|
| Four-seam | 85–100% | 0–30° |
| Sinker/two-seam | 80–95% | 15–35° |
| Changeup | 85–100% | 0–30° |
| Cutter | 40–70% | 45–65° |
| Slider/sweeper | 15–60% | 55–80° |
| Curveball | 60–90% | 25–50° |

Statcast's version, **Active Spin**, is *inferred from movement*, not observed — which means SSW pollutes it: a sinker whose seams add non-Magnus run can post active spin **above 100%** because it moves more than its true transverse spin explains. Rapsodo/TrackMan release-measured efficiency and Savant active spin are therefore *not the same number* and should never be benchmarked against each other (proven).

**For Soto:** if Compete ever surfaces an "efficiency" column from TrackMan CSVs, label it release-measured; if a Triton page derives efficiency from Statcast movement, label it movement-inferred. Mixing them in one leaderboard is a category error that Trevor will catch instantly.

## 4. Seam-Shifted Wake: the Non-Magnus Force

**Mechanism.** At pitch speeds the boundary layer hugging the ball separates somewhere past the equator, leaving a wake. A seam sitting in the right region near the ball's flight-path centerline for most of the rotation trips the boundary layer to **separate earlier on that side**, deflecting the wake asymmetrically. Newton's third law: wake deflects one way, ball deflects the other — **toward the tripping seam's side**, independent of Magnus (Barton L. Smith, mech/aero engineering, Utah State; PIV wind-tunnel studies; Andrew W. Smith coined "seam-shifted wake" in 2019; peer-reviewed in *Proc IMechE Part P: J Sports Eng & Tech*, 2021) (proven).

**Magnitudes (Driveline, 2020 MLB Hawk-Eye sample):**

- League-average **sinker: >3 in extra arm-side run and ~4 in extra depth** beyond Magnus prediction; league-average sinker 2-D axis deviation ≈ **17.6°** (proven).
- **Cutters: ~3 in extra glove-side, ~2 in extra drop** (proven).
- **Changeups/splitters:** substantial extra drop, less extra run (proven). Freddy Garcia's 2011 splitter is the canonical historical example; Trevor Bauer's "Laminar Express" two-seamer (2010–2015, refined with Kyle Boddy) was empirical SSW before the theory existed.
- **Extremes: up to ~9 in** of combined non-Magnus movement (proven).
- Sliders/curveballs show minimal *league-wide* SSW, with individual outliers (the sweeper is the deliberate exception — see §8) (proven).
- Grip fingerprint: among the top 20 MLB pitchers by expected-vs-actual movement deviation, **12 threw one-seam sinker variants** (promising).

**Detection.** SSW is invisible to any single measurement of movement; it appears only as disagreement between two estimates: the **observed spin axis** (Hawk-Eye cameras reading the ball directly) vs the **inferred spin axis** (the axis that Magnus-only physics says *should* have produced the observed movement). That difference — "axis deviation" — is the standard SSW proxy (proven). Requirements: a tracker that observes the axis (Hawk-Eye; TrackMan V3/B1 units; Rapsodo reads seams optically) and careful drag/environment removal before attribution.

**Design levers** (grip/seam orientation work, §ordered by evidence): one-seam sinker orientations (proven at MLB scale), gyro-loaded changeups where the slow, gyro-tilted axis lets a seam sit in the tripping zone (promising), four-seamers oriented for extra ride/cut (plausible — sensitive: "if you miss your mark with seam orientation, it's utterly different"), sweepers blending gyro + seam effects for horizontal (proven by adoption; CFD confirmation emerging 2025).

**Quality warning.** SSW is not free value: Driveline found **~42% of 2020 pitches graded *lower* on Stuff+ using observed movement than their spin-based estimate** — seam effects commonly drag sinkers toward the "dead zone" (vertical ≈ horizontal break, the shape hitters see best) (proven).

**For Soto:** Triton Stuff+ uses *observed* Statcast movement, so SSW value/damage is already priced in — that's the right default. The interesting add is a **`ssw_deviation` feature**: Statcast publishes both spin-based and observed movement components, so axis deviation per pitch type is computable from data already in `pitches` (columns exist in Savant exports as `api_break_*` vs spin-derived). It's a candidate deception/uniqueness input for `pitcher_season_deception`, and at Neptune it's the metric that tells an athlete whether a grip tweak actually changed the wake, not just the axis.

## 5. Observed vs Inferred: What the Trackers Actually Measure

The measurement history matters because it defines what every column in Triton's database means:

- **PITCHf/x (2007–2016):** stereo cameras; ~9-parameter trajectory fit; spin *inferred* from movement.
- **TrackMan Doppler radar (Statcast 2015/2017–2019):** measures total spin rate directly (radar), but spin *axis* still inferred from movement; gyro invisible.
- **Hawk-Eye (Statcast 2020–):** 12 cameras at up to 300 fps; **directly observes** trajectory, spin axis, and seam orientation with sub-inch positional precision; park-level spin-direction error averages **<2°** (proven). This switch is the single event that made SSW quantifiable at league scale.

**The movement-calculation problem (Nathan).** Even with perfect tracking, the *standard* movement definition ("Technique 1": deviation from a gravity-removed straight line, the TrackMan/Statcast convention) has systematic physics errors, demonstrated on 2,110 simulated pitches at known 100% efficiency:

- It **overestimates four-seam vertical movement** (drag has an upward component against a falling ball, mis-attributed to spin) (proven).
- It **underestimates curveball movement by ~25%**, so a true-100%-efficiency curveball back-solves to ~75% "inferred efficiency" (proven).
- Nathan's "Technique 2" (decompose acceleration into drag + Magnus + gravity each timestep) recovers truth with R² > 0.99, slope ≈ 1.00, intercept ≈ 0. Adoption by vendors has been slow (proven).

Practical reading: **cross-pitch-type efficiency comparisons made from movement-inferred numbers are biased** — fastballs flattered, curveballs penalized. Within a pitch type, tracked longitudinally on the same system, the numbers are fine for development.

**Statcast/Savant movement vocabulary** (what Triton ingests): `pfx_x`, `pfx_z` (movement in feet measured over the last ~40 ft, catcher's-view sign convention — RHP arm-side run is *negative* raw `pfx_x`; Savant's UI "Break" leaderboards re-sign by handedness, a chronic source of silent sign bugs); **Induced Vertical Break (IVB)** = vertical movement vs a spinless ball (2024 MLB: 4-seam +16 in, curve −10 in); **total vertical break** includes gravity; **arm angle** (added late 2024) measured from the shoulder at release (Yamamoto 47°, high three-quarters) (proven).

**For Soto:** Triton already converts to `pfx_x_in`/`pfx_z_in` client-side — document the sign convention in `docs/VARIABLES.md` next time it's touched. For Compete, TrackMan's CSV `InducedVertBreak`/`HorzBreak` are Technique-1 numbers in inches; they are directly comparable to Statcast IVB, *not* to Rapsodo's trajectory-derived break (Rapsodo measures spin and *derives* movement — the inverse pipeline). Same athlete, same pitch, TrackMan vs Rapsodo will disagree by 1–3 in; that's the instruments, not the athlete (promising, per Driveline/THT paired-device tests).

## 6. Environment: Air, Altitude, Temperature, Humidity — and the Ball

All aerodynamic forces scale linearly with air density ρ. Density falls with altitude and temperature, barely with humidity (humid air is *less* dense — water vapor is lighter than N₂/O₂).

**Altitude (Coors Field, 5,280 ft):** ρ ≈ **82% of sea level** (0.0627 vs 0.0764 lb/ft³ at 70°F) → every Magnus and SSW inch scales by ~0.82 (proven):

- Four-seam IVB: **−3 to −4 in** (2024 Rockies pitchers: 13.0 in IVB at home vs 16.4 in on the road) (proven).
- Curveballs drop **~4 in less**; sidespin pitches sweep **~4 in less**; fastballs *drop ~4 in more* (less backspin lift) (proven).
- Velocity retention improves: ~8% speed loss to the plate vs ~10% at sea level (≈ +1 mph plate velo) (proven).
- Fly balls carry **~5% farther** (~+30 ft on a home-run trajectory; Coors carry ~7.5% above league mean) (proven).
- Rule of thumb below Denver: **~1 in of Magnus movement lost per 1,000 ft of elevation** (promising).

**Temperature:** each **+10°F above 75°F ≈ +3 ft of batted-ball carry**; pitch movement is "slightly reduced" per 10°F (fractions of an inch — direction matters more than magnitude for pitch design) (proven).

**Humidity in the air:** trivial for movement — ~⅛ in per 20% RH swing (proven). **Humidity in the ball** is what matters: water uptake raises mass ~2.8 g and cuts COR. Nathan's humidor physics: wetter ball aerodynamics *add* ~2 ft of carry, but the COR loss *removes* ~6 ft — net suppression. Coors' 2002 humidor (70°F/50% RH) predicted a **27.5 ± 4.3% HR reduction; observed ~25%** (proven). Since **2022 all 30 parks humidor at 70°F/57% RH** (proven).

**The ball as a variable:** C_D varies ball-to-ball (hand assembly, seam height): σ(C_D) ≈ **0.012** (TrackMan-era estimate) ≈ **5 ft of fly-ball carry between two balls from the same box**. A **0.01 shift in league-mean C_D (~3%) moves a typical HR-distance fly ball 4–5 ft and HR probability 10–12%**; mean C_D explains **over half** of year-to-year HR/FB variance. MLB's 2019 committee blamed seam-height inconsistency for the juiced-ball era; Rawlings loosened the first wool winding in 2021 (COR −0.01–0.02, −2.8 g). Statcast's public **drag dashboard** (2023) now tracks seasonal C_D; MLB acknowledged 2025's higher drag cost fly balls ~4 ft (proven).

**For Soto:** three concrete implications. (1) **Stuff+ park bias:** movement z-scores for Rockies-heavy samples are deflated ~18% on the movement term; a cheap fix is a per-park (or per-air-density) movement normalization before z-scoring — worth checking whether COL pitchers' Stuff+ residuals are systematically low in `pitch_baselines`-based scores. (2) **League-average drift across seasons is partly the ball,** not the players — season-partitioned baselines (which Triton already uses via `pitch_baselines` per game_year) are the right call; never pool 2019 with 2021+ movement. (3) **Neptune winter sessions:** an unheated or cold facility (~40°F) has denser air than a July game — an athlete's TrackMan IVB indoors in January will read ~1–2% higher than summer game conditions; note it in athlete reports rather than celebrating phantom gains (plausible, direct ρ-scaling estimate).

## 7. Vocabulary Rosetta Stone: TrackMan vs Rapsodo vs Statcast

| Concept | TrackMan | Rapsodo | Statcast (Savant) | Units / convention |
|---|---|---|---|---|
| Total spin | Spin Rate (radar-measured) | Total Spin | Spin Rate (release_spin_rate) | rpm |
| Useful spin | Spin Efficiency (V3+ optical) | True Spin + Spin Efficiency % | **Active Spin %** (movement-inferred; can read >100% under SSW) | % of total |
| Gyro component | Gyro Degree (newer units) | Gyro Degree | not surfaced directly | 0–90° |
| Axis direction | Spin Direction / Tilt | Spin Direction (clock) | Spin Axis (degrees; 180° = 12:00) + observed axis via Hawk-Eye | clock (hr = 30°, min = 0.5°) or ° |
| Vertical movement | Induced Vertical Break (IVB); also VertBreak w/ gravity | Vertical Break (derived from spin) | Induced Vertical Break; `pfx_z` | inches (pfx in feet, raw) |
| Horizontal movement | Horizontal Break | Horizontal Break (derived) | Horizontal Break; `pfx_x` (catcher's view, RHP run = negative raw) | inches |
| Measurement paradigm | Radar tracks trajectory; movement measured, spin axis historically inferred | Optics read spin/seams directly; **movement derived** from spin | Hawk-Eye observes trajectory *and* axis/seams; both observed & spin-based movement published | — |
| SSW proxy | axis deviation (compute) | "spin-based vs actual" gaps | observed-vs-spin-based movement difference | ° or inches |
| Extras | Extension, Release Height, VAA | Release data, strike-zone analytics | Extension, VAA/HAA, Arm Angle (2024+), drag dashboard (2023+) | ft, ° |

Key traps: (1) Rapsodo *derives* break from spin — it will systematically miss SSW movement that TrackMan/Hawk-Eye *measure*; a big Rapsodo-vs-TrackMan break gap on the same pitch is itself an SSW signal (promising). (2) Savant Active Spin ≠ Rapsodo release efficiency (§3). (3) Sign conventions differ by vendor and by Savant UI vs raw CSV; standardize once at ingest (proven pain).

**For Soto:** Compete ingests TrackMan CSVs — pin the Compete column glossary to TrackMan vocabulary and add a mapping note for athletes bringing Rapsodo numbers from home units. This table is the seed for a `docs/` glossary section.

## 8. Benchmarks by Level and 2024–2026 Developments

**Four-seam spin rate by level (averages):** HS ≈ **1,977 rpm**, college ≈ **2,148 rpm**, MLB ≈ **2,256 rpm**; "good" MLB four-seam range ~2,200–2,600, elite 2,700+ (proven, large tracked samples). **Bauer Units:** MLB mean ≈ **24**; use rpm/mph for any cross-level comparison — a HS arm at 84 mph and 2,050 rpm (24.4 BU) has *better* spin traits than an MLB-average arm despite lower raw rpm (promising). Fastball efficiency ≥85% is the usual "ride candidate" bar (promising).

**Recent developments to track:**

- **Sweeper industrialization:** league share 2.28% (2021, retro-classified) → **7.5% (2025)** — the first pitch class designed *around* SSW + gyro rather than discovered by accident (proven). First dedicated CFD study of sweeper aerodynamics published 2025 (Yin et al., *Proc IMechE P*) (promising).
- **Kick-change (2024–25):** spiked-finger changeup cue propagating facility → social video → MLB bullpens; mechanism is axis + seam manipulation for fade/tumble at high efficiency (promising).
- **Arsenal expansion:** 2025 set records for pitches per pitcher (splinker, death-ball curve, cutters added league-wide — e.g., 2024–25 Mariners: Gilbert +2-seam/cutter/sweeper, Miller +split/cutter/death ball) (proven).
- **Statcast arm angle (late 2024):** release-geometry context for movement — e.g., Yamamoto's 47° slot explaining +5.9 in curve drop vs average RHP (proven). Directly relevant to deception modeling: movement *relative to arm slot expectation* is the modern framing.
- **Drag dashboard (2023+):** season-level C_D is now public; 2025 drag uptick cost fly balls ~4 ft (proven).

**For Soto — consolidated build list:** (1) `ssw_deviation` per pitcher × pitch_type from spin-based vs observed movement already in Statcast data — feeds deception/uniqueness. (2) Air-density or park adjustment on the Stuff+ movement term (validate on COL splits first). (3) Arm-angle-relative movement as a Stuff+/deception feature now that Statcast publishes it (2024+ rows). (4) Compete glossary pinned to TrackMan vocabulary + Bauer Units and level-banded spin benchmarks for Neptune athlete reports. (5) For Trevor's own bullpen work: TrackMan axis-deviation before/after any grip change is the ground truth of whether a seam orientation experiment did anything — efficiency alone can't see it.

## Sources

1. Nathan, A. M., "The Effect of Spin on the Flight of a Baseball," Am. J. Phys. (2008) — https://baseball.physics.illinois.edu/ajpfeb08.pdf
2. Nathan, A. M., "Analysis of Baseball Trajectories" — https://baseball.physics.illinois.edu/TrajectoryAnalysis.pdf
3. Nathan, A. M., "Determining the Drag Coefficient from PITCHf/x Data" — https://baseball.physics.illinois.edu/LiftDrag-1.pdf
4. Nathan, A. M., "Pitch Movement, Spin Efficiency, and All That," The Hardball Times — https://tht.fangraphs.com/pitch-movement-spin-efficiency-and-all-that/
5. Nathan, A. M., "Baseball At High Altitude" — https://baseball.physics.illinois.edu/Denver.html
6. Nathan, A. M., et al., "Influence of a Humidor on the Aerodynamics of Baseballs" — https://baseball.physics.illinois.edu/humidor.pdf
7. Smith, A. W. & Smith, B. L., "Using baseball seams to alter a pitch direction: The seam shifted wake," Proc IMechE Part P: J Sports Eng & Tech (2021) — https://journals.sagepub.com/doi/abs/10.1177/1754337120961609
8. Smith, A. W., "Pitched Baseballs and the Seam Shifted Wake" (Utah State thesis) — https://digitalcommons.usu.edu/etd/7903/
9. Driveline Baseball, "An Introduction to Seam-Shifted Wakes and their Effect on Sinkers" (2020) — https://www.drivelinebaseball.com/2020/11/more-than-what-it-seams-an-introduction-to-seam-shifted-wakes-and-their-effect-on-sinkers/
10. Driveline Baseball, "The Impact of Seam-Shifted Wakes on Pitch Quality" (2021) — https://www.drivelinebaseball.com/2021/03/the-impact-of-seam-shifted-wakes-on-pitch-quality/
11. Driveline Baseball, "Mastering the Axis of Rotation: Spin Axis in Three Dimensions" (2019) — https://www.drivelinebaseball.com/2019/09/mastering-the-axis-of-rotation-a-thorough-review-of-spin-axis-in-three-dimensions/
12. Pitching.Dev, "Seam Shifted Wake" — https://pitching.dev/seam-shifted-wake
13. FanGraphs, "The Seam-Shifted Revolution Is Headed for the Mainstream" (Jan 2021) — https://blogs.fangraphs.com/the-seam-shifted-revolution-is-headed-for-the-mainstream/
14. FanGraphs, "Exploring the Variation in the Drag Coefficient of the Baseball" — https://blogs.fangraphs.com/exploring-the-variation-in-the-drag-coefficient-of-the-baseball/
15. Rapsodo, "Understanding Gyro Spin & Gyro Degree" — https://rapsodo.com/blogs/baseball/understanding-gyro-spin-gyro-degree-the-hidden-forces-behind-pitch-movement
16. Rapsodo, "Understanding Rapsodo Pitching Data: Spin Profile" — https://rapsodo.com/blogs/baseball/understanding-rapsodo-pitching-data-spin-profile/
17. Simple Sabermetrics, "Every Pitch Design Metric Explained" — https://simplesabermetrics.com/blogs/simple-sabermetrics-blog/every-pitch-design-metric-explained
18. Command Trakker, "Weather and altitude effects on pitched and batted baseballs" — https://commandtrakker.com/Weather%20and%20altitude%20effects%20on%20pitched%20and%20batted%20baseballs.html
19. MLB.com Glossary, "Induced Vertical Break (IVB)" — https://www.mlb.com/glossary/statcast/induced-vertical-break
20. Baseball Savant, Statcast Drag Dashboard — https://baseballsavant.mlb.com/drag-dashboard
21. MKDC Baseball, "How Pitchers Succeed at Coors Field" (2024 IVB home/road splits) — https://mkdcbaseball.com/pitching-at-coors-field/
22. Pitch Atlas, "State of the Craft: Sweep, Fade, Wake, and Lost Lines" (2025 pitch-mix trends) — https://pitch-atlas.com/learn/trends/
23. Yin, Y., et al., "Aerodynamics study on sweeper," Proc IMechE Part P (2025) — https://journals.sagepub.com/doi/10.1177/17543371251395349
24. The Hardball Times, "There's Lots of Physics To Do Now That Hawk-Eye Is Up and Running" — https://tht.fangraphs.com/theres-lots-of-physics-to-do-now-that-hawk-eye-is-up-and-running/
