---
title: Park, League, and Era Adjustments — Building the Context Stack Without Counting It Twice
domain: metric-governance
tags:
  - park-factors
  - league-adjustment
  - era-adjustment
  - double-counting
  - regression-to-mean
  - wrc-plus
  - adjustment-stacking
sources_reviewed: 21
last_updated: 2026-08-11
---

# Park, League, and Era Adjustments — Building the Context Stack Without Counting It Twice

## TL;DR

- **A single-season park factor is roughly half noise.** ~81 home games at ~9 runs/game puts the SE of a one-year home/road ratio near ±5 points against a true between-park SD of similar size — reliability ≈ 0.5, hence the 3–5 year regressed standard. **(estimated — §2.3)**
- **Triton's `PARK_FACTORS` is regressed and multi-year, which is right, but has no season key** — one 2024-vintage 5-year block applied to every season 2015–2026. **(computed)**
- **That vintage assigns the wrong physical ballpark to four teams:** `ATL` gets Truist Park for Turner Field seasons (≤2016), `TEX` the roofed Globe Life Field for open-air ones (≤2019), `ATH` the Coliseum's 96 for Sacramento, `TB` a domed Tropicana value for 2025 at Steinbrenner Field — and `/api/populate-park-factors` launders that vintage into 341 rows that only *look* season-specific. **(computed; established for the venue changes)**
- **`computeWRCPlus()` applies park correctly in kind; `/api/park-adjusted` does not.** wRC+ divides the *run-value deviation* by the factor; the park route divides raw `xwOBA` by a *run* factor — a unit error moving a .340 Coors xwOBA to .301, on an already largely park-neutral statistic. **(computed)**
- **Percentile normalization already absorbs league and era; an era term on top double-counts.** `league_averages` is keyed `(season, level, role, metric)`, so anything scored against it is already era-adjusted. The `_plus` exclusion guards this — but on a naming convention, not semantics. **(established mechanism; computed for the rule)**
- **`league_averages` is 46 days stale** (last refresh 2026-06-26; `refresh_league_averages` has no `statement_timeout` override), so adjustments layered on it run August numerators against June denominators. -> **Jo**. **(computed)**
- **Stuff+ has no park term — the right default, but a choice, not a non-issue.** Air density is the exception: Coors at ~5,280 ft has ~82% sea-level density, Magnus force scales with density, and the movement loss plausibly costs ~3–4 Stuff+ points per pitch there. **(established physics; estimated magnitude — §6.2)**
- **Indexing to a league mean removes level but not dispersion** — a +2 SD hitter in 1925 and one in 2025 index identically and are not the same player, so only a z-score against contemporaries is an era adjustment. And apply an adjustment only when its true effect exceeds its own SE. **(established; second clause estimated)**

---

## 1. The three layers, and what each one claims

| Layer | Counterfactual asserted | Removes | Typical form |
|---|---|---|---|
| **Park** | "in a neutral park" | Venue run environment | multiplicative factor ~100 |
| **League/season** | "relative to his league-season" | Run level, ball, rules, pool | ratio vs. league mean |
| **Era** | "relative to his era" | Level *and* dispersion of talent | z-score or translation |
The ordering is load-bearing: **each layer's denominator must be defined on a population from which the previous layer's effect has already been removed.** Violating that is the mechanism behind every double-count in §5. Level translation composes after era (`08-cross-level-comparability.md`).

---

## 2. Park factor construction

### 2.1 The basic factor

```
PF_basic = ((RS_home + RA_home) / G_home) / ((RS_road + RA_road) / G_road) * 100
```

It is **contaminated by the team itself** (a team never plays road games in its own park) and is a **whole-team number applied to individuals** (20 home games or 81, same factor).

### 2.2 The half-strength convention

A player plays roughly half his games at home, so a park's full effect reaches half his line. Two conventions exist, and mixing them is the most common park bug there is:

| Convention | Coors value | Applied as |
|---|---|---|
| **Raw** home/road ratio | historically well above 120 | must be halved before use |
| **Player-applicable** (halved) | ~112–113 | applied directly to the full-season line |

Triton's `COL: { basic: 113 }` is unambiguously on the **halved** scale — far below any raw Coors ratio — the correct scale for `computeWRCPlus()`. Halving it again misses by a factor of two. **(computed)**

### 2.3 Why one season is not enough

An 81-game home schedule at ~9 runs/game is ~730 runs. Treating scoring as roughly Poisson, SD ≈ √730 ≈ 27 — **3.7% of the mean**. The road half carries comparable noise, so the *ratio* has SE ≈ √2 × 3.7% ≈ **5.2 points**. The true between-park SD is the same order: most parks sit in 95–105, Coors the lone large outlier.

