---
title: Vitest in a Next.js App Router Repo — Mocking a Chainable Client Without Enumerating It
domain: testing-data-systems
tags:
  - vitest
  - nextjs-app-router
  - supabase-mocking
  - route-handlers
  - test-config
  - coverage
  - rsc
  - proxy-mocks
sources_reviewed: 21
last_updated: 2026-08-13
---

# Vitest in a Next.js App Router Repo — Mocking a Chainable Client Without Enumerating It

> Grades: **(verified)** ran or read at the cited line · **(documented)** vendor docs ·
> **(inferred)** mechanism · **(cargo-cult)** copied, never justified. Handoffs: tolerances → `09`,
> fixtures → `03`, CI → `10`. **No database was queried for this doc.**

## TL;DR

- **The context note is half stale: 4 of the 5 failures are the `.maybeSingle()` chain, not 5.** The fifth, `leagueStats.test.ts:37-41`, is an approval test pinned to a bug `lib/leagueStats.ts:1322` has since fixed. **(verified)**
- **The defect is not "the mock lacks a method" but "the mock has a method list at all."** `setupMockChain` enumerates seven builder methods; `lib/queryCache.ts:22` moved to `.maybeSingle()` and the eighth did not exist. **(verified)**
- **A recursive `Proxy` mock has no method list and cannot drift.** Cas ran the real `lib/queryCache.ts` against one: 7/7 green, including a method invented on the spot. **(verified)**
- **Zero of the repo's 197 `route.ts` handlers are imported by any test.** `__tests__/api/playerData.test.ts` re-declares `prefixColumns` locally and asserts on the copy — a transcription, not the route. **(verified)**
- **Route handlers test fine in `environment: 'node'` — no jsdom, no Next harness.** Cas drove `app/api/compete/reports/[id]/pdf/route.ts` through its 401/307/404/500 branches: 8/8 green, 142 ms. **(verified)**
- **`setupFiles: ['dotenv/config']` loads `.env`, absent here; the secrets are in `.env.local`.** So `hasEnv` is false and 24 integration tests silently `skipIf` away, every run. **(verified)**
- **Mocking the wrong admin module is a live hazard: there are two.** 47 files import `@/lib/supabase-admin` (module-scope `createClient`, **throws** with no env); 129 import `@/lib/supabase/admin` (lazy `Proxy`). A `vi.mock` of one is invisible to the other. **(verified)**
- **Advice written for Vitest 1–3 is actively wrong here: 4.0 deleted `basic`, `workspace`, and `environmentMatchGlobs`.** `--reporter=basic` now dies with `Failed to load url basic` — a resolution error for a *flag*. **(verified / documented)**
- **Async Server Components are unsupported by Vitest per Next.js's own docs**, so coverage must come from handlers and pure modules — the right trade anyway: Triton's numbers live in `lib/`, not JSX. **(documented / inferred)**
- **No coverage provider is installed, so `--coverage` is a prompt-to-install, not a measurement** — and nothing gates the suite regardless: `.github/workflows/` holds one workflow, and it ingests Retrosheet. **(verified)**

---

## 1. What the suite actually is, 2026-08-13

`npx vitest run` → **7 files · 122 tests · 93 passed · 5 failed · 24 skipped · 226 ms**, exit **1**.

| File | Tests | State / what it covers |
|---|---|---|
| `lib/leagueStats.test.ts` | 44 | 43 pass, 1 fail — `computePlus`, `normalCDF`, percentiles |
| `lib/reportQueryBuilder.test.ts` | 20 | pass — SQL string assembly |
| `lib/sql.test.ts` | 17 | pass — `computeFIP`/`computeXERA`/`computeWRCPlus` |
| `lib/outingCommand.test.ts` | 6 | pass — command aggregation |
| `lib/queryCache.test.ts` | 6 | 2 pass, **4 fail** — §2 |
| `api/playerData.test.ts` | 9 | pass — a **copy** of route logic, not the route |
| `integration/savantValidation.test.ts` | 24 | **all skipped** — live Savant + Supabase, §5 |

