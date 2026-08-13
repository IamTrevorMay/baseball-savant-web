---
title: Golden-File Metric Testing — Pinning the Numbers So Formula Drift Cannot Ship Silently
domain: testing-data-systems
tags:
  - golden-files
  - snapshot-testing
  - metric-drift
  - vitest
  - fixtures
  - approval-testing
  - ci-gating
  - documentation-drift
sources_reviewed: 22
last_updated: 2026-08-12
---

# Golden-File Metric Testing — Pinning the Numbers So Formula Drift Cannot Ship Silently

> Grades: **(verified)** Cas ran or read it at `file:line`; **(documented)** vendor docs; **(inferred)**
> mechanism; **(cargo-cult)** repeated, unsupported. No production query was run.

## TL;DR

- **A golden file is not a test of correctness — it is a test of *change*.** It forces a moved number to be seen and signed for: Triton's only defense against an unnoticed formula edit. (documented)
- **Triton has zero golden files.** `find . -name __snapshots__` returns nothing; of the 7 files in `__tests__/`, none imports `lib/metricRegistry.ts`, which formats, colors and aggregates all 69 metrics. (verified)
- **The registry is 87% unpinned.** 69 `MetricDef` entries, 9 sharing a key with `reportMetrics.METRICS`; 67 of 69 undocumented in `docs/VARIABLES.md`, Stuff+ absent. (verified)
- **The bugs a golden catches are already in the git history.** Career `maxEV`/`maxVelo` were *averaged*, career OPS *summed* — errors a rendered-table golden fails on at once. (verified)
- **Two adjacent lines of `lib/pitcherStats.ts` still hold that bug class.** `:130` averages `launch_speed` unfiltered — a NULL batted ball coerces to 0, dragging avgEV down; `:131` `.filter(Boolean)`s `launch_angle`, dropping real 0°s, lifting avgLA. (verified)
- **`PARK_FACTORS` is keyed `ARI`, pitch data `AZ`, the lookup `?.basic || 100`** — a miss reads as a neutral park, inflating Arizona hitters' wRC+ ~1% (`fixAbbrev` covers only the scores path). It is also one frozen 2024 vintage for 2015–2026, so an edit restates twelve seasons — a 1,080-line diff under a golden. (verified)
- **Snapshot the *rendered* cell, not the raw float.** `formatMetric`/`calcTotalsFromRegistry` emit `toFixed` strings, so a display golden is exactly deterministic; tolerances are `09-numeric-regression-detection.md`. (inferred)
- **Goldens fail by green-by-emptiness and reflex `-u`, not false alarms.** A regex that stops matching, a fixture that loses rows, a set difference over an empty set — all pass, so every assertion needs a non-degeneracy floor. Google's change-detector critique and Dodds' essay add the other half: an unread golden manufactures confidence. (documented)
- **Li's documentation-drift finding is assigned here and specified in §4.3** — path, four assertions, golden shape, failure message, and the shrink-only allow-list that ships today. (verified)

## 1. What a golden file is — and its two siblings

A golden (approval, characterization, snapshot) test runs code over a fixed input, serializes it, and byte-compares to a committed artifact — Feathers' characterization test, plus review.

| | Asks | Fails when | Owner |
|---|---|---|---|
| **Unit test** | is this value correct? | you knew the answer and it changed | any doc |
| **Golden file** | did *anything* change? | output differs from the artifact | **this doc** |
| **Numeric regression** | more than ε? | drift exceeds tolerance / shifts | `09-numeric-regression-detection.md` |

A unit test needs the answer in advance; nobody knows a 12-season career OPS offhand, which is why summing it survived. A golden needs only a diff and a reader. Runner mechanics (config, mocking, `.maybeSingle()`) are `11-vitest-nextjs-patterns.md`.

## 2. The drift Triton has to catch

**No automated check detects any of the eight** (`maxEV`/`maxVelo` was caught by hand); the only detector is a human noticing.

