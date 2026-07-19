---
title: Hitting Development — Applied Playbook (Triton / Neptune / Trevor)
domain: applied
tags:
  - hitting
  - triton-platform
  - neptune-performance
  - bat-speed
  - swing-decisions
  - contact-quality
  - assessment-battery
  - program-design
last_updated: 2026-07-19
---

# Hitting Development — Applied Playbook

> Translates the 10-doc `hitting/` research corpus into a sequenced build/buy/train plan for
> **Triton** (the analytics platform), **Neptune Performance** (the development lab in buildout),
> and **Trevor's own training**. Sequenced **Now / Next / Later**. Every recommendation cites the
> domain doc(s) it draws on by filename (`01`–`10`) and carries a cost / expected-effect / time
> estimate where one exists.

## TL;DR

- **The organizing model for everything is the three-bucket constraint taxonomy — Output (bat
  speed), Contact (smash factor / squared-up), Decisions (swing/take value)** — set as a
  first-class label on every athlete and used to route programming by rule, not vibes (`08`, `10`).
  Bat speed explains wOBACON better than any EV aggregate; blast rate (r = 0.361 with wRC+) beats
  raw bat speed (r = 0.11); SEAGER-style decision grades alone correlate .41 with next-season ISO.
- **Triton's biggest wins need zero new hardware**: (1) ingest Statcast bat-tracking columns
  (2024+) into `pitches` and ship a hitter dashboard; (2) build a **Swing Decision model**
  (swing/take run value by location × count over the 7.4M-pitch table) — the hitter-side sibling
  of Stuff+; (3) a **"Swing+" z-score composite** mirroring the existing `100 + z*weights`
  architecture; (4) smash factor / squared-up SQL views on `compete_pitches` (`03`, `04`, `05`,
  `09`).
- **Neptune's marginal hitting-lab spend is startlingly small because TrackMan is already in
  hand**: ~$2–3.5K now (Blast team kit, over/under bat sets, med ball + grip dynamometer,
  occlusion subscription), ~$8–20K next (dual force plates, optionally HitTrax for the retail
  layer). Trajekt ($15–20K/month) and mocap are out of scope; a programmable machine + TrackMan
  decision-scoring captures most of the training value at ~1% of the cost (`03`, `05`, `08`, `10`).
- **The product is the loop**: 90–120 min intake battery → constraint label → named 6-week
  template (Bat Speed / Bat-to-Ball / Pre-Season / In-Season) → retest every 2–3 weeks (skill) and
  6 weeks (strength), auto-diffed reports out of Triton. Honest goal-setting: **+2 mph bat speed
  per offseason block is good, +4–5 exceptional, double-digit claims are marketing** (`02`, `08`,
  `10`).
- **Evidence-graded coaching rules Neptune should enforce and market**: no heavy donut warm-ups
  (acute null, kinematic disruption in U15s); no all-blocked "groove it" BP (random ordering beat
  blocked 56.7% vs 24.8%); constraints beat verbal cues (Gray 2018); stimulus-specific perception
  training (occlusion/VR) beats generic vision training (far-transfer null) (`02`, `06`, `07`).
