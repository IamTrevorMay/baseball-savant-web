---
title: Test Data Management — Small Fixtures That Still Tell the Truth
domain: testing-data-systems
tags:
  - fixtures
  - stratified-sampling
  - representativeness
  - anonymization
  - fixture-drift
  - synthetic-data
  - athlete-privacy
  - reproducibility
sources_reviewed: 23
last_updated: 2026-08-12
---

# Test Data Management — Small Fixtures That Still Tell the Truth

> Grades: **(verified)** read at the cited `file:line` or the 2026-08-12 measurement pass;
> **(documented)** vendor docs or published method; **(inferred)** reasoned from those;
> **(cargo-cult)** widely repeated, wrong here. Nothing came from production.

## TL;DR

- **No fixture files exist — production, hand-typed literals and a prod-writing seed script stand in for them.** **(verified)**
- **"Representative" is undefined until you name the test: per-pitch formula and per-outing stability tests need opposite designs, so ship two.** **(inferred)**
- **The stratification grid is already published inside the platform, as `pitch_baselines`' 206 `(pitch_name, game_year)` cells; a missing cell kills the plus-stat path there.** **(verified)**
- **A 6,120-row grid slice is 0.069% of `pitches` — 1 row in 1,451, ~0.5 MB gzipped against a 30 MB `.git`, so the storage objection is not real.** **(verified)**
- **`TABLESAMPLE` cannot build this fixture: `SYSTEM` draws whole 8 KiB pages with no rare-cell control, `BERNOULLI` scans 9,711 MB into an 8s timeout.** **(verified)**
- **Per-pitch random sampling destroys the clustering half the tests depend on — design effect ≈ 3.2 once outings are shredded.** **(inferred)**
- **The cheapest representativeness proof is a per-column null-rate assertion within ±2 pp — the check that would have caught the Stuff+ collapse.** **(inferred)**
- **A path the fixture never exercises stays untested: `lib/reportMetrics.ts` names 19 distinct lowercase `events` literals.** **(verified)**
- **That check finds a live bug: `/api/milb/report` runs lowercase-`events` SQL against Title-Case `milb_pitches`, so every hit, walk and strikeout metric returns 0.** **(verified)**
- **The smallest table is the one you must never commit: `compete_pitches` holds 6 named private individuals with plaintext `pitcher_name` — generate facility fixtures, never sample.** **(verified)**
- **Anonymizing 6 athletes is unachievable and pseudonymizing them is theatre; k-anonymity fails at k = 1.** **(inferred)**
- **"Just take the last 10,000 rows" is the standard move and a non-fixture — one season of twelve, no rare pitch types, unrebuildable from a mutable source.** **(cargo-cult)**

## 1. What is standing in for fixtures today

No fixture directory exists; three substitutes stand in:

| Substitute | Where | What it is | Failure mode |
|---|---|---|---|
| **Production** | `savantValidation.test.ts:15–60` | Burnes 2024, live Savant *and* Supabase `run_query_long` | No env → silent skip (`describe.skipIf`); outage → fail; no CI; blind to unthrown rows |
| **Hand-typed literals** | `outingCommand.test.ts:5–17`, `reportQueryBuilder.test.ts` | `makePitch()`: one pitch name, one season | Worth keeping, but a *unit* fixture — no distribution claims |
| **Synthetic rows in prod** | `seed-mechanics-demo.ts:24–27,110–160` | Seeded-PRNG biomech sessions, service role | Fabricated rows beside real athlete rows |

`seed-mechanics-demo.ts` marks only `biomech_captures` demo (`raw_meta: { demo: true }`, `:133`); `biomech_throws`, `compete_reports`, `athlete_notifications` get **no marker** (`:137–158`), so no `WHERE` separates fabricated throws from real. `clearPrior()` deletes `compete_reports` by `athlete_id` + `subject_type='biomech'` (`:85`) — *any* biomech report for that athlete — and `:64–67` hardcodes two real names against production `athlete_profiles` UUIDs, in git. **(verified)**

