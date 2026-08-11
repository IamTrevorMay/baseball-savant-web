---
title: Semantic Layers & Metric Stores — One Definition, Many Consumers, and What It Costs
domain: metric-governance
tags:
  - semantic-layer
  - metric-store
  - metricflow
  - cube
  - lookml
  - malloy
  - headless-bi
  - single-definition
sources_reviewed: 22
last_updated: 2026-08-11
---

# Semantic Layers & Metric Stores — One Definition, Many Consumers, and What It Costs

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source at the
> cited line — read, not queried; the DB was off-limits. **(estimated)** reasoned from theory.

## TL;DR

- **A semantic layer makes one claim: the metric's computation lives in one artifact and every consumer asks for it by name.** Caching, APIs and access control are packaging sold alongside, and the claim's value is proportional to consumer count — serving one app it is a file, serving five an architecture. **(established)**
- **The standalone metrics layer failed commercially and its chief advocate said so** — Benn Stancil named it "the missing piece" in 2021, and by 2025 blamed economics: nobody buys a metric store without a viz layer. Also **"metric store" ≠ "semantic layer"**: one models entities and joins, the other metrics and aggregation. Triton's joins are shallow and stable and its *definitions* drift, so it needs the metric-store half only. **(established)**
- **Triton meets none of the adoption preconditions** — no dbt, no warehouse, no BI tool, no second consuming app, one engineer — yet **already has a semantic layer, for presentation only**: `lib/metricRegistry.ts` holds **69** `MetricDef` entries, seven of whose eight fields describe rendering. **(computed — no `dbt_project.yml`; `CLAUDE.md` says ~50 entries, so the docs are stale)**
- **Registry and computation map don't share a key space: 9 of 69 keys overlap.** Registry is camelCase (`whiffPct`, `avgVelo`, `commandPlus`), `reportMetrics.METRICS` snake_case (`whiff_pct`, `avg_velo`, `cmd_plus`); only `ba, games, h, ip, obp, ops, pa, pitches, slg` are in both. **87% of the registry has no programmatic link to how its number is produced.** Nor does *which table serves a metric* — that lives in four ad-hoc `Set`s (19+3+3+2 keys) tested at call sites, i.e. MetricFlow's "which semantic model owns this measure." **(computed)**
- **The registry's one non-presentational field is already wrong in the way semantic layers exist to prevent.** `totals: 'avg'` is an unweighted mean across rows (`calcTotalsFromRegistry` 663–669) — mean of ratios, not ratio of sums — unfixable because **no field names the weight.** Nor would adopting a vendor help: **no off-the-shelf metric schema carries the fields Triton most needs** — sample size, stabilization threshold, baseline vintage, cross-level comparability, null-vs-zero. MetricFlow will serve a whiff% computed on 11 swings. **(computed / established)**
- **The move: extend `MetricDef` from a format spec into a definition record** — computation, population, filter, weighted aggregation, coverage, stabilization, baseline dependency, glossary anchor. **(estimated)**

---

## 1. The one idea, and the four things sold around it

> A metric is defined once, in an artifact that is not the SQL of any particular query, and every consumer — dashboard, API, notebook, overlay, LLM — resolves it by name at request time.

Whiff rate then cannot be 34.1% on the dashboard and 33.6% in the newsletter. dbt calls this *write once, query anywhere*; Cube calls it *headless BI*; Looker called it LookML fifteen years earlier. Everything beyond the claim is packaging, and pricing it separately *is* the adoption decision:

| Layer | What it does | Needed when |
|---|---|---|
| **Definition** | one artifact per metric — the actual idea | always |
| **Query compilation** | metric × dims × filters → engine SQL, resolving fan-out | consumers slice by arbitrary dimensions |
| **Serving APIs** | JDBC / GraphQL / REST bindings | a BI tool, or ≥2 apps |
| **Caching / pre-agg** | materialized rollups, refresh keys, invalidation | concurrency Triton doesn't have |

Cube's own definition of headless BI is these layers *minus the first*. **(established)**

**Fan-out is the real technical content:** a metric on one fact table must stay correct when sliced by a dimension on another — join a pitch-grain fact to a season-grain dimension and a naive `SUM` double-counts. Triton's metric SQL hits one wide table (`pitches`, 90+ columns, pre-joined) or three narrow pre-aggregated ones. No join graph to compile removes the hardest thing a semantic layer does, and most of the reason to adopt one. **(estimated)**

---

## 2. The field, compared honestly

