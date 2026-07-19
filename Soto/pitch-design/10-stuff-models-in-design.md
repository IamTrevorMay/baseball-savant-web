---
title: Using Stuff Models to Guide Pitch Design
domain: pitch-design
tags:
  - stuff-plus
  - pitch-models
  - pitch-design
  - model-gradients
  - arsenal-context
  - bullpen-iteration
  - goodharts-law
  - trackman
sources_reviewed: 22
last_updated: 2026-07-19
---

# Using Stuff Models to Guide Pitch Design

## TL;DR

- **Stuff models are the fastest-stabilizing pitching signal in baseball**: FanGraphs' Stuff+ stabilizes at roughly **80 pitches**, vs ~400 pitches for Location+ and ~400 pitches (4–5 starts) before Pitching+ beats preseason projections for starters. tjStuff+ shows **0.85 year-over-year stickiness**. That speed is exactly why they are the right feedback tool for a bullpen-to-bullpen design loop — and why they get over-trusted. (proven)
- **Models tell you *where* value is, not *how* to get it**: the design-relevant content is the gradient. Driveline's 2024 model shows fastball value goes **exponential above ~96 mph**, sinkers out-grade four-seamers **below ~97 mph**, low-spin-efficiency (gyro-heavy) pitches got a valuation bump, and cutters were the biggest gainers while sweepers took the biggest haircut as hitters adapted. (promising)
- **Physical tradeoffs constrain what the gradient asks for**: in Driveline's breaking-ball work (240 cutter / 734 slider pitcher samples), curveballs lose ~**2.5% spin efficiency per +1 mph**, cutters *gain* ~**5.5% per +1 mph**, and sliders split roughly 50/50 — so "add 2 mph and keep the shape" is often physically incoherent. Fit the athlete's own tradeoff curve, not the league's. (promising)
- **Single-pitch stuff scores miss arsenal interaction**: Baseball Prospectus' 2024–25 arsenal metrics (pitch-type probability, movement/velocity spread, surprise) show the familiarity penalty hitters impose on repeat viewings **weakens substantially** for pitches with above-average arsenal deception, and Driveline's Arsenal+ (Saberseminar 2024) was built explicitly because isolated stuff grades misprice pitches. Secondary grades in most models are *already* conditional on the primary fastball — change the fastball and every secondary regrades. (promising)
- **Chasing stuff has a documented injury cost**: a 2025 AJSM case-control study (115 MLB UCL-reconstruction pitchers vs 230 controls, 2018–2023) associated surgery with higher velocity on fastballs/changeups/sinkers, higher slider spin, longer cutter extension, and significant Stuff+ differences on changeups. Velocity, max intent, and stuff optimization are the leading suspects in the MLB injury wave (Sarris, The Athletic, Apr 2024). Model score is not free. (promising)
- **Goodhart's law applies**: a stuff model is trained on league-average context and yesterday's hitters. Sweepers graded elite in 2021–22 models, then were marked down in Driveline's 2024 retrain after hitters adjusted; Kyle Hendricks-type command outliers chronically beat their botStf grades. Optimize the model score *subject to* command retention, arsenal fit, and workload — never as the sole objective. (proven)
- **The per-bullpen loop is a two-stage gate**: shape validation needs only **dozens of tracked reps** in stable conditions (same mound/ball/unit); in-game effectiveness needs **hundreds of pitch samples** or model-based shortcuts. Enter design blocks with ACWR ~0.8–1.3 held 2–4 weeks, change **one variable at a time**, and separate low-volume "shape" sessions from game-like "execution" sessions. (promising)
- **The frontier is seam-level feedback**: Driveline's April 2026 computer-vision tool reads spin axis *and seam orientation* from high-speed video in near-real-time — data previously exclusive to MLB org labs — letting a coach diagnose non-Magnus movement mid-session (a staffer partially replicated Tatsuya Imai's "backward slider" in ~50 throws). (promising)

## 1. The Model Landscape: What Each Stuff Model Actually Sees

All public stuff models share a skeleton: take pitch-level tracking features that the pitcher physically controls, predict an outcome-derived target (usually run value), and rescale. The differences matter for design work because they determine *which knobs the model can even see*.

