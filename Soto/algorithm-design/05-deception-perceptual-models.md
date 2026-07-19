---
title: Deception & Perceptual Models — Tunneling, Effective Velocity, Release Consistency, and Shape Uniqueness
domain: algorithm-design
tags:
  - pitch-tunneling
  - deception
  - effective-velocity
  - perceived-velocity
  - release-consistency
  - arm-angle
  - pitch-sequencing
  - perceptual-science
sources_reviewed: 24
last_updated: 2026-07-19
---

# Deception & Perceptual Models — Tunneling, Effective Velocity, Release Consistency, and Shape Uniqueness

## TL;DR

- **The hitter's budget is the whole game**: a ~400 ms pitch flight contains ~100 ms of pitch-type recognition, a ~167–175 ms swing-decision deadline (the BP "tunnel point" at 23.8 ft from the plate), and only ~65 ms (range 50–95 ms) of ball visibility between front-foot strike and release for an average delivery. Every deception metric is an attempt to tax one of those three windows. (proven)
- **Tunneling is real but small**: Roegele's PITCHf/x work found consecutive pitches overlapping within ~0–4 in at the decision point but diverging at the plate add roughly +2.5 to +3.8 pp of swinging strikes by pitch type (best pitchers +5–6 pp), and the *frequency* of tunneled sequences is a repeatable skill (YoY R² ≈ 0.38) — but league-wide tunnel differentials cluster tightly (league avg 10.0 in at tunnel point, 18.7 in at plate), so leaderboard spread is thin. (promising)
- **Effective Velocity as taught is mostly debunked at MLB level**: Driveline's 2.8M-pitch replication cut Husband's claimed 8–10 mph location-based EV spread to ≤1.25 mph using contact-point data, found the ±6 EV-mph sequencing edge reverses after controlling for count, and found season-level EV adherence explains ~3% of run prevention (R² = 0.028). (debunked as a sequencing system; the perceived-contact-depth physics is real but tiny)
- **Perceived velocity via extension is measurable and priced**: ~1.7 mph of perceived velo per foot of extension beyond the ~6.3 ft MLB average; Carter Capps at 8.2 ft extension gained ~3.5 mph perceived and ran the lowest contact rate in MLB (51.8%). Triton's Stuff+ already carries extension at weight 2.0 — correctly the smallest of the three z-terms. (proven)
- **Release consistency has peer-reviewed teeth**: Wakamiya et al. 2024 (344 MLB starters, ~818k pitches) found horizontal release-point variability predicts xFIP (R² = 0.207; each 1 cm reduction ≈ 0.161 xFIP improvement) and that MLB pitchers are measurably tighter than MiLB (coronal ellipse 373 vs 497 cm²) — a rare deception-adjacent metric with a level-separating benchmark. (proven)
- **Shape-vs-slot deviation is the best-supported "uniqueness" signal**: hitters carry Bayesian priors about movement conditional on arm angle; pitchers whose movement deviates from slot-expected movement out-perform (Sarris 2016: top-decile horizontal deviators 6.38% vs 5.77% SwStr%). Statcast's Nov-2024 arm-angle data and Max Bay's Dynamic Dead Zone made this modelable league-wide. (promising)
- **Sequence entropy matters more than sequence order**: Healey & Zhao (3M pitches, 7 seasons) showed higher pitch-to-pitch similarity → fewer strikeouts, and the correlation structure is a stable pitcher trait; but lab work (Kidokoro 2020) shows the *previous* pitch doesn't move next-swing timing (p = 0.338) — what moves it is whether the hitter *knows what's coming* (p < 0.001). Deny information, don't choreograph sequences. (promising)
- **The theory-value gap is the market**: BP's 2025 Arsenal Metrics (pitch-type probability, movement/velocity spread, surprise factor) show deceptive arsenals blunt hitters' times-through-order learning and raise whiffs, yet teams still price velocity over measured deception (Petit: 87.6 mph, .250 BABIP — lowest of 192 qualified pitchers since 2015 — and perpetually cheap). A validated deception residual is one of the few remaining open edges for a small shop. (promising)

## 1. The perceptual problem deception exploits

Deception is not a vibe; it is an attack on a well-characterized human information-processing pipeline. The constraints, from the perception literature and tracking data:

- **Decision deadline.** BP's tunnel work fixes the swing-commit point at ~175 ms before contact — 23.8 ft from the plate for an average MLB fastball. Statcast-adjacent analyses cited in Lindbergh's deception reporting use ~167 ms to decide and ~100 ms to recognize pitch type. Everything after the tunnel point is unactionable for the hitter. (proven)
- **Pre-release information.** PitchAI/ProPlayAI frame analysis found the ball is visible for an average of only ~65 ms (range 50–95 ms) between front-foot strike and release; "expected deception" work at Premier Pitching found bottom-decile pitchers hide the ball in only 9% of delivery frames vs 48% for top-decile. Hitters demonstrably use this window: temporal-occlusion studies show skilled batters identify pitch type and location above chance from pre-release kinematics alone. (proven)
- **Hitters are Bayesian.** The Kording-lab "Bayesball" study (1M+ professional pitches) showed batters integrate a prior (expected pitch, from count/pitcher/history) with a noisy likelihood (ball flight) roughly optimally — leaning on the prior when the pitch is predictable and on observation when it isn't (e.g., knuckleballs). Deception = corrupting the prior or starving the likelihood. (promising)
- **Kinematics bias speed perception.** Nakamoto et al. 2022 (VR, 13 college batters): manipulating pitcher body-movement speed shifted perceived ball speed with a massive effect (ηp² = 0.86), and hitters weight kinematic cues *more* at higher ball speeds, when flight information is less reliable. A slow-bodied delivery with a fast arm literally makes the same radar reading feel faster. Skilled batters re-weight cues adaptively; novices don't. (proven, in lab; promising for on-field magnitude)
- **Classic illusions.** Bahill & Karnavas showed the "rising fastball" and "late-breaking curve" are byproducts of the batter mis-estimating pitch speed and losing foveal tracking in the final ~150 ms — i.e., the illusions live exactly where deception metrics operate. (proven)

**For Soto:** every deception metric Triton builds should be tagged by *which window it taxes*: pre-release (ball-hiding, slot ambiguity), pre-tunnel-point (tunneling, release consistency), or post-commit (break/velocity divergence, shape-vs-expectation). That taxonomy keeps the model interpretable and maps cleanly to trainable interventions at Neptune.

## 2. Tunneling: the BP metric family and what it actually predicts

Baseball Prospectus (Long, Judge, Pavlidis, Jan 2017) operationalized tunneling on consecutive-pitch pairs, using Alan Nathan's drag-corrected trajectory math. The metric family, with league averages (min 1,000 pairs):

| Metric | Definition | League avg | Elite example (Lester) |
|---|---|---|---|
| Release differential | 3D distance between back-to-back release points | 2.4 in | 1.2 in |
| Tunnel differential | Separation at tunnel point (23.8 ft out) | 10.0 in | 9.8 in |
| Plate differential | Separation at the plate | 18.7 in | 19.1 in |
| Break differential | Post-tunnel spin-induced divergence | 2.6 in (~1 ball) | 2.8 in |
| Flight-time differential | Δ flight time of the pair | 0.026 s | 0.028 s |
| Release:Tunnel ratio | Release diff ÷ tunnel diff (lower = harder to distinguish) | 23.7% | 13.6% (best) |
| Break:Tunnel ratio | Post-tunnel break ÷ tunnel diff (higher = more divergence per unit of sameness) | 27.6% | 28.3% |

The empirical anchor predates BP: Roegele (THT, Nov 2014; PITCHf/x 2013–14; decision point set 21 ft from release):

- Sequences overlapping tightly at the decision point but separating at the plate ("in-band") ran elevated SwStr% on the second pitch — roughly 15–17% vs 10–14% baseline bands; by pitch type the in-band bump was +2.5 pp (two-seam) to +3.8 pp (knuckleball), +2.6 pp four-seam, +2.7 pp slider, +3.1 pp curve. 87.7% of in-band pairs were different pitch types (modal pair: four-seam → slider). (proven as an observed association)
- In-band *frequency* is a pitcher skill: YoY R² = 0.38. Leaders: Dickey 24.4%, Iwakuma/Williams 21.2%, Cueto 20.6% (+5.3 pp SwStr in-band), Hamels 20.2% (+6.0 pp). The *result* of tunneled pairs is less repeatable than the frequency. (promising)
- Hitter *vulnerability* to tunneled pairs is also sticky (in-band R² = 0.48) — Adam Jones +6.3 pp, vs Beltrán at −1.4 pp. Tunneling susceptibility is a scoutable hitter trait. (promising)

