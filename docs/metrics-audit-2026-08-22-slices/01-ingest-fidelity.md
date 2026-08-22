# Slice 01 — Ingest Fidelity

**Verdict.** For the games it actually asks for, the Savant → `pitches` path is faithful. I pulled the
real Savant CSV for 2026-08-10 and for the 4-day window 2026-08-18…21, ran the repo's own parser over
both, and compared against the database: 3,001 CSV rows → 3,001 DB rows, 16,033 → 16,033, identical
non-null counts, identical min/max/mean on every physics column, zero column misalignment, zero silent
numeric coercion of text columns, and units preserved exactly as the source supplies them (feet for
`pfx_*`/`plate_*`/`release_extension`, mph for `release_speed`/`launch_speed`, rpm for spin). The upsert
key is backed by a real `UNIQUE` constraint, so re-runs are genuinely idempotent and `stuff_plus` is not
clobbered by re-ingest. That is the good news, and it is most of the surface area.

The damage is at the edges of the request, not inside it. **The cron asks Savant for postseason data with
a token Savant does not recognise**, so the database contains zero postseason pitches in its entire
history — every World Series pitch since 2015 is missing, ~14,245 pitches for 2025 alone, measured — and
because the October fetch returns an empty result, the whole downstream compute chain silently
short-circuits for two months a year while both crons record `success`. Beneath that sits a family of
"green means nothing happened" defects: a header-only Savant response passes the emptiness guard, rows
dropped by the parser are counted nowhere, `inserted` counts no-op updates (10,965 reported on a night
the table gained 4,443 rows), the 2026-08-14 run never happened and nothing noticed, and a Stuff+
scoring day that fails on the last night it is inside the window is never retried — which is why 11,683
eligible pitches on 2026-08-10/11/12 are permanently unscored today. Finally, two LLM schema prompts
declare `pfx_x`/`pfx_z` and `api_break_*` in **inches** when they are stored in **feet**: a 12× error in
any SQL those surfaces generate.

---

## F1. Postseason has never been ingested — `hfGT=P|` is not a Savant game-type token

- **Impact:** critical — `pitches` contains **zero** postseason rows for every season 2015–2025.
  For 2025 alone that is **14,245 pitches across 47 games** (Wild Card, Division, LCS, World Series).
  Across 11 postseasons the shortfall is on the order of 150k pitches. Every player page, arsenal,
  Stuff+ leaderboard, matchup model and report is regular-season-only without saying so. Worse: because
  the October/November fetch returns nothing, `totalInserted = 0` propagates to
  `system_metadata.pitches_last_run`, and `/api/cron/refresh` sets `skipDownstream = true` — so
  `refreshPitchBaselines`, `compute-triton`, `compute-deception`, `refresh_league_averages`,
  `refresh_league_percentiles` and `refresh_materialized_views` are **all skipped every night from
  1 October through 31 January**, and both crons record `success`.
- **Location:** `app/api/update/route.ts:11-15` (`GAME_TYPE_MAP`), consumed at `:65`;
  month→game-type logic at `app/api/cron/pitches/route.ts:31-34`; gate at
  `app/api/cron/refresh/route.ts:45-47`.
- **What's wrong:** `GAME_TYPE_MAP = { R: 'R|', S: 'S|', P: 'P|' }`. Baseball Savant's
  `statcast_search` `hfGT` parameter accepts `R|`, `S|`, `PO|`, `E|`, `A|` — the postseason token is
  **`PO|`**, and the individual round codes (`D`, `F`, `L`, `W`) that appear in the *output*
  `game_type` column are not accepted as *input* filters either. `P|` matches nothing, so Savant
  returns a header-only CSV. Separately, `app/api/cron/pitches/route.ts:32` only pushes `'R'` for
  months 3–9, so early-October regular-season games are not requested either, and `'A'` (All-Star)
  is never requested in any month.
- **Evidence:**

  Three live Savant fetches, same URL shape the code builds, date 2025-10-15:

  ```
  hfGT=P|   → http=200 bytes=1825    rows 0
  hfGT=PO|  → http=200 bytes=196989  rows 282   game_type Counter({'L': 282})
  hfGT=D|   → http=200 bytes=1825    rows 0
  ```

  Full 2025 postseason via the correct token:

  ```
  hfGT=PO| game_date_gt=2025-09-29 game_date_lt=2025-11-10
  → http=200 bytes=9738788
    rows 14245  games 47  types Counter({'D': 5534, 'F': 3171, 'L': 3111, 'W': 2429})
  ```

  The database, every October/November window 2015–2025:

  ```sql
  SELECT extract(year FROM game_date)::int AS yr, game_type, count(*) AS n, max(game_date) AS last_d
  FROM pitches
  WHERE (game_date BETWEEN '2015-10-02' AND '2015-11-15') OR ... OR (game_date BETWEEN '2025-09-29' AND '2025-11-15')
  GROUP BY 1,2 ORDER BY 1,2;
  ```
  ```
  yr=2015 game_type=R n=13027 last_d=2015-10-04
  yr=2016 game_type=R n=4339  last_d=2016-10-02
  (no other rows)
  ```

  Nothing for 2017–2025 in those windows at all, and not a single row of `game_type` in
  `('D','F','L','W','A','E')` in the table's history. A narrower check confirms the regular season
  itself is complete and simply stops on schedule:

  ```
  2023 R 26994  2023-09-25 → 2023-10-01
  2024 R 20320  2024-09-25 → 2024-09-30
  2025 R 16581  2025-09-25 → 2025-09-28
  ```