The last two rows: 9 tests against a transcription, 24 that never run. Effective coverage of 197
handlers is **zero**. **(verified)**

---

## 2. The `.maybeSingle()` failure, correctly diagnosed

`Cas/context/triton-context.md:77-80` records "5 failing … pre-existing in `queryCache.test.ts`".
**First correction: only four are.** The fifth, `leagueStats.test.ts:37-41`, asserts
`computePlus(91, 90, 0) === Infinity` while `lib/leagueStats.ts:1322` now guards zero stddev and
returns `100` — an approval test pinned to a defect, owned by `09-numeric-regression-detection.md`.
**(verified)** **Second: the other four are not "the mock is out of date"** — they are the end
state of a mocking *style*.

```ts
// __tests__/lib/queryCache.test.ts:14-26 — the enumerating mock
chain.select = chain.eq = chain.gt = vi.fn().mockReturnValue(chain)   // …and lt, like, delete
chain.single = vi.fn().mockResolvedValue(finalResult)                 // ← .maybeSingle is absent
```

`lib/queryCache.ts:16-26` reads `.from().select().eq().gt().maybeSingle()`. The switch was
*correct*: 0 rows is the normal cache miss, and `single()` errors on 0 rows where `maybeSingle()`
returns `{data: null, error: null}`. **(documented)** The test punished a good change.

**Mechanism:** PostgREST's builder is an open, chainable, *thenable* object, so a hand-rolled double
is a snapshot of production code at authoring time and every later builder call is a false failure.
Across **51** `.maybeSingle()` sites in `app/` and `lib/`, that is 51 chances to break a test by
improving a query. **(inferred)**

---

## 3. The fix: a recursive Proxy builder

A `Proxy` whose `get` trap answers *any* property with a function: non-terminals return another
proxy, terminals resolve a canned `{data, error}`, and a `then` trap makes the builder awaitable
without one — how `PostgrestBuilder` behaves. **(documented)**

```ts
type Result = { data: any; error: any }
const TERMINALS = new Set(['single', 'maybeSingle', 'csv'])
export function makeSupabaseMock() {
  const results = new Map<string, Result>()
  const calls: Array<{ table: string; method: string; args: any[] }> = []

  const builder = (table: string): any =>
    new Proxy(function () {} as any, {
      get(_t, prop: string) {
        const r = () => results.get(table) ?? { data: null, error: null }
        if (prop === 'then')                        // await without a terminal
          return (ok: any, no: any) => Promise.resolve(r()).then(ok, no)
        return (...args: any[]) => {
          calls.push({ table, method: prop, args })
          return TERMINALS.has(prop) ? Promise.resolve(r()) : builder(table)
        }
      },
    })

  return {
    client: {
      from: (t: string) => { calls.push({ table: t, method: 'from', args: [] }); return builder(t) },
      storage: { from: () => ({ createSignedUrl: async () => results.get('__signed')! }) },
    },
    setResult(t: string, r: Result) { results.set(t, r); return this },
    calls,
  }
}
```

Run against the **real** `lib/queryCache.ts` in Vitest 4.1.3: **7/7 passed, 88 ms** — handling
`.maybeSingle()`, a bare `await` with no terminal, and `.overlaps().notAThing().maybeSingle()`, a
method that does not exist in `@supabase/supabase-js`. **(verified)** Keying **by table**, not by
call order, is what makes it usable on real handlers: `Promise.all([...athlete_profiles,
...profiles])` resolves nondeterministically, so an order-keyed queue mock is flaky by construction.
`calls` is the second half — it asserts the *filter*, the part of a query most likely to change
silently, and proved `invalidateBySource('pitches')` issues exactly four `delete().like()` calls
(`mvpct:%`, `player:%`, `scene:%`, `trends:%`), matching `CACHE_TAG_REGISTRY` at
`lib/queryCache.ts:59`. **(verified / inferred)**

