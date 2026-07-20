---
title: Projection Systems and Aging Curves — From Marcel to Development Targets
domain: algorithm-design
tags:
  - projection-systems
  - aging-curves
  - regression-to-the-mean
  - delta-method
  - minor-league-translations
  - survivorship-bias
  - player-development
  - marcel
sources_reviewed: 24
last_updated: 2026-07-19
---

# Projection Systems and Aging Curves — From Marcel to Development Targets

## TL;DR

- **Three ingredients explain ~95% of any projection system**: weighted multi-year history (Marcel: 5/4/3), regression to the mean (Marcel: add ~1,200 PA of league-average performance), and an age adjustment (Marcel: ±0.3–0.6%/year around a peak of 29). Everything ZiPS/Steamer/PECOTA/BAT-X adds on top buys only marginal accuracy over this monkey-simple baseline. (proven)
- **Composites beat everything**: in FanGraphs' 2025 RMSE review, ZiPS was the best standalone hitter system and Steamer the best pitcher system, but a plain average of all four systems beat every individual one; FantasyPros' 2025 test crowned the Zeile consensus with ATC (itself a weighted composite) right behind. THE BAT/THE BAT X is consistently the best *original* system. (proven)
- **Playing time, not rate stats, is the dominant projection error source** — and Marcel's dumb PT formula (200 + 0.5·PA₁ + 0.1·PA₂) beat every sophisticated system in a 2024 review because the smart systems all systematically over-project playing time. (proven)
- **The delta method has a known survivorship-bias defect**: it discards >20% of player-seasons, shows peak at age 26 when controlling for career quality puts it at 27, and in truncation scenarios understates aging by ~40%. Fixes: Lichtman's +~20-OPS-point survivor correction, Judge's GAMs on all seasons, and Nguyen & Matthews' multiple-imputation framework. (proven)
- **The aging curve itself has changed**: post-2006, MLB hitters no longer improve after arrival — wRC+ is flat until decline begins ~age 26, versus the 1982–2005 pattern of improvement into a 27–30 peak. Prospects now arrive as near-finished products. (proven)
- **Velocity is the pitcher aging clock**: average fastball loses ~3.7–4 mph from age 21 to 38, ~1 mph is already gone by 26 — but pitchers who *maintain* velocity (±0.5 mph/yr) show almost no FIP aging (flat vs. +1.7 runs for the population). Aging for pitchers is substantially a velocity-retention problem, which is trainable. (promising)
- **Minor-league translations are real and roughly stable**: AAA performance survives promotion at ~80–90% of adjusted wOBA (PCL ~90%), Low-A at ~40–60%; raw MiLB wRC+ correlates with future MLB wRC+ at only r≈0.3, so level-and-age context does the heavy lifting. (proven)
- **The same math powers development targets**: Carleton stabilization points (K% at 60 PA, BB% at 120 PA, ISO at 160 AB; pitcher K% at 70 BF) tell you when a facility metric change is signal; delta-method curves on facility data tell you what "normal" year-over-year improvement is by age, so a training effect can be measured as performance *above the expected aging/development curve*. (promising)

## 1. The Marcel Core: Three Ingredients Every System Shares

Tom Tango built Marcel ("the Monkey") explicitly as "the most basic forecasting system you can have, that uses as little intelligence as possible" — the minimum bar any forecaster must clear. Its full spec fits on an index card, and it remains the single most instructive artifact in projection design because complex systems only beat it marginally (proven):

