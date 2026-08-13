---
title: SQL Query Testing — Proving a Query Is Right Without a Copy of Production
domain: testing-data-systems
tags:
  - sql-testing
  - fixtures
  - pgtap
  - testcontainers
  - transactional-rollback
  - supabase-cli
  - rpc-contracts
sources_reviewed: 22
last_updated: 2026-08-12
---

# SQL Query Testing — Proving a Query Is Right Without a Copy of Production

> Grades: **(verified)** Cas ran or read it at `file:line`; **(documented)** vendor docs; **(inferred)**
> mechanism; **(cargo-cult)** repeated, unsupported. No production query was run.

## TL;DR

- **No Triton test executes SQL against Postgres.** `reportQueryBuilder.test.ts` asserts on generated *strings*; `savantValidation.test.ts` runs live SQL against **production**. **(verified)**
- **Mocking the Supabase client tests your mock.** `queryCache.test.ts` stubs `.single()` where `lib/queryCache.ts:22` calls `.maybeSingle()`; its four failures are drift, not behavior. **(verified)**
- **The blocker is not tooling; the schema is not in version control.** Code calls **20 distinct RPCs**, **3** are defined in the repo, `run_query` (**106 call sites**) none. **(verified)**
- **The CLI is installed (v2.95.4) and linked, but the stack was never scaffolded:** `supabase/` holds only `.temp/`: no `config.toml`, no `migrations/`, nothing for `db reset` to replay. **(verified)**
- **`supabase start` beats testcontainers on roles, not convenience:** RLS needs `anon`/`authenticated`/`authenticator` and PostgREST's `SET LOCAL role`, which bare `postgres:17` cannot supply. **(documented)**
- **Transactional rollback, the cheapest isolation, is unreachable through `@supabase/supabase-js`:** every PostgREST call is its own transaction, so DB tests need a direct connection; `package.json` has **no Postgres driver**. **(documented)**
- **Seed size is wildly asymmetric, and that decides the fixture strategy:** `pitch_baselines` (**206 rows / 72 kB**) and `league_averages` (**1,806 / 616 kB**) seed *verbatim*; `pitches` at **9,711 MB** never does. **(verified)**
- **Three live defects are each one fixture row from a red test:** a median documented but `AVG()` implemented; an SP/RP rule documented but unimplemented; a Stuff+ `UPDATE` with no `stuff_plus IS NULL` guard. **(verified)**
- **A fixture database proves semantics, never performance.** 200 seeded rows always beat the 8s timeout that 8.9M rows blow through; green locally is not timeout evidence. **(inferred)**
- **"Point tests at a schema in the prod project" destroys the prod project:** ~20 concurrent readers already took this instance down for an hour. **(verified)**

---

## 1. Three separable layers, usually conflated

| Layer | Question | Needs a DB? | Triton today |
|---|---|---|---|
| **Generation** | Does the TS emit the SQL I meant? | No — strings | `reportQueryBuilder.test.ts`, 171 lines: all of it |
| **Semantics** | Does Postgres return the right rows and numbers? | **Yes, real** | **None** |
| **Deployment contract** | Does the deployed function still take these args, respect RLS, beat the timeout? | *Realistic* one | None |

Layer 1 is cheap and Triton has it. It catches no `AVG()` standing in for a median, `LEFT JOIN` that should be `INNER`, NULL that swallows a row, or `count(DISTINCT …)` past the timeout. Every §6 defect is layer 2.

A fourth thing masquerades as layer 1: `__tests__/api/playerData.test.ts` reimplements `prefixColumns()` and asserts on its copy, while the route's logic sits inline at `app/api/player-data/route.ts:43`, imported nowhere — **a test of the test**, and why "1 API-route test" overstates coverage. **(cargo-cult)**

---

## 2. Why mocking the client is not testing the query

