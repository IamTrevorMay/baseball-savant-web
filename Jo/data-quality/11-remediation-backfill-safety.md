---
title: Remediation & Backfill Safety — Repairing Bad Data Without Making It Worse
domain: data-quality
tags: [backfill, remediation, idempotency, chunking, resumability, blast-radius, dry-run, vacuum]
sources_reviewed: 19
last_updated: 2026-08-11
---

# Remediation & Backfill Safety — Repairing Bad Data Without Making It Worse

## TL;DR

- **A repair tool you have never run against a real gap is decorative, not operational.** `/api/admin/backfill-stuff-plus` existed to fix exactly this class of outage and had **never once worked** — it sat in the repo through the whole three-month Stuff+ outage it was built for, making the platform *feel* covered. (measured)
- **`SELECT COUNT(*) ... LIMIT 1 OFFSET n` is always empty for n > 0**, because COUNT returns exactly one row. That was the `hasMore` probe, so the loop exited after batch 1 — every year, every input, every time. (measured)
- **`ctid` paging over an UPDATE is self-corrupting, not merely unstable.** UPDATE writes a *new* tuple at a *new* `ctid`, so batch 1 relocates its own rows into the range batch 2 reads. "OFFSET without ORDER BY may skip or overlap" understates it: the pager mutates what it pages over. (documented + inferred)
- **A guard predicate is a safety feature and a performance feature in one clause.** `AND p.stuff_plus IS NULL` made the repair idempotent *and* cut it from 657k rows to ~250k — the clause protecting correct April/May values is the one that got the job under the 8s ceiling. (measured)
- **Chunk by an indexed, immutable column with half-open ranges.** `game_date >= X AND game_date < X+n` rides `idx_pitches_game_date`, can't double-count a boundary, and survives the UPDATE as an address. Eight chunked statements did what one whole-year statement could not. (measured)
- **Verify with an invariant that detects a *skewed* repair, not a row count.** Coverage went May 90.2%→99.7%, Jun 17.8%→99.6%, Jul 4.1%→99.6%, Aug 0%→99.6% *while* monthly league-average Stuff+ held ~100.2–101.0. The stable mean is the proof. (measured)
- **Remediation is a bloat event; budget it as one.** `pitches` was left at **1,437,923 dead tuples** — 80.9% of its ~1.78M autovacuum trigger (`0.2 × 8.89M`), `autovacuum_count = 1`, last vacuum 86 days old. Autovacuum is *correctly* ignoring real bloat. (measured)
- **The repo's "VACUUM between large batch updates" convention has never been implemented — zero matches anywhere in `app/`, `lib/`, `scripts/`, or `.sql`** — nor can it be: `VACUUM` cannot run inside a transaction block, and every PostgREST request is one transaction. (measured + documented)
- **The rewritten route still has a live defect: it will be killed mid-run.** A full `?year=2026` repair is ~180 day-chunks × ~2s ≈ **360s against Vercel's 300s ceiling**, and Vercel does not retry. It needs a wall-clock budget and a `next_start` cursor. (inferred from measured per-chunk cost)

## 1. First decision: repair in place, or rebuild?

**Repair in place** is `UPDATE ... WHERE <guard>` on the live table: barely reversible (the old value is gone unless captured), costing one dead tuple plus 29 index writes per row. **Rebuild** recomputes into a new table or column and swaps: fully reversible until the flip, no bloat on the original, but a ~9.7 GB rewrite Triton has no disk headroom for.

Rebuild is safer generally — Stripe's four-phase migration and Notion's shard cutover both do it: write the new representation, backfill, verify by comparison, flip reads. On Triton it is unavailable: one column on an 8.9M-row, 9.7 GB table whose indexes alone are 4.8 GB, every write capped at 8s.

**So the substitute for reversibility is narrowness.** If you cannot undo the write, make it touch as few rows as possible, and only rows that are provably wrong.

## 2. Guard predicates: the highest-leverage clause in a backfill

The guard is the `WHERE` term narrowing a repair to rows that need repairing. Four jobs at once: **idempotency** (afterwards no row satisfies it, so a re-run is a no-op — this is what makes retry safe); **non-destruction** (correct rows are never rewritten, so a bug in the new expression cannot damage good data); **performance** (fewer rows, fewer index writes, more timeout headroom); **progress** (`COUNT(*) WHERE <guard>` gauges remaining work).

