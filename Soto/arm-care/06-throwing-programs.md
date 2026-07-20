---
title: Throwing Program Design — Interval Programs, Long Toss, Ramp-Ups & Return-to-Throwing
domain: arm-care
tags:
  - throwing-program
  - interval-throwing
  - long-toss
  - workload-management
  - return-to-throwing
  - acwr
  - velocity-development
  - ramp-up
sources_reviewed: 17
last_updated: 2026-07-19
---

# Throwing Program Design — Interval Programs, Long Toss, Ramp-Ups & Return-to-Throwing

## TL;DR

- **Throwing distance, not radar velocity, is the honest load axis.** Elbow varus torque tracks throwing distance far more tightly than ball speed; a 2nd-order polynomial fit on **238,611 Motus/Pulse flat-ground throws (34 healthy D1 players)** anchors modern programs, and ~120 ft flat-ground torque already matches mound-pitching torque — which is why most long-toss protocols cap "on-line" work there (proven).
- **The modern data-driven interval throwing program (ITP) is longer and gentler than the classic one.** Reinold/Fleisig 2024 rebuilt the 20-year-old ITP: the new schedule runs **217 days vs 136**, drops final chronic workload from **15.0 → 10.8**, and keeps acute:chronic workload ratio (ACWR) inside the 0.7–1.3 "safe" band **91% of the time (peak 1.33) vs 82% (peak 1.61)** for the original (promising).
- **ACWR is the governing variable.** Injury risk climbs when ACWR exceeds ~1.3 or drops below 0.7; in baseball specifically, pitchers with ACWR ≥1.27 carried a **14.9% higher injury risk** in the cited cohort. Every ramp should be scheduled backward from a mound-ready date so weekly load never spikes (promising).
- **Max-distance long toss is the least efficient throw in the toolbox.** Uncapped "throw as far as you can" throws (avg **~260–264 ft**) raise elbow varus and shoulder internal-rotation torque **~10%** with *no* velocity gain, plus a flatter, more upright delivery — high stress per unit of output, so use it sparingly and never early in a ramp (proven).
- **Effort dials down torque less than athletes think.** A 25% drop in *perceived* effort yields only ~7% less elbow varus torque and ~11% less velocity; at 50% effort pitchers still throw ~79–85% of max velocity and ~75% of max torque. "Take it easy" is not a load-management strategy — count throws and distances (proven).
- **Return-to-throwing after a real layoff is measured in weeks, not days.** Practitioner consensus: **~8 weeks of no-throw shutdown** (4+ of those weeks still doing bands/plyos/lifting) then a **4–5 week on-ramp** (16 throw days, 60%→100% RPE) before "mound ready"; rule of thumb — roughly one build-up day per day off (plausible).
- **Weighted balls buy velocity at a documented injury cost.** Reinold's RCT (n=38 HS pitchers): 6-week program produced **+3.3% velocity** and **+4.3° shoulder external rotation**, but a **24% injury rate** (elbow stress fractures, UCL) vs **0%** in controls — 67% of controls also gained velocity. Powerful, not free (proven).
- **High-intent and recovery days must actually differ.** Programs cap most days at 80–90% intent and reserve 1–2 true 100% days/week (pulldowns or plyo velocities); recovery days run 60–70% intent with visibly slower arm speed. Pulldown arm stress ≈ high-intent mound throwing, so treat pulldowns as a velocity day, not filler (promising).

## 1. The Physics That Should Drive Every Program: Distance ≈ Torque

For decades, throwing programs were written on personal experience and monitored by pain. The single most important shift in the 2020s literature is a measurement one: **elbow varus torque — the internal load the ulnar collateral ligament (UCL) and surrounding structures resist — scales with throwing distance more reliably than with radar velocity** (proven).

The anchor dataset comes from Dowling, Reinold, Fleisig et al.: **238,611 anonymized flat-ground throws** mined from one NCAA Division I team's Motus/MotusBaseball sensor database (now Driveline Pulse), using only healthy players (n=34, 186±7 cm, 89.4±10.8 kg). Of those, **111,196 were tagged as long-toss between 30 and 300 ft**; distances with >1,000 throws fed a **2nd-order polynomial regression** relating distance (ft) to peak elbow varus torque (Nm). Torque rises steeply from 30 ft, and by roughly **120 ft flat-ground throwing produces varus torque equivalent to mound pitching** — the biomechanical justification for why "on-line" long toss traditionally tops out near 120 ft (proven).

