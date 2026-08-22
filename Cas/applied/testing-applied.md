---
title: Testing the Data Path — Applied Playbook
domain: applied
tags:
  - testing
  - vitest
  - golden-files
  - contract-testing
  - idempotency
  - ci
  - fixtures
  - numeric-regression
last_updated: 2026-08-22
---

# Testing the Data Path — Applied Playbook

## TL;DR

- **The suite is red, and it is two bugs, not one.** Re-run 2026-08-22: 5 failed / 93 passed / 24 skipped in 229 ms. **Four** are the `.maybeSingle()` mock gap; the fifth is `leagueStats.test.ts`. Both `Cas/context/triton-context.md` and the build packet say all five are `queryCache`; they are wrong. **(verified)**
- **Nothing else in this domain is worth building until `npx vitest run` exits 0.** A sixth test added beside five known failures is ignored the first time it goes red. **(inferred)**
- **Golden-file tests over metric output are the highest-leverage new tests**, because `Li/applied/metric-governance-applied.md` items 1, 3 and 4 change three metric definitions and nothing in the repo would detect the drift. **(verified)**
- **The founding backfill bug dies to a three-line assertion that the loop iterates twice** — no database, no fixture, zero rows. **(verified)**
- **A contract test here asks whether the payload still carries the columns we depend on, not whether the API responds.** Both drift modes return HTTP 200 and an empty result. **(verified)**
- **Additive drift is the outage, and the mechanism is `app/api/update/route.ts:152`** — the parsed row is upserted whole, so one new Savant column fails the batch, then all 500 retries. **(verified)**
- **The only thing keeping `npm test` off production Postgres is a file that does not exist.** `dotenv/config` reads `.env`; the keys live in `.env.local`. **(verified)**
- **A test that has never failed proves nothing.** Every item below names how to make it red first. **(documented)**

---

## NOW (0–6 weeks)

### 1. Turn the suite green — two bugs, three fixes, one judgement call

**Fix A (four failures, one line).** `__tests__/lib/queryCache.test.ts:21` builds a mock chain by
enumerating seven builder methods — `select`, `eq`, `gt`, `lt`, `like`, `single`, `upsert`.
`lib/queryCache.ts:22` calls `.maybeSingle()`, the eighth, so every call throws
`TypeError: … .maybeSingle is not a function`. Production is correct; the mock is stale. Do not add
`chain.maybeSingle` — that repeats the defect the next time the query builder moves. Replace
`setupMockChain` with the recursive `Proxy` mock in
`Cas/testing-data-systems/11-vitest-nextjs-patterns.md`, which has no method list to drift.
**(verified)**

**Fix B (the fifth failure, a judgement call).** `__tests__/lib/leagueStats.test.ts:37-41` asserts
`computePlus(91, 90, 0) === Infinity` and comments "documents the current behavior — no guard against
zero stddev." `lib/leagueStats.ts:1322` now guards and returns 100. The test is red because the code
got *better*. Rewrite the assertion to `toBe(100)` and change the comment to state the guard is
deliberate — an approval test that still names the old behaviour will be reverted by the next reader.
**(verified)**

**Fix C (the gap the file declares).** `__tests__/lib/queryCache.test.ts:12` imports
`invalidateCache` and `purgeExpired` and asserts nothing about either — the two whose behaviour is
least understood. The old mock could not test them anyway: `chain.like`/`chain.lt` return the chain,
which is not a thenable, so `await` resolves to the chain object and any implementation passes.
With the Proxy mock, assert `invalidateCache('trends:')` issues `.like('cache_key', 'trends:%')`
(`lib/queryCache.ts:80`), that a prefix containing `_` or `%` is **not** escaped, and that
`getCached` returns `null` on a query error (`:22-27`) — then read that last one as the bug report
it is: miss, expired and errored are indistinguishable, so a cache failing every read looks exactly
like a cold one. **(verified)**

**Stop condition:** `npx vitest run` reports `0 failed`, every export of `lib/queryCache.ts` has an
assertion, and deleting the body of `invalidateCache` makes the suite red. Amend
`Cas/context/triton-context.md` § "Testing Reality" in the same commit. **Cost:** half a day.

### 2. Golden-file tests for metric output — before Li changes anything

The highest-leverage new tests here, and the one item with a hard ordering constraint: the golden
must exist **before** `Li/applied/metric-governance-applied.md` items 1 (park factors), 3
(pitch-count floor) and 4 (Stuff+ source) land, or those restatements ship unmeasured. There are
zero golden files today, and none of the seven test files imports `lib/metricRegistry.ts` — which
formats, colours and totals all 69 metrics. **(verified)**

