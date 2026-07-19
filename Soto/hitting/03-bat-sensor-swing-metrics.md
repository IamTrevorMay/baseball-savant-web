---
title: Bat Sensors & Swing Metrics — Blast Motion, Diamond Kinetics, and What the Numbers Actually Mean
domain: hitting
tags:
  - bat-sensors
  - blast-motion
  - diamond-kinetics
  - swing-metrics
  - attack-angle
  - bat-speed
  - benchmarks
  - hitting-assessment
sources_reviewed: 20
last_updated: 2026-07-19
---

# Bat Sensors & Swing Metrics — Blast Motion, Diamond Kinetics, and What the Numbers Actually Mean

## TL;DR

- **Bat speed is the one metric sensors measure well; bat angles are the one they measure poorly.** The only independent peer-reviewed validation (Morishita & Jinji 2022, vs. 500 Hz Vicon mocap) found mean ICC = 0.78 for swing speed across four commercial sensors but only 0.58 for swing angle — and Blast specifically posted ICC 0.67 with a −16% bias on speed, while Diamond Kinetics posted ICC 0.81 (−17% bias) on speed and was the *only* sensor with ICC > 0.8 on angle. Three of four sensors degraded further above ~30 m/s (~67 mph) swing speeds.
- **Blast's core benchmark table (from millions of logged swings): bat speed** MLB 66–78 mph, MiLB 63–75, college 61–73, HS varsity 57–71, middle school 46–62, youth 40–56; **time to contact** pro 0.13–0.17 s; **peak hand speed** MLB 23–29 mph; **rotational acceleration** averages ~15–17 g MLB, ~12.6 g MiLB, ~12.9 g college; **on-plane efficiency** MLB average 68.6%, target 70%+.
- **Rotational acceleration is the highest-signal "process" metric.** Driveline calls it the most useful Blast metric for forecasting MLB-level hitting ability: <10 g low, 10–15 g medium, >15 g high; hitters above ~13 g held above-average exit velo across a wider contact-depth window (promising, not proven).
- **Attack angle in the +5° to +15–20° band wins decisively.** A 750-swing Blast+Rapsodo study found uppercut swings (+5° to +15°) produced BABIP-style averages of .922–.954 in controlled BP vs .122–.183 for negative attack angles, with attack angle correlating r = +0.51 with launch angle and +0.64 with bat speed. Statcast now publishes "ideal attack angle rate" using the same 5–20° window.
- **Sensor metrics explain roughly half of hitting performance, not all of it.** A 20-player NCAA study (1,000 swings) found Blast metrics explained 48–57% of wOBA variance — power output and composite swing-quality scores predicted wOBA; raw bat speed alone did not.
- **Diamond Kinetics is the value/team play ($50–119 sensor, MLB/USA Baseball/Perfect Game youth partnerships); Blast is the pro-standard depth play** ($149.95 sensor + Blast Connect subscription for premium metrics). DK uniquely offers hand-cast distance, impact momentum, and distance-in-the-zone; Blast uniquely offers rotational acceleration, early connection/connection at impact, and the Plane–Connection–Rotation score system.
- **Statcast bat tracking (2024–25) gives free MLB ground truth**: league-average bat speed 71.5 mph (fast swing = 75+), swing path tilt ~32–37°, "blast" = squared-up% × 100 + bat speed ≥ 164. Note Statcast and Blast measure at slightly different bat points and swing populations — do not mix their scales blindly.
- **Bat speed is trainable: 6–10% gains** from 12-week overload/underload protocols (DeRenne et al., ±10–12% game-bat weight, ~150 swings × 4 sessions/week), and each +1 mph bat speed ≈ +1.2 mph exit velocity (proven for the training effect; the 1.2 conversion is promising).

## 1. What a Bat Sensor Actually Is (and Where the Numbers Come From)

Blast Motion's baseball sensor is a knob-mounted IMU: dual 3-axis accelerometer + gyroscope + magnetometer sampling at 500 Hz, streaming to a phone app over Bluetooth (proven — hardware spec, not a claim). Diamond Kinetics' SwingTracker is the same sensor family (accelerometer/gyro/magnetometer) in a knob mount. Everything either product reports is *computed from knob-of-bat inertial data* — the sensor never sees the ball, the body, or the actual point of contact. Bat speed at the "sweet spot" (Blast measures 6 in. from the tip; DK measures barrel speed 20% from the tip) is an extrapolation from knob kinematics along a rigid-body model of the bat.

