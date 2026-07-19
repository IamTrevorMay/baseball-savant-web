---
title: Swing Decisions & Approach — Metrics, Recognition Training, and Cage Design
domain: hitting
tags:
  - swing-decisions
  - plate-discipline
  - pitch-recognition
  - seager
  - occlusion-training
  - approach-by-count
  - cage-design
sources_reviewed: 24
last_updated: 2026-07-19
---

# Swing Decisions & Approach — Metrics, Recognition Training, and Cage Design

## TL;DR

- **Swing decisions are the third pillar of Driveline's hitting "Big 3"** (bat speed, bat-to-ball, decisions), and value-model metrics beat raw chase rate: Robert Orr's SEAGER carries a weighted correlation of **.41 with next-season ISO** from swing decisions alone, outperforming both Z-O Swing% and chase rate for power prediction (promising).
- **The take side is where the signal lives.** Nestico's XGBoost decision-value model predicts run value on takes with **RMSE 0.045 vs 0.294 on swings** — you can grade a take almost perfectly from location + count, while swing outcomes need bat speed/contact context. Multiple modelers converge on the same conclusion: avoiding bad swings matters more than swinging at strikes (promising).
- **Pitch recognition is trainable and transfers.** A season-long college video-occlusion program moved team BA **.286 → .326 (+14%)**, runs/game **5.8 → 8.6 (+48%)**, and BB/K **0.50 → 0.77 (d = 0.953, p = .017)**; a University of Cincinnati protocol produced **+.030–.050 BA from ~10 min/day over 6 weeks** (promising — quasi-experimental, no true RCTs at scale).
- **Recognition skill predicts real stats.** In 34 Single-A hitters, video-occlusion scores at **80 ms after release correlated with SLG (r = .21)** and most strongly with walk rate; in 252 pros, sensorimotor battery scores predicted **OBP, BB%, and K% — but not SLG** (proven for association, promising for magnitude).
- **Random beats blocked in the cage.** In the classic Hall, Domingues & Cavazos (1994) study of elite college hitters, 12 extra 45-pitch sessions improved hitting **+56.7% under random pitch ordering vs +24.8% blocked vs baseline control** — the single most load-bearing result for cage design (proven in this population; contextual-interference effect is robust but skill-moderated).
- **Generalized "sports vision training" is largely a dead end;** stimulus-specific training (occlusion video, VR at-bats, pitch-replicating machines) is not. A pre-registered strobe RCT found **no in-game batting improvement** (only batting-practice hit-distance/launch-angle gains), and 2024–25 systematic reviews grade generic vision training as weak/heterogeneous (debunked for generic drills, plausible for strobe as a supplement).
- **Count structure is worth real runs:** PAs ending on the first pitch produced a **.377 wOBA (~20% above the .315 league average)**; falling to 0-1 dropped rest-of-PA wOBA to **.269 vs .357 after 1-0**, and hitters' 50%-swing zone at 0-1 is **~2.5x the area** of the 1-0 zone — approach training is mostly about not letting the count dictate panic expansion (proven, observational).
- **Tooling spans three price tiers:** GameSense-style occlusion apps (tens of $/month), VR (WIN Reality, ~$30/month consumer; vendor-claimed +12.5% OBP, uncontrolled), and Trajekt Arc pitch replication (**$15–20k/month, 3-year commitment, 1,200-lb unit, >half of MLB clubs**) (pricing factual; vendor efficacy claims promising at best).

## 1. Why swing decisions are a separate skill — and how much they're worth

Driveline frames hitting as a "Big 3": bat speed, bat-to-ball skill, and swing decisions/approach. The decision component is genuinely independent — a hitter can be elite at two and poor at the third, and the FanGraphs strike-probability work shows successful hitters occupy very different corners of the decision space: Freeman/Seager-style aggressors who crush 90%+ strike-probability pitches at elite rates, Soto/Bregman-style take artists, and chase-and-survive outliers like Javier Báez who succeed *despite* their decisions (proven as a descriptive taxonomy).

