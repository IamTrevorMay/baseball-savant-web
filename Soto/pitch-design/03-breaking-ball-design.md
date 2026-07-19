---
title: Breaking Ball Design — Slider, Sweeper, Curveball, and the Shape Continuum
domain: pitch-design
tags:
  - breaking-ball
  - slider
  - sweeper
  - curveball
  - gyro-spin
  - seam-shifted-wake
  - spin-efficiency
  - pitch-design
sources_reviewed: 22
last_updated: 2026-07-19
---

# Breaking Ball Design — Slider, Sweeper, Curveball, and the Shape Continuum

## TL;DR

- **Breaking balls live on one velocity–break continuum, not in discrete boxes**: MLB cutters ~88 mph, gyro/traditional sliders ~85, sweepers ~82.6, curveballs ~75–80. As velocity drops across the spectrum, horizontal sweep and depth increase almost monotonically — the "velocity-sweep tradeoff" (proven, Driveline 2021 on full-season MLB Hawk-Eye data).
- **Gyro sliders and sweepers are different pitches, not variants**: gyro sliders run <10% spin efficiency, 0 to ±5" of movement in both planes, and are thrown 3–6 mph harder (some >90 mph); sweepers run high spin efficiency with ~14–17" of horizontal break at 82–83 mph. Elite gyro sliders post 40–55% whiff rates (Bieber 2022: .193 BA, 39.4% whiff; Eagan 2024: 55%) vs sweepers, which win on called strikes and weak contact (proven).
- **Sweepers carry the largest platoon split of any modern pitch**: RHP sweepers vs RHB were worth −0.94 runs/100 (vs −0.26 for traditional sliders) with a 20.3% popup rate, but starters threw 4,734 opposite-handed sweepers in 2023 for **−43.6 runs total below average**. Same-side usage exploded from 2.6% (2021) to ~10.7% (2025) while opposite-side usage stayed under half that (proven).
- **Sweeper movement is part Magnus, part seam-shifted wake**: seam orientation creates a non-spin aerodynamic force (Smith & Smith 2021; confirmed by 2025 CFD work on sweepers specifically), which is why some sweepers out-break their spin profile by several inches — SSW can contribute up to ~9" of movement in extreme cases, though league-wide slider/curveball SSW effects are small (promising).
- **Velocity–spin-efficiency tradeoffs are pitch-type and pitcher-specific**: for curveballs, +1 mph costs ~2.5% spin efficiency; sliders are roughly flat (a near 50/50 split across a 734-pitcher sample); cutters *gain* ~5.5% efficiency per +1 mph (proven at the league level; individual slopes vary and must be measured per athlete).
- **Curveball benchmarks**: MLB average curveball spin 2,430–2,550 rpm (elite >2,900 — Pressly, Buehler, Glasnow); 12-6 curves want ≥75% spin efficiency at a ~6:00 axis (MLB avg ~78%); sweeping curves want 65–75% efficiency at 8:00–9:00; total induced movement ≥25" is an advanced-thrower goal. Spin-mirroring the four-seam (axes ~180° apart) is a real deception edge — 4 of the top 5 curveballs by run value sat within 8° of perfect mirror (promising).
- **Slot and forearm bias should pick the breaking ball, not fashion**: supination-biased pitchers get multiple efficient glove-side breakers almost free (Cole: 89 mph slider + 83 mph curve, <5% changeup usage); pronation-biased pitchers should lean cutter/gyro or arm-side SSW shapes rather than force a sweeper (plausible→promising; strong practitioner consensus, thin peer-reviewed base).
- **Curveballs do not overload the elbow relative to fastballs**: curveballs produce *less* elbow varus torque than fastballs (31.6 ± 15.3 vs 34.8 ± 15.4 N·m in youth/adolescent data; Dun 2008 and Nissen 2009 agree directionally), and Fleisig's 10-year prospective study found curveballs before age 13 were not a significant injury risk factor. Youth pain-report odds ratios of 1.5–1.7 exist but don't map to actual injury (proven for torque; debunked for "curveballs blow out young elbows" as a torque claim — workload is the driver).