The corollary is that **velocity is a poor throttle**. A systematic review of ITP biomechanics found that at 50% perceived effort pitchers still generate ~75% of full-effort elbow varus torque and throw ~79–85% of max velocity; at 75% effort, torque reaches 80–95% of max and velocity 89–91%. Crucially, "elbow varus torque during partial-effort pitching did not exceed the elbow varus torque of full-effort pitching in any study" — but it doesn't drop nearly as fast as effort does. The distance at which flat-ground torque matched full-effort pitching varied study-to-study from **18 m to 91 m (~59–300 ft)**, underscoring that individual response matters (promising).

**For Soto:** This is the philosophical spine of any Neptune throwing product and any Triton workload metric. If Compete/TrackMan (or a Pulse-style IMU) is in hand, the facility should log **throws × distance** and convert to an estimated per-throw varus-torque load using a distance→torque curve, then aggregate to daily/acute/chronic load. That gives Neptune a defensible "throwing workload" dashboard that mirrors the Reinold/Dowling model rather than the bro-science "he looked tired" standard. Distance-tagged catch play is cheap to capture and the highest-signal input.

## 2. The Modern Interval Throwing Program (Reinold/Fleisig 2024)

The classic ITP everyone copied traces to a 1992 Axe/Konin protocol and a widely used ~2002 Reinold version — both built on expert opinion. In March 2024, Reinold, Dowling, Fleisig, Macrina, Wilk, Streepy and Andrews (Chicago White Sox / ASMI / Champion PT) published a rebuild in *IJSPT* (Level of Evidence 2c) grounded in the torque-distance model above (promising).

Method: they reconstructed the *original* ITP's daily throw counts and distances, assigned each throw a varus-torque value from the regression, and computed **daily load** (sum of per-throw torque), **acute load** (7-day rolling average), **chronic load** (28-day rolling average) and **ACWR** (acute ÷ chronic). Then they designed a new program to keep ACWR gradual.

Headline comparison:

| Metric | Original ITP | Updated ITP (2024) |
|---|---|---|
| Schedule length | 136 days | **217 days** |
| Final chronic workload | 15.0 | **10.8** |
| % of program outside 0.7–1.3 ACWR | 18% | **9%** |
| Peak ACWR | 1.61 | **1.33** |

Design changes that matter in practice:
- **"Steps," not "Phases."** The old program listed phases and told pitchers to complete each *twice* at identical count/distance. The new one prescribes a specific throwing day ("Step") with its own count, distance and intensity — no ambiguity, no throw-count *ranges* (which quietly doubled or halved daily load).
- **Two tables:** a **Long-Toss ITP** (flat ground, 30→120+ ft) feeding a **Mound ITP** (fastball intensity by RPE 50%/75%/90%/100%, secondaries reintroduced in stages).
- **Scheduled deloads** at roughly weeks 7, 14, 22, 29 to reset chronic load and keep ACWR in band.
- A **family of durations** — the same workload logic spun into ~**6-week (chronic 7.6, 100% in-band), 12-week (7.9, 98%), 5-month (10.0, 95%) and 7-month (10.8, 91%)** variants — so a clinician can pick a timeline that fits the injury/surgery and still respect ACWR.

A published Letter to the Editor and author response debated whether a single D1 team's Motus data generalizes and whether torque is the right sole currency; the authors conceded it's a model to be refined, not gospel. Treat the *numbers* as a well-reasoned scaffold, the *ACWR discipline* as the durable lesson (plausible).

The broader field remains messy. A 2024–2025 systematic review of **9 published ITPs** found "substantial variability" in detail, target populations, progression criteria and monitoring; mean comprehensiveness scored **20/30**, initiation criteria were ill-defined across the board, only **3 of 9** specified any workload technology, and starting distances ranged **15–45 ft**, max distances **180–300 ft** by position, with up to **75 max-distance throws/session** and as many as **160 full-speed pitches** in the most aggressive program. Nearly all descend from that single 1992 protocol (promising).

**For Soto:** Neptune's return-to-throwing template should be the Reinold 2024 *structure* (Steps with fixed counts/distances, RPE-graded mound work, scheduled deloads) implemented as data in Compete, with the timeline variant chosen by injury. Triton already computes rolling aggregates cheaply — an **ACWR panel** (7-day ÷ 28-day throwing load, colored red above 1.3 / below 0.7) is a small, high-value surface. Trevor lived exactly this arc post-2017 TJ; the doc's credibility with him rests on citing torque/ACWR, not "listen to your arm."

## 3. Long Toss: What It Buys and What It Costs

Long toss is the most argued-about tool in throwing. The literature says three useful things (proven/promising):