How much is it worth? SEAGER alone — swing decisions with no contact quality — carries a **.41 weighted correlation with next-season ISO** (promising). Nestico found swing rate and decision value inversely correlated at **r = -0.62**: passivity is, on average, the cheaper path to good decisions, though the best hitters (Seager himself) break that tradeoff by being aggressive *only* on hittable pitches. And the Adam Salorio comparison piece lands on the field's consensus: "a hitter's ability to avoid swinging at poor pitches is far more important to making good decisions than their ability to swing at strikes" (promising).

**For Soto:** decisions are the highest-leverage hitting skill Triton can measure *from data it already has* — no bat sensor required. Location + count + outcome is all in the `pitches` table.

## 2. The basic metric layer: chase, zone-swing, and what they miss

The classical stack, all computable from Statcast pitch coordinates:

- **O-Swing% (chase rate):** swings at pitches outside the zone. League ~28–32%; elite discipline hitters run low-20s and below. Best single predictor of walk rate among simple metrics (proven).
- **Z-Swing%:** swings at in-zone pitches, league ~65–69%.
- **Z-O Swing%:** the differential; a crude "correct decision" index.
- **SwStr%, Z-Contact%:** contact overlays that interact with decisions (a low-contact hitter should be *more* selective at the margins).

What these miss, per Driveline's 2019 critique and everyone since: (a) all strikes are treated as equal — a heart-zone fastball and a painted 0-2 slider both count as "strikes you should swing at"; (b) no count context; (c) no individualization — Freddie Freeman's profitable swing zone is not Kevin Pillar's; (d) the rulebook zone is the wrong boundary — what matters is whether a pitch is **hittable**, not whether it's a strike (promising, now consensus).

**For Soto:** ship the basic layer first (O-Swing/Z-Swing/Z-O by count bucket) as Triton hitter-page chips — it's cheap, stable, and interpretable — then layer value models on top. Note chase rate stabilizes fast (~50–100 PA), making it usable for in-season MiLB/Compete monitoring.

## 3. The value-model era: SEAGER, SwRV, decision value, Swing Decision+

Four families of "swing decision run value" models, all built on the same primitive — **expected run value of swing vs take at each (location, count) cell**:

**SEAGER (Robert Orr, Baseball Prospectus).** Computes average run value of swing and take at every count × location combination since 2020, folds in called-strike probability for borderline pitches, then scores hitters on two ratios: *hittable pitches taken* (% of takes with positive swing EV — lower is better) and *selection tendency* (% of takes that were correct — higher is better). The core inversion: the costliest mistake isn't chasing, it's **letting high-value hittable pitches go by**. Correlates .41 (weighted) with next-season ISO and beats Z-O Swing and chase for power; notably *weaker* than alternatives at predicting BB% (promising). Sky Kalkman published a "Simple Seager" approximation for public replication.

**SwRV (Drew Haugen).** Expected swing/take run values summed per pitch; per Salorio's comparison it is the best of the group at predicting future wOBA and roughly matches chase rate on walk prediction (promising).

**Decision Value (Thomas Nestico, tjStuff family).** Two XGBoost models on 2020–22 data, features just plate_x, plate_z, balls, strikes; count-neutralized run values (e.g., a swinging strike averages **-0.15 runs at 0-2 bases empty vs -0.94 at 3-2 bases loaded**, so raw ΔRE is replaced by outcome-average values). Key result: no-swing model RMSE **0.045** vs swing model **0.294** — takes are gradeable from context alone; swings are not. Few hitters are elite at both in-zone awareness (punishing takes of hittable pitches) and out-of-zone awareness (not chasing) (promising).

**Swing Decision+ (Driveline, 2019).** The individualized version: per-hitter "swing run differential" heat maps (2015–18 seasons, >100 BIP), bucketing locations into should-swing (>+0.05 runs) and should-take (<-0.05), then a count- and contact-adjusted plus-scale metric weighted by swing probability. Year-over-year improvement in Swing Decision+ correlates with future wOBA gains — evidence the *skill itself* is worth training (promising).

