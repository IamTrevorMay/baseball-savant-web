---
title: Metric Deprecation & Migration — Retiring a Number Without Rewriting History
domain: metric-governance
tags:
  - deprecation
  - migration
  - dual-running
  - sunset-policy
  - definitional-change
  - backward-compatibility
  - restatement
last_updated: 2026-08-12
sources_reviewed: 21
---

# Metric Deprecation & Migration — Retiring a Number Without Rewriting History

## TL;DR

- **Triton's only written retirement policy is the rule you must never follow: delete the row.** `docs/VARIABLES.md:57`: *"remove the row outright."* It erases the definition of every number published under the key, and frees the key for reuse. **(computed)**
- **Deprecation and removal are two dates, not one event.** RFC 9745 marks *deprecated* (works, stop adopting), RFC 8594 *sunset* (stops working); collapsing them turns retirement into breakage. **(established)**
- **A retired identifier must be reserved, never recycled** — protobuf reserves names as well as numbers: a reused name silently reinterprets old data. `stuff_plus` is most at risk. **(established)**
- **Triton has already retired a definition without noticing:** `EVENT_NORMALIZE_MAP` swapped the MiLB event vocabulary mid-2026 — no dual run, no backfill — on an *ingest-date* seam no `game_date` filter can see (§3.1). **(computed)**
- **It is also migrating continuously, undeclared:** the nightly scoring UPDATE has no `stuff_plus IS NULL` guard and its "last 3 days" window is **four** dates, re-scoring four days of rows nightly on a moved baseline (§3.2). **(computed)**
- **Accounting settled rescore-vs-preserve fifty years ago:** IAS 8 applies *policy* changes retrospectively (restate history), *estimate* changes prospectively. A formula change is policy, a baseline refresh estimate; Triton treats both as neither. **(established)**
- **Cut over on rank order, not the mean, and never on `pitches`** — a v2 reshuffling the top 20 while moving the mean 0.3 points is a different metric wearing the same name, and a second scored column is 8.89M UPDATEs against a ~660k-row sidecar (§4). **(computed)**
- **Backward-compatible history is a translation table, not a preserved column:** OpenTelemetry renames metrics via schema files so old queries resolve, `metric_aliases` does it in ~50 rows, and Savant's `spin_rate_deprecated` shows the convention already inside Triton's own schema (§7). **(established)**
- **Anything already published is unmigratable:** `daily_cards`, the newsletter and overlays emit values a later rescore contradicts; the archive must snapshot value *and* version at publish time. **(estimated)**

## 1. The lifecycle, and the dates that define it

A metric has five states, each failing differently. Triton names none of them.

| State | Meaning | Who acts | Triton today |
|---|---|---|---|
| **Active** | the definition to use | nobody | implicit |
| **Deprecated** | correct, but **do not adopt**; successor exists | new consumers | absent |
| **Sunset** | stop date published, migrate by it | every consumer | absent |
| **Removed** | not computed; history may remain | pipeline | unannounced |
| **Reserved** | key retired permanently, never reissued | schema | **never** |

RFC 9745 (`Deprecation`) and RFC 8594 (`Sunset`) are separate headers for this reason; Kubernetes fixes the gap at a *minimum* number of releases the deprecated thing keeps working. JEP 277 is the reverse failure: mark everything `@Deprecated`, remove nothing, the marker stops informing.

**Reserved is the state people skip and the only unrecoverable one.** A deleted glossary row leaves the string looking free; a future model claims it, and eleven years of values become the new thing's. Protobuf's answer: `reserved "stuff_plus";`. AIP-180, for API fields: never change what a field means; add a new one.

> **Li's rule: retirement is additive** — retire a metric by *adding* a record of the retirement, never by deleting the record of its existence.

## 2. Five kinds of change, five correct responses

"Deprecation" covers changes needing opposite handling — classify first.

| Change | Example | Same key? | History | Dual run? |
|---|---|---|---|---|
| **Bug fix** — value moves to its documented definition | 2026-08-11 NULL repair | yes | rescore, no notice | no |
| **Estimate refresh** — same formula, newer inputs | nightly `pitch_baselines` rebuild; FanGraphs Guts! | yes | **prospective only** | no |
| **Redefinition** — formula, weights or population change | Stuff+ weights 4.5/3.5/2.0 → anything | **no — new key** | restate all, publish both | **yes** |
| **Replacement** — better metric supersedes older | `deception_score` over a pitch-mix stat | new key, old → deprecated | keep old to sunset | **yes** |
| **Withdrawal** — metric wrong or unsupportable | a stat whose population never existed | key → reserved | label, never delete | no |

