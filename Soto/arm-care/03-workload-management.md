---
title: Pitching Workload Management — ACWR, Pitch Counts, Hidden Volume, and Practical Tracking
domain: arm-care
tags:
  - workload-management
  - acute-chronic-ratio
  - pitch-counts
  - hidden-pitches
  - rest-days
  - injury-prevention
  - facility-monitoring
  - pulse-sensor
sources_reviewed: 22
last_updated: 2026-07-19
---

# Pitching Workload Management — ACWR, Pitch Counts, Hidden Volume, and Practical Tracking

## TL;DR

- **The Acute:Chronic Workload Ratio (ACWR) is statistically broken but conceptually salvageable.** The specific "sweet-spot" model (0.8–1.3 safe, >1.5 dangerous) was formally requested for retraction by Impellizzeri and colleagues, who showed the ratio magnifies acute load without adding predictive value and that *randomized* chronic loads predict injury just as well (debunked as a threshold tool). The underlying idea — that fitness built gradually protects against sudden spikes — remains defensible (plausible).
- **Pitch counts capture less than 60% of what a pitcher actually throws.** Zaremski's 2017 observational study of 115 high-school starts found game pitches averaged 68.9 while warm-up (23.6) + bullpen (27.2) added up to 119.7 total per outing — **42.4% of pitches went uncounted** (proven for the sample). A wearable-sensor study of 11–12 year-olds found ~1,666 total throws vs. 168 official pitches — a **~10x** gap (proven).
- **Overuse and fatigue, not curveballs, drive youth arm injuries.** ASMI/Fleisig data: pitching >100 innings/year tripled serious injury risk (OR 3.5); pitching while fatigued carried OR ~7.5–7.9; throwing >85 mph carried OR 2.58; pitching on consecutive days OR 2.53 (proven). Pitch Smart codifies this: hard daily caps (50 at age 7–8 up to 105 at 17–18) plus mandatory rest (4 days after 66+ pitches for U14).
- **More MLB rest means less time hurt.** A 2024 study (2022–2023 seasons) found staffs averaging >5 rest days spent 10.7 IL days/1,000 pitches for musculoskeletal injuries vs. 13.6 for <5 days — a **22% lower injury rate** (IRR 0.78, p<0.0001) (promising).
- **Velocity and max-effort "stuff-chasing," not raw volume, is MLB's leading injury driver.** MLB's December 2024 report tied the injury surge to velocity, spin-chasing, and maximum effort in both games and training; MLB pitcher IL placements rose from 212 (2005) to 485 (2024) and IL-days from 13,666 to 32,257 (promising).
- **The Verducci Effect (30-inning rule) is dead.** At least five independent analyses (Gassko, Greenhouse, Bradbury, Carty, Carleton) found no predictive signal; Verducci himself called it "not a scientific, predictive system" (debunked).
- **Torque-based load beats pitch counts, but no device measures actual UCL stress.** Driveline's PULSE ($245 sensor) estimates elbow valgus torque per throw and sums a daily Workload; it needed a physics-engine correction because the original Motus torque didn't match lab motion-capture (promising). It is a *proxy*, not a strain gauge.
- **Hidden pitches are not automatically harmful — they may be protective.** A 137-pitcher single-MLB-org study found hidden pitches were 45.4% of season volume but showed **no** correlation with injury; well-structured warm-up may reduce risk (plausible, single-org).

---

## 1. The Acute:Chronic Workload Ratio: What It Is, Why It Spread, Why It Broke

The ACWR compares a short-term "acute" workload (commonly a 1-week rolling load) against a longer "chronic" baseline (commonly a 4-week — 28-day — rolling average). A ratio of 1.3 means the recent week ran 30% above the chronic baseline. Tim Gabbett popularized the model with his 2016 "training-injury prevention paradox" paper in *BJSM*, arguing that appropriately *high* chronic workloads are protective — athletes whose tissues are adapted to high loads tolerate spikes better than under-prepared athletes (the paradox: "train smarter *and* harder"). The widely cited "sweet spot" is 0.8–1.3, with sharply rising risk above 1.5 (promising as a heuristic, debunked as a precise threshold).

The conceptual core is sound and matches how arms actually adapt: a pitcher who has thrown consistently for weeks handles a 100-pitch outing far better than one ramping from nothing. Driveline operationalizes this directly — their model compares the average 1-day Workload over the last 9 days against the prior 28 days, targeting a ratio at or below ~1.2 (weekly load no more than 20% above chronic) when building athletes up.

