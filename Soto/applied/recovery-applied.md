---
title: Recovery Tech & Strategy — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - recovery
  - triton-platform
  - neptune-performance
  - assessment-battery
  - monitoring-spine
  - readiness
  - arm-care
  - recovery-tech-buyers-guide
last_updated: 2026-07-19
---

# Recovery Tech & Strategy — Applied Playbook

> Translates the 10-doc `recovery/` research corpus into a sequenced build/buy/train plan for the
> three things Soto serves: **Triton** (the analytics platform), **Neptune** (the development lab in
> buildout), and **Trevor** (post-TJ, staying-sharp/demo/coaching). Sequenced **Now / Next / Later**.
> Every recommendation cites the domain doc(s) it draws from by filename and carries a
> cost/effect/time estimate where one exists. Grades (proven / promising / plausible) carry through
> from the source docs — the whole point of a Trevor-credible product is that the grade is visible.

## TL;DR

- **The organizing law of the whole corpus: recovery and adaptation are a tradeoff, not a synergy**
  (`03`, `10`). For a *development* facility whose product is adaptation, that inverts the default
  youth-baseball recovery culture — bias toward heat, movement, sleep, food, and non-fatiguing
  e-stim; treat cold/compression/ice as phase-gated, in-season-only tools. Every recovery
  prescription should be a *function of the athlete's programming phase*, generated from the plan —
  not a fixed "menu on the wall."
- **The monitoring spine is 3 numbers, not 30** (`08`): (1) **sRPE** every session ($0), (2) a
  **weekly CMJ** on force plates, (3) a **periodic arm ROM + ER/IR strength check**. Add external
  throwing volume as the load denominator. Ship Phase 1 (sRPE + throw count) before buying a single
  sensor — compliance beats precision, and the *sustained individualized readout* is the moat a cage
  barn will never maintain.
- **Triton's highest-ROI recovery builds need zero new hardware** — computable from `pitches` /
  `compete_pitches` today: a **within-outing velo-fatigue feature** (velo *and* slot degrading
  together = the dangerous pattern), a **consecutive-day reliever load flag** (3-in-3), a **workload
  → fueling recovery flag**, and a **sleep-debt covariate** once wearable data lands (`08`, `07`,
  `02`, `01`). Present all readiness as a **per-athlete rolling baseline + SWC band + traffic light**,
  never a vendor "readiness %" (`04`).
- **Neptune's recovery buy order is settled by evidence-per-dollar, and it's nearly the inverse of
  the hype order** (`10`): $0 sleep/nutrition/mobility systems → **Marc Pro** ($699×1–3) → massage
  guns → **one sauna** ($3–10k infrared, buy heat *before* cold) → Normatec → inflatable cold plunge
  ($1.6–2.7k). Skip PEMF; Game Ready by rental only. Spend saved capital on **assessment tech**
  (force plates, BFR, dynamometry) — that builds the data moat; the recovery room is a retention
  amenity.
- **BFR is the sleeper high-credibility buy** (`06`): SmartCuffs 4.0 clinical/8-cuff set ~$1,699 +
  Owens cert. It's the only tool that delivers a hypertrophy/strength stimulus at loads a compromised
  or in-season arm tolerates — directly on-mission for arm-care and Trevor's own post-TJ arc.
- **The assessment battery is where the "development lab" price (3–10× a cage barn) is justified**
  (`01`, `02`, `04`, `05`, `07`, `09`): validated intake screens (ASSQ/ASBQ, rMEQ, RESTQ-36, sweat
  rate, 25(OH)D, baseline GIRD/ROM + ER/IR strength + grip) feeding one longitudinal athlete profile.
- **For Trevor (post-TJ, arm-first):** honor the HRV Day-2 valley, gate high-intent throwing on
  grip/ROM recovery, treat any medial-elbow sharpness as *pain not soreness*, run the
  creatine + tested-vitamin-D + omega-3 + pre-throw-collagen stack, extend/bank sleep, and default to
  Marc Pro over ice. The "ice is comfort + placebo, sleep is the real drug" line is accurate,
  audience-grabbing content (`07`, `02`, `06`, `01`).

