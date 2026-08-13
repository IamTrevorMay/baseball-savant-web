---
title: Idempotency & Backfill Testing — Proving the Second Run Changes Nothing
domain: testing-data-systems
tags:
  - idempotency
  - backfill-testing
  - double-run
  - fault-injection
  - resumability
  - repair-verification
  - guard-predicates
  - vitest
sources_reviewed: 20
last_updated: 2026-08-12
---

# Idempotency & Backfill Testing — Proving the Second Run Changes Nothing

> Grades: **(verified)** Triton source at the cited line, or the 2026-08-12 packet; **(documented)**
> vendor docs; **(inferred)** mechanism; **(cargo-cult)**.
>
> **Scope.** Jo's `11-remediation-backfill-safety.md` owns *running* a safe backfill: guards, chunking,
> blast radius, vacuum. Cas owns **the test that proves it was safe**, and fails when it stops being;
> Jo's §9 names three drills, this is how you write them. Comparability:
> `Li/metric-governance/02-metric-versioning-reproducibility.md`.

## TL;DR

- **Idempotency is a property of the write predicate, not the word "upsert."** Every Triton path upserts or UPDATEs; the predicate says what run two does. **(verified)**
- **The nightly Stuff+ scorer is not idempotent and never was.** `app/api/update/route.ts:320-333` predicates on the baseline join, `game_date`, `release_speed IS NOT NULL`; no `stuff_plus IS NULL`. **(verified)**
- **It fires three extra times per pitch, silently.** `[today−3, today]` is **four** dates, not the comment's three (`cron/pitches/route.ts:36-38`); surviving vintage is `game_date + 3`. **(verified)**
- **The two `stuff_plus` writers use opposite predicates**: repair guards `AND p.stuff_plus IS NULL` (`backfill-stuff-plus/route.ts:91`), nightly nothing, so history depends on which wrote last. **(verified)**
- **The job's own counters cannot see a rewrite.** `inserted += batch.length` (`update:154`, summed `cron/pitches:47-50`) counts no-ops: 500 new pitches and 500 rewrites report alike. **(verified)**
- **Assert on a content hash of the affected rows.** Row counts, `ok: true` and HTTP 200 all survive a backfill that wrote garbage. **(inferred)**
- **One backfill is deliberately not byte-stable.** `encrypt()` draws a fresh IV per call (`lib/encryption.ts:29`); only `blindIndex()` is deterministic: assert plaintext, or the guard. **(verified)**
- **Resumability is a separate property needing its own test.** Idempotent-but-not-resumable (repair, killed at 300s) and resumable-but-not-idempotent (`mode=rescore`) both exist. **(verified)**
- **Inject the fault that happens: an 8s statement timeout, not a network blip.** The PostgREST role carries `statement_timeout=8s`; ~8k rows/stmt passes, ~11k fails. **(verified / documented)**
- **Verification has two halves; nobody writes the cheap one.** Coverage moved *and* the distribution did not: 249k NULLs filled with `100` passes half one. **(documented)**
- **A test that has never failed proves nothing.** The dead route's `hasMore` probe would have died to a three-line assertion that the loop iterates twice. **(verified)**
- **None of this needs production.** Every loop-shape, guard, resume and counter bug in this repo's history is reachable with a stub, zero rows. **(inferred)**

---

## 1. Triton's write paths, and what a second run actually does