1. **Definitions are all over the map.** Studies use 90–260 ft; athletic trainers favored ~157 ft "on-line," pitchers preferred ~177 ft for a shoulder stretch. There is no single "long toss."
2. **On-line long toss to ~120–180 ft mimics mound biomechanics.** When a pitcher "throws hard and on a line" at 120–180 ft, kinematics and torque resemble mound pitching — useful, specific arm-building load.
3. **Max-distance long toss is a different animal.** Fleisig/ASMI work: when constraints are removed ("throw as far as you can," crow hop, any arc), pitchers averaged **~260–264 ft**, with **~10% higher elbow varus and shoulder internal-rotation torque**, higher max external rotation, more elbow flexion, faster elbow extension velocity (**max ~2573 ± 203 °/s**), a flatter trunk (less forward flexion) and less lead-knee flexion — a mechanically *altered*, higher-stress delivery with **no ball-velocity benefit**. It is "the least efficient throw": most torque per unit of output. Older work (Fleisig-adjacent) even associated max-distance emphasis with reduced mound velocity in some pitchers (promising).

The two dominant field philosophies:
- **Jaeger-style "stretch it out" long toss** — throw to max comfortable distance on an arc to "open up" the arm, then a "pull-down" phase compressing back on a line at high intent. Popular, feel-based, and effective for many; the cost is that the stretch-out phase is exactly the high-torque zone the biomechanics flags.
- **Driveline-style "on-line / compression"** — bias toward hard, flat throws and treat max-distance arc as optional; pair with **pulldowns** (max-intent throws stepping in with a run-up, often using 3–7 oz weighted balls) once a week as a dedicated velocity stimulus. Driveline notes pulldown arm stress ≈ high-intent mound pitching, so it counts as a true high-intent day (promising).

PRP's practical middle path: before high-intent competitive throwing, require **a minimum of 3 full long-toss days**, structured as **"extensions"** (high-arc "massage" throws to stretch out) and **"compressions"** (on-line throws working back to **90–120 ft**) — capturing the stretch benefit while ending every session with the specific, on-line pattern (plausible).

**For Soto:** For a *developing/youth* Neptune population, bias toward capped on-line long toss (≤120–150 ft) and use max-distance sparingly and only with mature, well-conditioned arms; log distance so the torque cost is visible. For velocity blocks with advanced athletes, pulldowns are the honest high-intent tool — schedule them like a bullpen, not like catch. Trevor, as a former max-effort reliever, is the archetype where pulldowns/plyo-velocities are the right stimulus and max-distance arc is optional.

## 4. Catch Play: The Underrated Base of the Pyramid

Elite practitioners are near-unanimous that **catch play is the most under-coached skill in development** (plausible). Tread Athletics: "the most overlooked aspect of developing baseball players is catch play." The idea is that low-to-moderate-volume, *intentional* catch during on-ramping is where an athlete rebuilds a consistent release point, feels spin, and grooves movement patterns — before any bullpen or max-intent work "lets it go." PRP frames it bluntly: "the high-level athletes play high-level catch. Every single time" — quality of intent and release consistency over raw volume.

Structurally, good catch play is a *progression within a session*, not aimless: a warm-up/activation block (mobility, arm-care bands, plyo/PlyoCare drills), then a build of distance and intent, then a compression back on a line. Backwards-chaining and plyo/positional throws are used to prime the pattern before the ball comes out at intent. The takeaway: catch play is **skill acquisition plus low-grade load**, and it deserves the same prescription (distance, count, intent) as a lift (plausible).

**For Soto:** This is a content and product opportunity for Neptune/Mayday. "How to play catch like a pro" (release consistency, intent ladder, compression finish) is exactly the credible, differentiated instruction Trevor's pro background sells — and it doubles as the entry point to a distance-logged workload dataset. A simple **catch-play template** (warm-up → build → compress, with per-block distance/intent targets) is a shippable facility asset.

## 5. Velocity Days vs Recovery Days: Managing Intent

The organizing principle of modern high-performance throwing weeks is **hard/easy separation** (promising). Driveline's public guidance: cap most training days at **80–90% intent**, and schedule **once or twice a week at 100% effort** — almost always **pulldowns or plyo-velocities**, because research shows their arm stress mirrors high-intent pitching, making them legitimate velocity stimuli. Recovery days run **60–70% intent with deliberately lower arm speed**: warm-up, plyo/PlyoCare reverse throws, pivot picks, walking wind-ups — movement and blood flow without meaningful high-end load.

