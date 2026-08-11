---
title: PostgREST & Supabase Architecture — How Your Query Actually Executes
domain: postgres-performance
tags:
  - postgrest
  - supabase
  - authenticator
  - set-role
  - rpc
  - connection-pooling
  - rls-performance
  - statement-timeout
sources_reviewed: 25
last_updated: 2026-08-11
---

# PostgREST & Supabase Architecture — How Your Query Actually Executes

## TL;DR

- **PostgREST logs in as exactly one role — `authenticator` — then issues `SET LOCAL ROLE <jwt.role>` per request.** It is "a chameleon whose job is to 'become' other users to service authenticated HTTP requests." Anon page load or `service_role` cron write, every request starts as the same login role. (documented)
- **`SET ROLE` does not apply the target role's `ALTER ROLE … SET` config. Postgres says it verbatim: "`SET ROLE` does not process session variables as specified by the role's `ALTER ROLE` settings; this only happens during login."** (documented)
- **Therefore every `run_query`/`run_mutation` call is capped at 8 seconds and nothing client-side changes it.** Measured `pg_roles.rolconfig`: `authenticator` = `statement_timeout=8s, lock_timeout=8s`; `service_role` = **NULL**. Login sets 8s, `SET ROLE service_role` inherits nothing, 8s stands. Supabase's docs agree — `service_role` is "none (defaults to the `authenticator` role's 8s timeout if unset)." (measured + documented)
- **`supabaseAdminLong` (120 s, `lib/supabase-admin.ts:20`) is an `AbortSignal.timeout` on `fetch` — a client deadline with zero server effect.** Only `run_query_long`'s function-level `proconfig={statement_timeout=120s}` moves the ceiling. (measured)
- **Triton routes all DB access through three `SECURITY DEFINER` RPCs that `EXECUTE` arbitrary SQL text** — 111 `run_query`, 16 `run_mutation`, 19 `run_query_long` call sites. Defensible for this workload; it discards PostgREST's query builder, pagination, row cap, and RLS. (measured)
- **The hidden tax is `jsonb_agg`. `run_query` wraps your SQL in `SELECT jsonb_agg(row_to_json(t)) FROM (…) t`, materializing the whole result as one in-memory JSONB — and PostgREST then `json_agg`s that scalar again.** Warm on `pitches`: 5,000 rows × 90 cols = **849 ms** vs **11.9 ms** unwrapped, vs **33.4 ms** at 4 columns. At 10,000 wide rows it blew past 120 s and took the project's API offline. **Column count, not row count, kills you.** (measured)
- **PL/pgSQL `EXECUTE` never caches a plan: "the command is always planned each time the statement is run."** Planning `pitches` (29 indexes) measured **235–273 ms cold**, 1.8–6.2 ms warm — cold is 3% of the budget before a row is read, and cold is what a 09:00 UTC cron finds. (documented + measured)
- **`run_mutation` runs a failing mutation twice.** Its `EXCEPTION WHEN OTHERS` fallback re-issues `EXECUTE query_text`; the implicit subtransaction rolls attempt 1 back, so no double-write but double cost. Size chunks against 4 s. (inferred)
- **258 RLS policies in `public`; 170 call `auth.uid()`/`auth.jwt()`/`auth.role()`; exactly 0 wrap them in `(SELECT …)`.** Wrapping turns a per-row call into one `InitPlan`: measured 84.3 ms → 50.6 ms over 200k rows; Supabase's published cases run 179 ms → 9 ms and 178,000 ms → 12 ms. (measured + documented)
- **But RLS costs Triton's analytics nothing today, for an unflattering reason: `pitches` carries a `USING (true)` policy that ORs the `auth.uid()` one into oblivion.** Measured identical plans and 43.5 ms as both `authenticated` and `service_role`. Separately, `pitch_videos` has RLS enabled with **zero** policies — silent deny-all. (measured)
- **This is Micro-class compute: `max_connections=60`, `shared_buffers=256 MB`, `work_mem=3.5 MB`, `max_parallel_workers_per_gather=1`, cluster `statement_timeout=120 s`, PG 17.6.1.** A 9.7 GB table with 4.8 GB of indexes served from a 256 MB buffer cache. Half the "why is this slow" answers are that number. (measured)