1. **Weighted history.** Hitters: last three seasons weighted 5/4/3, most recent heaviest. Pitchers: 3/2/1 (pitcher outcomes are noisier, so the past is discounted harder and regressed more). (proven)
2. **Regression to the mean.** Reliability r = PA / (PA + 1200), i.e., blend the player's weighted rate with league average as if you'd appended ~1,200 PA of a league-average player. A 600-PA/yr regular with three full seasons gets r ≈ 0.86; a 150-PA bench bat gets r ≈ 0.5 — half his projection is just "league average." Marcel applies one blanket constant; real systems fit per-stat regression amounts, because K% needs far less regression than BABIP. (proven)
3. **Age adjustment.** Peak at 29 in the original spec: multiply projected rates by 1 + 0.006 × (29 − age) for players under 29, and 1 + 0.003 × (29 − age) for players over 29 — improvement toward the peak is modeled as twice as fast as decline after it. (Note: this peak-29 assumption predates the modern flattened curve; see §5.) (proven, but the 29 peak is now dated)
4. **Playing time.** Projected PA = 200 + 0.5 × PA(last yr) + 0.1 × PA(two yrs ago). Deliberately conservative — and in FanGraphs' 2024 projection review this dumb formula *beat every major system* at projecting batter playing time, because ZiPS/Steamer/ATC/THE BAT all systematically over-project PT. (proven)

**Why regression dominates:** any observed stat = talent + luck, and extreme observed performances are disproportionately lucky. The amount of regression should equal the noise share of variance — which is why "1 − reliability = amount of regression toward the mean" is the core identity of the whole field (Steamer states it in exactly those terms). (proven)

**For Soto:** Marcel is the correct v1 for a Triton projection layer on the Retrosheet + Statcast spine. Ship weighted-3yr + per-stat regression + a modern age adjustment before touching anything fancier; it establishes the benchmark every later model must beat, exactly as Tango intended. Stuff+ inputs already live in `pitch_baselines`; a "Marcel + Stuff+" pitcher projection is the cheapest high-value increment (see §7).

## 2. The Major Systems: What Each Adds Beyond Marcel

**ZiPS (Dan Szymborski, 2002–04, FanGraphs since 2010).** Weighted average over four years for hitters (8/5/4/3), three for pitchers and very young/old players; then a comparable-player ensemble: Mahalanobis-distance matching against ~180,000 hitter and ~145,000 pitcher historical baselines, preferentially matched on age and position, to derive growth/decline trajectories per player *type* rather than one league-wide curve. First system to lean on Voros McCracken's DIPS for pitchers; adds park/league/quality-of-competition adjustments, internal expected-stat tools (zBABIP, zHR, zBB, zSO), fastball velocity data since 2013, basic injury handling, and Statcast features "as I've gotten a handle on its predictive value." Publishes percentile bands with the explicit philosophy that 10% of players are *supposed* to miss their 10th-percentile projection. ZiPS proper assumes full-time play; ZiPS DC prorates by RosterResource depth charts. (proven, methodology as self-described)

**Steamer (Jared Cross, Dash Davidson, Peter Rosenbloom, 2008).** Structurally Marcel-plus: weighted average regressed to league average, but with year-weights and regression amounts *fit empirically per statistic* rather than set uniformly — effectively a different mini-projection per component. Uses ~five years of data and pitch-tracking data for pitchers. In practice Steamer is the most consistently strong pitcher system (best 2025 pitcher wOBA-against RMSE; best rookie projections in 2025, with OOPSY second). (proven)

**PECOTA (Nate Silver, 2003; Baseball Prospectus).** The comparable-players archetype: each player is matched to his ~100 nearest historical comps (career trajectory + body/position profile), and the projection is the distribution of what those comps did next. Its distinctive outputs are the 10th–90th percentile forecast bands and comp-derived diagnostics: Breakout, Improvement, Collapse, and Attrition rates. Notably, BP's own testing found a stripped-down PECOTA performs about like Marcel, with the full model only slightly better — the comps buy narrative and distribution shape more than point-estimate accuracy. (proven)

**THE BAT / THE BAT X (Derek Carty).** THE BAT is a traditional-stats engine with rigorous regression, weighting, and aging; THE BAT X (hitters only) adds Statcast process metrics — Carty evaluated 150+ Statcast variables (launch/spray/EV distributions, barrels, subsets and deviations) and blends them with THE BAT in back-test-optimal proportions. His pitcher side runs a Statcast "stuff" model (THE BATcast) for fast in-season talent-change detection. THE BAT is consistently the best original (non-composite) system in FantasyPros' annual accuracy tests. (proven)

