---
title: Timeouts, Locks, and Concurrency — The 8-Second Ceiling and What Blocks What
domain: postgres-performance
tags:
  - statement-timeout
  - lock-timeout
  - role-configuration
  - set-role
  - locking
  - ddl-safety
  - mvcc
  - deadlocks
sources_reviewed: 24
last_updated: 2026-08-11
---

# Timeouts, Locks, and Concurrency — The 8-Second Ceiling and What Blocks What

> The constraint that defines this platform. `04-bulk-write-patterns.md` exists because of §3.
> Read §2 and §3 before touching a write path.

## TL;DR

- **Every `run_query`/`run_mutation` call from Triton app code is hard-capped at 8 seconds of server-side execution.** The cap is `authenticator`'s `statement_timeout`, applied at login, and it survives PostgREST's `SET ROLE service_role`. `supabaseAdminLong`'s "120s" is an `AbortSignal.timeout` on `fetch` — when Node stops waiting, not when Postgres stops working. (measured, 2026-08-11)
- **The mechanism is one sentence of Postgres docs:** *"`SET ROLE` does not process session variables as specified by the role's `ALTER ROLE` settings; this only happens during login."* `service_role`'s `rolconfig` is NULL anyway. (documented)
- **The escape hatch is function-level config, and the obvious explanation of why it works is wrong.** Postgres won't re-arm a running statement's timer from a function's `SET` clause; `run_query_long`'s 120s works only because **PostgREST hoists** `proconfig` into a transaction-scoped `SET LOCAL`. (documented)
- **There is deliberately no `run_mutation_long`, so the whole write path is capped at 8s** — forcing chunking instead of two-minute lock-and-bloat events on `pitches`. (measured + inferred)
- **A ~12k-row `UPDATE` on `pitches` crossed the cap and silently zeroed Stuff+ coverage for three months.** On the live table (8.89M rows, 29 indexes, 4.8 GB of index) ~8k rows passes and ~11k times out; the fix was per-day chunking at ~4k rows / ~1.4s. (measured)
- **Cost is superlinear in statement size — never size a chunk by extrapolating from a small test.** ~4k rows runs at ~2,900 rows/s; ~8k rows at ~1,000 rows/s. (measured; mechanism inferred)
- **`lock_timeout` equal to `statement_timeout` is dead configuration** — *"the statement timeout would always trigger first"* — and `authenticator` has both at 8s. Its real use is DDL, because **`ACCESS EXCLUSIVE` causes outages through the queue behind it**. (documented)
- **Deadlocks are detected but never prevented, and detection waits a full `deadlock_timeout` (1s); long transactions pin the xmin horizon,** blocking VACUUM database-wide. Script connections have no 8s cap. (documented + inferred)

---

## 1. The three timeouts that matter

All are `USERSET` GUCs, all default to **0 (disabled)**, all take milliseconds when unitless. PG 17 adds `transaction_timeout` (`25P04`); `idle_session_timeout` covers idling outside a transaction.

| Setting | Aborts | Clock starts | SQLSTATE |
|---|---|---|---|
| `statement_timeout` | the statement | when the command **arrives at the server** | `57014` `query_canceled` |
| `lock_timeout` | a statement **waiting for a lock** | each lock acquisition attempt, separately | `55P03` `lock_not_available` |
| `idle_in_transaction_session_timeout` | the **session** | backend idle inside an open txn | `25P03` |

`statement_timeout` is *"measured from the time a command arrives at the server until it is completed"* — so **planning time counts**, and **the timer is armed once, at command start**. Nothing later re-arms it; that is why §3.3 exists.

`lock_timeout` is not a smaller `statement_timeout`: *"if `statement_timeout` is nonzero, it is rather pointless to set `lock_timeout` to the same or larger value, since the statement timeout would always trigger first."* Useful values sit far below it (PostgresAI `50ms`, Citus `2s`), and the job differs — make blocked DDL fail fast and leave the queue (§5.1). The idle timeout exists for bloat: *"an open transaction prevents vacuuming away recently-dead tuples."*

---

## 2. Where these settings live, and how they are inherited

The section people skip and then misdiagnose an outage.

