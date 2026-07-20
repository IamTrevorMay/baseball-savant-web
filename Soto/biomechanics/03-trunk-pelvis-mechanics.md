---
title: Trunk and Pelvis Mechanics in Pitching — Separation, Rotation, Tilt, and Injury
domain: biomechanics
tags:
  - hip-shoulder-separation
  - pelvis-rotation
  - trunk-tilt
  - kinetic-chain
  - elbow-torque
  - velocity
  - oblique-injury
  - biomechanics-assessment
sources_reviewed: 17
last_updated: 2026-07-19
---

# Trunk and Pelvis Mechanics in Pitching — Separation, Rotation, Tilt, and Injury

## TL;DR

- **Hip-shoulder separation (HSS) is real but modest as a single-variable driver.** Elite pitchers average ~48° (Driveline calls ~48° "elite"; a 32-pitcher HS lab found 48.4° ± 10.9° with 69% below the 55° "industry threshold"). HSS correlates with peak trunk rotation velocity at r ≈ 0.39 and, via trunk velocity, with ball velocity (r ≈ 0.48). It is one lever, not the lever. (proven)
- **Segmental rotation velocities scale proximal→distal and predict velo.** High-school benchmarks: peak pelvis ~669°/s ± 96, peak trunk ~1085°/s ± 93; college fastball data run pelvis ~596–659°/s and trunk ~959–1025°/s. Peak trunk rotation velocity alone explains ~25% of ball-velocity variance. (proven)
- **Pelvis-trunk *coordination* beats raw separation.** In 34 pitchers, anti-phase coordination from foot contact to max external rotation correlated with velocity at r = 0.74 (P<.01); pelvic axial-plane control during delivery at r = −0.78. The dissociation timing, not just the peak gap, is the signal. (promising)
- **Trunk forward flexion is a legitimate velocity contributor.** Machine-learning models rank trunk forward flexion at release at ~7.9% relative influence, behind elbow extension velocity (19.3%), humeral internal rotation velocity (9.6%), and lead-leg ground reaction force (9.1%). More flexion = longer acceleration path. (promising)
- **Contralateral (lateral) trunk tilt buys velo but taxes the arm.** Excessive tilt (>25°, Oyama) added ~1.5 m/s (~3 mph) but raised elbow proximal force ~11% and shoulder proximal force ~11%. Tilt lengthens the moment arm at both joints — a velocity-for-load trade. (proven)
- **The proximal→distal sequence and its timing is the master variable.** Ideal peak order is pelvis→torso→elbow→shoulder; Driveline flags peak-pelvis-to-peak-torso timing (~0.039 s) as velocity-correlated. Out-of-sequence firing forces the arm to "catch up," raising distal load. (proven)
- **Trunk mechanics drive non-arm injury too.** Oblique/"side" strains occur contralateral to the throwing arm 77% of the time; low thoracic rotation ROM correlates with more lateral trunk flexion (r = −0.51) and more elbow valgus torque (r = 0.47). The core is both an engine and a failure point. (promising)
- **Stride length is the cheapest lever on separation and sequencing.** Understriding (−25%) delayed pelvic-trunk separation and forced a 3× larger trunk-to-pelvis angular-velocity ratio at release ("arm lag"); overstriding produced greater, better-timed separation without losing velo. (promising)

---

## 1. What "trunk and pelvis mechanics" actually means

The trunk-pelvis complex is the central hinge of the pitching kinetic chain: it receives linear and angular momentum from the legs and ground, stores elastic energy in the obliques and thoracolumbar tissues via counter-rotation, then unloads that energy into the throwing arm. Four measurable behaviors matter, and they are distinct even though coaches blur them:

1. **Hip-shoulder separation (HSS)** — the transverse-plane angle between the pelvis and upper-trunk (shoulder) segments, usually reported *at foot contact* and at its *peak* (near max external rotation). It quantifies the "wind-up of the rubber band."
2. **Segmental rotation velocities** — peak angular velocity of pelvis and trunk in the transverse plane (°/s), and the *timing* of those peaks relative to each other.
3. **Trunk postural contributions at/after release** — forward flexion (sagittal), lateral/contralateral tilt (frontal), and axial rotation. These orient the shoulder and lengthen the acceleration path.
4. **Coordination/sequencing** — whether the segments fire in the correct proximal→distal order, and the phase relationship (anti-phase vs in-phase) between pelvis and trunk through the delivery.