| Path | Guard / dedup | Re-run effect | Resumable? |
|---|---|---|---|
| `syncPitches` upsert (`update:148-152`), `ignoreDuplicates:false` | none | rewritten with what Savant says **now**; stable only if it is | no |
| `applyStuffPlusForDateRange` (`:318-333`) | **none** | **re-scores** vs current baselines | per-day, failures collected |
| `backfill-stuff-plus?mode=repair` (`:91,122-136`) | `AND p.stuff_plus IS NULL` | true no-op: `total_updated: 0` | `&start=`, error path only |
| `…&mode=rescore` | none by construction | rewrites every eligible row | same |
| `backfill-newsletter-encryption.ts:32-35` | `.is('email_hash', null)` | no-op; ciphertext not reproducible (§4) | via guard |
| `backfill-pitch-videos.ts:94-101,135-140`, `ignoreDuplicates:true` | skip-list of present `game_pk`s | no-op; `--force` re-fetches, flag keeps `status` | via skip-list |
| `backfill-player-stats.ts:76-86` upsert `player_id,season,stat_group` | none | rewrites + fresh `updated_at` | per-year `try/catch` |
| `backfill-wbc.ts:157-166,192-196` + name UPDATE | skip-list of ingested `game_pk`s | no-op unless a game partly landed, then re-ingests | via skip-list |

Two tests. **Guarded** (repair, newsletter): after run 1 *no row satisfies the predicate*, so assert run 2 targets zero rows. **Skip-listed** (videos, WBC): completed units drop out before the write, so assert a seeded complete unit is never fetched; the hazard is the *partial* unit called done (§5).

---

## 2. The spine: the nightly scorer re-scores, and nothing tests for it

One `UPDATE` per `game_date`; the full predicate:

```sql
FROM pitch_baselines b
WHERE p.pitch_name = b.pitch_name AND p.game_year = b.game_year
  AND p.game_date = '<day>' AND p.release_speed IS NOT NULL     -- and nothing else
```

Day-chunking is deliberate: it clears the 8s `statement_timeout` that drove Stuff+ coverage to zero. With no guard and a four-date window, a pitch on date G is re-scored nights G+1, G+2, G+3 against that morning's baselines. **A row's surviving Stuff+ was computed on `game_date + 3`.** **(verified)**

1. **"Re-running the ingest is harmless" is false**: retries, re-runs and overlapping crons are unsafe. The test naming it (*re-scoring a scored day must not change `stuff_plus`*) **fails today**; commit it failing.
2. **The two writers disagree**, so `stuff_plus` is not one testable thing: the 2026-08-11 repair touched ≈**249k** rows, leaving two vintages. Feb–May carries **+0.29 to +0.59** points of bias, June/August drift **0.000**.
3. **A rescore cannot be verified against retained inputs.** `pitch_baselines` is 206 rows keyed `(pitch_name, game_year)`, **no timestamp**, destructively upserted (`:269-277`). A test can prove the scorer pure in `(row, baseline)`, never yesterday's value right.

**Honest formulation:** the nightly path is *convergent*, settling once the baseline stops moving, but not *idempotent*; the suite should say which it asserts.

---

## 3. The double-run test: what to assert on

**Run, snapshot, run again, compare.** The comparison is the hard part.

| Assertion | Catches | Misses | Verdict |
|---|---|---|---|
| HTTP 200 / `ok: true` | crashes | everything else | **cargo-cult**: the dead route returned 200 for months |
| job's `inserted`/`total_updated` | nothing here (§4) | rewrites, garbage writes | **cargo-cult** |
| `COUNT(*)` unchanged | duplicate rows | in-place value changes | necessary, insufficient |
| `COUNT(*) WHERE <guard>` → 0 after run 1 | a guard that doesn't drain | rewrites outside it | **right first assertion (guarded)** |
| content hash of affected rows | in-place value changes | ordering, absent `ORDER BY` | **the general assertion** |
| full row-set diff | everything | a second copy | right for small fixtures |

```sql
-- Fingerprint one day; before and after must match.
SELECT md5(string_agg(game_pk||':'||at_bat_number||':'||pitch_number||':'||
  coalesce(stuff_plus::text,'null'), ',' ORDER BY game_pk, at_bat_number, pitch_number))
FROM pitches WHERE game_date = '2026-06-15';
```

`ORDER BY` inside `string_agg` is load-bearing: order is otherwise unspecified, so the test flakes. **(documented)** Keep the NULL sentinel: 4,000 NULLs rewritten and 4,000 skipped share a count.

