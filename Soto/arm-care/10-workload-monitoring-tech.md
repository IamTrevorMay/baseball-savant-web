---
title: Arm Workload Monitoring Technology — Sensors, Torque Estimation, and a Facility Stack
domain: arm-care
tags:
  - workload-monitoring
  - pulse-motus
  - imu-torque
  - acwr
  - armcare
  - readiness
  - throw-counts
  - facility-stack
sources_reviewed: 20
last_updated: 2026-07-19
---

# Arm Workload Monitoring Technology — Sensors, Torque Estimation, and a Facility Stack

## TL;DR

- **The Motus/PULSE IMU sleeve is excellent for *relative* torque tracking and useless for *absolute* torque.** In-lab it hit ICC 0.99 vs ASMI motion-capture torque and readings within ~5%, but an independent field validation (Boddy/Driveline-adjacent, n=10) found the "Stress" metric ran **41 N·m (38.7%) lower** than true elbow-varus torque while still correlating R=0.667. Use it to compare an athlete to himself over time, never to publish a "your elbow sees X N·m" number. (proven)
- **PULSE workload is a torque-derived load unit, not a pitch count.** Per-throw workload = (peak valgus torque N·m ÷ [height_m × weight_kg])^1.3 — a NASA-derived non-linear exponent, so a 100 N·m throw ≈ 2.45× the load of a 50 N·m throw, not 2×. This is the single biggest reason pitch counts under-describe stress. (proven)
- **Acute:Chronic Workload Ratio (ACWR) is a useful load-management guardrail but a debunked injury *predictor*.** PULSE uses a 9-day acute / 28-day chronic window with a 0.7–1.3 "safe zone" (Driveline nudges to ≤1.2). Impellizzeri et al. showed the original ACWR "sweet spot" figure is statistically flawed — bucketed continuous data, artificial thresholds; treat ACWR as a ramp-rate speedometer, not a crystal ball. (debunked as predictor / promising as governor)
- **Velocity is a lagging, noisy workload proxy — accuracy and grip strength lead it.** A 3–5 mph in-game velo drop signals clear fatigue, but a systematic review of 25 studies found velo declines range 1–5 mph and *kinematic compensation precedes velo loss*. Strike% dropped to 52.4% at moderate and 45.3% at severe fatigue. Velo is a coarse red flag, not a readiness gauge. (proven)
- **Grip strength is a better in-session fatigue readout than velocity.** In a 75-pitch simulated game (n=26) throwing-arm grip fell **12.66% (55.7→48.6 kg, p<0.001, ηp²=0.299)** while the non-throwing arm barely moved (7.19%, ns). Forearm-flexor and biceps soreness spiked ~25%. A ~$40 hand dynamometer between innings/sessions is a legitimate readiness tool. (promising)
- **ArmCare's strength sensor is trustworthy for strength, weak for ROM.** Validation (n=51, ages 14–23) vs hand-held dynamometry: strength r=0.72–0.81, ICC 0.72–0.79 (good); vs goniometry for ROM: r=0.23–0.47, ICC 0.11–0.37 (poor). Buy it for shoulder strength and ER/IR balance tracking; don't trust its ROM numbers. (proven)
- **Preseason shoulder-strength screening has the strongest injury-prediction evidence in the whole space.** Byram et al. (AJSM 2010, 5-yr prospective, n=207 pro pitchers): preseason external-rotator and supraspinatus weakness predicted in-season throwing injury requiring surgery; ER/IR ratio associated with shoulder-injury incidence. This is the readiness metric to build the facility on. (proven)
- **A defensible Neptune monitoring stack costs ~$1,500–4,000 up front + ~$1,500/yr for a small roster.** PULSE (~$250 sensor + ~$250/yr each), ArmCare ($250 dynamometer + $10/mo), a $40 hand dynamometer, a $200–500 radar/Rapsodo you already have, and a shared TRAQ/Triton spreadsheet layer. The tech is cheap; the discipline of daily testing is the actual product. (plausible)

## 1. The sensor landscape: what actually exists in 2026

Three tools dominate athlete-facing arm-monitoring, and they measure different things:

