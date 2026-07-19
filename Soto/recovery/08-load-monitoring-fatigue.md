---
title: Load Monitoring & Fatigue Management for a Baseball Facility
domain: recovery
tags:
  - load-monitoring
  - srpe
  - acwr
  - cmj-force-plate
  - cns-fatigue
  - velocity-decline
  - rom-strength-decrement
  - athlete-monitoring-system
sources_reviewed: 20
last_updated: 2026-07-19
---

# Load Monitoring & Fatigue Management for a Baseball Facility

## TL;DR

- **The measurement that matters is internal, not external.** External load (pitch count, throws, PULSE workload units) tells you what the athlete *did*; internal load (sRPE, HRV, jump decrement) tells you how they *responded* — and identical external loads produce very different internal loads across two athletes (proven). A monitoring system that only counts pitches is measuring the wrong side of the ledger.
- **Pitch counts miss ~40–88% of the actual throwing volume.** One dataset found 42.4% of game-day pitches went uncounted; another found only 12% of collegiate throws happened in games — 88% were warmups, bullpens, and practice — and pregame bullpen throws hit ~94% of in-game elbow varus torque (promising). Count all throws or you are blind to most of the load.
- **sRPE is the cheapest, most validated internal-load tool in sports science.** Session-RPE = RPE (0–10) × duration or throw count, costs $0, takes 30 seconds per athlete ~30 min post-session, and underpins most load-management literature (proven). It should be the spine of any facility system before any hardware is bought.
- **The Acute:Chronic Workload Ratio is useful as a communication tool but statistically fragile.** The Driveline/ArmCare "sweet spot" of 0.8–1.3 (acute 7–9 day vs chronic 28 day) tracks with elevated injury odds above ~1.3–1.5, and one motion-sensor study found 15.2× higher injury likelihood when ACWR spiked above 1.27 — but Impellizzeri and colleagues showed ACWR magnifies acute load without adding predictive value and that random "chronic" denominators associate with injury just as well (debunked as a precise predictor; still useful as a ramp-rate guardrail).
- **CMJ on force plates is the single best objective CNS-fatigue proxy a facility can own.** Jump height is reliable (CV ~2.5–6.5%), and eccentric braking force/impulse reductions flag neuromuscular fatigue while concentric velocity/power gains reflect positive adaptation (promising). Set a flag threshold near the individual's typical error (~5–7%) or a smallest-worthwhile-change of 0.2× the athlete's SD.
- **Velocity decline is a real but noisy in-game fatigue signal.** Fastball velo drops ~0.28 mph per inning on average and arm slot drops ~0.73° per inning with elbow varus torque climbing ~0.84 N·m per inning after inning 3 — yet one D1 study saw *no* velo decline despite +17.8% subjective fatigue, because mechanics compensate (plausible). Use velo drop as a corroborating signal, not a standalone trigger.
- **Range-of-motion and strength decrements are the arm-specific fatigue layer.** GIRD >20° roughly doubles injury odds and total-rotation deficit >5° raises shoulder-injury rate; 35–43% of asymptomatic pitchers already carry GIRD (proven for GIRD/TRM association). Day-to-day ER-strength "freshness" (% of fresh strength) via a handheld dynamometer catches arm-specific fatigue that a jump test cannot.
- **A system a facility actually sustains is 3 numbers, not 30.** The failure mode is buying a $15k force-plate stack and collecting data nobody reads. The durable minimum: (1) sRPE every session, (2) a weekly CMJ, (3) a periodic arm ROM/strength check — with a red/yellow/green traffic-light readout and a named owner. Compliance beats precision.

## 1. Internal vs External Load: The Core Distinction

Every load-monitoring framework in sport rests on separating two things. **External load** is the physical work prescribed and performed — for a pitcher that is the number of throws, pitch count, distance covered, weighted-ball volume, or a device-derived workload unit. **Internal load** is the athlete's biological and psychological response to that external work — rate of perceived exertion, heart rate, heart-rate variability, blood lactate, and neuromuscular markers like jump performance (proven; this is the foundational taxonomy in the Journal of Athletic Training workload review by Zaremski, Camp, and colleagues, JAT 2020, 55:9).

