---
title: Metric Governance on Triton — Applied Playbook
domain: applied
tags: [metric-governance, baselines, stuff-plus, versioning, glossary, park-factors, cross-level, triton-platform]
last_updated: 2026-08-22
---

# Metric Governance on Triton — Applied Playbook

> Turns `Li/metric-governance/01..11` into sequenced work. **The organizing idea is that a metric
> cannot be versioned before it is named**, so items are ordered by what they unblock, not by how
> wrong they are. Li's other three playbooks assume the definitions settled here.

## TL;DR

- **Naming comes first even though versioning is the headline** — a vintage scheme built before `league_averages`, the σ namespace and the Stuff+ source are named versions the wrong thing. (established)
- **`league_averages` should be renamed in the docs, not reimplemented as a median.** All three moves are defensible and only one can ship; the table is DELETE + re-INSERT, so `percentile_cont(0.5)` would restate every heatmap midpoint with no before-state to diff against. (computed)
- **The 50% threshold picking between DB and client Stuff+ reads the *filtered* row set**, so which of two different metrics renders under the label "Stuff+" can flip when a user narrows a date range. (computed)
- **The `[0,200]` clamp cannot fire where it matters, because `COALESCE(…,0)` already neutralized the term** — a σ = 0 baseline cell scores league-average velocity instead of being excluded, and `pitch_count` is written and never read. (computed)
- **The same-commit glossary rule has been honoured once in four opportunities since it landed on 2026-04-25.** A control at 25% compliance is not a control; the checklist has to be a test. (computed)
- **The 46-day frozen denominator should be annotated, not recomputed** — nothing was stored, no prior denominator survives to restate against, and the numbers self-correct the moment Jo's fix lands. (established)
- **The `stuff_plus` vintage seam should be restated, because it *was* stored** — IAS 8's policy/estimate split gives opposite answers to the two restatement questions, and that opposition is the value of the frame. (established)
- **MiLB `league_averages` FIP/xFIP/SIERA carry MLB constants, and 2025–2026 fall through to a placeholder** — a plus-stat built on that is not defined at that level and should not be produced. (computed)

---

## NOW (0–6 weeks)

Everything here sits downstream of one thing that is not mine: **the refresh chain has been dead
since 2026-06-26**, and the fix is three `ALTER FUNCTION` statements —
`Jo/applied/postgres-performance-applied.md` item 1. Do not duplicate or work around it, and judge no
denominator until it lands. Items 1–5 ship independently; item 6 depends on it.

### 1. Park adjustment — delete the bug, scope-restrict the vintage (M5, M4)

`app/api/park-adjusted/route.ts:50` computes `row.xwoba * (100 / pf.basic)`. `pf.basic` is an
**overall runs** factor; `xwoba` is a weighted on-base **rate**. Runs scale superlinearly with
on-base, so a .340 xwOBA at a ~112 park lands at ~.304 — a 10.7% move, in the wrong direction, on a
statistic already largely park-neutral. `computeWRCPlus()` in `lib/sql.ts` divides the *run-value
deviation* by the factor, which is correct, so both implementations ship side by side. **(computed)**

Do not fix the arithmetic — **remove the field**. No runs-to-rate conversion makes it defensible.
Keep `adj_hr_pct` / `adj_k_pct` / `adj_bb_pct` (`app/api/park-adjusted/route.ts:51-53`): a component
factor on a component rate is at least dimensionally coherent.

**M4 is the other kind of problem and gets the other treatment.** `lib/constants-data.ts:28` types
`PARK_FACTORS` as `Record<string, {...}>` — keyed by team only — carrying one 2024-vintage 5-year
block applied to 2015–2026, while `SEASON_CONSTANTS` in the same file at `lib/constants-data.ts:4`
**is** keyed by season. That vintage assigns the wrong physical ballpark to four teams (`ATL` ≤2016,
`TEX` ≤2019, `ATH` 2025+, `TB` 2025). There is no correct edit here: the missing thing is twelve
seasons of regressed factors nobody has, and a single-season factor is roughly half noise
(`Li/metric-governance/06-park-league-era-adjustments.md`), so any replacement stays multi-year and
regressed — season-keyed *blocks*. Treat re-keying as acquisition and restrict scope now: apply
factors only inside the vintage's validity window, return `null` rather than the `|| 100` silent
neutral-park default, and stop `/api/populate-park-factors` writing 341 rows that look
season-specific and carry no season information. **(computed)**

**Stop condition:** `grep -rn adj_xwoba app components lib` returns zero hits; every out-of-window park lookup returns `null` and no consumer silently substitutes 100.