---

## 1. The request lifecycle

```
fetch → Cloudflare → Kong (validates apikey) → PostgREST
      → a pooled Postgres session already logged in as `authenticator`
```

Every request is one transaction:

```sql
START TRANSACTION;                      -- READ ONLY for GET/HEAD, READ WRITE otherwise
SET LOCAL role = 'service_role';        -- from the JWT role claim
SET LOCAL request.jwt.claims = '{...}'; -- the verified payload, as JSON text
SELECT public.run_query($1);            -- "the main query"
COMMIT;
```

The main query is not what you wrote. Verbatim from this project's `auto_explain` log, 2026-08-11:

```sql
WITH pgrst_source AS (
  SELECT pgrst_call.pgrst_scalar
  FROM (SELECT $1 AS json_data) pgrst_payload,
  LATERAL (SELECT "query_text" FROM json_to_record(pgrst_payload.json_data)
             AS _("query_text" text) LIMIT 1) pgrst_body,
  LATERAL (SELECT "public"."run_query_long"("query_text" := pgrst_body."query_text")
             pgrst_scalar) pgrst_call)
SELECT …, coalesce(json_agg(_postgrest_t.pgrst_scalar)->0, 'null') AS body, …
FROM (SELECT … FROM "pgrst_source" … LIMIT $2 OFFSET $3) _postgrest_t
```

Three things fall out. **Your SQL arrives as a bind parameter (`$1`), never concatenated** — PostgREST is not an injection surface; the surface is inside `run_query`'s `EXECUTE`. **`LIMIT $2 OFFSET $3` applies to the outer one-row set**, which is mechanically why `db-max-rows` cannot cap a Triton query, and why `json_agg(...)->0` re-aggregates what `run_query` already aggregated. And **one transaction per HTTP request**, READ COMMITTED, all `SET LOCAL` — a chunked backfill loop in a Vercel route is N independent transactions, so each chunk must be individually idempotent.

PostgREST keeps its own pool (`db-pool`, default 10) of long-lived `authenticator` sessions, established at login — the only moment `rolconfig` is read — and caches the schema, so a new RPC returns `PGRST202` until `NOTIFY pgrst, 'reload schema'`.

---

## 2. The role chain, and the rule that defines this platform

### 2.1 The roles, measured (2026-08-11)

| role | `rolconfig` | login | BYPASSRLS |
|---|---|---|---|
| `authenticator` | `session_preload_libraries=safeupdate`, **`statement_timeout=8s`**, **`lock_timeout=8s`** | **yes** | no |
| `anon` | `statement_timeout=3s` | no | no |
| `authenticated` | `statement_timeout=8s` | no | no |
| **`service_role`** | **NULL** | no | **yes** |
| `postgres` | `search_path=…` | yes | yes |

Only `authenticator` can log in. Everything else is reached by `SET ROLE`.

### 2.2 The rule, and the proof

> **"SET ROLE does not process session variables as specified by the role's ALTER ROLE settings; this only happens during login."** — PostgreSQL, `SET ROLE`, Notes. `ALTER ROLE` repeats it: "This only happens at login time."

```
login as authenticator      → rolconfig applied → statement_timeout = 8s, lock_timeout = 8s
SET LOCAL ROLE anon         → NOT re-applied    → stays 8s  (not 3s)
SET LOCAL ROLE service_role → NOT re-applied    → stays 8s  (not unlimited)
```

Note the direction that surprises people: `anon`'s *stricter* 3s is also never applied. The `rolconfig` on `anon`/`authenticated`/`service_role` is inert for API traffic — it would apply only to a session logging in as that role, and none of them can log in.

Measured both directions. `service_role.rolconfig IS NULL`, so if `SET ROLE` re-applied config the timeout would reset:

```sql
BEGIN;
  SET LOCAL statement_timeout = '8s';
  SET LOCAL ROLE service_role;
  SELECT current_user, current_setting('statement_timeout');  --  service_role | 8s
COMMIT;

-- reverse: session at the cluster default of 2min, switching to `authenticated` (rolconfig 8s)
SET LOCAL ROLE authenticated;
SELECT current_setting('statement_timeout');                  --  2min
```