- **Expected vs actual:** expected ~14,245 postseason pitches for 2025 (measured at the source);
  actual 0. Expected ~150k across 2015–2025; actual 0.
- **Fix:** one-liner in code, plus a backfill. Change `GAME_TYPE_MAP.P` to `'PO|'` and add `'R'` to
  the October game types (`if (month >= 3 && month <= 10) gameTypes.push('R')`), then run
  `POST /api/update` per postseason with `game_type: 'P'`. **Blast radius of the backfill:** ~150k
  new rows into an 8.9M-row table with 6+ indexes — do it one postseason at a time, and note that
  `stuff_plus` for those rows needs `applyStuffPlusForDateRange` over each postseason's dates, which
  at 8s/day is fine but must be driven per day. Detector: an assertion that
  `count(*) FILTER (WHERE game_type IN ('D','F','L','W')) > 0` for every completed season.
- **Confidence:** verified — I ran the Savant fetches and the SQL in this session.

---

## F2. A Stuff+ scoring day that fails on its last night in the window is never retried

- **Impact:** high — **11,683 eligible pitches on 2026-08-10, 08-11 and 08-12 have `stuff_plus IS NULL`
  today**, a hard 3-day hole in an otherwise 99.5%+ column. Every surface that averages Stuff+ over a
  date range crossing 10–12 August silently drops those pitches (`AVG()` skips NULL), and a pitcher who
  only threw in that window has no Stuff+ at all. The failure recurs: `run_mutation failed: canceling
  statement due to statement timeout` is recorded on **4 of the last 8 nightly runs**.
- **Location:** `app/api/update/route.ts:306-352` (`applyStuffPlusForDateRange`), driven from
  `:181-202`; window at `app/api/cron/pitches/route.ts:37-38`.
- **What's wrong:** scoring is fire-once. `applyStuffPlusForDateRange` issues one `UPDATE` per day,
  catches per-day failures into a `failures[]` array, and returns `ok:false`. The cron turns that into a
  thrown error (`cron/pitches/route.ts:82-84`), which marks the run `error` — but **nothing re-drives the
  failed day**. The only retry is incidental: the next night's request window `[today-3, today]` happens
  to still contain it. Once a date falls out of that 4-day window it is never scored again, because
  scoring is only ever invoked from the ingest path over `min(ingested game_date) … max(ingested
  game_date)`. `2026-08-12` failed on the 2026-08-15 run; the 2026-08-16 run's window started at
  `2026-08-13`; it has been NULL ever since. Days that fail *early* in their window residency (08-15,
  08-16, 08-17, 08-19) all recovered on a later night — which is exactly why the defect is intermittent
  and invisible.
- **Evidence:**

  ```sql
  SELECT game_date, count(*) AS n, count(stuff_plus) AS n_stuff
  FROM pitches WHERE game_date >= '2026-07-28' GROUP BY 1 ORDER BY 1;
  ```
  ```
  2026-08-09  n=4535  n_stuff=4501
  2026-08-10  n=3001  n_stuff=0
  2026-08-11  n=4236  n_stuff=0
  2026-08-12  n=4487  n_stuff=0
  2026-08-13  n=2631  n_stuff=2626
  2026-08-14  n=4069  n_stuff=4059
  ```

  Not a data problem — the rows are fully eligible for the scoring `UPDATE`'s own predicates:

  ```sql
  SELECT p.game_date, count(*) n,
         count(*) FILTER (WHERE b.pitch_name IS NOT NULL AND p.release_speed IS NOT NULL) AS n_eligible,
         count(p.stuff_plus) AS n_stuff
  FROM pitches p LEFT JOIN pitch_baselines b
    ON b.pitch_name = p.pitch_name AND b.game_year = p.game_year
  WHERE p.game_date BETWEEN '2026-08-08' AND '2026-08-14' GROUP BY 1 ORDER BY 1;
  ```
  ```
  2026-08-10  n=3001  n_eligible=2993  n_stuff=0
  2026-08-11  n=4236  n_eligible=4222  n_stuff=0
  2026-08-12  n=4487  n_eligible=4468  n_stuff=0
  2026-08-13  n=2631  n_eligible=2626  n_stuff=2626
  ```
  11,683 eligible, 0 scored.

  And the recurring mechanism, from `cron_runs`:
  ```
  2026-08-15 error … R: 1/2 day(s) failed — 2026-08-12: run_mutation failed: canceling statement due to statement timeout
  2026-08-18 error … R: 1/3 day(s) failed — 2026-08-15: … statement timeout
  2026-08-19 error … R: 2/2 day(s) failed — 2026-08-16: … ; 2026-08-17: … statement timeout
  2026-08-22 error … R: 1/3 day(s) failed — 2026-08-19: … statement timeout
  ```