**The bat-speed frontier (2024–26).** With Statcast bat tracking (bat speed, squared-up rate, swing length in 2024; swing path, attack angle, ideal attack angle, attack direction in 2025), the next generation conditions decision grades on *what the hitter's swing can do*: Salorio's preliminary model finds swings **over ~70 mph bat speed in the heart zone carry positive expected RV**, and moving from location-only (SOTO) to bat-speed-aware modeling cut the Zone% confound from ~23% to ~5% of grade variance (plausible — early, limited multi-year data). Driveline's 2026 "To swing or not to swing" piece runs the same logic live: their model graded Geraldo Perdomo's game-ending take as *elite* (0.5% called-strike probability vs 63% whiff probability had he swung) despite the bad outcome — process over outcome, explicitly (promising).

**For Soto:** a SEAGER/DV-style model is directly buildable in Triton: bin `plate_x/plate_z` × count over the 7.4M-pitch table, compute swing/take RV per cell (count-neutralized outcome values per Nestico), add a called-strike-probability GAM (a simple location model hits ~92.5% accuracy per FanGraphs), and score hitters on hittable-takes% and chase%. This is the hitter-side sibling of Stuff+ — same Z-score philosophy, same `run_query` aggregation pattern. For Compete/TrackMan cage data, the identical model scores every tracked cage take/swing, which is the measurement loop Neptune's approach training needs.

## 4. Approach by count: what the data supports

The count-state facts every approach framework should be built on:

- **First pitch:** PAs ending on pitch one produced **.377 wOBA vs .315 league average (2018)** — first-pitch aggression on hittable pitches is systematically underused; league first-pitch swing rate sits near ~30%, well below optimal on grooved pitches (proven, observational).
- **The 0-1 / 1-0 fork:** rest-of-PA wOBA **.269 after 0-1 vs .357 after 1-0** — a ~90-point swing on one pitch. This is the honest sales pitch for decision training: the count *is* the leverage (proven).
- **Zone expansion under pressure:** hitters' 50%-swing-probability zone at 0-1 is **~2.5x the area** of the 1-0 zone, and two-strike counts sharply amplify swing rates on marginal (40–60% strike probability) pitches — fear-driven expansion, much of it unprofitable (proven, observational).
- **Not all strikes are equal by count:** Driveline's current coaching line (Tanner Stokey): early counts, hunt damage locations and *take* competitive strikes outside your zone; as strikes accrue, expand *selectively* — and stop teaching blanket "protect with two strikes," because a take with 0.5% called-strike probability is correct even at maximum stakes (promising).
- **Individualized thresholds:** high-power/low-contact hitters should expand less with two strikes (their weak-contact outcomes are worse than a strikeout risk tradeoff suggests); high-contact hitters can defend the edges profitably. Driveline programs decisions in exactly two buckets — **non-2-strike and 2-strike** — rather than count-by-count micromanagement (promising).

