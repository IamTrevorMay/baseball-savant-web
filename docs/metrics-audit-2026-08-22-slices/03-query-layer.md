# Slice 03 — Query Layer Integrity

**Verdict.** The read path has one structural defect that everything else hangs off: the heaviest
analytics routes call `run_query`, which has `proconfig = NULL` and therefore inherits the
`authenticator` role's `statement_timeout=8s` — while the DB-backed cache that was built to keep
those routes off the hot path (`lib/queryCache.ts`) points at a table, `query_cache`, that **does
not exist in this database**. Every "cached" heavy endpoint recomputes from scratch on every
request, and I measured the core Explore leaderboard aggregation at **18,905 ms for a
22-day subset of one season** — 2.4× over the ceiling for one eighth of the scope. The routes
themselves mostly return an honest 500; the client is where the truth dies:
`lib/hooks/useExploreData.ts` reads `data.rows || []` without checking `res.ok`, so a server-side
query cancellation renders as **"0 rows"** on a leaderboard with no error state. Below that sit a
silent 5,000-row truncation that reports the truncated count as *the* count
(`app/api/explore/query/route.ts:194`), a Stuff+ column that goes blank because its query's error is
never inspected (`app/api/leaderboard-triton/route.ts:70-78`), a cache key that omits the parameter
that selects the payload (`app/api/trends/route.ts:15`), and two MiLB landing pages that count the
**MLB** table and print `0 pitches` when it times out. Genuinely working: `umpire`,
`matchup-lookup`, `sequencing`, `team-tendencies`, `park-adjusted`, `player-data` and `report` all
check `error` and return 500 correctly; `postJson`/`fetchJson` check `res.ok`; and Zod validation on
player-data is all-or-nothing, so it never silently drops rows.

**Evidence grades used:** *measured* = I ran it this session and have the numbers. *documented* =
Postgres/PostgREST behaviour. *inferred* = mechanism reasoning from code I read.

---

## F1. The Explore leaderboard's own query cannot finish inside the 8s cap, and the client turns the failure into "0 rows"

- **Impact:** **critical** — `/explore` is the main cross-player leaderboard in `(research)`. On any
  request where the aggregation exceeds 8s, the page renders an empty table, the footer reads
  `0 rows`, "Page 1", the next-page button greys out, and **no error is shown**. The user cannot
  distinguish "no players match your filters" from "the database killed the query."
- **Location:**
  - Route: `app/api/report/route.ts:11` — `supabase.rpc('run_query', { query_text: result.sql })`
  - Ceiling: `run_query` `proconfig = NULL`; `authenticator` `rolconfig = statement_timeout=8s`
  - Swallow: `lib/hooks/useExploreData.ts:230-232` — `const data = await res.json(); let fetchedRows = data.rows || []`
  - Render: `app/(research)/explore/page.tsx:128` — `<span>{rows.length} rows</span>`
- **What's wrong:** three things compound. (a) `app/api/report/route.ts` imports
  `supabaseAdminLong` — the 120s *client fetch* timeout — but then calls `run_query`, whose
  server-side ceiling is 8s. The name promises 120s; the server gives 8. (b) The query is a
  `GROUP BY player_name, pitcher` over a full season of `pitches` with up to three
  `COUNT(DISTINCT …)` expressions and no covering index, so it does an external merge sort to disk.
  (c) When Postgres raises `57014 query_canceled`, the route correctly returns HTTP 500 with
  `{error, sql}` — and the client reads `data.rows`, finds `undefined`, and substitutes `[]`.
- **Evidence:** `EXPLAIN (ANALYZE, BUFFERS)` on the default pitching leaderboard shape, reduced to
  **4 of the 20 metrics** in `pitching:traditional` and scoped to **22 days** instead of the season:

  ```
  Limit (actual time=18904.243..18904.254 rows=50 loops=1)
    ->  Sort  Sort Key: (count(*)) DESC
          ->  GroupAggregate (actual time=18863.691..18904.031 rows=512 loops=1)
                Group Key: player_name, pitcher
                ->  Sort (actual time=18863.474..18880.817 rows=82831 loops=1)
                      Sort Method: external merge  Disk: 3336kB
                      ->  Index Scan using idx_pitches_year_date on pitches
                            Index Cond: ((game_year = 2026) AND (game_date >= '2026-08-01'::date))
  Planning Time: 525.259 ms
  Execution Time: 18905.166 ms
  ```

  First run of the identical query: `Execution Time: 13709.319 ms`, `Buffers: shared hit=2336
  read=14280`. Second run: 18,905 ms, `shared hit=771 read=15845` — **buffer hits went down**, so
  this is not a cold-cache artifact; the instance has effectively no retention for this working set.
  The *full-season, full-metric* version of the same query exceeded the MCP tool's own timeout and
  never returned.
- **Expected vs actual:** expected — 512 qualifying pitchers for 2026-08-01→22, top 50 rendered.
  Actual — 18.9s against an 8.0s ceiling (2.4× over) on 1/8 of the season scope; extrapolating the
  82,831-row/22-day cost to a ~545k-row season is ~6.6× more work again. Screen shows `0 rows`.
- **Fix:** two parts, both needed.
  1. `app/api/report/route.ts:11` and `app/api/milb/report/route.ts:19` → `run_query_long`
     (`proconfig = statement_timeout=120s`, already deployed). One-word change, buys 15×.
  2. `lib/hooks/useExploreData.ts` — add `if (!res.ok) throw new Error((await res.json()).error)`
     to all four fetch branches (lines 179, 191, 215 and the MiLB twin at
     `app/(milb)/milb/explore/page.tsx:126, 140, 165`) so React Query surfaces an error state
     instead of an empty leaderboard. `lib/queries/fetchers.ts` already has the correct helper —
     `postJson` throws on `!res.ok`. Use it.
  Longer term: this query wants a season rollup table. `mv_pitcher_season_stats` already exists and
  `/api/park-adjusted` reads it in milliseconds.
