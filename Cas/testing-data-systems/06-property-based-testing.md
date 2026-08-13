---
title: Property-Based Testing — Asserting What Must Be True for Every Input
domain: testing-data-systems
tags:
  - property-based-testing
  - fast-check
  - metamorphic-testing
  - invariants
  - numeric-testing
  - stuff-plus
  - metric-registry
sources_reviewed: 24
last_updated: 2026-08-12
---

# Property-Based Testing — Asserting What Must Be True for Every Input

> Grades: **(verified)** Cas ran it here on the stated date; **(documented)** framework docs or
> published paper; **(inferred)** mechanism reasoning from code read, not run; **(cargo-cult)**
> widely repeated, no support.

## TL;DR

- **`fast-check` is not installed** — `grep -c fast-check package-lock.json` → `0`, none in `node_modules`. One devDependency, no Vitest config change. **(verified)**
- **The tooling is the cheap half — the invariant catalogue in §3–§5 is written, and eleven of its properties fail today.** **(verified)**
- **A degenerate baseline and a perfectly average pitch produce the identical Stuff+.** `NULLIF(std_velo,0)` → NULL → `COALESCE(…,0)`: 105 mph at `std_velo = 0` scores **exactly 100**, same as a league-mean pitch. **(verified)**
- **Two Stuff+ properties encode defects rather than guarantees**: `(14,0)`, `(0,14)` and `(−9.9,−9.9)` inches all score **103** (movement is rotation-invariant, direction discarded), and `pfx` in inches not feet scores **200**, not an error — the `[0,200]` clamp launders a 12× dimensional bug into an elite grade. **(verified)**
- **`calcTotalsFromRegistry` renders the literal string `"NaN.NaN"`** when any row has a null `ip`, and turns `"5.7"` innings into `"7.1"` by reading decimal thirds as outs. **(verified)**
- **NULL is colored as a judgement.** `getCellColor('totalRE', null)` → `text-red-400`; six `plus`-mode metrics color NULL `text-orange-400` (below average) because `Number(null) === 0` — 7 of 69 entries. **(verified)**
- **`computeWRCPlus` has a perfect oracle**: at league wOBA and neutral park it returns exactly `100` for all 12 `SEASON_CONSTANTS` seasons, no tolerance. It also accepts park factor `−100`, returning `−128`. **(verified)**
- **Metamorphic relations catch what example tests structurally cannot**: FIP is scale-invariant, IP must survive duplicate rows, plus-stats must *not* average linearly — the last asserts a difference, not an invariance. **(verified / inferred)**
- **Fix the 5 pre-existing `queryCache` failures before any property lands** — an already-red suite cannot tell you a generator found something. **(verified)**
- **"Property tests replace example tests" is cargo-cult.** Golden files pin the *value*, properties pin the *shape*. **(cargo-cult)**

---

## 1. Three kinds of assertion, and what each can see

| | **Example-based** | **Property-based** | **Metamorphic** |
|---|---|---|---|
| Assertion | `f(x₀) === y₀` | `∀x. P(f(x))` | `∀x. R(f(x), f(t(x)))` |
| Needs a known answer | **Yes** | No | **No** |
| Input source | Hand-picked | Generated + shrunk | Derived by transform `t` |
| Finds | Regressions on paths you imagined | Domain edges, NaN/null/∞, ordering | Wrong *relationships* between correct-looking outputs |
| Misses | Everything unimagined | Anything not a predicate | Absolute correctness — all outputs can be wrong together |

Metamorphic testing exists for code with **no test oracle**: you cannot compute a pitcher's "true"
Stuff+, but you can say flipping the sign of `pfx_x` must not change it. Chen et al. and Segura et
al. call this the standard escape from the oracle problem — where Triton's metric layer sits.
**(documented)**

**Division of labour:** golden files pin known values for known fixtures
(`05-golden-file-metric-testing.md`), properties pin the algebra, metamorphic relations pin
cross-screen behaviour.

---

## 2. The tool: `fast-check`, and the honest cost

`fast-check` is the mature TypeScript property runner (QuickCheck lineage, Claessen & Hughes 2000).
Checked 2026-08-12: **absent** from `package.json`, `package-lock.json`, `node_modules`. **(verified)**