Three practical consequences:

1. **Impact detection is inferred**, so "at impact" metrics (attack angle, connection at impact, vertical bat angle) inherit event-detection error on top of orientation error.
2. **No batted-ball outcomes.** A sensor session without a paired ball-flight device (HitTrax, Rapsodo, TrackMan) tells you about the swing, not the result. Driveline's whole applied-research program pairs the two streams for exactly this reason.
3. **Angles come from gyroscope integration + magnetometer heading**, which drift and are noisier than speed estimates — this is precisely where the validation literature shows the weakest numbers (see §3).

**For Soto:** Neptune already has TrackMan via the Compete pipeline. Bat sensors should be specced as the *swing-process* half of a paired capture: TrackMan/HitTrax owns outcomes, Blast owns process. Session schema in `compete_*` should anticipate a `swing_sensor` table keyed to the same session IDs so pairs can be joined per swing.

## 2. Blast Motion Metric Glossary (Definitions + Targets)

Blast's metric set, with vendor definitions and published targets (all vendor-sourced unless noted):

**Contact / plane metrics**
- **Bat Speed (mph)** — speed of the sweet spot (6 in. from bat tip) at impact. MLB range 66–78 mph. This is the anchor metric.
- **Attack Angle (°)** — vertical angle of the bat *path* at impact; positive = swinging up. Blast/practitioner target: +5° to +20°; RPP Baseball's in-house work argues "north of +5°." Pitches descend at −4° to −21° into the zone, so a positive attack angle keeps the barrel in the ball's plane longer (plausible mechanism, promising empirical support — see §5).
- **On-Plane Efficiency (%)** — percentage of the swing (from commit to contact) the barrel spends on the swing plane. MLB average 68.6%; target 70%+ (typical good range 65–85%).
- **Vertical Bat Angle (°)** — bat's tilt relative to horizontal at impact (negative = barrel below hands). Pro range −25° to −35°; HS varsity −21° to −31°; youth −15° to −25°. VBA is location-dependent (steeper on low pitches), so evaluate it per pitch height, not as one number.

**Connection metrics**
- **Early Connection (°)** — angle between lead arm and torso at the start of rotation. Target ~90° (acceptable 80–105°).
- **Connection at Impact (°)** — same relationship measured at contact. Target ~90° (80–105°). Blast frames the pair as the "adjustability" metrics: hold ~90/90 and the swing works at multiple pitch heights (plausible — mechanically sensible, not independently validated).

**Rotation / power metrics**
- **Rotational Acceleration (g)** — how quickly the bat accelerates into the swing plane from launch; the swing's "0-to-60 time." Blast has published MLB averages of both 15.1 g and 16.8–17 g in different materials; MiLB ~12.6 g, college ~12.9 g. Driveline bins: <10 g low, 10.01–14.99 g medium, >15 g high.
- **Power (kW)** — composite of bat speed and how quickly it was produced. Pro 3.8–5.7 kW; HS varsity 2.8–4.1; youth 0.9–2.5.
- **Peak Hand Speed (mph)** — max speed of the hands (knob). MLB 23–29; college 21–27; HS varsity 20–26; youth 17–23.
- **Time to Contact (s)** — trigger (start of forward swing) to impact. Pro/MiLB 0.13–0.17 s; college/HS varsity 0.14–0.18; youth 0.17–0.23. Shorter = more decision time; but chasing short TTC in isolation degrades other metrics.

**Composite scores (Blast iQ)** — every swing is scored 20–80 on **Plane** (on-plane efficiency + attack angle), **Connection** (early connection + connection at impact), and **Rotation** (bat speed + rotational acceleration), with green/yellow/red flags. Driveline's 9,000-swing dataset confirmed the scores are near-redundant with their underlying raw metrics (Plane score ↔ on-plane efficiency, Rotation score ↔ rotational acceleration, "extremely high correlations"), so the scores are legitimate simplifications for athletes, and analysts should just use the raw metrics (proven within that dataset).