The Seroyer et al. (2010, *Sports Health*) kinetic-chain review is the canonical framing: energy generated at the legs/pelvis is summated and transferred distally, and a "catch-up" in any weak link forces downstream segments to over-produce, degrading efficiency and raising injury risk (proven). Everything below is a quantification of that idea.

**For Soto:** These four behaviors should be four *separate* fields in any Neptune biomech intake, not collapsed into a single "separation" score. Triton already thinks in per-pitch, per-metric terms — mirror that granularity on the mechanics side: `hss_foot_contact`, `hss_peak`, `pelvis_peak_velo`, `trunk_peak_velo`, `pelvis_trunk_timing_ms`, `trunk_flexion_release`, `trunk_lateral_tilt_mer`.

## 2. Hip-shoulder separation: magnitude, timing, and the honest effect size

**Magnitudes by level.** Reported means cluster tightly for advanced pitchers:

- High-school lab (Cross/RPP, N=32, age 16.3): HSS 48.4° ± 10.9°; 69% fell below the informal 55° threshold. Trunk rotation ROM 61–64°; hip total ROM ~73° per leg (proven).
- Driveline practitioner benchmark: ~48° at foot plant described as "elite" (promising — practitioner data, not peer-reviewed sample stats).
- Adolescent specialization gradient (Johnson et al., 2026, *Sports Health*): HSS at foot contact rose with specialization — 21.9° (low), 31.1° (moderate), 30.0° (high). Note these are *foot-contact* values, which are smaller than *peak* separation (promising).
- General optimal band cited across practitioner sources: ~35–60° peak separation.

The gap between the ~22–31° *foot-contact* numbers and the ~48° *peak* numbers is the key literacy point: separation keeps growing after foot strike as the pelvis rotates open while the trunk stays closed. Reporting one without the timestamp is meaningless.

**Timing.** The value of separation is a *stretch-shortening* effect: delaying trunk rotation lengthens the time the obliques are loaded. Practitioner targets are ~30–70 ms of "separation time," and the emphasis is on *closing the gap fast* (the rate of oblique stretch-then-contract) rather than maximizing the static angle (plausible — the specific ms windows are practitioner heuristics, not tightly replicated in the literature).

**The honest effect size.** The largest recent sample is Lerch et al. (2025, *Journal of Biomechanics*, ASMI): **335 NCAA Division I pitchers** (223 R, 112 L; 91.6 ± 10.0 kg), in-game markerless capture. Statistical parametric mapping found a *significant positive* HSS-velocity relationship — but only across **83–90% of the normalized time from peak knee height to ball release**, i.e., a narrow late window near max external rotation, not throughout the delivery (proven). This is the most important nuance in the whole topic: HSS matters, but *when* it exists matters more than its peak value, and its standalone predictive power is moderate. In the Cross sample HSS→trunk-velo was r = 0.39 and trunk-velo→ball-velo was r = 0.48 — so HSS is roughly a second-order driver mediated through trunk rotation velocity.

**For Soto:** Do not sell "get more separation = throw harder" as a linear promise. Frame it as: separation is a *precondition* that enables trunk rotational velocity, and its timing (late, held-then-released) is what converts. In Neptune reports, plot the HSS *time series* over the delivery, flag the 80–90% window, and pair it with the trunk-velocity curve — a static single number will mislead athletes.

## 3. Segmental rotation velocities and the proximal→distal cascade

Peak angular velocities and their sequencing are the most reproducible velocity predictors in the literature.

**Benchmark values:**

| Segment | HS pitchers (Cross, N=32) | College fastball (various) |
|---|---|---|
| Peak pelvis rotation velocity | 669.1 ± 95.5 °/s | 596 ± 88 to 659 ± 63 °/s |
| Peak trunk rotation velocity | 1084.7 ± 93.0 °/s | 959 ± 120 to 1025 ± 124 °/s |
| Trunk-pelvis peak timing offset | 24.3 ± 24.3 ms | ~39 ms (Driveline benchmark) |

(All proven as descriptive benchmarks; note different labs, ages, and capture systems.)

**Predictive power.** Peak trunk rotation velocity is the strongest single trunk predictor: r ≈ 0.478 with ball velocity in the HS sample, explaining ~25% of variance. In the Aguinaldo et al. JSCR analysis ("Role of Pelvis and Trunk Biomechanics," 2022, PMID 35836313), a *combination* — peak pelvis velocity, HSS at foot contact, and timing of peak trunk velocity — explained **55% of the variance in trunk rotation velocity**, and the individual contributors were HSS at foot contact (17%), peak pelvis velocity (23%), and timing of peak pelvis velocity (16%) (proven). The chain is legible: pelvis velocity and separation feed trunk velocity, which feeds ball velocity.