**The fixture.** One checked-in file, `__tests__/fixtures/pitches-669203-2024.json`: ~500 rows for
one pitcher-season, scrubbed to the 70 columns at `app/api/player-data/route.ts:5`. Draw it once
through the Savant path `__tests__/integration/savantValidation.test.ts` already uses, then never
touch the network again. Four hostile rows are deliberate: a NULL `launch_speed` (which
`lib/pitcherStats.ts:130` averages unfiltered, coercing to 0), a genuine 0° `launch_angle` (which
`:131` `.filter(Boolean)`s away), an `AZ` team row (absent from `PARK_FACTORS`), and a row with
`stuff_plus` NULL but `stuff_rv` present (the substitution at `lib/pitcherStats.ts:292`).

**What gets pinned.** Two goldens under `__tests__/golden/`; a third, `metric-doc-gaps.json`, is
Li's drift test, specified assertion by assertion in
`Cas/testing-data-systems/05-golden-file-metric-testing.md` §4.3:

| Golden | Produced by | Catches |
|---|---|---|
| `pitcher-stats.tsv` | `calcTraditionalByYear` (`lib/pitcherStats.ts:57`), `calcAdvancedByYear` (`:119`), `calcArsenal` (`:248`) | formula edits, aggregation-shape bugs |
| `registry-render.tsv` | `formatMetric` × `getCellColor` × `calcTotalsFromRegistry` (`lib/metricRegistry.ts:608,618,643`) over every `GROUP_COLUMNS` key | format, colour band, totals-strategy changes |

**How it fails informatively rather than as a wall of diff.** Four mechanisms, all required:

1. **One sorted line per metric key, TSV** — `key\tvalue\tcolorClass` — so a diff names which
   metrics moved instead of reflowing a JSON blob.
2. **Rendered strings, not floats.** `formatMetric` returns `toFixed` output: nothing to tune, no
   float noise. Raw-float tolerances live in
   `Cas/testing-data-systems/09-numeric-regression-detection.md` — note that
   `__tests__/lib/sql.test.ts:16`'s `toBeCloseTo(3.24, 1)` accepts any FIP in [3.19, 3.29].
3. **A non-degeneracy floor beside every snapshot** — `expect(rows.length).toBeGreaterThan(60)`.
   A lost fixture row or a `GROUP_COLUMNS` rename otherwise snapshots an empty table and passes
   forever. This is how goldens die.
4. **A messaged `expect` for the metrics under active change** — Stuff+, wRC+, Cmd+ — so a Li
   restatement prints `Stuff+ moved 103 → 99 (n=487)` above the file diff.

`toMatchFileSnapshot` writes files that appear in `git diff`, and `vitest run` (no `-u`) fails on a
changed or missing snapshot, so an update takes a deliberate local `-u` and a reviewable diff.
**(documented)**

**Make it red first:** change `COMMAND_WEIGHTS` in `lib/leagueStats.ts` by 0.01, confirm
`pitcher-stats.tsv` fails and names Cmd+, revert, confirm green.

**Stop condition:** a one-character edit to any formula in `lib/pitcherStats.ts` or
`lib/leagueStats.ts` fails the suite with the metric named. **Cost:** two days including the fixture.

### 3. A CI shape that fits one developer, Vercel and a 229 ms suite

`.github/workflows/` holds one file, `retro-ingest.yml`, on `schedule` + `workflow_dispatch`. Nothing
in the repo has a `pull_request` trigger; nothing invokes `vitest`, `tsc` or `eslint`. The gateable
suite is 98 tests in 229 ms — gating every PR costs `npm ci`, not the tests. **(verified)**

Add `.github/workflows/ci.yml`, `on: pull_request` + `push: [main]`, one job, three steps after
`npm ci`:

```yaml
- run: npx vitest run __tests__/lib __tests__/api __tests__/golden
- run: npx tsc --noEmit          # tsconfig.json:7-8 — strict, noEmit already
- run: npx eslint .              # package.json "lint": "eslint"
```

**The path list is the whole safety design.** `__tests__/integration/savantValidation.test.ts:38` is
`describe.skipIf(!hasEnv)`; were `hasEnv` ever true it would fire live `run_query_long` calls at
production Postgres plus a 90 s Savant fetch — which is why `vitest.config.ts:13` carries
`testTimeout: 120_000`. Including that directory buys a green light meaning nothing when it skips
and a production query when it does not.

