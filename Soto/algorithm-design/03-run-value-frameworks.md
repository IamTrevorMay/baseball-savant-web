---
title: Run Value Frameworks — Linear Weights, RE24/RE288, and the Per-Pitch Run-Value Foundation
domain: algorithm-design
tags:
  - run-value
  - linear-weights
  - re24
  - re288
  - delta-run-expectancy
  - pitch-modeling
  - woba
  - stuff-plus
sources_reviewed: 20
last_updated: 2026-07-19
---

# Run Value Frameworks — Linear Weights, RE24/RE288, and the Per-Pitch Run-Value Foundation

## TL;DR

- **Run expectancy is the base currency of all modern valuation**: the RE24 matrix gives expected runs to end of inning for each of 24 base-out states (bases empty/0 out ≈ 0.48–0.51 runs; runner on 1st/0 out ≈ 0.83; 1st-and-3rd/0 out ≈ 1.80; bases loaded/2 out ≈ 0.80–0.96 depending on era). Every event's value = RE(after) − RE(before) + runs scored. (proven)
- **Linear weights are just averaged RE24 deltas per event type**: modern MLB values run roughly 1B +0.47, 2B +0.78, 3B +1.05, HR +1.40, NIBB +0.32, out −0.27 runs vs average — nearly unchanged since George Lindsey's 1963 estimates (.41/.82/1.06/1.42). wOBA is these weights rescaled to an OBP-like scale (FanGraphs 2023 wOBA weights: BB .696, HBP .726, 1B .883, 2B 1.244, 3B 1.569, HR 2.004). (proven)
- **Adding the 12 ball-strike counts to the 24 base-out states gives RE288 (24×12)** — the framework that assigns a run value to *every pitch*, not just every PA. A first-pitch strike is worth ≈ −0.04 runs with bases empty/0 out but ≈ −0.14 with bases loaded/1 out; a 3-2 bases-loaded/2-out called strike three swings ≈ 0.9 runs. (proven)
- **Count run values (2015 Retrosheet, bases-neutral): 0-0 = 0.000, 1-0 = −0.037, 0-1 = −0.096, 2-0 = +0.002, 1-1 = −0.060, 0-2 = −0.129, 3-0 = +0.109, 2-1 = −0.021, 1-2 = −0.113, 3-1 = +0.149, 2-2 = −0.116, 3-2 = +0.034** (mean run value of PAs passing through each count, relative to 0-0). The marginal value of one ball ≈ +0.05 to +0.06 runs and one strike ≈ −0.06 to −0.09, growing sharply in two-strike and three-ball counts. (proven)
- **Statcast ships this pre-computed**: the `delta_run_exp` column ("the change in Run Expectancy before the Pitch and after the Pitch") exists on every Statcast pitch row — meaning Triton's 7.4M-row `pitches` table already carries a per-pitch run-value ground truth over ~700K pitches/season. (proven)
- **Context-neutral vs. leveraged is a deliberate modeling fork**: Savant computes both a context-neutral run value (base/out impact stripped; count kept) and a leveraged version (full base-out weighting). Skill estimation should use context-neutral; narrative/"what happened" accounting (RE24, inherited runners, clutch) should use context-dependent. (proven)
- **Raw per-pitch run value is skill-poor**: FanGraphs pitch-type linear weights have year-to-year correlations below 0.25 — which is exactly why every serious pitch model (PitchingBot, Driveline Stuff+, public xRV models) predicts *expected* run value from pitch characteristics instead of averaging observed RV. Public xRV models report R² ≈ 0.76 vs. actual RV with per-pitch RMSE ≈ 0.14–0.16 runs. (proven)
- **Run environments are stable enough to reuse recent matrices**: 2021–24 RE24 values differ from 2015–19 by only −0.04 to +0.09 runs per state ("basically nothing"), even as K% climbed from 16.8% (2000–04) to 22.7% (2021–24) and HR frequency rose ~10%. Rebuild matrices per era (and separately per level — AAA, college, HS), not per season. (proven)

## 1. Why Run Value Is the Foundation (and a 60-Year Pedigree)

Every question Soto's models answer — "is this a good pitch?", "did that outing help?", "what's this arsenal worth?" — reduces to one currency: **expected runs**. Runs win games (≈10 runs ≈ 1 win in a modern environment), so any metric that can't be expressed in runs is a proxy that must eventually be cashed out into runs anyway.

