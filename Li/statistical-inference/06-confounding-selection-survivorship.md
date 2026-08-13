---
title: Confounding, Selection and Survivorship — The Data You Have Is Not the Data You Would Need
domain: statistical-inference
tags:
  - confounding
  - selection-bias
  - survivorship
  - censoring
  - park-effects
  - opponent-quality
  - causal-inference
  - game-type
sources_reviewed: 22
last_updated: 2026-08-12
---

# Confounding, Selection and Survivorship — The Data You Have Is Not the Data You Would Need

> Grades: **(established)** published/replicated; **(computed)** off Triton code or verified arithmetic;
> **(estimated)** theory; **(folk-sabermetrics)** repeated, never demonstrated. No database queried;
> packet figures dated 2026-08-12.
>
> `metric-governance/07` §6 owns the biases *qualification* introduces (truncation, Berkson collider,
> two-stage leaderboard selection). This doc covers upstream — who is in the table at all — and
> downstream: park, opponent, the causal claims we are entitled to. `metric-governance/06` owns
> park-factor *mechanics*; here park is a confound, including one factors cannot fix.

## TL;DR

- **Only confounding yields to adjustment; selection and censoring do not** — both already deleted the rows you would condition on. **(established)**
- **Censoring is invisible: `players.team` is populated on 0 of 16,931 rows — no roster or IL state exists.** A blown elbow and a rest day are one row-shape. **(computed)**
- **Demotion does not stop the data, it moves it to `milb_pitches`** (2.51M rows, 2023+, other baselines): MNAR dropout, one anti-join from observable. **(computed / established)**
- **Dropout is asymmetric, which fixes the sign: bad results end a stint, good ones extend it**, so aging, durability and "did he adapt" curves run optimistic. **(established mechanism; estimated magnitude)**
- **Park confounds Stuff+ through the *measurement*, so no park factor repairs it** — the Coors air-density penalty (§4.1) is the size of the move `01` called undetectable. **(established physics; computed on an estimated effect)**
- **`PARK_FACTORS` is a static correction for a time-varying confound** — one 2024 team-keyed vintage across 2015–2026, by *modal* team, unmapped codes falling through `|| 100`. **(computed)**
- **Spring and postseason pitches sit inside every Stuff+ baseline and plus-stat denominator** — three refresh paths carry no `game_type` predicate while `/api/sos` does. **(computed)**
- **The two contaminations push opposite ways at opposite ends of the season**, imposing a seasonal shape on the expanding-window denominator, not cancelling. **(estimated)**
- **Triton measures the opponent confound well, then ignores it:** `sos_scores` is leave-one-out opponent xwOBA regressed at k = 60 PA, and it adjusts no metric. **(computed)**
- **The commonest causal error here is adjusting for a mediator:** controlling Stuff+ for velocity deletes 4.5 of 10 z-weights and the mechanism at once. **(established)**
- **Triton supports difference-in-differences and within-pitcher fixed-effects claims, but no treatment-effect claim** — no intervention log for grips, new pitches or rehab. **(computed)**

---

## 1. Three defects that look identical on a dashboard

| Defect | Structure | Effect on the estimate | Fixable by adjustment? |
|---|---|---|---|
| **Confounding** | Common cause C → X, C → Y | Bias of either sign | **Yes** — condition on C, if recorded |
| **Selection** | Condition on a collider / descendant of Y | Often toward null, or reversed | **Sometimes** — weight, if the selector is recorded |
| **Censoring** | Y determines whether the row exists | Follows the dropout rule | **Only with a dropout model** |

What is on disk decides: an uncontrolled confounder is still in the table (fix: `GROUP BY`), while selection and censoring removed the evidence — their fix is a design or an assumption, never a query. Apply the backdoor criterion: block every path into the exposure that does not run through it, none that do (§7). Selection bias is conditioning on a common effect (Hernán, Hernández-Díaz & Robins). (established)

---

## 2. What Triton conditions on without meaning to

Every row in `pitches` survived four filters, each a conditioning event.

| Filter | Selected on | Consequence |
|---|---|---|
| Pitcher on an MLB roster | past performance, health, service time | Left truncation; §3's survivors |
| The outing happened | health *that day*, leverage, manager's read | Absent-on-purpose ≡ absent-because-hurt |
| The pitch was chosen | count, batter hand, base state, game state | Samples not self-weighting (`01` §8) |
| Tracking produced a row | park install, weather, occlusion, non-null velo | Missingness correlated with venue (§4.3) |