The reason this matters is not academic. The review is explicit that *"identical external training loads could elicit considerably different internal training loads in two athletes,"* meaning the same bullpen can be a maintenance day for one pitcher and an overload for another (proven). A pitch-count-only system treats all 90-pitch outings as equal. They are not: a 90-pitch outing at high leverage, on short rest, in heat, against a tough lineup, for a pitcher whose HRV is suppressed, is a fundamentally different stressor than 90 low-stress pitches for a fresh, well-recovered arm.

The practical takeaway for facility design is that **you want at least one external measure and at least one internal measure, and the internal one is the higher-value signal.** External load is easy to capture and objective; internal load is what actually predicts breakdown and adaptation. Most amateur and even pro settings over-invest in external precision (fancy sensors) and under-invest in internal signals (a 10-second RPE prompt) — the reverse of the evidence-based priority.

**For Soto:** Neptune's data spine already ingests external throwing load through the Compete/TrackMan pipeline (`compete_pitches`). The missing half is a lightweight internal-load capture. A single `session_rpe` field (0–10) attached to every logged session, plus a periodic jump and arm-strength record, converts Neptune from "we measure what they threw" to "we measure how they're absorbing it" — which is the actual differentiator a premium development-lab charges for.

## 2. Counting the Right Thing: Why Pitch Counts Under-Report Load

Before choosing any internal metric, a facility has to fix the external denominator, because the standard one — the in-game pitch count — is badly incomplete. The JAT workload review documents that **only ~12% of collegiate throws occurred during games; the other ~88% happened in practice, warmups, and bullpens** (promising, single-cohort data). A separate analysis found **42.4% of game-day pitches weren't captured by traditional counts** at all. And the load hidden in that gap is not low-intensity: **pregame bullpen throws generated elbow varus torque at ~94% of in-game intensity** (promising). A pitcher who throws a 25-pitch pen at near-max torque and then 90 in the game did roughly 115 high-stress throws, but the box score says 90.

This is why device-based external monitoring exists. The **Driveline PULSE Throw** (worn below the UCL, retail ~$200–$320) captures peak elbow valgus torque, arm speed, arm slot, and acceleration on *every* throw — bullpen, warmup, or game — and converts each throw to a "1-throw Workload Number" scaled by torque and the athlete's height/weight, summed to a daily workload (promising). This closes the counting gap that pitch counts leave open.

The counting principle generalizes: **monitor total throwing volume, not just competitive pitches.** For youth, MLB/USA Baseball's Pitch Smart guidelines remain the evidence-anchored external limits — e.g., ages 13–16 ≤95 pitches/game, ages 19–22 ≤120/game, with graduated required rest (a 15–18 y/o throwing 76+ pitches needs 4 calendar days rest) (proven association between overuse and injury underpins these). The risk data behind them is stark: >80 pitches/game raised surgery-requiring-injury risk ~4×; adolescents throwing >75/game were 1.59× more likely to have shoulder/elbow pain; >400 competitive pitches/year carried 2.81× odds of shoulder pain and 2.34× of elbow pain; and injured pitchers had thrown ~1,294 more pitches per year than uninjured ones (proven).

**For Soto:** Neptune should log every throwing exposure, not just mound sessions — long toss, plyo/weighted-ball work, and pens all carry near-game torque. If PULSE is in the tech stack, the per-throw workload number is the external unit to store in `compete_pitches`-adjacent tables; if not, a manual "throws × intensity" estimate is a serviceable proxy. Either way, the schema should treat the *session*, not the game, as the load unit.

## 3. sRPE: The Highest-ROI Internal-Load Tool

If a facility buys nothing, it should still run session-RPE. **sRPE = RPE (typically the 0–10 Borg CR10 scale) × session external load** (duration in minutes, or throw count for arm work) — a single multiplication that yields an arbitrary-unit internal-load score (proven; sRPE is among the most validated constructs in training-load science). It costs nothing, takes ~15–30 seconds per athlete, and is best collected ~30 minutes post-session so the rating reflects the whole session rather than the last drill.

