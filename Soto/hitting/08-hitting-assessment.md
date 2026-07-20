---
title: Hitting Assessment — Intake Battery, Benchmarks, and Constraint Diagnosis
domain: hitting
tags:
  - hitting-assessment
  - bat-speed
  - exit-velocity
  - swing-decisions
  - force-plates
  - vision-screening
  - benchmarks
  - facility-operations
sources_reviewed: 29
last_updated: 2026-07-19
---

# Hitting Assessment — Intake Battery, Benchmarks, and Constraint Diagnosis

## TL;DR

- **Every hitter's problem lives in one of three buckets — output (how hard), contact (how flush), or decisions (at what) — and the intake battery exists to identify which one is the binding constraint.** Driveline's KPI research found bat speed *outpaces every exit-velo metric* in explaining wOBACON, and top-8th EV is the most year-to-year reliable batted-ball metric, so the battery must measure all three buckets independently (proven).
- **Bat speed benchmarks (Blast Motion, millions of swings): MLB 66–78 mph, college 61–73, HS varsity 57–71, middle school 46–62, youth 40–56.** Statcast (2024+) puts the MLB average competitive swing at ~71.5 mph with a 75+ mph "fast swing" threshold hit on ~22% of swings; the Arraez-to-Stanton spread is ~62–81 mph (proven).
- **Exit velocity by age (TrackMan BP, competitive amateur sample): age-14 percentiles run 64/70/76/82 mph (25th/50th/75th/90th), bands are ~4–6 mph apart, and a hitter holding his percentile gains ~20 mph from 14 to 18** — with the single biggest annual jump (6–8 mph) at 14→15, riding the post-PHV strength spurt. D1 recruiters want 90+ tee/BP EV; MLB Draft Combine max EV averages ~96 (promising — sample skews toward college-bound athletes).
- **A +1 mph gain in bat speed ≈ +1.2 mph exit velocity; smash factor = 1 + (EV − BatSpeed)/(PitchSpeed + BatSpeed) separates the output constraint from the contact constraint on the same swing** (proven, Alan Nathan collision physics). A hitter with elite bat speed and mediocre EV has a contact-quality problem, not a power problem.
- **Force plates earn their spot for hitters: CMJ peak power correlated r = 0.30–0.52 with bat speed and EV across 55 professional hitters (Nationals org, 2023–24), and rotational med-ball throw velocity correlated r = 0.65 with bat speed (39% of variance) in D3 collegians** (promising). Stride-foot *horizontal* GRF — not just vertical — drives energy inflow to the torso (promising, n=30 collegiate).
- **Decisions are measurable and trainable: Driveline's Swing Decision+ scales run-value-based decision grades to a 100-average scale (2018 MLB leader: 141); BP's SEAGER hits a 0.41 weighted correlation with *next-season* ISO from swing decisions alone** (promising). Video-occlusion pitch-recognition training and vision work have real signal — a 6-week vision program preceded Cincinnati's team BA jumping .251 → .285 (plausible — uncontrolled).
- **Vision screening belongs in intake, not in the "nice-to-have" pile:** pro hitters average ~20/12 acuity (college ~20/15), visual reaction time positively associated with BA in 92 pros with 100+ ABs, and Vizual Edge's Edge Score (MLB draft average ~80/100) tracks with plate discipline, OBP, and hard-hit% (promising).
- **Re-assess on a 6–8 week block cadence with identical protocols** (same machine speed, distance, ball type, sensor placement) and report on the 20–80 scout scale plus percentile-vs-level — Blast already scores Plane/Connection/Rotation on 20–80 calibrated by level (50 = average, 60+ = top 16%, 70+ = top 2%) (proven as practice standard).
- **Full battery hardware for a facility is achievable at ~$30–60K:** HitTrax ~$20K + subscription, Blast sensors ~$150/ea, dual force plates (Hawkin purchase/lease; VALD is lease-only 3-yr bundles), Rapsodo hitting ~$3K as the budget batted-ball option, TrackMan ~$30K at the top end — which Neptune already owns via Compete (proven pricing, 2024–25).

## 1. The Constraint Model: Output vs. Contact vs. Decisions

The organizing principle of the entire assessment is that offensive production decomposes into three semi-independent skills, and training resources should flow to the *binding constraint*, not to whatever drill is fashionable:

