---
title: Modeling Biomechanical Data for Pitching — Waveforms, OpenBiomechanics, and Injury/Velocity Outcomes
domain: algorithm-design
tags:
  - biomechanics
  - functional-data-analysis
  - markerless-motion-capture
  - openbiomechanics
  - injury-modeling
  - mixed-effects-models
  - pitch-velocity
  - triton-metrics
sources_reviewed: 22
last_updated: 2026-07-19
---

# Modeling Biomechanical Data for Pitching — Waveforms, OpenBiomechanics, and Injury/Velocity Outcomes

## TL;DR

- **Biomech data is a time-series problem, not a single-number problem.** A pitch is 15+ joint-angle waveforms sampled at 300–360 Hz from foot contact to release (~150 ms). Collapsing each to one peak throws away most of the signal; Statistical Parametric Mapping (SPM, via `spm1d`) and functional PCA (fPCA) test/decompose the *whole curve*, catching differences that discrete-peak analysis misses (proven).
- **Elbow varus torque is the injury currency, and it scales with velocity.** In a prospective study of 305 pro pitchers, 31 (10.2%) needed UCL surgery; the surgery group averaged 100.8 ± 18.1 N·m vs 94.3 ± 16.1 N·m (p=.049), and each +10 N·m raised surgery hazard ~26% (HR 1.26). Peak varus torque during a max-effort pitch runs 50–120 N·m — near the cadaveric UCL failure limit (~32–34 N·m static, far exceeded dynamically) (proven).
- **The OpenBiomechanics Project (Driveline, 2022) is the free, elite mocap dataset to build on**: 100 pitchers + 98 hitters, cleaned C3D at 360 Hz markers / 1,080 Hz force plates, plus a 79-column point-of-interest (POI) table and full-signal CSVs. Non-commercial license — pro/financial orgs are barred without a paid license (proven).
- **Velocity is predictable from mechanics, but the top predictors are distal and lower-body.** A gradient-boosting model on 227 pitchers hit RMSE ≈ 0.34 mph; top features were max elbow-extension velocity (19.3%), max humeral rotation velocity (9.6%), max lead-leg ground reaction force (9.1%), trunk forward flexion at release (7.9%), and pelvis→trunk peak-velocity timing (7.8%) (promising).
- **The lead-leg block is a real velocity lever.** Peak stride-leg GRF during arm cocking alone explained r²≈0.61 of ball velocity; harder throwers extend the front knee *more* after foot plant and decelerate the center of mass faster (promising).
- **Markerless is good enough for many kinematics, shaky for kinetics.** In-stadium Theia3D/Hawk-Eye vs marker-based at Petco: MPJPE 52.0 ± 12.3 mm (Theia) / 56.6 ± 9.4 mm (Hawk-Eye); CCC > 0.85 for stride length, pelvis/trunk rotation, shoulder rotational velocity — but upper-extremity velocities and torques carry meaningful error. Treat markerless elbow torque as a trend, not a clinical number (promising).
- **Repeated measures demand multilevel models.** Athletes throw many pitches across many sessions; observations are nested and correlated. Linear mixed-effects models with a random intercept per athlete (and body-mass/height/age/level covariates) are the correct baseline — plain OLS overstates significance by ignoring within-athlete clustering (proven).
- **Reproducibility, not raw complexity, separates elite arms.** In 28,307 game fastballs from 1,722 athletes, elite (≥90 mph) throwers didn't have different mean movement complexity — they had ~57% *lower within-session variability* of pelvic-axis complexity (Spearman ρ=−0.470; Cohen's d≈0.61). Consistency of the sequence is the marker (promising).

## 1. Why Pitching Biomechanics Is a Waveform Problem

A pitch is not a pose. From front-foot contact to ball release is roughly 120–160 ms, during which the pelvis, trunk, shoulder, elbow, and wrist each trace a continuous angle/velocity/torque curve. Standard practice reduces each curve to a handful of discrete scalars — "peak shoulder external rotation = 170°," "peak elbow varus torque = 95 N·m," "hip-shoulder separation at foot plant = 45°." That's convenient and it maps onto coaching language, but it discards the *shape and timing* of the movement, which is where most of the mechanical story lives.