- **FanGraphs Stuff+** (Eno Sarris & Max Bay): decision-tree model trained against run values. Inputs: release point, velocity, vertical/horizontal movement, spin rate, and an "axis differential" term that proxies seam-shifted wake. Secondaries are defined *relative to the primary fastball by usage*. Scale: 100 = average, **10 points = 1 SD at the pitch level**. Average Stuff+ by pitch type ranges from **87.2 (changeup) to 110.8 (slider)** — a "100 slider" is a below-average slider. (proven, as a description of the model)
- **PitchingBot / botStf** (Cameron Grove, now in-house at FanGraphs): XGBoost ensemble predicting individual outcome probabilities (swinging strike, called strike, batted-ball quality), aggregated to xRV and expressed on the **20–80 scouting scale** (50 = MLB average). botStf uses velocity, spin rate, movement, release point, extension, spin efficiency, and axis deviation; botCmd is location+count only; botOvr combines them. Explicitly cannot see command intent, deception, or sequencing — Kyle Hendricks types chronically outperform their grades. (proven)
- **Driveline Stuff+** (2021, revised May 2024): five ball-flight inputs — velocity, vertical break, horizontal break, arm angle, extension — grading within three buckets (fastballs; cutter/slider/sweeper/curve; changeup/splitter) that are **not cross-comparable**. The 2024 revision added (a) primary-pitch context *split by batter handedness* (e.g., Aaron Nola's primary differs vs LHH and RHH), and (b) **location-adjusted vertical and horizontal approach angles**, which finally let the model reward flat-VAA rides from low slots and non-Magnus movement it was previously agnostic to. (proven, as description)
- **tjStuff+ v3.0** (Thomas Nestico, public): LightGBM on ~1.6M pitches (2020–23 train, 2024 test), 11 features including **speed_diff and acceleration_diff vs the pitcher's primary fastball** — arsenal-relative by construction. Targets xRV; year-over-year stickiness **0.85**; strongest correlation to next-year wOBA among the conventional metrics he tested, weak *descriptively* because it ignores location. Interpretation anchor: a 130 pitch ≈ **+2 runs per 100 pitches** vs average. (promising — public model, single author validation)
- **Triton Stuff+** (in-house): z-score model, `100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`, per pitch_name × game_year baselines. This is a *descriptive percentile* model, not an outcome-trained model — it cannot express interaction effects (velo×shape tradeoffs, primary-pitch context, approach-angle adjustments) that every model above learned from data.

**For Soto:** Triton's linear z-score Stuff+ is fine as a leaderboard but is the wrong instrument for pitch-design guidance: its gradient is constant (every mph is worth 4.5/σ points everywhere), while the real value surface is exponential in fastball velo above ~96 and bucket-dependent everywhere else. A v2 trained on run value from the 7.4M-pitch table — even a modest LightGBM with tjStuff+'s 11-feature template — is the single highest-leverage model upgrade for both the platform and Neptune's design lab.

## 2. Reading the Gradient: How Models Tell You What to Change

A stuff score is a point estimate; a design plan comes from the **local gradient** — hold the pitcher's profile fixed, perturb one feature, and watch the grade. Every serious lab operationalizes this as a what-if tool: Driveline's "Blob" visualization in TRAQ projects how arsenal changes re-grade each pitch; FanGraphs' public PitchingBot Visualizer lets you toggle pitch type, handedness, count, and location and watch 20–80 grades move; Driveline's writeups explicitly frame the coaching question as "a 79-mph slider with more movement vs an 83-mph gyro-ish slider — which do we develop?" (proven, as practice)

The stable gradient findings worth memorizing (all from Driveline's 2024 retrain unless noted):

- **Fastball velocity is convex**: value is roughly flat-to-linear through the low 90s, then bends sharply upward around **96 mph**. A 93→94 gain buys little model value; 96→97 buys a lot. (promising)
- **Below ~97 mph, sinkers out-grade four-seamers**: with league-wide whiff rates on ride-fastballs falling as hitters adapted to velocity, the 2024 model prefers the sinker profile at average velo. The generic "everyone needs a carry four-seam" era is over. (promising)
- **Approach angles beat raw break for fastballs**: a low release that produces flat location-adjusted VAA can carry an above-average fastball grade at pedestrian break numbers (the Josh Hader archetype). Design lever: slot and extension, not just spin efficiency. (promising)
- **Low spin efficiency got repriced upward**: gyro-heavy pitches (hard gyro sliders, bullet cutters) grade better in 2024-era models than 2021-era models. (promising)
- **Bucket repricings**: cutters were the largest gainers (brought up to ~average), four-seamers reduced significantly, curveballs bumped slightly, sweepers hit hardest while still above average. (promising)
- **Velocity–shape tradeoffs are individual**: Driveline's breaking-ball studies (240 cutter pitchers, 734 slider pitchers, two seasons) found curveballs lose ~**2.5% spin efficiency per +1 mph**, cutters *gain* ~**5.5% per +1 mph**, and sliders split nearly 50/50 across the sample. They recommend fitting **each pitcher's own tradeoff line** and predicting expected shape at the new velo — a pitch losing less than its predicted velo-for-shape cost is outperforming. (promising)

The right mental model: the stuff model defines the objective surface; the athlete's physical tradeoff curves define the feasible region; pitch design is constrained optimization at their intersection.

**For Soto:** Build the gradient view into the Compete session page: for each tracked pitch type, show current grade plus one-feature sensitivities ("+1 mph ≈ +X", "+2 in IVB ≈ +Y", "−2° VAA ≈ +Z") computed from the model against that athlete's baselines. That is the coach-facing artifact — a "what to change" card, not a leaderboard.

## 3. Designing to Model Targets vs Designing to Hitters

Stuff models grade a pitch against the *league-average context embedded in training data*. Hitters are not league-average contexts; they are specific bat paths, platoon splits, and expectation sets. Three bodies of evidence say the hitter-side view materially changes the design target:

1. **Arsenal interaction is real and measurable.** BP's arsenal metrics model the batter's perceptual problem — pitch-type probability at release, the movement/velocity *spread* of what could be coming, and post-hoc "surprise." Findings: hitters make progressively better swing decisions on repeat viewings of a pitch, but that familiarity penalty **weakens substantially when the pitch carries above-average arsenal deception**, and high-deception pitches sustain whiff rates despite familiarity. The exemplars (Tobias Myers, Chris Bassitt, Matt Waldron) are not stuff monsters — they are release-matched, wide-spread arsenals. (promising)
2. **Models are already partially arsenal-relative — so design changes propagate.** FanGraphs Stuff+ defines secondaries off the primary fastball; Driveline's 2024 model conditions on the primary pitch *per handedness*; tjStuff+ carries speed/acceleration differentials vs the primary. Practical consequence: adding 2 mph to the four-seam, or switching primary from four-seam to sinker, **re-grades every secondary** without touching them. Design the arsenal as a system. Driveline's Arsenal+ (Britton, Hejka, Lambert, Ramilo, Saberseminar 2024) formalizes this because isolated stuff grades systematically misprice pitches in context. (promising)
3. **Non-Magnus movement is disproportionately hitter-hostile.** Seam-shifted wake movement deviates from what the hitter's spin-reading expectation predicts; hitters have essentially no visual countermeasure until they have faced the pitch (BP's SSW work; Pitching.Dev). Older models literally could not see it — a Magnus-only movement model has no SSW term — which is why axis-deviation features were retrofitted into Stuff+, PitchingBot, and Driveline 2024. A pitch can gain hitter-facing deception with little change in raw break numbers. (promising)

The **kick change** is the canonical case of designing to the hitter and the athlete rather than to a model target: Leif Strom (Tread Athletics, 2023) designed it so *supinators* — who structurally can't pronate a conventional changeup — could get arm-side fade and sink from slider-like hand action via a spiked middle-finger "kick" that tilts the axis forward. Hayden Birdsong took it to MLB first (2024); by 2025 adopters included Andrés Muñoz, Pablo López, and three Mets starters (Holmes, Canning, Megill), and it became the consensus "pitch of 2025." No stuff model asked for that pitch; the design question was "what can this hand actually produce that solves the opposite-hand platoon problem?" — and the model then *validated* the resulting shape. (proven, as history)

Practical synthesis — order of operations for a design target:

1. Identify the arsenal hole (platoon split, count you can't finish, zone quadrant you can't attack).
2. Identify what the athlete's biomechanics/wrist bias can produce cheaply (pronation vs supination bias first).
3. Generate candidate shapes; use the stuff model to rank them and set shape targets.
4. Sanity-check against arsenal metrics: release matching, velocity spread, tunnel with the primary.

Model as **evaluator and ranker**, not as originator.

**For Soto:** This is exactly where Triton's existing `deception_score`/`unique_score` tables earn their keep — pair a stuff grade with a uniqueness/deception grade on every design card, and flag the "high stuff, low unique" pitches (league-common shapes hitters see constantly) as fragile. For Neptune intake, a supination/pronation bias screen (Bannister-style) should precede any changeup/breaking-ball design plan.

## 4. Pitfalls of Chasing Model Scores

- **Goodhart's law / hitter adaptation.** When a measure becomes a target, it degrades. The sweeper is the cautionary tale: graded elite in 2021–22 models, thrown league-wide, then marked down "hardest hit" in Driveline's 2024 retrain as hitters adjusted; sweeper usage began declining in 2025. FanGraphs' "Why Is It Always the Year of the (Insert Pitch Here)?" documents the meta-cycle: model finds inefficiency → league copies → inefficiency closes → model retrains. A design built on a fashionable shape has a shelf life; a design built on *the athlete's* outlier trait does not. (promising)
- **The stuff–command tradeoff.** Models with no command term will happily recommend shapes the athlete can't locate. FanGraphs' own primer: Location+ takes ~400 pitches to stabilize and is far less sticky year-to-year than Stuff+ — meaning a design that trades command for stuff shows its benefit immediately (80 pitches) and its cost slowly. PitchingBot's documentation names command-first outliers (Hendricks) as systematic model misses. Rule of thumb from practice: a shape change that costs more than ~1 SD of location quality usually nets negative until command is re-trained. (plausible — the specific threshold is practitioner heuristic, not published)
- **Injury externalities.** Mastroianni et al., *AJSM* May 2025 (case-control, 115 MLB UCLR pitchers vs 230 matched controls, 2018–2023): surgery associated with higher fastball/changeup/sinker velocity, higher slider spin rate, greater cutter release extension, and large significant Stuff+/Pitching+/Location+ differences on several pitch types (notably changeup Stuff+). Regression flagged velo (FB/SL/CH), slider spin, and cutter extension. (promising — Level 3 evidence, association not causation) Sarris's April 2024 Athletic investigation names velocity, max-effort intent, and "stuff-chasing" analytics culture as leading suspects in the injury surge. (plausible) Every design block that adds velo, spin, or extension is a workload decision, not just a model decision.
- **Descriptive ≠ predictive ≠ prescriptive.** tjStuff+ is *weakly descriptive* of same-season results (no location) while strongly predictive of next-season wOBA; Stuff+ stabilizes in 80 pitches but FanGraphs cautions that with veterans, "the longer a pitcher is in the big leagues, the more their actual results matter." A pitch that grades 115 but has run a .400 wOBA for two seasons has a real problem the model can't see (tipping, tunnel violation, usage). (proven)
- **Model disagreement and version drift.** Stuff+ and botStf disagree substantially on individual pitches (different features, targets, scales), and every retrain reprices shapes (cutters up, sweepers down, 2024). Chasing a single model's number to the decimal point is overfitting to one snapshot of one model. Use two models; design to the *direction* both agree on. (promising)
- **Skipping the hierarchy.** Driveline's Pitching Hierarchy of Needs (July 2024) puts strength/power, recovery, and throwing-program compliance *below* mechanics and pitch design, with a 4–6 week on-ramp before mechanical interventions. Velocity "correlates to key markers of performance better than any other trainable variable" — a 90-mph athlete polishing a 55-grade sweeper is optimizing the wrong layer. (promising)

**For Soto:** Trevor's own arc is the counterexample worth encoding: post-TJ longevity came from workload sanity, not perpetual shape-chasing. Neptune's programming templates should hard-gate pitch-design blocks behind the hierarchy (velo floor + ACWR stability) and log every design block as a workload event in the athlete record.

## 5. The Per-Bullpen Iteration Loop

The modern loop — pioneered by Driveline pairing Edgertronic high-speed video with TrackMan ball-flight data, now standard at Tread (5+ TrackMan units, Edgertronic, force plates) — runs as a stage-gated cycle:

**Entry gate (before the block starts):** stable throwing base — ACWR held ~**0.8–1.3 for 2–4 consecutive weeks**, no upward trend past ~1.3–1.5; consistent release parameters at baseline. Late-HS through pro is the appropriate developmental window; pre-pubertal athletes get foundations, not pitch design. (promising)

**Stage 1 — shape validation (dozens of reps).** Physics metrics (velo, HB/VB, spin axis, release height/side/extension, approach angles) stabilize within *dozens* of tracked throws **if conditions are held constant** — same mound, same ball type, same tracking unit. Protocol per session:

1. Re-establish the primary fastball lane first (5–10 pitches) so differentials are measured against a live baseline, not a stale season average.
2. Change **one variable** on **one pitch** (grip, seam orientation, cue, wrist orientation). Never stack changes — attribution dies.
3. Cluster 5–8 reps per variant; read the session as *distributions* (median shape + spread), not single pitches. A variant whose movement SD is huge isn't a shape yet.
4. Score each variant with the stuff model *and* check release invariance vs the fastball (release point drift >~2–3 inches is a tunneling/tipping red flag). (plausible — threshold is practitioner heuristic)
5. Pick one winner to carry forward; park the rest. High feedback density, low volume, strict intensity caps — this is a *shape* session, not a competition session.

**Stage 2 — execution and game validation (hundreds of pitches).** Separate execution sessions run game-like sequencing with minimal experimentation: throw the new pitch in realistic counts, to targets, tracking location quality alongside shape retention. In-game effectiveness metrics (whiff%, chase%, run value) stabilize slowly — **hundreds of pitch-type samples** — because opponent quality, count leverage, and sequencing dominate small samples; a handful of good outcomes is not "game-ready." Model-based grades are the variance-reduction shortcut: the stuff grade on 30 game pitches is far more reliable than the results on 30 game pitches. (promising)

**Feedback stack, in order of loop speed:** (1) immediate — velo/shape readout per pitch (TrackMan/Rapsodo); (2) same-rep — high-speed video of hand/seam at release (Edgertronic); (3) new in 2026 — computer-vision seam-orientation + spin-axis tracking (Driveline, Apr 2026): CNNs trained on thousands of labeled pitch images output seam orientation and true spin-based axis in near-real-time, separating Magnus from non-Magnus contribution mid-session — capability previously locked inside MLB org labs. In its debut case study a Driveline staffer used it to partially replicate Tatsuya Imai's arm-side "backward slider" in roughly **50 throws** (gyro component not fully captured in one session). (promising)

**Kill criteria.** Pre-register them: if after ~3–4 shape sessions the variant hasn't reached (a) target shape within tolerance, (b) acceptable shape variance, and (c) no more than modest command regression, park it for the next offseason. Chronic tinkering is itself a failure mode — it steals reps from the pitches that pay the bills.

**For Soto:** This loop is Neptune's core product and it maps 1:1 onto existing Triton plumbing: Compete TrackMan ingest → per-session "design card" (variant tags on pitches, distribution plots, stuff grade + delta vs last session, release-invariance check, command score) → longitudinal design-block tracker with ACWR gate status. The missing pieces are (1) a pitch-variant tagging UI at ingest, (2) the outcome-trained model from §1, and (3) session-over-session delta views. All three are incremental, shippable additions to the Compete section.

## 6. Benchmarks Worth Pinning to the Wall

| Quantity | Value | Source |
|---|---|---|
| Stuff+ stabilization | ~80 pitches | FanGraphs primer |
| Location+ stabilization (α≈0.9) | ~400 pitches | FanGraphs primer |
| Pitching+ beats projections | ~250 p (RP) / ~400 p (SP) | FanGraphs primer |
| Stuff+ scale | 100 avg, 10 pts = 1 SD (pitch level) | FanGraphs primer |
| Avg Stuff+ by pitch type | 87.2 (CH) → 110.8 (SL) | FanGraphs primer |
| botStf scale | 20–80, 50 = MLB average | PitchingBot primer |
| tjStuff+ stickiness (Y→Y+1) | r ≈ 0.85 | Nestico v3.0 |
| tjStuff+ 130 pitch | ≈ +2 runs / 100 pitches | Nestico v3.0 |
| FB velo inflection | ~96 mph (exponential above) | Driveline 2024 |
| Sinker > 4-seam grade below | ~97 mph | Driveline 2024 |
| CB spin-eff cost of velo | ~−2.5% per +1 mph | Driveline BB Part II |
| Cutter spin-eff gain with velo | ~+5.5% per +1 mph | Driveline BB Part II |
| UCLR case-control | 115 cases / 230 controls, velo + slider spin + cutter extension flagged | AJSM 2025 |
| Design-block entry ACWR | 0.8–1.3 held 2–4 wks | Premier Pitching |
| Shape validation sample | dozens of reps (stable conditions) | Premier Pitching |
| Game validation sample | hundreds of pitches | Premier Pitching |

## Sources

1. Driveline Baseball — "What is Stuff? Quantifying Pitches with Pitch Models" (Dec 2021): https://www.drivelinebaseball.com/2021/12/what-is-stuff-quantifying-pitches-with-pitch-models/
2. Driveline Baseball — "Revisiting Stuff+: An Update on Driveline's Methodology" (May 2024): https://www.drivelinebaseball.com/2024/05/revisiting-stuff-plus/
3. FanGraphs Library — "Stuff+, Location+, and Pitching+ Primer": https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer/
4. FanGraphs Library — "PitchingBot Pitch Modeling Primer": https://library.fangraphs.com/pitching/pitchingbot-pitch-modeling-primer/
5. FanGraphs — "PitchingBot and Stuff+ Pitch Modeling Is Now on FanGraphs!": https://blogs.fangraphs.com/pitchingbot-and-stuff-pitch-modeling-are-now-on-fangraphs/
6. FanGraphs Lab — PitchingBot Visualizer: https://www.fangraphs.com/lab/pitching-bot-visualizer
7. Driveline Baseball — "Optimizing Breaking Ball Shape Through Data-Driven Pitch Design, Part II" (Oct 2021): https://www.drivelinebaseball.com/2021/10/optimizing-breaking-ball-shape-through-data-driven-pitch-design-part-ii/
8. Driveline Baseball — "Maslow, Bernoulli, and Baseball: The Pitching Hierarchy of Needs" (Jul 2024): https://www.drivelinebaseball.com/2024/07/the-pitching-hierarchy-of-needs/
9. Baseball Prospectus — "Introducing BP's New Arsenal Metrics": https://www.baseballprospectus.com/news/article/96026/introducing-new-arsenal-metrics/
10. URAM Analytics — "From Stuff to Strategy: Improving MLB Pitch Profiles and Optimizing Usage" (incl. Driveline Arsenal+, Saberseminar 2024): https://www.uramanalytics.com/post/from-stuff-to-strategy-improving-mlb-pitch-profiles-and-optimizing-usage
11. Thomas Nestico — "Modelling tjStuff+ v3.0" (Medium): https://medium.com/@thomasjamesnestico/modelling-tjstuff-v3-0-10b48294c7fb
12. Mastroianni MA et al. — "Pitch-Specific Advanced Analytic and Pitch-Tracking Risk Factors for UCL Injuries in MLB Pitchers," *Am J Sports Med* (May 2025): https://pubmed.ncbi.nlm.nih.gov/40230317/
13. UAB Medicine — "UAB researcher links pitching styles to MLB injuries": https://www.uabmedicine.org/news/uab-researcher-identifies-pitches-linked-to-mlb-injuries-and-offers-guidance-for-young-athletes/
14. Premier Pitching — "The Pitch Design Phase in Baseball: Developmental Fit, Workload-Informed Timing, and Evidence-Based Evaluation Thresholds": https://premierpitching.com/blogs/premier-pitching-chronicles/the-pitch-design-phase-in-baseball-developmental-fit-workload-informed-timing-biomechanical-determinants-of-effectiveness-and-evidence-based-evaluation-thresholds
15. Driveline Baseball / Travis Sawchik — "Investigating a Mystery Pitch as a Test Case for a New (Computer) Vision for Pitch Design" (Apr 2026): https://www.drivelinebaseball.com/2026/04/investigating-a-mystery-pitch-computer-vision-pitch-design/
16. Lookout Landing — "What the 'kick change' is and why it's going to be the pitch of 2025": https://www.lookoutlanding.com/2025/2/28/24367452/what-the-kick-change-is-pitch-of-2025-andres-munoz-brian-bannister-supination-pronation
17. ESPN — "How the kick change — MLB's hottest new pitch — has kick-started the Mets' rotation" (2025): https://www.espn.com/mlb/story/_/id/45007922/mlb-2025-kick-change-changeup-new-york-mets-holmes-canning-megill
18. Baseball America — "5 MLB Pitchers Experimenting With A Kick-Change for 2025": https://www.baseballamerica.com/stories/5-mlb-pitchers-who-have-added-a-kick-change-baseballs-trendiest-new-pitch-for-2025/
19. Eno Sarris, The Athletic (Apr 9, 2024) — pitcher injury causes (discussion archive): https://northsidebaseball.com/forums/topic/52820-eno-sarris-on-what-is-causing-pitching-injuries/
20. Baseball Prospectus — "We're Talking About Seam-Shifted Wake Wrong": https://www.baseballprospectus.com/news/article/74601/climbing-the-ladder-were-talking-about-seam-shifted-wake-wrong-axis-deviation/
21. FanGraphs — "Why Is It Always the Year of the (Insert Pitch Here)?": https://blogs.fangraphs.com/why-is-it-always-the-year-of-the-insert-pitch-here/
22. Tread Athletics — pitching development process and tech stack: https://treadathletics.com/