## 2. What a slice has to preserve, in order of what breaks

| Rank | Property | Tests depending on it | Cheapest check |
|---|---|---|---|
| 1 | **Schema** — columns and types | anything at all | column-set diff vs stored `information_schema` |
| 2 | **Categorical vocabulary** — literals the SQL matches | `reportMetrics` FILTER branches, casing | set inclusion vs literals grepped from source |
| 3 | **Null structure** — rate per column, *where* nulls fall | coverage display, null-vs-zero | NULL fraction per column, ±2 pp |
| 4 | **Marginal distributions** — velo, movement, location | Stuff+, command, heatmaps | two-sample KS per pitch type |
| 5 | **Clustering** — pitches in outings, outings in seasons | stabilization, rolling windows | pitches per `(pitcher, game_pk)` |
| 6 | **Joint structure** — velo × movement × handedness | arsenal comparison, similarity | correlation matrix, elementwise |

Rows 1–3 are cheap, catch most bugs, and almost nobody checks them; 4–6 cost real work, for numeric tests only. Build 1–3 first.

## 3. Designing the slice

### 3.1 The grid is already in the database

`pitch_baselines`: **206 rows** keyed `(pitch_name, game_year)` — the cross the plus-stat path z-scores against, ≈ 17 pitch types × 12 seasons (2015–2026); the app agrees at 18 names and 19 codes (`lib/constants-data.ts:70–84`). An empty cell is a baseline never exercised, so a Stuff+ regression in `Screwball 2017` is invisible. **(verified)**

`stand`/`p_throws` add 4 cheap combinations; `game_type` matters because `game_date` starts **2026-03-03**, spring training — no spring rows, no season-boundary test. But 17 × 12 × 4 = 816 cells at 30 rows is 24,480, past reviewable: **cross fully on `(pitch_name, game_year)`, 204 cells, `stand`/`p_throws` as marginal balance.**

### 3.2 Allocation: the trap that invalidates half the tests

| Allocation | Rows per cell | Good for | Fatal if you then… |
|---|---|---|---|
| **Equal** (30/cell) | flat | branch coverage, casing, nulls, schema | …assert a league rate: as many Eephus as 4-Seams makes K% 4× reality |
| **Proportional** | ∝ population share | any test asserting a rate or league mean | …expect rare-type coverage: Sweepers pre-2020, Screwballs ever, get 0 rows |
| **Neyman** (∝ share × cell SD) | variance-optimal | estimating a league parameter | …treat it as either of the above |

The fix is **labelling**: name each file for its allocation (`pitches.grid.csv` = equal, `pitches.prop.csv` = proportional); no test asserts a rate against `grid`.

### 3.3 The second fixture: sample outings, not pitches

Per-row sampling destroys the clustering per-start metrics need. Li: **~75 pitches/start**, ICC ρ ≈ 0.02–0.04, per-pitch Stuff+ SD ≈ 2.8 vs league 6.04. Design effect `1+(m−1)ρ` = 1 + 74 × 0.03 ≈ **3.2** — a clustered row holds a third the information of a random one, the price of tests that cannot exist otherwise. **(inferred)** So **`pitches.outings.csv` = ~200 whole `(pitcher, game_pk)` units, stratified on starter/reliever and season**, ~15,000 rows: sample the *unit*, keep all rows.

### 3.4 How to extract it without a full scan

`TABLESAMPLE BERNOULLI (0.07)` scans 9,711 MB sequentially, under an **8s statement timeout** `service_role` cannot override — the wall the Stuff+ backfill hit. `SYSTEM` avoids the scan but samples **whole 8 KiB pages**: 623,662 pages at 14.2 rows/page, so 0.07% = ~437 consecutive-pitch fragments, no Knuckleball guarantee. Neither is stratified. **(verified / documented)** Go per stratum, indexed, chunked — the day-chunked rescore shape:

```sql
-- 204 cheap indexed queries beat one 9.7 GB scan
SELECT * FROM pitches
WHERE pitch_name = $1 AND game_date >= $2 AND game_date < $3  -- indexed; not game_year
ORDER BY md5(game_pk::text || at_bat_number || pitch_number)  -- stable, seed-free
LIMIT 30;
```

`md5(...)` over a natural key is deterministic across runs and databases; `random()` is not, absent `setseed()` and a stable plan — and two engineers must regenerate it identically.

## 4. Proving the slice preserves what tests depend on

Run these at generation time into a committed manifest; fail the build when it is missing. Per-CI-run checks would need production access.

| # | Assertion | Statistic | Threshold | Catches |
|---|---|---|---|---|
| 1 | Column set matches source | set equality | exact | schema drift |
| 2 | Every `(pitch_name, game_year)` cell | 204 cell counts | ≥ 25 | rare-type holes |
| 3 | `events` vocabulary complete | vs 19 literals, `lib/reportMetrics.ts` | ⊇ | untested FILTER branches, casing |
| 4 | Per-column NULL rate | \|fixture − population\| | ≤ 2 pp | denominator collapse (Stuff+ class) |
| 5–6 | Velo/movement and plate-location shape | KS: `release_speed`, `pfx_x`, `pfx_z`, `plate_x`, `plate_z` | no reject, α = 0.01 | binning, heatmaps, strike-zone and command math |
| 7 | Outing integrity (`outings`) | median pitches per `(pitcher, game_pk)` | 60–90 | truncated clusters |
| 8 | Handedness balance | share per `stand`×`p_throws` | ≤ 3 pp | platoon splits |
| 9 | Metric agreement | `METRICS` expressions vs stored | byte-exact | drift → `05-golden-file-metric-testing.md` |

Build 4 first: `AVG()` skips NULLs, so a fixture with the wrong NULL structure makes the defining hazard — a smooth line over an evaporating denominator — untestable. A 0% NULL `stuff_plus` cannot fail a coverage test.

Assertion 3 pays immediately. `lib/reportMetrics.ts:8–60` matches 19 lowercase `events` literals (`single`, `walk`, `field_out`, `triple_play`, …); `lib/reportQueryBuilder.ts:113` splices them into `FROM ${config.table}` (`:159`); `app/api/milb/report/route.ts:9` passes `table: 'milb_pitches'`, Title Case (`Strikeout`, `Home Run`, `Groundout`). Nothing matches: `k_count`, `bb_count`, `ba`, `slg`, `obp`, `ops`, `ip` return 0 or NULL, no error. Relabelled MLB rows inherit MLB casing and certify the broken path. **(verified)**

## 5. Commit verbatim, or generate?

Per-row cost: 9,711 MB / 8,877,621 rows ≈ **1,147 B/row** with indexes, ~576 heap; as 90-column CSV ~800 B/row, gzip ~10:1.

| Object | Rows / size | Fixture strategy | Committed cost |
|---|---|---|---|
| `pitch_baselines` | 206 / 72 kB | **verbatim CSV** (parameters, not observations) | 72 kB |
| `league_averages` | 1,806 / 616 kB | **verbatim CSV** | 616 kB |
| `pitcher_season_deception`, `pitcher_season_command`, `players`, `player_season_stats` | 17,386 / 4.8 MB, 27,119 / 9.5 MB, 16,931 / 1.6 MB, 79,061 / 13 MB | slice to fixture pitchers + batters | ~100 + ~150 + ~80 + ~200 kB |
| `pitches` | 8.88M / 9,711 MB | **generated slice** — 6,120 grid + 15,000 outings | ~1.7 MB gz |
| `milb_pitches` | 2.51M / 2,366 MB | **generated slice**, Title-Case preserved | ~200 kB gz |
| `compete_pitches` | 443 / 496 kB | **never** — see §6 | 0 |

Total ≈ 3 MB against a 30 MB `.git` — ~10%, once, and it stops growing: the generator changes, not the data. Git LFS is unnecessary below ~2 MB/file and adds a checkout dependency. The verbatim commits are the best bytes here: `pitch_baselines` is the parameter set every plus-stat depends on, destructively upserted in production and not hand-buildable. **(inferred)**