Two honest caveats. First, causality: BP themselves framed the 2017 release as quantifying the phenomenon, not proving value, and practitioner critiques (Blewett, THT 2017) note pitchers overwhelmingly select pitches for expected outcome, not tunnel geometry — tunneling is mostly an emergent property of a repeatable delivery plus a well-designed arsenal. Second, spread: the league clusters within ~1–2 inches on tunnel differential, so pair-level noise is large relative to true talent; consecutive-pair metrics need heavy shrinkage. (plausible-to-promising as a *predictive* input; proven as a descriptive one)

The modern successor is BP's **Arsenal Metrics** (Sutton-Brown, Jan 2025), which drop the consecutive-pair framing for a batter-expectation model: pitches are projected into the batter's field of view, and each pitch gets (1) **pitch-type probability** (could the hitter identify it by the decision point, given release, early trajectory, count-weighted usage), (2) **movement spread** and (3) **velocity spread** (width of the movement/velo distribution the hitter must defend, mixing the arsenal by identification probability), and (4) **surprise factor** (density of the expected-movement distribution at the observed movement). Findings on 2024 starters (≥1,500 pitches): hitters make significantly worse swing/take decisions against above-average arsenal scores; high surprise factor correlates with higher whiff-on-swing; and — the sharpest result — deceptive arsenals *dampen the familiarity effect*, i.e., hitters improve less on repeated exposures within a game (times-through-order mitigation). Leaders pass the smell test: Waldron (knuckleball) tops movement/velocity spread and surprise; Lorenzen and Carrasco top disguise; Fried and Gilbert rate as intended. (promising — BP concedes validation is ongoing)

**For Soto:** this is the architecture to steal for `pitcher_season_deception` v2. The expectation-mixture formulation (identification probability × arsenal movement distributions → spread + surprise) is buildable from Statcast columns Triton already has (release_pos, plate trajectory via 9-param fit, pitch usage by count). The pair-based BP 2017 metrics are cheaper and worth keeping as descriptive dashboard tiles, but the TTO-dampening validation target is the one worth replicating on the 7.4M-row table.

## 3. Release consistency: the one deception input with peer-reviewed effect sizes

Three tiers of evidence:

- **Wakamiya et al. 2024** (Frontiers in Sports & Active Living; 344 MLB starters, 300,884 four-seamers + 517,530 breaking balls; 64 MiLB starters as comparison): horizontal release-point variability (RPX, 95% confidence-ellipse width) was the standout predictor. Every 1 cm reduction in RPX variability ≈ 0.161 better xFIP (model R² = 0.207); RPX variability also loaded on K/9 (β = −0.122, in a K/9 model with R² = 0.345 alongside velocity β = 0.514) and HR/9 (β = 0.168). Level separation: MLB four-seam coronal ellipse 373.5 ± 184.8 cm² vs MiLB 497.1 ± 300.8 cm²; vertical SD 15.2 vs 17.5 cm. BB/9 was essentially unpredicted (R² = 0.011) — consistency buys strikeouts and homer suppression, not walks. (proven)
- **Tracking-era norms:** in-game per-pitch release SDs for MLB pitchers run ~1–2 inches per axis; across 48 pitcher-pitch-type combos the most vs least variable averaged 2.08 vs 1.12 in — the whole league lives inside an inch of spread, which is why pair-level release differential (BP league avg 2.4 in back-to-back) is mostly delivery noise plus intentional slot variation. (proven as description)
- **The caveat that saves you from a bad KPI:** in-game fastball release consistency does **not** correlate with walk rate, and some effective pitchers *deliberately* vary slot. A raw "minimize release SD" target would punish them. The defensible metric is **cross-pitch-type release convergence** (do his FB and SL come from the same window?) separated from **within-pitch-type repeatability** (can he hit the same window twice?). Wakamiya's RPX result is about the latter; BP's release differential is about the former. (promising)

