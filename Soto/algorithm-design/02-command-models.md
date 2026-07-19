---
title: Command Quantification — Location+, Miss-Distance, and Intent-Inference Models
domain: algorithm-design
tags:
  - command
  - location-plus
  - miss-distance
  - catcher-target
  - intent-inference
  - stabilization
  - trackman
  - statcast
sources_reviewed: 17
last_updated: 2026-07-19
---

# Command Quantification — Location+, Miss-Distance, and Intent-Inference Models

## TL;DR

- **Command ≠ control, and the industry has clean definitions**: control = throwing strikes (measurable directly via Zone%/called-strike probability); command = hitting the *intended* location — which is fundamentally unobservable in public data. Every command metric is a workaround for missing intent (proven).
- **Location+ is the industry-standard public model but its own creators aren't satisfied with it**: it assigns count- and pitch-type-conditional run values to locations, scaled to mean 100 with SD ≈ 3.34 (SP) / 5.87 (RP). It stabilizes at ~400 pitches (vs ~80 for Stuff+) and its year-to-year R² is ~0.39 — the weakest link in Pitching+ (proven).
- **Real miss distances are enormous**: COMMANDf/x-era glove-tracking data suggested MLB pitchers miss the catcher's target by ~13 inches on average; Inside Edge human-charted intent puts average MLB fastball miss at ~11 inches. A Driveline athlete example: slider miss distance improving from 12.5" to 10.8" was a meaningful development win. Elite command is a difference of 2–3 inches of average miss, not a different universe (promising).
- **Catcher-glove approaches (COMMANDf/x, SIS mitt tracking, "command/x") repeatedly stalled**: the glove is not always the true target, catchers relax between the sign and the pitch, and results were never made public. Human charting (Inside Edge, Stats Perform Command+) and in-facility intended-zone capture (Driveline IZT) are the only intent sources that have held up (proven).
- **Release-angle command metrics (Kirby Index) are a cautionary tale**: vertical/horizontal release angle + release point predicts location with R² 0.92/0.85 and the index's year-to-year R² (0.5) beat Location+ (0.39) — but the follow-up showed release angles and location are near-duplicates of the same 9-parameter trajectory fit, and the single-target assumption punishes pitchers who deliberately vary (e.g., Mikolas near-last in Kirby Index despite near-best BB%) (debunked as a standalone command metric; promising as a repeatability feature).
- **Probabilistic intent inference is the current frontier**: xCTRL (Wharton, 2025) fits Gaussian mixture models over pitch locations to infer latent targets per pitcher/pitch-type/count, then scores execution as dispersion around inferred intent — separating "aimed badly" from "missed badly" without any target data (promising).
- **Stabilization reality check**: BB% needs ~120 BF (Carleton), Location+ ~400 pitches, CSAA "a couple weeks of games," Kirby Index ~1–2 starts, raw miss distance in a facility ~10–30 throws per pitch type for a usable read. In-facility intent capture gives you reliable command reads two orders of magnitude faster than public proxy models (promising).
- **For Triton/Neptune the design answer is a two-tier system**: a Statcast-side proxy model (location run value + mixture-model dispersion) for the platform, and a TrackMan-side true miss-distance pipeline (intended-zone tagging in Compete) for the facility — the facility tier produces the ground truth the platform tier can never see (plausible, design opinion).

## 1. Command vs Control: The Definitional Foundation

The distinction is settled vocabulary at this point. Control is the ability to throw the ball in the strike zone; command is the ability to throw the ball to a particular location (proven). Control is directly observable — Zone%, called-strike probability, BB%. Command is not, because the intended target is a latent variable: a pitch on the black could be perfect execution of a conventional plan or a lucky miss off an unconventional one. Eno Sarris's summary of the field still holds: "in order to best judge command, you'd have to know exactly what the pitcher intended to do with the ball."

