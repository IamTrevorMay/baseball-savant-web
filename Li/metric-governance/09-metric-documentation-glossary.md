---
title: Metric Documentation & Glossary Governance — Keeping Definitions and Code in Lockstep
domain: metric-governance
tags:
  - glossary
  - documentation-as-code
  - definition-drift
  - data-dictionary
  - semantic-layer
  - generated-docs
  - ownership
sources_reviewed: 17
last_updated: 2026-08-11
---

# Metric Documentation & Glossary Governance

## TL;DR

- **Triton does not have three definition surfaces. It has seven** — adding `lib/pitcherStats.ts` and `lib/leaderboardColumns.ts`, referenced **zero times** in `VARIABLES.md` and exempt from the convention. **(computed)**
- **Stuff+ — the flagship in-house metric — is absent from the canonical glossary.** `grep -i stuff docs/VARIABLES.md` returns one hit: the heading "### 1.2 Stuff / Arsenal", which has no Stuff+ row. `pitches.stuff_plus` is missing from §10 too. **(computed)**
- **The registry and the glossary use disjoint key namespaces, so neither can be checked against the other** — `VARIABLES.md` is snake_case (`avg_velo`), the registry camelCase (`avgVelo`). **67 of 69 registry keys appear nowhere in `VARIABLES.md`.** **(computed)**
- **Two surfaces give Deception and Unique contradictory definitions, and which renders depends on the string the call site passes** — "tunneling + release consistency" vs "signed z-scores with directional value." **(computed)**
- **`METRIC_TIPS` is the *only* place ~20 shipped metrics are defined** — HDev, VDev, Missfire, Waste%, their plus-stats, Hard Hit%, Barrel%, Chase%, Contact%, plus an undocumented bullpen vocabulary. **(computed)**
- **`TotalsStrategy` lives only in the registry, is stated nowhere in prose, and is wrong for rate stats.** `ba`, `obp`, `slg`, `ops`, `whip`, `era`, `kPct` all carry `totals: 'avg'` — a career row is the **unweighted mean of season values**, so a 40-PA call-up counts as much as a 600-PA season. **(established / computed)**
- **Three incompatible IP definitions exist, and a pitcher's displayed IP is not the IP inside his displayed FIP.** `METRICS.ip` uses an allow-list of out-events; `IP_ESTIMATE_SQL` (the FIP denominator) uses a deny-list that also counts caught-stealing and pickoff outs. **(computed)**
- **The repo already proves discipline-enforced docs decay: `CLAUDE.md` says `pitches` is "7.4M+" (actual 8,891,054) and `players` "4,017" (actual 16,924 — off 4.2×); `Soto/context/triton-context.md` reasons about an "8GB plan" against 32.3 GiB; Li's own context doc says "~50" registry entries.** Skipping the update costs zero at write time and is paid by a reader later, and no added discipline catches these — the failure mode is elapsed time. **(computed / established)**
- **The only self-enforcing mechanism is a test that fails on divergence; the durable fix is generating the glossary *from* the registry so there is one source, not seven.** dbt's ecosystem converged on this rather than on stricter review. **(established / estimated for Triton)**

---

## 1. The audit: what actually exists

Enumerated 2026-08-11 from the artifacts; no database queries.

| Surface | File | Size | Key style | Named in §0 trigger table? |
|---|---|---|---|---|
| Canonical glossary | `docs/VARIABLES.md` | 34.6 KB, 12 §§ | snake_case | — (is the doc) |
| SQL metric layer | `lib/reportMetrics.ts` | `METRICS` 68, `SCENE_METRICS` ~70 | snake_case | **yes** |
| SQL helpers | `lib/sql.ts` | `TRITON_COLUMNS` 19, 3 compute fns | snake_case | **yes** |
| Display registry | `lib/metricRegistry.ts` | **69** `MetricDef` entries | camelCase | no (3 incidental) |
| Tooltip map | `lib/glossary.ts` `METRIC_TIPS` | ~110 pairs | **display label** | no |
| Dashboard compute | `lib/pitcherStats.ts` | xFIP, SIERA, FPS%, csPct, Stuff+ | camelCase | **no — zero mentions** |
| Leaderboard columns | `lib/leaderboardColumns.ts` | `ColumnDef`, 229 `label:` sites | snake_case | **no — zero mentions** |
| DB glossary table | `glossary` (`column_name`, `description`) | — | raw column | one line in §9 |