1. **Output** — how fast the barrel moves and how hard the ball *can* leave. Measured by bat speed, top-8th EV, and the physical engine underneath (force plate power, rotational power, anthropometrics).
2. **Contact** — how efficiently bat speed converts to exit velocity. Measured by smash factor / squared-up rate, EV standard deviation, barrel-consistency, and contact-point data.
3. **Decisions** — whether the swing is deployed at pitches worth hitting. Measured by swing-decision grades against tracked pitch locations, chase/z-swing splits, and upstream perceptual skills (vision, pitch recognition).

This mirrors what the best public research says matters. Driveline's KPI study on Statcast data found that **mean bat speed explains more variance in wOBACON than any exit-velocity aggregate**, and that **top-8th EV (average of the 8 hardest-hit balls) is the most reliable year-to-year batted-ball metric** — their bottom line: "if you are going to track one thing, track bat speed" (proven, large Statcast sample). Meanwhile Robert Orr's SEAGER work at Baseball Prospectus shows swing decisions alone carry a **0.41 weighted correlation with next-season ISO** — and that the *quality of takes* matters more than the quality of swings (promising). These are different skills with different training answers, which is exactly why the intake must isolate them.

The decomposition also has a clean physics seam. Alan Nathan's collision model gives:

- **Smash factor = 1 + (EV − BatSpeed) / (PitchSpeed + BatSpeed)** — collision efficiency at contact.
- **Every +1 mph of bat speed ≈ +1.2 mph of exit velocity** when contact quality is held constant (proven).

So a hitter whose bat speed is 70th percentile for his level but whose EV is 40th percentile has a **contact** constraint. A hitter whose EV tracks his bat speed but whose bat speed is 30th percentile has an **output** constraint. A hitter with good numbers in the cage and a 30% strikeout rate in games has a **decisions/perception** constraint (or a timing constraint, which lives between contact and decisions and shows up in machine-velocity ramp testing).

**For Soto:** this three-bucket constraint label — `output | contact | decisions` — should be a first-class field on the Neptune athlete record in Triton, set at intake and re-evaluated every re-assessment. It's the single most important routing decision the facility makes per athlete, and it makes every downstream program template selectable by rule rather than by vibes.

## 2. Intake Battery Design: Station-by-Station

The reference design is Driveline's hitting assessment, which has converged after ~8 years of iteration into a multi-day battery (proven as the industry-standard template):

1. **Standardized batted-ball session** — 40–50 swings off a machine at fixed distance and velocity, with HitTrax (or TrackMan/Rapsodo) collecting every batted ball, a Blast sensor on the bat, K-Vest capturing swing biomechanics, and Edgertronic high-speed video (600 fps) on contact.
2. **Physical screen** — PT/movement screening plus a strength-power assessment on dual force plates (Driveline uses ForceDecks): maximal strength, explosive strength, reactive ability.
3. **Biomechanics capture** — motion-capture (or K-Vest as the field-grade proxy): kinematic sequence, segment rotational velocities, joint angles, posture.
4. **Contact-quality and swing-design work** — smash factor evaluation, contact-point mapping, launch-angle windows.
5. **Report + goal-setting meeting** — trainer reviews all data, identifies "low-hanging fruit," sets numeric goals on a timeline (e.g., "top-8th EV from 94 → 97 mph in 6 weeks").

A practical single-visit Neptune version (90–120 min/athlete, two athletes can interleave stations):

| Station | Time | Tech | Primary outputs |
|---|---|---|---|
| Anthropometrics + health intake | 10 min | scale, stadiometer, grip dynamometer | height/weight, grip strength L/R, injury history, training age |
| Mobility screen | 15 min | goniometer or app | hip IR/ER, thoracic rotation, ankle DF, shoulder ROM, single-leg balance |
| Force plate battery | 15 min | dual force plates | CMJ height + peak power, squat jump, isometric mid-thigh pull or push, L/R asymmetry |
| Rotational power | 5 min | radar or plate | rotational med-ball throw velocity (both sides), shot-put throw distance |
| Vision screen | 10 min | Vizual Edge or equivalent | Edge Score components: convergence, divergence, depth, tracking, recognition, alignment |
| Tee + front-toss EV block | 15 min | HitTrax/TrackMan + Blast | max/avg tee EV, top-8th EV, LA distribution, bat speed, attack angle, rotational acceleration |
| Machine block (standardized velo) | 20 min | machine + HitTrax + Blast | in-flight EV, smash factor, squared-up%, EV stdev, contact-depth, whiff% at fixed velo |
| Decisions block | 10 min | machine random ball/strike or occlusion app | swing/take grading vs. zone, chase%, recognition score |
| Debrief scheduling | 5 min | — | report delivered within 48 h |