Two pitchers can share an identical peak trunk rotation velocity while getting there on completely different trajectories — one with an early, smooth build, one with a late spike. Discrete analysis calls them equal; waveform analysis does not. The two dominant statistical toolkits for keeping the whole curve are:

- **Statistical Parametric Mapping (SPM / SnPM).** Developed for neuroimaging (Friston) and ported to 1D biomechanics by Pataky's `spm1d` package (open-source, Python/MATLAB) (proven). SPM runs the chosen test (t-test, regression, ANOVA) *at every time point* of the time-normalized curve, then uses random field theory to set a cluster threshold that controls the family-wise error rate across the whole waveform — so you can say "velocity significantly predicted lead-leg braking GRF from 27% to 35% of the foot-contact-to-release window" rather than at one arbitrary instant. That exact finding came from an SPM regression on 105 high-velocity pitchers (promising). A softball study used SPM regression to show pelvic lateral tilt significantly predicted peak throwing-shoulder superior and lateral force across the delivery (promising).
- **Functional Data Analysis (FDA) and functional PCA (fPCA).** FDA treats each curve as a single mathematical object (a smoothed function, typically via B-spline or Fourier basis), then does statistics on the functions themselves. fPCA is the workhorse: it generalizes PCA to curves, returning "modes of variation" — the dominant, orthogonal ways curves differ across a population — plus a scalar PC score per athlete per mode. Those scores are then correlatable with velocity, torque, or injury. A 2024 review ("Over 30 years of FDA in human movement") is the current best entry point; FDA has been applied to rowing, weightlifting, diving, jumping, and running, and is only "at the beginning" in baseball (promising).

Key methodological hazards in both: **time normalization / registration.** Every pitch is a different duration, so curves are resampled to a common 0–100% timeline. But naive linear time-warping conflates *phase* variation (when peaks happen) with *amplitude* variation (how big they are). Curve registration separates the two — landmark registration (aligning known events like max external rotation) or continuous registration — and choosing wrong can manufacture or hide effects. Smoothing choice (basis, knots, roughness penalty λ) matters too: over-smooth and you erase the late-cocking spike; under-smooth and noise dominates the derivatives (velocities, torques), which are what you actually care about.

**For Soto:** Triton's Stuff+ / command / deception models are all *ball-flight* models — they operate on release and trajectory. Biomech waveforms are the upstream *cause* layer. The natural integration is fPCA scores or SPM-derived features as columns in a per-pitcher biomech table (mirroring `pitcher_season_command`), joined to ball outcomes. Don't try to store raw 300 Hz waveforms in Postgres for analytics; store the derived POI scalars + a small set of fPCA scores, and keep C3D/parquet waveforms in object storage.

## 2. The OpenBiomechanics Project (OBP) — The Dataset to Build On

Driveline Baseball open-sourced OBP in December 2022; it is the largest public high-fidelity mocap set on elite baseball players (proven). Concretely:

- **Population:** 100 pitchers, 98 hitters, drawn from Driveline's database; most participants played at the collegiate level. Anonymized.
- **Capture:** marker-based optical mocap at 360 Hz (23+ anatomical markers on lower extremities, torso, shoulder, elbow, wrist), with three force plates embedded under the mound turf sampling at 1,080 Hz.
- **Signal conditioning:** full-signal kinematics filtered with a 4th-order low-pass Butterworth at 20.0 Hz cutoff; force data at 40.0 Hz. (These cutoffs matter — they define the effective bandwidth of any derivative you compute.)
- **Deliverables:** cleaned C3D files (raw-ish), six full-signal CSVs (joint mechanics + forces over the whole delivery), and one **point-of-interest (POI) CSV with 79 computed variables** — kinematic angles/velocities (shoulder, elbow, hip, knee, torso, pelvis), kinetic moments/forces, energy generation/transfer/absorption, GRF characteristics, and temporal event markers (foot contact, ball release, max external rotation). Distributed via GitHub Releases (tag `dataset-v1`).
- **License:** non-commercial only. Employees/contractors of professional sports organizations or financial-analysis firms are forbidden from using it without a specific written commercial license (proven).