**Where:** `vitest.config.ts` (`environment: 'node'`, 120s) makes route handlers callable; `__tests__/api/playerData.test.ts` tests extracted logic. No DB:

```ts
// The old route's bug: the loop ran exactly once.
const calls: string[] = []
const sb = { rpc: vi.fn(async (fn: string, { query_text }: any) => (
  calls.push(`${fn}:${query_text}`), { data: [{ cnt: 10, scored: 10 }] })) }
await applyStuffPlusForDateRange(sb, '2026-06-01', '2026-06-05')
expect(calls.filter(c => c.startsWith('run_mutation'))).toHaveLength(5)  // 5 days, 5 stmts
```

Against the pre-2026 route it goes red on `1 !== 5`, the bug that survived a three-month outage. It also pins the *predicate*: `query_text` must have `stuff_plus IS NULL` in repair mode, not rescore, so the tools cannot swap. **(inferred)**

---

## 4. Counters that lie, and one backfill that must not be byte-compared

**The counter.** `inserted += batch.length` fires on any error-free upsert, so `totalInserted` cannot separate 500 new pitches from 500 rewrites, and it feeds `pitches_last_run` and cache invalidation (`cron/pitches:47-68`). **`totalInserted > 0` asserts only that the network call succeeded.** Real numbers: `n_tup_ins` vs `n_tup_upd` (`pg_stat_user_tables`), or `RETURNING (xmax = 0)`. **(documented)** Until one lands, the split is unassertable.

**The non-deterministic backfill.** `backfill-newsletter-encryption.ts` is guarded (`.is('email_hash', null)`), but `encrypt()` draws a fresh GCM IV from `crypto.randomBytes(12)` per call (`lib/encryption.ts:29`), so one address encrypts to different bytes by design; "run twice, hash, compare" reports a **false failure**. Assert instead:

1. `email_hash` stable across runs: `blindIndex()` is HMAC-SHA256 (`:58-63`), deterministic, hence the dedup key.
2. `decrypt(encrypted_email) === original`: the invariant surviving re-encryption.
3. After run 1, `COUNT(*) WHERE email_hash IS NULL` is 0: run 2 writes nothing.

**Generalize:** decide up front which columns may change. `updated_at`, encrypted blobs and serials are legitimately unstable; excluding them is not weakening the test, not excluding them yields an ignored red. `backfill-player-stats.ts:112` restamps `updated_at` every run: a whole-row hash of `player_season_stats` can never be stable, its metric columns can. **(verified)**

---

## 5. Resumability: a different property, a different test

Idempotency: a completed run repeats safely. Resumability: an **interrupted** run continues. Each failure exists in isolation:

| Path (idempotency/resume status in §1) | Failure it still has |
|---|---|
| `mode=repair` | killed at 300s mid-walk → no response, no cursor, no retry |
| `mode=rescore` (**not** idempotent) | a resumed run re-scores chunks the first finished |
| `backfill-pitch-videos` | a game whose upsert half-landed is marked done |
| `backfill-wbc` | same, plus a `player_name` UPDATE outside the upsert |

Three phases:

```ts
const gold = await runBackfill(seed()), db = seed()   // uninterrupted baseline
await expect(runBackfill(db, { failAfterChunks: 3 })).rejects.toThrow()
const mid = fingerprint(db)
await runBackfill(db)                                 // resume, no args
expect(fingerprint(db)).toBe(gold)                    // converged
expect(mid).not.toBe(gold)                            // the injection bit
```

The last line matters most: without it, a harness whose injection stopped firing passes forever, the error class of a regression test never run against broken code. **(inferred)**

**Skip-lists need a partial-failure test.** `backfill-pitch-videos.ts:95-101` builds `done` from `SELECT DISTINCT game_pk FROM pitch_videos`, so a game with 40 of 300 rows landed is *permanently* skipped without `--force`; `backfill-wbc.ts:157-162` repeats it via `.in('game_pk', gamePks)`. Seed one; assert it is completed or reported, never counted done. Neither passes today. **The skip predicate must be unit-grain completeness, not one row.** **(verified)**

