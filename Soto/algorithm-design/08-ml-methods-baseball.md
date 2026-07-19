---
title: ML Methods for Baseball Modeling — Choosing the Right Tool
domain: algorithm-design
tags:
  - gradient-boosting
  - xgboost
  - mixed-models
  - bayesian-shrinkage
  - neural-networks
  - shap-interpretability
  - stuff-models
  - model-selection
sources_reviewed: 23
last_updated: 2026-07-19
---

# ML Methods for Baseball Modeling — Choosing the Right Tool

## TL;DR

- **Gradient boosting (XGBoost family) is the workhorse of public and pro pitch modeling** — PitchingBot, Eno Sarris' Stuff+, Driveline's Stuff+ (4th iteration), and tjStuff+ are all boosted-tree run-value models; tjStuff+ trained on 1.4M pitches (2020–2022) hits year-over-year R² of 0.78 and out-predicts prior-season ERA (r = −0.34 vs 0.20) (proven).
- **Trees beat neural nets on typical baseball tabular data** — the Grinsztajn et al. NeurIPS 2022 benchmark (45 datasets) showed tree ensembles remain state-of-the-art on medium-size (~10K-row) tabular problems due to robustness to uninformative features and irregular decision surfaces (proven).
- **Mixed/multilevel models are the right tool for nested data** — Baseball Prospectus DRA/DRC+ use random intercepts for batter, pitcher, and 60 stadium×handedness combos with Bayesian regularization; in sports-science longitudinal data, repeated-measures ANOVA can force omission of ≥48.7% of observations that mixed models retain (proven).
- **Bayesian shrinkage is the answer to small samples** — empirical Bayes with a Beta(≈79, ≈225) prior turns a 1-for-2 hitter into a ~.260 estimate instead of .500; Marcel's 5/4/3 weighting + regression to the mean is a crude Bayesian posterior, and full Bayesian Marcel recovers a data-driven peak hard-hit age of ~28 (proven).
- **Neural nets earn their keep only on sequence/trajectory data** — transformer models for pitch-by-pitch outcome prediction (MIT Sloan 2025), temporal fusion transformers for ERA forecasting, and LSTMs on mocap time series; but a 2026 study of 50 pitchers found ball-speed models collapse from R² 0.91 (within-athlete) to 0.38 (leave-one-subject-out) — cross-athlete generalization is the failure mode (promising).
- **SHAP is the de facto interpretability layer for coach-facing models** — the 2024 AJSM-adjacent XGBoost injury model (3,808 MLB pitcher-years, 15.9% injury rate, AUC 0.66) used SHAP to surface velocity, fastball spin, and slider% as top risk drivers, including a velocity×age interaction invisible to linear models (proven).
- **Velocity dominates arm-stress prediction** — Nicholson et al. (AJSM 2022, n=168 HS/college pitchers) found pitch velocity the strongest predictor of elbow valgus torque across 4 ML models + regression, with gradient boosting best calibrated (proven).
- **Method selection is a decision tree, not a preference** — tabular + medium data → GBM; nested/repeated measures → mixed models; n < a few hundred → Bayesian hierarchical; raw time series/sequences → neural nets; anything a coach must act on → add SHAP or use an inherently interpretable model.

## 1. Gradient Boosting: The Workhorse

Gradient-boosted decision trees (GBDTs) — XGBoost, LightGBM, CatBoost — dominate baseball modeling because baseball's core data is tabular: one row per pitch or per batted ball, 10–100 heterogeneous features (velocities, spin, break, release coordinates, count, handedness), non-linear interactions everywhere, and sample sizes from tens of thousands (one facility-season) to millions (Statcast). This is exactly the regime where trees win.