- **For Trevor**: a filmed 6–12-week overload/underload block with a fixed Blast rig is the
  highest-certainty, most content-worthy personal experiment (~5–10% expected gain, "new to the
  training" profile gains fastest); his pitcher's-eye count knowledge inverts directly into hitter
  approach content; his arsenal filmed from the batter's eye seeds Neptune's in-house occlusion
  library (`02`, `03`, `05`).

---

## The measurement doctrine (read before building anything)

Four validity rules from the corpus that every Triton schema and Neptune protocol must encode
(`03`, `04`, `09`):

1. **Within-athlete, same-device trends only.** Sensors under-read speed 5–17% vs mocap (Blast ICC
   0.67, DK 0.81); Blast ≠ Statcast ≠ TrackMan scales. Store a `device`/`sensor_brand` column on
   every hitting table; never blend devices in one athlete trend line.
2. **Session averages, never single swings.** Angle metrics are the weak spot (mean ICC 0.58);
   require ≥10-swing averages, flag deltas < ~2 mph bat speed / < ~3° angle as within-noise.
3. **Protocol is part of the datum.** Tee max runs 5–10 mph above game EV; machine vs live changes
   the swing itself. Fix one intake protocol forever (same machine velo per age band, distance,
   ball, bat noted) and store the protocol config on the assessment row.
4. **Pair engine metrics with compounds.** Bat speed change vs wRC+ change is r² = 0.03; always
   report blasts/squared-up alongside speed before narrating improvement or decline.

---

## NOW (0–3 months)

### Triton platform

1. **Ingest Statcast bat-tracking fields into `pitches`** — `bat_speed`, `swing_length`,
   `squared_up`, `attack_angle`, `swing_path_tilt`, `attack_direction`, blast derivation
   (`squared_up%×100 + bat_speed ≥ 164`), mirroring Savant semantics including the
   competitive-swing filter. Free data, 2024+. Add league anchors to `league_averages` (72 mph bat
   speed, 7.3 ft swing length, ~10° attack angle, ~7% blast rate — raw metrics, so the `_plus`
   exclusion convention doesn't apply). Update `docs/VARIABLES.md` same commit. ~1–2 sessions of
   work (`04`, `09`).
2. **Ship the basic decision layer as hitter-page chips**: O-Swing/Z-Swing/Z-O by count bucket
   (non-2K vs 2K), first-pitch swing rate. Computable today from `plate_x/plate_z` + description;
   chase stabilizes in ~50–100 PA so it works for MiLB monitoring too (`05`).
3. **Build the Swing Decision model (the flagship)**: bin location × count over the 7.4M-pitch
   table, compute count-neutralized swing/take run values (Nestico's method — takes are gradeable
   at RMSE 0.045), add a called-strike-probability layer, score hitters on **hittable-takes%**
   (the SEAGER inversion: letting damage pitches go is the costliest error) and chase%. Same
   z-score/plus-scale philosophy and `run_query` aggregation pattern as Stuff+,
   `pitcher_season_command`, and `pitcher_season_deception` — this is the hitter-side sibling
   table (`hitter_season_decisions`). ~1–2 weeks of iterative work (`05`, `08`).
4. **Compete pipeline: smash factor + assessment schema.** Add a `compete_hitting_assessments`
   table (athlete + date + `protocol_version` + protocol config) and a
   `compete_swings` table anticipating Blast pairing: `session_id, ts, device, bat_speed,
   peak_hand_speed, attack_angle, rot_accel_g, on_plane_pct, ev, la, contact_x/y/z,
   squared_up_pct, is_blast_equiv`. Smash factor
   (`1 + (EV − bat_speed)/(pitch_speed + bat_speed)`) is a single SQL view where bat speed joins
   TrackMan EV by timestamp; it stabilizes in ~20 BIP — one assessment session gives a decision-
   grade read (`03`, `04`, `09`).

### Neptune Performance

5. **Buy the sub-$3.5K hitting floor kit** (TrackMan already covers ball flight):
   - Blast Motion sensors ×6–12 @ **$149.95** + Blast Connect team account (~$1–2K all-in). Keep
     one fixed "assessment rig" bat+sensor for longitudinal apples-to-apples (`03`).
   - Axe Bat Speed Trainers (±20% set) @ **$599**, or budget over/under sets **$100–300/lane** —
     Sergo/Nakata showed volume+intent drives most of the gain, so cheap sets are defensible (`02`).
   - Grip dynamometer (<$50), 4–8 lb med balls (radar already owned) — rotational med-ball throw
     velo is the best cheap output test (r = 0.65 with bat speed) (`02`, `08`).
   - GameSense-style occlusion subscription (tens of $/month) as intake test + homework (`05`, `06`).
6. **Write the intake battery as a 90–120 min single-visit protocol** (station table in `08` §2):
   anthropometrics + grip → 15-min mobility screen → rotational med-ball velo → vision *screen*
   (acuity referral triage, not a KPI) → tee/front-toss block (max EV, **top-8 EV**, bat speed,
   attack angle, RA) → standardized machine block (smash factor, EV stdev, contact depth) →
   decisions block (chase%, hittable-take%, occlusion score). Output = one-page report headlined
   by the **constraint label** (`output | contact | decisions`) + 2–3 dated numeric goals (`08`).
7. **Codify the four floor rules** (staff training + published coaching philosophy): no donuts or
   60-oz warm-up swings (especially U15); random/mixed pitch scripts as the default cage diet;
   constraint drills over verbal mechanics cues ("we build an environment where your bar arm
   can't survive"); machine-only timing work capped — tag every session's delivery context
   (live / machine+video / machine / tee) in `compete_pitch_sessions` metadata (`02`, `07`).
8. **Service design v1**: assessment as the premium front door + semi-private data-floor training
   blocks; **no rental-only tier** (caps ~40–60 members, low retention, brand-diluting).
   Anchor pricing off the dev-lab positioning (Driveline pro tier: $7,500 assessment / $15K
   offseason as the ceiling reference; Neptune prices to its market but sells the same loop, not
   lessons) (`10`).

### Trevor

9. **Run the on-camera over/under block**: 6–12 weeks, 3–4 days/week, 100–160 max-intent
   swings/week, loads within ±12–20% of game bat, fixed Blast rig, retest every 3 weeks. Expected
   6–10% gain for a "new to the training" athlete — a compelling, honest documented arc, and the
   walkthrough content for Neptune's assessment product (`02`, `03`, `07`).
10. **Quarterly personal micro-battery** (20 min): CMJ (once plates arrive), rotational med-ball
    velo, grip, sensor bat speed. The output bucket decays first post-career and responds fastest
    (`08`).
11. **Two evidence-graded content pieces now**: "the on-deck donut is slowing your first swing"
    (acute-null RCT, kinesthetic illusion) and "keep your eye on the ball is a myth" (release-point
    fixation + predictive saccade). High search volume, strong evidence, demonstrates the
    facility's ethos (`02`, `06`).

## NEXT (3–9 months)

### Triton platform

1. **"Swing+" composite** on the bat-tracking ingest: z-score model per season on bat_speed,
   squared-up rate, ideal-attack-angle rate (weights fit against wOBAcon), clamped like Stuff+.
   Two-axis presentation — **capacity** (speed/RA) vs **match** (attack angle & direction vs pitch
   plane) — mirroring the Stuff+ vs Command split; never collapse to one leaderboard number
   (Babson: bat speed went *negative* in-model once contact/decisions controlled) (`03`, `09`).
2. **Δbat-speed breakout tracker**: year-over-year bat-speed gainers as a first-class view (34
   MLB hitters gained ≥1 mph 2025→2026; the gainer list preceded HR surges). Slots next to the
   Stuff+ delta views; requires ~50+ competitive swings before flagging a change (`02`, `09`).
3. **Two-strike delta profile** per hitter (Δspeed, Δlength, Δwhiff, Δpower at 2K vs otherwise):
   Powers & Yurko showed the league-average adjustment is value-neutral, so individual outliers
   are the story — adjusters vs non-adjusters and whether adjusting helps *them* (`09`).
4. **Pitcher-vs-swing-plane matchup layer**: flat-VAA four-seamers vs steep-tilt hitters, etc. —
   extends existing Stuff+/deception models and doubles as broadcast/Reports Builder content.
   Also: "what to hunt vs this pitcher, by count" hitter cards from existing pitcher-tendency
   data (`04`, `05`, `09`).
5. **Assessment report automation** in Reports Builder: percentile-vs-level bars (reusing the
   pitching dashboard grammar), auto-diff of retest vs baseline, error bars honoring measurement
   noise. Target: coach spends 10 minutes annotating, not 2 hours assembling (`08`).
6. **Seed a facility `league_averages` hitting slice** from published tables (Blast bat speed by
   level; Eisenmann EV-by-age percentiles: age 14 = 64/70/76/82 at P25/50/75/90, ~+20 mph to age
   18), with population caveats printed on the card. Replace with Neptune-native distributions
   once n > ~50 per age band (`02`, `03`, `04`, `08`).

### Neptune Performance

7. **Dual force plates** (~$5–15K/pair; Hawkin purchasable, VALD lease-only): CMJ peak power
   (r = 0.30–0.52 with hitting output in 55 pro hitters), L/R asymmetry, IMTP. Completes the
   Output bucket; also serves the pitching side (lead-leg block is the same trainable skill —
   shared spend). In-swing GRF plates (Bertec swing station) stay phase-3 (`01`, `08`).
8. **Encode the four named program templates** (Bat Speed / Bat-to-Ball+Path / Pre-Season
   Approach / In-Season Maintain) with per-week swing counts, scheduled retests (skill 2–3 wks,
   strength 6 wks), and the periodized annual sequence: early-offseason speed+strength →
   late-offseason contact/path → pre-season decisions/live → in-season ≥2 high-intensity lifts/wk
   (the +4.4 mph velo case study erased by 1×/week in-season lifting is the cautionary tale).
   Individualization = which template + which drill variants; founder time stays leveraged (`10`).
9. **Constraint drill-card library**, databased: each card = target metric + constraint +
   adaptation rule (3 successes → tighten; 3 failures → loosen) + exit criterion. Barrier work
   for attack angle (the best-evidenced drill in the corpus — Gray 2018), depth ladders, scored
   field zones, offset/short-bat, plyo-ball smash-factor rounds. "Block to build, random to
   keep" as the session rule (`07`).
10. **Decision-training product**: machine-mixed scored rounds (+1 hunt-zone swing, +1 correct
    take, −2 chase, **−2 hittable take** — the half everyone forgets), count-state games on the
    non-2K/2K split, tracking-only rounds standing in on live bullpens. TrackMan already tags
    every cage pitch; add a swing/take flag and Triton's decision model scores every session —
    a Driveline-grade product with hardware in hand (`05`).
11. **VR station(s)**: Meta Quest + WIN Reality (~$30/month consumer tier + ~$300–500/headset).
    The evidence mandate: make it **adaptive** (Gray 2017: adaptive VR beat extra *real* BP on
    in-game OBP, d ≈ 1.8; 40% vs 5–15% five-year advancement) and pipe decision output into
    Compete to validate against real chase/Z-swing. Promise decision-metric change, never quote
    "+35 points of average" (`05`, `06`).
12. **Senaptec Strobe ×2–4 @ $299** as an adjunct *during* live BP/machine reps only — near
    transfer is real, far transfer unproven; market it honestly (`06`).

### Trevor

13. **Film his arsenal from the batter's eye** → seed the in-house occlusion library; doubles as
    Mayday content and the cheapest facility-specific recognition asset (`05`, `06`).
14. **Strobes during catch-play/command work** — same near-transfer timing logic, same honesty
    caveat; also personal familiarity before coaching with them (`06`).

## LATER (9+ months)

### Triton platform

1. **In-house occlusion web app**: film local/college pitchers, staircase the occlusion window on
   rolling accuracy, log to Supabase. Replicates the two best-evidenced perceptual mechanisms
   (occlusion + adaptive difficulty) at ~zero marginal cost — Soto's home turf, and a genuine
   differentiator vs every commodity facility (`06`, `07`).
2. **Re-derive the blast threshold for facility pitch-speed environments** (the 164 constant is
   calibrated to MLB pitch speeds; nobody has published youth/HS versions) — a publishable Soto
   project that turns Neptune data into brand authority (`09`).
3. **In-house effect-size studies**: with 2–3 offseason cohorts, regress bat-speed change on
   physical change (force plate, med-ball, LBM) and occlusion-score change on chase-rate change
   across the client base. That paired dataset is a moat nobody at the amateur level owns (`06`,
   `08`, `10`).
4. **OpenBiomechanics ingest** (98 hitters, free): reference distributions for segment
   velocities, contact depth, Blast bat speed — percentile-rank Neptune athletes against real
   elite mocap once a sequencing product exists (`01`).

### Neptune Performance

5. **HitTrax** (~$10–20K + subscription) *only if* a youth/retail engagement layer is added —
   spray charts, simulated leagues, gamified cages sell memberships; TrackMan remains the
   assessment truth source. Rapsodo hitting ($3.5K) only if TrackMan can't cover every cage (`04`).
6. **Sensor-based sequencing tier**: K-Vest or markerless capture for kinematic-sequence order,
   pelvis-torso separation, posture retention — the "last mile" that explains *how* to fix what
   cheaper layers detected. Pro-range norms (pelvis 490–760°/s → hands 1530–2230°/s, in order)
   ship as a dashboard waterfall tile flagging out-of-order peaks (`01`, `08`).
7. **In-swing force plates / machine+pitcher-video rig**: dual-plate swing station (rear-leg
   drive 1.6–1.8×BW elite, front-leg block timing ±15–35 ms) and a projected-video machine setup
   that restores partial pre-release cues — the honest budget answer to Trajekt (`01`, `07`).
8. **S2-style cognitive screen** for the college/pro tier — assessment/profiling instrument, not
   a training product (`05`, `06`).

### Trevor

9. **Annual re-run of the personal block** as the recurring content franchise ("year 2 of the
   bat-speed project") — diminishing-returns expectations set honestly: first cycle is the big
   one, then maintenance economics (`02`).

---

## Budget summary (Neptune hitting lab, incremental to TrackMan)

| Phase | Items | Cost |
|---|---|---|
| Now | Blast team kit, over/under bats, med ball + dynamometer, occlusion sub | ~$2–3.5K |
| Next | Dual force plates, VR station(s), strobes, DK youth sensors (optional) | ~$8–20K |
| Later | HitTrax (retail layer), K-Vest/markerless, in-swing plates | ~$15–40K |

Explicitly **not** buying: Trajekt Arc ($15–20K/**month**, 3-yr commitment), marker-based mocap
lab, assisted hip-rotation devices (debunked), heavy donuts (debunked as warm-up).

## Open items to confirm with Trevor

- **Target age bands** for Neptune (benchmark tables, machine velos, loading, and the youth
  LTAD-style modification all fork on youth vs HS vs college/pro) — flagged as an assumption in
  `context/triton-context.md`.
- Whether a youth/retail engagement tier (HitTrax + DK sensors) is in scope at all, or Neptune
  stays pure dev-lab.
- Trevor's appetite for the on-camera training blocks (bat-speed project cadence, occlusion
  filming days).