**OOPSY (Jordan Rosenblum, debuted FanGraphs 2025).** Standard skeleton (aging curves, MLEs, recency weights, regression, park/league) plus two modern inputs: bat speed for hitters and Stuff+ for pitchers. Debut-season RMSE on wOBA: second among standalones for hitters (behind ZiPS) and second for pitchers (behind Steamer) — a validation that Stuff+-class inputs carry real projection signal. (promising)

**Composites.** FanGraphs Depth Charts = 50/50 Steamer/ZiPS with curated playing time; ATC (Ariel Cohen) = accuracy-weighted blend of systems. Both composite classes routinely top accuracy tests: 2025 winner was the Zeile consensus, ATC close behind. Rosenblum's own conclusion from the 2025 review: "users of projection systems are very likely to be best served by simply averaging the forecasts." (proven)

**For Soto:** the ensemble lesson is directly actionable — if Triton ever ships projections, ship both a Marcel-line and a Stuff+-informed line and display the blend. The OOPSY result is the existence proof that Triton's in-house Stuff+ (100 + veloZ·4.5 + moveZ·3.5 + extZ·2.0) is a legitimate projection *feature*, not just a display stat.

## 3. Accuracy: What the Horse Races Actually Show

- **The spread between good systems is tiny.** 2025 hitter wOBA RMSEs "clustered closely together" across ZiPS/OOPSY/Steamer/THE BAT X; same on the pitcher side. System choice matters far less than users assume. (proven)
- **Rate-stat skill is largely solved; playing time is not.** Playing-time misses track age, injury history, and roster ambiguity; Steamer's PA projections are good for clear regulars and clear bench bats but poor in between, and a solid PA projection effectively requires 500+ PA in each of the two prior seasons. All major systems over-project PT relative to Marcel's conservative formula. (proven)
- **Rookies/low-data players are where systems differentiate.** Steamer led rookie accuracy in 2025 (OOPSY second) — the segment where MLEs, Stuff+/bat-speed priors, and comp-based approaches actually earn their complexity. (promising)
- **Percentile bands are the honest output.** PECOTA and ZiPS both frame the point projection as a distribution midpoint; a projection that "missed" by landing in the 80th percentile didn't fail. Evaluation should use RMSE/MAE over large samples plus calibration of the bands, never anecdotes. (proven)

**For Soto:** any Triton projection page should lead with a distribution (fan chart), not a point estimate — and evaluation tooling (RMSE vs. Marcel baseline, band calibration) should be built the same week as the model.

## 4. Aging Curves: The Delta Method and Its Survivorship Problem

**The delta method** (Tango-popularized, the sabermetric default): for every player with consecutive age-N and age-N+1 seasons, record the performance change, weight by playing time (commonly the harmonic mean of the two seasons' PA), average within each age pair, then chain the deltas into a cumulative curve. Non-parametric, intuitive, and the method behind most published curves. (proven)

**The defects** (Jonathan Judge, BP, June–July 2020):

- **Data waste:** requiring consecutive seasons discards >20% of player-seasons — final seasons, one-season careers, and the age extremes. (proven)
- **Survivorship/selection bias:** to appear in the age-N→N+1 pair you must have been good (or lucky) enough at N to keep a job. Lucky-good seasons remain in-sample and regress downward the next year; unlucky-bad players vanish before they can rebound. Net effect: the method exaggerates decline and drags the apparent peak earlier. Delta-method peak ≈ 26; controlling for career-average quality moves the typical peak to 27 (Bradbury's parametric quadratic models put it at 29, an overcorrection with its own assumptions). (proven)
- **Magnitude:** Judge's Monte Carlo work (50,000 resamples; 2,000 survivors + 500 dropouts, ages 31–35, ~80/20 survival) found bias is *negligible* when dropouts are a separate talent population (mixture distribution), but when survival is a performance threshold (truncated distribution), naive survivor-only estimation understates true aging by ~40%. Correcting with a truncated-normal fill-in restores accuracy. (proven, in simulation)

**The fixes:**

1. **Lichtman's survivor correction (2016):** assign dropped players a hypothetical next-season performance (what regression says they'd have done) and keep them in the sample; shifts curves upward by roughly 20 OPS points in the decline phase. Effective but post-hoc. (promising)
2. **Judge's GAMs (2020):** fit a generalized additive model across *all* player-seasons with player-level controls — no consecutive-pair requirement, uses 100% of the data, and matched or beat the delta method out-of-sample (MAE 0.089 vs. 0.089–0.096). (promising)
3. **Multiple imputation (Nguyen & Matthews, arXiv 2210.02383, 2022/2024):** treat missing seasons as missing data in a multilevel model and impute them; shows conventional curves systematically overestimate trajectories. The current methodological state of the art in the public literature. (promising)

**For Soto:** when building curves on Triton's Retrosheet/Statcast spine, run the delta method first (it's a weekend of SQL) but *always* pair it with a GAM on all seasons as the bias check; disagreements between the two localize exactly where selection is distorting the curve. For facility data (small N, heavy dropout — athletes leave programs non-randomly), survivorship bias is *worse* than in MLB data, so never publish a Neptune "development curve" from completers only. (plausible extension of proven MLB result)