**PULSE (formerly Motus / motusBASEBALL / mThrow).** Driveline acquired Motus Global in 2020 and rebranded the sleeve-and-sensor system as PULSE. It is a single **inertial measurement unit (IMU)** — accelerometer + gyroscope, "the same tech in guided missiles and VR headsets" — worn on the medial elbow via a compression sleeve or strap. It estimates per-throw peak elbow valgus torque, arm speed, arm slot, shoulder rotation, and throw count, and rolls them into a proprietary "workload" unit. **PULSE 2.0** (released March 13, 2025) added a Sleep Mode taking battery from 8–15 hours to **2–10 days**, better Bluetooth auto-reconnect, and syncing into the **TRAQ** app ecosystem. Hardware is unchanged from the IMU original. Sensor ~**$250**, subscription ~**$250/yr** (~$220 with DrivelinePLUS). It is *not* discontinued — it's the de-facto standard for throwing-load quantification. (proven — product facts)

**ArmCare.com** (an ActivBody / ActivForce ecosystem). A **hand-held dynamometer** (ActivForce2 / rebranded ArmCare Strength Sensor) plus a mobile app that guides self-administered shoulder strength and ROM tests: internal rotation (IR), external rotation (ER), and scaption strength, plus IR/ER ROM. It reports ArmScore, ER/IR shoulder balance, strength-to-bodyweight, strength-velocity ratio (lb/mph), and fatigue/recovery deltas. Adoption is broad: 500+ facilities, 300+ high schools, 280+ colleges, 200+ travel programs. Dynamometer ~**$250**, app ~**$10/mo** (annual). It measures *capacity/readiness*, not throwing load — the complement to PULSE, not a competitor. (proven — product facts)

**The "free tier": pitch/throw-count apps + radar.** Pitch counts (Pitch Smart, GameChanger, TRAQ manual entry) and velocity from any radar (Pocket Radar ~$300, Stalker) or Rapsodo/TrackMan you already own. These are the cheapest layer and the least biomechanically informative — but pitch count is still the substrate every governing body regulates around. (proven)

**For Soto:** Neptune already ingests TrackMan via the Compete pipeline (`compete_pitches`). PULSE and ArmCare both export CSV/API; the differentiated move is landing all three streams — throwing load (PULSE), capacity/readiness (ArmCare), and pitch characteristics (TrackMan) — into the same athlete record in Supabase so the Triton dashboard shows load, readiness, and stuff on one timeline. That triangulation is the actual "development lab" product, and no consumer app does it.

## 2. IMU torque estimation: how it works and where it breaks

The physics: an IMU on the medial elbow captures angular velocity and linear acceleration; combined with segment length/mass estimates (from height and weight) and the elbow's angular kinematics, you can back out an *estimate* of valgus (medial) torque — the load the UCL and flexor-pronator mass resist at peak external rotation. True elbow-varus torque in pro pitchers averages **~87 ± 15 N·m** (n=182 pros, arm-path study) and typical PULSE "Stress" readings span **30–90 N·m, mean ~61 ± 15.7 N·m**. (proven)