## 1. The Shape Taxonomy: One Continuum, Six Working Archetypes

Statcast's decision to split "sweeper" (2023) and "slurve" out of the slider bucket formalized what pitch designers already knew: breaking balls form a continuous velocity-shape spectrum, and naming conventions are just cluster labels on that continuum (proven). The working taxonomy, with MLB-typical values for a RHP (glove-side HB negative by Statcast convention; values below given as magnitudes):

| Archetype | Velo (mph) | IVB (in) | HB (in) | Spin eff. | Role |
|---|---|---|---|---|---|
| Cutter | ~88 (FB −3 to −5) | +2 to +10 | 1–4 glove | rises w/ velo | FB-adjacent bridge pitch |
| Gyro slider | 85–90 | −2 to +5 | 0–5 | <10% | Two-strike whiff pitch, tunnels off FB |
| Traditional slider | ~85.3 | ~+2 | ~5 (0.43 ft) | ~35% | Balanced two-plane |
| Sweeper | ~82.6 | ~+2 (0.19 ft) | 14–17 (1.17 ft) | 65–75%+ | Same-side weapon, steals strikes |
| Slurve / sweeping curve | 78–82 | −4 to −10 | 8–14 | 65–75%, axis 8:00–9:00 | Two-plane hybrid |
| Curveball (12-6) | ~75–80 | −10 to −16 | 0–6 | ≥75%, axis ~6:00 | Depth, mirror of 4-seam |
| "Deathball" | 84–86 | ~−7 | ~2 glove | mid | Hard depth-breaker, neutral platoon |

Key anchors from the data: the average sweeper breaks ~15" horizontally (MLB glossary) vs ~6" total for an average slider; Ben Clemens' 2022 RHP sample put sweepers at 82.6 mph / 1.17 ft HB vs traditional sliders at 85.3 mph / 0.43 ft HB (proven). The "deathball" archetype (Baseball Prospectus, Jan 2024; heavily developed by Tread Athletics) sits between slider and curve: Bryce Miller's 2024 version was 85 mph with −7" IVB and 2" glove-side, vs the average curve at ~80 mph / −10" and average slider at 86 mph / +2" — a hard-depth shape whose main selling point is *neutral-to-reverse platoon behavior*, playing to opposite-handed hitters where sweepers fail (promising).

**For Soto:** Triton's Stuff+ (velo/movement/extension Z-scores per `pitch_name` × year) inherits Statcast's labels. That's fine for MLB data, but for Compete/TrackMan facility data there is no classifier — Soto should implement a shape-space clusterer (velo delta from FB, IVB, HB, spin efficiency where available) and assign archetypes from the table above rather than trusting athlete-reported pitch names. Amateur "sliders" are frequently slurves or cement-mixer sweepers.

## 2. Gyro vs Side-Spin Sliders: Two Design Targets

The slider bucket hides two genuinely different pitches distinguished by gyro degree (the angle between spin axis and a plane perpendicular to flight):

- **Gyro slider**: spin efficiency <10%, gyro degrees near 90. Movement comes almost entirely from velocity, gravity, and release geometry, not Magnus (proven). Tread Athletics' design targets: 0" to +5" IVB (below −5" it becomes a curve) and 0–5" of sweep. Because it has near-zero Magnus movement, it holds the fastball tunnel longest — this is the mechanism behind its whiff dominance (promising).
- **Side-spin/topspin slider**: ~35% spin efficiency, 65–75 gyro degrees. Sidespin buys sweep; a topspin component buys depth (proven, Rapsodo benchmark data).

A subtle but important aerodynamic detail: for sub-100%-efficiency breakers, **gyro converts to transverse spin in flight** as the ball's trajectory bends downward relative to a fixed spin axis, and that conversion adds glove-side movement late (promising, Driveline). So a "pure gyro" slider out of hand still finishes with a few inches of late glove-side break — part of why it beats bats.