IAS 8 encodes the middle row for financial statements, Eurostat for official statistics: **routine revisions prospective and scheduled, methodological changes retrospective and announced.** Both Triton restatements broke it. On 2026-05-08 wRC+ moved 5–6 points for every 2026 hitter when `SEASON_CONSTANTS[2026]` arrived and `LATEST_SEASON_YEAR` stopped serving 2025 constants — an *estimate refresh* hitting every historical page view, wRC+ being query-time, never stored (`02-metric-versioning-reproducibility.md` §2.2). The 2026-08-11 Stuff+ repair was a *bug fix* that also ran an undeclared refresh over ≈249,000 rows.

**A rename is a redefinition until proven otherwise:** identical computation both sides means an alias suffices (§6); otherwise it is cover for a definition change (`02` §4).

## 3. Triton's live, undeclared migrations

### 3.1 The MiLB event vocabulary — a replacement with no dual run

Commit `410212b` (2026-06-08) added `EVENT_NORMALIZE_MAP` (`app/api/update/milb/route.ts:74–105`), mapping MLB Stats API events to Savant's lowercase vocabulary at ingest; no backfill ran. 2023–2025 are 100% Title Case, 2026 **53.5% Title Case / 46.5% lowercase** — `field_out` (23,457) beside `Groundout` (11,209), one column, one season. Three things make it worst-case:

1. **The seam is ingest date, not game date.** No `game_date` predicate finds it; `events = 'Strikeout'` loses ~46.5% of 2026 with **no error, just fewer rows** — the failure `CLAUDE.md`'s advice walks users into.
2. **A category collapse, not a case fold.** `Groundout`/`Flyout`/`Lineout`/`Pop Out`/`Forceout` all become `field_out`, so pre-June rows carry batted-ball granularity post-June rows lack. The backfill is *semantic*: you cannot restore what the map discarded, only lose it evenly.
3. **Both vocabularies are "correct."** Neither is a bug — a definitional change never declared, dual-run or dated.

The fix is not `initcap()`: pick the vocabulary, record the seam date, backfill the reversible half, register the granularity loss as a **coverage fact** in `docs/VARIABLES.md`, like deception's 2017+ boundary.

### 3.2 The re-sync window is a re-scoring window

`applyStuffPlusForDateRange` (`app/api/update/route.ts:320–333`) runs one `UPDATE pitches p … FROM pitch_baselines b … AND p.game_date = '<day>'` per day with **no `stuff_plus IS NULL` predicate**, over the cron's `start = addDaysToYmd(today, -3)` → `end = today`: **four** inclusive dates despite its "last 3 days" comment (`app/api/cron/pitches/route.ts:36–38`). So four days of scored rows re-score nightly on a moved baseline: continuous, unlogged, undeclared migration of the flagship metric. It is also why the 2026-08-11 repair worked: declare it rather than remove it — the guard plus a `mode='rescore'` path logged in the ledger (`10` §7).

### 3.3 A retired code that came back

`FT`, the pre-2020 two-seam code superseded by `SI`, sits in `pitches` with `MIN(game_year) = MAX(game_year) = 2026`, **13 rows**. Symmetrically `ST` (sweeper, 266,453 rows) and `SV` report `MIN(game_year) = 2015` — impossible under the taxonomy then in force: Savant retro-applied a newer classifier, Triton re-ingested it. `pitch_baselines` is keyed `(pitch_name, game_year)`, so reclassification shifts pitches between baseline populations and changes their Stuff+ with no Triton code changing (`05-baseline-normalization-design.md`). Triton does not control its inputs' deprecation calendar: spotting an upstream retirement is Jo's (`data-quality/04-distribution-drift-detection.md`), reading it as a definition change is Li's.

## 4. Dual-running: where to put v2