| Scope | How you set it | When it takes effect | Beaten by |
|---|---|---|---|
| Server-wide | `postgresql.conf` / `ALTER SYSTEM`; `postgres -c` | new sessions / server start | everything below |
| Per-database | `ALTER DATABASE d SET x` | **fresh session only** | role, role-in-db, session |
| Per-role, all DBs | `ALTER ROLE r SET x` | **login only** | role-in-db, connection, session |
| Per-role in one DB | `ALTER ROLE r IN DATABASE d SET x` | **login only** | connection, session |
| Per-connection | `PGOPTIONS` / `options=` | connection | session |
| Per-session | `SET x = v` | immediately | `SET LOCAL`, function-local |
| Per-transaction | `SET LOCAL x = v` | immediately, reverts at commit | function-local |
| Per-function | `ALTER FUNCTION f SET x` (`pg_proc.proconfig`) | function **entry**, restored on exit | — |

Precedence, from `ALTER ROLE`: *"database-role-specific settings override role-specific ones, which in turn override database-specific ones."* Timing, from *Setting Parameters*: *"Values set with `ALTER DATABASE` and `ALTER ROLE` are applied only when starting a fresh database session."* **That phrase is load-bearing** — role config is a snapshot taken at login, not a live property of whoever you are currently acting as.

### 2.1 `SET ROLE` does not re-apply role config

`SET ROLE` changes **who you are for permission checks** and nothing else — it sets `current_user`; `session_user` is unchanged. From the Notes section, without qualification:

> "`SET ROLE` does not process session variables as specified by the role's `ALTER ROLE` settings; this only happens during login."

`ALTER ROLE` says it from the other side: *"This only happens at login time; executing `SET ROLE` or `SET SESSION AUTHORIZATION` does not cause new configuration values to be set."*

So in a session that logged in as A then did `SET ROLE B`, `statement_timeout` is **A's** — B's `rolconfig` is ignored if present, and absent if not. Both paths land on the same answer for Triton.

### 2.2 Function-level config (`proconfig`)

`ALTER FUNCTION f SET x = v` stores the setting in `pg_proc.proconfig`, applied on entry and restored on exit — the standard way to pin `search_path` on `SECURITY DEFINER` functions, as Triton does for all three RPCs in `scripts/fix-security-advisories.sql:206-213`. **For `statement_timeout` there is a trap: §3.3.**

---

## 3. The Triton 8-second ceiling, end to end

### 3.1 What is actually configured (measured 2026-08-11)

Verified against `pg_roles.rolconfig` and `pg_proc.proconfig`:

| Role | `rolconfig` | Function | `proconfig` |
|---|---|---|---|
| `authenticator` | `statement_timeout=8s`, `lock_timeout=8s`, `session_preload_libraries=safeupdate` | `run_query` | `search_path` only |
| `authenticated` | `statement_timeout=8s` | `run_mutation` | `search_path` only |
| `anon` | `statement_timeout=3s` | `run_query_long` | `search_path`, **`statement_timeout=120s`** |
| `service_role` | **NULL — no override at all** | | |

Supabase's own docs state the consequence outright: `service_role` is *"none (defaults to the `authenticator` role's 8s timeout if unset)."*

### 3.2 The request path

```
Next.js route → supabaseAdmin.rpc('run_query', {...})
                  fetch(..., { signal: AbortSignal.timeout(30000) })  ← CLIENT-SIDE ONLY
              → PostgREST, pooled connection opened as `authenticator`
                  ▸ at LOGIN Postgres applied authenticator.rolconfig → 8s
                  ▸ BEGIN;
                      SET LOCAL ROLE service_role;  -- current_user only; no rolconfig re-applied
                      -- hoist impersonated-role settings: service_role.rolconfig IS NULL
                      -- hoist callee-function settings: run_query has only search_path
                      SELECT * FROM run_query($1);  -- timer armed at 8s when this arrived
                    COMMIT;
```

PostgREST documents the split precisely: *"PostgreSQL applies the connection role (`authenticator`) settings. Additionally, PostgREST applies the impersonated roles settings as transaction-scoped settings."* PostgREST therefore *does* compensate for `SET ROLE`'s blindness by re-issuing the impersonated role's settings as `SET LOCAL` — it simply has nothing to compensate with here. Both paths converge on 8s. **Every `run_query`/`run_mutation` call from app code gets 8 seconds.** (measured)