---

## 6. Injecting the fault that actually happens

Faults worth injecting, by observed frequency:

| Fault | Real mechanism | Injection in Vitest |
|---|---|---|
| **Statement timeout** | PostgREST `authenticator`, `statement_timeout=8s`; ~8k rows passes, ~11k fails | `rpc` stub rejects the *n*th `run_mutation`: `canceling statement due to statement timeout` |
| **Function killed** | Vercel 300s ceiling; ~180 day-chunks × ~2s ≈ 360s; no retry | reject past a wall-clock budget; assert a cursor is emitted |
| **One poison row** | one bad row fails a 500-row batch (`update:157-168`) | batch rejects once, per-row succeeds; assert 499 land, `errors === 1` |
| **Missing baseline** | a `pitch_name` with no `pitch_baselines` row is unjoinable | `cnt: 0` from the baseline check; assert 400, not a silent 0-row success |
| **Upstream shape drift** | Savant CSV column renamed | MSW handler serving altered CSV; `03-contract-testing-external-apis.md` |

The fourth's guard exists, the pattern to copy: `backfill-stuff-plus/route.ts:66-75` refuses to start on an empty `pitch_baselines`, since otherwise **every chunk is a silent no-op reporting success**. Test the refusal: happy-path-only cannot tell a live guard from a deleted one. **(verified)**

Network chaos (proxy injectors, latency shaping) is the wrong tool: one process, one Postgres, every fault above reachable from the stub. Save it for Realtime/overlay, where the network *is* the system.

---

## 7. Verifying a repair actually repaired

Jo's two-half standard: **coverage moved** (completeness) **and the distribution did not** (correctness). Half one is satisfied by writing `100` into 249k NULL rows; ~15 lines makes a manual `docs/Queries.md` read a gate.

```ts
// Post-repair gate. Fixture or staging slice, not production.
const before = await coverageAndMean(day); await repair(day)
const after = await coverageAndMean(day)
expect(after.pct).toBeGreaterThan(before.pct)  // half one: completeness
expect(after.pct).toBeGreaterThanOrEqual(99)   // floor; residual lacks release_speed
expect(after.mean).toBeCloseTo(100, 0)         // half two: the invariant
expect(Math.abs(after.mean - before.mean)).toBeLessThan(1.0)  // and no lurch
```

Half two is the skill: **stable under a correct repair, sensitive to a wrong one**.

| Repair kind | Invariant | Broken by |
|---|---|---|
| Plus-stat rescore (`stuff_plus`) | population mean ≈ 100 | stale baseline, flipped z-sign, bad `pitch_name` join |
| Raw measurement backfill | percentiles match an adjacent unrepaired day | unit error (feet vs inches), wrong column |
| Encryption backfill | `decrypt(x) === plaintext` on a sample | wrong key env var, truncated ciphertext |
| ID/crosswalk backfill | distinct natural keys unchanged | fan-out from a bad join |
| Aggregate rebuild | sum reconciles to the source table | double-counted chunk boundary |

**Two warnings.** A tolerance wide enough never to fire is decoration: derive it from the pre-repair spread; if you cannot say what would fail, it is not a test. And verifying only *inside* the repaired range misses the seam: compare an unrepaired neighbour, where the +0.29 to +0.59 Feb–May bias sits beside 0.000 in June/August. A seam-blind verification pronounced that repair clean. **(verified)**

Comparability, if it holds, is Li's: `Li/temporal-modeling/03-late-arriving-data.md`.

---

## 8. Where these tests run

Vitest 4.1.3 / Next 16.1.6 / TS 5.9.3, `npm test` → `vitest run`. Three tiers; **only tier 1 belongs on every push.**