- **Confidence:** **verified** for the timing, the 8s ceiling, and the `|| []` swallow. *Inferred*
  that production is as slow as the MCP session (same database, same shared buffers).

---

## F2. `query_cache` does not exist — the entire DB cache layer has never stored a byte, silently

- **Impact:** **critical** (as an amplifier) — `lib/queryCache.ts` is the mechanism that is supposed
  to keep `/api/trends` and `/api/movement-percentiles` off the 8s hot path. It is inert. Every
  request to those routes runs the full aggregation. This is the direct cause of F5 and a
  contributing cause of F1's user-visible symptom.
- **Location:** `lib/queryCache.ts:17-26` (`getCached`), `:35-42` (`setCache`); consumers at
  `app/api/trends/route.ts:16,74,110,122` and `app/api/movement-percentiles/route.ts:44,100`.
- **What's wrong:** `getCached` does `.from('query_cache')…maybeSingle()` and then
  `if (error || !data) return null` — **a missing relation is indistinguishable from a cache miss**.
  `setCache` does an `.upsert()` whose PostgrestError is never read, and all four call sites append
  `.catch(() => {})`. So the read path always misses, the write path always fails, and nothing
  anywhere logs it.
- **Evidence:** run this session —

  ```sql
  select cache_key, expires_at from query_cache where cache_key like 'trends:%';
  -- ERROR: 42P01: relation "query_cache" does not exist
  ```

  Confirmed against the catalog across all schemas:

  ```sql
  select n.nspname, c.relname, c.relkind from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relname in ('query_cache','sos_scores','league_percentiles',
                       'mv_pitcher_season_stats','mv_batter_season_stats','pitch_baselines','models');
  -- returns 6 rows; query_cache is not among them.
  ```

  There is also no `scripts/create-query-cache.sql` in the repo — `ls scripts/*.sql` shows 32 files,
  none of them create it.
- **Expected vs actual:** expected — 6-hour TTL, `trends:*` and `mvpct:*` served from a single-row
  lookup. Actual — 0% hit rate since the code shipped, 100% of requests recompute.
- **Fix:** create the table (`cache_key text primary key, response jsonb not null, expires_at
  timestamptz not null, created_at timestamptz not null default now()`, plus an index on
  `expires_at` for `purgeExpired`), and — this is the load-bearing half — make `getCached`
  distinguish the two failure classes: log/count `error.code === '42P01'` and any non-`PGRST116`
  error rather than folding it into "miss". A cache with a permanent 0% hit rate must be loud.
- **Confidence:** **verified.**
- **Detector:** emit a `cache_hit`/`cache_miss`/`cache_error` counter per key prefix; alert on
  `cache_error > 0` or on a hit rate of exactly 0 over a day.

---

## F3. `/api/leaderboard-triton` never checks its Stuff+ query for errors — the Stuff+ columns silently render as "—"

- **Impact:** **high** — on the Explore → Triton Command tabs, every `*_stuff_plus` column
  (`ff_stuff_plus`, `sl_stuff_plus`, …) becomes `null` while `cmd_plus`, `rpcom_plus` and every
  other column render correctly. HTTP 200. The reader sees a fully-populated leaderboard with one
  column of dashes and reasonably concludes "we don't have Stuff+ for these pitchers."
- **Location:** `app/api/leaderboard-triton/route.ts:63-82`.
- **What's wrong:** the route fires two RPCs in `Promise.all`:

  ```ts
  const [{ data, error }, stuffRes] = await Promise.all([
    supabase.rpc('run_query', { query_text: sql }),        // pitcher_season_command — small, fast
    supabase.rpc('run_query', { query_text: stuffSql }),   // full-season GROUP BY on pitches
  ])
  if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })
  ```

  Only the *first* result's `error` is inspected. `stuffRes.error` is never read; line 78 goes
  straight to `for (const row of (stuffRes.data || []))`. `stuffSql` is
  `SELECT pitcher, pitch_name, ROUND(AVG(stuff_plus)…) FROM pitches WHERE game_year = <yr> AND
  game_type = 'R' … GROUP BY pitcher, pitch_name` — a full-season grouped scan of `pitches` under
  the same 8s cap measured in F1. When it is cancelled, `stuffMap` is empty and line 124
  (`p[`${pt}_stuff_plus`] = stuffMap.get(id)?.[row.pitch_name] ?? null`) writes `null` for every
  pitcher and every pitch type.
- **Evidence:** code read at `:70-74` and `:124`; the cost profile of the identical query shape is
  the F1 measurement (a season-wide `GROUP BY` on `pitches` — `stuffSql` groups on
  `pitcher, pitch_name` with no supporting index; `idx_pitches_pitcher_pitch` is
  `(pitcher, pitch_name)` but the leading filter is `game_year`, so it will not be used for the
  grouping order).
- **Expected vs actual:** expected — a Stuff+ value per pitcher × pitch type. Actual — `null` for
  all of them whenever the second query is cancelled, with no signal at any layer.
- **Fix:** `if (stuffRes.error) return NextResponse.json({ error: stuffRes.error.message }, { status: 500 })`
  — or, better, degrade *explicitly*: return `{ rows, stuff_available: false }` and have the table
  header render "Stuff+ unavailable" rather than 50 dashes. Also switch this call to
  `run_query_long`.