sRPE's value is that it *automatically integrates* intensity and volume and *individualizes* the response — a max-effort velo day and a light catch-play day with the same throw count get very different sRPE scores, and two pitchers doing the same bullpen can report different internal loads. In the soccer literature, sRPE-derived acute:chronic ratios above 1.38 were associated with 2.2× higher injury risk vs ratios below 1.0 (promising; transfers conceptually to baseball but not validated on pitchers specifically).

The limitations are honest ones: RPE is subjective and can be gamed or mis-anchored by inexperienced athletes, and it needs a brief education pass so a "7" means the same thing week to week. But its reliability and predictive track record across sports make it the correct foundation. **Everything else in a monitoring system is an upgrade on top of sRPE, not a replacement for it.**

**For Soto:** This is the single cheapest, most defensible addition to Neptune's product. A `session_rpe` integer (0–10) and an auto-computed sRPE (RPE × throws or minutes) on every session record, rolled into a weekly athlete view, gives the facility a real internal-load dataset for $0 of hardware. It also feeds directly into whatever ACWR-style ramp guardrail Neptune chooses to display.

## 4. The Acute:Chronic Workload Ratio — Useful, Fragile, Overhyped

ACWR is the most famous — and most contested — load metric. The concept: divide recent ("acute") load by longer-term ("chronic") load to see whether an athlete is ramping faster than their fitness base supports. Driveline PULSE and ArmCare both operationalize it as **acute = average daily workload over the last 9 days, chronic = average over the prior 28 days, with a recommended "sweet spot" of 0.8–1.3** (the JAT review uses 7–9 day acute / 28 day chronic) (promising as a heuristic). Above the sweet spot means you spiked; below ~0.8 means you may be detraining/underloaded.

The supporting signals: ACWR >1.5 doubled soft-tissue injury risk in the broader literature; a workload increase >50% vs the prior month doubled injury risk; and a motion-sensor pitcher study found **15.2× higher injury likelihood when the acute:chronic ratio spiked above 1.27** (promising, but small samples and wide confidence intervals). ArmCare's Ryan Crotin adds an important counterpoint: teams that had pitchers throw *fewer* pitches at lower levels saw *more* injuries once those players reached full-season leagues — i.e., **chronic underloading is itself a risk factor**, which is exactly what a too-low ACWR is meant to flag (plausible).

But the honest verdict on ACWR as a *predictor* is skeptical. Impellizzeri, Tenan, and colleagues showed the ratio is a **statistical artefact**: it mathematically magnifies the acute term, its odds ratios are inflated by the way ratios distribute, there is no principled justification for the specific 7/28-day windows, and — most damningly — dividing acute load by a *randomly generated* chronic denominator associates with injury about as well as the real chronic load (debunked as a precise, validated injury predictor). The "sweet spot" injury figure and its U-shape have been formally challenged in the British Journal of Sports Medicine.

The reconciliation practitioners have landed on: **use ACWR as a ramp-rate communication tool, not an injury oracle.** It is a legible way to tell an athlete "you spiked your throwing 2.5× this week" and to enforce gradual progression. It should never be the *only* input, and a green ACWR should never override a red jump test or a sore arm.

**For Soto:** If Neptune shows an ACWR-style widget, frame it as a *ramp guardrail* ("acute vs chronic throwing load") with the 0.8–1.3 band, not as a risk score. Evidence-graded honesty is a selling point with a data-literate operator like Trevor: display it, caveat it, and weight the internal signals (sRPE, CMJ, arm freshness) higher. Store the raw daily loads so the ratio is derived, not primary — that way you can swap in a better ramp metric (e.g., week-over-week % change, or exponentially-weighted moving averages) without re-instrumenting.

## 5. CMJ on Force Plates: The Best Objective CNS-Fatigue Proxy