```
reliability = var_true / (var_true + var_error) ≈ 25 / (25 + 27) ≈ 0.48
PF_regressed = 100 + (PF_raw - 100) * n / (n + k)   # n = seasons, k ≈ 1 for run factors
```

**A single-season park factor should be regressed roughly halfway to 100.** Five seasons cuts error variance ~5×, lifting reliability to ~0.83 and the needed regression to ~17% — the justification for the 3–5 year window FanGraphs, BR, and Statcast all use. `k` is larger for **component** factors, especially HR. **(estimated — the Poisson step ignores autocorrelation and roster effects, so this is a lower bound.)**

### 2.4 Illustrative SQL

Not run — verify columns against the schema, and log to `docs/Queries.md` when it *is*:

```sql
WITH g AS (
  SELECT game_pk, home_team, away_team, COUNT(*) FILTER (WHERE events='home_run') AS hr
  FROM pitches WHERE game_year=2025 AND game_type='R' GROUP BY 1,2,3
), sided AS (
  SELECT home_team AS team, hr, TRUE AS is_home FROM g
  UNION ALL SELECT away_team, hr, FALSE FROM g
)
SELECT team, COUNT(*) FILTER (WHERE is_home) AS g_home,   -- report the n
  ROUND(100.0 * AVG(hr) FILTER (WHERE is_home)
       / NULLIF(AVG(hr) FILTER (WHERE NOT is_home), 0), 1) AS pf_hr_raw
FROM sided GROUP BY team ORDER BY pf_hr_raw DESC;
```

### 2.5 Handedness and component splits

| Split | Captures | Cost |
|---|---|---|
| **None** (single run factor) | Global scoring environment | Misses all asymmetry |
| **Component** (HR/H/BB/SO) | Fence, foul territory, backdrop | 4x parameters; HR noisiest |
| **Handedness** (L/R x component) | Asymmetric dimensions: Fenway, the Yankee porch | 8x parameters; **each cell ~half the sample** |

The asymmetry is real at Fenway and Yankee Stadium, but an L/R HR cell in one season rests on 40–90 home runs and by §2.3 needs ~70–80% shrinkage to be usable. **The correct structure is hierarchical: regress the handed component toward the unhanded, and the unhanded toward 100.** Triton has component splits and **no handedness split** — the defensible position. **(estimated)**

---

## 3. League and era adjustment

### 3.1 League adjustment

League adjustment divides out the run-scoring level of a league-season and is nearly noise-free: the denominator rests on ~180,000 PA. **League adjustment is almost always worth doing; park adjustment often is not** — the asymmetry is entirely about denominator size. **(established)**

Triton's is `SEASON_CONSTANTS` (`lib/constants-data.ts`) — FanGraphs Guts! constants, **properly keyed by season, 2015–2026**: the well-governed half of the stack, fifteen lines above the un-keyed park block in the same file.

### 3.2 Era adjustment, and what ratio-indexing cannot do

Indexing to the league mean (ERA+, OPS+, wRC+) removes an era's *level*, not its *dispersion*. Gould's argument in *Full House*: as a talent pool professionalizes, the SD of performance contracts against human limits while the mean stays anchored by the game's structure. Two players indexing 150 in 1925 and 2025 are not equivalent — the earlier one is fewer SDs out of a *wider* distribution.

| Method | Removes level | Removes dispersion | Use when |
|---|---|---|---|
| Ratio to league | yes | **no** | Within-era |
| Z-score vs. peers | yes | yes | Cross-era ranking |
| Percentile vs. peers | yes | yes (ordinally) | Cross-era, outlier-robust |
| MLE / translation | yes | yes | Cross-*level*, not cross-era |

**Triton does not do cross-era comparison and should not start.** Statcast spans 2015–2026 — one rules era, one talent distribution — so ratio-indexing suffices. `retro_events` (1914+) and `lahman_batting` are where it would bite; neither feeds a plus-stat.

---

## 4. The stacking order

| # | Step | Input | Output | Denominator population |
|---|---|---|---|---|
| 1 | Counting → rate | events | rate per PA/IP/pitch | the player's own sample |
| 2 | Rate → run value | rate | runs above avg (wRAA, FIP−lg) | league linear weights |
| 3 | **Park** | run value | park-neutral run value | that park, multi-year, regressed |
| 4 | **League/season** | park-neutral run value | index vs. league-season | qualified players, same season |
| 5 | **Era** | index | z / percentile vs. peers | same season+level distribution |
| 6 | Level translation | era-neutral | cross-level comparable | `08-cross-level-comparability.md` |