Triton's 2026 guard was one line, `AND p.stuff_plus IS NULL`. It cut the target from 657k rows to ~250k — **2.6× less write volume** — while making the correct April/May rows untouchable. (measured)

The guard must be derivable from the *corruption*, not from the fix:

| Corruption | Guard | Idempotent? |
|---|---|---|
| Column never populated | `col IS NULL` | Yes |
| Formula changed | `col IS DISTINCT FROM <new_expr>` | Yes, but pays the recompute |
| Bad ingest window | `ingested_at BETWEEN ...` | **No** — a re-run rewrites |
| "Just recompute everything" | *(none)* | No |

The bottom two rows are why `rescore` is a separate explicit mode: no guard by construction, so neither idempotent nor non-destructive. **`IS DISTINCT FROM` is the middle path** after a formula change — it restores idempotency and skips the write where the value doesn't move, at the cost of evaluating the expression per row: a win when the changed fraction is small, a loss near 100%.

## 3. Chunking: by an indexed column, never by offset, never by `ctid`

### 3.1 What the dead route did

```sql
-- BROKEN — do not resurrect
UPDATE pitches SET stuff_plus = ...
WHERE ctid = ANY (SELECT ctid FROM pitches WHERE game_year = 2026 LIMIT 5000 OFFSET 10000)
```

**Defect 1 — no `ORDER BY`.** Postgres documents that `LIMIT`/`OFFSET` without it returns "an unpredictable subset" — pages overlap or skip.

**Defect 2 — `ctid` is not a stable address under UPDATE.** It is the physical `(block, offset)` of a *tuple version*, and UPDATE does not modify in place: it writes a new tuple at a new `ctid` and marks the old dead. The instant batch 1 commits, the rows it repaired sit at new locations — typically the end of the heap, exactly where later OFFSETs land.

> **This is self-corruption, not instability.** A `ctid` pager over an UPDATE re-reads its own output: some rows are repaired twice, others never visited, and the termination condition is meaningless because the ordering is rewritten underneath it. Defensible for a read-only scan of a quiescent table; never for a paged UPDATE of that table. (documented + inferred)

**Defect 3 — the loop never looped.** The probe was `SELECT COUNT(*) ... LIMIT 1 OFFSET 5000`: COUNT returns one row, OFFSET 5000 skips it, the result is empty, `hasMore` is false. Only batch 1 ever ran — and it attempted the whole year (657k rows × 29 indexes) in one statement, hitting the 8s `statement_timeout`. Incapable of succeeding, returning an error nobody read. (measured)

### 3.2 What works

```sql
-- half-open [start, end): adjacent chunks cannot double-count a day
WHERE p.game_date >= '2026-06-01' AND p.game_date < '2026-06-02'
  AND p.release_speed IS NOT NULL
  AND p.stuff_plus IS NULL          -- the guard
```

Why `game_date` is the right key: **indexed** (chunk selection is an index range scan), **immutable under this UPDATE** (the address survives the write, unlike `ctid`), **naturally sized** at ~4k rows/day (well under the ~8k-row ceiling), and **human-legible** (a failed chunk is a date you can re-run by hand).

**Sizing.** Measured on 2026 `pitches`: **~8k rows/statement passes, ~11k times out.** One day ≈ 4k rows ≈ 1.4s — ~5.7× headroom under the 8s cap. The slack is deliberate: the table grows and cold buffers run 10–20× slower than warm. Never size a chunk at the measured maximum.

**With no natural range key, use keyset paging:** `WHERE col IS NULL AND id > $last_id ORDER BY id LIMIT n`, with `RETURNING id` feeding the next `$last_id`. Guard plus monotonic cursor means each pass strictly advances even when a chunk is retried. Sizing math: `Jo/postgres-performance/04-bulk-write-patterns.md`.

## 4. Resumability, cursors, and the wall-clock budget

A chunked repair is a sequence of independently-committed transactions. That is the point — a failure at chunk 47 leaves 1–46 durably repaired — but the tool must then say *where it stopped*, in a form you can feed back in. The rewritten route does this on the error path (`route.ts:216`): it returns `failed_chunk` plus a hint that `&start=<failedChunk>` resumes.

