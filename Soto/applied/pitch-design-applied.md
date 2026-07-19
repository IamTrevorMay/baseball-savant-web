---
title: Pitch Design — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - pitch-design
  - stuff-plus
  - seam-shifted-wake
  - arsenal-construction
  - neptune-assessment
  - compete-pipeline
  - deception
  - facility-tech
last_updated: 2026-07-19
---

# Pitch Design — Applied Playbook

> Translates the 12 docs in `Soto/pitch-design/` into a sequenced build plan for the Triton
> platform, the Neptune Performance service stack, and Trevor's own throwing. Every item cites
> its source docs by filename. Costs, expected effects, and timelines are stated wherever the
> research supports a number.

## TL;DR

- **The single highest-leverage Triton change is replacing the linear z-score Stuff+ with an
  outcome-trained model** (LightGBM on the 7.4M-row `pitches` table, tjStuff+'s 11-feature
  template). The current formula's constant gradient (every mph = 4.5/σ everywhere) contradicts
  the proven convex velo surface (~96 mph inflection) and can't see VAA, arm slot, or seam
  effects. Everything else layers on top of it. (`10-stuff-models-in-design.md`)
- **Before that, a week of cheap SQL ships most of the new signal**: attack-zone fields,
  arsenal-relative separations (CH velo gap vs own FB), axis-deviation (SSW) from 2020+ Statcast
  columns, height-adjusted VAA, arm-angle-relative IVB, horizontal release SD, per-pitch platoon
  deltas. All computable from data already in `pitches`. (`01`, `02`, `04`, `09`, `12`)
- **Neptune's pitch-design lab is ~$7K of hardware away from MLB-org capability**: TrackMan is
  owned; add an Edgertronic SC1+ monochrome (~$6–6.5K with lens) and rosin/ball/calibration
  discipline. The differentiator is software Triton already half-owns — intake reports, design-
  session mode with grip-variant tagging, and intended-target (miss-distance) capture.
  (`06-grips-and-cues.md`, `07-rapsodo-trackman-workflow.md`)
- **Sell named installs, not lessons**: Cutter Install (2 weeks, highest floor), SSW Sinker
  Install (3–4 sessions), Supinator Changeup (kick-change/splitter routing, ~6 weeks). Grip-driven
  pitches transfer in days-to-weeks; bias-fighting shapes take a full offseason and often fail —
  so the intake bias screen is the product's economic engine. (`05`, `02`, `04`, `11`)
- **Workload gates are non-negotiable**: design blocks only after 2–4 weeks of ACWR 0.8–1.3,
  10–25 new-pitch reps per high-intent day, ≥2 days between mound days, and pitch-mix composition
  in the workload model (changeups cost ~10% less elbow torque than fastballs). The injury
  evidence points at volume, fatigue, and stuff-chasing — not pitch types. (`10`, `11`, `03`, `04`)
- **Trevor's own program**: changeup/splitter-family experiments (kick change first) are the
  tissue-cheapest, most content-valuable design work he can film post-TJ; his supination-leaning
  profile is testable against his own rows in `pitches` before picking targets. (`04`, `06`)

---

## NOW (0–6 weeks)

### A. Triton — cheap derived features that unlock everything downstream

All of these are SQL/derived-column work against existing tables; none requires new ingest.
Update `docs/VARIABLES.md` in the same commits per convention.

1. **Attack-zone geometry** on `pitches`, `milb_pitches`, `compete_pitches`: heart/shadow/chase/
   waste from `plate_x/plate_z` + `sz_top/sz_bot` (shadow = ±2.9 in of the edge). Pays three ways:
   pitcher **shadow-share** as a `pitcher_season_command` candidate (shadow runs ~1.7 RV/100
   pitcher advantage vs ~0.9 in the heart), hitter vulnerability cards, and a level-agnostic
   Neptune command KPI. ~1 day. (`12-attacking-hitter-vulnerabilities.md`)
2. **Arsenal-relative separations**: `chg_velo_sep`, `chg_ivb_sep`, `chg_hb_sep` (offspeed vs
   same-game own-fastball averages) and within-pitcher cutter deltas. Separation, not raw shape,
   is the changeup's active ingredient (≥10 mph gap → 34.2% whiff vs 26.1% at <8 mph); no
   per-pitch-type z-score can see it. ~1–2 days. (`04-changeup-splitter-design.md`,
   `05-cutter-hybrid-design.md`, `06-grips-and-cues.md`)
