---
title: Baseball Metric Algorithm Design — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - algorithm-design
  - stuff-plus
  - command
  - deception
  - expected-stats
  - facility-analytics
  - projections
  - validation
  - triton-platform
  - neptune-performance
last_updated: 2026-07-19
---

# Baseball Metric Algorithm Design — Applied Playbook

> Translates the 11-doc `algorithm-design/` research corpus into a sequenced build plan for
> **Triton** (metrics/models on the 7.4M-row Statcast spine), **Neptune** (assessment battery,
> programming, tech, service design on the Compete/TrackMan spine), and **Trevor's own training**.
> Sequenced **Now / Next / Later**. Every recommendation cites its domain doc(s) by filename and
> carries cost/effect/time estimates where the research supports one.

## TL;DR

- **Triton's #1 move is upgrading Stuff+ from hand-weighted z-scores to an RV-trained model — in
  two cheap steps.** Step A (days): keep the exact features, fit the weights by regressing
  count-neutral per-pitch run value on the existing z-scores. Step B (~2 weeks): LightGBM on
  count-neutralized xRV, 2020–2025, 12–14 features. Public solo authors hit YoY r ≈ 0.78–0.85 and
  ~60–80-pitch stabilization with this recipe; that's the credibility bar (`01`, `03`, `08`).
- **The command answer is two-tier and it's Neptune's moat**: a Statcast proxy blend for the
  platform (location RV + mixture-model execution dispersion + release repeatability) and a
  **true miss-distance pipeline in Compete via declared-intent tagging** (`intended_x/z`) — intent
  data gives reliable command reads in 10–30 throws vs ~400 pitches for Location+-style proxies,
  and no public MLB model can ever match it (`02`).
- **Ship the honesty engine before any progress dashboard**: SWC (0.2 × cohort SD) + typical-error
  bands, 2×CV ≈ 2.5 mph on an 85 mph baseline = "certainly real." Realistic facility velo gains are
  1.0–1.5 mph per 6-week block, 52%/27%/21% gain/flat/lose — market against that, intent-to-treat,
  or lose the data-literate customer (`11`, `07`).
- **The cheapest proven purchase in the whole corpus is a visible radar number**: an RCT (n=123)
  found immediate velo feedback alone produced 8.1% vs 2.7% velocity gains — ~4x — for the cost of
  a ~$700 Pocket Radar Smart Coach + display. Buy it before any $10k device (`11`).
- **Expected stats are Triton's missing outcome-side layer and a weekend-scale build**: kNN
  (k≈11–400) over EV/LA → xwOBAcon/xBA/xERA, R² ≥ 0.95 vs Savant achievable; same grid scores
  cage sessions at Neptune where no outcomes exist (`04`, `03`).
- **Validation is a product surface, not a chore**: group-aware splits (never random rows — the
  0.91→0.38 R² collapse), the team-switcher stress test (Stuff+ r .41→.14), stabilization
  minimums in the UI, and evidence-grade tooltips on every athlete-facing number (`09`, `08`).
- **Deception v2 (five sub-scores) and a Marcel-baseline projection module are the Later-tier
  differentiators** — deception is one of the few open public edges; projections power both player
  pages and Neptune's "performance above expected development curve" sales math (`05`, `07`).

---

## NOW (0–6 weeks)

### Triton platform

1. **Run-value ground truth layer** — confirm `delta_run_exp` coverage on `pitches`; build
   `re24_matrix(era_band, level, outs, base_state, re)` and `count_rv(era_band, level, balls,
   strikes, rv)` derived tables (MLB + AAA from `milb_pitches`, minding Title-Case events).
   Era-band, not per-season — 2021–24 vs 2015–19 RE24 deltas are ≤0.09 runs/state. **Time: 2–3
   days.** Everything downstream (Stuff+ v2, command, expected stats, Neptune count-training
   targets) prices in this currency (`03`).
2. **Stuff+ v2, Step A — RV-calibrate the existing z-score model.** Regress count-neutral
   per-pitch RV on veloZ/moveZ/extZ per `pitch_name`/`game_year` bucket; replace the hand-set
   4.5/3.5/2.0 weights with fitted ones. Near-zero architectural change, shippable incrementally,
   keeps `computeStuffRV()` as documented fallback. **Time: 2–4 days.** (`03` §8, `01`)