## 6. Anonymization: two populations, two policies

One policy is guaranteed wrong for one side. Legal analysis: `Li/entity-resolution/10-privacy-pii-athlete-data.md`; the fixture consequence:

| | **MLB public figures** | **Neptune facility athletes** |
|---|---|---|
| Tables | `pitches`, `milb_pitches`, `players`, `player_season_stats` | `compete_pitches`, `biomech_*`, `whoop_*`, `athlete_profiles` |
| Population | 16,931 players; 8.88M + 2.51M pitch rows | **6 athletes**, 443 pitch rows, one session date |
| Identity | league-published MLBAM id | `tm_pitcher_id` + plaintext `pitcher_name`; **0 rows** carry `athlete_profile_id` |
| Value published? | yes — Savant publishes every row | no |
| Names in a fixture | **keep verbatim** | **never present** |
| Derivation | sample from production | **synthesize from a model** |
| Achievable k-anonymity | n/a — not a de-identification problem | **k = 1**, unachievable |

**Public figures: do not anonymize; treat the urge as a smell.** Burnes threw pitch 4 of at-bat 12 on 2024-04-05 at 95.2 mph — a public web page says so. Scrubbing `player_name` protects nothing, costs the recognition a failing diff needs, and breaks the fixture's joins. **(inferred)**

**Facility athletes: sampling is the wrong operation, at any sample size** — every de-identification move fails, compounding:

| Move | Why it fails |
|---|---|
| **k-anonymity: unreachable at n = 6** | needs k indistinguishable records; six pitchers, one session, and per-pitch release height, release side, extension and velocity band leave each separable by inspection — Sweeney's framework does not degrade to k = 1 |
| **Pseudonymization: reversible by the people who matter** | hash `pitcher_name` and the six clusters remain; the TrackMan CSV or the 2026-04-13 roster re-links them in minutes, and the name survives redaction in the `raw` jsonb blob |
| **The generalization that would work: destroys the fixture** | 5-mph velocity bins and blurred release points hide six people only by killing the metrics the file exists to test |

**So generate.** `scripts/mechanics-demo/deliveryModel.ts` synthesizes marker trajectories from a forward kinematic model; `scripts/generate-mechanics-c3d.ts:1–25` writes real `.c3d` files exercising `parseC3D`, the Captury label mapper, throw segmentation and metric extraction, writing nothing to the database — the only pattern for facility data. `mulberry32` (`:29–36`) makes it reproducible, `lib/mechanics/norms.ts` bands realistic. Synthetic athletes need **synthetic names and UUIDs**: the hardcoded real names and profile ids (`:64–67`) are PII in git, and why the seeder only runs against production. Target a **local** Supabase.

## 7. Fixture drift: five ways a slice rots

| Mode | Mechanism | Symptom | Guard |
|---|---|---|---|
| **Schema drift** | column added/renamed upstream | tests green, production breaks | §4 assertion 1 + schema hash |
| **Coverage drift** | new columns arrive unpopulated (`bat_speed`, `swing_length`, `arm_angle`) | new-metric tests pass vacuously | fail if a column is >95% NULL in fixture, not in source |
| **Semantic drift** | same column, new meaning — Savant restates `pitch_name`; ~249k rows rescored over two Stuff+ vintages | fixture holds a dead definition | stamp source `MAX(game_date)`, generation date, baseline vintage |
| **Golden drift** | expected values regenerated from the code under test | a test that can never fail | goldens move only with the formula → `05-golden-file-metric-testing.md` |
| **Fixture divergence** | rows hand-edited to pass a test | not a sample of anything | **generated by a committed script, never hand-edited** |

The last is load-bearing and cheapest: the reviewable artifact is `scripts/build-fixtures.ts` + a seed + `__fixtures__/manifest.json`, data files being build output. A hand-edited fixture looks correct at review, so the ban must be structural. Bound staleness: `generated_at` and source `MAX(game_date)` in the manifest, warning — never failing — past one season; a CI failure nobody can fix without production credentials is disabled within a week.