### 3.3 Why `run_query_long`'s 120s works — and why the obvious explanation is wrong

"The function sets `statement_timeout=120s`, so Postgres uses 120s" is not how Postgres behaves. Tom Lane, on `SET LOCAL statement_timeout` inside a procedure:

> "Not usefully. `statement_timeout` bounds the time spent for a single command sent by the client. So by the time you're inside a procedure, the countdown is already running (or not) for the current command, and it's too late to change it with effect for that command."

The timer for `SELECT * FROM run_query_long($1)` is armed at 8s the instant that command arrives; entering the function does not re-arm it. It works because **PostgREST hoists function settings into the transaction** before the main query: *"PostgREST can 'hoist' function settings to transaction-scoped settings. This allows functions settings to override the impersonated and connection role settings"* — caveat, *"Only the settings in `db-hoisted-tx-settings` will be hoisted."* Effective sequence: `BEGIN; SET LOCAL ROLE service_role; SET LOCAL statement_timeout='120s'; SELECT …`. (documented)

So `run_query_long` is long **only over PostgREST**; from `psql` it gets the caller's session timeout. And if `db-hoisted-tx-settings` ever drops `statement_timeout`, it silently reverts to 8s — un-monitored today. (inferred)

### 3.4 No long write variant, and the failure that proved why

`run_query_long` exists; **`run_mutation_long` does not**, deliberately: on `pitches` (8.89M rows, 29 indexes, 4.8 GB of index — ≈50% of the 9.7 GB total) a 120s write budget lets one statement hold `ROW EXCLUSIVE` and dirty index pages for two minutes, then still fail after partial work that rolls back invisibly.

The 2026 Stuff+ outage is what ignoring the cap looks like: `applyStuffPlusForDateRange` issued **one** `UPDATE` across the ingest's full 3-day window, it crossed 8s as 2026 data grew, the error was caught and discarded, the cron returned 200, and `stuff_plus` coverage decayed Apr 99.5% → Aug 0%.

| Statement size (`pitches` 2026, 29 indexes) | Result | Rate |
|---|---|---|
| ~4,000 (one game day) | **~1.4s**, passes | ~2,900 rows/s |
| ~8,000 | passes, near the ceiling | ~1,000 rows/s |
| ~11,000 | **`57014` — canceling statement due to statement timeout** | — |
| ~12,000 (the old 3-day window) | timed out every night from ~June | — |

Doubling statement size more than doubles cost, because larger statements touch more distinct index pages across 29 indexes and buffer locality collapses (mechanism inferred). The fix (`app/api/update/route.ts:306-352`) is one statement per day with failures collected and reported rather than swallowed; three days now completes in ~4.2s. **Budget rule: size every statement to finish in ≤2s — 25% of the ceiling.** A statement at 7.5s is not passing, it is **pre-failing**.

---

## 4. Lock modes and the conflict matrix

Eight table-level modes; the names mislead — `ROW EXCLUSIVE` is a *table* lock. X = conflict.

| Mode — acquired by | AS | RS | RX | SUE | S | SRE | EX | AE |
|---|---|---|---|---|---|---|---|---|
| **ACCESS SHARE** — `SELECT` | | | | | | | | X |
| **ROW SHARE** — `SELECT … FOR UPDATE` | | | | | | | X | X |
| **ROW EXCLUSIVE** — `INSERT`/`UPDATE`/`DELETE` | | | | | X | X | X | X |
| **SHARE UPDATE EXCLUSIVE** — `VACUUM`, `ANALYZE`, `CREATE INDEX CONCURRENTLY` | | | | X | X | X | X | X |
| **SHARE** — `CREATE INDEX` | | | X | X | | X | X | X |
| **SHARE ROW EXCLUSIVE** — `CREATE TRIGGER`, `ADD FOREIGN KEY` | | | X | X | X | X | X | X |
| **EXCLUSIVE** — `REFRESH MATVIEW CONCURRENTLY` | | X | X | X | X | X | X | X |
| **ACCESS EXCLUSIVE** — `DROP`, `TRUNCATE`, `REINDEX`, `VACUUM FULL`, most `ALTER TABLE` | X | X | X | X | X | X | X | X |