The countermovement jump measured on force plates is the most practical objective window into central-nervous-system / neuromuscular fatigue that a baseball facility can own. Protocol: athlete stands with feet symmetric on the plates, **hands on hips** (to remove arm swing), cued "down fast, up high," typically **3 trials** with rest, on dual plates (e.g., VALD ForceDecks or Hawkin Dynamics) (proven protocol standard).

The metrics stratify usefully:
- **Outcome metrics** — jump height (via impulse-momentum), peak power, net impulse — the "how high/how much" summary.
- **Driver metrics** — concentric peak force/velocity, eccentric peak force, modified reactive strength index (RSI-mod) — the "how they did it."
- **Strategy metrics** — countermovement depth, eccentric duration, total contraction time — the movement *shape*.

The fatigue logic that makes CMJ valuable: **reductions in eccentric braking force or impulse are associated with neuromuscular fatigue**, while **improvements in concentric velocity/power reflect positive adaptation** (promising). Critically, an athlete can hold jump *height* steady while *changing strategy* — jumping the same height with a deeper, slower countermovement is a fatigue signature that only force-time data reveals. This is why the force plate beats a jump mat or a Vertec: it sees *how* the jump was produced, not just the result.

Reliability supports day-to-day monitoring. Jump height coefficient of variation runs **~2.5% in elite athletes and ~5.7–6.5% test-retest** across studies, and CMJ passes the sensitivity bar (smallest-worthwhile-change > typical error) for jump height, though rate-of-force-development metrics are noisier and should be de-emphasized for flagging (proven reliability, promising fatigue application). Practical flag-setting: compute each athlete's own typical error / CV over a baseline block, then flag a drop beyond that (roughly 5–7%), or use an SWC of **0.2 × the athlete's between-day SD**. Weekly cadence is the common recommendation; higher frequency (e.g., day-after-outing) sharpens the fatigue read but taxes compliance.

CMJ also correlates with the thing pitchers care about — lower-half power drives velocity. In D1 pitchers, **concentric impulse and peak power correlated with fastball velocity at r ≈ 0.71 and 0.68**; in adolescents, absolute braking force + height explained 43.3% of velocity variance (promising). So the same test that flags fatigue also tracks the athletic quality that produces stuff — a genuinely dual-purpose tool.

**For Soto:** A single dual-force-plate station (Hawkin or VALD, typically a multi-thousand-dollar purchase or annual subscription) is the highest-value hardware Neptune can add for fatigue monitoring, and it doubles as a velocity-development KPI. Store per-jump force-time metrics keyed to athlete + date; surface a per-athlete "readiness" delta = today's jump height (and eccentric impulse) vs the athlete's rolling baseline, with red/yellow/green thresholds set from their own CV. This is a natural Triton dashboard tile alongside Stuff+/command.

## 6. Velocity Decline as an In-Game Fatigue Signal

Because the platform already owns pitch-level velocity, using velo drop as a fatigue readout is tempting and nearly free. The signal is real but must be handled carefully. On average, **fastball velocity declines ~0.28 mph per inning**, **arm slot drops ~0.73° per inning**, subjective fatigue rises ~0.72 points per inning, and **medial elbow (varus) torque increases ~0.84 N·m per inning beyond inning 3** as mechanics degrade — the trunk drifts toward vertical and the kinetic chain loses efficiency (promising; from simulated-game and biomechanics work synthesized in the 2024 Yanagisawa narrative review and ASMI-lineage studies).

But the counter-evidence is important: a study of **11 NCAA D1 pitchers across 26 games (season avg 1,079 ± 251 pitches; 97.2 ± 16.1 per game)** found **no significant fastball-velocity decline** from game start to finish (38.6 vs 38.4 m/s) *despite* a +17.8% ± 14.1% rise in subjective fatigue and clear kinematic drift — shoulder external rotation fell ~2.3° late in games, and elbow height, hip lean, and glove position all shifted, with changes appearing after ~the 15th pitch of an inning (proven within-sample). The interpretation: **fatigued pitchers often preserve velocity by changing mechanics**, which trades a visible output signal for a hidden increase in joint stress. So a *stable* velo line does not mean a fresh arm.