## 8. What Triton should do, in order

1. **Commit `pitch_baselines` (206 / 72 kB) and `league_averages` (1,806 / 616 kB) as CSV** under `__fixtures__/`, with a loader: 688 kB, no privacy question, and no plus-stat test can hand-build these.
2. **Write `scripts/build-fixtures.ts`** for `pitches.grid.csv` (204 cells × 30, equal) and `pitches.outings.csv` (~200 whole outings): per-stratum indexed queries under the 8s limit, `ORDER BY md5(natural key)`, and `manifest.json` with per-cell counts, `generated_at`, source `MAX(game_date)`, column hash.
3. **Add the §4 assertions to the generator**, 1–4 first. 5–8 follow; 9 belongs with the golden-file work.
4. **Add a MiLB slice with Title Case `events` preserved** and let assertion 3 fail. Then normalize casing per table in `lib/reportQueryBuilder.ts` — the fixture keeps it fixed.
5. **Stop `seed-mechanics-demo.ts` writing to production**: synthetic names and UUIDs, a required `--local` target, a demo marker on *every* table it touches — or delete it for the C3D generator.
6. **Fix `clearPrior()`** (`:83–86`) to delete only rows it created: match the demo marker, never `subject_type` alone.
7. **Convert `savantValidation.test.ts` to a recorded Savant response plus the committed slice**, keeping the live one as a scheduled contract test → `03-contract-testing-external-apis.md`.
8. **Add a fixture-drift warning** in CI on manifest age > one season. Warn, never fail.

**Anti-recommendation — do not build the fixture as `SELECT * FROM pitches ORDER BY game_date DESC LIMIT 10000` (or a `TABLESAMPLE`), committed.** Obvious, right-sized, wrong three ways. **(i) Not a sample of the population.** 10,000 rows at ~75/start is a day and a half of one season: 1 of 12, no spring, no postseason, none of the pitch types nobody threw that week, and a `stuff_plus` NULL rate set by that morning's ingest. Every §4 distribution assertion fails; every rate is wrong. **(ii) Unrebuildable.** The source is mutable — Savant restates `pfx_x` and `pitch_name`, ~249k rows already rescored over two Stuff+ vintages — so nobody regenerates the same file, and a breaking test cannot say whether code or fixture moved. A golden file with no formula. **(iii) Wrong precedent where it is unsafe.** The same one-liner over `compete_pitches` is 443 rows / 496 kB — smaller, more tempting — and commits six private individuals with plaintext names, duplicated in `raw`, unremovable from git history. Size does not decide this.

**Single highest-leverage next action:** commit `pitch_baselines` and `league_averages` as CSV with a loader — under an hour, and it turns "we cannot test the plus-stat path without production" into the platform's only durable baseline copy.

## Sources

