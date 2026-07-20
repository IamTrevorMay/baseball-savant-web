---
title: Strength & Conditioning / Velocity Development — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - strength-conditioning
  - velocity-development
  - triton-platform
  - neptune-performance
  - assessment-battery
  - force-plates
  - workload-monitoring
  - weighted-balls
  - periodization
last_updated: 2026-07-19
---

# Strength & Conditioning / Velocity Development — Applied Playbook

> Translates the 11-doc `strength-conditioning/` research corpus into a sequenced build/buy/train
> plan for the three things Soto serves: **Triton** (the analytics platform), **Neptune** (the
> development lab in buildout), and **Trevor** (post-TJ, staying-sharp/demo/coaching). Sequenced
> **Now / Next / Later**. Every recommendation cites the domain doc(s) it draws from by number
> (`01`–`11`) and carries a cost/effect/time estimate where one exists. Companion to
> `biomechanics-applied.md` — where the two overlap (force plates, ACWR, ArmCare, markerless), this
> doc governs the *physical-capacity and throwing-program* layer; that doc governs the *kinematics*
> layer. Build them on one shared schema.

## TL;DR

- **The corpus collapses to one product thesis: sell "mph your arm can survive," not "+X mph."**
  Every velocity lever (weighted balls, pulldowns, max-distance long toss, intent) spends tissue
  tolerance; the differentiator vs a commodity cage is the **assessment → programming → monitoring**
  loop that prices that trade. That loop is a Triton build, not a hardware purchase (`01`, `02`,
  `04`, `09`, `11`).
- **Highest-ROI Triton builds need almost no new hardware — they extend `compete_pitches`:** a
  **pulldown-to-mound velocity gap** metric, a **weighted-ball responder tracker** (pre/post block,
  ~40–50% are non-responders), an **ACWR workload dashboard** counting *all* throws, and a
  **predicted-velo-vs-actual residual** off a force-plate/med-ball regression (Driveline's model:
  R²=0.54, ±2.7 mph). Ship these first (`02`, `04`, `05`, `06`, `10`).
- **Neptune's day-one battery is sub-$1k and evidence-backed:** grip dynamometer (τ≈0.62–0.65 vs
  youth velo — beats height), shoulder IR/ER HHD (the ER-strength deficit is the one ROM signal with
  prospective *surgery*-risk data), ROM screen (total-rotation + flexion loss, not GIRD), radar-gunned
  3 kg rotational med-ball throw (best cheap power proxy, r≈0.6), and a jump mat. Hardware order after
  that: **ArmCare ($199) → Hawkin force plates (~$11k/3yr) → Proteus (~$15k, optional)** (`05`, `06`,
  `09`, `11`).
- **The single defensible arm-care biomarker to operationalize is shoulder ER — both strength (HHD)
  and PROM drift.** Overload weighted balls add ER ROM (+4.3° in the Reinold RCT that also logged 24%
  injuries); ER-strength loss precedes injury *and* velocity loss. A 4-week ER trend with a threshold
  alarm is grounded in real prospective evidence, not bro-science (`02`, `03`, `05`, `07`, `09`).
- **Program logic is settled and codifiable:** underload-biased weighted balls gated behind a 3–5wk
  on-ramp and a skeletal-maturity gate (~15–16+); strength that runs *opposite* the throwing calendar
  (hypertrophy at shutdown → power as intent peaks); sprint-based conditioning (10–60m, never poles);
  and a mobility budget that buys T-spine rotation freely but treats the shoulder as stability-first.
  These become parameterized Neptune templates keyed to Triton's SP/RP classification (`03`, `05`,
  `07`, `08`, `10`).
- **For Trevor:** invert the teenager's hierarchy — power *retention* (CMJ absolute power, med-ball
  velo) and tissue durability over mass/strength accrual. Staple = arc long toss + overload
  recovery/decel plyos + bike cardiac-output (2×/wk, HR 130–150). Ration max-intent (pulldowns,
  light-ball flat-ground) like game bullpens. Wear ArmCare, trend ER strength, keep ACWR 0.7–1.3
  (`03`, `04`, `05`, `06`, `08`, `10`).

