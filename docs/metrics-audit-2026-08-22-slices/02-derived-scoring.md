# Slice 02 — Derived Scoring Pipeline

**Verdict.** The nightly Stuff+ path is mostly working and is now *loudly* failing when it fails —
`cron_runs` carries the exact timeout text and the janitor emails a digest — but it has no repair
step, so every timed-out day becomes permanent: there is a live, three-day, 11,724-row hole at
2026-08-10/11/12 that accounts for **100%** of the 2026 unscored-but-eligible deficit, and the
per-day UPDATE has now blown the 8s statement cap on 4 of the last 15 nights. Historically it is far
worse: **1,791,293 rows across all seasons have every input Stuff+ needs and a matching baseline, and
were never scored** — 2015–2018 are scored for **April, May and June only** and are flat zero from
July onward. Separately, and worse than either, `pitcher_season_command` (Cmd+, Brink+, Cluster+,
RPCom+, Missfire+) is **frozen at roughly mid-June 2026**: its busiest 2026 pitcher-pitch row shows
741 pitches against 1,386 in the sibling deception table and 1,685 in a full 2025, `/api/compute-triton`
has evidently been returning HTTP 500 every night since, and `/api/cron/refresh` cannot see it — the
failure gate reads the wrong field and `computeResults` is deliberately excluded from the `cron_runs`
`counts` payload, so the job has recorded `success` every single night while shipping two-month-old
command grades to the research app. Nothing anywhere measures coverage of a derived column.

Measured in this session: 10 successful queries against `xgzxfsqwtemlcosglhzr` (2 more timed out and
were abandoned). All code claims are `file:line` from the working tree at `docs/cas-frontend-data-scale`.

---

## F1. `pitcher_season_command` is frozen at ~mid-June 2026; every Triton command grade on the research app is two months stale

- **Impact:** **critical** — Cmd+, Brink+, Cluster+/ClusterR+/ClusterL+, HDev+, VDev+, Missfire+,
  Close%+, RPCom+ and Waste% for the 2026 season are computed from roughly the first 53% of the
  season. 522 pitchers have 2026 rows where 765 had 2025 rows. Every consumer is affected:
  `app/api/leaderboard-triton/route.ts:57`, `app/api/scene-stats/route.ts:868` and `:1589`
  (broadcast overlays), `lib/sql.ts:130`, and `refresh_league_averages` — which means the 2026
  *league baseline* for these metrics is also derived from the frozen snapshot, so the plus-stats
  are being centred on a June league.
- **Location:** `app/api/compute-triton/route.ts:50-69` (the batched `run_query` fetch) and
  `app/api/cron/refresh/route.ts:76-97` (the caller that cannot see the failure).
- **What's wrong:** `compute-triton` re-derives the whole season from scratch on every run. It pulls
  every qualifying pitch for the year in batches of 50 pitchers:

  ```
  SELECT pitcher, player_name, pitch_name, game_year, plate_x, plate_z, sz_top, sz_bot,
         zone, description, stand
  FROM pitches WHERE game_year = 2026 AND game_type = 'R' AND pitcher IN (<50 ids>) ...
  ```

  That goes through `run_query`, which the `authenticator` role caps at 8s. Early in the season
  50 pitchers × ~700 pitches serialises fine; by mid-season 50 pitchers × ~2,700 pitches does not.
  On the first batch that trips the cap, `route.ts:67` does
  `return NextResponse.json({ error: error.message, batch: i }, { status: 500 })` — **before any
  upsert has run** (the upsert loop is at `:272`). So a failure writes *nothing* and the table
  silently retains whatever the last fully-successful night wrote. There is no partial progress and
  no marker; the row just stops changing.
- **Evidence:**

  ```sql
  SELECT 'cmd' src, game_year, game_type, SUM(pitches) sum_p, MAX(pitches) max_p
  FROM pitcher_season_command WHERE game_year >= 2024 GROUP BY 1,2,3
  UNION ALL SELECT 'dec', game_year, game_type, SUM(pitches), MAX(pitches)
  FROM pitcher_season_deception WHERE game_year >= 2024 GROUP BY 1,2,3;
  ```

  | src | year | type | sum(pitches) | max(pitches) |
  |---|---|---|---|---|
  | cmd | 2024 | R | 725,387 | 1,726 |
  | cmd | 2025 | R | 740,200 | 1,685 |
  | **cmd** | **2026** | **R** | **273,724** | **741** |
  | dec | 2024 | R | 643,392 | 1,657 |
  | dec | 2025 | R | 640,139 | 1,651 |
  | **dec** | **2026** | **R** | **506,526** | **1,386** |

  `pitcher_season_deception` is produced by the sibling route in the *same* `Promise.all`
  (`refresh/route.ts:79-88`) from the *same* `pitches` rows, and it is current (1,386 / 1,651 ≈ 84%
  of a full season, which matches a season played through 2026-08-21). `pitcher_season_command` is
  at 741 / 1,386 = **53.5%** of deception's progress.

  Distinct-pitcher counts confirm it and rule out "2026 is just a short season":

  | year | cmd pitchers | dec pitchers |
  |---|---|---|
  | 2024 | 749 | 609 |
  | 2025 | 765 | 617 |
  | **2026** | **522** | **578** |

  `compute-triton` uses a ≥50-pitches-per-pitch-*name* threshold and `compute-deception` uses ≥100
  per pitch-*type*, so command should have **more** pitchers than deception in every season. It does,
  every year — except 2026, where the ordering inverts.