Expand / migrate / contract (Fowler's ParallelChange): both definitions live at once, consumers move one at a time, the old goes last. The question is *where v2's values live*.

| Option | Cost on `pitches` | Verdict |
|---|---|---|
| `ADD COLUMN stuff_plus_v2` + full backfill | 8.89M UPDATEs, 4.0% HOT ⇒ nearly every write dirties all 29 indexes / 9,711 MB; 8s cap, ~2,100 chunks | **Reject** — costs more than the metric |
| Same column, **date-scoped slice** (one season) | ~660k rows, ~180 chunks | **Acceptable** for a one-off bake-off |
| **Sidecar** `stuff_plus_v2 (pitch_pk, value, baseline_version_id)` | zero writes to `pitches`; ~660k narrow rows/season | **Adopt** — join to compare, then drop |
| Compute v2 **at query time** from stored inputs | zero storage; reproducible only if constants are versioned | **Adopt for wRC+** and constants-driven metrics |

The sidecar wins for the reason day-grain beat row-grain provenance in `10` §6: `pitches` is the costliest table to write and the worst home for a temporary artifact. Two disciplines keep it valid. **Pin one `baseline_version_id` across the v2 run**, else v2 drifts its own vintage and you measure the baseline, not the formula (`02` §3). **Score both over the identical row set**: Stuff+ scores a *superset* of its baseline population (`01-metric-definition-semantics.md`), so "same rows" needs verifying.

## 5. The comparison that decides cutover

A delta histogram is necessary, not sufficient: plus-stats are consumed as *rankings* — leaderboards, "who improved," colour bands — so the deciding statistics are ordinal. Build `ranked` per pitcher for one season: v1/v2 = `avg(p.stuff_plus)`/`avg(x.value)` joined on `pitch_pk`, `HAVING count(*) >= 250` (state the qualification, `07`), r1/r2 their ranks.

```sql
-- Per season only: never scan all 8.89M rows.
SELECT count(*) qualified, corr(r1::float8, r2::float8) rank_corr,
       count(*) FILTER (WHERE abs(r1-r2) > 10) moved_gt_10,
       count(*) FILTER (WHERE abs(r1-r2) > 10 AND r1 <= 20) top20_shuffled,
       round(avg(v2-v1), 2) mean_shift, round(stddev_samp(v2-v1), 2) delta_sd
FROM ranked;
```

| Reading | Interpretation | Action |
|---|---|---|
| ρ ≥ 0.98, `top20_shuffled` = 0, mean shift ≈ 0 | a refinement | cut over, PATCH notice |
| ρ ≥ 0.95, `top20_shuffled` > 0 | same construct, reordered where everyone looks | dual run one full season |
| ρ < 0.9 **or** mean shift > 1 σ | a different construct | **new key**, both computed, `02` §4 MAJOR |

**Check disagreement at decision thresholds too.** `lib/metricRegistry.ts` colours plus-stats at fixed cut points (`ColorSpec.mode = 'plus'`, `high`/`low` bands), so a version moving 4% of pitchers across the 100 line changes what the platform *says* about them even at ρ = 0.99. Chromium gates removal on usage counters for the same reason: impact is measured on consumers. Treatment **Cas's**, statistic Li's.

## 6. Backward-compatible history — the three honest options

Every stored v1 value and published number needs a disposition. There are three; mixing them per-metric is fine, mixing them *within* a metric produced 2026's two-vintage column.

| Option | What history holds | Precedent | When it is right |
|---|---|---|---|
| **A. Restate** — rescore history, retire v1 | one definition end to end | B-Ref restates bWAR wholesale with a change log; IAS 8 | fixed population, nothing published outside, affordable rescore |
| **B. Freeze and label** — v1 keeps its values, v2 starts at a date | two definitions, one **published seam date** | Statcast tracking generations | rescore impossible, or inputs gone |
| **C. Alias and translate** — a mapping layer resolves old keys | one series, many names | OTel schema files; Stripe pins callers | renames, splits, merges — no arithmetic change |

**Triton is mostly A with unavoidable B.** Stuff+ covers a fixed population and is not published *as a series*, so restatement is defensible — but gated on a season-close rescore capability that does not exist (`02` §6) and on the provenance horizon: nothing predating the ledger can carry its vintage (`10` §7.1). Where restatement is impossible, say so with a date; `temporal-modeling/11-reproducible-historical-queries.md` covers numbers labelled, not reproduced.

Option C costs almost nothing and Triton lacks it entirely:

```sql
-- ~50 rows. The only thing between a renamed key and a broken saved report.
CREATE TABLE metric_aliases (
  old_key text PRIMARY KEY,
  new_key text,  -- NULL = withdrawn, no successor
  relation text NOT NULL CHECK (relation IN
    ('rename','equivalent','superseded','split','withdrawn','reserved')),
  effective_from date NOT NULL,  -- first date new_key is authoritative
  sunset_on date,  -- old_key stops resolving
  note text NOT NULL
);
```

`filter_templates` and saved tiles persist keys chosen months ago; without this table a rename silently empties a saved report. Read through the alias, log hits, sunset at zero. **The `reserved` relation is load-bearing:** a withdrawn key keeps a permanent row with `new_key = NULL`, making `docs/VARIABLES.md:57` recoverable rather than fatal.

## 7. Announcing a definitional change

`pitches` carries the pattern already: **seven 100%-NULL legacy columns** — `spin_rate_deprecated`, `break_angle_deprecated`, `break_length_deprecated`, `tfs_deprecated`, `tfs_zulu_deprecated`, `spin_dir`, `umpire` — survivors of Savant's 2017-04-24 CSV change (60 → 75 fields; `start_speed` → `release_speed`, `px`/`pz` → `plate_x`/`plate_z`). Nine years on, harmless: **name retired in place, column kept, identifier never reused** — the standard to copy, the opposite of the glossary rule.

A change notice is five fields:

| Field | Example |
|---|---|
| `metric` / `version` | `stuff_plus@1.0.0` → `stuff_plus@2.0.0` |
| `class` | redefinition (MAJOR) — weights changed |
| `effective_from` / `sunset_on` | 2026-11-01 / 2027-03-01 |
| `history` | Option A: 2015–2026 rescored 2026-11-01 on final baselines |
| `expected impact` | mean +0.0, ρ = 0.972, 41 pitchers moved >10 ranks, 3 in the top 20 |

It belongs in three places. **`docs/VARIABLES.md`**, in the code's commit (`09`: only a Vitest drift test enforces that). **`lib/metricRegistry.ts`**, as `MetricDef` fields — `deprecated?: { since: string; replacedBy?: string; sunset?: string }` beside the `sqlKey`/`population`/`coverage` extensions from `03-semantic-layers-metric-stores.md`. And **the surface**, rendering the metric with its successor named (Cas's treatment, Li's wording). API responses for a deprecated key get `Deprecation` and `Sunset` headers.

## 8. What Triton should do, in order

1. **Rewrite `docs/VARIABLES.md:57`** — instead of "remove the row outright", move it to a *Retired Metrics* section with `deprecated_on`, `replaced_by`, `history_disposition` (A/B/C), and never reuse the key. One paragraph, and the highest-leverage edit here.
2. **Add the `stuff_plus IS NULL` guard plus an explicit `mode='rescore'` path** (§3.2) — stop the undeclared nightly migration, keep the capability, declare it; fix the four-vs-three-day cron comment too.
3. **Ship `metric_aliases` (§6)**, resolving saved-report and API keys through it: ~50 rows, no `pitches` change, any rename survivable.
4. **Declare the MiLB event migration** and run §3.1's four steps. Backfill safety is **Jo's** (`data-quality/11-remediation-backfill-safety.md`), the semantic call Li's.
5. **Make the §2 classification the standing metric-PR question:** which of the five is this, and does it imply a new key?
6. **Add `deprecated?` to `MetricDef`**; have the glossary drift test (`09`) fail when a key is retired in one surface, live in another.
7. **Write the §5 bake-off as a reusable script** now, so the next redefinition is a query, not a debate.
8. **Snapshot value + version at publish time** in `daily_cards` and the newsletter, so restatement never contradicts what was sent.

**Anti-recommendation — do not "clean up" by deleting retired metric keys and their glossary rows, and do not rename `stuff_plus` in place when the weights change.** Three grounds. **(i) It destroys the only readable definition of published numbers**: screenshots, newsletters and `daily_cards` rows outlive the deletion, and wRC+ proves the platform emits numbers it cannot explain (`02` §2.2). **(ii) It frees the identifier for reuse**, turning a known gap into a confident misreading — 8.89M rows over 2015–2026 silently becoming the new metric's, exactly what protobuf's `reserved` and AIP-180 prevent. **(iii) It is unnecessary**: a retired row costs one Markdown line and one alias row, against a rescore of the largest table (4.0% HOT, 29 indexes, 9,711 MB, 8s cap) — and Savant's 2017 `*_deprecated` columns have cost nothing in nine years. Secondary don't: never dual-run via a second scored column on `pitches`; use the §4 sidecar.

**Single highest-leverage next action:** make edit (1) today — three sentences turning "delete the row" into "retire the row and reserve the key." Every other item assumes retirement leaves a record; the policy guarantees otherwise.

## Sources

1. [RFC 9745 — Deprecation HTTP header](https://www.rfc-editor.org/rfc/rfc9745.html) — the *deprecated* signal.
2. [RFC 8594 — Sunset HTTP header](https://www.rfc-editor.org/rfc/rfc8594.html) — the removal date (§1, §7).
3. [Kubernetes — Deprecation Policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/) — minimum dual-run windows.
4. [JEP 277 — Enhanced Deprecation](https://openjdk.org/jeps/277) — `forRemoval`; unremoved markers lose meaning.
5. [PEP 387 — Backwards Compatibility Policy](https://peps.python.org/pep-0387/) — a warning period counted in releases.
6. [Protocol Buffers — proto3 guide](https://protobuf.dev/programming-guides/proto3/) — `reserved` numbers *and names* (§1, §8).
7. [Google AIP-180 — Backwards compatibility](https://google.aip.dev/180) — never repurpose a field (§6).
8. [Google AIP-181 — Stability levels](https://google.aip.dev/181) — deprecation as a declared state.
9. [Fowler — ParallelChange](https://martinfowler.com/bliki/ParallelChange.html) — expand / migrate / contract (§4).
10. [dbt — `deprecation_date`](https://docs.getdbt.com/reference/resource-properties/deprecation_date) — a retirement date as a model property.
11. [dbt — Model versions](https://docs.getdbt.com/docs/collaborate/govern/model-versions) — deprecated versions still resolvable (§6 C).
12. [OpenTelemetry — Schemas](https://opentelemetry.io/docs/specs/otel/schemas/) — rename transforms; model for `metric_aliases`.
13. [Stripe — API versioning](https://docs.stripe.com/api/versioning) — pin-forever: old definitions stay callable.
14. [Chromium — Removing features](https://www.chromium.org/blink/removing-features/) — usage counters gate removal (§5, §6).
15. [Semantic Versioning 2.0.0](https://semver.org/) — the breaking-change test: new key or same (§2).
16. [IFRS — IAS 8](https://www.ifrs.org/issued-standards/list-of-standards/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors/) — retrospective (policy) vs prospective (estimate).
17. [Eurostat — ESS revision policy guidelines (KS-RA-13-016)](https://ec.europa.eu/eurostat/web/products-manuals-and-guidelines/-/ks-ra-13-016) — pre-announced revisions, published calendar.
18. Curino, Moon & Zaniolo (2008) — [Graceful database schema evolution](https://doi.org/10.14778/1453856.1453939), *PVLDB* — historical queries on an evolved schema (§6).
19. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `spin_rate_deprecated` retired in place.
20. [MLB — Statcast glossary: Sweeper](https://www.mlb.com/glossary/statcast/sweeper) — a retro-applied class moves baselines (§3.3).
21. [Baseball-Reference — WAR Explained](https://www.baseball-reference.com/about/war_explained.shtml) — bWAR restated wholesale with a change log (§6 A).

**Triton-internal evidence.** Code-verified 2026-08-12 in the working tree. `docs/VARIABLES.md:57` contradicts that file's §0 same-commit rule; `stuff_plus` appears there zero times. `EVENT_NORMALIZE_MAP` applied at `app/api/update/milb/route.ts:244`; the 2026 casing mix, `field_out` 23,457 vs `Groundout` 11,209, and the `Groundout`/`Flyout`/`Lineout`/`Pop Out`/`Forceout` → `field_out` collapse: `docs/reliability-findings-2026-08-11.md` #12l. wRC+ computed at query time by `computeWRCPlus` (`lib/sql.ts:53`) from `SEASON_CONSTANTS`/`PARK_FACTORS` in `lib/constants-data.ts:4–65` — **not** `lib/sql.ts`, despite `docs/VARIABLES.md` §1.4 — `LATEST_SEASON_YEAR` line 65; `PARK_FACTORS` one frozen 2024 vintage by team, 2015–2026. The 2026-05-08 restatement moved a .350-wOBA hitter 125 → 120 (`02` §2.2). `MetricDef`/`ColorSpec` (`plus` mode's `high`/`low` bands): `lib/metricRegistry.ts:12–26`, 69 entries, 9 sharing a key with `reportMetrics.METRICS`. Measured: `pitches` ≈ 8,877,621 rows / 9,711 MB / 623,662 pages, `game_date` 2015-03-03 → 2026-08-10, **no `created_at`/`updated_at`**; `milb_pitches` ≈ 2,508,422 rows / 2,366 MB; `pitch_baselines` **206 rows**, keyed `(pitch_name, game_year)`, **no timestamp**, destructively upserted; `league_averages` 1,806 rows. The ≈249,000-row two-vintage rescore of 2026-08-11: `02` §3. The 4.0% HOT ratio, 29 indexes and 8s cap are Jo's (`02`, `10`). The seven 100%-NULL columns and `FT` 13-row / `ST` 266,453-row counts: `Jo/postgres-performance/09-schema-design-analytical.md`, `docs/Queries.md:1148`; the 2017-04-24 Savant CSV 60 → 75 change: `Jo/data-reliability/09-external-api-ingestion.md:109`.