The canonical evidence is Grinsztajn, Oyallon & Varoquaux (NeurIPS 2022 Datasets & Benchmarks): across 45 curated tabular datasets and extensive hyperparameter search, tree-based ensembles remained state-of-the-art on medium-sized data (~10K samples), even before accounting for their large speed advantage. The paper isolates *why*: neural nets are biased toward overly smooth functions, are hurt by uninformative features (baseball datasets are full of them), and lose the natural axis-aligned orientation of tabular features (proven). The practical translation: for a stuff model, a swing-decision model, or an injury classifier on point-of-interest metrics, a tuned GBM is the correct default and a neural net must *prove* it deserves the added complexity.

**Every serious public pitch-quality model is a GBM run-value model:**

- **PitchingBot** (Cameron Grove, ex-astrophysicist, hired by Cleveland; hosted on FanGraphs): XGBoost with separate sub-models for fastballs, breaking balls, and offspeed. Inputs split into context (handedness, zone height, count), stuff (velo, spin, movement, release point, extension, spin efficiency, axis deviation), and location. Output is expected run value (xRV) normalized to zero per count, then mapped to the 20–80 scouting scale (50 = average, 10 points = 1 SD). Stuff grades stabilize faster than nearly all traditional pitching stats (proven).
- **tjStuff+** (Thomas Nestico): XGBoost regressor on ~1.4M pitches (2020–2022 Hawk-Eye era), 11 features including release speed, spin, extension, movement, release position, spin axis, and — critically — three *fastball-differential* features (velo/IVB/HB deltas vs the pitcher's fastball). Scaled to mean 100, SD 10. Same-season correlation with ERA: −0.38; prior-season tjStuff+ → current ERA: −0.34, beating prior-season ERA (0.20) and xFIP (0.29) as a predictor. Year-over-year stickiness R² = 0.78 (proven).
- **Driveline Stuff+** (4th iteration as of 2024): boosted-tree run-value model that deliberately excludes location so the score stabilizes in tiny samples — the design goal is *immediate feedback during offseason pitch design*, not seasonal evaluation. Dominant features: velocity, vertical break, horizontal break, extreme release extension; secondary pitches are modeled *relative to the pitcher's primary pitch* (promising — internal validation, not peer-reviewed).

**Feature-engineering lessons that recur across all of these** (promising): (1) model pitch classes separately or include pitch-type interactions — a "good" slider shape is nearly the inverse of a good four-seam shape; (2) express secondary-pitch traits as deltas off the fastball; (3) target a count-neutralized run value, not raw outcomes, to strip base-state noise; (4) normalize output to an interpretable scale (100 ± 10 or 20–80).

**Library choice.** Benchmarks are muddy, but the pattern is consistent: LightGBM is roughly 7× faster than XGBoost and ~2× faster than CatBoost on large data; CatBoost wins most accuracy comparisons on datasets with meaningful categorical features (one benchmark: best log-loss on 28/30 datasets) and is the laziest path to good calibration; XGBoost has the deepest ecosystem (SHAP integration, deployment tooling) (promising — benchmark-dependent). Practical rule: XGBoost by default, LightGBM when iteration speed on millions of rows matters, CatBoost when categorical cardinality is high (pitcher IDs, pitch types, parks) and you don't want to engineer encodings.

**For Soto:** Triton's current Stuff+ is a linear Z-score model (100 + veloZ·4.5 + moveZ·3.5 + extZ·2.0). That is defensible as a v1 with clean interpretability, but it cannot capture the interactions every GBM model finds decisive (velo×IVB, movement relative to fastball, release-height×VAA). The upgrade path is exactly tjStuff+'s recipe: XGBoost on count-neutralized delta run expectancy over the 7.4M-row `pitches` table, fastball-differential features for secondaries, per-pitch-class sub-models, rescale to 100 ± 10 so existing UI and `pitch_baselines` semantics survive. Train on 2020+ (Hawk-Eye era) to avoid the 2015–2019 tracking-system distribution shift.

## 2. Mixed / Multilevel Models: Nested Data Done Right

Baseball data is nested at every level: pitches within PAs within games within seasons within players; at a facility, throws within sessions within athletes within training blocks. Treating these as independent rows inflates confidence and misattributes credit. Mixed (multilevel) models solve this with random effects — and they are the backbone of the most statistically rigorous public metrics ever built.

**Baseball Prospectus DRA and DRC+** (Jonathan Judge, Harry Pavlidis, Dan Turkenkopf). DRA is a two-stage pipeline: a linear mixed model estimates each pitcher's "value" per event while simultaneously adjusting for catcher framing, opposition quality, park, home/away, temperature, etc.; a MARS (multivariate adaptive regression splines) stage then handles remaining non-linearities and scales values to the RA9 scale (proven methodology, published in detail). DRC+ models batting as a set of binomial multilevel models (rather than one multinomial), with random intercepts for batter, pitcher, and 60 stadium×handedness combinations; models are fit twice — maximum likelihood first, then re-fit with Bayesian regularization (`blme`) using zero-centered normal priors. The core rationale, in Judge's words: shrinkage "assigns responsibility more cautiously," borrowing strength across the league so small-sample players aren't taken at face value, and effectively runs "with-or-without-you" on every player simultaneously (proven as a method; BP's claim that DRC+ is "substantially more accurate than any other public batting stat" is their internal benchmark — treat as promising).