- **Expected vs actual:** expected ~740 pitchers / ~2,650 rows / max(pitches) ≈ 1,400 for a season
  84% complete. Actual: 522 pitchers / 1,730 rows / max(pitches) = 741.
- **Fix:** two parts, both required.
  1. Make the failure visible *now*: in `app/api/cron/refresh/route.ts`, `allComputeFailed` at `:96`
     tests `r.error` on the wrapper object, which is only set when `fetch()` itself throws (`:90`).
     An HTTP 500 lands as `{ triton: { error: '…' }, deception: {…} }` and reads as success. Change to
     inspect the inner payloads *and* the response status, and add `computeResults` to the `counts`
     object at `:183-191` so `cron_runs` retains the evidence.
  2. Make the compute fit: drop `BATCH_SIZE` from 50 to ~12 in `compute-triton/route.ts:46`, or move
     the per-pitcher aggregation into SQL (the centroid and per-pitch sums are all expressible as
     window functions) so the 8s cap applies to an aggregate, not a 65k-row jsonb payload. Batching
     down is the one-liner; SQL aggregation is the durable fix.
- **Confidence:** **verified** that the table is frozen at ~53.5% of the season and that the caller
  cannot detect a compute failure. **Probable** on the specific mechanism being the 8s cap on the
  50-pitcher SELECT batch — I did not reproduce the timeout, and there is no recorded trace to read
  (that absence is the finding). The freeze date of ~2026-06-13 is **inferred** from the 53.5% ratio.

---

## F2. 1,791,293 rows have every input and a matching baseline and were never scored; 2015–2018 are scored for April–June only

- **Impact:** **critical** — `pitches.stuff_plus` coverage is 44% in 2015–2018 and 86–90% in most
  other seasons. Any career or multi-season Stuff+ view is averaging a **half-season sample from
  2015–2018 against near-complete samples from 2019+**, with no sample-size marker. Because Stuff+
  re-centres on 100 by construction, a partial subset still averages ≈100, so nothing on screen
  looks wrong.
- **Location:** `pitches.stuff_plus`; produced by `app/api/update/route.ts:306-352`
  (`applyStuffPlusForDateRange`) and `app/api/admin/backfill-stuff-plus/route.ts:35-184`.
- **What's wrong:** the historical backfill never completed. `backfill-stuff-plus` walks the season
  one day at a time issuing **three** RPC round-trips per chunk — a target `COUNT` (`:107`), the
  `UPDATE` (`:122`), and a coverage `COUNT` (`:150`) — with `maxDuration = 300` and **no wall-clock
  budget and no persisted cursor**. A 2015 season is ~185 game days ⇒ ~555 RPC calls. At ~1.1 s
  each that is 300 s, and Vercel kills the function mid-walk. The route's own failure path
  (`:193-218`) only fires on a *SQL* error; a platform kill returns nothing at all, so the operator
  gets no `failed_chunk` to resume from.
- **Evidence:** full-table pass (one seq scan, all 12 seasons):

  ```sql
  SELECT game_year, COUNT(*) total, COUNT(stuff_plus) scored,
    COUNT(*) FILTER (WHERE release_speed IS NOT NULL AND pitch_name IS NOT NULL) eligible,
    COUNT(*) FILTER (WHERE release_speed IS NOT NULL AND pitch_name IS NOT NULL
                       AND stuff_plus IS NULL) elig_unscored
  FROM pitches GROUP BY game_year ORDER BY game_year;
  ```

  | year | total | scored | cov % | eligible | eligible-unscored |
  |---|---|---|---|---|---|
  | 2015 | 747,843 | 331,922 | **44.4** | 711,865 | **379,943** |
  | 2016 | 788,314 | 348,139 | **44.2** | 737,002 | **388,863** |
  | 2017 | 807,099 | 354,225 | **43.9** | 726,985 | **372,760** |
  | 2018 | 795,336 | 362,113 | **45.5** | 728,219 | **366,106** |
  | 2019 | 807,039 | 727,759 | 90.2 | 740,883 | 13,124 |
  | 2020 | 311,024 | 263,560 | 84.7 | 272,873 | 9,313 |
  | 2021 | 791,457 | 709,486 | 89.6 | 753,505 | 44,019 |
  | 2022 | 746,360 | 708,117 | 94.9 | 726,679 | 18,562 |
  | 2023 | 817,151 | 717,171 | 87.8 | 774,502 | 57,331 |
  | 2024 | 810,047 | 709,223 | 87.6 | 763,568 | 54,345 |
  | 2025 | 826,259 | 708,781 | 85.8 | 784,025 | 75,244 |
  | 2026 | 704,119 | 689,512 | 97.9 | 701,194 | 11,683 |

  Total eligible-unscored: **1,791,293**. "Eligible" here is the exact predicate the UPDATE needs
  (`release_speed IS NOT NULL`, `pitch_name IS NOT NULL`), and the missing-baseline explanation is
  ruled out — `pitch_baselines` carries 16–19 pitch names for **every** season 2015–2026 covering
  687k–784k pitches per year, i.e. essentially the whole eligible population:

  ```sql
  SELECT game_year, COUNT(*) n_baselines, SUM(pitch_count) baseline_pitch_total,
         COUNT(*) FILTER (WHERE std_velo IS NULL OR std_velo = 0 OR std_movement IS NULL
                            OR std_movement = 0 OR std_ext IS NULL OR std_ext = 0) degenerate_std
  FROM pitch_baselines GROUP BY game_year ORDER BY game_year;
  ```
  → 2015: 19 names / 687,073 pitches; 2026: 19 names / 699,475. Every year covered.

  The temporal fingerprint, 2015:

  ```sql
  SELECT EXTRACT(MONTH FROM game_date)::int mo, COUNT(*) total, COUNT(stuff_plus) scored
  FROM pitches WHERE game_year = 2015 GROUP BY 1 ORDER BY 1;
  ```

  | month | total | scored |
  |---|---|---|
  | 3 (spring) | 45,537 | **0** |
  | 4 | 94,253 | 94,102 |
  | 5 | 121,910 | 121,732 |
  | 6 | 116,165 | 116,088 |
  | 7 | 108,309 | **0** |
  | 8 | 123,528 | **0** |
  | 9 | 121,713 | **0** |
  | 10 | 16,428 | **0** |

  A clean cut on 1 July. April–June is ~91 game days ≈ 273 RPC calls ≈ the 300 s ceiling.
  2016/2017/2018 show the same ~44–46% coverage and I did not re-measure their month profile
  (the equivalent query timed out at the MCP layer twice).