**For Soto:** this glossary maps 1:1 to a `docs/VARIABLES.md` §hitting extension when Compete grows a hitting arm: `bat_speed`, `attack_angle`, `on_plane_eff`, `vert_bat_angle`, `early_connection`, `connection_impact`, `rot_accel_g`, `power_kw`, `peak_hand_speed`, `time_to_contact`. Store raw metrics, compute scores ourselves — same philosophy as Stuff+ (own the composite).

## 3. Validity: What Independent Research Actually Shows

The key paper is **Morishita & Jinji 2022** (*Sports*, 10(2):21): four commercial sensors — Mizuno Swing Tracer, Blast Motion, Garmin Impact/Swing Coach, Diamond Kinetics SwingTracker — measured simultaneously against a 500 Hz Vicon optical mocap system (~1 mm calibration error); 7 males (3 pro, 4 recreational), ~50 trials per sensor.

**Swing speed** (proven, with caveats):
- Mizuno ICC 0.91, bias −5%; Garmin ICC 0.91, bias −8%; DK ICC 0.81, bias −17%; **Blast ICC 0.67, bias −16%**. Mean ICC 0.78.
- All sensors *underreport* speed relative to mocap by 5–17%. So a Blast 70 mph and a mocap 70 mph are not the same swing — and neither is a Statcast 70 mph.
- Random error grew at high swing speeds (>~30 m/s) for three of four sensors, attributed to accelerometer saturation. The authors' blunt conclusion: sensors are "useful for evaluating differences in swing speeds among amateur players; however, they may not be suitable for professional players" (proven for their sample; small n).

**Swing angle** (the weak spot — proven weakness):
- Mean ICC 0.58. Only DK exceeded 0.8; Mizuno, Blast, and Garmin were all <0.6. Attack angle and VBA readings on any single swing carry meaningful error; only session averages and within-athlete trends are trustworthy.

Supporting evidence: a 2025 elite-cricket study (*Sports Biomechanics*) found the Blast sensor showed "good to excellent" absolute agreement with mocap for bat speed on some shot types but not others — consistent with the picture of solid speed, shakier everything else (promising).

**Practical validity rules Soto should enforce:**
1. Trust **within-athlete deltas on the same sensor/bat/drill**, not absolute values or cross-device comparisons (proven implication of the bias data).
2. Never coach off one swing's attack angle or VBA; require ≥10-swing session averages (Blast's own coaching guidance agrees).
3. Treat elite-level (>75 mph) bat speed readings with wider error bars.
4. Blast's marketing claim of "most accurate sensor" is not supported by the independent head-to-head — DK actually graded better on both speed consistency and angle (proven vs. that one study; n is small).

## 4. Benchmarks by Level (Consolidated Table)

Compiled from Blast's database publications, RPP Baseball, WIN Reality, and PBR event data. Ranges ≈ middle ~80% of each population.

| Metric | Youth | Middle School | HS JV | HS Varsity | College | MiLB | MLB |
|---|---|---|---|---|---|---|---|
| Bat speed (mph) | 40–56 | 46–62 | 53–67 | 57–71 | 61–73 | 63–75 | 66–78 |
| Peak hand speed (mph) | 17–23 | 18–24 | 19–25 | 20–26 | 21–27 | 22–28 | 23–29 |
| Time to contact (s) | 0.17–0.23 | — | — | 0.14–0.18 | 0.14–0.18 | 0.13–0.17 | 0.13–0.17 |
| Power (kW) | 0.9–2.5 | — | — | 2.8–4.1 | — | — | 3.8–5.7 |
| Vertical bat angle (°) | −15 to −25 | — | — | −21 to −31 | — | — | −25 to −35 |
| Rot. acceleration (g, avg) | — | — | — | — | ~12.9 | ~12.6 | ~15–17 |
| On-plane efficiency (%) | — | — | — | — | — | — | 68.6 avg / 70+ target |
| Attack angle (°) | +5 to +20 target at every level | | | | | | MLB contact typically +4 to +21 |

Anchors: college-bound HS hitters mostly sit 63–70 mph bat speed; a "good" 12-year-old is 48–56 mph; college hitters swing ~4 mph slower than pros and hit ~6 mph harder than HS hitters on average (Driveline). Statcast MLB game data: mean bat speed 71.5 mph, "fast swing" ≥75 mph, elite (Judge/Ohtani/Stanton tier) 78–80+.

