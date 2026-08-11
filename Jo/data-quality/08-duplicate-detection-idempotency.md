---
title: Duplicate Detection & Idempotency — Keys, Upserts, and Safe Re-Runs
domain: data-quality
tags:
  - duplicates
  - idempotency
  - upsert
  - on-conflict
  - natural-keys
  - merge
  - write-amplification
sources_reviewed: 17
last_updated: 2026-08-11
---

# Duplicate Detection & Idempotency — Keys, Upserts, and Safe Re-Runs

## TL;DR

- **Triton's ingest is already idempotent, and that is the load-bearing fact.** `pitches` has a unique index on `(game_pk, at_bat_number, pitch_number)`, so the 3-day re-sync overlap in `/api/cron/pitches` converges instead of accumulating. Vercel never retries a failed cron — that overlap *is* the retry layer, and it works because the key is enforced. (measured)
- **A working PostgREST `.upsert()` proves its unique index exists.** Postgres raises `42P10` when no unique index matches the conflict target, so every night's ingest is a constraint test nobody had to write. (documented)
- **Duplicates rarely raise an error; they raise a number.** They inflate `COUNT(*)`, drag `AVG()` toward whatever got copied, and change who clears the `league_averages` thresholds — moving the 100-baseline every plus-stat is measured against. (inferred)
- **`ON CONFLICT DO UPDATE` writes a full new row version even when nothing changed**, and Triton rewrites ~8k unchanged rows nightly at `app/api/update/route.ts:148` — new heap tuple, up to 29 index entries, one dead tuple each. ~8k × ~180 game days ≈ 1.44M row versions vs an observed `n_dead_tup` of 1,437,923: **suggestive, not proven** (the estimator resets on vacuum; a 250k-row backfill ran that day). (inferred)
- **The measured consequence is schedule risk, not disk: that upsert runs at ~94.8% of the 8s `statement_timeout`** — the curve that produced the 2026 Stuff+ outage, a season earlier. (measured)
- **The fix is a `WHERE ... IS DISTINCT FROM` guard, which PostgREST cannot express** — so it needs raw SQL via `run_mutation`, feasible at the existing 500-row batch inside the 8s cap. It suppresses the write but not the row lock. (documented)
- **That change fixes a second bug free.** `inserted += batch.length` counts no-op updates, so `totalInserted` is always ~12k in-season and `/api/cron/refresh`'s `skipDownstream` gate can essentially never fire. `RETURNING` on a guarded upsert gives a true rows-changed count. (measured)
- **`ignoreDuplicates: true` is the tempting wrong fix**, and duplicate *rows* are not duplicate *people*: Statcast restates history, and no key on `players.id` detects two MLBAM ids for one human (→ `Li`). (inferred)

---

## 1. How duplicates enter, and why only one path errors

| Mechanism | Example | Errors? |
|---|---|---|
| **Re-run without a key** | Backfill re-runs a date range into an unconstrained table | No |
| **Duplicate delivery** | Vercel cron double-fires; a client retries a commit | No |
| **Duplicates in one batch** | Upstream CSV repeats a natural key | **Yes** — `21000 cardinality_violation` |

Only the third announces itself, and even that gets swallowed (§3.4).

### 1.1 Duplication hides by inflating aggregates

Same pathology as the Stuff+ outage, mirrored: the job succeeds, the numbers render, the numbers are wrong.

- `COUNT(*)` — pitch counts, usage %, sample sizes — inflates by the duplication rate.
- `AVG()` drags toward the duplicated subset, and ratios do not save you: Whiff% survives only *uniform* duplication, and duplication follows the shape of whatever misfired.
- **Qualification thresholds flip.** `league_averages` qualifies pitchers at `IP >= max(5, 0.20 * IP_leader_for_role)`. Duplicated rows inflate IP → change the leader → change the threshold → change the qualified population → change the 50th-percentile benchmark. **A duplicate in a source table silently redefines 100.** (inferred)

No range check catches this, and no NULL-rate monitor does either. Every value is individually valid.

---

## 2. Natural vs surrogate keys

A **natural key** identifies the real-world thing — `(game_pk, at_bat_number, pitch_number)` — so re-ingesting a pitch hits the same row. A **surrogate key** (`compete_pitches.id uuid`) identifies the row, so a re-run mints new ids and duplicates enter silently.

**A surrogate PK is fine; it is not a substitute for a unique constraint on the natural key.** `compete_pitches` gets this right: `id uuid` for FK targets, `tm_pitch_uid text unique` for dedup. And the natural key must come from the *source*, never from anything computed at load time.