Two rungs sit above it: MSW at the PostgREST HTTP layer (same drift-immunity, filters assertable as
URLs) and real Postgres/testcontainers (the only rung catching a *wrong query*, high setup). The
Proxy mock tests **control flow** only; that boundary is `02-sql-query-testing.md`'s, and pretending
otherwise is the standard mock cargo-cult. **(inferred / cargo-cult)**

---

## 4. Route handlers: 197 of them, 0 tested

A Next 16 route handler is a plain exported async function over a `Request` **(documented)** — no
harness, no jsdom, and a global `Request` suffices unless it reads `nextUrl`/`cookies`. Verified
against `app/api/compete/reports/[id]/pdf/route.ts`: auth branching, `.single()` and
`.maybeSingle()`, a `Promise.all`, storage signing, a redirect.

```ts
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mock.client }))

const { GET } = await import('@/app/api/compete/reports/[id]/pdf/route')
const res = await GET(new Request('http://x/…') as any, { params: Promise.resolve({ id: 'r1' }) })
```

All six branches green: unauthenticated → **401**; owning athlete → **307** with `location` = the
signed URL; non-owner non-admin → **404** (not 403 — existence must not leak); admin non-owner →
**307**; legacy public `pdf_url` reduced to a path → **307**; signing error → **500**. **8/8, 142
ms.** **(verified)** Four mechanics easy to get wrong on Next 16:

| Mechanic | Correct form | Why it bites |
|---|---|---|
| Dynamic params | `{ params: Promise.resolve({ id }) }` | a Promise in Next 15+; a plain object yields `undefined` after `await` |
| Redirect status | expect **307**, not 302 | `NextResponse.redirect` defaults to 307 to preserve the method |
| Module specifier | mock the string the *handler* imports | `@/lib/supabase-admin` ≠ `@/lib/supabase/admin` — §6 |
| Handler import | `await import(...)` after `vi.mock` | `vi.mock` hoists; a static import can bind before the mock registers |

---

## 5. The config, audited line by line

The whole file is 15 lines: an `@` alias plus
`test: { environment: 'node', setupFiles: ['dotenv/config'], testTimeout: 120_000 }`.

| Line | Verdict | Detail |
|---|---|---|
| `alias '@'` | **keep** | mirrors `tsconfig.json` `paths` |
| `environment: 'node'` | **keep** | right for `lib/` + handlers; jsdom is absent, so no component test can run |
| `setupFiles: ['dotenv/config']` | **broken** | loads `.env`; the repo has only `.env.local`, `.env.vercel` |
| `testTimeout: 120_000` | **wrong default** | set for the live file; a hung unit test takes 2 min to fail |
| *(absent)* `globals` | fine | tests import `describe/it/expect` explicitly |
| *(absent)* `coverage` | gap | §7 |
| *(absent)* `projects` | **the real fix** | below |

**The dotenv bug is the expensive one.** `node -r dotenv/config` at the repo root →
`URL set: false | KEY set: false`; with `DOTENV_CONFIG_PATH=.env.local` → `true | true`. So
`hasEnv` (`savantValidation.test.ts:19`) is false, `describe.skipIf(!hasEnv)` (line 38) skips the
file, and **24 tests report skipped rather than failing** — the quietest way for a validation suite
to stop existing. **(verified)** Do not simply repoint dotenv: those 24 tests read production
Supabase with the service-role key and fetch live Savant, so running them by default turns
`npm test` into a production reader — the pattern that took Supabase down for an hour on
2026-08-11. The skip is accidentally protecting the database. Since 4.0 the supported split is one
config, two projects: **(documented)**