**The statistical demolition.** Franco Impellizzeri, Matt Tenan, and colleagues (2019–2021, *BJSM*, *IJSPP*, *JAT*) dismantled the ratio as an injury-prediction tool:

- The famous ACWR-vs-injury-risk "U-shaped" figure and its sweet spot are **mathematically artifactual** — the ratio inherently magnifies the acute numerator, and low chronic denominators manufacture extreme ratios that don't reflect real risk (debunked).
- Impellizzeri showed **randomized chronic workloads predict injury about as well as the real ones**, meaning the "chronic" term adds little genuine signal — a devastating result for a metric named after that term (debunked).
- The group filed a formal request for retraction/correction of the original ACWR-likelihood-of-injury model with *BJSM* (proven — this happened).
- Ratios discard information (a 2:1 and a 10:5 are identical), create spurious reclassification, and were largely imported from *running and team-sport* research (hamstring/soft-tissue) never validated on the unilateral, high-velocity, elastic demand of pitching (plausible critique).

**For Soto:** Do not ship ACWR to Neptune athletes as a red/green "injury risk" gauge — that specific claim is scientifically indefensible and Trevor will (correctly) discount it. Frame any acute:chronic display as a *ramp-rate / progression sanity check* ("are we ramping this arm too fast relative to what it's used to?"), not an injury oracle. In Triton, if we compute an ACWR-style feature on `compete_pitches` throw volume, label it "load ramp" and pair it with the raw acute and chronic values separately so the denominator is never hidden.

## 2. Why Pitching Breaks ACWR Specifically

Ryan Crotin (ArmCare) and the Kinetic/practitioner community catalog why the ratio is even worse for pitchers than for the field-sport athletes it was borrowed from (plausible):

1. **Schedule incompatibility.** A starter on a 5-, 6-, or 7-day rotation accumulates acute load in a lumpy, spiky pattern that doesn't align with the smooth 7-/28-day rolling windows the math assumes. One start dominates the acute window; the ratio swings wildly by which day you sample.
2. **External-load only.** ACWR measures *what the athlete did*, not *how they responded*. A 90-pitch outing means very different things for two arms with different strength, mechanical efficiency, and fatigue history.
3. **Hidden fatigue and false safety.** Pitchers get hurt inside the "safe zone" because microtrauma compounds and compensations create local overload even when the aggregate ratio looks fine.
4. **Non-linear, elastic stress.** UCL loading is high-intensity and unilateral; it does not aggregate linearly the way running distance does.

ArmCare's proposed alternative is to measure the *athlete's functional state* directly — throwing-arm strength ("ArmScore," force + strength-to-bodyweight), shoulder external/internal-rotation balance, strength-velocity ratio, and pre/post-session range-of-motion change — and adjust programming (deload/reload/overload) off measured capacity rather than a predetermined ratio (promising; commercial framing, limited independent validation).

**For Soto:** This is the strongest argument for Neptune to pair *any* volume tracking with a cheap objective readiness measure. A handheld dynamometer or the ArmCare device gives a daily arm-strength / ROM delta that answers "how did the arm respond," which pure pitch/throw counts cannot. That pairing (external load + internal readiness) is the defensible monitoring spine.

## 3. Pitch Counts and Rest: The Evidence Base That Actually Holds Up

Ironically, the crude pitch-count-and-rest guidelines have *better* prospective evidence in youth baseball than the fancy ratio. The foundational work is ASMI's (Fleisig, Andrews, Lyman, Olsen) decade of prospective cohorts:

- **Olsen et al. 2006** (95 injured surgical adolescents vs. 45 uninjured): the injured group threw significantly more months/year, games/year, innings/game, pitches/game, pitches/year, and **warm-up pitches**. Throwing >85 mph → OR **2.58**; showcase participation and pitching fatigued were independent risk factors (proven).
- **Fleisig et al. 2011** (10-year prospective cohort, 481 youth pitchers): pitching **>100 innings in a calendar year → 3.5x** the risk of serious injury (OR 3.5, 95% CI 1.16–10.44) (proven).
- **Earlier ASMI/Lyman work**: >75 pitches/game → shoulder-pain OR 3.22 (95% CI 1.84–5.61); >600 pitches/season → elbow-pain OR 2.07 (proven).
- **Fatigue is the dominant modifiable factor**: routinely pitching with arm tiredness → OR **7.88** for injury; with arm pain → OR **7.50** (proven). Pitching on consecutive days OR 2.53; multiple teams with overlapping seasons OR 1.85; multiple games/day OR 1.89 (proven).