Row 3 is forgotten: a slider sample is the sliders he *chose*, so **two months of slider Stuff+ compare differently-selected populations**. If usage moved (Povich: FF 43% → 49%) the composite shifted before any arm changed — Simpson's paradox at pitch-type grain (`11-aggregation-bias-weighting.md`). (established)

---

## 3. Injury and demotion censoring

### 3.1 No roster state exists

`players` holds 16,931 rows; `team` is populated on **0** — no IL table, option status or transaction log. The only signal a pitcher stopped is absence, without reason. **(computed)**

| Real reason | What Triton sees | Correct handling | Available |
|---|---|---|---|
| Scheduled rest | no rows | ignore (≈MCAR) | — |
| Optioned to Triple-A | rows in `milb_pitches` | informative dropout | yes, by join (§3.2) |
| Injured list | no rows | censor at IL date | **impossible** |
| Released / retired | no rows | terminal censoring | **impossible** |
| Season ended | no rows | administrative censoring | from calendar |

Rows 3 and 4 are **informative right-censoring**: removal is caused by the measurement going bad, so Kaplan–Meier's independence assumption fails. It is the **healthy-worker effect** — "Stuff+ held up all season" names a cohort defined by illness removing the others. (established)

### 3.2 Demotion is a table boundary, and that is a gift

A demoted pitcher's next pitch *is* recorded, against another baseline (`08-cross-level-comparability.md`): **the unobservable censoring mechanism is one anti-join away.**

```sql
-- MLB seasons that "ended" while the pitcher kept throwing in MiLB.
SELECT p.pitcher, MAX(p.game_date) AS last_mlb, MIN(m.game_date) AS first_milb
FROM pitches p JOIN milb_pitches m ON m.pitcher = p.pitcher AND m.game_year = p.game_year
WHERE p.game_year = 2025 AND p.game_type = 'R'
GROUP BY p.pitcher HAVING MIN(m.game_date) > MAX(p.game_date);
```

Materialised as `player_level_stints`, dropout becomes modellable and trend lines can end at the stint boundary, not trail into blank space meaning "sent down."

### 3.3 Direction of the bias, and why it grows with the window

A bad month ends a marginal stint, a good month extends it, so "still in `pitches` in September" conditions on having performed — `metric-governance/07` §6.2's collider, running *continuously* on the roster. **(established)** direction, **(estimated)** magnitude:

- **Aging and durability curves on survivors are optimistic**, more so the longer the window: the filter reapplies monthly.
- **"Pitchers who added a sweeper improved" is unfalsifiable here** — those who added one and got worse were demoted out of the numerator. **(folk-sabermetrics)** until the stint table exists.
- **Immortal time:** "made 20 starts" guarantees no injury in the window defining the group; a 5-start group does not.

---

## 4. Park as a confound

`metric-governance/06` builds the *factors*; three confounds it leaves open belong here.

### 4.1 Park confounds the input to Stuff+, not the output

Stuff+ is `z(release_speed)·4.5 + z(total_movement_in)·3.5 + z(release_extension)·2.0`; the middle term is **movement measured in the actual air**, and Magnus force scales with density. Coors at ~5,280 ft runs ~82% of sea level; `metric-governance/06` §6.2 puts the cost at **3–4 Stuff+ points per pitch** — at ~half a starter's pitches, **~1.5–2.0 points** of season Stuff+ versus the same arm in Miami. **(computed** on an **estimated** effect.)

`01` §5 puts a 2.3-point move over 149 pitches *below* the 3.0–4.2 MDE: **the park confound on a Rockies arm is the size of the effect we cannot detect**, and being bias it does not shrink with n.

A run-scale factor cannot fix it: `PARK_FACTORS.COL.basic = 113` is a *runs* index, the defect is *inches of break*, and dividing a movement z-score by 1.13 is the unit error `metric-governance/06` flags in `/api/park-adjusted`. Needed instead: an air-density term (elevation, temperature, humidity, pressure) on `pfx_x`/`pfx_z` **before** the z-score.

### 4.2 A static correction for a time-varying confound

| Property of `PARK_FACTORS` | Effect on the confound |
|---|---|
| One 2024 vintage, 31 team keys, no season axis | Constant while parks were not (humidor, fences, moves) |
| Keyed by **team**, not venue | Relocations and temporary parks inherit the wrong building |
| Modal team (`MODE() WITHIN GROUP`) | A traded player gets one park for a split season |
| `PARK_FACTORS[team]?.basic \|\| 100` | Unmapped ⇒ silently neutral; **every MiLB park is neutral** |