### 2. Settle M1 and name the σ grain (M1, M6)

`scripts/create-refresh-league-averages.sql:200-212` computes `AVG(...)` with `STDDEV_SAMP` and
contains zero occurrences of `percentile_cont`; the column comment reads *"Mean of the metric across
qualified players."* `docs/VARIABLES.md:302` and `docs/VARIABLES.md:442` still say 50th-percentile.
`CLAUDE.md:153` was corrected; the canonical glossary was not, which is M9 in miniature. **(computed)**

Three moves are defensible; **ship the rename.** Reimplementing as a median is the attractive one and
it is wrong here for a reason specific to this table: the refresh is DELETE + re-INSERT
(`scripts/create-league-averages.sql:1-3`), so no retained prior value exists to diff a switch
against, and every heatmap midpoint and percentile rank would move by an unmeasurable amount on a
deploy nobody could audit. A genuine median belongs beside `value` as an additive `p50_value` column
once item 7's versioning discipline exists — never as a silent replacement.

Same commit: correct `docs/VARIABLES.md:309-310` to `MLB | MiLB` and `hitter | SP | RP`, and delete
the superseded SP/RP rule at `scripts/create-league-averages.sql:9`, which the function does not
implement — `scripts/create-refresh-league-averages.sql:318` uses `COUNT(*) FILTER (WHERE pc >= 50)
>= 3`.

The same table carries M6. `league_averages.stddev` is the SD of **player-season means**;
`pitch_baselines.std_velo` is a **pitch-level** SD, several times larger. Nothing in schema, glossary
or column name distinguishes them, so an identical-looking z-score lands on two different scales —
`lib/serverRenderCard.ts:927` consumes the first as a colour spread, the scorer at
`app/api/update/route.ts:324-326` the second as a divisor. Add `stddev_player_season` additively in
the same refresh, keep `stddev` for one release, then drop; the cheap detector is that
`league_averages.stddev` must always be the smaller of the two. **(computed)**

**Stop condition:** no "50th-percentile" text survives in §7 or §9, the `level`/`role` rows match the DDL `CHECK` constraints character for character, and every σ column names its grain.

### 3. Put a `pitch_count` floor on the Stuff+ scoring join (M3)

`app/api/update/route.ts:251` writes `pitch_count` into `pitch_baselines`; nothing reads it. The
scoring UPDATE at `app/api/update/route.ts:322-326` joins baselines with no minimum-n floor and wraps
each z-term in `COALESCE((…) / NULLIF(b.std_velo, 0), 0)`. **(computed)**

M3's framing needs sharpening. Binding the `[0,200]` clamp takes ≈16 composite SD (composite σ ≈ 6.04
— `Li/metric-governance/05-baseline-normalization-design.md`), so it can only fire on a collapsed-σ
cell. But where σ collapses all the way to zero or NULL — three `pitch_baselines` rows do, in 2016,
2021 and 2026 — `NULLIF` → `COALESCE` zeroes the term first and the pitch scores **league-average
velocity** instead of being clamped or excluded. The clamp is unreachable in precisely the case it
was imagined to guard, and the silent substitution is the worse outcome. `pitch_count` is the real
discriminator: add `AND b.pitch_count >= 500` so a thin cell yields NULL, not a confident 100.

**Stop condition:** no row carries a `stuff_plus` scored against a cell with `pitch_count < 500`; the three zero-σ cells produce NULL.

### 4. Make the Stuff+ source explicit instead of thresholded (M2 / Slice D)

`lib/pitcherStats.ts:292` reads `dbStuffPlusVals.length > pitches.length * 0.5 ? dbStuffPlusVals :
clientStuffVals` and labels both outputs "Stuff+". The two quantities are genuinely different: the DB
path z-scores against live `pitch_baselines`, the client path against a frozen in-source snapshot
with **nearest-year fallback** (`lib/leagueStats.ts:1159`) defaulting to `BL_BY_YEAR[2026]` for
unknown years (`lib/leagueStats.ts:1154`), and it imputes `p.release_extension ?? bl.avg_ext`
(`lib/leagueStats.ts:1182`) *before* the z-score where the DB zeroes the term after. **(computed)**

The consequence not in the findings doc: `pitches` there is the **filtered** array, so the threshold
is evaluated against whatever the user's filter returned — the rendered metric can change identity
when a date range is narrowed, with no visual change, and 2015–2018 coverage of ~44% sits on the
boundary. Fix: return `{ value, source: 'db' | 'client', n }` and never mix sources inside one
aggregate. The badge is Cas's (`Cas/analytics-ux/`); the contract change is here.

