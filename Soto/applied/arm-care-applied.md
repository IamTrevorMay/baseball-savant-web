---
title: Arm Care & Injury Prevention — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - arm-care
  - injury-prevention
  - workload-monitoring
  - assessment-battery
  - ucl
  - shoulder
  - return-to-throwing
  - triton-platform
  - neptune-performance
last_updated: 2026-07-19
---

# Arm Care & Injury Prevention — Applied Playbook

> Translates the 10-doc `arm-care/` research corpus into a sequenced build/buy/train plan for the
> three things Soto serves: **Triton** (the analytics platform), **Neptune** (the development lab in
> buildout), and **Trevor** (post-TJ, staying-sharp/demo/coaching). Sequenced **Now / Next / Later**.
> Every recommendation cites the domain doc(s) it draws from by filename and carries a
> cost/effect/time estimate where one exists.

## TL;DR

- **The evidence hierarchy is settled and it is boring: (1) fatigue-aware shutdown + annual rest
  windows — the largest effect sizes in the entire corpus (fatigue OR ~7.5–36×; >100 IP/yr 3.5×),
  nearly free; (2) close the hidden-workload gap — pitch counts miss 42%+ of throws, structurally
  unfixable by a scorekeeper but easy for a facility; (3) intensity/velocity governance — the real
  modern driver; (4) ACWR/torque dashboards — communication and ramp-discipline, NOT injury
  prediction.** Sell the first three as the product, use the fourth as the labeled visualization
  layer (`03`, `09`, `10`).
- **The highest-ROI Neptune purchase is a throw-log + a $320 readiness kit, not a gadget.** The
  single best-supported intervention in all of arm care is a warm-up-integrated mobility+cuff routine
  (Sakata RCT: **-48.5% injury and +velo**) — a *prescribed, tracked* routine with adherence
  monitoring, not the bands themselves (`04`). Then ArmCare dynamometer (~$250 + ~$120/yr), a $40 hand
  grip dynamometer, a $30 inclinometer. PULSE ($250 + $250/yr each) is a *select-cohort* buy, not
  roster-wide (`10`).