- **Expected vs actual:** expected 11,683 of 11,683 eligible pitches scored on 08-10/11/12; actual 0.
  Expected 0 nightly scoring timeouts; actual 4 in 8 nights (50%).
- **Fix:** migration-sized but small. Two parts. (a) Make scoring self-healing: replace the
  window-derived day list with a query for unscored days — `SELECT DISTINCT game_date FROM pitches
  WHERE game_date >= current_date - 30 AND stuff_plus IS NULL AND release_speed IS NOT NULL AND
  pitch_name IS NOT NULL` — and drive the per-day `UPDATE` off that. It is idempotent, self-limiting,
  and repairs 08-10/11/12 on the next run. (b) Get the per-day `UPDATE` under 8s reliably by adding
  `AND p.stuff_plus IS NULL` to its `WHERE`, so a re-scored day touches ~0 rows instead of ~4,300 (the
  current statement rewrites every row every night against 6+ indexes, which is why it sits at the
  timeout boundary). Detector: an `integrity_checks` entry asserting
  `count(*) FILTER (stuff_plus IS NULL AND eligible) = 0` for `game_date >= current_date - 14`.
- **Confidence:** verified for the observation and the timeout mechanism (I read the code and queried
  `cron_runs` and `pitches`); **probable** for the specific claim that 08-10 and 08-11 fell out of the
  window rather than failing some other way — `pitches` has no `created_at`, so I cannot prove when
  those rows landed (see *What I could not determine*).

---

## F3. `pfx_x`/`pfx_z` and `api_break_*` are declared in inches to the SQL-writing LLMs; they are stored in feet

- **Impact:** high — every SQL statement an LLM generates from these prompts that reads `pfx_x`,
  `pfx_z`, `api_break_x_arm`, `api_break_x_batter_in` or `api_break_z_with_gravity` and labels the
  result "inches" is **wrong by a factor of 12**. A slider shown as "−1.4 in of horizontal break" is
  really −16.8 in. This affects `/api/chat` (model builder + analyst) and `/api/data-export`.
- **Location:** `app/api/chat/route.ts:109-110` and `:112-113`;
  `app/api/data-export/route.ts:21-22` and `:28-29`. The *correct* declaration exists 50 lines
  earlier in the same file — `app/api/chat/route.ts:59-60` says
  `pfx_x (REAL) - horizontal break feet (multiply by 12 for inches)`. The file contradicts itself.
- **What's wrong:** the ingest performs **no** unit transformation — it stores Savant's values
  verbatim, which is correct. Savant supplies `pfx_x`/`pfx_z`/`plate_x`/`plate_z`/`release_extension`/
  `release_pos_*`/`api_break_*` in feet. Every SQL site in the repo that consumes them for display
  multiplies by 12 (`app/api/update/route.ts:257`, `app/api/movement-percentiles/route.ts:60`,
  `app/api/compute-deception/route.ts:34`, `app/api/starter-card/route.ts:110`,
  `lib/pitcherStats.ts:281`, and ~20 more). The two prompt blocks above are the only places in the
  repo that assert otherwise, and they are the ones handed to a model that writes free-form SQL.
- **Evidence:** measured directly from the source CSV (16,033 rows, 2026-08-18…21):

  ```
  pfx_x                     n=15958  min=  -2.02  max=   2.05   (feet; ±24.6 in)
  pfx_z                     n=15958  min=  -1.63  max=   1.89
  release_extension         n=15958  min=   5.50  max=   7.80   (feet)
  api_break_x_arm           n=15958  min=  -2.20  max=   1.83   (feet)
  api_break_z_with_gravity  n=15958  min=   0.53  max=  20.88   (feet)
  ```
  and confirmed byte-identical in the database for 2026-08-10:
  ```sql
  SELECT min(pfx_x), max(pfx_x), min(release_extension), max(release_extension)
  FROM pitches WHERE game_date='2026-08-10';
  -- -2.020 / 2.050 / 5.50 / 7.80  — identical to the CSV
  ```
  If `pfx_x` were inches, a max of 2.05 would mean the largest horizontal break in four days of MLB
  was two inches.
- **Expected vs actual:** prompt says inches; stored value is feet. 12× understatement.
- **Fix:** one-liner — change four comment lines to `feet (multiply by 12 for inches)`, matching
  `chat/route.ts:59`. Detector: add the unit to `docs/VARIABLES.md` as the single source and have
  `check-doc.sh`-style CI grep for `pfx_x (REAL) - horizontal break inches`.
- **Confidence:** verified.

---

## F4. `inserted` counts rows in the payload, not rows that changed — and the whole downstream gate hangs off it

- **Impact:** medium-high — the number reported to the operator, written to `system_metadata`, and used
  by `/api/cron/refresh` to decide whether to run *anything* is not a measure of work done. It cannot
  distinguish "8,000 new pitches" from "8,000 unchanged rows rewritten". `10,965` was reported for the
  night of 2026-08-16; only **4,443** rows exist for that date. As a side effect, every nightly run
  rewrites ~8,000 already-correct rows through 6+ indexes, which is dead write amplification and bloat.