**The load-bearing rule: park is applied to the *deviation*, not the *level*.** Runs are convex in wOBA, so dividing a ~.320-centered rate by a *run* park factor is a unit error, not an approximation.

`computeWRCPlus()` (`lib/sql.ts:53`) gets this right: `(woba - lgwoba) / woba_scale` converts to runs-above-average per PA **first**, and only then does `denom = (parkFactor/100) * r_pa` scale a run quantity by a run factor. `/api/park-adjusted:50` does not:

```ts
adj_xwoba: row.xwoba != null ? Math.round(row.xwoba * (100 / pf.basic) * 1000) / 1000 : null,
```

That scales the wOBA **level** by a **run** factor: a .340 xwOBA at Coors becomes .301, roughly All-Star to replacement level. **(computed)**

---

## 5. How double-counting happens

**5.1 Adjusting a metric that already contains the adjustment.** `computeXERA()` adds `constants.lg_era`, so its cross-player median is approximately `lg_era` by construction; storing xERA in `league_averages` and benchmarking against that median is circular. Same for `computeFIP()`/`cfip`. **(estimated)**

**5.2 Percentile normalization plus an explicit era term.** Triton's largest exposure. `league_averages` holds 50th-percentile benchmarks per `(season, level, role, metric)`, so anything scored against them is **already league- and era-adjusted**. The `_plus` exclusion is a real guard and it works — but it guards on a **naming convention, not semantics**: `xera` and `fip` are league-anchored and don't end in `_plus`, so they land in the table anyway. Restate it as "exclude metrics carrying a league anchor." **(computed for the rule; estimated for the exposure)**

**5.3 Adjusting a quantity that never absorbed the effect.** `xwOBA` is built from EV and launch angle through a **league-wide** run-value table — it does not know the fence is 315 feet away, and has already sidestepped most of the park's outcome effect. The real residual is physical (thinner air raises EV and carry) and far smaller than 13%. `/api/park-adjusted` is thus wrong twice on one line: wrong units (§4) and wrong target — plus the half-strength collision of §2.2 if the factor is re-halved. **(established for xwOBA construction; estimated for the residual)**

**5.4 Twice through a side door.** Opponent quality estimated *from* park-adjusted stats and then applied alongside a park adjustment subtracts the park twice; so does showing a park-adjusted metric as a percentile inside a *raw* leaderboard — definition Li's, surface fix **Cas**'s.

**Detection heuristic.** Take the cross-player mean of any adjusted metric by season. If it does not center on its intended constant (100 for a plus-stat, `lg_era` for xERA), the adjustment has been applied a fractional number of times; 2–3 points of drift is the signature.

---

## 6. What Triton actually does — audit

### 6.1 The stack as implemented

| Metric | Where | League adj. | Park adj. | Season-keyed? | Units OK? |
|---|---|---|---|---|---|
| `wrc_plus` | `lib/sql.ts:53` | yes (`SEASON_CONSTANTS`) | yes (`basic`) | **no** | **yes** |
| `fip` | `lib/sql.ts:29` | yes (`cfip`) | no | — | yes |
| `xera` | `lib/sql.ts:38` | yes (`lg_era`, `woba`) | no | — | yes |
| `adj_xwoba` | `/api/park-adjusted:50` | no | yes (`basic`) | **no** | **no** |
| `adj_hr/k/bb_pct` | `/api/park-adjusted:51–53` | no | yes (component) | **no** | in kind |
| `stuff_plus` | `applyStuffPlusForDateRange` | via `(pitch_name, game_year)` baselines | **none** | — | n/a |
| `cmd_plus`, `brink_plus`, … | `pitcher_season_command` | implicit in plus scale | **none** | — | n/a |
| `deception_score` | `pitcher_season_deception` | implicit | **none** | — | n/a |

Two findings, beyond the un-keyed park block noted in §3.1. **The park factors are not where the context doc says they are:** `PARK_FACTORS` and `SEASON_CONSTANTS` live in **`lib/constants-data.ts`**; `lib/sql.ts` only consumes them, and `Li/context/triton-context.md` should be corrected. And **`|| 100` is a silent default** — every call site reads `PARK_FACTORS[row.team]?.basic || 100`, so an unmapped abbreviation (a historical code, `AZ` vs `ARI`, a null team) silently becomes a neutral park and produces a number that looks fine. **(computed)**

### 6.2 Stuff+ has no park term — state it, don't imply it