**Sequencing.** The proximal→distal order (pelvis peaks, then trunk, then elbow extension, then shoulder internal rotation) is the ASMI/Driveline canonical "good signature." Collegiate data confirm the ordering: pivot leg −732°/s peaks first, pelvis −659°/s second, upper trunk −1025°/s last (PMC11835564, N=18). Driveline's report interpretation flags the *peak-pelvis-to-peak-torso timing* (~0.039 s in their example) as significantly correlated with velocity, and prescribes the pelvis→torso→elbow→shoulder peak order as the target (proven / promising).

**For Soto:** This is the highest-leverage feature set for a Triton "mechanics+" model. If Neptune's capture stack (markerless or IMU) yields per-segment angular-velocity curves, the engineered features that matter are: peak pelvis velo, peak trunk velo, the *ratio* trunk/pelvis, the *ordering* (a boolean or a sequence-cost score), and the pelvis→trunk peak timing offset in ms. These map cleanly onto the same Z-score architecture Stuff+ already uses — a "SequenceScore" normalized to level would be a natural facility-differentiating metric.

## 4. Pelvis-trunk coordination — the variable that beats raw separation

A 2025 study (Pelvic Control and Pelvic-Trunk Coordination, *OJSM*/PMC12301582, N=34, IMUs at 100 Hz, 10 max-effort fastballs) reframes the whole discussion around *coordination quality* rather than peak angles:

- **Anti-phase coordination** (pelvis and trunk rotating in opposite directions) from foot contact to max external rotation: 67.3% ± 23.8% of that phase, correlating with velocity at **r = 0.74, P<.01** — a high correlation, stronger than any single peak-angle metric.
- **In-phase coordination** (segments rotating together) from max external to max internal rotation: 51% ± 32.5%, r = 0.58 with velocity.
- **Pelvic axial-plane control during the pitch** (less wobble): axial variation 77.1° ± 53.4°, correlating with velocity at **r = −0.78** — less pelvic deviation, higher velo.
- Single-leg balance pelvic deviation (a *dryland* test): stride leg r = −0.76, drive leg r = −0.65 with pitching velocity.

The takeaway: pitchers who separate *and* recouple in the correct phase at the correct time throw harder, and pelvic *stability/control* (both in a balance test and during the pitch) is as predictive as any kinematic peak (promising — single cross-sectional sample, but effect sizes are large and mechanistically coherent). The training implication: "pelvic-trunk axial dissociation" work can raise trunk velocity *without adding shoulder/elbow load*, because it improves transfer efficiency rather than asking the arm to produce more.

**For Soto:** The single-leg-balance → velocity correlation (r = −0.76) is gold for Neptune's *low-cost* assessment tier. A cheap IMU or even a force plate single-leg test screens pelvic control without a full mocap bullpen. Build the intake battery so the dryland pelvic-control test is an early, cheap filter; reserve the expensive capture for athletes worth the mocap time. This is exactly the "assessment → programming" spine the context doc calls for.

## 5. Trunk forward flexion, lateral tilt, and axial rotation at release

The trunk's *posture* through arm acceleration and release orients the shoulder and sets the acceleration path length. Three distinct contributions:

**Forward (sagittal) flexion.** Greater forward trunk flexion at release lengthens the distance over which accelerating forces act on the ball. Machine-learning velocity models (Nicholson et al., 2022, *J Biomech*, S0021929022000550) rank trunk forward flexion at release at **~7.9% relative influence** on fastball velocity — behind elbow extension velocity (19.3%), humeral internal rotation velocity (9.6%), and lead-leg ground reaction force (9.1%), but a genuine, isolable contributor (promising). Practitioners cue "getting out over the front leg" — this is that mechanic.

**Contralateral (lateral) trunk tilt.** Tilting the trunk *away* from the throwing arm at max external rotation/release raises the release point and lengthens the effective radius from the trunk's rotation axis to the hand. Two landmark studies quantify the trade:

- Oyama et al. (2013, *AJSM*, HS pitchers): "excessive" tilt defined as >25° (head deviating more than a head-width from vertical over the stride ankle). Excessive-tilt pitchers threw **32.6 ± 2.2 vs 31.1 ± 2.9 m/s** (~+1.5 m/s, ~3 mph, P=.019) but had **elbow proximal force +11%** (103.9 vs 93.2 %BW) and **shoulder proximal force +11%** (104.8 vs 94.3 %BW) plus higher elbow varus moment (proven).
- Escamilla, Slowik & Fleisig (2023, *AJSM*, professional pitchers, Min/Mod/Max tilt groups): the *moderate* tilt group actually showed the *highest* elbow flexion torque (69 ± 11 N·m) and shoulder proximal force (1176 ± 152 N) — higher than the Max group — indicating the tilt-load relationship is not perfectly monotonic and interacts with timing (proven). The consistent mechanistic conclusion across the critically-appraised-topic literature (Journal of Sport Rehab, 2021): as contralateral trunk tilt increases, elbow varus torque tends to increase, making tilt a *modifiable* injury factor.

**Axial rotation / thoracic ROM as an enabler.** Low thoracic-spine rotation ROM forces compensation. Lower thoracic rotation on the throwing side correlated with *more* trunk contralateral flexion (r = −0.51) and *more* elbow valgus torque (r = 0.47) in HS pitchers (PMC11969626, N=21). Restricted thoracic rotation → the trunk substitutes lateral tilt → the elbow pays.

**For Soto:** Contralateral tilt is the textbook velocity-for-injury trade. In Triton/Neptune athlete reports, tilt should be a *yellow-flag* metric, not a "more is better" one — display it against elbow-torque estimates so the athlete sees the cost. For Trevor specifically (post-TJ, 2017; late-career workload management), lateral-tilt magnitude is exactly the kind of "cheap velo that eats the elbow" mechanic to monitor and cap rather than chase. Thoracic-rotation mobility screening belongs in the Neptune intake as an upstream cause of both tilt and elbow load.

## 6. The velocity-for-load trade, made explicit

Pulling the loading findings together, the trunk contributes velocity through several mechanisms that *also* raise arm load when overdone:

- **Contralateral tilt**: +3 mph but +11% elbow/shoulder proximal force (Oyama).
- **Longer effective radius**: shifting the trunk rotation axis away from the arm "creates a longer radius that increases the moment at both the shoulder and elbow" (CAT review).
- **Late/compensatory trunk acceleration** from poor sequencing forces "arm lag" and rapid arm catch-up.
- **Open vs closed pelvis** (Douoguih et al., PMC9720809, 157 pros): an *open* pelvis at foot contact (53° ± 7° vs 72° ± 7° toward home) associated with *higher* ball velocity (39.08 vs 38.42 m/s, P=.029, d=0.35), *longer* stride (81% vs 77% BH), and greater lead-knee extension velocity (424 vs 325 °/s) — with **no significant difference in elbow varus torque** (87.8 vs 90.5 N·m, P=.311). So some pelvis strategies buy velo *without* an elbow penalty — the open-pelvis/leg-drive route, unlike lateral tilt (proven).

The design principle: prefer velocity gains routed through **pelvis velocity, leg drive, stride length, and sequencing timing** (which are largely load-neutral or load-reducing per unit velo) over gains routed through **lateral trunk tilt and late compensatory trunk firing** (which are load-additive).

**For Soto:** This is a rankable framework. Build a Neptune "velocity route" taxonomy: green routes (pelvis velo, sequence timing, stride length, leg drive), yellow routes (increased separation magnitude — fine if timed), red routes (contralateral tilt, late trunk catch-up). Each athlete's velo can be *attributed* to routes, and programming steers them toward green. That's a genuinely novel, defensible facility metric grounded in the torque literature.

## 7. Stride length — the cheapest lever on separation and sequencing

Stride length modulates trunk-pelvis mechanics upstream. In a ±25% stride manipulation study (PMC12471593, N=19 skilled pitchers):

- Overstride (OS, 0.76% BH) vs desired (0.67%) vs understride (US, 0.52%): **ball velocity was preserved across all conditions** (FB ~123 km/h), so stride changes redistribute mechanics without immediately dropping velo.
- **Understriding delayed pelvic-trunk separation** (peak at 12% post-foot-contact vs 4% for OS) and produced a **3× larger trunk-to-pelvis angular-velocity ratio at release** — the compensatory "arm lag" / proximal plyometric spike that the authors flag as *increasing shoulder/elbow stress*.
- Overstriding produced greater, better-timed separation during the generation phase and better-regulated the proximal angular-velocity ratio.