- **Location:** `app/api/update/route.ts:148` (`ignoreDuplicates: false`), `:154` (`inserted +=
  batch.length`), `:167`; consumed at `app/api/cron/pitches/route.ts:47-50, 59, 68` and
  `app/api/cron/refresh/route.ts:45-47`.
- **What's wrong:** `upsert(..., { ignoreDuplicates: false })` sends
  `Prefer: resolution=merge-duplicates`, i.e. `ON CONFLICT (game_pk, at_bat_number, pitch_number) DO
  UPDATE SET <every payload column> = excluded.<col>` unconditionally. Because the window is 4 days
  wide and re-fetched nightly, ~75% of every payload is rows that already exist and are byte-identical.
  `inserted += batch.length` counts them all. There is no `WHERE ... IS DISTINCT FROM` guard and
  PostgREST does not return an affected-row count that separates insert from update.
- **Evidence:** code read as above, plus `cron_runs.counts` vs actual row counts:
  ```
  cron_runs 2026-08-16 09:01  success  totalInserted = 10965
  SELECT count(*) FROM pitches WHERE game_date='2026-08-16';  -- 4443
  ```
  and the 4-day source window measured at 16,033 rows total, of which at most ~4,400 could be new.
- **Expected vs actual:** expected `inserted` ≈ new rows (~4,400/night); actual 7,237–10,965/night.
- **Fix:** migration. Move the upsert to `run_mutation` with an explicit
  `ON CONFLICT (...) DO UPDATE SET ... WHERE pitches.* IS DISTINCT FROM excluded.*` and use
  `RETURNING (xmax = 0) AS was_insert` to report real insert/update counts. That both fixes the number
  and removes ~8k pointless row versions a night. Cheaper interim: report
  `distinctDates` and `distinctGamePks` alongside `inserted`, which at least makes the shape of the
  night's work legible.
- **Confidence:** verified.

---

## F5. An empty or wrong-filter Savant response looks exactly like a quiet day

- **Impact:** medium — the guard that is supposed to catch "Savant gave us nothing" does not fire on
  the response Savant actually returns for an empty result. The route returns
  `{ fetched: 0, inserted: 0, errors: 0, message: 'No valid rows parsed' }`, the cron computes
  `totalInserted = 0`, records **`success`**, and `/api/cron/refresh` skips the entire downstream
  chain. This is the delivery mechanism for F1: three months a year of "green" that means nothing ran.
- **Location:** `app/api/update/route.ts:84` (`if (!resp.ok) throw`), `:87`
  (`if (csv.length < 100) return …`), `:136` (`if (rows.length === 0) return …`);
  `app/api/cron/pitches/route.ts:41-86`.
- **What's wrong:** Savant answers an empty query with **HTTP 200 and a header-only CSV**. The header
  line alone is 1,825 bytes, so `csv.length < 100` never triggers. Parsing then yields zero data rows
  and the function returns a success-shaped object. `resp.ok` is likewise useless for the failure modes
  that matter (Savant serves 200 for empty results and for its HTML error interstitials). Nothing in
  the path asserts a *floor* on rows.
- **Evidence:**
  ```
  curl … hfGT=P| game_date_gt=2025-10-15 game_date_lt=2025-10-15
  → http=200 bytes=1825
  $ head -c 200 out.csv
  ﻿"pitch_type","game_date","release_speed","release_pos_x",…      ← header only
  ```
  1,825 > 100, so line 87's guard is inert for the real empty response.
- **Expected vs actual:** expected the ingest to distinguish "no games scheduled" from "our filter
  matched nothing"; actual both return `success` with identical payloads.
- **Fix:** one-liner plus a small assertion. Replace `csv.length < 100` with a header contract test
  (`headers.includes('game_pk') && headers.length >= 100`) and add a volume floor: if the request
  window contains ≥1 date on which MLB played games (the MLB Stats API schedule endpoint is already
  used elsewhere in this repo) and `rows.length === 0`, `throw` so the cron records `error`.
  Detector: that throw *is* the detector.
- **Confidence:** verified.

---

## F6. The 2026-08-14 ingest never ran, and nothing anywhere noticed

- **Impact:** medium — a full night of ingest is missing from `cron_runs` with no row of any status.
  The gap is invisible: there is no heartbeat, no dead-man switch, and `reportError` writes to stdout
  only. This is also the proximate reason 2026-08-11 never got a second scoring attempt (F2).
- **Location:** `lib/cronTracker.ts:44-64` (the `running` row is inserted *inside* the invocation);
  `lib/observability.ts:29-35` (`reportError` is `console.error` — the Sentry call is a `TODO`).
- **What's wrong:** `trackCronRun` can only record a run that started. If Vercel does not fire the
  cron, or the function dies before the first `INSERT` completes, there is no artifact at all. The
  orphan-reconciler at `cronTracker.ts:27-41` only rescues rows that reached `status='running'`, so it
  cannot see this case. Absence of evidence is not recorded as evidence of absence.
