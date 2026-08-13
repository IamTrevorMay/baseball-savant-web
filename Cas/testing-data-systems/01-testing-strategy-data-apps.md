---
title: Testing Strategy for Data Apps — What to Test When the Bug Is a Number
domain: testing-data-systems
tags:
  - testing-strategy
  - test-pyramid
  - risk-based-testing
  - coverage
  - data-testing
  - numeric-correctness
  - characterization-tests
  - vitest
sources_reviewed: 23
last_updated: 2026-08-12
---

# Testing Strategy for Data Apps — What to Test When the Bug Is a Number

> Grades: **(verified)** Cas ran or read it at `file:line`; **(documented)** vendor docs; **(inferred)**
> mechanism; **(cargo-cult)** repeated, unsupported. No production query was run (§5.4).

## TL;DR

- **A normal app fails loudly; a data app fails plausibly — it must test for wrong values that render fine, not for exceptions.** **(inferred)**
- **Triton's suite is red and has been for 53 days — 93 pass, 5 fail of 98 unit tests.** Run 2026-08-12, not from `context/triton-context.md`. **(verified)**
- **That note is itself wrong.** It puts all 5 failures in `queryCache.test.ts`; only 4 are. The 5th, `leagueStats.test.ts:40`, fails because the *code got better*. **(verified)**
- **All 5 broke in one commit — `593117c`, 2026-06-20 — which fixed two real bugs and left two tests asserting the bugs.** Red meaning "someone improved something" gets ignored. **(verified)**
- **The only API-route test tests a *copy* of the route, three columns stale.** `playerData.test.ts:5` duplicates `BASE_COLUMNS`: route 70 columns, copy 67. Green since `attack_angle` shipped, and wrong. **(verified)**
- **The pyramid assumes bugs live in logic and inputs are cheap to fabricate; in a data app they live in the join between logic and real data — the layer it minimizes.** **(documented)**
- **Line coverage is near-meaningless here, and Triton can't even measure it — no coverage provider installed.** Track *value coverage*: which rendered numbers go red when a formula drifts. **(verified)**
- **Prioritize by blast radius × silence, not code volume.** A metric on every dashboard and said to a player outranks 190 CRUD routes. **(inferred)**
- **Nothing in CI runs the tests** — the one workflow is `retro-ingest.yml`. Advisory, which is how it stayed red 53 days. **(verified)**
- **The 24 integration tests are skipped by accident, and the accident is the only thing stopping `npm test` from querying production.** **(verified)**
- **A test that has never failed proves nothing.** Write it against the broken code, watch it go red, then fix; no evidence Triton does. **(documented)**

---

## 1. Two bug classes, and only one has a testing tradition

| | Crash bug (normal app) | Value bug (data app) |
|---|---|---|
| Symptom | Exception, 500, blank screen | A plausible number |
| Found by | Users, in minutes | Nobody, for months |
| Caught by | Types, unit tests, smoke tests, Sentry | An assertion that knows the right answer |
| Cost of missing | Embarrassment | A wrong claim about a player, said out loud |
| Triton case | A route throws on a malformed `playerId` | Stuff+ coverage fell 99.5% → 0%; every dashboard drew on smoothly |

Pyramid, trophy, and honeycomb address the left column and ignore the right, whose defining property is that **the program did exactly what it was told**. `AVG()` skipping NULLs is no Postgres bug; it is a bug in the screen's meaning. One rule outranks everything here:

> **The assertion must know the answer independently of the code that produced it.** Recomputing with the same function is a tautology; a hand-derived expectation, a frozen golden file, or an independent source is evidence.

Triton has one test of that shape, switched off: `savantValidation.test.ts` computes Burnes' 2024 line from a live Savant CSV *and* from Supabase, then compares — right shape, never runs (§5.4). Neighbours: `Jo` is the data fresh, `Li` is the number defensible, `Soto` should it exist. Cas asks: **is there an executable check that goes red if this number changes for the wrong reason?**

---

## 2. Why the pyramid fits badly

Fowler's pyramid rightly says fast isolated tests should outnumber slow ones. Its assumption — **cost** is runtime plus flakiness, **value** is logic exercised — shifts on both halves here.