```ts
test: { projects: [
  { test: { name: 'unit', include: ['__tests__/{lib,api}/**/*.test.ts'], testTimeout: 10_000 } },
  { test: { name: 'integration', include: ['__tests__/integration/**/*.test.ts'],
            setupFiles: ['dotenv/config'], testTimeout: 120_000 } },
] }
```

`npm test` then means `--project unit` and stays offline; integration is opt-in via
`DOTENV_CONFIG_PATH=.env.local vitest run --project integration` — an explicit skip, not a silent one.

### Vitest 4 is not Vitest 2

Most Vitest-plus-Next material predates both. **(documented, except as noted)**

| Change in 4.0 | Consequence |
|---|---|
| `basic` reporter **removed** | `--reporter=basic` → `Failed to load url basic` — a resolution error for a *flag*, easily misread as a broken install **(verified)** |
| `workspace` → `projects` | workspace files unsupported; `environmentMatchGlobs` gone with it |
| v8 coverage AST-remapped | `coverage.all`, `ignoreEmptyLines`, `extensions` removed |
| `verbose` flat; pools flattened | `--reporter=tree` restores the hierarchy; `maxThreads`/`maxForks` → `maxWorkers` |

---

## 6. Two admin clients, two mock targets

| Module | Importers | Init → test consequence |
|---|---|---|
| `lib/supabase-admin.ts` | **47** | `createClient` at module scope (:17, :20) — **throws on import** with no env; must be mocked |
| `lib/supabase/admin.ts` | **129** | lazy `Proxy` → `getAdmin()` (:9-24) — imports cleanly with no env |
| `lib/supabase/server.ts` | **66** | `createServerClient` + `cookies()` — mock it, or `next/headers` throws outside a request scope |

Verified by deleting `NEXT_PUBLIC_SUPABASE_URL` and re-importing: `@/lib/supabase-admin`
**rejects**, `@/lib/supabase/admin` **resolves**. A shared `__tests__/helpers/supabase.ts` must
cover **all three** specifiers, each file mocking the ones its subject imports — `vi.mock` is
per-specifier, not per-client. `lib/supabase-admin.ts` also exports `supabaseAdminLong` (30 s vs
120 s timeouts), so a factory mock must return **both** names or the import fails. **(verified)**

---

## 7. Coverage, and what it is worth here

`node_modules/@vitest/` holds expect, mocker, pretty-format, runner, snapshot, spy, utils — **no
`coverage-v8`, no `coverage-istanbul`** — so `--coverage` prompts to install rather than measuring.
**(verified)** Vitest 4's v8 provider is AST-aware by default, closing the old gap where v8 line
counts disagreed with Istanbul on transpiled TS. **(documented)**

Scope it to `lib/**/*.ts` and `app/api/**/route.ts`, and **do not gate on a global percentage**:
line coverage measures how much code ran, not how much *arithmetic* was checked, and
`lib/leagueStats.ts` is 1,400+ lines where one `computePlus` test lights up a disproportionate
share. Per-file thresholds on modules computing displayed numbers are worth something; a repo-wide
80% is theatre. **(inferred / cargo-cult)**

---

## 8. RSC and component testing: know the ceiling

Next.js states plainly that **Vitest does not support `async` Server Components**, recommending E2E
for those and unit tests only for synchronous Server and Client Components. **(documented)** Triton
has no jsdom, `@testing-library/react`, or `@vitejs/plugin-react`, so rendering one component costs
four dependencies plus a jsdom or browser-mode project. **(verified)**

That ceiling costs little here. The presentation logic Cas cares most about — `formatMetric`,
`getCellColor`, `calcTotalsFromRegistry`, the null-vs-zero distinction — lives in
`lib/metricRegistry.ts` as pure functions, testable today in `environment: 'node'` with no new
dependencies and no mocking. React Compiler is **not enabled** in `next.config.ts` (only
`babel-plugin-react-compiler` is a devDependency), so rendering is plain React 19 with no
compiler-inserted memoization to reason about. **(verified)** Interactive behaviour belongs to
Playwright and `07-integration-e2e-testing.md`.