---

## 3. `ON CONFLICT`: four things that bite

### 3.1 Arbiter inference is exact-set matching

> "All … unique indexes that … contain exactly the `conflict_target`-specified columns/expressions are inferred (chosen) as arbiter indexes." — [INSERT](https://www.postgresql.org/docs/current/sql-insert.html)

Exactly — not a superset, not a prefix. Name two of three key columns and you get `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`. **Corollary:** every working `onConflict:` in the repo proves its index exists today (`update/route.ts:148`, `update/milb/route.ts:356`, `cron/player-stats/route.ts:102`).

### 3.2 `excluded`, and partial-index targets

`SET x = excluded.x` takes the incoming value, `SET x = pitches.x` the stored one; mixing them expresses merge policy — `COALESCE(excluded.stuff_plus, pitches.stuff_plus)` never overwrites non-NULL with NULL. A target must also repeat a partial index's `WHERE` clause, or a stray non-partial index wins arbiter selection.

### 3.3 NULLs are distinct — a nullable column is not a key

`UNIQUE` treats NULLs as distinct, so the NULL branch permits unlimited duplicates. PG15+ offers `UNIQUE NULLS NOT DISTINCT` as the declarative fix.

Triton handled it: `compete_pitches.tm_pitch_uid` is nullable, TrackMan CSVs sometimes omit `PitchUID`, and the upload route synthesizes `synthetic:{session}:{pitch_no}` first. **Right instinct.** Residual risk: that uid is global, so two files sharing a `tm_session_id` collide and — under `ignoreDuplicates: true` — the second file's rows are *silently dropped*. Failure inverted, not removed. (inferred)

### 3.4 In-batch duplicates raise `cardinality_violation` — and Triton swallows it

> "…the command will not be allowed to affect any single existing row more than once; a cardinality violation error will be raised."

If Savant returns one key twice in a CSV, the 500-row batch fails. `app/api/update/route.ts:157-168` retries **row by row**, each succeeds, the second copy overwrites the first, `errors` stays 0, and `inserted` counts both. Good engineering for bad rows — and *also* a duplicate-suppression mechanism that reports nothing, the `console.error` at `:159` its only trace. (inferred) Fix: classify the error; `21000` belongs in `reportError`, not a retry loop.

---

## 4. DO UPDATE vs DO NOTHING vs MERGE

| | `DO UPDATE` | `DO NOTHING` | `MERGE` |
|---|---|---|---|
| Existing row | Overwritten | Untouched | Per `WHEN MATCHED` |
| Captures restatements | **Yes** | No | Yes |
| Cost on unchanged row | Full row version | ~Free | Full row version |
| Conflict target | Required | Optional — omitted, "conflicts with all usable constraints … are handled" | N/A |

The MERGE docs are direct: *"You may also wish to consider using `INSERT ... ON CONFLICT` as an alternative … which offers the ability to run an `UPDATE` if a concurrent `INSERT` occurs."* **MERGE has no place in Triton:** it buys DELETE-in-one-statement and a `merge_action()` label, neither needed, and gives up the concurrency guarantee that makes the overlap window safe.

`DO NOTHING` with **no** conflict target is a separate hazard: the arbiter becomes whatever unique constraints happen to exist, as at `app/api/cron/challenges/route.ts:155`. Add a target so intent survives the next DDL change.

---

## 5. Triton's ingest: what's right, then what it costs

**What's right.** Vercel cron delivery is best-effort both ways — runs can be missed *and* double-fired, no retries. Triton's answer is a window wide enough to re-cover a missed night plus a key that makes re-covering free. That pairing is why the pitch pipeline has never produced a duplicate; do not disturb it.

**What it costs.** `app/api/update/route.ts:148` passes `{ onConflict: 'game_pk,at_bat_number,pitch_number', ignoreDuplicates: false }` — unconditional `ON CONFLICT DO UPDATE`. Of ~12k rows in a nightly window, ~8k already exist and are almost certainly byte-identical. Postgres rewrites all of them.

```
8,000 rewritten rows/night × ~180 game days ≈ 1,440,000 unnecessary row versions
observed n_dead_tup on pitches (2026-08-11):    1,437,923
```

**Suggestive, not proven.** The reading came right after a ~250k-row backfill plus rescore testing worth ~275k alone, and `n_dead_tup` resets on vacuum. **The test is one reading either side of a single cron run.**

**The measured consequence is scheduling.** Per `pg_stat_statements` the upsert runs at **~94.8% of the 8s `statement_timeout`** — and timed-out statements are never recorded, so that is a censored distribution and a *leading* indicator (`postgres-performance/10-monitoring-postgres.md`).

**And `totalInserted` is a lie.** `inserted += batch.length` (`:154`) counts no-op updates, so in-season it is always ~12k and `skipDownstream = totalInserted === 0` at `cron/refresh/route.ts:47` never fires.

### 5.1 Suppressing the no-op write

PostgREST's `.upsert()` cannot express `WHERE ... IS DISTINCT FROM` on DO UPDATE. The guard needs raw SQL through `run_mutation`:

```sql
INSERT INTO pitches (game_pk, at_bat_number, pitch_number, /* ... */)
VALUES /* ... 500 rows ... */
ON CONFLICT (game_pk, at_bat_number, pitch_number) DO UPDATE
SET release_speed = excluded.release_speed,
    description   = excluded.description
    /* ... */
WHERE pitches.* IS DISTINCT FROM excluded.*
RETURNING (xmax = 0) AS was_insert;
```

- **Whole-row `IS DISTINCT FROM` is the only maintainable form at 90+ columns**, but composite comparison against `excluded` must be verified on a scratch table first *(inferred — test it)*. The column-list fallback is unambiguous but needs regenerating when Savant adds a column.
- **`RETURNING (xmax = 0)` distinguishes insert from update**, and with the guard it emits only rows that actually changed — a true rows-changed count, fixing `totalInserted` and reviving `skipDownstream` in the same edit. That is the real payoff; less bloat is the bonus.
- **Watch statement size, not row count** — `run_mutation` is capped at 8s. Start at 200-row batches and measure.

---

## 6. Idempotency keys, and retries against writes that don't tolerate them

**Content idempotency** (natural-key upsert) means the same *data* lands in the same row — what `pitches` uses. **Request idempotency** (an idempotency key) means the same *request* produces one effect, needed when a write has no natural key or acts outside the database.

The Stripe pattern: the client generates a key, the server stores key → outcome, and a replay returns that outcome instead of re-executing. Brandur Leach's Postgres version adds a state machine over atomic phases, so a crash mid-request resumes rather than re-runs.

**Triton already has one, and it's correct.** `scripts/email-events-idempotency.sql` creates `email_events_provider_event_id_key` on the provider's event id, so webhook redelivery is a no-op. Nothing else uses the pattern — and a duplicate cron delivery on `/api/cron/emails` sends the newsletter twice, which no upsert key prevents.

### 6.1 Never retry a relative write

| Non-idempotent | Idempotent equivalent |
|---|---|
| `SET attempts = attempts + 1` | `SET attempts = $n` from the caller's state |
| `INSERT INTO t SELECT ...` | `... ON CONFLICT DO NOTHING` on a real key |
| `DELETE ... LIMIT 100` in a loop | Delete by an explicit, ordered key range |

`pitch_videos.attempts` is a relative counter, safe only because the worker is single-threaded and `status` gates re-entry — safety owned by the caller, not the schema. (inferred) Its upserts (`lib/pitchVideos.ts:53`) use `ignoreDuplicates: true` — *"never reset rows the download worker already touched."* **Correct here**, the opposite of the `pitches` case, because the local `status`/`file_path` columns are authoritative and the incoming row is not. Tradeoff: a wrong `play_id` is never fixed by re-running the indexer.

---

## 7. Detection, scoped to the 8s ceiling

### 7.1 The scan, and why the window is 2 days

```sql
SELECT game_pk, at_bat_number, pitch_number, COUNT(*) AS n
FROM pitches
WHERE game_date >= CURRENT_DATE - INTERVAL '2 days'
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1;
```

Measured 2026-08-11 with `EXPLAIN (ANALYZE, BUFFERS)`: **2 days = 16.4 ms warm; 7 days = 18,302 ms cold.** Both use `idx_pitches_game_date` — good plans. The 7-day form blows the 8s cap and, given Triton's error handling, fails in a way that reports success. **Live assertion windows here are 2–3 days.**

Same shape on `milb_pitches`. For `compete_pitches`, count the nullable-key branch instead (`tm_pitch_uid IS NULL`, `LIKE 'synthetic:%'`) — that is where its duplicates live.

**On `pitches` the scan is the wrong detector.** The unique index makes duplicates *impossible* there, so it is a constraint-presence test in a data-quality costume; assert the constraint directly instead — `SELECT indisunique, indisvalid FROM pg_index WHERE indrelid = 'pitches'::regclass` — breaching on an absent index or `indisvalid = false`.

### 7.2 The detector that actually catches a bad re-run

Duplication from a re-run shows up as **a settled day's row count increasing**. Statcast restates *values*; it does not add pitches to a game finished last week.

```sql
-- daily, into a rollup table
SELECT game_date, COUNT(*) AS n
FROM pitches
WHERE game_date >= CURRENT_DATE - INTERVAL '3 days'
GROUP BY 1;
```

Measured for the grouped 3-day form: **15.3 ms warm.** Breach: the count for a day older than the restatement window increases. Cheapest detector here, and it needs no enforced key.

### 7.3 Dedup queries for cleanup

```sql
WITH d AS (
  SELECT ctid,
         ROW_NUMBER() OVER (PARTITION BY game_pk, at_bat_number, pitch_number
                            ORDER BY ctid) AS rn
  FROM milb_pitches
  WHERE game_date >= '2026-06-01' AND game_date < '2026-06-02'
)
DELETE FROM milb_pitches m USING d WHERE m.ctid = d.ctid AND d.rn > 1;
```

Two cautions. **`ctid` is not a row identifier** — it changes on UPDATE, so it is valid only inside one statement. And `ORDER BY` must encode a real preference; `ORDER BY ctid` keeps an arbitrary row. Order by an ingest timestamp if one exists.

`SELECT DISTINCT ON (key) * … ORDER BY key, ingested_at DESC` de-duplicates on the read side (leading `ORDER BY` must match the `DISTINCT ON` list). **It is a band-aid**: it hides duplicates from one query while every other query still counts them. Then add the constraint (`03-constraint-design-postgres.md`).

---

## 8. Triton uniqueness inventory

| Table | Dedup key | Action | Assessment |
|---|---|---|---|
| `pitches` | `(game_pk, at_bat_number, pitch_number)` | DO UPDATE | Correct key; a cost problem, not a duplicate one |
| `milb_pitches` | same triple *(verify)* | DO UPDATE | Inferred from a clean upsert; confirm it |
| `pitch_videos` | PK triple — `create-pitch-videos.sql:30` | DO NOTHING | Correct; no fix path for a bad `play_id` |
| `player_season_stats` | PK `(player_id, season, stat_group)` | DO UPDATE | Correct — these legitimately restate |
| `compete_pitches` | `tm_pitch_uid`, nullable | DO NOTHING | Mitigated in code; cross-file collisions drop rows (§3.3) |
| `bat_tracking_swing_miss` | 5-col key *(verify)* — `lib/syncBatTracking.ts:176` | DO UPDATE | Confirm the index |
| `game_umpires` | `game_pk` *(verify)* | DO UPDATE | Confirm the index |
| `umpire_challenges` | none — `cron/challenges/route.ts:155` | DO NOTHING, **no target** | Add a conflict target |

### 8.1 `syncNewPlayers` — a duplicate-person risk, not a duplicate-row risk

`app/api/update/route.ts:17-62` builds `{id, name}` from the CSV's `pitcher`/`player_name`, fetches missing batter names from the MLB People API, and upserts with `{ onConflict: 'id', ignoreDuplicates: true }`. The key is the MLBAM id, so **no duplicate rows are possible**. Two residual issues, neither Jo's:

1. **Duplicate entities.** Two ids for one human — MiLB vs MLB id spaces, re-registrations, Savant's `"Last, First"` vs the People API's `fullName`. No unique constraint detects this. → **`Li`**, entity resolution and ID crosswalks.
2. **Names never update.** `ignoreDuplicates: true` means a name recorded once is never corrected — staleness, not duplication, but a choice worth making deliberately.

Ordering hazard: pitches are upserted at `:152`, players synced at `:172` — children before parents. Benign today because no FK exists; a reason to think before adding one.

---

## 9. What Triton should do, in order

1. **Measure first.** One `n_dead_tup` reading on `pitches` before and after a single `/api/cron/pitches` run. Ten minutes, and the difference between measured and inferred.
2. **Fix the row count.** `RETURNING`-based counting makes `totalInserted` mean rows-changed and revives `skipDownstream`, guard or no guard.
3. **Convert the ingest to a guarded raw-SQL upsert via `run_mutation`** (§5.1). Prototype on a scratch table, measure statement duration against the 8s cap before and after, start at 200-row batches. Highest value, largest change.
4. **Confirm the unenforced keys** — `milb_pitches`, `bat_tracking_swing_miss`, `game_umpires`: one `pg_index` query, then `NOT VALID` → `VALIDATE`.
5. **Add the settled-day row-count monitor (§7.2)** — 15.3 ms, and the detector this doc exists to leave behind.
6. **Give `umpire_challenges` an explicit conflict target**, classify `21000` errors as upstream duplication rather than retrying them into silence, and hand duplicate-person detection to **`Li`**.

**Anti-recommendation: do not "solve" this with `ignoreDuplicates: true`, and do not adopt MERGE.**

Switching `pitches` to DO NOTHING is one word and eliminates the entire measured cost. It is still wrong: it freezes every row at its first, most provisional version and discards every Statcast restatement the overlap window exists to capture — pitch types reclassified, release points corrected, columns added mid-season. That trades a cost you measured for a correctness loss you never will. MERGE is wrong for its own reason: the docs point back to `ON CONFLICT` here.

And **do not build a duplicate-scanning cron over `pitches`** — the index already makes duplicates impossible, and the scan would burn ~18s of a cold 8s budget proving what the constraint proves for free.

**Highest-leverage next action:** take the two `n_dead_tup` readings around tonight's cron. §5 is inferred; that measurement promotes or kills it.

---

## Sources

1. PostgreSQL — [INSERT](https://www.postgresql.org/docs/current/sql-insert.html) — arbiter inference, `excluded`, cardinality violation, "all rows will be locked", optional target for DO NOTHING.
2. PostgreSQL — [MERGE](https://www.postgresql.org/docs/current/sql-merge.html) — the steer back to `ON CONFLICT` under concurrency.
3. PostgreSQL — [5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — `UNIQUE` treats nulls as distinct.
4. PostgreSQL — [CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) — `NULLS NOT DISTINCT`; deferrable constraints can't be arbiters.
5. PostgreSQL — [SELECT](https://www.postgresql.org/docs/current/sql-select.html) — `DISTINCT ON` and its `ORDER BY` rule.
6. PostgreSQL — [3.5. Window Functions](https://www.postgresql.org/docs/current/tutorial-window.html) — `ROW_NUMBER() OVER (PARTITION BY …)`.
7. PostgreSQL — [Appendix A. Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html) — `23505`, `21000`, `42P10`.
8. PostgreSQL — [5.4. System Columns](https://www.postgresql.org/docs/current/ddl-system-columns.html) — `ctid` is not a row identifier.
9. PostgreSQL — [25.1. Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — `n_dead_tup` semantics.
10. Datadog Engineering — [Debugging Postgres performance: when upserts don't update but still write](https://www.datadoghq.com/blog/engineering/debugging-postgres-performance/) — the closest published analogue to §5: unconditional upserts writing WAL and dead tuples for unchanged rows.
11. Crunchy Data — [Simulating UPDATE or DELETE with LIMIT in Postgres](https://www.crunchydata.com/blog/simulating-update-or-delete-with-limit-in-postgres-ctes-to-the-rescue) — the CTE batching form §7.3 is built on.
12. Cybertec — [Foreign keys and insertion order in SQL](https://www.cybertec-postgresql.com/en/postgresql-foreign-keys-and-insertion-order-in-sql/) — parent-before-child ordering; §8.1's hazard.
13. Percona — [Basic Understanding of Bloat and VACUUM in PostgreSQL](https://www.percona.com/blog/basic-understanding-bloat-vacuum-postgresql-mvcc/) — UPDATE as insert-plus-delete; the §5 mechanism.
14. Stripe — [Idempotent Requests](https://docs.stripe.com/api/idempotent_requests) — the canonical `Idempotency-Key` contract.
15. Brandur Leach — [Implementing Stripe-like Idempotency Keys in Postgres](https://brandur.org/idempotency-keys) — atomic phases and a resumable state machine; §6's model.
16. Vercel — [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — no retries; best-effort delivery both ways (missed *and* duplicate runs).
17. Supabase — [Database Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) — per-role `statement_timeout`; `run_mutation` is capped at 8s.

**Triton-internal evidence (measured 2026-08-11):** `app/api/update/route.ts` (`:148`, `:154`, `:157-168`, `:17-62`), `app/api/cron/refresh/route.ts:47`, `app/api/update/milb/route.ts:356`, `app/api/compete/performance/upload/route.ts`; DDL in `scripts/create-pitch-videos.sql:30`, `create-player-season-stats.sql:19`, `create-compete-pitches.sql:48,54`, `email-events-idempotency.sql`; conflict targets in `app/api/cron/{challenges,roster,player-stats}/route.ts`, `lib/pitchVideos.ts:53`, `lib/syncBatTracking.ts:176`. Timings and `n_dead_tup` = 1,437,923 from `docs/Queries.md` and `Jo/context/triton-context.md`.