---

## The honest velocity-expectation frame (the through-line for everything below)

The whole corpus agrees on a distribution that must anchor all Neptune marketing and all Trevor-facing
copy — because Trevor will discount anything inflated (`01`, `09`, `10`):

- **Weighted-ball / velocity blocks: ~2–3.5 mph mean, huge variance, ~40–50% non-responders** in
  trained arms (Reinold RCT +2.2 mph; Driveline +2.7/+3.3; Marsh *null*, 9 gained / 8 lost) (`01`,
  `02`, `03`).
- **By training age, not calendar age:** untrained teen in the PHV window 4–7 mph/yr; trained
  college/pro arm 1–3 mph from a dedicated block, with a real plateau chance (`01`, `10`).
- **Index to the moving baseline:** MLB four-seam hit 94.7 mph in 2026 (6th straight rise); every
  Neptune benchmark is a level-and-maturity percentile, not a static chart (`01`, `09`).
- **The injury tail is priced in:** 24% injury rate in the Reinold HS cohort; MiLB weighted-ball
  users lost 44.4 vs 23.2 days. Sell the safety telemetry (`02`, `03`, `04`).

The velocity *acquisition* levers, ranked by evidence and by how cheaply Neptune can measure them:
**(1) body/lean mass + absolute lower-body power** (mass r≈0.58 vs velo, the strongest weight-room
correlate), **(2) rotational/trunk power** (med-ball velo r≈0.6–0.85), **(3) carefully dosed intent
throwing** (underload > overload for velo), **(4) mechanical efficiency** (sequencing/extension —
biomech doc's wheelhouse). Long toss and vertical jump *height* are explicitly **not** velocity
levers — long toss is readiness/ROM/testing; jump height barely separates pro levels (`01`, `05`,
`06`).

---

## NOW (0–3 months) — ship what needs no new hardware

### Triton

- **Pulldown-to-mound velocity gap tile.** If Compete ingests both pulldown and mound velos, compute a
  per-athlete `pulldown_mound_gap` (published mean ~5–6 mph; R²-to-mound ≈0.66–0.7) and trend it. A
  *shrinking* gap at constant pulldown velo = velocity actually reaching the mound; a persistently
  *large* gap flags a mechanical/intent leak on the mound side (pair with release-extension/sequencing
  from the biomech spine to localize it). Log both throw types with a `throw_type` tag so the
  relationship is observed per athlete, not assumed. *Effort: low* (SQL agg + one `TileViz.tsx` tile).
  Source: `02`, `04`.
- **Weighted-ball responder tracker.** A pre/post-block delta view on `compete_pitches` (mound velo +
  pulldown velo, TrackMan-verified) that classifies each athlete **responder / non-responder** per
  block — because ~40–50% won't gain in any given block and reporting a population "+X mph" claim is
  dishonest. This is a genuine differentiator and the antidote to overselling. *Effort: low-med.*
  Source: `01`, `02`, `03`.
- **ACWR workload dashboard on the `compete_pitches` spine.** Daily throw load → 7–9-day acute vs
  28-day chronic rolling sums → ACWR with a **0.7–1.3 green band** and a >1.3 amber flag. Count *all*
  throws (warm-up, plyo, long toss, bullpen) — in-game pitches are only ~10–12% of total. Progress
  intensity by **long-toss distance, not radar velo** (Reinold 2024: distance tracks elbow torque).
  Frame ACWR as a de-load-trigger heuristic, not a validated forecast (mathematical-coupling
  critique). Tag every throw with `trajectory` (arc/line) and `intent %` — a 200-ft arc recovery throw
  and a 200-ft compression throw are different stimuli. This is the single highest-value monitoring
  surface and it directly overlaps the biomech-doc ACWR build — **build it once**. *Effort: med.*
  Source: `02`, `04`, `10`.
- **Predicted-velo-vs-actual residual.** Stand up a Neptune-owned regression (same Z-score
  architecture as Stuff+) predicting fastball velo from body mass + absolute CMJ/SJ peak power + med-
  ball throw velo (Driveline's force-plate model: R²=0.54, MAE ±2.7 mph). The *residual* is the
  product: >3 mph **under** prediction = skill/mechanics problem; >3 mph **over** = physical-capacity
  ceiling to raise. Ship as a stub now (med-ball velo + mass only), enrich when force plates land.
  Update `docs/VARIABLES.md` same commit; log queries to `docs/Queries.md`. *Effort: med.* Source:
  `05`, `06`.

### Neptune

- **Stand up the assessment → programming → monitoring loop as the product from day one**, Compete/
  Triton as the persistence layer, **6-week re-test cadence** (Driveline standard — long enough for
  adaptation, short enough to steer, doesn't eat the training economy). A report nobody trains off is
  the commodity-cage trap; the premium is in laps 2 and 3. Source: `09`, `05`.
- **Intake battery v1 — sub-$1k hardware, launch-ready:**
  - **Grip dynamometer (Jamar-class, ~$30–200)** — strongest field predictor of youth velo (τ≈0.62–
    0.65, ahead of height/weight); +1 kg ≈ +0.3 mph exit velo in hitters; doubles as a systemic-
    fatigue monitor. 3 trials/hand, elbow-at-90° seated. Source: `09`, `05`.
  - **Shoulder IR/ER handheld dynamometer (~$200–400 Lafayette/microFET)** — compute ER:IR ratio and
    N/kg; **flag preseason ER-strength drops** (the pre-season-ER-loss → injury + velo-loss signal is
    directly actionable). Source: `05`, `09`.
  - **ROM screen (goniometer/inclinometer, one fixed examiner)** — shoulder IR/ER/**total rotation**
    + flexion, hip IR/ER (bilateral, flag L/R >5–8°), ankle DF (knee-to-wall, pass/fail), T-spine
    rotation (quadruped lumbar-locked, 50° threshold). **Alarm on total-rotation loss >5° and flexion
    loss ≥5° — NOT GIRD in isolation** (GIRD ≥20° was *not* a prospective predictor). Never program ER
    stretching off an "ER deficit" alone. Auto-compute `lsi_pct`, flag <90%. Source: `07`, `09`, `05`.
  - **Radar-gunned 3 kg rotational med-ball throw ($150 Pocket Radar)** — best cheap power proxy
    (r≈0.6 vs pitch velo, the *only* whole-body test to correlate with bat + batted-ball + pitch velo
    in the DIII study). Standardize weight/stance/measurement rigidly or the norms are useless.
    Mandatory intake metric. Source: `06`.
  - **Jump mat CMJ (jump height)** + mound velo/TrackMan (already in hand). Source: `06`, `09`.
- **Buy ArmCare — $199 + $72/yr.** 5-minute guided rotator-cuff/elbow/grip exam; weekly ER-strength
  trend is the cheapest arm-care telemetry in the building (500+ facilities; Driveline-partnered).
  Highest ROI-per-dollar item in the whole stack. Source: `05`, `09`, `11`.
- **Hard-code the two gates into intake:**
  - **Skeletal-maturity gate for overload/pulldowns (~15–16+, PROM-driven not birthday-driven).**
    Record age, growth history, and bilateral PROM ER/IR. Default for pre-mature athletes = low-intent
    constraint/plyo + command work, **no overload velocity programs** (Reinold's 24% cohort were HS;
    youth elbow torque *rises* with ball weight). This is a safety *and* liability posture. Source:
    `02`, `03`, `10`.
  - **On-ramp gate (3–5 wk) before any max-intent throwing.** Non-negotiable; it's where self-directed
    athletes cut corners and land in the 24%. Source: `02`, `04`, `10`.
- **Bio-band every youth benchmark.** Add `height_seated_cm`, `wingspan_cm`, computed
  `years_from_phv` (Mirwald/Khamis-Roche) to intake; every youth percentile carries a maturity-
  adjusted twin. This is the honest antidote to telling a late bloomer's parents he's "behind."
  Source: `09`.

### Trevor

- **Invert the development hierarchy.** You're past mass/strength accrual — priorities are **power
  retention** (fast concentric work, jumps, med balls at high intent), **tissue durability** (post-TJ
  elbow, cuff/scap micro-dosing), and **joint-friendly selection** (trap bar, landmine, DBs; skip
  2× BW pull chasing and barbell OHP). KPIs are CMJ absolute power (~4,000+ W), ER-strength symmetry,
  and how the arm feels at 85–90% demo intent — not 1RMs. Source: `05`, `06`.
- **Throwing staple = arc long toss + overload recovery/decel plyos.** Reverse throws, rebounder
  force-acceptance catches, sub-max patterning. **Ration the velocity-stress budget** (light ball ×
  max intent × flat-ground holds) hard — treat pulldowns as rare, on-ramped, content-only days, dosed
  like game bullpens. The 2024 MLB report's read for a post-TJ arm: keep max-effort exposure low.
  Source: `03`, `04`.
- **Bike-based cardiac-output block, 2×/wk, HR 130–150, 30–40 min, low impact.** Highest-value,
  lowest-risk conditioning input: builds recovery capacity (aerobic PCr resynthesis), protects HRV,
  zero power interference, zero arm/leg pounding. Never run poles. Source: `08`.
- **Wear ArmCare, trend ER strength weekly, keep personal ACWR 0.7–1.3.** Treat "stress" as a trend
  line, not an absolute. Effort-perception gap means your easy catch play is heavier than it feels —
  measure, don't trust RPE. Source: `04`, `05`, `08`.
- **Measure trail-hip IR + T-spine rotation.** Both are common late-career losses that quietly push
  the arm out front and add elbow stress; both are low-risk "buys." Everything else = stability-first
  given career-accrued laxity + reconstructed elbow. Source: `07`.

---

## NEXT (3–9 months) — the assessment data spine + force-plate tier

### Triton

- **`neptune_assessments` schema, sibling to `compete_pitches`.** One row per (athlete, date, metric,
  side, examiner); reuses the Compete two-table pattern. Store the ROM/HHD/force-plate/anthro layers
  (biomech-doc's `biomech_captures` is the kinematics sibling — same athlete id, shared spine). Carry
  `examiner` and `test_date` on every raw number so retest deltas control for rater. Add a
  **`neptune_metric_meta` table storing `cv_pct`/SEM per metric** so the app computes retest deltas as
  multiples of **minimal detectable change** and colors "real change" vs "within noise" — this single
  feature stops staff over-reading random fluctuation (the #1 dashboard failure mode). Report only
  reliable metrics (IMTP peak force CV 2.4%, CMJ height/power); tier RFD/strategy as "monitored
  internally." Source: `09`, `06`, `05`.
- **`assessment_norms` reference table** — metric × (age-band × maturity × level) × percentile, the
  facility analog of `league_averages`, populated by a `refresh`-style routine. Bootstrap from public
  norms (TopVelocity age charts, Driveline aging curves) until in-house N is deep; percentiles get
  *sharper* as the facility DB grows — "vs 340 pitchers we've tested at your maturity level" is the
  flywheel and the moat no vendor can sell. Source: `09`, `01`.
- **Automated flag engine** (auto-populates the report's priorities block so the founder isn't hand-
  writing every report): ER-surplus <5°, total-rotation loss >5°, flexion loss ≥5°, LSI <90%,
  ER-strength drop vs baseline, force-plate asymmetry >10–15%, ACWR >1.3. Source: `05`, `07`, `09`.
- **Three-tier report view** reusing TruMedia tiles: **parent one-pager** (traffic-light, 2–3 plain-
  language priorities, maturity-adjusted percentile chart, one-sentence plan — the printable/emailable
  PDF that converts trials to memberships), **athlete/coach** (percentiles + raw + force-velocity +
  asymmetry + ROM LSI), **internal** (everything incl. high-CV trend lines + auto-alerts). Never
  promise a velo number from a force number; separate injury-risk language (sober, routed to a
  provider) from performance language (motivational). Source: `09`.
- **Facility Stuff+ off Neptune TrackMan sessions** against Triton's `pitch_baselines` — closes the
  loop from physical profile (upstream) to pitch quality (downstream). Tag device provenance per
  session; never mix Rapsodo and TrackMan movement values in one baseline. Source: `06`, `11`.

### Neptune

- **Buy Hawkin dual force plates — $6,500 hardware + ~$4,500/3yr software (~$11k/3yr owned).** Choose
  Hawkin over VALD: ownership economics (VALD is lease-only, zero salvage, +3%/yr), gold-standard
  validation, and an open API/CSV export for the Compete warehouse. Minimum viable battery: **CMJ
  (readiness + power profiling) + IMTP (strength floor NPF >3000 N / >3× BW + early RFD)** every
  6-week block. **Report absolute peak power (W), not jump height or power-per-kg** — absolute power is
  the level-discriminator and velo correlate (mass is baked in); height/relative power do *not*
  correlate. CMJ eccentric-braking metrics become the daily/weekly fatigue check. Ingest CSV exports
  the same way `compete_pitches` ingests TrackMan. Insist on the reliable-metrics discipline: never
  compare across vendors' plates. Source: `05`, `06`, `09`, `11`.
- **Add VBT (one GymAware/Enode unit, ~$1–2k).** Objective load-velocity zones (Driveline's bands:
  strength-speed 0.75–1.0 m/s, power 0.3–0.6 m/s) + fatigue autoregulation (stop set at 10–20% velo
  loss). The weight-room analog of the TrackMan feedback loop and exactly the numeric athlete-facing
  feedback the Triton stack thrives on. Keep VBT data in the AMS layer, low Triton-ingestion priority.
  Source: `06`, `11`.
- **Buy a cheap AMS for program delivery — TeamBuildr Silver (~$90–140/mo).** Do NOT build workout
  delivery inside Triton (exercise videos, athlete phone app, program builder = a multi-year product
  TeamBuildr sells for ~$1,100/yr). Build only the analytics/warehouse layer. Source: `11`.
- **Parameterize the programming library as templates keyed to role** (Triton's SP/RP classification:
  ≥3 games with 50+ pitches → SP):
  - **Offseason arc** (universal): shutdown → on-ramp (3–5wk) → velocity build (3–6wk) → mound blend
    (1–2wk) → mound development. Back-plan from the required-ready date; **late starters forfeit the
    velocity phase, not readiness.** Capture two intake dates (last competitive pitch, required-ready)
    and auto-generate the phase skeleton. Source: `10`, `02`.
  - **Lifting calendar runs opposite the throwing calendar** (Klein/White Sox ladder): hypertrophy
    60–70% ×8–10 at shutdown → accumulative 80–85% ×6–8 → absolute power 85–90% ×3–5 as intent peaks.
    Heavy lower-body ≥24h before max throwing; heavy upper 48h clear of velo days. Source: `05`, `10`.
  - **In-season maintenance = a real program** (2 lifts/wk, cut volume 30–50%, keep intensity high):
    5-day starter rotation (hardest lower-body lift day-after-start; upper on bullpen day; CNS-light
    touch-up 2-out) and reliever "menu" (pick session by last-48h pitch count — maps cleanly to an app
    decision tree fed by logged counts, a genuine differentiator vs static PDFs). Source: `05`, `10`.
  - **Conditioning templates** (SP-5day / SP-7day / RP-daily): sprint-based (10–60m, 1:6–1:10 rest for
    true speed; tempo 40–60yd @70–80% for recovery), cardiac-output aerobic (bike/sled HR 130–150,
    30–45min) dosed *more* for projected starters (VO2max tracks starter ERA r=−0.68, not relievers).
    **Auto-flag "day-after-outing high-intensity conditioning" as an anti-pattern** (the pole-running
    slot). Add 10yd + 30yd sprint (timing gate) to the battery as a power + conditioning KPI. Source:
    `08`.
- **Weighted-ball / plyo programming defaults, instrumented:** underload-biased for velocity, overload
  for strength/decel/recovery, heavy implements (>16 oz) mature-arm-only. Encode the stress gradient
  physically in the facility (net + TrackMan placement): kneeling/rocker (low) → hybrid flat-ground →
  shuffle pulldowns (high) → mound at intent. Fixed Driveline plyo spine (reverse throws → pivot picks
  → 2 individualized drills → walking windups), drill-to-deficiency mapping as a **lookup table keyed
  on TrackMan/assessment flags** (low extension → roll-ins/rockers; early trunk rotation → janitors).
  Grade drill claims "plausible" honestly. **Re-assess on the mound**, grade on mound deltas (velo,
  movement, extension, release consistency), not drill-day feel. PlyoCare set is trivial ($70) — the
  moat is programming + monitoring. Source: `02`, `03`.
- **Youth vs mature tiering** (pre-PHV "Foundations" priced as skill development — movement quality,
  arm care, multi-sport, NO velo promise; post-PHV "Development" — full assessment → individualized
  velo + strength). Automated **Pitch Smart / ASMI compliance alerts** (≤100 IP/yr, ≥2–3 months no-
  throw, daily pitch caps, no pitcher-catcher) — a high-trust, low-cost parent-facing report; the data
  already flows through Compete. Two-way athletes (most HS clients) need a "position throws + swings"
  workload field — TrackMan pitch data alone undercounts a SS-pitcher's arm stress badly. Source:
  `10`, `02`, `03`.

### Trevor

- **Run the Klein ladder permanently truncated:** live in reconditioning/strength blocks, visit
  strength-speed, skip absolute-power peaking unless a specific demo requires a mini on-ramp + blend.
  Delete the offseason velocity block; cap intent ~90% except planned, on-ramped demo days. Source:
  `10`, `05`.
- **Add Nordic hamstring work** (halves hamstring injury rate, van Dyk meta) + daily cuff/scap ER
  micro-dosing (10–15 min) — cheap durability insurance for the post-TJ, late-career profile. Source:
  `05`.
- **Med-ball throw velo + CMJ eccentric-braking decline as your two monitoring metrics** — non-
  throwing fatigue readouts that respect the elbow and let you calibrate demo/throwing days without
  overloading a reconstructed UCL. Source: `06`, `08`.

---

## LATER (9+ months) — fidelity upsell, revenue lines, research edge

### Triton

- **In-outing velo-maintenance / "recovery capacity" metric.** Join first-inning vs final-inning FB
  velo decay (from Compete/TrackMan) with aerobic markers (resting HR, HRV trend, submax test) — a
  differentiated, physiology-grounded facility metric (PCr resynthesis is aerobic; in-game velo decay
  is that capacity degrading). Ties conditioning prescription to an observable output. Source: `08`.
- **Recovery-readiness auto-swap.** Tie conditioning-day type to a morning HRV or subjective 1–10
  readiness input so the system swaps a sprint day for a recovery circuit when readiness is low —
  turns the parameterized templates into an autoregulating plan. Source: `08`, `06`.
- **Hitting layer** (`neptune_hitting`): exit velo + bat speed (HitTrax/Blast), benchmarked by
  maturity band — extends the same norm machinery to the two-way and position-player clientele.
  Source: `09`, `11`.

### Neptune

- **Proteus Motion (~$15k) as a Phase-2 differentiator + revenue line** ($149 initial screen / $49
  retests). On pure evidence-per-dollar the radar med-ball throw wins (~2% of the cost, stronger
  published correlations), so buy Proteus for the tech-forward "development lab" brand, the athlete
  experience, and Mayday content — not because it out-measures the med ball. If bought, pipe
  dominant/non-dominant acceleration into Compete and validate the R=0.76-to-velo relationship in
  *your own* athletes before trusting it externally. Source: `06`, `11`.
- **HitTrax cage** as an entertainment/revenue asset (rent at $40–120/hr, run leagues) with a data
  by-product — not an assessment purchase. Source: `11`.
- **Markerless kinematics + one Edgertronic-class camera** — the pitch-design + sequencing fidelity
  bay that justifies premium pricing (see biomech-applied for the kinematics build). Feeds the
  transfer-measurement loop (assess → prescribe plyo/constraint block → re-assess *on the mound*).
  Source: `03`, `11`.
- **Optional embedded mound force plates** (custom tri-axial install) once assessment revenue
  justifies capital — enables drive-leg impulse + braking-force KPIs (braking force explained 36% of
  velo variance) next to Stuff+/velocity in Compete. Vertical-only plates miss the anterior-posterior
  braking shear that carries the signal. Source: `05`, `06`.
- **Differential-learning / constraints-led blocks as retention/transfer tools** — program them as the
  middle of a change (transfer beats prescriptive instruction; DL won the novel-transfer test) and
  **log pre/post release ellipses so Neptune generates its own effect sizes** rather than importing
  meta-analytic averages. Constraint drills can look worse in the cage and better on the mound — judge
  on mound deltas, not drill-day numbers. Source: `03`.

### Service design & pricing (Neptune, applies across horizons)

- **Flagship velo package sells the responder-tracked, ACWR-monitored block** — "we'll show you, week
  by week, whether it's working and whether your arm is tolerating it." The monitoring wrapper is the
  product; the balls are $70. Source: `02`, `03`, `09`.
- **Pricing: Tread/Driveline-style one-time assessment ($1,000–$1,800 credible at the Tier-2 stack) +
  a recurring coaching commitment ($300–400/mo class).** The 6-week re-assessment loop, not the one-
  time capture, commands the 3–10× premium over a commodity cage (Driveline's own $1,799 + $399/mo are
  the market's proof of willingness to pay). Source: `09`, `11`.
- **Marketed velo expectation = the distribution, not the max:** "~2–3.5 mph over a committed
  off-season, meaningful variation, ~40–50% see little in a given block — and here's how we monitor
  your arm the whole way." Under-promising is the marketing edge in a field of inflated claims and the
  credibility play for a founder with Trevor's résumé. Source: `01`, `02`, `09`.

### Trevor

- **Use the arc as content.** TJ (2017) + late-career return + the mature-arm "1 mph is a win"
  reality is a ready-made Mayday narrative for the honest-expectations, safety-telemetry method — the
  "long game vs radar-chasing" story is on-brand and evidence-forward, and it differentiates Neptune
  from every "+10 mph guaranteed" cage in the country. Source: `01`, `02`, `10`.

---

## Cross-cutting build discipline (non-negotiables)

- **One shared schema, two namespaces.** `neptune_assessments` (physical capacity, this doc) and
  `biomech_captures` (kinematics, companion doc) hang off the same athlete id and the same
  `compete_pitches` spine. Kinematics (coachable) and kinetics/workload (monitorable) never blend into
  one leaderboard. Every row carries `examiner`/`test_date` and, for device data, `capture_system`
  provenance. Source: `09`, `11`.
- **Report only reliable metrics; store `cv_pct`/SEM; color real-change-vs-noise.** IMTP peak force,
  CMJ height/power, grip, fixed-examiner ROM = bankable; RFD, jump-strategy, single-camera shoulder
  rotation = monitored internally, trend-only. Never mix longitudinal data across vendor devices.
  Source: `09`, `11`.
- **Every velocity claim ships with the injury tail and an evidence grade.** Weighted balls are
  *effective-but-risky*, not settled-safe (GRADE "very poor"). ACWR is a guardrail, not physics.
  Force numbers predict capacity, not velocity. Being the source that says "association, not proven
  cause" is the credibility play with sophisticated clients. Source: `01`, `02`, `09`, `10`.
- **Bio-band, don't birthday-band.** Every youth number is a maturity-adjusted percentile or you
  misclassify late bloomers as failures — the facility's biggest reputational risk. Source: `09`.
- **Buy capture hardware, buy the AMS, build only the analytics layer** — the Compete pipeline is the
  moat; a custom workout-delivery app is a trap. Vet every PO for raw CSV/API export without per-export
  fees and data retention after subscription lapse. Source: `11`.
- **Platform hygiene:** log ad-hoc queries to `docs/Queries.md`; update `docs/VARIABLES.md` in the
  same commit as any new metric/param; mutations via `run_mutation`; VACUUM between large batch
  updates; never push without approval.