| Drift class | Live instance | Golden |
|---|---|---|
| Aggregation wrong | `TotalsStrategy:'avg'` on `ops`/`whip`/`era` (`metricRegistry.ts:188,195,203`) — unweighted mean | G1 |
| Aggregation silently edited | `maxEV`/`maxVelo` were `avg`, now `max` (`:292`,`:483`) | G1 |
| Null handling inverted | `pitcherStats.ts:130` (no filter) vs `:131` (`filter(Boolean)`) | G1 |
| Format/threshold edit | a `FormatSpec` digit or `ColorSpec` band repaints every dashboard | G2 |
| Definition contradiction | Deception/Unique defined two ways; `getTip()` picks by accident | G3 |
| Documentation divergence | 67/69 registry keys absent from `docs/VARIABLES.md` | G3 |
| Constants restatement | `SEASON_CONSTANTS`/`PARK_FACTORS` edits restate 2015–2026 wRC+ | G4 |
| Lookup miss reads neutral | `PARK_FACTORS[row.team]?.basic \|\| 100` at `scene-stats:136,398,1098,1671` | G4 |

## 3. Choosing fixtures

Four properties, in priority order: **readable in a diff** (hundreds of lines, not thousands, else review is theatre); **stable** (committed, never a live read — Savant restates `pitches` upstream); **adversarial** (NULL regions, small samples, cross-level rows); **provenanced** (date, query, row count in a sibling `.meta.json`).

### 3.1 Triton's fixture shortlist

| Fixture | Size | Key | Makes testable |
|---|---|---|---|
| `pitch_baselines` (whole) | **206 rows** | `(pitch_name, game_year)` | Stuff+'s frozen *vintage* |
| `league_averages` (whole) | **1,806 rows** | `(season, level, role, metric)` | every plus-stat denominator |
| One SP, full season | ~2,800 pitches | — | traditional + advanced + arsenal in one |
| One RP, one season | ~900 | — | the SP/RP boundary |
| Any pitcher, pre-2017 | ~2,500 | — | deception NULLs — null vs zero |
| Any pitcher, 2026 Jun–Jul | ~1,200 | — | the `stuff_plus` collapse |
| One MiLB pitcher, 2023+ | ~800 | — | Title Case `events` vs MLB lower |
| One ARI/AZ hitter season | ~600 PA | — | the park-key miss end to end |

**Cut them once, with a committed script, never at test time.** `scripts/cut-fixtures.ts` runs by hand against production, writing NDJSON with the ~25 columns the calc functions read (`events`, `description`, `bb_type`, `launch_speed`, `launch_angle`, `pitch_name`, the three `release_*`, `pfx_x`/`pfx_z`, `arm_angle`, `zone`, `pitch_number`, `delta_run_exp`, four `estimated_*`, `woba_value`, `game_year`, `game_date`). Full 90-column rows are ~10× the bytes and unreadable. **CI and agents never touch the database** (the 2026-08-11 outage, §8); anonymizing Compete/TrackMan fixtures is `08-test-data-management.md`.

## 4. The four goldens Triton needs

### 4.1 G1 — the rendered metric table

Input: a fixture pitch slice. Pipeline: `calcTraditionalByYear`/`calcAdvancedByYear`/`calcArsenal` → `calcTotalsFromRegistry` over `getColumns(group)` → per cell `formatMetric`, `getCellColor`.

```ts
// __tests__/lib/metricTable.golden.test.ts — cols = getColumns('pitcher:advanced')
const render = (rows, cols) =>
  [...rows, { ...calcTotalsFromRegistry(rows, cols.map(c => c.k)), __row: 'CAREER' }]
    .map(r => cols.map(c => `${c.l}=${formatMetric(c.k, r[c.k])}|${getCellColor(c.k, r[c.k])}`).join(' '))
    .join('\n')
expect(render(calcAdvancedByYear(fixture), cols)).toMatchFileSnapshot('./golden/advanced-sp.txt')
```

Three choices: **string, not float** (`toFixed` already ran — deterministic, no tolerance); **the color class** (presentation *is* part of the number, and a `ColorSpec` edit is otherwise untestable); **the CAREER row** (where the bugs live). Never `toMatchSnapshot()` (§6).

### 4.2 G2 — the registry contract