| Decision | Recommendation | Why |
|---|---|---|
| Library | **`fast-check`** | Zero runtime deps, TS-native, integrated shrinking, maintained **(documented)** |
| Binding | **`@fast-check/vitest`** | `test.prop([fc.double()])(…)`, no `fc.assert` boilerplate; Vitest 4.1.3 already the runner |
| Install | `npm i -D fast-check @fast-check/vitest` | devDependency only; nothing reaches the client bundle |
| Runs | Default `numRuns: 100` | 100 × ~30 properties adds milliseconds to a **221 ms** suite **(verified)** |
| Seeds | **Pin the replay seed on failure** | fast-check prints `seed`/`path`; paste into `fc.assert(…, {seed, path})` **(documented)** |

**Shrinking is the feature, not the generation.** `{velo: 91.34012, pfx_x: −1e−7}` is noise; shrunk
to `{velo: 91, pfx_x: 0}` it is a bug report. A runner without shrinking is not worth the dependency.
**(documented)**

**Generators must be domain-shaped.** Unconstrained `fc.double()` spends its budget at `1e308`
reporting "overflow". Model the column:

```ts
const velo  = fc.double({ min: 60, max: 106, noNaN: true })
const pfxFt = fc.double({ min: -2.5, max: 2.5, noNaN: true })   // FEET — Savant's unit
const ext   = fc.double({ min: 4.5, max: 8.0, noNaN: true })
```

Then add **one** hostile generator per property — `null`, `NaN`, `''`, `'—'`, `'1,234'` — the class
every §5 failure comes from. **(inferred)**

---

## 3. Invariant catalogue — Stuff+

The scorer, verbatim from `app/api/update/route.ts:320-333`:

```sql
stuff_plus = GREATEST(0, LEAST(200, ROUND(100
  + COALESCE((release_speed - avg_velo)/NULLIF(std_velo,0),0)*4.5
  + COALESCE((SQRT(POWER(pfx_x*12,2)+POWER(pfx_z*12,2)) - avg_movement)/NULLIF(std_movement,0),0)*3.5
  + COALESCE((release_extension - avg_ext)/NULLIF(std_ext,0),0)*2.0)))
```

Ported to TS over the 4-Seam baseline (`avg_velo` 93.13, `std_velo` 2.84,
`lib/leagueStats.ts`), 2026-08-12. All nine **(verified)**; no database touched.

| # | Property | Result | Verdict |
|---|---|---|---|
| S1 | **Range**: output ∈ ℤ ∩ [0,200] ∪ {NULL} for every input | holds | Regression guard |
| S2 | **Centering**: all three inputs at baseline mean ⇒ **exactly 100** | 100 | Exact-equality oracle |
| S3 | **Monotone in velocity** when `std_velo > 0` | holds, 70→105 mph | Keep |
| S4 | **Rotation invariance**: equal-magnitude `(pfx_x, pfx_z)` score alike | 103 = 103 = 103 | **Documents a defect** |
| S5 | **σ-collapse indistinguishability**: `std_velo = 0`, 105 mph | **100** | **Should fail. Doesn't.** |
| S6 | **Dimensional guard**: `pfx` in inches, not feet | **200** | **Should fail. Clamps instead.** |
| S7 | **Scale**: 1 point = 0.631 mph = 0.166 composite SD | — | Rounding is coarse, not free |
| S8 | **Clamp reachability**: binding [0,200] needs 16.55 composite SD | — | Firing ⇒ alarm, not an extreme pitcher |
| S9 | **Thin cell**: `std_velo = 0.5`, +6 mph ⇒ **154** | 154 | No `pitch_count` floor exists |

**S5 is the important one.** `COALESCE(…, 0)` *silently imputes league average* for a missing or
degenerate baseline — nothing in the output signals a component went unscored. Assert the
negation:

```ts
test.prop([velo, pfxFt, pfxFt, ext])('a null component must not score as average',
  (v, x, z, e) => {
    expect(stuffPlus({ v, x, z, e: null }, base)).not.toBe(stuffPlus({ v, x, z, e }, base))
  })   // fails today for every input
```