The practical rule: **velocity decline is a corroborating signal, not a trigger.** A within-outing velo drop of more than a couple mph off a pitcher's established baseline, *combined* with a mechanical tell (dropping slot, shorter extension) or a red jump/arm-strength reading, is meaningful. Velo alone is too confounded by adrenaline, effort, count leverage, and mechanical compensation to stand on its own.

**For Soto:** Triton can compute a per-outing "velo fatigue" feature from `pitches` / `compete_pitches` — e.g., rolling fastball velo vs the pitcher's first-15-pitch baseline, plus slot/extension drift — and flag outings where velo *and* slot degrade together. Weight it as one input among several; explicitly warn that a flat velo line with degrading mechanics is the *dangerous* pattern (rising torque, hidden fatigue), not the safe one. This is a place where Triton's pitch-level data adds a signal most facilities can't compute.

## 7. ROM and Strength Decrement: The Arm-Specific Fatigue Layer

Jump tests read whole-body CNS fatigue; they say nothing about the throwing shoulder specifically. That gap is filled by range-of-motion and strength decrement tracking, which is the arm-care core of any pitching-monitoring system.

**Range of motion.** The best-validated marker is glenohumeral internal-rotation deficit (GIRD) and total-rotation deficit. **GIRD >20° vs the non-throwing shoulder roughly doubles injury odds**, and **total rotational motion (TRM) deficit >5° raises shoulder-injury rate** (proven association; meta-analytic support, though effect sizes vary and some pro-cohort results were non-significant, e.g., P=.17 in one n=40 study). Prevalence context matters: **35–43% of asymptomatic pitchers already have GIRD**, so GIRD is not automatically pathological — the *acquired, asymmetric, day-to-day change* is the fatigue/risk signal, not the static presence. Loss of internal rotation and total arc after an outing, that fails to recover within the normal window, is the flag.

