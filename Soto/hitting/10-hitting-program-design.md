---
title: Hitting Program Design — Assessment to Program to Retest
domain: hitting
tags:
  - program-design
  - assessment
  - bat-speed
  - periodization
  - overload-underload
  - facility-model
  - swing-decisions
  - retest
sources_reviewed: 23
last_updated: 2026-07-19
---

# Hitting Program Design — Assessment to Program to Retest

## TL;DR

- **The industry-standard development spine is test → train → retest**: Driveline runs a 5-day assessment week (~40–50 tracked machine swings + strength/PT screen + mocap), retests skill metrics every 2–3 weeks and strength every 6 weeks; Maven Baseball Lab compresses intake to a 90-minute mocap + force-plate assessment (12 tracked reps). A cheap public template mirrors it: test week 1, train 4 weeks, retest week 6.
- **Overload/underload bat training is the best-evidenced skill intervention in hitting**: DeRenne et al. (1995), n=60 collegians, 12 weeks, 4 days/week, 150 swings/week with bats within ±12% of game weight, produced ~10% bat-speed gains vs. control (proven). Driveline's in-gym replication (n=28, 6 weeks, 160 swings/week) was consistent with the literature; their 2026 modeling shows athletes gain ~2 mph bat speed on average per offseason.
- **1 mph of bat speed ≈ +1.2 mph exit velocity ≈ ~7 ft of carry** — the core ROI equation that converts training gains into outcomes. MLB Statcast (2024+): league-average swing 71.5 mph, "fast swing" = 75+ mph (~23% of swings), squared-up balls hit .372/.659 SLG vs .127/.144 when not squared up.
- **Physical capacity sets the ceiling**: lean body mass is the single strongest correlate of bat swing velocity (r = 0.542, n=78 collegians), back strength r = 0.396, and rotational med-ball throw velocity r = 0.65 with bat speed (39% of variance) (proven, correlational). Program strength first for slow-bat athletes; skill/path work yields more for already-strong ones.
- **Training focus should rotate by season phase**: early offseason = bat speed + strength; late offseason/pre-season = bat-to-ball (Smash Factor) + swing decisions; in-season = maintenance at ≥2 lifts/week with high intensity, low volume. A Driveline case study showed a +4.4 mph velo gain fully erased by one season of 1x/week in-season lifting (promising, n=1 but consistent with detraining literature).
- **Random/variable practice beats blocked practice for transfer**: in collegiate hitters, random-schedule groups improved 56.7% on transfer tests vs 24.8% (blocked) and 6.2% (control) (proven). Cage plans should mix pitch types/locations once movement patterns are stable.
- **Facility economics favor a hybrid model**: semi-private group training on a data floor (Driveline model) scales coach time; appointment-based assessment labs (Maven) anchor premium pricing. Driveline pro pricing: $7,500 two-day assessment, $15,000 full offseason, $20,000 year-round. Rental-only memberships cap around 40–60 members with low retention; training memberships retain better and carry higher LTV.
- **Tech stack for a hitting lab is affordable relative to pitching**: Blast sensors (~$150 ea) + HitTrax (<$10k entry) or TrackMan (~$19k indoor, $475–600/yr subscriptions) covers the Big 3 metrics; force plates, pressure mapping (Swing Catalyst), and Edgertronic are the premium tier.

## 1. The Development Spine: Assess → Program → Retest

Every credible data-driven hitting org runs the same closed loop; they differ only in density and price point.

**Driveline (Kent, WA)** — the reference implementation. Assessment week (from their published process):

- **Day 1:** Baseline batted-ball collection — 40–50 machine swings tracked simultaneously on HitTrax/Rapsodo (exit velo, launch angle, spray), Blast Motion (bat speed, attack angle), K-Vest (kinematic sequence), and Edgertronic high-speed video (up to 2,000 fps; the pro lab runs eight cameras at up to 17,000 fps).
- **Day 2:** Physical therapy movement screen + force-plate strength testing (maximal, explosive, reactive) + group hitting.
- **Day 3:** Motion-capture lab session + bat speed training introduction.
- **Day 4:** Bat-to-ball (Smash Factor) drill work with plyo balls.
- **Day 5:** Athlete report review meeting → individualized plan → one-on-one swing design session.

The output is a small set of **objective goals** (e.g., "raise top-8th exit velocity from 94 to 97 mph in six weeks") tied to the athlete's biggest limiting factor — "low hanging fruit" first. Their stated philosophy: "Why guess when you can assess?" and "Training without a plan is just guessing."