Release geometry matters as much as spin: gyro sliders from **higher slots achieve steeper approach angles to the bottom of the zone, driving more whiffs and less hard contact** (promising). League slider whiff rate is ~34% (highest of any pitch type), 40%+ in two-strike counts; elite examples: Shane Bieber's 2022 gyro slider (.193 BA, .237 wOBA, 39.4% whiff), and college arm Daniel Eagan's high-slot gyro slider (6.4 ft release height, 13th-steepest gyro-slider VAA tracked) at a 55% whiff rate in 2024. Most pitchers release the slider 1–3" below their fastball release (plausible, practitioner reports).

**For Soto:** Triton's deception model should credit gyro sliders for *tunnel hold time* (low movement ≠ low quality). A naive movement-Z Stuff+ underrates gyro sliders — consider a VAA-at-zone-bottom term and a release-consistency-vs-fastball term. For Neptune athletes, the gyro slider is the lowest-feel-cost first breaking ball for most supinators: the targets (±5" both planes) are forgiving and it doesn't require elite spin talent.

## 3. The Sweeper: Seam Effects, Usage Economics, and the Platoon Tax

### What makes it move

The sweeper's calling card is horizontal break that often *exceeds* its Magnus (spin-based) prediction. The mechanism is the **seam-shifted wake** (SSW): seams positioned in specific orientations trip the boundary layer asymmetrically, shifting the wake and generating force in a direction spin cannot explain — a phenomenon named and demonstrated by Andrew Smith and Barton Smith at Utah State (2019–2021, wind-tunnel + tracking data) (proven as an aerodynamic phenomenon). League-wide, Driveline found SSW's biggest league-average effects on sinkers (+3" run, ~4" depth) and changeups, with sliders/curveballs showing *small league-wide but large individual* deviations — up to ~9" in extreme cases (promising). A 2025 CFD study (Yin, Aoki, Watanabe, Kobayashi, *Proc IMechE Part P*) simulated sweeper aerodynamics directly, supporting seam-orientation contributions to sweeper side force (promising — simulation, small literature).

Practically: two pitchers with identical spin profiles can differ by 4–6" of sweep depending on seam orientation ("seam catch"). This is why sweeper development is grip-iteration-heavy — you're hunting a seam orientation, not just an axis (promising, strong practitioner consensus at Driveline/Tread).

Design targets for a true sweeper: high spin efficiency but *not* necessarily 100% — a modest gyro component holds the tunnel longer before the sweep asserts (plausible); typical elite shapes sit 82–84 mph with 14–20" HB and near-zero IVB. Ohtani's, Gray's, and Pfaadt's are canonical references.

### Usage economics

Sweeper share of all MLB pitches: 2.28% (2021, retro-classified) → 4.36% (2022) → 6.33% (2023, first official year) → 7.17% (2024) → ~7.5% (2025) (proven). It cannibalized the curveball (10.7% league usage 2019 → 8.1% 2024). Same-handed usage ballooned to ~10.7–10.9% of same-side pitches by 2025, while opposite-handed usage is less than half that — pitchers have priced in the platoon tax.

### The platoon tax, quantified

- Same-side (RHP vs RHB, 2022): sweepers −0.94 runs/100 pitches vs −0.26 for traditional sliders; BABIP .246 vs .277; popup rate 20.3% vs 13.1% (proven, Clemens/FanGraphs).
- Opposite-side: the contact advantage disappears entirely (.370 wOBA on contact, identical to ordinary sliders), and in 2023 MLB starters' 4,734 opposite-handed sweepers cost a cumulative **−43.6 runs** below average (proven).
- The exception proves the rule: Pablo López's 2023 sweeper to *lefties* was +8.6 runs above average in two-strike counts (next-best starter: +1.3) — achievable, but only with elite location discipline (down-and-in to the opposite side, chase-only usage).

**For Soto:** Triton should carry per-pitch platoon run values — a sweeper's aggregate Stuff+ hides a ±1 run/100 split. For any Neptune athlete adding a sweeper, prescribe it as a *same-side weapon* and pair it with a neutral-platoon secondary (gyro slider, deathball, or changeup) before green-lighting it as a primary breaker. For Trevor's own content/demos: his late-career slider was his money pitch; the sweeper-vs-gyro framing is a natural teaching video.

## 4. Curveball Design: Topspin Efficiency, Mirroring, and the Deathball