`SET ROLE` neither grants nor imposes `rolconfig`. It moves privileges only. (measured)

### 2.3 Where a timeout can actually live

| Lever | Value on Triton | Effective? |
|---|---|---|
| Cluster `postgresql.conf` | **120 s** | yes — outer cap |
| `authenticator` `rolconfig` | **8 s** | yes — at login, wins over cluster |
| Function `proconfig` | `run_query_long` = **120 s** | yes — on function entry |
| `AbortSignal.timeout` in `createAdminClient` | 30 s / 120 s | **no — client-side only** |

A function-level `SET` applies on entry and reverts on exit, independent of `SET ROLE`. That is the only sanctioned escape hatch here, and it is read-only by design — **there is deliberately no `run_mutation_long`.** The repo documents the trap twice: `app/api/admin/backfill-stuff-plus/route.ts:11-17` ("*supabaseAdminLong's 120s is a fetch timeout, not a DB one… ~8k rows/statement passes, ~11k times out*") and `app/api/cron/refresh/route.ts:56-58`. For the lock side of `lock_timeout=8s`, see `03-timeouts-locks-concurrency.md`.

### 2.4 JWT claims → `request.jwt.claims`

PostgREST verifies the JWT, reads the role from `jwt-role-claim-key` (default `.role`), and falls back to `db-anon-role` otherwise. Supabase's anon key carries `"role": "anon"`, the service key `"role": "service_role"`. The payload lands in a transaction-scoped setting, and `auth.uid()` is a thin wrapper over it — expanding to two `current_setting` calls, a `NULLIF`, a `jsonb ->>` and a cast (see the plan filter in §5.1). Cheap once; not cheap 8.9M times.

Triton's RPCs are `SECURITY DEFINER` owned by `postgres`, so `current_user` inside them is `postgres` and the JWT identity is never consulted for authorization. The `EXECUTE` grant is the entire control.

---

## 3. RPC, and why Triton lives inside it

### 3.1 The three functions

| function | `proconfig` | SECDEF | owner | EXECUTE granted to |
|---|---|---|---|---|
| `run_query(text)` | `search_path=public, extensions` | yes | `postgres` | `service_role` only |
| `run_mutation(text)` | `search_path=public, extensions` | yes | `postgres` | `service_role` only |
| `run_query_long(text)` | **`statement_timeout=120s`**, `search_path=…` | yes | `postgres` | `service_role` only |

All three are PL/pgSQL, `VOLATILE`, `PARALLEL UNSAFE`. `anon` and `authenticated` have **no** EXECUTE privilege on any of them, verified with `has_function_privilege()`. That is the load-bearing security control, and it is correct.

```plpgsql
-- run_query / run_query_long
IF NOT (LOWER(BTRIM(query_text)) LIKE 'select%' OR LOWER(BTRIM(query_text)) LIKE 'with%')
  THEN RAISE EXCEPTION 'Only SELECT queries are allowed'; END IF;
EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_text || ') t' INTO result;

-- run_mutation: guard on insert%|update%|delete%, then
BEGIN
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || query_text || ') t' INTO result;
EXCEPTION WHEN OTHERS THEN
  EXECUTE query_text;          -- ← the whole mutation, again
END;
```

### 3.2 What the architecture buys and costs

PostgREST's builder is for CRUD over tables and views; Triton's workload is cross-player aggregation over an 8.9M-row wide table — window functions, CTEs, percentile aggregates — which is not awkward as `?select=…&order=…`, it is impossible. The alternatives were a materialized view per report shape, dozens of purpose-built RPCs each needing a schema-cache reload, or a direct pool from Vercel (§4). A generic SQL-text RPC locked to `service_role` is a reasonable trade.