The last row is sharpest: a silent `|| 100` does not leave the confound unadjusted, it *asserts* an adjustment — unadjusted and fabricated-100 indistinguishable downstream, what `metric-governance/10-audit-trails-provenance.md` exists to prevent. **(computed)**

### 4.3 Park confounds the instrument

Hawk-Eye is installed, calibrated and occluded per venue, so systematic per-park offsets in tracked release point and movement look identical to talent and correlate with team — park mix is set by the employer. Baseball Prospectus' PitchTrax work shows they are real and not small; Triton runs no park-level calibration diagnostic. **(established** effect; magnitude unmeasured.)

---

## 5. Game type: the population is wrong before any adjustment runs

`pitches` spans **2015-03-03 → 2026-08-10**; Opening Day 2015 was in April, so the table starts in **spring training** — `game_type` filtering is load-bearing from row one. `/api/cron/pitches` ingests `S` Feb–Mar, `R` Mar–Sep, `P` Oct–Nov. **(computed)**

| Consumer | `game_type` predicate | Consequence |
|---|---|---|
| `refreshPitchBaselines` (`update/route.ts:241–286`) | **none** | Spring + postseason in every baseline row |
| `applyStuffPlusForDateRange` (`:306–340`) | **none** | Spring pitches scored, feeding tomorrow's baseline |
| `refresh_league_averages` (`…league-averages.sql:120`) | **none** — `game_date` only | Denominators mix three populations |
| SOS backfill (`:384`), MiLB SOS (`milb/route.ts:545`) | `'R'` only | Correct |
| `/api/sos`, `/api/compute-deception`, `/api/team-tendencies` | explicit | Correct |

**The platform disagrees with itself about its own population**: two surfaces differ for a reason no user can see. It is also directional:

- **Spring** over-samples non-roster arms, backfield venues and February velocity, pulling `avg_velo`/`avg_movement` *down*: a soft baseline, inflated early Stuff+, where `metric-governance/05`'s window is thinnest.
- **Postseason** over-samples elite arms at max effort, pulling the baseline *up* in Oct–Nov.

Opposite contaminations at opposite ends of an expanding window is no wash — a **seasonal shape imposed on the denominator**. Magnitude unmeasured; the sign is not. **(computed** mechanism; **estimated** shape.)

---

## 6. Opponent: measured, then ignored

`sos_scores` holds leave-one-out opponent xwOBA — opponent quality excluding the matchup itself, PA-weighted, regressed to league mean at **k = 60 PA**, as `100 + 10·z`. Leave-one-out is what most miss: without it a pitcher's own dominance lowers his opponents' measured quality. **(computed)**

And then does nothing with it: three consumers (MiLB explore leaderboard, MiLB player overview, a `metricRegistry` column) and **no metric opponent-adjusted**. So (1) SOS beside an unadjusted metric asks the reader to adjust mentally, inconsistently, and (2) **the scales collide**: 110 SOS is one SD, 110 Cmd+ a different distance. Presentation is **Cas**.

Two opponent-side confounds have no representation: **platoon exposure** (a specialist's batter mix is not a starter's) and **times through the order** — `n_thruorder_pitcher` is ingested in `BASE_COLUMNS`, feeding no aggregate. Unsplit, SP and RP are different treatments. **(computed** unused; **established** effect.)

---

## 7. Causal vs correlational discipline

One rule prevents most of the damage: **is the variable you would control for on the path you care about?**

| Role | Control for it? | Triton example |
|---|---|---|
| **Confounder** (common cause) | Yes | Park, opponent, catcher, era |
| **Mediator** (X → M → Y) | **No** — deletes the effect | Velocity, studying a mechanical change |
| **Collider** (X → C ← Y) | **No** — manufactures one | Qualification, roster survival, "made the majors" |
| **Descendant of Y** | No | Innings pitched, studying rate performance |

Schisterman, Cole & Platt: controlling for a mediator or collider can **reverse a sign**, not merely attenuate. "Stuff+ dropped, but controlling for velocity it didn't" is no robustness check — velocity is 4.5 of 10 z-weights and the mechanism; conditioning removes the finding by construction. (established)

### 7.1 What Triton can claim today

| Question | Design required | Status |
|---|---|---|
| Did this pitcher's stuff change? | Within-pitcher, comparable baselines | **Yes** — after `07`'s four gates |
| Did the league's stuff change? | Population trend, one vintage | **Yes** if rescored to one vintage |
| Did the 2023 rules change X? | Diff-in-diff vs. a control | **Yes** — pre/post is calendar |
| Does a sweeper improve results? | Recorded assignment, no self-selection | **No** — no intervention log |
| Does velocity cause injury? | Injury dates, exposure, competing risks | **No** — no injury data (§3.1) |
| Is pitcher A better than B? | Comparable populations, park + opponent | **Partly** — SOS unwired, park unmodelled |