- **Expected vs actual:** expected ≥99% of eligible rows scored in every season (2019 and 2026 prove
  it is achievable). Actual: 46.6% of eligible rows scored in 2015, 90.4% in 2025.
- **Fix:** give `backfill-stuff-plus` a wall-clock budget and a resume cursor, then run it.
  Concretely: drop the per-chunk coverage `COUNT` (`:150-159`, it is a third of the round-trips and
  can be one query at the end), track `Date.now() - t0` and return `{ ok: false, resume_from }` at
  ~240 s instead of being killed, and persist `resume_from` to `system_metadata` so a scheduled
  re-invocation continues automatically. Then `?year=2015..2018&mode=repair` — repair mode guards on
  `stuff_plus IS NULL` so it is idempotent and will not touch April–June.
  Blast radius before running: ~1.79M row updates on a 9.7 GB table with **29 indexes**, of which
  `idx_pitches_stuff_plus` is a partial index on the column being written — expect ~1.79M new index
  entries and a comparable dead-tuple count. Chunk it and let autovacuum keep up, or VACUUM between
  seasons.
- **Confidence:** **verified** on the coverage numbers and the 2015 month profile. **Probable** on
  the 300 s wall-clock kill as the cause (the arithmetic fits exactly, but no run record survives).

---

## F3. A Stuff+ day that times out is never retried once it leaves the 3-day window — live 11,724-row hole at 2026-08-10/11/12

- **Impact:** **high** — three consecutive current-season days have **zero** scored pitches.
  11,683 of the 11,724 rows are eligible, which is **100.0%** of the entire 2026 eligible-unscored
  deficit (11,683 from the F2 table). Player pages, leaderboards and the 2026 league Stuff+ average
  all silently exclude those three days.
- **Location:** `app/api/update/route.ts:318-339` (`applyStuffPlusForDateRange`, per-day loop) and
  `app/api/cron/pitches/route.ts:36-37` (the 3-day rolling window).
- **What's wrong:** the scoring UPDATE runs one statement per `game_date` and catches per-day
  failures so the rest of the window still lands (`:335-338`) — correct. But a failed day is only
  ever re-attempted while it remains inside the next ingest's `[today-3, today]` window. Once it
  slides out, **nothing** re-scores it. There is no repair cron; `backfill-stuff-plus` exists but is
  manual and unscheduled.
- **Evidence:** per-day coverage, 2026-07-15 → present:

  ```sql
  SELECT game_date, COUNT(*) total, COUNT(stuff_plus) scored,
         COUNT(*) FILTER (WHERE release_speed IS NOT NULL AND pitch_name IS NOT NULL
                            AND stuff_plus IS NULL) elig_unscored
  FROM pitches WHERE game_date >= '2026-07-15' GROUP BY game_date ORDER BY game_date DESC;
  ```

  | game_date | total | scored | eligible-unscored |
  |---|---|---|---|
  | 2026-08-13 | 2,631 | 2,626 | 0 |
  | **2026-08-12** | **4,487** | **0** | **4,468** |
  | **2026-08-11** | **4,236** | **0** | **4,222** |
  | **2026-08-10** | **3,001** | **0** | **2,993** |
  | 2026-08-09 | 4,535 | 4,501 | 0 |

  Every other day from 07-15 to 08-21 is ≥99.2% scored with 0 eligible-unscored. And `cron_runs`
  names the cause verbatim:

  ```sql
  SELECT job, started_at::date d, status, duration_ms, left(error_message,160) err
  FROM cron_runs WHERE job IN ('pitches','refresh') AND started_at >= '2026-08-08'
  ORDER BY started_at DESC;
  ```

  - `2026-08-15 pitches error` — `Stuff+ scoring failed for 1 game type(s) — R: 1/2 day(s) failed — 2026-08-12: run_mutation failed: canceling statement due to statement timeout`
  - `2026-08-18 pitches error` — `… 1/3 day(s) failed — 2026-08-15: … statement timeout`
  - `2026-08-19 pitches error` — `… 2/2 day(s) failed — 2026-08-16: … statement timeout; 2026-08-17: run…`
  - `2026-08-22 pitches error` — `… 1/3 day(s) failed — 2026-08-19: … statement timeout`
  - **no `pitches` or `refresh` row exists for 2026-08-14 at all** — the cron did not run or was
    killed before `trackCronRun` could insert.

  So the per-day UPDATE is crossing the 8s `authenticator` cap on roughly **1 night in 4**. Days
  that get another shot inside the window recover (08-15, 08-16, 08-17 are all scored now); days
  that do not are lost (08-10/11/12).