**Sports science has independently converged on the same tools.** A 2022 IJSPP position paper ("The Utility of Mixed Models in Sport Science") calls for mixed models as the default for longitudinal athlete data: sport datasets are unbalanced (athletes miss sessions, cohorts churn), and one worked example showed a repeated-measures ANOVA would have discarded ≥48.7% of the data to satisfy balance assumptions that a mixed model simply doesn't need (proven). Random slopes additionally let each athlete carry an individual response to load — the statistical encoding of "individual response to training."

**When mixed models beat GBMs:** when the question is *attribution* ("how much of this outcome is the pitcher vs the catcher vs the park?") or *individualized inference from unbalanced repeated measures* ("is this athlete's velocity actually trending up, given session-to-session noise?"). GBMs predict; mixed models partition credit with honest uncertainty. Scott Powers & Ron Yurko's 2025 bat-tracking paper (below) shows the modern hybrid: hierarchical Bayesian structure for the athlete-level parameters, with causal machinery layered on top.

**For Soto:** This is the Neptune workhorse. Facility data is the textbook mixed-model case: `compete_pitches` throws nested in `compete_pitch_sessions` nested in athletes, wildly unbalanced (some athletes train 4×/week, some monthly). Athlete progress dashboards should report random-effect (shrunken) velocity/stuff trends, not raw session means — a kid's single 3-mph-up session should move his estimate a little, not redefine him. In R: `lme4`/`blme`; in Python: `statsmodels` MixedLM or Bayesian via PyMC/`bambi`. Also the right frame for any future Triton catcher-framing or park-adjusted metric.

## 3. Bayesian Approaches: Small Samples and Honest Uncertainty

The small-sample problem is baseball's oldest statistical trap, and it is 10× worse at a training facility (an assessment might be 20 pitches). The Bayesian toolkit — priors, shrinkage, posterior uncertainty — is the principled answer.