One golden holding the *shape* of all 69 entries, no data involved:

```ts
const contract = Object.values(METRIC_REGISTRY).sort((a, b) => a.key.localeCompare(b.key))
  .map(d => [d.key, d.label, d.unit || '-', JSON.stringify(d.format), d.color.mode,
             d.totals, d.higherBetter ?? '-', d.tip ? 'tip' : 'NO-TIP'].join('\t')).join('\n')
expect(contract).toMatchFileSnapshot('./golden/metric-registry-contract.tsv')
expect(Object.keys(METRIC_REGISTRY).length).toBeGreaterThan(60)   // non-degeneracy floor
```

69 lines. Adding a metric is a one-line diff; so is flipping `ops.totals` from `avg` to a ratio strategy — the review you want forced. `NO-TIP` publishes undefined metrics.

### 4.3 G3 — the documentation drift test *(assigned by `Li/metric-governance/09` §8.3)*

Li's fix: a Vitest drift test **Cas owns**, plus a glossary generated from the registry. Li supplies the contents; Cas makes it fail.

**Where it lives.** `__tests__/lib/metricDocs.test.ts`; golden `__tests__/golden/metric-doc-gaps.json`. Node env, no DB, no network — three imports plus `docs/VARIABLES.md` off disk; milliseconds, so `npm test`, not nightly. **Prerequisite:** export `METRIC_TIPS` (`lib/glossary.ts`).

**What it asserts.**

| # | Assertion | Fails on | Today |
|---|---|---|---|
| **A1** | every `METRIC_REGISTRY` key is a backticked first cell in `docs/VARIABLES.md`, minus the allow-list | a metric shipped undefined | 67 gaps → allow-listed |
| **A2** | no key where `def.tip` and `METRIC_TIPS[def.label]` both exist and differ | two surfaces defining one metric differently | **red** — `deceptionScore`, `uniqueScore` |
| **A3** | `getTip(key)` returns `def.tip` for every registry key | label-keyed `METRIC_TIPS` shadowing the tip | **red** — most labelled metrics |
| **A4** | every allow-list key is *still* undocumented | a stale entry re-permitting a gap | green |

A4 makes the list monotone: a documented metric whose allow-list line survives is itself a failure, so it can only shrink.

**What the golden contains.** Sorted arrays of bare keys, one diff line per key:

```json
{ "generated_from": ["lib/metricRegistry.ts", "docs/VARIABLES.md", "lib/glossary.ts"], "cut_date": "2026-08-12",
  "undocumented_keys": ["armAngle", "bb9", "brink", "…", "stuffPlus", "xfip"],
  "definition_conflicts": ["deceptionScore", "uniqueScore"], "shadowed_tips": ["…"] }
```

**How it fails loudly.** Four mechanisms, all required:

1. **The message names the fix:** `expect(newGaps, \`undocumented — add a docs/VARIABLES.md row or a MetricDef.tip:\n${newGaps.join('\n')}\`).toEqual([])`. A bare `toEqual` on 67 keys prints an unreadable array.
2. **A non-degeneracy floor beside every set difference:** `expect(documented.size).toBeGreaterThan(200)`, `METRIC_TIPS` keys `> 80`. If `VARIABLES.md`'s format changes or it moves, the regex matches nothing and A1 passes over an empty set — how this test dies.
3. **The allow-list is a committed file, not an inline array** — updating it needs `vitest -u` locally *and* a `CODEOWNERS`-guarded diff; CI's `vitest run` treats a changed or missing snapshot as a failure.
4. **Verify it red first:** revert the `deceptionScore` tip, confirm A2 greens, restore, confirm red. A test that has never failed proves nothing.

**Where this ends.** Li's `scripts/gen-variables-doc.ts` — `MetricDef` rendered into a delimited generated block, CI gating on `git diff --exit-code docs/VARIABLES.md` — retires A1 and the allow-list: generated sections cannot drift. A2/A3 survive: hand-authored surfaces, `METRIC_TIPS` generated from nothing.

### 4.4 G4 — the constants and park-factor golden