- **Evidence:**
  ```sql
  SELECT started_at, status, duration_ms, counts FROM cron_runs
  WHERE job='pitches' AND started_at >= '2026-08-08' ORDER BY started_at;
  ```
  ```
  2026-08-13 09:01:11  success  234696  {"totalInserted":7237}
  2026-08-15 09:00:17  error    239892  Stuff+ scoring failed …
  ```
  No row for 2026-08-14, and no `timeout` row either.
- **Expected vs actual:** expected 15 runs 2026-08-08 → 2026-08-22 inclusive; actual 14.
- **Fix:** small migration. A `cron_expectations` table (`job`, `cron_expr`, `max_gap_minutes`) plus a
  check in the already-scheduled `/api/cron/integrity` at 10:00 UTC asserting
  `max(started_at) > now() - interval '25 hours'` per job. That is the dead-man switch; without it
  every finding in this document is only discoverable by someone going looking.
- **Confidence:** verified.

---

## F7. The ingest runs at 78–88% of the Vercel 300s ceiling every night

- **Impact:** medium — the margin before this job starts being killed mid-flight is 36–65 seconds, and
  a kill lands *after* the upsert commits and *during* Stuff+ scoring, producing exactly the unscored
  hole in F2. The season is still growing.
- **Location:** `app/api/cron/pitches/route.ts:9` (`export const maxDuration = 300`).
- **What's wrong:** the duration is dominated by the per-row upsert retry path and the per-day
  `UPDATE` chain, both of which scale with the season. Nothing in the route budgets wall-clock or
  checkpoints partial progress, so a kill is unrecoverable rather than resumable.
- **Evidence:** `cron_runs.duration_ms`, last 14 runs of `job='pitches'`:
  ```
  234696, 237136, 239892, 245370, 247165, 247754, 248332, 249080, 249501, 252522, 255229, 256676, 257337, 263860
  ```
  Max 263,860 ms = **88.0%** of 300,000 ms. Median ≈ 248,700 ms = 82.9%.
- **Expected vs actual:** a job with no resumability wants ≤50% of its ceiling; actual 83% median.
- **Fix:** the `IS DISTINCT FROM` change in F4 removes most of the upsert work and the
  `stuff_plus IS NULL` guard in F2 removes most of the scoring work; together they should cut this
  materially. Re-measure `duration_ms` afterwards — do not assume. Detector: alert when
  `duration_ms > 240000`.
- **Confidence:** verified (measured from `cron_runs`).

---

## F8. `stuff_plus` is quantised to whole numbers on write

- **Impact:** medium — `pitches.stuff_plus` is `numeric`, but the ingest rounds to zero decimal places
  before storing. On 2026-08-14, 4,059 scored pitches carry only **48 distinct values** spanning 67–118.
  Per-pitch Stuff+ therefore has ~1-unit granularity, and any per-pitch distribution, histogram, or
  small-sample average inherits a visible comb. A pitcher with 15 pitches in a sample has his Stuff+
  determined to ±0.5 by rounding alone.
- **Location:** `app/api/update/route.ts:322-327`.
- **What's wrong:**
  ```sql
  SET stuff_plus = GREATEST(0, LEAST(200, ROUND( 100 + … )::numeric))
  ```
  `ROUND()` is applied to a `double precision` argument, which rounds to an integer; the `::numeric`
  cast happens afterwards and preserves nothing. Two separate transformations the schema does not
  advertise: this rounding, and the `GREATEST(0, LEAST(200, …))` clamp, which silently compresses the
  tails rather than flagging them.
- **Evidence:**
  ```sql
  SELECT count(*) FILTER (WHERE stuff_plus <> round(stuff_plus)) AS frac,
         count(DISTINCT stuff_plus) AS distinct_vals,
         min(stuff_plus), max(stuff_plus)
  FROM pitches WHERE game_date='2026-08-14';
  -- frac=0  distinct_vals=48  min=67  max=118   (over 4,059 scored pitches)
  ```
- **Expected vs actual:** expected `numeric` precision commensurate with the column type; actual 48
  distinct integer values.
- **Fix:** one-liner — `ROUND((…)::numeric, 1)`. **Do not** backfill historic rows to match; that
  would be a full-table rewrite of an 8.9M-row table for cosmetic gain. Note the mixed precision in
  `docs/VARIABLES.md` instead.
- **Confidence:** verified.

---

## F9. Rows the parser drops are counted nowhere

- **Impact:** medium — two `continue` statements discard CSV records without incrementing `errors`,
  without logging, and without affecting `fetched` (which is `rows.length`, i.e. rows that *survived*).
  A partial upstream truncation would be indistinguishable from a quiet day. Not currently firing —
  I measured 0 drops on 16,033 real rows — but it is unobservable by construction.
- **Location:** `app/api/update/route.ts:125` (`if (vals.length < numHeaders) continue`), `:133`
  (`if (row.game_pk) rows.push(row)`), `:208` (`fetched: rows.length`).