| System | Artifact | dbt? | Service? | Actually good at |
|---|---|---|---|---|
| **dbt SL / MetricFlow** | YAML in the dbt project | **yes** | yes | metrics versioned with the transforms feeding them |
| **Cube** | YAML/JS model | no | yes | pre-aggregation caching; embedded analytics APIs |
| **LookML** | `.lkml` files | no | Looker | governed self-service in one BI tool; deepest join modeling |
| **Malloy** | `.malloy` files | no | no | nested aggregation, elegantly — *not* governance |
| **Metriql** | dbt YAML extension | yes | yes | demonstrating the idea; effectively dormant |
| **In-code registry** *(Triton)* | TypeScript object | no | **no** | zero infrastructure; typed, refactorable, testable |

**Every option but the last adds a runtime** — a deployment surface, a cache to invalidate, a new place for numbers to go quietly stale, on a platform whose defining incident was a silent three-month data failure. **Every dbt-based option presupposes dbt**, whose `ref()`-addressed models Triton lacks: its transformation layer is API routes and Postgres RPCs.

### 2.1 The same metric, and Triton's

Whiff% = swinging strikes / swings. **MetricFlow** (`ratio` is first-class, with `simple`, `cumulative`, `derived`, `conversion`):

```yaml
semantic_models:
  - name: pitches
    model: ref('fct_pitches')
    entities:   [{ name: pitcher, type: foreign, expr: pitcher }]
    measures:
      - { name: swinging_strikes, agg: sum, expr: "case when description like '%swinging_strike%' then 1 else 0 end" }
      - { name: swings, agg: sum, expr: "…" }
metrics:
  - { name: whiff_pct, label: Whiff %, type: ratio,
      type_params: { numerator: swinging_strikes, denominator: swings } }
```

**LookML** says it in a fifth of the space because the join model lives in the `explore` —
`measure: whiff_pct { type: number  sql: 100.0 * ${swinging_strikes} / NULLIF(${swings}, 0) ;;  value_format_name: decimal_1 }`. All four put computation, label, unit and format in **one artifact**.

**Triton, today** — one metric, two files that cannot see each other:

```ts
// lib/reportMetrics.ts — the computation, keyed 'whiff_pct'
whiff_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' …)
            / NULLIF(COUNT(*) FILTER (WHERE …), 0), 1)"

// lib/metricRegistry.ts — the presentation, keyed 'whiffPct'
whiffPct: { key: 'whiffPct', label: 'Whiff%', unit: '%', format: { type: 'pct', digits: 1 },
            color: { mode: 'static', class: '…' }, totals: 'avg', tip: '…' }
```

That split is the entire gap, and it is closable without adopting any of the four. **(computed)**

---

## 3. Metric stores, semantic layers, and the governance argument

A **semantic layer** models entities, joins and dimensions — *how do these tables relate, what can I slice by?* — and fails by producing wrong numbers from wrong joins (LookML, Cube, AtScale). A **metric store** models numerator, denominator, grain and time basis — *what is the one true definition?* — and fails by letting definitions drift into two right answers (MetricFlow, Metriql, Minerva, uMetric). Triton needs the second only.

The in-house prior art is the honest guide. Airbnb's **Minerva** serves aggregates downstream at 12,000+ metrics; Uber's **uMetric** adds a six-stage lifecycle, canonical-form query dedup to catch two teams defining one metric twice, and a Verification Committee — **a committee and a lifecycle, which no vendor sells.** At scale the hard part of governance is human process; technology is only enforcement. Triton's committee is one person and his enforcement is `docs/VARIABLES.md` plus a commit-time convention: correctly sized, not deficient. A definition is a contract (`01-metric-definition-semantics.md`), and one enforced by convention decays proportionally to the people and surfaces bound by it. **(established / estimated)**

**Where it holds.** *Change propagation* — edit once, every surface updates atomically; the largest benefit and the one Triton can capture cheaply. *Generated documentation* — the glossary cannot lie. *Multiple consumers* — weakly true today: `/api/report`, `/api/scene-stats`, the dashboard, overlays and the newsletter share `lib/reportMetrics.ts` (so *values* mostly agree) and don't share the registry (so *formatting and aggregation* diverge). **(computed)**