**Strength decrement.** This is where day-to-day arm fatigue shows up fastest. ArmCare-style handheld-dynamometer testing captures throwing-arm strength (an "ArmScore" of force + strength-to-bodyweight), the **external-rotation/internal-rotation (ER/IR) balance ratio**, a strength-to-velocity ratio (lbs per mph), and — most useful for fatigue — **strength recovery (± lbs vs previous session) and strength "freshness" (% of the athlete's fresh strength)** (promising; commercial validation, limited independent peer review). A shoulder that tests at, say, 80% of its fresh ER strength the day after an outing is carrying arm-specific fatigue that a jump test would miss entirely. The ER/IR balance also flags the chronic pattern where IR strength enhances and ER strength weakens — the classic thrower's imbalance associated with GIRD.

The two layers are complementary: **CMJ = systemic/CNS fatigue; ROM + arm strength = local tissue fatigue.** A pitcher can be systemically fresh (good jump) but arm-fried (low ER freshness, lost IR ROM), or vice versa. A serious system reads both.

**For Soto:** Neptune's intake battery should include a baseline shoulder ROM screen (IR/ER/total arc, both shoulders) and periodic ER/IR dynamometer strength, with the *acquired asymmetry and day-to-day freshness* — not the raw number — as the tracked signal. Store per-athlete baselines so decrements are relative to self. This is also a natural Triton table: `athlete_arm_status` keyed to athlete + date with IR/ER ROM, ER/IR strength, and computed freshness %, surfaced as a traffic-light next to workload and CMJ.

## 8. HRV and Other Internal Signals: Nice-to-Have, Not Core

Heart-rate variability is the most cited "recovery" metric, and it has legitimate but bounded value for pitchers. Cornell and colleagues (2017) tracked resting HRV across the 5-day starter rotation and found **HRV significantly suppressed on Day 2 post-start, returning toward baseline by the next day**, with **large between-athlete differences in baseline autonomic tone** — some pitchers naturally parasympathetic-dominant, others closer to sympathetic even at rest (promising). The recovery timeline is individual, not universal.

The practical constraints: HRV must be measured **as close to waking as possible** (waking measures were sensitive to training-load changes; later-day measures were not), requires daily compliance to build a personal baseline, and is heavily confounded by sleep, alcohol, illness, and stress. It is better read as a **rolling trend against the individual's own baseline** than as a single-day number. For a facility, HRV is a plausible add-on once the core system is running and compliant — cheap now via phone-camera or wearable apps — but it is *not* where a facility should start, because its noise and compliance burden outstrip its marginal value over sRPE + CMJ + arm status.

Other internal markers (blood lactate, continuous-lactate biosensors, salivary markers) are research-interesting — 2026 work is exploring continuous lactate monitoring for real-time pitcher fatigue — but are not yet facility-practical (plausible/experimental).

**For Soto:** Treat HRV as Phase 2. If Neptune's clientele already wear WHOOP/Oura/Apple Watch, ingesting a morning HRV trend is low-cost and adds a systemic-recovery lens — but only display it as a personal-baseline trend with heavy caveats, and never let a green HRV override a red arm-status or jump reading. Do not build the facility's monitoring identity around HRV.

## 9. Building a Monitoring System a Facility Will Actually Sustain

The graveyard of athlete monitoring is full of $15,000 force-plate setups collecting data nobody looks at. **The binding constraint is not measurement precision — it is compliance and the coach's attention budget.** The design principles that survive contact with a real facility:

1. **Fewer numbers, religiously collected, beats many numbers sporadically.** The durable minimum is three: (a) **sRPE** every session (internal load, $0), (b) a **weekly CMJ** on force plates (systemic fatigue), and (c) a **periodic arm ROM + ER/IR strength check** (local fatigue). Add external throwing volume (PULSE or manual throw-count-×-intensity) as the load denominator. That's it to start.

2. **Every metric needs a decision attached.** If a red CMJ or a low arm-freshness reading doesn't change *anything* about the day's plan, stop collecting it. Map each signal to an action: red → deload/download, yellow → modify volume or intensity, green → proceed. Borrow ArmCare's four-phase language — **Download** (slight reduction), **Deload** (significant reduction), **Reload** (gradual ramp), **Overload** (intentional adaptive spike) — as the intervention vocabulary.

3. **Individual baselines, not population norms.** Thresholds must be relative to each athlete (their CV, their SD, their fresh strength), because between-athlete variation swamps the signal — the same absolute jump height or HRV means different things for different arms. Set flags at ~the athlete's typical error (CMJ ~5–7%), or SWC = 0.2 × their SD.

4. **A traffic-light readout and a named owner.** The output must be a glanceable red/yellow/green per athlete that a coach reads in seconds, and one person must own the system or it dies. Dashboards that require interpretation get ignored.

5. **Automate capture, minimize athlete friction.** sRPE via a 10-second phone prompt; CMJ auto-logged from the plate software; wearable HRV ingested passively. Every manual step is a compliance leak.

6. **Corroborate, never single-trigger.** No one metric pulls a pitcher. Concordance across signals (spiked ACWR + red CMJ + low arm freshness + velo/slot drop) is the high-confidence flag; a lone red is a "watch," not a "shut down."

A realistic phased rollout: **Phase 1** — sRPE + throw-count on every session, with a simple week-over-week ramp guardrail. **Phase 2** — add weekly CMJ once a plate is in the building. **Phase 3** — add periodic arm ROM/strength and, if clientele already wear devices, an HRV trend. Each phase must be *sustained* before the next is added.

**For Soto:** This is the assessment → programming → **monitoring** spine Neptune's model needs, and it's a clean Triton build. Minimum viable schema: one `athlete_sessions` record per session (sRPE, throws, session type) → derives acute/chronic load; one `athlete_jump_tests` record (CMJ metrics + baseline delta); one `athlete_arm_status` record (IR/ER ROM, ER/IR strength, freshness %). Surface a single per-athlete **readiness traffic-light** that combines them, with each input caveated by its evidence grade. Build Phase 1 first, prove compliance, then layer hardware — the same "shippable, incremental, high-value-per-change" discipline the platform already runs on. The differentiator Neptune sells is not the sensors; it's the *sustained, individualized readout* that a commodity cage barn will never maintain.

## Sources

1. Zaremski JL, et al. "A Review of Workload-Monitoring Considerations for Baseball Pitchers." Journal of Athletic Training, 2020;55(9):911. https://pmc.ncbi.nlm.nih.gov/articles/PMC7534929/
2. Science for Sport — "Acute:Chronic Workload Ratio." https://www.scienceforsport.com/acutechronic-workload-ratio/
3. Impellizzeri FM, Tenan MS, et al. "Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls." (Semantic Scholar / Int J Sports Physiol Perform). https://www.semanticscholar.org/paper/Acute:Chronic-Workload-Ratio:-Conceptual-Issues-and-Impellizzeri-Tenan/ede5743a426fd6429d28f8505500a3f771dbcf8b
4. "What Role Do Chronic Workloads Play in the ACWR? Time to Dismiss ACWR and Its Underlying Theory." Sports Medicine (Springer). https://link.springer.com/article/10.1007/s40279-020-01378-6
5. "The acute-chronic workload ratio-injury figure and its 'sweet spot' are flawed." (BJSM, ResearchGate PDF). https://www.researchgate.net/publication/333589357
6. Premier Pitching — "The Role of Countermovement Jump Assessment in Baseball: Force Plate Applications." https://premierpitching.com/blogs/premier-pitching-chronicles/the-role-of-countermovement-jump-assessment-in-baseball-force-plate-applications-for-performance-programming-and-health
7. "Countermovement Jump and Momentum Generation Associations to Fastball Velocity Among Division I Collegiate Pitchers." PubMed. https://pubmed.ncbi.nlm.nih.gov/38900174/
8. "Countermovement Jump Analysis as a Predictor of Overhead Pitching Velocity in Adolescent Baseball Pitchers." Journal of Human Kinetics. https://johk.pl/wp-content/uploads/2025/10/1InPress_102.pdf
9. Cormack SJ, et al. "Reliability of Measures Obtained During Single and Repeated Countermovement Jumps." IJSPP 2008. https://www.innervations.com/resources/Reliability%20of%20measures%20obtained%20during%20single%20and%20repeated%20countermovement%20jumps%20-%20Cormack%20et%20al%20IJSPP%202008.pdf
10. "Countermovement Jump Analysis Using Different Portable Devices: Implications for Field Testing." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC6162675/
11. "The Impact of Fatigue on the Kinematics of Collegiate Baseball Pitchers." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC4555605/
12. Yanagisawa O, et al. "Alterations in pitching biomechanics and performance with an increasing number of pitches: A narrative review." PM&R, 2024. https://onlinelibrary.wiley.com/doi/10.1002/pmrj.13054
13. "Manifestations of muscle fatigue in baseball pitchers: a systematic review." PeerJ 2019. https://peerj.com/articles/7390/
14. "Pitching Biomechanics as a Pitcher Approaches Muscular Fatigue During a Simulated Baseball Game." PubMed (ASMI). https://pubmed.ncbi.nlm.nih.gov/16973902/
15. "Correlation of GIRD and Total Rotational Motion to Shoulder Injuries in Professional Baseball Pitchers." PubMed. https://pubmed.ncbi.nlm.nih.gov/21131681/
16. "Glenohumeral Internal Rotation Deficit and Injuries: A Systematic Review and Meta-analysis." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC5967160/
17. ArmCare — "Rethinking Acute to Chronic Workload for Pitchers." https://blog.armcare.com/rethinking-acute-to-chronic-workload-for-pitchers/
18. Driveline Baseball — "PULSE Throw Workload Monitor" & "Using PULSE to Define Throwing Workload." https://www.drivelinebaseball.com/product/pulse-throw/ , https://www.drivelinebaseball.com/2020/04/what-is-throwing-workload/
19. Elite Baseball Performance — "Resting Heart Rate Variability Among Professional Baseball Starting Pitchers" (Cornell et al. summary). https://elitebaseballperformance.com/resting-heart-rate-variability-among-professional-baseball-starting-pitchers/
20. MLB Pitch Smart — Pitching Guidelines. https://www.mlb.com/pitch-smart/pitching-guidelines
