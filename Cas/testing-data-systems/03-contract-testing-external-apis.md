---
title: Contract Testing External APIs — Catching an Upstream Change Before It Lands in the Database
domain: testing-data-systems
tags:
  - contract-testing
  - upstream-drift
  - baseball-savant
  - mlb-stats-api
  - recorded-fixtures
  - schema-hash
  - vocabulary-drift
sources_reviewed: 23
last_updated: 2026-08-12
---

# Contract Testing External APIs — Catching an Upstream Change Before It Lands in the Database

> Grades: **(verified)** read/run at the cited line, 2026-08-12; **(documented)** vendor or
> practitioner docs; **(inferred)** mechanism; **(cargo-cult)** copied blind.
>
> **Scope.** Jo owns keeping the ingest running (`Jo/data-reliability/09`, `03`); Li owns what a
> changed value means (`Li/temporal-modeling/03`). **Cas owns the test that goes red before the
> change reaches `pitches`**, and the admission when none can be written yet.

## TL;DR

- **Triton's one upstream-touching test cannot fail** — it skips without env, swallows provider failures, and no workflow runs `npm test` (§4). **(verified)**
- **The drift that already happened returns HTTP 200 and always will** — `import-lahman.ts:17-18` pulls Lahman CSVs from a 1-star fork last pushed **2022-10-31**; its `:6` comment names a repo that 404s (§3). **(verified)**
- **Liveness passes where a one-line freshness assertion fails** — that fork's `People.csv` stops at debut year **2022**, leaving `players.lahman_id` at 3,228/16,931 (**19.07%**). **(verified)**
- **The contract Cas most needs to assert is nowhere in git** — no `create-pitches.sql` among 70 SQL files, no generated types; the Savant→`pitches` map exists only in production (§7). **(verified)**
- **Savant sent 119 columns on 2026-08-12 and 33 appear in no repo TypeScript or SQL** — whether `pitches` accepts them is unknowable from the repo, which is the finding. **(verified)**
- **Two live vocabulary collisions sit between the MLB and MiLB paths** — Savant's `SV`/`FA` are "Slurve"/"Other", the MiLB map says "Sweeper"/"Fastball", and Stuff+ joins on `pitch_name` (§5.3). **(verified)**
- **Semantics drift hides inside valid types** — `inningsPitched` is `"194.1"`, i.e. 194 innings and one *out*, which `player-stats/route.ts:88` `parseFloat`s. **(verified)**
- **Pact's model does not transfer; copying it wholesale is this doc's cargo-cult version** — keep the recorded artifact and the deploy gate, drop the broker (§8). **(documented)**

## 1. What a contract test is when the provider will never sign one

A contract test asserts *your code's assumptions about a collaborator*, not the collaborator (Fowler): a provider change becomes a red test, not an incident. Pact's consumer-driven form adds a broker handshake the **provider** replays in its CI.

| Pact assumption | Triton's reality | Survives |
|---|---|---|
| Provider runs contracts in CI | MLBAM: no changelog, SLA, deprecation | nothing |
| Contract negotiated, versioned | endpoints undocumented, unversioned | nothing |
| Broker gates deploys (`can-i-deploy`) | Triton is the only consumer | the *gate*, aimed at CI |
| Recorded interaction is the artifact | Triton records nothing | **the artifact** |

So the right object is **provider-verification-free contract testing**: record what the provider sent, assert what the code depends on, re-run live on a schedule — Pact's vocabulary, not its machinery **(inferred)**. For a one-consumer, zero-cooperation dependency a broker is **(cargo-cult)** ceremony over a fixture directory.

## 2. The four contracts Triton actually depends on

91 call sites across 50 files reach `baseballsavant.mlb.com` or `statsapi.mlb.com` **(verified)**:

| # | Contract | Consumer | What breaks silently |
|---|---|---|---|
| **C1** | Savant `statcast_search/csv` column set | `update/route.ts:81-134` | a new column reaches `upsert` verbatim; a removed one is NULL forever |
| **C2** | Stats API `people?...hydrate=stats(...)` keys, **types** | `cron/player-stats:69,88` | strings where numbers are assumed; a renamed key optional-chains away |
| **C3** | Stats API game feed **enumerations** | `update/milb/route.ts:16-105` | five hand-written maps, silent fallbacks (§5.3) |
| **C4** | Static hosts: Lahman fork, Chadwick register | `import-lahman.ts:17-19` | the file stops changing; nothing 404s (§3) |

C1/C2 are shape contracts, the class most people test. **C3 and C4 are what actually hurt Triton**, and neither is one.

## 3. The spine: a four-year-old drift that still returns 200

`scripts/import-lahman.ts` is the repo's clearest upstream drift, still live.

| Fact | Value | Checked |
|---|---|---|
| Configured host | `raw.githubusercontent.com/cbwinslow/baseballdatabank/master/{core,contrib}` | `:17-18` |
| Repo last pushed | **2022-10-31**, 1 star, `"fork": false` | GitHub API, 2026-08-12 |
| Raw `core/People.csv` | **HTTP 200**, 2,715,809 bytes, 20,673 rows | 2026-08-12 |
| Max `debut` year in that file | **2022** | 2026-08-12 |
| Comment at `:6` names | `chadwickbureau/baseballdatabank` — **404** | 2026-08-12 |
| Canonical home today | <https://sabr.org/lahman-database/> | documented |
| Consequence | `players.lahman_id` on **3,228/16,931** rows = **19.07%** | packet, 2026-08-12 |

Three lessons, in increasing usefulness. **(1) HTTP 200 is not a contract assertion** — the liveness check most teams write first passes forever here. **(2) Staleness has no error code** — only *freshness*, content recency not status, expresses it (dbt fails a run on `warn_after`/`error_after`) **(documented)**. **(3) The comment was the only spec, and it was wrong** — a test reading the `:6` constant would be the file's only executable spec.

The Chadwick **register** (`:19`) is fine: pushed **2026-08-02**, 128 stars **(verified)**. One dependency current, one four years dead, same file, indistinguishable without a test.

**Handoff:** what a 19.07% crosswalk does to joins and match rates is Li's (`entity-resolution/02`, `09`); Cas owns the assertion that would have caught it in 2023.

## 4. What Triton's one upstream test does instead

`savantValidation.test.ts` (404 lines) compares live Savant data for Corbin Burnes 2024 with Supabase — good instincts, total failure modes **(verified)**:

| Line of defense | Actual behavior |
|---|---|
| `describe.skipIf(!hasEnv)` (`:39`) | no service-role key ⇒ **suite silently skipped** |
| `catch { savantFailed = true }` (`:50-53`) | outage or schema break ⇒ **warn, suite green** |
| `skipIfSavantFailed()` per test | assertions no-op on the failure they exist to catch |
| `run_query_long` on production (`:57`) | can never run in CI, by policy and latency |
| `.github/workflows/` = `retro-ingest.yml` | **no workflow runs `npm test`** |

*A test that has never failed proves nothing*, and this one **cannot**: a Vitest reconciliation harness, Jo's tool, not a drift alarm.

## 5. Five assertion classes, and what each catches

| Class | Asserts / catches | Triton incident it catches |
|---|---|---|
| **Reachability** | request succeeds; host, DNS, auth death | none — Lahman passes |
| **Shape** | key/column set; added, removed, renamed | the 2017-04-24 Savant 60→75-column rewrite **(documented)** |
| **Vocabulary** | enum values ⊆ known set; new or renamed codes | `SV`/`FA` (§5.3); MiLB Title-Case events |
| **Semantics** | type, unit, range, encoding; meaning shifts under a stable type | `inningsPitched` outs-encoding; 2017 velocity re-reference **(documented)** |
| **Freshness** | content recency, volume; a source that stopped | Lahman (§3) |