The curveball is the efficiency pitch: its value is Magnus-driven depth, so design maximizes transverse topspin and minimizes gyro (proven).

Benchmarks:
- **Spin rate**: MLB average curveball ~2,430–2,550 rpm (2,550 RHP / 2,470 LHP in one dataset); elite spinners (Pressly, Buehler, Glasnow) averaged >2,900 rpm (proven).
- **12-6 curve**: spin direction as close to 6:00 as the slot allows, spin efficiency ≥75% (MLB avg ~78%), gyro minimized (proven benchmark).
- **Sweeping curve/slurve**: 8:00–9:00 spin direction, 65–75% efficiency (MLB avg ~68%) (proven benchmark).
- **Movement goal**: ≥25" total induced movement (IVB + HB magnitude) is an advanced-thrower target; MLB-average curves sit around −10" IVB at ~80 mph (promising as a coaching target).
- **Velocity cost of efficiency**: each +1 mph on a curveball costs ~2.5% spin efficiency on average — you buy velocity with gyro (proven, league-level).

**Spin mirroring**: a four-seam with near-pure backspin and a curve with near-pure topspin sit ~180° apart on the spin-direction clock; hitters read early spin cues, so mirrored pairs present identical early flight with maximally divergent outcomes. FanGraphs' analysis (2020 season, sequences binned by 20° of axis differential) found the best swinging-strike/wOBA behavior near mirror, and 4 of the top 5 curveballs by run value were within 8° of a perfect 180° mirror (promising — correlational, but mechanistically sound and universally coached).

**The deathball** is the modern answer to "my curve is good but slow and my slider is platoon-vulnerable": ~84–86 mph, −5 to −8" IVB, minimal sweep. It keeps depth (bat-missing plane change) while shrinking the velocity gap to the fastball and staying platoon-neutral — the shape Tread has pushed hardest since 2023 and BP formalized in Jan 2024 (promising; early run-value evidence good, sample still smallish).

**For Soto:** curveball quality in Stuff+ should weight *depth vs expected-at-that-velocity*, not raw depth — a −10" curve at 84 is a far better pitch than −14" at 76 for most arsenals. Add a `mirror_delta_deg` feature (|FB axis − CB axis − 180°|) to the deception model; it's computable from Statcast spin axis and from TrackMan for Compete data.

## 5. Velocity–Break Tradeoffs: The Core Optimization Problem

Every breaking ball design session is a constrained optimization: velocity, movement, and spin efficiency trade against each other along pitcher-specific curves (proven framework, Driveline/Bornstein 2021, MLB Hawk-Eye data):

- **Curveballs**: efficiency falls ~2.5% per +1 mph. Consistent across pitchers — throwing a curve harder requires adding gyro.
- **Sliders**: no universal slope — a near 50/50 split of positive/negative velocity-efficiency relationships across a 734-pitcher sample. Slider optimization is *individual by default*.
- **Cutters**: efficiency *rises* ~5.5% per +1 mph (240-pitcher sample) — harder cutters become more fastball-like, which is the point.
- **Velocity-sweep tradeoff**: across the whole breaking-ball spectrum, each band of velocity loss buys horizontal sweep and depth (cutters ~88 → sliders ~82 → curves ~75 in the 2021 league data).

Driveline's **expected velocity differential model** (predicting velo loss from FB traits, spin components, arm angle) turns this into a diagnostic: Corbin Burnes' cutter came in 2.4 mph *harder* than expected (Stuff+ 172) while his curve was 3.9 mph *slower* than its expected −11.7 (Stuff+ 91); Trevor Rogers' slider was 4.9 mph slower than modeled — flags for "this pitch has free velocity available" or "this shape is over-paying for break" (promising as a method; the case studies are illustrative, not causal).

The Sergio Romo case shows tradeoffs can be *thrown on purpose*: one arm, two sliders — a ~100%-efficiency sweeping slider in the 70s and a back-spinning, lower-efficiency slider at 80 (1.16 xERA, 161 Stuff+ in 2021). Cristian Javier bought 2.8 mph of slider velocity for ~3" of sweep (2020→2021) and got a better pitch (promising).