3. **`ssw_deviation` (axis deviation)**: observed `spin_axis` vs movement-inferred axis, 2020+
   rows only (hard measurement wall — pre-2020 axis is itself inferred). This separates "dead
   low-efficiency fastball" from "SSW weapon" (>90% of 50+-pitch sinker throwers show ≥10°
   deviation vs 29% of four-seamers; deviation out-predicted velocity for sinker run value).
   Feeds Stuff+ v2 and deception v2. ~2–3 days. (`01`, `02`, `07`)
4. **Height-adjusted VAA + the VAA×plate-height whiff surface**: compute VAA-above-average at
   pitch height (raw VAA is mostly location, R² = 0.754) and build the 2-D whiff/called-strike
   lookup from the 7.4M-pitch table. Flat four-seamers get ~2× the whiffs up; steep ones ~2×
   down; heart-zone VAA is irrelevant. This surface becomes the fastball report tile *and* the
   Neptune target-setting artifact ("your FB plays above 3.2 ft; you threw 61% below 2.8").
   ~3–4 days. (`02-fastball-design.md`, `12`)
5. **Arm-angle-relative shape**: ingest Statcast arm angle (public, late 2024+), then
   `ivb_above_slot` and `axis_dev_from_slot` from a league regression. "Movement the slot doesn't
   advertise" is the best-evidenced non-tunnel deception trait (slot-atypical fastballs whiff
   more; slot-droppers gained +2.14 RV for −0.15 mph). ~1 week including backfill approximation
   from release geometry for pre-2024. (`02`, `03`, `09`)
6. **Release-consistency metrics into `pitcher_season_command`**: per-pitch-type horizontal
   release SD and 95% ellipse area (horizontal SD alone explains R² = 0.345 of K/9 — the
   single best-evidenced deception/command component), plus a **tell detector** flagging
   between-type mean release offsets >2× within-type SD. Trivial aggregates over
   `release_pos_x/z`. ~2 days. (`09-deception-tunneling.md`)
7. **Per-pitch platoon deltas** (RV/100 or wOBA vs L/R) with shrinkage priors re-fit in-house
   from the Marchi-style league values (sweeper ~1.12 split, sinker ~1.08, straight change
   −0.77). Surface on the pitcher dashboard + a "portfolio gap" flag (no arm-side or
   platoon-neutral secondary). ~3 days. (`08-arsenal-construction.md`, `12`)
8. **Accidental-cut flag** on Compete sessions: `abs(HB) <= 5 AND IVB >= 16` = cut-ride;
   HB *and* IVB both falling week-over-week = developing a flaw, not a weapon. Two-line rule,
   big coaching payoff. (`02`)

### B. Neptune — assessment battery, SOPs, and the first service menu

