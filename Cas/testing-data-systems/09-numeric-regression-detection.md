---
title: Numeric Regression Detection — Choosing a Tolerance When the Bug Is Smaller Than the Noise
domain: testing-data-systems
tags:
  - float-comparison
  - tolerances
  - drift-detection
  - distribution-assertions
  - approval-testing
  - stuff-plus
  - vitest
  - ci
sources_reviewed: 21
last_updated: 2026-08-12
---

# Numeric Regression Detection — Choosing a Tolerance When the Bug Is Smaller Than the Noise

> Grades: **(verified)** Cas ran or read it at the cited line; **(documented)** vendor docs;
> **(inferred)** mechanism reasoning; **(cargo-cult)** copied, never justified. Golden *fixtures*
> live in `05-golden-file-metric-testing.md`; this doc owns the **comparison rule**.

## TL;DR

- **No tolerance solves Triton's tolerance problem.** ±0.5 Stuff+ passes the measured +0.29 to +0.59 vintage bias; ±0.1 fails every legitimate re-score. **(verified)**
- **Assert how many rows moved, not how far the mean moved.** Feb–May drift; June and August drift **0.000** to 3 dp, and share-changed has nothing to tune. **(verified)**
- **Aggregate-then-compare invents the problem; compare-then-aggregate deletes it.** `stuff_plus` is `ROUND()`ed, so per-row deltas are exact integers. **(verified / inferred)**
- **`toBeCloseTo(x, 1)` is an absolute ±0.05 window, spent on FIP.** `sql.test.ts:16` takes any FIP in [3.19, 3.29] — a tenth of a run. **(verified)**
- **`toBeCloseTo` is absolute: one digit means different things at different scale.** `expect(1000000.1).toBeCloseTo(1000000, 1)` fails where `3.29` vs `3.24` passes. **(verified)**
- **Picking a digit count instead of a decision is the repo's dominant numeric cargo-cult.** Every assertion in `__tests__/` names a precision, none a decision. **(verified / cargo-cult)**
- **An approval test pinned to a bug goes red when the bug is fixed.** `leagueStats.test.ts:37-41` asserts `computePlus(91, 90, 0) === Infinity`; `lib/leagueStats.ts:1322` now returns 100. **(verified)**
- **PG rounds `numeric` away from zero, `double precision` half-to-even; the scorer rounds before casting.** `ROUND(...)::numeric` at `app/api/update/route.ts:322-333` takes the float8 path. **(documented / inferred)**
- **`COALESCE(<z>, 0)` is silent imputation, not a null guard** — a missing baseline component scores the pitch league-average. **(verified)**
- **A two-sample p-value is not a drift detector at Triton's n.** χ² = 720.4, p < 10⁻¹⁰⁰ where PSI = 0.0020; it measured n = 1.48M, not drift. **(verified)**
- **Aggregation-shape bugs are invisible to every per-row tolerance.** Career maxEV/maxVelo averaged not maxed, OPS summed not averaged. **(verified)**
- **The suite that would carry all this is red and ungated.** `npx vitest run __tests__/lib` → 88 passed / **5 failed**; `.github/workflows/` holds only `retro-ingest.yml`. **(verified)**

---

## 1. Three regimes, and which Triton number lives in which

The wrong regime does more damage than a bad threshold inside the right one.

| Regime | Assertion | Correct when | Triton examples |
|---|---|---|---|
| **Exact** | `toBe` / `Δ = 0` | integer, quantized, or a count | `stuff_plus` (rounded), PA/K/BB/H/HR, row and pitch counts |
| **Tolerance** | `\|a−b\| ≤ τ` | continuous + a nondeterministic step | FIP/xERA/wRC+ from floats; anything crossing Savant |
| **Distribution** | moments, quantiles, share-changed, rank churn | two *populations* | stored vs re-scored; nightly vs yesterday |

**Default to exact**: a tolerance budgets irreproducibility, and every point is cover for a bug.
Only `savantValidation.test.ts:200-230` argues one — exact counting stats
(`PA, K, BB, H, HR, HBP: exact match`), tolerance on derived, `IP within ±0.1 (1-out tolerance)`
because one out is the quantum. **(verified)** The rest pick digits.