---

## 9. What Triton should do, in order

1. **Replace `setupMockChain` with the §3 Proxy helper** in `__tests__/helpers/supabase.ts`;
   re-point `queryCache.test.ts` at it. Four failures clear and the suite stops punishing query
   improvements.
2. **Split `vitest.config.ts` into `unit` and `integration` projects** (§5); `npm test` means
   `--project unit`. Integration stays opt-in and off production.
3. **Fix or delete `leagueStats.test.ts:37-41`** — it asserts a bug. Rewrite as
   `expect(computePlus(91, 90, 0)).toBe(100)`, citing `lib/leagueStats.ts:1322`. The exit code then
   means something.
4. **Add a CI workflow running `--project unit` on every push.** Shape: `10-ci-cd-for-data-apps.md`.
5. **Write three real route-handler tests** using §4: the PDF route (auth branching), a cron route
   (`CRON_SECRET` rejection), `/api/player-data` (param validation).
6. **Delete `playerData.test.ts`'s copied `prefixColumns`** and import the real one. A test of a
   copy cannot fail when the original changes.
7. **Install `@vitest/coverage-v8`** scoped as in §7 — as a *reporter*, not a gate.

**Anti-recommendation: do not adopt the official Next.js Vitest setup (`jsdom` +
`@testing-library/react` + `@vitejs/plugin-react`) as the next move.** First result for "Vitest
Next.js", wrong for Triton now, on three independent grounds. (a) *It targets the untestable layer*
— Next's own guide says async Server Components are unsupported, and Triton's pages are App Router
server components. (b) *It touches none of the current failures* — all five reds are `node`
module tests, and the 120 s timeout and dotenv bug survive it untouched. (c) *It taxes every run* —
jsdom on a 226 ms suite adds setup cost and four dependencies to a repo whose real gap is 197
untested route handlers and an untested metric registry, none of which need a DOM.

**Highest-leverage next action:** create `__tests__/helpers/supabase.ts` with the §3
`makeSupabaseMock` and write **one** test with it — `GET /api/compete/reports/[id]/pdf` returns 404,
not 403, for a non-owner. It clears the mocking blocker, and its first assertion is that a private
athlete's report does not leak its own existence.

---

## Sources