A workable framework (consistent with all the above): **A-swing zone hunting 0-0 through any count with <2 strikes** (swing only in a pre-declared damage zone, take everything else including strikes), then **B-swing/battle mode at 2 strikes** (expanded zone, contact-biased adjustments only if the hitter's contact skill supports them). This is the modern replacement for "get a good pitch to hit" — same Ted Williams idea, now with run values attached.

**For Soto:** Trevor read counts for a living from the mound — flip the frame. Every pitcher-side Triton insight (pitchers' count-based zone tendencies, e.g., where a pitcher goes 0-1) is a hitter-side approach card. A "what to hunt vs this pitcher, by count" report is a Reports Builder tile away, and doubles as broadcast content.

## 5. Pitch recognition science: occlusion and what actually transfers

The perceptual mechanism is well established: experts extract earlier information — arm slot, release cues, spin — and expert–novice **temporal occlusion** studies (video cut to black at or just after release) consistently separate skill levels in the first ~150 ms of ball flight (proven).

The training evidence, graded honestly:

- **Fadde's college program (Frontiers in Psychology, 2016 / PMC4773639):** 18 D-I position players, year-round video-occlusion training (fall: ~1 hr, 2x/week in small groups; winter: voluntary computer drills, ~5 min/round; spring: whole-team plus live "bullpen stand-in" recognition reps). Team outcomes: **BA .286 → .326, R/G 5.8 → 8.6 (+48%), BB/K 0.50 → 0.77 (d = 0.953, p = .017)**; sixth → first in conference in runs and BA, exceeding a matched comparison team's improvement. No internal control group — team-level quasi-experiment (promising).
- **University of Cincinnati protocol:** ~**10 min/day of video occlusion → +.030–.050 BA over 6 weeks** in college hitters (promising; widely cited, modest methodology).
- **Predictive validity (Müller & Fadde, JMLD 2018):** 34 Single-A hitters (≥100 PA) from one MLB org; occlusion test scores correlated most strongly with **walk rate**, and combined type+location anticipation at **80 ms post-release correlated with SLG (r = .21)** (proven as association; small n).
- **Sensorimotor batteries (Burris et al., Scientific Reports 2018):** 252 pros on the Nike Sensory Station; scores significantly predicted **OBP, BB%, K% — but not SLG or pitcher FIP**. Perception buys you the walk/strikeout margin, not raw power (proven).
- **S2 Cognition (vendor-adjacent):** of 150 MLB players tested, **83% scored above 60 and 26% above 90** on the S2 Overall Score; sub-50 scorers who reached MLB were mostly utility/backup profiles. Useful as an intake screen, not proof of trainability (plausible).
- **VR (WIN Reality):** vendor-reported **pitch-recognition scores 53% → 66% in two months** and **+12.5% OBP** among trainees; a third-party (vendor-commissioned) study claims ≥12% in-game gains in BA/OBP/SLG among MLB clients. Uncontrolled, selection-biased — but mechanistically aligned with occlusion research since VR preserves release cues and forces real take/swing calls (promising for recognition, plausible for stat transfer).
- **Stroboscopic/strobe glasses:** a pre-registered RCT in collegiate hitters found **no significant in-game batting improvement**, with intermediate transfer only to batting-practice hit distance and launch angle; 2024–25 systematic reviews and meta-analyses (BMC, Scientific Reports, Nature) find moderate effects on lab visuomotor outcomes with high heterogeneity and limited sport transfer (plausible as supplement; not a program cornerstone).
- **Generic "sports vision training"** (eye exercises, tachistoscopes, generalized reaction boards): 2024 systematic review verdict — weak, inconsistent transfer to sport performance. Train the *sport-specific stimulus*, not the eyeball (debunked as a standalone performance intervention).

The through-line: **stimulus specificity wins.** Occlusion video of real pitchers, VR at-bats, and machine-replicated pitch shapes all preserve the actual perceptual cues; generic vision drills don't, and they don't transfer.

**For Soto:** Neptune's recognition stack, cheapest first: (1) GameSense-style occlusion app homework (~tens of $/month/athlete, testable via their SRT baseline score — also a clean intake-battery item); (2) WIN Reality VR stations (~$30/month consumer tier plus headsets — high engagement value for youth/HS); (3) filmed occlusion of Neptune's own pitchers for facility-specific content. Trevor himself is a content asset here: film his arsenal from the batter's eye for in-house occlusion clips.

## 6. Training swing decisions in the cage

The motor-learning backbone: **contextual interference.** Hall, Domingues & Cavazos (1994), elite college hitters, 30 players, 12 extra sessions over 6 weeks, 45 pitches each (15 FB / 15 CB / 15 CH): the **random-order group improved 56.7%** on transfer-test solid-contact hitting vs **24.8% for blocked** ordering vs no-extra-practice control (proven in this population; later work shows the effect is moderated by skill level — beginners can need blocked reps first). Driveline's 2019 randomized-vs-blocked piece operationalizes it: blocked for acquiring a new movement, random for making skills game-ready — and decision training is *definitionally* random-schedule work.

A practical cage progression, evidence-anchored:

1. **Tracking-only rounds (free).** Stand in on live bullpens, no bat or no swings; call type/location/ball-strike out loud after each pitch, coach confirms. This is Fadde's "bullpen stand-in" drill — recognition reps at full perceptual fidelity, zero swing fatigue (promising).
2. **Take/swing scored rounds.** Mixed-pitch machine or live BP where the score is the *decision*, not the result: +1 for swings in the declared hunt zone, +1 for takes outside it, -2 for chases, -2 for hunt-zone takes (the SEAGER "hittable take" penalty — most programs forget this half). Outcome of the swing is ignored early, then blended in (plausible→promising; direct implementation of value-model logic).
3. **Count-state games.** Rounds begin at assigned counts (0-0 hunt rounds, 2-strike battle rounds); Driveline's non-2K/2K split keeps it simple. Vary pitcher "personality" (zone%, putaway pitch) per round so the athlete practices *re-solving* the decision problem — this is where Trajekt-class replication shines at the MLB tier, and where a two-wheel machine with mixed shapes plus randomized location is the honest budget version (promising).
4. **Occlusion BP.** Coach-thrown or machine BP where the hitter must verbalize "yes/no" *before* a marker point (a curtain, a cone distance, or a strobe blink) — forces the decision into the first 150–200 ms window the occlusion literature targets (plausible; low-cost, mechanistically sound).
5. **Measurement loop.** Every tracked session produces chase%, hittable-take%, and decision score by count bucket; retest monthly. Driveline's finding that Swing Decision+ improvements precede wOBA improvements is the justification for treating the decision score itself as the KPI (promising).

Anti-patterns, per the same literature: grooved single-location BP as "approach work" (blocked practice, no decision content); punishing correct-process takes that get called strikes (Perdomo lesson); blanket two-strike "protect everything" cues for low-contact power hitters.

**For Soto:** this is Neptune's differentiation-per-dollar sweet spot. TrackMan already tags every cage pitch's location in Compete — add a per-pitch swing/take flag (manual tag or derived from bat sensor/contact) and Triton can score every session with the same decision model as Section 3, giving Neptune a Driveline-grade "decision score" product with hardware already in hand. Trajekt ($15–20k/month, 3-year commitment) is out of scope; a programmable two-wheel machine + randomized scripts + TrackMan scoring captures most of the training value at ~1% of the cost.

## 7. Benchmarks and assessment battery

Reference ranges (MLB, Statcast era): league O-Swing ~28–32%, Z-Swing ~65–69%, overall swing ~47%, first-pitch swing ~30%; elite discipline = chase low-20s or below with Z-Swing on *hittable* pitches (90%+ strike probability) at 80%+. At lower levels, chase rates run 5–15 points higher and recognition scores (GameSense SRT-style) scale down sharply — which is exactly why recognition testing separates HS/travel athletes better than exit velocity does (plausible; vendor-normed).

Neptune intake battery for the decision/recognition bucket: (1) occlusion test score (GameSense SRT or in-house film); (2) machine-mixed decision round — chase%, hittable-take%, 2K vs non-2K split from TrackMan; (3) optional S2-style cognitive screen for the pro/college tier. Retest cadence: 6 weeks, matching the intervention windows in the Fadde and Cincinnati studies.

## Sources

1. Baseball Prospectus — Quantifying the Corey Seager Approach (Robert Orr, SEAGER): https://www.baseballprospectus.com/news/article/87395/best-of-bp-quantifying-the-corey-seager-approach/
2. Driveline Baseball — Quantifying Swing Decisions: An Individualized Approach (2019): https://www.drivelinebaseball.com/2019/07/quantifying-swing-decisions-an-individualized-approach/
3. Driveline Baseball — To Swing or Not to Swing, That Is Thee Question (2026): https://www.drivelinebaseball.com/2026/04/to-swing-or-not-to-swing-that-is-thee-question/
4. Adam Salorio — A Closer Look at Swing Decision Metrics: https://adamsalorio.substack.com/p/a-closer-look-at-swing-decision-metrics
5. Adam Salorio — Introducing My Swing Decision Model (SOTO): https://medium.com/@adamsalorio/introducing-my-swing-decision-model-d0851ab37fb6
6. Thomas Nestico — Modelling Batter Decision Value: https://medium.com/@thomasjamesnestico/modelling-batter-decision-value-dac74c55e20a
7. FanGraphs — Let's Take a Closer Look at Hitter Swing Decisions: https://blogs.fangraphs.com/lets-take-a-closer-look-at-hitter-swing-decisions/
8. FanGraphs — The First Pitch Swing Decision: Selectivity Versus Passivity: https://blogs.fangraphs.com/the-first-pitch-swing-decision-selectivity-versus-passivity/
9. FanGraphs Community — Attacking the First-Pitch Strike: https://community.fangraphs.com/attacking-the-first-pitch-strike/
10. Sky Kalkman — Simple Seager: https://skykalkman.substack.com/p/simple-seager
11. Fadde, P. — Instructional Design for Accelerated Macrocognitive Expertise in the Baseball Workplace (Frontiers in Psychology, 2016): https://pmc.ncbi.nlm.nih.gov/articles/PMC4773639/
12. Müller, S. & Fadde, P. — Use of Pitcher Game Footage to Measure Visual Anticipation and Its Relationship to Baseball Batting Statistics (J. Motor Learning & Development, 2018): https://journals.humankinetics.com/view/journals/jmld/6/2/article-p197.xml
13. GameSense Sports — Research: Pitch Recognition Skill Linked With Season Walk Percentage: https://gamesensesports.com/research-finds-that-pitch-recognition-skill-is-linked-with-season-walk-percentage/
14. Burris, K. et al. — Sensorimotor abilities predict on-field performance in professional baseball (Scientific Reports, 2018): https://www.nature.com/articles/s41598-017-18565-7
15. S2 Cognition — Is Cognition Important in Baseball?: https://www.s2cognition.com/post/is-cognition-important-in-baseball
16. Hall, K., Domingues, D. & Cavazos, R. — Contextual interference effects with skilled baseball players (1994, PDF): https://www.krigolsonteaching.com/uploads/4/3/8/4/43848243/1994-hall.pdf
17. Driveline Baseball — Randomized and Blocked Training: Balancing Different Types of Hitting Practice (2019): https://www.drivelinebaseball.com/2019/04/randomized-blocked-training-balancing-different-types-hitting-practice/
18. ESPN — Face any pitcher, any time: Inside MLB's new Trajekt tech: https://www.espn.com/mlb/story/_/id/40401564/trajekt-arc-new-technology-controversy-mlb-hitters-pitchers-advantage
19. MLB.com — Miami Marlins use revolutionary Trajekt Arc hitting machine: https://www.mlb.com/news/miami-marlins-use-revolutionary-trajekt-arc-hitting-machine
20. Liu, S. et al. — Dynamic vision training transfers positively to batting practice performance among collegiate baseball batters (Psychology of Sport & Exercise, 2020): https://www.sciencedirect.com/science/article/abs/pii/S1469029220301333
21. Training vision in athletes to improve sports performance: a systematic review (Int. Review of Sport & Exercise Psychology, 2024): https://www.tandfonline.com/doi/full/10.1080/1750984X.2024.2437385
22. Effects of stroboscopic visual training on reaction time and movement accuracy: systematic review and meta-analysis (Scientific Reports, 2025): https://www.nature.com/articles/s41598-025-10393-4
23. WIN Reality — Does VR Baseball Training Work?: https://winreality.com/blog/does-vr-baseball-training-work/
24. MLB.com — New Statcast metrics measure swing path, attack angle, attack direction (2025): https://www.mlb.com/news/new-statcast-swing-metrics-2025