Two design rules matter more than the station list:

- **Standardization beats richness.** EV is sensitive to capture technology and context (tee vs. front toss vs. machine vs. live) — a 5–10 mph gap between tee max and game EV is typical (proven). Pick one machine velocity per age band, one distance, one ball, and never change them, or longitudinal comparisons are garbage.
- **Separate "capacity" tests from "skill" tests.** Tee max EV is a capacity test (no timing demand). Machine EV at game-relative velocity is a skill test. The gap between them is itself diagnostic: big gap → timing/contact constraint; no gap but low absolute numbers → output constraint.

**For Soto:** the Compete pipeline already ingests TrackMan CSVs; the intake battery should write to a `compete_hitting_assessments` table keyed to athlete + date + protocol version, with the protocol config (machine velo, distance, ball type) stored on the row so re-assessments are provably comparable.

## 3. Benchmark Tables

### 3.1 Bat speed (Blast Motion sensor, avg competitive swing, mph) (proven — Blast's multi-million-swing database)

| Level | Bat speed | Peak hand speed |
|---|---|---|
| Youth | 40–56 | 17–23 |
| Middle school | 46–62 | 18–24 |
| HS JV | 53–67 | 19–25 |
| HS varsity | 57–71 | 20–26 |
| College | 61–73 | 21–27 |
| MiLB | 63–75 | — |
| MLB | 66–78 | 23–29 |

Notes: college-bound HS hitters cluster 63–70 mph *average* (consistency matters more to recruiters than one peak). Statcast measures bat speed differently (6 in. from the head, competitive swings only): 2024 MLB average ~71.5 mph, two-thirds of swings between 68–77, "fast swing" = 75+ (22% of swings), average swing length 7.3 ft. Do not mix Blast and Statcast bat-speed numbers in one table for athletes — the measurement point differs.

### 3.2 Exit velocity by age (TrackMan BP, competitive amateur sample — Eisenmann) (promising — sample skews college-bound)

| Age | 25th | 50th | 75th | 90th |
|---|---|---|---|---|
| 14 | 64 | 70 | 76 | 82 |
| 15 | ~70 | ~76 | ~82 | ~88 |
| 16 | ~75 | ~81 | ~86 | ~92 |
| 17 | ~78 | ~85 | ~90 | ~96 |
| 18 | ~84 | ~89 | ~95 | ~102 |

(Ages 15–17 interpolated from the reported ~4–6 mph band spacing and ~20 mph four-year gain; largest single-year jump is 14→15 at 6–8 mph.) Recruiting/pro shorthand: 88–92 mph at 16U gets mid/high-major D1 attention; 92–95+ at 17–18 is top-D1/draft territory; MLB Draft Combine max EV averages ~96; college game range 90–105; MLB max EVs 100–120+ (promising — practitioner consensus, not peer-reviewed).

### 3.3 Swing-quality metrics (Blast / Statcast) (proven)

| Metric | Average | Target / elite |
|---|---|---|
| Attack angle | MLB Statcast avg ~10° | 5–20° "ideal" band; MLB hits it on 51.5% of swings; Driveline targets 4–20° |
| On-plane efficiency (Blast) | MLB ~68.6% | 70%+ |
| Rotational acceleration (Blast) | MLB ~15.1 g | higher = better sequencing, more decision time |
| Squared-up rate (Statcast) | ~⅓ of batted balls | — |
| Smash factor | — | 1.2 ± 0.2 vs. optimal; flush wood-bat contact ceiling |
| Blast 20–80 scores (Plane/Connection/Rotation) | 50 = level average | 60 = top 16%, 70 = top 2% |

### 3.4 Kinematic sequence (K-Vest, pro ranges, °/s) (promising — vendor/practitioner norms)