**`ROW EXCLUSIVE` does not conflict with itself**, so chunked writes over disjoint date ranges are genuinely parallel; **`SHARE UPDATE EXCLUSIVE` does**, so on `pitches` a `CREATE INDEX CONCURRENTLY` sits behind autovacuum and vice versa. Every lock is held until end of transaction.

---

## 5. DDL: what takes `ACCESS EXCLUSIVE`, and for how long

> "An `ACCESS EXCLUSIVE` lock is acquired unless explicitly noted." — `ALTER TABLE`, Notes

The exceptions are the interesting part, because they are the safe operations.

| Operation | Lock | Scans/rewrites? | Duration |
|---|---|---|---|
| `ADD COLUMN` nullable, no default or **non-volatile** default | `ACCESS EXCLUSIVE` | **no** — catalog only | milliseconds |
| `ADD COLUMN` w/ **volatile** default, stored generated, identity | `ACCESS EXCLUSIVE` | **rewrite + 29 indexes** | minutes; do not |
| `ALTER COLUMN TYPE` (non-binary-coercible) | `ACCESS EXCLUSIVE` | rewrite + index rebuild | minutes; do not |
| `SET NOT NULL` | `ACCESS EXCLUSIVE` | **full scan**, no rewrite | locked throughout |
| `ADD CONSTRAINT … NOT VALID` | `ACCESS EXCLUSIVE` | **no scan** | milliseconds |
| `VALIDATE CONSTRAINT` | **`SHARE UPDATE EXCLUSIVE`** | scan, writes allowed | slow, non-blocking |
| `ADD FOREIGN KEY` | `SHARE ROW EXCLUSIVE` (both tables) | scan | blocks writes only |
| `CLUSTER`, `VACUUM FULL`, `REINDEX` | `ACCESS EXCLUSIVE` | full rewrite | never, in production |

**The `NOT VALID` two-step is the pattern:** *"the `ADD CONSTRAINT` command does not scan the table and can be committed immediately"*, then *"validation acquires only a `SHARE UPDATE EXCLUSIVE` lock."* See `data-quality/03-constraint-design-postgres.md`.

### 5.1 The lock queue — the actual outage mechanism

`ACCESS EXCLUSIVE` blocking `SELECT`s is expected. What surprises people: **DDL merely *waiting* for it blocks every query that arrives after.** A long `SELECT` holds `ACCESS SHARE`, `ALTER TABLE pitches` conflicts and queues, and every subsequent `SELECT` queues behind the *pending* request. PostgresAI: *"while waiting to acquire the `ACCESS EXCLUSIVE` lock it needs, [the DDL] starts blocking others."* Mitigation is `lock_timeout` plus retry, not patience:

```sql
-- migration session (direct connection, NOT through PostgREST)
SET lock_timeout = '2s';  SET statement_timeout = '60s';
ALTER TABLE pitches ADD CONSTRAINT ck_stuff_plus_range
  CHECK (stuff_plus BETWEEN 0 AND 200) NOT VALID;   -- on 55P03: sleep with jitter, retry
```

**Triton caveat:** app code cannot do this — `SET`/`SET LOCAL` are unavailable through `run_query` (SELECT-only) and `run_mutation` (DML-only), and PostgREST owns the transaction. **DDL on Triton must run from a direct/session-mode connection.** (inferred)

---

## 6. `CREATE INDEX` vs `CREATE INDEX CONCURRENTLY`

| | `CREATE INDEX` | `CREATE INDEX CONCURRENTLY` |
|---|---|---|
| Lock | `SHARE` — blocks all writes | `SHARE UPDATE EXCLUSIVE` — reads *and* writes proceed |
| Table scans | 1 | **2**, plus waits on existing transactions before and after |
| In a transaction block | yes | **no** |
| On failure | nothing left behind | leaves an **`INVALID`** index |
| Same-table builds | multiple | **one at a time**; partitioned tables unsupported |

> "If a problem arises while scanning the table, such as a deadlock or a uniqueness violation in a unique index, the `CREATE INDEX` command will fail but leave behind an 'invalid' index."

An `INVALID` index is **not used by the planner but is still maintained on every write** — pure cost, invisible unless you look. Follow every build with a `pg_index.indisvalid` check and `DROP INDEX CONCURRENTLY` what comes back. On Triton these builds must run from a direct connection: they far exceed 8s.

