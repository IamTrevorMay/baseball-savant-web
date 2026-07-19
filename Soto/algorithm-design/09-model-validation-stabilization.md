---
title: Model Validation & Stabilization — How to Prove a Baseball Model Is Real
domain: algorithm-design
tags:
  - model-validation
  - cross-validation
  - stabilization
  - reliability
  - calibration
  - stuff-plus
  - leakage
  - benchmarking
sources_reviewed: 17
last_updated: 2026-07-19
---

# Model Validation & Stabilization — How to Prove a Baseball Model Is Real

## TL;DR

- **Group-aware, temporally-ordered splits are non-negotiable for pitch models.** Random row-level splitting scatters a single pitcher's ~2,000–3,000 pitches across train and test, letting the model memorize each arm's fingerprint (identity leakage) and reporting fantasy accuracy. Split by pitcher and by season instead. (proven)
- **The single most damning stress test for a stuff model is the team-switcher cohort.** Jonathan Judge (Baseball Prospectus, 2023) found Stuff+ predicted next-year ERA at r=.41 for pitchers who stayed put but collapsed to r=.14 for the 231 pitchers who switched teams — worse than FIP — implying part of "stuff" is really park/team usage, not portable arm skill. (promising)
- **Stabilization = the sample where signal beats noise, benchmarked at Cronbach's alpha ≈ 0.5–0.7.** Modern stuff models stabilize fast: tjStuff+ and aStuff+ settle within ~78–116 pitches; location/command grades need ~330–1,050+ pitches; traditional outcome stats lag badly (pitcher BABIP ≈ 2,000 BF, walk rate ≈ 170 BF). (proven)
- **Descriptive ≠ predictive ≠ prescriptive — grade each separately.** DRA is the clearest winner at *describing* runs allowed while being no better than FIP/xwOBA at *predicting* next-year wOBA; Stuff+ reliability is high (r=.74) but its predictive edge is fragile. Never sell a descriptive number as a forecast. (proven)
- **Year-over-year "stickiness" is table stakes, not proof of value.** tjStuff+ carries r≈.85 season-to-season and Stuff+ reliability is .74 — but a metric can be perfectly sticky and still predict outcomes poorly. Report reliability AND out-of-sample predictiveness side by side. (proven)
- **Command is the hard, under-solved frontier.** The Kirby Index (release-angle consistency) hits R²=.50 year-to-year vs Location+'s .39, yet still explains only ~14% of fastball run value — command models remain noisy and should be presented with wide error bars. (promising)
- **Calibration is a separate axis from accuracy — report Brier score + log loss + reliability diagram.** A whiff model can rank pitches correctly (good AUC) yet output probabilities that are systematically too confident; miscalibrated probabilities silently corrupt any downstream run-value math. (proven)
- **Published injury models are honest about their ceiling: AUC ≈ 0.65–0.66.** A 2024 Mayo/Twins XGBoost model on 3,808 pitcher-years hit AUC 0.66 (95% CI 0.60–0.71); a 2020 model on 1,245 pitchers averaged 0.65 ± 0.02 across 10 folds. Treat any arm-injury "prediction" as weak-signal risk stratification, not prophecy. (proven)

---

## 1. Why validation is the whole ballgame for Triton's models

Soto owns three live in-house models — Stuff+ (Z-score, `100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`), command (`pitcher_season_command`), and deception (`pitcher_season_deception`) — plus whatever facility metrics get built on the Neptune/Compete TrackMan spine. Every one of those numbers is a claim about a pitcher, and a claim is only worth what its validation proves. The public modeling community has learned this the hard way: a stuff model can look brilliant on a random 80/20 split and be nearly worthless in deployment because the split leaked information the real world won't hand you.

The discipline breaks into four questions Soto should answer for *every* model before it ships to a dashboard:

1. **Does it generalize?** (cross-validation, done with the right splits)
2. **When is it meaningful?** (stabilization / reliability)
3. **What is it actually good at?** (descriptive vs predictive vs prescriptive)
4. **Are its numbers honest?** (calibration)

These are orthogonal. A model can ace one and fail another. The rest of this doc walks each, with the numbers public modelers actually report, and maps them back to Triton, Neptune, and Trevor's own training.

---

## 2. Cross-validation without leakage: split by pitcher AND by season