| Pyramid assumption | Triton reality |
|---|---|
| Inputs are cheap to fabricate | ~90 physically correlated columns per pitch row; a fabricated row passes every type and is still impossible. → `08-test-data-management.md` |
| The unit is the interesting boundary | `SQL ↔ TypeScript`: `run_query` returns rows, JS averages them. Neither side alone is wrong; the pair is. → `02-sql-query-testing.md` |
| Integration is slow, minimize it | 98 unit tests run in **171 ms**. Runtime isn't the constraint; *knowing the right answer* is. **(verified)** |
| Mocks preserve the contract | The four `.maybeSingle()` failures are mocks drifted from the real client; a mock is a hypothesis and decays. → `11-vitest-nextjs-patterns.md` |
| E2E is the expensive top | The expensive top is *numeric*: ingest → score → aggregate → render. Not Playwright-shaped. → `07-integration-e2e-testing.md` |

Not "invert the pyramid" — Google's case holds, slow non-deterministic tests get ignored. The **axis** is wrong: it sorts by *scope*; a data app sorts by *what the assertion knows*.

| Sorted by what the assertion knows | Catches | Triton has |
|---|---|---|
| **Tautology** — recomputes with the code under test | Nothing; refactor detector at best | Parts of `leagueStats.test.ts` |
| **Hand-derived** — a human did the arithmetic | Formula errors, sign flips, unit slips | `computePlus(92,90,2) === 115` ✅ |
| **Invariant / property** — holds for all inputs | Whole error classes, no values named | None → `06-property-based-testing.md` |
| **Golden file** — a frozen prior output | Silent drift, including what you forgot | None → `05-golden-file-metric-testing.md` |
| **Independent oracle** — a second system computed it | Everything, including your understanding | 24, skipped (§5.4) |

The bottom three rows hold the leverage and none are slow; the pyramid never forbade them, it gave no vocabulary for wanting them.

---

## 3. What "coverage" means when the risk is numeric