1. PG — [SELECT / TABLESAMPLE](https://www.postgresql.org/docs/current/sql-select.html) — §3.4 `BERNOULLI`/`SYSTEM`.
2. PG — [tsm_system_rows](https://www.postgresql.org/docs/current/tsm-system-rows.html) — row-count sampling, still page-clustered.
3. PG — [COPY](https://www.postgresql.org/docs/current/sql-copy.html) — §5 CSV emit/load.
4. PG — [Math functions](https://www.postgresql.org/docs/current/functions-math.html) — `random()`/`setseed()` vs §3.4 `md5`.
5. [pg_sample](https://github.com/mla/pg_sample) — FK-closure subsetting.
6. [Jailer](https://github.com/Wisser/Jailer) — model-driven row-closure subsetting.
7. [Neosync](https://github.com/nucleuscloud/neosync) — subset + anonymize + synthesize; §6 as a tool.
8. dbt — [Seeds](https://docs.getdbt.com/docs/build/seeds) — committed CSV as test data; §5.
9. Supabase — [Seeding your database](https://supabase.com/docs/guides/local-development/seeding-your-database) — step 5's local target.
10. [Testcontainers — PostgreSQL](https://testcontainers.com/modules/postgresql/) — real Postgres per run; where the slice loads.
11. [pgTAP](https://pgtap.org/) — in-DB assertions for §4 cell-count/vocabulary.
12. Vitest — [Test context](https://vitest.dev/guide/test-context) — `test.extend`, one slice per suite.
13. [xUnit — Fresh Fixture](http://xunitpatterns.com/Fresh%20Fixture.html) — shared vs fresh; §7 divergence.
14. [Faker](https://fakerjs.dev/) — seeded synthetic names/ids for §6.
15. [Synthetic Data Vault](https://sdv.dev/) — model-fit synthesis, as `deliveryModel.ts`.
16. [SDMetrics](https://docs.sdv.dev/sdmetrics/) — column-shape/pair-trend scores, §4 rows 4–6.
17. SciPy — [`ks_2samp`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ks_2samp.html) — the test behind assertions 5–6.
18. [Stratified sampling](https://en.wikipedia.org/wiki/Stratified_sampling) — equal vs proportional vs Neyman, §3.2.
19. [Cluster sampling](https://en.wikipedia.org/wiki/Cluster_sampling) — design effect `1+(m−1)ρ`, §3.3's ≈3.2.
20. Sweeney — [k-Anonymity](https://epic.org/wp-content/uploads/privacy/reidentification/Sweeney_Article.pdf) — §6: no k>1 at six athletes.
21. Narayanan & Shmatikov — [Robust de-anonymization](https://arxiv.org/abs/cs/0610105) — sparse records re-identify; velocity+release is a fingerprint.
22. NIST — [SP 800-188](https://csrc.nist.gov/pubs/sp/800/188/final) — the suppress/generalize/synthesize ladder §6 abandons.
23. [Great Expectations](https://docs.greatexpectations.io/docs/core/introduction/) — declarative null-rate/distribution expectations, §4.

**Triton-internal evidence.** Repo read 2026-08-12; no database query issued. No fixtures: `find` returns no `fixtures/`, `__fixtures__/`, `seed.sql` or test `.csv`; 7 test files, `__tests__/{api/playerData,integration/savantValidation,lib/{sql,leagueStats,queryCache,reportQueryBuilder,outingCommand}}.test.ts`, 1,310 lines. Beyond the `file:line` citations given inline above: `savantValidation.test.ts:15` (`PITCHER_ID = 669203`), `:18` (`SUPABASE_SERVICE_ROLE_KEY`), `:38`, `:42–60`; `seed-mechanics-demo.ts:145–149` (`biomech-reports` upload); `lib/reportQueryBuilder.ts:1`; MiLB Title Case per `CLAUDE.md`; 8s timeout `app/api/admin/backfill-stuff-plus/route.ts:13–14`, cause `docs/Queries.md:810–816`, day-chunk fix and the ~249k two-vintage rescore `:790`; `.git` = 30 MB (`du -sh`). **Measured centrally 2026-08-12, quoted not re-run:** `pitches` 8,877,621 rows / 9,711 MB / 623,662 pages (14.23 rows/page; 1,147 B/row with indexes, 576 heap), `game_date` 2015-03-03 → 2026-08-10; `milb_pitches` 2,508,422 / 2,366 MB, 2023-03-31 → 2026-08-11; `player_season_stats` 79,061 / 13 MB; `pitcher_season_command` 27,119 / 9,488 kB; `pitcher_season_deception` 17,386 / 4,776 kB; `players` 16,931 / 1,632 kB; `league_averages` 1,806 / 616 kB; `pitch_baselines` 206 / 72 kB keyed `(pitch_name, game_year)`; `compete_pitches` 443 / 496 kB / 6 athletes. Clustering constants (~75 pitches/start, ICC ρ ≈ 0.02–0.04, within-outing Stuff+ SD 2.8 vs league 6.04) from `Li/statistical-inference/`; privacy split and `raw` duplication from the `Li` privacy doc cited in §6.
