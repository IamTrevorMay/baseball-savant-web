# Reliability Findings — 2026-08-11

Consolidated from the Stuff+ outage investigation and the Jo brain build. Every item states how it
was verified. **Nothing in this document has been fixed except where explicitly noted.**

Verification legend:
- **measured** — a query was run and its result is logged in `docs/Queries.md`
- **code-verified** — read directly in the repo, file:line cited
- **inferred** — reasoning from mechanism; needs a measurement to confirm

---

## P0 — Live, currently degrading production

### 1. The nightly refresh chain has failed every night since 2026-06-26 and reports success

**measured** (`docs/Queries.md`, "Materialized-view / rollup refresh audit")

`refresh_materialized_views()`, `refresh_league_averages()`, and `refresh_league_percentiles()` all
have `pg_proc.proconfig = NULL` — no function-level `statement_timeout` — so all three inherit
`authenticator`'s **8 second** cap and cannot complete. `cron_runs WHERE job='refresh'` shows **52
runs from 2026-06-21 to 2026-08-11: 50 timed out, 2 skipped, zero succeeded — all 52 recorded
`status='success'`.**

| Asset | Last updated | Staleness |
|---|---|---|
| `league_averages` (2026) | 2026-06-26 19:48 | 46 days |
| `league_percentiles` | 2026-06-03 | 69 days |
| All six `mv_*` matviews | 2026-06-26 | 46 days |

**Blast radius:** `league_averages` is the denominator for every plus-stat. Leaderboards, team
tendencies, `/api/scene-stats`, and the live broadcast overlays have all been serving June 26 data.

**Control group proving the mechanism:** `refresh_player_summary` / `refresh_batter_summary` carry
`statement_timeout = 120s` and their tables are current (2026-08-05 / 2026-08-11). Same cluster,
same night, same base table. The only difference is `proconfig`.

**Root cause is a conflation:** `run_query` and `run_mutation` are `SECURITY DEFINER` and *still*
capped at 8s. `SECURITY DEFINER` changes privileges, not timeouts.

**Fix** — metadata-only, reversible:
```sql
ALTER FUNCTION refresh_materialized_views()    SET statement_timeout = '600s';
ALTER FUNCTION refresh_league_averages(int)    SET statement_timeout = '600s';
ALTER FUNCTION refresh_league_percentiles(int) SET statement_timeout = '600s';
```
Then trigger a refresh and re-measure. **Do not** raise `authenticator`'s cap globally — that would
hide this class of failure rather than surface it.