Corroborating the sequence chain: pivot-leg rotation correlates with pelvis rotation (ρ = 0.70) and trunk separation at foot contact correlates with ball speed (ρ = 0.50) (PMC11835564). Stride and pivot-leg action set up the whole separation-then-transfer cascade.

**For Soto:** Stride length is measurable from any capture system (even 2D video) and is a low-risk programming knob. For youth/HS Neptune clients where full mocap is overkill, stride-as-%-body-height plus a trunk-separation-at-foot-contact estimate gives 80% of the coaching signal at near-zero tech cost. Flag understriders (<~55% BH) for the "arm-lag" compensation pattern.

## 8. Trunk-related injury linkages

Trunk mechanics implicate both the arm (indirectly) and the trunk itself (directly).

**Oblique / "side" strains.** Abdominal oblique strains are the archetypal pitching trunk injury — explosive unilateral rotation tears the oblique at its thoracolumbar-fascia junction. They occur **contralateral to the throwing arm 77% of the time** (PBATS; case literature) because the non-throwing-side obliques eccentrically decelerate trunk rotation. MLB oblique strains typically cost multiple weeks and have meaningful re-injury rates. Maximal trunk axial angular *acceleration* occurs near lead-foot contact — the most mechanically demanding instant for the trunk/spine (promising).

**Lumbar / low-back stress.** Cross-sport evidence (fast bowling in cricket, a close biomechanical analog) links **excessive lateral trunk flexion, poor lumbo-pelvic-hip control, reduced trunk endurance, and high vertical ground reaction forces** to lumbar bone-stress injury and low-back pain (systematic reviews, PMC10512628, PMC12805602). In baseball, weak anterior core / obliques permits lumbar hyperextension and heavy trunk tilt at foot strike, implicating the discs (promising — much of the strongest dose-response data is from cricket, extrapolated to pitching).

**Elbow, via the trunk.** As above: low thoracic rotation ROM → more lateral tilt → more elbow valgus torque (r = 0.47); contralateral tilt independently raises elbow proximal force ~11%. The trunk is an *upstream* elbow-injury factor, which is why "there's more to assess than the arm" (IJSPT, 2024) is the standard modern framing (promising).

**For Soto:** Two concrete facility actions. (1) Neptune's arm-care/workload monitoring should include *trunk* screens — thoracic rotation ROM, oblique/anti-rotation core endurance, single-leg pelvic control — not just shoulder/elbow ROM. (2) On the data side, if Triton ever ingests biomech from Compete/TrackMan-adjacent capture, contralateral-tilt magnitude and pelvic axial-control variability are candidate *injury-risk* features to pair with workload. For Trevor's own post-TJ monitoring, the trunk screens are the cheap early-warning layer that most pitchers skip.

## 9. Measurement technology and what Neptune can actually deploy

The findings above are only actionable with capture. The landscape:

- **Marker-based mocap (lab gold standard)**: 300–480 Hz optical systems (ASMI, university labs). Highest fidelity, but marker application and lab time make it impractical for high-throughput facility use.
- **Markerless (KinaTrax and similar)**: 8-camera systems capturing pitching at **300 Hz** in a bullpen (100 Hz for gait), used by multiple MLB teams for in-game capture. Validation shows reliable sagittal/frontal kinematics; against gold standard, pelvis and trunk rotation/lateral-bend biases have ranged ~0°–16° with correlations 0.88–0.97 depending on task — good for trends, imperfect for absolute angles (promising). Markerless is the realistic "development-lab" tier but is a significant capital line item.
- **IMU/inertial (e.g., pelvis/sternum/arm sensors, 100 Hz)**: the pelvic-control and coordination studies used exactly this. Far cheaper, portable, and validated for *segment angular velocities and coordination phase* — which, per §3–4, are the most predictive features. Absolute joint torques are harder from IMUs alone.
- **2D video + stride/tilt estimation**: near-zero cost, sufficient for stride length, gross contralateral tilt, and foot-contact separation estimates for youth/HS tiers.

**For Soto:** Tier the Neptune tech stack to the evidence. The most *predictive* trunk-pelvis features (segment angular velocities, coordination phase, pelvic control, timing offsets) are capturable with **IMUs + a single-leg balance test** — a fraction of the cost of a markerless bullpen. Recommend: (a) universal 2D + stride/tilt + single-leg pelvic control at intake; (b) IMU segment-velocity/coordination for developing arms; (c) markerless bullpen only if the facility's price point and throughput justify the capital. This maps directly onto the context doc's tech-forward "development lab" positioning without over-buying hardware, and every tier feeds the same Triton data layer.