**Empirical Bayes as the entry point** (David Robinson's canonical batting-average series): fit a Beta distribution to the population of batting averages (his fit: roughly Beta(α₀≈79, β₀≈225), prior mean ≈ .260), then each player's estimate becomes (H + α₀)/(AB + α₀ + β₀). A 1-for-2 hitter shrinks from .500 to ~.264; a 300-for-1000 hitter barely moves (~.284). Shrinkage is automatic and proportional to sample size (proven — this is just math, and simulation confirms empirical Bayes credible intervals achieve near-nominal coverage). The same beta-binomial machinery applies directly to any rate: strike%, whiff%, chase%, in-zone%.

**Hierarchical models generalize this**: instead of one prior for everyone, fit group-level priors (by level, age band, role) and let the model learn how much pooling each group needs. The shrinkage factor is within-group variance / (within + between variance) — small samples shrink hard toward the group mean, large samples barely move (proven). The classic full treatment is Jim Albert's Bayesian baseball work and the "Bayesball" fielding model (Shane Jensen et al.), which put spatial hierarchical priors on fielding.

**Projection systems are applied Bayes.** Marcel (Tango, 2004) is the minimal version: weight the last three seasons 5/4/3, regress to league mean, apply a fixed age adjustment. ZiPS weights four years 8/5/4/3 and swaps the fixed aging curve for comparable-player pools; Steamer learns weights and regression amounts per-stat via regression analysis (proven as descriptions; each system's edge over Marcel is real but small — a few points of RMSE on wOBA). PyMC Labs' "Bayesian Marcel" rebuild shows the modern payoff: the same structure as a generative model yields full posterior distributions per player and estimates the aging curve from data (peak hard-hit age ≈ 28) instead of assuming it (promising).

**State of the art hybrid — Powers & Yurko 2025** ("Swinging, Fast and Slow," arXiv): to interpret Statcast bat-speed/swing-length data, they fit a Bayesian hierarchical skew-normal model with per-batter random intercepts *and slopes* (intention as a function of count and location), then instrumental-variables regression for the causal effect of swing speed on contact/power, then a Markov chain to price the tradeoff. Headline finding: cutting bat speed with two strikes reduces strikeouts, but the power loss approximately cancels the benefit for the average hitter (promising — strong methods, single-season data).

**For Soto:** Three direct applications. (1) Triton leaderboards and the Compete section should shrink every rate stat with empirical Bayes before ranking — a reliever's 15-inning strikeout rate and an assessment's 20-pitch strike% are exactly the 1-for-2 hitter problem. (2) Neptune athlete reports should carry credible intervals ("velo 84.2 ± 1.1") — coaches over-read single sessions, and intervals are the cheapest honest fix. (3) Any Retrosheet-spine projection/aging work should start as Bayesian Marcel: simple, calibrated, uncertainty-aware, and shippable incrementally.

## 4. Neural Networks: Sequences, Trajectories, and Time Series

Neural nets lose to GBMs on tabular point-of-interest data, but they are the only game in town when the input is inherently sequential or high-dimensional: full pitch trajectories, mocap time series, at-bat pitch sequences, video.

**Sequence models for game data.** A transformer-based model presented at MIT Sloan 2025 (Declan Kneita) predicts individual pitch outcomes and hit locations, conditioning on the batter's recent performance and game context via self-attention, and is pitched at pitch-sequencing and defensive-alignment optimization (promising — conference paper, limited public benchmarks). A May 2025 temporal fusion transformer (TFT) study forecasts pitcher ERA from multivariate time series (promising). LSTM approaches to season-level performance prediction and pitch-type prediction have a longer history; typical pitch-type prediction accuracy from sequence models sits in the ~50–60% range versus a ~40–50% naive-frequency baseline — real but modest lift (promising).

**Trajectory/biomech time series.** Driveline's OpenBiomechanics Project (100 pitchers, 98 hitters of elite mocap — the largest open high-fidelity baseball mocap dataset) has spawned LSTM/PyTorch pipelines predicting pitch velocity from kinematic time series, and peer-reviewed work confirms lower-body kinematics (lead-leg block, hip-shoulder separation, trunk rotation) explain variance in velocity beyond arm speed (promising). Statcast itself uses simpler function approximators where appropriate: xwOBA is essentially KNN/GAM smoothing over exit velocity × launch angle (+ sprint speed on certain batted balls) — and Tango is explicit that expected metrics are *descriptive, not predictive* by design (proven).

**The generalization warning.** A 2026 study (arXiv) of 50 pitchers across levels: ball-speed prediction from spatiotemporal motion data achieved R² = 0.91 evaluated within-individual but collapsed to R² = 0.38 under leave-one-subject-out cross-validation, systematically overestimating intermediate pitchers; only trunk and pivot-leg features generalized across athletes (proven within this study; the general lesson — sports ML models memorize athletes — replicates across the literature). Any facility model validated with random row splits instead of athlete-grouped splits is almost certainly overfit.

**For Soto:** Neptune should not start with neural nets. The defensible sequence: GBMs on TrackMan point metrics now; mixed/Bayesian models for progress tracking; NNs only if/when Neptune acquires time-series capture (markerless mocap, IMUs) and has hundreds of athletes — and even then, validate leave-one-athlete-out or don't publish the number. For Triton, a sequence model over pitch-by-pitch context (sequencing effects, times-through-order) is the one NN project with clear platform value, and OpenBiomechanics is the free sandbox for prototyping biomech features before buying hardware.

## 5. Interpretability: SHAP and the Coach-Facing Contract

A model coaches won't trust is a model that changes nothing. SHAP (SHapley Additive exPlanations; Lundberg & Lee, NeurIPS 2017) has become the standard interpretability layer for boosted-tree sports models because TreeSHAP is exact and fast for GBMs, gives per-prediction feature attributions in the model's output units, and surfaces interactions.

**The flagship baseball example** is the 2024 pitch-tracking injury study (Orthopaedic Journal of Sports Medicine / PMC11369970): XGBoost with class-weighted learning on 3,808 MLB pitcher-years (2017–2022; 606 injured seasons, 15.9%), predicting next-season shoulder/elbow IL placement. Performance: accuracy 0.84, AUC 0.66 (95% CI 0.60–0.71; 0.61 with only the top 10 features) — honest, modest discrimination. The value was the SHAP layer: top risk contributors were pitch velocity (all types), fastball spin rate, horizontal movement, and slider usage; SHAP interaction analysis showed velocity >95 mph amplified risk specifically when combined with high slider%, and elevated-velocity risk concentrated in older pitchers. Injured vs healthy cohort deltas were small in raw terms (mean velo 89.3 vs 88.8 mph, p<0.001; FB spin 2,265 vs 2,241 rpm, p=0.001) — precisely the kind of signal only a model + attribution layer can operationalize. Notably, workload variables carried no independent predictive value at the MLB level (proven for this dataset; workload null result is contested at youth level and should not be exported to amateurs) (promising overall — single retrospective study, AUC 0.66 means most injuries remain unpredicted).

Parallel examples: a PLOS ONE XGBoost+SHAP NBA win-prediction pipeline framed explicitly as coach decision support, and a 2025 explainable-AI study predicting annual home runs from swing-sensor data where SHAP ranked bat speed, bat mass, and rotational acceleration as dominant (promising).

**Caveats Soto must respect** (proven, from the interpretability literature): SHAP attributions are *associational*, not causal — "slider% contributes +0.3 to injury log-odds" does not mean throwing fewer sliders lowers risk; correlated features split credit arbitrarily; and SHAP on a bad model faithfully explains a bad model. For coach-facing outputs, the hierarchy is: (1) inherently interpretable model (GAM, shallow trees, scorecards) if it costs <2 points of AUC; (2) GBM + SHAP summary and dependence plots; (3) black box + SHAP only when the accuracy gap is decisive.

**For Soto:** Every Neptune athlete-facing model output should ship with its top-3 SHAP drivers translated to plain language ("your slider grades 62 mainly because of −4″ more horizontal break than the average slider at your velo"). That single design decision is most of the difference between a "development lab" and a black-box report. For Triton, a SHAP panel on the upgraded Stuff+ model is also the debugging tool that catches leakage and encoding bugs before users do.

## 6. Method Selection by Problem Type

| Problem | Data shape | First-choice method | Escalate to | Grade |
|---|---|---|---|---|
| Stuff/pitch quality | Tabular, 100K–7M pitches | XGBoost/LightGBM on count-neutral xRV | Per-pitch-class sub-models; monotonic constraints | proven |
| Command/location value | Tabular + location grid | GBM with location, or GAM over plate coords | 2D smoothing (tensor-product splines) | proven |
| Injury risk | Tabular, rare outcome (5–16%) | Class-weighted GBM + SHAP; report AUC with CIs | Survival models (time-to-injury) | promising |
| Player value attribution (framing, park, quality-of-opposition) | Nested categorical | Multilevel model with crossed random effects (DRA/DRC+ pattern) | Bayesian regularization (`blme`, `brms`) | proven |
| Facility progress tracking | Unbalanced repeated measures, n(athletes) small | Linear mixed model, random intercept+slope per athlete | Bayesian hierarchical with credible intervals | proven |
| Rate stats in small samples | Binomial counts | Empirical Bayes beta-binomial shrinkage | Hierarchical priors by age/level | proven |
| Projections/aging | Multi-season panels | Marcel baseline (5/4/3 + regression + age) | Bayesian generative Marcel; comp-based (ZiPS-style) | proven |
| Pitch sequencing / in-game context | Sequences | GBM with engineered lag features first | Transformer/LSTM if lift justifies | promising |
| Biomech time series → outputs | Mocap/IMU waveforms | PCA/functional features + GBM | LSTM/1D-CNN; validate leave-one-athlete-out | promising |
| Batted-ball expectation | 2–3 continuous inputs | KNN/GAM smoothing (xwOBA pattern) | GBM if adding context features | proven |

Cross-cutting rules: (1) **medium tabular data → trees, full stop** (Grinsztajn); (2) **the grouping structure dictates the validation split** — split by season for forecasting claims, by athlete for facility models, never randomly by row; (3) **descriptive ≠ predictive** — decide which you're building before choosing the target (Tango's xwOBA lesson); (4) **class imbalance needs class weights and AUC/PR reporting, not accuracy** — the injury model's 0.84 accuracy is nearly the 84.1% base rate of no-injury; AUC 0.66 is the real number.

## 7. Validation and Deployment Pitfalls Specific to Baseball

- **Era/tracking-system shift**: Statcast moved from TrackMan radar to Hawk-Eye optical in 2020; spin and movement distributions shifted. Models trained across the boundary learn the artifact (proven). Triton's 2015–2026 table needs a `game_year` feature at minimum, or a 2020+ training window.
- **Leakage via outcome-adjacent features**: including exit velocity in a "stuff" model leaks the outcome; stuff models must use only pre-contact flight/release features (proven — this is definitional in every public stuff model).
- **Within-athlete leakage**: random row splits let the model memorize pitcher identity through release-point fingerprints; the 0.91→0.38 R² collapse quantifies the size of this trap (proven).
- **Shrinkage before ranking**: any leaderboard sorted on raw small-sample rates is a randomness leaderboard (proven).
- **Stability vs responsiveness tradeoff**: Driveline deliberately excludes location so Stuff+ stabilizes in ~20 pitches for pitch-design feedback; PitchingBot includes command for seasonal evaluation. Same math, different product decisions — decide per surface (proven).
- **Report uncertainty or coaches will invent their own**: AUC CIs, credible intervals, and reliability (stabilization) points belong in the UI, not just the research notebook.

**For Soto — priority order:** (1) GBM Stuff+ v2 on Triton (highest leverage, data in hand); (2) empirical-Bayes shrinkage utilities as a shared `lib/` module used by both Triton leaderboards and Compete; (3) mixed-model athlete progress engine for Neptune on `compete_pitches`; (4) SHAP-driven plain-language explanations on every athlete-facing score; (5) Bayesian Marcel projections on the Retrosheet spine; (6) sequence models last, only with a demonstrated lift over lag-feature GBMs.

## Sources

1. Grinsztajn, Oyallon & Varoquaux, "Why do tree-based models still outperform deep learning on typical tabular data?" NeurIPS 2022 — https://arxiv.org/abs/2207.08815
2. FanGraphs Library, "PitchingBot Pitch Modeling Primer" — https://library.fangraphs.com/pitching/pitchingbot-pitch-modeling-primer/
3. FanGraphs, "PitchingBot and Stuff+ Pitch Modeling Is Now on FanGraphs!" — https://blogs.fangraphs.com/pitchingbot-and-stuff-pitch-modeling-are-now-on-fangraphs/
4. Nestico, "Modelling tjStuff+ v1.0" — https://medium.com/@thomasjamesnestico/modelling-tjstuff-d9a451765484
5. Driveline Baseball, "Revisiting Stuff+: An Update on Driveline's Methodology to Quantifying Pitch Design" (2024) — https://www.drivelinebaseball.com/2024/05/revisiting-stuff-plus/
6. Driveline Baseball, "Rethinking the True Run Value of a Pitch With a Pitch Model" (2021) — https://www.drivelinebaseball.com/2021/09/rethinking-the-true-run-value-of-a-pitch-with-a-pitch-model/
7. Judge, "Entirely Beyond WOWY: A Breakdown of DRC+," Baseball Prospectus — https://www.baseballprospectus.com/news/article/48293/entirely-beyond-wowy-a-breakdown-of-drc/
8. Baseball Prospectus, "DRA: An In-Depth Discussion" — https://www.baseballprospectus.com/news/article/26196/prospectus-feature-dra-an-in-depth-discussion/
9. "Pitch-Tracking Metrics as a Predictor of Future Shoulder and Elbow Injuries in MLB Pitchers: A Machine-Learning and Game-Theory Based Analysis" (2024) — https://pmc.ncbi.nlm.nih.gov/articles/PMC11369970/
10. Nicholson et al., "Machine Learning and Statistical Prediction of Pitching Arm Kinetics," AJSM 2022 — https://journals.sagepub.com/doi/10.1177/03635465211054506
11. Orthopedics This Week summary of Nicholson et al. — https://orthotw.com/2021/11/pitch-velocity-best-predictor-of-elbow-valgus-torque/
12. Robinson, "Understanding empirical Bayes estimation (using baseball statistics)" — http://varianceexplained.org/r/empirical_bayes_baseball/
13. Robinson, "Simulation of empirical Bayesian methods (using baseball statistics)" — https://www.r-bloggers.com/2017/01/simulation-of-empirical-bayesian-methods-using-baseball-statistics/
14. Jensen et al., "Bayesball: A Bayesian hierarchical model for evaluating fielding in MLB" — https://arxiv.org/abs/0802.4317
15. PyMC Labs, "Bayesian MARCEL: A Simple, Probabilistic Model for MLB Projections" — https://www.pymc-labs.com/blog-posts/bayesian-marcel
16. FanGraphs Library, "The Projection Rundown: Marcels, ZiPS, and the Rest" — https://library.fangraphs.com/the-projection-rundown-the-basics-on-marcels-zips-cairo-oliver-and-the-rest/
17. Powers & Yurko, "Swinging, Fast and Slow: Interpreting variation in baseball swing tracking metrics" (2025) — https://arxiv.org/abs/2507.01238
18. Kneita, "Transformer-Based Baseball Modeling for Pitch Outcome Prediction and Strategy Optimization," MIT Sloan Sports Analytics Conference 2025 — https://www.sloansportsconference.com/research-papers/transformer-based-baseball-modeling-for-pitch-outcome-prediction-and-strategy-optimization
19. "Pitcher Performance Prediction in MLB by Temporal Fusion Transformer" (2025) — https://www.researchgate.net/publication/391148375_Pitcher_Performance_Prediction_Major_League_Baseball_MLB_by_Temporal_Fusion_Transformer
20. "Cross-individual generalizability of machine learning models for ball speed prediction in baseball pitching" (2026) — https://arxiv.org/abs/2605.05487
21. Driveline Baseball, "The OpenBiomechanics Project: Driveline Goes Open Source" — https://www.drivelinebaseball.com/2022/12/openbiomechanics-project/
22. Huebner et al., "The Utility of Mixed Models in Sport Science: A Call for Further Adoption in Longitudinal Data Sets," IJSPP 2022 — https://journals.humankinetics.com/abstract/journals/ijspp/17/8/article-p1289.xml
23. Ouyang et al., "Integration of machine learning XGBoost and SHAP models for NBA game outcome prediction and quantitative analysis methodology," PLOS ONE — https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0307478