| Segment | Peak rotational velocity | Order |
|---|---|---|
| Pelvis | 490–760 | 1st |
| Torso | 760–1150 | 2nd |
| Lead arm | 970–1360 | 3rd |
| Hands | 1530–2230 | 4th |

Sequence quality = each segment peaking *in order* with gains between segments; a hitter inside the ranges but out of order has a sequencing (efficiency) problem, one in order but below range has an engine (output) problem.

**For Soto:** these tables are exactly the shape of Triton's `league_averages` pattern — store as (level, metric, percentile) rows and render intake reports as percentile-vs-level bars, the same visual grammar as the pitching dashboard. Publish protocol-specific Neptune norms once n > ~50 athletes per age band and stop leaning on internet tables.

## 4. The Output Constraint: Force Plates and the Physical Engine

Evidence that general force/power capacity transfers to swing output is now decent:

- **CMJ force-plate metrics vs. hitting output:** 55 professional hitters (Washington Nationals org, 2023–24 seasons); all CMJ metrics correlated with hitting outputs, **peak power strongest at r = 0.298–0.523** (promising — single-org doctoral study, but the best in-context sample publicly available).
- **Rotational med-ball throw velocity:** r = 0.65 with bat swing velocity (39% of variance explained) in 35 NCAA D3 players (promising, JSCR 2021). This is the cheapest high-signal output test in the battery — a radar gun and a 6–8 lb ball.
- **Lower-extremity capacity predicts MLB performance:** Teske et al. 2021 (OJSM) linked lower-extremity biomechanics to MLB player performance; broader combine work finds lean mass, grip strength, sprint speed, and lower-body power correlate with baseball-specific outputs (promising).
- **Force plates during the swing itself:** a 2023 study of 30 collegiate hitters found **stride-foot *horizontal* GRF variables significantly correlated with mechanical energy inflow to the lower torso from the hip** — i.e., the braking/rotary action of the front leg, not raw vertical force, is the transfer variable (promising). Force-time *curve* characteristics beat instantaneous peaks for explaining EV (plausible — small samples). Bertec sells a purpose-built dual-plate "swing station" for in-swing GRF, but for intake purposes standard jump/IMTP testing on generic dual plates covers the output bucket; in-swing plates are a phase-2 luxury.
- **What doesn't work:** assisted/overspeed hip-rotation devices showed **no effect on bat velocity** in controlled testing (debunked). Buy general force, rotational power, and bat-speed-specific overload/underload work (Driveline's Axe trainers) instead.

Practical output flags at intake: CMJ peak power below level norm, >10% L/R asymmetry, rotational med-ball velo below norm on the swing side, bat speed percentile ≥15 points below EV percentile's expectation. Any of these routes the athlete to the weight room as the primary intervention, with swing work maintained but not emphasized.

**For Soto:** for Trevor personally — post-career, the output bucket is the one that decays first and responds fastest; a quarterly CMJ + med-ball + bat-speed micro-battery is a 20-minute habit that keeps demos and content credible, and doubles as the walkthrough content for Neptune's assessment product.

## 5. The Contact Constraint: Smash Factor, Squared-Up, and Consistency

Contact quality is the conversion layer between bat speed and results, and it needs its own metrics because it improves through different means (contact-point training, plane matching, vision/timing) than output does.

- **Smash factor** (Nathan): flush contact converts bat speed to EV at the physical ceiling; mishits leak 5–15+ mph. Driveline built a whole "data-driven hit tool" assessment on it (proven physics; promising as an assessment construct). Wood COR ≈ 0.50 vs. metal 0.55 / composite 0.60 — another reason to standardize the bat used at intake.
- **Squared-up rate** (Statcast 2024): EV achieved vs. EV possible given bat + pitch speed; MLB hitters square up ~⅓ of batted balls. This is the game-level cousin of smash factor and directly computable from any system that captures both bat speed and EV (proven).
- **Consistency metrics:** EV standard deviation, hard-hit%, barrel-consistency, and **EV within launch-angle windows** (Driveline reports EV in LA bands, plus the LA of the hardest-hit balls). A hitter whose top-8th EV is fine but whose EV stdev is huge is a contact case, not an output case.
- **Attack angle diagnostics:** Statcast's 2025 swing-path release added attack angle, attack direction (horizontal), and swing-path tilt at the league level — MLB average attack angle ~10°, ideal-attack-angle rate 51.5%. Attack angle is also a *timing* readout: the same swing produces a higher attack angle deeper in the zone. Blast's on-plane efficiency (70%+ target) measures how long the barrel lives on the pitch plane — the "room for error" metric vs. offspeed (proven measurement; promising as training target).
- The Babson College Blast study (20 hitters, 1,000 swings) is a useful caution: swing metrics explained ~48–57% of wOBA variance, and **bat speed alone had a *negative* coefficient in-model** — hitters succeed at many bat speeds when contact and decisions are good (promising; small n). Assessment must never collapse to a single leaderboard number.

