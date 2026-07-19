---
title: Deception & Tunneling — Release Consistency, Tunnel Math, Effective Velocity, and What It's All Actually Worth
domain: pitch-design
tags:
  - pitch-tunneling
  - deception
  - release-point
  - effective-velocity
  - perceived-velocity
  - approach-angle
  - pitch-sequencing
  - arm-angle
sources_reviewed: 22
last_updated: 2026-07-19
---

# Deception & Tunneling — Release Consistency, Tunnel Math, Effective Velocity, and What It's All Actually Worth

## TL;DR

- **The tunnel point is a time, not a distance**: hitters commit ~150–175 ms before contact (~23.8 ft from the plate for an average fastball; BP later moved the definition to 150 ms). League-average tunnel differential between consecutive pitches is ~10.0 in; league-average release differential is ~2.4 in; post-tunnel break differential is ~2.6–2.8 in — about one ball diameter.
- **Tunneling has a real but modest measurable payoff**: Roegele's PITCHf/x work found "in-band" tunneled sequences (thrown 15.1% of the time in 2014) raise swinging-strike rate by roughly +2.6 to +3.1 points by pitch type (range +0.3 to +8.2), while a 2024 study of 100 pitchers found sequence-level tunnel score correlated with run value at only r = 0.07. Best current read: an arsenal-interaction effect worth up to ~0.5–1.0 runs/100 on specific pairings, not a standalone skill that rescues bad stuff.
- **Release-point consistency is one of the best-evidenced deception traits**: a 2024 Frontiers study (344 MLB / 64 MiLB starters, 938k pitches) found MLB pitchers have significantly tighter release ellipses than MiLB (30.6 vs 35.2 cm horizontal 95%-CI width on four-seamers), and horizontal release variability alone explained R² = 0.345 of K/9. But "consistently inconsistent" release also works — Ohtani's slider releases ~4 in below his fastball and hitters can't exploit it because the variance is itself noisy.
- **Effective Velocity as Husband states it is largely debunked at the population level**: Driveline's 2.8M-pitch Statcast analysis (2015–18) found no batter performance peak at 90 EV mph, no HR clustering inside the ±6 EV mph window, seasonal EV-metric correlation with projected RA9 of R² = 0.028, and HitTrax-measured location adjustments of only +0.84 to −0.44 mph — not the ±5 mph the theory claims. The surviving kernel — perceived velocity and location-dependent contact depth are real — is worth keeping.
- **Extension is a small, proven edge**: MLB average extension is ~6.2–6.3 ft (~1.04× height); each extra foot ≈ +1.7 mph perceived velocity; above-average-extension fastballs run ~10.6% SwStr vs 9.4% below-average. Raw velocity still beats perceived velocity as a predictor once other traits are controlled.
- **"Unexpected movement given the arm slot" is the most robust non-tunnel deception trait**: release point only explains ~11% of horizontal and ~33% of vertical movement variance across MLB, and pitchers whose movement deviates most from slot expectation whiff more (6.38% vs 5.77% SwStr in Sarris's sample). This — not sequencing — is what most modern "deception" models actually measure.
- **Flat vertical approach angle is deception you can buy with geometry**: ±0.5° of height-adjusted VAA is one full standard deviation for a four-seamer; flat-VAA/low-slot fastballs (e.g., Hader at a 35° arm angle, 148 reliever-leading whiffs in 2024) miss bats even at pedestrian Stuff+.
- **Delivery chaos works in small doses**: Cortes's 2021 timing manipulations (70 of 1,000 pitches, 7%) produced only a 17% strike rate on the trick pitches themselves but a 36.5% K-rate in the 52 PAs where they appeared (league ~23%) — timing disruption pays at the plate-appearance level, not the pitch level.
- **For Soto's stack**: Triton's `deception_score`/`unique_score` should be a weighted blend of (1) horizontal release-point SD, (2) movement-vs-arm-angle residual, (3) pairwise tunnel/late-break geometry, and (4) VAA/HAA flatness — the four traits with actual empirical support — and Neptune should measure all four from the TrackMan Compete pipeline it already owns.

## 1. The Tunneling Framework: Definitions and the Math

Pitch tunneling is the idea that a pitcher wins when two different pitches share one trajectory ("tunnel") past the point where the hitter must commit, then diverge afterward. Baseball Prospectus formalized it in January 2017 (Long, Judge, Pavlidis) after two-plus years of trajectory reconstruction from PITCHf/x/Trackman with drag-corrected physics, on a sample of 162 pitchers with ≥1,000 consecutive-pitch pairs.

The core quantities, with league-average values from the original BP release (proven as *measurements*; their value is Section 3's question):

- **Tunnel point** — originally fixed at **23.8 ft from home plate**, derived from a ~175 ms swing movement time on an average fastball (~400 ms total flight for 90 mph). In 2018 BP moved it to **150 ms before the plate** — a time definition rather than a distance — after consulting perception researchers who showed the original point was ~25 ms too early, and re-projected everything into the batter's visual frame (adjusted for batter height/stance).
- **Release differential** — distance between release points of consecutive pitches. League average **2.4 in**; Jon Lester, the canonical tunneler, averaged **1.2 in**.
- **Tunnel differential** — separation of the two pitches at the tunnel point. League average **10.0 in** (Lester 9.8).
- **Break differential** — movement generated *after* the tunnel point, typically **2.6–2.8 in** — almost exactly one baseball diameter. This is the fundamental constraint: everything that happens after the decision point is only ~1 ball of divergence, which is why tunneling's ceiling is bounded.
- **Plate differential** — total separation at the plate. League average **18.7 in**.
- **Release:tunnel ratio** — release separation ÷ tunnel separation; lower = pitches look identical out of hand relative to how far apart they are at commit. League average **23.7%**; Lester led the sample at **13.6%**.
- **Break:tunnel ratio** — late break ÷ tunnel separation; higher = more of the total divergence happens after the hitter is locked in. League average **27.6%**.

The 2018 update replaced several of these with batter's-eye metrics: release distance, pre-tunnel maximum distance (peak *perceived* separation before commit), pre-tunnel max time, plate distance, flight-time differential, and plate:pre-max ratio. Notably, BP itself never published a strong outcome-prediction claim for these metrics — they are descriptive geometry, and BP framed value in terms of "cues," not run values (plausible as a value framework; proven as geometry).

**The perceptual timeline underneath the math** (proven, converging lab evidence): pitch recognition happens in the first 150–200 ms of flight (~first 10–20 ft), the go/no-go decision fires ~175 ms after release with the ball still ~40 ft away, motor initiation costs ~25 ms, and the swing itself needs ~150 ms. A PLOS ONE occlusion study (Higuchi et al.) found visual information from the final third of ball flight contributes essentially nothing to hitting accuracy — the required eye angular velocity near the plate exceeds physiological limits, so the last 150 ms is pure prediction. This is the single best-supported piece of the entire tunneling edifice: hitters genuinely cannot use late information, so late divergence is unhittable *if* the early flight was ambiguous.

**For Soto:** Triton can compute every BP metric from the `pitches` table today — release_pos_x/z, extension, velocity, and the full 9-parameter trajectory are all present. A pairwise "tunnel table" (consecutive-pitch differentials at a 150 ms-before-plate point, computed from vx0/vy0/vz0/ax/ay/az) is a weekend job against the 7.4M-row table and would put Triton ahead of every public site, since BP's tunnel leaderboards are effectively abandoned.

## 2. The Perception-Science Critique: One Tunnel Point Is Not Enough

Rob Gray (Perception & Action Podcast, ASU) mounts the sharpest scientific critique of the BP framework (promising — grounded in lab psychophysics, not yet tested against MLB outcomes):

- Hitters don't perceive feet and mph; they perceive **visual angles** — β (direction of motion in depth), φ (direction relative to body), and dθ/dt (image expansion rate, the time-to-contact signal). A true tunnel keeps *these signals* below discrimination threshold until commit, not the Cartesian separation at one slice.
- Discrimination thresholds are not fixed: ~0.1–0.2 Weber fraction in clean lab conditions, degrading to **0.5–0.8 for experienced batters in an actual stance** — meaning real-game tunnels are more forgiving than lab math implies.
- The fatal flaw of a single tunnel point: two pitches can be 2 in apart at 23.8 ft yet have **diverged visibly at 35 ft** and re-converged. Hitters integrate the whole early trajectory; a tunnel must hold *throughout* the approach, not at one snapshot. This is also the theoretical basis for integration-style metrics (e.g., FantraxHQ's TDR, which integrates separation over the full pre-commit flight rather than sampling one point).
- Training implication: single-hoop tunnel drills at one distance are insufficient — Gray recommends **two hoops of different sizes at different distances** so the pitcher constrains the entire pre-commit flight (plausible; no controlled trial).

**For Soto:** if Triton builds tunnel metrics, prefer an *integrated* pre-commit separation (sum/mean of perceived angular separation from release to the 150 ms point) over a single-point differential. It's the same trajectory math, marginally more compute, and answers the strongest published critique of the BP approach.

## 3. What Tunneling Is Actually Worth: The Evidence Ledger

This is where practitioners most need honesty. The public record splits into three tiers.

**Tier 1 — the positive foundational result.** Jon Roegele (THT, 2013–14 PITCHf/x) mapped consecutive-pitch separation at a 33-ft decision point against separation at the plate and found a consistent **"in-band" region** — small at commit, large at the plate — with elevated whiff rates: **+2.6 points SwStr on fastballs, +2.7 on sliders, +3.1 on curveballs**, full range **+0.3 to +8.2** depending on pitch type and band cell. Pitchers threw in-band sequences **15.1%** of the time (2014); 87.7% of in-band pairs were different pitch types; in-band frequency was strongly repeatable year to year (leaders: Dickey 24.4%, Iwakuma 21.2%, Cueto 20.6%). Key nuance: "the closer consecutive pitches are at the decision point, the less plate separation they need" — tightness at commit substitutes for raw break (promising; single analyst, two seasons, but clean methodology).

**Tier 2 — the null-ish results.** Zack Bryant (2024, 100 random MLB pitchers, all two-pitch sequences, Tunnel Score+ vs Savant run value) found **r = 0.07** — essentially nothing at the sequence-outcome level — and argued execution consistency is too low and repeated tunnel locations become predictable (promising as a caution; modest methodology). Dan Blewett's THT piece adds the practitioner's view: pitchers don't consciously tunnel; tunneling is a **byproduct of a repeatable delivery plus sensible pitch pairing**, and expected-outcome pitch selection remains the gold standard. Baseball Prospectus never demonstrated that its tunnel metrics predict pitcher-level outcomes, and the metrics quietly fell out of DRA-adjacent discourse. Driveline's pitch-modeling position (2021) is the industry consensus articulation: stuff models grade pitches in isolation, yet "certain pitchers — through deception, sequencing, tunneling — consistently exceed expectations year over year," i.e., tunneling lives in the *residual* of stuff models, and the residual is real but smaller than the stuff term.

**Tier 3 — the modern rehabilitation.** Maxwell Resnick (2024–25, XGBoost on 1.4M pitches since 2023, KDE-based release/plate similarity features, SHAP attribution) showed run-value models **with** arsenal-interaction features beat pitch-isolated models on RMSE/MAE/R², with concrete cases: Framber Valdez's curveball earns **1.1 runs/100 with tunnel context vs 0.2 predicted without**; Jordan Wicks's league-average-stuff changeup runs a **42.3% chase rate** when tunneled; Logan Webb's poor-stuff four-seamer posts a **27.5% whiff rate** vs 19.8% for a shape-similar fastball (Arrighetti) without the arsenal context (promising; strongest recent public evidence that arsenal interaction carries measurable run value).

**Synthesis (Soto's official position):** tunneling is *real but bounded* — worth roughly a few points of SwStr% on well-paired sequences and up to ~0.5–1 run/100 on the best-fitting secondary pitches, conditional on command; it does not rescue bad stuff, and sequence-level tunnel scores don't predict outcomes on their own (r ≈ 0.07). Design pitches to tunnel (shared release, late divergence — e.g., Tread's gyro-heavy "death ball" curveball, which trades total break for tunnelability); don't chase tunnel metrics as a primary objective over stuff and command.

**For Soto:** this bounds how much weight tunneling deserves in any Triton composite. If `deception_score` ever folds in a tunnel term, cap its weight well below stuff and command terms, and validate it the way Resnick did — as *incremental lift over a stuff-only model*, not as a standalone correlate.

## 4. Release-Point Consistency: The Best-Evidenced Piece

The cleanest peer-reviewed result in this whole domain is Wakamiya et al., *Frontiers in Sports and Active Living*, 2024: 344 MLB + 64 MiLB starters (2021–23), 300,884 MLB four-seamers + 517,530 MLB breaking balls (42.6k/77.4k MiLB), release variability measured as 95% confidence ellipses in the coronal and sagittal planes.

- MLB starters are significantly tighter than MiLB: horizontal (coronal-plane X) variability **30.60 cm vs 35.21 cm** on four-seamers, **35.39 vs 39.54 cm** on breaking balls (proven — level discrimination).
- **Horizontal release variability was the dominant performance predictor**: R² = **0.345 for K/9**, 0.207 for xFIP, 0.072 for HR/9. Vertical variability mattered much less (proven within study; observational, so "reduce variability → improve performance" is promising, not proven causally).
- A FanGraphs Community study using Statcast release SD reached the same qualitative conclusion: pitchers who vary release pitch-to-pitch show noisier per-pitch quality (higher within-pitcher Whiff+ variance) (promising).

**The important counter-pattern — "consistently inconsistent."** Prospects Live's tunneling analysis documents that Ohtani releases his slider on average **~4 inches below** his fastball release, yet hitters can't exploit it, because his release points *vary noisily within overlapping clouds* — there is no clean deterministic tell, and the ball flights overlap early anyway (plausible; observational). Sauberman's deception model (below) captures the same idea probabilistically: what matters is whether release point *reliably signals pitch type*, not whether it is identical. The Frontiers result and this pattern reconcile cleanly: *within-pitch-type* release scatter is bad (it's a command/execution problem — the Frontiers ellipses are per pitch type), while *between-pitch-type* release offsets are only bad if they're consistent enough to be a read.

Two more nuances from adjacent literature: a 2023 study of MLB release points by pitch type (PMC10164925) confirms systematic between-type offsets are nearly universal — breaking balls release slightly higher/more glove-side than fastballs for most pitchers — so the practical question is always whether the offset exceeds the pitcher's own noise floor (proven as description). And Baseball ActionID's motor-preference argument warns that forcing release-point conformity during pitch design can push pitchers out of their healthiest natural release window — a real injury/performance tradeoff to respect, though unquantified (plausible).

**For Soto:** three direct applications. (1) Triton: add per-pitcher, per-pitch-type release ellipse area and horizontal release SD to `pitcher_season_command` — the Frontiers study says horizontal SD is the single most K-predictive component, and it's a trivial aggregate over `release_pos_x/z`. (2) A "tell detector": flag pitchers whose between-type mean release offset exceeds ~2× their within-type SD — that's a scoutable read (and for Neptune athletes, a fixable one). (3) Neptune benchmark: the MLB-vs-MiLB gap (~4–5 cm of horizontal ellipse width) gives a level-calibrated target for the Compete TrackMan data; track release ellipse area session-over-session as a development KPI.

## 5. Effective Velocity: The Theory, the Debunking, and What Survives

**The theory (Perry Husband, developed from ~2001, Inside Edge data 2003–04, ~5M pitches).** Pitch location changes the *effective* speed of a pitch because contact points differ: up-and-in must be met further out front (plays faster, up to ~+5 mph EV), down-and-away can be hit deeper (plays slower, ~−5 mph). Hitters attend around a **~90 EV mph** peak zone (his data: .330 well-hit average there vs .285 overall BA) and can cover a **~6 EV mph** window while maintaining timing. His headline sequencing claim: **~50% of MLB home runs/hard-hit balls come on pitches within ±6 EV mph of the previous pitch**, vs ~10% on "EV-efficient" sequences (his 50/20/20/10 hard-contact distribution).

**The debunking (Driveline, Dan Aucoin, May 2019).** 2.8M Statcast pitches (2015–18), seven pre-registered hypotheses, regressions controlling for batter, pitcher, count, platoon, and pitch type; plus ~5,000 HitTrax batted balls to directly measure contact depth by location:

- Measured location-based velocity adjustments were **+0.84 to −0.44 mph** at zone extremes — an order of magnitude smaller than the theory's ±5 mph grid (proven).
- **No batter performance peak at 90 EV mph** (proven within sample).
- Pitches *outside* the ±6 EV window showed **better** batter results after count control — the raw within-window effect on exit velo/xwOBACON reversed sign once context was added (proven within sample).
- Season-level pitcher EV metrics vs Steamer-projected RA9: **R² = 0.0279** (proven).
- Conclusion: "the verifiable aspects of Effective Velocity are not supported by more rigorous statistical analysis at the MLB level" (the population-level sequencing claims: **debunked**).

**Husband's rebuttal (June 2019)** argues Driveline mis-computed EvMPH (misreading his "time units" as speed equivalents; every raw velocity needs its own location adjustment), ignored that the ±6 rule applies only to *tunneled, efficient* sequences, and skipped lab-validation of individual EV elements. Methodologically fair points about implementation fidelity, but he offered no counter-analysis on open data, and the burden hasn't been met (his core claims remain debunked at population level; the pitcher-specific "EV-efficient sequencing" claim is untested rather than tested-and-failed).

**What survives, and is worth teaching:**
- **Perceived velocity** (Statcast PV: velocity adjusted for release distance) is real geometry: ~**2.75 mph of perceived velocity per 6 in** of release distance toward the plate, and up-and-in locations can add up to ~5.5 mph of *effective timing demand* through contact-point geometry (proven as physics; the performance payoff is the modest one below).
- The *qualitative* insight — hard-in and soft-away pressure a hitter's single timing window from both ends — remains a sound sequencing heuristic even though the quantified EV bookkeeping fails (plausible).

**For Soto:** don't build EV mph into any Triton metric — Driveline's null is decisive at the aggregate level and the theory's numbers don't replicate. But an "attack-distribution" descriptor (share of pitches hard-in vs soft-away, velocity spread within PA) is a legitimate, theory-agnostic sequencing feature for the analyst chat and reports.

## 6. Deception Beyond Tunneling

### Extension and perceived velocity
MLB average extension is **~6.2–6.3 ft (~1.04× body height)**; every extra foot beyond average ≈ **+1.7 mph perceived velocity** (proven as measurement). Fastballs from at/above-average extension (≥6.1 ft) run **10.6% SwStr vs 9.4%** below average (promising — confounded with stuff). But RotoGraphs found that once other traits are controlled, **raw release speed remains a better predictor than perceived velocity** — extension is a garnish, not a foundation (promising). Training levers per RPP: lat/hip/shoulder mobility, efficient arm path, lead-leg block quality, anterior core strength — with the caution that lunging for extension can cost real velocity (plausible).

### Unexpected movement for the arm slot
Eno Sarris (FanGraphs, 2016) showed release point explains only **~11% of horizontal and ~33% of vertical movement variance** league-wide — so a pitcher whose ball does something the slot doesn't advertise is genuinely lying to the hitter's prior. Low-slot pitchers whose fastballs fade *less* than the slot predicts ran **6.38% SwStr vs 5.77%** sample average (promising). This is now the backbone of most public deception models: a 2025-era Fastball Deception Index built from Stuff+, height-adjusted VAA, and **arm-angle deviation** finds its leaderboard dominated by slot-movement mismatch rather than raw stuff (promising). Statcast's public arm-angle data (released 2024; 0° = sidearm, 90° = over-the-top) makes this computable for everyone. Sauberman's three-part model (TDS, 2020: Deception = 5.67×Unpredictability + 2.19×Indistinguishability + 6.88×Unexpectedness, regressed on CSW%) found **unexpectedness carried the largest weight**, the metric was year-over-year stable (a repeatable skill), and 7 of 2020's top-10 deceivers had below-average fastball velo — deception is disproportionately how soft-tossers and sidearmers (Tyler Rogers, Bradford, Ziegler, O'Day archetypes) survive (promising).

### Approach angles: flat VAA and weaponized HAA
Chamberlain's VAA primer (2022): height-adjusted VAA is tightly distributed — **±0.5° is a full SD for four-seamers** (±0.7–1.0° for breakers) — and flat-VAA four-seamers generate whiffs everywhere but especially up, with wider error margins; steep sinkers do the mirror-image down (proven as association). Low slots buy flat VAA: Hader's 35° arm angle flattens his fastball's approach and produced an MLB-reliever-leading **148 whiffs in 2024**. McGrattan on HAA (2021): horizontal approach angle synthesizes release-X, location, and run/sweep; extreme HAA (Loup's slider at 7.3°) creates platoon-specific weapons, and — the practical gem — **pitchers can change HAA by moving on the rubber without touching the pitch itself** (several MLB pitchers shift release >1 ft by batter handedness) (promising). Cross-fire/closed-stride deliveries are the mechanical route to the same geometry — they steepen HAA and can stabilize direction — but carry only coaching-level evidence, no outcome studies (plausible).

### Delivery chaos and timing disruption
Zach Hayes's manual charting of all 1,000 Néstor Cortes pitches (2021): **70 pitches (7%) used timing tricks** (hesitations, quick pitches, slot changes). The trick pitches themselves were bad — 50% balls, 8.6% SwStr, 17% strike rate — but the **52 plate appearances containing one produced a 36.5% K-rate** (league ~23%) and a .212 BABIP with 3 XBH. The disruption pays as an at-bat-level tax on the hitter's timing model, not as pitch-level stuff (promising; one pitcher, one season, but exhaustively charted). Consistent with the broader principle: hitters bat off a predictive internal clock (Section 1's occlusion evidence), so anything that corrupts the clock — varied tempo, holds, slot variation — degrades the prediction the last 150 ms depends on (plausible mechanism). Use sparingly: at 7% frequency it stayed novel; there's no evidence for chaos as a primary identity, and MLB has tightened rules around hesitation deliveries.

**For Soto:** Trevor lived a version of this — late-career reliever survival is disproportionately a deception game (the Sauberman finding that 7 of 10 top deceivers were below-average velo is the aging-pitcher playbook). For Neptune's older/rehabbing athletes, deception traits are the highest-leverage non-velocity development targets.

## 7. Building Triton's Deception Model v2

Triton already ships `pitcher_season_deception` (`deception_score`, `unique_score`, 2017+). The public evidence supports rebuilding it as four sub-scores, each independently validated above:

1. **Release integrity** — per-pitch-type horizontal release SD (inverted) + a between-type "tell" penalty when mean offsets exceed 2× within-type noise. Backed by Frontiers 2024 (R² = 0.345 vs K/9). Data: `release_pos_x/z`.
2. **Slot-movement residual** (the `unique_score` successor) — kNN or GAM expected pfx_x/pfx_z given arm angle + release height (Statcast arm angle available 2024+; approximate pre-2024 from release geometry), score = residual magnitude. Backed by Sarris 2016, Sauberman 2020, FDI 2025.
3. **Arsenal tunnel geometry** — pairwise integrated pre-commit separation (Gray-compliant: integrate over flight to the 150 ms point, batter's frame) and break:tunnel ratio for the pitcher's actual top pairings. Weight modestly per Section 3. Validate as incremental lift over Stuff+ (Resnick's design), not as a standalone correlate.
4. **Approach-angle edge** — height-adjusted VAA flatness for four-seamers (SD units), HAA extremity for breakers, plus extension percentile.

Validation target: CSW%/SwStr residual after controlling for Stuff+ — deception is definitionally the part of results stuff doesn't explain. For Neptune, the same four sub-scores compute from TrackMan Compete CSVs (release side/height, extension, spin-based movement, approach angles are all in the export), giving facility athletes an MLB-benchmarked deception card: release ellipse area (MLB starter benchmark ~30 cm horizontal 95% CI; MiLB ~35), extension vs 1.04× height, VAA vs the ±0.5° SD scale, and a tunnel readout for their top two pairings. Training tools: two-hoop constraint drills at different distances (Gray), pitch-design pairings that share release and delay divergence (gyro-heavy breakers off the fastball), and a 5–10% dose of tempo variation for older athletes — each graded honestly to the athlete (proven/promising/plausible as above), because that's the house style.

## Sources

1. Long, Judge & Pavlidis — "Introducing Pitch Tunnels," Baseball Prospectus (Jan 2017): https://www.baseballprospectus.com/news/article/31030/prospectus-feature-introducing-pitch-tunnels/
2. Baseball Prospectus — "Updating Pitch Tunnels" (2018): https://www.baseballprospectus.com/news/article/37436/prospectus-feature-updating-pitch-tunnels/
3. Jon Roegele — "The Effects of Pitch Sequencing," The Hardball Times: https://tht.fangraphs.com/the-effects-of-pitch-sequencing/
4. Dan Blewett — "Pitch Tunneling: Is It Real? And How Do Pitchers Actually Pitch?" THT (2017): https://tht.fangraphs.com/pitch-tunneling-is-it-real-and-how-do-pitchers-actually-pitch/
5. Zack Bryant — "Does Pitch Tunneling Actually Work?" TDA Baseball (2024): https://www.tdabaseball.com/post/does-pitch-tunnelling-actually-work
6. Maxwell Resnick — "The Science of Pitch Tunneling: Measuring Arsenal Interaction Effects," Medium: https://medium.com/@maxwellresnick/quantifying-pitch-tunneling-acc0cfcdff02
7. Rob Gray — "Pitch Tunneling & Perceptually Equivalent Pitches," Perception & Action Podcast: https://perceptionaction.com/pitchtunnels/
8. Higuchi et al. — "Contribution of Visual Information about Ball Trajectory to Baseball Hitting Accuracy," PLOS ONE: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0148498
9. Wakamiya et al. — "Relationship between ball release point variability and pitching performance in Major League Baseball," Frontiers in Sports and Active Living (2024): https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1447665/full
10. "Release points of different pitch types in MLB players," PMC (2023): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10164925/
11. FanGraphs Community — "Studying Release Point Standard Deviation From Center": https://community.fangraphs.com/studying-release-point-standard-deviation-from-center/
12. Dan Aucoin — "Calling the Right Pitch: Investigating Effective Velocity at the MLB Level," Driveline Baseball (2019): https://www.drivelinebaseball.com/2019/05/calling-right-pitch-investigating-effective-velocity-mlb-level/
13. Perry Husband — "Effective Velocity is Apparently Not 'Effective' — Driveline's 'Study' of EV" (2019): https://perryhusband.wordpress.com/2019/06/12/effective-velocity-is-apparently-not-effective-drivelines-study-of-ev/
14. Driveline Baseball — "Rethinking the True Run Value of a Pitch With a Pitch Model" (2021): https://www.drivelinebaseball.com/2021/09/rethinking-the-true-run-value-of-a-pitch-with-a-pitch-model/
15. Jake Sauberman — "Quantifying Pitcher Deception," Towards Data Science (2020): https://towardsdatascience.com/quantifying-pitcher-deception-7fb2288661c8/
16. Eno Sarris — "An Attempt to Quantify Pitcher Deception," FanGraphs (2016): https://blogs.fangraphs.com/an-attempt-to-quantify-pitcher-deception/
17. Alex Chamberlain — "A Visualized Primer on Vertical Approach Angle (VAA)," FanGraphs (2022): https://blogs.fangraphs.com/a-visualized-primer-on-vertical-approach-angle-vaa/
18. Owen McGrattan — "Thinking About Horizontal Approach Angle," FanGraphs (2021): https://blogs.fangraphs.com/thinking-about-horizontal-approach-angle/
19. Zach Hayes — "Does Messing With Timing Actually Work?" Pitcher List (2021): https://pitcherlist.com/does-messing-with-timing-actually-work/
20. RPP Baseball — "Release Extension… Why It's Important and How to Maximize It": https://rocklandpeakperformance.com/extension-at-release-why-its-important-and-how-to-maximize-it/
21. Prospects Live — "The Mystic Art of Pitch Tunneling": https://www.prospectslive.com/the-mystic-art-of-pitch-tunneling/
22. MLB.com — "The range of pitcher arm angles in the 2024 MLB postseason" (Statcast arm angle): https://www.mlb.com/news/the-range-of-pitcher-arm-angles-in-the-2024-mlb-postseason