The problem is that a single IMU cannot see the whole kinematic chain a 3D motion-capture lab (ASMI's 8-camera marker system) reconstructs. So estimation error accumulates. The two headline validation results *look* contradictory and both are true:

- **In-lab, controlled:** the Motus stress metric hit **ICC 0.99** against ASMI's peak-valgus-torque measurement, with readings **within ~5%** (Camp/Fleisig-associated lab work; the same group ran 81 pro pitchers across ~82,000 throws mapping mechanics to torque). (proven)
- **Independent field validation** (PeerJ 2019, n=10 collegiate/pro pitchers, 5–7 fastballs + 5–7 breaking balls): the sensor's Stress ran **41 N·m (38.7%) lower** than motion-capture elbow-varus torque and **42 N·m (39.3%) lower** than shoulder-IR torque, while still correlating **R=0.667 (elbow), P=0.001**. Arm slot correlated near-perfectly (**R=0.975**, 8° lower) and shoulder rotation strongly (**R=0.749**, 9° lower). (proven)

**Reconciliation:** the strong ICC/near-perfect correlation means the sensor tracks *changes and rank-order* faithfully — if athlete A's Stress rises 15%, his true torque very likely rose ~15%. The large magnitude offset means the *absolute number is wrong* (systematically low, and offset varies by lab, firmware, sleeve fit, and calibration). The correct interpretation, echoed across the literature: **PULSE is valid for within-athlete, over-time relative monitoring; invalid for absolute torque claims or cross-athlete torque comparison.** (proven)

**For Soto:** In any Triton/Neptune surface, present PULSE data as **indexed to the athlete's own baseline** (e.g., "today's per-throw stress = 108% of your trailing-30-day median") — never as a raw N·m gauge implying medical precision. If we ever fit our own Stuff+-adjacent "arm load" feature on PULSE data, treat the sensor value as an ordinal/relative feature, and standardize per athlete (z-score within pitcher) exactly as Stuff+ already standardizes per pitch_name/game_year. Cross-athlete N·m leaderboards would be biomechanically indefensible.

## 3. PULSE workload: the math that beats pitch counts

PULSE's core contribution is turning torque into a dose. For each throw:

> **One-Throw Workload = (peak valgus torque N·m ÷ [height_m × weight_kg])^1.3**

Two design choices matter. First, **normalizing by height×weight** makes load comparable across body sizes (a 41 N·m offset on a 6'6" 240 lb arm means something different than on a 5'10" 160 lb arm). Second, the **1.3 exponent** — lifted from NASA bone/tissue-loading research showing tissue stimulus is non-linear with load — means high-effort throws are disproportionately taxing. A 100 N·m throw ≈ **2.45×** the workload of a 50 N·m throw, not 2×. This is precisely why 100 pitches is not 100 pitches: a bullpen of 100 easy flat-grounds and a 100-pitch max-effort start can differ 2–3× in PULSE workload. (proven — vendor model, physiologically grounded)

**One-Day Workload** = sum of all one-throw workloads that day. **High-effort throw** = any throw ≥70% of the average of the athlete's five highest torque values over the trailing two weeks (if <50 throws logged, defaults keyed to height/weight/level). (proven)

**Acute** = 9-day weighted average (most recent day ×1.3, prior days ×0.7 kernels). **Chronic** = 28-day average. **ACWR = Acute ÷ Chronic**, safe zone **0.7–1.3**, with Driveline's practical college-staff guidance to hold **≤1.2** (≤20% over the 28-day base) during buildup. (proven — vendor)

**For Soto:** This exponent + normalization pattern is worth stealing conceptually even where we only have TrackMan velo, not PULSE torque. A velo-scaled effort proxy could apply a similar convex weighting so that a full-effort day counts for more than a touch-and-feel day — a poor-man's workload unit for athletes without a sensor. Log any such formula and its provenance in `docs/VARIABLES.md` if it becomes a Triton metric.

## 4. ACWR: governor, not oracle

The ACWR is the most-cited and most-attacked idea in load monitoring. The critique is decisive and Soto should hold both truths:

- **As an injury *predictor*, the ACWR "sweet spot" is debunked.** Impellizzeri et al. (BJSM/IJSPP 2019–2020) showed the original Gabbett injury-risk figure grouped continuous data into arbitrary buckets, creating artificial thresholds; when outliers were removed and data treated as continuous, the ACWR–injury relationship largely disappeared. They demonstrated ACWR mostly re-expresses acute load without adding predictive value, and that randomized chronic loads predict about as well. Heterogeneous inputs (internal vs external load) further muddy it. Multiple authors requested retraction/correction of the seminal figure. (debunked)
- **As a *ramp-rate governor*, it's still useful.** Nobody disputes that spiking acute load far above your prepared base is risky; ACWR is a convenient dashboard number for "am I ramping too fast?" The SimpliFaster framing — "not an injury predictor, but a high-performance tool" — is the right mental model. Keep it visible, keep it ≤1.3, but never tell an athlete a 1.25 means he's "safe." (promising as a governor)

ArmCare's own critique adds the sharpest practical point: **ACWR is external load only — it tells you what the athlete *did*, not how they *responded*.** A pitcher can sit at a textbook 1.1 ACWR and still be under-recovered because his rotator cuff is down 15%. That's the argument for pairing any load ratio with a *capacity/readiness* measurement (Section 5). (plausible → the strongest conceptual case in the space)

**For Soto:** In Triton, render ACWR as a trend line with the 0.7–1.3 band shaded, explicitly labeled "ramp-rate guide, not injury risk." Pair it on the same card with a readiness measure (ArmScore / grip / ER strength). The differentiated Neptune claim isn't "we track ACWR" (every app does) — it's "we track load *and* recovered capacity and only clear high-intent days when both agree."

## 5. Readiness: strength, grip, and ROM — the leading indicators

Load tells you the stimulus; readiness tells you whether the tissue absorbed it. The evidence here is actually *stronger* than the load-ratio evidence.

**Preseason shoulder strength — the gold-standard predictor.** Byram et al. (AJSM 2010, 5-year prospective, **n=207** pro pitchers): preseason **external-rotator and supraspinatus weakness predicted in-season throwing injuries requiring surgery**, and the **ER/IR strength ratio** was associated with shoulder-injury incidence. This is one of the few *prospective* injury-prediction findings in the entire arm-care literature. The practical target most facilities adopt: **ER/IR ratio ≥ 1.0** (external rotators at least as strong as internal rotators), because posterior-cuff strength decelerates the arm. (proven)

**Grip strength — the in-session fatigue readout.** In a 75-pitch simulated game (**n=26**, ages 13–50), throwing-arm grip fell **12.66% (55.67→48.62 kg, p<0.001, large effect ηp²=0.299)**; the non-throwing arm dropped only 7.19% (ns). Forearm-flexor soreness rose ~25% (1.65→4.19 / 10, p=0.005) and biceps soreness ~25% (1.81→4.31, p=0.045); shoulder muscles barely changed. The authors' blunt conclusion: **"grip strength assessment seems more relevant than pitching velocity for assessing acute muscle fatigue."** A ~$40 hand dynamometer, tested between innings or pre/post session, is a legitimate, cheap fatigue gate. (promising)

**ROM changes — monitor, but measure carefully.** Loss of shoulder ROM (notably GIRD — glenohumeral internal-rotation deficit) and total-arc changes accompany fatigue and are classic risk flags; max shoulder ER declined ~9° across innings in the fatigue review. But **ArmCare's app ROM measurement is not accurate** (validation r=0.23–0.47 vs goniometry, ICC 0.11–0.37, R²≤0.22) — dominant-shoulder flexion ICC was 0.19. For ROM you want a trained hand with a goniometer/inclinometer or a validated mocap/2D-video pipeline, not the phone-app ROM number. ArmCare *strength* is fine (r=0.72–0.81, ICC 0.72–0.79). (proven — the split validity)

**Velocity/accuracy — coarse, lagging flags.** In-game velo drops of **3–5 mph** reliably signal fatigue, but the fatigue systematic review (25 studies) found declines ranging 1–5 mph (Murray 90→85; Escamilla 77.6→75.4; Erickson 2.7% over six innings) and, crucially, that **kinematic compensation precedes velo loss** — arm keeps velo up by borrowing from mechanics, so velo can look fine while stress rises. Strike% is a parallel tell: **52.4% at moderate fatigue, 45.3% at severe**. Use velo/accuracy as confirmatory red flags, not primary readiness gauges. (proven)

**For Soto:** This is a Triton feature spec waiting to happen. A Neptune "Arm Readiness" card per athlete: (1) ER/IR ratio and ArmScore trend from ArmCare, (2) grip delta vs baseline, (3) ROM total-arc from a trained assessor (not the app), (4) velo/strike% from TrackMan as confirmatory. Green/amber/red gate on high-intent days when readiness contradicts the plan. The Byram ER/IR ≥1.0 target and the ~12% grip-drop fatigue threshold are concrete, citable rules to encode.

## 6. Velocity as a workload proxy: use it, don't lean on it

Because velocity correlates with torque, it's tempting to use velo alone as a load surrogate. The physics supports a link — **within a pitcher, ~1.63 N·m of added elbow-varus torque per +1 mph** (derived from the arm-path study: +30 cm early arm path → +1.29 N·m and +0.79 mph within-pitcher) — and Fleisig's classic work established fastball velocity as a driver of varus torque. But three cautions:

1. **Between pitchers, the velo–torque relationship is weak** (inter-pitcher R²≤0.03 in the arm-path data): a hard-throwing pitcher with clean mechanics can generate a given velo at lower torque than a max-effort compensator. So a cross-athlete "velo = load" model fails, same failure mode as absolute IMU torque.
2. **Velo is a lagging fatigue signal** — mechanics degrade first (Section 5).
3. **Season-of-injury velo signal is tiny** — roughly a **one-third mph** average drop in the injury season; useful epidemiologically, near-useless for an individual in real time.

**For Soto:** Velocity is a fine *ingredient* in an effort/intent estimate (it's why PULSE uses ball velocity as one of three intensity inputs alongside arm speed and torque), but a velo-only workload metric would be biomechanically naive. If Triton ships an effort proxy from TrackMan, normalize velo to each athlete's own max-intent baseline and treat it as one feature among several — never a standalone load unit.

## 7. A practical Neptune monitoring stack, with prices

Design for tiers so athletes buy in at their level, and so the *facility* owns the aggregated data layer regardless.

**Tier 0 — Baseline (every athlete, ~$0 incremental).** Pitch/throw counts + radar velo you already capture. Manual entry into TRAQ or the Triton athlete record. Enforces Pitch Smart-style count limits. Weakest biomechanically, but the compliance floor.

**Tier 1 — Readiness core (facility-owned devices, shared).** 
- **ArmCare dynamometer ~$250** + app **~$10/mo** — weekly ER/IR strength, ArmScore, shoulder balance. ~5 min/athlete. (Buy for strength; ignore app ROM.)
- **Hand grip dynamometer ~$40** — pre/post-session grip delta as a fatigue gate (~12% drop = flag).
- **Goniometer/inclinometer ~$30** or a validated 2D-video ROM routine — trained-assessor ROM/GIRD monthly.
- Total up-front ~**$320**, ~**$120/yr** app. Serves the whole roster.

**Tier 2 — Throwing load (per serious arm).** 
- **PULSE 2.0 ~$250 sensor + ~$250/yr** subscription each. Assign to developmental starters, return-to-throw rehabbers, and any athlete building velo. For a 6-arm priority group: ~**$1,500 up front + ~$1,500/yr**.

**Tier 3 — Lab days (occasional, high-value).** Periodic 3D/markerless mocap (KinaTrax-style or a mobile biomech day) for the *absolute* torque and full-kinematics read PULSE can't give — quarterly or at intake, not continuous.

**All-in for a small facility with a ~6-arm PULSE group:** roughly **$1,800–2,000 up front** and **~$1,600–1,800/yr** recurring, before optional lab days. The hardware is cheap; **the binding constraint is the daily discipline of testing and a clean data pipeline**, which is exactly the leverage-over-headcount problem the operator already prioritizes.

**Data architecture:** PULSE (workload/ACWR) → CSV/API; ArmCare (strength/ArmScore) → export; TrackMan (velo/stuff) → existing `compete_pitches`. Land all three keyed to a Neptune athlete_id in Supabase, render one Triton "Arm Health" timeline (load band + readiness gate + stuff), and you have a monitoring product no off-the-shelf app matches. (plausible)

**For Trevor (personal):** For a former-TJ arm doing staying-sharp/demo work rather than a competitive build, the whole PULSE ACWR apparatus is overkill — but two cheap habits carry real signal: a **weekly ArmCare ER/IR check** (watch that ratio stay ≥1.0 and flag if ER strength drifts down — the Byram finding is literally about your injury mode) and a **grip delta on heavier throwing days**. Absolute torque numbers from any sleeve should be read as "up vs my own last month," never as a medical readout. And the velo lesson cuts personally: if mechanics start borrowing to hold velo, readiness will have flagged before the radar does.

## 8. Pitfalls, honest limits, and what to tell athletes

- **Don't publish absolute IMU torque.** The 41 N·m offset is systematic and firmware/fit-dependent. Relative only. (proven)
- **Don't sell ACWR as injury prediction.** It's a ramp governor; the predictive figure is retracted-tier flawed. (debunked)
- **Don't trust phone-app ROM.** Strength yes, ROM no (ICC as low as 0.19). Use a trained assessor for ROM/GIRD. (proven)
- **Don't treat velo as readiness.** Mechanics degrade first; velo lags. Grip and accuracy are earlier tells. (proven)
- **Do standardize everything per athlete.** Every valid signal in this domain — IMU stress, workload, strength, grip — is a *within-person* comparison. Cross-athlete leaderboards on any of these are, at best, motivational theater and, at worst, biomechanically wrong. (proven)
- **Do gate high-intent days on load AND readiness agreeing.** The entire value proposition of a monitoring stack over a pitch counter is catching the athlete who's "on schedule" per ACWR but under-recovered per strength. (plausible)

## Sources

1. Reconciling PULSE/MOTUS Validation and its Acceptable Applications in Baseball — ResearchGate — https://www.researchgate.net/publication/399777604_Reconciling_PULSEMOTUS_Validation_and_its_Acceptable_Applications_in_Baseball
2. Exploring wearable sensors as an alternative to marker-based motion capture in the pitching delivery (PeerJ 2019, n=10) — https://pmc.ncbi.nlm.nih.gov/articles/PMC6348088/
3. Exploring wearable sensors… (PubMed record) — https://pubmed.ncbi.nlm.nih.gov/30697497/
4. Review: Motus Global's mThrow — TechGraphs/FanGraphs — https://techgraphs.fangraphs.com/review-motus-globals-mthrow/
5. The mThrow Wearable Sleeve Turns Baseball Pitching Into a Science — IEEE Spectrum — https://spectrum.ieee.org/the-mthrow-wearable-sleeve-turns-baseball-pitching-into-a-science
6. Using PULSE to define throwing workload — Driveline Baseball — https://www.drivelinebaseball.com/2020/04/what-is-throwing-workload/
7. New PULSE Upgrades Are Here (PULSE 2.0, Mar 2025) — Driveline Baseball — https://www.drivelinebaseball.com/2025/03/new-pulse-upgrades-are-here/
8. PULSE Throw Workload Monitor (product) — Driveline Baseball — https://www.drivelinebaseball.com/product/pulse-throw/
9. How workload data can help optimize a college pitching staff (2026) — Driveline Baseball — https://www.drivelinebaseball.com/2026/03/how-workload-data-can-help-optimize-a-college-pitching-staff/
10. The Relationship of Throwing Arm Mechanics and Elbow Varus Torque: 82,000 Throws (Camp, Fleisig et al.) — https://pubmed.ncbi.nlm.nih.gov/28806094/
11. Relationship Between Arm Path, Ball Velocity, and Elbow Varus Torque in Pro Pitchers (n=182) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10693215/
12. The acute-chronic workload ratio-injury figure and its 'sweet spot' are flawed (Impellizzeri et al.) — https://www.researchgate.net/publication/333589357
13. Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls (IJSPP 2020) — https://journals.humankinetics.com/view/journals/ijspp/15/6/article-p907.xml
14. The ACWR: Not an Injury Predictor, but a High-Performance Tool — SimpliFaster — https://simplifaster.com/articles/acwr-high-performance-tool/
15. The Reliability and Validity of the ArmCare Strength and ROM Sensor and Mobile App (n=51, IJSPT) — https://ijspt.scholasticahq.com/article/142905
16. We tested the Arm Care App for 3 months — Tread Athletics — https://treadathletics.com/arm-care-app/
17. Rethinking Acute-to-Chronic Workload for Pitchers — ArmCare blog — https://blog.armcare.com/rethinking-acute-to-chronic-workload-for-pitchers/
18. Grip strength, muscle soreness and pain threshold in a simulated 75-pitch game (n=26) — https://pmc.ncbi.nlm.nih.gov/articles/PMC11877241/
19. Change in Grip and Pinch Strength Over a Game in Professional Baseball Pitchers — https://pmc.ncbi.nlm.nih.gov/articles/PMC11664553/
20. Manifestations of muscle fatigue in baseball pitchers: a systematic review (25 studies) — https://pmc.ncbi.nlm.nih.gov/articles/PMC6673423/
21. Byram et al. — Preseason shoulder strength & injury (AJSM 2010, n=207) via Healio summary — https://www.healio.com/news/orthopedics/20120325/professional-pitchers-with-weak-shoulders-in-the-preseason-prone-to-in-season-injuries
22. Implementing Workload Management with the Driveline PULSE Sensor — RPP Baseball — https://rocklandpeakperformance.com/implementing-workload-management-with-the-pulse-sensor/