---

## The two ideas everything hangs on

**1. The tradeoff axis (`03`, `10`).** Every modality sits on one question: how much do you want to
dampen the post-exercise inflammatory/blood-flow response? That cascade (macrophage IGF-1, IL-6-driven
satellite-cell activation, elevated MPS) *is* the repair courier, not damage. Ice, CWI, and NSAIDs make
you feel better tomorrow at the cost of the stimulus you paid for today. So the *same* plunge is smart
the night before a showcase and self-sabotage 3 hours after a max-velo pulldown. The decision is
almost entirely calendar position: **build block vs. game week.** This must live in the programming
layer, not on signage.

**2. Internal load is the higher-value signal (`08`).** External load (pitch count, PULSE torque
units) is what the athlete *did*; internal load (sRPE, CMJ decrement, arm freshness, HRV trend) is how
they *responded* — and identical external loads produce very different internal loads across two
arms. Neptune's Compete pipeline already ingests the external half. The missing, cheaper, more
predictive half is internal capture. That's the build.

---

# NOW (0–8 weeks) — ship the spine, buy the cheap wins

## Triton

- **`athlete_readiness` schema + rolling-baseline engine (`08`, `07`, `04`).** Three tables mirroring
  the existing Compete pattern: `athlete_sessions` (session type, throws, `session_rpe` 0–10, derived
  sRPE = RPE × throws), `athlete_jump_tests` (CMJ force-time metrics + baseline delta),
  `athlete_arm_status` (IR/ER/total ROM both shoulders, ER/IR dynamometer strength, grip, computed
  `freshness_pct`). Compute **per-athlete rolling 7-day baseline + SWC band (≈0.2× the athlete's
  between-day SD; ~5–7% for CMJ)** and collapse to one **red/yellow/green traffic-light tile**. Effort:
  ~1–2 build sessions for schema + baseline math (same rolling-window logic Triton already uses for
  league benchmarks). This is the product, not a nice-to-have.
- **Within-outing velo-fatigue feature (`08`, `07`).** From `pitches` / `compete_pitches`: rolling
  fastball velo vs the pitcher's first-15-pitch baseline, plus arm-slot/extension drift. **Flag
  outings where velo AND slot degrade together** — and explicitly warn that a *flat velo line with
  degrading mechanics* is the dangerous pattern (hidden rising torque ~0.84 N·m/inning after inning 3),
  not the safe one. Velo alone is a *lagging* indicator (grip falls ~12.7% before the gun moves ~1%),
  so weight it as corroboration, never a standalone trigger. Zero new data; pure derived field.
