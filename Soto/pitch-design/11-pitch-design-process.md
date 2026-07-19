---
title: The Pitch Design Process End-to-End
domain: pitch-design
tags:
  - pitch-design
  - arsenal-audit
  - pronation-supination
  - bullpen-structure
  - motor-learning
  - transfer-to-games
  - workload-management
  - kick-change
sources_reviewed: 24
last_updated: 2026-07-19
---

# The Pitch Design Process End-to-End

## TL;DR

- **Pitch design is now table stakes, not an edge.** MLB arsenal additions roughly doubled from 0.27 new pitches per pitcher (2021–22) to 0.53 (2024–25); about half of all MLB pitchers added at least one pitch in the most recent offseason. The edge has moved from *whether* you design pitches to *how well you select the target and transfer it to games* (proven).
- **The intake decides the outcome.** A proper audit covers current pitch shapes vs. league benchmarks (Stuff+-style grading), platoon splits, release slot/height/extension, spin-efficiency profile, seam-shifted-wake deviation, and pronation/supination bias. Designing against a pitcher's bias produces inconsistent shapes and, per practitioner consensus, added arm strain (promising).
- **Fast pitches to learn exist — when grip does the work.** The kick change went from Leif Strom's 2023 archive search (<50 matching pitches in Tread's entire database) to league-wide adoption in ~18 months; Davis Martin learned it *between starts* and threw 6 scoreless the next day; Clay Holmes built his in a Nov–Dec offseason block (88 mph, −10" VB) and posted a 38.2% whiff rate on it by May 2025. Effort-driven shapes (Bauer's slider) take a full offseason of months (proven, as case evidence).
- **Structure design work as two session types**: low-volume, high-feedback-density *shape* sessions (with Rapsodo/TrackMan + high-speed video every rep) and game-like *execution* sessions with no experimentation. Keep new-pitch reps at ~10–25 per high-intent throwing day, bullpens at 20–30 pitches in-season (50 absolute ceiling, broken into sets of 15–20 with ~5 min rest), with ≥2 full days between mound days (promising).
- **Time design blocks to workload, not the calendar.** Enter a design block only after 2–4 consecutive weeks with acute:chronic workload ratio in the 0.8–1.3 band; defer if trending past ~1.3 toward the ~1.5 injury-risk threshold. Muscle-damage markers take ~72 hours to return to baseline after a mound session (promising).
- **Progress has a metrics ladder with very different sample sizes.** Shape stability needs dozens of tracked reps; command needs miss-distance tracking (MLB average miss ≈ 11–12 inches; a 3-inch improvement ≈ 1 WAR per Driveline); in-game effectiveness needs *hundreds* of pitch samples or a stuff-model prior. Judging a new pitch on 15 game reps is noise (promising).
- **Most new pitches that fail, fail at selection — not execution.** 2026 examples: Logan Gilbert's 92-mph cutter (.355/.613 vs LHH, 5.3% SwStr, shelved by June 9) failed for insufficient velocity separation and no sequencing role, while his changeup (.172 BAA, 30% whiff) succeeded; deGrom's revived sinker failed contact suppression (−2.5 RV). Meanwhile Drew Rasmussen's changeup (1%→12% usage, 42.7% whiff, .190 xwOBA) and Ben Brown's tunnel-purposed sinker worked because they had a defined job (proven, as case evidence).
- **The curveball-hurts-kids claim is debunked; fatigue is the real risk.** No significant curveball–injury association in a 754-pitcher survey (ages 9–18) or a 10-year prospective study of 481 youth pitchers; pitch counts and throwing while fatigued show strong associations with pain and injury (proven). Design-block workload guardrails matter more than pitch-type fear.

## 1. Why Pitch Design Is Now Table Stakes

The market data is unambiguous. The sweeper went from 2.28% of MLB pitches in 2021 to 4.36% (2022), 6.33% (2023, first year of the official label), 7.17% (2024), and ~7.5% (2025); righty-vs-righty sweeper usage ballooned from 2.6% to 10.7% over the same window (proven). The rate of arsenal expansion league-wide roughly doubled in four years — 0.27 net new pitch additions per pitcher in 2021–22 to 0.53 by 2024–25 — with sinkers and cutters the most consistently added pitches by net impact and splitter-family additions growing ~2.8–4x (proven). FanGraphs' 2026 audit flagged 38 starters with "new" pitches, trimmed to 32 after removing relabels (criteria: <2% prior usage, >8% current, 50+ IP in 2025 and 30+ in 2026).

Two implications. First, the *addition itself is baseline noise* — Athlon's framing is correct that with half of pitchers adding something every winter, an added pitch only matters if it passes a two-step test: confirmed movement differentiation, then confirmed contact suppression (xwOBA, hard-hit rate) (promising). Second, pitch ideas now propagate in weeks, not years ("It's a copycat league… it spreads like wildfire" — Jeremy Hefner, Mets pitching coach). The durable advantage is process quality: intake accuracy, target selection logic, and transfer discipline.

**For Soto:** This is exactly Neptune's differentiation thesis. A cage barn can teach a grip off TikTok; a development lab wins on the audit → target → transfer pipeline, instrumented through Compete/TrackMan and graded with Triton's Stuff+/command/deception models.

## 2. Intake: The Arsenal Audit

The audit is a measurement session plus an analysis pass, and every serious shop runs some version of Driveline's loop: assess every current pitch against level-appropriate peer benchmarks, identify the weakest link or the biggest gap, then design against it (their remote process: baseline session → data into TRAQ → EDGE report grading each pitch with a Stuff+ model → grip/cue experiments → follow-up sessions) (promising).

Minimum viable data per pitch (Premier Pitching's list matches Triton's schema almost 1:1): velocity, horizontal/vertical movement, spin rate, spin axis/tilt, release height, side, and extension, and vertical/horizontal approach angles (VAA/HAA). Add to that:

- **Spin efficiency by pitch type.** Classic Driveline benchmarks: a gyro slider targets ~0% efficiency (case study: Casey Weathers, 20–30% → ~5%); a curveball targets >90% (Dean Jackson, 80% → 90%+) (promising). The design insight: "the key to off-speed isn't total spin, but the relationship between spin rate and spin axis."
- **Seam-shifted-wake deviation** — the gap between spin-based expected movement and observed (Hawk-Eye) movement. SSW adds, on average, 3+ inches of run and ~4 inches of drop to sinkers, ~3 inches of glove-side and ~2 inches of drop to cutters, and can *cost* four-seamers ~2 inches of ride; gyro spin contributes at most ~2 inches of glove-side movement at 2,500 rpm (median slider/cutter gain: 0.75") (proven — Hawk-Eye validated, park-level spin-direction error <2°, 21/30 parks <1°). Driveline found 42% of pitches showed lower stuff grades than their spin-based estimates implied, and that sinkers essentially *require* seam effects to clear the effective-MLB threshold (promising).
- **Platoon splits and role.** The most common audit finding at every level is a missing platoon-neutral weapon (Driveline's Justin Silva case: good 9:00-axis slider vs. RHH, nothing for LHH → changeup chosen over cutter because the ceiling graded higher).
- **Slot and release consistency.** Release height/side define which shapes tunnel off the fastball and which VAA the fastball lives at; a low slot changes what "ride" is worth and what breaking-ball axis mirrors cleanly (plausible-to-promising; the geometry is arithmetic, the effect sizes on outcomes are model-dependent).

Video completes the audit: Edgertronic-class high-speed capture (~2,000 fps) shows finger-ball interaction at release. The canonical example is Trevor Bauer's slider build — Edgertronic revealed his middle finger dragging down the ball on bad reps, destabilizing the axis; the fix was a grip change letting the middle finger come off the ball (proven, as a case; the tool's diagnostic value is consensus). Driveline's "trifecta" is Rapsodo-class tracking + high-speed video + marked spin-axis balls.

**For Soto:** The Neptune intake report should be a single generated artifact from a Compete session: per-pitch shape table vs. `league_averages` benchmarks by level, Triton Stuff+ grade, spin-efficiency and SSW-deviation columns (TrackMan gives spin axis + observed movement, so deviation is computable), platoon-split flags, and release-consistency ellipses. That's a Reports Builder template, not new infrastructure.

## 3. Pronation/Supination Bias and Slot: The Physical Prior

Before choosing a target, establish the athlete's forearm bias — the strongest single prior on what will come easily. Popularized by Brian Bannister and operationalized by Tread Athletics:

- **Supination bias** — tendency to get on the *outside* of the ball at release. These athletes spin breaking balls easily (sweepers, gyro sliders, hard curves) and typically struggle to kill spin or run the ball arm-side. Gerrit Cole is the archetype: slider −4.9" HB / 0 IVB at 89.1, curve −10.6/−16.5 at 82.9, but a firm 89.1-mph changeup that never separated (promising).
- **Pronation bias** — tendency to get on the *inside* of the ball. These athletes flash high-efficiency ride fastballs, quality changeups, and firm cutters, but their breaking balls lack depth or power. Max Scherzer's classic arsenal: 15" HB changeup at 83.8, tight −1.5/6.3 cutter, modest slider (promising). Tread's "pronator's triangle" arsenal template: ride fastball + gyro cutter/slider + changeup.
- Both groups pronate after release (everyone does — it's the deceleration mechanism); supinators simply delay it. Practitioner consensus holds that repeatedly forcing shapes against bias yields inconsistent movement and possibly added arm strain (plausible — biomechanically coherent, not yet demonstrated in injury data).

The 2024–25 kick change story shows why bias assessment pays. Leif Strom (Tread, 2023) went looking for a changeup *for supinators* — athletes whose conventional changeups floated. Searching Tread's internal pitch archive he found fewer than 50 pitches matching the desired profile; the resulting grip (middle finger spiked on a seam, "kicking" the axis forward; ring finger cutting to drop efficiency) lets a supinator produce splitter-like depth from changeup-like arm action, typically 88–90 mph with negative vertical break (proven, as case evidence of the design logic; the pitch's league-wide durability is still accumulating). Assessment methods in the field range from Edgertronic release review, to how an athlete naturally spins a football/frisbee, to simply which shapes have historically come easily — there is no validated clinical test (plausible).

**For Soto:** Bias is inferable from data Triton already has: spin-efficiency-by-pitch-type fingerprint + movement-plot asymmetry + SSW deviation direction. A `bias_score` per pitcher (supination ↔ pronation continuum) computed from Compete/Statcast shape data would formalize what Tread does by eye, and it feeds directly into design-target recommendations in the intake report.

## 4. Selecting the Design Target

Selection is where most value is created or destroyed. The 2026 case set gives a clean rubric — a new pitch needs at least one *defined job*:

1. **Fill a platoon gap** (Gilbert's changeup vs. LHH: .172/.207, 30% whiff, .232 xwOBA — succeeded; his 92-mph cutter aimed at the same problem failed at .355/.613 with 5.3% swinging strikes because it had no velocity separation and no deception, shelved by June 9) (proven, as cases).
2. **Create a tunnel/sequencing pair** (Ben Brown's sinker: Stuff+ 100, 5" less drop than average, added explicitly to tunnel with his four-seam and set up his knuckle-curve; hard-hit 33%) (promising).
3. **Add a chase/whiff weapon below the zone** (Rasmussen's changeup: 1%→12% usage, thrown out-of-zone 72%, 33.6% chase, 42.7% whiff, .190 xwOBA, 82.8 mph average EV — career-low 2.45 ERA followed) (proven, as a case).
4. **Fit the bias** — pick the shape the arm wants to make. The anti-case: Jacob deGrom's revived 2026 sinker failed the contact-suppression test (−2.5 RV) despite elite raw stuff (proven, as a case).

Two supporting principles from the aerodynamics literature: (a) **spin mirroring** — pairs whose axes oppose each other (e.g., ride fastball / 12-6 curve) present identical early flight (plausible-to-promising; hitter-perception mechanism is inferred, not directly measured); and (b) **seam effects are a design lever, not a curiosity** — grip/release orientation that positions seams to trip boundary-layer separation adds inches of movement no Magnus model predicts, which is how discoball changeups, SSW sinkers, and the kick change work (proven aerodynamically via Utah State/Barton Smith wind-tunnel work and Hawk-Eye deviation data).

Selection also weighs *learnability*: grip-driven shapes (kick change, seam-effect sinker, spiked breaking balls) transfer in days-to-weeks because movement comes from ball orientation, not new intent patterns; effort- or wrist-orientation-driven shapes (power slider for a pronator, riding four-seam for a low-efficiency arm) can take a full offseason and may never stabilize (promising — consistent across Tread/Driveline case reports).

**For Soto:** This rubric is scoreable. For each candidate pitch: bias-fit score, arsenal-gap score (platoon + tunnel geometry vs. existing shapes), and expected Stuff+ of the target shape from Triton's model. Rank candidates, pick one — practitioners are near-unanimous that you design **one pitch per block**.

## 5. The Design Block: Bullpen Structure, Rep Counts, and Workload Guardrails

**When to schedule.** Premier Pitching's evidence-based framing: enter a design block only after the athlete has held an acute:chronic workload ratio of 0.8–1.3 for 2–4 consecutive weeks; defer if ACWR trends past ~1.3 toward ~1.5, the elevated-injury-risk zone (promising — ACWR's injury-prediction validity is contested in the sports-science literature, but as a "don't add novelty on top of a workload spike" heuristic it is sound). The natural windows: early-to-mid offseason after a ramp, or a deliberate in-season micro-block for relievers with schedule control.

**Two session types** (Premier Pitching's model, consistent with Driveline practice):

- *Shape sessions*: low total volume, maximum feedback density — every rep tracked, high-speed video on, grip/cue iteration allowed. This is the Driveline loop: set a target shape → experiment with grip/cue → measure instantly → keep what moves the number, discard what doesn't → repeat. Cues are individual; the "sniff test" (does the video look right) rides alongside the data.
- *Execution sessions*: game-like sequencing, mixed arsenal, intent at or near game effort, **no experimentation**. The new pitch appears in realistic counts and pairings.

**Rep counts and volume guardrails** (promising — practitioner consensus plus muscle-damage data):

- New-pitch reps: ~10–25 per high-intent throwing day (Tread's published changeup guidance), inside a bullpen of 20–30 pitches in-season; 50 pitches is a hard ceiling, broken into sets of 15–20 with ~5 minutes between sets.
- Preseason bullpen progression: 2×15 for the first two pens, ≥3 days apart, progressing 3×12 → 3×15 → 4×12 → 4×15 → 5×15.
- ≥2 full days between mound days; avoid pens the day before/after outings. Muscle-damage markers take ~72 hours to return to baseline after mound work, so every-other-day pens perpetuate damage (promising).
- Bullpen pitches count toward weekly workload — a 40-pitch outing plus a 30-pitch pen is 70 high-intent throws.
- Intensity: shape work can live at ~80–90%; but the shape must eventually be verified at game intent, because movement profiles change with effort. "As command holds, layer intent; if command drops, bring intent down and reset."

**Motor-learning structure.** The experimental literature favors variability: variable practice beat constant practice for retention/transfer, and random beat blocked ordering, with variable/random practitioners spontaneously adopting an external focus of attention (target, ball flight) versus internal (body) — external focus itself being one of the most replicated performance enhancers in motor learning (proven for the general motor-learning effects; promising for direct pitch-design application, which is mostly extrapolation). Practical translation: after initial acquisition, interleave the new pitch with the rest of the arsenal rather than throwing it in long blocks, vary targets and counts, and cue ball flight, not wrist position. Then progressively **remove the feedback**: once the athlete has feel, take away the tracking readout and video and ask them to self-diagnose from ball flight — if they can identify a bad one and correct it blind, the pitch is game-ready (plausible-to-promising; this "guidance-effect" removal is standard motor-learning doctrine applied by multiple facilities).

**Injury context.** The fear that breaking-ball reps per se are dangerous is not supported: no significant curveball–injury association in a national survey of 754 pitchers ages 9–18, nor in the 10-year prospective study of 481 youth pitchers (Fleisig et al., AJSM 2011); the authors themselves note possible underpowering, but the strong, replicated risk factors are pitch volume and throwing while fatigued (proven for volume/fatigue; debunked, with residual uncertainty, for the curveball-specific claim). Design blocks fail workload discipline far more often than they fail pitch-type selection on safety grounds.

**For Soto:** Neptune's design-block template = 2 pens/week (one shape, one execution), 20–30 pitches each, 10–25 new-pitch reps, auto-logged via Compete. Build the ACWR gate into the athlete dashboard from logged throw counts — green-light a design block only when the 0.8–1.3 band has held 2+ weeks. For Trevor personally: post-TJ history argues for the conservative end of every range above, and grip-driven targets over effort-driven ones.

## 6. Measuring Progress: The Metrics Ladder

Progress has stages with radically different evidence requirements (Premier Pitching's two-stage framing, extended):

1. **Shape stability** (dozens of tracked reps): does the pitch hit the target movement/velo/axis band, and is the spread shrinking? Judge on distributions, not single reps. Key check: does the shape *survive game intent* — a pitch that only exists at 85% effort doesn't exist.
2. **Command** (dozens-to-hundreds of intent-tagged reps): miss distance from intended target. MLB average miss is ~11–12 inches; Driveline's Intended Zones Tracker logs intended vs. actual per pitch, and their case data shows meaningful movement (one athlete's slider: 12.5" average miss → 10.8"). Driveline estimates a 3-inch average command improvement is worth ~1 WAR (promising — modeled, not experimentally verified). Their 2026 biomechanics-command study (27 athletes, 270 throws) adds a coaching lens: command correlates with *repeatability* of trunk position and glove-side shoulder at foot plant, but with *adjustability* (higher variance) in angular velocities earlier and in pronation rate at release — repeat the landing, keep the hand free to fine-tune (promising, small n).
3. **Deception/swing outcomes** (live at-bats): whiff, chase, and called-strike rates against real swings — the first point where "looks nasty" gets falsified.
4. **In-game effectiveness** (hundreds of pitch samples, or a stuff-model prior): run value, xwOBA, hard-hit rate. The Savant two-step: confirmed movement profile, then confirmed contact suppression. Fifteen game reps is noise; this is why stuff models exist — they give a stable quality estimate at n≈20 where outcome stats need n≈300+ (promising).

**For Soto:** Triton should implement this ladder literally as a "design block report": shape-stability panel (rolling movement ellipse vs. target band), command panel (miss-distance trend — requires adding intended-target capture to Compete sessions, the one real schema gap), live-AB panel (whiff/chase by pitch), and a Stuff+ trendline. Miss-distance capture is the highest-value single feature: a tablet tap-the-target UI before each pitch, stored per row alongside the TrackMan data.

## 7. Transfer: Pen to Stand-Ins to Live At-Bats to Games

The pen-to-game gap is where most designed pitches die, and the field has converged on a staged exposure ladder (promising — consistent practitioner consensus, thin experimental evidence):

1. **Catcher only** — acquisition; several pens just to be comfortable throwing it with a catcher.
2. **Stand-in hitter** — a hitter tracks pitches without swinging and reports what they see (does it look like the fastball out of hand? when does it "show"?). Cheap deception data.
3. **Live at-bats with full tracking** — real swings, TrackMan on, video on. Compare shape metrics pen-vs-live: intent rises, adrenaline rises, and shapes drift. This is also where feedback removal happens — coach withholds the data and asks the athlete to self-assess, simulating game conditions where no readout exists.
4. **Game integration, gated by role** — introduce in low-leverage counts and favorable matchups first, expand as evidence accumulates. Pablo López's in-game gating rule for his new kick change: throw two in the pregame pen; "if that thing is just floating or sailing… it's not the day for it" — a per-day go/no-go check every adopter should copy (plausible, but obviously sensible).

The 2025 kick-change adopters illustrate the full range of transfer speed: Griffin Canning first threw his *warming up* on March 29, 2025 and used it in the game that day; Davis Martin got the grip between starts in August 2024 and threw 6 scoreless the next day; Clay Holmes took a full Nov–Dec remote block with Tread and arrived at spring training ready (16.2% usage, .182 BAA, 38.2% whiff through 7 starts); Tylor Megill tried it, shelved it when the grip felt off, and only stabilized it in a late-April bullpen with Holmes (then: 50% whiff on 41 thrown, 33 of them to LHH). Canning also *temporarily abandoned* his mid-season — transfer is not monotonic (proven, as cases).

**For Soto:** Neptune's live-AB station is the differentiator most facilities skip: TrackMan on the game mound, hitters from the training pool, and the Compete session browser tagging pen vs. live context per session so pen-vs-live shape drift is a queryable metric. That context tag (`session_type`: pen-shape / pen-execution / live-AB / game) is a one-column schema add with outsized analytical payoff.

## 8. Timelines and Failure Modes

**Realistic timelines** (promising — case-derived, no controlled studies):

- *Grip-driven, seam-effect, or spiked-axis pitches* (kick change, SSW sinker, spiked sweeper for a supinator): usable in 1–2 bullpens to 2–4 weeks; game-ready inside a month for pro athletes with good proprioception. The forgiving cases are bias-aligned and orientation-driven.
- *Standard new pitch, bias-aligned* (changeup for a pronator, gyro slider for a supinator): 6–12 weeks from first rep to confident game usage — roughly one offseason block (Holmes's Nov→spring arc is the template).
- *Bias-fighting or effort-driven shapes* (power slider for a pronator; adding ride to a low-efficiency fastball): a full offseason of months, with meaningful odds of never stabilizing. Bauer's slider took a winter of Edgertronic-guided iteration; his two-seam laminar project took "months of practice" before in-game deployment.
- *Trust timeline lags shape timeline.* A pitch is typically metrically stable weeks before the athlete will throw it in a 2-2 count. Live-AB volume, not more pens, closes that gap.

**Failure-mode taxonomy** (each proven as cases; frequencies unquantified):

1. **Wrong target selected** — no defined job, insufficient separation from existing pitches, or bias-fighting. Gilbert's cutter (no velo separation, bad locations) and deGrom's sinker (no contact suppression) are the 2026 exemplars. This is the most common and most preventable failure.
2. **Shape achieved, command never arrives** — the pitch grades well but misses by 15+ inches; it either leaks into the zone middle or is auto-take. Fix: command-first execution pens, accept a longer timeline, or shelve.
3. **Pen shape doesn't survive intent/adrenaline** — movement collapses at game effort or in live ABs. Caught only if you measure pen-vs-live drift.
4. **Cannibalization / feel bleed** — the new grip degrades an existing pitch (classic: cutter work flattening the four-seam or bleeding into the slider). Monitor the *whole* arsenal's shapes during a design block, not just the new pitch (plausible — widely reported, rarely quantified).
5. **Workload failure** — stacking novel high-intent reps on a rising ACWR, or every-other-day pens that never let the 72-hour recovery complete. The injury risk is volume-and-fatigue-shaped, not pitch-type-shaped (proven for volume/fatigue).
6. **Abandonment without verdict** — pitch gets 10 bad game reps, athlete loses faith, no one checks whether the shape or the locations were the problem. Canning's mid-2025 shelving of a working pitch shows even good pitches get dropped; the antidote is the metrics ladder — render a verdict on shape, command, and usage separately before killing a pitch.

**Tooling economics** (for context): the full elite loop is affordable at facility scale — Rapsodo PRO 3.0 (3 cameras + 2 radars, hitting + pitching, with native Edgertronic integration) and Edgertronic high-speed kits (sold via Driveline) are each mid-four-to-low-five figures; TrackMan adds an $1,100/year software subscription on top of five-figure hardware. Neptune already owns the TrackMan/Compete layer; the marginal adds for a complete pitch-design lab are a high-speed camera and an intended-target capture workflow.

**For Soto:** Encode the taxonomy as design-block exit criteria: every block ends with an explicit verdict per rung of the ladder (shape ✓/✗, command ✓/✗, live-AB whiff ✓/✗, game sample pending), written to the athlete record. That single discipline — verdicts instead of vibes — is rarer in the industry than any piece of hardware, and it's pure software.

## Sources

1. Driveline Baseball — Basics of Pitch Design Using Rapsodo: https://www.drivelinebaseball.com/2017/04/basics-pitch-design-using-rapsodo/
2. Driveline Baseball — Executing a Remote Pitch Design with Online Training (2023): https://www.drivelinebaseball.com/2023/01/executing-a-remote-pitch-design-with-online-training/
3. Premier Pitching — The Pitch Design Phase: Developmental Fit, Workload-Informed Timing, Biomechanical Determinants, and Evaluation Thresholds: https://premierpitching.com/blogs/premier-pitching-chronicles/the-pitch-design-phase-in-baseball-developmental-fit-workload-informed-timing-biomechanical-determinants-of-effectiveness-and-evidence-based-evaluation-thresholds
4. Samuel Midgette — The Impact of Pronation and Supination Bias on Pitch Design: https://samuelmidgette.substack.com/p/the-impact-of-pronation-and-supination
5. Baseball Prospectus — Luis Castillo and the Pronator's Triangle: https://www.baseballprospectus.com/news/article/87514/luis-castillo-and-the-pronators-triangle/
6. Pitcher List — Spin Doctors: The Most Versatile Pitcher Archetype: https://pitcherlist.com/spin-doctors-a-look-at-the-most-versatile-pitcher-archetype/
7. FiveThirtyEight — How Trevor Bauer Remade His Slider — And Changed Baseball: https://fivethirtyeight.com/features/how-trevor-bauer-remade-his-slider-and-changed-baseball/
8. Driveline Baseball — Laminar Express: Baseball Science Behind the Two-Seam Fastball: https://www.drivelinebaseball.com/2019/01/laminar-express-baseball-science-behind-the-two-seam-fastball/
9. Driveline Baseball — The Impact of Seam-Shifted Wakes on Pitch Quality (2021): https://www.drivelinebaseball.com/2021/03/the-impact-of-seam-shifted-wakes-on-pitch-quality/
10. Driveline Baseball — An Introduction to Seam-Shifted Wakes and their Effect on Sinkers (2020): https://www.drivelinebaseball.com/2020/11/more-than-what-it-seams-an-introduction-to-seam-shifted-wakes-and-their-effect-on-sinkers/
11. Baseball Prospectus — Not Just About Magnus Anymore: https://www.baseballprospectus.com/news/article/62912/not-just-about-magnus-anymore/
12. Wikipedia — Seam-shifted wake (Utah State / Barton Smith history): https://en.wikipedia.org/wiki/Seam-shifted_wake
13. ESPN — How the kick change has kick-started the Mets' rotation (2025): https://www.espn.com/mlb/story/_/id/45007922/mlb-2025-kick-change-changeup-new-york-mets-holmes-canning-megill
14. Baseball America — 5 MLB Pitchers Experimenting With A Kick-Change (2025): https://www.baseballamerica.com/stories/5-mlb-pitchers-who-have-added-a-kick-change-baseballs-trendiest-new-pitch-for-2025/
15. Athlon Sports — Tom's Pitching Lab: Pitchers Are Adding Pitches Faster Than Ever (2026): https://athlonsports.com/fantasy/pitchers-adding-pitches-fantasy-baseball-2026
16. FanGraphs Fantasy — New Pitches and Their Impact in 2026: https://fantasy.fangraphs.com/new-pitches-and-their-impact-in-2026/
17. FanGraphs — Why Is It Always the Year of the (Insert Pitch Here)?: https://blogs.fangraphs.com/why-is-it-always-the-year-of-the-insert-pitch-here/
18. Driveline Baseball — The Interaction of Biomechanics and Command (2026): https://www.drivelinebaseball.com/2026/02/the-interaction-of-biomechanics-and-command/
19. Driveline Baseball — Let's Not Kid Ourselves, Greg Maddux Was A Unicorn (command/miss distance, 2025): https://www.drivelinebaseball.com/2025/07/greg-maddux-was-a-unicorn/
20. Chua, Wulf & Lewthwaite — Practice variability promotes an external focus of attention and enhances motor skill learning (Hum Mov Sci, 2019): https://pubmed.ncbi.nlm.nih.gov/30831389/
21. Fleisig et al. — Risk of Serious Injury for Young Baseball Pitchers: A 10-Year Prospective Study (AJSM, 2011): https://journals.sagepub.com/doi/10.1177/0363546510384224
22. Grantham et al. — The Curveball as a Risk Factor for Injury: A Systematic Review (Sports Health): https://pmc.ncbi.nlm.nih.gov/articles/PMC4272688/
23. Lyman et al. — Effect of pitch type, pitch count, and pitching mechanics on risk of elbow and shoulder pain in youth baseball pitchers (AJSM, 2002): https://pubmed.ncbi.nlm.nih.gov/12130397/
24. ArmCare — No Bull Bullpens: How To Manage Your Highest Intensity Training: https://blog.armcare.com/no-bull-bullpens-how-to-manage-your-highest-intensity-training/
25. PRP Baseball — Pitcher In-Season Management: https://www.prpbaseball.com/blog/pitcher-in-season
26. Tread Athletics — Pitching Development / FAQ: https://treadathletics.com/