---

## 7. Deadlocks

A deadlock is a cycle in the waits-for graph. Postgres does not prevent it; it detects it and kills a victim with `40P01`. Detection is deliberately lazy — *"The check for deadlock is relatively expensive, so the server doesn't run it every time it waits for a lock... The default is one second (`1s`)"* — and that same parameter governs when `log_lock_waits` fires.

Prevention is application discipline: acquire locks in a **consistent order** (the only real fix), take the most restrictive lock **first**, keep transactions short, and **retry on `40P01`** since victims are safe to retry by construction. Triton's single-writer crons rarely deadlock, but the risk rises if chunks are parallelized — so partition them by `game_date`. (inferred)

---

## 8. MVCC, snapshots, and long-transaction hazards

**The guarantee:** *"reading never blocks writing and writing never blocks reading"* — which is why `ACCESS SHARE` conflicts only with `ACCESS EXCLUSIVE`. *Read Committed* (the default) takes a new snapshot per statement; *Repeatable Read* takes one *"as of the start of the first non-transaction-control statement"* and raises `40001` on write conflicts, which the app must retry from scratch. Every Triton RPC runs in its own short Read Committed transaction, so "read the counts, then write based on them" is **not atomic across RPC calls** — remediation must be **idempotent**, which is why `/api/admin/backfill-stuff-plus`'s `?mode=repair` filters on `stuff_plus IS NULL`. (inferred)

**The xmin horizon.** VACUUM may remove a dead tuple only once **no** snapshot in the cluster could still see it, so anything holding that horizon back does so **for every table in the database**: long-running or idle-in-transaction sessions (*"rows where `age(backend_xid)` or `age(backend_xmin)` is large"*), stale replication slots, abandoned prepared transactions. Consequences escalate from bloat to anti-wraparound vacuuming to the cluster refusing new transactions. `pitches` carried **1.44M dead tuples** on 2026-08-11 right after a ~250k-row backfill; batch `UPDATE`s create them by construction. The 8s cap keeps the app path from holding a snapshot open; **scripts on direct connections are unprotected.** (inferred)

---

## 9. Diagnosis: `pg_stat_activity`, `pg_locks`, `pg_blocking_pids()`

```sql
SELECT pid, state, now() - xact_start AS xact_age, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by, left(query, 120)
FROM pg_stat_activity
WHERE backend_type = 'client backend' AND state <> 'idle'
ORDER BY xact_start NULLS LAST;
```

`wait_event_type = 'Lock'` means *"the server process is waiting for a heavyweight lock"* — the contention in §4; `LWLock`, `IO`, and `BufferPin` are different problems. `state = 'idle in transaction'` with a large `xact_age` is the §8 hazard, visible. The docs prefer `pg_blocking_pids()` over self-joining `pg_locks`; for triage, `SELECT count(*) FROM pg_locks WHERE NOT granted;` — nonzero across successive checks is real. There, `granted = false` means another process is *"holding **or waiting for** a conflicting lock mode"* — the §5.1 queue, visible.

---

## 10. What Triton should do, in order

1. **Codify the 8s cap as a tested invariant.** Assert in the integrity cron that `authenticator.rolconfig` still holds `statement_timeout=8s` and `run_query_long.proconfig` still holds `120s`. If either moves, every capacity assumption in this repo becomes wrong, silently. **This is the detector this doc exists to leave behind.**
2. **Adopt the 2-second budget rule for every write statement** — ≤25% of the ceiling, chunked by an indexed column (`game_date`), never by `OFFSET`, and measured at the intended chunk size because cost is superlinear (§3.4).
3. **Audit the remaining crons for single-statement writes above ~5k rows.** Two jobs have independently hit the wall; assume a third.
4. **Record statement duration as a fraction of the ceiling on every cron run** — the saturation signal from `data-reliability/01-pipeline-observability-fundamentals.md` §3. A statement trending 5s → 6s → 7s is an incident with a countdown.
5. **Open every migration session with `SET lock_timeout='2s'; SET statement_timeout='60s';`** and retry on `55P03`.
6. **Build new indexes `CONCURRENTLY` from a direct connection and check `pg_index.indisvalid` afterward.**
7. **Set `idle_in_transaction_session_timeout` (~60s) on script roles**, and turn on `log_lock_waits`.