`MetricDef` (`format`/`color`/`totals`) and `ColumnDef` (`format`/`colorClass`/`conditionalColor`) are near-duplicate types describing the same columns in two files. The same-commit convention names three files; definitions live in seven, so editing `pitcherStats.ts` or `leaderboardColumns.ts` carries no documentation obligation by the letter of the rule.

---

## 2. Diff 1 — registry ↔ glossary

### 2.1 In the registry, absent from `VARIABLES.md`

**67 of 69.** Most are namespace aliases (`avgVelo`↔`avg_velo`, `totalRE`↔`total_re24`, `commandPlus`↔`cmd_plus`, `brink`↔`avg_brink`, ~30 more) — a naming problem, not a knowledge gap. These are the real gaps, shipping with **no canonical definition anywhere**:

| Registry key | Label | Computed in | Nearest glossary entry |
|---|---|---|---|
| `stuffPlus` | Stuff+ | `pitcherStats.ts`, `pitches.stuff_plus` | **none** |
| `xfip` | xFIP | `pitcherStats.ts` `calcXFIP` | §4 lists only `era`, `fip`, `xera` |
| `siera` | SIERA | `pitcherStats.ts` `calcSIERA` | **none** |
| `fpsPct` | FPS% | `pitcherStats.ts` | **none** |
| `csPct` | CSt% | `pitcherStats.ts` (called ÷ pitches) | §1.3 `csw_pct` — **called *or* swinging; a different metric one letter away** |
| `sos` | SOS | *(verify — no producer found in `lib/`)* | §8.5 `sos_plus`, team grain, sd 15 |
| `whip`, `w`, `l`, `gs`, `sv`, `k9`, `bb9`, `hr9` | traditional | `pitcherStats.ts` / `player_season_stats` | **none** |

`sos` is the one to watch: the registry colors it `high: 105, low: 95` at apparent pitcher grain, while §8.5's `sos_plus` is a *team* z-score at sd 15 — under which ±5 is ±0.33σ, flagging the middle ~26% neutral. Same name, different grain. *(verify with Trevor.)*

### 2.2 In `VARIABLES.md`, absent from the registry

No `MetricDef`, so `getCellColor` falls back to `text-zinc-300` and `calcTotalsFromRegistry` writes `'Career'` into the cell:

- **Command (13):** `cluster_r_plus`, `cluster_l_plus`, `hdev_plus`, `vdev_plus`, `missfire_plus`, `close_pct_plus`, `avg_cluster_r`, `avg_cluster_l`, `avg_hdev`, `avg_vdev`, `avg_missfire`, `close_pct`, `waste_pct`
- **Batted ball / discipline (8):** `hard_hit_pct`, `barrel_pct`, `avg_dist`, `chase_pct`, `contact_pct`, `z_swing_pct`, `o_contact_pct`, `csw_pct`
- **Bat tracking (9):** all of §1.7 · **Other:** `singles`, `wrc_plus`, `runs`, `xdeception_score`

Seven *do* have tooltips — in `METRIC_TIPS`, by display label. The definition exists, in the surface nobody calls a glossary.

---

## 3. Diff 2 — where the stated definition and the code disagree

### 3.1 Deception and Unique have two definitions; precedence picks the loser

| Metric | `metricRegistry.ts` `tip` | `glossary.ts` `METRIC_TIPS` |
|---|---|---|
| Deception | "Pitch-weighted deception score — **tunneling + release consistency**" | "**Signed z-scores** with directional value for movement/release" |
| Unique | "Pitch-weighted uniqueness score — how unusual the movement/velo profile is" | "How unusual the ball flight is (**absolute z-scores**)" |

Not paraphrases — one names a mechanism, the other a construction. Both ship. The resolver:

```ts
export function getTip(key: string): string {
  return glossaryCache[key]?.description   // DB table, keyed by raw column_name
    || METRIC_TIPS[key]                    // keyed by DISPLAY LABEL
    || METRIC_REGISTRY[key]?.tip           // keyed by METRIC KEY
    || getRegistryTipByLabel(key) || ''    // by label again
}
```

Three namespaces probed in one flat chain. `getTip('Deception')` returns the z-score wording; `getTip('deceptionScore')` returns the tunneling wording. **The registry tip is unreachable for every metric whose label already exists in `METRIC_TIPS`** — most of them. *(estimated — read from source; verify against a rendered tooltip.)* The deeper defect: a lookup accepting either a key or a label cannot report a miss. It returns `''`, and an absent definition is indistinguishable from one that isn't needed.

### 3.2 Three incompatible definitions of IP

| Definition | Where | Construction |
|---|---|---|
| `METRICS.ip` | `reportMetrics.ts:10` | `COUNT(*) FILTER` over an **allow-list** of 7 out-events, +2 DP, +3 TP, ÷3 |
| `IP_ESTIMATE_SQL` | `sql.ts:19` | `COUNT(DISTINCT PA)` where events **NOT IN** hits/walk/HBP/CI/error, +DP, +2×TP, ÷3 |
| `player_season_stats.ip` | MLB Stats API | official |

The allow-list omits every out not on it — `caught_stealing_*`, `pickoff_*`, `other_out`; the deny-list counts them. **`IP_ESTIMATE_SQL` is the denominator inside `computeFIP`**, while `METRICS.ip` is what the leaderboard shows. §1.1 documents `ip` once, honestly noting "not the full innings calculus"; §4 points at `ERA_COMPONENTS_SQL` without flagging the different formula. The glossary is not wrong here — it is *incomplete in a way that reads as complete*, which is worse.

### 3.3 Season aggregation is undocumented and partly incorrect

`calcTotalsFromRegistry` builds the career row from each metric's `totals` strategy. For `ba`, `obp`, `slg`, `ops`, `whip`, `era`, `kPct`, `bbPct`, `whiffPct` it is `'avg'` — the unweighted mean across seasons, so a 600-PA season and a 40-PA call-up count equally. The correct figure re-derives from summed components (H/AB, ER×9/IP, K/PA), which `TotalsStrategy` cannot express: no variant carries numerator and denominator keys. A metric defect surfaced *by* the documentation audit — Li's, not Cas's.

---

## 4. Why glossaries rot

| Mechanism | What it looks like | Triton instance |
|---|---|---|
| **Zero write-time cost** | Skipping ships fine; a reader pays later | `pitcherStats.ts` grew four metrics, no rows |
| **Counts and sizes age silently** | Correct the day written, never re-derived | "7.4M+" vs 8,891,054; "4,017" vs 16,924; "8GB" vs 32.3 GiB; "~50" vs 69 |
| **Prose can't be type-checked** | Renaming a key updates every call site, no sentence | `csPct` vs documented `csw_pct` |
| **Scope creep past the trigger list** | Convention names 3 files; definitions live in 7 | `leaderboardColumns.ts`, `pitcherStats.ts` |
| **Additive-only editing** | New surfaces appended, old never reconciled | `METRIC_TIPS` keeps labels with no registry entry |
| **Verification that can't fail** | Checklist probes only covered surfaces | §0 steps 2–3: `SCENE_METRICS`, `TRITON_COLUMNS` |

---

## 5. Documentation-as-code, and what "generated" buys

Docs-as-code — documentation in the repo, same VCS, review, and CI — is already Triton's practice, and **it prevented none of the drift above**. What closes the gap is the second move: **derive the prose from the artifact**, as dbt does — descriptions beside the model, `persist_docs` pushing them into warehouse column comments, `dbt-checkpoint` failing the build when one is missing.