Two failure modes dominate:
- **Too much, too fast.** "Adding more work doesn't make a good program better." The classic error: reasoning that if weighted balls once a week help, doing them daily helps 7×. It doesn't — it removes the recovery the adaptation depends on.
- **Fake recovery days.** If a "recovery" day is thrown at near-max arm speed, it's a second velocity day in disguise and ACWR climbs. The discriminator is arm *speed/intent*, not just throw count or distance.

PlyoCare/plyo balls (typically a graded set from lighter than a baseball up to ~1000 g / 32 oz for the heaviest reverse-throw work) serve mostly as warm-up, recovery and pattern drills; the max-intent expression (plyo velocities, pulldowns) is the high day. The weekly skeleton many programs converge on: 4–5 throwing days, of which **1–2 are true high-intent** and **1–2 are recovery**, with the rest moderate skill/catch play (promising).

**For Soto:** Neptune's weekly athlete template should explicitly *label* each day's intent target and enforce the hard/easy pattern; Triton can flag violations (e.g., two ≥90% days back-to-back, or a "recovery" day whose logged intent is high). Tie high-intent-day scheduling to the **ACWR panel** so a coach sees when a velocity day would spike the ratio. For Trevor's own maintenance, the model is 1 real high-intent day/week (pulldowns/plyo velo) plus catch and recovery — enough to stay sharp for demos/content without accumulating comeback-level volume.

## 6. Offseason-to-Season Ramp-Up: The Calendar

Practitioner frameworks are strikingly consistent in *shape*, if not exact weeks (plausible). A representative full-offseason arc (Jaeger 5-phase, mirrored by PRP/Driveline):

1. **Off-ramp / de-load (~3 weeks):** intentionally wind *down* end-of-season throwing rather than stopping cold.
2. **Complete rest (~4 weeks):** no throwing; the arm's true recovery window.
3. **Active rest / arm care / light throwing (~4 weeks):** bands, plyos, lifting, low-volume catch to re-establish tissue tolerance.
4. **Throwing progression / build-up (~7 weeks):** volume → distance → intensity, 4–5 active days/week.
5. **Pull-down integration + bullpens (~5 weeks):** high-intent expression, mound work, pitch design *after* the base is built.

The load-management version (PRP): **~8-week shutdown** (with bands/plyos/lifting for ≥4 of those weeks), then a **4–5 week on-ramp of 16 throw days** climbing **60% RPE in week 1 to 100% by week 4**, requiring a readiness score ≥4/5 to count a throw day, and **≥3 full long-toss days** before high-intent throwing. High schoolers who logged 60+ innings warrant a **3–4 week full shutdown** minimum (plausible).

Two rules travel everywhere:
- **Schedule backward from "mound-ready."** Know the date you must throw a bullpen/report to spring training and work at least 4 weeks back (longer after time off), so the ramp finishes on time instead of compressing into a spike.
- **~1 build-up day per day off.** The longer the layoff, the longer the on-ramp; reporting to camp and immediately throwing multiple bullpens is the canonical early-season injury setup, corroborated by Driveline's work linking offseason workload/ROM to early-season injuries (plausible).

**For Soto:** Neptune's offseason product is literally this calendar, personalized: intake assessment → assign a start date and mound-ready target → generate the 5-phase (or workload-variant) plan in Compete → monitor ACWR weekly. This is the "assessment → programming → monitoring" spine the facility needs, and the calendar view is a natural, sellable athlete-facing artifact. It's also directly what Trevor rebuilt through post-2017 — the return-to-throwing timeline *is* the rehab timeline with a healthy starting tissue.

## 7. Return-to-Throwing After Injury or Extended Time Off

Return-to-throwing (RTT) after surgery/injury is the ITP's original job, and it's the strictest application of everything above. Key principles (promising):

- **Start absurdly low.** Published ITPs begin at **15–45 ft** with small counts; the point is tissue tolerance, not conditioning. The Reinold 2024 long-toss table starts at 30 ft and adds distance/count per Step.
- **Progress by objective criteria, not the calendar alone.** Advance only when the prior Step is symptom-free; the systematic review's main criticism is that most programs *fail* to specify these criteria — so a good program writes them down (e.g., no pain/swelling next day, clean mechanics, readiness ≥4/5).
- **Keep ACWR in band the whole way.** This is where the 217-day, deload-punctuated structure earns its length: the safest RTT spends **~91%+** of the program inside 0.7–1.3.
- **Separate flat-ground graduation from mound graduation.** Complete the Long-Toss ITP (rebuild to on-line ~120 ft at intent) *before* starting the Mound ITP (RPE 50→75→90→100 fastballs, then staged secondaries, then live). The mound reintroduces the highest torque and the competitive intent that spikes effort.
- **Weighted balls are a *late*, optional, risk-laden layer.** Reinold's RCT (n=38 HS pitchers, 6 weeks): **+3.3% velocity, +4.3° external rotation, but 24% injured** (elbow stress fractures, UCL) vs **0% in controls**, and 67% of controls gained velocity anyway from basic throwing + lifting. In an RTT context especially, the risk/reward is poor early; reserve heavy/weighted work for a fully rebuilt, monitored arm (proven).