- **Expected vs actual:** expected ≥99% coverage on every current-season day. Actual: 0% on three of
  them, permanently.
- **Fix:** two changes.
  1. Persist the failed days instead of only reporting them — write them to `system_metadata`
     (or a small `scoring_backlog` table) in the `failures` branch at `update/route.ts:341`, and
     have the next run drain the backlog before the current window. That converts an unbounded loss
     into a bounded retry.
  2. Get the statement back under 8 s. ~4.5k rows/day × 29 indexes is now marginal; split the day by
     `pitch_name` (the join key, and `idx_pitches_pitch_name` exists) or by half-day on
     `game_pk`, so each statement touches ~1–2k rows. Splitting by `pitch_name` is the smaller diff
     and keeps the UPDATE's `FROM pitch_baselines b` join intact.

  Immediate one-off repair for the existing hole:
  `GET /api/admin/backfill-stuff-plus?year=2026&mode=repair&start=2026-08-10&end=2026-08-13`
  — 3 chunks, ~11.7k rows, well inside the wall clock.
- **Confidence:** **verified.**

---

## F4. The `pitches` cron runs at 78–88% of the 300 s Vercel ceiling every single night

- **Impact:** **high** — this is the function that both ingests and scores. A single slow Savant
  response or one extra retry loop kills it, and a kill leaves rows committed but unscored with the
  window already sliding (F3), plus an orphaned `running` row that `trackCronRun:27-41` will later
  relabel `timeout`.
- **Location:** `app/api/cron/pitches/route.ts:9` (`export const maxDuration = 300`).
- **Evidence:** `duration_ms` for `job='pitches'` over 2026-08-08 → 2026-08-22:
  234,696 / 237,136 / 239,892 / 245,370 / 247,165 / 247,754 / 248,332 / 249,080 / 249,501 /
  252,522 / 255,229 / 256,676 / 257,337 / 263,860 ms. Median ≈ 248 s, max ≈ 264 s, against 300 s.
  For contrast `refresh` runs 47.9–65.9 s.
- **Expected vs actual:** a nightly job should sit well under half its ceiling. This one has ~36 s
  of headroom on its worst night.
- **Fix:** the dominant cost is almost certainly the unconditional 500-row upsert loop
  (`update/route.ts:148-169`) re-writing the whole 3-day window — `totalInserted` of 7,237–10,965 a
  night against a window that only gains ~4.5k genuinely new rows means ~half the writes are no-ops
  that still churn 29 indexes. Narrow the ingest window from 3 days to 2, or move the per-day Stuff+
  scoring into its own cron invocation (it is already a pure function of `game_date` and
  `pitch_baselines`, so it does not need to share a process with the ingest). Splitting is the
  better fix — it also gives the F3 backlog drain somewhere to live.
- **Confidence:** **verified** on the durations; **inferred** on the upsert being the dominant term
  (I did not profile the route).

---

## F5. A stored score cannot be tied to the baseline that produced it, and no derived table has a timestamp

- **Impact:** **high** for reproducibility and for detection. You cannot answer "when was this row
  last computed", "which baseline produced this Stuff+", or "is this table stale" with a query —
  which is precisely why F1 went unnoticed. It also means two rows in the same season carry scores
  computed against different baselines.
- **Location:** schema. `information_schema.columns` for the four derived tables:

  | table | has a timestamp column? |
  |---|---|
  | `pitch_baselines` | **no** — `pitch_name, game_year, avg_velo, std_velo, avg_movement, std_movement, avg_ext, std_ext, pitch_count` |
  | `pitcher_season_command` | **no** — 27 columns, none temporal |
  | `pitcher_season_deception` | **no** — 20 columns, none temporal |
  | `player_season_stats` | yes — `updated_at timestamptz` |

- **What's wrong:** `refreshPitchBaselines` (`app/api/update/route.ts:241-285`) rebuilds the current
  season's baselines **destructively** every night — `ON CONFLICT … DO UPDATE SET` over the full
  season aggregate — while `applyStuffPlusForDateRange` scores only the last 3 days. So an April
  pitch carries a score computed against the April-13th version of the 2026 baseline; an August
  pitch carries one computed against the August version. The baseline moves all season (velocity
  and movement distributions shift as the pitch mix changes), the score does not, and there is no
  version key on either side. Re-running `mode=rescore` on any past date therefore produces a
  *different* number with no way to tell which is on screen.