| Approach | Drift possible? | Fit for Triton |
|---|---|---|
| Hand-written markdown glossary | Yes, silently | today's `VARIABLES.md` |
| Markdown + PR convention | Yes, silently | today's convention — already failing |
| Markdown + **CI test** on coverage/conflict | Caught at commit | **the immediate fix** |
| **Generated** from a typed registry | Structurally impossible for generated sections | **the durable fix** |
| Full semantic layer (MetricFlow/Cube/LookML) | Impossible — one compiled definition | over-scoped; see `03-semantic-layers-metric-stores.md` |

---

## 6. Surfacing definitions where they are consumed

| Surface | Status | Gap |
|---|---|---|
| Column-header tooltip | shipped, `getTip()` | resolves across 3 namespaces; misses return `''` |
| Hover card on a plus-stat | not built | a `100` needs its population and baseline vintage inline |
| Sample size beside the value | not built | a metric without its `n` is an opinion → **Cas** |
| Coverage note | not built | Deception is 2017+; a blank pre-2017 cell reads as 0 |

Two rules follow from §3.1. **Definition lookups must fail loudly** — never silently empty. **Resolve by key, never by label**: labels are presentation, change for layout reasons, and collide (`'Max'` means max velocity in the arsenal table and nothing elsewhere). Once generation exists, tooltip and glossary row render from the same `MetricDef.tip`, so correcting one corrects the other.

---

## 7. Ownership and review

| Question | Owner |
|---|---|
| Is this definition correct, comparable, complete? | **Li** |
| Should this metric exist / is the model right? | **Soto** |
| Is the number present, fresh, covered? | **Jo** |
| Is it tested and honestly displayed? | **Cas** |

The review rule that fits a one-human platform: **a metric change is not reviewable without its definition diff.** A PR touching `METRICS`, `METRIC_REGISTRY`, `TRITON_COLUMNS`, `METRIC_TIPS`, `pitcherStats.ts`, or `leaderboardColumns.ts` with no change to a definition field invites one question — what did the number mean before, and what now?

---

## 8. The mechanical fix

### 8.1 A test that fails on divergence

Triton has Vitest and an `__tests__/lib/` suite; this drops in beside `sql.test.ts`. **`METRIC_TIPS` must be exported from `lib/glossary.ts` first** — currently `const METRIC_TIPS`, a one-keyword change.

```ts
// __tests__/lib/metricDocs.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { METRIC_REGISTRY } from '@/lib/metricRegistry'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import { METRIC_TIPS } from '@/lib/glossary'

// A key is documented as the backticked first cell of a markdown row.
const documented = new Set(
  [...readFileSync('docs/VARIABLES.md', 'utf8')
    .matchAll(/^\|\s*`([a-zA-Z0-9_.]+)`\s*\|/gm)].map(m => m[1])
)

describe('metric documentation is in lockstep with code', () => {
  it('every user-facing metric key is documented and defined', () => {
    const undocumented = SCENE_METRICS.map(m => m.value)
      .filter(k => k !== 'player_name' && !documented.has(k))
    const untipped = Object.values(METRIC_REGISTRY)
      .filter(d => d.totals !== 'none' && !d.tip).map(d => d.key)
    expect([...undocumented, ...untipped]).toEqual([])
  })

  it('registry and glossary never define the same metric differently', () => {
    const conflicts = Object.values(METRIC_REGISTRY)
      .filter(d => d.tip && METRIC_TIPS[d.label] && METRIC_TIPS[d.label] !== d.tip)
      .map(d => `${d.key} (${d.label}):\n    registry: ${d.tip}\n    glossary: ${METRIC_TIPS[d.label]}`)
    expect(conflicts, `\n${conflicts.join('\n')}`).toEqual([])
  })
})
```

**This test fails today** — on `deceptionScore` and `uniqueScore` at minimum, and on ~67 keys if the first assertion is widened to the registry. That is the point: a silent permanent condition becomes a red build with a named list. Ship it green against a `KNOWN_GAPS` allow-list if you must, but that list must only shrink — itself a checkable rule.

### 8.2 Generate the glossary from the registry

`MetricDef` already carries label, unit, format, aggregation strategy, direction, and definition. That is a data dictionary. Render it:

```ts
// scripts/gen-variables-doc.ts — CI runs it and diffs against the committed file
import { METRIC_REGISTRY, type MetricDef } from '@/lib/metricRegistry'

const row = (d: MetricDef) => {
  const dir = d.higherBetter == null ? '—' : d.higherBetter ? '↑ better' : '↓ better'
  return `| \`${d.key}\` | ${d.label} | ${d.unit || '—'} | ${d.totals} | ${dir} | ${d.tip ?? '**UNDEFINED**'} |`
}

export const renderRegistrySection = () => [
  '<!-- BEGIN GENERATED: lib/metricRegistry.ts — do not edit by hand -->',
  '| Key | Label | Unit | Season aggregation | Direction | Definition |',
  '|---|---|---|---|---|---|',
  ...Object.values(METRIC_REGISTRY).map(row),
  '<!-- END GENERATED -->',
].join('\n')
```

Two properties matter more than the code. The **`Season aggregation` column publishes `TotalsStrategy` in prose for the first time** — how §3.3's defect becomes visible instead of buried in a switch. And the block is **delimited**, so authored context the registry knows nothing about (§6 params, §8.x route specs, §11 Retrosheet) survives untouched. CI: regenerate, `git diff --exit-code docs/VARIABLES.md`.

### 8.3 Handoff

**`Cas` owns the test infrastructure** — §8.1 is a Vitest file in `__tests__/lib/`, Cas's suite and CI wiring, adjacent to `Cas/testing-data-systems/05-golden-file-metric-testing.md` *(planned)*. **Li owns the assertion contents** — whether `sos`/`sos_plus`, `csPct`/`csw_pct`, and the three IPs are one metric or several. Li supplies the list; Cas makes it fail.

---

## 9. What Triton should do, in order

1. **Export `METRIC_TIPS`, add `__tests__/lib/metricDocs.test.ts` (§8.1)**, seeded with today's failures as a shrink-only allow-list. Hand to **Cas**. Nothing below survives without it.
2. **Resolve the Deception/Unique contradiction (§3.1)** — the most user-visible defect here. Ask **Soto** which is true, delete the other; Li's read is that the `METRIC_TIPS` z-score wording matches `pitcher_season_deception`'s construction.
3. **Write the Stuff+ row into §1.2** — formula, `(pitch_name, game_year)` baseline keying, the 0–200 clamp, the storage column, **and the baseline-vintage caveat** (see `02-metric-versioning-reproducibility.md`).
4. **Make `getTip()` resolve by key only, and a miss loud** — throw in dev, render a visible `?` in production.
5. **Extend §0's trigger table to `metricRegistry.ts`, `glossary.ts`, `pitcherStats.ts`, `leaderboardColumns.ts`** — the four files it exempts today.
6. **Build `scripts/gen-variables-doc.ts` (§8.2), gate CI on `git diff --exit-code`** — retires steps 1 and 5 for generated sections permanently.
7. **Fix `TotalsStrategy` for career rate stats (§3.3)** — add a `{ kind: 'ratio', num, den }` variant.
8. **Reconcile the three IP definitions (§3.2)** or name them distinctly (`ip_displayed` vs `ip_fip_denominator`) — two numbers under one name is how a leaderboard and a model quietly disagree.
9. **Correct the four stale figures**, and add a monthly job re-deriving row counts and database size into a generated block. Facts that expire must be generated, never typed.

### Anti-recommendation

**Do not adopt a data catalog, metrics store, or semantic layer.** dbt Semantic Layer, Cube, LookML, DataHub, OpenMetadata, and Amundsen solve the version of this where many teams query many warehouses and nobody knows who owns a column. Triton is one operator, one Postgres, seven files. Each would add an **eighth** definition surface — a YAML or UI layer that must itself stay in sync with `metricRegistry.ts` — making drift worse while feeling like governance.

Equally: **do not fix this by writing more documentation.** The instinct on reading §2 is to back-fill 67 rows by hand; those rows are stale within a quarter by exactly the mechanism that produced "4,017 players," and the effort will have manufactured a larger surface to drift. **Write the test first; back-fill only what it names, in the order it names it.** Success is not a longer glossary — it is `VARIABLES.md` getting *shorter* as generated sections replace authored ones.

---

## Sources

**Docs-as-code and generated docs**
1. Write the Docs — [Docs as Code](https://www.writethedocs.org/guide/docs-as-code/) — the canonical statement; Triton satisfies it and drifted anyway.
2. Diátaxis — [Diátaxis](https://diataxis.fr/) — reference vs how-to; the §8.2 seam.
3. ADR — [Architecture Decision Records](https://adr.github.io/) — decision + rationale together; §7.

**dbt: descriptions, contracts, enforcement**
4. dbt — [About documentation](https://docs.getdbt.com/docs/build/documentation) — descriptions colocated with the definition.
5. dbt — [`persist_docs`](https://docs.getdbt.com/reference/resource-configs/persist_docs) — descriptions pushed into warehouse column comments; §8.2 copies this.
6. dbt — [Model contracts](https://docs.getdbt.com/docs/collaborate/govern/model-contracts) — names/types enforced at build time.
7. dbt — [Model versions](https://docs.getdbt.com/docs/collaborate/govern/model-versions) — versioned definitions, deprecation dates.
8. dbt-checkpoint — [pre-commit hooks](https://github.com/dbt-checkpoint/dbt-checkpoint) — `check-model-has-description`, `check-column-desc-are-same`; precedent for §8.1.
9. dbt-labs — [dbt-project-evaluator](https://github.com/dbt-labs/dbt-project-evaluator) — governance as a failing test.

**Semantic layers / metric stores**
10. dbt — [About MetricFlow](https://docs.getdbt.com/docs/build/about-metricflow) — defined once, compiled per query.
11. Cube — [Data modeling](https://cube.dev/docs/product/data-modeling/overview) — headless BI, descriptions on measures.
12. Google Cloud — [What is LookML?](https://cloud.google.com/looker/docs/what-is-lookml) — `description` first-class.
13. Airbnb — [How Airbnb Standardized Metric Computation at Scale](https://medium.com/airbnb-engineering/how-airbnb-standardized-metric-computation-at-scale-f23cc53dea70) — Minerva; §2–§3 at scale.

**Catalogs and dictionaries**
14. DataHub — [Docs](https://datahubproject.io/docs/) — glossary terms, ownership, lineage.
15. OpenMetadata — [Docs](https://docs.open-metadata.org/) — business glossary vs data dictionary.
16. Lyft — [Amundsen: data discovery & metadata engine](https://eng.lyft.com/amundsen-lyfts-data-discovery-metadata-engine-62d27254fbb9) — discoverability as the motivator.
17. Airbnb — [Democratizing Data at Airbnb](https://medium.com/airbnb-engineering/democratizing-data-at-airbnb-852d76c51770) — documentation decay and trust as the failure.

**Triton-internal evidence (audited 2026-08-11, no database queries)**
`docs/VARIABLES.md`; `lib/metricRegistry.ts` (69 entries, `calcTotalsFromRegistry`); `lib/glossary.ts` (`METRIC_TIPS`, `getTip`); `lib/reportMetrics.ts`; `lib/sql.ts` (`IP_ESTIMATE_SQL`, `ERA_COMPONENTS_SQL`); `lib/pitcherStats.ts`; `lib/leaderboardColumns.ts`; `__tests__/lib/`. Stale figures: `CLAUDE.md:107,109`; `Soto/context/triton-context.md:47`; `Li/context/triton-context.md:26,143`. Actual counts (`pitches` 8,891,054; `players` 16,924; DB 32.3 GiB) supplied by the operator, not measured here.

**Cross-references:** `01-metric-definition-semantics.md` · `02-metric-versioning-reproducibility.md` · `03-semantic-layers-metric-stores.md` *(planned)* · `05-baseline-normalization-design.md` · `Cas/testing-data-systems/05-golden-file-metric-testing.md` *(planned — the §8.1 handoff)*.