| Given up | Consequence |
|---|---|
| RLS | `SECURITY DEFINER` + owner `postgres` (BYPASSRLS) → policies never evaluated. Authz lives in the Next.js routes. |
| `db-max-rows` | No server-side cap; PostgREST's `LIMIT` lands outside your rows (§1). |
| Streaming, `Range`, `count=exact` | One scalar JSONB — no pagination headers, no partial delivery. |
| Plan caching | `EXECUTE` re-plans every call (§3.4). |
| `EXPLAIN` | Matches neither `select%` nor `with%`. **You cannot get a plan through your own data path.** |

Papercut: **a trailing semicolon breaks `run_query`** — `SELECT … FROM (SELECT …;) t` is a syntax error, and `BTRIM` strips whitespace, not `;`.

### 3.3 Measured: the `jsonb_agg` tax

All warm (`Buffers: shared hit` only), `pitches`, `game_date >= '2026-08-01'`:

| Shape | Rows | Execution |
|---|---|---|
| `count(*)` over `SELECT *` (90 cols) | 5,000 | **11.9 ms** |
| `jsonb_agg(row_to_json(t))` over `SELECT *` (90 cols) | 5,000 | **849 ms** |
| `jsonb_agg(row_to_json(t))` over 4 columns | 5,000 | **33.4 ms** |
| `jsonb_agg(row_to_json(t))` over `SELECT *` | 10,000 | **> 120 s — aborted** |
| `jsonb_agg(row_to_json(t))` over `SELECT *` | 20,000 | **> 120 s — aborted twice** |

```
Aggregate  (actual time=841.132..841.135 rows=1 loops=1)            ← the wrapper
  ->  Subquery Scan on t  (actual time=0.088..29.752 rows=5000)
        ->  Limit  (actual time=0.057..12.373 rows=5000)            ← the actual query
```

The scan finished in 12 ms; the remaining **~810 ms is pure JSONB construction**. At 4 columns the same 5,000 rows cost 21 ms of serialization instead of 810.

The 10k/20k rows matter most: doubling 5,000 → 10,000 wide rows is 2× the work and **>140×** the time. The mechanism is memory — `jsonb_agg` builds one contiguous value, `work_mem` is **3.5 MB**, RAM is Micro-class. During those attempts the REST endpoint returned Cloudflare **522** for several minutes and the Postgres log shows **15 `canceling statement due to statement timeout`** errors hitting unrelated app traffic. I caused a brief production outage with two read-only `EXPLAIN ANALYZE` statements.

**Rule: never `SELECT *` from `pitches` through `run_query`. Project your columns. The 8s timeout will not save you, because `jsonb_agg` degrades non-linearly before it degrades gracefully.**

### 3.4 `EXECUTE` never caches a plan; `run_mutation` does the work twice

> "there is no plan caching for commands executed via `EXECUTE`. Instead, the command is always planned each time the statement is run." — PostgreSQL, PL/pgSQL Statements

Planning a trivial `count(*)` on `pitches` (29 indexes) measured **273 ms and 235 ms** cold (`Planning: Buffers: shared hit=588 read=73`), **1.8–6.2 ms** warm. All 111 `run_query` call sites pay it.

`run_mutation`'s exception fallback exists for mutations without `RETURNING` — `SELECT … FROM (UPDATE …) t` is a syntax error, so attempt 1 fails instantly and the retry is the real execution. The bad case is a mutation *with* `RETURNING` that fails for a real reason (constraint violation, or `57014 query_canceled` at 8 s): attempt 1 runs the full UPDATE, fails, rolls back to the exception block's implicit subtransaction savepoint, and attempt 2 runs the **same UPDATE again**. No double-write, but double cost, and the caller sees attempt 2's error. **Size `run_mutation` chunks against 4 s.**

Three things I have not proven, all cheap to test:

- Whether a caught `statement_timeout` re-arms for the second `EXECUTE`. *(verify)*
- **Parallel query is probably unavailable through `run_query`** — `EXECUTE … INTO` runs via SPI with a row limit, and `max_parallel_workers_per_gather` is **1** regardless. *(inferred — verify)*
- **A data-modifying CTE passes the `like 'with%'` guard.** It should still fail (Postgres requires such CTEs at top level, and the wrapper demotes the query to a subquery; `safeupdate` also demands a `WHERE`) — but the *guard* is not what stops it. Test: `WITH x AS (DELETE FROM players WHERE false RETURNING id) SELECT count(*) FROM x`. I attempted this and the database was still recovering from §3.3. *(inferred — verify)*

