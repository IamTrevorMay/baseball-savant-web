---
title: Pitching Biomechanics & Kinematics — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - biomechanics
  - kinematics
  - triton-platform
  - neptune-performance
  - assessment-battery
  - workload-monitoring
  - release-metrics
  - sequencing
last_updated: 2026-07-19
---

# Pitching Biomechanics & Kinematics — Applied Playbook

> Translates the 12-doc `biomechanics/` research corpus into a sequenced build/buy/train plan for
> the three things Soto serves: **Triton** (the analytics platform), **Neptune** (the development
> lab in buildout), and **Trevor** (post-TJ, staying-sharp/demo/coaching). Sequenced **Now / Next /
> Later**. Every recommendation cites the domain doc(s) it draws from by filename and carries a
> cost/effect/time estimate where one exists.

## TL;DR

- **The whole corpus converges on ~8 defensible constructs**, and the highest-ROI ones for Triton
  need **zero new hardware** — they're computable from data already in hand (Statcast `pitches`,
  `compete_pitches` TrackMan): **release-point ellipse (horizontal SD), perceived velocity, VAA ×
  arm-angle plane classification, and a within-pitcher estimated-elbow-stress index.** Ship these
  first (`06`, `04`, `05`, `11`).
- **Neptune's tech order is settled by the evidence: workload IMU → markerless kinematics → force
  plates → dynamometry, NOT a marker lab or KinaTrax.** Buy PULSE ($245/unit) and ArmCare (~$72/yr +
  ~$100 dynamometer) first; add tri-axial force plates (low-to-mid 5 figures) and a phone/2-iPad
  markerless pipeline (Uplift/ProPlayAI, "90% cheaper than a $50k lab") next; defer marker lab
  (six figures + biomechanist) and KinaTrax (~$500k + $75k/yr) indefinitely (`07`, `08`, `05`).
- **The product is the loop, not the report:** assessment → prescription → 6-week re-assessment on a
  longitudinal DB. Price it Tread-style — $150–500 assessment + a 12-month coaching commitment; the
  recurring loop is what athletes actually pay for and what commands 3–10× commodity-cage pricing
  (`08`, `10`).
- **Sequence timing and lead-leg block are the coachable win-wins** (raise velo *and* lower arm
  torque); **contralateral trunk tilt is the trap** (buys ~3 mph but +11% elbow/shoulder force).
  Build a "velocity-route" taxonomy that steers athletes toward load-neutral gains (`01`, `02`,
  `03`, `09`).
- **Market the distribution, not the highlight reel:** ~1–3.5 mph over a committed off-season, ~21%
  don't gain. Honesty is the differentiator for a founder with Trevor's credibility (`09`, `10`).