**Pitch Smart** (MLB + USA Baseball, ASMI-endorsed) codified this into age-banded daily maxima and mandatory rest:

| Age | Max pitches/day |
|---|---|
| 7–8 | 50 |
| 9–10 | 75 |
| 11–12 | 85 |
| 13–14 | 95 |
| 15–16 | 95 |
| 17–18 | 105 |
| 19–22 | 120 |

Rest thresholds (ages 7–14): 1–20 pitches → 0 days; 21–35 → 1 day; 36–50 → 2 days; 51–65 → 3 days; 66+ → 4 days. Ages 15–18 shift the ladder (1–30 → 0; 31–45 → 1; 46–60 → 2; 61–80 → 3; 81+ → 4 days). ASMI's separate position statement adds the career-level rule: **≥2–3 consecutive months per year with zero competitive throwing**, no pitching on multiple teams simultaneously, no playing catcher on non-pitching days, and no showcase-chasing at the expense of rest (proven consensus). A 2022 Manzi/HSS study documented wide state-to-state variability in high-school pitch-count and rest rules, meaning season-long exposure differs sharply by jurisdiction even under nominal "restrictions."

**The 2026 caveat:** A Kriz/Zaremski study (JOSPT-adjacent, *OJSM* 2026) asked whether pitching-restriction *policies* actually reduce shoulder/elbow injuries in high-school players — the honest answer from the literature is that policies reduce documented overuse *exposure*, but game-only counts miss so much volume (Section 4) that compliance on paper doesn't guarantee protected arms.

**For Soto:** Pitch Smart is the floor, not the ceiling, and it's the right default for any youth/HS athlete Neptune touches. The single most actionable, evidence-backed intervention Neptune can enforce is **fatigue-aware shutdown** (self-reported tiredness/pain + velocity drop) and **guaranteed off-season shutdown of 2–3 months** — those carry the largest effect sizes (OR 7.5–7.9 and the innings-cap 3.5x) of anything in the literature. Build a season calendar into the athlete profile that flags total competitive months and enforces the shutdown window.

## 4. Hidden Workload: The 40%+ of Pitches Nobody Counts

Game pitch counts are a fraction of true throwing volume, and the gap grows the younger and the more "developed" the athlete:

- **Zaremski 2017/2018 (HS starters, N=115 outings, 34 schools, 13,769 pitches):** per outing — bullpen 27.2 ± 9.4, warm-up 23.6 ± 8.0, in-game 68.9 ± 19.7, **total 119.7 ± 27.8**. **42.4% of pitches were unaccounted** by standard game counts (proven for sample).
- **Freehill/Cain sensor study (11–12 yo, N=19, full season):** ~**1,666 total throws** vs. **168 official pitches** (~10x); ~577 high-effort ("pitch-equivalent") throws per player — game counts captured a small minority of high-effort exposure (proven).
- **Hidden Pitches in MLB (single org, 137 pitchers, 2021 season):** hidden pitches (warm-up, between-innings, bullpen prep) were **45.4%** of total season volume; 48% of pitchers hit the IL (mean 53.6 days). Critically, **no significant difference** in hidden, in-game, or total pitch counts between injured and uninjured, and hidden-pitch percentage did not correlate with injury — the authors suggest proper warm-up may be *protective* (plausible, single-org, underpowered).

The reconciliation: **volume of hidden throws is real and large, but volume alone is a weak injury predictor; intensity and fatigue state are what convert volume into risk.** A hundred easy warm-up tosses ≠ a hundred max-effort bullpen shapes.

**For Soto:** This is the killer feature for a tech-forward facility. Neptune already ingests TrackMan via `compete_pitches`; that captures *mound* throws at velocity. The gap is **non-mound and warm-up/plyo/long-toss volume**, which is where 40%+ of load hides and where a facility (unlike a scorekeeper) can actually observe it. Spec a simple "throw log" that lets a coach or athlete tag session buckets — catch play, long toss, plyo/weighted, bullpen, live — with rough counts and an RPE (1–10 intensity). Even coarse buckets, summed, close the hidden-workload gap that pitch counts structurally cannot. This is the Neptune-differentiating layer: our number is *total throwing load*, not just *game pitches*.

## 5. Torque-Based and Wearable Load: The PULSE Model and Its Limits