Line coverage answers "did this statement execute." The §1 value bug executes every statement — coverage would read 100% through the Stuff+ outage. Fowler (finds code you *aren't* testing, useless as a target) and Google (a floor-finder, not a score) both hold. A data app needs a second metric no tool implements:

> **Value coverage: of the distinct numbers a user can read on a surface, what fraction has an assertion that goes red if its formula, denominator, or NULL semantics change?**

Triton's is unflattering: `lib/metricRegistry.ts` defines **64** metric entries over 702 lines, `docs/VARIABLES.md` has **zero** occurrences of `stuff_plus`, and the suite never references `metricRegistry`. Hand-derived expectations exist only in `sql.test.ts` and `outingCommand.test.ts`. Value coverage is single-digit percent; line coverage unmeasurable — no provider installed, `vitest run --coverage` reports nothing. **(verified / documented)** Three repeated claims:

| Claim | Grade | Why |
|---|---|---|
| "80% line coverage is the industry standard" | **(cargo-cult)** | Nothing establishes 80% as meaningful; a round number surviving by repetition. Google declines a universal target. |
| "Mutation testing is the honest version of coverage" | **(documented)** | Measures whether assertions *detect* change — the right question. Stryker supports Vitest. But it mutates *code*; a data app's mutations arrive in the *data*. |
| "Coverage of the metric layer is what matters here" | **(inferred)** | From §1: blast radius is every surface reading the metric; detection latency is unbounded. |

Translation for a reviewer: **for each metric, name the test that fails if the formula changes.** "None" is the number that matters — countable by hand across 64 entries.

---

## 4. Risk-based prioritization

Risk-based testing ranks by likelihood × impact, but impact assumes you find out. What decides a value bug's damage is **how long it stays invisible**.

> **Priority = blast radius × silence × mutation rate**
> *Blast radius* — how many surfaces read it; is it said out loud to a player?
> *Silence* — how long could it be wrong unnoticed? (Stuff+: four months.)
> *Mutation rate* — how often does it change? Code untouched for a year isn't next month's bug.

Surface area: **195 API route handlers**, **17 cron directories**, 18 `vercel.json` schedules **(verified)**:

| Asset | Radius | Silence | Mutation | Pri | Doc |
|---|---|---|---|---|---|
| Metric formulas (`metricRegistry`, `leagueStats`, `pitcherStats`, `sql`) | All surfaces | Unbounded | High | 1 | `05` |
| Ingest + scoring crons (18 schedules) | Everything downstream | Days–months | Medium | 2 | `04` |
| Repair tooling (5 `scripts/backfill-*`, `/api/admin/backfill-*`) | The repair | Until re-audited | Low | 3 | `04` |
| External API shape (MLB Stats, Savant) | Ingest correctness | Until a field goes NULL | External | 4 | `03-contract-testing-external-apis.md` |
| Aggregation SQL (`/api/report`, `run_query`) | Cross-player reports | Weeks | Medium | 5 | `02` |
| Presentation states (null-vs-zero, `n` display) | Reader's belief | Immediate, unreported | High | 6 | `Cas/analytics-ux/02-null-zero-unknown-ui.md` |
| Broadcast / Realtime session state | Live, on air | Seconds | Medium | 7 | `07` |
| CRUD routes (work, broadcast, assets) | One user, one record | Minutes | High | 8 | — normal-app |

Row 8 is most of the 195 routes and correctly last: **codebase volume is anti-correlated with risk.** Testing by volume covers rows 8 and 7 and calls itself done.

> **Rule 1 — Test the numbers a human will repeat.** Anything reaching a newsletter, an overlay, or a player gets an assertion first.

> **Rule 2 — Every repair tool gets a test before its first real run.** It runs rarely, under pressure, against production, reporting success by default — the top silence score anywhere.

---

## 5. Triton's existing failures, and what each teaches

Four defects, all verified 2026-08-12.

### 5.1 The suite is red because the code improved

Commit `593117c` (2026-06-20) made two correctness fixes. `lib/leagueStats.ts:1320-1324` now guards a zero/NaN stddev — `if (!(leagueStddev > 0) || !Number.isFinite(leagueStddev)) return 100`, neutral 100 not ±Infinity/NaN, leaving `(avg − mean) / sd * 15 + 100` intact. And `lib/queryCache.ts:22` went `.single()` → `.maybeSingle()`, so a cache miss returns null instead of erroring. Both right; both left tests asserting the *old* behaviour — `leagueStats.test.ts:40` expects `Infinity`, four `queryCache` tests mock a chain with no `.maybeSingle()`. **(verified)**

The `leagueStats` case is a **characterization test**, comment: *"This documents the current behavior — no guard against zero stddev."* These pin legacy behaviour before a refactor, and fail predictably: **they encode the present, so improving it breaks them, and red no longer separates improvement from regression.** Invert, don't delete: assert the guard, name it policy.

**Lesson: a red suite meaning "something improved" trains the team to ignore red.** After 53 days its signal value is zero, whatever the test count. Mock-chain fix → `11-vitest-nextjs-patterns.md`.

### 5.2 The only API test tests a copy

`__tests__/api/playerData.test.ts` opens *"Test the column prefixing logic extracted from player-data route"*, then redeclares `BASE_COLUMNS` and reimplements `prefixColumns` locally (lines 5–9) — never importing the route. Its assertions ("preserves all column names", "produces correct count") hold for the copy, not production: route 70 columns including `attack_angle`, `attack_direction`, `swing_path_tilt`, copy 67. **(verified)**

**Lesson: a test duplicating the code under test becomes a documentation comment the moment production changes — and stays green doing it.** Fowler's self-testing-code point, strictly: value lives in the *coupling* to production code, not the assertions. Import both, or delete it.

### 5.3 The repair tool that was fixed but is still untested

`/api/admin/backfill-stuff-plus` is Cas's founding case: its `hasMore` probe was `SELECT COUNT(*) … LIMIT 1 OFFSET n`, zero rows for any `n > 0`, so it always stopped after one batch. Since repaired — the route header at lines 29–31 documents the old `ctid`/`OFFSET` paging bug and new `game_date` chunking. **(verified)**

**Missing is any test that would have caught it, or catches the next.** No test file references a backfill path; `scripts/` holds 5 more `backfill-*` jobs in the same state. A double-run test — twice on a fixture, second run a no-op, counts match — is ~20 lines and fails on the original in under a second. → `04-idempotency-backfill-testing.md`.

**Lesson: fixing the bug is not retiring the failure mode.** Found by audit; the class is still unguarded.

### 5.4 The 24 integration tests are skipped by accident

`savantValidation.test.ts` (404 lines, 24 `it()` blocks) is guarded by `describe.skipIf(!hasEnv)`; `hasEnv` reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and `vitest.config.ts` sets `setupFiles: ['dotenv/config']`, loading **`.env`** — this repo has `.env.local` and `.env.vercel`, no `.env`. Unset variables, `hasEnv` false, all 24 skip. **(verified)**

Two consequences. **The best test in the repo — an independent-oracle check against live Savant — has never run on a clean checkout**; the context doc's "24 skipped" is a filename accident recorded as design. And **the accident is load-bearing**: add a `.env` and `npm test` fetches a live Savant CSV and fires `run_query_long` `SELECT * FROM pitches` at production — which concurrent agent reads already took down for an hour.

**Lesson: "skipped" is not a state, it is an unlabelled outcome.** Separate *skipped by policy* from *skipped for a missing variable*; gate production-touching tests on an opt-in flag, not on incidental credentials. → `07-integration-e2e-testing.md`, `10-ci-cd-for-data-apps.md`.

---

## 6. The strategy that fits, in one table

Not a pyramid: sorted by what the assertion knows.

| Layer | Asserts | Cost | Triton today | Owner |
|---|---|---|---|---|
| **Pure-function unit** | Hand-derived arithmetic on metric helpers | Trivial | Partial, 2 wrong | this doc / `09` |
| **Golden file** | Output equals a reviewed frozen output | Low | **None** | `05` |
| **Property / invariant** | `AVG` lies in `[min,max]`; plus-stats centre near 100; counts conserve | Low | **None** | `06` |
| **SQL fixture** | Right rows against seeded Postgres | Medium | **None** | `02` |
| **Contract** | Upstream payload still has the fields we read | Low | **None** | `03` |
| **Idempotency** | Run twice ⇒ same state; resume mid-fail ⇒ same state | Low | **None** | `04` |
| **Numeric regression** | Aggregate moved beyond tolerance ⇒ fail | Medium | **None** | `09` |
| **Integration / oracle** | Our number equals another system's number | High | 24, skipped | `07` |
| **CI gate** | None of the above may go red and ship | Low | **None** | `10` |

The finding is column four: eight of nine layers empty, both populated cells defective. **Not a suite needing more tests — it needs its first tests that can catch a value bug.** (inferred)

---

## 7. What Triton should do, in order

1. **Get the suite green today, recording why each of the 5 was red.** Invert `leagueStats.test.ts:40` to assert the guard (`computePlus(91, 90, 0) === 100`); add `maybeSingle` to the mock chain at `queryCache.test.ts:14-26`. Five-minute edits, and nothing below works while red is normal.
2. **Add `npm test` to CI as a required check.** One workflow file; without it step 1 decays back to red — how 53 days happened.
3. **Fix `playerData.test.ts` by importing from the route, not copying it,** or delete it. A green test three columns stale is worse than none: it is counted.
4. **Write the first golden-file test** — one pitcher, one season, `pitcherStats` frozen to JSON. Cheapest defence against silent formula drift; also makes the next refactor a reviewable diff. → `05-golden-file-metric-testing.md`.
5. **Write one idempotency test against a backfill fixture,** verified red against the pre-`593117c` code first.
6. **Gate the integration suite on `RUN_INTEGRATION=1`, not credential presence,** defaulting to a fixture snapshot. Keeps the best test, defuses the production-query landmine.
7. **Install `@vitest/coverage-v8`; record the number once as a floor-finder, not a target.** Then measure *value coverage* by hand over the 64 registry entries — the number to move.

**Anti-recommendation — do not start by chasing a coverage percentage across the 195 API routes.** Legible, goes up, looks like progress — and wrong on three grounds. **Wrong risk:** those routes are §4's row 8 — lowest blast radius, loudest failures — while the metric layer every surface reads has none. **Wrong bug class:** line coverage read green through the four-month Stuff+ outage, which executed every line correctly. **Wrong direction:** hundreds of generated route tests are §5.2's shape — coupled to shapes not values, green while stale, costly enough that the next `593117c` breaks twenty and is merged anyway. Coverage finds untested code; it is not a plan.

**Highest-leverage next action:** fix the two assertions at `leagueStats.test.ts:40` and `queryCache.test.ts:14-26`, and add `npm test` to CI in one PR. Thirty minutes; every future test here is enforced, not advisory.

---

## Sources

1. Fowler — [TestPyramid](https://martinfowler.com/bliki/TestPyramid.html) — §2's wrong axis.
2. Fowler — [Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) — cost/runtime vs a 171 ms suite.
3. Fowler — [TestCoverage](https://martinfowler.com/bliki/TestCoverage.html) — finds untested code, not a target; §3.
4. Fowler — [SelfTestingCode](https://martinfowler.com/bliki/SelfTestingCode.html) — the coupling argument, §5.2.
5. Fowler — [Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html) — red suites lose all value; §5.1.
6. Google Testing — [No More E2E Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html) — the half §2 keeps.
7. Google Testing — [Code Coverage Best Practices](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html) — no universal target; "80%" is cargo-cult.
8. Dodds — [Write tests. Not too many.](https://kentcdodds.com/blog/write-tests) — cost-per-confidence; §2 re-sorts it.
9. Dodds — [The Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) — alternative shape, still scope-sorted.
10. Spotify — [Testing of Microservices](https://engineering.atspotify.com/2018/01/testing-of-microservices) — honeycomb; also for crash bugs.
11. Google SRE — [Testing for Reliability](https://sre.google/sre-book/testing-reliability/) — production-data tests; §4's silence.
12. SWE at Google — [Ch. 11 Testing](https://abseil.io/resources/swe-book/html/ch11.html) — size taxonomy; ignored tests go net-negative.
13. dbt — [Data tests](https://docs.getdbt.com/docs/build/data-tests) — assert on *rows*, not code; §6.
14. dbt — [Unit tests](https://docs.getdbt.com/docs/build/unit-tests) — fixed-input/expected-output; §6's golden file.
15. Great Expectations — [Docs](https://docs.greatexpectations.io/docs/home/) — declarative expectations; §3's value coverage.
16. AWS Labs — [Deequ](https://github.com/awslabs/deequ) — unit tests *for data*; a discipline, not a style.
17. Soda — [Docs](https://docs.soda.io/) — checks-as-code; fills §6's gaps.
18. Monte Carlo — [Data Observability](https://www.montecarlodata.com/blog-what-is-data-observability/) — freshness/volume/schema; `Jo`'s edge.
19. Vitest — [Test Coverage](https://vitest.dev/guide/coverage) — needs `@vitest/coverage-v8`, absent here.
20. Vitest — [Migration Guide](https://vitest.dev/guide/migration) — v4 reporters; `--reporter=basic` gone (§5).
21. Wikipedia — [Characterization test](https://en.wikipedia.org/wiki/Characterization_test) — the technique in §5.1.
22. Wikipedia — [Risk-based testing](https://en.wikipedia.org/wiki/Risk-based_testing) — likelihood × impact; §4 adds silence.
23. Stryker — [Docs](https://stryker-mutator.io/docs/) — mutation testing with Vitest; §3.

**Triton-internal evidence (repo read + test run 2026-08-12; no production query).** `npx vitest run __tests__/lib __tests__/api`, Vitest **4.1.3** → 6 files, **98 tests, 93 passed, 5 failed, 171 ms** (7th excluded: queries production). Failures: `__tests__/lib/leagueStats.test.ts:40` (`expected 100 to be Infinity`) + 4 in `__tests__/lib/queryCache.test.ts:14-26` (`.maybeSingle is not a function`, at `lib/queryCache.ts:22`); both from `593117c` "Fix MED-severity audit items (correctness + efficiency)", `git log` **2026-06-20** — 53 days back; guard at `lib/leagueStats.ts:1320-1324`. Copy: `__tests__/api/playerData.test.ts:5-9` vs `app/api/player-data/route.ts:5`/`:43` — 67 vs **70** columns (`attack_angle`, `attack_direction`, `swing_path_tilt`). Skipped: `__tests__/integration/savantValidation.test.ts` (404 lines, **24** `it()`), `describe.skipIf(!hasEnv)`, `setupFiles: ['dotenv/config']` in `vitest.config.ts`; `ls -a` shows `.env.local`/`.env.vercel`, no `.env`. Repair: `app/api/admin/backfill-stuff-plus/route.ts:29-31` documents the fixed `ctid`/`OFFSET`/`hasMore` bug; 5 `scripts/backfill-*` untested. Counts: **195** `app/api/**/route.ts`, **17** dirs in `app/api/cron/`, **18** `vercel.json` schedules, **64** metric entries in `lib/metricRegistry.ts` (702 lines), **0** `stuff_plus` in `docs/VARIABLES.md`. CI: `.github/workflows/` has only `retro-ingest.yml`; `grep -rn "vitest\|npm test" .github/` is empty. `node_modules/@vitest/` has no `coverage-v8`. Stuff+ decay (99.5% → 0%, Apr–Aug 2026) and the concurrent-reader Supabase outage come from `Cas/context/triton-context.md` and `Li/metric-governance/04-materialize-vs-compute-time.md`, not re-measured.