That license clause is the operative constraint for Soto. Triton is a commercial analytics platform, and Neptune is a commercial facility — **OBP cannot be baked into a shipped product or a paid facility offering without a Driveline commercial license.** It is fully usable for internal methods R&D: prototyping fPCA pipelines, validating a velocity model architecture, setting rough benchmark ranges, and learning the POI schema — as long as the numbers/models that ship to customers are re-derived on Neptune's own captured data. Get a written read on the license before it touches anything customer-facing.

The published OBP research is a good methods template. The 2023 *Journal of Applied Biomechanics* study "The Contribution of Lower-Body Kinematics to Pitching and Hitting Performance" used OBP with correlational analysis *plus statistical nonparametric mapping* (SnPM) to compare slow vs fast velocity groups across the entire delivery from peak knee height to release. Findings: trail-leg rotation and lead-knee extension were associated with performance in both pitchers and hitters; faster pitches came from a more extended lead leg at release and a higher max extension velocity (promising).

**For Soto:** The OBP POI schema is a ready-made target for Neptune's own intake battery. If Neptune captures with markerless (Theia3D/KinaTrax) and computes the *same* 79 POI variables, then Trevor's athletes plug straight into a schema that already has published literature and (internally) OBP as a reference distribution. Adopt the POI column names as the canonical Neptune biomech schema so external research is directly comparable.

## 3. Linking Biomech Features to Velocity

Velocity is the most-modeled outcome because it's cheap to measure and commercially motivating. The state of the evidence:

- **It's predictable, and nonlinear models win.** A study of 227 pitchers (165 HS, 62 college) compared regression vs gradient boosting on 16 kinetic/kinematic predictors: gradient boosting reached RMSE ≈ 0.34 (calibration 1.00) vs plain regression RMSE ≈ 2.49. Top relative-influence predictors: max elbow-extension velocity (19.3%), max humeral (shoulder internal) rotation velocity (9.6%), max lead-leg GRF resultant (9.1%), trunk forward flexion at release (7.9%), and the time gap between peak pelvis and peak trunk rotation velocity (7.8%) (promising). Note the top two are essentially "the arm moving fast" — partly tautological with velocity — so the *actionable* signal is in the lower-body and timing features.
- **Lead-leg block.** Stepwise regression found peak stride-leg GRF during arm cocking was the single best GRF predictor of ball velocity, r² ≈ 0.61 (promising). SPM on 105 high-velocity pitchers localized the braking-GRF↔velocity relationship to 27–35% of the foot-contact-to-release window (promising). Driveline's applied framing: harder throwers extend the lead knee more from foot plant to release and decelerate the center of mass faster after foot plant — the front leg converts linear momentum into rotation (promising).
- **Kinematic sequence & hip-shoulder separation.** The canonical proximal-to-distal sequence is pelvis → trunk → shoulder(elbow) → hand, each segment peaking in order. Greater hip-shoulder separation stores elastic energy in the trunk's stretch-shortening cycle — *but only helps if the trunk can then close the gap with high angular velocity*; separation without rotational velocity is wasted. In-game collegiate norm: hip-shoulder separation ≈ 57.3° ± 9.8° at foot contact (promising).