- **Evidence:** the schema query above (no timestamps anywhere), plus `update/route.ts:269-276`
  (destructive upsert, no history) and `:304` — the comment `Deliberately does NOT refresh baselines
  first` confirms the split is intentional. Scheduling makes it worse in one direction:
  `vercel.json` runs `/api/cron/pitches` at `0 9 * * *` and `/api/cron/refresh` (which owns
  `refreshPitchBaselines`, `refresh/route.ts:60`) at `10 9 * * *` — **scoring runs 10 minutes before
  the baselines it uses are refreshed**, so every night's rows are scored against yesterday's
  baseline.
- **Fix:** add `computed_at timestamptz DEFAULT now()` to all three derived tables (cheap, no
  rewrite on Postgres 12+ for a defaulted column) and set it in every upsert. Then add
  `baseline_version int` to `pitch_baselines` and stamp it onto scored rows — or, far cheaper and
  probably sufficient, freeze the season's baselines once the sample is large enough (say 150k
  pitches) and stop refreshing them nightly, which removes the drift entirely and makes `rescore`
  reproducible. I would do the freeze.
- **Confidence:** **verified** on the schema, the destructive upsert and the cron ordering.

---

## F6. Two different Stuff+ implementations write the same column, and the second swallows every error

- **Impact:** **high** if the Python path has ever run — `pitches.stuff_plus` would then be a mix of
  an XGBoost run-value model and a three-term z-score formula with no column distinguishing them.
- **Location:** `scripts/stuff_model/backfill.py:159-201` vs `app/api/update/route.ts:320-333`.
- **What's wrong:** `backfill.py` predicts `stuff_rv` from a 15-feature XGBoost model and writes
  `pitches.stuff_plus` via a `CASE`-statement UPDATE over 1,000 rows at a time (`:187-192`), then
  writes `pitcher_season_command.avg_stuff_rv` and `.stuff_plus` (`:219-228`). Three problems:
  1. It issues **UPDATEs through `run_query`** (`:193`, `:228`), which is the SELECT-only RPC. Those
     writes cannot succeed.
  2. Every exception is swallowed — `except Exception as e: … continue` (`:194-196`) and
     `except Exception: pass` (`:229-230`) — and it then prints `Done: {len(updates)} pitches
     updated for {year}` regardless. The script reports success whether or not a single row changed.
  3. `ALL_YEARS = list(range(2015, 2026))` (`:28`) — it targets exactly the seasons with the worst
     coverage.
- **Evidence:** code read, plus the orphan columns it is the only writer for: `pitcher_season_command`
  has `avg_stuff_rv numeric` and `stuff_plus numeric`, and a repo-wide grep for writers of those
  columns returns only `backfill.py`. `compute-triton/route.ts:240-266` does not include them in its
  upsert, and no reader references them either (`leaderboard-triton/route.ts:50-57` selects the
  command columns explicitly and gets Stuff+ from `pitches` instead, `:62-66`).
- **Fix:** delete `scripts/stuff_model/backfill.py`, or gate it behind `run_mutation` and remove the
  bare excepts. Either way, drop `pitcher_season_command.stuff_plus` and `.avg_stuff_rv` — dead
  columns on a derived table are a trap for the next person writing a join.
- **Confidence:** **verified** that two implementations target the same column and that the Python
  one cannot write through `run_query` and cannot report failure. **Suspected** on whether it ever
  ran and left rows behind — I did not spend a query on the null-rate of
  `pitcher_season_command.avg_stuff_rv`, which is the cheap test (`SELECT COUNT(avg_stuff_rv),
  COUNT(*) FROM pitcher_season_command`).

---

## F7. The scoring UPDATE silently imputes missing inputs instead of skipping the row

- **Impact:** **medium** — a row that is missing movement or extension is still scored, with the
  missing term set to exactly league average. This is invisible to any coverage monitor, because
  coverage counts non-NULL `stuff_plus` and the row *has* one. In 2026, 1,718 rows are scored with
  `release_extension IS NULL`; historically 8,549 in 2015 and 5,208 in 2016.
- **Location:** `app/api/update/route.ts:322-332` and the identical block in
  `app/api/admin/backfill-stuff-plus/route.ts:124-135`.
- **What's wrong:** the guard is `AND p.release_speed IS NOT NULL` only. The other two terms are

  ```sql
  + COALESCE((SQRT(POWER(p.pfx_x*12,2) + POWER(p.pfx_z*12,2)) - b.avg_movement) / NULLIF(b.std_movement,0), 0) * 3.5
  + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
  ```

  A NULL `pfx_x` makes the whole numerator NULL, `COALESCE` turns it into 0, and 0 means "exactly
  league average for this component". The same `COALESCE` also masks a degenerate baseline: three
  `pitch_baselines` rows (2016, 2021, 2026 — one each) have a zero or NULL stddev, so `NULLIF`
  yields NULL and that component contributes 0 for every pitch of that type. This is the failure
  mode where a Savant schema change that drops `pfx_x` leaves Stuff+ **100% populated and quietly
  velocity-only**.
- **Evidence:** from the F2 full-table query — `COUNT(*) FILTER (WHERE stuff_plus IS NOT NULL AND
  release_extension IS NULL)` = 8,549 (2015), 5,208 (2016), 1,718 (2026); and
  `COUNT(*) FILTER (WHERE stuff_plus IS NOT NULL AND (pfx_x IS NULL OR pfx_z IS NULL))` = 134 (2025),
  45 (2017), ≤11 elsewhere. Degenerate baselines from the `pitch_baselines` query: `degenerate_std`
  = 1 for 2016, 2021 and 2026.