The lineage matters because it shows the framework is *empirical accounting*, not a model that can be wrong:

- **George Lindsey (1963)**, an operations-research officer, hand-scored ~400 games with his father and published "An Investigation of Strategies in Baseball," the first run-expectancy-derived event values: 1B = .41, 2B = .82, 3B = 1.06, HR = 1.42 runs. (proven)
- **Pete Palmer (1984)**, *The Hidden Game of Baseball*, formalized the Linear Weights System and — critically — charged batters for outs (negative weights), making the system zero-sum around league average. (proven)
- **Tango/Lichtman/Dolphin (2006)**, *The Book*, operationalized the 24-state run expectancy matrix, derived wOBA from linear weights, and introduced count-state analysis that became RE288. (proven)
- **Statcast era (2019– )**: Tango's team put per-pitch run values into production (swing/take leaderboards, `delta_run_exp` in the public CSV), making RE288-style valuation the default substrate for every public and private pitch model. (proven)

The 60-year stability of the event values themselves — Lindsey's 1963 HR value (1.42) vs. the modern one (~1.40) — is the strongest evidence that this layer of the stack is settled. (proven)

**For Soto:** treat the run-value layer as infrastructure, like a unit system. Debates belong one layer up (what *predicts* run value), never at this layer.

## 2. RE24: The 24-State Run Expectancy Matrix

**Definition.** For each of 8 baserunner configurations × 3 out states, RE = the average number of runs scored from that state to the end of the inning, computed over all instances in a chosen sample. The value of any play:

```
RE24(play) = RE(end state) − RE(start state) + runs scored on the play
```

Reference values (FanGraphs neutral ~4.15 R/G environment): bases empty/0 out = 0.481; runner on 1st/0 out = 0.831; 1st-and-3rd/0 out = 1.798; bases loaded/2 out ≈ 0.80. A single that moves a runner first-to-third with 0 outs = 1.798 − 0.831 + 0 = **+0.967 runs**. A bases-loaded, 2-out HR = 4 runs scored + 0.10 (new state) − 0.80 (old state) ≈ **+3.3 runs**, vs. exactly +1.0 for a solo HR with empty bases and 0 outs. Same event, different run value — that asymmetry is the whole point of RE24. (proven)

**Era sensitivity — smaller than people assume.** FanGraphs' 2020s rebuild found 2021–24 state values differ from 2015–19 by only **−0.04 to +0.09 runs** across all 24 states. The 2000–04 vs. 2021–24 comparison shows real but modest decay concentrated in contact-dependent states: runner-on-3rd/0-out fell ~0.11 runs because K% rose from 16.8% to 22.7% between those eras, while HR frequency rose ~10% and backfilled overall scoring. Practical rule: a 3–5 year rolling matrix per level is plenty; per-season matrices just add noise. (proven)

**Benchmarks (season RE24 for hitters, FanGraphs):** +45 excellent, +30 great, +15 above average, 0 average. RE24 is also the correct accounting tool for relievers because it prices inherited runners — a reliever who enters with bases loaded/1 out inherits a ~1.5–1.6-run liability, and RE24 charges/credits the escape correctly where ERA does not. (proven)

**For Soto:** build `re24_matrix` as a small derived table in Triton keyed by (era_band, level, outs, base_state), computed straight off `pitches`/`milb_pitches`/Retrosheet events. It's ~dozens of rows per era-level and unlocks everything below. The Retrosheet spine (PBP 1914+) supports era-specific matrices for historical work — run environments before ~1990 differ enough (deadball ≈ 3.5 R/G vs. 2000s ≈ 4.8+) that reusing a modern matrix on 1968 data is a real error, not a rounding one.

## 3. Linear Weights and wOBA: Context-Neutral Event Values

Average the RE24 delta of every instance of an event type across a season and you get its **linear weight** — the context-neutral run value of that event:

| Event | Runs vs. avg (modern MLB) | Lindsey 1963 |
|---|---|---|
| NIBB | +0.32 | — |
| HBP | +0.34 | — |
| 1B | +0.47 | +0.41 |
| 2B | +0.78 | +0.82 |
| 3B | +1.05 | +1.06 |
| HR | +1.40 | +1.42 |
| Out | −0.27 | — |