**For Soto:** this is directly buildable — regress each Triton pitcher's breaking-ball velocity vs spin efficiency/movement within season to estimate their personal tradeoff slope, and surface "expected velo differential" as a dashboard metric. For Neptune, run the same regression on Compete TrackMan sessions: it tells you whether to cue an athlete "throw it harder, shape will hold" (Gilbert-type: maintained efficiency as velo rose) or "protect the shape."

## 6. Benchmarks by Level

MLB (Statcast/Rapsodo, 2021–2025):
- Slider: ~85 mph, ~2,400–2,500 rpm, 34% whiff league-wide (highest of any pitch), 40%+ with two strikes.
- Sweeper: 82–83 mph, ~15" HB average; elite 17–20".
- Curveball: 78–80 mph, 2,430–2,550 rpm, ~−10" IVB average; elite depth −14 to −18" or >2,900 rpm.
- Gyro slider elite whiff band: 40–55%.

Amateur (TrackMan/Rapsodo showcase data — sparser, treat as directional):
- HS fastball spin 1,800–2,200 rpm (2,300+ is strong) — breaking-ball spin scales with it.
- HS curveball: ~2,390 rpm is above average; an elite prep curve example: 2,716 rpm at 79% efficiency.
- HS/college slider example band: 78–82 mph at ~2,380 rpm, ~39% efficiency.
- College curves cluster 2,200–2,500 rpm; the MLB-average shapes above are legitimate "elite college" targets (plausible — no large public amateur norm tables exist; this is exactly the gap Neptune's own data can fill).

**For Soto:** Neptune should publish its own level-banded norms from `compete_pitches` once N is sufficient (per pitch archetype × age band: velo, spin, efficiency, IVB/HB percentiles). That table is a differentiating asset — public amateur benchmarks are thin, and Triton's `league_averages` pattern (50th-percentile per season/level/role/metric) extends naturally to facility data.

## 7. Matching Breaking Ball to Slot, Forearm Bias, and Fastball

Three matching rules dominate practitioner consensus:

**1. Arm slot sets the natural axis.** Statcast's 2024 arm-angle data (over-the-top ~60°, sidearm ~11°, submarine ~−64°) made this quantifiable: the slot largely determines achievable spin direction, so low slots produce sweep naturally (sidespin is "downhill" for them) and high slots produce 12-6 depth and steep gyro-slider VAA naturally (proven that slot constrains axis; promising that *fighting* it costs performance). The corollary finding: pitches that move *unexpectedly relative to their arm angle* outperform — hitters carry slot-conditioned priors (promising, e.g., Clase's cutter at +23 run value, .194 wOBA, "completely unexpected" for his slot).

**2. Forearm bias (supination vs pronation) sets the feel budget.** Supination-biased pitchers get efficient glove-side breakers nearly free and struggle with arm-side shapes (Cole: elite 89.1 mph slider + 82.9 mph curve, changeup <5% usage); pronation-biased pitchers get run/changeups free and should reach for cutters, gyro sliders, or SSW arm-side pitches instead of grinding on a sweeper (Scherzer: elite changeup/cutter, sub-par breaker shapes, <30% combined breaking usage). Forcing pitches against bias costs development time and, per practitioner claims, may add strain (plausible for strain — no controlled data; promising for the pitch-selection heuristic).

**3. The fastball defines what the breaker must do.**
- High-carry four-seam → mirror it: 12-6 curve at ~180° axis separation, and/or gyro slider that holds the tunnel (promising).
- Sinker-dominant → sweeper pairs beautifully (Gray, López, Bassitt pattern): the east-west arsenal attacks the same-side hitter's whole width; but demand a neutral-platoon third pitch.
- Two-breaker arsenals should maximize *separation*: sweeper (≥75th percentile HB) + gyro (≤25th percentile HB, harder, some >90 mph) function as two distinct pitches — the design failure mode is letting them blur into one average slider (promising; Holmes, Rodón, Joe Ryan, Bassitt examples). Gyro gets the whiffs off the FB tunnel; sweeper steals called strikes.