The repo ran the experiment: `queryCache.test.ts` stubs a chainable `.single()`; `lib/queryCache.ts:22` calls `.maybeSingle()`, 0 rows being a normal cache miss (2026-08-12):

```
TypeError: supabaseAdmin.from(...).select(...).eq(...).gt(...).maybeSingle is not a function
 Test Files  2 failed | 4 passed (6)   Tests  5 failed | 93 passed (98)
```

1. **The mock encodes a builder API, not a query.** Never touching Postgres, it cannot say whether `.gt('expires_at', now)` excludes the boundary row, or whether RLS hides it from `anon`.
2. **It is *fixture drift* with a mock's blast radius.** A database never desyncs from itself; a hand-written double does, on any refactor, hiding what else changed. Mocking Supabase *correctly* is `11-vitest-nextjs-patterns.md`'s; **where correctness is in SQL, the double is the wrong tool at any level of craft.**

The other failure cuts the other way: `leagueStats.test.ts:37-41` pins `computePlus(91, 90, 0) === Infinity` as "no guard against zero stddev", but `lib/leagueStats.ts:1322` now returns `100` — red because the bug got fixed. **A characterization test that pins a defect is a false alarm the day it is repaired**: pin intended semantics, or delete the test with the bug. **(verified)**

---

## 3. Where the SQL should actually run

| Option | Fidelity | Setup | Per-test | Verdict for Triton |
|---|---|---|---|---|
| Hand-rolled client mock | none | low | ~0 | **No** (§2) |
| **PGlite** (WASM) | real planner, no extensions/roles | low | 50–200 ms | Pure-SQL semantics; no RLS |
| **`@testcontainers/postgresql`** | real Postgres | Docker + image | 1–3 s | Fine for generic Node; **wrong here** |
| **`supabase start`** | PG **17.6** + PostgREST + pgTAP + roles | one `config.toml` | 0 once up | **Yes — recommended** |
| Supabase **branch** (cloud) | identical to prod | project setting | seconds, billed | Migration/RLS checks in CI, not the loop |
| Schema in the **prod project** | perfect | trivial | catastrophic | **Never** (§10) |
| Restored copy of prod | perfect | 12 GB restore | slow | Infeasible: `pitches` is 9,711 MB |

The CLI stack wins on an axis the others cannot reach: Triton's correctness is SQL run by PostgREST as `authenticator`, `SET LOCAL role`-ing to `anon`/`authenticated` against `SECURITY DEFINER` functions whose grants were revoked from them (`fix-security-advisories.sql:264-266`). A bare container has no such roles, so its tests pass on statements production refuses.

---

## 4. The prerequisite nobody costs: there is no schema to load

Every option but the last two assumes you can build the schema. Triton cannot.

| Artifact | Expected home | Actual state |
|---|---|---|
| Migrations | `supabase/migrations/*.sql` | **absent** |
| CLI config | `supabase/config.toml` | **absent** |
| CLI link metadata | `supabase/.temp/` | present, **git-tracked**, incl. `pooler-url` |
| DDL | ordered migrations | 31 ad-hoc `scripts/*.sql`, no order, no ledger |
| Functions | migrations | **3 of 20** RPCs used in code on disk |

Call sites without definitions: `run_query` **106**, `run_query_long` 16, `run_mutation` 13, `search_players` 15. `fix-security-advisories.sql` *alters* `run_query` — it exists, undocumented. A fresh local stack is a database where **not one Triton query runs**; the first unit of work is a schema dump:

```bash
supabase init                      # writes supabase/config.toml
supabase db dump --linked -f supabase/migrations/00000000000000_baseline.sql
supabase db dump --linked --data-only --schema public \
  --table pitch_baselines --table league_averages -f supabase/seed.sql
supabase db reset                  # proves the baseline replays
```

`db dump` is a one-off **schema** read, not the load that took the instance down; the closing `db reset` is the real test. Migrations and CI gating are `10-ci-cd-for-data-apps.md`'s; **SQL testing is blocked on this, and no framework choice unblocks it.** While dumping, `.gitignore` `supabase/.temp/`, whose pooler string is committed. **(verified)**