- **Reliever consecutive-day load flag (`07`).** Compute a per-arm "consecutive-day exposure" from
  game logs / Compete and flag **3-in-3** (velocity tax ~0.5 mph back-to-back, ~1.5 mph over three
  straight days; tissue cost climbs even when in-game *results* don't). Cheap, novel, directly useful
  for both Neptune relievers and Trevor's own late-career reliever pattern.
- **Workload → fueling "recovery flag" on the pitcher/outing view (`02`, `07`).** High pitch count +
  hot game + short rest → surface an aggressive-refill + hydration + 40 g pre-sleep casein reminder.
  Turns nutrition science into a shippable, incremental UI feature. Log the query if any ad-hoc SQL is
  run (`docs/Queries.md` convention).

## Neptune

- **Adopt the 3-number monitoring spine, Phase 1 only (`08`).** sRPE (0–10, collected ~30 min
  post-session) + total throw count (not just game pitches — pitch counts miss ~40–88% of real
  throwing volume; pregame bullpens hit ~94% of in-game torque) on *every* session, with a simple
  week-over-week ramp guardrail. $0 hardware. Prove compliance before layering anything.
- **Buy the cheap, evidence-forward hardware first (`10`, `03`, `05`):**
  - **Marc Pro** — $699 (Plus $1,399). Buy 1–3. Highest-ROI active device; non-fatiguing e-stim
    replaces reflexive post-throw ice (the clearest "stop doing this" in arm care). All 30 MLB clubs
    own it — the adoption story sells itself. Program as the *default* post-moderate/high-intensity
    throwing tool.
  - **Massage guns** — $100–600 each, buy a handful. Warm-up/ROM/soreness tool (large acute ROM,
    real DOMS reduction; 40-min doses track better). Keep them *off* the throwing arm in the 30 min
    before max-intent throwing (transient explosive-output blunting).
  - **Hand grip dynamometer** — $40–150. The single cheapest high-signal fatigue check available;
    catches forearm-flexor fatigue the radar gun misses. Pre/post + day-over-day.
- **Codify the soreness/fatigue/pain triage tree (`07`).** A one-screen intake/daily flow: location
  tap-map → onset timing → sharp vs dull → NSAID yes/no → warms-out yes/no → green/yellow/red, routing
  red (localized, bony/joint, >72h, worsens with activity, needs Advil, medial-elbow) to evaluation
  before the next throwing slot. Low effort, high liability-reduction.
- **Youth policy = Pitch Smart rest tables as non-negotiable floor (`07`, `09`).** These are the
  evidence-graded backbone and a liability shield (arm-fatigue throwing = ~13–36× injury multiplier).
  Pair with pre-outing arm-fatigue screening and multi-sport encouragement before ~age 15.
- **Publish the phase-aware recovery rule (`03`, `10`).** Build block → heat/movement/sleep/food,
  push cold ≥4–6 h from the throwing/lifting stimulus or skip. Game week / in-season back-to-backs →
  cold + compression OK. This is the philosophical spine of the whole recovery product.

## Trevor

- **Drop reflexive post-throw ice; default to Marc Pro + mobility (`03`, `07`).** On-brand, accurate,
  and it protects the adaptive signal his 30-something post-TJ tissue leans on harder than it did at 24.
- **Lock the personal supplement stack (`02`):** creatine 3–5 g/day (skip loading), 25(OH)D tested
  and corrected to ≥32–40 ng/mL (~2,000–5,000 IU if low), omega-3 2–3 g EPA+DHA standing, **15 g
  collagen + ~50 mg vitamin C 30–60 min pre-throwing** (feeds the tendon's load response — pair with
  loading, doesn't build tendon alone). Protein **1.8–2.0 g/kg/day** (anabolic resistance with age),
  0.3 g/kg × 4 meals + **40 g pre-sleep casein** on heavy-throw days.
- **Treat medial-elbow sharpness as pain, never soreness (`07`).** Lowest threshold given TJ 2017;
  inside-elbow sharpness that grows across a pen is a shutdown flag regardless of how loose the arm
  feels.
- **Content angle, ready now (`07`, `10`, `02`):** "Ice is mostly comfort + placebo; sleep is the real
  drug" and "we don't ice, we move blood" (Marc Pro). Evidence-graded, survives his bro-science filter,
  differentiates Mayday content from mechanics-only facilities.

---

# NEXT (2–6 months) — layer the hardware and the assessment battery

## Triton

- **Ingest nightly wearable data → sleep-debt + HRV covariates (`01`, `04`, `08`).** Standardize one
  device per cohort (don't mix within a monitoring group), pull raw nightly **TST, sleep efficiency,
  RHR, HRV**, and compute *individual rolling baselines*. Surface **lnRMSSD 7-day mean + personal CV +
  SWC band** — never the vendor "72% recovered" (composite scores show no significant correlation with
  self-reported recovery). Actionable signals: sleep-debt (TST vs baseline) and fragmentation
  (efficiency/WASO) as an injury-risk covariate; a rising CV or 2+ out-of-band days as a deload flag;
  a sharp HRV drop + malaise as the one fast-acting illness exception. **Explicitly hold sleep staging
  as trend-only** (±20 min REM error generates false anxiety).
- **BFR logging fields (`06`).** Per-session `lop`, `cuff_site`, `pct_lop`, `load`, `rep_scheme`, RPE
  on the `athlete_sessions`-adjacent schema. LOP trends track BP and limb composition — a cheap, novel
  data stream and exactly the individualized-dosing story that separates a lab from a barn.
- **Anti-nocebo product rules baked in (`04`):** primary visual = rolling trend + SWC band, today's
  raw number secondary; require the athlete's *subjective* readiness entry **before** revealing the
  device number (disagreement is itself signal); never show a binary go/no-go — output a training
  *flavor* ("full send" / "quality over quantity" / "flush & recover") mapped to autoregulation tiers.

## Neptune

- **Force plates — the highest-value assessment purchase (`08`).** One dual-plate station (Hawkin
  Dynamics or VALD ForceDecks, multi-thousand-$ purchase or annual sub). CMJ (hands-on-hips, 3 trials)
  is the best objective CNS-fatigue proxy *and* doubles as a velocity-development KPI (concentric
  impulse/peak power correlate with FB velo at r≈0.68–0.71). Track eccentric braking force/impulse
  (fatigue) vs concentric velocity/power (adaptation); flag on the athlete's own CV. This is Phase 2 of
  the spine.
- **Arm-status layer — ArmCare-class strength testing (`05`, `07`, `08`).** Sensor + app, a few
  hundred $/unit. **Trust the strength/fatigue/recovery numbers (validity r≈0.72–0.81 vs dynamometer);
  discount the app's ROM (r≈0.23–0.47)** — pair with manual goniometry for ROM. Weekly + post-outing.
  Feeds `athlete_arm_status.freshness_pct`.
- **BFR program — the sleeper credibility buy (`06`).** **SmartCuffs 4.0 clinical/8-cuff set ~$1,699**
  (auto-finds LOP in ~30 s, Mayo-validated, FDA-listed, 8-cuff throughput for group work) +
  **Owens Recovery Science certification** for whoever administers. Skip elastic bands as anything but
  take-home education. Non-negotiable: a **written BFR safety screen** (absolute contraindications: DVT/
  clotting disorder, uncontrolled HTN >180/110, sickle cell, limb infection/malignancy, pregnancy) +
  resting BP. SOP headline: **20–40% 1RM, arms 40–50% LOP / legs 60–80%, 30/15/15/15, cuff stays
  inflated through all sets and rests.** Anchor citation: the 2023 D-I pitcher RCT (n=28, BFR-LIX added
  to offseason cuff work → more shoulder lean mass, cuff strength, endurance) — sell *lean
  mass/endurance/strength*, not "throws harder / fewer injuries" (not yet proven).
- **Sauna — buy heat before cold (`03`, `10`).** Infrared commercial cabin **$3–10k** (plug-in, often
  no permits, ~$5–15/mo to run) or traditional $8–17k installed if budget/evidence justify (the
  plasma-volume ~5.6% and mortality data are built on *traditional* Finnish sauna). Adds an adaptive
  stimulus (no hypertrophy-blunting), doubles as summer heat-acclimation for in-season durability. The
  development-aligned thermal asset.
- **Stand up the assessment battery (`01`, `02`, `04`, `05`, `07`, `09`).** Digitize into the intake →
  athlete profile:
  - **Sleep:** ASSQ (routes the ~25% who need clinical help) + ASBQ (targets modifiable habits) — free,
    athlete-valid (PSQI/Epworth are not).
  - **Chronotype:** rMEQ (5 items, 2 min) — informs training-time scheduling and travel.
  - **Psych load:** RESTQ-36 (or a short custom sleep/fatigue/emotional-stress/being-in-shape subset)
    biweekly; ABQ 3-dimension burnout screen for youth. Flag stress-up / recovery-down over 2 checks.
  - **Hydration:** sweat-rate test (pre/post bodyweight on a hot bullpen day) + sweat-sodium field test
    for salty sweaters → personalized fluid + sodium target (~1 L/hr in heat, replace ~1.25–1.5 L/kg
    lost). A signature Driveline-style deliverable.
  - **Bloodwork:** 25(OH)D (each 5 ng/mL drop ≈ +13% injury odds; ~79% of pro athletes
    insufficient/deficient).
  - **Arm/mobility:** baseline dominant/non-dominant IR/ER/total-rotation (flag GIRD >18–20°, TRM
    deficit >5°), thoracic rotation (~70–90° target), hip IR/ER, grip. A >10° IR deficit persisting
    past 48 h = "not ready to ramp."
- **Programming templates (`02`, `03`, `07`, `08`):**
  - **Rotation template object** — 4–6 day slots each with intent %, distance band, pitch-count target,
    lift focus, and required recovery-marker gates to advance (Day 1 flush + mobility, Day 2 light /
    respect the HRV valley, Day 3 pen ~72 h out, Day 4 taper, Day 5 start).
  - **Role-aware post-game "recovery plate"** — auto-selects carb:protein by role (~2/3 carbs
    multi-inning pitchers/catchers, ~1/4 other position players) and hours-to-next-game; defaults to
    fluid-by-weight-change + 40 g pre-sleep casein; per-meal protein 0.3 g/kg × 4.
  - **Tiered supplement policy** — Tier 1 (broad): creatine 3–5 g/day + vitamin-D-when-low. Tier 2
    (situational): omega-3 2–3 g standing, collagen 15 g + vit C pre-load for connective-tissue-history
    athletes, tart cherry for congested schedules only (blunts adaptation chronically). Tier 3: off the
    menu until asked. Parental consent for minors.
  - **Sleep block** — periodize a 3+ week extension phase (time-in-bed → 9.5–10 h) into heavy velo/
    return-to-throw mesocycles; bank +1–2 h for 2–4 nights before known restriction (travel/showcase).
    Track adherence via wearable TST trend so it's monitored, not honor-system.
  - **Reset-routine template** — step-off → exhale to "release" → single cue; plus a pre-game routine
    builder targeting individual optimal arousal (IZOF).
- **Service/device design (`04`, `05`, `01`):** two-tier readiness — Tier 1 (all athletes) passive
  wearable feeding a personal trend; Tier 2 (high-investment / pro-offseason) adds a standardized
  1-min seated morning HRV capture on bullpen/testing days. Bundle **episodic practitioner hands-on
  (assessment-anchored, higher margin)** with an **athlete-owned daily self-tool protocol** (rollers,
  percussion, banded mobility) — the daily self-work carries the volume, the clinician finds/attacks
  the deep restrictions and re-screens the §6 motion metrics. Standardize on one wearable per cohort
  (Oura Ring 4 is the HRV/RHR accuracy leader, CCC 0.99/0.98; WHOOP defensible but subscription-lock
  bricks the band — a procurement risk across many athletes).

## Trevor

- **Run the 5-day microcycle solo with grip + ROM gates (`07`, `04`).** Honor the Day-2 HRV valley
  (light arm/high-CNS, moderate lower body OK if readiness supports), pen on Day 3. Add a standardized
  **morning seated HRV capture** (he's the exact self-motivated profile the higher-fidelity protocol is
  for) — 1 min, before caffeine, same position daily; act on the 7-day trend, not the number.
- **BFR for his own arm-care window (`06`).** The tool for "can't-load-yet-but-mustn't-detrain" — arms
  40–50% LOP, 30/15/15/15, cuff inflated throughout. Personally relevant (lived the TJ arc) and
  credibility gold for content; be scrupulous that elbow evidence is *promising/mechanistic*, not
  proven — he'll know it's thin.
- **Sleep extension + banking + tactical naps (`01`).** Bank before travel/appearances; 20–25 min nap
  in the 1–3 PM window (not 90 min — sleep inertia) as the hedge for late streaming/content nights.
- **Teach the physiological sigh from lived experience (`09`).** Double-inhale + long exhale for a fast
  between-pitch reset; ~6 breaths/min (4 s in / 6 s out) for pre-outing down-regulation. Near-zero
  cost, non-woo, ideal Mayday content.

---

# LATER (6+ months) — deepen the moat, defer the vanity spend

## Triton

- **Novel analytics features on the existing spine (`01`, `08`, `09`):**
  - **Command/decision decay model** — test whether late-outing / late-season `pitcher_season_command`
    and chase-decision quality decay in patterns consistent with cumulative cognitive load. Frame mental
    fatigue as a *command-and-decision* risk (not "kills velo" — the meta-analytic effect is ~dz −0.08
    after bias correction, and strength/anaerobic tasks are unaffected).
  - **Chronotype-adjusted day/night split** — layer rMEQ onto player profiles; an evening-type reliever
    is a different asset in a 1 PM getaway (.252) than at 8 PM (.306) — an edge the raw split misses.
  - **Travel/jet-lag context feature** — replicate the PNAS methodology (miles/zones since last home
    game, eastward-is-worse) as a covariate on game logs; a genuinely novel park/context input on the
    7.4M-pitch DB.
- **Full readiness triangulation engine (`04`, `08`).** Combine sRPE + CMJ + arm-freshness + velo/slot
  drift + HRV/sleep trend into a concordance flag: act only when 3 of 4 agree; a lone red is a "watch,"
  not a shutdown. Store raw daily loads so any ACWR-style widget is *derived* (swap in EWMA or
  week-over-week % without re-instrumenting) and framed as a **ramp guardrail (0.8–1.3 band), not an
  injury oracle** (ACWR is a statistical artefact as a predictor).

## Neptune

- **Add cold second, cheaply (`03`, `10`).** Inflatable + chiller **$1,600–2,700** — real cold, real
  temp control, low capital. Gate it in the programming layer: contraindicate CWI within ~4–6 h of any
  acquisition-block throwing/lifting; green-light the night before a showcase or in-season
  back-to-backs. **Defer the $10–30k+ turnkey/spa build** until athlete volume and phase-logic both
  exist — the plunge is an Instagram amenity, the phase-aware prescription is the product.
- **Normatec** — $900–1,500, recovery-lounge amenity (any-phase safe, doesn't blunt adaptation). Sell
  as compliance/experience and a "we invest in your body" signal, **not** a dashboard metric (no
  defensible readiness signal).
- **PULSE elbow-torque workload** — ~$200–320/unit — for higher-value arms only; counts *every* throw
  as torque units, closing the pitch-count gap. Store the per-throw workload number in a
  `compete_pitches`-adjacent table. Optional, not core.
- **Phase 3 monitoring + mental-skills curriculum (`08`, `09`).** Add HRV trend once the core spine is
  compliant; roll out a 7–12 week MAC-style acceptance/mindfulness program for anxiety-prone HS/college
  arms (promise attentional control + anxiety reduction + flow, not "large performance gains" — CIs are
  wide). Proven market (Tread's Mental Skills 101).
- **Deliberately skip / rent (`10`):** **PEMF** (spend last or never — priced on belief, function
  effects inconclusive); **Game Ready** (rehab/post-op, prescription-gated — referral/rental via a
  partner PT clinic, not a $3,500 idle asset); **cryo chamber** and most compression claims beyond
  comfort (placebo bucket). **Red-light panels** are a defensible Phase-2 amenity *only* with dose
  discipline logged (wavelength 660–950 nm, irradiance, time-on-tissue) — promising, not proven.

## Trevor

- **Facility-design inputs where he has skin in the game (`01`, `03`):** if Neptune ever adds a nap/rest
  space, spec circadian/dimmable lighting, blackout capability, 60–68°F set point; genuinely well-lit
  training bays (or outdoor throwing) double as a bright-light circadian intervention. The sauna is the
  thermal asset to build first.
- **Long-horizon personal arm-health posture (`07`, `06`, `02`).** North star across all ages and for
  himself: *never throw high-intent on a fatigued, unrecovered arm* — that's where the ASMI ~36×
  multiplier lives and the one recovery lever with real injury-prevention evidence. Conservative Day-2
  discipline, grip/ROM gates, BFR through detraining windows, arm-first supplement stack — all secondary
  to load management.

---

## Neptune recovery-room buy order (one-glance, evidence-and-dollar ranked, from `10`)

| # | Item | Cost | Why / phase rule | Docs |
|---|------|------|------------------|------|
| 1 | Sleep + nutrition + hydration + mobility **systems** | ~$0 capital | Biggest readiness lever; track in the athlete dashboard first | `01` `02` `03` `07` |
| 2 | **Marc Pro** ×1–3 | $699 (Plus $1,399) | Default post-throw active recovery, replaces ice; scales | `03` `10` |
| 3 | Massage guns ×several + mobility kit | $1,000–2,000 | Daily warm-up/ROM/soreness; keep off arm pre-max-throw | `03` `05` `10` |
| 4 | Grip dynamometer + goniometer | $40–150 | Cheapest high-signal arm-fatigue check | `07` `08` |
| 5 | **SmartCuffs 4.0** clinical set + Owens cert | ~$1,699 + cert | Measured %LOP BFR, 8-cuff throughput, FDA-listed | `06` |
| 6 | **Force plates** (Hawkin / VALD) | mid–high 4–5 figures | Best CNS-fatigue proxy + velo KPI; Phase-2 spine | `08` |
| 7 | ArmCare-class strength sensor | few hundred $/unit | Arm freshness (trust strength, discount ROM) | `05` `07` `08` |
| 8 | **Sauna** (infrared first) | $3–10k | Buy heat before cold; adds adaptation + heat-acclim | `03` `10` |
| 9 | Normatec | $900–1,500 | Any-phase lounge amenity; comfort not performance | `10` |
| 10 | Inflatable + chiller cold plunge | $1,600–2,700 | Add cold cheaply; gate to in-season/pre-comp only | `03` `10` |
| — | PULSE (higher-value arms) | $200–320/unit | Counts every throw; optional | `07` `08` |
| — | Game Ready | rental only | Post-op/rehab; refer, don't own | `10` |
| — | PEMF / cryo chamber | skip | Priced on belief; function effects inconclusive | `10` |

A genuine budget squeeze delivers excellent recovery with **items #1–#4 (~$2–5k total)** and
out-performs a competitor who blew $40k on a hero plunge. Every purchase above #4 should be weighed
against putting the same dollars into assessment tech — that's the moat.

## The one-object north star: the per-athlete readiness tile

Everything above collapses into a single Triton/Compete object per athlete per day, each input carrying
its evidence grade and read as a personal rolling baseline, not a cross-athlete or vendor number:

`grip_pct_baseline` · `ir_rom_deficit_deg` · `fatigue_score` · `recovery_score` · `freshness_pct` ·
`cmj_delta` · `srpe` / derived acute:chronic (ramp guardrail) · `velo_slot_drift` ·
`hrv_7d_mean` + `cv` · `tst_debt` · `restq_trend` → **readiness_flag (red/yellow/green)** mapped to a
training *flavor* (Download / Deload / Reload / Overload), auto-escalating only on multi-signal
concordance or an illness pattern. That sustained, individualized, honestly-graded readout — not the
sensors — is what a former-MLB-pitcher-led development lab sells and a commodity cage barn will never
maintain.