**For Soto:** encode this as an arsenal-fit rule set: (a) compute each pitcher's arm angle (Statcast provides it; approximate from release point for TrackMan), (b) compute breaking-ball axis deviation from slot-expected, (c) flag arsenals whose two breakers sit within ~1 velocity band and ~4" HB of each other ("blurred pair"), and (d) flag sweeper-primary pitchers with high opposite-hand exposure and no neutral secondary. All four are queryable from existing `pitches` columns today. For Trevor personally (mid-3/4 supinator profile), the gyro-slider + occasional sweeper template is the natural demo arsenal.

## 8. Health Note: Breaking Balls and the Elbow

The biomechanics are unambiguous on relative load: **curveballs generate less elbow varus torque than fastballs** — 31.6 ± 15.3 vs 34.8 ± 15.4 N·m in youth/adolescent lab data (Makhni et al., *Arthroscopy* 2018), with Dun et al. 2008 and Nissen et al. 2009 agreeing directionally, and Grantham's 2015 systematic review finding no shoulder/elbow force or torque differences disadvantaging the curve (proven). The torque predictors that matter: ball velocity, BMI, and *lower* arm slot; age and arm size are protective (proven, within the limits of lab kinetics).

Epidemiology is messier: Lyman 2002 (476 pitchers, 9–14y) found OR 1.52 for shoulder *pain* with curveballs; Yang 2014 (754 pitchers) OR 1.66 for arm *pain* but no association with actual injury; Fleisig's 10-year prospective cohort (481 pitchers) found curveballs before 13 were **not** a significant risk factor for serious injury — workload (pitch counts, months/year, catcher innings) dominates (proven for workload; the "curveballs hurt kids" claim, as a torque mechanism, is effectively debunked, while a pain-report signal persists and may reflect confounding — kids with curves are better, bigger, and pitch more).

Both ASMI and Pitch Smart acknowledge the research doesn't support restriction, yet still recommend delaying curveballs until ~13–14/puberty as a precaution (consensus recommendation, not evidence-driven).

**For Soto:** Neptune's youth policy should be workload-first (pitch counts, rest, no year-round throwing), with breaking-ball introduction gated on fastball mechanics quality rather than an age superstition — but keep the ASMI-aligned 13–14 default in written materials for defensibility. Quantity of *competitive* breakers, not their existence, is the lever.

## 9. Design Workflow Summary (Facility-Ready)

1. **Profile the pitcher**: FB shape + velo, arm angle, supination/pronation bias (assess via ease of cut vs run on ball flight, not questionnaires alone), current breaker metrics.
2. **Pick the archetype** from §1 using the §7 matching rules — slot → natural axis; bias → feel budget; fastball → separation need; role/platoon exposure → sweeper eligibility.
3. **Set numeric targets** (velo band, IVB/HB, efficiency, axis, mirror delta) from §§2–4 benchmarks; write them down before the session.
4. **Iterate grip/cue with immediate feedback** (TrackMan per-pitch), hunting seam orientation for sweepers and axis purity for curves; expect the athlete's personal velocity-efficiency slope (§5) to emerge in ~2–3 sessions of data.
5. **Validate against hitters**, not just metrics: whiff and called-strike behavior by handedness; a shape that grades well but blurs with an existing pitch (§7 rule 3) is a net negative.

## Sources