**Stop condition:** no call site can obtain a Stuff+ number without its source, and a 44%-coverage fixture returns the same `source` under two different filters.

### 5. Write the metric-change checklist as a test, not a convention (M9)

`CLAUDE.md:198` and `docs/VARIABLES.md:19-37` require the glossary be updated in the same commit as
any change to `lib/reportMetrics.ts`, `lib/sql.ts`, `lib/sceneTypes.ts`, or a new stats param.
**Check the record before recommending it as a control.** The rule landed in `331c9ce` on 2026-04-25;
four commits have touched a trigger file since and only `23e7f1f` updated the glossary. `388400b`,
`358b6b3` and `1967d5a` ("Fix metric calculation integrity across 29 files", which rewrote
`lib/reportMetrics.ts` **and** `lib/pitcherStats.ts`) did not — **one in four**. The trigger list is
also incomplete: `lib/pitcherStats.ts` and `lib/leaderboardColumns.ts` carry definitions and appear
zero times in the glossary, so the two surfaces likeliest to drift are exempt by construction. **(computed)**

The checklist, seven gates, each mechanically checkable:

| Gate | Question | Enforced by |
|---|---|---|
| 1 | Key in exactly one namespace, with grain and unit stated? | `glossaryKey` on `MetricDef` (`lib/metricRegistry.ts:23`) |
| 2 | **Policy** change (formula, weights, population) or **estimate** change (baseline refresh)? | PR template — sets gates 3 and 5 |
| 3 | Policy only: `definition_version` bumped, restate-vs-annotate declared? | CI fails a formula diff with no bump |
| 4 | Aggregation **weight** named, not just the strategy? | `TotalsStrategy` names no weight — item 9 |
| 5 | Changes what a stored value was scored against? | if yes it needs a vintage row — item 7 |
| 6 | `docs/VARIABLES.md` row added or updated? | Vitest over the trigger-file set |

The test that makes this real: assert every `METRIC_REGISTRY` key's `glossaryKey` resolves to a row
in `docs/VARIABLES.md`, and that a commit touching a trigger file also touches the glossary. Test
mechanics are Cas's — `Cas/testing-data-systems/`.

**Stop condition:** the suite fails on a branch adding a metric key without a glossary row, and `grep -c stuff_plus docs/VARIABLES.md` is no longer 0.

### 6. Close the restatement question in writing, and close it two different ways

Two populations of wrong numbers exist and they get **opposite** answers. The frame is IAS 8 via
`Li/metric-governance/11-metric-deprecation-migration.md`: policy changes apply retrospectively,
estimate changes prospectively.

**The 46-day frozen denominator → annotate, do not recompute.** `league_averages` last refreshed
2026-06-26 and `league_percentiles` 69 days ago (`planning.md:301`), so every plus-stat, heatmap
midpoint and percentile rank rendered since divided by a stale denominator. Three grounds for leaving
it: nothing was **stored**, so no artifact on disk is wrong; the table is DELETE + re-INSERT, so the
June-26 denominator no longer exists and the delta is not computable even in principle; and the
numbers self-correct the moment Jo's item 1 lands. What is owed is a dated known-affected window in
`docs/VARIABLES.md` §7 and `planning.md`, plus a freshness assertion (Jo's item 2). **(established)**

**The `stuff_plus` vintage seam → restate at season close.** That column *is* stored, ~249k Apr–Aug
2026 rows were rescored on 2026-08-11 against a different baseline than Feb–May rows, and no predicate
separates them (`Li/metric-governance/10-audit-trails-provenance.md`). A changepoint detector on 2026
Stuff+ will find June 1 and be wrong — a policy-grade inconsistency in a retained artifact, so it is
restatable and should be restated: at season close, rescore 2026 against one final vintage, which
becomes auditable once item 7's ledger exists (~250k row rewrites — coordinate with
`Jo/applied/postgres-performance-applied.md`). **(established)**

**Stop condition:** both decisions written down with dates and grounds, and neither re-litigated later without new evidence.

---

## NEXT (6 weeks – 6 months)

### 7. Build the baseline vintage ledger (M2 proper)

`pitch_baselines` holds 206 rows keyed `(pitch_name, game_year)`, has **no timestamp column**, and is
destructively upserted at `app/api/update/route.ts:251-276` — last night's baseline ceases to exist at
09:10 UTC, so a past Stuff+ cannot be recomputed. This is the reproducibility blocker, and it sits
here rather than first because without items 2–4 it versions a quantity whose name and source are
ambiguous. **(computed)**