**For Soto:** these become the seed rows of a `hitting` slice of the `league_averages` pattern — per (level, metric) 50th-percentile benchmarks that Neptune athlete dashboards can percentile against on day one, before we have enough in-house athletes to compute our own distributions. Replace with facility-native distributions once n > ~50 athletes per age band.

## 5. What Sensor Metrics Actually Predict

**Bat speed → exit velocity** is the cleanest link. In Driveline's 9,000-swing Blast×HitTrax pairing (42+ athletes), exit velocity rose with bat speed, power, peak hand speed, and rotation metrics, and fell with longer time-to-contact; launch angle correlated with attack angle (proven within-dataset). Rule of thumb: +1 mph bat speed ≈ +1.2 mph exit velo (promising). Barreled contact at EV > 95 mph and LA 10–25° produces >.600 BA and >1.500 SLG at the pro level (proven from Statcast populations).

**Attack angle → outcomes.** The Baseball Thought Experiments study (750 swings, Blast + Rapsodo, 35 hitters across two datasets): attack angle correlated +0.641 with bat speed, +0.507 with launch angle, +0.560 with distance, +0.392 with EV. Uppercut swings (+5° to +15°) hit .922–.954 in controlled settings vs .299–.340 for level (0–4°) and .122–.183 for negative attack angles, which produced 86–89% ground balls; 75% of top-decile bat-speed swings came at +12° to +23° attack angle (promising — controlled BP, not game data). Statcast's 2025 "ideal attack angle rate" (share of competitive swings at +5° to +20°) institutionalizes the same window at the MLB level.

**Rotational acceleration → level and adjustability.** Driveline: RA rises monotonically by level, "the most useful metric in forecasting a hitter's ability to perform at the Major League level"; hitters >13 g kept EV above personal average across a wider contact-depth window (deeper *and* further-out contact still hit hard) — i.e., RA proxies for sequencing quality and adjustability (promising; Driveline internal data, illustrative pro cases at 22.1 g vs 7 g).