**The ordering is the finding:** shape is easiest and most taught yet only third by value — Triton's defects are vocabulary, semantics, freshness **(inferred)**.

### 5.1 Shape — the schema hash

Order-independent; fires before any row is upserted.

```ts
const hash = createHash('sha256').update([...headers].sort().join(',')).digest('hex')
expect(headers).toHaveLength(119)                 // 2026-08-12 baseline
expect(hash.slice(0, 12)).toBe('0d315721f34f')    // sorted-header digest
expect(new Set(headers)).toEqual(FIXTURE_HEADER_SET)  // names the delta
```

The digest gives a boolean, the set diff names the column — **assert both** **(inferred)**. In Confluent's taxonomy an added column is backward-compatible for a reader that ignores it, **breaking for a writer that forwards it verbatim** — Triton's upsert **(documented)**.

### 5.2 Semantics — types and encodings

Live Stats API, pitcher 669203, 2024, read 2026-08-12: 62 stat keys, `wins` = `15` (number), `era` = `"2.92"` and `inningsPitched` = `"194.1"` (**strings**) **(verified)**.

```ts
expect(typeof stat.era).toBe('string')                 // always a string
expect(stat.inningsPitched).toMatch(/^\d+(\.[012])?$/) // outs-encoded .0/.1/.2
expect(parseInningsPitched('194.1')).toBeCloseTo(194 + 1/3, 5)
```

The middle regex earns its keep: `.1`/`.2` are one and two outs, so `parseFloat("194.1")` — what `cron/player-stats/route.ts:88` does — is off by 0.233 IP *for every reliever*; whether that matters for qualification (`IP >= max(5, 0.20 · IP_leader)`) is Li's (`metric-governance/07`).

### 5.3 Vocabulary — the closure test

Five hardcoded maps in `update/milb/route.ts` translate those enumerations — `PITCH_NAME_MAP` (18 keys), `DESCRIPTION_MAP` (13), `TYPE_MAP` (13), `EVENT_NORMALIZE_MAP` (23), `BB_TYPE_MAP` (4) **(verified)** — each failing differently:

| Map | Fallback (`:230-234`) | What an unknown value becomes |
|---|---|---|
| `PITCH_NAME_MAP` | `\|\| pitchTypeCode` | raw code in `pitch_name`; no baseline join, no Stuff+ |
| `DESCRIPTION_MAP` | `\|\| details.description` | Title-Case text in a lowercase column |
| `TYPE_MAP` | `\|\| null` | ball/strike/in-play **silently lost** |
| `EVENT_NORMALIZE_MAP` | `?? event.toLowerCase().replace(/ /g,'_')` | a guessed snake_case value |

Hence two vocabularies in `milb_pitches.events`: the normalize map shipped **2026-06-08** (`410212b`), nothing backfilled earlier rows, so `Strikeout` and `strikeout` coexist **(verified)**. Cheap prevention, on the fixture:

```ts
const seen = new Set(fixturePitches.map(e => e.details?.type?.code).filter(Boolean))
expect([...seen].filter(c => !(c in PITCH_NAME_MAP))).toEqual([])   // closure
```

**The same closure across sources exposes two live defects.** Savant on 2026-08-08: `SV` → **"Slurve"**, `FA` → **"Other"**; the MiLB map (`:24`/`:34`) says `"Sweeper"`/`"Fastball"` **(verified)**. `pitch_baselines` is keyed on `(pitch_name, game_year)`, so a MiLB slurve normalizes against sweepers or nothing:

```ts
for (const [code, milbName] of Object.entries(PITCH_NAME_MAP))
  if (SAVANT_PITCH_NAMES[code]) expect(milbName).toBe(SAVANT_PITCH_NAMES[code])
```

`SAVANT_PITCH_NAMES` is a 14-entry fixture from one live CSV; comparability fallout is Li's (`metric-governance/08`).

### 5.4 Freshness — the assertion Lahman needed