---

## 2. The float layer: what "equal" costs between Postgres and the browser

Four numeric systems before display:

```
release_speed (real/float4, ~7 digits) → SQL float8  ← ROUND() = half-to-even
  → ::numeric (arbitrary precision)                  ← ROUND() = half-away-from-zero
  → JSON over PostgREST (decimal string) → JS float64 (parseFloat, .toFixed() to display)
```

| Hazard | Mechanism | Bites Triton at |
|---|---|---|
| **float4 → float8** | `real` has ~7 digits; promotion recovers none | `release_speed`, `pfx_x`, `pfx_z` compared at 2 dp |
| **Rounding mode by type** | `numeric` away from zero, `double precision` half-to-even | `ROUND(<float8>)::numeric` casts *after* rounding → ties to even **(inferred)** |
| **`Math.round` ≠ either** | rounds half toward +∞: `Math.round(-0.5) = -0` | client-side recomputes of server values |
| **Sum not associative** | a re-planned or parallel `AVG()` moves the last bits | big `AVG()` scans; "recompute twice, `toBe`" is flaky |
| **`.toFixed()` rounds display** | differing rows render identically, and vice versa | `calcTotalsFromRegistry` returns a `toFixed()` **string**, compared as text (`lib/metricRegistry.ts:663-676`) **(verified)** |

**Compare in the system that produced the value** (SQL in SQL, JS in Vitest), and **never assert on
a `toFixed` string as a number** — an exact test with a hidden ±half-ulp-of-display tolerance.
`Number.EPSILON` (2.22e-16) is the spacing near 1.0 only; universalised, cargo-cult. Scale-aware is
`|a−b| ≤ max(atol, rtol·|b|)`, numpy's `isclose` (`atol=1e-8, rtol=1e-5`). **(documented)**

---

## 3. What Vitest's tolerance actually means, measured

`toBeCloseTo(expected, digits)` passes when `|received − expected| < 10^(−digits) / 2` — **absolute**.
Edges run locally (Vitest 4.1.3):

| Call | Band | Repo usage |
|---|---|---|
| `toBeCloseTo(x, 1)` | ±0.05 | `sql.test.ts:16, 32, 69, 98` — FIP, xERA |
| `toBeCloseTo(x, 2)` | ±0.005 | `sql.test.ts:43` |
| `toBeCloseTo(x, 3)` | ±0.0005 | `leagueStats.test.ts:52-60` — `normalCDF` |
| `toBeCloseTo(x, 10)` | ±5e-11 | `leagueStats.test.ts:130, 150` — weights sum |
| *default* | ±0.005 | — |

`3.29` vs `3.24` at digits=1 **passes** (diff 0.04999999999999982 < 0.05); `3.2901` fails — float
representation decides the boundary, not the decimal written. And
`expect(1000000.1).toBeCloseTo(1000000, 1)` **fails**: the digit allowing 0.05 on FIP forbids 0.1 on
a six-figure count. **(verified)**

**Fix FIP first.** `sql.test.ts:16` asserts `toBeCloseTo(3.24, 1)` while its own comment derives
3.2389 to 4 dp. Assert that exactly; the tolerance buys nothing and hides a wrong `cFIP`.
**(verified)**

**Picking τ**, in preference order: **zero** (prove determinism — most Triton metrics qualify);
**the stat's quantum** (one out for IP = ±0.1, one rounding unit for `stuff_plus` = ±1); **the
smallest difference a user acts on**, from the surface not the formula (ERA at 2 dp → τ = 0.005);
or, only if genuinely nondeterministic, **2× the measured max spread** over 20 runs, recorded beside
the constant.

---

## 4. The hard case: when the bug is smaller than the noise

### 4.1 The measurement

`docs/Queries.md` (2026-08-11) compares stored `stuff_plus` against a re-score on current
`pitch_baselines`, same rows both sides:

| Date | n | stored | current-vintage | drift |
|---|---|---|---|---|
| 2026-04-15 | 4,330 | 100.50 | 99.91 | **+0.594** |
| 2026-05-15 | 4,337 | 101.18 | 100.89 | **+0.291** |
| 2026-06-15 | 2,788 | 100.87 | 100.87 | **0.000** |
| 2026-08-05 | 4,372 | 100.03 | 100.03 | **0.000** |

June and August are exactly zero because the 2026-08-11 repair re-scored ≈249k rows against current
baselines; February–May kept their nightly vintages. **(verified)** Now set a CI tolerance on
`mean(stored) − mean(recomputed)`:

| Threshold | Apr (+0.594) | May (+0.291) | Jun/Aug (0.000) | Verdict |
|---|---|---|---|---|
| `≤ 0.5` | FAIL | **PASS** | PASS | Green-lights a known upward bias |
| `≤ 0.1` | FAIL | FAIL | PASS | Right *today*, permanently red after any legitimate re-score |
| `≤ 0.01` | FAIL | FAIL | PASS | Same, louder |

No third option exists: **the thresholded quantity has two causes and the threshold cannot see
which**. At full-season n the *sampling* interval on Stuff+ is ±0.30 while the vintage **bias** is
≈0.5 (`Li/statistical-inference/04-uncertainty-quantification.md`) — bias exceeding noise, so a τ
tuned to sampling error is the wrong instrument, not merely imprecise. **(verified)**

### 4.2 The rule that dissolves it

> **Diff at the grain the value is computed at, then aggregate the diffs. Never diff the aggregates.**

`stuff_plus` is `ROUND()`ed with no scale, so a per-row delta is an integer and `Δ ≠ 0` decidable
with no tolerance. The +0.594 is a *mean over integers*, an artifact of averaging first: at row
grain the populations are **100% changed** and **0% changed**, not "close" and "less close".
**(verified / inferred)**

| Assertion | Apr 15 | Jun 15 | Tunable? |
|---|---|---|---|
| `\|mean Δ\| ≤ 0.5` | pass ✗ | pass ✓ | yes — and that is the defect |
| `\|mean Δ\| ≤ 0.1` | fail ✓ | pass ✓ | yes |
| **`share(Δ ≠ 0) = 0`** | **fail ✓** | **pass ✓** | **none** |
| `max \|Δ\| ≤ 0` | fail ✓ | pass ✓ | none |

### 4.3 The four escapes, generalised