---

## 4. Connection pooling

| Path | Port | Mode | Notes |
|---|---|---|---|
| Direct Postgres | 5432 | session | IPv6 unless the IPv4 add-on is bought. Migrations, `pg_dump`. |
| Supavisor pooler | 5432 | **session** | IPv4-only. Prepared statements work. |
| Supavisor pooler | **6543** | **transaction** | IPv4-only. Connection returned per transaction; idle closed at 5 min. **No prepared statements.** |
| PostgREST | 443 | n/a | What `supabase-js` uses. Holds its own `authenticator` pool. |

Supavisor is Supabase's Elixir replacement for PgBouncer — "a scalable and cloud-native Postgres connection pooler that can handle millions of connections," ~90% of PgBouncer's throughput, with named prepared statements in 1.0.

**What breaks in transaction mode** — PgBouncer marks these "Never" compatible, and it generalizes: `SET`/`RESET`, `PREPARE`/`DEALLOCATE`, `LISTEN`/`NOTIFY`, `WITH HOLD` cursors, **session-level advisory locks**, `PRESERVE`/`DELETE ROWS` temp tables, `LOAD`. PostgREST's guidance matches — `db-prepared-statements = false`, `db-channel-enabled = false` — and it adds bluntly that "It's not recommended to use an external connection pooler."

App traffic goes through PostgREST and is unaffected; anything opening a direct connection (`scripts/*.ts`, `pg_dump`, psql) is not. Two hazards for this repo: **session-level advisory locks silently don't hold**, so a backfill script guarding against concurrent runs must use `pg_advisory_xact_lock()`; and **`SET statement_timeout` from a script won't stick** across statements — use `SET LOCAL` inside an explicit transaction, or function-level `proconfig`. Budget note: `max_connections = 60`, PostgREST's `db-pool` defaults to 10, and Supabase advises capping the pooler near 40% of max connections when leaning on PostgREST.

---

## 5. RLS and what it costs the planner

### 5.1 The `(SELECT auth.uid())` optimization

RLS policies inline as `WHERE` quals, and a `STABLE`/`VOLATILE` function in a qual is re-evaluated **per row** unless hoisted. Wrapping it in a scalar subquery makes the planner emit an `InitPlan`, evaluated once per statement. Measured here over 200,000 rows:

```sql
… WHERE g::text = auth.uid()::text;
--   Filter: ((g)::text = ((COALESCE(NULLIF(current_setting('request.jwt.claim.sub'…
--   Rows Removed by Filter: 200000      Execution Time: 84.343 ms

… WHERE g::text = (SELECT auth.uid())::text;
--   InitPlan 1  ->  Result  (actual time=0.014..0.014 rows=1 loops=1)
--   Filter: ((g)::text = ((InitPlan 1).col1)::text)   Execution Time: 50.633 ms
```

1.67× on a synthetic case. Supabase's published benchmarks swing far harder because their policies call heavier helpers: `auth.uid()=user_id` 179 → 9 ms; `is_admin() OR auth.uid()=user_id` **11,000 → 10 ms**; `has_role()=role` **178,000 → 12 ms**. The more expensive the helper, the more per-row evaluation dominates.

Note the subtler effect: the row estimate moved from `rows=1` to `rows=1000`. An `InitPlan` gives the planner a parameter to estimate against; an opaque volatile function does not. **Wrapping changes plan shape, not just per-row cost.**

Supabase's `auth_rls_initplan` lint flags exactly this. Other documented levers, by value: index the policy column (171 → <0.1 ms), add `TO authenticated` (170 → <0.1 ms — the policy is skipped entirely for `anon`), duplicate the filter client-side (171 → 9 ms), reverse the join direction (9,000 → 20 ms).

### 5.2 Triton's actual posture, measured

258 policies in `public`; **170** reference `auth.uid()`/`auth.jwt()`/`auth.role()`; **0** wrap them in `(SELECT …)`. Every one is an `auth_rls_initplan` finding.