```ts
const people = parseCsv(await fetchText(LAHMAN_CORE + '/People.csv'))
const maxDebut = Math.max(...people.map(r => +String(r.debut).slice(0, 4) || 0))
expect(maxDebut).toBeGreaterThanOrEqual(new Date().getFullYear() - 1)  // RED today: 2022
```

Three lines, red since roughly 2023. For any pinned static source: **assert content recency, never status code** **(inferred)**.

### 5.5 Truncation — a range assertion

The CSV endpoint has no cursor, so overflow is a silent row cap, and published caps disagree (25,000, 30,000, ~40,000) — detect, don't assume **(documented)**. Measured 2026-08-12: one regular-season date returned **4,543** rows, putting the nightly window at ~13–18k, **55–72%** of the lowest cap **(verified)**; the *manual* wide-range call overflows. Assert the class:

```ts
expect([25_000, 30_000, 40_000]).not.toContain(rows.length) // exact-cap detector
expect(rows.length).toBeGreaterThan(2_000)                  // in-season date
```

## 6. Two lanes: recorded fixtures and live smoke

They fail for different reasons and must not share a lane: a live check reddening on a provider hiccup in the pre-merge suite gets muted within a month, and a muted test certifies **(inferred)**.

| | **Recorded lane** | **Live lane** |
|---|---|---|
| Input | committed fixture (one feed, one CSV day) | real request to MLBAM |
| Question | *do we still honor the contract?* | *do they?* |
| Runs | every `npm test`, every PR | nightly (Actions) |
| Failure means | **our** change — block the merge | **their** change — file an issue |
| Network | none | required, flake tolerated |
| Determinism | total | none |

**Record once, replay forever** — Fowler's self-initializing fake, VCR cassettes, Polly.JS, Nock's `nock.recorder`: one idea in four ecosystems **(documented)**. MSW (`setupServer`) or undici `MockAgent` intercepts global `fetch`, fixtures under `__tests__/fixtures/upstream/` **(documented)**.

**Fixture hygiene, by priority.** (1) **Stamp every fixture** with URL and `captured_at`; undated is unfalsifiable. (2) **Keep them small**: one feed, one date's CSV (Cas `08`). (3) **Re-record on a cadence and diff, never blind-overwrite** — re-recording until tests pass makes the test a transcript of today's provider, the **(cargo-cult)** end of record/replay. (4) **The live lane says when to re-record.**

That is Google's flake control: small hermetic tests gate the merge, nondeterministic ones report **(documented)**. The suite is ~150 lines, runs in under a minute, and only one assertion needs a database **(inferred)**.

## 7. The contract nobody wrote down

The assertion that would have prevented Jo's §5 scenario — new Savant column ⇒ PostgREST rejects every batch ⇒ per-row fallback fails all 500 ⇒ `inserted = 0` ⇒ Stuff+ skipped ⇒ cron returns 200 — needs what the repo lacks **(verified)**:

- `scripts/` holds **70** `.sql` files; **none** creates `pitches` or `milb_pitches`.
- **No** generated Supabase/PostgREST type file in the tree.
- 33 of Savant's 119 live columns — `intercept_ball_minus_batter_pos_x_inches`, `_y_inches`, `hyper_speed`, `delta_pitcher_run_exp`, `bat_win_exp`, `age_pit_legacy`, the eight `fielder_*` and 19 more — appear in **no** `.ts`, `.tsx` or `.sql` file.

Does `pitches` have a column for the first of those? **The repo cannot answer, and neither can Cas without querying production** — that is the defect. A schema whose only copy is in production cannot be tested, reviewed or diffed, and `inserted += batch.length` counts no-op upserts, so the success signal is blind.

**The fix is boring and unlocks everything else:** commit a schema snapshot (`supabase gen types typescript`, or a `\d pitches` dump at `scripts/schema/pitches.columns.txt`), refreshed in CI. The top assertion becomes a set operation, no database:

```ts
const missing = liveHeaders.filter(h => !PITCHES_COLUMNS.has(h) && !h.startsWith('Unnamed'))
expect(missing).toEqual([])   // "Savant added a column pitches cannot store"
```

Until it exists, the answer to "will tonight's ingest reject every batch?" is *we find out at 09:00 UTC*.

## 8. What Triton should do, in order

1. **Commit a `pitches`/`milb_pitches` column snapshot to git**, regenerated in CI — §7 is blocked on it; one command.
2. **Add a CI workflow that runs `npm test`.** None of the 7 test files run on any push, so everything below is inert; fix the 5 masking `queryCache.test.ts` failures in the same PR (Cas `10`, `11`).
3. **Ship §5.4's freshness assertion on `import-lahman.ts` and repoint the URLs** at the maintained Lahman distribution — three lines, red today, closing a four-year-old silent failure.
4. **Ship the recorded lane:** one Savant CSV day, one MiLB game feed, one `people?hydrate=` response in §6's fixture directory, stamped with URL and `captured_at`, asserting §5.1–5.3. No network, no database, every PR.
5. **Ship the cross-source vocabulary test** and fix the two collisions (`SV` → Slurve, `FA` → Other), then decide with Li whether pre-fix `milb_pitches` rows need normalizing.
6. **Ship the live lane as a nightly Actions `schedule` job** that opens an issue and never blocks a merge: schema hash, truncation range, Lahman freshness.
7. **Assert the ingest's own counters** (`errors === 0`, `inserted > 0` in season) — Jo's recommendation #2, the last defense when a change slips past 4–6.

**Anti-recommendation — do not stand up Pact and a Pact Broker for MLBAM.** It is what "contract testing" pattern-matches to, and fails on three independent grounds. **(i) Needs a counterparty:** Pact's value is the provider replaying your expectations in *their* pipeline pre-release; MLBAM never will, so the broker stores pacts nobody verifies. **(ii) Wrong class:** Pact is strongest on request/response shape between services you both own; Triton's incidents were vocabulary, semantics and freshness — none a Pact matcher, and the worst (Lahman) is a static file with no request/response at all. **(iii) Raises the floor when the floor is the problem:** with zero tests in CI, a broker, publish step and versioning workflow buy nothing before `npm test` runs. **The same objection kills mirroring Savant's OpenAPI spec — there isn't one — and any "validate against the vendor schema" plan.** Zod at the boundary is the right size, in the ingest path as much as the tests.

**Single highest-leverage next action:** commit the generated `pitches` column list and add a five-line Vitest test asserting today's live Savant headers are a subset of it — converting Jo's §5 outage (HTTP 200, green cron, zero rows) from an unmonitored certainty into a scheduled red build.

## Sources