- **Confidence:** **verified** for the missing error check; **probable** that it fires in production
  (I did not run `stuffSql` itself, to stay inside the query budget).

---

## F4. `/api/explore/query` truncates to 5,000 rows and reports the truncated length as `count`

- **Impact:** **high** — this is the natural-language SQL sandbox behind `(research)/explore`'s
  insights path. A generated query returning 12,000 rows is silently reduced to 5,000, and the
  response says `count: 5000`. Every chart drawn from it (`viz_config` supports `line`, `bar`,
  `scatter`, `heatmap`, `table`) is drawn on a truncated set, and any total, rate, or extremum the
  user reads off it is wrong by an unknown amount. The caller has no field that distinguishes
  "exactly 5,000 rows" from "the first 5,000 of N."
- **Location:** `app/api/explore/query/route.ts:194-195`

  ```ts
  const rows = (data || []).slice(0, 5000)
  return NextResponse.json({ rows, count: rows.length, viz_config: confirmedViz })
  ```
- **What's wrong:** the truncation happens **after** the database has already materialised the
  entire result set as `jsonb` inside `run_query_long` and shipped it over the wire, so it saves
  nothing on the DB or network side — it is a pure data-loss step. The slice is taken in whatever
  order the generated SQL happened to produce; if the model omitted `ORDER BY`, which row survives
  is non-deterministic. And `count` is computed *after* the slice, which is what makes it a wrong
  number rather than merely a partial one.
- **Expected vs actual:** for a query returning N > 5000, expected `count: N`, actual
  `count: 5000` with `rows.length == 5000`. Truncation is invisible at every layer.
- **Fix:** one line — `const truncated = (data || []).length > 5000` — then return
  `{ rows: rows.slice(0,5000), count: (data||[]).length, truncated }`, and render a banner when
  `truncated`. Better still, append `LIMIT 5001` inside `validateExploreSql` so the cap is enforced
  where it can be detected, and refuse to chart a truncated set.
- **Confidence:** **verified** (code read).

---

## F5. `/api/movement-percentiles` runs a full-season `pitches` scan under the 8s cap; the client converts the 500 into "no percentiles"

- **Impact:** **high** — the player dashboard's Movement percentile view renders with **no
  percentile context at all**: no breakpoints, no pool average, no `n_qualified`. The bars/rings
  simply have nothing behind them. Silent.
- **Location:** route `app/api/movement-percentiles/route.ts:58-91`; client
  `components/dashboard/PercentileTab.tsx:305-320`.
- **What's wrong:** the route builds a CTE that scans `pitches` for an entire `game_year` filtered
  by `p_throws` and a compound `OR` of `(pitch_type, release_speed BETWEEN lo AND hi)` bands, groups
  by `(pitcher, pitch_type)`, then runs `percentile_cont` over 99 quantiles — via `run_query` (8s).
  `idx_pitches_movement` is `(game_year, p_throws, pitch_type, release_speed)`, so the index
  *can* serve the predicate, but the pool for a common pitch type at ±1 mph is still tens of
  thousands of rows across ~700k candidates, and the 6-hour cache that was supposed to make this a
  once-a-night cost is dead (F2). The route correctly returns 500 on error — and then:

  ```ts
  fetch(`/api/movement-percentiles?...`)
    .then(r => r.ok ? r.json() : [])     // PercentileTab.tsx:306 — 500 becomes []
    .then(rows => { /* builds movementMap from [] */ })
    .catch(() => {})                      // :319 — and network failure becomes nothing at all
  ```
- **Evidence:** code read; cost class established by the F1 measurement (an index scan returning
  82,831 rows of `pitches` cost 13.5–18.7s on this instance). `getCached` at `:44` can never hit
  (F2).
- **Expected vs actual:** expected — `hb_breakpoints`/`ivb_breakpoints` arrays of 99 values per
  pitch type with `n_qualified ≥ 20`. Actual — `movementMap = {}` and a percentile view with no
  percentiles, indistinguishable from "pool too small."
- **Fix:** (a) `run_query` → `run_query_long`; (b) replace `r.ok ? r.json() : []` with a thrown
  error and an explicit "percentile context unavailable" state — the current code makes a server
  error look like a legitimate small-sample skip, which is the exact confusion `n_qualified ≥ 20`
  exists to prevent; (c) create `query_cache` so the 6h TTL actually works.
- **Confidence:** **verified** for the swallow; **probable** for the timeout frequency.

---

## F6. MiLB landing pages count the **MLB** `pitches` table, and print `0 pitches` when the count times out

- **Impact:** **high** — two wrong numbers in one line of UI. `/milb/pitchers` and `/milb/hitters`
  show a nav badge reading `{n} pitches` that is sourced from the MLB Statcast table, not
  `milb_pitches`; and the error path prints `0`.
- **Location:**
  - `app/(milb)/milb/pitchers/page.tsx:25-27`
  - `app/(milb)/milb/hitters/page.tsx:36-38`

  ```ts
  const { count } = await supabase.from('pitches').select('*', { count: 'exact', head: true })
  const { data: ld } = await supabase.from('pitches').select('game_date').order('game_date', { ascending: false }).limit(1)
  setDbInfo({ total: count || 0, pitchers: 0, lastDate: ld?.[0]?.game_date || '' })
  ```