Contact flags at intake: smash factor ≥0.15 below optimal at standardized machine velo, EV stdev in the bottom third for level, big tee-to-machine EV falloff, attack angle outside 4–20° or achieved-ideal rate far below 50%, contact-depth chart clustered deep/late.

**For Soto:** smash factor and squared-up rate are directly computable in the Compete pipeline wherever Blast bat speed and TrackMan EV coexist on a session — that's a facility-differentiating metric Triton can ship as a single SQL view plus a report tile.

## 6. The Decisions Constraint: Swing Decisions and the Perceptual Stack

The decisions bucket has two layers: the *choice* (swing/take vs. pitch value) and the *perception machinery* underneath it (vision, pitch recognition).

**Swing-decision grading.** Driveline's framework models intrinsic run value of swing vs. take by location/count from Statcast (2015–18, hitters with 100+ BIP), producing Swing Run Differential heatmaps and ultimately **Swing Decision+** — centered at 100, 2018 MLB leader at 141, worst at 54 — individualized to each hitter's "nitro zones" and zone-contact skill (promising). Rob Orr's **SEAGER** (Selective Aggression) at BP goes further: it credits both laying off non-damageable pitches *and* attacking hittable ones, correlates 0.41 (weighted) with next-season ISO, and beats chase rate and Z-O swing on both current and future production — with the striking sub-finding that **take quality predicts better than swing quality** (promising). Facility translation: run a machine or occlusion block with randomized locations, log swing/take vs. a zone map, and grade decisions against a damage model rather than the rulebook zone.

**Vision screening.** The base rates justify a 10-minute screen: pro hitters average ~20/12 static acuity vs. ~20/15 for collegians; in 213 screened pros, visual reaction time was positively associated with BA among the 92 with 100+ ABs; superior visuo-motor scores link to higher OBP and lower K/BB rates in pros (promising). Vizual Edge's Edge Score (0–100 composite of six skills; MLB draft prospect average ~80 across 20,000+ scores) tracks with plate discipline, hard-hit%, and OBP, and MLB clubs buy it for draft work (promising — vendor-published, but with an unusually deep longitudinal dataset). The screen's first job is triage: catching an uncorrected acuity/convergence problem in a 14-year-old is the cheapest performance win in the building.

**Training the bucket.** Video-occlusion pitch-recognition training (GameSense model: pitches cut off in flight, athlete calls type + ball/strike) improves recognition accuracy with positive transfer reported to batting outcomes (promising). Dynamic vision training transferred positively to batting-practice performance in collegiate hitters in a controlled design (promising, Liu et al. 2020). The famous Cincinnati result — team BA .251 → .285 the season after 6 weeks of vision training — is real but uncontrolled; grade it (plausible) and don't sell it as causal. VR platforms (WIN Reality) package occlusion + count-scenario reps; treat them as engagement multipliers on a proven training principle rather than proven products themselves (plausible).

Decision flags at intake: recognition/occlusion score below age norm, Edge-style composite in the bottom quartile, chase rate high with in-zone take rate also high (passive-and-wrong is the worst quadrant), cage numbers that dwarf game production.

**For Soto:** Triton already has the Statcast pitch database and run-value machinery to build a Driveline-style Swing Run Differential grid in-house — the same intrinsic-run-value approach used for pitching metrics, flipped to the batter's seat. That's the analytical spine for a Neptune "decision score" that no commodity cage can copy.

## 7. Mobility and Movement Screen

The mobility screen is a modifier, not a fourth bucket — it explains *why* an output or sequencing deficit exists and flags injury risk:

- **Hip IR/ER both sides, thoracic rotation (lumbar-locked), ankle dorsiflexion, shoulder ROM, single-leg balance.** Practitioner benchmarks put controlled thoracic rotation at ~45–60° per side, with symmetry loosely associated with higher EV (plausible — weak sourcing; treat as screening heuristic, not KPI).
- Trunk/hip rotation capacity relates to rotational velocity ceilings (max hip rotation ~714°/s occurs just after foot-down in batting), and restricted hips push stress to the lumbar spine (plausible-to-promising).
- Grade asymmetries and pair them with force-plate L/R data; the combination (e.g., lead-hip IR deficit + weak stride-leg braking force) is more diagnostic than either alone (plausible).
- Keep it short (15 min) and standardized; a full PT eval is a referral pathway, not an intake station.

## 8. Re-Assessment Cadence and Reporting

**Cadence:** 6–8 week training blocks with full re-assessment at each block boundary is the converged industry practice (Driveline writes goals as "X → Y in 6 weeks") (proven as practice standard). In-block, cheap high-frequency monitors ride along automatically: every Blast swing and every HitTrax session is monitoring data. Rank metric stability the way Driveline's KPI work does — **top-8th EV and mean bat speed are the most reliable, single-session max EV the least** — and set goals only on stable metrics (proven).

**Minimum detectable change discipline:** with 40–50 standardized swings per session, treat <1.5 mph EV and <1 mph bat-speed movement as noise; report percentile movement, not raw decimals, to parents (plausible — measurement-error heuristic).

**Report design (one page, then appendix):**
1. **Headline: constraint label** (output / contact / decisions) with a one-sentence rationale.
2. **20–80 scores or percentile-vs-level bars** for: bat speed, top-8th EV, smash factor/squared-up, attack-angle band%, decision score, CMJ peak power, mobility flags. Blast's level-calibrated 20–80 Plane/Connection/Rotation scores drop straight in.
3. **Two or three numeric block goals** with dates (e.g., "top-8th EV 94 → 97 by Sep 1").
4. **The program it triggers** — every constraint label maps to a named template.
5. Appendix: full metric table, trend charts vs. prior assessments, raw session links.

**For Soto:** report generation is a Triton Reports-Builder job — assessment rows in, dark-theme one-pager out, with the trend chart reusing the existing percentile-bar components. The re-assessment diff ("what moved since last block") is the retention product for a facility charging development-lab prices; automate it so a coach spends 10 minutes annotating, not 2 hours assembling.

## 9. Tech Stack and Budget (Neptune Buildout)

| Tier | Stack | Approx. cost | Covers |
|---|---|---|---|
| Minimum viable | Blast sensors (~$150/ea) + Rapsodo hitting (~$3K) + med ball + radar + goniometer | <$6K | bat speed, EV/LA, rotational power, mobility |
| Development lab (recommended) | + HitTrax (~$20K + subscription) + dual force plates (Hawkin — purchase or lease, cheapest pro-grade; VALD ForceDecks is lease-only 3-yr bundles) + Vizual Edge subscriptions + occlusion app | ~$30–45K | adds smash factor, spray/contact-point, jump battery, vision, decisions |
| Full | + TrackMan (~$30K — already owned via Compete) + K-Vest + Edgertronic high-speed | ~$60–90K | adds kinematic sequence, contact-frame video, pro-grade ball flight |

Sequencing note for Neptune: TrackMan in hand means the batted-ball layer is already pro-grade; the highest-leverage next purchases are **dual force plates + Blast team kit + a vision/occlusion subscription**, because they complete all three constraint buckets. K-Vest/mocap is the last mile — it explains *how* to fix a sequencing problem the cheaper layers have already detected.

## Sources