| Escape | Mechanism | Applies to | Residual |
|---|---|---|---|
| **Pin the nuisance input** | both sides against one frozen baseline snapshot | Stuff+, Cmd+, wRC+, `league_averages` | τ → float epsilon |
| **Pair the rows** | join on identity, diff per row, aggregate | any stored-vs-recomputed check | none — what the probe did |
| **Assert provenance** | the *input version*, not the output | vintage and constants changes | needs `baseline_version` (Li's `metric-governance/02`) |
| **Split by cause** | share-changed, max-move, signed-mean separately | mixed-vintage columns | more code, no guesswork |

**Only when all four fail** is a scalar tolerance right, and then τ comes from §3's ladder.

### 4.4 The imputation a tolerance can never catch

`COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0)` (`app/api/update/route.ts:324`)
substitutes **z = 0**, the league mean, when the baseline is missing or σ is zero. The output is a
plausible 100 — no error, outlier, or NaN — so every tolerance passes it: it is by construction the
least surprising value in the distribution. The detector is **coverage** — count rows with an
imputed component, fail on any increase. Same shape as `AVG()` skipping NULLs. **(verified)**

---

## 5. Detecting drift in aggregate outputs

Three signatures, three assertions:

| Signature | Example | Detector |
|---|---|---|
| **Level shift** | a constant changed — wRC+ moved 5–6 points on 2026-05-08 | signed mean Δ, paired |
| **Shape change, stable level** | a pitch type's σ collapses; mean holds, tails explode | quantile vector, SD ratio |
| **Aggregation-function bug** | career maxEV/maxVelo averaged not maxed; OPS summed not averaged | invariant, not tolerance: `total ≥ max(rows)`; `0 ≤ OPS ≤ 5` |

Per-row tolerances cannot touch the third class — every input row was correct. Guard it with
invariants over `TotalsStrategy` in `lib/metricRegistry.ts`: a `max` total must equal one input, an
`avg` total lie in `[min, max]`. One table-driven test over all 69 entries catches both;
`06-property-based-testing.md` owns the general form.

**`PARK_FACTORS` is the standing landmine**: one frozen 2024 vintage applied to 2015–2026, keyed by
team, so editing it silently restates every historical wRC+. The guard is not numeric — a golden set
of season × park values, moved only by a reviewer (`05-golden-file-metric-testing.md`).

---

## 6. Distribution-level assertions in CI

### 6.1 Do not use a hypothesis test as a drift alarm

On 2026-08-12 a two-sample χ² over 2025-vs-2026 pitch-mix buckets returned **720.4 on 5 df,
p < 10⁻¹⁰⁰** while PSI over identical buckets was **0.0020**. At n₁ = 826,259 and n₂ = 657,570 the
p-value measures sample size. **A `p < 0.05` gate over a full-season table fires every run.**
**(verified)**

Use **effect sizes** with published bands: PSI (<0.10 stable, 0.10–0.25 moderate, >0.25
significant), KS *D* (not its p-value), or Wasserstein distance in the metric's own units — the last
most interpretable ("moved 0.4 Stuff+ points"). **(documented)**

### 6.2 The assertion set worth running

| # | Assertion | Catches | Gate |
|---|---|---|---|
| 1 | `share(Δ ≠ 0)` vs last run | unintended re-scoring | exact 0 outside a declared window |
| 2 | `max \|Δ\|` | tail bugs, clamp firing | ≤ 1 rounding unit |
| 3 | signed `mean Δ` | level shift from a constant | ≤ display precision |
| 4 | `sd_new / sd_old` | σ collapse in a baseline cell | 0.95–1.05 |
| 5 | quantiles p1/p10/p50/p90/p99 | shape change at stable mean | each ≤ 1 unit |
| 6 | Spearman ρ + rank moves > 10 | leaderboard reshuffle | ρ ≥ 0.999 |
| 7 | non-null share per (season, metric) | the manufactured trend | ±0.5 pp |
| 8 | clamped rows (`= 0` or `= 200`) | degenerate baseline | exact 0 |
| 9 | imputed components (§4.4) | silent `COALESCE` fill | exact 0, or declared |
| 10 | row count per group | fixture drift | exact |

Rank correlation (6) matters most on a plus-stat: +0.5 across the board and a reshuffled top 20
share a mean delta. **Assert on the ordering — it is what the UI sells.** **(inferred)**

### 6.3 Where these can actually run

Not against production: on 2026-08-12 concurrent analytical scans drove the Supabase origin to
Cloudflare **522** at 20:19 UTC with no recovery that session, and ~20 concurrent readers took it
down for an hour. **(verified)**

| Tier | Runs on | Data | Assertions |
|---|---|---|---|
| **Unit (CI, per PR)** | Vitest, node env | inline fixtures | §5 invariants, §3 exact comparisons, registry totals |
| **Golden (CI, per PR)** | Vitest | committed slice (`08-test-data-management.md`) | 1–6 on a few thousand rows |
| **Drift (scheduled, off-peak)** | serial, day-chunked `tsx` script | read replica or nightly export | 1–10 at full scale |

Chunk tier 3 by `game_date`: the 8s statement ceiling is what drove `stuff_plus` coverage to zero
(`app/api/update/route.ts:300-334`). Emit a committed report, not a gate, until the bands have a
season of history. `10-ci-cd-for-data-apps.md` owns the workflow.

---

## 7. Approval testing, and how it turns into a lie

Approval (characterization) testing records what the code *currently does* and fails on any change —
the cheapest net over a formula nobody wants to re-derive, recording **behavior, not correctness**:

```ts
// __tests__/lib/leagueStats.test.ts:37-41
it('returns Infinity when stddev is zero (division by zero)', () => {
  // This documents the current behavior — no guard against zero stddev
  expect(computePlus(91, 90, 0)).toBe(Infinity)
})
```

`lib/leagueStats.ts:1322` now reads `if (!(leagueStddev > 0) || !Number.isFinite(leagueStddev)) return 100`:
the bug was fixed and the test pinning it went red. **A correct fix reads as a regression**, joined
by the four `queryCache.test.ts` mock failures. **(verified)**

| Rule | Why |
|---|---|
| Label intent in the name | `documents current (unfixed) behavior:` vs `asserts correct behavior:` |
| Never bless in bulk | `-u` over a suite turns a wrong number into the expected one |
| Keep the diff readable | a 4,000-row approval file is unreviewable; approve §6.2's ten numbers |
| Re-verify against broken code | a test that has never failed proves nothing |
| Delete on fix | a fixed bug means the test is rewritten, not updated |

`toMatchInlineSnapshot` suits small numeric approvals: the expected value sits at the assertion site,
so the diff surfaces in review. **(documented)**

---

## 8. What Triton should do, in order

1. **Rewrite `leagueStats.test.ts:37-41`** to assert the guard (`toBe(100)`) and fix the
   `.maybeSingle()` mock in `queryCache.test.ts`. Red tests mask every new numeric failure.
2. **Add `.github/workflows/test.yml`** running `npx vitest run --exclude '__tests__/integration/**'`
   per PR.
3. **Tighten the deterministic tolerances.** `sql.test.ts:16/32/69/98` derive exact values in their
   own comments; assert those (4 dp), not `digits=1`. Give every remaining tolerance a comment naming
   the *decision* it encodes.
4. **Ship the paired-diff harness as a script**, not a gate: `scripts/diff-metric.ts <metric> <date>`,
   day-chunked, reporting §6.2's rows 1–6.
5. **Assert `share(Δ ≠ 0) = 0`, not a mean tolerance**, wherever a stored metric is checked against a
   recompute.
6. **Add the imputation counter** (§4.4): a column or logged count of rows where a Stuff+ component
   was `COALESCE`d to zero. Gate at exact 0.
7. **Add the registry-invariant test** — one table-driven case over all 69 `METRIC_REGISTRY` entries
   asserting a `max` total equals one input and an `avg` total lies in their range.
8. **Only then discuss drift bands.** Run item 4 nightly for a month; set gates from each statistic's
   empirical distribution, not taste.

**Anti-recommendation — do not add a CI job that recomputes Stuff+ against production and asserts
the mean delta is within a tolerance.** The obvious response to §4 fails three ways. **(i) It cannot
work.** §4.1 is a measurement, not a hypothesis: ±0.5 passes a known +0.59 bias, ±0.1 goes
permanently red at the next legitimate re-score. No τ separates the causes, so the job is a no-op or
permanent noise — how the five current failures got ignored. **(ii) It needs the access pattern that
already took the platform down** — CI reading production analytics per PR, when ~20 concurrent
readers caused an hour of downtime and two parallel full-column scans produced unrecovered Cloudflare
522s on 2026-08-12. **(iii) It guards the wrong kind of fact.** Vintage drift is a *provenance*
property whose correct assertion is "`baseline_version` is unchanged" — a column that does not exist
yet, and a numeric proxy is a decoy while the real fix is deferred. Build the exact,
fixture-based `share(Δ ≠ 0)` assertion, and let Li's `baseline_version` carry the vintage.

**Highest-leverage next action:** items 1 and 2 as a single PR — `npm test` green, gated by Actions
on every PR. Until that exists, every tolerance in this document is decoration.

---

## Sources

1. [Vitest — `expect` API](https://vitest.dev/api/expect) — §3.
2. [Vitest — Snapshot guide](https://vitest.dev/guide/snapshot) — §7.
3. [Goldberg — *What Every Computer Scientist Should Know About Floating-Point Arithmetic*](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) — §2.
4. [Dawson — *Comparing Floating Point Numbers, 2012 Edition*](https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/) — absolute/relative/ULP, §3.
5. [IEEE 754](https://en.wikipedia.org/wiki/IEEE_754) — §2.
6. [Kahan summation](https://en.wikipedia.org/wiki/Kahan_summation_algorithm) — §2.
7. [MDN — `Number.EPSILON`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON) — §2.
8. [PostgreSQL — Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html) — §2.
9. [PostgreSQL — Mathematical Functions](https://www.postgresql.org/docs/current/functions-math.html) — §2.
10. [NumPy — `isclose`](https://numpy.org/doc/stable/reference/generated/numpy.isclose.html) — §2.
11. [NumPy — `testing.assert_allclose`](https://numpy.org/doc/stable/reference/generated/numpy.testing.assert_allclose.html) — array-level tolerance.
12. [pandas — `testing.assert_frame_equal`](https://pandas.pydata.org/docs/reference/api/pandas.testing.assert_frame_equal.html) — §4.3.
13. [dbt — Data tests](https://docs.getdbt.com/docs/build/data-tests) — §6.3.
14. [Great Expectations — Core concepts](https://docs.greatexpectations.io/docs/core/introduction/) — §6.2.
15. [Evidently AI — Docs](https://docs.evidentlyai.com/) — §6.1.
16. [Kolmogorov–Smirnov test](https://en.wikipedia.org/wiki/Kolmogorov%E2%80%93Smirnov_test) — §6.1.
17. [SciPy — `ks_2samp`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ks_2samp.html) — large-n caveats.
18. [Wasserstein metric](https://en.wikipedia.org/wiki/Wasserstein_metric) — §6.1.
19. Sullivan & Feinn (2012), [*Using Effect Size — or Why the P Value Is Not Enough*](https://doi.org/10.4300/JGME-D-12-00156.1) — §6.1.
20. [ApprovalTests](https://approvaltests.com/) and [Characterization test](https://en.wikipedia.org/wiki/Characterization_test) — §7's framing.
21. [Hyrum's Law](https://www.hyrumslaw.com/) — §3.

**Triton-internal evidence** — all **(verified)**, from repo reads and local runs on **2026-08-12**;
**no production database was queried**. Production numbers are quoted, not re-measured, from
`docs/Queries.md` (2026-08-11 and -12): §4.1's drift table, ≈249k rows re-scored 2026-08-11, §6.1's
χ²/PSI at n₁/n₂, §6.3's Cloudflare 522. Vitest 4.1.3, band edges per §3. Suite:
`npx vitest run __tests__/lib` → 93 tests, **88 passed / 5 failed** in 2 files —
`leagueStats.test.ts:37-41` plus four `.maybeSingle()` mock failures in
`queryCache.test.ts:31,37,70,78` against `lib/queryCache.ts:22`; `savantValidation.test.ts` **not**
run, it reads production. CI: `retro-ingest.yml` never invokes `vitest`. Tolerances:
`sql.test.ts:16, 32, 69, 98` (`digits=1`), `:43` (2); `leagueStats.test.ts:52-60` (3), `:130, 150`
(10); `savantValidation.test.ts:121-131` (`compare()`, pre-rounding to 1e-10 past IEEE edges),
`:203` (IP ±0.1), `:213` (BA/OBP/SLG ±0.005), `:220, 227` (±0.5 pp), `:143` (pitch count ≤0.5%).
Scorer: `app/api/update/route.ts:322-333` — `GREATEST(0, LEAST(200, ROUND(...)::numeric))`,
`COALESCE(<z>, 0)` on all three components at `:324-326`, 8s day-chunk rationale at `:300-306`.
Registry, 69 entries: `lib/metricRegistry.ts:288-294` (`maxEV`, `'max'`), `:479-485` (`maxVelo`),
`:184-190` (`ops`, `'avg'`), `:643-676` (`calcTotalsFromRegistry` → `toFixed()` **strings**). wRC+
5–6 points on 2026-05-08 and the frozen 2024 `PARK_FACTORS` for 2015–2026 come from
`Li/metric-governance/02-metric-versioning-reproducibility.md`; the ±0.30 sampling interval from
`Li/statistical-inference/04-uncertainty-quantification.md`.