What identifies a vintage, where it is stored, how a stored value points at it:

- **Identity.** A vintage is a *set*, not a row: the whole `(pitch_name, game_year)` block one night's
  scoring ran against. `vintage_id bigserial`, `computed_at`, `game_year`, `level`, and a `row_digest`
  hashing the sorted `avg_*`/`std_*`/`pitch_count` tuples so an unchanged night dedupes.
- **Storage.** `baseline_vintages` (one row per computation) plus `pitch_baselines_history`
  (append-only, keyed `(vintage_id, pitch_name, game_year)`). `pitch_baselines` stays as-is and
  remains the scoring join's target, so the 8 s-capped hot path is untouched.
- **The pointer.** Do **not** add a `baseline_version` column to `pitches` — 8.88M rows × 29 indexes,
  and the day is already the natural grain because the scorer runs one UPDATE per `game_date`
  (`app/api/update/route.ts:306`). Add `stuff_plus_runs(game_date, level, vintage_id, scored_at,
  rows_updated, code_sha)`: ~180 rows a season, lossless. A rescore appends a second row for the same
  date; *latest `scored_at` wins*, and the earlier row is the history.

**Stop condition:** for any date in 2026, re-running the scoring expression against the vintage named by `stuff_plus_runs` reproduces the stored `stuff_plus` exactly for three sampled pitches, one from either side of the 2026-08-11 seam.

### 8. Stop producing MiLB metrics that carry MLB constants (Slice G)

`scripts/create-refresh-league-averages.sql:66` iterates `('MLB','pitches'),('MiLB','milb_pitches')`
and the ERA-estimators block at `scripts/create-refresh-league-averages.sql:604` runs for **both**
levels — while `v_cfip`, `v_lg_era`, `v_lg_woba`, `v_woba_scale` and `v_lg_hr_fb` are hardcoded MLB
values with `WHEN` cases for 2015–2024 only (`scripts/create-refresh-league-averages.sql:52-62`),
consumed at `:737`. MiLB FIP/xFIP/SIERA are therefore normalized to an MLB run environment, and for
2025–2026 to an `ELSE` placeholder that is no league's run environment. **(computed)**

Policy: **no `league_averages` row for a (level, metric) pair whose formula carries a constant derived
from another level.** Drop MiLB from the ERA-estimators block until MiLB constants exist — cheaper
than it sounds, since the block already notes xERA drops out for MiLB.

Stuff+ is the opposite case and needs no translation factor at all: it is a function of the pitch, not
of the opposition, so the MLB↔AAA gap is a pure re-baselining artifact and the fix is one join, not an
MLE (`Li/metric-governance/08-cross-level-comparability.md`). Either separate the axes, or add an
explicit `stuff_plus_mlb_rebased` scored against `pitch_baselines` and label it. A
`milb_pitch_baselines`-scored value never shares an axis with a `pitch_baselines`-scored one.

Separately, `EVENT_NORMALIZE_MAP` (`app/api/update/milb/route.ts:74-98`) shipped 2026-06-08 with no
backfill and is a **category collapse**, not a casing fix. Jo owns the repair
(`Jo/applied/data-quality-applied.md`); I own the consequence — **a MiLB rate computed across that
seam mixes two definitions and should not be published**.

**Stop condition:** `level='MiLB'` rows exist for no member of `ERA_METRIC_KEYS`, and no surface renders MiLB and MLB Stuff+ on a shared axis.

---

## LATER (6+ months)

### 9. Collapse seven definition surfaces to one key namespace (M9 / Slice E)

Only **9 of 69** `METRIC_REGISTRY` keys have a counterpart in `reportMetrics.METRICS` — the registry
is camelCase (`whiffPct`), the computation map snake_case (`whiff_pct`) — so 87% of the registry has
no programmatic link to how its number is produced
(`Li/metric-governance/03-semantic-layers-metric-stores.md`). `getTip()` at `lib/glossary.ts:129`
probes `glossaryCache` → `METRIC_TIPS` → `METRIC_REGISTRY[key].tip` → label lookup in one flat chain,
so which definition renders depends on the string the call site passes. **(computed)**

Add a `glossaryKey` field to `MetricDef` (`lib/metricRegistry.ts:23`) — the single edit that makes the
item 5 test possible — then fold the ~20 metrics `METRIC_TIPS` uniquely defines into the registry and
delete the duplicates. Two definitional repairs belong in the same pass. **Three IP definitions**
disagree on double plays, triple plays and caught stealing, the qualification floor uses the third,
and `calcTotalsFromRegistry`'s `case 'ip'` (`lib/metricRegistry.ts:676-683`) parses thirds notation
while `METRICS.ip` emits decimal, so `"12.7"` returns 14.1 IP. And the **4.5 / 3.5 / 2.0 Stuff+
weights** live in two places (`app/api/update/route.ts:324-326`, `lib/leagueStats.ts:1195`) with no
version and no test pinning them together.