1. Fowler — [IntegrationContractTest](https://martinfowler.com/bliki/IntegrationContractTest.html) — §1's definition.
2. Fowler — [Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html) — the missing cooperation.
3. Fowler — [SelfInitializingFake](https://martinfowler.com/bliki/SelfInitializingFake.html) — §6's recorded lane.
4. Pact — [How Pact works](https://docs.pact.io/getting_started/how_pact_works) — the handshake §8 kills.
5. Pactflow — [What is contract testing](https://pactflow.io/blog/what-is-contract-testing/) — contract vs E2E scope.
6. Pact — [can-i-deploy](https://docs.pact.io/pact_broker/can_i_deploy) — the one Pact idea kept.
7. VCR — [cassettes](https://github.com/vcr/vcr) — original record/replay fixture.
8. Nock — [`nock.recorder`](https://github.com/nock/nock) — traffic into a fixture.
9. MSW — [docs](https://mswjs.io/docs/) — `setupServer` fetch interception.
10. Polly.JS — [docs](https://netflix.github.io/pollyjs/) — record/replay/passthrough.
11. undici — [MockAgent](https://undici.nodejs.org/#/docs/api/MockAgent) — native-fetch mocking.
12. Vitest — [Mocking guide](https://vitest.dev/guide/mocking) — `vi.mock`/`setupFiles`.
13. Zod — [docs](https://zod.dev/) — `safeParse` at the boundary.
14. Confluent — [Schema evolution](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) — §5.1's taxonomy.
15. dbt — [Sources](https://docs.getdbt.com/docs/build/sources) and [freshness](https://docs.getdbt.com/reference/resource-properties/freshness) — §3's assertion, productized.
16. Google Testing Blog — [Test Sizes](https://testing.googleblog.com/2010/12/test-sizes.html) — §6's lane split.
17. ApprovalTests — [approvaltests.com](https://approvaltests.com/) — golden-artifact discipline.
18. MLB — [Stats API reference](https://docs.statsapi.mlb.com/reference) — no changelog or versioning.
19. Baseball Savant — [CSV field docs](https://baseballsavant.mlb.com/csv-docs) — C1's only column reference.
20. Baseball Savant — [Bat-tracking](https://baseballsavant.mlb.com/leaderboard/bat-tracking) — §7's intercept columns.
21. pybaseball — [statcast docs](https://github.com/jldbc/pybaseball/blob/master/docs/statcast.md), [issue #20](https://github.com/jldbc/pybaseball/issues/20) — the 30,000-row cap claim.
22. sabRmetrics — [`download_baseballsavant`](https://saberpowers.com/sabRmetrics/reference/download_baseballsavant.html) — §5.5's 25,000 cap; Petti's [Statcast database v2.0](https://billpetti.github.io/2020-05-26-build-statcast-database-rstats-version-2.0/) gives ~40,000 plus restatement.
23. SABR — [Lahman database](https://sabr.org/lahman-database/) — §3's canonical home; PostgREST's [error reference](https://postgrest.org/en/stable/references/errors.html) is the unknown-column response; the [THT writeup](https://tht.fangraphs.com/research-notebook-new-format-for-statcast-data-export-at-baseball-savant/) is §5.1's precedent.

**Triton-internal evidence.** *Repo, 2026-08-12, no production database queried; inline `file:line` citations not repeated.* Also read: `import-lahman.ts:26-27` (status-only `fetchCSV`), `:60-68` (`ignoreDuplicates: true`); `update/route.ts:82` (120s `AbortSignal`), `:87` (`csv.length < 100` ⇒ success-with-zero), `:148-168`, `:181`; `cron/pitches/route.ts:36-38` (`[today−3, today]`, four dates, comment says "3 days"); `roster/route.ts:17-20` (`data.roster || []`, no shape check); `vitest.config.ts` (node, `testTimeout: 120_000`); `package.json:10`; 7 test files; `vercel.json` 18 cron entries; the 33-of-119 header scan covered the tree minus `node_modules`. *Live probes, 2026-08-12, public read-only.* Savant `statcast_search/csv` (`2026-08-08`, `hfGT=R|`) → 200 plus §5.1/§5.5's 119 columns, 4,543 rows and `0d315721f34f` digest; its `(pitch_type, pitch_name)` pairs include `('SV','Slurve')`, `('ST','Sweeper')`, `('FA','Other')`, plus one empty pair. Stats API `people?personIds=669203&hydrate=stats(...season=2024)` → 200, §5.2's 62 keys and string `era`/`inningsPitched`, plus `wins = 15` (number) and `inheritedRunners`. GitHub API, behind §3: `cbwinslow/baseballdatabank` `pushed_at = 2022-10-31T16:32:38Z`, 1 star, `fork: false`; `chadwickbureau/baseballdatabank` **404**; `chadwickbureau/register` `pushed_at = 2026-08-02T21:21:16Z`, 128 stars; that fork's `core/People.csv` 200, 2,715,809 bytes, 20,673 rows, **max debut 2022**. *From the packet:* the 19.07% coverage and 91-call-site counts cited above; `pitches` ~8,877,621 rows, `milb_pitches` ~2,508,422; Next.js 16.1.6, Vitest 4.1.3, TypeScript 5.9.3.