Watch it go red, then mark it `.fails()` or fix the SQL. **A test that has never failed proves
nothing**; this one proves the imputation is unobservable. NULL propagation vs. a coverage flag is
Li's (`Li/metric-governance/05-baseline-normalization-design.md` §4.2); cell size is Jo's
(`Jo/data-quality/`).

**S4 and S6 justify the technique.** No hand-written test thinks to pass `pfx` in the wrong unit; a
generator does it by accident within twenty runs, and the clamp hides it.

---

## 4. Invariant catalogue — the TypeScript metric functions

Run against `lib/sql.ts` and `lib/constants-data.ts`, 2026-08-12, all **(verified)**:

| # | Function | Property | Result |
|---|---|---|---|
| F1 | `computeWRCPlus` | wOBA = lgwOBA ∧ PF = 100 ⇒ **exactly 100**, all 12 seasons | holds |
| F2 | `computeWRCPlus` | strictly increasing in wOBA for PF > 0 | holds |
| F3 | `computeWRCPlus` | PF ≤ 0 ⇒ null | **fails**: PF = −100 ⇒ **−128**; only PF = 0 nulls |
| F4 | `computeFIP` | **degree-0 homogeneous**: scaling K/BB/HBP/HR/IP by c leaves FIP fixed | holds (3.24 = 3.24) |
| F5 | `computeFIP` | IP ≤ 0 ⇒ null | holds, incl. negative IP |
| F6 | `computeXERA` | increasing in xwOBA; null on ip ≤ 0, pa ≤ 0, xwoba null | holds |
| F7 | `pivotTritonRows` | output ∈ [min, max] of contributing inputs | holds |
| F8 | `pivotTritonRows` | `pitches` equals the weight denominator | **fails**: `{100,110}`,`{0,200}`,`{50,null}` ⇒ `pitches = 150`, value weighted over **100** |
| F9 | `pivotTritonRows` | all weights 0 ⇒ null, not 0 or NaN | holds |
| F10 | `PARK_FACTORS` | every team key resolvable | **31 keys**; `'ARI'` present, `'AZ'` absent |
| F11 | `PARK_FACTORS[t]?.basic \|\| 100` | unmatched team ≠ neutral park | **fails**: both give `100` |

**F1 is the most valuable property in the repo** — an exact-equality identity over generated seasons
and wOBA, no tolerance or fixture, catching any edit to the constants, formula, or park scaling.

**F8 is a sample-size lie in Cas's own territory** — 150 pitches displayed beside a value averaged
over 100. **Any property of the form "the displayed n equals the denominator's n" outranks
every statistical property.**

**F11 is null-vs-zero wearing a `||`**: `?.basic || 100` maps a missing key, `0`, and `NaN` to one
plausible neutral, so an ID-crosswalk failure looks like an average park. Fix: `?? 100` plus
`assertKnownTeam`; the crosswalk is `Li/entity-resolution/`.

---

## 5. Invariant catalogue — the presentation layer

`lib/metricRegistry.ts` holds **69** `MetricDef` entries, `METRICS` in `lib/reportMetrics.ts` **59**
SQL expressions, and exactly **9** keys appear in both — `games, ip, pa, pitches, h, ba, obp, slg,
ops`. **(verified)** The rest has no programmatic link to how its number is computed, so
registry-wide properties are the cheapest coverage available: one property × 69 entries.