1. Driveline Baseball — What is a Driveline Hitting Assessment? (2021) — https://www.drivelinebaseball.com/2021/04/driveline-hitting-assessment/
2. Driveline Baseball — An Introduction to Driveline Hitting Assessments (2018) — https://www.drivelinebaseball.com/2018/10/introduction-driveline-hitting-assessments/
3. Driveline Baseball — Driveline Hitting KPIs (2019) — https://www.drivelinebaseball.com/2019/12/driveline-hitting-kpis/
4. Driveline Baseball — Quantifying Swing Decisions: An Individualized Approach (2019) — https://www.drivelinebaseball.com/2019/07/quantifying-swing-decisions-an-individualized-approach/
5. Driveline Baseball — Smash Factor: A Data-Driven Approach to Assessing the Hit Tool (2021) — https://www.drivelinebaseball.com/2021/02/smash-factor-a-data-driven-approach-to-assessing-the-hit-tool/
6. Blast Motion — What Is Bat Speed in Baseball? Age Benchmarks — https://blastmotion.com/blog/what-is-bat-speed-in-baseball/
7. Blast Connect Training Center — Bat Speed / Peak Hand Speed norms — https://blastconnect.com/training_center/item/197
8. Blast Motion — What Is On-Plane Efficiency in Baseball? — https://blastmotion.com/blog/what-is-on-plane-efficiency-in-baseball/
9. WIN Reality — Bat Speed by Age — https://winreality.com/blog/bat-speed-by-age/
10. Joe Eisenmann, PhD — Exit Velocity: Benchmarks for 14–18 Year Old Competitive Hitters — https://joeeisenmann.substack.com/p/exit-velocity-benchmarks-for-14-18
11. MLB.com — What you need to know about Statcast bat tracking (2024) — https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
12. MLB.com — New Statcast metrics measure swing path, attack angle, attack direction (2025) — https://www.mlb.com/news/new-statcast-swing-metrics-2025
13. MLB.com Glossary — Ideal Attack Angle — https://www.mlb.com/glossary/statcast/ideal-attack-angle
14. Baseball Savant — Statcast Bat Tracking Leaderboard — https://baseballsavant.mlb.com/leaderboard/bat-tracking
15. Baseball Prospectus (Rob Orr) — Quantifying the Corey Seager Approach (SEAGER) — https://www.baseballprospectus.com/news/article/86572/the-crooked-inning-corey-seager-rangers/
16. FanGraphs Community — Blast Motion Sensor: Correlation to On-Field Performance (Babson study) — https://community.fangraphs.com/blast-motion-sensor-correlation-to-on-field-performance-and-how-to-utilize-it/
17. Liberty University doctoral dissertation — CMJ Force Plate Metrics and Hitting Performance in Professional Baseball (Nationals, 55 hitters, 2023–24) — https://digitalcommons.liberty.edu/doctoral/7581/
18. JSCR (2021) — Rotational Medicine Ball Throw Velocity Relates to NCAA D3 Bat Swing, Batted Ball, and Pitching Velocity — https://pubmed.ncbi.nlm.nih.gov/34570055/
19. ResearchGate — Bat Swing Ground Reaction Force Characteristics & Ball Exit Velocity in Collegiate Baseball Players — https://www.researchgate.net/publication/326557729
20. Bertec — 5 Ways Coaches Use Force Plate Data to Build Better Swings — https://www.bertec.com/blog/5-ways-coaches-use-force-data-to-build-better-swings
21. Teske et al. (2021), OJSM — Lower Extremity Biomechanics Predicts MLB Player Performance — https://journals.sagepub.com/doi/10.1177/23259671211015237
22. Clark JF et al. (2012), PLOS One — High-Performance Vision Training Improves Batting Statistics for University of Cincinnati Baseball Players — https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0029109
23. Laby DM et al. — The Visual Function of Professional Baseball Players — https://www.sciencedirect.com/science/article/abs/pii/S0002939414721063
24. Liu S et al. (2020) — Dynamic vision training transfers positively to batting practice performance among collegiate baseball batters — https://www.sciencedirect.com/science/article/abs/pii/S1469029220301333
25. Vizual Edge — Performance of MLB Hitters / Edge Score draft data — https://vizualedge.com/performance-of-major-league-baseball-hitters/
26. GameSense Sports — Occlusion vs Full View Pitch Recognition Training — https://gamesensesports.com/occlusion-vs-full-view-pitch-recognition-training-for-ballplayers/
27. RPP Baseball — 3 Questions When Analyzing Kinematic Sequence with K-Vest — https://rocklandpeakperformance.com/3-questions-when-analyzing-kinematic-sequence-k-vest-baseball/
28. Baseball Tips — Baseball Hitting Technology Guide: Rapsodo, HitTrax pricing — https://baseballtips.com/baseball-hitting-technology-guide/
29. NIH/PMC — No Effect of Assisted Hip Rotation on Bat Velocity — https://pmc.ncbi.nlm.nih.gov/articles/PMC5955329/