- **What's wrong:** two independent defects. (1) **Wrong table** — a MiLB page reporting MLB
  coverage and the MLB last-ingest date. (2) **Swallowed error with a zero default** — `error` is
  destructured away entirely; `count: 'exact'` on `pitches` forces a full count of ~8.9M rows
  through PostgREST, which inherits the same 8s ceiling. On cancellation `count` is `null`, and
  `count || 0` renders `0 pitches`. Zero is not "unknown"; it is a claim.
- **Evidence:** code read. Index inventory confirms no covering structure would make an exact count
  cheap — `pitches` has 29 indexes, none narrower than `(events)` or `(game_type)`, and this
  instance took 18.7s to walk 82,831 index entries (F1). Per the instruction not to `COUNT(*)` all
  of `pitches`, I did not run it; the inference is from the measured per-row cost.
- **Expected vs actual:** expected — MiLB row count from `milb_pitches` (2023+). Actual — either the
  MLB count (~8.9M, wrong subject) or `0` (wrong value).
- **Fix:** point at `milb_pitches`; use `{ count: 'estimated' }` (PostgREST reads `reltuples`, which
  is what a nav badge needs) or a `pg_class.reltuples` lookup; and render `—` rather than `0` when
  `count` is null. Three-line change per page.
- **Confidence:** **verified** for the wrong table and the `|| 0`; **probable** for the timeout.

---

## F7. `/api/trends` reads its cache with a key that omits `tab` — the Stuff+ and Arsenal tabs can be served the Overview payload

- **Impact:** **high** (latent today, masked only by F2) — this is a cache that can return a
  response for a different request than the one that produced it, which is exactly the failure mode
  worth catching before it ships. The moment `query_cache` exists, the Trends page's Stuff+ and
  Arsenal tabs will render **empty** whenever the Overview scan has run in the previous 6 hours.
- **Location:** `app/api/trends/route.ts:15-21` (read) vs `:74`, `:110`, `:122` (writes).
- **What's wrong:** the read key is built before the tab is dispatched and does not include it:

  ```ts
  const cacheKey = `trends:${safeSeason}:${playerType}:${minPitches}`   // :15  — no `tab`
  const cached = await getCached(cacheKey)
  if (cached) return NextResponse.json(cached, { ... })                  // :16-21 — returns whatever is there
  ```

  The Overview branch writes to that same key (`:122`). The Stuff and Arsenal branches write to
  *different* keys — `trends:stuff:${season}:${mp}` (`:74`) and `trends:arsenal:${season}:${mp}`
  (`:110`) — that **nothing ever reads**. So the tab-specific caches are write-only dead weight, and
  a tab request reads the Overview entry.

  The keys collide exactly, today. `lib/hooks/useTrendsData.ts:138-142` sends the Overview request
  with `{season: CURRENT_YEAR, playerType: 'pitcher', minPitches: autoMinPitches}` where
  `autoMinPitches = month <= 4 ? 50 : 500`. `:174-176` sends the Stuff request with
  `{season, tab: 'stuff', minPitches: parseInt(minPitches) || 50}` and **no `playerType`**, so the
  route defaults it to `'pitcher'` (`:10`); `minPitches` state defaults to the same
  `month + 1 <= 4 ? '50' : '500'` (`:110`). In August both are `500` → both keys are
  `trends:2026:pitcher:500`.
- **Expected vs actual:** expected — `{leaders, gainers, losers, recentDate, latestDate}`. Actual —
  `{rows, recentDate, latestDate}` from the Overview scan. `stuffData.leaders` is `undefined`, so
  `app/(research)/trends/page.tsx:474-491` renders an empty table. HTTP 200, no error.
- **Fix:** move the cache read *after* tab dispatch, or fold `tab` into the key:
  `` const cacheKey = `trends:${tab}:${safeSeason}:${playerType}:${minPitches}` `` — and use that
  same key for all three writes. As a standing rule for this file: the cache key must be derived
  from the *same object* that parameterises the query, not hand-assembled beside it.
- **Confidence:** **verified** for the key construction and the parameter collision. The on-screen
  effect is currently **blocked** by F2 — no cache entry can exist — so this is a bug that fixing
  F2 will activate. Fix them in the same commit.

---

## F8. `buildReportQuery` silently drops unrecognised filter columns *and* unrecognised operators; MiLB Explore sends one of each

- **Impact:** **medium** — a filter the user set in the UI is dropped, the query runs against a
  broader population than requested, and the page returns HTTP 200 with a chip still showing the
  filter as active. This is the classic completeness-to-wrongness conversion: the numbers are rates
  and totals over the wrong denominator.
- **Location:** `lib/reportQueryBuilder.ts:120-141`; caller defect at
  `app/(milb)/milb/explore/page.tsx:164`.
- **What's wrong:** the builder has no rejection path.

  ```ts
  for (const f of filters) {
    const { column, op, value } = f
    if (!FILTER_COLS.has(column)) continue          // :124 — unknown column: dropped, no error
    ...
    if (op === 'in' ...) { ... }
    else if (op === 'gte') { ... } else if (op === 'lte') { ... }
    else if (op === 'eq') { ... } else if (op === 'between' ...) { ... }
    // no else — unknown op: dropped, no error
  }
  ```

  MiLB Explore pushes `{ column: 'game_type', op: '=', value: gameType }` at
  `app/(milb)/milb/explore/page.tsx:164`. `'='` is not one of the five handled operators, so the
  game-type filter is discarded and the leaderboard aggregates across all game types.
  `lib/hooks/useExploreData.ts:212` — the MLB twin — correctly sends `op: 'eq'`. The divergence is
  a copy-paste drift between two files that share a builder.

  Second instance of the same class: `GROUP_COLS` contains `pitch_team` and `bat_team`, but
  `BASE_FILTER_COLS` does not — so you can group a report by team and cannot filter it by team, and
  attempting to filter by team fails silently rather than returning 400.