## Sources

1. Lerch et al. (2025). Influence of Hip-Shoulder Separation on Pitch Velocity in College Baseball Pitchers (335 NCAA D1). *Journal of Biomechanics*. https://www.sciencedirect.com/science/article/abs/pii/S0021929025006293 — ASMI copy: https://asmi.org/wp-content/uploads/LERCH-Journal-of-Biomechanics-2025-188-112775.pdf
2. Cross et al. The Relationship of Range of Motion, Hip-Shoulder Separation, and Pitching Kinematics (N=32 HS). PMC7727427. https://pmc.ncbi.nlm.nih.gov/articles/PMC7727427/
3. Aguinaldo et al. (2022). Role of Pelvis and Trunk Biomechanics in Generating Ball Velocity in Baseball Pitching. *J Strength Cond Res*. PMID 35836313. https://pubmed.ncbi.nlm.nih.gov/35836313/
4. Escamilla, Slowik, Fleisig (2023). Effects of Contralateral Trunk Tilt on Shoulder and Elbow Injury Risk and Pitching Biomechanics in Professional Pitchers. *AJSM*. https://journals.sagepub.com/doi/10.1177/03635465231151940
5. Oyama et al. (2013). Effect of Excessive Contralateral Trunk Tilt on Pitching Biomechanics and Performance in High School Pitchers. *AJSM*. https://pubmed.ncbi.nlm.nih.gov/23884305/
6. Douoguih et al. Influence of Pelvic Rotation on Lower Extremity Kinematics, Elbow Varus Torque, and Ball Velocity in Professional Pitchers (N=157). PMC9720809. https://pmc.ncbi.nlm.nih.gov/articles/PMC9720809/
7. Pelvic Control and Pelvic-Trunk Coordination as Key Determinants of Pitching Velocity (N=34, 2025). *OJSM*. PMC12301582. https://pmc.ncbi.nlm.nih.gov/articles/PMC12301582/
8. Association Among Ball Speed and Rotation of Pivot Leg, Pelvis, and Trunk Separation in Collegiate Pitchers (N=18). PMC11835564. https://pmc.ncbi.nlm.nih.gov/articles/PMC11835564/
9. Nicholson et al. (2022). Machine Learning and Statistical Prediction of Fastball Velocity with Biomechanical Predictors. *J Biomech*. https://www.sciencedirect.com/science/article/abs/pii/S0021929022000550
10. Predicting Elbow Load Based on Individual Pelvis and Trunk (Inter)segmental Rotations in Fastball Pitching (2024). *Sports Biomechanics*. https://www.tandfonline.com/doi/full/10.1080/14763141.2024.2315230
11. Relationship Between Thoracic Spine Rotation Range, Trunk Contralateral Flexion, and Maximum Elbow Valgus Torque (N=21 HS). PMC11969626. https://pmc.ncbi.nlm.nih.gov/articles/PMC11969626/
12. Influence of Stride Length on Pelvic-Trunk Separation and Proximal Plyometrics in Baseball Pitching (N=19, 2025). *Life*/MDPI. PMC12471593. https://pmc.ncbi.nlm.nih.gov/articles/PMC12471593/
13. Seroyer et al. (2010). The Kinetic Chain in Overhand Pitching. *Sports Health*. https://journals.sagepub.com/doi/abs/10.1177/1941738110362656
14. Johnson et al. (2026). Effects of Sport Specialization on Pitching Biomechanics in Adolescent Pitchers. *Sports Health*. https://doi.org/10.1177/19417381251391459
15. Driveline Baseball. How We Interpret Biomechanics Reports. https://www.drivelinebaseball.com/2019/03/interpret-biomechanics-reports/
16. PBATS. Oblique Injuries & Return to Play. https://pbats.com/oblique-injuries-return-to-play/ — and case report PMC8075560. https://pmc.ncbi.nlm.nih.gov/articles/PMC8075560/
17. Evaluation and Treatment of Baseball Pitchers: There's More to Assess than the Arm (2024). *IJSPT*. https://ijspt.scholasticahq.com/article/127461 ; KinaTrax markerless validation context: https://www.sciencedirect.com/science/article/pii/S2666337625000265