---

## 5. Isolation: rollback, template, or truncate

| Strategy | Mechanism | Reset cost | Catch |
|---|---|---|---|
| **Transactional rollback** | `BEGIN` → test → `ROLLBACK` | ~0 | Connection held per test; nothing under test may `COMMIT` |
| **Template database** | `CREATE DATABASE t TEMPLATE triton_seed` | copy, ~100 ms | No session connected to the template |
| **Truncate + reseed** | `TRUNCATE … RESTART IDENTITY CASCADE` | ∝ seed | Slowest; only one safe for multi-transaction code |
| **Nothing (shared DB)** | — | 0 | Order-dependent; flaky in parallel |

Rollback is the Rails/Django default and should be Triton's, with a catch:

> **You cannot open a transaction through `@supabase/supabase-js`.** Every PostgREST request runs in its own transaction, committing before it returns, so `rpc('run_query', { query_text: 'BEGIN' })` leaves nothing open. Rollback-per-test needs a **direct Postgres connection**; `package.json` lists neither `pg` nor `postgres`.

One devDependency:

```ts
// __tests__/db/harness.ts — one connection, one transaction per test, never committed.
import postgres from 'postgres'
export const db = postgres(process.env.TEST_DATABASE_URL!, { max: 1 })

class Rollback extends Error {}
export function withRollback(body: (tx: postgres.TransactionSql) => Promise<void>) {
  return async () => {
    try { await db.begin(async tx => { await body(tx); throw new Rollback() }) }
    catch (e) { if (!(e instanceof Rollback)) throw e }
  }
}
```

**(a)** `TEST_DATABASE_URL` must be impossible to confuse with production: a hard `beforeAll` refusing anything but `127.0.0.1`. **(b)** Anything reaching the DB through the app's client (a route handler, `run_query`) commits *outside* your transaction and leaks — template or truncate those. **(c)** One held connection forces `fileParallelism: false` or a template-cloned DB per file.

---

## 6. Three defects a fixture row would turn red

**(a) Documented median, implemented mean.** `CLAUDE.md` and `docs/VARIABLES.md` call `league_averages` "50th-percentile benchmarks"; the DDL comment at `create-league-averages.sql:36` says "Mean of the metric"; `refresh_league_averages()` computes `AVG(...)`/`STDDEV_SAMP` (`create-refresh-league-averages.sql:200-207`). A skewed five-player fixture separates them in one assertion — mean 6.2 vs median 3.0, where real data would not:

```sql
-- supabase/tests/league_averages.test.sql  (pgTAP: `supabase test db`)
BEGIN;
SELECT plan(1);
-- five qualified pitchers, one extreme: 1,2,3,4,21
SELECT refresh_league_averages(2099);
SELECT is(
  (SELECT value FROM league_averages
    WHERE season=2099 AND level='MLB' AND role='SP' AND metric='k_pct'),
  3.0::numeric, 'league_averages.value is the median the docs promise');
SELECT * FROM finish();
ROLLBACK;
```

That fails today. Which side moves is Li's call (`Li/metric-governance/`); tolerances are `09-numeric-regression-detection.md`'s, and this needs none.

**(b) A qualification rule documented twice, differently.** `create-league-averages.sql:9` calls SP/RP classification "first-inning game share > 0.5"; the function uses `COUNT(*) FILTER (WHERE pc >= 50) >= 3` (`create-refresh-league-averages.sql:318`). A fixture pitcher with three 60-pitch relief outings and no first innings is **SP** by code, **RP** by comment — one `is()` on `role` pins which is real.

**(c) An `UPDATE` with no idempotence guard.** `app/api/update/route.ts:321-333`:

```sql
UPDATE pitches p SET stuff_plus = GREATEST(0, LEAST(200, ROUND(100 + …)))
FROM pitch_baselines b
WHERE p.pitch_name = b.pitch_name AND p.game_year = b.game_year
  AND p.game_date = '${day}' AND p.release_speed IS NOT NULL
```

No `AND p.stuff_plus IS NULL`. Re-running the window rescores rows against *today's* baselines — and `pitch_baselines` is upserted destructively — so a rerun mixes vintages in one column. Seed 10 pitches and a baseline row, score, mutate the baseline, score again, assert day one is unchanged (`04-idempotency-backfill-testing.md`). The interpolated `'${day}'` recurs at all 106 `run_query` call sites, making an injection test on `buildWhereParts` cheap.

---

## 7. pgTAP or Vitest — a split, not a competition

| Put it in **pgTAP** | Put it in **Vitest** |
|---|---|
| Function contracts: `has_function`, arg types, return shape | SQL the TS *generates* (`buildReportQuery`, `buildWhereParts`) |
| RLS: `policies_are`, "anon sees 0 rows in `pitches`" | Route-handler behavior around the query |
| Constraints, `CHECK`s, PK/FK, index existence | Numeric results consumed by the app |
| `refresh_*` set-returning behavior | Anything needing fetch mocking or app config |
| Truth *inside* the database | Truth spanning DB and app |

pgTAP ships in the local stack, runs via `supabase test db`, and its `BEGIN … ROLLBACK` wrapper gives §5's isolation free. It is where Triton's biggest gap sits: RLS is enabled but unverified, and `SECURITY DEFINER` functions with revoked grants are a footgun only a role-aware test finds (`enable-rls.sql:6`). The opposite trap: a pgTAP suite grown into metric testing becomes an untyped second application — keep the boundary at *whose invariant is it*, with golden-file comparison in Vitest (`05-golden-file-metric-testing.md`).

---

## 8. What a fixture database can never tell you

| Property | Fixture DB verdict | Why |
|---|---|---|
| Row-level correctness | **Reliable** | Same planner, types, NULLs |
| Constraint / RLS behavior | **Reliable** with real roles | Needs the Supabase stack |
| Plan shape | Unreliable | Seq scan on 200 rows regardless of index |
| **Statement timeout** | **Useless** | Everything fits in 8s at fixture scale |
| Lock and vacuum behavior | Useless | No concurrency or bloat |

Concretely: the RPC path is capped at **8s**, `count(DISTINCT …)` over `pitches` exceeds it, and the ingest upsert sits at 94.8% of the cap (`reliability-findings-2026-08-11.md:178`) — 8.9M rows being the cause, which nothing seeded reproduces. Timeouts and plans are **Jo**'s (`Jo/postgres-performance/`).

A fixture *can* assert timeout **configuration**: `SELECT proconfig FROM pg_proc WHERE proname='run_query_long'` checks in one pgTAP line that the 120s override survived deploy — the regression that silently reverts heavy reads to 8s.

---

## 9. Seeding: use the asymmetry

| Table | Rows / size | Fixture treatment |
|---|---|---|
| `pitch_baselines` | **206 / 72 kB** | **Commit whole** — cheaper than sampling logic |
| `league_averages` | **1,806 / 616 kB** | **Commit whole** — also `refresh_league_averages`'s output |
| `players` | 16,931 / 1,632 kB | Whole, or ~200 fixture-referenced |
| `compete_pitches` | 443 | Whole — athlete data; anonymize |
| `pitcher_season_command` / `_deception` | 27,119 / 17,386 | Slice pitcher-seasons |
| `player_season_stats` | 79,061 / 13 MB | Slice |
| `pitches` / `milb_pitches` | 8.88M / **9,711 MB**; 2.51M / 2,366 MB | **Hand-write tens of rows**; never sample at volume |