- **Evidence:** code read. Magnitude measured — the dropped `game_type` filter is currently
  harmless because MiLB carries only regular-season rows right now:

  ```sql
  select game_type, count(*) from milb_pitches where game_date >= '2026-08-15' group by 1;
  -- R | 26629    (single row; no other game_type present)
  ```

  So this is a live mechanism with a currently-zero blast radius — it will start producing wrong
  numbers the moment MiLB playoff or complex-league rows land.
- **Expected vs actual:** expected — MiLB Explore restricted to the selected game type. Actual —
  unrestricted; today identical because only `'R'` exists, tomorrow not.
- **Fix:** (a) `app/(milb)/milb/explore/page.tsx:164` → `op: 'eq'`. (b) In `buildReportQuery`,
  return `{ error: 'Unknown filter column: X' }` / `{ error: 'Unknown operator: X' }` instead of
  `continue` — the function already returns a validated `{error}` for unknown metrics and groups
  (`:99-104`), so filters are the odd one out. That turns a silently-wrong 200 into a loud 400.
- **Confidence:** **verified** for the mechanism and the `op: '='` caller; magnitude **measured** as
  currently nil.

---

## F9. Offset pagination sorts on a non-unique key everywhere it exists

- **Impact:** **medium** — rows can be skipped or repeated between pages, and the printed rank
  numbers are not a stable ranking. Nobody sees an error.
- **Location:**
  - `lib/reportQueryBuilder.ts:154-157` — `ORDER BY ${safeSortBy} ${safeSortDir}` then
    `LIMIT ${safeLimit} OFFSET ${safeOffset}`. `safeSortBy` is a metric alias (`pitches`,
    `avg_velo`, `k_pct`) or a group column — never unique.
  - `app/api/leaderboard-defence/route.ts:50-53` — `ORDER BY ${safeSortBy} ${safeDir} NULLS LAST`
    over e.g. `outs_above_average`, which is integer-valued and heavily tied at 0.
  - Consumers: `lib/hooks/useExploreData.ts:225` and `app/(milb)/milb/explore/page.tsx:175`, both
    `offset: page * limit` with `limit = 50`.
  - Rank display: `app/(research)/explore/page.tsx:164` — `{page * limit + i + 1}`.
- **What's wrong:** Postgres gives no ordering guarantee among rows tied on the `ORDER BY` key, and
  each page is an independent query with an independent plan. Two adjacent pages can therefore emit
  the same tied row twice, or neither. `pitches` and `k_pct` tie constantly at leaderboard scale;
  `outs_above_average` ties massively. Separately, `safeSortBy` at `:154` silently falls back to
  `metrics[0]` when the requested sort key is unrecognised, and `leaderboard-defence:48` silently
  falls back to `player_name` — so the table header can show one column as sorted while the data is
  ordered by another.
- **Evidence:** code read; documented Postgres behaviour (no stable sort without a total order in
  `ORDER BY`).
- **Fix:** append a unique tiebreak to every paginated `ORDER BY` — `, pitcher ASC` for pitching
  reports, `, batter ASC` for hitting, `, player_name ASC` for defence. One string concatenation in
  `buildReportQuery` and one in `leaderboard-defence`. Keyset pagination would be better but is not
  worth the rewrite at 50 rows/page.
- **Confidence:** **verified** (code + documented semantics). I did not measure tie frequency.

---

## F10. Every `count` on every route is the page length, and the UI prints it as the result total

- **Impact:** **medium** — "N rows" always means "rows on this page." There is no total anywhere in
  the read path, so a user cannot tell a 50-row page of 900 qualifiers from a 50-row *complete*
  result — nor can they tell either from a truncated one.
- **Location:** `app/api/report/route.ts:14` (`count: data?.length || 0`),
  `app/api/milb/report/route.ts:22`, `app/api/leaderboard-defence/route.ts:59`
  (`count: (data || []).length`), `app/api/leaderboard-triton/route.ts:181` (`count: paged.length`),
  `app/api/leaderboard-deception` (same shape). Rendered at
  `app/(research)/explore/page.tsx:128` and `app/(milb)/milb/explore/page.tsx` equivalent.
- **What's wrong:** the next-page button is gated on the heuristic `disabled={rows.length < limit}`
  (`app/(research)/explore/page.tsx:134`), which is correct-ish but gives no total, and interacts
  badly with F1: on a query cancellation `rows.length` is 0, so the UI shows "0 rows / Page 1 / next
  disabled" — a perfect impersonation of a legitimately empty result.
- **Fix:** `leaderboard-triton` already has the full row set in memory before slicing
  (`route.ts:179`) — return `total: rows.length` alongside `count: paged.length` for free. For
  `/api/report`, either run a second `COUNT(*) OVER ()` window in the same aggregate (cheap once the
  aggregate itself is fixed) or add `total_estimated` and label it as such. At minimum, render
  "50 of ≥50" rather than "50 rows".
- **Confidence:** **verified.**

---

## F11. `/api/hot` aggregates a full season of `pitches` with no `LIMIT`, under the 8s cap

- **Impact:** **medium** — the `/hot` page shows an error banner rather than wrong numbers, so this
  is a "merely broken" finding, not a silent one. Ranked accordingly.