- **What's wrong:** the two filters are correct as filters; the defect is that the counts reported to
  the caller are taken *after* filtering, so the filter is invisible. `errors` covers only rows the
  database rejected, never rows the parser rejected.
- **Evidence:** I transliterated `parseCSVLine` and the row-building loop from
  `app/api/update/route.ts:90-134` verbatim into Node and ran it over the live 4-day CSV:
  ```
  physical lines: 16034  headers: 119  parsed rows: 16033
  skipped<hdr: 0  skipped no game_pk: 0  blank: 0
  ```
  So it is clean today — but `skipped<hdr` and `skipped no game_pk` exist only in my instrumentation,
  not in the route.
- **Expected vs actual:** expected `fetched` to equal CSV records so drops are visible; actual
  `fetched` equals survivors.
- **Fix:** one-liner — count `skippedShort` and `skippedNoPk`, return them in the result object, and
  have the cron `throw` if `skippedShort > 0`. That converts a silent drop into a paged failure.
- **Confidence:** verified.

---

## F10. Two latent parser hazards: header compaction and newline-before-quote splitting

- **Impact:** medium if triggered, not triggered today. Either one corrupts data rather than losing it,
  which makes them worse than a crash. I found zero instances in 19,034 live rows across two fetches.
- **Location:** `app/api/update/route.ts:117` (`.filter(h => h !== '')`) and `:116`
  (`const lines = csv.split('\n')`, executed *before* quote-aware parsing).
- **What's wrong:**
  1. **Header compaction.** `headers` drops empty header names but `vals` keeps every positional field.
     The mapping at `:127` is `headers.forEach((h, j) => … vals[j])`. If Savant ever emits an empty
     header anywhere other than the very end, every column after it is read from the wrong position —
     `release_speed` would receive `release_pos_x`'s value, and the upsert would succeed. Silent,
     total, and type-compatible because almost every column is `real`.
  2. **Line splitting before quote parsing.** `csv.split('\n')` is applied to the raw text, so a
     newline inside a quoted field (`des` is free text up to 329 chars) splits one record into two
     fragments. Both fragments have fewer than 119 fields, so both hit the `:125` `continue` and the
     record vanishes — with no counter (F9).
- **Evidence:** the live header has 119 fields and no empty entries; the file uses LF line endings and
  a UTF-8 BOM (`efbb bf`, correctly stripped at `:86`); and across 16,033 records I measured
  `fields containing CR/LF: 0` and `physical lines == records + 1`. So both hazards are latent, not
  active. The mis-mapping mechanism is a direct read of `:117` against `:127`.
- **Expected vs actual:** n/a — not currently firing.
- **Fix:** one-liner each. (1) Do not filter headers; keep positional identity and skip empty names
  inside the `forEach` instead. (2) Feed the whole CSV to a quote-aware record splitter rather than
  splitting on `\n` first — or, cheaper, refuse the batch if `lines.length - 1 !== rows.length +
  skippedShort + skippedNoPk + blank`.
- **Confidence:** verified as code behaviour; **suspected** as to whether Savant will ever emit either.

---

## F11. `errors` is returned but never acted on — a 100%-rejection night records `success`

- **Impact:** medium — the only condition that makes the ingest cron fail is a Stuff+ scoring error.
  If schema drift adds a column Savant supplies and `pitches` lacks, PostgREST rejects the batch
  (`PGRST204`), the per-row retry rejects all 500 rows individually, `errors` climbs to `rows.length`,
  `inserted` stays 0 — and the cron reports `success` with `totalInserted: 0` while `/api/cron/refresh`
  quietly skips everything. The per-row retry also turns one bad batch into 500 sequential round-trips,
  which is where the 300s ceiling (F7) gets eaten.
- **Location:** `app/api/update/route.ts:157-168` (retry loop), `:204-210` (result), and
  `app/api/cron/pitches/route.ts:47-86` — which reads `r.inserted` and `r.stuff_plus` and **never reads
  `r.errors`**.
- **What's wrong:** the retry-and-isolate design is right; the reporting is not wired. `errors` has no
  consumer.
- **Evidence:** code read. Contract state today is clean — the CSV has 119 columns and `pitches` has
  121 (`= 119 + id + stuff_plus`), every CSV name present:
  ```sql
  SELECT count(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pitches';  -- 121
  ```
  Set-differenced against the 119 live CSV headers: zero columns in the CSV missing from the table,
  and the only table columns absent from the CSV are `id` and `stuff_plus`. So drift has not bitten
  yet — but nothing would tell you when it does.
- **Expected vs actual:** expected a nonzero `errors` to fail the run; actual it is discarded.
- **Fix:** one-liner — in `cron/pitches/route.ts`, sum `r.errors` across game types and `throw` if
  `errors > 0` (or `> 0.1% of fetched`, if a tolerance is wanted). Detector: same throw.
- **Confidence:** verified.

---

## F12. `players` carries two mutually incompatible name formats, both written by this ingest