| Tier | Needs | Runs | Catches |
|---|---|---|---|
| **1. Stubbed client** | nothing | every push, <1s | loop-once, wrong predicate, missing guard, no cursor, unhandled chunk error |
| **2. Real Postgres fixture** (Supabase CLI, Testcontainers) | Docker | pre-merge | SQL that only fails against a planner: join fan-out, timeouts, `ON CONFLICT` |
| **3. Staging slice** | seeded copy | before a large repair | chunk sizing, wall-clock budget, the gate at scale |

Tier 2 wants **transactional rollback**: each test in a transaction rolled back at teardown, `SAVEPOINT` for nested cases, so fixtures never leak. pgTAP is the alternative for SQL-shaped assertions.

**Two blockers.** The suite reports 122 tests, 93 passing, **5 failing**, all in `__tests__/lib/queryCache.test.ts` (mock lacks `.maybeSingle()`); red at rest it gates nothing and a new red test vanishes. `__tests__/integration/savantValidation.test.ts` hits live Savant and Supabase: tier 3 in the tier-1 directory.

---

## 9. What Triton should do, in order

1. **Loop-shape test for both Stuff+ writers** (§3): stubbed `rpc`, no DB; run it against the pre-2026 route: `1 !== 5`.
2. **Fix the 5 `queryCache.test.ts` failures** (`.maybeSingle()` on the mock chain) and tag `savantValidation`; nothing below is trustworthy while the suite is red at rest.
3. **Commit the failing rescore test** (§2), reason in the test name: the ratchet that makes the guard a fix, not a preference.
4. **Partial-unit test for the two skip-list backfills** (§5), then make the predicate completeness-based.
5. **Resume harness** (§5) with the `mid !== gold` assertion; drive Jo's `next_start` cursor and 240s budget off it.
6. **Automate the two-half gate** (§7) as a helper any repair calls, seam comparison included.
7. **Split `inserted` from `updated`** (§4): `RETURNING (xmax = 0)`, or `n_tup_ins`/`n_tup_upd`.

**Anti-recommendation: do not build a shared "backfill test harness" abstraction first, and do not run a production double-run in CI.** Both are wrong. **(i) The bugs are not abstraction-shaped.** Every real failure here — `COUNT(*) … LIMIT 1 OFFSET n` always empty, `ctid` paging over its own UPDATE, a missing `IS NULL` guard, a counter counting no-ops, a skip-list treating partial as done — is a predicate or loop error visible in ten lines of stub; the route ran broken three months for want of anyone running it. **(ii) The paths are heterogeneous** (§1): guarded UPDATE, skip-listed upsert, non-deterministic encryption, provider overwrite; one harness asserts nothing specific, or forces the byte-comparison the newsletter backfill must fail (§4). **(iii) A production double-run is a write, not a test.** The nightly scorer changes ~4k rows/day; rescore "to check idempotency" costs ~657k rows against a table near 81% of its autovacuum trigger, and destroys the correct values that are your control group. Test on fixtures; verify production with the read-only two-half gate.

**Single highest-leverage next action:** ship step 1: one Vitest file, three assertions (chunk count, repair predicate present, rescore predicate absent), each verified to fail against the code it protects. Under 40 lines, no DB.

---

## Sources