- **Triton's arm-care surfaces need zero new hardware and ride the existing `compete_pitches` +
  Stuff+/command/deception stack.** Ship first: a **total-throwing-load ledger** (throws × RPE, not
  game pitches), a **labeled ACWR ramp-rate panel** (acute + chronic shown *separately*), a
  **velocity-intensity ratio** (in-season velo ÷ athlete's own max), and a **risk-adjacent-performance
  flag** on the injured-cohort signature (high velo, high command, low FB%) (`01`, `03`, `08`).
- **Stuff+ is a RISK score, not a safety score — never let it render without its load cost.** Velocity
  is the dominant torque driver and the injured MLB cohort had *superior* command and *more* breaking
  balls. Pair every Stuff+/"add spin/add cut" recommendation with a plain-language risk annotation
  (`01`, `08`).
- **Screen to detect within-athlete *change*, not to predict injury or hit population norms.** At
  amateur levels ROM screening is near-null; the defensible outputs are ER-gain / shoulder-flexion /
  TRM-deficit (pro-relevant), ER:IR ratio + side-delta, and fresh-vs-fatigued strength retention.
  Grade honestly and grey out sub-MDC noise (`02`, `05`, `10`).
- **Return-to-throwing is the highest-liability, highest-value service and the one where Trevor's
  lived arc is the marketing.** Build the Reinold-2024 workload-based ITP structure, a `compete_workload`
  ACWR engine, PT+surgeon clearance gates, and a monthly surgeon-facing summary. Capture surgery
  *type/date/surgeon/protocol* — repair, reconstruction, and hybrid are three different timelines
  (`06`, `07`).
- **For Trevor:** one real high-intent day/week (pulldowns/plyo velo), weekly ArmCare ER:IR check
  (keep ≥1.0 — Byram's finding is literally his injury mode), grip delta on heavy days, TROM symmetry
  as north-star ROM, active recovery (ice is debunked), ramp-rate cap + hard off-throwing shutdown.
  The whole PULSE/ACWR apparatus is overkill for demo work (`02`, `04`, `06`, `10`).

---

## The constructs worth building around (and the folklore to drop)

Ranked by evidence strength × actionability × how cheaply Neptune/Triton can measure them:

1. **Fatigue state + cumulative volume.** The dominant modifiable levers by an order of magnitude —
   pitching-while-fatigued OR ~7.5–36×, >100 IP/yr 3.5×, >8 months/yr 5×. Everything else is a
   rounding error next to these (`03`, `08`, `09`).
2. **Total throwing load (not game pitches).** 42%+ of throws (bullpen, warm-up, catch, long toss,
   plyo) go uncounted; catch-and-pitch double duty is the youth blind spot (2.9× risk). A facility can
   observe what a scorekeeper structurally cannot (`03`, `09`).
3. **ER:IR strength ratio + side-to-side ER delta.** The most actionable, best-validated *modifiable*
   screen — directly trainable, HHD-reliable (ICC 0.84–0.91), and Byram's prospective preseason-ER
   finding is one of the few real injury-prediction signals in the corpus (`02`, `05`, `10`).
4. **ER insufficiency / total-rotation deficit (>5°).** The stronger passive-ROM red flags in pros
   (2.2–2.6× risk) — not GIRD. Store *side-to-side deltas*, not raw degrees (`02`, `05`).
5. **Within-athlete velocity-intensity ratio.** In-season velo ÷ athlete's own max/preseason;
   sustained ~1.0 = sustained max-effort exposure. Within-pitcher, velo tracks torque near-perfectly
   (R²=0.957); between-pitchers it's noise (R²=0.076) (`03`, `08`).
6. **ACWR as a labeled ramp-rate governor.** Debunked as an injury predictor (retraction-tier
   statistical flaws); useful as a "are we ramping too fast?" speedometer. Show acute + chronic
   separately; never a red/green injury gauge (`03`, `06`, `10`).
7. **Distance ≈ torque.** Throwing distance tracks elbow varus torque better than radar velocity;
   ~120 ft flat-ground ≈ mound torque. Distance-tagged catch play is the cheapest high-signal load
   input (`06`).
8. **Fresh-vs-fatigued strength retention (>90%) + grip delta (~12% drop = flag).** The in-session
   readiness readout pitch counts can't give; grip fatigue leads velocity fatigue (`05`, `10`).

Explicitly **de-prioritized** (folklore that underperforms or misleads as a target): **GIRD as a
standalone binary flag** (weak/null, worse in youth, sometimes protective); **scapular-dyskinesis as a
lone diagnosis** (RR 1.07, ns); **grip strength as an injury/TJ predictor** (debunked — it's a
mechanics/readiness input); **the curveball panic** (lower torque than the fastball); **spin rate as an
independent injury cause** (not associated in the case-control data); **"forearm curls save your UCL"**
(real mechanism, unproven transfer); **ice-and-rest** (RICE retracted by its own author); **any
absolute IMU torque number** (~39% low vs lab); and **stretching-only prevention programs** (inferior
to strengthening in the one head-to-head RCT) (`02`, `04`, `05`, `08`, `09`, `10`).

---

## NOW (0–3 months) — ship what needs no new hardware

### Triton

- **Total-throwing-load ledger on the `compete_pitches` spine.** A session throw-log: buckets
  (catch / long-toss / plyo / bullpen / live) × rough count × **RPE 1–10 intensity**, summed to a
  daily *total throwing load* with rolling 7-/28-day views. This closes the 42%-hidden-workload gap
  that TrackMan (mound-only) and pitch counts structurally cannot. Display acute and chronic
  **separately** plus a labeled "ramp rate" — **never a red/green injury score**. *Effort: low-med*
  (one child table + SQL rollups + one tile). Log queries to `docs/Queries.md`. Source: `03`, `09`, `10`.
- **Labeled ACWR ramp-rate panel.** 7-day ÷ 28-day throwing load, 0.7–1.3 band shaded, explicitly
  captioned **"ramp-rate guide, not injury risk."** Use the PULSE window convention (9-day acute /
  28-day chronic) if/when torque data exists; use RPE-weighted throw load otherwise. Apply a convex
  weighting (PULSE's `^1.3` exponent pattern) so a full-effort day counts more than a touch-and-feel
  day — a poor-man's workload unit. *Effort: low.* Source: `03`, `06`, `10`.
- **Velocity-intensity ratio from `compete_pitches`.** In-season avg velo ÷ that athlete's
  established max/preseason; flag sustained ratios near 1.0 as sustained max-effort exposure.
  Normalize per athlete (z-score within pitcher) exactly as Stuff+ standardizes per pitch_name/
  game_year — cross-athlete velo-as-load is biomechanically naive. *Effort: low.* Source: `03`, `08`, `10`.
- **Reframe Stuff+ as a risk-adjacent score in the UI.** Stuff+ already weights velocity heaviest —
  the same variable that drives valgus torque — so it is, if anything, a *risk* score. Never let a
  Stuff+ gain or an "add spin / add cut" recommendation render without a paired plain-language risk
  note (grip-pressure spin strains the flexor-pronator mass; +100 rpm 4-seam ≈ +20% UCLR odds; +1"
  cutter arm-side ≈ +36%; +1 mph sinker ≈ +30%). *Effort: low* (annotation layer, no model change).
  Source: `01`, `08`.
- **Risk-adjacent-performance cohort flag.** Surface pitchers whose Stuff+ / Location+ / velocity /
  pitch-mix profile matches the injured-cohort signature (high velo, superior command, *low* fastball
  usage — the counterintuitive 2025 case-control result). **Frame as cohort monitoring, never
  individual prediction** — base rates are too low and R² too weak for confident forecasts. A
  differentiated, defensible Triton view. *Effort: med.* Source: `01`.

### Neptune

- **Ship the prescribed, tracked warm-up routine as the product spine — this is the #1 evidence-graded
  intervention, not a gadget.** The Sakata block (5 stretches + 2 dynamic-mobility + 2 balance drills,
  done as warm-up) cut youth throwing injury **48.5%** *and* increased ball speed in a block-randomized
  RCT. The variable the RCTs say predicts the outcome is **adherence** — so build the compliance-
  tracking layer (who did the routine, how often) into the Compete/Triton record. Sell the *system and
  the tracking*, not the bands. *Cost: ~$0 incremental.* Source: `04`.
- **Buy J-Bands at scale, standardize a dose, log completion.** Brand is noise; dose is signal (the
  Crossover-vs-Jaeger head-to-head found both work, duration drives it). J-Bands ~$12–25 for
  cost/portability; a Crossover-style dual-anchor station is ergonomically nicer for group cuff days.
  *Cost: ~$15–25/athlete + one ~$200 facility station.* Source: `04`.
- **Readiness kit — ~$320 up front, ~$120/yr, serves the whole roster:**
  - **ArmCare dynamometer ~$250 + app ~$10/mo.** Weekly ER/IR strength, ER:IR ratio, side-delta,
    ArmScore, fresh-vs-fatigued retention. Strength validity is good (r=0.72–0.81, ICC 0.72–0.79);
    **ignore its ROM numbers** (r=0.23–0.47). ~5 min/athlete. The Byram ER:IR ≥1.0 target and preseason-
    ER-weakness→surgery finding are the citable rules to encode. Source: `02`, `05`, `10`.
  - **Hand grip dynamometer ~$40.** Pre/post-session grip delta as a fatigue gate — a ~12% drop is a
    documented flag; grip fatigue *leads* velocity fatigue. Source: `05`, `10`.
  - **Digital inclinometer/goniometer ~$30.** Trained-assessor ROM: passive IR/ER at 90° abduction
    (scapula stabilized) both sides → derive **ER gain, GIRD, TRM-deficit**. Store *side-to-side
    deltas*. Flag TRM deficit >5° AND GIRD >18° (not GIRD alone). Source: `02`, `05`.
- **Encode Pitch Smart as hard constraints for every U19 athlete.** Age → daily max (50 at 7–8 up to
  105 at 17–18), count → rest ladder, a **months-per-year throwing tracker with a hard 2–3 month annual
  shutdown**, and a **catcher/two-way "roles" field** with a combined weekly throw budget (catch-and-
  pitch = red state, 2.9× risk). This is the compliance *floor*; the differentiated product is the
  layer above it. The SP/RP games×pitch logic already in Triton is a natural home for the youth
  compliance engine. Source: `03`, `09`.
- **Intake battery v1 (near-zero tech, honest framing):** ER/IR + horizontal-adduction ROM per side
  (inclinometer) → ER-gain/GIRD/TRM-deficit; ER:IR dynamometry + side-delta; supine shoulder flexion
  (a real pro-level predictor, under-screened); hip IR/ER at 90° flexion per leg (the better amateur-
  relevant ROM signal); grip (tiered as **readiness/mechanics context, NOT injury prediction**); a
  categorical scapular screen (fused into a composite, never a lone red flag). **Auto-insert the
  pro-vs-amateur evidence caveat by athlete level**; frame the whole battery as *baseline capture +
  programming input + fatigue-trend infrastructure*, explicitly not an injury oracle. Source: `02`, `05`.
- **Prevention block (2–3×/week), EMG-validated, high-intensity/low-volume:** push-up-plus (serratus
  90–104% MVC), prone/standing ER + horizontal abduction (posterior cuff/lower trap), 90/90 IR
  (subscapularis — don't neglect the front), full-can scaption; ~2–3×8–12, quality over volume
  (Driveline's explicit shift). Mobility (modified sleeper OR cross-body, 3×30s) **only when true
  capsule tightness is present** — never stretch bony retroversion. **Strength beats stretch** (RCT:
  9.8% vs 22.6% injury). Source: `02`, `04`.

### Trevor

- **One real high-intent day/week (pulldowns/plyo velo) + catch + active recovery.** Enough to stay
  sharp for demos/content without accumulating comeback-level volume; pulldown arm stress ≈ high-
  intent mound, so treat it as the velocity day, not filler. Source: `06`.
- **Weekly ArmCare ER:IR check — keep ≥1.0, flag if ER strength drifts down.** Byram's finding is
  literally your injury mode; a falling ER:IR is a real deload trigger. Add a grip delta on heavier
  throwing days. Source: `02`, `05`, `10`.
- **Lead your own arm care with posterior-cuff ER + subscapularis + flexor-pronator/grip work.** Treat
  any IR loss as retroversion-until-proven-capsular; keep TROM symmetry (<5°) as the north-star ROM
  metric. Active recovery only — **ice-and-rest is debunked** (Mirkin retracted RICE). Source: `02`, `04`.
- **Ramp-rate cap + hard off-throwing shutdown; skip the PULSE apparatus.** For a former-TJ arm in
  demo mode, the ramp-rate discipline and annual rest window are the relevant rules, not any
  competitive-innings target. Source: `04`, `06`, `10`.

---

## NEXT (3–9 months) — the workload spine, RTT product, and select-cohort torque

### Triton

- **`compete_workload` schema, sibling to `compete_pitches`.** Per-throw torque (from PULSE, stored as
  a **within-athlete relative index, never absolute N·m**), daily/acute/chronic load, ACWR — so a
  rehab or velo-building athlete's dashboard mirrors the published Reinold-2024 program. Land three
  streams keyed to one Neptune `athlete_id`: throwing load (PULSE) + capacity/readiness (ArmCare) +
  pitch characteristics (TrackMan), rendered on **one "Arm Health" timeline**. No off-the-shelf app
  does this triangulation — it *is* the development-lab product. Update `docs/VARIABLES.md` same commit
  for any new metric/param. Source: `06`, `07`, `10`.
- **Post-TJ tracker tile.** Plot a returning pitcher's **Stuff+ vs Cmd+** trajectory against the known
  return signature: **Stuff+/velo/spin recover immediately, Cmd+ and run-value stay depressed through
  year 1, normalize by ~24 months.** Flag when command recovery stalls past the ~24-month norm. Triton
  is uniquely positioned to ship exactly the "advanced metrics for RTP" thesis Rondon argued for.
  Capture surgery **type/date/surgeon/protocol** as first-class fields — a repair athlete at month 7
  and a reconstruction athlete at month 7 are in different phases; never collapse them into one "TJ
  date." *Effort: med.* Source: `07`.
- **Arm-readiness card per athlete.** ER:IR ratio + ArmScore trend (ArmCare), grip delta vs baseline,
  ROM total-arc from a *trained assessor* (not the app), velo/strike% from TrackMan as *confirmatory*
  red flags (mechanics degrade before velo does). Green/amber/red gate on high-intent days **when load
  AND readiness agree** — the whole value over a pitch counter is catching the athlete who's "on
  schedule" per ACWR but under-recovered per strength. **Encode each measure's MDC and grey out
  sub-MDC "changes"** (same rigor as not over-reading a 1-unit Stuff+ wobble). *Effort: med.*
  Source: `05`, `10`.
- **`assessment_norms` reference table** — metric × level × percentile, the arm-care analog of
  `league_averages`, populated via a `refresh`-style routine. **Benchmark pitchers to level**
  (position players run 14–20% stronger; Latin-American pitchers ~12–17% stronger than N. American) —
  cross-population cutoffs travel poorly, so lead with within-athlete trend. *Effort: med.* Source: `02`, `05`.

### Neptune

- **Buy PULSE for the select cohort only — ~$250 sensor + ~$250/yr each; ~$1,500 up front + ~$1,500/yr
  for a 6-arm group.** Assign to velo-gainers, return-to-throw rehabbers, and developmental starters
  where per-throw torque trending justifies the wear burden. It's overkill and unenforceable roster-
  wide (missing sessions corrupts the chronic denominator). Present output **indexed to the athlete's
  own baseline** ("today = 108% of trailing-30-day median"), never a raw N·m gauge — the sensor tracks
  *change* faithfully (ICC 0.99 in-lab) but reads ~39% low in the field. Source: `03`, `07`, `10`.
- **Return-to-throwing product — the highest-liability, highest-value service line.** Implement the
  **Reinold-2024 workload-based ITP** as data in Compete: Steps with fixed counts/distances (no
  ranges), RPG-graded mound work (fastballs 50→75→90→100%, change-ups then breaking balls staged),
  scheduled deloads (~wk 7/14/22/29), flat-ground-graduation-before-mound, and a **family of duration
  variants** (6-wk / 12-wk / 5-mo / 7-mo) chosen by injury. Non-negotiables: **written objective
  Step-advance criteria** (no next-day pain/swelling, clean mechanics, readiness ≥4/5), **dual PT +
  surgeon clearance gates with timestamps**, an **ACWR monitor kept 0.7–1.3 (~91% of program)**, and
  **Pitch Smart caps auto-enforced for minors**. Weighted balls carry an explicit risk flag and are
  gated behind a rebuilt-base checkpoint — never the default on-ramp tool. Source: `06`, `07`.
- **Monthly surgeon-facing summary (auto-generated PDF).** Report **ACWR, torque load, limb-symmetry
  indices, ER/IR at 0° AND 90° (the 90° deficit is where it hides), and KJOC** in the surgeon's
  language. This turns Neptune into a trusted extension of the medical team rather than a liability the
  surgeon warns the athlete against — and it's a *product/template*, not headcount. Get the scope-of-
  practice/corporate structure right early (referral vs embedded vs on-staff clinician). Source: `07`.
- **Intent-tiered weekly template with hard/easy separation.** Label each day's intent target;
  most days 80–90%, **1–2 true 100% days** (pulldowns/plyo velo), **1–2 recovery days at 60–70% with
  visibly slower arm speed.** "Take it easy" is *not* load management — a 25% perceived-effort drop
  sheds only ~7% torque; count throws and distances. Triton flags violations (two ≥90% days back-to-
  back, or a "recovery" day logged at high intent). Source: `04`, `06`.
- **Distance-logged catch-play template (warm-up → build → compress-on-a-line ≤120 ft).** Bias
  developing/youth arms toward capped on-line long toss (≤120–150 ft); reserve max-distance arc (the
  "least efficient throw," +10% torque, no velo gain) for mature, well-conditioned arms only, and log
  distance so the torque cost is visible. "How to play catch like a pro" doubles as premium Mayday
  content and the entry point to the distance→torque dataset. Source: `06`.
- **Offseason ramp as a personalized calendar product.** Intake → assign start date + mound-ready
  target → generate the phased plan (off-ramp → shutdown → active rest → build → pulldown/bullpen
  integration) in Compete → monitor ACWR weekly. Schedule **backward from mound-ready**, ~1 build-up
  day per day off, cap ramp rate. This directly attacks the MLB-flagged **spring-training injury
  spike** (offseason load front-loaded where nobody counts it). A sellable athlete-facing artifact.
  Source: `03`, `06`.

### Trevor

- **Personalized off-season calendar with the ramp-rate cap and the enforced shutdown** — the same
  return-to-throwing logic he rebuilt through post-2017, now with healthy starting tissue. Source: `06`.
- **Weighted-ball / high-intent velo is the highest-risk activity — most on-ramp discipline, screened
  only.** Reinold's 24% injury rate for ~2 mph is what "borrowing" velocity looks like; a rising
  shoulder-ER gap is a stop signal. Source: `04`, `08`.
- **His arc IS the content.** Velocity intact / effectiveness lagging into year 2 is the textbook TJ
  return pattern — an authentic Mayday narrative for the "velo is fine, *unmonitored* velo is the
  problem" message Neptune leads with. Source: `07`, `08`, `09`.

---

## LATER (9+ months) — youth arm-health score, fidelity upsell, research edge

### Triton

- **Youth arm-health score** blending, weighted by the corpus effect sizes (**fatigue and cumulative
  volume heaviest**): chronic load, acute:chronic spike, fatigue-state flags, velocity-relative-to-age,
  and role/catcher exposure. No consumer pitch-count app models catcher load or the hidden 42% — a
  genuinely novel facility product, not a rebadged counter. *Effort: med-high.* Source: `03`, `09`.
- **"Risk-adjusted stuff" view.** Surface when a pitch's shape gains map onto known UCLR-associated
  features (grip-pressure spin, cutter arm-side movement, sinker velo) so an "add spin" recommendation
  driven by grip pressure isn't presented identically to one driven by better extension/sequencing.
  Aligns the platform's stuff-optimization incentives with the facility's arm-care mission — a novel,
  defensible metric. Source: `08`, `01`.
- **Internal TJ-prevalence panel.** Reconstruct a Roegele-style prevalence series *internally* by
  joining pitcher IL/status to roster/season tables, then correlate against Triton's own Stuff+/velocity
  distributions per season ("TJ prevalence vs. staff Stuff+"). A differentiated dashboard view. *Effort:
  med.* Source: `01`.
- **Per-athlete cuff-reserve + load-per-pitch-type surfaces.** If Neptune adds intake cuff ultrasound
  (~0.96 sens / 0.93 spec), store a "posterior-cuff reserve" delta (throwing vs non-throwing
  infraspinatus) and pair with in-outing velo/spin decay from TrackMan — the field proxy for the cuff
  fatigue that drives impingement/peel-back. A parent-facing "load per pitch type" view reframes the
  curveball myth with the fastball-is-highest-torque data. Source: `02`, `09`.

### Neptune

- **Youth program tiering by role and maturity, priced honestly.** A "Foundations" tier (movement
  quality, the Sakata warm-up, arm care, multi-sport encouragement — priced as skill development, NOT
  velo) and a "Development" tier (full assessment → individualized velo + strength). **Weighted balls
  are post-maturity, high-supervision, instrumented-only.** Position Neptune as the counter-narrative
  to showcase max-effort culture: *durable* velocity from assessment + monitored ramp, not one-day
  radar peaks. Source: `04`, `08`, `09`.
- **Optional cuff ultrasound + occasional lab days.** An intake ultrasound cuff screen for a "posterior-
  cuff reserve" baseline; periodic markerless/3D mocap for the absolute torque/full-kinematics read
  PULSE can't give — quarterly or at intake, not continuous. Reserve for the high-value cohort.
  Source: `02`, `10`.
- **Phase-3/phase-4 rehab bridge as the commercial sweet spot.** The weighted-ball-plyo phase (months
  3–6) and the flat-ground→mound bridge (months 5–9) are *too advanced for general PT, too medical for
  a commodity cage.* Owning that monitored bridge — plyo progressions, high-intent movement under
  controlled load, workload-gated throwing — is the differentiator the medical system hands off and the
  cage can't staff. Source: `07`.

### Service design & pricing (Neptune, applies across horizons)

- **All-in monitoring stack: ~$1,800–2,000 up front + ~$1,600–1,800/yr** for a small facility with a
  6-arm PULSE group (ArmCare $250+$120/yr, grip $40, inclinometer $30, PULSE 6×$250+6×$250/yr, TrackMan
  already owned). **The hardware is cheap; the binding constraint is the daily discipline of testing
  and a clean data pipeline** — exactly the leverage-over-headcount problem the operator prioritizes.
  Source: `10`.
- **The product is the loop, not the report:** assess → prescribe → re-test. Cadence: full battery at
  offseason baseline / pre-spring / mid-season; fast strength+fatigue check weekly and around high-
  intent outings; ROM spot-checks every 3–4 weeks if trending. Price the recurring loop (a coaching
  commitment), not the one-time capture — it's what commands the 3–10× premium and what the revision-TJ
  cliff (only ~42% return to 10+ MLB games) makes economically obvious. Source: `05`, `07`, `10`.
- **Parent/coach communication script as onboarding + Mayday content.** Reframe the metric to
  **throws, not pitches**; normalize pain reporting (kill the taboo — 46% of "healthy" kids were pushed
  through pain); **lock the 2–4 month annual shutdown before the schedule fills**; contextualize
  velocity (>85 mph ≈ 2.6× youth risk); debunk the curveball distraction so worry-budget goes to
  volume/fatigue. Every message: *the boring stuff (volume, rest, fatigue) protects arms; the scary
  stuff (curveballs) mostly doesn't; and we measure it so you don't have to guess.* Source: `09`.

### Trevor

- **Be the messenger for "risk-managed, never safe."** The evidence-graded, probabilistic parent
  script ("we can't promise no injury; we can promise we'll see the warning signs before they become
  surgery") is a trust signal, not a liability — especially from a pro who threw hard, had TJ, and came
  back. Source: `08`, `09`.

---

## Cross-cutting build discipline (non-negotiables)

- **Sell monitoring and load management, never a false "injury-proof" promise.** Base rates are too
  low and the velocity R² too weak to predict an individual TJ usefully; cohort-level flags and load
  governance are the defensible middle ground. Grade every claim proven / promising / plausible /
  debunked — that honesty is the differentiator with a data-literate founder and skeptical parents.
  Source: `01`, `05`, `08`.
- **Everything is a within-athlete comparison.** IMU stress, workload, strength, grip, velo-intensity —
  standardize per athlete (z-score within pitcher, the Stuff+ pattern). **Cross-athlete leaderboards on
  any of these are biomechanically wrong**, at best motivational theater. Source: `08`, `10`.
- **Stuff+ is a risk score. Never render a stuff/spin/velo gain without its load cost.** The platform
  is functionally a stuff-optimization engine; align its incentives with the arm-care mission. Source:
  `01`, `08`.
- **ACWR is a labeled ramp-rate governor, not an oracle; show acute + chronic separately** so the
  denominator is never hidden. Gate high-intent days on load AND readiness agreeing. Source: `03`, `10`.
- **Two data namespaces, provenance-tagged:** external load (throw log, PULSE) vs internal readiness
  (ArmCare strength, grip, ROM). Carry a `capture_system`/source column. Trust ArmCare *strength*,
  distrust its *ROM*; use a trained assessor + inclinometer for ROM/GIRD. Grey out sub-MDC changes.
  Source: `05`, `10`.
- **Capture surgery type/date/surgeon/protocol — repair ≠ reconstruction ≠ hybrid.** Three injuries,
  three timelines; the facility owns coordination and the monitored bridge, never medical clearance.
  Source: `07`.
- **Platform hygiene:** log ad-hoc queries to `docs/Queries.md`; update `docs/VARIABLES.md` in the same
  commit as any new metric/param; mutations via `run_mutation` (`run_query` is SELECT-only); VACUUM
  between large batch updates; never push without approval.