**It does not do this on the timeout path, and that is the remaining defect.** A full-season repair walks ~180 day-chunks, each issuing three RPC calls (target count, UPDATE, coverage) for ~2s of wall clock: **~360s against Vercel's 300s ceiling.** The invocation is killed mid-walk with no response body — no `failed_chunk`, no hint — and Vercel does not retry. Idempotency means a re-run converges, but "re-run it and hope" is not a design. (inferred from measured per-chunk cost; not reproduced end-to-end)

```ts
// at the top of each chunk iteration; t0 set before the loop:
if (Date.now() - t0 > 240_000) {        // 60s headroom under the 300s ceiling
  return NextResponse.json({ ok: true, partial: true, chunks: chunks.length,
    total_updated: totalUpdated, next_start: cursor,   // <- the resume token
    hint: `Budget spent. Re-run with &start=${cursor}&year=${year}&mode=${mode}.` })
}
```

Production backfill frameworks all converge here — Shopify's `job-iteration` checkpoints a cursor and re-enqueues, GitLab's batched migrations persist per-batch state for resume/throttle/retry, gh-ost made them pausable. **Shared invariant: the unit of work is small, independently committed, and addressable by a token the caller hands back.**

## 5. Dry runs and blast-radius estimation

The cheapest correct dry run is **the UPDATE's exact predicate, in a SELECT**:

```sql
SELECT COUNT(*) FROM pitches p
JOIN pitch_baselines b ON p.pitch_name = b.pitch_name AND p.game_year = b.game_year
WHERE <the exact predicate from §3.2>
```

The join is not decoration. **The count must reproduce the UPDATE's `FROM` clause exactly** or it errs in the direction that matters: a `pitch_name` with no baseline row is not updatable, and counting it overstates progress — yielding a repair that under-delivers while reporting success, the exact failure genre this doc exists to prevent.

**Blast radius, stated before the button:**

| Quantity | Value |
|---|---|
| Rows targeted (with guard) | ~250,000 |
| Without the guard (`rescore`) | 657,000 |
| Tuples written | ~250k new + ~250k dead, up to ~250k × 29 indexes ≈ **7.25M** index entries |
| Lock | `ROW EXCLUSIVE` per chunk, ~1.4s; reads unblocked |
| Reversible? | **No** — but pre-state was NULL, so nothing is lost |

That last row decides whether you need a snapshot. Here the guard made the operation *effectively* reversible. Under `rescore` it would not be: capture `(game_pk, at_bat_number, pitch_number, stuff_plus)` into a side table first — ~657k narrow rows, and the difference between comparing old to new and hoping.

## 6. Measuring before and after — with an invariant, not a count

A row count proves the statement ran. Verification must answer: **would this measurement catch a repair that filled every gap with plausible-looking garbage?**

**Half one — coverage moved (completeness):**

| Month | Before | After |
|---|---|---|
| May | 90.2% | **99.7%** |
| Jun | 17.8% | **99.6%** |
| Jul | 4.1% | **99.6%** |
| Aug | 0% | **99.6%** |

**Half two — the distribution did not move (correctness):** monthly league-average Stuff+ held at **~100.2–101.0** across the whole repaired range. Stuff+ normalizes to 100, so an intact scale after filling 250k empty rows is strong evidence the new values came from the same distribution as the pre-existing correct ones. Stale baselines, a mismatched `pitch_name` join, or flipped z-score signs would have moved that mean off 100 immediately. (measured)

Half one alone would be satisfied by writing `100` into every NULL row. **Half two is what makes verification real.** Generalizing — pair the completeness delta with a statistic *invariant under a correct repair and sensitive to an incorrect one*: plus-stat → mean stays at 100; raw measurement → percentiles match an adjacent unrepaired window; FK repair → child row count unchanged; dedup → distinct natural keys unchanged; recomputed aggregate → sum reconciles to source of truth.

**Name the residual.** Post-repair coverage is 99.6–99.7%, not 100%; the rest is rows legitimately lacking `release_speed`. A verification demanding 100% either fails forever or gets muted. State the floor *and* the reason together — *"≥99% expected; residual is rows without `release_speed`"* — so nobody chases a gap that is not a gap.

See also `Jo/data-quality/08-duplicate-detection-idempotency.md` (repairs that create duplicates) and `Cas/testing-data-systems/04-idempotency-backfill-testing.md` (automating both halves).

## 7. The cost side: dead tuples, and a convention that cannot be followed