- **For Trevor:** target high mph-per-torque, not peak velo — ACWR 0.7–1.3, flexor-pronator/grip
  strength (stress-shield margin runs 89–103% MVIC), a slightly lower slot (needn't cost velo),
  extension via stride/trunk-tilt, and external-only cues when re-grooving (reinvestment risk is
  highest in experts) (`04`, `05`, `06`, `10`, `11`).

---

## The 8 constructs worth building around (why these and not the folklore)

Ranked by evidence strength × trainability × how cheaply Neptune/Triton can measure them:

1. **Kinematic-sequence timing** (pelvis-peaks-before-trunk, both after foot plant; pelvis→trunk
   offset ~24–40 ms). Predicts ball speed *and* valgus load — the rare win-win (`01`, `03`, `09`).
2. **Lead-leg block** (knee angle at FC ~45° → extending to ≤20° at release; +1° extension ≈
   +0.47 m/s). Most modifiable lower-half lever; measurable on force plates Neptune will own
   (`02`, `09`).
3. **Release-point consistency** (horizontal SD; 1 cm ↓ ≈ 0.161 xFIP). Strongest release→performance
   link, computable from TrackMan today (`06`, `11`).
4. **Extension → perceived velocity** (+1.7 mph/ft off 6.3 ft). Free velo, zero added arm stress —
   the ideal sellable KPI (`06`).
5. **VAA × arm angle** (release-height-driven; flat-and-up = whiffs). A pitch-design lever, now
   public via Statcast arm angle (`04`, `06`).
6. **Cumulative valgus load / ACWR** (0.7–1.3 band). The one metric with the strongest *injury*
   evidence; buildable on `compete_pitches` + a wearable (`05`, `07`, `10`).
7. **Body-weight-normalized torque + maturity offset** (youth: HS carries *higher* normalized torque
   than pros). Separates skill from growth (`12`).
8. **Strength/ROM tolerance** (flexor-pronator strength, GIRD/TROM within 5°, scapular tilt). Screens
   the tissue that stress-shields the UCL — beats eyeballing arm slots (`05`, `10`).

Explicitly **de-prioritized** (folklore that underperforms as a target): inverted-W, "maximize
hip-shoulder separation," curveball-panic, "pronate to save your elbow," raw spin-rate training,
cross-pitcher arm-path shaming, and any ACWR readout treated as a forecast (`04`, `05`, `10`, `12`).

---

## NOW (0–3 months) — ship what needs no new hardware

### Triton

- **Release-point ellipse tile.** Compute per-session RPX/RPZ standard deviations + 95%-ellipse area
  per pitch type from release coords already ingested in `compete_pitches` / Statcast. Surface
  **horizontal SD (cm)** as the headline. Benchmark to published gradient: MLB four-seam ~30.6 cm
  RPX / ~15.2 cm RPZ / ~375 cm²; MiLB ~35.2 / ~17.5 / ~497. Flag pitchers whose *breaking-ball*
  horizontal SD balloons vs their fastball (tipping/slot tell). Candidate feature for
  `pitcher_season_command`. *Effort: low* (SQL agg + one `TileViz.tsx` tile). Source: `06`, `11`.
- **Perceived velocity as a native field.** `perceived_velo = release_speed × (60.5−1.417)/(60.5 −
  extension_ft − 1.417)`, or the simpler +1.7 mph/ft off 6.3 ft. Expose on `app/player/[id]` and the
  Compete pitch view. Evaluate replacing the raw `extZ*2.0` term in the Stuff+ Z-score with a
  perceived-velo framing that fuses velo+extension into the quantity hitters actually react to
  (test against outcomes before committing; log the query to `docs/Queries.md`, update
  `docs/VARIABLES.md` same commit). *Effort: low.* Source: `06`.
- **Fastball-plane report tile.** VAA/HAA already compute client-side in `fetchData`. Add Statcast
  **arm angle** (public 2024+, join on `pitches`), grade VAA on the 20–80 scale (80 = +1.4°,
  50 = 0°), and auto-classify each fastball as *ride-and-elevate / sink-run / in-between-vulnerable*.
  Flag location-fights-VAA (steep VAA thrown up, flat VAA thrown down) as a cheap usage win.
  *Effort: low-med.* Source: `04`, `06`.
- **Within-pitcher estimated-elbow-stress index.** A per-pitch-type "arm demand" column that weights
  fastball velocity heavily (velocity is the dominant torque driver; partial R²≈0.16) and is
  displayed against trunk-tilt/arm-slot proxies. **Label it "estimated stress," never "UCL load,"**
  and compute it **within-pitcher/longitudinal only** — the cross-pitcher arm-path comparison is
  statistically invalid (interpitcher R²≤0.03). *Effort: med.* Source: `05`, `10`, `04`.

### Neptune

- **Stand up the assessment→prescription→re-assessment loop as the product from day one**, with
  Compete/Triton as the persistence layer and a **6-week (±1–2) re-test cadence**. A report nobody
  trains off is the commodity-cage positioning to avoid; the premium is in laps 2 and 3. Source:
  `08`.
- **Intake battery v1 — near-zero tech, high signal:**
  - Single-leg-balance **pelvic-control screen** (dryland proxy; stride-leg pelvic deviation
    correlated r = −0.76 with pitching velocity). Source: `01`, `03`.
  - **Front-view 2D video at foot contact** — arm timing check (arm up, ~45–75° ER, ~90° abduction);
    a late arm is both a velo tax and an injury tax. Source: `04`.
  - **Stride as %-height, gross contralateral tilt, thoracic-rotation ROM** (restricted T-spine →
    lateral tilt → +elbow valgus). Source: `03`, `06`.
  - **GIRD / TROM** (goniometer, keep within ~5° of non-throwing side; >5° ≈ ~2× injury odds) and a
    **scapular dyskinesis** screen. Source: `08`, `10`, `04`.
- **Buy PULSE first — $245/unit.** Roster-wide per-throw valgus-load + ACWR (0.7–1.3). Cheapest,
  most-defensible ROI in the building; it's the injury-liability and athlete-retention layer. Store
  its output as a **workload index, never as validated N·m** (reads ~9–41 N·m / ~39% low vs lab).
  Source: `05`, `07`.
- **Buy ArmCare — ~$72/yr premium + ~$100 Activ5-class dynamometer.** 6-minute rotator-cuff /
  elbow-protector / grip test; weekly trend catches the flexor-pronator strength decline that
  precedes UCL trouble (used by 500+ facilities). Source: `05`, `10`.
- **Bootstrap norm tables from the OpenBiomechanics Project** (free; ~100 pitchers, youth→MLB) so
  athletes are benchmarked to their level from day one, before Neptune's own DB is deep. Source:
  `01`, `07`, `08`.

### Trevor

- **Reframe the personal goal to mph-per-torque + clean deceleration**, not peak velo. For a post-TJ
  arm in a demo/coaching role, throttling effort 2–3 mph is a legitimate within-pitcher torque dial
  with minimal downside. Source: `05`, `08`.
- **Wear PULSE, keep ACWR 0.7–1.3, ramp never spike.** Treat "stress" as a personal trend line, not
  an absolute gauge. Source: `05`, `07`, `10`.
- **Add flexor-pronator / grip strength work** — the stress-shield margin runs 89–103% MVIC, so
  small gains directly buy UCL protection. Source: `05`.
- **FC self-check on single-cam/IMU** (arm up, ~45–75° ER, ~90° abduction) — the highest-value
  cheap self-diagnostic for a returning arm. Source: `04`.

---

## NEXT (3–9 months) — the biomech data spine + force-plate tier

### Triton

- **`biomech_captures` schema, sibling to `compete_pitches`** — one row per capture session, per-throw
  child rows, keyed to the same athlete id (mirrors the Compete two-table pattern). Store per-segment
  peak angular velocities **and** their %-cycle timing (pelvis / trunk / elbow-ext / shoulder-IR),
  the four-bucket sequence classification, `hss_foot_contact` / `hss_peak`, `pelvis_trunk_timing_ms`,
  `trunk_flexion_release`, `trunk_lateral_tilt_mer`, lead-knee angle at FC and release. **Two
  namespaces — kinematics (coachable) vs kinetics/workload (monitorable) — never blended into one
  cross-system leaderboard.** Carry a **`capture_system` provenance column** (the same discipline as
  SP/RP and `league_averages`). Source: `01`, `03`, `07`, `08`.
- **Workload / ACWR dashboard** on the `compete_pitches` spine: daily throw load × per-pitch load
  estimate → 7-day and 28-day rolling sums → ACWR with a 0.7–1.3 green band and >1.3 amber flag.
  Frame ACWR honestly as a **communication/de-load-trigger heuristic**, not a validated predictor
  (mathematical-coupling critique). This is the single highest-value monitoring surface. Source:
  `05`, `07`, `10`.
- **`assessment_norms` reference table** — metric × level × percentile, the biomech analog of
  `league_averages`, populated via a `refresh`-style routine and bootstrapped from OpenBiomechanics
  until in-house N is sufficient. Source: `08`.
- **SequenceScore** — a level-normalized Z-score metric (peak pelvis velo, peak trunk velo,
  trunk/pelvis ratio, sequence-order boolean/cost, pelvis→trunk timing offset) built on the *same*
  architecture as Stuff+. A genuine facility-differentiating index. Source: `01`, `03`.

### Neptune

- **Buy tri-axial force plates — low-to-mid five figures** (Hawkin Dynamics = most affordable pro
  option, buy-or-lease; VALD ForceDecks = deeper ecosystem, used by 90%+ of MLB). Start with
  **CMJ/isometric** (non-fatiguing, weekly-repeatable): concentric impulse and peak power correlate
  r≈0.68–0.71 with fastball velo, braking force alone explained 36% of velo variance — among the best
  *off-mound* velo correlates in the literature. **Insist on tri-axial** — vertical-only plates miss
  the anterior-posterior braking shear that carries the velocity signal. Defer embedded mound-GRF
  (custom install) to Later. Source: `02`, `08`, `09`.
- **Add a markerless kinematics pipeline for intake + monthly re-test** — ProPlayAI (single phone,
  ~free-to-cheap) or Uplift (2-iPad, markets as "90% cheaper than a $50k lab"). Store outputs with
  the `capture_system` tag and **mark rotational-shoulder metrics as "directional, not absolute"**
  (single-camera shoulder-ER RMSE up to ~20.8°). Automated before/after reports double as Mayday
  content. Source: `03`, `07`, `08`.
- **Lower-half programming module** — assess → classify fault → prescribe → re-measure, anchored on
  four measurables: (1) lead-knee angle at FC (~45°) and extension at release (toward ≤20°),
  (2) braking-peak timing (must land in first ~third of FC→BR), (3) drive-leg impulse (not peak
  force), (4) HSS at FC (35–60°). **Gate aggressive block loading behind a strength/readiness screen**
  — in youth, forced knee extension adds +0.27 N·m/° elbow torque (protective in mature arms, costly
  in underprepared ones). Source: `02`, `09`.
- **Velocity-route taxonomy** as a programming compass: **green** routes (pelvis velo, sequence
  timing, stride length, leg drive, open pelvis at FC — load-neutral/reducing per unit velo),
  **yellow** (separation magnitude — fine if well-timed), **red** (contralateral tilt, late trunk
  catch-up — +11% elbow/shoulder force for ~3 mph). Attribute each athlete's velo to routes and steer
  toward green. A novel, torque-literature-grounded facility metric. Source: `03`, `02`.
- **External-cue-first cue library.** Every drill card ships with a task constraint + **≤1 external
  cue** + an explicit "no internal cue on the competitive mound" rule (external-focus advantage
  d≈0.48; reinvestment/choke risk). Change work lives in PlyoCare/constraint drills off the mound.
  Cheap, high-evidence differentiator vs a cage that yells "elbow up." Source: `11`.

### Trevor

- **Test a slightly lower arm slot** as a defensible arm-health lever — college data show 86.3 mph
  regardless of slot, and sidearm *reduced* elbow varus torque (6.0 vs 6.7 %BW·BH). Post-TJ, this is
  velo-neutral insurance, not a velo chase. Source: `06`, `04`.
- **Attack extension via stride length + forward trunk tilt** — at 6'5" height already floors your
  extension; the coachable margin is mechanical, and it's free perceived velo with no arm-stress
  cost. Source: `06`.
- **Monitor contralateral tilt, TROM symmetry, weekly ArmCare trend** — the cheap early-warning layer
  most pitchers skip; cap high-intent days rather than trusting blind volume. Source: `03`, `10`.

---

## LATER (9+ months) — fidelity upsell, youth spine, research edge

### Triton

- **Youth analytics layer:** body-weight-normalized elbow torque (a 14-y-o at 45 N·m may out-risk a
  pro at 86 N·m), a within-session **consistency score** (SD of foot-plant location, front-knee
  flexion, release point) as the primary youth KPI, and a per-athlete **Mirwald maturity-offset time
  series** so a mid-PHV velocity jump isn't miscredited to training. Source: `12`.
- **mph-per-normalized-torque "velo efficiency"** metric joining TrackMan velo to a mocap/markerless
  torque estimate — the honest efficiency scoreboard, sitting alongside Stuff+/command/deception as a
  health-flavored index. Source: `08`, `09`.
- **Practice-pitch context tagging** (target, pitch type, intent, count) so Triton can *measure*
  whether a re-grooved release point holds under interleaving and pressure vs blocked reps — turning
  the change-installation protocol into a falsifiable, sellable product. Source: `11`.

### Neptune

- **Theia3D fidelity bay (~$5–7k PC + 6–10 cameras + annual license)** as the "development-lab"
  upsell that justifies 3–10× commodity pricing — reserve marker-grade capture for edge cases needing
  distal-joint torque precision. **Defer marker lab (six figures + biomechanist) and KinaTrax (~$500k
  + $75k/yr) indefinitely** — the marginal precision doesn't change the training decision for 99% of
  athletes. Source: `07`, `08`.
- **Youth program tiering by maturity offset, not birth year:** a pre-PHV "Foundations" tier
  (movement quality, consistency, arm care, multi-sport encouragement — priced as skill development,
  *not* velo) and a post-PHV "Development" tier (full assessment → individualized velo + strength).
  **Weighted balls are post-PHV, high-supervision, instrumented-only** (Reinold: +~3.3% velo but 24%
  elbow-injury rate; log implement weight per throw + monitor shoulder-ER ROM drift). Automated
  **Pitch Smart** compliance alerts to parents/coaches (>100 innings/yr ≈ 3.5× injury odds;
  fatigue OR ~13). Source: `12`, `10`.
- **Optional embedded mound-GRF** (custom tri-axial install) once the assessment revenue model
  justifies the capital — enables the braking-timing and drive-leg-impulse KPIs to sit next to
  Stuff+/velocity in Compete. Source: `02`.
- **Differential-learning / constraints-led blocks** as *retention/transfer* tools (retention d≈0.61,
  but heterogeneous evidence) — program them as the middle of a change and **log pre/post release
  ellipses so Neptune generates its own effect sizes** rather than importing meta-analytic averages.
  Source: `11`.

### Service design & pricing (Neptune, applies across horizons)

- **Flagship package: "Extension + Fastball-Shape Redesign"** — highest-evidence, lowest-arm-risk,
  most demo-friendly for Mayday content; ideal for older/pro-offseason clients who've maxed raw velo.
  Source: `06`, `05`.
- **Pricing model:** Tread-style **$150–500 one-time assessment + a 12-month coaching commitment** —
  the ongoing loop, not the one-time capture, is what athletes pay for and what commands the 3–10×
  premium over a commodity cage. Source: `07`, `08`, `10`.
- **Marketed velo expectation = the distribution, not the max:** "~1–3.5 mph over a committed
  off-season, with meaningful individual variation; ~1 in 5 don't gain." Under-promising protects
  credibility and is itself a marketing edge in a field of inflated claims. Source: `09`.

### Trevor

- **Use your own arc as content.** TJ (2017) + late-career return is a credibility asset and a
  ready-made Mayday narrative for the maturity-offset + consistency-KPI + load-management method — the
  "long game vs radar-number chasing" story is on-brand and evidence-forward. Source: `12`, `10`.
- **When re-grooming anything, keep cues external and change work off the competitive mound** —
  reinvestment/choke risk is *highest* in experts with rich body awareness, and a change that only
  survives a low-arousal bullpen isn't installed. Source: `11`.

---

## Cross-cutting build discipline (non-negotiables)

- **Two namespaces, provenance-tagged.** Kinematics (coachable) and kinetics/workload (monitorable)
  never blend; every biomech row carries `capture_system`. Wearable/markerless torque is a *relative
  index*, never a benchmarked absolute N·m. Source: `05`, `07`.
- **Every mechanics-injury claim ships with an evidence grade.** Prospective 3D-mocap→injury evidence
  barely exists; almost everything is association. Being the source that says "association, not proven
  cause" out loud is the credibility play with sophisticated clients. Source: `10`.
- **Label causes-you-can-train vs outputs-you-can-only-observe.** Distal arm-speed metrics top every
  velo model but are un-cueable outputs; trainable levers (mass/power, block, sequencing) sit lower in
  raw correlations precisely because they're upstream. Source: `09`.
- **Norms are population centers, not targets** — chasing a "170° MER" or "85% stride" into a body can
  *create* stress; individualize. Trend 3+ throws per session and compare medians (single-session
  torque is noisy). Source: `08`.
- **Platform hygiene:** log ad-hoc queries to `docs/Queries.md`; update `docs/VARIABLES.md` in the
  same commit as any new metric/param; mutations via `run_mutation`; never push without approval.