**Retest cadence** (Driveline published): skill metrics every **2–3 weeks**; strength assessments every **6 weeks** (to avoid interfering with hitting/throwing volume). Blast bat-speed metrics stabilize fast enough to steer weekly adjustments; Smash Factor reaches acceptable reliability (Cronbach's α ≥ 0.7) after only **~20 balls in play** — far faster than outcome stats like K% that need hundreds of PA (promising, in-house validation).

**Maven Baseball Lab (Atlanta)** — the compressed-intake variant: a **90-minute appointment assessment**, skill measured from **12 reps** on markerless motion capture + force plates + Swing Catalyst pressure mapping + Edgertronic, feeding a data-built plan ("no guesswork, no wasted reps"). Client list includes Matt Olson, Nolan Arenado, Paul Goldschmidt.

**Minimum viable loop** (Driveline's free public template): Week 1 test (bat speed, contact quality, decisions) → Weeks 2–5 train → Week 6 retest. This works with nothing more than a Blast sensor and a radar/HitTrax.

**For Soto:** Neptune's product spine is exactly this loop, and the Compete pipeline is the retest infrastructure. Spec a Neptune intake battery: (1) 40–50 tracked swings off machine → TrackMan/HitTrax + Blast, (2) force-plate CMJ + med-ball rotational throw + grip/mid-thigh pull, (3) mobility screen, (4) occlusion-based pitch-recognition test. Store each battery as a `compete_pitch_sessions`-style session with `session_type = 'assessment' | 'retest'` so Triton can auto-diff retest vs. baseline and render a progress report. The 2–3 week skill retest / 6-week strength retest cadence should be encoded as scheduled session templates, not left to coach memory.

## 2. The Skill Model: Big 3 + Benchmarks by Level

Driveline decomposes hitting into a **"Big 3": Bat Speed, Bat-to-Ball, Swing Decisions** — every hitter is profiled on all three and programmed against the weakest (promising as a taxonomy; each pillar's link to production is individually well-supported). MLB bat-tracking clustering (2024) reinforced that hitters separate into distinct profiles needing different training emphases.

**Bat speed benchmarks (Blast Motion, 400M+ swing database; sensor readings run slightly hot vs. in-game Statcast):**

| Level | Bat speed (mph) | Peak hand speed (mph) |
|---|---|---|
| Youth (8–12) | 40–56 | — |
| Middle school (13–14) | 46–62 | — |
| HS JV | 53–67 | — |
| HS Varsity | 57–71 (college-bound: 63–70) | 20–26 |
| College | 61–73 | 21–27 |
| MiLB | 63–75 | — |
| MLB | 66–78 (Statcast in-game avg 71.5) | 23–29 |

**Statcast bat-tracking context (2024–25, first public seasons):** league-average swing 71.5 mph with a 7.3-ft swing length; "fast swing" = 75+ mph (~23% of swings in April 2024); 75 mph is roughly where per-swing production reaches league average. Hitters square up ~1/3 of batted balls; squared-up contact bats **.372 / .659 SLG** vs **.127 / .144** otherwise (proven, population data).

**Bat-to-ball:** Smash Factor = 1 + (EV − bat speed)/(pitch speed + bat speed) (Alan Nathan's collision model). Whiffs/fouls score zero, so the average captures contact frequency *and* quality in one number, reliable in ~20 BIP (promising).

**Swing decisions:** Driveline generates a per-athlete swing-decision grade from tracked mixed-pitch and live at-bats; GameSense occlusion research (n=34 Single-A hitters, ≥100 PA) found pitch-recognition score at front-foot plant significantly correlated with season walk rate, and an MLB org's A-ball testing found PR scores after 3 months of occlusion training correlated with season OBP and SLG (promising, small samples, vendor-adjacent publication).

**For Soto:** these three pillars map cleanly to Triton facility metrics: bat speed (Blast/TrackMan), a Smash Factor implementation off `compete_pitches` (EV, pitch speed available; needs bat speed joined from sensor export), and a swing-decision grade off tagged live ABs. Publish level benchmarks (table above) as a `league_averages`-style facility table so every athlete dashboard shows percentile-vs-level, the same pattern already used for MLB metrics.

## 3. Bat Speed Development: The Overload/Underload Evidence Base

This is the most-replicated finding in hitting science:

- **DeRenne, Buxton et al. (1995, JSCR)** — 60 college players randomized to batting-practice (hit live pitching with alternated over/under/standard bats), dry-swing (same implements, no ball), and control (standard bat dry swings). 12 weeks, 4 days/week, **150 swings/week (15×10)**, implements within **±12% of the 30-oz game bat** (light 27–29 oz, heavy 31–34 oz). All groups improved (p < .05), but BP > dry swing > control, with the BP group gaining ~**10% bat speed** — still the largest effect in the published literature (proven).
- **Driveline in-gym study (2017)** — 28 players, 6 weeks, 160 swings/week with Axe Bat Speed Trainers vs. game-bat control, peak EV tested every 3 weeks; results "consistent with previous research" (promising; underpowered but directionally aligned).
- **Load prescription consensus:** stay within roughly **±20% of game-bat weight** (many practitioners use ±12% per DeRenne); beyond that, movement specificity degrades as different muscle groups take over (promising).
- **Realistic expectations:** commercial programs advertise +8–12% or "+10 mph in 6 weeks" — treat marketing numbers above ~10% skeptically (plausible at youth levels where any training works; debunked as a general adult expectation). Driveline's own modeling of offseason change distributions puts the *average* trained gain at **~2 mph bat speed per offseason** for developed athletes — the honest anchor for goal-setting.

**Mechanism and execution:** overload builds force output/recruitment; underload trains overspeed (fast-twitch recruitment beyond normal ceiling — the downhill-sprint analogy). Driveline's simplified weekly protocol: barrel-load 1×8, handle-load 1×8, underload 1×8, game bat 1×8, at **max intent, 3–4×/week**, with three non-negotiables: (1) *intent* — accept degraded contact quality on speed days, (2) *feedback* — sensor on every swing, (3) *tracked goals* across all implements.

**Conversion math (Driveline/Statcast):** +1 mph bat speed → **+1.2 mph EV** → ~**7 ft** of fly-ball distance. So a typical +2 mph offseason ≈ +2.4 mph EV ≈ ~14 ft — enough to turn warning-track outs into homers, which is why bat speed leads the offseason sequence.

**For Soto:** for Trevor's own bar-setting and Neptune athlete goals, write the expectation as "+2 mph bat speed per offseason block is a good outcome; +4–5 is exceptional; double-digit claims are marketing." Stock the floor with one over/under bat set per cage lane (~$100–200/set) — the highest-ROI equipment purchase in hitting.

## 4. Integrating Strength and Physical Development

Physical capacity correlates with — and for weaker athletes, gates — bat speed:

- **Lean body mass** is the strongest single predictor of bat swing velocity: r = 0.542 (n=78 collegians, mean age 19.4); back strength r = 0.396; grip strength r = 0.335; backward overhead med-ball throw r = 0.289. In multiple regression only lean mass and back strength survived; the full model explained only ~35% of variance — physicality is necessary, not sufficient (proven, correlational).
- **Rotational med-ball throw velocity** correlates r = 0.65 with bat swing velocity (39% of variance) and r = 0.53 with batted-ball velocity in NCAA DIII players (proven, correlational) — making it the best cheap proxy test for rotational power (a radar gun and a 4–6 lb ball).
- Trap-bar deadlift strength and lean mass correlate significantly with batted-ball velocity in other collegiate samples; bench press/isokinetic chest press correlate with swing speed (proven, correlational).
- The 78-player study's stratification is programmatically useful: **slow-bat group (98.8 ± 2.8 km/h ≈ 61 mph)** → general strength + ground-force/weight-transfer work + hang power cleans; **fast-bat group (112.0 ± 4.0 km/h ≈ 70 mph)** → maintain big-three lifts, add rotational-specific work (plausible as prescription; the stratification data is solid, the training branching is expert inference).

**Integration rule of thumb** (Driveline, Cressey, RPP consensus): lift and hit on the same day where possible (hit first when skill quality matters, lift first on speed-intent days is acceptable), keep 3–4 lifts/week offseason, and never let the weight room disappear in-season. The training-frequency meta-analytic literature supports **maintenance on ~2 sessions/week if intensity stays high** while volume drops (proven for strength maintenance generally).

The cautionary tale: a Driveline college-pitcher case study gained +4.4 mph throwing velo (85.9 → 90.3) over a 3-month offseason, then returned after a season of one lower-body session/week having given **all of it back** (85.0 mph) with strength, power, and reactive-strength all significantly down — mechanics unchanged, body weight unchanged; detraining was the isolated culprit (promising, n=1; mechanism proven). The same physiology applies to bat speed.

**For Soto:** Neptune's assessment battery needs only force plates (CMJ height, peak power), rotational med-ball throw velo (radar), grip, and a trap-bar or IMTP pull to cover the validated predictors. Store these in an athlete-physical table keyed to the same athlete IDs as Compete sessions so bat-speed change can be regressed against physical change across the client base — that in-house dataset becomes a Neptune moat within 2–3 offseason cohorts.

## 5. Bat-to-Ball, Approach, and the Motor-Learning Layer

**Variable/random practice for transfer.** Hall, Domingues & Cavazos (1994) trained skilled college hitters on fastballs/curveballs/changeups in blocked vs random schedules: no acquisition difference, but random practice won decisively on transfer. Follow-up collegiate work: pretest→random-transfer improvement of **56.7% (random group) vs 24.8% (blocked) vs 6.2% (control)** (proven — one of the most robust findings in motor learning). Random practice also nudges hitters toward external attentional focus, itself associated with better skill learning (promising). Implication: blocked, machine-grooved BP is fine for *introducing* a movement change, but the majority of skill volume — especially within 8 weeks of competition — should be mixed pitch types, speeds, and locations.

**Bat-to-ball training** (Driveline model): plyo-ball hitting, offset/short-bat constraint drills (force contact-point changes without sacrificing bat speed), and mixed-pitch rounds scored by Smash Factor. Their 2026 bat-path modeling (KNN clustering to 15 comparable players, Pareto-constrained recommendations) found path optimization pays most for high-power/low-contact profiles and least for elite-contact hitters — i.e., don't sell swing rebuilds to hitters whose problem is physical output (promising).

**Approach/decision training:**
- **Video-occlusion pitch recognition** (Fadde/GameSense): 10 min/day computer drills + 1–2 cage transfer sessions/week, expected noticeable gains in **3–4 weeks**; PR scores correlate with BB%, OBP, SLG in pro samples (promising).
- **VR** (WIN Reality): vendor-reported numbers — +12.5% OBP internal study, third-party-reported ≥12% in-game improvements in AVG/OBP/SLG/OPS for MLB clients, "+23% win percentage" for teams (plausible at best — vendor-funded, selection-biased; treat as directional, not effect-size evidence).
- **Tracked live at-bats with decision grading** — the gold standard; requires tagged pitch locations + swing/take, which is exactly what a TrackMan-instrumented facility produces for free.

**For Soto:** the Compete schema already captures per-pitch location and result — a swing-decision grade (e.g., xRV of swing vs take by zone, or simple in-zone-swing%/chase% vs level benchmarks) is a Triton-side feature, not new hardware. Occlusion training is a near-zero-cost Neptune add-on (tablet station); VR is a marketing amenity, not an evidence purchase.

## 6. Periodization: The Annual Plan and Weekly Templates

**Macro sequence** (Driveline's published logic, consistent with classical periodization): early offseason = bat speed (+ max strength); mid/late offseason = convert to bat-to-ball and path work (+ power conversion); pre-season = swing decisions, live ABs, timing (+ speed/power maintenance); in-season = compete, maintain, monitor. Classical S&C overlay: month 1 active rest post-season; months 2–4 preparatory (strength); months 5–6 transition to power/speed pre-competition (proven as general framework).

**Sample weekly templates (synthesized from Driveline templates/protocols + S&C literature):**

*Early offseason — Bat Speed block (6 weeks; test wk 1, retest wk 6):*
- Hitting 4×/week, ~150–160 total weighted swings/week: over/under/game-bat rounds (e.g., 4 implements × 8–10 swings × 4 rounds) at max intent, sensor on every swing.
- Lift 3–4×/week: max-strength emphasis (trap-bar DL, squat, press), rotational med-ball 2×/week.
- Minimal live hitting; contact quality deliberately deprioritized.

*Late offseason — Bat-to-Ball/Path block (4–6 weeks):*
- Hitting 4–5×/week: plyo-ball rounds, offset/short-bat constraint drills, mixed-pitch machine rounds scored on Smash Factor; one weighted-bat maintenance day.
- Lift 3×/week shifting to power (cleans, jumps, throws).
- Begin occlusion/PR work 10 min/day.

*Pre-season — Approach/Live block (3–4 weeks):*
- 2–3 live AB sessions/week with decision grading; random-schedule machine work only.
- Lift 2–3×/week, high intensity, reduced volume.

*In-season — Maintain:*
- ≥2 lifts/week, intensity high, volume low (proven maintenance dose).
- 1 short intent day/week (weighted-bat round) to hold bat speed; skill work driven by game data (promising).
- Retest bat speed monthly; strength every 6 weeks where schedule allows.

**Youth modification:** Driveline Academy runs youth development as team-based training with capped game counts and "countless skill games" oriented to long-term athletic development — for pre-HS athletes, general athleticism + swing intent games beat formal blocks (promising; LTAD consensus).

**For Soto:** encode these as 3–4 named program templates in the Neptune product (Bat Speed, Bat-to-Ball, Pre-Season, In-Season) with per-week swing counts and scheduled retests — the Driveline TRAQ model — rather than bespoke programs per athlete. Individualization lives in *which* template and *which* drill variants, keeping founder/coach time leveraged.

## 7. Group vs Individual Models for a Facility

Three viable operating models, all observed in successful data-driven orgs:

1. **Data-floor semi-private group (Driveline gym model):** athletes train concurrently on individualized programs; coaches float; sensors/screens do per-rep feedback. Scales to high athlete:coach ratios because the program, not the coach, carries the session. Requires the tech + programming infrastructure up front.
2. **Appointment-based lab (Maven model):** premium 90-minute assessments by appointment, remote/app-delivered training between visits. Low floor-hours, high price-point, anchored by pro clientele credibility (Olson, Arenado, Goldschmidt at Maven; Ohtani's fall-2020 stint at Driveline preceding a 33-HR first half and 4 MVPs in 5 years did more for Driveline's hitting business than any study).
3. **Youth academy teams (Driveline Academy):** team-based membership with capped travel/games, training-first calendar — the volume/retention engine and feeder for individual training upsells.

**Membership economics** (facility-management sources): rental/cage-access memberships max out around **40–60 members** with low retention and are "harder to sell than expected"; training memberships (bundled assessment + programming + coaching) support more members, retain better, and carry higher lifetime value; the recommended structure is **both** — rental for practice access, training memberships for development revenue (plausible; practitioner consensus, thin public data).

**Price anchors:** Driveline pro-tier: **$7,500** two-day assessment, **$15,000** full offseason, **$20,000** year-round with advanced scouting. Gym-floor training and youth academy tiers sit far below that. Tech stack: Blast sensors ~$150/unit; HitTrax entry <$10,000; TrackMan ~$19,000 indoor / $24,995 portable-outdoor plus $475–600/yr software subscriptions; force plates ~$5–15k/pair; Edgertronic ~$5–10k/camera; markerless mocap (Maven-style) is the premium differentiator.

**For Soto:** Neptune's positioning (dev-lab, 3–10x commodity-cage pricing) maps to model 1 + 2 hybrid: appointment assessments as the premium front door (Trevor's pro credibility + Mayday content is the demand engine, same as Ohtani was for Driveline), a semi-private data floor for recurring training revenue, and *no* rental-only tier at launch (low retention, brand-diluting). TrackMan is already in hand; the marginal hitting-lab spend is Blast sensors + over/under bats + a med-ball/radar station + (phase 2) force plates — under $5k before force plates.

## 8. Case Studies: Data-Driven Hitting Orgs

**Driveline hitting lab × MLB (2026, ESPN):** White Sox catcher Edgar Quero's two-day, $7,500 assessment — ROM testing, force-plate jumps, BP at 65 mph from 42 ft under eight Edgertronics + full sensor suite. Findings: 67.5 mph bat speed (217th of 226 qualifiers), −8.5° launch angle on left-side pulled balls (vs ~12° league average), contact point too deep (cutting acceleration time), below-average lower-body explosiveness. Prescription: same-side breaking-ball rounds, varied-weight bats, exaggerated hip-coil positions, a "Big Papi" load drill. Their ML swing model compares an athlete's bat path to every MLB hitter and recommends specific changes. Organizational penetration: ~**100 former Driveline employees in MLB orgs** (a dozen with the Red Sox alone); Kyle Boddy advises a front office. This is the template for "facility as R&D lab that pro orgs outsource to."

**Maven Baseball Lab (Atlanta):** founded by two ex-MiLB pitchers; markerless mocap + force plates + Swing Catalyst pressure mapping + Edgertronic; 12-rep/90-min assessments feeding app-delivered plans; MLB clientele as proof-of-concept. Demonstrates a second-mover can win a metro market on assessment quality + pro social proof without Driveline's scale.

**MLB bat-tracking era (2024–):** public Statcast bat speed/swing length/squared-up data (and Driveline's clustering work on it) is standardizing hitter profiling league-wide — the same Big 3 profile → targeted-program logic, now with population benchmarks any facility can cite (proven data, promising as a development framework).

**Pattern across all three:** (1) measurement density at intake, (2) a small set of named metrics athletes understand, (3) explicit goals with dates, (4) scheduled retests, (5) content/credibility as the acquisition channel. None of them sell "lessons."

## Sources

1. Driveline Baseball — What is a Driveline Hitting Assessment? (2021): https://www.drivelinebaseball.com/2021/04/driveline-hitting-assessment/
2. Driveline Baseball — An Introduction to Driveline Hitting Assessments (2018): https://www.drivelinebaseball.com/2018/10/introduction-driveline-hitting-assessments/
3. ESPN — Inside Driveline's hitting lab (Edgar Quero, 2026): https://www.espn.com/mlb/story/_/id/47754884/mlb-2026-driveline-baseball-hitting-lab-analytics-edgar-quero-chicago-white-sox
4. DeRenne et al., Effects of Weighted Bat Implement Training on Bat Swing Velocity, JSCR 1995: https://journals.lww.com/nsca-jscr/abstract/1995/11000/effects_of_weighted_bat_implement_training_on_bat.9.aspx
5. Driveline Baseball — Training Hitters with Weighted Bat Training (2017): https://www.drivelinebaseball.com/2017/01/training-hitters-overload-underload-implements/
6. Driveline Baseball — How to Increase Your Bat Speed (2021): https://www.drivelinebaseball.com/2021/08/hit-the-ball-harder-how-to-increase-your-bat-speed/
7. Driveline Baseball — Optimizing Bat Paths (2026): https://www.drivelinebaseball.com/2026/01/optimizing-bat-paths/
8. Driveline Baseball — Smash Factor: A Data-Driven Approach to Assessing the Hit Tool (2021): https://www.drivelinebaseball.com/2021/02/smash-factor-a-data-driven-approach-to-assessing-the-hit-tool/
9. Driveline Baseball — Using MLB Bat Tracking Data to Better Understand Swings (2024): https://www.drivelinebaseball.com/2024/07/using-mlb-bat-tracking-data-to-better-understand-swings/
10. Strength and Conditioning Programs to Increase Bat Swing Velocity for Collegiate Baseball Players (Sports/MDPI, 2023, n=78): https://pmc.ncbi.nlm.nih.gov/articles/PMC10610610/
11. Rotational Medicine Ball Throw Velocity Relates to DIII Bat Swing/Batted Ball/Pitching Velocity (PubMed, 2021): https://pubmed.ncbi.nlm.nih.gov/34570055/
12. Hall, Domingues & Cavazos — Contextual interference effects with skilled baseball players (1994): https://pubmed.ncbi.nlm.nih.gov/8084699/
13. Blocked vs random practice, collegiate baseball swing (J Sport & Human Performance): https://jhp-ojs-tamucc.tdl.org/jhp/article/view/163
14. MLB.com — What you need to know about Statcast bat tracking (2024): https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
15. MLB Glossary — Fast-swing rate: https://www.mlb.com/glossary/statcast/fast-swing-rate
16. Blast Motion — What Is Bat Speed in Baseball? Age Benchmarks: https://blastmotion.com/blog/what-is-bat-speed-in-baseball/
17. WIN Reality — Bat Speed by Age: https://winreality.com/blog/bat-speed-by-age/
18. Driveline Baseball — Case Study: The Importance of In-Season Training (2021): https://www.drivelinebaseball.com/2021/08/case-study-the-importance-of-in-season-training/
19. Maven Baseball Lab — Assessment / Science / Pricing: https://mavenbaseball.com/assessment/
20. Sports Facility Management Expert — Baseball Facility Memberships: Which Model Is Right? (2026): https://sportsfacilityexpert.com/2026/06/17/baseball-facility-memberships-which-model-is-right-for-your-facility/
21. GameSense Sports — Pitch recognition research (Fadde; walk% and OBP/SLG correlations): https://gamesensesports.com/research-finds-that-pitch-recognition-skill-is-linked-with-season-walk-percentage/
22. Driveline Baseball — What is the Driveline Academy? (2020): https://www.drivelinebaseball.com/2020/08/what-is-the-driveline-academy/
23. Sports Facility Expert — Batting Cage Technology (HitTrax/TrackMan pricing): https://sportsfacilityexpert.com/2024/01/31/innovative-batting-cage-technology-choosing-the-right-one-for-your-facility/