Measured on `pitches` right after the ~250k-row repair plus rescore testing: `n_dead_tup = 1,437,923` against `n_live_tup ≈ 8.89M`, `threshold = 50`, `scale_factor = 0.2`. The trigger is `50 + 0.2 × 8.89M ≈ 1,778,050`, so the table sits at **80.9%** of it — `autovacuum_count = 1`, last vacuum 86 days ago.

**Autovacuum is behaving correctly, and that is the problem.** A 20% scale factor gives a big table a big absolute allowance: `pitches` may accumulate 1.78M dead tuples before autovacuum considers it. At 80.9% it sits below the line indefinitely, bloating, while every metric reads fine. Bound the percentage:

```sql
ALTER TABLE pitches SET (autovacuum_vacuum_scale_factor = 0.02,
                         autovacuum_vacuum_threshold = 50000);
-- triggers at ~228k dead tuples, not ~1.78M
```

**And the convention "VACUUM between large batch updates" has never been implemented** — zero matches for `vacuum` in `app/`, `lib/`, `scripts/`, or any `.sql` file. (measured) That is not laziness; **it is unimplementable through Triton's write path**, for a reason deeper than `run_mutation` rejecting non-DML:

> `VACUUM` cannot be executed inside a transaction block, and PostgREST runs **every request in a single transaction**. So no VACUUM can be issued through *any* RPC here — not `run_mutation`, not a new `run_vacuum`, not `run_query_long`. A `SECURITY DEFINER` PL/pgSQL wrapper does not help — function bodies are transaction-scoped too.

Options: (a) tune per-table autovacuum; (b) `VACUUM (ANALYZE) pitches` from psql as a runbook step, not app code; (c) `pg_repack`, needing disk headroom Triton may not have. **Do (a) plus (b), and restate the `CLAUDE.md` line so it stops looking like something the code does.** See `Jo/postgres-performance/05-vacuum-autovacuum-bloat.md`.

## 8. Audit trails

A repair that leaves no record is indistinguishable from corruption six months later, when someone asks why 250k June rows carry a `stuff_plus` computed from August baselines. Two levels.

1. **Row-level provenance** — `stuff_plus_scored_at timestamptz`, set by both the nightly and the repair path. Turns "which rows were repaired, when, against which baselines" into a query. Cost: one column, one assignment in an UPDATE you already issue.
2. **Run-level ledger** — a `remediation_runs` row per invocation: `tool, mode, guard, range_start, range_end, rows_targeted, rows_updated, chunks_completed, chunks_failed, coverage_before, coverage_after, invariant_before, invariant_after, started_at, finished_at`.

Triton has the ingredients and assembles none: chunk counts and coverage go into an HTTP response that is discarded, `trackCronRun` covers crons but not admin routes, `docs/Queries.md` holds manual SQL by convention. **Nothing persists the fact that a repair happened where a future query can reach it.** The ledger is `data-reliability/01`'s Tier-0 run-metadata table applied to repairs, and it makes *"has this tool ever run successfully?"* answerable — the question that would have exposed the dead route in May.

## 9. Exercising repair tooling before you need it

Untested repair tooling is worse than none: absent tooling gets built under pressure, broken tooling gets **trusted** under pressure and fails when the operator has least capacity to debug it.

Three drills, cheapest first. **(1)** Run repair mode over an already-complete range: the loop iterates, the guard matches nothing, it returns `0 updated` in seconds. Put it in the deploy path. **(2)** Assert the loop iterates more than once on a stubbed 3-chunk range — no database needed, and it catches **the exact bug that made this route useless: "the loop ran exactly once."** **(3)** NULL out one recent day deliberately, repair it, verify both halves. That is the drill that builds real confidence, and Triton's version is unusually safe: with an `IS NULL` guard and idempotent re-runs it self-heals — worst case you re-run, or the 3-day re-sync overlap fixes it within 48h.

## 10. What Triton should do, in order