Driveline's PULSE (formerly Motus) is the practitioner standard for objective per-throw load. The sensor ($245, worn in a compression sleeve just below the UCL) estimates **peak elbow valgus torque** per throw and, factoring the pitcher's height and weight, computes a **1-throw Workload Number**; summed across a session it yields a **1-day Workload**, and rolling windows produce the acute:chronic (9-day vs 28-day) view. A high-effort bullpen and a game start can therefore be compared on one axis — a genuine advance over "a pitch is a pitch."

Caveats that matter for a facility making buying decisions:

- **It is a model, not a strain gauge.** Driveline had to rebuild the physics engine because the original Motus valgus-torque output disagreed with their in-house motion-capture lab. The device outputs a *validated-against-lab estimate*, not a direct UCL measurement (promising, not proven). Treat absolute torque numbers as relative/trending, not as literal ligament stress.
- **Workload Number ≠ intensity.** Two throws with the same torque can differ in effort and mechanical efficiency; the sensor doesn't see the kinetic chain upstream.
- **Adoption friction.** Athletes must wear it every throwing session for the chronic baseline to mean anything; missing sessions corrupts the denominator — the same failure mode as ACWR generally.

**For Soto:** PULSE is a reasonable Neptune purchase for *select* development athletes (velo-gainers, return-to-throw cases) where per-throw torque trending justifies the wear burden, but it's overkill and unenforceable for a full youth roster. Model the data cheaply: for most athletes, RPE-weighted throw counts (Section 4) recover ~80% of PULSE's practical value at ~0% of the per-athlete cost. Reserve PULSE for the high-value cohort and pipe its daily Workload / ACWR into the same `compete_*` athlete timeline so torque-load, TrackMan mound work, and the throw log live on one chart.

## 6. Season-Long and Career Workload Planning

**Ramp-up / on-ramp.** The consensus across Driveline, Tread, PRP, and RPP: build a **high pre-season chronic base, then progress gently** — the opposite of the "rest all winter, ramp fast in March" pattern MLB itself flagged in 2024 as coinciding with the spring-injury spike. Driveline's "Build another Nolan Ryan" simulation is instructive: tested against five progression scenarios, only a **heavy preseason base (~40+ workload units / ~70 pitches in spring outings) followed by gradual in-season increase** kept the ACWR smooth (≤1.2) and reached elite volume; early-season jumps to high workload "failed catastrophically" in the model (plausible/simulation). The principle "prepare the athlete for *more* than they'll have to handle" is the durable takeaway.

**In-season maintenance.** Tread's in-season blueprint prioritizes recovery-to-next-outing, strength maintenance, and pitch-shape upkeep over continued gains, with distinct throwing/lifting schedules for starters (5-day cycle) vs relievers (availability-based). The goal is holding the chronic base, not building it — mid-season is the wrong time to add load.

**Rest between starts (pro/college).** The "Give It a Rest" study (MLB 2022–2023): staffs on >5 rest days averaged 10.7 IL-days/1,000 pitches vs 13.6 on <5 days — **22% fewer** (IRR 0.78, p<0.0001); MLB-wide average rest was 4.80 days (promising). Six-man rotations and extra-rest starts are the mechanism. Driveline's college analysis adds the deployment angle: only four D-I starters recently reached 120 IP (Quinn Mathews 124, Stanford 2023); scheduling extra starts on 4+ days rest (e.g., Skenes could have added ~2 starts / ~13 IP in 2023) captures volume without compressing rest.

**Relievers.** 33,000-appearance analysis and postseason studies converge: two or three consecutive days is tolerable but a third-straight day usually forces an off-day; caution after any outing facing 5+ batters; green light with ≥2 days rest or a light prior day. Driveline frames it in workload units: a reliever with chronic load ~8 can handle back-to-back 20-unit days but not three straight (plausible/consensus).

**Career arc.** The Verducci Effect ("under-25 pitchers gaining >30 IP year-over-year get hurt/regress") is **debunked** — Gassko, Greenhouse, Bradbury, Carty, and Carleton independently found no signal, and Verducci himself disclaimed it as non-scientific. The 30-inning threshold is arbitrary and innings are a coarse load proxy. Career planning should track *cumulative high-intensity throwing exposure* and enforce annual shutdown windows, not a single year-over-year innings delta.