The two "No" rows are missing-variable problems, not statistical ones: the honest answer is a refusal plus the data that would change it.

### 7.2 Cheap designs that beat adjustment

1. **Within-pitcher, within-park, within-pitch-type.** A home-vs-home split across two months holds park, instrument and catcher fixed — the largest confounders differenced out, not modelled, at a cost in n. (established)
2. **Difference-in-differences against a league control.** Prescribed in `07` for league-wide steps, and the frame for a rule change, ball change or baseline seam: an unmeasurable confound becomes a common trend.
3. **Negative control outcomes.** Pick a metric the hypothesis should *not* move — release extension for a grip change — and check it did not; if it moved, you found an artifact. (established)
4. **Match or weight on recorded confounders** (park, batter hand, count, TTO) — only after 1–3, and only where it is stored.

---

## 8. What Triton should do, in order

1. **Add `game_type` predicates to `refreshPitchBaselines`, `applyStuffPlusForDateRange` and `refresh_league_averages`** — or make the included set an explicit parameter. Rescore one season both ways, logging the delta in `docs/Queries.md`.
2. **Record roster state:** `player_level_stints (player_id, level, org, start_date, end_date, reason)`, from the §3.2 anti-join plus the MLB Stats API transactions feed; censoring becomes modellable.
3. **Wire SOS into the surfaces that already show it, or stop showing it.** A measured confound beside an unadjusted metric is worse than neither.
4. **Give Stuff+ an air-density input, not a park factor** (Soto owns the model, Li that it be versioned per `metric-governance/02`). Until then, caveat every Rockies comparison.
5. **Replace `|| 100` with an explicit null-and-flag** in every `PARK_FACTORS` lookup, so unadjusted is distinguishable from adjusted.
6. **Split by `n_thruorder_pitcher` on any SP-vs-RP comparison** and by batter hand on any specialist; both columns exist.
7. **Adopt a negative-control outcome as a fifth gate** in `07-trend-detection-changepoints.md`'s protocol.

**Anti-recommendation: do not build a park- and opponent-adjusted Stuff+ ("Stuff+ adj").** The natural response to §4 and §6, wrong three ways. **(a) Wrong instrument** — the confound lives in inches of break while `PARK_FACTORS` is a runs index; applying one to a movement z-score is the unit error `metric-governance/06` documents in `/api/park-adjusted`. **(b) Knowingly false** — one frozen 2024 team-keyed vintage over twelve seasons, by modal team, silently neutral where a code is unmapped: known-wrong provenance in 8.88M rows, plus an unversioned dependency. **(c) Precision theater** — the column is already non-comparable within a season (vintage drift), contaminated by spring and postseason (§5), and stale in its denominators; adjusting the third-largest confound while the first two are open only makes the number *look* defensible.

**Highest-leverage next action:** run the §3.2 anti-join on 2025, log it, and count how many MLB pitcher-seasons end in a demotion, not a season. That number is the size of the censoring problem, and converts every "did he adapt" claim from **(folk-sabermetrics)** into a bounded estimate.

---

## Sources