The top two are the unlock: `pitch_baselines` fits in 72 kB, so a test can seed the *real* baselines and league averages, then assert a metric over a few hand-written pitches matches an independently derived value. Slicing the big tables, anonymizing athlete data, and fixture drift are `08-test-data-management.md`'s; the asymmetry drives the *first* seed file — two `--data-only` dumps.

---

## 10. What Triton should do, in order

1. **`supabase init`, `supabase db dump --linked` → `supabase/migrations/00000000000000_baseline.sql`, `supabase db reset` to prove it replays.** Nothing else is possible first; `.gitignore` `supabase/.temp/` too.
2. **Dump `pitch_baselines` and `league_averages` `--data-only` → `supabase/seed.sql`** — 2,012 rows of real parameters, no judgment needed.
3. **Write one pgTAP file and make it fail:** §6(a)'s median-vs-mean assertion, catching a real defect on day one.
4. **Add `postgres` (or `pg`) plus §5's `withRollback` harness**, with a `beforeAll` refusing any `TEST_DATABASE_URL` but `127.0.0.1`.
5. **Split Vitest into `unit` and `db` projects** (`fileParallelism: false`, opt-in) so the DB suite never slows the 203 ms loop.
6. **Fix the two masking failures** (`queryCache.test.ts`'s `.maybeSingle()` mock; `leagueStats.test.ts`'s stale `Infinity`) — a red suite cannot tell you a new DB test went red.
7. **Add pgTAP RLS assertions** for the tables `scripts/enable-rls.sql` protects, plus §8's `proconfig` check.
8. **Move `savantValidation.test.ts` off production** onto the seeded stack, keeping the Savant fetch as a tagged contract test (`03-contract-testing-external-apis.md`).

**Anti-recommendation — do not reach for `@testcontainers/postgresql` first.** The standard Node answer is wrong on three grounds. **(i) Wrong problem.** Not "no Postgres available" but **17 of 20 RPCs the code calls have no definition on disk**; a pristine container boots an empty database where no meaningful test can be written, and step 1's dump is needed anyway. **(ii) Fidelity is worst where it matters.** `postgres:17` has no `anon`/`authenticated`/`authenticator` role, no PostgREST, no pgTAP, no `SET LOCAL role`, while Triton's untested surface is mostly RLS and `SECURITY DEFINER` grants (`fix-security-advisories.sql:264-266`). **(iii) The cost lands where there is no budget.** The CLI is **already installed (v2.95.4) and linked**, pinning Postgres **17.6.1** to match production; testcontainers adds Docker and a 1–3 s cold start per file to a repo with **no CI workflow that runs tests** (one data-ingest cron in `.github/workflows/`).

Two smaller don'ts. **No `test` schema in the production project** — ~20 concurrent readers took this instance down for an hour, and no `search_path` discipline survives a `SECURITY DEFINER` function. **No restored copy of production**: `pitches` alone is 9,711 MB, and a fixture nobody can rebuild in an hour goes unrebuilt.

**Single highest-leverage next action:** run step 1 today — one read-only `supabase db dump --linked` against an already-linked project, turning "Triton cannot test SQL" from an architectural problem into a backlog.

---

## Sources