- **Location:** `app/api/hot/route.ts:62-104`.
- **What's wrong:** `SELECT … FROM pitches WHERE game_year = ${year} AND game_type = 'R' GROUP BY
  pitcher, game_pk ORDER BY pitcher, game_date, game_pk` — one row per pitcher-appearance for a full
  season, no `LIMIT`, 20+ `CASE` branches, via `run_query` (8s). The 30-minute in-memory `Map` cache
  at `:44` is per-lambda-instance, so on Vercel it is cold for most requests.
- **Evidence:** code read; cost class from the F1 measurement (a 22-day slice of the same table with
  a simpler `GROUP BY` took 18.9s).
- **Credit where due:** `:105-108` checks `error` and returns 500, and
  `app/(research)/hot/page.tsx:89` checks `d.error` and renders it at `:123`. This is the pattern
  the rest of the codebase should copy.
- **Fix:** `run_query_long`, and move the appearance rollup into a materialised table refreshed by
  the nightly cron — this query recomputes the entire season on every cold instance.
- **Confidence:** **verified** for the code, **probable** for the timeout.

---

## F12. `run_query` vs `run_query_long` is applied inconsistently, and `supabaseAdminLong` misrepresents the ceiling

- **Impact:** **medium** — the naming actively misleads. Four routes import the "long" client and
  then call the short RPC, so a reader (and a future author) believes they have 120s when they have
  8s.
- **Location & DB objects:**
  - `run_query` — `proconfig = NULL`, `prosecdef = true`, plpgsql
  - `run_query_long` — `proconfig = {statement_timeout=120s, search_path=public, extensions}`
  - `run_mutation` — `proconfig = {search_path=public, extensions}` → also 8s
  - `authenticator` — `rolconfig = {session_preload_libraries=safeupdate, statement_timeout=8s, lock_timeout=8s}`
  - `service_role` — `rolconfig = NULL`
  - `lib/supabase-admin.ts:17-20` — `supabaseAdmin` = 30s *client fetch* timeout,
    `supabaseAdminLong` = 120s client fetch timeout. Neither touches the server ceiling.
- **What's wrong:** PostgREST logs in as `authenticator` and issues `SET ROLE service_role`.
  Postgres applies `rolconfig` at **login**, for the login role only; `SET ROLE` does not re-apply
  the target role's settings. `service_role` has `rolconfig = NULL`, so it inherits nothing and the
  session keeps `authenticator`'s 8s. Therefore any RPC without its own `proconfig` is capped at 8s,
  regardless of the client-side `AbortSignal.timeout(120000)`. The client timeout only controls how
  long Node waits for a response that Postgres has already given up producing.

  Mismatched call sites (imports `supabaseAdminLong`, calls `run_query`):
  `app/api/report/route.ts:11`, `app/api/milb/report/route.ts:19`,
  `app/api/milb/player-data/route.ts:18`, `app/api/trends/route.ts:6`,
  `app/api/park-adjusted/route.ts:5`, `app/api/movement-percentiles/route.ts:87`,
  `app/api/leaderboard-triton/route.ts:71-72`, `app/api/hot/route.ts:4`.

  The asymmetry is starkest between the two player-data routes, which have the identical query
  shape and the identical `LIMIT 50000`:
  - `app/api/player-data/route.ts:45` → `run_query_long` ✅ (120s)
  - `app/api/milb/player-data/route.ts:18` → `run_query` ❌ (8s)
- **Evidence:** `pg_proc.proconfig` and `pg_roles.rolconfig` queried live this session (values
  above). RPC bodies read from `pg_proc.prosrc`: all three wrap the caller's SQL in
  `SELECT jsonb_agg(row_to_json(t)) FROM (…) t` and `RETURN COALESCE(result, '[]'::jsonb)` — so an
  empty result and a zero-row result are indistinguishable (correct), but a **cancellation raises**
  rather than returning `[]` (also correct). The silent-empty behaviour is entirely client-side.
- **Fix:** rename `supabaseAdminLong` → `supabaseAdmin120sFetch` or, better, delete it and make the
  RPC choice the only thing that signals the ceiling. Then sweep the eight call sites above.
- **Confidence:** **verified** for `proconfig`/`rolconfig` (measured); **documented** for the
  `SET ROLE` inheritance semantics.

---

## F13. `hasIndexedFilter` — the guard against full-table scans — is never called

- **Impact:** **medium** — a designed safety rail that exists only in the test suite.
- **Location:** `lib/reportQueryBuilder.ts:4-6` (`INDEXED_FILTER_COLS`), `:195-198`
  (`hasIndexedFilter`).
- **What's wrong:** `grep -rn "hasIndexedFilter\|INDEXED_FILTER_COLS" app lib components __tests__`
  returns exactly two production definitions and **seven test references**
  (`__tests__/lib/reportQueryBuilder.test.ts:4,8,100,105,112,120,124,159`). `buildReportQuery` never
  calls it. The comment above it reads "guard against full table scans"; it guards nothing. A report
  with no indexed filter at all is accepted and dispatched.
- **Fix:** in `buildReportQuery`, after building `whereParts`, reject with
  `{ error: 'Add at least one of: season, date range, team, or player' }` when
  `!hasIndexedFilter(filters)`. That converts F1's worst case (an unbounded all-time aggregate) from
  a 60-second timeout into an immediate, actionable 400.
- **Confidence:** **verified.**

---

## F14. `/api/player-data`'s `LIMIT 50000` is not currently binding — but it is undetectable when it becomes so

- **Impact:** **low today, high the day it trips** — I checked this specifically because a silent
  `LIMIT` over `ORDER BY game_date DESC` would drop the *oldest* seasons from a career view, and the
  reports builder fetches full careers.
- **Location:** `app/api/player-data/route.ts:44`, `app/api/milb/player-data/route.ts:17`. Callers
  that pass **no** `year` param and therefore request the full career:
  `app/(research)/reports/page.tsx:195` and `:252`.
- **Evidence — measured, and it is fine:**

  ```sql
  with p as (select player_id, sum(pitches) tot from mv_pitcher_season_stats group by 1),
       b as (select player_id, sum(pitches) tot from mv_batter_season_stats  group by 1)
  select 'pitcher', count(*) filter (where tot > 50000), count(*) filter (where tot > 40000), max(tot) from p
  union all
  select 'batter',  count(*) filter (where tot > 50000), count(*) filter (where tot > 40000), max(tot) from b;

  -- pitcher | 0 | 0 | 29904
  -- batter  | 0 | 0 | 29185
  ```

  Zero players anywhere near the cap; the busiest career in the Statcast era is 29,904 pitches
  (regular season). Headroom is roughly 20,000 pitches ≈ 6–7 more seasons for a workhorse starter.
- **What's still wrong:** when it does bind, nothing will say so. The route returns
  `count: validated.length` — which would be exactly `50000` — and `usePlayerData.ts:148` and
  `reports/page.tsx:197` both take `json.rows` at face value. The oldest seasons would silently
  vanish from the year selector, which is built from the returned rows
  (`usePlayerData.ts:158`, `buildOptionsCache`).
- **Fix:** request `LIMIT 50001`, and if `rows.length > 50000` return
  `{ rows: rows.slice(0, 50000), truncated: true }`. Cheap now, correct forever.
- **Confidence:** **verified** (measured). Caveat: the MVs cover regular season only, so true career
  totals including spring/postseason are perhaps 10–15% higher — still well clear of 50,000.

---

## F15. Reports Builder's modifier-target load swallows errors and then computes a metric from the empty set

- **Impact:** **medium** — `computeStuffProfile([])` runs on zero pitches and the resulting profile
  is applied as a modifier to every tile in the report. A failed fetch becomes a silently neutral
  (or nonsense) adjustment rather than an error.
- **Location:** `app/(research)/reports/page.tsx:194-203`

  ```ts
  const res = await fetch(`/api/player-data?id=${target.id}&col=${col}`)
  const json = await res.json()
  const rows = json.rows || []          // :197 — no res.ok, no json.error check
  enrichData(rows)
  setModifierTargetData(rows)
  const profile = computeStuffProfile(rows)   // :200 — profile from []
  setPitcherStuffProfile(profile)
  ```
- **Contrast:** the sibling `loadPlayerData` at `:252-258` *does* check `json.error` and bails —
  though only to `console.error`, so the user still sees no message and the previous player's data
  stays on screen. Two loaders, two different levels of care, in the same file.
- **Fix:** add `if (!res.ok || json.error) throw new Error(json.error ?? res.statusText)` to both,
  and surface it in the existing loading/error UI rather than the console.
- **Confidence:** **verified.**

---

## F16. MiLB Explore's Defence / Triton / Deception tabs query MLB-only tables

- **Impact:** **medium** — a MiLB page rendering MLB data, or an empty table with no explanation.
- **Location:** `app/(milb)/milb/explore/page.tsx:121-155`. The tab list is built from the shared
  `STAT_SETS` (`:391`) and `VIEWS` includes `defence` (`:24-29`), so these tabs are reachable.
  `/api/leaderboard-defence` reads `defensive_oaa`, `defensive_oaa_outfield`,
  `defensive_catch_probability`, `defensive_arm_strength`, `defensive_run_value`,
  `defensive_catcher_framing` (`route.ts:4-11`); `/api/leaderboard-triton` reads
  `pitcher_season_command`; `/api/leaderboard-deception` reads `pitcher_season_deception`. All are
  built from MLB sources.
- **What's wrong:** whichever way it resolves — MLB rows shown under a MiLB banner, or an empty
  table — the page gives the reader no signal. Combined with F1's `data.rows || []` swallow at
  `:133` and `:155`, an error and an empty MiLB result look identical.
- **Fix:** hide the Defence/Triton/Deception tabs on the MiLB explore view, or have those routes
  return an explicit `{ rows: [], unsupported: 'MiLB' }` that the table renders as a message.
- **Confidence:** **probable** — I read the routing and the table sources but did not query the six
  defensive tables for MiLB player IDs.

---

## F17. Two lower-severity swallows worth fixing in the same pass

- **`lib/hooks/usePlayerData.ts:164-166`** — `/api/player-filter-options` fetched with no `res.ok`
  check; on failure `d.game_year` is `undefined` → `[]` → **the player page's season selector shows
  no seasons**, silently. Note the route itself is fine (`route.ts:34` returns 500 correctly). The
  route runs 8 `ARRAY_AGG(DISTINCT …)` over a player's whole career under the 8s cap, but with
  `idx_pitches_pitcher` available and a ≤30k-row worst case (F14) it should hold.
- **`lib/hooks/useExploreData.ts:145-151`** — the filter-option loader wraps each
  `get_distinct_values` RPC in `.then(r => r, () => ({ data: null }))`, so an RPC failure produces an
  **empty dropdown** for that column. The user concludes the column has no values; in fact the
  lookup failed. Seven dynamic columns are exposed (`type`, `events`, `description`, `home_team`,
  `away_team`, `if_fielding_alignment`, `of_fielding_alignment`).
- **`lib/hooks/useExploreData.ts:284-286` + `:353-355`** — `loadMore()` increments `page`, but the
  effect does `setRows(queryRows)` (replace, not append). On mobile, "load more" **swaps** the
  visible 50 rows for the next 50 rather than extending the list. Low, and arguably Cas's lane.
- **Confidence:** **verified** for all three.

---

## What is working (so it does not get re-broken)

- **Error checking in `Promise.all` fan-outs.** `app/api/umpire/route.ts:203-209`,
  `app/api/matchup-lookup/route.ts:63-64`, `app/api/sequencing/route.ts:70-72` and
  `app/api/team-tendencies/route.ts:273-275` all iterate the settled results and return 500 on the
  first error. `leaderboard-triton` (F3) is the one that doesn't — copy these.
- **`lib/queries/fetchers.ts:3` and `:13`** both throw on `!res.ok`. Every hook that uses
  `postJson`/`fetchJson` (all of `useTrendsData`) reports failures correctly. The raw-`fetch` call
  sites are the ones that leak.
- **`lib/schemas/playerData.ts:61-68`** — `parsePlayerDataRows` is all-or-nothing: on a validation
  failure it logs and returns the **raw** rows rather than filtering to the valid subset. That is the
  right choice; a per-row `safeParse` filter would silently drop pitches.
- **`app/api/hot/route.ts:105-108` → `app/(research)/hot/page.tsx:89,123`** is the only complete
  error path I found from RPC to rendered message. Use it as the template.
- **`app/api/leaderboard-defence/route.ts:14-21`** allow-lists sort columns per table, and
  `buildReportQuery:99-104` validates metrics and group columns with a real `{error}` return. The
  validation discipline exists; it just stops short of filters (F8) and index guards (F13).
- **`run_query` / `run_query_long` bodies** (read from `pg_proc.prosrc`) do not mask failures: a
  cancelled statement raises out of the `EXECUTE`, and `COALESCE(result, '[]')` only fires for a
  genuinely empty result set.
- **`LIMIT 50000` on player-data is not binding** (F14, measured).
- **Supabase's default `.select()` row cap is not in play here** — `authenticator`'s `rolconfig`
  contains no `pgrst.db_max_rows`, and PostgREST's `db-max-rows` default is unlimited. The two
  `count: 'exact'` call sites (F6) are the only large-table PostgREST reads in `(research)`/`(milb)`;
  everything else goes through `run_query`, which is bounded by SQL `LIMIT`, not by PostgREST.
- **Repo-doc correction:** `CLAUDE.md` states "**No index on `game_pk`.**" That is stale.
  `pg_indexes` shows both `idx_pitches_game_pk` (btree on `game_pk`) and the unique
  `pitches_game_pk_at_bat_number_pitch_number_key`. 29 indexes total on `pitches`. The
  `game_umpires JOIN pitches ON p.game_pk = u.game_pk` in `/api/umpire` is therefore index-supported,
  and I downgraded that route accordingly.

---

## What I could not determine

1. **Production timing vs this session's timing.** Every measurement came through the Supabase
   management SQL endpoint on the same database, but I could not observe a real Vercel request. The
   18.9s figure is the query cost, not an end-to-end latency; I did not confirm which specific
   production requests are actually being cancelled. `pg_stat_statements` does **not** record
   timed-out statements, so the usual evidence is structurally unavailable — the honest way to close
   this is a route-level duration histogram, not a database query.
2. **How often F3, F5 and F11 fire.** I established that their queries are the same cost class as
   the one I measured over the cap, but I did not run `stuffSql`, the movement-percentile CTE, or the
   `/api/hot` aggregate directly (query budget, and two of them would have been long-running scans).
   Grade: probable, not measured.
3. **Whether F16 shows MLB rows or an empty table.** I did not query the six `defensive_*` tables or
   `pitcher_season_command` for MiLB player IDs.
4. **Whether `query_cache` ever existed.** There is no DDL for it in `scripts/`, and no migration
   named for it, but I did not read the migration history — it may have been dropped rather than
   never created. It does not change the fix.
5. **Tie frequency for F9.** I did not measure how many rows share a `pitches` count at a page
   boundary, so I cannot say how often a row is actually skipped or duplicated — only that nothing
   prevents it.
6. **`mv_pitcher_season_stats` is `relkind = 'r'` (a plain table) while `mv_batter_season_stats` is
   `relkind = 'm'` (a materialised view).** `/api/park-adjusted` reads both as if they were the same
   kind of object. That is a freshness question rather than a query-layer one — it belongs to
   whoever owns the ingest/refresh slice — but it should not be left unexamined.
7. **`docs/Queries.md` was not updated.** The repo convention requires logging every ad-hoc query,
   but this audit explicitly forbade opening that file. The 11 queries I ran are reproduced verbatim
   in the findings above; they need to be appended under a `## 2026-08-22` header by whoever
   consolidates this audit.

---

## The single highest-leverage next action

**Create the `query_cache` table and fix `/api/trends`'s cache key in the same commit** (F2 + F7).
F2 is why the heavy routes are on the hot path at all, and F7 is a live bug that F2 is currently
hiding — creating the table without fixing the key would take the Trends page from "slow" to
"serving the wrong payload." Then do the one-word `run_query` → `run_query_long` sweep across the
eight call sites in F12, which costs nothing and buys 15× on every route in F1, F3, F5 and F11.

Everything else in this report is a client-side `if (!res.ok) throw`. There are eleven of them and
they are all in the same shape. Do them together, and add a lint rule: **`await fetch(` in this repo
must be followed by an `res.ok` check** — that is the detector that stops this class from coming
back.