1. **Add a wall-clock budget and a `next_start` cursor to `/api/admin/backfill-stuff-plus`.** Return at 240s with `partial: true`. Without it a full-year repair dies at 300s with no output and no resume path, and Vercel will not retry. *(Live defect in the tool just fixed.)*
2. **Tune `pitches` autovacuum before the next large repair** — `scale_factor = 0.02`, `threshold = 50000` — then one `VACUUM (ANALYZE) pitches` from psql to clear the 1.44M-tuple backlog.
3. **Fix the `CLAUDE.md` VACUUM convention.** It cannot be done from app code; restate it as a psql runbook step so nobody believes it happens.
4. **Write the test the dead route would have failed:** a multi-chunk range must yield `chunks.length > 1`. Add a repair-mode smoke run to the deploy path — `total_updated: 0` in seconds, anything else is news.
5. **Add `remediation_runs`** — one row per invocation: guard, range, rows targeted/updated, coverage before/after.
6. **Add `stuff_plus_scored_at`** on the next schema change touching `pitches` — bundle it, don't take a standalone 8.9M-row DDL hit.
7. **Adopt two-half verification as the standing template** — every repair reports a completeness delta *and* an invariant a bad repair would break.

### Anti-recommendation

**Do not build a generic backfill framework, and do not reach for `mode=rescore` as the default.**

The framework instinct is strong after finding a broken repair tool, and it is wrong here. Triton has one shape of remediation — *date-chunked UPDATE against a derived column on `pitches`* — and the working implementation is ~180 lines with validation. The dead route's failure was never insufficient abstraction; it was **three concrete bugs in a file nobody had run.** Abstraction does not fix "never executed." Running it does.

The `rescore` instinct is worse because it feels thorough. It is 2.6× the write volume, it destroys the correct values that serve as your control group, it adds ~657k dead tuples to a table already at 81% of its vacuum trigger, and it removes the only evidence distinguishing a good repair from a bad one. **Reserve it for a genuine formula or baseline change, snapshot the old values first, and let the guard work every other time.**

## Sources

**PostgreSQL documentation**

1. [VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html) — "cannot be executed inside a transaction block."
2. [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — autovacuum trigger formula; per-table overrides.
3. [System Columns — `ctid`](https://www.postgresql.org/docs/current/ddl-system-columns.html) — a tuple-version location; changes on update.
4. [LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html) — without `ORDER BY`, "an unpredictable subset."
5. [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — when an UPDATE avoids index writes.
6. [UPDATE](https://www.postgresql.org/docs/current/sql-update.html) — `UPDATE ... FROM`; `RETURNING` for cursors.
7. [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — `statement_timeout`, role inheritance.
8. [INSERT ... ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html) — the `DO UPDATE ... WHERE` guard PostgREST can't express.

**Batch migration and backfill practice**

9. [Stripe — Online Migrations at Scale](https://stripe.com/blog/online-migrations) — dual-write/backfill/verify/cutover.
10. [Shopify — Iteration as a Service](https://shopify.engineering/iteration-as-a-service) — interruptible enumerators, cursor checkpointing.
11. [GitLab — Batched Background Migrations](https://docs.gitlab.com/development/database/batched_background_migrations/) — per-batch tracking, throttle, retry.
12. [GitHub — gh-ost](https://github.blog/2016-08-01-gh-ost-github-s-online-migration-tool-for-mysql/) — pausable, throttleable, testable migrations.
13. [Notion — Sharding Postgres at Notion](https://www.notion.so/blog/sharding-postgres-at-notion) — backfill plus verification-by-comparison.
14. [Figma — Databases Team Lived to Tell the Scale](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/) — reversible steps.
15. [Discord — Storing Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages) — resumable workers; reconciliation.
16. [Braintree — Schema Changes Without Downtime](https://medium.com/braintree-product-technology/postgresql-at-scale-database-schema-changes-without-downtime-20d3749ed680) — batched updates, `lock_timeout`.

**Platform constraints**

17. [PostgREST — Transactions](https://docs.postgrest.org/en/stable/references/transactions.html) — every request is one transaction.
18. [Vercel — Cron Jobs](https://vercel.com/docs/cron-jobs) — best-effort delivery, no retry on failure.
19. [Vercel — Function Duration](https://vercel.com/docs/functions/configuring-functions/duration) — the 300s ceiling.

**Triton-internal evidence (measured 2026-08-11):** dead and rewritten route at `app/api/admin/backfill-stuff-plus/route.ts`; per-day scoring at `app/api/update/route.ts:306-352`; coverage and league-average figures from `docs/Queries.md`; `n_dead_tup` and `autovacuum_count` from `pg_stat_user_tables`; zero `vacuum` matches in `app/`, `lib/`, `scripts/`, `*.sql`; post-mortem in `Jo/context/triton-context.md`.