**Where it overreaches.** It prevents inconsistency, not *error* — one wrong definition applied uniformly is worse than two that disagree loudly, because disagreement is a detection signal, and Triton's `league_averages` is documented as 50th-percentile while implemented as `AVG()`; a semantic layer would have propagated that with perfect fidelity. It also **cannot express uncertainty**: no system in §2 has a field for sample size, stabilization threshold, or baseline vintage — decisive here, since Triton's standing hazards are exactly vintage drift, null-vs-zero, cross-level incomparability and short-window interpretation. And the economics never worked; standards work has moved to Apache Ossie (formerly Open Semantic Interchange), an interchange *format*. **(established)**

---

## 4. What Triton has: a half-built semantic layer, measured

`lib/metricRegistry.ts` calls itself the *"single source of truth for column definitions, formatting, coloring, and totals aggregation."* Three of those four are presentation.

The current `MetricDef` is eight fields — `key`, `label`, `unit`, `format` (`int|dec|pct|ip`), `color` (`static|plus|inverted_value`), `totals` (`sum|avg|max|ip|totalRE|none`), `higherBetter?`, `tip?`. Seven describe rendering. The eighth, `totals`, carries a known defect.

| Fact (computed from source, 2026-08-11) | Value |
|---|---|
| `MetricDef` entries in `METRIC_REGISTRY` | **69** (`CLAUDE.md`: ~50 — stale) |
| SQL expressions in `reportMetrics.METRICS` | **59** |
| Keys in **both** | **9** — `ba, games, h, ip, obp, ops, pa, pitches, slg` |
| Registry keys with no SQL counterpart by name | **60 / 69 (87%)** |
| Files importing the registry | **2** — `OverviewTab.tsx`, `lib/glossary.ts` |
| Metrics computed in JS (`COMPUTED_METRIC_KEYS`) | **2** — `wrc_plus`, `runs` |
| Source-routing `Set`s in `reportMetrics.ts` | **4** (19 + 3 + 3 + 2 keys) |

**No join between definition and display, and the routing `Set`s are a semantic model in disguise.** `whiffPct` and `whiff_pct` are one metric under two names in two files and nothing in the type system knows it — renaming one doesn't break the other, adding to one doesn't surface it in the other.

