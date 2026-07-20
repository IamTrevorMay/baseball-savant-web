---
title: Expected Stats Models — xwOBA/xBA, the ERA Estimator Family, and Building Them for MLB and Facility Data
domain: algorithm-design
tags:
  - expected-stats
  - xwoba
  - xera
  - siera
  - fip
  - park-factors
  - knn-gbm
  - facility-analytics
sources_reviewed: 20
last_updated: 2026-07-19
---

# Expected Stats Models — xwOBA/xBA, the ERA Estimator Family, and Building Them for MLB and Facility Data

## TL;DR

- **MLB's official xwOBA is a hybrid kNN + GAM model, not a GBM**: liners/flies are scored by averaging ~400 nearest neighbors in (EV, LA) space; grounders, topped, and weakly hit balls run through a Generalized Additive Model that adds batter seasonal Sprint Speed (added 2019). Walks/K/HBP pass through at actual wOBA weights. (proven)
- **Spray angle is deliberately excluded** because it improves description but degrades prediction: Tango showed no systematic wOBA−xwOBA bias by pull tendency (2016–18), while Chamberlain found bin-level descriptive errors up to 188 points of xwOBAcon on specific spray/contact combos. Both are right — it's a descriptive-vs-predictive tradeoff. (proven)
- **The ERA-estimator hierarchy is stable**: for describing this-season ERA, FIP (R² 0.61) and xERA (0.58) win; for predicting next-season ERA (100+ IP pairs, 2015–19), SIERA (RMSE 0.871, R² 0.204) > xFIP (0.892) > xERA/FIP (~0.965) > ERA itself (1.113) — and plain K-BB% (R² 0.224) beats all of them. (proven)
- **Expected stats are far better for hitters than pitchers**: Judge (BP, 2023, team-switchers) — hitter xwOBA reliability 0.67 / predictiveness 0.55 vs wOBA's 0.48/0.48; but pitcher xwOBA/xERA reliability only 0.39, predictiveness 0.23, roughly tied with FIP and behind DRA/cFIP. "x" does not mean predictive. (proven)
- **xERA is just xwOBA on the ERA scale** — approximately (xwOBA − lgwOBA) × 13 + lgERA, recalibrated annually. It inherits every xwOBA limitation, including no park/defense/spray context. (proven)
- **Park effects on expected stats are real but subtle**: Coors' run factor is ~1.20 but its xwOBAcon factor is only ~+1% because EV/LA are measured pre-flight; a 10% drop in air density adds ~4% batted-ball distance, so the same EV/LA is worth more at altitude. A 32-feature XGBoost with environment + park cut RMSE 5.3% vs EV/LA-only xwOBA, with temperature the top non-contact feature. (promising)
- **Stabilization is fast**: contact-quality inputs stabilize in ~30–50 BIP (EV) and expected stats are usable at ~50–100 BBE, vs several hundred PA for wOBA — the entire reason expected stats exist for small samples. (promising)
- **A faithful xwOBA clone is a weekend project**: Nestico's kNN (k=11, EV+LA, 2020–22 train) hit R² 0.96 against official xwOBA; a summer-league (Yakkertech) replication with 5-fold CV also landed on k=11. The method ports directly to Triton's Statcast table and Neptune's TrackMan data. (proven)
- **The 2024–26 frontier is upstream of contact**: Hawk-Eye bat tracking (squared-up = actual EV ≥ 80% of potential EV from bat+pitch speed; blast = squared-up% × 100 + bat speed ≥ 164, ~7% of swings) lets you build expected stats on swing quality, not just batted-ball quality — the same shape as Driveline's Blast→HitTrax GAMs (RMSE 2.7 mph peak EV). (promising)

## 1. The Model Family Map

"Expected stats" covers two related but distinct families, and conflating them causes most misuse:

1. **Contact-quality models (xBA, xSLG, xwOBA, xwOBAcon, xERA)** — take measured batted-ball physics (EV, LA, sometimes sprint speed) and ask: *given how this ball was struck, what did it deserve?* They strip out defense, park, and sequencing. Descriptive at the event level; the aggregation is what carries modest predictive value.
2. **Rate-based ERA estimators (FIP, xFIP, SIERA, kwERA)** — ignore batted-ball physics entirely and reconstruct run prevention from outcome *rates* (K, BB, HR, GB/FB mix). They predate Statcast and, embarrassingly for the physics camp, remain competitive or better at prediction (proven — see §6).