`computeWRCPlus` reads `SEASON_CONSTANTS` and `PARK_FACTORS` per request from **`lib/constants-data.ts`** (not `lib/sql.ts`, despite `docs/VARIABLES.md` §1.4). `PARK_FACTORS` has no time dimension — one 2024 vintage covering 2015–2026 — so any edit invisibly restates twelve seasons.

```ts
const grid = SEASONS.flatMap(y => PITCH_DATA_TEAMS.flatMap(t => [0.290, 0.320, 0.400].map(w =>
  `${y}\t${t}\t${w}\t${computeWRCPlus(w, SEASON_CONSTANTS[y] ?? SEASON_CONSTANTS[LATEST_SEASON_YEAR],
                                      PARK_FACTORS[t]?.basic ?? 100)}`)))
expect(grid.join('\n')).toMatchFileSnapshot('./golden/wrc-plus-grid.tsv')
// the assertion the golden cannot make for you:
expect(PITCH_DATA_TEAMS.filter(t => !(t in PARK_FACTORS)), 'no park factor — scores neutral').toEqual([])
```

~1,080 lines: a constants edit becomes a diff naming which seasons and teams moved, by how much. The assertion **fails today on `AZ`** — 31 keys include `ARI` (`basic: 101`), `OAK` and `ATH`, but not `AZ`, which pitch data and every `TEAMS` array use. `|| 100` yields a neutral park; wRC+ divides by `pf/100`, so Arizona hitters read ~1% high, a 120 showing as 121. `fixAbbrev` exists (`scene-stats:636–640`, `AZ→ARI`, `WSN→WSH`) but covers only the scores path.

**A lookup that cannot report a miss is a bug.** Replace `?.basic || 100` with a resolver that throws under test and logs a named warning in production — null-vs-zero again: a missing and a neutral park must never produce the same number.

## 5. Updating a golden safely

| Step | Rule | Why |
|---|---|---|
| 1 | Read the diff **before** `-u` runs | else the artifact records the bug |
| 2 | Golden updates get their **own commit**, cause in the message | `git log -- __tests__/golden/` is a restatement ledger |
| 3 | A golden diff on a PR claiming no behavior change **blocks** | the whole point |
| 4 | Goldens live under a `CODEOWNERS` path | a second reader on a one-keystroke act |
| 5 | Fixture regeneration **never** rides with a code change | else input and formula moved together, unattributable |
| 6 | A restatement updates `docs/VARIABLES.md` in the same commit | repo convention; `Li/metric-governance/02` rescore policy |

Step 5 is the one people skip: fixtures re-cut alongside a `pitcherStats.ts` change make the diff uninterpretable — a regression absorbed into a refresh. Vitest has no `cargo-insta review` or ApprovalTests-style diff reporter, so steps 2–4 enforce "read the diff first" procedurally.

## 6. How golden tests fail

| Failure mode | Symptom | Guard |
|---|---|---|
| **Change-detector** | every PR touches a golden; reflex-`-u` | few, semantically named, one concern |
| **Green by emptiness** | assertion runs over an empty set | non-degeneracy floor per set difference |
| **Nondeterminism** | key order, `Date.now()`, locale | sort keys, freeze time, `toFixed` not `toLocaleString` |
| **Fixture rot** | no longer resembles production | `.meta.json` cut date; re-cut per offseason |
| **Obsolete snapshots** | deleted tests leave orphans | `vitest run` reports them; fail CI |
| **Blob goldens** | one `.snap`, five tables, unreadable | `toMatchFileSnapshot` per file |
| **Never-failed test** | passes since it was written | mutation drill: revert the fix, go red |
| **Golden of a live query** | fails on upstream restatements | fixtures only; §3 rule 2 |

Mutation drill in the definition of done: revert `maxEV.totals` to `'avg'`, watch G1 redden — 30 seconds, the only evidence the golden is wired to anything.

## 7. CI wiring

`.github/workflows/` holds one file, `retro-ingest.yml`: **no workflow runs the test suite**, so goldens are checked only when someone remembers `npm test`. Minimum gate:

```yaml
- run: npm ci
- run: npm test        # vitest run — no -u, no --allowOnly
```