| # | Property over **all** registry keys | Result 2026-08-12 |
|---|---|---|
| P1 | `formatMetric(k, 0) !== formatMetric(k, null)` — zero and no-data never alike | **holds** (`"0%"` vs `"—"`) |
| P2 | output ends in `%` ⟺ `needsPercentSuffix(k)` | holds, 13 pct keys |
| P3 | `getCellColor(k, null)` returns a neutral class | **fails on 7 of 69**: `totalRE` → `text-red-400`; six `plus` keys → `text-orange-400` |
| P4 | `getCellColor(k, '—')` returns a neutral class | **fails**: `totalRE` → `text-red-400` |
| P5 | `plus` mode: `high >= low` for every entry | holds (6/6) |
| P6 | `calcTotalsFromRegistry` returns a finite number or `'—'` | **fails**: `ip` with one null row ⇒ **`"NaN.NaN"`** |
| P7 | IP round-trip: `totals([x]) === x` for a single row | **fails**: `"5.7"` ⇒ **`"7.1"`** |
| P8 | IP totals correct in baseball notation | holds: `5.2 + 5.2` ⇒ `11.1` |
| P9 | Totals cell type stable across strategies | **fails**: `sum` ⇒ number `150`; `avg` ⇒ `"2300.0"`; `max` ⇒ `"110.1"` |
| P10 | Non-numeric input does not silently coerce | **fails**: `'1,234'` + `'12abc'` ⇒ **13** |
| P11 | Every `GROUP_COLUMNS` key resolves to a `MetricDef` | worth asserting; `getColumns` falls back to the raw key |

**P3/P4 are the color channel's defining hazard.** `Number(null) === 0 < 100`, so a NULL Cmd+ renders
below-average — the screen judges a number that does not exist. `Number('—')` is `NaN` and the
`inverted_value` branch has no `isNaN` guard, so `NaN < 0` is false and the cell goes red. One-line
fixes; the property keeps them fixed past 69 entries.

**P6/P7 are a notation collision, not rounding.** `METRICS.ip` emits decimal thirds rounded to one
place (`ROUND(outs/3, 1)` → `5.7` for 5⅔); the `ip` totals strategy reads that digit as *outs*
(`5×3 + 7 = 22 outs = 7.1 IP`). Each is internally consistent; joined they inflate a season by 1.4
innings. `parse(format(x)) === x` catches it on run one.

---

## 6. Metamorphic relations worth encoding

Each is `∀ input. R(f(x), f(t(x)))` — no oracle needed. **(inferred** unless marked**)**

| Transform `t` | Relation that must hold | What a violation means |
|---|---|---|
| Duplicate every pitch row | `METRICS.ip` unchanged | `COUNT(*) FILTER`, not `COUNT(DISTINCT ab)`: duplicate ingest inflates it, distinct-counted `IP_ESTIMATE_SQL` survives. Two IP definitions — `lib/sql.ts:16` vs `lib/reportMetrics.ts:9` **(verified** by reading**)** |
| Permute row order | Aggregates unchanged within 1e−9 | Float summation is non-associative — a tolerance, never `toBe` **(documented)** |
| Split a season and recombine | `sum` additive; **`avg` not** | `avg` is unweighted, so halves ≠ season. Correct by design; the property documents it |
| Scale all counting inputs by c | FIP, K%, BB%, whiff% unchanged | Rate homogeneity — F4 generalized |
| Shift usage between pitch types, each type's Stuff+ fixed | Aggregate Stuff+ **must change** | Plus-stats do not average linearly; asserting invariance would assert a bug |
| `league_averages` as `percentile_cont(0.5)` vs `AVG()` | Outputs **differ** on skewed rates | `docs/VARIABLES.md` documents a median, the SQL computes a mean; the property proves they are not interchangeable. Li's call |
| Same query at pitch- / game- / season-weighting | Results differ by construction | Assert the *difference* so a silent grain change is loud |
| Re-run the scorer on an unchanged baseline | Byte-identical output | Idempotence — `04-idempotency-backfill-testing.md` |

**The relations that assert outputs *must differ* are the ones that pay** — an unusual shape,
exactly right when two distinct estimands might silently collapse into one column.

---

## 7. Making properties trustworthy

| Failure mode | Symptom | Fix |
|---|---|---|
| **Tautological property** | Reimplements `f` inside the assertion | Assert relations and bounds, never a second copy of the formula |
| **Vacuous filtering** | `fc.pre(...)` rejects 99% of inputs | Constrain the *generator*, not the run |
| **Float equality** | Flakes ~1 run in 10⁴ | `toBeCloseTo` with a stated tolerance (`09-numeric-regression-detection.md`) |
| **Unreproducible failure** | CI red, local green | Commit the printed `seed` + `path` as a pinned regression |
| **Random seed in CI** | Different inputs every run | Fine *if* failures auto-pin; never randomize a seed you cannot replay |
| **Slow oracle** | Suite balloons | Keep properties pure and in-process — no DB, network, or Supabase mock |