1. Driveline Baseball — Bornstein, "Optimizing Breaking Ball Shape Through Data-Driven Pitch Design, Part I" — https://drivelinebaseball.com/blogs/blog/optimizing-breaking-ball-shape-through-data-driven-pitch-design-part-one
2. Driveline Baseball — Bornstein, "Optimizing Breaking Ball Shape, Part II" (2021) — https://www.drivelinebaseball.com/2021/10/optimizing-breaking-ball-shape-through-data-driven-pitch-design-part-ii/
3. Driveline Baseball — "The Impact of Seam-Shifted Wakes on Pitch Quality" (2021) — https://www.drivelinebaseball.com/2021/03/the-impact-of-seam-shifted-wakes-on-pitch-quality/
4. Driveline Baseball — "An Introduction to Seam-Shifted Wakes and their Effect on Sinkers" (2020) — https://www.drivelinebaseball.com/2020/11/more-than-what-it-seams-an-introduction-to-seam-shifted-wakes-and-their-effect-on-sinkers/
5. FanGraphs — Clemens, "The Secret Benefit (And Cost) Of Sweeping Sliders" (Sep 2022) — https://blogs.fangraphs.com/the-secret-benefit-and-cost-of-sweeping-sliders/
6. FanGraphs — "Have Sonny Gray, Pablo López, and Brandon Pfaadt Cracked the Sweeper Code?" — https://blogs.fangraphs.com/have-sonny-gray-pablo-lopez-and-brandon-pfaadt-cracked-the-sweeper-code/
7. FanGraphs — "Let's Take a Peek at Some Early 2025 Pitch Usage Trends" — https://blogs.fangraphs.com/lets-take-a-peek-at-some-early-2025-pitch-usage-trends/
8. MLB.com Glossary — "Sweeper (ST)" — https://www.mlb.com/glossary/pitch-types/sweeper
9. MLB.com — "Explaining the sweeper, the latest pitching trend in MLB" — https://www.mlb.com/news/sweeper-slider-latest-pitching-trend-explained
10. Rapsodo — "Understanding Rapsodo Pitching Data: Spin Rate & Efficiency Profile (Curveball, Slider, Changeup)" — https://rapsodo.com/blogs/baseball/understanding-rapsodo-pitching-data-spin-rate-efficiency-profile-curveball-slider-changeup
11. Rapsodo — "Understanding Rapsodo Pitching Data: Break Profile (Curveball)" — https://rapsodo.com/blogs/baseball/understanding-rapsodo-pitching-data-break-profile-curveball
12. Smith & Smith, "Using baseball seams to alter a pitch direction: The seam shifted wake," *Proc IMechE Part P: J Sports Eng Tech* (2021) — https://journals.sagepub.com/doi/abs/10.1177/1754337120961609
13. Yin, Aoki, Watanabe, Kobayashi, "Aerodynamics study on sweeper," *Proc IMechE Part P* (2025) — https://journals.sagepub.com/doi/10.1177/17543371251395349
14. Baseball Prospectus — Menéndez, "What Is A Deathball and Who's Throwing It?" (Jan 2024) — https://www.baseballprospectus.com/news/article/87818/bullpen-session-deathball-what-is-it/
15. "Curveballs in Youth Pitchers: A Review of the Current Literature" (PMC, 2019) — https://pmc.ncbi.nlm.nih.gov/articles/PMC6874692/
16. Makhni et al., "Assessment of Elbow Torque… Fastball, Curveball, and Change-up," *Arthroscopy* (2018) — https://arthroscopyjournals.onlinelibrary.wiley.com/doi/10.1016/j.arthro.2017.09.045
17. "Predictors of Elbow Torque Among Youth and Adolescent Baseball Pitchers" (PubMed) — https://pubmed.ncbi.nlm.nih.gov/29746146/
18. FanGraphs — "Taking a Look at Spin Mirroring" + Part 2 — https://blogs.fangraphs.com/taking-a-look-at-spin-mirroring/ ; https://blogs.fangraphs.com/taking-a-look-at-spin-mirroring-part-2-misconceptions-and-practical-applications/
19. Midgette, "The Impact of Pronation and Supination Bias on Pitch Design" (Substack) — https://samuelmidgette.substack.com/p/the-impact-of-pronation-and-supination
20. Beilke, "The Combination of the Sweeper & Gyro Slider with Arsenal Coherence" (Medium) — https://medium.com/@aidanbeilke1/the-combination-of-the-sweeper-gyro-slider-with-arsenal-coherence-8d060cdccdff
21. TDA Baseball — "How Important is the New Statcast Arm Angle Data?" — https://www.tdabaseball.com/post/how-important-is-the-new-statcast-arm-angle-data
22. Tread Athletics — gyro slider design targets (public coaching content) — https://www.tiktok.com/@tread_athletics/video/7470561151475289390 ; PitchLogic — "Gyro Spin and Spin Efficiency" — https://pitchlogic.com/blogs/gyro-spin-and-spin-efficiency