**No test may touch the production database.** Today that holds by accident: `vitest.config.ts:12`
loads `dotenv/config`, which reads `.env`; this repo has only `.env.local`, so
`SUPABASE_SERVICE_ROLE_KEY` is unset and 24 tests skip. One `cp .env.local .env` re-arms them
silently. Make it deliberate: a setup file for the default project that throws if that key is
present and stubs `globalThis.fetch` to throw "unit tests are offline — add a fixture". Fixtures
replace it: item 2's pitch JSON, item 5's saved Savant header and error page, item 4's injected
`q`/`m` stubs. Never CI secrets — `retro-ingest.yml:50-51` proves secrets reach production from
Actions, and that job is an ingest, not a gate. `vitest bench` over `lib/enrichDerivedFields.ts` and
`lib/filterEngineCore.ts` is free in the same job — both are pure, the env is already `node` — and
the bench fixture doubles as a property test that is **red today**: one pitch must score the same
`cluster`/`hdev`/`vdev` inside a 500-row fixture and inside a 5,000-row superset, and it does not,
because `lib/enrichDerivedFields.ts:38-52` builds centroids from `allRows`.

**Stop condition:** a PR that reverts item 1's fix cannot merge green. **Cost:** half a day.

### 4. Idempotency and pagination tests, demonstrated against the founding bug

`/api/admin/backfill-stuff-plus` shipped broken and stayed broken because nothing exercised it. Its
`hasMore` probe was `SELECT COUNT(*) … LIMIT 1 OFFSET n`, which returns zero rows for any `n > 0`
because `COUNT` yields a single row — so it always stopped after one batch, and that batch tried to
rewrite the whole year and timed out. The rewrite is documented in
`app/api/admin/backfill-stuff-plus/route.ts:29-33`. **(verified)**

Testability first: the loop is unreachable while `q`/`m` are module-level closures over
`supabase.rpc` (`route.ts:8-9`). Take the injection, not a mock of the module — `runBackfill(deps)`
where `deps = { q, m, now }`, plus a pure `planChunks(rangeStart, rangeEnd, chunkDays)`.

Then three tests, each with a stub table of zero real rows:

- **T1 — the loop iterates.** Stub `q` to report three chunks' worth remaining; assert `m` is
  called more than once and that `planChunks` covers `[start, end]` with no gap and no overlap.
  **Red against the old code:** re-implement the `LIMIT 1 OFFSET n` probe in the stub and T1 fails
  on the second iteration never happening. That is the three-line assertion that would have caught
  the founding bug, and it is why this test exists.
- **T2 — the second run is a no-op.** Run twice against a stub recording writes; assert
  `mode=repair` writes zero rows the second time (`AND p.stuff_plus IS NULL`, `route.ts:91`) and
  that `mode=rescore` produces an identical **content hash**, not merely an identical row count.
  **Red against the nightly scorer**, which predicates on the baseline join and `game_date` with no
  NULL guard and so rewrites the same pitches four nights running —
  `Cas/testing-data-systems/04-idempotency-backfill-testing.md`.
- **T3 — the wall-clock budget.** Inject `now`; assert the loop returns a resume cursor before the
  300 s ceiling at `route.ts:6`. There is no budget today, so T3 is red until a cursor exists.

**Stop condition:** all three green, and each demonstrated red first by reverting the corresponding
guard. **Cost:** two days, most of it the extraction.

---

## NEXT (6 weeks – 6 months)

### 5. Contract tests against Savant and MLB — assert columns, not liveness

Both drift modes here return **HTTP 200**. `lib/savantCsv.ts:70` and `app/api/update/route.ts:87`
treat any body under 100 bytes as a no-games day, and `update:133` keeps a parsed row only
`if (row.game_pk)`. So a renamed key drops every row and the cron reports
`{fetched: 0, inserted: 0, errors: 0}` — byte-identical to an off-day in February. A liveness check
passes through all of it. **(verified)**

**Assertion A — required columns present.** Fetch one day of CSV, parse the header, assert it is a
superset of what Triton reads. Name them: the upsert conflict key `game_pk, at_bat_number,
pitch_number` (`update:148`); the ingest predicates `game_date`, `game_year`, `game_type`,
`pitcher`, `batter`, `pitch_type`, `pitch_name`, `release_speed`, `inning_topbot`, `home_team`,
`away_team`; the derived-field inputs `plate_x`, `plate_z`, `sz_top`, `sz_bot`, `pfx_x`, `pfx_z`,
`release_pos_x`, `release_pos_z`, `release_extension`, `vy0`, `vz0`, `ax`, `ay`, `az`
(`lib/enrichDerivedFields.ts`); and the 70-column payload at `app/api/player-data/route.ts:5`, the
authoritative list.