## 5. The Modern Aging Curve: Flatter, Earlier, Component-by-Component

- **Hitters no longer improve in the majors.** Zimmerman's era comparison (delta method, harmonic-mean weights): 1982–2005 hitters improved into a 27–30 wRC+ peak; 2006–2013 (and since) hitters show *flat* wRC+ from arrival until decline begins ~age 25–26. Interpretation: better minor-league development and stricter promotion standards mean prospects arrive as finished products. Subsequent FanGraphs check-ins confirm peak ~26 with immediate power/BABIP decline patterns. (proven)
- **Component curves diverge** (grade: promising, from delta-method studies): BABIP declines essentially from career start; ISO holds up until ~30; BB% peaks late (~28–32); K% is best around 25; contact-management and discipline age gracefully while athleticism-driven components decay early.
- **Statcast aging** (L'Oiseau, THT 2019, delta method on 2015+ data): exit velocity peaks ~29 weighted (~27.5 unweighted) with a steeper post-peak decline than pre-peak rise; launch angle rises monotonically with age — an *adaptation*, older hitters trading contact for air. No survivor-bias correction applied, so true EV decline is likely steeper. (promising)
- **Pitchers: velocity is the clock.** Average fastball velocity peaks in the very early 20s, is down ~1 mph by 26, and falls ~3.7–4 mph total from 21 to 38. Relievers hold peak velocity longer (don't sit 1 mph below peak until ~32) but their strikeout rates are more tightly coupled to velocity than starters', who partially compensate with command/pitch mix. (proven)
- **Velocity maintainers barely age.** Zimmerman's cohort split: pitchers holding fastball velocity within ±0.5 mph year-over-year lost only ~0.3 mph total across ages 21–38 and kept FIP essentially flat, versus +1.7 FIP for the general population; their effective peak stretched from 25–30. Halladay held 90.3–92.7 mph from 2002 on with a 3.11 average FIP. Causality is partly selection (healthy, mechanically efficient pitchers both keep velo and keep performing), but the practical takeaway stands: for pitchers, aging ≈ velocity attrition, and velocity attrition is partially trainable. (promising)

**For Soto:** this maps straight onto Trevor's own late-career arc (post-2017 TJ, effective reliever through 2023 — the reliever velocity-retention curve is *his* curve) and onto Neptune's pro/college offseason pitch: the product is literally "flatten your velocity aging curve" — strength retention, mechanical efficiency (Stuff+ extension term), and workload management. Triton's `pitcher_season_command` data can test the compensation hypothesis: do aging starters' command metrics rise as velo falls?

## 6. Minor-League Translations (MLEs)

- **Origin and mechanics.** Bill James invented MLEs; Clay Davenport (BP) industrialized them — league-difficulty + park + run-environment adjustments that restate any minor-league line in a fixed MLB context (originally the 1992 AL). Difficulty factors are estimated from players who move between levels, preferring **mid-season promotions/demotions** to avoid conflating level difficulty with offseason development, then **chained** level-to-level to build a path from rookie ball to MLB. Davenport found translated MiLB stats have predictive value comparable to MLB stats of the same sample size. (proven)
- **Rough discount factors** (grade: promising; exact values vary by system and era): AAA→MLB ≈ 20% performance reduction (PCL hitters retain ~90% of adjusted wOBA — the PCL run environment inflates raw lines); AA is the classic "prospect proving ground" at a somewhat larger discount; Low-A→MLB ≈ 60% reduction. The Dynasty Guru's public calculator (chained conversions + K/BB/ISO-specific adjustments + one year of post-2004 aging) validates at ~12.4% mean absolute error on next-level wOBA — around industry standard.
- **Known failure modes:** skills interact — high MiLB walk rates don't translate without accompanying hit ability (pitchers challenge weak hitters in MLB; the Oakland A's famously got burned by naive translations); repeat-level performance overstates talent; park adjustment is mandatory at hitter-friendly stops. Raw MiLB wRC+ correlates with future MLB wRC+ at only r ≈ 0.3 — context (age relative to level, level difficulty) carries most of the signal. (proven)
- **Age-relative-to-level is a first-class variable.** BP draft research: draftees younger than 17y10m at draft produced ~25% *more* value than their slot average; draftees older than 18y7m produced ~33% *less*. A 130 wRC+ from a 20-year-old in AA and a 24-year-old in AA are different planets. (promising)

**For Soto:** Triton already holds `milb_pitches` (AAA, 2023+) alongside MLB Statcast — a natural lab for *pitch-level* translations (how much do AAA Stuff+/whiff rates discount on promotion?), which is a more modern and more identifiable question than outcome-line MLEs, since stuff metrics are nearly level-invariant while results are not. Remember the events-value normalization difference (Title Case vs. lowercase) when joining. This is a publishable differentiator: "Stuff+ survives promotion at ~X%, command at ~Y%."

## 7. Reliability, Stabilization, and When a Change Is Real

Russell Carleton's split-half reliability work (the numbers behind every system's regression constants) defines "stabilization" as the sample size where split-half correlation hits 0.7 (R² ≈ 0.49 — signal finally equals noise). Key thresholds (proven, with Carleton's own caveat that reliability accrues gradually and 0.7 is arbitrary):

| Stat | Hitters | Pitchers |
|---|---|---|
| K% | 60 PA | 70 BF |
| BB% | 120 PA | 170 BF |
| HR rate | 170 PA | 1,320 BF |
| ISO | 160 AB | — |
| OBP | 460 PA | 540 BF |
| SLG | 320 AB | — |
| BABIP | 820 BIP | 2,000 BIP |
| GB%/FB% | 80 BIP | — |

Two design consequences: (1) regression amounts must be per-stat — regress a pitcher's BABIP toward league average almost entirely, his K% only lightly; (2) stabilization ≠ prediction — reaching 60 PA doesn't lock in a K%; it means the observation is half signal. (proven)

**For Soto:** these are the numbers for Triton's small-sample UI honesty (grey out or band metrics below threshold in Compete session views) and for Neptune retest cadence: a bullpen-to-bullpen velo change of 0.5 mph on 15 pitches is noise; TrackMan-metric equivalents (velo stabilizes in tens of pitches, command/location metrics need hundreds) should be estimated from Triton's own `compete_pitches` split-half analysis — a genuinely novel facility deliverable. (plausible, needs in-house estimation)

## 8. Projection Thinking as a Player-Development Operating System

The projection stack — weighted history, regression, aging curve, translation, reliability — transposes directly into development-target methodology:

1. **Every athlete gets a Marcel.** Before setting a training goal, compute the athlete's *expected* next-period performance from weighted history + regression + the age/level development curve. The training effect you sell and measure is **performance above projection**, not raw improvement — otherwise you're billing for maturation. A 15-year-old gaining 4 mph in an offseason may be *at* his growth-curve projection; a 22-year-old gaining 2 mph is far above his. (plausible; direct transfer of proven methods)
2. **Age-band expected gains (velocity).** Public benchmarks: around peak height velocity (~12.5–14.5), 5–10 mph in an offseason can be pure growth; high-schoolers growing 4–5 in. / gaining 15–20 lb see 5–6 mph years; mature HS/college athletes squeeze out 1–2 mph; adults rarely see large gains without major mass/mechanics changes. Driveline's weighted-implement cohorts averaged +2.7 mph (2016) and +3.3 mph (2017). These are the raw material for Neptune's expected-gain curves — market honestly against them. (promising)
3. **Survivorship bias is a facility marketing trap.** "Our athletes averaged +4 mph" computed over program completers is exactly the delta method's defect (§4) — dropouts (injured, discouraged, plateaued) leave the sample. Report intent-to-treat gains, or at minimum disclose completion rates. (plausible; direct transfer)
4. **Translations = level benchmarks.** Neptune's assessment battery should place every athlete on a level-adjusted percentile (Triton's `league_averages` pattern: 50th-percentile benchmarks per season/level/role/metric, extended to facility populations by age band), so "you're 60th percentile for 16U velo, 30th for command" is the intake language and the delta over time is the product. (plausible)
5. **Percentile bands for goals.** Steal PECOTA's framing: give each athlete a 10th–90th percentile projected outcome for the program, with breakout/attrition framing. It sets honest expectations, converts a miss into "70th percentile outcome," and is defensible to data-literate parents/agents. (plausible)
6. **Playing-time analogue: availability.** The biggest error source in MLB projections is playing time (health); the biggest error source in development outcomes is training availability/compliance. Track it as a first-class variable — projected outcomes conditional on session attendance — because it will explain more variance than any programming choice. (plausible)