For youth specifically, the population-level guardrail is **MLB/USA Baseball Pitch Smart**: daily pitch maximums of **50 (7–8), 75 (9–10), 85 (11–12), 95 (13–16), 105 (17–18)**, with graded required rest (e.g., 66+ pitches at 13–16 = 4 days rest), no pitching 3 consecutive days, and an offseason no-throw recommendation. These are competition limits, but they set the outer envelope any facility program must respect (proven).

**For Soto:** RTT is the highest-liability, highest-value Neptune service and the one where Trevor's lived experience is the marketing. The product must encode: objective Step-advance criteria, a written pain/readiness gate, an ACWR monitor, flat-ground-before-mound sequencing, and Pitch Smart caps auto-enforced for minors. Weighted-ball features in Triton/Compete should carry an explicit risk flag and be gated behind a rebuilt-base checkpoint — never the default on-ramp tool. This is exactly the kind of evidence-graded, liability-aware system that differentiates a "development lab" from a cage barn.

## Sources

1. Wilhelm et al. "Current State of Baseball Interval Throwing Programs: A Systematic Review." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC12040857/
2. "Biomechanical Basis of Interval Throwing Programs for Baseball Pitchers: A Systematic Review." IJSPT / PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC10547089/
3. Reinold MM, Dowling B, Fleisig GS, et al. "An Interval Throwing Program for Baseball Pitchers Based upon Workload Data." IJSPT, 2024. https://ijspt.org/wp-content/uploads/2024/03/9-Reinold.pdf
4. Reinold, M. "The Science Behind Baseball Interval Throwing Programs: A Data-Driven Approach to Safer Pitcher Rehab." https://mikereinold.com/interval-throwing-program/
5. "Interval Throwing Programs of Various Duration for Baseball Players Based on Biomechanical Workload Data." IJSPT. https://ijspt.scholasticahq.com/article/159340
6. "The Science and Biomechanics of Long-Toss." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC8137765/
7. "Long Toss Research in Baseball." TopVelocity. https://www.topvelocity.net/2024/05/21/long-toss-research-in-baseball/
8. "Pitching Research: Long Toss." Driveline Baseball. https://www.drivelinebaseball.com/pitching-research-long-toss/
9. Reinold MM, et al. "Effect of a 6-Week Weighted Baseball Throwing Program on Pitch Velocity, Biomechanics, ROM, and Injury Rates." AJSM, 2018. PubMed 29882722. https://pubmed.ncbi.nlm.nih.gov/29882722/
10. Reinold, M. "The Real Reason Why Weighted Baseballs Increase Pitching Velocity, and Injury Rates." https://mikereinold.com/why-weighted-baseballs-increase-pitching-velocity-and-injury-rates/
11. "16-Week In-Season and Off-Season Throwing Program." Driveline Baseball (PDF). https://www.drivelinebaseball.com/wp-content/uploads/2024/03/Free_16-Week_In-Season_And_Off-Season_Throwing_Program_2024-03-05.pdf
12. "Off-Season Baseball Throwing Program." Driveline Baseball. https://www.drivelinebaseball.com/2020/09/off-season-throwing-program/
13. "Pulldowns: The What, Why, and When." Driveline Baseball. https://www.drivelinebaseball.com/2017/12/pulldowns-the-what-why-and-when/
14. "Structured Return to Throwing Programming." PRP Baseball. https://www.prpbaseball.com/blog/2020/1/1/structured-return-to-throwing-programming
15. "The 5 Phases of our Throwing Manual (Outline)." Jaeger Sports. https://jaegersports.com/program/jaeger-sports-professional-off-season-throwing-manual-schedule/chapter/the-5-phases-of-our-throwing-manual-outline/
16. "A 4-Week Intro to Weighted Ball Training." Ben Brewster / Tread Athletics (PDF). https://treadathletics.com/wp-content/uploads/2021/05/A-4-Week-Intro-to-Weighted-Ball-Training.pdf
17. "Pitch Smart — Pitching Guidelines." MLB / USA Baseball. https://www.mlb.com/pitch-smart/pitching-guidelines