Every property in §3–§5 runs on pure functions with hand-built baselines. **None require the
production database** — safe on every commit, which the ingest path is not.

---

## 8. What Triton should do, in order

1. **Fix the 5 `queryCache.test.ts` failures first** (Supabase mock lacks `.maybeSingle()`): 122
   tests / 93 pass / 5 fail / 24 skip on 2026-08-12 — a red suite cannot report a new red.
2. **`npm i -D fast-check @fast-check/vitest`** — no Vitest config change.
3. **Ship P1–P5 and P11 as one file**: six properties × 69 entries, pure functions, no fixtures.
   P3/P4 go red at once — guard `getCellColor` on null/`NaN` with `text-zinc-400`, re-run, confirm
   the property was real.
4. **Fix the `ip` totals strategy** (P6/P7): filter nulls before parsing, split the notation into
   `parseOuts`/`formatOuts` with a round-trip property. `"NaN.NaN"` is on screen today.
5. **Add F1 and F4** to `__tests__/lib/sql.test.ts`, which already imports all three functions: two
   properties, ~10 lines.
6. **Add F8 and F11**: the displayed `n` must equal the denominator's `n`, and an unmatched team key
   must not resolve to a neutral park. Honest-presentation bugs, not style.
7. **Port the Stuff+ SQL to a tested TS function and assert S1–S9**, S5 and S6 committed as expected
   failures until the imputation is fixed. Porting is the cost; §3 is the payoff.
8. **Encode the §6 relations that assert a difference** — usage-shift and grain-change: the only
   executable defence against two estimands merging into one column.

**Anti-recommendation: do not point a property runner at `/api/report` or `/api/player-data`.** The
obvious next step — generate filter combinations, assert no 500s — is wrong on three grounds.
**(1)** It hits the production database, and ~20 concurrent readers already took Supabase down for an
hour; a 100-run property is 100 queries per assertion. **(2)** Route-level assertions
collapse to "did not throw", a smoke test in a property's clothes — blind to a wrong number, and
every real bug in §3–§5 returns HTTP 200. **(3)** Generated filter sets have no meaningful shrinking
target — the minimal failing input is a filter matching zero rows, not a bug. Properties belong on pure functions; routes in
`07-integration-e2e-testing.md` with recorded fixtures.

**Highest-leverage next action:** fix `queryCache.test.ts`, install `fast-check`, and land P1–P5
plus F1 in one PR — six assertions cover 69 metrics, and P3 turns a live "NULL renders as
below-average" defect into a red test on run one.

---

## Sources