1. AWS Builders' Library, [Idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/): the *effect*, not the return code.
2. Apache Airflow, [Best practices](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html): schedulers re-run; non-idempotency is latent corruption.
3. dbt, [Incremental models](https://docs.getdbt.com/docs/build/incremental-models): §2's hand-rolled lookback.
4. PostgreSQL, [INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html) (§1).
5. PostgreSQL, [UPDATE](https://www.postgresql.org/docs/current/sql-update.html): `RETURNING` (§4).
6. PostgreSQL, [Monitoring statistics](https://www.postgresql.org/docs/current/monitoring-stats.html): `n_tup_ins` vs `n_tup_upd` (§4).
7. PostgreSQL, [SAVEPOINT](https://www.postgresql.org/docs/current/sql-savepoint.html) (§8).
8. PostgreSQL, [Client connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html): `statement_timeout` (§6).
9. PostgreSQL, [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html): what a chunk's commit guarantees.
10. PostgREST, [Transactions](https://docs.postgrest.org/en/stable/references/transactions.html): one transaction per request.
11. Vercel, [Function duration](https://vercel.com/docs/functions/configuring-functions/duration): 300s (§6).
12. GitLab, [Batched background migrations](https://docs.gitlab.com/development/database/batched_background_migrations/): per-batch state (§5).
13. Shopify, [job-iteration](https://github.com/Shopify/job-iteration): cursor checkpointing (§5).
14. Vitest, [Mocking](https://vitest.dev/guide/mocking) (§3, §6).
15. Vitest, [`vi` API](https://vitest.dev/api/vi): `mockRejectedValueOnce` (§6).
16. Mock Service Worker, [Docs](https://mswjs.io/docs/) (§6).
17. Testcontainers for Node.js, [Docs](https://node.testcontainers.org/) (§8).
18. Supabase, [Local development](https://supabase.com/docs/guides/local-development) (§8).
19. pgTAP, [Docs](https://pgtap.org/) (§8).
20. Stryker Mutator, [Docs](https://stryker-mutator.io/docs/): mutation testing (§3).

**Triton-internal evidence (read 2026-08-12; no database queried, no backfill executed).** `app/api/update/route.ts`: **no `stuff_plus IS NULL` guard** `:318-333`; day-chunking + 8s `:294-313`; upsert `onConflict game_pk,at_bat_number,pitch_number`, `ignoreDuplicates:false` `:148`; `inserted += batch.length` `:154`; per-row retry `:157-168`; ingested-date span `:189-193`; destructive `pitch_baselines` upsert `:269-277` (206 rows, key `(pitch_name, game_year)`, **no timestamp**). `cron/pitches/route.ts`: `addDaysToYmd(today, -3)` → `today` = **four** dates vs a "Sync last 3 days" comment `:36-38`; counter summed `:47-50`; `pitches_last_run` + invalidation `:54-68`. `admin/backfill-stuff-plus/route.ts`: `repairOnly = mode === 'repair' ? 'AND p.stuff_plus IS NULL' : ''` `:91`; half-open chunks `:100-136`; empty-baseline refusal `:66-75`; `failed_chunk` + `&start=` `:216`; `DEFAULT_CHUNK_DAYS = 1`, ~8k/~11k `:11-18`. Scripts: `backfill-newsletter-encryption.ts:32-35`; `backfill-pitch-videos.ts:94-101`, `:135-140`; `backfill-player-stats.ts:76-86` (`upserted += chunk.length`), `:112`; `backfill-wbc.ts:157-162`, `:192-196`. `lib/encryption.ts:29, 58-63`: `randomBytes(12)` per `encrypt()`, HMAC-SHA256 `blindIndex()`. Tests: `vitest.config.ts` (`environment: 'node'`, `testTimeout: 120_000`), `package.json:10, 32, 60-61` (Vitest 4.1.3 / Next 16.1.6 / TS 5.9.3); 7 files; `savantValidation.test.ts` hits live Savant + Supabase. **Packet, measured centrally 2026-08-12, quoted not re-derived:** 122 tests / 93 passing / 5 failing / 24 skipped, all in `queryCache.test.ts` (mock lacks `.maybeSingle()`); `pitches` ~8,877,621 rows / 9,711 MB, `milb_pitches` ~2,508,422; the 2026-08-11 repair ≈**249k** rows, two vintages, Feb–May bias **+0.29 to +0.59**, June/August **0.000** (`docs/Queries.md`); ~657k rows under `mode=rescore`, ~81% of the autovacuum trigger (`Jo/data-quality/11-remediation-backfill-safety.md` §5, §7).