- **Fix:** either tighten the guard to `AND p.pfx_x IS NOT NULL AND p.pfx_z IS NOT NULL AND
  p.release_extension IS NOT NULL` (making missingness visible as a NULL score), or keep the
  imputation and add a `stuff_plus_terms smallint` column recording how many of the three components
  were real. The first is a one-line change and I would take it — imputing to the mean is a
  measurement decision, not a reliability one, and if it is wanted it belongs to **Li**, not here.
- **Confidence:** **verified.**

---

## F8. 2026 command plus-stats are normalised against 2025 baselines via a silent nearest-year fallback

- **Impact:** **medium** — every `*_plus` value in `pitcher_season_command` for 2026 is computed
  against a 2025 league distribution. Nothing records the substitution.
- **Location:** `lib/leagueStats.ts:1231-1241` (`getLeagueBaseline` fallback) and the eight
  hardcoded tables at `:10, :89, :168, :247, :326, :405, :484, :563`.
- **What's wrong:** `BRINK_LEAGUE_BY_YEAR`, `CLUSTER_LEAGUE_BY_YEAR`, `CLUSTER_R/L`, `HDEV`, `VDEV`,
  `MISSFIRE` and `CLOSE_PCT` all end at **2025**. `AVAILABLE_YEARS` (`:1211`) includes 2026, so
  `getLeagueBaseline('brink', pitchName, 2026)` misses the exact match and falls through to
  "nearest year that has this pitch type" — 2025 — and returns it with no signal to the caller.
  `compute-triton/route.ts:124-129` memoises the result and uses it directly.
  Only `STUFF_LEAGUE_BY_YEAR` (`:986`) and `BL_BY_YEAR` (`:1139`) have 2026 rows, and the
  `STUFF_LEAGUE_BY_YEAR` 2026 block is a **verbatim copy of 2025** under a comment reading
  `Placeholder baselines — will be populated after running train.py` (`:907-908`).
- **Evidence:** code read; `grep -n "  2026:" lib/leagueStats.ts` returns exactly two hits, at
  `:986` and `:1139`, neither of which is a command-metric table.
- **Expected vs actual:** expected 2026 grades centred on the 2026 league. Actual: centred on 2025,
  silently. The measured direction of drift in `pitch_baselines` (2025 4-Seam avg_velo 94.50 →
  2026 94.20; Sweeper 82.49 → 81.99) says the two leagues are not identical.
- **Fix:** make the fallback loud — return `{ …entry, fallbackYear }` from `getLeagueBaseline` and
  have `compute-triton` record it, or refuse to compute a `*_plus` for a year with no table entry.
  Whether a 2025 baseline is an *acceptable* stand-in for 2026 is **Li's** call; my objection is only
  that the substitution leaves no trace.
- **Confidence:** **verified** on the mechanism.

---

## F9. 211 of the 2026 deception rows are frozen at their April/May values by a mid-season threshold change

- **Impact:** **medium** — 211 / 1,926 (11.0%) of 2026 `pitcher_season_deception` rows are computed
  from 30–99 pitches against an April league baseline, and can never be refreshed for the rest of
  the season. They are indistinguishable on screen from rows recomputed last night.
- **Location:** `app/api/compute-deception/route.ts:22-24, 49`.
- **What's wrong:**

  ```ts
  const isEarlyCurrentSeason = year === Number(today.slice(0,4)) && Number(today.slice(5,7)) <= 5
  const minPitches = isEarlyCurrentSeason ? 30 : 100
  ```

  The `HAVING COUNT(*) >= ${minPitches}` threshold jumps from 30 to 100 on 1 June. The write is a
  pure upsert (`:143-145`) with **no delete of rows that no longer qualify**, so any pitcher-pitch_type
  that reached 30 pitches by May and then stopped (injury, option, release) keeps its April row
  forever. Worse, that row's z-scores were computed against the *April* qualifying population — a
  small, survivorship-biased set — because the baselines at `:66-81` are derived in-request from
  whichever rows cleared the threshold that day.
- **Evidence:**

  ```sql
  SELECT game_year, game_type, COUNT(*) rows_, COUNT(*) FILTER (WHERE pitches < 100) under_100,
         MIN(pitches) min_p, MAX(pitches) max_p, COUNT(DISTINCT pitcher) pitchers
  FROM pitcher_season_deception GROUP BY 1,2 ORDER BY 1,2;
  ```

  | year | type | rows | under_100 | min_p | max_p |
  |---|---|---|---|---|---|
  | 2017–2025 | R | 965–1,938 | **0** | **100** | 698–2,329 |
  | **2026** | **R** | **1,926** | **211** | **30** | 1,386 |
  | 2026 | S | 59 | 0 | 100 | 191 |

  Every completed season has `min(pitches) = 100` exactly. Only the current season carries the
  30-pitch tail. (Also visible: no 2015 or 2016 rows at all — deception starts in 2017.)
- **Fix:** delete non-qualifying rows for the target `(game_year, game_type)` in the same
  transaction as the upsert, or keep the threshold at a single value for the whole season and accept
  an empty April. Deleting is the smaller change and is what the season-cumulative semantics imply.
- **Confidence:** **verified.**

---