Two blockers first. `__tests__/lib/queryCache.test.ts` has 5 pre-existing failures (the Supabase mock lacks `.maybeSingle()`), so the suite is red before any golden lands — that fix is `11-vitest-nextjs-patterns.md`. And `vitest.config.ts`'s `testTimeout: 120_000` suits network tests; offline goldens belong in a fast project, so a hang is obvious. Being pure, they run on every push at near-zero cost. Deploy gating on *data* checks (freshness, coverage) is `10-ci-cd-for-data-apps.md` and Jo.

## 8. What Triton should do, in order

1. **Ship A2 alone** — export `METRIC_TIPS`, write the 15-line conflict assertion in `__tests__/lib/metricDocs.test.ts`. No fixtures, no golden, no allow-list; red today on `deceptionScore`/`uniqueScore`.
2. **Add the CI workflow** running `npm test`, after fixing the 5 `queryCache` failures. Until it exists, nothing below is enforced.
3. **G2, the registry contract golden** — 69 lines, zero fixtures, catching format/color/totals edits across every dashboard; highest coverage per byte.
4. **G4's lookup assertion**, then fix `AZ`, then the grid golden — assertion first, so it is not born recording the bug.
5. **Complete G3** — A1/A3/A4, the allow-list golden, both floors. Hand the contents question (is `sos` one metric or two? which IP?) to **Li**.
6. **Cut fixtures** via `scripts/cut-fixtures.ts`, starting with `pitch_baselines` (206 rows) and one SP season, with `.meta.json`.
7. **G1, the rendered-table golden**, then the mutation drill against `maxEV.totals` and `pitcherStats.ts:130–131`.
8. **Hand the residue on** — tolerances and distribution assertions to `09-numeric-regression-detection.md`; invariants ("usage% sums to 100") to `06-property-based-testing.md`.

**Anti-recommendation — do not snapshot `/api/player-data` for a real player against production.** The obvious move ("the number the user sees"), wrong on three grounds. **(i) It needs the production database from CI**, what this platform was already burned by — ~20 concurrent readers took Supabase down for roughly an hour on 2026-08-11 — and fails whenever the database sleeps. **(ii) The input is mutable**: Savant restates rows and the nightly cron rewrites `stuff_plus` against a moving baseline, so it reddens on days nobody touched the code, training the reflex `-u` that makes goldens worthless. **(iii) It cannot localize a failure** — a red diff cannot say whether the formula, the baseline vintage or the row moved, the entire purpose of a fixed input. Smaller: never park several tables in one inline `toMatchSnapshot()` blob.

**Single highest-leverage next action:** export `METRIC_TIPS` from `lib/glossary.ts` and commit assertion A2. Fifteen lines, no infrastructure, fails today — the exact deliverable `Li/metric-governance/09` §8.3 assigns to Cas.

## Sources