(proven)

**wOBA is a rescaling, not a new idea.** Tango added the out value to each event weight (making all weights positive) and scaled the result so league wOBA ≈ league OBP. FanGraphs' 2023 constants: BB .696, HBP .726, 1B .883, 2B 1.244, 3B 1.569, HR 2.004, over (AB + BB − IBB + SF + HBP). The transformation is arbitrary but harmless as long as you convert back to runs via `wRAA = (wOBA − lgwOBA) / wOBA_scale × PA`. (proven)

Two properties make linear weights the right *skill* currency: (1) they strip base-out luck — a hitter doesn't control whether teammates are on base; (2) they're additive, so any event taxonomy (including per-pitch events) can be priced consistently. The known limitation: they assume an average context, so they misprice extreme environments (a HR is worth relatively more on a team that never puts runners on; FanGraphs has published environment adjustments for this). For 99% of Soto's use cases the average-context assumption is fine. (proven)

## 4. Extending to the Pitch: Count States, RE12, and RE288

A PA-level framework can't value the 5–6 pitches inside a PA. The fix is to treat the ball-strike count as part of the game state.

**Count-level run values (the RE12 layer).** Mean run value of all PAs passing through each count, relative to 0-0 (2015 Retrosheet, per Jim Albert):

| Count | RV | Count | RV | Count | RV |
|---|---|---|---|---|---|
| 0-0 | 0.000 | 1-1 | −0.060 | 3-0 | +0.109 |
| 1-0 | −0.037* | 2-0 | +0.002 | 3-1 | +0.149 |
| 0-1 | −0.096 | 1-2 | −0.113 | 2-2 | −0.116 |
| 0-2 | −0.129 | 2-1 | −0.021 | 3-2 | +0.034 |

*Note: tables of "value of PAs passing through the count" (shown here) differ slightly from "expected value at the count" tables; the shape — hitter counts positive, two-strike counts strongly negative — is universal. The marginal value of a single ball is ≈ +0.05–0.06 runs and a single strike ≈ −0.06–0.09, and the marginals grow at the edges: 0-1→0-2 and 2-2→3-2 transitions move more value than 0-0→1-0. Batting outcomes confirm the leverage: MLB hitters bat ~.289 after 2-0, ~.166 after 0-2. (proven)

**RE288 = 24 base-out states × 12 counts.** Each of the 288 states has its own expected-runs value; every pitch's run value is the change between states (plus any runs scored). Tango's worked examples: a strikeout is −0.227 runs with bases empty/0 out but −0.789 with bases loaded/1 out; going 0-0→0-1 is −0.04 empty/0 out but −0.14 loaded/1 out; a HR on 0-2 with bases empty = 1 run + 0.51 (new PA, empty/0-0) − 0.42 (empty 0-2 state) = **+1.09 runs** — more than the +1.00 of a 0-0 homer, because the batter was expected to do *worse* than average from 0-2. This grid yields run values for all ~700K+ MLB pitches per season, aggregable by location, pitch type, swing/take, or anything else. (proven)

Public implementations to crib from: `baseballr::run_expectancy_code()` (builds RE matrices from Savant data), the open `re288-matrix` GitHub project, and Rosternomics' RE288-since-1988 explorer built on Retrosheet (24×12 grid per era, `build_re288.py`). (proven)

**For Soto:** RE288 is buildable directly from Triton's `pitches` table (balls/strikes/outs/base columns all present). But note the shortcut in §5 — MLB already did it.

## 5. Statcast Delta Run Expectancy: The Production Standard

MLB's Statcast feed carries **`delta_run_exp`** on every pitch row — "the change in Run Expectancy before the Pitch and after the Pitch." This is the RE288-style value, precomputed by MLB, sitting in Triton's `pitches` table today. Related columns: `woba_value`/`woba_denom` (event-level linear-weight accounting) and `delta_home_win_exp` (win-probability layer). Savant's Run Value leaderboards, pitch-arsenal run values, and swing/take charts are all straight aggregations of this column. (proven)

**Two flavors, on purpose.** Savant publishes both:
- **Context-neutral RV** — "excludes the impact of the base/out situation"; the count still matters, but bases-empty and bases-loaded versions of the same pitch outcome are priced identically. Use for skill.
- **Leveraged RV** — full base-out weighting; a bases-loaded 3-2 punchout is worth ≈ ±0.9 runs. Use for narrative, game recaps, reliever usage analysis, and clutch accounting. Savant even reports the *gap* between the two as a player's leverage-timing profile. (proven)