## F10. Two consumers of `pitcher_season_command` ignore `game_type`, so 2026 mixes spring training into the regular season

- **Impact:** **medium** — 2026 is the first season with spring-training rows in the table (638 `S`
  rows, 45,587 pitches). Two readers do not filter on `game_type`, so those rows are pooled into the
  regular-season pivot, inflating each affected pitcher's `pitches` weight and dragging their
  usage-weighted command averages toward a March sample.
- **Location:** `app/api/scene-stats/route.ts:867-870` and
  `scripts/create-refresh-league-averages.sql:526-528`. Both read
  `FROM pitcher_season_command WHERE game_year = <year>` with no `game_type` predicate.
  `app/api/leaderboard-triton/route.ts:58` *does* filter correctly.
- **Evidence:**

  ```sql
  SELECT game_year, game_type, COUNT(*) rows_, COUNT(DISTINCT pitcher) pitchers
  FROM pitcher_season_command GROUP BY 1,2 ORDER BY 1,2;
  ```
  → 2015–2025 have `R` only. 2026 has `R` (1,730 rows / 522 pitchers) **and** `S` (638 rows /
  439 pitchers). `pivotTritonRows` (`lib/sql.ts:63-75`) sums `pitches` per pitcher across all rows
  it is handed, so a pitcher with both an `S` and an `R` row is double-counted.
- **Fix:** add `AND game_type = 'R'` at `scene-stats/route.ts:869` and at
  `create-refresh-league-averages.sql:527`. Two-line change; the `league_averages` one needs the
  function redeployed. The rendered-output half of this is **Cas's** to confirm.
- **Confidence:** **verified** on the data and the missing predicate.

---

## F11. The MiLB Stuff+ path still has the failure mode the MLB path was fixed for, and leaves no trace

- **Impact:** **medium** — `milb_pitches.stuff_plus` is scored by a single statement covering the
  whole 3-day window, which is exactly what the MLB comment at `update/route.ts:296-303` says drove
  MLB coverage to zero. When it fails, the caller only `console.error`s and `cron_runs` records
  `success`.
- **Location:** `app/api/update/milb/route.ts:497-511` (one UPDATE, `game_date BETWEEN start AND end`)
  and `:384-388` (`if (!stuffResult.ok) console.error(...)`), reached from
  `app/api/cron/milb-pitches/route.ts:25-37`, which never inspects `result.stuff_plus`.
- **What's wrong:** the MLB fix — one statement per day, failures collected and rethrown so
  `trackCronRun` records `status='error'` (`cron/pitches/route.ts:75-84`) — was never ported. MiLB
  also refreshes `milb_pitch_baselines` *inside* the same call, immediately before scoring
  (`:465-492`), which is the opposite ordering to MLB, so the two `stuff_plus` columns are not
  computed the same way even though the formula text is identical.
- **Evidence:** code read. I did not measure `milb_pitches` coverage — it is outside the research-app
  slice and would have cost a query I did not have.
- **Fix:** port `applyStuffPlusForDateRange`'s per-day loop and failure rethrow to
  `computeMilbStuffPlus`, and have `cron/milb-pitches` throw on `stuff_plus.ok === false` the way
  `cron/pitches` does.
- **Confidence:** **verified** on the code; **suspected** on whether MiLB coverage is actually
  degraded today (unmeasured).

---

## F12. Nothing measures coverage of any derived column

- **Impact:** **medium**, and it is the reason F1, F2 and F3 all persisted. The integrity cron
  (`0 10 * * *`) runs eight checks and not one of them looks at whether a derived column got
  populated.
- **Location:** `lib/dataIntegrity.ts` — the eight checks are `unknown_players`,
  `orphaned_pitchers`, `orphaned_batters`, `new_pitch_names`, `season_constants`,
  `materialized_views`, `league_averages`, `pitch_baselines`.
- **What's wrong:** `checkPitchBaselines` (`:397-433`) verifies the baselines *exist* and are not
  degenerate — but never that anything was *scored against* them. There is no check on
  `pitches.stuff_plus` coverage, no check that `pitcher_season_command` moved, no check that
  `pitcher_season_deception` moved. The failure that F1 describes is exactly the shape none of these
  eight can see. (`app/api/cron/janitor/route.ts:187-215` does read `cron_runs` and email a health
  digest via Resend, so the F3 *run* failures were reportable — but a job that never records a
  failure, like `refresh`, is invisible to it.)
- **Fix:** the highest-value single addition is a coverage check on the last 3 completed game days:

  ```sql
  SELECT game_date, COUNT(*) total, COUNT(stuff_plus) scored
  FROM pitches
  WHERE game_date >= current_date - 4 AND game_date < current_date - 1
  GROUP BY game_date HAVING COUNT(stuff_plus)::float / COUNT(*) < 0.95;
  ```

  Any row returned is a `fail`. Date-scoped, rides `idx_pitches_game_date`, and would have fired on
  2026-08-13. Pair it with a staleness check on the season tables once F5's `computed_at` exists —
  until then, `MAX(pitches)` on `pitcher_season_command` vs `pitcher_season_deception` for the
  current season is a usable proxy and is what caught F1.
- **Confidence:** **verified** (check inventory read in full).

---

## F13. Spring training and postseason are unscored across most of the archive

