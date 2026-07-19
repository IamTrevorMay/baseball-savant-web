---
title: Stuff Models — The Public Landscape, Architectures, and How to Build One
domain: algorithm-design
tags:
  - stuff-plus
  - pitch-modeling
  - xrv
  - gradient-boosting
  - statcast
  - pitch-design
  - model-stabilization
  - triton-metrics
sources_reviewed: 18
last_updated: 2026-07-19
---

# Stuff Models — The Public Landscape, Architectures, and How to Build One

## TL;DR

- **"Stuff" models grade the physical quality of a pitch — velocity, movement, release, spin — independent of location, by predicting run value from ball-flight characteristics.** Every serious public model (Stuff+, PitchingBot's botStf, StuffPro, tjStuff+, aStuff+/proStuff+) is a gradient-boosted tree model (XGBoost, LightGBM, or CatBoost) trained on run value or a decomposed expected-run-value (xRV) target. (proven)
- **Stuff stabilizes absurdly fast — that is the whole product.** FanGraphs' Stuff+ is reliable at ~80 pitches; aStuff+'s median stabilization is ~60–72 pitches; BP's StuffPro reaches 0.2 correlation with *next-season* run value after just **27 pitches**, vs ~85 for PitchPro (with location) and **~500 pitches for observed run value itself**. Location-based models need 400–725 pitches. (proven)
- **Stuff is the sticky, predictive half; location is the volatile, descriptive half.** tjStuff+ year-over-year self-correlation is 0.85; StuffPro pitch-level reliability is .74 vs .41 for DRA and .30 for xERA. But stuff models are weakly *descriptive* of same-season results because they ignore location — proStuff+ beats FIP at predicting future FIP (r = 0.572 vs 0.537 at 80 IP) while explaining current-season outcomes only moderately. (proven)
- **The core architecture choice is target design: raw run value regression (simple, noisy) vs decomposed outcome models (swing → whiff/foul/in-play → batted-ball value) recombined into xRV.** PitchingBot predicts 10 event probabilities; StuffPro uses 4 sub-models × 4 pitch families (CatBoost); tjStuff+ v3 regresses count-neutralized xRV directly with LightGBM. Decomposition denoises the target and is the current best practice. (promising)
- **Feature consensus:** velocity, IVB/HB (or raw ax/az accelerations), release x/z, extension, spin rate, spin axis, axis differential (seam-shifted wake proxy), and — critically — **velocity/movement differentials vs the pitcher's primary fastball** for secondaries. Newer models add arm angle (public in Statcast since late 2024), approach angles (VAA/HAA), and movement-above-expected-for-arm-slot. (proven)
- **Known failure modes are real and well documented:** Goodhart drift (league-wide Stuff+ SD shrank from 9.7 in 2020 to 8.8 in 2025 and the stuff→wOBA correlation visibly weakened as every org started training to the metric); splitter/command tradeoffs; slider-shaped cutters misrouted through fastball pipelines; zero visibility into deception, sequencing, and command; and an injury externality — MLB's Dec 2024 62-page study (200+ interviews) named velocity/stuff-chasing the **#1 factor** in the pitching-injury epidemic (avg FB velo 91.3 → 94.2 mph since 2008). (proven)
- **A credible DIY build from Statcast data is a weekend-to-two-week project:** ~1.5–6M pitches, 10–15 features, LightGBM on count-averaged xRV, scale to mean 100 / SD 10 per season. Triton's current Z-score Stuff+ (100 + veloZ·4.5 + moveZ·3.5 + extZ·2.0) is a linear approximation of what these models learn nonlinearly — the upgrade path is clear and cheap. (proven)

## What Stuff Models Are and Why They Exist

"Stuff" is the physical nastiness of a pitch — how hard it is to hit given only how the ball comes out of the hand and moves, ignoring where it's located and when it's thrown. A stuff model formalizes this: it maps ball-flight characteristics to an expected outcome (usually run value), then normalizes the prediction to an interpretable scale.

The value proposition is a decomposition of pitching into three separable skills:

1. **Stuff** — physical pitch quality (velo, movement, release). Highly stable, mostly trainable in a pitch lab.
2. **Location/Command** — where pitches go relative to count and pitch type. Volatile in small samples, slow to stabilize.
3. **Overall/Pitching** — a third model using both, plus count context. The best single-number process metric.

FanGraphs hosts the two canonical public families side by side: **Stuff+/Location+/Pitching+** (Eno Sarris & Max Bay, maintained by Sarris & Owen McGrattan, with lineage back to Ethan Moore, Harry Pavlidis, and Jeremy Greenhouse) and **PitchingBot** (Cameron Grove: botStf, botCmd, botOvr). Both are decision-tree/gradient-boosted models trained against run values. (proven)

The killer feature is sample efficiency. Outcome stats (ERA, wOBA-against, even K-BB%) need hundreds to thousands of batters faced to mean anything. Stuff models produce a skill estimate off **one bullpen or one start**, because the inputs (velocity, movement, release) are themselves nearly noiseless measurements of a repeatable physical act. This is why every pitch-design facility on earth — Driveline most prominently — runs one. (proven)

**For Soto:** This decomposition is exactly Triton's existing metric spine — Stuff+ (`pitch_baselines`), command (`pitcher_season_command`), deception (`pitcher_season_deception`). The public landscape validates the three-bucket structure; the gap is that Triton's stuff layer is linear Z-scores rather than a learned model on run value.

## The Public Landscape: Model by Model

### FanGraphs Stuff+ (Sarris/Bay/McGrattan)
- **Architecture:** decision-tree-based model trained against **run values**, so it implicitly credits weak-contact ability, not just whiffs. (proven)
- **Features:** release point, velocity, vertical/horizontal movement, spin rate, and **axis differential** (measured spin axis vs movement-inferred axis — the seam-shifted-wake proxy). Secondaries are graded on raw values **plus velocity/movement differentials from the pitcher's primary fastball**, with "primary" defined by usage in that outing. (proven)
- **Scale:** mean 100; SD varies by pitch type and role (12.16–17.02 across SP/RP at pitch level; Pitching+ SD is 4.94 for starters, 6.61 for relievers).
- **Stabilization:** reliable at **~80 pitches**; Location+ needs ~400 pitches to hit ~0.9 Cronbach's alpha; in-season Pitching+ beats preseason projections by ~pitch 400 (4–5 starts) for SP, ~250 pitches for RP. Preseason Pitching+ posts lower RMSE against next-season ERA than most projection systems, and beats ZiPS/Steamer for relievers. Stuff+ drives most of Pitching+'s year-over-year stickiness. (proven)

### PitchingBot (Cameron Grove) — botStf / botCmd / botOvr
- **Architecture:** XGBoost in R; ~6M pitches, 80/20 train/test split; separate model suites for **fastballs, breaking balls, and offspeed**. A classification model predicts **ten event probabilities** (swing, swinging strike, called strike, ball, foul, ball-in-play, contact, GB/LD/FB), recombined via linear weights (Statcast 2015–2020 run environment) into xRV. (proven)
- **Features:** contextual (both handedness, zone height, count), stuff (velo, spin, movement, release point, extension, spin efficiency, axis deviation, velo/movement differential vs primary fastball), location (plate x/z).
- **Scale:** 20–80 scouting scale (50 average), plus a "PitchingBot ERA" conversion.
- **Known weakness (self-reported):** better at separating above-average from average than elite from great; batted-ball type prediction is weakest (groundballs best). (promising)

### Baseball Prospectus StuffPro / PitchPro (Stephen Sutton-Brown, March 2024)
- **Architecture:** **CatBoost**, four pitch families (primary fastballs, secondary fastballs, offspeed, "bendy"), each with four sub-models: swing probability, take outcomes, swing outcomes, batted-ball value. Trained on 2020–2023 MLB regular season. Feature admission rule worth stealing: an input gets in only if (1) the causal pathway to outcomes is articulable and (2) it improves out-of-sample performance. (proven)
- **Scale:** runs per 100 pitches, negative = good. Elite single pitch ≈ **−2.0 RV/100**; elite full arsenal ≈ **−1.25 RV/100**.
- **Numbers:** StuffPro hits 0.2 correlation with next-season RV after **27 pitches** (PitchPro 85; observed RV ~500). Pitch-level reliability/predictiveness: StuffPro .74/.29, PitchPro .54/.29, vs DRA .41/.27, cFIP .43/.28, xERA .30/.22. BP claims best-in-public prediction of pitcher RA9; their 2024 back-test improved accuracy by 341+ runs over the prior approach. (proven)

### tjStuff+ (Thomas Nestico, v3.0)
- **Architecture:** **LightGBM regressor** (swapped from XGBoost for speed on 1.6M+ pitches), RobustScaler on features, target = count-neutralized **xRV per 100 pitches** (xRV averaged by outcome and count to strip base-state noise). Trained 2020–22, validated on 2023, then 2023→2024 for predictive validation.
- **Features (11):** start_speed, spin_rate, extension, ax, az (accelerations instead of IVB/HB — a v3 change), x0, z0, spin_axis, plus speed_diff / ax_diff / az_diff vs primary fastball. Handedness-normalized.
- **Scale:** mean 100, SD 10; 60-grade ≈ 84th percentile, 70-grade ≈ 97th.
- **Numbers:** 0.68 correlation to next-season wOBA at a 100-pitch minimum (best among metrics he tested); **0.85 year-over-year self-correlation**; admittedly weak same-season descriptiveness ("lack of location information"). v2's lesson: baselining secondaries against the *primary pitch* rather than the *primary fastball* caused grade volatility — he reverted. (proven)

### PitchProfiler aStuff+/proStuff+ (Jeremy Maschino)
- **Architecture:** LightGBM ensemble predicting swing/take, swing outcomes, take outcomes, and batted-ball RV; trained 2020–2023, tested descriptively on 2023 and predictively on 2024. 15 features including induced vertical/horizontal **acceleration** (speed-normalized break), seam-shifted wake on both axes, arm angle and arm-angle deviation, release extension/side/height, release angles and angle-change metrics.
- **Notable engineering:** a Stage-0 classifier inspects every pitch labeled "FC," rotates movement into arm-slot-relative coordinates, and routes **slider-shaped cutters through the non-fastball pipeline** — the cleanest public fix for the cutter classification failure mode. (promising)
- **Numbers:** proStuff+ stabilizes at **~60 pitches** pitcher-level (15 pitches for a single pitch type!); proPitching+ ~700; proLocation+ ~725. proStuff+ predicts future FIP better than FIP predicts itself (r 0.572 vs 0.537 at 80 IP). proLocation+ is a weak predictor because location is volatile and it excludes the stable inputs. (proven)

### THE BATcast (Derek Carty, Feb 2026) and Shape+ v2.0 (Cade Cavin, May 2026)
The 2025–26 frontier is **context-relative physics**:
- **BATcast** starts from ~4,000 candidate variables and ML-selects predictors across K/BB/HR/BABIP outcomes; its innovations are movement-above-expected-for-arm-angle (a sidearmer's sweep is *expected* by the hitter, so it counts less), **tunneling variables** (trajectory overlap duration between pitch pairs), and "bridge pitch" modeling (cutters blurring the FB/breaking-ball decision boundary). (promising)
- **Shape+ v2.0** deliberately abandons gradient boosting for a **generalized additive model** (splines + tensor interactions + random effects per pitch type), computes *expected* VAA/HAA from release point and velocity via OLS anchors, and grades the **residual** — the movement hitters can't perceive coming. Excludes spin rate entirely. Validation vs 2025: r = 0.501 with K%, 0.474 with SwStr%, −0.464 with xSLG. Its stated rationale: boosted trees can leak implicit pitcher identity; additive models can't. (promising)

### Driveline Stuff+ (facility-native, 4th iteration as of the 2021 writeup)
Location-agnostic, buckets pitches into fastballs (FF/SI), breaking balls (FC/SL/CB), offspeed (CH/SPL). Features: velocity, VB, HB, **arm angle**, extension; offspeed graded relative to the pitcher's fastball; interaction effects explicitly modeled (adding IVB helps a four-seam, *hurts* a sinker). Scale is ratio-style around 100 (130 = 30% above average), which lets outliers run huge: 2021 Chapman four-seam **350**, Tanner Scott slider **246**, Hendriks sinker **191**. Their published per-pitch-type RV/100 spread: sliders −0.98 (best) to sinkers −0.14 (worst). This is the reference implementation for a *training facility* stuff model: instant feedback in pitch-design sessions off portable TrackMan/Edgertronic. (proven)

**For Soto:** the landscape settles several Triton design debates by consensus — (a) grade secondaries vs the primary *fastball*, not primary pitch (Nestico tested the alternative and reverted); (b) separate pitch-family sub-models beat one monolith; (c) accelerations (ax/az) are edging out IVB/HB as speed-normalized shape features; (d) report on mean-100/SD-10. Triton already stores ax/ay/az in `pitches`.

## Architectures: Target Design Is the Real Decision

All public models are tree ensembles; the differentiation is almost entirely in the **target**:

1. **Raw run value regression** (early Stuff+, tjStuff v1, most DIY builds). Simple, but RV per pitch is dominated by irreducible noise — most pitches change the count only, and ball-in-play RV is BABIP-noisy. Works because of enormous n, but caps out.
2. **Count-neutralized xRV regression** (tjStuff+ v3). Average RV by outcome × count first, regress on that. Strips base-state and sequencing noise from the label. Cheap denoising, big stability gain. (promising)
3. **Full outcome decomposition → recombine** (PitchingBot, StuffPro, PitchProfiler, and per Ajay Patel's public xRV walkthrough — 24 Ranger random-forest models by pitch type × both handedness, test RMSE 0.14–0.156, R² 0.76 vs observed RV). Predict P(swing), then P(whiff/foul/in-play | swing), P(called strike/ball | take), and E[RV | batted ball]; multiply through linear weights. Each sub-model trains on its natural subset (takes-only for take outcomes, etc.). This is current best practice: each stage is a cleaner learning problem, and you get diagnostic sub-outputs (a pitch's whiff engine vs weak-contact engine) for free. (promising)
4. **Additive/GAM residual models** (Shape+). Trades a little accuracy for interpretability and immunity to pitcher-identity leakage. Attractive for *athlete-facing* feedback where you must explain the grade. (plausible)

Algorithm choice (XGBoost vs LightGBM vs CatBoost) is second-order; Nestico's swap to LightGBM was purely a training-speed decision at 1.6M rows. Standard hygiene applies: temporal train/validate splits (train 2020–22, validate 2023, test 2024 is the common pattern), never random splits across seasons if you claim predictiveness; per-season re-centering of the output scale to absorb league drift and tracking-system changes (Statcast's 2020 Hawk-Eye transition and 2025 arm-angle additions both shift feature distributions). (proven)

## Feature Sets: The Consensus Stack and the Frontier

**Tier 1 (every model):** release speed; movement (IVB/HB or ax/az); release position x0/z0; extension; spin rate; pitcher handedness (or mirror-normalize horizontal quantities for LHP).

**Tier 2 (all serious models):** spin axis; **axis differential / seam-shifted wake** (inferred axis = atan2(HB, IVB) vs measured axis; the gap captures SSW movement hitters can't read from spin); **differentials vs primary fastball** (Δvelo, ΔIVB/Δaz, ΔHB/Δax) — these are what make a changeup's grade mean anything; spin efficiency where available.

**Tier 3 (2024–2026 frontier):** true **arm angle** (public in Statcast since late 2024 — previously proxied by release point, and the proxy is materially worse); movement-above-expected-given-arm-angle (BATcast, Shape+); VAA/HAA and approach-angle-above-expected; tunneling/trajectory-overlap metrics between pitch pairs; "bridge pitch" arsenal interactions. (promising)

**What stays out of a stuff model by definition:** plate location, count (except as a neutralization device in the target), batter identity, catcher framing. Put them in and you've built Pitching+, not Stuff+.

Two engineering details with outsized effect:
- **Pitch-family routing:** a slider-shaped "cutter" graded by the fastball sub-model gets a nonsense grade. PitchProfiler's arm-slot-relative movement-space router is the fix. (promising)
- **BP's feature admission rule** (causal pathway + out-of-sample lift) prevents the model from memorizing park/pitcher artifacts. (promising)

**For Soto:** Triton's `pitches` table already carries every Tier 1–2 input (release_speed, pfx_x/pfx_z, ax/az, release_pos_x/z, release_extension, release_spin_rate, spin_axis). Arm angle is derivable from release point + height now and joinable from Savant's arm-angle feed for 2024+. The 2015–2018 extension gap (why Stuff+ backfill sits at ~48% there) argues for a model variant that degrades gracefully when extension is null rather than dropping rows.

## What Stuff Predicts — and How Fast It Stabilizes

Consolidated numbers:

| Metric | Stabilization | Notes |
|---|---|---|
| FG Stuff+ | ~80 pitches | "reliable 80 pitches into the season" |
| aStuff+ (Salorio) | ~72 pitches (median) | < 1 SP start |
| proStuff+ (PitchProfiler) | ~60 pitches pitcher-level; **15 pitches** per pitch type | split-half correlation threshold |
| StuffPro (BP) | **27 pitches** to r=0.2 w/ next-season RV | vs 85 (PitchPro), ~500 (observed RV) |
| Location+/proLocation+ | 400–725 pitches | location is the slow half |
| Pitching+ | ~400 pitches SP / ~250 RP | point where it beats preseason projections |

What stuff grades actually predict well: future strikeout-adjacent outcomes and future *stuff* (tjStuff+ 0.85 YoY; 0.68 to next-season wOBA; proStuff+ r=0.572 to future FIP, beating FIP's own 0.537). What they predict poorly: same-season runs allowed in full (location + sequencing + defense dominate), BABIP details, and elite-vs-great separation at the top of the scale (PitchingBot's admitted weakness). Relievers systematically grade higher than starters (short-burst velo; tjStuff+ shows a positive reliever skew), so **normalize or benchmark by role** — which Triton's SP/RP classification convention already supports. (proven)

Practical reading: a stuff grade is a **talent radar and a development target**, not a results forecast. It answers "is this pitch physically good, and did our intervention make it better?" in one session — the exact question a facility asks.

**For Soto / Neptune:** stabilization at 15–60 pitches means a single TrackMan bullpen through the Compete pipeline yields a stable per-pitch grade — a stuff grade can be a *same-day* deliverable in a Neptune assessment. The CornBelters/Yakkertech collegiate build is the template for the level problem: retrain or re-center against the local run environment (college/HS run values ≠ MLB linear weights), or grades will be systematically miscalibrated. A pragmatic v1 for Neptune: score athletes with the MLB-trained model but report percentiles against level-specific baselines (mirroring Triton's `league_averages` pattern), and note explicitly that MiLB events data needs the Title-Case normalization Triton already documents.

## Known Failure Modes

1. **Goodhart drift (the big 2026 story).** Davy Andrews (FanGraphs, Jan 2026): as all 30 orgs and five public models trained pitchers *to the metric*, league Stuff+ SD compressed from 9.7 (2020) to 8.8 (2025); pitchers in the 94–106 band rose from 46% to 49%; below-average-stuff pitchers fell from 12% to 9%; and the stuff→wOBA correlation visibly weakened from 2021 to 2025. When a measure becomes a target, its predictive edge erodes. Retrain on rolling windows and expect coefficients (especially on velocity and sweep) to decay. (proven)
2. **The location hole.** By construction, stuff models can't see command. Splitters and other high-stuff/low-command pitches grade great and underdeliver; Nestico flags weak descriptiveness explicitly; proLocation+'s poor predictiveness shows the other side — the stable stuff, once excluded, leaves mostly noise. Never ship a stuff grade to an athlete without a command companion metric. (proven)
3. **Pitch-classification contamination.** Cutters are the canonical case: metric relationships that hold for four-seamers are "much weaker for cutters," partly because "FC" spans hard fastballs and baby sliders. Sub-model routing by movement shape (PitchProfiler's Stage-0) is the fix; naive models silently blend two populations. (promising)
4. **Deception, sequencing, tunneling blindness.** PitchingBot's own documentation lists command, deception, sequencing, spray-angle effects, and pitcher-defense interaction as blind spots. Andrés Muñoz-type outliers (FanGraphs's "analytical blind spot") over- or under-shoot their grades for reasons the feature set can't express. BATcast/Shape+ arm-angle-relative movement is the frontier patch. (promising)
5. **Novelty decay.** The sweeper's measured effectiveness declined 2023→2024 as hitters adapted (Nestico) — pitch-type coefficients are non-stationary; a model trained on 2020–22 overpays for sweep in 2026. (promising)
6. **Scale illusions.** Ratio scales (Driveline's 350 Chapman grade) vs SD scales (mean 100/SD 10) vs 20–80 vs RV/100 are not interconvertible by eyeball; per-pitch-type SDs differ (12.2–17.0 in FG Stuff+). Always publish the scale definition next to the number. (proven)
7. **The injury externality.** MLB's December 2024 study (62 pages, 200+ interviews) named velocity/stuff-chasing the #1 driver of the injury epidemic: average four-seam velo 91.3 → 94.2 mph since 2008 tracks the injury surge; max-effort short outings, offseason stuff-optimization camps, and TJ false-security (≈20% revision/failure rates cited) compound it. A stuff model in a training facility is an incentive machine — it will push athletes toward velo unless the surrounding program prices in workload and arm health. (proven)

**For Soto:** #7 is a design requirement, not a footnote. Neptune's stuff feedback loop should be co-displayed with acute:chronic workload and arm-care compliance, and Trevor's own TJ history makes this a credibility asset: Neptune can explicitly market "stuff gains without the injury tax" as the differentiator vs velo-mill facilities.

## How to Build One from Statcast Data (Triton Recipe)

A concrete v2 path from Triton's current Z-score Stuff+ to a learned model:

1. **Data:** `pitches` 2020–2025 (~2.5M+ usable rows post-2019 where extension coverage is ~99%). Drop PO/IN, rows missing velo or movement. Mirror horizontal quantities for LHP.
2. **Target:** count-neutralized xRV (tjStuff v3 style): compute per-pitch RV from Statcast's `delta_run_exp` (or rebuild from a run-expectancy matrix), then average by (outcome, count) and assign each pitch its cell mean. Later, upgrade to the decomposed 4-sub-model chain (swing → swing outcomes / take outcomes → batted-ball value) per pitch family.
3. **Features (v2, 12–14):** release_speed, ax, az, release_pos_x, release_pos_z, release_extension, release_spin_rate, spin_axis, axis_differential (atan2-inferred vs measured), speed_diff / ax_diff / az_diff vs primary fastball (usage-defined per season), derived arm angle. Optional: VAA (Triton already derives it client-side).
4. **Model:** LightGBM regressor, one model per pitch family (fastballs / breaking / offspeed) or a routed single model; temporal split (train ≤2023, validate 2024, test 2025); early stopping; monotonic constraint on velocity within fastballs is worth testing.
5. **Scaling:** per season × role, convert predicted xRV to mean 100 / SD 10 (flip sign so higher = better); persist per-pitch grades alongside the existing `pitch_baselines` values for A/B continuity; keep the Z-score formula as the documented client-side fallback.
6. **Validation targets to beat:** stabilization ≤ 80 pitches (split-half), YoY self-correlation ≥ 0.8, next-season wOBA correlation ≥ 0.6 at 100-pitch minimum — all achieved by public solo-author models, so they're the credibility bar. Log every eval query to `docs/Queries.md`, update `docs/VARIABLES.md` on metric changes, and mind the 8GB disk ceiling: write grades in batches with VACUUM between.
7. **Facility fork:** same feature schema over `compete_pitches` (TrackMan columns map 1:1 to velo/spin/movement/release), score with the MLB model, report percentiles vs level-specific baselines until enough local data exists to fine-tune — the Yakkertech/CornBelters precedent shows a level-specific run environment retrain is the eventual right answer. (promising)

Effort estimate: steps 1–5 are days, not months — Nestico, Maschino, Salorio, and Patel each shipped comparable models solo, and Patel's decomposed 24-model random-forest build reached R² 0.76 against observed RV.

## Sources

1. FanGraphs Library — Stuff+, Location+, and Pitching+ Primer: https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer/
2. FanGraphs Library — PitchingBot Pitch Modeling Primer: https://library.fangraphs.com/pitching/pitchingbot-pitch-modeling-primer/
3. FanGraphs — PitchingBot and Stuff+ Pitch Modeling Is Now on FanGraphs: https://blogs.fangraphs.com/pitchingbot-and-stuff-pitch-modeling-are-now-on-fangraphs/
4. Cameron Grove — PitchingBot: An Overview: https://baseballaheadinthecount.blogspot.com/2021/03/pitchingbot-overview.html
5. Baseball Prospectus — Introducing StuffPro and PitchPro (Sutton-Brown, Mar 2024): https://www.baseballprospectus.com/news/article/89245/stuffpro-pitchpro-introduction-new-pitch-metrics-bp/
6. Baseball Prospectus — StuffPro and PitchPro Leaderboards Are Live: https://www.baseballprospectus.com/news/article/89389/bp-announcements-stuffpro-and-pitchpro-leaderboards-player-cards/
7. Thomas Nestico — Modelling tjStuff+ v3.0: https://medium.com/@thomasjamesnestico/modelling-tjstuff-v3-0-10b48294c7fb
8. Jeremy Maschino — Modeling Updates: The Big One (PitchProfiler proStuff+): https://jmaschino56.medium.com/modeling-updates-the-big-one-d48f51efe070
9. Driveline Baseball — What Is Stuff? Quantifying Pitches with Pitch Models: https://www.drivelinebaseball.com/2021/12/what-is-stuff-quantifying-pitches-with-pitch-models/
10. Davy Andrews, FanGraphs — They Don't Make Pitch Models Like They Used To (Jan 2026): https://blogs.fangraphs.com/they-dont-make-pitch-models-like-they-used-to/
11. Derek Carty, FanGraphs — Introducing THE BAT X for Pitchers… and THE BATcast Stuff Model (Feb 2026): https://blogs.fangraphs.com/introducing-the-bat-x-for-pitchers-and-the-batcast-stuff-model/
12. Cade Cavin, FanGraphs Community — Shape+ v2.0: Isolating Pitch Quality With Relative Physics and Additive Modeling (May 2026): https://community.fangraphs.com/shape-v2-0-isolating-pitch-quality-with-relative-physics-and-additive-modeling/
13. Ajay Patel — xRV: Working Through Quantifying Pitches: https://ajaypatell8.medium.com/xrv-working-through-quantifying-pitches-1f9125e1c833
14. Bradley Greenberg — New MLB Stuff Models (DIY xCSW/xRV build): https://medium.com/@bradleyjg03/new-mlb-stuff-models-1be08693d0e4
15. Adam Salorio — Introducing My Stuff+ Model (aStuff+ stabilization): https://medium.com/@adamsalorio/introducing-my-stuff-model-2840f196cf01
16. Normal CornBelters — Stuff+ in Collegiate Baseball (Yakkertech, college run environment): https://cornbeltersbaseball.com/stuff-in-collegiate-baseball/
17. ESPN — MLB study identifies factors in rise of pitching injuries (Dec 2024): https://www.espn.com/mlb/story/_/id/43026688/mlb-study-identifies-factors-rise-pitching-injuries
18. MLB.com — MLB releases report on injuries to pitchers (Dec 2024): https://www.mlb.com/news/mlb-releases-report-on-pitcher-injuries-2024