**Assertion B — no additive drift, the catastrophic case.** Jo's finding 12n is right and the
mechanism is `update/route.ts:152`: the parsed row is upserted **whole**, so a column Savant adds
that `pitches` lacks makes PostgREST reject the whole 500-row batch; `:161` retries all 500
individually and all 500 fail. `inserted: 0`, HTTP 200, every night. Assert `headers ∖ known` is
empty against `__tests__/contracts/savant-columns.json` — 119 columns as of 2026-08-12, 33 of them
appearing in no repo TypeScript or SQL
(`Cas/testing-data-systems/03-contract-testing-external-apis.md`). **Then fix the code the test
justifies:** whitelist the payload to known columns before upsert, which turns additive drift from
a nightly outage into a warning.

**Assertion C — an error page is not an off-day.** Save one as
`__tests__/fixtures/savant-error-page.html`, run it through the parser, assert a `reason`
discriminator distinguishes it — the test half of `Jo/applied/data-reliability-applied.md` N7,
where Jo owns the `reason` field and the `errors > 0` throw and Cas owns the fixture.

**Where it runs:** a nightly `schedule` workflow, never on `pull_request` — upstream flakiness must
not block a merge — and it must **fail**, never skip. `skipIf(!hasEnv)` is how the existing
integration file achieved permanent green.

**Stop condition:** deleting `game_pk` from a saved header fixture fails assertion A; adding
`api_new_metric` to it fails assertion B.

### 6. Test routes by pinning the SQL they emit

Zero of the repo's 195 route handlers are imported by a test.
`__tests__/api/playerData.test.ts:5` re-declares `BASE_COLUMNS` and asserts against the copy: the
route has **70** columns, the copy **67** — `attack_angle`, `attack_direction` and `swing_path_tilt`
shipped and the test never noticed. A transcription, green and wrong. **(verified)**

**The harness.** `environment: 'node'`, the Supabase module mocked to a recorder that captures every
`query_text`, and the emitted SQL snapshotted to `__tests__/golden/`. No database, no Next harness,
no jsdom — `Cas/testing-data-systems/11-vitest-nextjs-patterns.md` records eight branches of a real
handler green in 142 ms. First, export `BASE_COLUMNS` from `app/api/player-data/route.ts:5-15` (or
move it to `lib/`), import it, and delete the copy. Then by blast radius:

1. **`/api/player-data`** — assert the emitted SQL uses `run_query_long`, that the `year` param
   narrows the range (`route.ts:31`), and that `LIMIT 50000` (`:44`) is a *documented* truncation.
2. **`/api/trends`** — a test you can write today that fails today: assert the cache key built at
   `route.ts:15` contains `tab`. It does not, so Overview's payload is served to the Stuff tab for
   up to six hours. The cheapest demonstration that a route test pays for itself.
3. **`/api/models/deploy`** — correcting the packet first: `:21` assigns
   `UPDATE pitches SET … LIMIT 50000` to `updateSql` and **never passes it to `rpc`** (`:22` says so,
   `:23` runs the `ctid` form). Dead code, not a shipped error, and `tsc`/`eslint` in item 3 deletes
   it. The live defects are testable and worse: `:23` and
   `app/api/models/deploy/continue/route.ts:14` batch with `ctid IN (SELECT ctid … LIMIT 50000)` and
   no `ORDER BY`, so batches can overlap or skip — the shape the Stuff+ backfill was repaired away
   from; `${model.formula}` is interpolated straight from a table row; and a 50,000-row `UPDATE`
   runs through plain `run_query`, capped at 8 s. One SQL golden catches all four, plus any `LIMIT`
   that reappears. **(verified)**
**Stop condition:** adding a column to `BASE_COLUMNS` without touching a test file does not change
the suite's result, because the test reads the real constant.

## LATER (6+ months)

### 7. A database a test is allowed to touch

Item 3 forbids production because there is no alternative. There is one project ref and one
`NEXT_PUBLIC_SUPABASE_URL` in the repo with no branch configuration, so a Vercel preview deployment
almost certainly writes to production Postgres. A
Supabase branch or an ephemeral Postgres in CI would let `__tests__/integration/` become a gate
instead of a permanently-skipped file, and would let the RLS-denial case be tested at all: an RLS
`USING` denial updates zero rows without erroring, which no mock reproduces. **(inferred)**

The prerequisite is not the branch. It is the schema: there is no `supabase/migrations/`, 32
hand-applied `scripts/*.sql`, and no `create-pitches.sql` anywhere — the Savant → `pitches` contract
exists only in production. A branch cannot be provisioned from a schema that is not in git.

**Stop condition:** `pitches` DDL is in the repo, and `__tests__/integration/` runs against something
that is not the production project.

---