**And yet it costs the analytics path nothing, for an uncomfortable reason.** `pitches` carries two permissive SELECT policies, neither with a `TO` clause (both apply to `PUBLIC`): `Allow public read access` — `USING (true)`, and `pitches_select_authenticated` — `USING (auth.uid() IS NOT NULL)`. Permissive policies are OR'd; `true OR anything` constant-folds to `true` and the `auth.uid()` call vanishes at plan time:

| Role | Plan | Execution |
|---|---|---|
| `authenticated` (policies apply) | Index Only Scan `idx_pitches_game_date` | **43.619 ms** |
| `service_role` (BYPASSRLS) | Index Only Scan `idx_pitches_game_date` | **43.465 ms** |

Same on `players` and `milb_pitches`. The correct statement is not "RLS is expensive here" — it is **"RLS is not doing anything here."** The public-read policy makes the authenticated policy dead code, and every analytics query runs as `service_role` through `run_query` anyway, bypassing RLS entirely.

The 170 unwrapped policies *will* matter on the per-user surface: `profiles`, `work_tasks`, `athlete_profiles`, `conversations`, `compete_pitches`. `compete_pitches` is the one to watch — it grows per TrackMan upload and the front-end reads it under `authenticated`'s 8s ceiling.

Live defect found while measuring: **`pitch_videos` (1.48M rows) has RLS enabled and zero policies** — deny-all for `anon` and `authenticated` despite a `SELECT` grant. It works today only because the app reads it as `service_role`. Supabase's `rls_enabled_no_policy` lint flags it.

---

## 6. `safeupdate`, cluster settings, and plan limits

`authenticator` carries `session_preload_libraries = safeupdate`. `pg-safeupdate` raises `ERROR: UPDATE requires a WHERE clause` on any `UPDATE`/`DELETE` without one, and it intercepts modifications inside CTEs; escapes are `WHERE 1=1` or `SET safeupdate.enabled = 0`. So **every statement passed to `run_mutation` must have a `WHERE` clause** — and since `session_preload_libraries` "only takes effect at the start of the connection" and is superuser-only, you cannot disable it from inside a PostgREST request. One subtlety: cluster-wide `session_preload_libraries` is `supautils`, but `authenticator`'s role-level setting is `safeupdate`, and `ALTER ROLE … SET` *replaces* rather than appends — so `authenticator` sessions may not load `supautils`. Whether Supabase compensates via `shared_preload_libraries` I could not confirm. *(verify)*

Cluster settings and compute tiers, measured 2026-08-11:

| Setting | Value | | Instance | Memory | Direct conns | Max disk |
|---|---|---|---|---|---|---|
| `max_connections` | **60** | | Nano (free) | 0.5 GB | 60 | 500 MB |
| `statement_timeout` | 120 s | | **Micro** | **1 GB** | **60** | **10 GB** |
| `shared_buffers` | **256 MB** | | Small | 2 GB | 90 | 50 GB |
| `work_mem` | **3500 kB** | | Medium | 4 GB | 120 | 100 GB |
| `max_parallel_workers_per_gather` | **1** | | Large | 8 GB | 160 | 200 GB |
| `lock_timeout` (cluster) | 0 | | XL | 16 GB | 240 | 500 GB |
| version | 17.6.1 | | | | | |

Postgres calls setting `statement_timeout` in `postgresql.conf` "not recommended because it would affect all sessions"; Supabase does it as a platform safety net, which is why `postgres` (no `rolconfig` timeout) lands at 120 s rather than unlimited. **`auto_explain` is enabled on this project** — slow queries land in the Postgres log with full plans, which is how §1's generated SQL was captured. Nothing in this repo reads that log.

`max_connections = 60` and `shared_buffers = 256 MB` put Triton at **Micro or Nano**; `max_connections` alone does not distinguish them *(verify from the dashboard)*. The context doc's "8GB plan" note refers to disk and does not add up — `pitches` alone is 9.7 GB and `retro_events` is 19 GB, both above Micro's 10 GB ceiling. **Resolving the actual compute and disk add-on is the most important open question in `triton-context.md`.**