**For Soto:** the concrete build order — (a) split-half reliability on `compete_pitches` metrics → minimum-sample rules; (b) age-band delta-method development curves from accumulating facility data (with imputation for dropouts once N allows); (c) "athlete Marcel" projected next-assessment values with bands in the athlete dashboard; (d) for Triton proper, a Marcel-baseline MLB projection with a Stuff+-informed pitcher overlay, validated by RMSE against Steamer/ZiPS on held-out seasons.

## 9. Design Checklist for a Triton Projection Module

- **Baseline first:** Marcel implementation (5/4/3, per-stat regression constants fit from Triton's own split-half analysis, modern flat-peak age curve: no improvement bump after debut, decline onset ~26 for hitters, velocity-driven decline for pitchers). Beat it or don't ship. (proven pattern)
- **Aging:** fit curves with delta method + GAM cross-check on the Retrosheet spine (1914+ gives era-stratified curves; use post-2006 era for current projections given the documented regime change). (proven methods)
- **Pitchers:** project velocity first (it stabilizes fastest and drives the aging clock), then Stuff+ from projected velo/movement/extension, then outcomes from Stuff+ + command metrics — mirroring the OOPSY/BATcast finding that stuff models add rookie-and-in-season signal. (promising)
- **Playing time:** keep it separate, conservative (Marcel-style), and clearly labeled — never bake optimistic PT into rate displays. (proven)
- **Output:** percentile fan charts, comp lists (Mahalanobis on Stuff+/command/deception vectors — Triton uniquely has these), and a standing accuracy page (RMSE vs. Marcel, band calibration) updated annually. (plausible)

## Sources

1. Baseball-Reference — Marcel the Monkey Forecasting System. https://www.baseball-reference.com/about/marcels.shtml
2. Triples Alley — Marcel and Forecasting Systems (formulas walkthrough). https://triplesalley.wordpress.com/2010/12/22/marcel-and-forecasting-systems/
3. FanGraphs Library — The Projection Rundown (Marcel, ZiPS, PECOTA, CAIRO, Oliver, CHONE). https://library.fangraphs.com/the-projection-rundown-the-basics-on-marcels-zips-cairo-oliver-and-the-rest/
4. Beyond the Box Score — A Guide to the Projection Systems. https://www.beyondtheboxscore.com/2016/2/22/11079186/projections-marcel-pecota-zips-steamer-explained-guide-math-is-fun
5. Szymborski — The 2025 ZiPS Projections Are Imminent! (methodology deep-dive). https://blogs.fangraphs.com/the-2025-zips-projections-are-imminent/
6. Steamer Projections — About / Glossary. http://www.steamerprojections.com/index.php/about/glossary
7. Carty — Introducing THE BAT X (RotoGraphs). https://fantasy.fangraphs.com/introducing-the-bat-x/
8. Rosenblum — Reviewing OOPSY's Debut Season (2025 RMSE comparison). https://blogs.fangraphs.com/reviewing-oopsys-debut-season/
9. FanGraphs — All the 2026 Projections Are In! (system roster + Depth Charts/ATC). https://blogs.fangraphs.com/all-the-2026-projections-are-in/
10. Baseball Prospectus — PECOTA percentiles, comparables, diagnostics. https://www.baseballprospectus.com/news/article/23016/baseball-prospectus-news-10-year-projections-upside-percentiles-and-comparables/
11. MLB.com Glossary — PECOTA. https://www.mlb.com/glossary/projection-systems/player-empirical-comparison-and-optimization-test-algorithm
12. Judge — The Delta Method, Revisited (BP, 2020). https://www.baseballprospectus.com/news/article/59972/the-delta-method-revisited/
13. Judge — An Approach to Survivor Bias in Baseball (BP, 2020). https://www.baseballprospectus.com/news/article/59491/an-approach-to-survivor-bias-in-baseball/
14. Lichtman (MGL) — A New Method of Constructing More Accurate Aging Curves (2016). https://mglbaseball.wordpress.com/2016/12/21/a-new-method-of-constructing-more-accurate-aging-curves/
15. Nguyen & Matthews — Filling the Gaps: Multiple Imputation for Aging Curves (arXiv, 2022/2024). https://arxiv.org/abs/2210.02383
16. Zimmerman — Are Aging Curves Changing? / Hitters No Longer Peak (FanGraphs, 2013). https://blogs.fangraphs.com/hitters-no-longer-peak-only-decline/
17. Zimmerman — Pitcher Aging Curves: Maintaining Velocity (FanGraphs, 2012). https://blogs.fangraphs.com/pitcher-aging-curves-maintaining-velocity/
18. FanGraphs — Velocity Decline and Pitcher Attrition by Age. https://blogs.fangraphs.com/pitcher-attrition-and-velocity-decline-by-age/
19. L'Oiseau — Creating Aging Curves for Statcast Metrics (THT, 2019). https://tht.fangraphs.com/creating-aging-curves-for-statcast-metrics/
20. FanGraphs Library — League Equivalencies. https://library.fangraphs.com/principles/league-equivalencies/
21. The Dynasty Guru — MLB Equivalency Calculator (translation factors, 12.4% MAE). https://thedynastyguru.com/2019/04/02/introducing-the-dynasty-gurus-mlb-equivalency-calculator-for-translating-minor-league-statistics/
22. FanGraphs Library — Sample Size (Carleton stabilization points). https://library.fangraphs.com/principles/sample-size/
23. RotoGraphs — 2024 Projection Review: Batter Playing Time (Marcel PT wins). https://fantasy.fangraphs.com/2024-projection-review-batter-playing-time/
24. FantasyPros — Most Accurate Fantasy Baseball Projections (2025 Results). https://www.fantasypros.com/2026/02/most-accurate-fantasy-baseball-projections-2025-results/
25. Brennan — Quantifying Player Development in the Minor Leagues (MiLB wRC+ r≈0.3). https://patrickbrennan33.wordpress.com/2021/12/31/quantifying-player-development-in-the-minor-leagues/
26. Cronkite News / Driveline & TopVelocity — velocity gains by age and training cohorts. https://cronkitenews.azpbs.org/2026/03/24/pitch-velocity-increase-baseball/