**Anti-recommendation #1 — do not raise `authenticator`'s `statement_timeout` to buy headroom.** It is the shared connection role for *every* API request. Raising it to 30s does not make the bad `UPDATE` correct; it makes it a 30-second lock-and-bloat event that still fails, and destroys the growth signal a timeout provides. **The 8s error is not the problem; it is the only thing that has ever told the truth about this platform's write path.** Chunk the write.

**Anti-recommendation #2 — do not create `run_mutation_long`.** Its absence is load-bearing (§3.4): the moment it exists, every future bulk update takes the easy path, and Triton acquires two-minute write transactions on an 8.89M-row table with 4.8 GB of indexes. If a write truly cannot be chunked, run it from a direct connection with explicit timeouts, state the blast radius first, and `VACUUM` after.

**Anti-recommendation #3 — do not "fix" a timeout by raising the client timeout.** Swapping in `supabaseAdminLong` changes nothing server-side and turns a clear `57014` into a confusing fetch abort; the only client change that helps is calling `run_query_long`, a *different RPC*.

**Highest-leverage action: #1.** Everything else here assumes the ceiling is 8 seconds.

---

## Sources

1. PG — [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — timeout semantics
2. PG — [Setting Parameters](https://www.postgresql.org/docs/current/config-setting.html) — fresh-session application
3. PG — [SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html) — **load-bearing**: ignores `rolconfig`
4. PG — [ALTER ROLE](https://www.postgresql.org/docs/current/sql-alterrole.html) — login-time rule; precedence
5. PG — [ALTER FUNCTION](https://www.postgresql.org/docs/current/sql-alterfunction.html) — `proconfig`
6. PG — [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — modes; conflict matrix
7. PG — [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) — CONCURRENTLY; `INVALID`
8. PG — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — lock levels; `NOT VALID`
9. PG — [MVCC Intro](https://www.postgresql.org/docs/current/mvcc-intro.html) — readers vs writers
10. PG — [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — snapshots; `40001`
11. PG — [pg_locks](https://www.postgresql.org/docs/current/view-pg-locks.html) — `granted=false`
12. PG — [Lock Management](https://www.postgresql.org/docs/current/runtime-config-locks.html) — `deadlock_timeout`
13. PG — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — xmin horizon
14. PG — [pg_stat_activity](https://www.postgresql.org/docs/current/monitoring-stats.html) — wait events
15. PG — [Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html) — SQLSTATE values
16. pgsql-general — [Tom Lane](https://www.postgresql.org/message-id/3812228.1710855629%40sss.pgh.pa.us) — timer can't re-arm
17. PostgREST — [Transactions](https://docs.postgrest.org/en/v13/references/transactions.html) — **hoisting**; role settings
18. PostgREST — [Issue #3001](https://github.com/PostgREST/postgrest/issues/3001) — PG ignores function timeout
19. Supabase — [Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) — `service_role` inherits 8s
20. Crunchy — [One PID to Lock Them All](https://www.crunchydata.com/blog/one-pid-to-lock-them-all-finding-the-source-of-the-lock-in-postgres) — lock cascades
21. pganalyze — [Lock monitoring](https://pganalyze.com/blog/postgres-lock-monitoring) — blocking trees
22. Percona — [Heavyweight locks](https://www.percona.com/blog/postgresql-locking-part-2-heavyweight-locks/) — detection timing
23. PG Wiki — [Lock Monitoring](https://wiki.postgresql.org/wiki/Lock_Monitoring) — blocking query
24. Citus — [7 tips for Postgres locks](https://www.citusdata.com/blog/2018/02/22/seven-tips-for-dealing-with-postgres-locks/) and PostgresAI — [lock_timeout and retries](https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries) — lock queues; retries

**Triton-internal evidence (measured 2026-08-11):** `pg_roles.rolconfig`/`pg_proc.proconfig` verified live; the ~8k/~11k threshold and ~4k-rows-in-~1.4s timing from the Stuff+ remediation; `lib/supabase-admin.ts`; `app/api/update/route.ts:306-352`; `scripts/fix-security-advisories.sql:206-213`; `scripts/backfill-pitch-videos.ts:46`; sizes from `Jo/context/triton-context.md`.