Why compute size dominates: `shared_buffers = 256 MB` against ~30 GB of hot tables means the working set does not fit — the same 5,000-row scan measured **1,118 ms cold** (`read=1452 written=141`) and **11.9 ms warm**, 94× purely from cache residency. `work_mem = 3.5 MB` makes sorts and hash aggregates spill early, so a large `GROUP BY` fails long before it should. `max_parallel_workers_per_gather = 1` caps a parallel plan at two processes; parallelism will not rescue an 8s budget.

---

## 7. What Triton should do, in order

1. **Add a `run_mutation_long` — gated.** The asymmetry (120 s reads, 8 s writes) directly caused both the Stuff+ outage and the backfill route that never worked. `SECURITY DEFINER`, `proconfig={statement_timeout=60s}`, `EXECUTE` to `service_role` only, same guard. **60 s, not 120 s** — long writes hold locks and generate dead tuples on a table with 29 indexes (`05-vacuum-autovacuum-bloat.md`). Keep normal writes on `run_mutation` so the 8s cap keeps enforcing chunking.
2. **Ban `SELECT *` through `run_query` on `pitches`, `milb_pitches`, `retro_events`.** Highest value per unit of effort: projecting 90 columns to 4 cut serialization from 810 ms to 21 ms per 5,000 rows, and it separates "slow query" from "522, project offline." A CI regex check would do it.
3. **Record per-RPC `duration_ms` in `trackCronRun` and alert above 4 s.** The saturation signal from `data-reliability/01` — the only monitor that would have *predicted* the Stuff+ outage instead of detecting it 90 days late. `auto_explain` output is already in the Postgres log and nothing reads it.
4. **Fix `pitch_videos`: RLS enabled, zero policies.** Add an explicit policy or document it as service-role-only. Silent deny-all surfaces the day someone writes a client-side query.
5. **Wrap `auth.uid()` in `(SELECT auth.uid())` — only where the policy isn't already dead code.** Start with `compete_pitches`, `work_tasks`, `profiles`, `athlete_profiles`, `conversations`; add `TO authenticated` while you're there. **Skip `pitches`/`players`/`milb_pitches`** — their `USING (true)` siblings erase the auth call at plan time, so the change is pure churn.
6. **Resolve the compute-size question and write it into `triton-context.md`.** 256 MB of buffer cache for a 30 GB working set is likely the largest single lever available, and it costs money rather than engineering time. Measure the cache hit ratio first (`10-monitoring-postgres.md`).
7. **Run the three `(verify)` tests in §3.4**, and **document `NOTIFY pgrst, 'reload schema'`** wherever a migration adds or alters a function — every new RPC 404s until it runs.

**Anti-recommendation: do not migrate off the `run_query` architecture onto PostgREST's native query builder or a direct Postgres connection pool.** It would restore RLS, streaming, `db-max-rows`, and plan caching, and it is still the wrong trade. PostgREST's builder cannot express Triton's aggregations, so migrating means dozens of purpose-built RPCs each needing a schema-cache reload, in a codebase that changes daily. A direct pool from Vercel reintroduces connection storms against `max_connections = 60`, IPv4/IPv6 add-on decisions, and transaction-mode incompatibilities — trading a well-understood 8s ceiling for a class of failures nobody here has debugged. The architecture's three real costs are all *mitigable in place*: authorization already lives in the Next.js routes, re-planning is single-digit milliseconds warm, and the JSONB tax is fixed by projecting columns. **Fix the column projection, add `run_mutation_long`, leave the architecture alone.**

---

## Sources