**Composite swing quality → wOBA, partially.** Babson College study (20 NCAA players, 1,000 swings, 2017–18): Blast metrics explained 48–57% of wOBA variance. Power output and the composite "Blast Factor" predicted wOBA in both spring and fall models; **raw bat speed carried a negative coefficient** once other metrics were controlled, and on-plane % flipped sign between models (promising and cautionary — small n, but the direction matches Driveline's "no one-size-fits-all" clustering of 440+ MLB hitters, which found successful profiles ranging from Judge/Ohtani high-speed to Kwan/Betts slow-but-efficient; low bat speed mainly *constrains options* rather than dooming outcomes).

**2025 Statcast swing-path evidence:** on middle-middle four-seamers, hard-hit swings averaged 32° path tilt / +8° attack angle / 2° oppo direction vs whiffs at 35° / +3° / 12° oppo — at essentially identical bat speed (73.5 vs 73.6 mph). On low curveballs, whiffs showed +23° attack angle and 26° pull direction vs +9° and 5° on hard-hit balls. Translation: at the highest level, *swing direction/plane match to pitch* separates outcomes more than raw speed does (promising).

**For Soto:** the modeling lesson for any Triton hitting metric is to build a **two-axis model — capacity (bat speed / power / RA) and match (attack angle & direction vs. pitch plane and location)** — rather than a single swing score. That mirrors the Stuff+ vs Command split on the pitching side. Statcast bat-tracking columns (bat_speed, swing_length, squared_up, attack_angle, swing_path_tilt, attack_direction, from 2024+) are already in the public Statcast feed Triton ingests — worth adding to the `pitches` ingest and VARIABLES.md when hitting surfaces ship.

## 6. Blast vs Diamond Kinetics (and Where Statcast Fits)

**Blast Motion** — $149.95 sensor, 30-day premium trial, then Blast Connect subscription for premium tiers (swing quality scores, ball-flight pairing, team management, historical trends). Strengths: deepest metric set (rotational acceleration, early connection/connection at impact — unique to Blast), auto-edited video overlay, Blast iQ green/yellow/red coaching layer, Coach Mode multi-player capture, remote coaching. This is the de facto pro/college standard (official bat sensor of MLB historically; ubiquitous at PBR events and pro orgs).

**Diamond Kinetics SwingTracker** — $50–119 depending on bundle/subscription. Free tier: impact momentum, max acceleration, approach/attack angle, max barrel speed; subscription unlocks 11 metrics including applied power (W), max hand speed, speed efficiency, trigger-to-impact (ms), hand cast distance, distance-in-the-zone, and hand path. Unique metrics: **impact momentum** (bat-fit assessment — is this athlete's bat weight right?), **hand cast distance**, **distance in the zone**. Ecosystem: official MLB youth partnerships (MLB 1v9 challenges, "MLB Featured Player" lessons), USA Baseball, Perfect Game, PONY; gamified (Virtual Home Run Derby). In the one independent head-to-head, DK was *more* accurate than Blast on both speed ICC (0.81 vs 0.67) and angle (only sensor >0.8) (proven vs that study).

**Choosing:** Blast for assessment depth and the connection/rotation metrics that drive lesson design; DK for youth engagement, team-wide deployment on a budget, and bat fitting. They are not interchangeable numerically — different mount math, different measurement points (6 in. from tip vs 20% from tip), different biases (−16% vs −17% against mocap, but with different ICCs). Never mix vendors within one athlete's longitudinal record.

**Statcast bat tracking** (Hawk-Eye camera-based, 2024+) is the third leg: no sensor, game data only, MLB/AAA only. Definitions differ again — bat speed at the sweet spot averaged over "competitive swings," squared-up rate = actual EV ≥ 80% of max attainable EV given bat + pitch speed, blast = squared-up%×100 + bat speed ≥ 164, swing length = total XYZ barrel travel to contact. Use it as the free elite reference distribution, not as a sensor-comparable scale.

**For Soto / Neptune buy decision:** standardize on **Blast Gen 3 + Blast Connect team account** as the facility assessment tool (deeper metrics, coach workflows), and optionally hand **DK** to youth-program families as the at-home engagement layer. Budget: ~$150/sensor × cage count + team subscription; DK sensors ~$50–119 retail for the youth tier. Keep one bat + one sensor as the fixed "assessment rig" so longitudinal data is apples-to-apples.

## 7. Using Sensor Data in Lessons (Practitioner Playbook)

The consensus workflow across Blast's coaching material, RPP, and Driveline:

1. **Standardize capture.** Warm up first; log ≥10–20 swings per condition (tee and front toss separately); coach off the **session average, never single swings or peaks** (this is also what the validity data demands).
2. **Assess before prescribing.** Driveline's hitting assessment pairs Blast with mocap/K-Vest and HitTrax: swing metrics + batted-ball outcomes + body kinematics. At minimum, pair sensor + ball flight.
3. **Find the one red metric.** Blast iQ's PCR scores (Plane/Connection/Rotation, 20–80 scale, green/yellow/red) triage the swing. Fix one constraint at a time, verify the change in the next session's average, repeat.
4. **Map drill to metric** (Blast's published pairings, echoed by RPP):
   - Low on-plane efficiency → Shoulder Slot Drill, plane-awareness work.
   - Poor connection at impact → Stop-at-Contact Drill.
   - Low rotational acceleration → Torque Drill, Dead Legs Drill, offset-rotation work, long-bat/short-bat contrast, velocity-based challenges.
   - Low bat speed → overload/underload program (§8).
5. **Diagnose causally, not symptomatically.** RPP's example: bad attack angle + slow time-to-contact is often *downstream* of weak rotational acceleration — treat the cause. Driveline's sequencing work supports this: high RA co-occurs with proper pelvis→torso→lead-arm→hands sequencing, and RA correlates with shorter time-to-contact and higher hand speed.
6. **Reduce variability as objective #1.** RPP: "reducing variability in the swing should be the number one objective of every player" — track the standard deviation of attack angle/OPE across a session, not just the mean (plausible-to-promising; variance-reduction outcome studies don't exist yet).
7. **Context bins.** Driveline shows hitters change swing metrics by pitch speed, location, and contact depth — advanced lesson blocks should capture by bin (e.g., high-velo machine vs front toss) rather than pooling everything.

**For Soto:** this is the Neptune hitting-lesson product spine: intake assessment (20 swings tee + 20 front toss + ball flight) → PCR-style triage → one-constraint drill block → 2-week re-test. Build the re-test delta report in Triton (session-average deltas with error bars honoring §3's measurement noise — flag deltas < ~2 mph bat speed or < ~3° angle as within-noise).

## 8. Training Bat Speed (What Moves the Number)

- **Overload/underload swing training is the best-evidenced intervention** (proven): DeRenne et al.'s 12-week protocols (4 sessions/week, ~150 swings alternating bats within ±10–12% of game-bat weight) produced 6–10% bat-speed gains in collegiate hitters — the 10% batting-practice-group result remains the largest in the literature. Keeping loads within ±10–12% preserves bat-path mechanics while training speed.
- **Driveline's commercial implementation**: Barrel Load and Handle Load trainers at +20% and Underload at −20% of game weight, periodized (early-offseason capacity → late-offseason game-like constraint work → in-season maintenance at reduced volume). Used by MLB hitters (Betts, J.D. Martinez). Gains claims are program-level, not published with samples (promising).
- **Strength/physical drivers**: in 78 collegiate players, grip strength, back strength, and backward overhead medicine-ball throw correlated significantly (though weakly) with Blast-measured bat speed; general S&C reviews support lower-body/rotational power work as a bat-speed input (promising).
- **What not to chase**: the Babson data and Driveline's MLB clustering both warn that maximizing bat speed while degrading time-to-contact, plane match, or adjustability can *lower* game production. Train speed in the offseason, re-balance toward plane/match metrics pre-season (plausible synthesis).

**For Trevor specifically:** as a content/coaching-credibility athlete rather than a competing hitter, the interesting personal experiment is the classic Driveline-style 6–12-week overload/underload block with a fixed Blast rig — the 6–10% expected gain is large enough to be a compelling documented arc on camera, and the session-average protocol makes it honest.

## 9. Limitations & Failure Modes (Read Before Trusting Any Number)

1. **Absolute values are biased low** (−5% to −17% vs mocap depending on sensor) and vendor scales disagree with each other and with Statcast. Only within-athlete, same-rig trends are decision-grade (proven).
2. **Angle metrics are the least valid** (mean ICC 0.58); single-swing attack angle/VBA readings can be badly wrong. Session averages of ≥10 swings only (proven).
3. **Accuracy degrades at elite bat speeds** (>~67 mph) via accelerometer saturation — exactly the population (pro hitters) where precision matters most (proven in one small study).
4. **No contact-point or contact-quality information.** A sensor can't distinguish a flush barrel from a foul tip; "impact" metrics are inferred from deceleration signatures. Always pair with ball flight for outcome truth (proven by construction).
5. **Air swings ≠ ball swings.** Blast supports air-swing training, but swing metrics shift with intent, pitch speed, and contact depth (Driveline's binned data), so dry-swing numbers shouldn't be benchmarked against live numbers (promising).
6. **Composite scores are redundant with raw metrics** — fine for athletes, information-losing for analysts (proven in Driveline's 9k-swing check).
7. **Metrics ≠ outcomes**: ~half of wOBA variance at best is captured; approach, pitch recognition, and timing live outside the sensor (proven in the small Babson sample; directionally certain).
8. **Vendor benchmark drift**: Blast has published MLB rotational acceleration as both 15.1 g and 16.8–17 g in different materials — pin benchmark tables to a dated source and version them (proven inconsistency).
9. **"Swing plane" is a modeling fiction** — the barrel traces a 3-D arc, not a plane; on-plane efficiency is a useful scalar of a simplification, and Driveline has cautioned against coaching hitters to a literal plane (plausible-to-promising critique).
10. **Youth caution**: benchmark ranges below HS come from self-selected sensor users (skews toward trained athletes); percentiles for a 10-year-old walk-in will run below the published "youth 40–56 mph" band (plausible).

## Sources

1. Blast Motion — Metric Definitions (Baseball), Blast Connect Training Center. https://blastconnect.com/training_center/baseball/metrics/baseball-swing
2. Blast Motion — Baseball Swing Metrics Explained: The Complete Guide. https://blastmotion.com/blog/baseball-swing-metrics-explained/
3. Blast Motion — What Is On-Plane Efficiency in Baseball? https://blastmotion.com/blog/what-is-on-plane-efficiency-in-baseball/
4. Blast Motion — What Is Bat Speed in Baseball? Age Benchmarks. https://blastmotion.com/blog/what-is-bat-speed-in-baseball/
5. Blast Motion — Baseball Swing Analysis Metrics Coaches Should Track First. https://blastmotion.com/blog/baseball-swing-analysis-metrics-coaches-should-track-first/
6. Blast Motion — Blast Motion vs Diamond Kinetics: Honest Comparison. https://blastmotion.com/blog/blast-motion-vs-diamond-kinetics-comparison/
7. Blast Motion Store — Blast Baseball sensor ($149.95). https://store.blastmotion.com/store/products/baseball/
8. Morishita, Y. & Jinji, T. (2022). Accuracy and Error Trends of Commercially Available Bat Swing Sensors in Baseball. *Sports* 10(2):21. https://doi.org/10.3390/sports10020021 (PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC8879135/)
9. *Sports Biomechanics* (2025). Accuracy of a bat-mounted sensor for the measurement of bat speed among elite female cricket players. https://www.tandfonline.com/doi/full/10.1080/14763141.2025.2549136
10. RPP Baseball — A Review of Blast Motion Baseball and Its Swing Quality Metrics. https://rocklandpeakperformance.com/a-review-of-blast-motion-baseball-and-its-swing-quality-metrics/
11. Driveline Baseball — Rotational Acceleration, Sequencing, and the Swing (2020). https://www.drivelinebaseball.com/2020/06/rotational-acceleration-sequencing-and-the-swing/
12. Driveline Baseball — Pairing Blast and HitTrax Data (2019). https://www.drivelinebaseball.com/2019/02/pairing-blast-hittrax-data/
13. Driveline Baseball — Using MLB Bat Tracking Data to Better Understand Swings (2024). https://www.drivelinebaseball.com/2024/07/using-mlb-bat-tracking-data-to-better-understand-swings/
14. Driveline Baseball — The Complete Guide to Driveline Bat Speed Trainers (2025). https://www.drivelinebaseball.com/2025/02/the-complete-guide-to-driveline-bat-speed-trainers/
15. Diamond Kinetics — The Bat Sensor (technology + metric list). https://www.diamondkinetics.com/technology
16. MLB.com — What You Need to Know About Statcast Bat Tracking (2024). https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
17. MLB.com — New Statcast Metrics Measure Swing Path, Attack Angle, Attack Direction (2025). https://www.mlb.com/news/new-statcast-swing-metrics-2025
18. FanGraphs — Test Driving Statcast's Newest Bat Tracking Metrics (2025). https://blogs.fangraphs.com/test-driving-statcasts-newest-bat-tracking-metrics/
19. Baseball Thought Experiments — Baseball Bat Attack Angles and Their In-Game Correlations (2021). https://baseballtheory.com/2021/07/28/baseball-bat-attack-angles-and-their-in-game-correlations/
20. FanGraphs Community — Blast Motion Sensor: Correlation to On-Field Performance and How to Utilize It (Babson College study). https://community.fangraphs.com/blast-motion-sensor-correlation-to-on-field-performance-and-how-to-utilize-it/
21. WIN Reality — Bat Speed by Age: Average MPH for Youth, HS & College Hitters. https://winreality.com/blog/bat-speed-by-age/
22. DeRenne, C. et al. — Overload/underload bat training literature (via Contributing Factors for Increased Bat Swing Velocity). https://www.researchgate.net/publication/26294276_Contributing_Factors_for_Increased_Bat_Swing_Velocity
23. Strength and Conditioning Programs to Increase Bat Swing Velocity for Collegiate Baseball Players (2023). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10610610/
24. Prep Baseball Report — Blast Motion event analyses (RA level averages). https://www.prepbaseballreport.com/news/PBR/2023-PBR-Future-Games-Rotational-Acceleration-Leaders-8916740523
25. Driveline Baseball — Using Swing Plane to Coach Hitters: A Deeper Look (2018). https://www.drivelinebaseball.com/2018/05/using-swing-plane-coach-hitters-deeper-look/
