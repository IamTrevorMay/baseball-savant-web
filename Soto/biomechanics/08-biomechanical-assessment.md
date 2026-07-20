---
title: Running a Pitching Biomechanical Assessment — Protocols, Norms, Reports, and Prescription
domain: biomechanics
tags:
  - biomechanics
  - assessment-protocol
  - motion-capture
  - normative-data
  - injury-risk
  - training-prescription
  - neptune-facility
sources_reviewed: 20
last_updated: 2026-07-19
---

# Running a Pitching Biomechanical Assessment — Protocols, Norms, Reports, and Prescription

## TL;DR

- **A modern pitching biomechanics assessment is a battery, not a single test.** The Driveline/ASMI-lineage model layers four data streams: 3D motion capture (kinematics + inverse-dynamics kinetics), force plates (strength/power), goniometric range-of-motion (ROM), and ball-tracking (TrackMan/Rapsodo). Driveline turns raw markers into a six-page Traq report in **under 24 hours** and cut labor from **5+ hours/session (2019) to under 90 min/session (2022)** (proven).
- **Elbow varus torque is the headline injury-risk number and it scales with velocity, not just "bad mechanics."** Peak elbow varus torque in adult pitchers is ~**100 N·m** (range 50–120 N·m across the literature), near the UCL failure limit. In a 523-pitcher elite sample, a high-torque group ran **28% higher normalized torque** (0.0637 vs 0.0461 %BW·height) but only **1% more velocity** (38.0 vs 37.1 m/s) — the efficiency trade-off you are hunting for (proven).
- **Kinetics rise monotonically with competition level.** Across 120 pitchers spanning youth→pro, elbow varus torque and shoulder distraction force were both greater at higher levels, while ground-reaction forces did NOT differ (p=0.96 push-off, p=0.14 landing) — arm stress is a velocity tax, GRF is a technique variable (proven).
- **The kinematic sequence (pelvis → trunk → arm → forearm → hand) is the single most teachable efficiency construct.** Proper proximal-to-distal timing simultaneously raises velocity and lowers arm stress; the most common flaw is mistimed pelvis/trunk rotation. Peak shoulder internal rotation velocity (~**7,000–7,500°/s**) is the fastest measured human joint motion (proven).
- **Normative anchors worth memorizing:** at foot contact — stride length ~**85% of height**, shoulder abduction ~90°, elbow flexion ~90°; at max external rotation ~**170–180° MER**; at release — trunk forward tilt ~35°, lateral tilt ~20°, lead knee ~30° flexion, lead-knee extension velocity target ~**350°/s**; hip-shoulder separation ~**35–60°** (proven).
- **Re-assess on a 6-week (±1–2 wk) cadence.** In Driveline's book, **52% of athletes gained >1 mph, 27% held ±1 mph, 21% lost velo** on their last retest of a stay — proof that gains are nonlinear and that a single test is noise (promising).
- **Markerless is now good enough to democratize this.** Single-camera and multi-camera markerless (Reboot Motion, pitchAI, KinaTrax) hit **r² ≈ 0.89, RMSE ≈ 11°** vs marker-based for pitching-elbow angle — accurate enough for tracking, not yet for medicolegal UCL-load claims (promising).
- **For Neptune:** the defensible, premium product is the *assessment → prescription → re-assessment* loop with a longitudinal athlete database, not a one-off "here's your report." TrackMan is already in hand via Compete; add force plates + a markerless capture rig and you own the spine (plausible).

## 1. Why Assess: The Assessment-Prescription Loop

A biomechanical assessment only earns its keep when it closes a loop: **measure → diagnose → prescribe → re-measure**. A pretty PDF that nobody trains off is a novelty. Driveline frames the whole enterprise inside its **Pitching Hierarchy of Needs** (2024), a five-tier stack where each layer must exist before the one above it functions (promising):