Baseball Prospectus operationalized the split cleanly in their 2017 CSAA work (Judge/Pavlidis/Long): **CS Prob** (average called-strike probability of a pitcher's taken pitches) measures control — Bartolo Colon led 2016 at 52.1%. **CSAA** (Called Strikes Above Average — extra called strikes after controlling for umpire, catcher, batter/pitcher handedness, location, pitch type, count) measures command — 2016 leaders were Zach Davies (+3.5%), Josh Tomlin (+2.8%), Kyle Hendricks (+2.5%). The key empirical insight: elite command pitchers deliberately live *outside* the highest-probability strike bands, concentrating pitches in the 0–30% called-strike-probability shadow zones rather than the middle (proven). Greg Maddux ran 8–10% CSAA in 1995–97; Glavine's 2008 was 7+ SD above the mean — an existence proof that command skill has a very long right tail.

Two corollaries matter for model design:

1. **BB% and K-BB% are contaminated proxies.** They fold in stuff, deception, and approach. A pitcher with elite chase-inducing stuff can run a low BB% with mediocre command (proven).
2. **Command is pitch-type- and count-conditional.** The "right" location for a 2-0 fastball and a 1-2 slider are different targets with different acceptable-miss geometry. Any model that scores location against a single ideal collapses this structure (proven).

**For Soto:** Triton's `pitcher_season_command` table should explicitly separate a control family (Zone%, CS Prob-style, Edge%) from a command family (location value vs. count/pitch-type baseline, dispersion metrics). Don't ship one number called "command" that is actually control — Trevor's audience will catch it.

## 2. Location-Value Models: Location+ and PitchingBot Command

**Location+** (Max Bay/Eno Sarris lineage, hosted on FanGraphs) is the reference public implementation. Mechanics: build run-value maps over plate location, conditioned on count and pitch type (stuff-blind — no velo/movement inputs), score each pitch against the map, aggregate, scale to mean 100. Key published numbers:

- Standard deviations: Stuff+ SP 12.16 / RP 17.02; Location+ SP 3.34 / RP 5.87; Pitching+ SP 4.94 / RP 6.61. Ten points ≈ 1 SD at the pitch level (proven).
- Stabilization: Stuff+ becomes reliable at ~80 pitches; Location+ needs ~400 pitches to reach Cronbach's alpha ≈ 0.9; Pitching+ beats preseason projections at ~250 pitches (RP) / ~400 (SP) (proven).
- Year-to-year: Location+ R² ≈ 0.39 — markedly less sticky than Stuff+, which is why Stuff+ carries most of Pitching+'s predictive load despite location mattering more on any individual pitch (proven).

The known weaknesses, acknowledged even by its creators: (a) it assumes league-uniform intent for each count/pitch-type cell — a sinkerballer attacking arm-side off the plate gets graded against the same map as everyone else; (b) it is slow to stabilize because run-value maps are noisy targets; (c) it partially rewards approach (choosing good locations) rather than execution (hitting chosen locations) — these are different coaching problems (proven).

**PitchingBot's command grade** (Cameron Grove, also on FanGraphs) is the same family: location + count, pitch-type-aware but characteristics-blind. Same structural limits apply.

The 2013 Hardball Times "Quantifying Pitcher Command" work is an interesting third flavor: define command as locating where *the specific batter* is least effective, over 18 zone regions. Its repeatability numbers were surprisingly strong — swinging-strike command R² = 0.52, ground-ball command R² = 0.65 year-over-year — but the author conceded this measures "effectively wild" outcome-targeting, not target-hitting (promising as an approach metric, not a command metric).

**For Soto:** Triton can implement a Location+ clone directly on the 7.4M-row `pitches` table: empirical run-value maps per (count, pitch_name, batter side), smoothed with a 2D kernel or GAM, scored per pitch, aggregated per pitcher-season, plus-scaled against `league_averages` conventions. Expect to need ~400-pitch minimums before displaying, mirroring the qualification logic already used for league averages. This is the platform-tier command number; label its stabilization honestly in the UI.

## 3. Miss-Distance Approaches with Catcher-Target Data

This is the family the industry keeps returning to, because it's the only one that measures command as coaches define it. (Naming note: the metrics sometimes cited alongside this family — BP's SEAGER and Statcast's Blocks Above Average — are actually a *hitter swing-decision* metric and a *catcher blocking* metric respectively; neither is a pitcher-command model. The real catcher-target lineage is below.)

**COMMANDf/x (Sportvision, ~2010s).** Tracked catcher glove position from initial target to catch point. Findings were never publicly released, and the effort is remembered mostly for its failure modes: catchers set targets inconsistently, there's a "relaxation moment" between showing the target and receiving, and the glove often isn't the true target at all (a glove low-away can mean "start it here" for a back-foot slider). Its headline number — average MLB miss ≈ 13 inches from the glove — was widely disputed by practitioners but has roughly held up against later intent-based estimates (proven that the approach stalled; promising that the magnitude was about right).

**Inside Edge / Stats Perform Command+ (2018–).** Human charters tag the intended target for every MLB pitch — the approach Sarris profiled in The Athletic and that Stats Perform productized as Command+. Trained-eye tagging captures nuance no glove-cam can (sequences, intentional balls, "start it off the plate" intents). Derived numbers: MLB average fastball miss ≈ **11 inches** from intended spot. Driveline's public work uses Inside Edge intent data as its MLB benchmark reference (promising — proprietary, but the only at-scale true-intent MLB dataset).

**Sports Info Solutions mitt tracking (2019–2021).** SIS charted catcher mitt position for every MLB pitch and published a fastball study defining "on target" as within ±3" of mitt center, vertical axis only. Structural findings: catchers set up in the lower third on 84.9% of all pitches; for fastballs the split is 75% low / 13% middle / 11% upper third. Outcome asymmetries were real and directional: with a middle-third target, missing *high* raised SwStr% to 15% (vs 10% on target), while missing low produced xSLG .587 on contact; with an upper-third target, hitting it yielded 19% SwStr% (proven within its scope). Lesson: miss *direction* carries as much signal as miss distance — a 6-inch miss above a high target is often a better pitch than a 3-inch miss below it.

**Driveline Intended Zones Tracker (IZT).** The in-facility gold standard: intended location selected and projected onto the zone (projector), actual location from TrackMan, miss distance computed instantly per throw. This closes the intent gap completely — the pitcher literally declares the target. Driveline layers a "Location Run Value" on top (run value of actual vs intended location) and reports command alongside velo and stuff grades in real time. Published example deltas: a pitcher's slider average miss improving 12.5" → 10.8" across a training block (promising; small public evidence base but conceptually airtight).

**Driveline's biomechanics-of-command study (Feb 2026)** is the most important recent empirical result in this space. Setup: 27 athletes (college → MLB), 270 throws at ~90% intensity, command = IZT miss distance, biomech from mocap at four events (peak knee height, foot plant, max external rotation, ball release). Findings: low variability of glove-side shoulder abduction and torso lateral tilt *at foot plant* correlated with smaller miss distance; "dampening scores" (variability ratios between sequential phases) showed correlations exceeding r = 0.6; 10 principal components explained 80% of biomech variance. The model of elite command that emerges: allow early variability (leg lift/coil adjusts), converge to a consistent position at foot plant, then make late micro-adjustments in the arm (variable pronation rate at release with consistent upper-body kinematics) (promising — n=27, cross-sectional, but the first quantitative bridge between mechanics and measured command).

**For Soto:** Neptune should implement the IZT pattern from day one — it needs only TrackMan (already in hand via Compete) plus a target-declaration UI. Schema: add `intended_x`, `intended_z` (or `tagged_target_x/y`, already on the Data-app backlog) to `compete_pitches`, compute `miss_distance`, `miss_x`, `miss_z` per pitch. Benchmarks to display against: MLB fastball ≈ 11" average miss; treat sub-9" as elite, 11–13" as pro-average, and expect amateur intakes meaningfully above that. Report miss direction (polar histogram) alongside magnitude — the SIS asymmetries mean a coach cares whether misses are glove-side-low vs arm-side-high.

## 4. Release-Angle Repeatability: The Kirby Index Arc

Michael Rosen's Kirby Index (FanGraphs, May 2024) measured four-seam command as the weighted standard deviation of four release parameters — vertical/horizontal release angle and vertical/horizontal release point. The seductive numbers: release trajectory variables predict pitch location with R² = 0.92 (vertical) and 0.85 (horizontal), versus 0.06/0.05 without angles; year-to-year R² of 0.5 beat Location+'s 0.39; and it produced a usable read within 1–2 starts. 2024 leaders: Cody Bradford 0.854, Hunter Harvey 0.836, George Kirby 0.724.

Rosen's own follow-up ("Revisiting the Kirby Index," 2025) substantially walked it back: release angles and plate location come from the *same* 9-parameter Statcast trajectory fit, so "release-angle consistency" is close to a re-derivation of location consistency, not an independent mechanical signal. Worse, the single-target assumption punishes deliberate variation — Miles Mikolas ranked near last despite a near-league-best walk rate because he intentionally varies his arm angle by batter handedness. Rosen's survey conclusion after canvassing the field: "nothing" fully captures command publicly; the most promising path is combining biomechanical (KinaTrax-class) data with true miss distance (debunked as a standalone command metric; promising as a *repeatability* feature inside a larger model).

The durable lesson: **dispersion-of-release metrics measure repeatability, not command.** Repeatability is a necessary-but-not-sufficient input — Driveline's dampening results show elite command is a structured mix of consistency (at foot plant) and adjustability (late arm), so raw "everything identical every time" scores will misrank adjusters.

**For Soto:** a release-consistency score (per pitch type: SD of release angle/point, adjusted for intentional multi-slot pitchers) is cheap to compute on Statcast and TrackMan alike and is worth shipping — but label it "release repeatability," feed it into the command model as a feature, and never present it as command itself.

## 5. Probabilistic Intent Inference: xCTRL and the Mixture-Model Family

The 2025 Wharton paper (Ludwig, Brill & Wyner, arXiv:2508.19184, "Separating Intent from Execution") formalizes what several clubs do privately: treat intended target as a latent variable and infer it. **xCTRL** fits Gaussian mixture models over observed pitch locations per pitcher/pitch-type/count-context: mixture component means ≈ the pitcher's target portfolio; within-component covariance ≈ execution error. Command is then scored as dispersion around *inferred* intent rather than distance from a league-ideal location. This cleanly separates three things Location+ conflates: target selection (where the components are), execution (how tight the scatter is), and outcome luck (promising — new, not yet independently validated at scale, but the correct statistical framing).

CSAA (Section 1) belongs in this family too: it never observes intent but strips context (umpire, catcher, count, handedness) with mixed models until the residual called-strike surplus is plausibly command. Its practical virtues: stabilizes in "a couple weeks of games," and produced face-valid all-time results (Maddux 8–10%). Its known blind spot: it only sees taken pitches, so it "doesn't account for the swinging strike" — a pitcher who commands chase pitches brilliantly is invisible to it (proven, with acknowledged scope limits).

Computer vision is the emerging third leg. BaseballCV's open-source `glove_tracking` YOLO model detects/tracks the catcher's glove, ball, home plate, and rubber from broadcast feeds (100k+ plays captured in an April 2024 dataset release), reviving the COMMANDf/x idea with commodity tooling; academic pipelines (PitcherNet, KFYO) now extract release/biomech parameters from single-angle broadcast video (promising — accuracy at the "±2 inches of glove center" level is unproven, and the glove-isn't-the-target problem is unchanged).

**For Soto:** the mixture-model approach is the single best fit for Triton's Statcast side: fit per (pitcher, pitch_name, count-group, batter-side) GMMs with 1–3 components on ~season samples, publish (a) execution tightness (weighted mean within-component SD, inches) and (b) a target-quality score (run value of component means). It's pure SQL-extractable data + a Python fitting job, and it gives Trevor an "execution vs approach" split no public leaderboard shows.

## 6. Stabilization and Reliability: What Sample Sizes Buy You

Reliability numbers across the metric families (definition: correlation ≈ 0.7 split-half, per Carleton's convention, unless noted):

| Metric | Sample to usable signal | Year-to-year |
|---|---|---|
| BB% (pitcher) | ~120 BF (Carleton) | moderate |
| K% (pitcher-facing ~equivalent) | ~60–70 BF | good |
| Stuff+ | ~80 pitches (α ≈ 0.9 territory) | high (drives Pitching+) |
| Location+ | ~400 pitches | R² ≈ 0.39 |
| Pitching+ | ~250 (RP) / ~400 (SP) pitches beats projections | high |
| CSAA | "a couple weeks of games" | face-valid, stable |
| Kirby Index | 1–2 starts | R² ≈ 0.5 (but see §4 caveats) |
| Facility miss distance (declared intent) | ~10–30 throws per pitch type | n/a (session-level tool) |

Two structural reasons command metrics stabilize slowly in public data: (1) run-value location maps are noisy scoring targets, so each pitch's grade carries high variance; (2) intent uncertainty adds variance that true-intent systems simply don't have. This is why declared-intent facility data is so valuable: Driveline's biomech study got usable per-athlete command reads from **10 throws each**. The general Carleton caution applies everywhere: "stabilization" is a reliability statement about correlated samples, not a license to treat the current number as new true talent (proven).

**For Soto:** enforce display minimums in Triton (≥400 pitches for a Location+-style number; show shrinkage-adjusted estimates below that — empirical-Bayes shrink toward league mean by role, consistent with the SP/RP classification convention). In Neptune reporting, a 30-throw command session per pitch type is a legitimate assessment; a 10-throw bullpen is a trend point, not a grade.

## 7. Proxy Approaches Without Target Data (the Statcast Situation)

Triton's `pitches` table has no targets. The viable proxy menu, roughly ordered by evidence quality:

1. **Location run value vs (count, pitch-type, batter-side) baseline** — the Location+ clone. Best-validated; slow to stabilize; conflates approach and execution (proven family).
2. **Mixture-model execution dispersion (xCTRL-style)** — infers intent; separates execution from approach; the most defensible "command" label available without targets (promising).
3. **CSAA-style called-strike surplus** — needs umpire/catcher controls; Triton lacks catcher-framing controls today, but a reduced model (location + count + handedness) captures much of it (promising).
4. **Edge%/shadow-zone rate** — share of pitches in the zone-boundary band. Cheap, intuitive, but produced known misranks (Pineda problem: edge share ≠ intent) (plausible, weak alone).
5. **Release repeatability** — SD of release angles/points per pitch type (§4). Feature, not headline (promising as feature).
6. **Ball% in 0-2/1-2 vs 3-ball counts, non-competitive-pitch rate** (misses >12–14" from any plausible target, e.g., spiked breaking balls, crossed-up locations) — good coaching diagnostics, crude as ratings (plausible).
7. **BB%, Zone%** — keep as the control family, labeled as such (proven, for control not command).

The consensus from Rosen's 2025 survey deserves restating: no public proxy fully works, and the ceiling for Statcast-only command measurement is a well-built combination of (1) + (2) + (5). That combination is exactly what a small shop can ship.

**For Soto — concrete Triton spec:** `command_score = w1·location_rv_plus + w2·execution_tightness_plus + w3·release_repeatability_plus`, all plus-scaled per Triton convention (mean 100), weights fit against next-season BB% and next-season Location-RV (out-of-sample), stored in `pitcher_season_command` with the components exposed, not just the blend. Remember the plus-stats exclusion rule for `league_averages`, and update `docs/VARIABLES.md` in the same commit as any schema change.

## 8. Design Options for a TrackMan Command Product (Neptune Tier)

With declared intent available, the facility tier leapfrogs everything MLB teams can buy publicly. Recommended build, in order:

1. **Intent capture in Compete.** Pre-pitch target selection (tap a zone-map in the session UI; 9-zone minimum, continuous x/z preferred), stored as `intended_x/intended_z` on `compete_pitches`. Fall back to post-hoc tagging for un-tagged sessions (Iowa's program showed retro-tagging workflows work but live tagging is far cleaner — they converged on a Shiny live-tagging app merged with TrackMan post-game).
2. **Core metrics per pitch:** Euclidean miss distance (inches), signed `miss_x`/`miss_z`, and a location-run-value delta (value of actual vs intended location — Driveline's "Location Run Value" pattern), so a lucky productive miss is visible as such.
3. **Session/block aggregates:** mean and median miss per pitch type, miss-direction rose, % within 6"/9"/12", trend vs athlete's baseline. Benchmarks: MLB fastball average ≈ 11"; 12.5"→10.8" is a real training effect size for a secondary pitch; expect HS intakes in the mid-teens (extrapolated — validate with Neptune's own first cohort and publish internal norms) (plausible until locally validated).
4. **Zone-difficulty adjustment (Command+ pattern, per Iowa):** scale scores to 100 = average for that pitch-type × target-zone × handedness combination; exclude count/game-state (Iowa found they don't affect single-pitch execution) (promising).
5. **Assessment protocol:** standardized command battery — e.g., 2×10 throws per primary pitch to 2 declared targets at game intent — mirroring Driveline's 10-throw-per-athlete study design. This becomes an intake/exit test with real retest reliability (10–30 throws usable per §6).
6. **Phase 2, biomech link:** when Neptune adds mocap/IMU, replicate the dampening analysis — variability at foot plant (glove-shoulder abduction, torso lateral tilt) vs miss distance is the published correlate (r > 0.6 for dampening features) and turns command numbers into mechanical prescriptions (promising).

**For Soto:** this two-tier design is also the differentiation story — Neptune athletes get *true* command measurement (declared intent, TrackMan-verified), benchmarked against the platform-tier proxy numbers of MLB/AAA pitchers in Triton. That "here's your miss distance vs an MLB average of ~11 inches" comparison is exactly the development-lab positioning the facility is priced on. For Trevor personally: a 20-throw IZT-style session per pitch type gives him a credible, content-ready command grade, and the miss-direction rose makes for strong stream/video material.

## 9. Failure Modes and Open Problems

- **The glove is not the target** — any glove-tracking revival (BaseballCV-style CV included) inherits COMMANDf/x's core flaw; mitigate with pitch-type-conditional target models or abandon glove-as-intent entirely (proven flaw).
- **Single-target assumptions punish deliberate variation** (Mikolas/Kirby Index case) — mixture models with data-chosen component counts are the fix (proven flaw, promising fix).
- **Miss direction ≠ noise** — SIS showed high-side misses off middle targets *gain* whiffs (15% vs 10%); a scalar miss-distance loses this. Always keep the vector (proven within fastballs).
- **Approach vs execution conflation** — Location+-family scores reward good target selection; coaches need the split because the interventions differ (game-planning vs mechanics) (proven).
- **Intent honesty in facilities** — declared-intent systems can be gamed (aim middle, everything is "close"); standardized batteries with fixed target scripts prevent it (plausible, operational).
- **Amateur norms don't exist publicly** — nobody has published HS/college miss-distance distributions at scale. Neptune's Compete pipeline could generate a citable internal norm table within one season — a genuine content and credibility asset (plausible, opportunity).

## Sources

1. FanGraphs — Introducing the Kirby Index (Michael Rosen, 2024): https://blogs.fangraphs.com/introducing-the-kirby-index-a-new-way-to-quantify-command/
2. FanGraphs — Revisiting the Kirby Index (Michael Rosen, 2025): https://blogs.fangraphs.com/revisiting-the-kirby-index/
3. FanGraphs Library — Stuff+, Location+, and Pitching+ Primer: https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer/
4. FanGraphs — Why We Still Don't Have a Great Command Metric (Eno Sarris): https://blogs.fangraphs.com/why-we-still-dont-have-a-great-command-metric/
5. Baseball Prospectus — Prospectus Feature: Command and Control (CSAA; Judge/Pavlidis/Long): https://www.baseballprospectus.com/news/article/31022/prospectus-feature-command-and-control/
6. The Hardball Times — Quantifying Pitcher Command: https://tht.fangraphs.com/quantifying-pitcher-command/
7. Sports Info Solutions — Using Catcher Mitt Location to Evaluate Fastball Command (2021): https://www.sportsinfosolutions.com/2021/07/12/using-catcher-mitt-location-to-evaluate-fastball-command/
8. Driveline Baseball — The Interaction of Biomechanics and Command (Feb 2026): https://www.drivelinebaseball.com/2026/02/the-interaction-of-biomechanics-and-command/
9. Ludwig, Brill & Wyner — Separating Intent from Execution: A Probabilistic Approach to Pitch Location Accuracy (xCTRL, arXiv 2025): https://arxiv.org/pdf/2508.19184
10. Wharton Sports Analytics — Introducing xCTRL: https://wsb.wharton.upenn.edu/introducing-xctrl-a-probabilistic-approach-to-pitch-location-accuracy/
11. Stats Perform — Good Intent: How Command+ Answers What Couldn't Be Answered With Traditional Metrics: https://www.statsperform.com/resource/command-answering-what-couldnt-be-answered-with-traditional-metrics/
12. Inside Edge — Pitcher Command / Intended Spot (product page): https://inside-edge.com/mlbclubs/pitcher-command-intended-spot/
13. Iowa Baseball Managers (Peter Mertka) — Quantifying Command to Enhance Pitcher Development: https://medium.com/iowabaseballmanagers/quantifying-command-to-enhance-pitcher-development-9bb00a2a0b61
14. FanGraphs Library — The Beginner's Guide to Sample Size (Carleton stabilization thresholds): https://library.fangraphs.com/the-beginners-guide-to-sample-size/
15. BaseballCV — open-source glove/ball tracking models: https://github.com/BaseballCV/BaseballCV
16. Driveline Academy Podcast EP 80 — Revolutionizing Command Training with Intended Zones: https://creators.spotify.com/pod/show/deven-morgan/episodes/Revolutionizing-Command-Training-with-Intended-Zones---Academy-Youth-Baseball-Podcast-EP-80--Driveline-Baseball-e2s5sj4
17. Baseball Prospectus — SEAGER Reliability and Risers (naming disambiguation; SEAGER is a hitter swing-decision metric): https://www.baseballprospectus.com/news/article/93876/the-crooked-inning-seager-reliability-and-risers/