Stuff+ is `100 + 4.5·z(release_speed) + 3.5·z(total_movement_in) + 2.0·z(release_extension)` against `pitch_baselines` keyed `(pitch_name, game_year)`. There is **no park, venue, or altitude term anywhere in the scoring path**, and no `altitude`/`elevation`/`air_density` reference exists in `lib/` or `app/`. **(computed)**

**This is the right default:** outcomes are park-dependent because the park decides whether a fly ball lands in a seat; a radar reading of the pitcher's body is not.

**But movement is not fully park-independent.** Magnus force scales with air density; Coors sits at ~5,280 ft where density is ~82% of sea level, and break falls roughly in proportion. For a breaking ball with ~14 in of movement and a within-pitch-type SD of ~2.5 in:

```
d_movement   ~ 14 * 0.18 ~ 2.5 in ~ 1.0 SD
d_stuff_plus ~ 1.0 * 3.5  ~ 3.5 points
```

A Coors pitch is worth **~3–4 Stuff+ points less than the same pitch at sea level**. Negligible for a visitor, but a Rockies pitcher throws half his pitches there, depressing his season `stuff_plus` by **~1.5–2 points** — small, systematic, and the size of many deltas the platform invites users to interpret. **(established: the physics and elevation. Estimated: the 2.5-in and 3.5-point figures; the movement SD is assumed, not measured.)**

### 6.3 The stale denominator, and reproducibility

`league_averages` last refreshed **2026-06-26 — 46 days ago**; `refresh_league_averages(int)` carries no `statement_timeout` override and is hitting the default cap. **Any adjustment layered on it computes an August numerator against a June denominator** — the same failure class as baseline vintage drift, which no adjustment math survives. Fix: `ALTER FUNCTION refresh_league_averages(int) SET statement_timeout = '600s'` -> **Jo**. **(computed)**

Separately, both constant blocks are mutable with **no version record and no `valid_from` date**, and `computeWRCPlus()` runs at query time — so a June wRC+ screenshot cannot be reproduced today if either has been edited since, and nothing records whether it has. That is `02-metric-versioning-reproducibility.md`'s problem surfacing here, park case worst: `park_factors` presents a season key carrying no season information.

---

## 7. When an adjustment adds more noise than it removes

Apply only when `|true effect| > SE(estimated effect)`.

| Situation | Effect | Adjustment SE | Apply? |
|---|---|---|---|
| Coors, 5-yr regressed factor | ~13 pts | ~2 pts | **Yes** |
| Near-neutral park (98–102), 5-yr | ~1–2 pts | ~2 pts | **Marginal — prefer none** |
| Any park, single-season raw factor | 0–13 pts | ~5 pts | **No — regress first** |
| Handed HR component, single season | varies | ~8–12 pts | **No** |
| Player with <100 PA | swamped by own SE | — | **No** |
| Mid-season factor (~40 home games) | 0–13 pts | ~7 pts | **No** |
| League adjustment (any) | large | ~0 | **Always** |

Two rules: never build a park factor from a partial season, and consider a **dead band** forcing `basic` in 98-102 to exactly 100 rather than injecting noise into every roster.

---

## 8. What Triton should do, in order

1. **Fix `refresh_league_averages`'s timeout.** 46-day-stale denominators invalidate every comparison regardless of adjustment quality. -> **Jo**. *(Highest leverage, lowest effort.)*
2. **Key `PARK_FACTORS` by season** — minimum a `Record<number, Record<string, PF>>`, better a per-season table from 3-year rolling values. Corrects `ATL` ≤2016, `TEX` ≤2019, `ATH` 2025+, `TB` 2025.
3. **Fix or retire `/api/park-adjusted`** — adjust the run-value deviation as `computeWRCPlus` does, or delete `adj_xwoba`; a visibly wrong adjusted column is worse than none. Likewise stop `/api/populate-park-factors` writing 11 identical season rows.
4. **Replace `|| 100` with an explicit unmapped-team path** that records the miss — a silent neutral default is the failure class that produced the Stuff+ outage.
5. **Restate the `_plus` exclusion rule semantically** ("exclude metrics carrying a league anchor") and audit `xera`/`fip` against it (§5.1).
6. **Document in `docs/VARIABLES.md`, same commit:** Stuff+/Cmd+/Deception are deliberately un-park-adjusted; wRC+ uses a frozen 2024 vintage across all seasons; the factors are on the halved scale.
7. **Then measure the Coors Stuff+ effect** against `pitch_baselines` and hand it to Soto.

### Anti-recommendation

**Do not add handedness-split park factors, and do not add a park term to Stuff+.**