**For Soto:** Encode a season into phases on the Neptune athlete profile — off-season shutdown (2–3 mo, hard-enforced), ramp/on-ramp (build chronic base, cap ramp rate), in-season maintenance (hold base), taper/playoffs. Trevor's own arc is the case study: post-2017 TJ he rebuilt as a reliever with a controlled ramp and a late-career peak (21 saves, 2023) — a living example that *managed* progression beats both under- and over-loading. For his current staying-sharp training, the relevant rule is the ramp-rate cap and the off-throwing shutdown, not any competitive innings target.

## 7. The Modern Confounder: Velocity and Max-Effort Stuff-Chasing

The uncomfortable 2024 finding is that **workload management alone won't stop the injury epidemic — intensity is the bigger lever.** MLB's December 2024 report (drawing on 200+ interviews and its Statcast/injury database) named the primary drivers as **velocity, spin-chasing, and maximum-effort pitching in both games and training**, not raw pitch counts. Supporting scale: MLB pitcher IL placements rose 212 → 485 (2005 → 2024); IL-days 13,666 → 32,257. The report explicitly implicated private-facility offseason training — velo programs, pitch design, mechanical overhauls — as raising in-season injury risk when athletes arrive under-prepared for the intensity jump (promising).

Zaremski's 2024 AJSM study operationalizes intensity for youth: tracking 71 HS pitchers (ages 13–18), 313 outings, >24,000 throws, they added a **velocity-intensity ratio** (in-season velo ÷ preseason velo; 1.0 = throwing as hard as physically possible). **Higher in-game velocity (p=0.001), higher intensity (p<0.001), and older age (p=0.014)** predicted injury — pitch count alone did not. They also flag that weighted-ball programs can add up to ~5 mph but raise injury risk up to ~25% (promising).

**For Soto:** This is where Triton's models and the facility mission intersect. Neptune sells velocity development; the same velocity is the leading injury driver. The responsible product is to **couple every velo/stuff gain with an intensity and readiness governor.** Concretely: (a) compute a per-athlete velocity-intensity ratio from `compete_pitches` (in-season avg velo ÷ that athlete's established max/preseason) and flag sustained ratios near 1.0 as sustained max-effort exposure; (b) surface Stuff+ gains alongside a workload/intensity panel so a rising Stuff+ never displays without its load cost; (c) treat weighted-ball blocks as high-torque phases with their own ramp caps and post-block deloads. Selling velo without selling the governor is the malpractice this literature warns against.

## 8. A Practical Monitoring Spine for Neptune

Synthesizing the evidence into something shippable on the existing `compete_*` pipeline:

**Tier 0 — Enforce the floor (all athletes).** Pitch Smart daily caps + rest ladder for anyone U19; hard 2–3 month annual throwing shutdown; fatigue/pain self-report gate (the OR 7.5–7.9 factor). This alone, enforced, outperforms most tech.

**Tier 1 — Close the hidden-workload gap (all athletes, cheap).** A session throw-log: buckets (catch/long-toss/plyo/bullpen/live) × rough count × RPE 1–10. Sum to a daily *total throwing load* and a rolling 7-/28-day view. Display acute and chronic *separately* plus a labeled "ramp rate," never a red/green injury score.

**Tier 2 — Objective load + readiness (development cohort).** PULSE ($245/athlete) for per-throw torque on velo-gainers and return-to-throw cases; a handheld dynamometer or ArmCare device for daily arm-strength / ROM delta to answer "how did the arm respond." Pair external load with internal readiness — the combination is the defensible signal neither gives alone.

**Tier 3 — Intensity governor (Triton-integrated).** Velocity-intensity ratio from `compete_pitches`; Stuff+ always shown with its load cost; weighted-ball phases flagged as high-torque with mandated deloads.

**Data model note:** all four tiers should write to one athlete timeline so mound TrackMan work, off-mound throw log, torque load, readiness, and intensity render on a single chart. Log any ad-hoc queries built against `compete_pitches` for this to `docs/Queries.md` per repo convention.

**For Soto:** The honest evidence hierarchy to give Trevor: (1) fatigue-aware shutdown and annual rest windows — largest effect sizes, nearly free; (2) closing the hidden-throw gap — structurally impossible with pitch counts, easy for a facility; (3) intensity/velocity governance — the real modern driver; (4) ACWR/torque dashboards — useful for *ramp discipline and communication*, not injury prediction. Sell the first three as the product and use the fourth as the visualization layer, clearly labeled as progression tracking rather than a risk oracle.

## Sources