- **Impact:** **low** — spring rows exist in `pitches` and are never scored. 2015 alone has 45,537
  `game_type='S'` rows, 0 scored. `pitcher_season_command` has **no** `S` or `P` rows before 2026,
  and `pitcher_season_deception` has none before 2026 either.
- **Location:** consequence of the F2 backfill never reaching them plus `compute-triton` /
  `compute-deception` only ever being invoked with the game types in the current
  `pitches_last_run` marker (`refresh/route.ts:44, 77`).
- **Evidence:** `SELECT game_type, COUNT(*), COUNT(stuff_plus) FROM pitches WHERE game_year = 2015
  GROUP BY game_type` → `R: 702,306 / 331,922`, `S: 45,537 / 0`. Command/deception `game_type`
  breakdown as in F10.
- **Fix:** decide whether spring/postseason are in scope at all. If they are, the F2 backfill run
  covers `pitches.stuff_plus` for free (it chunks by date, not game type) and the season tables need
  a one-off `?year=YYYY&gameType=S` sweep. If they are not, the UI should say so.
- **Confidence:** **verified** for 2015 and for the season tables.

---

## What is working

Worth saying plainly, because most of this pipeline is sound:

- The **nightly Stuff+ path for the current season is healthy** outside the three-day hole:
  every 2026 game day from 07-15 to 08-21 except 08-10/11/12 is ≥99.2% scored with **zero**
  eligible-unscored rows.
- **The per-day decomposition works.** `applyStuffPlusForDateRange` isolates a failing day instead
  of stranding the window, and `cron/pitches` rethrows so `cron_runs` gets `status='error'` with the
  verbatim Postgres message. That is a genuinely good design and it is what let me diagnose F3 in
  one query.
- **`pitch_baselines` is complete and non-degenerate.** 16–19 pitch names for every season
  2015–2026, covering essentially the entire eligible population, with only 3 zero-stddev rows in
  12 seasons.
- **`backfill-stuff-plus` is correct where it counts** — half-open date chunks on an indexed
  immutable column, a dry-run count that reproduces the UPDATE's `FROM` clause exactly (including
  the `pitch_baselines` join, so it cannot overstate progress), an idempotent `stuff_plus IS NULL`
  guard in repair mode, and a `failed_chunk` resume hint. Its only gap is the wall clock.
- **`compute-deception` is current and complete** — 1,926 rows for 2026 R with 0 NULL scores, and
  its qualification-threshold comment (`:19-21`) shows real thought about backfill determinism.
- **`compute-triton` degrades to NULL, not to garbage.** Every `*_plus` is guarded on a baseline
  existing (`:211-220`) and the composites on all their inputs (`:223-226`), which is why 2026's
  three rows with an unknown `pitch_name` (`2-Seam Fastball`, `Unknown`) come out NULL rather than
  ±Infinity.
- **`cron_runs` + the janitor digest is a real detector** for job-level failure, with orphaned-run
  reconciliation (`cronTracker.ts:27-41`) that correctly relabels Vercel kills as `timeout`.

---

## What I could not determine

- **Whether `compute-triton` is failing at the SELECT batch or somewhere else.** The freeze is
  verified; the mechanism is inferred from the 8s cap and the `return` at `route.ts:67`. There is no
  recorded trace, because `computeResults` is excluded from `cron_runs.counts`. The decisive test is
  a manual `POST /api/compute-triton?year=2026&gameType=R` and reading the response body — one call,
  no writes if it fails early. **Do this before shipping any fix.**
- **The exact freeze date of `pitcher_season_command`.** 53.5% of deception's progress puts it around
  2026-06-13, but with no `computed_at` column that is arithmetic, not evidence.
- **The month profile of 2016, 2017 and 2018.** Their eligible-unscored fractions (52.8 / 51.3 /
  50.3%) match 2015's almost exactly, so I expect the same April–June truncation, but the query that
  would prove it timed out twice at the MCP layer and I stopped rather than burn the budget.
- **The precise sequence that produced the 2026-08-10/11/12 hole.** The 8s timeouts and the missing
  2026-08-14 cron run are verified; reconstructing exactly which night dropped which day would need
  the Vercel function logs, since `cron_runs.counts` is NULL on error runs and `reportError`
  (`lib/observability.ts:29-36`) still only writes to stdout — there is no aggregator behind it.
- **Whether `scripts/stuff_model/backfill.py` ever wrote anything.** Cheap test:
  `SELECT COUNT(*) total, COUNT(avg_stuff_rv) rv, COUNT(stuff_plus) sp FROM pitcher_season_command`.
  If `rv > 0`, some `pitches.stuff_plus` values are XGBoost output and F6 escalates to critical.
- **MiLB coverage.** F11 is a code finding only; `milb_pitches.stuff_plus` was not measured.
- **Whether any of this is visible to a user.** Whether a half-covered 2015 season or a June-frozen
  Cmd+ is *rendered* with a sample-size or as-of marker is **Cas's** lane, and whether a 2025
  baseline is a defensible stand-in for 2026 (F8) or a 30-pitch deception score is defensible at all
  (F9) is **Li's**.

---

**Single highest-leverage next action:** run `POST /api/compute-triton?year=2026&gameType=R` by hand
and read the error. It confirms F1's mechanism in one call, and F1 is the only finding here where
current-season numbers on the research app are wrong right now with no indication anywhere in the
stack that they are.