The most damaging mistake in applied ML is splitting at the row level when the natural unit of observation is a group (proven). In pitch modeling every pitcher contributes thousands of near-identical rows — a random k-fold split puts some of Gerrit Cole's 2023 four-seamers in train and others in test. The model doesn't learn "what makes a four-seamer good," it learns "this exact release/velo/spin fingerprint belongs to a good pitcher," then gets rewarded for recognizing it in the test fold. This is **identity leakage**, and it inflates test metrics to fantasy levels.

The fix is **grouped cross-validation**: all pitches from one pitcher live entirely in one fold (scikit-learn's `GroupKFold`/`StratifiedGroupKFold`, grouping on `pitcher_id`). The academic literature confirms the size of the trap. A 2026 arXiv study on cross-individual generalizability of ball-speed prediction in pitching showed that leave-one-subject-out (cross-subject) validation produces markedly worse — and honest — error than within-subject random splits; models that look excellent when a subject's own reps are in the training set degrade sharply on unseen athletes (promising). For Neptune, where the whole point is to project an unseen 16-year-old's future, cross-subject is the *only* validation scheme that answers the real question.

Baseball data adds a second axis: **time**. Standard k-fold is inappropriate for temporal data because it leaks future information backward — training on 2024 to predict 2023 is nonsense you'd never do in production (proven). Pitch characteristics drift year to year (the league gains velocity, the ball changes, the strike zone moves), so the deployment scenario is always "train on the past, predict the future." The public stuff models get this right: aStuff+ v2 trains on 2021–2023 and tests on 2024; tjStuff+ v3.0 trains on 2020–2022 and validates predictions on 2023→2024; PitchingBot and the FanGraphs Stuff+ family follow the same forward-in-time pattern. The rigorous version is **walk-forward (rolling-window) validation**: train on years ≤ t, test on year t+1, roll forward, optionally leaving a temporal gap between train and test windows to kill autocorrelation leakage (proven).

The gold-standard split for a Triton pitch model therefore satisfies **both** constraints at once: grouped by pitcher *and* ordered by season. A pitcher who appears in the 2024 test set should not appear in the training set at all — not even his 2022 pitches — if you want to measure true generalization to new arms. Relaxing that (letting a pitcher's earlier seasons train the model that scores his later seasons) answers a different, easier question: "given this arm's history, can we score his new pitches?" Both are legitimate; they just measure different things, and Soto must state which one every reported number reflects.

Leakage also sneaks in through preprocessing. The rule: **split first, then fit every transform (z-score baselines, imputation, scaling) on training data only**, and apply the frozen transform to test (proven). This is directly relevant to Triton's Stuff+, which normalizes against per-`pitch_name`/`game_year` baselines in `pitch_baselines`. If those baselines are computed over all years including the test season, the test season's own data has leaked into its own normalization. The baselines are arguably a "league truth" rather than a learned parameter, but Soto should decide this explicitly and document it, because a reviewer will ask.

**For Soto:** Add a `pitcher_id`-grouped, season-ordered CV harness to the Stuff+/command/deception validation scripts before any model change ships. Report two numbers per change: (a) grouped+temporal "new arm" generalization, and (b) within-pitcher "score new pitches" performance. When a model change improves (b) but not (a), you've likely added memorization, not skill.

---

## 3. Stabilization: when does a number mean something?

Stabilization answers "how many pitches/PA before this metric reflects true talent rather than luck?" The canonical framework comes from Russell Carleton and the Cronbach's-alpha reliability tradition. The core idea: split a player's sample in half, correlate the halves, and find the sample size where reliability crosses a threshold — classically **r ≈ 0.7**, because r² ≈ 0.5 means half the observed variance is "true" signal (proven). Driveline and most pitch-quality modelers use a looser **α ≈ 0.5** floor for pitch-level work.

The critical nuance, hammered by Pemstein & Dolinar (FanGraphs, 2015) and Carleton himself: **there is no single magic number**. Reliability is a continuous spectrum; "stabilization point" is shorthand for "reliability crossed our chosen threshold," not a switch that flips. Report the whole curve when it matters.

### Outcome-stat stabilization (the slow lane)
From the FanGraphs sample-size library (Carleton lineage), pitcher stats stabilize at roughly:

| Stat | Threshold |
|---|---|
| K rate | 70 BF |
| BB rate | 170 BF |
| GB / FB rate | 70 BIP |
| HR rate | 1,320 BF |
| HR/FB | 400 FB |
| BABIP | 2,000 BIP |

Hitter benchmarks for reference: K rate 60 PA, BB rate 120 PA, HR rate 170 PA, ISO 160 AB, BABIP 820 BIP. The lesson: contact-quality and luck-driven stats (BABIP, HR/FB) take a *season-plus* to stabilize, while approach stats (K, BB) stabilize inside a few weeks. This is exactly why ERA is a terrible in-season talent read and estimators exist.

### Pitch-level stabilization (the fast lane)
Driveline's 2018 study (7M+ pitches, 2008–2017, standardized Cronbach's alpha, 0.50 threshold) found plate-discipline pitch metrics stabilize quickly: Contact% at **40 pitches** (α=.523), O-Swing% at **55** (α=.518), Zone-Swing% and SwStr% at **70** (α≈.51).

Modern stuff models stabilize even faster because they measure the pitch's physical properties, not noisy outcomes:
- **tjStuff+ (Nestico):** meaningful at **100 pitches**; the stabilization method is "the pitch count where a pitcher's rolling value stops deviating more than ±0.5 over every 10 pitches," computed on pitchers with 250+ pitches (2020–2023).
- **aStuff+ v2 (Salorio):** aStuff+ within ±0.25 by **78 pitches**, ±0.15 by **116**, ±0.05 by **269**. Location/command grades are far slower — aLocation+ needs ~330 / ~540 / ~1,050 pitches for the same bands.
- **True-run-value residuals (Driveline/Asel, 2021):** career-level intrinsic run value needs **~3,000 pitches** (α=.7); by pitch type, four-seamers **4,860**, changeups **2,690**, sinkers **2,550**, curveballs **960**, sliders **920**. Sliders/curves stabilize far faster than fastballs because their run-value spread is wider.

The pattern is universal and important: **stuff stabilizes in dozens of pitches, command/location in hundreds-to-thousands, outcomes in thousands.** That ordering should drive how confidently Soto surfaces each number in-season.

**For Soto:** Publish a stabilization point next to every Triton metric, and gate the UI on it — grey out or widen error bars on a pitcher's command grade until he clears the ~300–1,000-pitch reliability band, while stuff can display confidently by ~100 pitches. For Neptune athletes throwing bullpens (not games), stuff metrics are usable almost immediately; command/consistency metrics need a full block of throwing before they're trustworthy. Bake the Cronbach-α stabilization calc into the Compete pipeline so each athlete's dashboard knows when its own numbers have earned trust.

---

## 4. Descriptive vs predictive vs prescriptive — three different jobs

A model that describes the past well is not the same as one that predicts the future, which is not the same as one that tells you what to *do*. Conflating them is the field's most common rhetorical crime.

- **Descriptive:** How well does the metric explain what already happened? (e.g., FIP describes past runs allowed better than xFIP/SIERA do.)
- **Predictive:** How well does *this year's* value forecast *next year's* outcome? (SIERA and xFIP beat FIP here; SIERA's next-year ERA prediction lands ~0.24 runs closer than prior-year ERA does.)
- **Prescriptive:** Given the model, what change should the athlete make — and does making it actually improve outcomes?

Jonathan Judge's 2023 Baseball Prospectus benchmark ("An Updated Evaluation of Hitting and Pitching Metrics") is the cleanest public example of grading these separately, using weighted Spearman rank correlations on team-switchers (231 switchers, 342 stayers; 5,000-resample bootstrap; SD .05–.07). His pitching run-estimator results (2021–2022):

| Metric | Reliability | Predictiveness (next-yr ERA/RA9) |
|---|---|---|
| DRA (updated) | 0.53 | 0.26 |
| cFIP | 0.51 | 0.25 |
| SIERA | 0.46 | 0.18 |
| xFIP | 0.44 | 0.19 |
| FIP | 0.34 | 0.19 |
| ERA | 0.13 | 0.10 |

DRA wins descriptiveness and reliability; nothing predicts next-year ERA well (ceiling ~.26). Stuff+ reliability is high in isolation (Stuff+ .74, Location+ .62, Pitching+ .59) — but reliability is not predictiveness, which is the whole trap.

**Prescriptive is the hardest and least validated tier**, and it's exactly where Neptune lives. "Your slider's Stuff+ would rise 8 points if you added 100 rpm" is a prescriptive claim, and it's only true if (a) the pitcher can actually make that change, (b) the change doesn't wreck something else (command, health), and (c) the Stuff+ gain converts to real run prevention. Public stuff models are descriptive/predictive tools being *used* prescriptively with almost no validation of the prescription. The honest move is to frame prescriptions as hypotheses to be tested on the athlete, then measure the actual before/after.

**For Soto:** Tag every Triton metric in `docs/VARIABLES.md` with its primary job (descriptive / predictive / prescriptive) and never let a descriptive number be quoted as a forecast in the analyst chat or reports. For Neptune, the assessment→programming→monitoring spine is inherently prescriptive: build it so every prescription logs a hypothesis and a follow-up re-measurement, turning the facility into its own validation loop. For Trevor's own training, a Stuff+ gain on a rebuilt pitch is a *hypothesis* until it shows up in whiffs/results off a real hitter.

---

## 5. The team-switcher stress test and portability of "stuff"

Judge's most provocative 2023 finding: Stuff+ predicted next-year ERA at **r=.41 for pitchers who stayed on the same team**, **.33 for all pitchers**, but only **.14 for the 231 pitchers who switched teams** — worse than FIP for that group (promising). Location+ ran the opposite way (.00 same-team, .24 switchers). His hypothesis: some of what stuff metrics "measure" is really team/park characteristics and how a specific org deploys an arsenal, not portable pitcher skill.

Whether or not the causal story holds, the *method* is the lesson: **team-switchers are a natural experiment that partially controls for park and organizational effects.** If a metric's predictive power evaporates when a player changes environments, part of its apparent skill signal was environmental confound. This is a leakage-adjacent problem — the environment is a hidden variable correlated with both the feature and the outcome.

**For Soto:** Add a team-switcher (and, for Neptune, a facility-switcher / level-changer) hold-out to the Triton validation suite. If Stuff+/command/deception hold up on switchers, that's strong evidence of portable skill; if they collapse like Judge's Stuff+, flag it loudly rather than let a park effect masquerade as arm talent. This matters doubly for MiLB→MLB projection on the Retrosheet/`milb_pitches` spine, where the entire task is predicting performance in a *new* environment.

---

## 6. Command models: the noisy frontier

Command is the hardest thing to model because intent is unobserved — we see where the ball went, not where the pitcher aimed. The two dominant public approaches:

- **Location+ / PitchingBot command:** infer command from location run value given context. Reliable-ish (Location+ r=.74 in Judge's study, or R²≈.39 year-to-year in Rosen's) but confounded by pitch mix and sequencing.
- **Kirby Index (Michael Rosen, FanGraphs, May 2024):** measures release *consistency* — the standard deviation of vertical and horizontal release angle plus release point — as a proxy for command, on the theory that a repeatable release produces repeatable locations. On ~230,000 four-seamers (2023), release trajectory explained **R²=.92 of vertical** and **.85 of horizontal** location. The Kirby Index is stickier year-to-year (**R²=.50, 2022–2023**) than Location+ (**.39**), and stabilizes in **1–2 appearances (25+ four-seamers)**.

But the humbling number: even the Kirby Index caps at **R²≈.14 between the model and a pitcher's fastball run value** (promising). Command is real, measurable, and *still* explains only ~14% of outcome. Any command metric should ship with wide error bars and explicit reliability, not false precision.

**For Soto:** Triton's `pitcher_season_command` should report its own stabilization point and year-over-year reliability, and it should be benchmarked head-to-head against a Kirby-style release-consistency baseline (cheap to compute from TrackMan release data already in `compete_pitches`). Release-consistency metrics are the ideal Neptune facility metric: they stabilize in 1–2 bullpens, require only TrackMan (already in hand), and give an athlete a concrete, trainable target (repeat your release). That's a rare command metric that's both prescriptive-friendly and fast to stabilize.

---

## 7. Calibration: are the probabilities honest?

Discrimination (does the model rank pitches correctly — AUC/correlation) and calibration (do its stated probabilities match observed frequencies) are **separate axes**. A whiff model can nail the ranking yet claim "35% whiff" for pitches that whiff 25% of the time. For hierarchical pitch models like PitchingBot — swing prob × whiff|swing × foul|contact × called-strike|no-swing, composited into expected run value — miscalibration at any stage silently corrupts the xRV that everything downstream depends on (proven).

Standard calibration toolkit:
- **Brier score** — mean squared error of predicted probabilities vs binary outcomes; 0 is perfect; the standard overall probabilistic-accuracy score. Report alongside AUC (which only measures ranking).
- **Log loss** — punishes confident-and-wrong far harder than Brier; a 90%-sure miss is penalized much more than a 60%-sure miss. Report both because they catch different failure modes.
- **Reliability diagram + Expected Calibration Error (ECE)** — bin predictions by confidence, plot predicted vs observed; ECE is the gap in expectation between confidence and accuracy.
- **Fixes:** Platt scaling (logistic) or isotonic regression, **fit on a held-out calibration set** (never the training set — that re-leaks).

**For Soto:** Any Triton model that outputs a probability or a run-value built from probabilities (whiff, called-strike, xRV, and by extension deception/Stuff+ if RV-anchored) needs a reliability diagram + Brier + log loss in its validation report, not just a correlation. When the Compete pipeline eventually shows athletes "expected whiff %" on a pitch, that number must be calibrated or it will mislead a real human making training decisions. Recalibrate whenever the model or the underlying pitch population shifts (new TrackMan firmware, new level of competition).

---

## 8. How public modelers actually benchmark stuff/command models

Synthesizing the field into a repeatable checklist Soto can run against any model:

1. **Forward-in-time train/test** (train past seasons, test the next). Standard across aStuff+ (2021–23→2024), tjStuff+ (2020–22→2023–24), FanGraphs Stuff+, PitchingBot.
2. **Reliability (stickiness):** year-over-year correlation of the metric with itself. tjStuff+ r≈.85; Stuff+ r=.74. High reliability is necessary but *not sufficient*.
3. **Stabilization:** the Nestico "±threshold over every 10 pitches" method or Cronbach-α crossing 0.5–0.7. Report the pitch count.
4. **Predictiveness:** correlate this-year metric to next-year *outcomes* (wOBA, FIP, K-BB%, ERA/RA9). aStuff+ v2 and proStuff+ pitch this as their headline (proStuff+ billed as strongest single-season predictor of next-year K-BB%, FIP, SIERA). The honest ones show it at multiple sample minimums (100-pitch vs 1,000-pitch), because edges shrink as samples grow.
5. **Severe tests / natural experiments:** team-switchers (Judge), cross-subject leave-one-out (biomech literature), out-of-sample seasons. This is where inflated models die.
6. **Head-to-head vs incumbents** on the *same* held-out set — aStuff+ vs FGStuff+, DRA vs FIP/SIERA, Kirby vs Location+. Never benchmark in a vacuum.
7. **Model internals disclosed:** XGBoost is the field default (PitchingBot, aStuff+, most tjStuff+); target is run value / xRV normalized by count, often with platoon splits. Feature importance via SHAP/gain to sanity-check that the model leans on physically sensible inputs (velo, IVB, extension for fastballs).

The maturity signal: the best public modelers report reliability AND predictiveness AND stabilization AND a severe test, and they show performance across sample thresholds. The weak ones report one flattering correlation on a random split.

**For Soto:** Bake this seven-point checklist into a standard "model card" template that every Triton model (Stuff+, command, deception, and future facility metrics) must fill out before shipping — stored next to the code, referenced in `docs/VARIABLES.md`. It's the fastest way to make model quality legible to Trevor and defensible to any analyst who kicks the tires.

---

## 9. Injury/workload models: validate honestly, promise little

Neptune's arm-care spine will be tempted to "predict injuries." The literature says: temper expectations and be rigorous.

- **Oeding et al. (Mayo Clinic / Minnesota Twins collaboration, *Orthopaedic Journal of Sports Medicine*, Aug 2024):** 3,808 pitcher-years (2017–2022), 606 shoulder/elbow IL placements (15.9%). XGBoost with class-weighting, 67/33 train/test, fivefold CV. **AUC 0.66 (95% CI 0.60–0.71); accuracy 0.84.** Reducing to the top 10 features dropped AUC to 0.61. Top SHAP features: pitch velocity, fastball spin rate, horizontal fastball movement, slider usage %, age. Notably, the study did *not* specify pitcher-grouped or temporal stratification — a caveat worth flagging.
- **Karnuta et al. (2020):** 1,245 pitchers, 13,982 player-years (2000–2017); random-forest/ensemble mean **AUC 0.65 ± 0.02 across 10 folds**; ML beat logistic regression.

Two takeaways. First, **AUC ~0.65 is the honest ceiling** for pitcher injury prediction from public tracking/workload data — useful for population risk stratification, useless as an individual guarantee. Second, injury data has severe **class imbalance** (~16% positive) and demands class-weighting plus metrics beyond accuracy (a model predicting "never injured" scores 84% accuracy and is worthless). Report AUC, sensitivity/recall on the injured class, and calibration — not accuracy alone.

**For Soto:** If Neptune surfaces any arm-risk score, present it as a probability band with the model's real AUC attached, class-imbalance handled, and grouped/temporal CV done properly (the exact thing the 2024 study left unspecified). For Trevor — a post-TJ arm managing late-career workload — the framing is risk *monitoring* (trend in his own workload/velocity/release markers over time) rather than a single predictive verdict, which the science does not support. (proven)

---

## Sources

1. FanGraphs — "PitchingBot and Stuff+ Pitch Modeling Is Now on FanGraphs!" (Sarris, Bay, McGrattan, Grove): https://blogs.fangraphs.com/pitchingbot-and-stuff-pitch-modeling-are-now-on-fangraphs/
2. FanGraphs Library — PitchingBot Pitch Modeling Primer: https://library.fangraphs.com/pitching/pitchingbot-pitch-modeling-primer/
3. Driveline Baseball — "Sample Sizes at the Major League Level" (Aug 2018): https://www.drivelinebaseball.com/2018/08/sample-sizes-major-league-pitch-level/
4. Driveline Baseball — "Rethinking the True Run Value of a Pitch With a Pitch Model" (John Asel, Sep 2021): https://www.drivelinebaseball.com/2021/09/rethinking-the-true-run-value-of-a-pitch-with-a-pitch-model/
5. FanGraphs — "A New Way to Look at Sample Size" (Pemstein & Dolinar, Jun 2015): https://blogs.fangraphs.com/a-new-way-to-look-at-sample-size/
6. FanGraphs Library — Sample Size (Carleton stabilization points): https://library.fangraphs.com/principles/sample-size/
7. Baseball Prospectus — "An Updated Evaluation of Hitting and Pitching (Including Stuff) Metrics" (Jonathan Judge, May 2023): https://www.baseballprospectus.com/news/article/82426/prospectus-feature-an-updated-evaluation-of-hitting-and-pitching-including-stuff-metrics/
8. Baseball Prospectus — "DRA and DRA-: A Starter Guide": https://www.baseballprospectus.com/news/article/48108/dra-and-dra-a-starter-guide/
9. Adam Salorio — "Introducing aStuff+ v2" (Mar 2025): https://adamsalorio.substack.com/p/introducing-astuff-v2
10. Thomas Nestico — "Modelling tjStuff+ v3.0" (Oct 2024): https://medium.com/@thomasjamesnestico/modelling-tjstuff-v3-0-10b48294c7fb
11. FanGraphs — "Introducing the Kirby Index: A New Way to Quantify Command" (Michael Rosen, May 2024): https://blogs.fangraphs.com/introducing-the-kirby-index-a-new-way-to-quantify-command/
12. FanGraphs — "Revisiting the Kirby Index": https://blogs.fangraphs.com/revisiting-the-kirby-index/
13. Oeding et al. — "Pitch-Tracking Metrics as a Predictor of Future Shoulder and Elbow Injuries in MLB Pitchers" (OJSM, Aug 2024): https://pmc.ncbi.nlm.nih.gov/articles/PMC11369970/
14. Karnuta et al. — "Machine Learning Outperforms Regression Analysis to Predict Next-Season MLB Player Injuries" (OJSM, 2020): https://journals.sagepub.com/doi/full/10.1177/2325967120963046
15. arXiv — "Cross-individual generalizability of machine learning models for ball speed prediction in baseball pitching" (2026): https://arxiv.org/abs/2605.05487
16. Prospects Live — "The Creation of Predictive Stuff Metrics: Introducing the pSTFERA Suite": https://www.prospectslive.com/the-creation-of-predictive-stuff-metrics-introducing-the-pstfera-suite/
17. MachineLearningMastery — "How to Avoid Data Leakage When Performing Data Preparation": https://machinelearningmastery.com/data-preparation-without-data-leakage/