Handedness splits quadruple the parameter count while halving the sample per cell; §2.5 puts a single-season handed HR cell at SE ~8–12 points against a true effect smaller than that for 28 of 30 parks. Without hierarchical shrinkage the split makes wRC+ measurably *less* accurate while looking more sophisticated. Same for a Stuff+ park term: a venue term added before the ~2-point effect is measured is a guess wearing a decimal point.

More generally: **Triton's park adjustment does not fail because it is too coarse. It fails because it is frozen at one vintage, mis-applied in one route, and silently defaulted in five.** Sophistication on an unversioned stack increases the ways a number can be wrong without increasing the ways it can be checked.

**Single highest-leverage next action:** key `PARK_FACTORS` by season and stamp a vintage on it — one change that fixes four wrong ballparks, makes wRC+ reproducible, and removes the false precision from `park_factors`.

---

## Sources

1. [FanGraphs Library — Park Factors](https://library.fangraphs.com/park-factors/) — the 5-yr regressed method Triton mirrors.
2. [FanGraphs Guts! — Park Factors](https://www.fangraphs.com/guts.aspx?type=pf) — provenance of Triton's vintage.
3. [FanGraphs Guts! — Season Constants](https://www.fangraphs.com/guts.aspx?type=cn) — source of `SEASON_CONSTANTS`.
4. [Baseball-Reference — Park Adjustments](https://www.baseball-reference.com/about/parkadjust.shtml) — multi-year construction; road-schedule correction.
5. [BR Bullpen — Park Factor](https://www.baseball-reference.com/bullpen/Park_factor) — home/road ratio; halving (§2.2).
6. [Baseball Savant — Statcast Park Factors](https://baseballsavant.mlb.com/leaderboard/statcast-park-factors) — 3-yr rolling, handedness/component (§2.5).
7. [Seamheads Ballparks DB](https://www.seamheads.com/ballparks/) — venue-change dates (ATL/TEX/ATH/TB).
8. [Walk Like a Sabermetrician](http://walksaber.blogspot.com/)
9. [The Book Blog (Tango/Lichtman/Dolphin)](http://www.insidethebook.com/) — regression amounts (§2.3).
10. [Tangotiger Blog](http://www.tangotiger.com/) — linear weights; park belongs on run values.
11. [Baseball Prospectus Glossary](https://www.baseballprospectus.com/glossary/)
12. [Clay Davenport Translations](http://claydavenport.com/)
13. [FanGraphs Library — wRC+](https://library.fangraphs.com/offense/wrc/) — the formula `computeWRCPlus()` implements.
14. [MLB Glossary — wRC+](https://www.mlb.com/glossary/advanced-stats/weighted-runs-created-plus) — plain statement of the adjustment.
15. [MLB Glossary — Expected wOBA](https://www.mlb.com/glossary/statcast/expected-woba) — xwOBA from EV/LA via a league-wide table (§5.4).
16. [Baseball Savant — Expected Statistics](https://baseballsavant.mlb.com/leaderboard/expected_statistics) — xwOBA population/coverage.
17. [Alan Nathan — The Physics of Baseball](http://baseball.physics.illinois.edu/) — Magnus force, air density, altitude (§6.2).
18. [Gould — *Full House*](https://en.wikipedia.org/wiki/Full_House_(book)) — compression of variance (§3.2).
19. [BR Bullpen — Adjusted ERA+](https://www.baseball-reference.com/bullpen/Adjusted_ERA%2B) — worked indexed stat, and its limits.
20. [Retrosheet](https://www.retrosheet.org/)
21. [SABR — Baseball Research Journal](https://sabr.org/journals/) — standing venue for park/era research.

**Triton-internal evidence (read 2026-08-11; no database queried):** `lib/constants-data.ts:4–65` (`SEASON_CONSTANTS` season-keyed; `PARK_FACTORS` un-keyed, 31 keys incl. both `OAK` and `ATH`, `pf_h`/`pf_r` in the type but populated for no team); `lib/sql.ts:29–61`; `app/api/park-adjusted/route.ts:44–54`; `app/api/populate-park-factors/route.ts:15–40`; `app/api/scene-stats/route.ts:136, 398, 1098, 1671`; `app/api/update/route.ts:295–322`; `scripts/create-refresh-league-averages.sql:24`; `docs/reliability-findings-2026-08-11.md:27, 44`.

**Cross-references:** `05-baseline-normalization-design.md`; `08-cross-level-comparability.md`; `02-metric-versioning-reproducibility.md`; `Soto/algorithm-design/09-model-validation-stabilization.md`.