> **Why this works is not what it looks like — and the distinction is operational.**
>
> Postgres arms the statement timer when the command *arrives*, at `authenticator`'s 8s. Entering a
> function does **not** re-arm it. Tom Lane, pgsql-general: *"statement_timeout bounds the time spent
> for a single command sent by the client. So by the time you're inside a procedure, the countdown is
> already running… it's too late to change it with effect for that command."*
>
> `ALTER FUNCTION … SET statement_timeout` works here only because **PostgREST hoists** the
> function's `proconfig` out of `pg_proc` and issues it as a transaction-scoped `SET LOCAL` *before*
> the main query — a PostgREST feature gated by `db-hoisted-tx-settings` (PostgREST issue #3001).
>
> Two consequences:
> 1. **The fix applies over PostgREST only.** Calling these functions from `psql` or any direct
>    connection gets the caller's session timeout, because nothing hoists. If you test the fix from
>    the SQL editor and it appears not to work, that is why.
> 2. **`db-hoisted-tx-settings` is an unmonitored single point of failure.** If it ever stops
>    including `statement_timeout`, `run_query_long` silently reverts to 8s and every heavy read
>    route begins failing. Worth an assertion: check that `authenticator.rolconfig` still holds
>    `statement_timeout=8s` and `run_query_long.proconfig` still holds `120s`.
>
> Related: the naive reading — "`SET ROLE` ignores `rolconfig`, so `service_role`'s timeout never
> applies" — reaches the right answer for the wrong reason. PostgREST *does* re-issue
> impersonated-role settings as `SET LOCAL`; it simply has nothing to issue, because
> `service_role.rolconfig` is NULL. **Adding a timeout to `service_role` would therefore not behave
> the way the naive model predicts** — don't "fix" it that way.

**Also:** `mv_last_refreshed` does not exist in `system_metadata` — it is written only on success
and there has never been one. A freshness monitor checking marker *age* returns zero rows and reads
as healthy.

---

## P1 — Silent-failure machinery

### 2. The integrity suite structurally cannot fail

**code-verified** (`lib/dataIntegrity.ts`, `app/api/cron/integrity/route.ts:52`)

`CheckResult` permits `'pass' | 'warn' | 'fail' | 'remediated'`, but the module's actual returns are
**10× `pass`, 8× `warn`, 1× `remediated`, zero `fail`**. The only `'fail'` is emitted when a promise
*rejects*. A real breach returns `warn`, `warn` doesn't throw, `trackCronRun` records success.
Result: 776 check rows over 95 run days with zero failures ever recorded.

**Worse — two checks report `pass` on query error** (`lib/dataIntegrity.ts:108`, `:167`):
```ts
if (error || !orphans || orphans.length === 0) {
  return { check_name: 'orphaned_pitchers', status: 'pass', found: 0, remediated: 0,
           details: error ? { queryError: error.message } : {} }
}
```
A timeout reports clean data.

**Fix:** add an `errored` status for the error branches; make the route throw on anything that isn't
`pass`/`warn`/`remediated`. Severity must be three-way: **pass / breached / could-not-evaluate**.

### 3. It has been warning correctly for two months and nobody was told

**measured.** `pitch_baselines` warn ×47 since **2026-06-26** — the exact day the refresh chain
died. `materialized_views` warn ×56 since 2026-06-14. `new_pitch_names` warn ×54.

The monitor worked. It had no way to escalate and no destination.

### 4. `reportError` has no sink

**code-verified** (`lib/observability.ts:35`). 14 call sites across 6 files, all terminating at a
`TODO`. `package.json` has zero observability dependencies.

Compounding: Vercel Pro retains runtime logs for **1 day**, and `reportError` writes to
`console.error`. Each night's evidence was deleted before the next failure. The Stuff+ outage was
not merely unmonitored — it was unforensicable.

### 5. `errors` is counted and never asserted

**code-verified** (`app/api/update/route.ts:145`). `syncPitches` computes a failed-row count and
nothing checks it. Asserting `errors = 0` is one line and closes schema drift, poison records, and
constraint violations at once.

### 6. A short Savant response counts as success

**code-verified** (`app/api/update/route.ts:87`). `if (csv.length < 100)` returns
`{fetched: 0, inserted: 0, errors: 0}`. An upstream error page and a legitimate no-games day are
indistinguishable, and both gate `/api/cron/refresh` off entirely.

### 6b. Contract drift also returns HTTP 200 — a third road to the same silence

**code-verified** (`app/api/update/route.ts:117`, `:181`)

`syncPitches` builds its upsert payload from whatever headers the Savant CSV returns. If Savant adds
a column, PostgREST rejects **every** batch; the per-row fallback then fails all 500 rows because it
is a *schema* error, not a bad-row error; `inserted` ends at 0; line 181's `if (inserted > 0)` skips
Stuff+ scoring entirely; `stuffResult.ok` stays `true`; the cron records success. `errors` is
computed and discarded.

This is the same swallow-and-return-200 shape as the 2026 Stuff+ outage and as #2, reached by a
third independent path. The pattern — not any individual bug — is the thing to fix.

### 6c. 91 external call sites, exactly one retries

**code-verified.** Across 50 files, only `app/api/pitch-video/route.ts:95` retries (3 attempts, no
jitter, no `Retry-After` handling). Two silent swallows sit in the ingest path itself:
`catch { /* skip batch on error */ }` at `app/api/update/route.ts:55` and `if (!resp.ok) continue`
at `app/api/cron/player-stats/route.ts:72` — each can drop up to 50 players with no counter.

### 6d. The 3-day window cannot see provider restatement

**inferred** — materiality unmeasured, and worth measuring.

The 3-day re-sync heals provider *lateness* well (it is why ingest survived with no retry layer).
But **any value Savant revises more than 72 hours after a game is never seen.** `pitches` is
effectively a frozen snapshot of what MLBAM believed within three days of first pitch.

Statcast does restate: Bill Petti's Statcast-database guide reloads by `game_year` because
"BaseballSavant will often times update data from previous seasons," and Tango documented an
undisclosed semantic change where velocity moved from *at 50 ft* to *out of hand* (~54.5 ft) without
restating prior seasons.

This matters specifically because **`pitch_name` is the join key to `pitch_baselines`**
(`app/api/update/route.ts:328-330`). A pitch reclassified by Savant after 72 hours is scored against
the wrong baseline permanently.

**Measurement:** re-fetch three completed game dates from a prior season, diff against `pitches` on
`(game_pk, at_bat_number, pitch_number)`, report per-column change rates. Under 0.1% and this is a
footnote; if `pitch_name` moves ~2%, the Stuff+ history is wrong by a measurable amount.

---

## P2 — Approaching the ceiling

### 7. The ingest upsert is at 94.8% of the 8s cap

**measured** (`pg_stat_statements`, logged in `docs/Queries.md`). Four workloads pinned:

| Workload | Max exec | % of cap |
|---|---|---|
| `run_query` (shape A) | 7,997.0 ms | **99.96%** of 8s |
| `run_query` (shape B) | 7,881.5 ms | 98.5% of 8s |
| `pitches` ingest upsert | 7,587.6 ms | **94.8%** of 8s |
| `refresh_player_summary()` | 119,926.5 ms | **99.94%** of 120s |

**Timed-out statements are never recorded in `pg_stat_statements`** (verified by controlled
experiment: a statement killed by `statement_timeout` left zero rows; a control was recorded). So
`max_exec_time` is a *censored* distribution — once a shape crosses the ceiling it vanishes from the
stats. You must watch the approach, not the crossings.

### 8. The ingest rewrites ~8,000 unchanged rows every night

**code-verified** (`app/api/update/route.ts:148`) + **inferred** on the bloat attribution.

`{ onConflict: 'game_pk,at_bat_number,pitch_number', ignoreDuplicates: false }` is an unconditional
`ON CONFLICT DO UPDATE`. With a 3-day re-sync window, ~8k of each night's ~12k rows already exist and
are almost certainly byte-identical — each still takes a new heap tuple, up to 29 index entries, and
a dead old tuple.

8k × ~180 game days ≈ 1.44M unnecessary row versions, against an observed `n_dead_tup` of
**1,437,923**. **Treat that agreement as suggestive, not proven** — the estimator resets on vacuum
and a 250k-row backfill ran the same day. The test is one `n_dead_tup` reading either side of one
cron run.

Two consequences that hold regardless:
- `inserted += batch.length` counts no-op updates, so `totalInserted` is always ~12k in-season and
  the `skipDownstream = totalInserted === 0` gate in `/api/cron/refresh` can essentially never fire.
- PostgREST's `.upsert()` cannot express `WHERE ... IS DISTINCT FROM`, so suppressing no-op writes
  needs a raw SQL upsert via `run_mutation` (fine at the existing 500-row batch, inside the 8s cap).

### 9. Bloat is already costing query time

**measured.** `pitches`: 8,891,054 live / **1,437,923 dead (13.9%)**, `autovacuum_count = 1`,
`last_autovacuum` **2026-05-17** (86 days). At `scale_factor = 0.2` the trigger is ~1,778,261, so it
sits at **80.9%** of threshold — autovacuum is correctly ignoring real bloat.

Direct evidence of cost: an index-only scan returning 1,063 rows reported **`Heap Fetches: 914`**
(stale visibility map), 6,574 ms cold. HOT-update ratio on `pitches` is **4.0%** vs 96.1% on
`sos_scores`. Table cache hit ratio is **38.51%**.

**Fix:** per-table autovacuum override, then one manual `VACUUM (VERBOSE, ANALYZE)` over a direct
connection.
```sql
ALTER TABLE pitches SET (autovacuum_vacuum_scale_factor = 0.02,
                         autovacuum_vacuum_threshold    = 10000,
                         autovacuum_analyze_scale_factor = 0.02,
                         autovacuum_analyze_threshold    = 10000);
```
`SHARE UPDATE EXCLUSIVE`, no downtime, `RESET`-reversible.

**Note:** the repo convention "VACUUM between large batch updates" has **never been implemented** —
zero matches in `app/`, `lib/`, `scripts/`, or any `.sql`. And it cannot be: `VACUUM` cannot run
inside a transaction block, and every PostgREST RPC call is one.

> ### ⚠️ Do NOT run `VACUUM FULL` on `pitches` or `retro_events`
>
> **measured.** `VACUUM FULL` rewrites the table and "requires extra disk space for the new copy" —
> **9.5 GB for `pitches`, 19.4 GB for `retro_events`**. Measured free space is ~8 GB. The command
> would take an `ACCESS EXCLUSIVE` lock on the primary analytics table, run for a long time, and
> **then fail on disk** — near the 90% auto-expand line with a 95% read-only tripwire behind it.
> `pg_repack` is not available on this instance.
>
> **Plain `VACUUM` is safe and is what's wanted** — it reclaims space in place, needs no extra disk,
> and takes only `SHARE UPDATE EXCLUSIVE`. The distinction is load-bearing.

### 10. Statistics are months stale — and this may be the root of the slow queries

**inferred from measured defaults.** At the default `autovacuum_analyze_scale_factor = 0.1`,
`pitches` needs `50 + 0.1 × 8.89M ≈ 889,050` modifications before autoanalyze fires. At ~12k rows
touched per night that is **~74 days**; on the ingest's new-row count alone it approaches a full
season.

**The mechanism is specific and nasty.** `game_date`'s histogram ends where the last ANALYZE saw it.
A predicate like `WHERE game_date >= CURRENT_DATE - 7` therefore falls off the end of the histogram,
the planner estimates ~1 row, and picks a Nested Loop — optimal for 1 row, catastrophic for 25,000.
This degrades *gradually* across a season, which is the same shape as the Stuff+ coverage curve and
equally invisible.

This is a strong candidate explanation for the measured cold-query times (a 7-day coverage scan at
9,923 ms). It may not be a buffer-cache problem at all; it may be a bad plan from stale statistics.
**Worth resolving before optimizing anything else**, because the two have opposite fixes.

On this platform a bad plan doesn't render a slow page — it raises
`canceling statement due to statement timeout` and the feature returns nothing. Combined with a
caller that swallows the error, that is indistinguishable from a data outage. **Plan quality here is
a correctness concern, not a performance one.**

Confirm with `SELECT relname, last_autoanalyze, n_mod_since_analyze FROM pg_stat_user_tables WHERE
relname IN ('pitches','retro_events','milb_pitches')`. The `ALTER TABLE` in #9 fixes it.

### 11. Nine indexes have never been scanned

**measured.** 9 of 29 indexes on `pitches` have `idx_scan = 0`, totalling **~1.42–1.48 GB** (~29% of
the index footprint). Largest: `idx_pitches_seq` 367 MB, `idx_pitches_stuff_plus` 261 MB.
**~1.02 GB is genuinely droppable** — `pitches_pkey` (370 MB, also zero scans) backs a constraint and
must stay.

Dropping them cuts write amplification ~31%, which directly buys headroom under the 8s cap.

`idx_pitches_stuff_plus` is a partial index whose predicate column is `stuff_plus` — Postgres counts
predicate columns as indexed for HOT purposes, so this index disables HOT on the very UPDATE that
sets `stuff_plus`. A dead index taxing the statement it helped kill.

**Before dropping:** confirm `stats_reset` is long-lived, save `pg_get_indexdef()` strings to
`docs/Queries.md` as the undo, then `DROP INDEX CONCURRENTLY` one at a time.

### 12. `auto_explain` is loaded but inert

**measured.** It is in `shared_preload_libraries`, but `log_min_duration = 10000 ms` — *above* the 8s
cap, so no `run_query` statement can survive long enough to be logged. `log_nested_statements = off`
also hides RPC bodies.

**Fix:** two dashboard settings — `log_min_duration = 3000`, `log_nested_statements = on`. This is
the only tool that could have captured the Stuff+ UPDATE's plan while it was slow but still
succeeding.

### 12b. `run_mutation` executes a failing statement twice

**code-verified** (`run_mutation` body). Its `EXCEPTION WHEN OTHERS` fallback re-issues
`EXECUTE query_text` after the first attempt fails. No double-write — the subtransaction rolls back
— but double cost. **Size chunks against ~4s, not 8s.** Current per-day Stuff+ chunks (~1.4s) and
backfill chunks (~2s) stay clear even doubled, but the margin is half what it appears.

### 12c. The RPC wrapper costs more than most queries

**measured.** Warm, on `pitches`: 5,000 rows = **11.9 ms** unwrapped, **849 ms** through
`jsonb_agg(row_to_json(t))` at 90 columns, **33.4 ms** at 4 columns. At 10,000 wide rows it exceeded
120 s.

**Column count, not row count, is the variable.** `run_query` serializes every column of every row
into JSON. Some queries on this platform are not slow — their *result serialization* is. `SELECT *`
against `pitches` is disproportionately expensive; project only the columns you need.

### 12d. `EXPLAIN` has never been run in this repository

**measured.** `grep -rn "EXPLAIN" --include=*.ts --include=*.sql` returns zero hits outside the Jo
agent definition. Every index in `scripts/create-tier2-indexes.sql` was reasoned from query text and
never verified against a plan — including the nine that have since turned out to have `idx_scan = 0`.

Because `run_query` accepts SELECT/WITH only, `EXPLAIN` must run via the SQL editor, direct `psql`,
or PostgREST's `explain()`. None of those inherit the 8s cap, so every capture needs
`SET LOCAL statement_timeout = '8s'` to reflect production. **Open question *(verify)*:** Triton's
SQL executes inside `run_query`'s plpgsql body via dynamic `EXECUTE`; if that context suppresses
parallel query, every plan captured in the SQL editor is *more* parallel than production and all
editor timings are systematically optimistic.

### 12e. Free win: extended statistics on correlated columns

**inferred.** Four functional dependencies the planner does not know about —
`game_date → game_year`, `pitch_type ↔ pitch_name`, `pitcher → p_throws`, `game_pk → game_date`.
`CREATE STATISTICS` fixes these at **zero write-time cost**, which is the only free lunch available
on a table already carrying 4.8 GB of indexes.

### 12f. `pitch_videos` has RLS enabled and zero policies

**measured.** A silent deny-all for `anon` and `authenticated` on 1.48M rows. It works today only
because the app reads as `service_role`. Latent until something reads it with a user token.

Related but *not* a problem: 258 RLS policies exist and 170 call `auth.uid()` with none wrapped in
`(SELECT …)` — the usual optimization. Measured, it costs the analytics path nothing, because
`pitches` has a `USING (true)` policy that ORs the auth check into a constant (identical plans,
43.6 vs 43.5 ms). **Do not spend time "fixing" this on `pitches`/`players`/`milb_pitches`.**

### 12g. Compute tier and disk plan don't reconcile

**measured, unresolved.** Instance reports Micro-class settings — `max_connections = 60`,
`shared_buffers = 256 MB`, `work_mem = 3.5 MB`, `max_parallel_workers_per_gather = 1`. 256 MB of
buffer cache against ~30 GB of hot tables explains the 38.51% cache hit ratio.

But `pitches` (9.7 GB) and `retro_events` (19 GB) each exceed Micro's 10 GB disk ceiling, and the
repo still documents an "8GB plan." **These cannot all be true — confirm the actual plan.**

---

## P3 — Correctness and hygiene

### 12h. The ingest writes pitches before their players — a latent trap for anyone adding a FK

**code-verified** (`app/api/update/route.ts:150-169`, then `:172`)

```
:150-169   for (batch of 500) → upsert('pitches', batch)
:172       await syncNewPlayers(rows)
```

Pitches land **before** the players they reference. Today that is harmless and self-healing: an
orphan exists briefly, and `checkOrphanedPitchers` backfills it the next morning.

**But it makes the obvious hardening step actively destructive.** Add a
`pitches.pitcher → players.id` foreign key without reordering, and on any debut player: the batch
fails wholesale (the code's own comment at `:157` — *"One bad row fails the whole batch"*), the
per-row retry at `:160-168` lands the other 499, and the debutant's rows fail again, increment
`errors`, get `console.error`'d, and are **never retried by anything** while the cron returns 200.
A FK would convert a self-healing gap into silent permanent data loss.

**Fix is two lines:** move `syncNewPlayers(rows)` above the upsert loop. Then the FK is correct and
cheap — `players` is 16,924 rows and cache-resident, against 29 index writes per row already paid.

**Related trap, documented verbatim in the Postgres `CREATE TABLE` docs:** *"deferrable constraints
cannot be used as conflict arbiters in an `INSERT` statement that includes an `ON CONFLICT` clause."*
Triton's entire ingest is `onConflict: 'game_pk,at_bat_number,pitch_number'`. Making that key
`DEFERRABLE` would break every night's ingest.

**Also:** both orphan checks in `lib/dataIntegrity.ts` carry `LIMIT 200`, so their `found` count
saturates at 200 and cannot express the size of a real problem.

### 12i. `innings_pitched` is stored as a decimal but MLB returns base-3

**code-verified** (`app/api/cron/player-stats/route.ts:88`) — **a real correctness bug.**

`parseFloat(stat.inningsPitched)` writes into a NUMERIC column. The MLB Stats API returns
`"62.1"` meaning **62⅓ innings**, not 62.1. Every decimal comparison or computation on
`player_season_stats.innings_pitched` is therefore wrong by up to **0.23 IP per pitcher, always in
the same direction**.

Anything deriving a rate from that column — ERA recomputation, IP-based qualification thresholds
(`IP >= max(5, 0.20 × IP_leader)`), per-inning rates — inherits the error. **Fix:** convert to outs
on ingest (`floor(x) * 3 + round((x % 1) * 10)`), and add a validity check that the fractional digit
is 0, 1, or 2.

### 12j. `player_season_stats` has no strikeouts or walks

**code-verified** (`scripts/create-player-season-stats.sql:4-20`). The table defines only `era, wins,
losses, saves, holds, innings_pitched, earned_runs, runs, rbi, stolen_bases` (plus IR/IRS).

So the most natural reconciliation — K and BB derived from `pitches` events versus official season
totals — **cannot be written today**. The MLB API already returns `strikeOuts` and `baseOnBalls` in
the same `stat` object parsed at `app/api/cron/player-stats/route.ts:83-94`; adding two nullable
integer columns makes the check possible. Until then, use `retro_events.event_type` (Chadwick
`EVENT_CD`: 3 = K, 14/15 = BB) as the comparator, which is runnable now.

### 12k. Provider reclassification is already visible in your data

**measured.** `pitch_type` values `ST` (sweeper) and `SV` (slurve) have `MIN(game_year) = 2015` in
`pitches` — those classifications did not exist in 2015, so Savant re-applied a newer classifier to
history and Triton re-ingested it. Conversely `FT` (a retired code) has `MIN = MAX = 2026` with
**13 rows**.

Thirteen rows will never move a distribution metric. **Only set-membership checks find this** — which
is exactly what the existing `new_pitch_names` integrity check does, and it has warned 54 times
without anyone acting. Promoting it from `warn` to `fail` is a one-line change to the only detector
in this class that already exists.

Related, on drift methods generally: measured PSI on pitch-mix never flagged the sweeper's rise from
**1.06% (2020) to 7.79% (2026)** — year-over-year PSI stayed at 0.002–0.008 ("no substantial
change"). The same 2025-vs-2026 buckets give **χ² = 720.4, p < 10⁻¹⁰⁰**. Same data, opposite
verdicts. At Triton's row counts, p-values are useless and effect sizes are mandatory.

### 12l. `milb_pitches.events` holds two vocabularies, and `CLAUDE.md`'s convention now destroys data

**measured + code-verified.** Promote to **P1** — this one silently drops rows from live queries.

| Season | Rows with `events` | Title Case | lowercase | % Title |
|---|---|---|---|---|
| 2023 | 172,713 | 172,713 | 0 | 100.0% |
| 2024 | 172,435 | 172,435 | 0 | 100.0% |
| 2025 | 171,545 | 171,545 | 0 | 100.0% |
| **2026** | 131,310 | 70,266 | **61,044** | **53.5%** |

Both coexist in one column: `field_out` (23,457) beside `Groundout` (11,209); `Strikeout` (15,824)
beside `strikeout` (13,128).

**Cause:** commit `410212b` (2026-06-08) added `EVENT_NORMALIZE_MAP`, applied at
`app/api/update/milb/route.ts:244`. A correct change — **but no backfill ran**, so the column split
along an *ingest-date* seam that no `game_date` filter can see.

**Why this is worse than a casing split.** The map is not case-normalization; it is a **category
collapse**: `Groundout`, `Flyout`, `Lineout`, `Pop Out`, and `Forceout` all map to `field_out`. So
rows ingested before June 2026 retain batted-ball-type granularity that rows ingested after do
**not**. The column's *information content* now depends on ingest date, and the pre-June detail
cannot be recovered from the post-June value.

**Blast radius:** any query matching `'Strikeout'` or calling `initcap()` silently discards ~46.5%
of 2026 MiLB events — **returning fewer rows rather than erroring.**

**`CLAUDE.md` currently instructs exactly that query:**
> *"Events column uses Title Case values (`Strikeout`, `Groundout`, `Home Run`, …) vs MLB's
> lowercase; normalize in queries."*

That guidance was correct through 2025 and is now actively harmful. It needs updating, as does
`Jo/data-quality/06-reconciliation-source-of-truth.md`, which I briefed from the stale convention.

**Detector** — one query, no baseline, would have fired 2026-06-09:
```sql
SELECT count(DISTINCT events) > count(DISTINCT lower(replace(events,' ','_'))) AS mixed_vocabulary
FROM milb_pitches WHERE game_year = 2026;
```

**Fix:** backfill `milb_pitches.events` to one vocabulary, chunked by `game_date` under the 8s cap,
and ship the assertion in the same change. Decide first whether to accept the category collapse or
preserve the finer pre-June values — they are not equivalent.

### 12m. Coverage monitoring would NOT catch the next Stuff+ failure — a correction to this document's own headline advice

**code-verified** (`app/api/update/route.ts:319-333`)

The scoring UPDATE guards rows on **`release_speed IS NOT NULL` only**. The other three inputs are
wrapped in `COALESCE(…, 0)`:

```sql
100
+ COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo,0), 0) * 4.5
+ COALESCE((SQRT(POWER(p.pfx_x*12,2) + POWER(p.pfx_z*12,2)) - b.avg_movement)
           / NULLIF(b.std_movement,0), 0) * 3.5
+ COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext,0), 0) * 2.0
...
AND p.release_speed IS NOT NULL
```

**If Savant stopped delivering `pfx_x`/`pfx_z`, `stuff_plus` would remain 100% populated**, stay
inside [0,200], and keep a mean near 100 — while silently becoming a velocity-and-extension-only
z-score. Every coverage assertion recommended in this document would be **green throughout**.

Compounding it: `refreshPitchBaselines` (`:262-266`) filters those same columns `IS NOT NULL`, so
its `INSERT … SELECT` would return zero rows, `ON CONFLICT` would never fire, and the baseline row
would sit **stale rather than absent** — passing `checkPitchBaselines`, the only check currently
watching that node.

**The correction:** coverage catches *"the value was never written."* It is structurally blind to
*"the value was written from degraded inputs."* Those need different detectors, and this document
over-claimed by treating coverage as sufficient.

**What actually closes it, in order of directness:**
1. **Assert input completeness, not just output coverage** — populated-fraction on `pfx_x`, `pfx_z`,
   `release_extension`, and `pitch_name`, not merely on `stuff_plus`. Cheapest and most direct.
2. **Assert distribution, not just presence** — losing the movement term collapses variance, so a
   standard-deviation floor on `stuff_plus` would fire. Note this is the *complement* of the finding
   in `Jo/data-quality/04`: distribution monitoring was useless for the 2026 coverage failure, and is
   the right tool for this one. They are not redundant; you need both.
3. **Remove the `COALESCE` defaults** so a missing input produces NULL and fails loudly. This is the
   correct long-term fix and changes scoring semantics, so it belongs to `Li`, not `Jo`.

### 12n. Additive schema drift is the catastrophic case here, not the silent one

**code-verified** (`app/api/update/route.ts:139-141`, `:154-163`)

Rows are cleaned of `id` and `Unnamed*` only, so a genuinely **new** Savant column is forwarded to
PostgREST, fails the 500-row batch with `column … does not exist`, and drops into the per-row retry
loop — **~12,000 doomed individual requests per night**. This inverts the usual guidance, where
additive change is the safe case.

**Subtractive** drift is the silent one (see 12m). Both are fixed by one line of whitelist
projection at the payload boundary.

**The quarantine table is already half-built:** that same retry loop isolates the failing row and
knows why it failed, then `console.error`s it and increments an `errors` counter nothing asserts on.
Redirecting one call turns it into an inspectable dead-letter table.

### 13. Two cron routes have no schedule

**code-verified.** `app/api/cron/challenges/` and `app/api/cron/newsletter/` have handlers and
`maxDuration` exports but no `vercel.json` entry. The newsletter route appears superseded by the
generalized `/api/cron/emails` (which reads active `email_products`), but this is unconfirmed.

### 14. Daily graphics read the wrong brief

**code-verified** (`app/api/cron/daily-graphics/route.ts:327`). Reads briefs with
`.order('date', {ascending: false}).limit(1)` rather than by date, and runs at 12:30 UTC while
`/api/cron/briefs` runs at 14:00. The graphic for day D carries the brief from D−1, and a two-night
briefs failure republishes stale highlights invisibly.

### 15. Ordering inversion introduced 2026-08-11

**code-verified.** Splitting `computeStuffPlusForDateRange` moved baseline refresh to
`/api/cron/refresh` (09:10) while scoring stayed in `/api/cron/pitches` (09:00), so scoring runs
against ~24h-old baselines. Numerically negligible. One real edge: on the first day of a new
`game_year` no baseline row exists, so that day scores 0% until the overlap window heals it (~48h).

### 16. Backfill route exceeds the Vercel ceiling on a full year

**inferred.** `/api/admin/backfill-stuff-plus?year=2026` at the 1-day default is ~180 chunks × ~2s
≈ **360s against a 300s ceiling**. Repair mode is idempotent so a re-run finishes, but the route
needs a wall-clock budget and a `next_start` cursor. Vercel does not retry failed invocations.

### 16b. Actual database size is 32.3 GiB, not 8 GB — and the disk auto-expanded silently

**measured.** `pg_database_size` = **34,703,805,587 B = 32.3 GiB** (PG 17.6).

`CLAUDE.md` and `Soto/context/triton-context.md:47` describe an "8GB plan — disk pressure," and
`planning.md:115` still lists *"Upgrade Supabase plan… = overflow"* as a pending action item — filed
**before** a Retrosheet seed that shipped in June.

**8 GB is the included allowance on Pro, not the provisioned disk.** Supabase auto-expands the volume
by +50% at 90% usage, so it plausibly walked 8 → 12 → 18 → 27 → 40.5 GB without anyone approving it.
**The provisioned ceiling is not readable from SQL** — it must be read off the dashboard. Every
headroom number here, including whether the `VACUUM FULL` warning above is urgent or merely prudent,
is gated on that one number. *(verify — confirm with Trevor)*

**Growth is not the risk; the base is.** Measured: `pitches` grows ~810k rows/season
(2026 YTD: 657,570 over 168 game days = 3,914/day) at **575.5 B/row heap + 570.8 B/row index =
0.91 GiB/yr** — index is **49.8% of growth**. Platform-wide ~1.8 GiB/yr ≈ 5.6%, a 13-year doubling.
Unbudgeted: `pitch_videos` is at 16.7% coverage; completing `scripts/backfill-pitch-videos.ts` adds
**+2.26 GB in one campaign**.

**Two counterintuitive results:**

1. **Compression will save exactly zero bytes.** Measured TOAST relation size on all five big tables
   is **8,192 bytes — one empty page**. Rows at 575 B and 1,222 B sit far below the ~2 kB TOAST
   threshold, so `pglz` → `lz4` is inert. These tables are too *narrow* to compress despite being
   enormous in aggregate.
2. **The cost curve is compute, not disk.** 40 GB of gp3 is ≈$4/month. But `shared_buffers` is
   256 MB against ~35 GB of relations (38.51% cache hit ratio); caching the working set means Large
   (~$110) or XL (~$210) — **27–52× the marginal disk cost**. And Supabase disk **never shrinks**, so
   archiving buys headroom, not a refund.

**`retro_events` is the archival win, and the premise checks out:** 19–21 GB with **12 lifetime
sequential scans**. Its only busy index (`retro_events_natural_key`, 15.1M scans) is the *ingest
upsert probe*, not a read path — `event_type_idx` is 96 MB / **0 scans**, `batter_game_idx` 378 MB /
**2 scans**. That's ~905 MB of dead index there on top of ~1.02 GB on `pitches`. Honest caveat: it is
exposed via 8 MCP `retro_*` tools, so this proves the *platform* doesn't read it, not that you don't.

### 17. Repo documentation is systematically stale

**measured.** `CLAUDE.md` says `pitches` is "7.4M+ rows" (actual **8,891,054**) and `players` is
"4,017" (actual **16,924**). `Soto/context/triton-context.md` describes an "8GB disk plan" while the
largest tables alone total **~32 GB**. Normal ingest lag is **2 days**, not 1.

Treat every number in the repo docs as stale until re-measured.

---

---

# Part 2 — Metric correctness (Li's domain)

These are not reliability failures. The pipeline ran; the numbers are wrong or unreproducible.

### M1. `league_averages` is a **mean**, documented everywhere as a median

**code-verified.** `scripts/create-refresh-league-averages.sql` computes `AVG(metric)` with
`STDDEV_SAMP` and contains **zero occurrences of `percentile_cont`**. The table's own column comment
says `'Mean of the metric across qualified players.'` `CLAUDE.md:114`, `docs/VARIABLES.md` §7 (L302,
L442), and Li's context doc all said "50th-percentile."

Two consequences: most baseball rate stats are right-skewed (barrel%, HR/FB, max velo), so
mean ≠ median and every above/below-average colouring is off in a **known direction**; and it is a
**mean of per-player ratios**, not a league rate — a 60-inning reliever weighs the same as a
200-inning starter.

**Two casing traps in the same table:** DDL is `CHECK (level IN ('MLB','MiLB'))` and
`CHECK (role IN ('hitter','SP','RP'))`; the glossary documents `mlb | milb` and `sp | rp | hitter`.
**A query written from the glossary returns zero rows with no error.** And
`scripts/create-league-averages.sql:9` still documents a superseded SP/RP rule.

### M2. There are three live Stuff+ baseline vintages, and the UI never says which it is showing

**code-verified.** (1) The per-night `pitch_baselines` vintage each row was originally scored
against; (2) the current vintage that Jun–Aug rows were rescored to on 2026-08-11; and (3)
**`BL_BY_YEAR` in `lib/leagueStats.ts:1006`** — a hardcoded in-source snapshot of per-year baselines
(`'4-Seam Fastball': { avg_velo: 93.13, std_velo: 2.84, … }`) used by `computeStuffRV()` with
nearest-year fallback, exported as `STUFF_ZSCORE_BASELINES = BL_BY_YEAR[2026]`.

Client-computed and DB-stored Stuff+ diverge whenever the live baseline drifts off that snapshot,
and nothing on any surface indicates which one is rendering.

### M3. The `[0,200]` clamp guards the wrong failure, and the real guard is missing

**inferred from code.** Binding the clamp requires `Σwᵢzᵢ = ±100` ≈ 16 composite SD (composite SD
≈ √(4.5²+3.5²+2.0²) ≈ 6.04 under independence) — unreachable for a genuinely populated cell. The
clamp can therefore only fire when a **baseline cell's σ collapses**, i.e. when the cell has almost
no pitches.

`pitch_baselines.pitch_count` is written (`app/api/update/route.ts:251`) and **never read** — the
scoring join has no minimum-n floor. One-line fix: `AND b.pitch_count >= 500`. The clamp is
providing false reassurance against a failure it cannot catch, while the failure it *should* catch
is unguarded.

### M4. `PARK_FACTORS` is a single frozen vintage applied to twelve seasons

**code-verified** (`lib/constants-data.ts:28`). Typed `Record<string, {...}>` — **keyed by team
only, no season** — commented *"5-year rolling, 2024 FanGraphs… they don't change dramatically
year-to-year."* Regressed and multi-year is correct in kind; frozen across 2015–2026 is not.
`SEASON_CONSTANTS`, fifteen lines above it in the same file, **is** keyed by season.

**It assigns the wrong physical ballpark to four teams:** `ATL` ≤2016 (Turner Field), `TEX` ≤2019
(open-air Globe Life), `ATH` 2025+ (Sacramento, inheriting the Coliseum's pitcher-friendly 96), `TB`
2025 (Steinbrenner Field, inheriting a domed Tropicana value).

Also: `/api/populate-park-factors` writes these same constants into `park_factors` for 2015–2025 —
**341 rows that look season-specific and carry no season information**. And `|| 100` appears at five
call sites as a silent neutral-park default for unmapped abbreviations.

### M5. A unit error in `/api/park-adjusted`

**code-verified** (`app/api/park-adjusted/route.ts:50`)

```ts
adj_xwoba: row.xwoba * (100 / pf.basic)
```

`pf.basic` is an **overall runs** factor; `xwoba` is a weighted on-base **rate**. Runs scale
superlinearly with on-base and slugging, so applying a run factor to a rate **overcorrects** — a
.340 xwOBA at a ~112 park becomes ~.304, a 10.7% move.

Wrong target as well as wrong units: xwOBA is derived from exit velocity and launch angle through a
league-wide table, so it is already largely park-neutral. By contrast `computeWRCPlus()` divides the
*run-value deviation* by the park factor, which is correct — the two implementations disagree.

### M6. Two incompatible σ grains share one namespace

**code-verified.** `pitch_baselines.std_*` is a **pitch-level** standard deviation.
`league_averages.stddev` is the SD of **player-season means** — a much smaller number. Nothing in
the schema or glossary distinguishes them, so an identical-looking z-score formula applied to the
second lands on a completely different scale.

### M7. Innings pitched is wrong three independent ways

**code-verified.** (a) `app/api/cron/player-stats/route.ts:88` does `parseFloat("62.1")` on a
**base-3** value meaning 62⅓ — every decimal computation off by up to 0.23 IP, always one
direction. (b) `METRICS.ip` uses an out-event allow-list over pitch rows; `IP_ESTIMATE_SQL` (the FIP
denominator) uses a deny-list over distinct PAs that also counts caught-stealing and pickoff outs —
**a pitcher's displayed IP is not the IP inside his displayed FIP**. (c)
`refresh_league_averages._ip` counts every out event **once**, so a triple play scores as 1 out and
double plays are undercounted — and this is the definition the `IP >= max(5, 0.20 × IP_leader)`
qualification floor is evaluated against.

Related unit bug: `calcTotalsFromRegistry`'s `case 'ip'` parses thirds notation
(`whole*3 + fractional`) while `METRICS.ip` emits decimal from `ROUND(outs/3, 1)`. Fed `"12.7"` it
returns **14.1 IP**.

### M8. Career rate stats are unweighted means of seasons

**code-verified.** `TotalsStrategy: 'avg'` is `sum / vals.length` across season rows, applied to
`ba`, `obp`, `slg`, `ops`, `whip`, `era`, `kPct`. A 12-pitch September counts equally with a
3,000-pitch season. Meanwhile `pivotTritonRows` is pitch-weighted — **two aggregation rules in one
platform**, which is how two surfaces disagree for defensible reasons.

### M9. Seven definition surfaces, two of them undocumented

**code-verified.** Beyond `docs/VARIABLES.md`, `lib/metricRegistry.ts` (**69** `MetricDef` entries,
not ~50), and `lib/glossary.ts`, two more carry definitions and appear **zero times** in
`VARIABLES.md`: `lib/pitcherStats.ts` (311 lines — where xFIP, SIERA, FPS%, csPct are computed) and
`lib/leaderboardColumns.ts` (229 `label:` sites, a `ColumnDef` type near-duplicating `MetricDef`).
Neither is in §0's trigger table, so editing them carries **no documentation obligation** under the
convention as written.

`getTip()` probes DB-keyed, label-keyed, and key-keyed maps in one flat chain, so **which definition
renders depends on the string the call site passes**. Deception/Unique have two contradictory
definitions and the registry version is unreachable wherever a `METRIC_TIPS` label exists.

**`stuff_plus` has no entry in `docs/VARIABLES.md` at all** — `grep -c` returns 0.

---

## Suggested order

1. **`ALTER FUNCTION` the three refresh functions** (P0 #1) — one statement each, unblocks 46 days of
   staleness across every plus-stat and every overlay.
2. **Wire `reportError` to Sentry** (#4) — nothing else can escalate until this exists.
3. **Fix the integrity suite's severity model** (#2) — turns an existing monitor from decorative into
   functional.
4. **`ALTER TABLE pitches` autovacuum overrides + one manual VACUUM ANALYZE** (#9, #10).
5. **Assert `errors = 0` and fix the `csv.length < 100` success case** (#5, #6) — two small edits.
6. **Drop the nine unused indexes** (#11) — ~31% less write amplification, buys ceiling headroom.
7. **Fix the unconditional upsert** (#8) — the largest remaining source of avoidable write load.
8. **`auto_explain` settings** (#12) — cheap, and the only forensic tool for the next slow-burn.

Items 1–5 are hours of work and address every mechanism behind the two known outages.