3. **Stuff+ v2, Step B — LightGBM xRV model.** 2020–2025 rows (~2.5M usable; extension coverage
   ~99% post-2019), count-neutralized xRV target, 12–14 features: release_speed, ax/az,
   release_pos_x/z, extension, spin_rate, spin_axis, axis differential, **velo/movement
   differentials vs handedness-specific primary fastball**, derived arm angle, VAA. One model per
   pitch family or routed single model; temporal split (train ≤2023 / validate 2024 / test 2025).
   Scale to mean 100 / SD 10 per season × role; persist alongside `pitch_baselines` for A/B
   continuity. **Time: 1–2 weeks. Validation gates before it touches a player page:** split-half
   stabilization ≤ 80 pitches; YoY self-correlation ≥ 0.8; next-season wOBA correlation ≥ 0.6 at
   100-pitch minimum (`01` recipe, `08`, `09`).
4. **Feature/cleaning hygiene pass (do during Step B, not after):** mirror all horizontal
   quantities for LHP; audit the feet→inches pfx conversion for double-application; drop
   `PO`/`IN`/nulls; physical-plausibility filters (2x spin artifacts, extension <4.5/>8 ft);
   `game_year` as feature or 2020+ training window (Hawk-Eye break); **flag the 2026
   `plate_x/plate_z` front-of-plate → middle-of-plate regime break** — it biases zone-edge and
   VAA-at-plate features inside Triton's own window (`10`).
5. **Validation harness as standing infrastructure**: one module that runs group-aware CV (split
   by pitcher AND season), split-half stabilization curves, YoY reliability, the team-switcher
   cohort test, and calibration (Brier + reliability diagram) for any probability head. Every
   model ships with this report; log eval queries to `docs/Queries.md`, keys to
   `docs/VARIABLES.md` per house rules. **Time: ~1 week, amortized across every future model**
   (`09`, `08`).

### Neptune Performance

1. **Intent capture in Compete — the single highest-leverage facility feature.** Add
   `intended_x`/`intended_z` to `compete_pitches` + a tap-to-target zone map in the session UI
   (9-zone minimum, continuous x/z preferred; post-hoc tagging fallback). Per-pitch outputs:
   Euclidean miss distance (inches), signed miss_x/miss_z vector (never scalar-only — high misses
   off middle targets *gain* whiffs), and location-RV delta actual-vs-intended. **Time: 1–2 weeks
   dev. Benchmarks to encode:** MLB avg fastball miss ≈ 11"; 12.5"→10.8" is a real development
   win; expect HS intakes mid-teens (validate locally). 10–30 throws per pitch type = usable
   read — two orders of magnitude faster than any public proxy (`02` §8).
2. **SWC/TE honesty engine.** Per-athlete, per-metric rolling typical error (from within-session
   repeats) + cohort SD → automatic tags on every delta: *no change / possibly meaningful /
   certainly meaningful* (2×CV rule). Never rank on a metric whose TE exceeds cross-athlete SWC.
   This is a retention feature — an over-claiming dashboard burns the trust the model runs on
   (`11` §2).
3. **Facility Stuff+ v1.** Score `compete_pitches` with the MLB model (columns map 1:1), then
   (a) apply a device→Hawk-Eye offset for velo/spin before any MLB comparison, (b) report
   percentiles vs **level-appropriate** baselines (16U graded vs MLB reads as noise). Store
   `device_id` + level columns; never mix facility and MLB rows in one baseline. **Time: 2–4 days
   once Stuff+ v2 exists** (`01`, `10` §7, `11` §3).
4. **Guardrail layer v1.** Pitch Smart age tables encoded as reference data (the `league_averages`
   pattern for rest/count limits); throw-load ledger per athlete (all throwing, with intent
   level); fixed-percentage week-over-week ramp caps — **not ACWR, which is debunked as a
   predictor**; weighted-ball protocols age-gated by default (24% vs 0% injury rate in the
   Reinold RCT). Coach view = alerts; parent view = "on-plan / needs rest" (`11` §6).
5. **Assessment battery v1 (intake + 6-week retest, all on existing TrackMan + radar):**
   - Mound velo (best-of-N, not single max) + peak-of-10 pulldown ceiling (`11` §2)
   - **Command battery**: 2×10 throws per primary pitch to 2 declared targets at game intent —
     standardized script prevents gaming; becomes the intake/exit test (`02` §8)
   - Pitch-shape capture → facility Stuff+ percentiles vs level (`01`, `11`)
   - Hitters: EV/LA capture → xwOBAcon vs level grid, ~50-BBE minimum before trends show (`04` §9)
6. **Tech purchases (Now tier):**
   - **Pocket Radar Smart Coach + visible display: ~$700–1,500.** The proven 4x-relative-gain
     feedback lever; the display *is* the intervention. Buy first (`11` §1).
   - **Rapsodo Pro 3.0 as second/overflow unit: ~$4–10k** (~$9.5k secondhand). Reads velo/spin
     slightly low, ±1–2 mph per pitch — usable once the offset layer exists (`11` §3).
   - TrackMan already in hand ($20–40k class) — it stays the facility reference device.
   - Defer force plates/mocap decisions to `biomechanics-applied.md`; nothing in this corpus
     requires them for the v1 battery.