1. [Confounding](https://en.wikipedia.org/wiki/Confounding) — common-cause structure (§1).
2. [Causal graph](https://en.wikipedia.org/wiki/Causal_graph) — DAG notation, backdoor criterion (§1, §7).
3. [Pearl — *Causal Inference in Statistics: A Primer*](http://bayes.cs.ucla.edu/PRIMER/) — the control taxonomy of §7.
4. [Hernán & Robins — *Causal Inference: What If*](https://www.hsph.harvard.edu/miguel-hernan/causal-inference-book/) — identification conditions behind §7.1.
5. [Hernán, Hernández-Díaz & Robins — A structural approach to selection bias](https://pubmed.ncbi.nlm.nih.gov/15308962/) — selection bias as common effect (§1).
6. [Collider (statistics)](https://en.wikipedia.org/wiki/Collider_(statistics)) — roster survival as a collider (§3.3).
7. [Selection bias](https://en.wikipedia.org/wiki/Selection_bias) — attrition and post-treatment variants (§2).
8. [Survivorship bias](https://en.wikipedia.org/wiki/Survivorship_bias) — the September-survivor cohort (§3.3).
9. [Censoring (statistics)](https://en.wikipedia.org/wiki/Censoring_(statistics)) — right-censoring and independence (§3.1).
10. [Missing data](https://en.wikipedia.org/wiki/Missing_data) — MCAR/MAR/MNAR; demotion dropout is MNAR (§3.2).
11. [Truncation (statistics)](https://en.wikipedia.org/wiki/Truncation_(statistics)) — left truncation at roster entry (§2).
12. [Immortal time bias](https://en.wikipedia.org/wiki/Immortal_time_bias) — the guaranteed-healthy window (§3.3).
13. [Healthy worker effect](https://en.wikipedia.org/wiki/Healthy_worker_effect) — analogue for roster attrition (§3.1).
14. [Schisterman, Cole & Platt — Overadjustment bias](https://pmc.ncbi.nlm.nih.gov/articles/PMC2744485/) — over-adjustment can reverse a sign (§7).
15. [Lipsitch, Tchetgen Tchetgen & Cohen — Negative controls](https://pmc.ncbi.nlm.nih.gov/articles/PMC3053408/) — the negative-control design (§7.2, §8).
16. [Difference in differences](https://en.wikipedia.org/wiki/Difference_in_differences) — parallel-trends assumption (§7.2).
17. [Fixed effects model](https://en.wikipedia.org/wiki/Fixed_effects_model) — within-pitcher differencing formalised (§7.2).
18. [Propensity score matching](https://en.wikipedia.org/wiki/Propensity_score_matching) — cannot rescue an unrecorded treatment (§7.1).
19. [Magnus effect](https://en.wikipedia.org/wiki/Magnus_effect) — force ∝ air density (§4.1).
20. [Coors Field](https://en.wikipedia.org/wiki/Coors_Field) — ~5,280 ft and the humidor; changed, `PARK_FACTORS` did not (§4.2).
21. [Baseball Savant — Statcast Park Factors](https://baseballsavant.mlb.com/leaderboard/statcast-park-factors) — season-keyed alternative (§4.2).
22. [Baseball Prospectus — How Accurate is PitchTrax?](https://www.baseballprospectus.com/news/article/13109/spinning-yarn-how-accurate-is-pitchtrax/) — tracking offsets are real (§4.3).

**Triton-internal evidence.** Repo read 2026-08-12; **no database queries run**; central packet figures. `pitches` ~8,877,621 rows / 9,711 MB, 2015-03-03 → 2026-08-10; `milb_pitches` ~2,508,422 rows, 2023-03-31 → 2026-08-11; `players` 16,931 rows, `team` on **0** (§3.1, §5). No `game_type` predicate: `refreshPitchBaselines` `app/api/update/route.ts:241–286`; `applyStuffPlusForDateRange` `update/route.ts:306–340`; `scripts/create-refresh-league-averages.sql:119–120` (`game_date` range only). Predicate present: `update/route.ts:384`, `update/milb/route.ts:545` (`game_type = 'R'`), `api/sos/route.ts:6–8`, `api/compute-deception/route.ts:38`, `api/team-tendencies/route.ts:65–67`. Ingest `api/cron/pitches/route.ts:29–32` (`S` 2–3, `R` 3–9, `P` 10–11) via `GAME_TYPE_MAP` `update/route.ts:11–15`. Stuff+ weights 4.5/3.5/2.0 at `update/route.ts:317–333`. `PARK_FACTORS` `lib/constants-data.ts:28–70` — **31 team keys**, `COL.basic = 113` (line 50), no season axis; replicated 2015–2025 by `api/populate-park-factors/route.ts:15–30`; consumed `?.basic || 100` at `api/scene-stats/route.ts:136, 398, 1098, 1671`, modal team `:1086`, `:1666`. `computeWRCPlus` `lib/sql.ts:53–61`. SOS: leave-one-out build, `REGRESSION_K = 60` `api/sos/route.ts:4`; scale `100 + z·10` `update/route.ts:421, 484`; consumers `milb/explore/page.tsx:192–203`, `milb/player/[id]/page.tsx:122–124`, `lib/metricRegistry.ts:445–451`. `n_thruorder_pitcher` `api/player-data/route.ts:5`, no aggregate consumer. Derived: Coors 3–4 pts/pitch from `metric-governance/06` §6.2 → ~1.5–2.0 pts/season at ~50% home share; the 2.3-pt Povich move and 3.0–4.2 MDE from `statistical-inference/01` §5. Incidents (2026-08-11 two-vintage rescore ≈249k rows; 2026-05-08 wRC+ restated 5–6 pts; `league_averages` 46 days stale) per `metric-governance/02`.