1. Supabase — [Local development with the CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — §3.
2. Supabase — [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations) — `db dump --linked`; step 1.
3. Supabase — [Seeding your database](https://supabase.com/docs/guides/local-development/seeding-your-database) — `seed.sql`; step 2.
4. Supabase — [pgTAP advanced testing](https://supabase.com/docs/guides/local-development/testing/pgtap-extended) — §7.
5. Supabase CLI — [`supabase test db`](https://supabase.com/docs/reference/cli/supabase-test-db) — §6(a).
6. Supabase — [Branching](https://supabase.com/docs/guides/deployment/branching) — §3.
7. Supabase — [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — the role model.
8. PostgREST — [Stored procedures / RPC](https://postgrest.org/en/stable/references/api/functions.html) — one transaction per request; §5.
9. pgTAP — [Home](https://pgtap.org/) — `is`, `has_function`, `policies_are`.
10. pgTAP — [Documentation](https://pgtap.org/documentation.html) — `plan()`/`finish()`.
11. pgTAP — [`pg_prove`](https://pgtap.org/pg_prove.html) — SQL suites in CI without the CLI.
12. Basejump — [supabase-test-helpers](https://github.com/usebasejump/supabase-test-helpers) — step 7.
13. Testcontainers for Node — [PostgreSQL module](https://node.testcontainers.org/modules/postgresql/) — the option §10 declines.
14. PGlite — [Home](https://pglite.dev/) — §3.
15. PostgreSQL — [Template databases](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html) — §5.
16. PostgreSQL — [`SET TRANSACTION`](https://www.postgresql.org/docs/current/sql-set-transaction.html) — §5.
17. PostgreSQL — [Client connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — §8.
18. PostgreSQL — [Aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — §6(a).
19. PostgreSQL — [Populating a database](https://www.postgresql.org/docs/current/populate.html) — reset cost.
20. Rails — [Testing guide](https://guides.rubyonrails.org/testing.html) — transactional fixtures.
21. Django — [Testing overview](https://docs.djangoproject.com/en/5.2/topics/testing/overview/) — `TestCase` vs `TransactionTestCase`.
22. Vitest — [Test projects](https://vitest.dev/guide/projects) — step 5.

**Triton-internal evidence** (2026-08-12, branch `fix/stuff-plus-statement-timeout`). **Suite:** `npx vitest run __tests__/lib __tests__/api`, 203 ms, output as in §2; 4 failures in `queryCache.test.ts` (stub `.single()` at :22 vs `lib/queryCache.ts:22`), 1 at `leagueStats.test.ts:37-41` (vs the guard at `lib/leagueStats.ts:1320-1324` returning `100`) — correcting `Cas/context/triton-context.md:77-80`, which blames all five on `queryCache`. **Inventory:** 7 files / 1,310 lines — `reportQueryBuilder.test.ts` 171 (strings; exports `lib/reportQueryBuilder.ts:173,196,201`), `savantValidation.test.ts` 404 (`rpc('run_query_long')` on production, :60-70), `playerData.test.ts` 41 (local `prefixColumns`), `leagueStats` 326, `sql` 157, `outingCommand` 129, `queryCache` 82; none runs SQL on Postgres. **Schema gap:** grepping `rpc('…')` over `app lib scripts components` → 20 RPCs (`run_query` 106 call sites, `run_query_long` 16, `search_players` 15, `run_mutation` 13, `search_batters` 7, `search_all_players` 5); `CREATE OR REPLACE FUNCTION` appears 7× in 31 `scripts/*.sql`, only `refresh_league_averages`/`_percentiles`/`refresh_materialized_views` also called (3 of 20); `run_query` altered, never defined (`scripts/fix-security-advisories.sql:206,212,264,266`). **CLI:** v2.95.4 at `/opt/homebrew/bin/supabase`; `supabase/` = `.temp/` only — `linked-project.json` (ref `xgzxfsqwtemlcosglhzr`), `postgres-version` `17.6.1.063`, `rest-version` `v14.1`, `pooler-url`; nine tracked files, no `config.toml`, no `migrations/`, no `.gitignore` entry. **§6:** citations as given inline, plus `create-refresh-league-averages.sql:500`, which repeats the `COUNT(*) FILTER (WHERE pc >= 50) >= 3` filter. **CI:** `.github/workflows/` = `retro-ingest.yml`; nothing runs `npm test`. **Config:** `vitest.config.ts` — `node`, `dotenv/config`, `testTimeout: 120_000`, no projects; `package.json` — `vitest ^4.1.3`, `@supabase/supabase-js ^2.97.0`, no PG driver. Table sizes, the 8s cap and 94.8% figure: central 2026-08-12 packet + `docs/reliability-findings-2026-08-11.md:178`; the ~20-reader outage, project memory.
