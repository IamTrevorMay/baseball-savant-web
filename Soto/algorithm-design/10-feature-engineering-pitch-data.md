---
title: Feature Engineering from Pitch-Level Data
domain: algorithm-design
tags:
  - statcast
  - trackman
  - feature-engineering
  - approach-angles
  - pitch-movement
  - normalization
  - data-cleaning
  - stuff-models
sources_reviewed: 22
last_updated: 2026-07-19
---

# Feature Engineering from Pitch-Level Data

## TL;DR

- **Coordinate conventions are the #1 silent bug source**: Statcast `pfx_x`/`pfx_z` are in **feet from the catcher's perspective**; `api_break_*` fields are in **inches** with arm-side/batter-relative signing; horizontal features must be sign-flipped (or mirrored to arm-side/glove-side) before pooling LHP and RHP. And as of **2026, `plate_x`/`plate_z` moved from front-of-plate to middle-of-plate** to align with ABS — a regime break inside Triton's own data window.
- **The tracking stack has three regime breaks you must model as fixed effects**: PitchFX→TrackMan radar (2017, velocity error dropped ~3x to 0.12 mph), TrackMan→Hawk-Eye (2020, spin axis becomes *directly observed* rather than movement-inferred), and the June 2021 sticky-stuff crackdown (league four-seam spin −61 rpm month-over-month, −87 rpm vs. pre-enforcement baseline; ≥2,500 rpm "super-spin" fastballs −69%).
- **Movement and velocity *differentials* vs. the pitcher's primary fastball beat raw values** for grading secondaries (promising→proven across every public stuff model); Driveline's 2024 Stuff+ rebuild uses just five ball-flight features (velo, VB, HB, arm angle, extension), defines the "primary" per batter handedness, and found fastball velocity value is **exponential with an elite threshold near 96 mph**.
- **Approach angles are cheap, high-signal derived features**: VAA from the 9-parameter kinematic fit (arctan of vz/vy at the plate); flat four-seam VAA (league avg ≈ −4.5° to −5.0°, elite flat ≥ ~1° above location-adjusted expectation) drives whiffs up in the zone (proven); HAA is smaller-magnitude (league FF avg 1.3°, adjusted spread ±0.5°) and must be adjusted for release side and location before it means anything.
- **Context normalization has quantified payoffs**: pitchers throw ~6.5 Stuff+ points better ahead vs. behind in counts (all pitch types 107–108.6 Stuff+ with two strikes); Coors costs ~18% of movement (≈3 in of run and 2.6 in of ride on four-seamers); per-homestand park tracking biases historically reached 3 inches of location error.
- **Aggregate with usage weights + shrinkage, not raw means**: Stuff+ stabilizes in ~80 pitches, Location+ ~400, CSW% ~10 starts; season-level rollups should be pitch-count-weighted per pitch type, then empirical-Bayes shrunk toward the (season, level, role) prior — exactly the structure of Triton's `league_averages` table.
- **Clean before you compute**: drop `PO`/`IN`/null pitch types, expect retroactive relabels (sweeper's retro share grew 2.28% of pitches in 2021 → 7.5% in 2025), expect Savant to mutate historical rows, and treat facility TrackMan (portable B1 vs. stadium V3, calibration drift) as a separate measurement domain from MLB Hawk-Eye.

## 1. Field Semantics: Coordinate Systems, Units, and the Traps Inside Them

Statcast's public CSV (Baseball Savant) is the de-facto schema Triton's `pitches` table mirrors, and nearly every column has a convention that will corrupt a feature if ignored [1][2][3]:

- **Reference frame**: everything horizontal is from the **catcher's/umpire's perspective**. Positive `plate_x` is the catcher's right (a RHB's inside edge). Positive `release_pos_x` is likewise catcher's right — so a RHP's release is typically *negative* x. Analysts who want "pitcher's view" plots must negate x (a classic pybaseball/baseballr footgun) [2].
- **Units are inconsistent by design**: `pfx_x`/`pfx_z` are in **feet**; the newer `api_break_x_arm`, `api_break_x_batter_in`, and `api_break_z_with_gravity` are in **inches** and already re-signed relative to arm side / batter side [1]. Triton's convention ("all movement values in inches") means every ingest path must multiply pfx by 12 exactly once — audit for double conversion.
- **Induced vs. gravity-inclusive break**: `pfx_z` is movement relative to a spinless pitch (induced vertical break, IVB); `api_break_z_with_gravity` includes gravity. IVB positive = backspin fighting gravity; negative = topspin adding drop [2]. Mixing the two in one feature column produces ~2–4 ft of apparent disagreement.
- **The kinematic 9-parameter fit**: `vx0, vy0, vz0` (ft/s) and `ax, ay, az` (ft/s²) are reported **at y = 50 ft**, not at release [1]. Every trajectory-derived feature (approach angles, time-to-plate, plate-crossing velocity) integrates from these. `release_extension` (feet toward the plate from the rubber) is separately tracked; Hawk-Eye detects actual hand separation rather than inferring release from velocity changes as radar did [4].
- **Spin fields**: `release_spin_rate` (rpm) and `spin_axis` (degrees in the 2D x–z plane; 180° = pure backspin four-seamer, 0° = pure 12–6 topspin) [1]. Pre-2020, axis was **inferred from movement**; post-2020 Hawk-Eye observes it directly — the difference between the two *is itself a feature* (axis deviation, §4).
- **Deprecated columns**: `spin_dir`, `spin_rate_deprecated`, `break_angle_deprecated`, `break_length_deprecated`, `tfs_*` are legacy PitchFX artifacts and must never feed a model spanning eras [1].
- **The 2026 plate-crossing change**: through 2025, `plate_x`/`plate_z` were measured at the *front* of the plate; from 2026 on they are measured at the *middle* of the plate to align with the ABS challenge system [1]. At ~−5° VAA a pitch drops roughly 0.7–0.9 inches over that extra ~8.5 inches of depth — enough to bias zone-edge classification, VAA-at-plate, and any location model trained across the boundary. (proven — it's documented by MLB, but the downstream bias magnitude is my computation: plausible)

**For Soto:** Triton spans 2015–2026, i.e., it straddles *every* break above. Add a `tracking_era` derived column (`pitchfx_15_16`, `trackman_17_19`, `hawkeye_20_25`, `hawkeye_abs_26+`) and treat it as a categorical in any model trained on multi-era data; verify the 2026 ingest didn't silently mix front-of-plate and middle-of-plate locations, and confirm `docs/VARIABLES.md` states the pfx→inches conversion happens exactly once.

## 2. Tracking-System Regime Breaks and Era Effects

The biggest non-stationarities in a 7.4M-pitch table are not baseball — they're instrumentation and rules:

- **2015–2016 (PitchFX cameras)**: average velocity error ~0.36 mph; release points for 2008–16 are *adjusted estimates*, not measurements [1][5]. Release extension is frequently missing — the reason Triton's Stuff+ backfill covers only ~48% of 2015–2018 rows.
- **2017–2019 (TrackMan radar)**: velocity error fell ~3x to 0.12 mph in 2017, but **vertical location error rose 71% (0.42 → 0.72 in) and vertical movement error rose 58% (0.50 → 0.79 in)**, with per-homestand park biases reaching up to 3 inches; horizontal movement error held ~0.82–0.85 in [5]. Radar also occasionally reported spin anomalies off by exactly a factor of 2 (6 of 94 pitches in Nathan et al.'s ground-truth test; overall spin precision ±35 rpm RMS, velocity ±0.5 mph) [6]. (proven — instrumented ground-truth studies)
- **2020+ (Hawk-Eye, 12 cameras)**: direct measurement of spin rate, spin axis, and all three spin components (side/back/gyro), plus true release detection [4]. MLB's 2020 ground-truth test confirmed systematic differences vs. TrackMan output [7]. Hawk-Eye spin-direction error is small: 21 of 30 parks under 1°, all under 2° [8]. Arm angle data exists **2020 forward only** [9].
- **June 2021 sticky-stuff enforcement**: league four-seam spin fell 61 rpm month-over-month (lowest since Aug 2018), 87 rpm vs. the pre–June 3 baseline; fastballs ≥2,500 rpm dropped 69% (17.2 → 5.3 per game); among 291 qualifying pitchers, 24.7% lost ≥100 rpm and 7.5% lost ≥150 rpm [10]. Any spin-based feature normalized against a pooled 2015–2026 mean is biased on both sides of this line. (proven)
- **2023 sweeper reclassification**: Statcast added `ST` (sweeper) and `SV` (slurve) and *retroactively re-ran its classifier over prior seasons*; the retro sweeper share climbs 2.28% (2021) → 4.36% (2022) → 6.33% (2023) → 7.5% (2025) [11]. Pitch-type-conditioned baselines (like Triton's `pitch_baselines` per pitch_name × game_year) shift whenever Savant relabels history.

**For Soto:** this is the strongest argument for keeping `pitch_baselines` keyed by (pitch_name, game_year) — never pool years for spin or classification-dependent features. Consider a nightly checksum/count diff per (season, pitch_type) to detect Savant's silent retro-edits; pybaseball's own docs warn each ~700k-pitch season "is subject to update" [12].

## 3. Derived Features I: Approach Angles

**Vertical approach angle (VAA)** is the angle of descent at the plate: solve the 9-parameter kinematics for time-to-plate, compute plate-crossing `vz_f` and `vy_f`, then `VAA = arctan(vz_f / vy_f)` (in degrees, negative = descending) [13]. Key empirics from Chamberlain's primer and follow-on work [13][14]:

- League-average four-seam VAA sits roughly **−4.5° to −5.0°**; pitch-type spreads (±3σ around location-adjusted expectation) run about ±1.4–1.5° for four-seamers/sinkers, widening to ±2.4° for curves. On Chamberlain's 20–80 scale, an 80-grade *flat* four-seamer is ~+1.4° above expectation; an 80-grade *steep* sinker is ~−1.5° below [13].
- **Flat four-seam VAA → more whiffs and pop-ups at the top of the zone; steep sinker VAA → weak ground contact low** (proven — replicated across FanGraphs, PBR, team R&D). Flat-VAA archetypes: Joe Ryan, Bailey Ober, Bryan Woo, Freddy Peralta [14].
- VAA matters most for fastballs; its influence on sliders/curves/changeups is much weaker (promising) [13].
- **VAA is ~fully determined by release height, extension, velocity, IVB, and location** — so as a *model feature* it is largely collinear with its inputs; its unique value is interpretability and location-conditioning. Lower release and more extension flatten VAA [14]. Always location-adjust (VAA at the letters is inherently flatter than at the knees) before ranking pitchers. (proven)

**Horizontal approach angle (HAA)**: same construction in the x–y plane. 2023 league-average four-seam HAA ≈ 1.3°, and location/release-adjusted differences rarely exceed ±0.5° — an order of magnitude tighter than VAA spreads [15]. HAA requires three normalizations before use: pitcher handedness (mirror), horizontal release point (rubber position shifts HAA with zero shape change), and horizontal location [15][16]. Effects are real but small: sharper glove-side angles at the outside edge steal called strikes; sharper arm-side angles inside produce weaker contact (promising) [15].

**For Soto:** Triton already computes VAA/HAA client-side in `fetchData` — promote them to persisted, *location-adjusted* versions (VAA minus expected VAA at that plate_z; HAA mirrored by handedness and adjusted for release_pos_x) so the deception and Stuff+ models can consume them. That is precisely the adjustment pair Driveline added in its 2024 Stuff+ rebuild [17].

## 4. Derived Features II: Differentials, Mirroring, Release Consistency, Extension

**Movement/velocity differentials vs. the primary fastball.** Every serious public stuff model (FanGraphs Stuff+ by Sarris/Bay, PitchingBot, Driveline Stuff+, BP StuffPro) grades secondaries by their *separation* from the pitcher's fastball, with the differential features weighted **more heavily than raw movement/velocity** [17][18]. Implementation details that matter:

- Define "primary fastball" by usage within the relevant split. Driveline's 2024 update defines it **per batter handedness** (a pitcher may be sinker-primary vs. RHB and four-seam-primary vs. LHB), which embeds the arsenal effect correctly [17].
- Compute Δvelo, ΔIVB, ΔHB, and Δrelease (did the secondary come from the same slot?). FanGraphs' model also includes an **axis differential** term to capture seam-shifted-wake movement the spin axis doesn't explain [18].
- Nonlinearity is real: Driveline found fastball velocity's run value is exponential with an inflection near **96 mph** — a linear Z-score term undersells elite velo [17]. (promising)

**Spin mirroring and axis deviation.** With Hawk-Eye observing the true axis, the difference between *observed* spin axis and the axis *inferred from movement* ("2D axis deviation") quantifies non-Magnus/seam-shifted-wake movement [8][19]. League-wide 2020 magnitudes: sinkers gain ~3 in of extra run and ~4 in of extra drop beyond Magnus; cutters ~3 in glove-side and ~2 in drop; sliders/curves show minimal average SSW [8]. Roughly 42% of pitches graded *worse* than their spin-only estimate — SSW is not universally good [8]. Spin *mirroring* (fastball and breaking ball axes ~180° apart, e.g., 1:00/7:00 tilt pairs) is hypothesized to defeat early pitch recognition; it's directionally supported but not cleanly proven in public data (plausible) [19]. Feature recipe: per pitch type, `axis_deviation = observed_spin_axis − inferred_axis(movement)`; per pitch *pair*, `mirror_score = |180° − |axis_A − axis_B||`.

**Release consistency.** Compute per-pitch-type SD of (release_pos_x, release_pos_z, extension) and the cross-pitch-type centroid distances. Elite repeatability is ~1 inch SD per axis (Robbie Ray's 2021 sinker) [20]. But the evidence that raw release SD predicts MLB outcomes is weak: Kalk found no overall effect; game-to-game fastball release variance correlates modestly with walk rate while within-game variance does not; a 2020 starter study found low R² vs. BB/9 [20][21]. The likely culprit is **range restriction** — everyone in MLB is already tight. At facility level (high-school/college arms), spread is much wider and the feature plausibly carries more signal. (plausible at sub-elite levels; debunked as a *strong* MLB-level outcome predictor). Caution: release SD also encodes *intentional* variation (rubber shifts, slot changes) and tracking noise — separate slow drift (game-to-game centroid movement) from per-pitch scatter.

**Extension and perceived velocity.** MLB average extension ≈ 6.3 ft; each extra foot ≈ **+1.7 mph perceived velocity** (Statcast's own PV construction) [22]. Extension also flattens VAA. This is why extension earns a 2.0 weight in Triton's Z-score Stuff+ and appears in all five of Driveline's core features. (proven for the geometry; the perceptual equivalence is promising)

**Arm angle (2020+).** Statcast derives it from shoulder position vs. ball at release: 0° = sidearm, 90° = over-the-top; observed range runs from Tyler Rogers at −64° (submarine) to over-the-top guys near 60°, with Chris Sale at ~11° [9][23]. Its modeling value is as the *expectation-setter* for movement: "expected movement given arm angle" residuals (Max Bay's dead-zone framing) identify uniqueness — ride from a low slot, sink from a high slot [23]. (promising)

**For Soto:** Triton's current Stuff+ (`100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`) has no differential terms, no arm angle, no axis deviation, and is linear in velo. The highest-value incremental upgrades, in order: (1) Δvelo/Δmovement vs. handedness-specific primary fastball, (2) location-adjusted VAA for fastballs, (3) arm-angle-expected-movement residuals, (4) a velo spline/threshold near 96 mph. Each is computable from columns already in `pitches` (arm angle needs 2020+). The existing `deception_score`/`unique_score` tables are the natural home for mirror_score and release-centroid distances.

## 5. Normalization by Context: Count, Handedness, Park, Season

**Count.** Pitchers modulate their stuff by leverage: ahead-in-count Stuff+ runs ~6.5 points higher than behind, ~4.8 above even counts; with two strikes every pitch class averages 107–108.6 Stuff+; individual swings are large (Seth Lugo's fastball 2.3 mph harder and 46 Stuff+ points better ahead; Glasnow's curve a 65-point spread) [24]. Count also changes the *value function*: count leverage (|ΔRV of a strike − ΔRV of a ball|) roughly doubles from 0.07 runs at 0-0 to 0.16 at 2-0 [25]. Two consequences: (a) any per-pitch run-value target must use the count-based RE288-style expectation, not pooled averages; (b) comparing two pitchers' raw stuff without count-mix adjustment biases toward strike-throwers who live in advantage counts. Location models must be count-conditioned outright — the right slider target at 2-0 differs from 1-2 [18]. (proven)

**Handedness.** Mirror all horizontal quantities (HB, HAA, release_pos_x, plate_x) into arm-side/glove-side coordinates before pooling LHP/RHP — vertical features are largely handedness-immune [16]. Batter handedness belongs in the model, not the normalization: the same RHP sweeper that runs away from a RHB runs *into* a LHB's barrel, which is why platoon-split-aware primary-fastball definitions (Driveline 2024) and batter-hand features (Pitching+) improved their models [16][17][18].

**Park.** Two distinct park effects — physical and instrumental:

- *Physical (air density)*: movement scales ~linearly with air density. Coors sits at ~82% of sea-level density → ~18% movement loss: four-seamers lose ~3 in of arm-side run and ~2.6 in of ride; curveballs ~2.3 in of drop (a curve that breaks 9.5 in elsewhere breaks ~7 at Coors); sliders are least affected in absolute and relative terms [26][27][28]. (proven — straight aerodynamics plus empirical confirmation). Temperature and humidity produce smaller same-direction effects everywhere.
- *Instrumental (calibration)*: park-to-park and homestand-to-homestand biases historically reached ~3 in in location and ~1 in in movement, varying by park and era [5]. Hawk-Eye is far better but not perfect [8].

Practical recipe: park-and-date fixed effects (or at minimum a Coors/altitude flag and an air-density covariate from park elevation + game-time temperature) on movement features before computing Z-scores.

**Season/era.** Combine §2's regime dummies with per-season baselines. Never normalize spin against a mean that pools across June 2021, and never normalize classification-dependent aggregates across the 2023 sweeper split [10][11].

**For Soto:** Triton's `pitch_baselines` (per pitch_name × game_year) already handles season; the missing axes are **park** and **count**. A cheap win: compute movement Z-scores after subtracting a per-park seasonal movement offset (estimable from same-pitcher home/road deltas, min ~25 pitches at park + 100 elsewhere, per the Coors methodology [26]). For Neptune, altitude normalization matters if athletes train at elevation and compete at sea level — an 18%-scale effect dwarfs most training-block movement gains.

## 6. Aggregation to Season Level

- **Weight by usage, aggregate per pitch type first.** Season-level "stuff" should be the pitch-count-weighted mean of per-pitch-type scores (Triton already does pitch-weighted aggregates for `pitcher_season_command`). Report per-pitch-type rows alongside the arsenal rollup — arsenal averages hide the one elite weapon that drives outcomes.
- **Know your stabilization points.** Stuff+ is reliable within ~**80 pitches**; Location+ needs ~**400 pitches** (~4–5 starts); Pitching+ beats preseason projections for starters around the 400th pitch and stabilizes faster than K-BB% [18]. CSW% becomes viable around a pitcher's ~10th start [29]. Whiff rate per pitch type needs hundreds of pitches because opponent quality, count mix, and location execution inflate variance [29]. Implication: early-season dashboards should surface stuff-type metrics first and outcome-type metrics (whiff%, wOBA-against) only with sample-size badges.
- **Shrink small samples with empirical Bayes.** Fit a prior from the population of (season, level, role) peers — beta-binomial for rates, normal-normal for continuous metrics — and shrink each pitcher's estimate toward it in proportion to sampling variance / total variance. A 4-for-10 start shrinks a lot; 300-for-1000 barely moves [30][31]. This is strictly better than hard qualification cutoffs for leaderboards, though cutoffs (like Triton's `IP ≥ max(5, 0.20 × leader)`) remain fine for defining the prior population itself. (proven — standard statistics)
- **Aggregate distributions, not just means.** Per-pitch-type velocity *decay within games*, movement SD (shape consistency), release SD, and 10th/90th percentile stuff all carry information a mean erases. Driveline and team R&D increasingly treat within-type variance as a command/consistency proxy (promising).
- **Guard against selection effects.** Count mix (§5), times-through-order, opponent quality, and survivorship (bad stuff gets demoted mid-season) all confound naive season aggregates; at minimum record the count-mix and platoon-mix a pitcher's seasonal line was earned in.

**For Soto:** `league_averages` (50th percentile per season/level/role/metric) is exactly the prior EB shrinkage needs — extend it with a dispersion column (SD or IQR per metric) and shrinkage becomes a two-line SQL change. For Compete/Neptune athletes with 20-pitch bullpens, shrinkage toward facility-level or age-band priors is *mandatory* — raw session means will whipsaw parents and athletes.

## 7. Data-Cleaning Gotchas (Checklist)

1. **Drop non-competitive pitches**: `pitch_type IN ('PO','IN')` (pitchouts, intentional balls) and null pitch types — Triton's SP/RP classifier already excludes them; every aggregate should [2].
2. **Expect mutation**: Savant retro-edits prior seasons (classifications, occasional tracking corrections); each season is 700k+ rows "subject to update" [12]. Diff row counts and per-type shares on re-ingest.
3. **Classification drift ≠ behavior change**: the sweeper's 2021→2025 share growth mixes real adoption with retroactive relabeling [11]. Never interpret pitch-mix trends across a classifier change without checking the movement clusters yourself.
4. **Missing-field eras**: release_extension largely absent 2015–2018 (Triton: only ~48% Stuff+ coverage there); spin_axis observed only 2020+; arm_angle 2020+; bat-tracking 2024+ [1][9].
5. **Physically impossible rows**: spin readings off by exactly 2x (radar-era artifact) [6], 0 rpm spin, extension > 8 ft or < 4.5 ft, release_pos_z > 8 ft — filter on physical plausibility windows per feature.
6. **API truncation**: pybaseball-style pulls cap at 30,000 rows per query window [12] — page by date, and validate daily counts against the schedule.
7. **Perspective bugs**: any feature whose distribution isn't mirror-symmetric across pitcher handedness after normalization still has a sign error somewhere [2][16].
8. **MiLB/alt-source vocabulary drift**: Triton's `milb_pitches` events are Title Case vs. MLB lowercase — normalize event vocabularies at ingest, not query time (internal, but the general lesson is universal: every feed has its own enum spellings).
9. **Facility TrackMan is its own domain**: portable B1 units directly measure spin efficiency/gyro (stadium radar historically didn't), but radar units are harder to calibrate than optical systems, and mis-leveled or mis-aligned setups skew release height, IVB, and tilt [32][33]. Keep a `device_id`/setup metadata column in `compete_pitches`, re-verify alignment each session block, and never mix facility and MLB rows in one baseline. TrackMan-vs-Rapsodo cross-device deltas of 1–2 in movement and ~50–100 rpm are routine (promising — vendor comparisons, limited public ground truth).
10. **Timestamp/doubleheader traps**: game_date + pitcher dedup fails on doubleheaders; use game_pk. Spring training and exhibition parks have historically worse calibration — exclude or flag non-regular-season rows.

## 8. A Reference Feature Set for Triton/Neptune

Tiered by cost-to-compute from existing columns:

- **Tier 1 (per pitch, pure arithmetic)**: IVB/HB in inches (arm-side signed), velo, extension, perceived-velo adjustment (+1.7 mph/ft over 6.3 ft [22]), plate-crossing velocity, VAA/HAA from the kinematic fit, location-adjusted VAA.
- **Tier 2 (per pitch type × season, needs grouping)**: Δvelo/ΔIVB/ΔHB vs. handedness-specific primary fastball [17][18]; release centroid + per-axis SD [20]; axis deviation (2020+) [8]; mirror_score for FB–breaking pairs [19]; arm-angle-expected-movement residuals (2020+) [23]; within-type movement/velo SD; count-conditioned stuff splits [24].
- **Tier 3 (needs new infrastructure)**: park/air-density-adjusted movement [26][27]; EB-shrunk season aggregates with dispersion-extended `league_averages` [30]; era fixed effects for cross-year models [5][10]; facility-device harmonization layer for Compete [32].

The through-line: **almost all of the public stuff-model edge is feature engineering, not model class** — five well-built features (velo, VB, HB, arm angle, extension) plus differentials and approach-angle adjustments carry Driveline's production model [17]; the same inputs feed FanGraphs' Stuff+ [18]. Triton's data already contains every input. The moat is in the normalization discipline (era, park, count, handedness) and the cleaning checklist — the parts most public models skip.

## Sources

1. Baseball Savant — Statcast Search CSV Documentation. https://baseballsavant.mlb.com/csv-docs
2. Petti, B. — Using Statcast Pitch Data (baseballr vignette). https://billpetti.github.io/baseballr/articles/using_statcast_pitch_data.html
3. Marchi, Albert, Baumer — Analyzing Baseball Data with R (3e), Appendix C: Statcast Data Reference. https://beanumber.github.io/abdwr3e/C_statcast.html
4. Jedlovec, B. — Introducing Statcast 2020: Hawk-Eye and Google Cloud (MLB Technology Blog). https://technology.mlblogs.com/introducing-statcast-2020-hawk-eye-and-google-cloud-a5f5c20321b8
5. Schifman, G. — The Lurking Error in Statcast Pitch Data (The Hardball Times, 2018). https://tht.fangraphs.com/the-lurking-error-in-statcast-pitch-data/
6. Nathan, A., Kensrud, J., Smith, L., Lang, E. — Testing TrackMan: Just How Well Does TrackMan Work? (Baseball Prospectus, 2014). https://www.baseballprospectus.com/news/article/23202/testing-trackman-just-how-well-does-trackman-work/
7. The Hardball Times — There's Lots of Physics To Do Now That Hawk-Eye Is Up and Running. https://tht.fangraphs.com/theres-lots-of-physics-to-do-now-that-hawk-eye-is-up-and-running/
8. Driveline Baseball — The Impact of Seam-Shifted Wakes on Pitch Quality (2021). https://www.drivelinebaseball.com/2021/03/the-impact-of-seam-shifted-wakes-on-pitch-quality/
9. Baseball Savant — Statcast Arm Angle Leaderboard. https://baseballsavant.mlb.com/leaderboard/pitcher-arm-angles
10. Sports Illustrated — Sticky Stuff Enforcement Is Already Making Baseball a Better, Fairer Game (2021); The Ringer — Is the MLB Sticky-Stuff Ban Actually Making a Difference? (2021). https://www.si.com/mlb/2021/06/28/sticky-stuff-crackdown-is-working-opener ; https://www.theringer.com/2021/07/22/mlb/stick-stuff-pitchers-banned-foreign-subtances-spin-rate-offense
11. MLB.com Glossary — Sweeper (ST); MLBAnalytic — The Pitch-Design Revolution: How Sweepers Changed Pitching. https://www.mlb.com/glossary/pitch-types/sweeper ; https://mlbanalytic.com/articles/pitch-design-revolution-sweepers.html
12. pybaseball — Statcast documentation (jldbc/pybaseball). https://github.com/jldbc/pybaseball
13. Chamberlain, A. — A Visualized Primer on Vertical Approach Angle (VAA) (FanGraphs, 2022). https://blogs.fangraphs.com/a-visualized-primer-on-vertical-approach-angle-vaa/
14. Zahradnik, R. — Fastball Vertical Approach Angle (Iowa Baseball Managers); Twinkie Town — How VAA helps explain "sneaky" fastballs. https://medium.com/iowabaseballmanagers/fastball-vertical-approach-angle-12e2824d245a ; https://www.twinkietown.com/2022/1/12/22806062/mlb-minnesota-twins-how-vertical-approach-angle-vaa-explains-sneaky-fastballs-joe-ryan-bailey-ober
15. Chamberlain, A. — A Visual Primer on Horizontal Approach Angle (HAA) (FanGraphs, 2023). https://blogs.fangraphs.com/a-visual-primer-on-horizontal-approach-angle-haa/
16. Moore, E. — Examining Pitching Approach Angles (Something Tangible, 2020). https://medium.com/something-tangible/examining-pitching-approach-angles-e2ab7a3b9c15
17. Driveline Baseball — Revisiting Stuff+: An Update on Driveline's Methodology to Quantifying Pitch Design (2024). https://www.drivelinebaseball.com/2024/05/revisiting-stuff-plus/
18. FanGraphs Library — Stuff+, Location+, and Pitching+ Primer. https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer/
19. FanGraphs — On Pitch Sequences and Spin Mirroring. https://blogs.fangraphs.com/on-pitch-sequences-and-spin-mirroring/
20. FanGraphs Membership — The Importance of Release Point Consistency; Complete Game Loss — Comparing Release Points in Three Dimensional Spaces (2021). https://plus.fangraphs.com/the-importance-of-release-point-consistency/ ; https://completegameloss.com/2021/12/29/comparing-release-points-in-three-dimensional-spaces/
21. FanGraphs Community — Studying Release Point Standard Deviation From Center (2020 study). https://community.fangraphs.com/studying-release-point-standard-deviation-from-center/
22. MLB.com Glossary — Perceived Velocity; RotoGraphs — All About Pitcher Perceived Velocity. https://www.mlb.com/glossary/statcast/perceived-velocity ; https://fantasy.fangraphs.com/all-about-pitcher-perceived-velocity/
23. TDA Baseball — How Important is the New Statcast Arm Angle Data?; MLB.com — How arm slot and angle affect pitches. https://www.tdabaseball.com/post/how-important-is-the-new-statcast-arm-angle-data ; https://www.mlb.com/news/how-arm-slot-and-arm-angle-affect-pitches
24. Hinchcliffe, C. — Count-Dependent Pitch Quality (Driveline Baseball, 2021). https://www.drivelinebaseball.com/2021/06/count-dependent-pitch-quality/
25. Albert, J. — Count Effects (Bayesball blog); The Hardball Times — Pitch run value and count. https://bayesball.github.io/BLOG/Count_Effects.html ; https://tht.fangraphs.com/pitch-run-value-and-count/
26. FanGraphs Community — An Analysis of Pitch Movement at Coors Field. https://community.fangraphs.com/an-analysis-of-pitch-movement-at-coors-field/
27. Nathan, A. — Baseball At High Altitude (Physics of Baseball, U. Illinois). https://baseball.physics.illinois.edu/Denver.html
28. Purple Row — Pitching at Altitude, Part 1: The General Effects of Elevation (2023). https://www.purplerow.com/2023/8/14/23645356/colorado-rockies-pitching-at-altitude-part-1-the-general-effects-of-elevation
29. Pitcher List — CSW Rate: Intro to a New Fantasy Baseball Metric. https://pitcherlist.com/csw-rate-an-intro-to-an-important-new-metric/
30. Robinson, D. — Understanding empirical Bayes estimation (using baseball statistics). http://varianceexplained.org/r/empirical_bayes_baseball/
31. Probabilaball — Normal-Normal Shrinkage Estimation by Empirical Bayes. http://www.probabilaball.com/2015/07/normal-normal-shrinkage-estimation-by.html
32. TrackMan — Portable B1: What We Track (spin efficiency, gyro, measured tilt). https://www.trackman.com/baseball/Portable-B1/what-we-track
33. Driveline Baseball — Rapsodo, TrackMan, and Pitch Tracking Technologies: Where We Stand (2016). https://www.drivelinebaseball.com/2016/11/rapsodo-trackman-pitch-tracking-technologies-stand/