1. [fast-check](https://fast-check.dev/) — §2's library; zero-runtime-dep, TS API claims.
2. [fast-check — Quick start](https://fast-check.dev/docs/tutorials/quick-start/) — `test.prop` shape (§3).
3. [fast-check — Arbitraries](https://fast-check.dev/docs/core-blocks/arbitraries/) — `fc.double({min,max,noNaN})` for §2.
4. [fast-check — Global settings](https://fast-check.dev/docs/configuration/global-settings/) — `numRuns`, `seed`/`path` replay (§7).
5. [fast-check — Model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/) — stateful variant Triton does not need yet.
6. [dubzzz/fast-check on GitHub](https://github.com/dubzzz/fast-check) — maintenance behind the dependency call.
7. [`@fast-check/vitest` on npm](https://www.npmjs.com/package/@fast-check/vitest) — Vitest binding (§2).
8. Claessen & Hughes (2000), [*QuickCheck*](https://doi.org/10.1145/351240.351266) — generate-and-shrink model fast-check implements.
9. Hughes (2020), [*How to Specify It!*](https://doi.org/10.1007/978-3-030-47147-7_4) — taxonomy behind §3–§6, §7's tautology warning.
10. Chen et al. (2018), [*Metamorphic Testing: A Review of Challenges and Opportunities*](https://doi.org/10.1145/3143561) — §1's oracle-problem framing, §6's relations.
11. Segura et al. (2016), [*A Survey on Metamorphic Testing*](https://doi.org/10.1109/TSE.2016.2532875) — relation families; §6's "must differ" pattern.
12. [Metamorphic testing](https://en.wikipedia.org/wiki/Metamorphic_testing) — definition of `R(f(x), f(t(x)))`.
13. [Test oracle](https://en.wikipedia.org/wiki/Test_oracle) — why Stuff+ has none (§1).
14. [Hypothesis — What is property-based testing?](https://hypothesis.works/articles/what-is-property-based-testing/) — properties-not-examples argument (§1).
15. Hillel Wayne, [*Metamorphic Testing*](https://www.hillelwayne.com/post/metamorphic-testing/) — practitioner framing of §6's transforms.
16. [Vitest guide](https://vitest.dev/guide/) — runner in-repo; §2 needs no config change.
17. Goldberg, [*What Every Computer Scientist Should Know About Floating-Point Arithmetic*](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) — §6's permutation tolerance, §7's float flake.
18. [Kahan summation](https://en.wikipedia.org/wiki/Kahan_summation_algorithm) — non-associativity behind the 1e−9 reorder tolerance.
19. [PostgreSQL — Conditional Expressions](https://www.postgresql.org/docs/current/functions-conditional.html) — `NULLIF`/`COALESCE` semantics producing S5.
20. [MDN — `parseFloat()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseFloat) — prefix-parsing behind P10's `'1,234'` → `1`.
21. [MDN — `Math.max()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/max) — spread-arg limit for `max` totals on big row sets.
22. [Baseball Savant — CSV docs](https://baseballsavant.mlb.com/csv-docs) — `pfx_x`/`pfx_z` are **feet**, S6's unit.
23. [MLB Glossary — Innings Pitched](https://www.mlb.com/glossary/standard-stats/innings-pitched) — `.1`/`.2` outs notation P7 encodes.
24. [FanGraphs Library — FIP](https://library.fangraphs.com/pitching/fip/) — published form `computeFIP` implements (F4).

**Triton-internal evidence.** All numbers executed locally 2026-08-12; **no database queries were
run.** Dependency: no `fast-check` in `package-lock.json` or `node_modules`; `package.json` lists `vitest ^4.1.3`, `typescript 5.9.3`, `next 16.1.6`, no property runner.
`npx vitest run` → **7 files, 122 tests, 93 passed, 5 failed, 24 skipped, 221 ms**; all 5 failures
in `__tests__/lib/queryCache.test.ts` from `.maybeSingle is not a function` at
`lib/queryCache.ts:22`. §3 results: `app/api/update/route.ts:320-333` ported to JS against the
4-Seam baseline in `lib/leagueStats.ts`; monotonicity swept 70–105 mph in 0.05 steps; 1 pt = 2.84/4.5 = **0.631 mph**, clamp = 100/√36.5 = **16.55 SD**,
rounding = **0.166 SD**. §4 results from `lib/sql.ts` (`computeFIP:31`, `computeXERA:40`,
`computeWRCPlus:53`, `pivotTritonRows:64`) and `lib/constants-data.ts` (`SEASON_CONSTANTS:4`,
`PARK_FACTORS:28`): F4 on 200K/50BB/5HBP/20HR/180IP, scaled 2× ⇒ **3.24** both; F11 probe
`['ZZZ']?.basic || 100` ⇒ **100**; F8's pivot returns `cmd_plus` **110** on weight 100. §5 census of
`lib/metricRegistry.ts`'s **69** entries: **13** `pct` keys, **6** `plus`-mode (none with
`high < low`), **1** `inverted_value` (`totalRE`); `getCellColor(plusKey, 100)` ⇒ `text-zinc-300`,
`calcTotalsFromRegistry([])` ⇒ `null`.
Duplicate-row IP relation from `lib/sql.ts:16` (`IP_ESTIMATE_SQL`, `COUNT(DISTINCT …)`) vs
`lib/reportMetrics.ts:9` (`METRICS.ip`, `COUNT(*) FILTER`). Testing-state context:
`Cas/context/triton-context.md`.