Benchmark kinematics for a professional/high-velocity delivery (compiled from the Clinician's Guide and in-game norms — treat as population landmarks, not individual targets):

| Variable | Typical value |
|---|---|
| Shoulder ER at foot contact → max | ~45° → ~170° |
| Shoulder ER at release (in-game collegiate) | 109.2° ± 13.2° |
| Peak shoulder internal-rotation velocity | up to ~7,500°/s |
| Elbow flexion at release | ~25° (in-game 26.5° ± 4.5°) |
| Lead-knee flexion at contact → release | ~45° → ~30° |
| Stride length | ~85% of height (in-game 1.41 ± 0.08 m) |
| Trunk forward tilt at release | ~35° (in-game −36.8° ± 7.2°) |
| Trunk lateral (contralateral) tilt | ~20° |
| Hip-shoulder separation at contact | 57.3° ± 9.8° |
| Ball velocity (in-game D1) | 91.5 ± 2.6 mph |

**For Soto:** A Neptune "velocity opportunity" metric should be built on the *actionable* lower-body/timing features (lead-leg GRF and knee-extension pattern, pelvis→trunk timing gap, separation-with-rotation), not on the distal arm-speed features that just restate the outcome. This is the biomech analog of Stuff+: a model of *how much velocity the delivery should produce* vs what it does, and where the leak is. Use gradient boosting for the predictive layer but keep an interpretable SPM/fPCA layer for the coaching narrative — Trevor will (rightly) discount a black box.

## 4. Linking Biomech to Injury — Torque, Not Velocity

Injury modeling is harder, higher-stakes, and where the credible-vs-bro-science line is sharpest.

- **Elbow varus (valgus-resisting) torque is the primary measurable risk driver.** Prospective study, 305 pro pitchers, 31 UCL surgeries (10.2%), ~4.5 yr follow-up, 85% injury-free at 4 years. Surgery group varus torque 100.8 ± 18.1 N·m vs 94.3 ± 16.1 N·m (p=.049); HR 1.02 per +1 N·m, **1.26 per +10 N·m** (26% hazard increase). Crucially, **fastball velocity itself was NOT a significant independent predictor** (85.0 vs 84.7 mph, p=.604) once torque was accounted for — velocity is a proxy; torque is the mechanism (proven). Age, height, weight, BMI, prior surgery, innings/game, and start percentage were all non-significant.
- **Peak torque sits near tissue tolerance.** Resultant elbow varus torque peaks at 50–120 N·m during max-effort pitching, which exceeds the UCL's isolated failure limit — the muscles (flexor-pronator mass) share the load, and chronic proximity to failure drives cumulative micro-damage (proven). This is why *workload* (torque × exposures) matters as much as single-pitch torque.
- **Kinematics that raise torque.** High-torque pitchers differ from low-torque pitchers in mechanics from foot contact to release; increased max shoulder external rotation, faster lay-back, and poor sequencing raise the internal-rotation rebound demand and thus torque. Driveline's framing: "the faster the arm lays back into ER, the faster it must rebound into IR" — this is the torque generator (plausible).

**Interventions that move torque, with evidence grades:**

- **Weighted balls raise velocity ~3.3% but carry injury signal in youth.** Reinold's RCT (38 HS pitchers, 13–18 yo, 6 weeks, 2–32 oz) found the weighted-ball group gained more velocity but had a **24% injury rate** (4 elbow injuries vs 0 in controls) (proven for that population). Driveline's motion-capture study of 17 college/pro pitchers found *no* significant increase in elbow valgus or shoulder IR torque and no ER gain — the injury/torque risk appears age- and dose-dependent, worse in immature arms (promising). The two findings aren't contradictory; they're different populations.
- **Heavier/larger balls actually *reduce* varus torque.** Fleisig et al. (ASMI, 2025) showed increasing ball weight and size *decreases* elbow varus torque during pitching — because the arm slows down. This is the mechanism behind using overload balls for *arm health / recovery* work rather than velocity, and it's a clean example of the velocity↔torque tradeoff (promising).

**For Soto (and for Trevor personally):** Trevor had TJ in 2017 and lived the return arc, so the arm-health layer is not abstract. The Neptune monitoring spine should track a **velocity-torque efficiency** metric (Driveline computes "mph per unit of normalized torque") — an athlete generating more velocity per Nm of stress is on a safer trajectory. The right injury model at facility scale is not "predict who tears" (base rates too low, ~10% over years, to predict individually) but "flag torque trending up faster than velocity, and monitor cumulative torque-exposure load." Frame it as risk *surveillance*, evidence-graded, never a deterministic prediction.

## 5. Markerless Data Quality — What You Can and Can't Trust

Neptune will almost certainly use markerless capture (Theia3D on Edgertronic/Qualisys, or KinaTrax if in a facility with fixed cameras) — nobody is gluing markers on youth athletes for routine assessment. KinaTrax is deployed in 75+ stadiums/labs across MLB/MiLB/NCAA and went to 600 fps (from 300) for some 2024 installs. So the practical question is: *how much do you trust the numbers?*

- **Kinematics: good for proximal/rotational, worse for distal.** Petco Park study, 18 NCAA D1/D2 pitchers, 10 max fastballs each, Theia3D (10 Qualisys Miqus) and Hawk-Eye (5 in-stadium) vs 18-camera marker-based reference. Mean per-joint position error: **Theia 52.0 ± 12.3 mm, Hawk-Eye 56.6 ± 9.4 mm.** Strong agreement (CCC > 0.85) for stride length, pelvis rotation, trunk rotation, and shoulder rotational velocity; upper-extremity velocities showed "expected variability." This was billed as the first published evaluation of *kinetic* outputs from a markerless system during pitching, and kinetics carried more error than kinematics (promising).
- **In-game adds variability, but less than feared.** Lerch et al. (*J Biomech*, 2025) compared within-pitcher SD over 10 fastballs for 30 lab marker-based vs 30 in-game markerless collegiate pitchers. Of 10 kinematic parameters, only 2 (max shoulder angles) were significantly *more* variable in-game markerless — so in-game markerless is more consistent than the "it's the wild" intuition suggests, though the shoulder is its weak spot (promising).
- **Systematic offsets, not just noise.** Markerless and marker-based define joint centers differently (skin-marker soft-tissue artifact vs deep-learning skeleton). Absolute joint *angles* can carry a constant offset of several degrees even when the *waveform shape* agrees well — so markerless normative tables (e.g., the KinaTrax in-game collegiate norms: shoulder ER at release 109.2° ± 13.2°, arm slot 59.4° ± 9.3°, elbow flexion 26.5° ± 4.5°) are internally comparable but not interchangeable with lab marker-based numbers.

Practical data-quality rules for a markerless pipeline:
1. **Never mix systems in one longitudinal comparison.** An athlete's Theia3D baseline and a later KinaTrax re-test are not directly comparable; offsets swamp real change. One system per athlete-timeline.
2. **Trust rotational velocities and timing more than absolute angles, and kinematics more than kinetics.** Report elbow torque from markerless as a *tracked trend*, not a clinical Nm.
3. **Filter consistently and document cutoffs** (OBP uses 20 Hz kinematics / 40 Hz force). Derivatives (velocities, torques) are cutoff-sensitive; a change in filtering looks like a change in the athlete.
4. **Keep per-pitch SD, not just means.** Within-session variability is itself a signal (Section 7) and a QC flag — a suddenly noisy joint often means a tracking failure, not a mechanics change.

**For Soto:** Neptune's Compete/TrackMan pipeline already handles ball-flight; the biomech layer should ingest markerless POI + full-signal exports into a parallel schema. Store the capture system as a first-class column so Triton queries can *never* silently compare across systems. This is the same discipline as the SP/RP classification convention — encode the gotcha in the schema so downstream code can't get it wrong.

## 6. Multilevel Models for Repeated Athlete Measures

Biomech data violates the independence assumption of ordinary regression badly. A single athlete contributes many pitches per session, many sessions over months, and pitches within a session are more alike than pitches across athletes. Ignoring that nesting inflates false positives — you get "significant" effects that are really just one athlete's idiosyncrasy sampled 40 times.

The correct baseline is a **linear mixed-effects model (LMM)** with a random intercept (and often random slope) per athlete. The elite-throwing complexity study is a clean exemplar: LMMs adjusting for body mass, height, age, level, and within-session velocity SD, with a random intercept on athlete, over 28,307 pitches from 1,722 athletes across 3,713 athlete-sessions (proven approach). The structure to internalize:

- **Fixed effects:** the things you want to generalize (a kinematic feature, a training-block indicator, level, age).
- **Random effects:** athlete (and session-within-athlete) intercepts/slopes — soaking up the between-athlete baseline differences so the fixed effects reflect *within-athlete* change.
- **Covariates:** body mass, height, age, competition level — biomech scales with anthropometry, so torque and velocity must be adjusted or normalized (OBP reports normalized torque as %BW·height for this reason).
- **ICC (intraclass correlation):** quantifies how much variance is between- vs within-athlete. High ICC on a metric means it's a stable *trait* (good for talent ID); low ICC means it's a volatile *state* (good for tracking acute change, bad for one-shot assessment).

For *waveform* outcomes there's an advanced tier: **functional mixed-effects models** (function-on-scalar regression with random functional effects), which extend LMMs to entire curves under repeated measures — recommended when you have several sessions per athlete over time and want to model how a whole waveform shifts with an intervention (promising, still emerging). For most Neptune use cases, scalar LMMs on POI/fPCA features are the pragmatic 80/20.

Effect-size discipline matters: report standardized effects (Cohen's d, or the mixed-model equivalent) alongside p-values. The complexity study's headline d≈0.61 between developing (<85 mph) and elite (≥90 mph) cohorts is more useful than any p-value for judging whether a difference is coachable.

**For Soto:** Any Neptune "did the athlete change?" analysis — pre/post a training block, or a longitudinal progress chart — must be a within-athlete mixed model, not a naive t-test on pooled pitches. This is directly analogous to how Triton already reasons about qualification and pooling. Bake a standard LMM template (R `lme4`/`glmmTMB` or Python `statsmodels`/`bambi`) into the analysis layer so every progress readout uses the same defensible structure.

## 7. Biomech-Informed Pitching Metrics — Designing the Neptune Layer

The synthesis question: what *metrics* should Neptune compute and Triton store? Draw from how the field's best practitioners package biomech.

**Driveline's report model** (six pages, four areas) is the practical template (promising):
1. **Arm action / joint angles** — shoulder abduction (target ~90°/neutral), horizontal abduction / scap retraction (~40° at foot plant, ~57° max), lay-back.
2. **Midsection / lower body** — hip-shoulder separation, trunk tilt, lead-knee flexion velocity (target ~350°/s).
3. **Kinematic velocities** — pelvis/torso rotation speed, elbow-extension velocity, shoulder IR velocity, and their *sequencing timing* (peak pelvis → peak torso gap).
4. **Kinetics** — elbow varus torque and shoulder IR torque, each reported three ways: total (Nm), normalized for body size (%), and **mph per normalized torque** (velocity-torque efficiency).

The most durable metric ideas, prioritized for Neptune:

- **Velocity-torque efficiency** (mph / normalized Nm). The single best "is this delivery healthy?" number — separates the guy throwing 92 at 90 Nm (efficient) from the guy throwing 92 at 105 Nm (borderline). Directly actionable, evidence-linked to the torque→injury pathway (promising).
- **Sequence timing gaps** — pelvis→trunk→arm peak-velocity intervals. Predictive of velocity (7.8% importance) and interpretable to coaches (proven method / promising metric).
- **Lead-leg block score** — composite of lead-knee extension from foot plant to release + COM deceleration + peak braking GRF. The best-supported *trainable* velocity lever (r²≈0.61 for GRF alone) (promising).
- **Reproducibility index** — within-session SD of key waveform features (or fPCA scores), especially pelvis/trunk. The complexity study shows ~57% lower pelvic-axis variability in elite (≥90 mph) throwers (ρ=−0.470); low reproducibility flags a developing or fatigued arm (promising).
- **fPCA-derived "movement signatures"** — 3–5 PC scores per key joint that compress the whole waveform into a few numbers, benchmarkable against a population and trackable over time. This is the biomech analog of a Stuff+ percentile.

Design principles carried from Triton:
- **Percentile/benchmark framing.** Every metric ships as a value *and* a percentile vs the relevant population (age band, level) — the TruMedia/`league_averages` pattern. Biomech benchmarks must be level- and age-stratified; a 14-yo and a pro have different healthy torque ranges.
- **Store scalars + fPCA scores in Postgres, waveforms in object storage.** A `neptune_pitch_biomech` table keyed by athlete × session × pitch, columns = OBP-style POI + fPCA scores + capture-system tag + normalized torque + efficiency. Raw C3D/parquet lives in storage.
- **Evidence-grade every metric in the UI.** Trevor discounts ungraded claims; so should the product. A tooltip that says "(promising: r²≈0.61, n=105)" beats a naked number.

**For Soto:** The facility's differentiator is the *assessment → programming → monitoring* spine, and biomech metrics are its spine's spine. Sequence it: (1) markerless capture computing OBP-schema POI, (2) velocity-torque efficiency + lead-leg block + reproducibility as the three headline metrics, (3) percentile benchmarks by age/level, (4) mixed-model progress tracking. Ship the efficiency metric first — it's the clearest safety story, it's what a TJ-survivor founder can speak to with authority, and it's the one number that says "we're not just chasing velocity, we're protecting your arm while we build it."

## Sources

1. The OpenBiomechanics Project — https://www.openbiomechanics.org/
2. OBP baseball_pitching README (dataset spec, 79 POI vars, 360/1080 Hz, filtering, license) — https://github.com/drivelineresearch/openbiomechanics/blob/main/baseball_pitching/README.md
3. Driveline: The OpenBiomechanics Project — Driveline Goes Open Source — https://www.drivelinebaseball.com/2022/12/openbiomechanics-project/
4. Contribution of Lower-Body Kinematics to Pitching/Hitting (OBP), J Appl Biomech 2023 — https://pubmed.ncbi.nlm.nih.gov/37939700/
5. Pataky, Generalized n-dimensional biomechanical field analysis using SPM — https://pubmed.ncbi.nlm.nih.gov/20434726/ and https://www.tpataky.net/downloads/Pataky2010-ndspm.pdf
6. spm1d project (Robinson/Pataky) — https://mark-a-robinson.uk/project/spm1d/
7. Friesen et al., Waveform Analysis in Softball Pitchers With/Without Pain (SPM) — https://journals.sagepub.com/doi/10.1177/19417381241285894
8. Over 30 Years of FDA in Human Movement (review), Sports Biomech 2024 — https://www.tandfonline.com/doi/full/10.1080/14763141.2024.2398508
9. Risk Factors for UCL Surgery: prospective study of 305 pro pitchers (Fleisig et al., OJSM 2025) — https://pmc.ncbi.nlm.nih.gov/articles/PMC12227930/ and https://asmi.org/wp-content/uploads/Risk-factors-for-UCL-surgery-Fleisig-OJSM-2025.pdf
10. Kinematic Parameters Associated With Elbow Varus Torque in Elite Adult Pitchers — https://pmc.ncbi.nlm.nih.gov/articles/PMC11789100/
11. The Clinician's Guide to Baseball Pitching Biomechanics — https://pmc.ncbi.nlm.nih.gov/articles/PMC9950989/
12. Assessing the Accuracy of Markerless Motion Capture for High-Speed Baseball Pitching (Theia, JSS 2025) — https://www.theiamarkerless.com/blog/markerless-motion-capture-high-speed-baseball-pitching and https://www.tandfonline.com/doi/full/10.1080/02640414.2025.2595411
13. Lerch et al., Variability of In-Game Markerless vs Lab Marker-Based Pitching Biomechanics, J Biomech 2025 — https://pubmed.ncbi.nlm.nih.gov/40418881/ and https://asmi.org/wp-content/uploads/LERCH-Journal-of-Biomechanics-2025-188-112775.pdf
14. Normative In-Game Data for Collegiate Pitchers Using Markerless Tracking (KinaTrax) — https://pmc.ncbi.nlm.nih.gov/articles/PMC11544755/
15. Machine Learning & Statistical Prediction of Fastball Velocity With Biomechanical Predictors — https://pubmed.ncbi.nlm.nih.gov/35183974/
16. Ground Reaction Forces in Baseball Pitching: Temporal Associations With Pitch Velocity (SPM, 105 pitchers) — https://pubmed.ncbi.nlm.nih.gov/37991012/ and https://www.tandfonline.com/doi/full/10.1080/14763141.2023.2284828
17. Driveline: A Quantitative Analysis of the Lead Leg Block — https://www.drivelinebaseball.com/2022/10/a-quantitative-analysis-of-the-lead-leg-block-and-its-contributions-to-velocity/
18. Driveline: How We Interpret Biomechanics Reports — https://www.drivelinebaseball.com/2019/03/interpret-biomechanics-reports/
19. Reproducibility of Nonlinear Movement Complexity Distinguishes Elite Throwing (28,307 pitches), SportRxiv — https://sportrxiv.org/index.php/server/preprint/view/919
20. KinaTrax — In-Game Markerless Motion Capture Technology for Baseball — https://report.kinatrax.com/ and https://docs.kinatrax.com/
21. Reinold et al. / systematic reviews on weighted-ball programs (velocity + injury) — https://pmc.ncbi.nlm.nih.gov/articles/PMC7930148/ and https://pmc.ncbi.nlm.nih.gov/articles/PMC6254244/
22. Fleisig et al., Increases in Ball Weight and Size Decrease Elbow Varus Torque, 2025 — https://asmi.org/wp-content/uploads/fleisig-et-al-2025-increases-in-ball-weight-and-size-decrease-elbow-varus-torque-during-baseball-pitching.pdf