1. **High Performance** — strength/power foundation (mid-thigh pull peak force in N; squat-jump power in W)
2. **Recovery** — sleep + nutrition (armcare.com daily readiness score gates the day's throwing)
3. **Execution** — compliance with the throwing program
4. **Mechanics** — the biomechanical assessment and movement quality
5. **Performance** — on-field output

The lesson embedded here: you do not "fix mechanics" on a pitcher who cannot physically produce the position (a mobility ceiling) or cannot produce the force (a strength floor). This is why the assessment is a *battery* — the mocap tells you what the body did, the ROM screen and force plates tell you whether the body *could* do anything else. Driveline's canonical example: a pitcher with low hip-shoulder separation, poor thoracic rotation, and weak strength gets hip mobility + core strength work **first**, because the strength/ROM dysfunction is what caps the mechanical variable (proven, as a reasoning pattern).

**For Soto:** Neptune's product should be architected as this loop from day one, with the Triton/Compete pipeline as the persistence layer. An assessment that writes a row nobody trains against is exactly the "commodity cage barn" positioning Neptune is trying to escape. The premium is in the second and third laps of the loop.

## 2. The Assessment Battery — Component by Component

### 2.1 3D Motion Capture (the core)

Two lineages dominate: **ASMI** (the American Sports Medicine Institute, Fleisig/Andrews — the research bedrock since the 1990s) and **Driveline** (the commercial/high-volume scaler). Both are optical marker-based systems at heart. ASMI's inverse-dynamics engine, **BioPitch software**, computes elbow varus torque from segment velocities/accelerations, scaled inertial properties of the upper-extremity segments, and inverse dynamics, normalized to **% body weight × height** so athletes of different sizes compare fairly (proven).

Driveline's **Launchpad** runs *simultaneous* marked and markerless capture plus Edgertronic high-speed video, Stalker radar, Rapsodo/TrackMan ball tracking, HitTrax, force plates, and Pulse (a wearable arm-stress sleeve), all processed through **Visual3D** (proven). The measurement window that matters most runs **foot contact → ball release** (arm cocking + acceleration), the phases where 100% of the injurious peak loads occur.

Sampling: research-grade optical systems capture at **240–1000 Hz**; force plates at **~1000 Hz+**. High-speed synchronized video (Edgertronic) runs in the thousands of fps for visual QA.

### 2.2 Force Plates (strength/power)

Driveline **replaced velocity-based training (VBT) testing with force plates in 2020**, measuring three qualities (proven):

- **Maximal strength** — isometric mid-thigh pull (peak force, N)
- **Explosive strength** — countermovement jump / squat jump (peak power, W; RSI)
- **Reactive strength** — 10-to-5 repeated hop test

The pre-2020 VBT protocol tested squat/deadlift/bench at 30/40/50% estimated 1RM. Force plates give a "more robust dataset" for modeling and, critically, are non-fatiguing and repeatable — you can retest weekly without a training cost.

In-delivery force plates (under the rubber) add pitching-specific GRF metrics. Drive-leg peak vertical GRF ~**1.33 N/BW at 35% of the pitch**; drive-leg propulsive force ~**0.48 N/BW peaking near 50%** (stride contact). Front (stride) leg braking GRF is the rotational-power creator; back (drive) leg propulsion is the linear-power creator (promising — literature is mixed on drive-leg→velocity correlation, cleaner on stride-leg braking→velocity).

### 2.3 Range of Motion / Mobility Screen

Hand-measured with a **goniometer**, active and passive, across the throwing-relevant joints. The two highest-yield screens:

- **Shoulder GIRD** (glenohumeral internal rotation deficit) and **total rotational motion (TROM)**. Assess IR/ER at 90° abduction supine *with scapular stabilization*. Rule of thumb: keep TROM within **~5°** of the non-throwing side; pitchers with a TROM deficit >5° or meaningful GIRD were roughly **twice as likely to be injured** (proven — retrospective/observational).
- **Hip IR/ER asymmetry**. Pitchers show reduced dominant (stance) leg hip IR and hip-abduction strength vs position players; abnormal hip motion cascades up the chain into increased shoulder force and *decreased* velocity (promising).

### 2.4 Ball Tracking

TrackMan/Rapsodo gives the outcome layer — velocity, spin, movement, release — that every mechanical variable is ultimately being spent to buy. The unit metric that ties biomechanics to value is **mph per unit of normalized torque**: how much velocity is this athlete extracting per unit of arm stress. That ratio, not raw velo, is the honest efficiency scoreboard.

**For Soto (Triton):** this ratio is a natural new Compete/Triton feature — a "velo efficiency" or "stress-adjusted velo" metric joining `compete_pitches` (TrackMan velo) to a mocap-derived torque estimate. It slots alongside Stuff+/command/deception as a health-flavored index.

## 3. Normative Ranges by Phase and Level

Assessment is comparison. Below are working norms for adult/college pitchers (the ASMI/clinician's-guide consensus). **These are population centers, not targets** — individual optimization beats template-chasing.

**At lead foot contact:**
- Lead knee flexion ~45°
- Elbow flexion ~90°
- Shoulder abduction ~90°
- Shoulder horizontal abduction ~20°
- Shoulder external rotation ~45°
- Pelvis ~35° rotated toward target
- Stride length ~**85% of pitcher height**

**End of arm cocking (max external rotation):**
- Shoulder MER ~**170–180°** (this is a whole-arm number — much of the apparent "layback" is forearm/wrist and trunk contribution, not pure glenohumeral)

**At ball release:**
- Lead knee flexion ~30° (extending — target extension velocity ~**350°/s**)
- Shoulder abduction ~90°
- Elbow flexion ~25°
- Trunk forward tilt ~35°
- Trunk contralateral (lateral) tilt ~20°

**Peak angular velocities:**
- Pelvis rotation ~**650–700°/s** (HS ~669 ± 96°/s)
- Trunk/torso rotation ~**1,050–1,100°/s** (HS ~1,085 ± 93°/s)
- Elbow extension up to ~**2,700°/s**
- Shoulder internal rotation up to ~**7,000–7,500°/s** (fastest human joint motion)

**Hip-shoulder separation:** peak ~**35–60°**; correlated with trunk rotation velocity and thus pitch velocity. Sequencing note: peak-pelvis to peak-trunk timing gap of **~0.03–0.05 s** is a healthy proximal-to-distal signature (Driveline flags ≥0.05 s differentials favorably) (proven).

**Kinetics (the injury layer):**
- Peak **elbow varus torque ~100 N·m** in adults (50–120 N·m band across studies), riding near the cadaveric UCL failure limit
- Shoulder **internal rotation torque** comparable order of magnitude
- Arm-deceleration shoulder loads: proximal force **30–40% BW**, posterior shear **40–50% BW**

**Level effects (120-pitcher study, youth→pro):** elbow varus torque ↑ and shoulder distraction force ↑ with level; GRF flat across levels (p=0.96 / p=0.14). Higher-level pitchers were *more* kinematically efficient yet carried *more* arm stress — because they throw harder (proven).

**The torque driver, quantified (523 elite pitchers, mean age 21.2):** 11 kinematic parameters explained **~40% of the variance** in normalized varus torque; ball velocity was the single largest contributor. The high- vs low-torque contrasts: greater shoulder abduction and elbow flexion at foot contact, lower upper-trunk tilt and shoulder ER at foot contact, lower max MER, higher max knee- and elbow-extension velocities, greater contralateral trunk tilt at release, lower shoulder abduction at release. Actionable one: **each 10° increase in contralateral trunk lean at release adds ~4 N·m** of elbow varus moment; ~100° shoulder abduction paired with ~10° contralateral tilt minimizes peak varus torque (proven).

**For Soto:** these normative tables are the seed for a Neptune `assessment_norms` reference table (metric × level × percentile), the biomech analog of Triton's `league_averages`. Build percentile lookups keyed on (level, metric) exactly like the 50th-percentile benchmark pattern already in `refresh_league_averages`.

## 4. Report Structure — The Six-Page Model

Driveline's report is the de-facto industry template. Its six sections (proven):

1. **Title/Overview** — demographics (height, weight, capture date), three MER snapshots, headline velo.
2. **Arm Action** — shoulder abduction (target ~90°; >135° = "elbow climb" flag), horizontal abduction / scap load (avg ~40° at foot plant, up to ~57°). Poor scap retraction + elbow climb = inefficiency flag.
3. **Midsection / Lower Body** — trunk angle, forward/lateral tilt ("stacked and closed"), hip-shoulder separation, front-knee flexion + extension velocity.
4. **Kinematic Velocities** — pelvis/torso/arm rotational speeds, lead-knee extension velocity (velocity-correlated).
5. **Kinematic Sequencing** — peak-pelvis→peak-torso timing (e.g., 0.039 s = "pretty good"); desired order pelvis → torso → elbow → shoulder.
6. **Kinetics** — elbow varus torque + shoulder IR torque (N·m), normalized torque (%), and **mph per normalized torque** efficiency.

Every metric is **percentile-ranked against the internal database** — the same six movement buckets that feed the hierarchy-of-needs mechanics tier: arm action, CoG velocities, lead-leg block, rotational velocities, arm-rotational velocities, hip-shoulder separation. Turnaround: report in Traq within 24 h.

**Good report design principles (synthesized):**
- Lead with **outcome + efficiency** (velo, mph/torque), not a wall of joint angles.
- **Percentile bars** beat raw numbers for athlete comprehension; keep raw values in an appendix for coaches.
- **Flag, don't just display** — auto-highlight the 2-3 metrics most divergent from norm *and* most correlated with this athlete's velocity ceiling.
- Tie every flag to a **named intervention** (see §5), or the report is inert.

**For Soto:** this maps cleanly onto Triton's `components/reports/TileViz.tsx` tile system (percentile bars, spectrum heatmaps, compact tables are already primitives). A Neptune biomech report is a Reports-Builder template with tiles for the six buckets + a kinetics/efficiency tile — dark theme, TruMedia density, shippable in the existing tile framework.

## 5. Translating Findings into Training Prescriptions

The discipline: **root cause before symptom**, and **prioritize by (divergence-from-norm × correlation-to-this-athlete's-goal)**. Driveline's prioritization order — **ROM restoration → strength development → movement application** — exists so you never prescribe a drill an athlete physically cannot perform (proven, as a heuristic).

Worked mapping of common flags → prescriptions:

- **Excessive elbow climb (>135° abduction) + poor scap retraction** → Pivot Pickoff drill, scap-retraction throws, external cue "elbow back/down." (proven as Driveline practice)
- **Low hip-shoulder separation + poor thoracic rotation** → address hip mobility + thoracic ROM + core strength *first*; then constraint/med-ball drills to express separation. Don't cue "more separation" into a body that can't rotate.
- **Poor lead-leg block / low knee-extension velocity** → hip mobility/strength, posture work, then blocking-focused drills (e.g., front-leg iso work, plyo transfer). Lead-knee extension velocity is velocity-correlated, so this is often high-yield.
- **High contralateral trunk lean at release (arm-stress flag)** → posture/"stack" work to reduce late lateral tilt; recall each 10° ≈ 4 N·m of varus moment.
- **GIRD / TROM deficit >5°** → sleeper/cross-body ROM, soft-tissue, posterior-capsule work; monitor as an injury-risk gate, not a velo lever.
- **Strength floor (low mid-thigh pull / CMJ power)** → the mechanics work waits; you are in the "High Performance" tier of the hierarchy.

The dominant *movement-learning* method at Driveline is **high-intent weighted-ball / constraint throwing with external cueing**, letting the athlete self-organize toward the target pattern rather than internally micromanaging joints. This is the "self-discovery" model — cue the outcome/environment, not the body part (promising; supported by external-focus motor-learning literature).

**Velocity-gain context to calibrate expectations:** across a training block, ~**52% gained >1 mph, 27% held, 21% lost** at the last mocap retest — so "everyone gains" is false, and a re-assessment that shows a hold or small loss is inside the normal distribution, not a program failure (promising).

**For Soto (Trevor):** Trevor's TJ (2017) history makes the *kinetics/efficiency* half of the report the personally salient half — the goal for a post-TJ arm in a staying-sharp/demo role is high mph-per-torque and clean deceleration mechanics, not chasing peak velo. His assessment should foreground varus-torque trend, contralateral-tilt-at-release, and TROM symmetry as monitoring gates.

## 6. Re-Assessment Cadence and Longitudinal Tracking

- **Cadence:** every **6 weeks (±1–2)**. Long enough to clear day-to-day noise and let nonlinear gains accumulate; short enough to catch drift and re-prioritize. Some programs stretch to 6–8 weeks with a structured program update at each retest (promising).
- **Hold velo constant to read mechanics:** Driveline explicitly retests at a consistent velocity measure so mechanical/kinetic change isn't confounded by a velo spike. The prized longitudinal result is **lower arm torque at the same velocity** — efficiency improvement even when the radar gun didn't move.
- **What to trend:** velo, mph/normalized-torque, the 2-3 previously-flagged kinematic variables, force-plate power, and ROM gates. Store every capture; the database *is* the moat.
- **Noise discipline:** single-session values (esp. torque) carry meaningful trial-to-trial variance; trend 3+ throws per session and compare session medians, not single pitches.

**For Soto (Neptune/Triton):** this is a `compete`-style session model — one row per capture session, per-throw child rows, longitudinal charts per athlete. The 6-week cadence becomes a scheduled re-assessment prompt in the athlete's Neptune profile. The Compete `*_sessions`/`*_pitches` two-table pattern already fits; add a `biomech_captures` sibling keyed to the same athlete id.

## 7. Technology Tiers and Cost (Neptune Build Guidance)

- **Marker-based optical (Vicon/Qualisys-class):** gold standard, sub-degree, but ~$50k–$150k+ in cameras, a dedicated lab, and 60–90 min of skilled labor per session even after Driveline-scale optimization. Overkill for a facility unless research/pro is the market.
- **Multi-camera markerless (KinaTrax):** the MLB in-stadium standard; adapted for clinical gait with reliable spatiotemporal + sagittal/frontal kinematics. Facility-scale cost, no markers, faster throughput.
- **Single/few-camera markerless (Reboot Motion, pitchAI, Uplift Labs):** validated at **r² ≈ 0.89, RMSE ≈ 11°** for pitching-elbow angle vs marker-based; arm-angle repeatability ~3°. Best price/accessibility; good for *tracking and coaching*, weaker for absolute kinetic (UCL-load) claims (promising).
- **Force plates:** the highest ROI single add — non-fatiguing, fast, repeatable, and they anchor the "High Performance" tier. Commercial dual-plate systems run low-to-mid five figures.
- **Open resources:** Driveline's **OpenBiomechanics Project** (100 pitchers, 98 hitters; raw + processed mocap, code) is a free normative/validation reference — use it to bootstrap Neptune's norm tables before you've captured enough of your own athletes.

Market framing: content-heavy remote+in-house programs (Tread Athletics) bundle assessment into a **12-month coaching commitment with a one-time assessment fee** plus app-based interaction and periodic Charlotte visits — evidence that the *ongoing loop*, not the one-time capture, is what athletes actually pay for.

**For Soto:** the pragmatic Neptune v1 stack = **force plates + single/multi-cam markerless + existing TrackMan**, with the marker-based lab as a later prestige upgrade. That gets 80% of the diagnostic value at a fraction of the capital, and every stream already has a home in the Compete/Triton data model. Bootstrap norms from OpenBiomechanics, then swap to in-house percentiles as the athlete database grows — the exact pattern Triton uses for `league_averages`.

## 8. Pitfalls and Evidence Caveats

- **Torque ≠ mechanical flaw.** The strongest predictor of varus torque is velocity. A high-torque report on a hard thrower is expected, not damning; judge *torque relative to velocity* (proven).
- **Norms are population centers, not targets.** Chasing a "170° MER" or "85% stride" into an athlete's body can *create* stress. Individual optimization > template matching (plausible).
- **Injury prediction is weak.** GIRD/TROM associations are retrospective/observational; no single biomech variable reliably predicts UCL failure prospectively. Use flags as *monitoring gates*, not verdicts (proven that the evidence is associational).
- **Markerless kinetics are still soft.** Joint *angles* are reliable; inverse-dynamics *torques* from few-camera markerless carry more error — don't make medicolegal arm-health claims off a phone rig (promising).
- **Single-session noise.** Kinetic values vary throw-to-throw; the 6-week retest and multi-throw medians exist specifically to defeat this (proven).

## Sources

1. Driveline Baseball — How We Interpret Biomechanics Reports. https://www.drivelinebaseball.com/2019/03/interpret-biomechanics-reports/
2. Driveline Baseball — Biomechanics Services. https://www.drivelinebaseball.com/biomechanics-services/
3. Driveline Baseball — A Look Under the Hood: How Driveline Sport Science Collects, Processes, and Analyzes Biomechanics Data (2022). https://www.drivelinebaseball.com/2022/09/a-look-under-the-hood-how-driveline-sport-science-collects-processes-and-analyzes-thousands-of-athletes-biomechanics-data/
4. Driveline Baseball — Pitching Assessments and Changing Mechanics (2018). https://www.drivelinebaseball.com/2018/10/pitching-assessments-changing-mechanics/
5. Driveline Baseball — The Pitching Hierarchy of Needs (2024). https://www.drivelinebaseball.com/2024/07/the-pitching-hierarchy-of-needs/
6. Driveline Baseball — Pitching Training Velocity Results 2019–2020 (retest cadence). https://www.drivelinebaseball.com/2021/06/pitching-training-velocity-results-2019-2020/
7. Driveline Baseball — The OpenBiomechanics Project: Driveline Goes Open Source (2022). https://www.drivelinebaseball.com/2022/12/openbiomechanics-project/
8. The OpenBiomechanics Project. https://www.openbiomechanics.org/
9. The Clinician's Guide to Baseball Pitching Biomechanics — PMC9950989. https://pmc.ncbi.nlm.nih.gov/articles/PMC9950989/
10. Kinematic Parameters Associated With Elbow Varus Torque in Elite Adult Baseball Pitchers (523 pitchers) — PMC11789100. https://pmc.ncbi.nlm.nih.gov/articles/PMC11789100/
11. Pitching Biomechanics Normative Values and Kinetic Differences by Competition Level (120 pitchers) — PubMed 36413165. https://pubmed.ncbi.nlm.nih.gov/36413165/
12. The Relationship of Range of Motion, Hip-Shoulder Separation, and Pitching Kinematics — PMC7727427. https://pmc.ncbi.nlm.nih.gov/articles/PMC7727427/
13. Peak Horizontal Ground Reaction Forces and Impulse Correlate With Segmental Energy Flow in Youth Baseball Pitchers — PubMed 32635991 / ScienceDirect. https://www.sciencedirect.com/science/article/abs/pii/S0021929020303328
14. Lower Body Energy Generation, Absorption, and Transfer in Youth Baseball Pitchers — Frontiers in Sports and Active Living (2022). https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2022.975107/full
15. The Contribution of Lower-Body Kinematics to Pitching and Hitting Performance: Utilizing the OpenBiomechanics Project — PubMed 37939700. https://pubmed.ncbi.nlm.nih.gov/37939700/
16. Correlation of GIRD and Total Rotational Motion to Shoulder Injuries in Professional Baseball Pitchers — ResearchGate/PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC11615455/
17. Reboot Motion — Building Baseball's Best Single-Camera Motion Capture (markerless validation, r²≈0.89). https://learnyourkeep.substack.com/p/building-baseballs-best-single-camera
18. Validation of pitchAI Markerless Motion Capture Using Marker-Based 3D Motion Capture. https://www.researchgate.net/publication/365644625_Validation_of_pitchAI_TM_markerless_motion_capture_using_marker-based_3D_motion_capture
19. Comparison of Ground Reaction Force Among Stride Types in Baseball Pitching — Sports Biomechanics (2024). https://www.tandfonline.com/doi/full/10.1080/14763141.2024.2315241
20. Tread Athletics — Pitching Development (assessment + 12-month coaching model). https://treadathletics.com/