**Swing/take attack zones** are the canonical aggregation: Heart (~25% of pitches, ~75% swing rate), Shadow (~40%+ of pitches, ~50% swing, called pitches ≈ 50/50), Chase (~25% of pitches, ~25% swing, takes are free balls), Waste. Summing per-pitch RV over zone × decision produces the swing/take run values that decompose a hitter's (or pitcher's) season into decisions and outcomes. (proven)

**For Soto:** before writing any SQL, verify `delta_run_exp` is populated in the `pitches` ingest (it's in the standard Savant CSV; check the cron mapping). If it is, Triton gets per-pitch run value for 7.4M pitches for free. Two caveats: (a) Savant's column is leveraged-ish (it reflects actual base-out state) — for skill metrics, build a count-only RV mapping (12-state or 288-state collapsed over bases/outs) and use that as the modeling target; (b) `milb_pitches` and TrackMan `compete_pitches` do NOT carry it — for those, apply Triton's own count-transition RV table (§7).

## 6. Context-Neutral vs. Context-Dependent: Choosing the Right Lens

This is the single most common design error in run-value work, so make the rule explicit:

| Question | Correct lens | Tooling |
|---|---|---|
| How skilled is this player/pitch? | Context-neutral (linear weights, count-only pitch RV) | wRAA, wOBA, Stuff+/xRV targets |
| What actually happened / who moved the game? | Context-dependent | RE24, leveraged RV, WPA |
| Reliever value with inherited runners | Context-dependent | RE24 |
| In-game tactical decisions (IBB, bunt, steal) | Context-dependent, ideally batter-specific | RE matrix + adjustments |

- Context-dependent stats describe outcomes but add mostly noise as skill estimators — situational overperformance (RE24 minus wRAA-style expectation) shows weak year-to-year persistence, i.e., "clutch" is mostly not a stable skill at the season level. (proven, with the standard caveat that small persistent effects can hide under season-level noise) (promising for any individual-player clutch claim)
- **Batter-specific run expectancy** (FanGraphs tool, 2016) shows why tactical decisions need more than the league matrix: bases loaded/1 out ranges from ~2.0 expected runs with a .230-wOBA hitter up to ~3.2 with a .370-wOBA hitter — a 1.2-run spread inside one "state." League-average RE is a fine accounting baseline but a blunt tactical instrument. (proven)
- openWAR (Baumer/Jensen/Matthews, 2013) formalized the conservation principle: every run of RE change on a play is partitioned among batter, runners, pitcher, and fielders so the ledger sums exactly to runs scored — a useful discipline for any multi-actor attribution Soto designs. (proven)

**For Soto:** Triton's Stuff+/command/deception stack should be strictly context-neutral. Save leveraged RV for broadcast/producer surfaces — "that pitch swung the inning by 0.9 runs" is a great overlay stat precisely because it's context-dependent.

## 7. Building Pitch-Level Models on the Run-Value Foundation

**The naive approach and why it fails.** FanGraphs' pitch-type linear weights (wFB, wSL; wFB/C per 100 pitches) simply sum observed count-transition run values by pitch type. They're descriptively true and predictively weak: **year-to-year correlation below 0.25**, because (a) balls in play inject batted-ball and defense luck, (b) a pitch's observed RV bundles sequencing and the rest of the arsenal, (c) samples per pitch type are small. Roughly 100 pitches of a type tells you almost nothing about its true RV. (proven)

**The fix every modern model uses: predict expected RV from pitch characteristics.** The pattern:

1. **Target**: per-pitch run value — count-adjusted (normalized so the average from any count is zero), context-neutral over bases/outs.
2. **Features**: velo, IVB/HB, spin, release point, extension, approach angles (stuff models); plus location and count (command/overall models).
3. **Model**: gradient boosting or random forest, split by pitch class and handedness matchup.
4. **Output**: xRV per pitch → aggregate → rescale to 100-based "plus" within pitch-class buckets.

Reference implementations and numbers:
- **PitchingBot** (FanGraphs): XGBoost; predicts outcome *probabilities* (ball/strike/whiff/BIP quality) then weights each outcome by its run value → xRV; explicitly "normalized such that the average from any count is always zero"; three heads — botStf (physical only), botCmd (location+count only), botOvr (everything); reported as botxRV100 (runs per 100 pitches) and botERA. The two-stage outcome-probability → RV-weighting design is the cleanest architecture because it de-noises the BIP tail. (proven as architecture; promising on relative accuracy vs. one-stage)
- **Public xRV** (Ajay Patel): 24 random-forest models (4 handedness matchups × 6 pitch types), 2016–2022 Statcast, target = Statcast run value; R² = 0.76 vs. actual RV, per-pitch test RMSE 0.140–0.156 by pitch type; found location/command mattered more than pure-stuff models imply, and extension mattered least. (promising — public model, in-sample flavored R²)
- **Driveline Stuff+ v4** (2024 revision): features velo, VB, HB, arm angle, extension, and location-adjusted VAA/HAA (location itself excluded); converts expected RV to a plus scale against the average RV within pitch-class buckets (FB / breaking / offspeed); retrained as the league adapts (sweeper adjustment, rising velo). (promising — methodology public, validation numbers not published)
- **Stuff+ (Sarris/Bandit's version on FanGraphs)**: same family; stuff-only regressed against run value; 100 = average, SD ≈ 10 on the plus scale. (promising)

**Reliability hierarchy** (why stuff models exist at all): stuff-model outputs stabilize in ~100–200 pitches; whiff rate in a few hundred; observed pitch RV needs thousands and never fully stabilizes within a season. The further downstream from contact the target, the faster it stabilizes. (proven in direction; specific stabilization points vary by study) (promising)

**Attribution rules worth adopting** (all standard practice): the pitch that ends the PA absorbs the full PA-ending event value (so a 6-pitch walk credits +ball RV to pitches 1–5's transitions and the final ball completes the sum to ≈ +0.32); foul balls with two strikes are RV ≈ 0 (state unchanged); HBP priced like its event value at the count. The elegant property of count-transition accounting: per-PA pitch RVs telescope — they sum exactly to the PA's event linear weight. (proven)

## 8. Implementation Blueprint for Triton / Neptune

**Step 1 — Ground-truth layer (Triton).** Confirm/ingest `delta_run_exp` on `pitches`. Build two derived tables: `re24_matrix(era_band, level, outs, base_state, re)` and `count_rv(era_band, level, balls, strikes, rv)` — the latter computed as mean run value of count transitions collapsed over bases/outs (context-neutral). Log the build queries to `docs/Queries.md`, register new metric keys in `docs/VARIABLES.md` per repo convention.

**Step 2 — Level-specific matrices.** MLB values do not transfer to AAA, college, or HS: run environments and count leverage differ (e.g., collegiate linear-weight sets differ materially from MLB's; MiLB run environments run hotter). Build `count_rv` per level from `milb_pitches` (mind the Title-Case events normalization) and, for amateur levels Neptune serves, either borrow published collegiate weights or fit from available TrackMan game data. (proven that levels differ; plausible that HS matrices can be estimated well from sparse data — use heavy pooling/shrinkage)

**Step 3 — Upgrade Stuff+ from z-score to RV-trained.** Triton's current Stuff+ (`100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`) uses hand-set weights. The migration path: keep the exact same features, but fit the weights by regressing count-adjusted, context-neutral per-pitch RV on the z-scores (per pitch_name/game_year bucket, mirroring `pitch_baselines`). That converts an opinion-weighted index into an RV-calibrated one with near-zero architectural change — shippable incrementally, per repo constraints. Phase 2: gradient boosting with a PitchingBot-style outcome-probability head. Validate against the <0.25 year-to-year bar for raw pitch RV: any model output should beat that comfortably (good stuff models land ~0.6–0.8 year-to-year on 1,000+ pitch samples). (promising)

**Step 4 — TrackMan/Compete without outcomes.** Bullpen and cage sessions have no batter outcomes, hence no observed RV. The run-value framework still applies through *expected* RV: score each `compete_pitches` row with the Triton xRV model (stuff head for pens; stuff+location vs. an intended-target for command work). This is exactly how Driveline grades pen sessions. (proven pattern)

**Step 5 — Neptune training targets in run units.** The count-RV table converts coaching cues into priced goals: winning 1-1 (going to 1-2 instead of 2-1) is worth ~0.09 runs per instance; first-pitch strike ~0.08–0.10; a chase-zone take costs the pitcher ~a ball's value while a chase swing is nearly always pitcher-positive. Athlete dashboards that price count wins in runs ("your 1-1 win rate gained you 2.4 runs this month") are both rigorous and legible to a 16-year-old. (proven arithmetic; promising as a coaching-communication tactic)

**Step 6 — Broadcast layer.** Leveraged RV and RE24 swings are made for the producer panels: "that AB was worth +0.97 runs" or a live RE288 win-the-count graphic. Cheap to compute from the same tables.

**For Trevor specifically:** his own throwing data (Compete sessions) should be graded on the context-neutral stack only — expected RV per pitch and command-adjusted xRV vs. target. At the demo/content level, the leveraged framing ("this pitch in a real game, bases loaded, is a ±0.9-run pitch") is the storytelling hook.

## Sources

1. FanGraphs Library — RE24: https://library.fangraphs.com/misc/re24/
2. FanGraphs Library — Linear Weights: https://library.fangraphs.com/principles/linear-weights/
3. Tangotiger — Statcast Lab: Swing/Take and a Primer on Run Value: https://tangotiger.com/index.php/site/article/statcast-lab-swing-take-and-a-primer-on-run-value
4. Tangotiger — Run Values by Pitch Count: https://tangotiger.com/index.php/site/article/run-values-by-pitch-count
5. FanGraphs — The Run Expectancy Matrix, Reloaded for the 2020s: https://blogs.fangraphs.com/the-run-expectancy-matrix-reloaded-for-the-2020s/
6. Jim Albert (Bayesball) — Count Effects: https://bayesball.github.io/BLOG/Count_Effects.html
7. Jim Albert (Bayesball) — Runs Expectancy: https://bayesball.github.io/BLOG/Runs_Expectancy.html
8. FanGraphs Library — Pitch Type Linear Weights (pitching): https://library.fangraphs.com/pitching/linear-weights/
9. FanGraphs Library — The Beginner's Guide to Deriving wOBA: https://library.fangraphs.com/the-beginners-guide-to-deriving-woba/
10. Stanford STATS 50 — Derivation of the wOBA: https://web.stanford.edu/class/stats50/files/STATS_50_Derivation_of_the_wOBA.pdf
11. Baseball Savant — Statcast Search CSV Documentation (delta_run_exp): https://baseballsavant.mlb.com/csv-docs
12. Baseball Savant — Swing/Take Run Value Leaderboard: https://baseballsavant.mlb.com/leaderboard/swing-take
13. FanGraphs Library — PitchingBot Pitch Modeling Primer: https://library.fangraphs.com/pitching/pitchingbot-pitch-modeling-primer/
14. FanGraphs — PitchingBot and Stuff+ Pitch Modeling Are Now on FanGraphs: https://blogs.fangraphs.com/pitchingbot-and-stuff-pitch-modeling-are-now-on-fangraphs/
15. Driveline Baseball — Revisiting Stuff+ (2024 methodology update): https://www.drivelinebaseball.com/2024/05/revisiting-stuff-plus/
16. Driveline Baseball — What is Stuff? Quantifying Pitches with Pitch Models: https://www.drivelinebaseball.com/2021/12/what-is-stuff-quantifying-pitches-with-pitch-models/
17. Ajay Patel — xRV: Working Through Quantifying Pitches: https://ajaypatell8.medium.com/xrv-working-through-quantifying-pitches-1f9125e1c833
18. FanGraphs — Introducing the Batter-Specific Run-Expectancy Tool: https://blogs.fangraphs.com/introducing-the-batter-specific-run-expectancy-tool/
19. Baumer, Jensen, Matthews — openWAR (arXiv:1312.7158): https://arxiv.org/pdf/1312.7158
20. Dan Agonistes — A Brief History of Run Estimation: Batting Runs (Lindsey 1963, Palmer): http://danagonistes.blogspot.com/2004/10/brief-history-of-run-estimation.html
21. Rosternomics — Run Environments: RE288 since 1988: https://www.rosternomics.com/run-environment
22. baseballr — run_expectancy_code reference: https://billpetti.github.io/baseballr/reference/run_expectancy_code.html