**Stop condition:** one canonical IP definition with the others deleted or renamed to say what they are, and the weights in one exported constant referenced by both paths.

---

## Standing Rules

1. **Every σ, rate and plus-stat states its grain in its name.** `stddev_player_season`, not `stddev`.
   `whiff_pct` stored 0–100 against a heatmap consumer expecting 0–1
   (`app/api/league-baseline/route.ts:22-38`) is M6's defect class, already shipping.
2. **Grade the change before choosing the remedy.** Policy → retrospective; estimate → prospective.
   Item 6's two answers differ only because the changes differ in kind.
3. **Do not build a semantic layer.** The attractive wrong move once items 5 and 9 expose how
   scattered the definitions are. Triton has no dbt, no warehouse, no BI tool, one engineer and one
   consuming app; a semantic layer prevents *inconsistency*, not *error*, and uniform error is worse
   than divergence because divergence is a detection signal
   (`Li/metric-governance/03-semantic-layers-metric-stores.md`). `glossaryKey` buys most of it for
   one line.
4. **Boundary.** Pipeline health, timeouts and backfills are Jo's (`Jo/applied/`); badges, tests and
   display are Cas's (`Cas/analytics-ux/`, `Cas/testing-data-systems/`); metric *architecture* is
   Soto's (`Soto/algorithm-design/`). Hand off by filename.

**Where I differ from Part 2's "Suggested order."** I agree with its #1 (the `ALTER FUNCTION` fix) and
#2 (a working error sink) unconditionally: nothing here is worth judging against a frozen denominator,
and nothing escalates without a sink. Two differences. The list contains **no Li item at all**, which
reads as "correctness is not urgent" — item 1 above is a one-line delete of a number wrong on screen
today and belongs beside their #5. And I would run items 2 and 5 *before* their #6–#8 (index drops,
upsert tuning, `auto_explain`), which change what no number means, while every day the glossary says
"50th-percentile" is another day someone writes a query from it. The list predates the audit slices
and this corpus; inside Jo's own domain its ordering still looks right.

**Triton-internal evidence.** Compliance figures from `git log` over `lib/reportMetrics.ts`,
`lib/sql.ts` and `lib/sceneTypes.ts` on 2026-08-22: rule added in `331c9ce` (2026-04-25); of the four
later trigger-file commits only `23e7f1f` also touched `docs/VARIABLES.md`, while `388400b`,
`358b6b3` and `1967d5a` did not; `grep -c stuff_plus docs/VARIABLES.md` = 0. Median claims at
`docs/VARIABLES.md:302` and `:442`, casing at `:309-310`, `CLAUDE.md:153` already corrected.
`AVG`/`STDDEV_SAMP` at `scripts/create-refresh-league-averages.sql:200-212`; MLB constants `:52-62`
consumed at `:737`; both-levels loop `:66`; ERA block `:604`; SP/RP rule `:318` against the superseded
comment at `scripts/create-league-averages.sql:9`. Scoring UPDATE at `app/api/update/route.ts:322-326`,
`pitch_count` `:251-276`, per-date loop `:306`. Client path at `lib/leagueStats.ts:1006`, `:1154`,
`:1159`, `:1176`, `:1182`, `:1195`; threshold at `lib/pitcherStats.ts:292`. Registry at
`lib/metricRegistry.ts:4`, `:23`, `:676-683`; `getTip()` at `lib/glossary.ts:129`; σ consumer at
`lib/serverRenderCard.ts:927`. Park factors at `lib/constants-data.ts:28` against `:4`; unit error at
`app/api/park-adjusted/route.ts:50`; scale map at `app/api/league-baseline/route.ts:22-38`; MiLB map
at `app/api/update/milb/route.ts:74-98`. Outage dates from `planning.md:301`. Row counts (`pitches`
≈ 8.88M / 9.7 GB, `pitch_baselines` 206, `players` 16,931) were read centrally on 2026-08-12 from
`pg_class.reltuples` with `last_analyze` NULL everywhere, so they are approximate. Composite-σ
arithmetic and the IAS 8 framing come from `Li/metric-governance/05-baseline-normalization-design.md`
and `Li/metric-governance/11-metric-deprecation-migration.md`. No database was queried here.