1. [Vitest — Config](https://vitest.dev/config/) — the option surface §5 audits.
2. [Vitest — Migration Guide](https://vitest.dev/guide/migration) — §5's 4.0 breaking-change table.
3. [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4) — dates the pre-4/post-4 boundary.
4. [Vitest — Test Environment](https://vitest.dev/guide/environment) — why `node` fits `lib/` and handlers.
5. [Vitest — Mocking](https://vitest.dev/guide/mocking) — factory-mock semantics behind §6's "return *both* exports".
6. [Vitest — `vi` API](https://vitest.dev/api/vi.html) — `vi.mock` hoisting; why §4 uses `await import()`.
7. [Vitest — Mock Functions](https://vitest.dev/api/mock) — `mock.calls`, the basis for §3's filter assertions.
8. [Vitest — Test Projects](https://vitest.dev/guide/projects) — the `projects` shape §5 recommends.
9. [Vitest — Coverage](https://vitest.dev/guide/coverage) — v8 vs istanbul; §7's AST-aware default.
10. [Vitest — CLI](https://vitest.dev/guide/cli) — `--project`, `--reporter`, `--coverage` (§5, §7).
11. [Vitest — Browser Mode](https://vitest.dev/guide/browser/) — §8's real-DOM alternative.
12. [Next.js — Setting up Vitest](https://nextjs.org/docs/app/guides/testing/vitest) — §8's async-RSC limit; the stack §9 rejects.
13. [Next.js — Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) — a handler is a plain function over `Request`; makes §4 harness-free.
14. [Next.js — `NextResponse`](https://nextjs.org/docs/app/api-reference/functions/next-response) — `redirect()`'s default status, §4's 307.
15. [Next.js — Dynamic Route Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) — `params` as a Promise (§4).
16. [Next.js — `cookies()`](https://nextjs.org/docs/app/api-reference/functions/cookies) — why `lib/supabase/server.ts` is mocked, not imported.
17. [Next.js — Environment Variables](https://nextjs.org/docs/app/guides/environment-variables) — the `.env.local` order `dotenv/config` ignores (§5).
18. [postgrest-js — `PostgrestBuilder`](https://github.com/supabase/postgrest-js/blob/master/src/PostgrestBuilder.ts) — the `then` §3's trap imitates.
19. [Supabase JS — `select()`](https://supabase.com/docs/reference/javascript/select) — chain grammar; the `single`/`maybeSingle` zero-row split (§2).
20. [MDN — `Proxy`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) — `get`-trap semantics letting §3 answer unknown methods.
21. [Martin Fowler — Test Double](https://martinfowler.com/bliki/TestDouble.html) — stub-vs-mock vocabulary for §3.
22. [MSW](https://github.com/mswjs/msw) — §3's HTTP-layer option, owned by `03`.

**Triton-internal evidence.** Executed locally 2026-08-13; **no database queries were run**, and
the live integration file was never executed. `npx vitest run` → 7 files, 122 tests, **93 passed /
5 failed / 24 skipped**, 226 ms, **exit 1** (measured directly, not through a pipe). Failures: 4 ×
`TypeError: … .maybeSingle is not a function` at `lib/queryCache.ts:22` from
`__tests__/lib/queryCache.test.ts:31,37,70,78`; 1 × `expected 100 to be Infinity` at
`__tests__/lib/leagueStats.test.ts:40` against the guard at `lib/leagueStats.ts:1322`. §1's counts are `grep -c 'it('` per file; savantValidation is skipped whole by
`describe.skipIf(!hasEnv)` at its line 38 (`hasEnv`, lines 17-21). dotenv: `node -r dotenv/config`
at repo root → `URL set: false | KEY set: false`; with `DOTENV_CONFIG_PATH=.env.local` →
`true | true`; `.env` absent, `.env.local`/`.env.vercel` present. `package.json`: `vitest ^4.1.3` (resolved 4.1.3), `next 16.1.6`,
`react 19.2.3`, `typescript 5.9.3`, `@supabase/supabase-js ^2.97.0`; no `jsdom`, `happy-dom`,
`@testing-library/*`, `msw`, `@vitejs/plugin-react`, or `@vitest/coverage-*` in `node_modules`.
Surface: `find app -name route.ts` →
**197**; route groups **15**; `ls app/api/cron` → **17**; `grep -rn 'maybeSingle()' app lib` →
**51**; `grep -rl` importers over `app lib components` → `@/lib/supabase-admin` **47**,
`@/lib/supabase/admin` **129**, `@/lib/supabase/server` **66**; `grep -rn 'app/api' __tests__` → no
matches. `--reporter=basic` → `Startup Error … Failed to load url basic (resolved id: basic)`.
§3/§4 ran in a throwaway project outside the repo (root a scratch dir, `@` aliased to the repo,
`node_modules` symlinked): `chain.test.ts` **7/7, 88 ms** against the real `@/lib/queryCache`;
`route.test.ts` **8/8, 142 ms** against the real `@/app/api/compete/reports/[id]/pdf/route` —
401/307/404/500 plus import-time env probes on `@/lib/supabase-admin` (rejects) and
`@/lib/supabase/admin` (resolves); both scratch files deleted. `ls .github/workflows/` →
`retro-ingest.yml` only. `grep -rn reactCompiler next.config.ts` → no match. Correction filed
against `Cas/context/triton-context.md:77-80`.