### Trevor

- Run his own **20-throw IZT-style command session per pitch type** through the new intent
  pipeline → a credible, content-ready command grade + miss-direction rose ("my miss distance vs
  the ~11-inch MLB average") — strong stream/video material and the internal QA test for the
  feature (`02` §8).
- Grade his bullpens on the context-neutral stack only: expected RV per pitch + command-adjusted
  xRV vs target; xwOBAcon-against per live session as the single "how hittable was I" number
  (`03` §8, `04` §9).

---

## NEXT (6 weeks – 6 months)

### Triton platform

1. **Expected-stats layer.** Phase 1: xwOBAcon grid — kNN (k≈400 MLB-style) or GBM over
   (launch_speed, launch_angle) → outcome probabilities → per-season linear weights; season-banded
   (2015–19 radar vs 2020+ Hawk-Eye separate grids). Phase 1.5: xBA/xSLG, xERA =
   (xwOBA − lgwOBA)×13 + lgERA, SIERA from event rates. Batch-write via `run_mutation` with
   VACUUM between (8GB disk ceiling). **Gate: R² ≥ 0.95 vs official Savant xwOBA 2023–25**
   (Nestico hit 0.96 with k=11). UI framing per the evidence: for pitchers expected stats are a
   *fairness audit, not a forecast* — lead with K-BB%/SIERA/Stuff+ (`04` §8, §10).
2. **Command v2 in `pitcher_season_command`.**
   `command_score = w1·location_rv_plus + w2·execution_tightness_plus + w3·release_repeatability_plus`
   — the Location+ clone, an xCTRL-style Gaussian-mixture execution dispersion (separates "aimed
   badly" from "missed badly," fixes the Mikolas/Kirby single-target defect), and per-type release
   SD. Weights fit out-of-sample against next-season BB% + location RV; **components exposed, not
   just the blend** (game-planning vs mechanics are different interventions). Present with wide
   error bars — command is the noisy frontier (best public YoY R² ≈ 0.5) (`02` §7, `09` §6).
3. **Deception v2 in `pitcher_season_deception`** — five z-scored sub-scores: Disguise (pitch-type
   identifiability at the decision point), Spread (arsenal velo/movement width), Surprise
   (shape-vs-arsenal-expected density), Uniqueness (shape-vs-slot residual + VAA deviation; keep
   `unique_score` here), Release (within-type SD penalty + cross-type divergence). **Gates: YoY
   ≥ 0.5 at 1,500 pitches; incremental R² over Stuff+ + location on CSW%/whiff; leaders should
   skew toward known low-velo overperformers** (Rogers/Karinchak sanity check). This is one of
   the few open public edges — teams still price velo over measured deception (`05` §8).
4. **Shared empirical-Bayes shrinkage module (`lib/`)** — beta-binomial/normal shrinkage toward
   (season, level, role) priors, used by every Triton leaderboard and every Compete aggregate.
   Any leaderboard on raw small-sample rates is a randomness leaderboard (`08`, `10` §6).
5. **Count-value coaching surfaces**: price count wins in runs from `count_rv` (1-1 win ≈ 0.09
   runs; first-pitch strike ≈ 0.08–0.10) on player pages and broadcast panels (live RE24 swing
   graphics are nearly free from the same tables) (`03` §8).

### Neptune Performance

1. **Report generator — the Driveline standard on a fraction of the labor.** Templated artifact
   off Compete (reuse `components/reports/` tile architecture): same-day turnaround (their bar:
   <24h, <90 min labor), strict two-audience split (athlete/parent: 1–2 hero metrics + trend with
   SWC band + one action; coach: full descriptors + guardrails), both views reading identical
   aggregates. Hero trend chart designed screenshot-ready — it's also the Mayday content asset
   (`11` §4, §7).
2. **Command+ zone-difficulty scaling** for the facility command battery: 100 = average for that
   pitch-type × target-zone × handedness; exclude count/game-state (doesn't affect single-pitch
   execution) (`02` §8).
3. **Level-specific grids and matrices**: per-level xwOBAcon grids (an 88 mph/20° ball is a HS
   double and an MLB out) and per-level `count_rv`; borrow collegiate weights where facility data
   is thin, heavy pooling/shrinkage for HS (`04` §9, `03` §8).
4. **Athlete Marcel — the anti-billing-for-maturation system.** Expected next-assessment values
   from weighted history + regression + age-band development curves (PHV-age kids can gain 5–10
   mph from growth alone; mature HS/college 1–2 mph; Driveline cohorts +2.7 to +3.3 mph). The
   product is **performance above projection**, shown as 10th–90th percentile bands. Report
   intent-to-treat gains with completion rates — "our athletes averaged +4 mph" over completers
   is the delta-method survivorship defect as a marketing trap (`07` §8).
5. **Leaderboard/gamification policy**: self-referenced boards with PR markers default-on;
   cohort-matched peer boards opt-in only (matched on age/level/device); no global rank boards;
   reward process streaks (attendance, program completion, intent-target hits) (`11` §5).
6. **Service-design pricing note**: the two winning operators sell the *system* (schedule + data +
   report + integrations) with honest numbers and free-content funnels (TRAQ free ≤20 athletes;
   Tread "98% free" → 750k followers). Neptune's version: Mayday content engine + Triton pro-grade
   context (Stuff+/command/deception percentiles vs pro baselines) that a commodity cage
   can't credibly offer — that's what the 3–10x development-lab price multiple hangs on (`11` §7).

### Trevor

- His historical Statcast rows (high-slot four-seam/slider relief profile) become the demo
  dataset for the deception/tunnel tiles — internal QA + Mayday content in one (`05` §8).
- His velocity trend is his aging clock: pitchers who hold velo within ±0.5 mph/yr show almost no
  FIP aging. Track his mound velo vs an age-curve band as the "staying sharp" KPI, not raw peak
  numbers (`07`).

---

## LATER (6+ months)

### Triton platform

1. **Decomposed xRV chain for Stuff+ v3**: swing → whiff/foul/in-play → batted-ball value
   sub-models per pitch family (StuffPro/PitchingBot pattern) — denoises the target; current best
   practice. Only after v2's validation report is stable (`01`).
2. **Projection module**: Marcel baseline (5/4/3, per-stat regression constants from Triton's own
   split-half analysis, modern flat-peak curve — no post-debut improvement bump, decline onset
   ~26) on the Retrosheet spine; pitchers project **velocity first**, then Stuff+ from projected
   velo/movement/extension, then outcomes. Output percentile fan charts + comp lists (Mahalanobis
   on Stuff+/command/deception vectors — a uniquely-Triton feature) + a standing accuracy page
   vs Marcel/Steamer/ZiPS. **Beat Marcel or don't ship** (`07` §9).
3. **Swing-based expected stats moat**: bat-sensor (Blast, ~$150–200/unit) → expected EV/LA →
   expected production GAMs; Driveline-scale precedent needs ~25K paired swings — a season of
   facility hitting data. Also unlocks squared-up/blast-style swing grades (`04` §7, §10).
4. **Sequence/transformer models last, and only if they beat lag-feature GBMs** — trees win on
   tabular baseball data; cross-athlete NN generalization collapses (R² 0.91 → 0.38 LOSO) (`08`).

### Neptune Performance

1. **Publish internal norms**: nobody has published HS/college miss-distance distributions at
   scale — one season of Compete intent data yields a citable norm table; genuine content +
   credibility asset (`02` §9).
2. **Facility development curves**: delta-method age-band curves from accumulating Compete data
   (with imputation for dropouts once N allows), feeding the athlete-Marcel bands (`07`).
3. **Command↔biomech link**: once mocap/IMU lands (per `biomechanics-applied.md`), replicate the
   dampening analysis — foot-plant variability vs miss distance (published r > 0.6) turns command
   scores into mechanical prescriptions; deception protocol gets the slot-conditional
   expected-shape overlay from TrackMan release geometry (`02` §8, `05` §8, `06` §7).
4. **Availability as a first-class variable**: projected outcomes conditional on session
   attendance — it will explain more variance than any programming choice (`07` §8).

---

## Standing Rules (apply to every item above)

- **Grade every shipped number in the UI** (proven/promising/plausible tooltips + stabilization
  minimums + uncertainty bands) — the corpus's own convention, and the register Trevor trusts
  (`06`, `09`, `11`).
- **Splits by pitcher AND season, never random rows; descriptive ≠ predictive ≠ prescriptive —
  label which job each metric does** (`09`, `08`).
- **Goodhart watch**: league-wide Stuff+ compression is documented, and stuff-chasing is MLB's
  named #1 injury factor — Neptune's hero metrics are behavioral levers, so choose them as such
  and pair every velocity incentive with the guardrail layer (`01`, `11`).
- House rules on every change: `docs/VARIABLES.md` same commit, queries to `docs/Queries.md`,
  `run_mutation` + VACUUM for batch writes, plus-stats excluded from `league_averages`.