A third, newer family sits upstream: **process models** (Stuff+/Location+, PitchingBot, bat-tracking-based swing models) that predict outcomes from pitch or swing characteristics before contact even happens. Judge's 2023 evaluation found Stuff+ reliability of 0.74 — higher than any outcome metric — but its ERA predictiveness collapsed from 0.41 (same team) to 0.14 for team-switchers, suggesting park/team contamination (promising, contested). FanGraphs' claim that Pitching+ out-predicts projection systems for relievers pre-season stands, but treat stuff metrics as *descriptions of pitch quality* first, ERA predictors second.

**For Soto:** Triton already owns a Stuff+ (Z-score: 100 + veloZ×4.5 + moveZ×3.5 + extZ×2.0), command, and deception stack. Expected stats are the missing *outcome-side* layer: they let the platform say "this pitcher's .390 wOBA-against was .320 deserved" — a fundamentally different claim than "his stuff is good."

## 2. How MLB's xwOBA Is Actually Built (kNN + GAM)

Per Sam Sharpe's MLB Technology Blog writeup (the canonical source), official xwOBA is:

- **Scope**: model only batted balls. Walks, HBP, and strikeouts pass through at actual values: xwOBA = (xwOBAcon_sum + wBB×(BB−IBB) + wHBP×HBP) / (AB + BB − IBB + SF + HBP). Never model the three true outcomes with the contact model. (proven)
- **kNN for well-struck balls**: each line drive/fly ball is compared to its ~**400 nearest neighbors** by Euclidean distance in (EV, LA) space over the Statcast era (2015+); outcome frequencies among neighbors become 1B/2B/3B/HR probabilities, dotted with the season's linear-weight run values. (proven)
- **GAM + Sprint Speed for grounders and weak contact**: since 2019, topped/weakly-hit balls use a Generalized Additive Model including batter **seasonal Sprint Speed**, because infield-out vs infield-hit on a 78 mph chopper is mostly a footspeed question. (proven)
- **Deliberate exclusions**: park, defense, weather, spray angle. Context neutrality is a design goal, not an oversight.
- **Performance context**: predicting per-event wOBAcon from league average gives RMSE ≈ 0.51–0.53; batted-ball-type averages get ≈ 0.45; the full model beats that. Per-event batted-ball outcomes are irreducibly noisy — the model's value is in aggregation. (proven)

**GBM alternatives.** Nothing sacred about kNN. Gradient boosting (XGBoost/LightGBM) on the same features matches or beats it, handles added features (spray, park, environment) gracefully, and outputs calibrated multiclass probabilities. The M-SABR 2025 rebuild used a 32-feature XGBoost; feature importance was dominated by LA (0.442 gain) and EV (0.346), with attack direction (0.089) a distant third — confirming EV/LA carry ~90% of the signal (promising). kNN's advantages: interpretability ("here are the 400 most similar balls"), zero hyperparameter religion, and trivially explainable to athletes. GBM's advantages: extensibility and better tail behavior where neighbors are sparse (115+ mph EV).

**xBA** is the same architecture with hit/out as the target instead of run value; **xSLG** uses total bases. Nestico's public replication: kNN, k=11, features EV+LA, trained 2020–22, tested on 2023 — 76% event accuracy, **R² 0.96 vs official xwOBA** (proven). A KCL summer-league build (Yakkertech data) independently converged on k=11 via 5-fold CV, scoring a lookup grid of LA ∈ [−75°, 75°] × EV ∈ [0, 110 mph].

**For Soto:** Build one `xwoba_grid` lookup table (1 mph × 1° cells, kNN- or GBM-smoothed, per season-band) in Supabase and score all 7.4M pitches with a join — no per-row model inference, no disk-pressure drama. Cache the grid like `pitch_baselines`. Client fallback mirrors `computeStuffRV()`.

## 3. The Spray Angle Debate

The best-documented modeling argument in public sabermetrics:

**Case for exclusion (Tango / MLB's position):**
- xwOBA describes *the player*, not *the play*. Fielders already position off known spray tendencies, so a batter can't durably monetize spray the way he monetizes EV/LA. The explicit analogy is FIP: target "the big two" (EV, LA) as FIP targets the big three. (plausible as philosophy)
- Empirically: plotting 2016–18 batter pull tendency vs (wOBA − xwOBA) shows **no systematic pattern** — spray exclusion doesn't bias the aggregate stat by hitter type. (proven)
- Tango's stronger claim: xwOBAcon *without* spray predicts next-season xwOBAcon better than the version *with* spray — spray at the event level is mostly noise that contaminates the EV/LA signal. (promising — widely cited, replicated informally)

**Case for inclusion (Chamberlain / Pitcher List / Sam Walsh):**
- Bin-level descriptive errors are large: on 2019 data (120K+ batted balls, 288 handedness×spray×type×quality bins), RH weak grounders to center were **overvalued by 188 points** of xwOBAcon; RH flare liners to left-center **undervalued by 91 points**; balls down the lines systematically beat their xwOBA. (proven)
- For a *specific hitter archetype* — extreme pullers with doubles-down-the-line profiles, or elite opposite-field liner hitters (Ramírez, Olson, McNeil showed the largest positive spray adjustments) — spray is a repeatable skill, and excluding it makes their xwOBA chronically wrong in the same direction. (promising)
- Walsh adds a second context critique: run-value-neutral treatment of outs ignores double plays (ΔRE ≈ **−0.85** runs vs **−0.28** for a single out; top GB pitchers induce 20–25 DPs/year), which systematically undervalues sinker/changeup pitchers in xwOBA-based pitcher evaluation. (promising)

**Resolution:** it's not a contradiction — spray improves *description*, hurts *prediction*. The right engineering answer is to ship **both**: a context-neutral predictive xwOBA and a "deserved outcome" descriptive variant with spray (and DP context for pitchers), clearly labeled.

**For Soto:** Triton should expose `xwoba` (EV/LA, Savant-faithful) and `xwoba_spray` (adds spray + batted-ball type) side by side; the *difference* between them is itself a scouting feature (pull-power profile, shift-beating skill). For pitcher pages, an xwOBA-against that credits GB double-play propensity fixes the known sinker-baller blind spot.

## 4. The ERA Estimator Family: FIP → xFIP → SIERA → xERA

- **FIP** = (13×HR + 3×(BB+HBP) − 2×K)/IP + constant (constant recentered to league ERA annually, ≈ 3.10–3.25). Pure DIPS theory: pitchers control K, BB, HR; BABIP is mostly noise. (proven, foundational)
- **xFIP**: replaces actual HR with FB × league HR/FB rate, on the theory that HR/FB is unstable pitcher-to-pitcher. Better predictor, worse descriptor; punishes true HR-suppressors. (proven, with known exceptions for extreme flyball/EV-suppressing pitchers)
- **SIERA** (Swartz & Seidman, Baseball Prospectus 2010): regression with nonlinear and interaction terms — SIERA = 6.145 − 16.986×(SO/PA) + 11.434×(BB/PA) − 1.858×((GB−FB−PU)/PA) + 7.653×(SO/PA)² ± 6.664×((GB−FB−PU)/PA)² + 10.130×(SO/PA)×((GB−FB−PU)/PA) − 5.195×(BB/PA)×((GB−FB−PU)/PA). The nonlinearities encode real effects: strikeouts help *more* the more you get (weaker contact tends to travel with high-K profiles); grounders help high-GB pitchers more. (proven)
- **xERA** (Baseball Savant): a 1:1 rescale of pitcher xwOBA-against — approximately (xwOBA − lgwOBA) × 13 + lgERA, recalibrated annually. It is *not* an independent model; it's xwOBA wearing an ERA costume. (proven)

**Head-to-head (Dan Richards, Pitcher List, 2015–19):**

| Purpose | Sample | Winner | Numbers |
|---|---|---|---|
| Describe same-season ERA | 686 seasons, 100+ IP | FIP | FIP R² 0.61, xERA 0.58, xFIP/SIERA 0.38 |
| Predict next-season ERA | 354 back-to-back 100+ IP pairs | SIERA | SIERA RMSE 0.871 / R² 0.204; xFIP 0.892/0.192; xERA 0.965/0.138; FIP 0.968/0.138; ERA 1.113/0.079 |
| Predict next-season ERA, simplest | same | **K-BB%** | R² 0.224 — beats every estimator |

Judge's 2023 BP re-evaluation (weighted Spearman, team-switchers) broadly agrees and adds reliability: DRA 0.53/predictiveness 0.26, cFIP 0.51/0.25, kwERA 0.48/0.19, SIERA 0.46/0.18, xFIP 0.44/0.19, xwOBA/xERA 0.39/0.23, FIP 0.34/0.19, ERA 0.13/0.10. Two humbling facts: (a) raw ERA is nearly useless for prediction; (b) no public estimator clears ~0.25 correlation on next-season run prevention — pitching is genuinely volatile. (proven)

**For Soto:** Ship FIP (cheap, from `pitches` events), SIERA (needs GB/FB/PU classification — Triton has `bb_type`), and xERA (free once xwOBA-against exists). Label them by use: FIP/xERA = "did he deserve his ERA?"; SIERA/K-BB% = "what should we expect next?" Don't build a new estimator hoping to beat SIERA with the same inputs — the marginal information is in stuff/command models Triton already has; blending Stuff+ with SIERA-class estimators is where public work (Sarris) shows genuine gains.

## 5. Park and Environment Adjustments

Expected stats are *deliberately* park-blind, which creates a specific, quantifiable distortion:

- EV and LA are measured at contact — **before** the park acts on the ball. Coors runs a ~1.20 run factor and ~1.25 HR factor, yet its **xwOBAcon park factor is only ~+1%** — the model thinks a 98 mph/28° ball is the same ball everywhere. Rockies hitters chronically out-hit their xwOBA at home; visitors to pitcher parks under-hit theirs. (proven)
- Physics: every **10% decrease in air density → ~4% more batted-ball distance** (altitude, temperature, humidity, pressure all fold into density). Denver's 5,280 ft is the extreme; a 60°F April night vs a 95°F July afternoon is the everyday version. (proven — Nathan-lineage physics)
- Modern park factors: Statcast-era factors simulate batted-ball flight per stadium; M-SABR's 2025 rebuild simulated every 2024 batted ball across all 30 parks under park-typical environments, yielding Coors 1.120, Fenway 1.046, Target Field 1.044, GABP 1.042, Chase 1.038 at the top and Wrigley 0.953, Globe Life 0.957, T-Mobile 0.960 at the bottom. Their 32-feature XGBoost xwOBA (ball flight + positioning + environment + park) beat EV/LA-only xwOBA by **5.29% RMSE, 3.3% MAE, 5.82% variance explained** — real but modest, because LA (0.442 gain) + EV (0.346) still dominate. (promising)

Design rule: **adjust the comparison, not the measurement.** Keep xwOBA context-neutral; apply park factors when translating xwOBA to projected results in a specific home park, and when evaluating a player whose home park systematically bends his actuals (Rockies hitters, Coors pitchers being the canonical cases).

**For Soto:** Triton's `league_averages` benchmarks should stay park-neutral; add a small `park_factors` table (season × venue × factor type) for the translation layer on player pages ("his .360 xwOBA plays like .375 in his home park"). For Neptune, the same physics matters at facility scale: a TrackMan cage session in a 55°F warehouse vs 90°F summer air shifts carry — normalize facility batted-ball distance to a reference environment or, better, lean on EV/LA (environment-invariant at contact) and never on raw carry distance for athlete evaluation.

## 6. Reliability: What Expected Stats Actually Buy You

The honest ledger, by population:

**Hitters — expected stats clearly win.** Judge (2021–22, team-switchers): xwOBA reliability **0.67**, predictiveness vs next-season OPS **0.55**; wOBA 0.48/0.48; OPS 0.49/0.49. The gap is outside the margin of error and has *widened* with Hawk-Eye-era data quality. (proven)

**Pitchers — expected stats are ~a wash with FIP.** Judge's earlier Siren Song study (2015–17, 2,226 pitcher-seasons, 1,060 back-to-back pairs, 100K bootstraps): same-year descriptive correlation to wOBA-against — xwOBA .83, FIP .81, DRA .74. But predicting *next-season* wOBA: xwOBA .35, FIP .36, DRA .36, raw wOBA .32. Reliability: DRA .51 > xBA .46 > xwOBA .44 > FIP .40 > wOBA .32. Conclusion: for pitchers, EV/LA adds almost nothing over K/BB/HR — batters, not pitchers, own most contact-quality variance. (proven)

**In-season splits (Chamberlain, 2015–17):** first-half xwOBA → second-half wOBA r ≈ .41 (hitters, 200+ PA halves), .35 (pitchers) — modest, but consistently better than first-half wOBA. The wOBA−xwOBA *gap* alone has near-zero second-half signal; "he's due for regression" requires looking at *why* the gap exists (speed, spray profile, park), not just that it exists. (proven)

**Stabilization:** EV stabilizes ~30–50 BIP; expected stats become usable ~50–100 BBE; wOBA needs several hundred PA. This is the core small-sample value proposition. (promising — practitioner consensus, exact cutoffs vary by study)

Three standing caveats: (1) the "x" implies prediction it doesn't deliver — Judge's objection is fair; treat xwOBA as *deserved past*, feed projections separately. (2) Fast players persistently out-hit xwOBA on grounders (partially fixed by the 2019 Sprint Speed term) and extreme spray profiles persistently deviate (§3). (3) Expected stats trained on MLB outcomes embed MLB defense/parks — they don't transfer to other levels without recalibration (§8).

**For Soto:** For Trevor's own analysis habits and Triton's UI copy: hitter cards can lead with xwOBA confidently; pitcher cards should lead with K-BB%, SIERA, and Stuff+, with xERA as the "deserved" companion stat, never the projection.

## 7. The 2024–2026 Frontier: Expected Stats Upstream of Contact

Hawk-Eye (12 cameras/park; five at 300 fps since 2023) enabled public bat tracking from 2024:

- **Bat speed / swing length**: league-average swing ~7.3 ft of bat-head travel; shorter-than-average swings whiff 19% vs 30% for longer swings. (proven)
- **Squared-up rate**: contact converting ≥ **80%** of potential EV (a function of bat speed + pitch speed) counts as squared up — separates "swings hard" from "finds the barrel." (proven)
- **Blasts**: squared-up% × 100 + bat speed ≥ **164**; ~**7%** of MLB swings qualify; blast rate is emerging as the best single bat-tracking predictor of production. (promising)
- **Minors**: Statcast covers all of Triple-A since 2023 (PCL/Charlotte 2022), with expected stats queryable on Savant's minors search — meaning xwOBA-style evaluation now extends to Triton's `milb_pitches` universe. (proven)

The template for swing-based expected stats already exists at facility scale: Driveline's 2020 Swing Profile paired ~**25,000** Blast Motion swings with HitTrax outcomes (from a 450K-swing database), fit cross-validated **GAMs** predicting peak EV (**RMSE 2.7 mph**) and LA at peak EV (**RMSE 4.0°**) from bat speed, attack angle, early connection, and rotational acceleration, validated on 405K Blast / 160K HitTrax unpaired samples (64.5%/61.5% of monthly predictions within ±1 SD), with a **50-swing minimum** before trusting numbers — then mapped deficits to weighted drill recommendations against Affiliate/Indy/College/HS benchmarks. That last step — model → benchmark → drill — is the entire facility product in one sentence. (promising)

## 8. Build Spec 1: Expected Stats for Triton (MLB/MiLB scale)

Concrete, shippable-in-increments plan:

1. **xwOBAcon grid** (phase 1): kNN (k≈400 MLB-style for smoothness, or GBM) over `pitches` (launch_speed, launch_angle) → per-cell {out, 1B, 2B, 3B, HR} probabilities → dot with per-season linear weights. Materialize as a season-banded lookup table (Hawk-Eye era 2020+ separate from 2015–19 radar era — tracking systems differ enough to matter). Score rows by join via `run_mutation` in batches with VACUUM between (same discipline as the Stuff+ backfill; expect the same ~99% coverage 2019+ and gaps earlier where EV/LA are null — fall back to batted-ball-type averages, exactly the KCL workaround).
2. **xBA/xSLG/xERA** (phase 1.5): same grid, different targets; xERA = (xwOBA_against − lgwOBA) × 13 + lgERA per season. Add SIERA from event rates.
3. **Sprint-speed adjustment** (phase 2): only for LA below ~10° and weak contact; MLB sprint speed is public via Savant. Skip for MiLB if unavailable — document the bias (fast prospects will out-hit xBA on grounders).
4. **Spray-aware descriptive variant** (phase 2): add spray angle + bb_type features; publish `xwoba_spray` and the delta as a profile feature. Recalibrate MiLB separately — remember `milb_pitches` Title Case events normalization.
5. **Park translation layer** (phase 3): season × venue factors; UI-level translation only.
6. **VARIABLES.md** in the same commit as every metric key; queries logged to Queries.md. (house rules)

Validation targets: R² ≥ 0.95 vs official Savant xwOBA on 2023–25 MLB (Nestico achieved 0.96 with k=11); year-over-year reliability ≥ 0.6 for hitters at 300+ BBE.

## 9. Build Spec 2: Expected Stats for Neptune (facility/TrackMan scale)

Facility data breaks MLB assumptions in four ways, each with a known fix:

- **No outcomes in a cage.** There is no "single" off a machine BP session. Fix: score every batted ball against the **MLB (or level-appropriate) xwOBA grid** — "this session's contact was worth .412 xwOBAcon at the AAA level." The grid is the product: it converts EV/LA capture into a deserved-production number without needing fielders. For live at-bats/games (Compete sessions with TrackMan), actual outcomes exist and the KCL/Yakkertech playbook applies directly: kNN with k≈11 via 5-fold CV, grid over LA −75°..75° × EV 0..110+ mph, average-by-outcome-type fallback for untracked balls.
- **Small samples.** Enforce minimums in the UI: ~50 batted balls before showing an athlete xwOBAcon trend (mirrors Driveline's 50-swing floor and the 50–100 BBE stabilization consensus); show confidence shading below it.
- **Wrong reference population.** An MLB-trained grid mis-prices a 15u ball (an 88 mph/20° ball is a HS gap double, an MLB out). Fix: per-level grids — HS/college TrackMan outcome data or published level benchmarks — matching the facility's age bands once confirmed. This is the same "per level" normalization Triton already does in `league_averages`.
- **Environment drift.** Indoor winter vs outdoor summer changes carry ~4% per 10% air-density swing. Evaluate athletes on EV/LA (contact-invariant), not carry distance; if distance is displayed, normalize to a reference environment.

Product spine: intake assessment → xwOBAcon vs level benchmark → deficiency diagnosis (EV problem vs LA-distribution problem vs squared-up problem, once bat sensors land) → programming → session-over-session xwOBAcon trend in the Compete browser. This is exactly the assessment→programming→monitoring loop the development-lab positioning demands, and every piece runs on `compete_pitches` columns that already exist.

**For Soto (Trevor personally):** his own bullpen/live data flows through the same pipeline — xwOBAcon-against per session is the cleanest single "how hittable was I today" number, more robust in 30-pitch samples than results, and pairs naturally with his Stuff+ per-pitch scores.

## 10. Design Judgments (Opinionated Summary)

1. **kNN for the athlete-facing grid, GBM for research variants.** Explainability wins at the facility; extensibility wins in the lab. (plausible — engineering judgment on proven components)
2. **Two xwOBAs, clearly labeled**: context-neutral (predictive-ish) and spray/context-aware (descriptive). The delta is a feature, not an error. (promising)
3. **Never model BB/K/HBP with the contact model.** Pass-through, always. (proven — Savant architecture)
4. **For pitchers, expected stats are a fairness audit, not a crystal ball.** Lead with K-BB%/SIERA/Stuff+; xERA explains, doesn't project. (proven)
5. **Recalibrate per level and per tracking era.** MLB 2015–19 radar vs 2020+ Hawk-Eye, AAA vs MLB, HS vs college — separate grids, one interface. (promising)
6. **The next moat is swing-based expected stats** — Blast/bat-speed → expected EV/LA → expected production, Driveline-style, is buildable at Neptune scale with ~25K paired swings and GAMs. (promising)

## Sources

1. Sam Sharpe, "An Introduction to Expected Weighted On-Base Average (xwOBA)," MLB Technology Blog — https://technology.mlblogs.com/an-introduction-to-expected-weighted-on-base-average-xwoba-29d6070ba52b
2. MLB Glossary, "Expected Weighted On-base Average (xwOBA)" — https://www.mlb.com/glossary/statcast/expected-woba
3. MLB Glossary, "Expected ERA (xERA)" — https://www.mlb.com/glossary/statcast/expected-era
4. Tom Tango, "Of Spray Angles, FIP and xwOBA (Part 2)" — https://tangotiger.com/index.php/site/comments/of-spray-angles-fip-and-xwoba-part-2
5. Alex Chamberlain, "Quantifying the Benefit of Spray Angle to xwOBA," RotoGraphs/FanGraphs — https://fantasy.fangraphs.com/quantifying-the-benefit-of-spray-angle-to-xwoba/
6. Alex Chamberlain, "The In-Season Predictiveness of xwOBA," RotoGraphs/FanGraphs — https://fantasy.fangraphs.com/the-in-season-predictiveness-of-xwoba/
7. Jonathan Judge, "The Siren Song of Statcast's 'Expected' Metrics (For Pitchers)," Baseball Prospectus — https://www.baseballprospectus.com/news/article/40026/prospectus-feature-siren-song-statcasts-expected-metrics/
8. Jonathan Judge, "An Updated Evaluation of Hitting and Pitching (Including Stuff) Metrics," Baseball Prospectus (2023) — https://www.baseballprospectus.com/news/article/82426/prospectus-feature-an-updated-evaluation-of-hitting-and-pitching-including-stuff-metrics/
9. Dan Richards, "The Relative Value of FIP, xFIP, SIERA, and xERA Pt. II," Pitcher List — https://pitcherlist.com/the-relative-value-of-fip-xfip-siera-and-xera-pt-ii/
10. Matt Swartz & Eric Seidman, "Introducing SIERA: Parts 1–4," Baseball Prospectus — https://www.baseballprospectus.com/news/article/10027/introducing-siera-part-1/
11. FanGraphs Sabermetrics Library, "SIERA" — https://www.fangraphs.com/library/pitching/siera/
12. Thomas Nestico, "Modelling xwOBA (With KNN)" — https://medium.com/@thomasjamesnestico/modelling-xwoba-with-knn-9b004e93861a
13. Normal CornBelters, "Developing xwOBA for the KCL" (Yakkertech, small-league build) — https://cornbeltersbaseball.com/developing-xwoba-for-the-kcl-2/
14. M-SABR, "Creating New Park Factors and xwOBA in Major League Baseball" (2025) — https://msabr.com/2025/09/30/creating-new-park-factors-and-xwoba-in-major-league-baseball/
15. Sam Walsh, "Rethinking wOBA, xwOBA, xERA, and Stuff+" — https://sam-walsh.github.io/posts/double-plays/
16. Alex Caravan & Tanner Stokey, "Swing Profile: Introducing Expected Batted Ball Results," Driveline Baseball — https://www.drivelinebaseball.com/2020/04/swing-profile-introducing-expected-batted-ball-results/
17. Craig Edwards, "How I Use xwOBA," FanGraphs — https://blogs.fangraphs.com/how-i-use-xwoba/
18. MLB.com, "What you need to know about Statcast bat tracking" (squared-up, blasts, swing length) — https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
19. MLB.com, "Minor League Statcast data" (Triple-A coverage since 2023) — https://www.mlb.com/news/minor-league-statcast-data
20. Eno Sarris, "Stuff+, Location+, and Pitching+ Primer," FanGraphs Sabermetrics Library — https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer/
21. MLB.com, "A new way to dissect baseball's park factors" (Statcast park factors) — https://www.mlb.com/news/park-factors-measured-by-statcast