Benchmarks for facility use: an MLB-caliber within-type release SD is ≲1.5 in per axis; cross-type centroid offsets ≳3 in are visually detectable and show up as tipping (BP's release:tunnel ratio league avg 23.7%, elite ≈13%).

**For Soto:** TrackMan CSVs in `compete_pitches` carry Release Height/Side/Extension per pitch — Neptune can compute within-type SD and cross-type centroid distance *today*, and they are the rare deception numbers with (a) a published MLB-vs-MiLB benchmark gap and (b) a trainable intervention (delivery repeatability work, pitch-grip changes that preserve slot). Add both to the Compete session report; longitudinally they're also a fatigue/mechanics-drift flag for Trevor's own bullpens.

## 4. Effective velocity and perceived velocity: separating physics from folklore

**Perceived velocity (extension)** is the clean half. Statcast PV normalizes release speed to the league-average release distance: with MLB average extension ~6.3 ft, each additional foot of extension ≈ +1.7 mph perceived. Distribution facts: actual-vs-perceived correlation is 0.95 and ~40% of pitchers sit within 0.5 mph of their gun reading — extension is a real but second-order lever. The tails are instructive: Carter Capps (8.2 ft extension, longest tracked) perceived at 101+ on a high-90s fastball and posted the lowest contact rate in baseball (51.8%) with a 74.4% curveball whiff rate; Joel Peralta released under 5 ft from the rubber, a ~39-inch, ~6+ mph perceived gap to Capps; Yordano Ventura *lost* ~2 mph perceived despite top-6 starter velocity. Extension correlates with height at only r = 0.25 — it's a skill, not an anthropometric destiny. (proven)

**Effective Velocity (Husband)** is the contested half. The theory: contact point varies by location (inside pitches met farther out front), so location changes functional pitch speed; hitters can stay on time within a ±6 "EV mph" window; sequences violating EV principles get punished — Husband claims ~50% of MLB homers come on back-to-back pitches within 6 EV mph. Driveline's replication (Aucoin, May 2019; 2.8M Statcast pitches 2015–18, ~5,000 HitTrax BIPs for contact-point calibration, controls for count/park/batter/pitcher/platoon):

- The location-based EV adjustment, recomputed from measured contact depth, is ~1.25 mph max spread (+0.84/−0.44), not the 8–10 mph in EV charts — an order of magnitude smaller. (debunked at claimed magnitude)
- Within-±6-EV sequences allowed +0.7 mph exit velo and +9 pts xwOBACON raw — but the sign *flips* after controlling for count. The raw pattern is selection bias (where hitters' counts occur), not deception. (debunked)
- Season-level: share of EV-compliant sequences vs projected RA9, R² = 0.028; no correlation with any performance metric exceeded 0.08. EV and PV added no predictive value over raw release speed. (debunked as a predictive system)

Husband published a rebuttal (methodology disputes over EV-zone definitions and pitch-pair classification), and one sympathetic re-analysis found r ≈ 0.31 between EV differential and swinging-strike rate on specific pairs — so a residual "don't live in one timing window" heuristic survives, but the elaborate zone arithmetic does not. (plausible, small)

**For Soto:** keep extension in Stuff+ (weight 2.0 is consistent with the literature's ~0.3–0.5 run-value ordering below velo and movement); do *not* build an EV-sequencing feature into any Triton model — Driveline's null is about as decisive as public baseball research gets. The durable descendant of EV is simply **velocity spread** (BP arsenal metric #3): the width of the velo distribution the hitter must defend, which is measurable, repeatable, and correlated with worse swing decisions.

## 5. Arm-slot and shape uniqueness: deviation from the hitter's prior

If hitters are Bayesian, the exploitable quantity is the *gap between expected and actual pitch behavior conditional on visible cues* — chiefly arm slot. Evidence chain:

- **Sarris (FanGraphs, 2016)** regressed movement on true release height: release point explains ~11% of horizontal-movement variance (r² = 0.107) and ~30% of vertical. Top-decile *horizontal* deviators (ball doesn't fade the way the slot advertises — e.g., Mychal Givens) beat sample average on swinging strikes 6.38% vs 5.77%, plus more grounders and pop-ups; vertical deviation showed little edge. (promising)
- **Statcast arm angle (released Nov 2024, backfilled to 2020)** turned this from proxy work into direct measurement. Davy Andrews (FanGraphs, Nov 2024): vs same-handed hitters, arm angle correlates with xwOBA at 0.23 (wOBA 0.13) — higher slots play better in-platoon — vs opposite-handed only −0.11; follow-up work found that once you have measured arm angle, release point adds little (the angle, not the height, carries the signal). (promising)
- **Max Bay's Dynamic Dead Zone** (public app, 2024): models *expected* four-seam/sinker/cutter shape as a mixture distribution conditional on measured arm angle and height-scaled extension, using release-direction-relative acceleration (time-invariant under constant acceleration) as the shape basis. Fastballs sitting in the slot-conditional expectation are "dead-zone" pitches; deviation in either direction (hop from a low slot, cut where fade is expected) is the uniqueness signal. This is the correct formalization: dead zone is *dynamic*, defined per-pitcher by the prior his own slot induces. (promising)
- **Approach-angle flatness** is the special case that's best quantified: MLB-average four-seam VAA ≈ −5.0°; flat-VAA fastballs (Peralta −3.7°, Strider −4.1°, Wheeler −4.0°, Cole −4.3°) out-whiff steep ones especially at the top of the zone, because they violate the hitter's downward-trajectory prior; the effect is height- and release-conditional, so model it per location. (proven as an association; promising as a causal "perceptual" effect)
- **Population uniqueness** adds a second layer: a 34° slot lefty is deceptive partly because hitters see few of them — BP explicitly lists league-wide slot-conditional expectation as future arsenal-metric work; scarcity-weighting a pitcher's (slot × shape) cell against the league population is straightforward with 7.4M rows. (plausible — little direct public validation yet)

**For Soto:** Triton's `unique_score` should be rebuilt as three explicit components: (1) **shape-vs-slot residual** — movement minus slot-conditional expected movement (Bay-style mixture, fit on the `pitches` table with Statcast arm_angle); (2) **population scarcity** — density of the pitcher's (handedness, arm_angle, shape) cell across league pitch-seconds a hitter faces; (3) **VAA/HAA deviation from location-conditional norms** (Triton already derives VAA/HAA client-side). Component (1) has the best evidence; (3) is the most actionable in pitch design at Neptune (target flat VAA up, steep down).

## 6. Timing disruption and sequencing: entropy beats choreography

- **Healey & Zhao (J. Sports Analytics, 2017; ~3M PITCHf/x pitches, 7 seasons):** computed pitch-to-pitch correlations of velocity and movement per pitcher (a predictability measure). Correlations are persistent year-to-year (a trait), and in a strikeout model, *higher* consecutive-pitch similarity predicts *fewer* strikeouts, holding stuff constant — batters' swing errors grow with the property-differences between consecutive pitches. This is the best large-sample support for variety-as-timing-tax. (promising)
- **Kidokoro et al. (PLoS ONE, 2020; 26 HS hitters, machine pitches at 34.3 vs ~25.5 m/s):** the *previous* pitch type had no effect on next-swing timing error (p = 0.338); what mattered was information — knowing the upcoming pitch type cut timing error sharply vs random (p < 0.001). Timing tolerance windows were ±7.9 ms (fastball) and ±10.7 ms (offspeed). Read together with Healey & Zhao: the value of "sequencing" is not a magic order of pitches, it's maintaining a wide, unpredictable distribution the hitter can't collapse with a prior. (proven in lab; promising for field translation)
- **Flight-time framing:** BP's flight-time differential (league avg 26 ms between consecutive pitches) is of the same order as the hitter's entire ±8–11 ms timing tolerance — a well-disguised 10 mph velo gap is unhittable *if* the hitter can't pre-commit, which loops back to disguise (pitch-type probability) as the binding constraint. (plausible)
- **Practical synthesis:** whiff-oriented deception = maximize (velocity spread × movement spread) *subject to* low pitch-type identifiability and tight cross-type release convergence. Every term is now separately measurable. (promising)

**For Soto:** add a **sequence-entropy** feature (Shannon entropy of pitch type by count, plus Healey-style consecutive-pitch velocity/movement autocorrelation) to the deception table — it's cheap, year-over-year stable, and orthogonal to Stuff+. For Neptune hitters, the Kidokoro result is equally useful in reverse: pitch-recognition/occlusion training attacks exactly the information channel pitchers are trying to close, and Roegele's hitter-side repeatability (R² = 0.48) says vulnerability is diagnosable from data Triton already has.

## 7. The gap between deception theory and measurable value

Where the ledger actually stands:

- **Proven, sizable:** perceived velocity/extension effects on contact; release-consistency → xFIP (Wakamiya); pre-release kinematic cues biasing perception (lab); hitters' Bayesian integration.
- **Promising, small-to-moderate:** tunneling's whiff bump (+2.5–6 pp on the ~15–20% of sequences that qualify — roughly a 0.5–1 pp arsenal-level SwStr% effect for the best practitioners); shape-vs-slot deviation (+0.6 pp SwStr% for top-decile deviators); arsenal spread/surprise correlating with swing-decision errors and TTO dampening; sequence entropy → K.
- **Debunked or unsupported:** EV-zone sequencing arithmetic; "peak production at 90 EV mph"; any public claim that pair-level tunnel metrics *predict* run prevention out of sample (BP never claimed it; nobody has shown it).
- **Structural reasons the measured value looks smaller than the theory:** (1) survivorship — every MLB pitcher is already above a deception floor, compressing observed spread (MiLB-vs-MLB release-ellipse gap shows the selection); (2) consecutive-pair metrics carry enormous noise relative to trait signal; (3) deception residuals get absorbed by outcome models as unexplained BABIP/whiff variance — Petit ran the lowest BABIP (.250) of 192 qualified pitchers over seven seasons and the market still paid him as an 87.6 mph journeyman; his agent's complaint ("he'd earn more throwing harder with identical stats") is the inefficiency stated plainly. (promising)
- **Why this matters for a small shop:** the measurement stack that closes the gap (Hawk-Eye arm angle, KinaTrax 19-segment/119-point mocap, ball-hidden-ratio video, PitchAI markerless at 4–10% of marker-system error) has consumer-grade equivalents now. A facility with TrackMan + high-speed video can compute 80% of the deception features MLB clubs use. (plausible)

## 8. Build spec: Triton deception v2 and the Neptune protocol

**Triton (`pitcher_season_deception` v2)** — five sub-scores, each z-scored per season/level, combined into `deception_score`; keep `unique_score` as the slot/shape component:

1. **Disguise** — pitch-type identifiability at the decision point (BP arsenal metric #1 analog): classifier predicting pitch type from release point + first-half trajectory, count-usage-weighted; score = 1 − top-1 probability. Validate against TTO dampening and swing-decision error.
2. **Spread** — arsenal velocity + movement distribution width, identification-weighted (kills two birds: EV's surviving kernel and Healey entropy).
3. **Surprise** — density of observed movement under the arsenal-expected distribution (log-loss style, per pitch, aggregated).
4. **Uniqueness** — shape-vs-slot residual + population scarcity + VAA deviation (Section 5).
5. **Release** — within-type release SD (penalize) and cross-type centroid divergence (penalize), per Section 3's split.

Validation gates before shipping any of it to player pages: year-over-year reliability ≥ 0.5 at 1,500-pitch samples; incremental R² over Stuff+ + location on CSW%/whiff; and the Sauberman-style sanity check that leaders skew toward known low-velo overperformers (his 2020 CSW-fit weights — unpredictability 5.67, indistinguishability 2.19, unexpectedness 6.88 — found Tyler Rogers/Karinchak-type leaders; 7 of his top 10 were below-average velo with above-average results).

**Neptune protocol** (per bullpen, from `compete_pitches`): within-type release SD (target ≲1.5 in/axis), cross-type release centroid offsets (flag >3 in), velo/IVB/HB spread map, VAA by intended location, and a slot-conditional expected-shape overlay once arm angle is derivable (TrackMan release height/side + extension approximates it). For Trevor specifically: his late-career relief profile lived on a high-slot four-seam/slider pair — his own historical Statcast rows are the demo dataset for the disguise/tunnel tiles, which doubles as content for the Mayday channel.

## Sources

1. Long, Judge & Pavlidis, "Introducing Pitch Tunnels," Baseball Prospectus (Jan 2017) — https://www.baseballprospectus.com/news/article/31030/prospectus-feature-introducing-pitch-tunnels/
2. Sutton-Brown, "Introducing BP's New Arsenal Metrics," Baseball Prospectus (Jan 2025) — https://www.baseballprospectus.com/news/article/96026/introducing-new-arsenal-metrics/
3. Roegele, "The Effects of Pitch Sequencing," The Hardball Times (Nov 2014) — https://tht.fangraphs.com/the-effects-of-pitch-sequencing/
4. Blewett, "Pitch Tunneling: Is It Real? And How Do Pitchers Actually Pitch?" The Hardball Times (Jun 2017) — https://tht.fangraphs.com/pitch-tunneling-is-it-real-and-how-do-pitchers-actually-pitch/
5. Aucoin, "Calling the Right Pitch: Investigating Effective Velocity at the MLB Level," Driveline Baseball (May 2019) — https://www.drivelinebaseball.com/2019/05/calling-right-pitch-investigating-effective-velocity-mlb-level/
6. Husband, "Effective Velocity is Apparently Not 'Effective' — Driveline's 'Study' of EV" (rebuttal, Jun 2019) — https://perryhusband.wordpress.com/2019/06/12/effective-velocity-is-apparently-not-effective-drivelines-study-of-ev/
7. MLB Statcast Glossary, "Perceived Velocity" — https://www.mlb.com/glossary/statcast/perceived-velocity
8. Lindbergh, "Pitches in Radar Gun Are Slower Than They Appear: Identifying Baseball's Perceived Velocity Kings," Grantland (2015) — https://grantland.com/the-triangle/2015-mlb-actual-versus-perceived-velocity-statcast-pitcher-data-carter-capps/
9. Lindbergh, "Yus Your Illusion: Yusmeiro Petit and the Well-Hidden Power of Pitcher Deception," The Ringer (Sep 2021) — https://www.theringer.com/2021/09/28/mlb/yusmeiro-petit-deception-pitching-delivery-velocity-biomechanics-invisiball
10. Sarris, "An Attempt to Quantify Pitcher Deception," FanGraphs (Feb 2016) — https://blogs.fangraphs.com/an-attempt-to-quantify-pitcher-deception/
11. Andrews, "An Arm Angle Update That Ends With a Mystery," FanGraphs (Nov 2024) — https://blogs.fangraphs.com/an-arm-angle-update-that-ends-with-a-mystery/
12. Statcast Pitcher Arm Angle Leaderboard, Baseball Savant (launched Nov 2024) — https://baseballsavant.mlb.com/leaderboard/pitcher-arm-angles
13. Bay, "Dynamic Dead Zone" app, MLB Pitch Profiler (2024) — https://www.mlbpitchprofiler.com/dynamic_dead_zone
14. Chamberlain, "A Visualized Primer on Vertical Approach Angle (VAA)," FanGraphs (Feb 2022) — https://blogs.fangraphs.com/a-visualized-primer-on-vertical-approach-angle-vaa/
15. TDA Baseball, "A Beginner's Guide to Evaluating Four-Seam Fastballs" (VAA benchmarks) — https://www.tdabaseball.com/post/a-beginners-guide-to-evaluating-four-seam-fastballs
16. Sauberman, "Quantifying Pitcher Deception," Towards Data Science (Dec 2020) — https://towardsdatascience.com/quantifying-pitcher-deception-7fb2288661c8/
17. Resnic, "Introducing Deception Runs and Deception+," Medium/Saberseminar — https://medium.com/@bsresnic/introducing-deception-runs-and-deception-a-measurement-of-a-pitchers-ability-to-force-a-batter-d161ddd7603a
18. Healey & Zhao, "Using PITCHf/x to model the dependence of strikeout rate on the predictability of pitch sequences," Journal of Sports Analytics (2017) — https://content.iospress.com/articles/journal-of-sports-analytics/jsa103
19. Kidokoro et al., "Does the combination of different pitches and the absence of pitch type information influence timing control during batting?" PLoS ONE (2020) — https://pmc.ncbi.nlm.nih.gov/articles/PMC7077830/
20. Nakamoto et al., "Optimal integration of kinematic and ball-flight information when perceiving the speed of a moving ball," Frontiers in Sports and Active Living (2022) — https://pmc.ncbi.nlm.nih.gov/articles/PMC9744931/
21. Bahill & Karnavas, "The Perceptual Illusion of Baseball's Rising Fastball and Breaking Curveball," University of Arizona — http://sysengr.engr.arizona.edu/publishedPapers/PerceptualIllusion.pdf
22. Kording Lab, "Bayesball: Bayesian Integration in Professional Baseball Batters," bioRxiv (2022) — https://www.biorxiv.org/content/10.1101/2022.10.12.511934v1
23. Wakamiya et al., "Relationship between ball release point variability and pitching performance in Major League Baseball," Frontiers in Sports and Active Living (2024) — https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1447665/full
24. "Studying Release Point Standard Deviation From Center," FanGraphs Community — https://community.fangraphs.com/studying-release-point-standard-deviation-from-center/