## Standing Rules

- **A test that has never failed proves nothing.** Every regression test lands with its red
  demonstration recorded in the commit message: what was reverted, what the failure said. This is
  not ceremony — `/api/admin/backfill-stuff-plus` shipped a loop that ran once, forever, and
  `playerData.test.ts` has been green against a stale copy of the thing it claims to test.
- **No test touches production Postgres or the network.** Unit and golden tests are offline by
  construction. Contract tests (item 5) are the single exception, they run on a schedule, and they
  fail rather than skip.
- **Never mock by enumerating methods.** Item 1's failure mode is structural: a hand-listed builder
  API drifts the moment production adopts a new method. Use a recursive `Proxy`.
- **Assert content, not counts.** `inserted: 500` is identical for 500 new pitches and 500 rewrites
  (`update/route.ts:154`). Row counts, `ok: true` and HTTP 200 all survive a backfill that wrote
  garbage; a content hash does not.
- **Not doing:** jsdom and component-render tests. `vitest.config.ts:11` is `environment: 'node'`,
  Triton's numbers live in `lib/` not JSX, and async Server Components are unsupported by Vitest per
  Next.js's own docs. Revisit only if a presentation bug survives items 2 and 6.
- **Not doing:** a coverage percentage. No provider is installed, and in a data app the bugs live
  in the join between logic and real data, which line coverage scores as covered. Track which
  rendered numbers go red when a formula is perturbed instead — items 2 and 6 produce that ledger
  as a by-product. Also not doing: an E2E browser suite or a contract broker.
- **Ordering is load-bearing.** Item 1 before everything. Item 2 before
  `Li/applied/metric-governance-applied.md` items 1, 3 and 4 — a restatement that ships before the
  golden exists is unmeasurable afterwards. Item 3 before items 4–7, or the new tests join five
  ignored red ones.

---

**Triton-internal evidence.** Suite state re-measured 2026-08-22 by `npx vitest run` in the repo
root: 7 files, 122 tests, **5 failed / 93 passed / 24 skipped, 229 ms** (Vitest 4.1.3;
`--reporter=basic` is gone in 4.x). Four failures are
`TypeError: supabaseAdmin.from(...).select(...).eq(...).gt(...).maybeSingle is not a function` from
`__tests__/lib/queryCache.test.ts:21` against `lib/queryCache.ts:22`; the fifth is
`__tests__/lib/leagueStats.test.ts:37-41` — `AssertionError: expected 100 to be Infinity` — against
the guard at `lib/leagueStats.ts:1322`. Both `Cas/context/triton-context.md` and the build packet
attribute all five to `queryCache`; that is wrong and item 1 corrects it. Column drift measured by
diffing `app/api/player-data/route.ts:5` (70 columns) against `__tests__/api/playerData.test.ts:5`
(67) — missing `attack_angle`, `attack_direction`, `swing_path_tilt`. Ingest mechanics read at
`app/api/update/route.ts:87,133,136,148,152,161`. Backfill history quoted from
`app/api/admin/backfill-stuff-plus/route.ts:6,29-33,91`; deploy path from
`app/api/models/deploy/route.ts:16-25` and `app/api/models/deploy/continue/route.ts:14`. CI state:
only `.github/workflows/retro-ingest.yml` exists (`schedule` + `workflow_dispatch`, secrets at
`:50-51`); `package.json` has `test` and `lint`, no `typecheck`; `tsconfig.json:7-8` is already
`strict` + `noEmit`. Isolation verified by listing the repo root — no `.env`, only `.env.local`
holding `SUPABASE_SERVICE_ROLE_KEY`, so `vitest.config.ts:12`'s `dotenv/config` finds nothing and
`__tests__/integration/savantValidation.test.ts:38`'s `skipIf(!hasEnv)` skips 24 tests. Metric
surfaces read at `lib/metricRegistry.ts:32,597,608,618,643` (69 entries),
`lib/pitcherStats.ts:57,119,130-131,248,290-295`, `lib/leagueStats.ts:1320-1324`; payload-scoped
centroids at `lib/enrichDerivedFields.ts:38-52`.
Corpus: `Cas/testing-data-systems/03-contract-testing-external-apis.md` (119 Savant columns on
2026-08-12, 33 unmapped), `04-idempotency-backfill-testing.md`,
`05-golden-file-metric-testing.md` §4.3, `09-numeric-regression-detection.md`,
`11-vitest-nextjs-patterns.md`. Handoffs: `Jo/applied/data-reliability-applied.md` N7 and
`Li/applied/metric-governance-applied.md` items 1, 3, 4, 5. No database query was run in the
preparation of this playbook.