1. **Intake assessment (the product's front door)** — one 20–25 pitch tracked bullpen, full
   arsenal, generating a single Reports-Builder artifact per athlete:
   - Per-pitch shape table (velo, IVB/HB, spin, efficiency, axis, release h/s, extension,
     VAA/HAA) vs level-banded benchmarks (HS four-seam ≈ 1,977 rpm, college ≈ 2,148, MLB ≈
     2,256 — compare in **Bauer Units** (rpm/mph, MLB ≈ 24), never raw rpm across levels).
   - Movement plot with cluster ellipses, **dead-zone region shaded**, uncovered quadrants
     annotated — this one graphic *is* the arsenal conversation.
   - **Pronation/supination bias screen**: spin-efficiency-by-pitch-type fingerprint +
     movement-plot asymmetry + a few grip trials on TrackMan. This routing decision (pronator →
     traditional CH/gyro SL; supinator → kick change/splitter/SSW shapes) is most of the
     difference between a 6-week and a 2-year pitch build.
   - Release ellipses vs the MLB (~30.6 cm) / MiLB (~35.2 cm) horizontal benchmarks; SSW
     deviation; platoon-gap flags; fastball-family plan (primary shape + complement — single-
     fastball ride-only profiles are a depreciating asset below elite velo).
   (`11-pitch-design-process.md` §2–3, `01` §8, `02` §9, `08` §9, `09` §7)
2. **Data-hygiene SOP (non-negotiable, cheap)**: add `device`, `firmware`, `ball_model`,
   `session_type` (pen-shape / pen-execution / live-AB / game), and `grip_variant` columns to
   the Compete schema; weekly calibration ritual + 5-pitch known-athlete sanity set; one ball
   model per session; never trend across devices without a paired-capture offset (documented
   3–5 in inter-unit movement disagreements). Rosin discipline logged — wet-ball slip costs
   real velo/spin/command and can masquerade as regression. (`07` §7–8, `06` §4)
3. **Tech purchases (priced)**:
   | Item | Price | Verdict |
   |---|---|---|
   | Edgertronic SC1+ monochrome + 80–200mm lens | ~$6,000–6,500 | **Buy now.** Seam orientation at release is invisible to radar; this is the causal layer. 500–1,000 fps suffices. |
   | Rapsodo PRO 3.0 | $8,500 | **Next, not now.** Adds optical axis/efficiency + seam orientation + SSW break on practice mounds; buy when a second design mound or hitter work justifies it. |
   | TrackMan B1 software renewal | $475–600/yr | Keep — CSVs drop straight into Compete. |
   | Pocket Radar Smart Coach (velocity audit ground truth) | ~$400 | Buy now; monthly device-drift audits. |
   | Blast bat sensor (hitter attack-angle for vulnerability work) | ~$150–200/unit | Buy 2 now; pairs with TrackMan location for the swing-plane battery item. |
   | Driveline-style CV seam tracking | n/a yet | **Don't buy.** Capture discipline now (synced video + tracker rows, shared pitch IDs) makes the archive CV-ready later. |
   (`06` §7, `07` §5/§7, `12` §2)
4. **Service menu v1 — named installs with gates and timelines**:
   - **Cutter Install** — 2-week templated block. Highest-floor product: fastball-adjacent motor
     pattern, at-or-below fastball elbow torque, platoon-neutral (.313 wOBA both sides). Gates:
     velo = FB −3–6, IVB ≥8", HB 0 to −5", plus weekly four-seam bleed check (IVB down >1.5" or
     run up >2" = red flag; cap usage ~15–20% in developing arms). (`05` §5/§7)
   - **SSW Sinker Install** — 3–4 sessions, one-seam grip ladder, success = axis deviation
     ≥15–20° and ≥3"/4" run/drop beyond spin prediction. The highest-probability "new pitch in
     a month," ideal for same-side-heavy relievers. (`02` §5)
   - **Supinator Changeup** — kick change first (fosh/split-change tier for small hands),
     splitter for post-growth athletes with span; ~5–8 mph gap, depth-first = platoon-proof.
     No evidentiary basis for splitter bans; track workload like any new pitch. 2–6 weeks
     usable, one offseason to trust. (`04` §2–3/§5, `06` §2)
   - **Design-block template** (all installs): entry gate ACWR 0.8–1.3 held 2–4 weeks; 2
     pens/week (one *shape* — every rep tracked, one variable per 5–8 pitch block; one
     *execution* — no experimentation); 10–25 new-pitch reps per high-intent day, 20–30 pitch
     pens, ≥2 full days between mound days (~72 h muscle-damage recovery); pre-registered kill
     criteria at 3–4 sessions; explicit exit verdicts per ladder rung (shape / command /
     live-AB / game-sample) written to the athlete record. **Verdicts instead of vibes is the
     rarest discipline in the industry and it's pure software.** (`10` §5, `11` §5–8)
5. **Youth policy in writing**: workload-first (pitch counts, rest, no year-round throwing) —
   the curveball-injury torque claim is debunked (curves load the elbow *less* than fastballs)
   but keep the ASMI-aligned 13–14 breaking-ball default in written materials for defensibility.
   Changeup-first has real kinetic backing (lowest torque of FB/CB/CH). Arsenal ladder by level:
   2 commanded pitches youth, 3 HS, 3–4 college — command before addition; at HS the dominant
   edge is strikes (FPS% swing ≈ 100 wOBA points per first pitch), not shape. (`03` §8,
   `04` §7, `08` §8, `11` §5, `12` §4/§8)

### C. Trevor — own training

1. **Kick-change experiment block** — the intersection of tissue-cheap (changeup family ≈
   8–14% lower elbow load), grip-driven (days-to-weeks learnable), and premium content
   ("which changeup are you?" is a natural Mayday franchise). Film at 1,000 fps once the
   Edgertronic lands. (`04` §5/§7, `06` §2)
2. **Verify the bias first**: query his own rows in `pitches` — the plus-curveball/four-seam
   history reads supination-leaning, but he was pronation-comfortable with the changeup; the
   fingerprint decides whether kick change or conventional CH is the demo pitch. Log the query
   to `docs/Queries.md` per convention. (`06` §5)
3. **Conservative end of every guardrail**: grip-driven targets only, ACWR gate, no
   every-other-day pens. Post-TJ longevity came from workload sanity, not shape-chasing —
   that is also the on-camera message. (`10` §4, `11` §5)

---

## NEXT (6 weeks – 6 months)

### A. Triton — the model rebuilds

1. **Stuff+ v2 (the big one)**: LightGBM (or similar) trained on run value over `pitches`,
   tjStuff+'s 11-feature template as the floor — velo, movement, release geometry, extension,
   **speed/accel differentials vs own primary fastball**, arm angle, axis deviation,
   location-adjusted VAA. Requirements from the evidence: convex velo above ~96; sinker >
   four-seam below ~97; IVB graded relative to slot; per-handedness primary context. Keep the
   z-score model as the descriptive-percentile fallback (`computeStuffRV()` path). Expect
   ~80-pitch stabilization — which is exactly why it becomes the Neptune bullpen feedback
   instrument. Validation: hold-out season, compare vs current z-score on next-season wOBA
   (tjStuff+ benchmark: 0.85 YoY stickiness). ~3–4 weeks of focused work. (`10` §1–2, `02` §2)
2. **Deception v2** — rebuild `pitcher_season_deception` as four validated sub-scores:
   (1) release integrity (horizontal SD + tell penalty), (2) slot-movement residual
   (`unique_score` successor), (3) pairwise tunnel geometry — *integrated* pre-commit
   separation to the 150 ms point, weight capped well below stuff/command (sequence-level
   tunnel scores correlate with RV at only r = 0.07; value is ~0.5–1 RV/100 on best pairings,
   as incremental lift), (4) approach-angle edge (VAA flatness SD units, HAA extremity,
   extension percentile). Validation target: CSW% residual after controlling for Stuff+.
   (`09` §7)
3. **Arsenal layer**: PP/SiP/SoP × arm-/glove-side slot classification with uncovered-slot
   flags; blurred-pair flag (two breakers within ~1 velo band and ~4" HB); movement-spread
   metric; **Nash-gap tile** (usage-weighted per-pitch RV dispersion — the "why does your best
   pitch have the lowest usage?" chart, nearly free from `pitches`). Fix shape first, then
   re-optimize usage; usage reallocation rivals a 2–4 pt whiff gain from redesign at zero
   physical cost. (`08` §1/§4, `03` §7, `05` §2)
4. **Classification cleanup**: `cutter_type` sub-classifier (true cutter vs gyro bullet at
   ~30% efficiency / IVB > 5"), within-pitcher offspeed clustering instead of trusting
   `pitch_type` labels (splitter/FS/FO chaos), and a shape-space clusterer for Compete data
   where no classifier exists — amateur "sliders" are frequently slurves. (`05` §3, `04` §3,
   `03` §1)
5. **Coach-facing gradient card** on Compete sessions: per pitch, current v2 grade plus
   one-feature sensitivities ("+1 mph ≈ +X", "+2" IVB ≈ +Y") computed against the athlete's
   own baselines. The model as evaluator/ranker, never originator — bias and arsenal gap pick
   the target, the model ranks candidates. (`10` §2–3)

### B. Neptune — the software moat

1. **Compete "Design Session" mode**: target-shape overlay on the movement plot, per-block
   grip-variant tagging UI, instant block-vs-block deltas (velo/HB/VB/spin/efficiency),
   release-invariance check vs the fastball (>2–3" drift = tipping red flag), session report
   to the athlete's longitudinal record. (`07` §6–7, `10` §5)
2. **Intended-target capture (miss distance)** — the one real schema gap. Tablet tap-the-target
   before each pitch, stored per row. MLB average miss ≈ 11–12"; a 3" improvement ≈ ~1 WAR by
   Driveline's estimate; without it the command rung of the metrics ladder is unmeasurable.
   (`11` §6)
3. **Design-block report** implementing the metrics ladder: shape-stability panel (rolling
   ellipse vs target band), command panel (miss-distance trend), live-AB panel (whiff/chase),
   Stuff+ trendline, ACWR gate status. Judging a new pitch on 15 game reps is noise; the model
   grade at n≈20 substitutes for outcomes at n≈300+. (`11` §6, `10` §5–6)
4. **Live-AB station** — TrackMan on, hitters from the training pool, `session_type` tag makes
   pen-vs-live shape drift queryable. This is the transfer stage most facilities skip and where
   most designed pitches die. Stand-in hitters (track, don't swing) are the free tier. (`11` §7)
5. **Neptune norm tables**: once N is sufficient, publish level-banded percentiles per pitch
   archetype × age band from `compete_pitches` (the `league_averages` pattern extended to
   facility data). Public amateur benchmarks are thin — this is a marketing asset. (`03` §6)
6. **Hitter-side battery v1**: Blast attack angle by pitch height + chase%/z-contact% per live-AB
   session (the two stable, level-portable, coachable hitter KPIs), feeding the 2×2 exploit-path
   card. (`12` §2/§6)

### C. Trevor

1. **SSW sinker demo build**: one-seam grip ladder with axis-deviation before/after as the
   ground truth of whether the seam experiment did anything (efficiency alone can't see it).
   His ~3/4+ slot means the four-seam always needed 17"+ to play; the SSW sinker is the cheap
   modern add — and the sweeper-vs-gyro-slider framing off his money-pitch slider is a natural
   teaching video. (`01` §8, `02` §4–5, `03` §3)
2. **His career arc as content architecture**: four-seam/changeup/slider starter → two-look
   power reliever (21 saves, 2023) is literally the arsenal-size/role math story — a credible
   on-camera artifact for the arsenal-construction material. (`08` §5/§8)

---

## LATER (6–18 months)

1. **Triton — cannibalization study**: bucket four-seams by (IVB, VAA, velo), condition on
   same-pitcher cutter existence/usage, measure FF run-value delta on the 7.4M-row table.
   Nobody public has done it convincingly at scale; publishable differentiation for both Triton
   and Neptune marketing (the 2026 cut-fastball wave produced winners *and* losers — Gilbert
   96→102 Stuff+, Chandler 108→93). (`05` §4/§6)
2. **Triton — park/air-density normalization** on the movement term before z-scoring (Coors
   ≈ 82% ρ → −3–4" IVB; validate on COL residuals first), plus season-partitioned baselines
   stay mandatory — league movement drift is partly the ball. Add `mirror_delta_deg`
   (|FB axis − CB axis − 180°|) to deception. Note the winter-facility effect in Neptune
   reports (~1–2% IVB inflation in cold dense air). (`01` §6/§8, `03` §4)
3. **Triton — AAA↔MLB level-gap study**: chase, z-contact, per-shape RV/100 in `milb_pitches`
   vs `pitches` — calibrates advice for players between levels and is a second publishable
   internal study. (`12` §8)
4. **Neptune — CV seam/axis layer**: adopt Driveline-class computer vision (or manual seam
   annotation in Triton) over the already-clean synced video archive; also Rapsodo PRO 3.0
   ($8,500) as the second design-mound tier when throughput demands it. (`06` §3/§7, `07` §5)
5. **Neptune — biomech layer**: if/when IMU or markerless mocap arrives, per-pitch-type elbow
   torque estimates validated against the Fleisig/Escamilla percentages (CH ≈ −8–14% vs FB),
   and pitch-mix composition formally in the workload model (60 pitches at 40% CH ≠ 60
   fastballs). Command-biomech coaching lens: repeat the landing, keep the hand free. (`04` §7,
   `11` §6)
6. **Standing risk register**: Goodhart cycles (sweeper graded elite 2021–22, marked down 2024
   — design to the athlete's outlier trait, not the fashionable shape); stuff–command tradeoff
   (a shape change costing >~1 SD of location usually nets negative until command retrains);
   injury externality of stuff-chasing (2025 AJSM case-control: velo, slider spin, cutter
   extension flagged) — every design block is a workload event in the athlete record. (`10` §4)

---

## Dependencies at a glance

```
NOW SQL features (attack zones, seps, ssw_deviation, VAA, slot, release SD)
        └─→ Stuff+ v2 ─→ gradient cards ─→ Neptune design-session feedback
        └─→ Deception v2 (needs ssw_deviation + release SD + arm angle)
Compete schema adds (device/ball/session_type/grip_variant)
        └─→ Design Session mode ─→ intended-target capture ─→ design-block report
        └─→ clean synced archive ─→ CV seam layer (later)
Edgertronic purchase ─→ install packages at full fidelity + Trevor content
Intake battery ─→ service menu routing (bias screen gates everything)
```