1. Impellizzeri et al. — "The acute-chronic workload ratio-injury figure and its 'sweet spot' are flawed" (*BJSM*) — https://www.researchgate.net/publication/333589357
2. Impellizzeri & Tenan et al. — "Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls" (*IJSPP* 2020;15(6):907) — https://journals.humankinetics.com/downloadpdf/journals/ijspp/15/6/article-p907.xml
3. "What Role Do Chronic Workloads Play in the ACWR? Time to Dismiss ACWR" — https://www.researchgate.net/publication/347442902
4. Gabbett — "The training-injury prevention paradox: should athletes be training smarter and harder?" (*BJSM* 2016) — https://research.usq.edu.au/item/q4396/
5. Crotin (ArmCare) — "Rethinking Acute to Chronic Workload for Pitchers" — https://blog.armcare.com/rethinking-acute-to-chronic-workload-for-pitchers/
6. Kinetic — "Acute:Chronic Workload Ratio in Baseball" — https://kineticsmp.com/blog/acute-chronic-workload-ratio-baseball
7. Zaremski et al. — "Unaccounted Workload Factor: Game-Day Pitch Counts in HS Baseball Pitchers" (PubMed 29662911) — https://pubmed.ncbi.nlm.nih.gov/29662911/ ; PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC5894908/
8. Zaremski, Pazik, Vasilopoulos, Horodyski — "Workload Risk Factors for Pitching-Related Injuries in HS Baseball Pitchers" (*AJSM* 2024;52(7):1685) — https://pubmed.ncbi.nlm.nih.gov/38700088/
9. UF Health — "Protecting baseball pitching arms about more than pitch count" (2024) — https://ufhealth.org/news/2024/protecting-baseball-pitching-arms-about-more-than-pitch-count-uf-health-research-suggests
10. Freehill, Rose, McCollum, Agresta, Cain — "Youth Baseball Pitch Counts Vastly Underestimate High-effort Throws" (PubMed 32040065) — https://pubmed.ncbi.nlm.nih.gov/32040065/
11. "Hidden Pitches in Major League Baseball: Injury Implications" (PMC10102946) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10102946/
12. Olsen, Fleisig, Dun, Loftice, Andrews — "Risk Factors for Shoulder and Elbow Injuries in Adolescent Baseball Pitchers" (*AJSM* 2006; PubMed 16452269) — https://pubmed.ncbi.nlm.nih.gov/16452269/
13. Fleisig, Andrews, Cutter, et al. — "Risk of Serious Injury for Young Baseball Pitchers" (*AJSM* 2011) — https://journals.sagepub.com/doi/10.1177/0363546510384224
14. ASMI — "Position Statement for Tommy John Injuries in Baseball Pitchers" — https://asmi.org/position-statement-for-tommy-john-injuries-in-baseball-pitchers/
15. MLB Pitch Smart — Pitching Guidelines — https://www.mlb.com/pitch-smart/pitching-guidelines
16. Manzi, Kunze, Dowling, et al. — "Variability in Pitch Count Limits and Rest Day Requirements by State" (*AJSM* 2022) — https://journals.sagepub.com/doi/10.1177/03635465221111098
17. "Give It a Rest: Impact of Rest Days on MSK Injuries Among MLB Starting Pitchers" (PubMed 39292010) — https://pubmed.ncbi.nlm.nih.gov/39292010/
18. Passan — "5 biggest takeaways from MLB's landmark pitching study" (ESPN, Dec 2024) — https://www.espn.com/mlb/story/_/id/43024395/
19. MLB — "MLB releases report on injuries to pitchers" (2024) — https://www.mlb.com/news/mlb-releases-report-on-pitcher-injuries-2024
20. Driveline — "Is It Possible To Build Another Nolan Ryan?" (Dec 2025) — https://www.drivelinebaseball.com/2025/12/is-it-possible-to-build-another-nolan-ryan-we-give-it-a-try/
21. Driveline — "How workload data can help optimize a college pitching staff" (Mar 2026) — https://www.drivelinebaseball.com/2026/03/how-workload-data-can-help-optimize-a-college-pitching-staff/
22. Driveline — PULSE Throw Workload Monitor (product/pricing) — https://www.drivelinebaseball.com/product/pulse-throw/ ; Baseball Prospectus / SABR / Deadspin Verducci Effect analyses — https://www.baseballprospectus.com/news/article/19497/ and https://sabr.org/latest/carleton-fact-or-fiction-the-verducci-effect/