1. PostgREST — [Authentication](https://docs.postgrest.org/en/v13/references/auth.html) — authenticator "chameleon", `SET LOCAL ROLE`, `jwt-role-claim-key`.
2. PostgREST — [Transactions](https://docs.postgrest.org/en/v13/references/transactions.html) — per-request transaction, access mode by verb, READ COMMITTED.
3. PostgREST — [Functions as RPC](https://docs.postgrest.org/en/v13/references/api/functions.html) — `/rpc/` routing, POST vs GET, schema-cache requirement.
4. PostgREST — [Connection Pool](https://docs.postgrest.org/en/v13/references/connection_pool.html) — `db-pool`, 504 on acquisition timeout, transaction-pooling requirements.
5. PostgREST — [Configuration](https://docs.postgrest.org/en/v13/references/configuration.html) — defaults for `db-pool`, `db-max-rows`, `db-tx-end`.
6. PostgREST — [Schema Cache](https://docs.postgrest.org/en/v13/references/schema_cache.html) — staleness, `NOTIFY pgrst, 'reload schema'`.
7. PostgREST — [Database Authorization](https://docs.postgrest.org/en/v13/explanations/db_authz.html) — authz in the DB, `SECURITY DEFINER` semantics.
8. PostgreSQL 17 — [SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html) — **the load-bearing quote**; forbidden inside `SECURITY DEFINER`.
9. PostgreSQL 17 — [ALTER ROLE](https://www.postgresql.org/docs/current/sql-alterrole.html) — settings apply at login only; precedence order.
10. PostgreSQL 17 — [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — `statement_timeout`, `lock_timeout`, `session_preload_libraries`.
11. PostgreSQL 17 — [PL/pgSQL Statements](https://www.postgresql.org/docs/current/plpgsql-statements.html) — **no plan caching for `EXECUTE`**.
12. Supabase — [Postgres Roles](https://supabase.com/docs/guides/database/postgres/roles) — authenticator and service_role definitions.
13. Supabase — [Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) — **per-role defaults; service_role inherits authenticator's 8s**.
14. Supabase — [Connecting to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) — ports 5432/6543, IPv4/IPv6, prepared statements.
15. Supabase — [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI) — transaction vs session mode, 5-minute idle close.
16. Supabase — [Connection Management](https://supabase.com/docs/guides/database/connection-management) — pooler sizing vs max connections.
17. Supabase — [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk) — the instance table in §6.
18. Supabase — [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — initPlan explanation, `TO` behaviour.
19. Supabase — [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — the benchmark set in §5.1.
20. Supabase — [Database Advisors](https://supabase.com/docs/guides/database/database-advisors) — `auth_rls_initplan`, `rls_enabled_no_policy`.
21. Supabase splinter — [0003_auth_rls_initplan](https://supabase.github.io/splinter/0003_auth_rls_initplan/) — per-row helper evaluation, remediation SQL.
22. Supabase — [Serverless APIs](https://supabase.com/docs/guides/api) — PostgREST as "a thin API layer on top of Postgres."
23. Supabase — [Supavisor 1.0](https://supabase.com/blog/supavisor-postgres-connection-pooler) — Elixir + Rust, ~90% of PgBouncer throughput.
24. PgBouncer — [Features](https://www.pgbouncer.org/features.html) — pooling modes, transaction-mode "Never" list.
25. eradman — [pg-safeupdate](https://github.com/eradman/pg-safeupdate) — WHERE-clause error, `safeupdate.enabled`, CTE interception.

**Triton-internal evidence (measured 2026-08-11, project `xgzxfsqwtemlcosglhzr`, PG 17.6.1):** `pg_roles.rolconfig`; `pg_proc` metadata and source for the three RPCs; `has_function_privilege()`; the two-direction `SET ROLE`/`statement_timeout` experiment; `EXPLAIN (ANALYZE, BUFFERS)` A/B on `pitches` (`count(*)` vs `jsonb_agg` at 90 and 4 columns, 5k/10k/20k rows) plus the resulting Cloudflare 522 and 15 logged statement-timeout cancellations; the `generate_series(1,200000)` initPlan A/B; `pg_policy` census (258/170/0) and `pitches`/`pitch_videos` policy listings; `pg_settings`; PostgREST's generated `pgrst_source` SQL from `auto_explain`. Repo: `lib/supabase-admin.ts:3-20`; `app/api/admin/backfill-stuff-plus/route.ts:11-17`; `app/api/cron/refresh/route.ts:56-58`; call-site counts via `grep -rn` over `app/ lib/ scripts/ components/`.