**`totals: 'avg'` is mean-of-ratios, encoded once and applied everywhere.** `calcTotalsFromRegistry` returns `sum / vals.length` over parsed row values; across seasons a 12-pitch season weighs the same as a 3,000-pitch one. The registry is the right place to fix it (hazard #5, `context/triton-context.md`) and the fix is impossible here — **there is no field to name the weight.** That missing field is the argument for §5.

---

## 5. The richer `MetricDef` — one entry that fully specifies a metric

Additive, not a rewrite: existing fields stay, the new block is optional, the 69 entries compile untouched.

```ts
// Population = { source: 'pitches' | 'milb_pitches' | 'pitcher_season_command'
//                       | 'pitcher_season_deception' | 'player_season_stats'
//                 grain: 'pitch' | 'pitcher_pitchtype_season' | 'player_season' }

export type Computation =                    // replaces the four routing Sets
  | { kind: 'sql';    expr: string }         // aggregate over Population.source
  | { kind: 'ratio';  numerator: string; denominator: string }
  | { kind: 'column'; column: string }       // read from a pre-agg table
  | { kind: 'js';     fn: 'computeWRCPlus' | 'computeRuns' }

export interface MetricDef {
  key: string; label: string; unit: Unit     // ── presentation, unchanged ──
  format: FormatSpec; color: ColorSpec; higherBetter?: boolean; tip?: string

  sqlKey?: string          // ── definition, new ── snake_case key in reportMetrics.METRICS
  population?: Population
  filter?: string          // predicate applied BEFORE aggregation, in SQL
  computation?: Computation
  aggregation?: {
    acrossRows: 'sum' | 'ratio_of_sums' | 'weighted_mean' | 'max' | 'ip' | 'none'
    weightBy?: string        // REQUIRED when acrossRows === 'weighted_mean' (e.g. 'pitches')
  }
  coverage?: { minSeason?: number      // deception: 2017; a NULL before this is not-measured
               nullMeans: 'zero' | 'not_measured' }
  stabilization?: { n: number; unit: 'pitches' | 'BF' | 'PA' | 'IP'
                    grade: 'established' | 'estimated'; source: string }
  baseline?: {
    table: 'pitch_baselines' | 'milb_pitch_baselines' | 'league_averages'
    keyedBy: string[]      // e.g. ['pitch_name', 'game_year']
    versioned: boolean     // false today — the vintage-drift hazard, in the type system
    crossLevelComparable: boolean
  }
  glossaryAnchor?: string  // '§1.3' — makes docs/VARIABLES.md drift testable
}
```

Stuff+ exercises every field: `sqlKey: 'stuff_plus'`, `population: { source: 'pitches', grain: 'pitch' }`, `filter: 'stuff_plus IS NOT NULL'`, `computation: { kind: 'column', column: 'stuff_plus' }`, `aggregation: { acrossRows: 'weighted_mean', weightBy: 'pitches' }` (was `'avg'`), `coverage: { nullMeans: 'not_measured' }` — the 2026 outage, in the type system — and `baseline: { table: 'pitch_baselines', keyedBy: ['pitch_name','game_year'], versioned: false, crossLevelComparable: false }`.

| New field | Hazard it makes structural |
|---|---|
| `sqlKey` | the 87% naming gap — a test asserts every registry key resolves to a `METRICS` entry |
| `population` + `computation` | replaces four routing `Set`s; a metric can't be filed under the wrong source |
| `aggregation.weightBy` | mean-of-ratios — `weighted_mean` without a weight becomes a **type error** |
| `coverage` / `stabilization` / `baseline` / `glossaryAnchor` | null-vs-zero rendered honestly; short-window warnings; unversioned-baseline dependence greppable; MLB/MiLB mixed axes blockable at build time; glossary drift a failing test |

The last row has **no equivalent in MetricFlow, Cube, LookML or Malloy.** An off-the-shelf semantic layer would hand Triton a compiler it doesn't need and take away the fields it does.

---

## 6. What Triton should do, in order

1. **Add `sqlKey` to all 69 entries plus the test that asserts it resolves.** One afternoon, zero behavior change, largest structural gap under CI.
2. **Add `aggregation`; migrate `totals`.** Keep `totals` as a deprecated alias, make `weighted_mean` require `weightBy`, and move `whiffPct`, `csPct`, `kPct`, `bbPct` and the rate family off `'avg'`. This **changes displayed numbers** (career totals rows) — `docs/VARIABLES.md` entry same commit, with before/after.
3. **Add `population` + `computation`; delete the four routing `Set`s**, re-exporting them as derived (`keysWhere(d => d.population?.source === 'pitcher_season_command')`) so no call site changes.
4. **Add `coverage.nullMeans`.** Cheapest high-value field: the display layer separates 0 from not-measured without every component re-deriving the rule (hazard #3, `context/triton-context.md`).
5. **Add `baseline` to the ~6 metrics that have one** — Stuff+, Triton+, deception; `versioned: false` is true today and makes the drift hazard machine-readable. Then `stabilization`, grade-tagged, and `glossaryAnchor` with a test that every anchor exists in `docs/VARIABLES.md`.
6. **Only then widen the consumer set** — `/api/report` and `/api/scene-stats` read the registry, not `METRICS`.

The migration is safe because the pattern is proven: `OverviewTab.tsx` consumes `getColumns`/`formatMetric`/`getCellColor`/`calcTotalsFromRegistry` in production and `lib/glossary.ts` falls back to the registry for tooltips. Adding optional fields breaks neither.

**Anti-recommendation — adopt none of these, specifically:**

- **Not the dbt Semantic Layer / MetricFlow.** It requires adopting dbt first — a framework Triton has no other use for, its transformations being API routes and Postgres functions, not a warehouse DAG. Cost: a build system, a deployment, a modeling language. Benefit: YAML instead of TypeScript, with *fewer* fields than §5.
- **Not Cube.** Its differentiators are pre-aggregation caching and multi-consumer APIs. Triton's read concurrency is one operator plus overlay clients, and its binding constraint is an 8s Postgres statement timeout Cube doesn't remove — it only adds another place a number can go silently stale.
- **Not LookML or Malloy.** LookML requires Looker, and Triton *is* the BI tool. Malloy is a query language with no versioning, ownership or provenance; adopting it means rewriting working SQL in a language with one user.
- **Not an in-house metrics service.** The failure Minerva and uMetric solve — two teams defining one metric differently — requires two teams. Triton has 69 metrics and one engineer.

Nor should the work stall pending a "proper" solution: step 1 costs an afternoon and is strictly better than what exists.

**When to revisit — all three, not any one:** **dbt enters the stack** for an unrelated reason (warehouse, transform DAG, model tests), making MetricFlow nearly free; **a second application consumes the metrics** — a partner API or client-facing Compete portal that cannot `import` a TypeScript module; **a second engineer writes queries**, since governance technology substitutes for shared memory and with two authors the registry must be enforced, not merely honest.

Until then: **Triton's semantic layer is a TypeScript file, and that is the correct architecture for its size.** The work is not replacing it — it is finishing it.

**Cross-references.** `01-metric-definition-semantics.md` — the seven clauses §5's schema encodes. `02-metric-versioning-reproducibility.md` — why `baseline.versioned` matters. `04-materialize-vs-compute-time.md` — `computation.kind` *is* the stored-vs-computed axis. `09-metric-documentation-glossary.md` *(planned)* owns the `glossaryAnchor` lockstep test. `Cas/analytics-ux/09-comparative-display-benchmarks.md` *(planned)* — `coverage.nullMeans`, `stabilization` and `baseline.crossLevelComparable` are produced here and *consumed* there; agree field names first.

---

## Sources

1. dbt — [About MetricFlow](https://docs.getdbt.com/docs/build/about-metricflow) — join/fan-out resolution.
2. dbt — [dbt Semantic Layer](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl) — architecture; dbt dependency.
3. dbt — [Creating metrics](https://docs.getdbt.com/docs/build/metrics-overview) — the five metric types (§2.1).
4. dbt — [Semantic Layer APIs](https://docs.getdbt.com/docs/dbt-cloud-apis/sl-api-overview) — needs dbt Cloud.
5. dbt — [Write once, query anywhere](https://www.getdbt.com/blog/dbt-semantic-layer) — founding rationale.
6. dbt — [dbt Labs acquires Transform](https://www.getdbt.com/blog/dbt-acquisition-transform) — MetricFlow becomes the engine.
7. GitHub — [dbt-labs/metricflow](https://github.com/dbt-labs/metricflow) — the engine, sans dbt Cloud.
8. Cube — [Data modeling](https://docs.cube.dev/docs/data-modeling/overview) — cubes, measures, views.
9. Cube — [Pre-aggregations](https://docs.cube.dev/docs/pre-aggregations/using-pre-aggregations) — most of Cube's value; Triton's reason to decline.
10. Cube — [What is Headless BI?](https://cube.dev/blog/headless-bi) — the four components (§1).
11. Google Cloud — [Introduction to LookML](https://cloud.google.com/looker/docs/what-is-lookml) — governed modeling.
12. Google Cloud — [LookML `measure`](https://cloud.google.com/looker/docs/reference/param-field-measure) — measure syntax (§2.1).
13. GitHub — [malloydata/malloy](https://github.com/malloydata/malloy) — the language.
14. Malloy — [Documentation](https://docs.malloydata.dev/documentation/) — a language, not governance.
15. Benn Stancil — [The Missing Piece of the Modern Data Stack](https://benn.substack.com/p/metrics-layer) (2021) — named the metrics layer.
16. Benn Stancil — [BI by another name](https://benn.substack.com/p/bi-by-another-name) (2023) — "BI tools, without charts."
17. Benn Stancil — [The context layer](https://benn.substack.com/p/the-context-layer) (2025) — the recantation.
18. Airbnb — [Metric consistency at scale](https://medium.com/airbnb-engineering/how-airbnb-achieved-metric-consistency-at-scale-f23cc53dea70) — Minerva; 12,000+ metrics.
19. Uber — [The Journey Towards Metric Standardization](https://www.uber.com/blog/umetric/) — uMetric lifecycle and committee.
20. GitHub — [metriql/metriql](https://github.com/metriql/metriql) — metrics store over dbt; [FAQ](https://metriql.com/faq).
21. AtScale — [What is a Semantic Layer?](https://www.atscale.com/glossary/semantic-layer/) — the four-way typology (§3).
22. Apache — [Apache Ossie (incubating)](https://ossie.apache.org/) — formerly OSI; dbt's [rename note](https://www.getdbt.com/blog/osi-is-now-apache-ossie).

**Triton-internal evidence (computed by source reading, 2026-08-11 — no DB queries run):**
`lib/metricRegistry.ts` — 69 `MetricDef` entries; interface 17–26; `GROUP_COLUMNS` 564–590; `calcTotalsFromRegistry` `'avg'` branch 663–669. `lib/reportMetrics.ts` — 59 `METRICS` expressions; four routing `Set`s at 226–235. Key overlap (9) by set intersection. Registry importers by repo-wide grep: `components/dashboard/OverviewTab.tsx:9`, `lib/glossary.ts:2`. No `dbt_project.yml` in repo. Entry-count discrepancy vs `CLAUDE.md` ("~50") logged as documentation drift.