**Snapshot mechanics (Vitest 4.1.3 / Jest)**
1. Vitest — [Snapshot guide](https://vitest.dev/guide/snapshot) — file vs inline, obsolete reporting.
2. Vitest — [`toMatchFileSnapshot`](https://vitest.dev/api/expect#tomatchfilesnapshot) — behind every §4 golden.
3. Vitest — [`toMatchInlineSnapshot`](https://vitest.dev/api/expect#tomatchinlinesnapshot)
4. Vitest — [`addSnapshotSerializer`](https://vitest.dev/api/expect#expect-addsnapshotserializer)
5. Vitest — [CLI reference](https://vitest.dev/guide/cli) — `--update`, `--allowOnly`.
6. Vitest — [Config reference](https://vitest.dev/config/) — `testTimeout`, projects.
7. Jest — [Snapshot testing](https://jestjs.io/docs/snapshot-testing) — commit, review, stay focused.

**Approval / characterization lineage**
8. [ApprovalTests](https://approvaltests.com/) — review-step-first.
9. [Approvals.NodeJS](https://github.com/approvals/Approvals.NodeJS) — external diff reporters.
10. Wikipedia — [Characterization test](https://en.wikipedia.org/wiki/Characterization_test)
11. Michael Feathers — [Characterization Testing](https://michaelfeathers.silvrback.com/characterization-testing)
12. [insta](https://insta.rs/docs/) — `cargo-insta review`.
13. [syrupy](https://github.com/syrupy-project/syrupy)
14. [pytest-regressions](https://pytest-regressions.readthedocs.io/en/latest/) — numeric goldens.

**The counterargument**
15. Google Testing Blog — [Change-Detector Tests Considered Harmful](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html)
16. Kent C. Dodds — [Effective Snapshot Testing](https://kentcdodds.com/blog/effective-snapshot-testing)
17. Martin Fowler — [SelfTestingCode](https://martinfowler.com/bliki/SelfTestingCode.html) — the standard 5 red tests fail.

**Fixed-input testing, data/metric layers**
18. dbt — [Unit tests](https://docs.getdbt.com/docs/build/unit-tests) — fixed inputs, expected outputs.
19. SQLMesh — [Testing](https://sqlmesh.readthedocs.io/en/stable/concepts/tests/) — YAML fixtures pin output.
20. SQLMesh — [Table diff](https://sqlmesh.readthedocs.io/en/stable/guides/tablediff/) — G4's grid.
21. NumPy — [`assert_allclose`](https://numpy.org/doc/stable/reference/generated/numpy.testing.assert_allclose.html) — tolerances *not* used here.

**Fixture provenance, review gating**
22. Baseball Savant — [CSV field docs](https://baseballsavant.mlb.com/csv-docs) — the mutable upstream.
23. GitHub — [About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
24. Git — [gitattributes](https://git-scm.com/docs/gitattributes) — marking goldens generated.

**Triton-internal evidence.** Read 2026-08-12; no database queries run. `__tests__/`: 7 files; `find . -name __snapshots__ -not -path ./node_modules/*` returns nothing; none imports `lib/metricRegistry.ts`. `.github/workflows/`: only `retro-ingest.yml`. `package.json`: `next` 16.1.6, `vitest` ^4.1.3, `typescript` 5.9.3, `"test": "vitest run"`; `vitest.config.ts`: `environment:'node'`, `testTimeout: 120_000`. `lib/metricRegistry.ts` — 702 lines, 69 `MetricDef` entries; `TotalsStrategy` `:4`, `GROUP_COLUMNS` `:564`, `getColumns` `:597`, `formatMetric` `:608`, `getCellColor` `:618`, `calcTotalsFromRegistry` `:643`, `needsPercentSuffix` `:694`, `getRegistryTipByLabel` `:699`; `stuffPlus.totals='avg'` `:553`. Nulls: `pitcherStats.ts:130` (unfiltered `launch_speed` → NULL→0 at the `:164` `avg` reducer), `:131` (`.filter(Boolean)` on `launch_angle`). Parks: `lib/constants-data.ts:28–61` — 31 keys incl. `ARI {basic:101}`, `OAK`, `ATH`, **no `AZ`**; `LATEST_SEASON_YEAR` `:65`; `computeWRCPlus` `lib/sql.ts:53–61`; lookups `scene-stats/route.ts:136,398,1098,1671`, all `?.basic || 100`; `fixAbbrev` `:636–640`, scores path only; `AZ` is used by `app/api/roster/route.ts:4`, `app/(research)/reports/page.tsx:14` and every other `TEAMS` array. Li's audit (`Li/metric-governance/09-metric-documentation-glossary.md` §2–§3, 2026-08-11) supplies registry↔SQL linkage, the 67/69 gap, the absent Stuff+ row, the Deception/Unique contradiction, `getTip()`'s namespace chain; `Li/metric-governance/02`, baseline vintage and rescore policy. Fixture counts (`pitch_baselines` 206, `league_averages` 1,806), the 8.89M-row `pitches` table and the 2026 `stuff_plus` collapse were measured centrally 2026-08-12, cited not re-measured. The Supabase outage (~20 concurrent subagent readers) and the 5 `queryCache.test.ts` failures are in `Cas/context/triton-context.md`, `.claude/agents/BUILD.md`.