- **Impact:** low-medium — 16,480 of 16,937 rows are `"Last, First"` and 457 are `"First Last"`, and
  the split is not random: it is exactly the two code paths in `syncNewPlayers`. Any name-based
  display, search, or sort is inconsistent; 459 names are shared by 2+ players, so `name` is unusable
  as a join key regardless.
- **Location:** `app/api/update/route.ts:38-40` (pitchers, from the CSV's `player_name`) vs `:52-53`
  (batters, from `statsapi.mlb.com/api/v1/people` → `p.fullName`).
- **What's wrong:** Savant's `player_name` column is `"Last, First"` when `player_type=pitcher`; the
  MLB People API returns `fullName` as `"First Last"`. Both are written to `players.name` with no
  normalisation. A player who first appears as a batter is stored one way; as a pitcher, the other.
- **Evidence:**
  ```sql
  SELECT count(*) FROM players;                                    -- 16937
  SELECT count(*) FROM players WHERE name LIKE '%, %';             -- 16480
  SELECT count(*) FROM players WHERE name NOT LIKE '%, %';         --   457
  SELECT count(*) FROM (SELECT name FROM players GROUP BY name HAVING count(*)>1) t;  -- 459
  ```
  and the source format, from the live CSV: `sample player_name: ['Luzardo, Jesús', …]`.
- **Expected vs actual:** expected one canonical format; actual 97.3% / 2.7% split by ingest path.
- **Fix:** one-liner in code (normalise `fullName` to `"Last, First"` at `:53` before insert) plus a
  small one-off `UPDATE` over 457 rows to repair the existing ones — trivial blast radius. Note that
  `syncNewPlayers` itself works: I found **0 orphan pitchers and 0 orphan batters** among 4,069 pitches
  on 2026-08-14.
- **Confidence:** verified.

---

## F13. `syncNewPlayers` ignores the error from its own existence check

- **Impact:** low — if the lookup fails, `existing` is `undefined`, `existingSet` is empty, and every
  player in the window is treated as new. The batter branch then issues ~8 unnecessary MLB API calls,
  and the final `upsert` uses `ignoreDuplicates: true` so nothing is corrupted. Degraded, not wrong.
- **Location:** `app/api/update/route.ts:31-35` — `const { data: existing } = await …` discards
  `error`.
- **What's wrong:** unchecked destructure. Contributing risk: the query is
  `.in('id', allIds)` over the union of pitchers and batters in the window, which PostgREST renders as
  a GET query string. I measured the filter at **5,033 characters** for 718 distinct ids over 4 days —
  under the usual 8 KB request-line limit, but not by a comfortable margin as windows or rosters grow,
  and the failure mode when it does exceed is exactly the swallowed error above.
- **Evidence:** code read; filter length measured from the live 4-day CSV
  (`distinct pitchers 344, batters 378, union 718; in() filter length 5033 chars`).
- **Expected vs allowed:** expected a checked error; actual silently discarded.
- **Fix:** one-liner — check `error`, `reportError`, and chunk `allIds` into batches of 200.
- **Confidence:** verified.

---

## F14. The window is 4 days, not 3, and its effective new-data span is ~2

- **Impact:** low — no data is lost; this is a naming/expectations defect that matters because it sets
  how many chances a failed Stuff+ day gets (F2).
- **Location:** `app/api/cron/pitches/route.ts:36-38` — comment says "Sync last 3 days",
  code is `start = addDaysToYmd(today, -3); end = today`.
- **What's wrong:** Savant's `game_date_gt` / `game_date_lt` are **inclusive** on both ends, so
  `[today-3, today]` is a 4-calendar-day request. Separately, the cron fires at 09:00 UTC = 05:00 ET,
  before Savant has published the previous night's games, so the *newest* one or two dates in the
  window come back empty. The error strings in `cron_runs` confirm the scoring day-list is derived
  from what actually arrived and is consistently 2–3 days, never 4 (`1/2 day(s) failed`,
  `2/2 day(s) failed`, `1/3 day(s) failed`).
- **Evidence:** single-date request with `gt == lt` returns that date's full slate:
  ```
  game_date_gt=2026-08-10 & game_date_lt=2026-08-10 → 3,001 rows, all game_date='2026-08-10'
  ```
  4-day request returns all four dates complete, with no truncation:
  ```
  game_date_gt=2026-08-18 & game_date_lt=2026-08-21 → 16,033 rows
    2026-08-18 4289 | 2026-08-19 4568 | 2026-08-20 2735 | 2026-08-21 4441
  ```
  which matches the database exactly.
- **Expected vs actual:** comment says 3 days; behaviour is 4 requested, ~2 productive.
- **Fix:** one-liner — fix the comment, and once F2's self-healing scoring lands, the window width
  stops being load-bearing.
- **Confidence:** verified.

---

## What is working — and I want this on the record

These are the things I tried to break and could not:

- **Value fidelity is exact.** For 2026-08-10, the source CSV and the database agree on every
  aggregate I checked: 3,001 rows / 3,001; `release_speed` non-null 2,993 / 2,993, mean 88.944 /
  88.944; `pfx_x` range [−2.020, 2.050] identical; `release_extension` [5.50, 7.80] identical;
  `launch_speed` non-null 982 / 982, max 118.50 identical; `release_spin_rate` non-null 2,992 / 2,992,
  max 3,066 identical; 10 distinct `game_pk` / 10.
- **No unit transformation is applied at ingest, and that is correct.** mph stays mph, feet stay feet,
  rpm stays rpm, degrees stay degrees. Every legitimate consumer multiplies `pfx_*` by 12 at the point
  of display. The defect in F3 is documentation, not data.
- **Type coercion is safe on real data.** Running the route's own coercion loop over 16,033 live rows:
  zero text-typed columns received a JS number, zero non-finite values were produced, and the only
  string→number differences were cosmetic (`"88.0"` → `88`). A failed parse cannot corrupt a row —
  a non-numeric value simply stays a string, and an empty or `"null"` value becomes SQL `NULL`, never
  `0`. There is no zero-defaulting anywhere in the parse path.
- **The upsert key is real and idempotent.** `pitches_game_pk_at_bat_number_pitch_number_key UNIQUE
  (game_pk, at_bat_number, pitch_number)` exists and is backed by a unique btree; all three columns
  were non-null on every row I checked (0 null-key rows on 2026-08-10). Re-ingesting a scored date does
  **not** reset `stuff_plus`, because `stuff_plus` is not in the CSV and therefore not in the upsert
  payload — `merge-duplicates` only overwrites payload columns. I found **0 in-file duplicate keys**
  across both fetches, so the `21000 cardinality_violation` path is not being exercised.
- **The batch-failure isolation is well designed.** One poison row costs 500 sequential retries but
  the other 499 land. That is the right trade; it just needs the `errors` count wired to a failure
  (F11).
- **The schema contract currently holds.** 119 CSV columns, 121 table columns, exact set match plus
  `id` and `stuff_plus`.
- **`syncNewPlayers` is ordered correctly** (after the pitch upsert, so no FK could drop a debut
  player's pitches) and is working: 0 orphan pitchers and 0 orphan batters on 2026-08-14.
- **The BOM is stripped**, `game_date` and `sv_id` are correctly exempted from numeric coercion, and
  `addDaysUtc` / `ymdInTimeZone` do calendar arithmetic in a way DST cannot shift.
- **The ingest is current.** Data runs through 2026-08-21 with normal daily volumes (2,631–4,568),
  which is exactly right for a 05:00 ET run on 2026-08-22.

---

## What I could not determine

1. **When the 2026-08-10/11/12 rows actually landed.** `pitches` has no `created_at` or `updated_at`
   column (confirmed: 121 columns, none temporal beyond `game_date`/`game_year`), so I cannot prove
   whether those rows were ingested on the nights their dates were inside the window — which would mean
   the scoring `UPDATE` ran and failed while the run reported `success` — or arrived late from Savant
   and were never in a scoring window at all. Both are consistent with the evidence. *What would settle
   it:* the Vercel function logs for the 2026-08-11 → 2026-08-13 `/api/cron/pitches` invocations, which
   contain the `applyStuffPlusForDateRange failures:` console line and the computed day list. Failing
   that, adding `ingested_at timestamptz DEFAULT now()` to `pitches` makes every future occurrence
   answerable (blast radius: adding a nullable column with a non-volatile default is metadata-only on
   PG 11+, so it does not rewrite the table).
2. **Whether Savant has ever emitted a mid-file empty header or an embedded newline in `des`.** I
   verified 19,034 live rows across two fetches and found none. Only a long historical sample would
   settle it; the cheap alternative is the assertion in F10, which makes the question moot.
3. **The exact historical provenance of the 2015-10-04 and 2016-10-02 regular-season rows**, which post-
   date the month-based `'R'` cutoff in the current cron. They were presumably loaded by an earlier
   code path or a bulk import. It does not change F1 — no postseason `game_type` has ever existed in
   the table — but it means I cannot date when the `P|` defect was introduced. *What would settle it:*
   `git log -S "GAME_TYPE_MAP" -- app/api/update/route.ts`.
4. **Whether the 4 nightly Stuff+ timeouts in the last 8 days are a step change or a slow ramp.**
   `cron_runs` retains the errors but `integrity_checks`-style coverage history for `stuff_plus` would
   be needed to date the onset. *What would settle it:* a daily coverage snapshot, which is the
   detector F2 asks for anyway.
5. **Repo convention not followed, deliberately.** The 12 ad-hoc queries in this session were not
   appended to `docs/Queries.md`, because the clean-room brief forbids opening that file and appending
   a date header blind risks duplicating one. The queries are all reproduced verbatim above; they
   should be logged by whoever consolidates this audit.

---

### Single highest-leverage next action

Change `GAME_TYPE_MAP.P` from `'P|'` to `'PO|'` in `app/api/update/route.ts:14` and add `'R'` to
October's game types in `app/api/cron/pitches/route.ts:32`. It is a two-character and a one-line edit,
it is the difference between having and not having every postseason pitch since 2015, and — because the
empty October fetch is what sets `skipDownstream = true` — it is also what stops the entire downstream
compute chain from idling through every October and November while reporting success.
